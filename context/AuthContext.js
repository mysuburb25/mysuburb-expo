import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { auth, db } from '../config/firebase';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
} from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, collection, query, where, onSnapshot, serverTimestamp, deleteField } from 'firebase/firestore';

const AuthContext = createContext({});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  // True from the moment register() creates a new Auth account until
  // createProfile() finishes writing its Firestore document — the brief,
  // EXPECTED window where an account exists but has no profile yet,
  // while the person is still on the suburb-selection screen. Using a
  // ref (not state) since this never needs to trigger a re-render, just
  // be readable inside the onAuthStateChanged closure below.
  const isSigningUp = useRef(false);

  useEffect(() => {
    if (!user) return;
    const touch = () => {
      updateDoc(doc(db, 'users', user.uid), { lastActive: serverTimestamp() }).catch(() => {});
    };
    touch();
    const interval = setInterval(touch, 60000);
    return () => clearInterval(interval);
  }, [user]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        // On a cold app launch, onAuthStateChanged can fire before the
        // Firestore connection is fully warmed up, so this first read is
        // the one most likely to hit a transient failure — loadProfile
        // now retries a couple of times before giving up, rather than
        // silently leaving profile null while loading flips to false and
        // the tabs render with an empty/broken profile underneath them.
        const found = await loadProfile(firebaseUser.uid);
        if (!found && !isSigningUp.current) {
          // A genuinely missing profile (not just a transient failure —
          // loadProfile already retried 3 times) means this is a
          // Firebase Auth account with no matching Firestore document,
          // almost always from a signup that got interrupted between
          // creating the account and finishing suburb selection (e.g.
          // the app was closed or reloaded mid-flow). Leaving someone
          // signed in with no profile traps them on a blank/broken
          // screen forever, since the rest of the app assumes a profile
          // always exists once user is set — signing them out here
          // sends them back to a normal login/signup screen instead,
          // where they can either finish signing up again or sign in if
          // they already have a working account.
          //
          // isSigningUp guards against the false-positive version of
          // this exact same situation — right after register() creates
          // the Auth account, but before select-suburb.js has finished
          // and called createProfile(), a missing profile is completely
          // normal and expected, not a broken account.
          console.warn('No profile found for authenticated user — signing out to recover.', firebaseUser.uid);
          await signOut(auth);
          setUser(null);
          setProfile(null);
          setUnreadCount(0);
          setUnreadMessageCount(0);
          setLoading(false);
          return;
        }
        registerForPushNotifications(firebaseUser.uid);
      } else {
        setUser(null);
        setProfile(null);
        setUnreadCount(0);
        setUnreadMessageCount(0);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', user.uid),
      where('isRead', '==', false)
    );
    const unsub = onSnapshot(q, (snap) => {
      setUnreadCount(snap.size);
    }, (e) => console.error('notification listener error:', e));
    return unsub;
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'conversations'),
      where('participants', 'array-contains', user.uid)
    );
    const unsub = onSnapshot(q, (snap) => {
      const total = snap.docs.reduce((sum, d) => sum + (d.data().unreadCount?.[user.uid] || 0), 0);
      setUnreadMessageCount(total);
    }, (e) => console.error('message listener error:', e));
    return unsub;
  }, [user]);

  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  // Retries the profile read up to 3 total attempts (with a short delay
  // between each) before giving up — covers the cold-start case where the
  // very first Firestore read fires before the connection is fully ready.
  // Returns true/false so callers can tell whether it actually succeeded,
  // rather than assuming success just because it didn't throw.
  const loadProfile = async (uid, attempt = 1) => {
    try {
      const snap = await getDoc(doc(db, 'users', uid));
      if (!snap.exists()) {
        if (attempt < 3) {
          await sleep(attempt * 500);
          return loadProfile(uid, attempt + 1);
        }
        // console.warn, not console.error — this fires as a completely
        // normal, expected part of the signup flow (profile genuinely
        // doesn't exist yet while createProfile() is still running), not
        // just for a truly broken account. console.error triggers Expo's
        // dev-only red error toast, which made this look like a crash
        // during normal testing even though nothing was actually wrong.
        // The genuinely-broken-account case is already clearly logged
        // and handled separately, right where onAuthStateChanged decides
        // whether to sign out — see the warning there.
        console.warn('loadProfile: no profile document found after retries for uid', uid);
        return false;
      }
      const mainData = snap.data();

      let contact = {};
      try {
        const contactSnap = await getDoc(doc(db, 'users', uid, 'private', 'contact'));
        if (contactSnap.exists()) contact = contactSnap.data();
      } catch (e) {
        // Fine if this fails/doesn't exist yet — mainData fallback below covers it.
      }

      setProfile({
        uid,
        ...mainData,
        email: contact.email ?? mainData.email,
        phone: contact.phone ?? mainData.phone,
      });
      return true;
    } catch (e) {
      if (attempt < 3) {
        await sleep(attempt * 500);
        return loadProfile(uid, attempt + 1);
      }
      console.error('loadProfile error after retries:', e);
      return false;
    }
  };

  const registerForPushNotifications = async (uid) => {
    try {
      if (!Device.isDevice) return;

      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'default',
          importance: Notifications.AndroidImportance.HIGH,
        });
      }

      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      if (finalStatus !== 'granted') return;

      const projectId = Constants.expoConfig?.extra?.eas?.projectId;
      const tokenResult = await Notifications.getExpoPushTokenAsync({ projectId });

      await setDoc(doc(db, 'users', uid, 'private', 'push'), {
        token: tokenResult.data,
        platform: Platform.OS,
        updatedAt: serverTimestamp(),
      }, { merge: true });
    } catch (e) {
      console.error('registerForPushNotifications error:', e);
    }
  };

  const login = async (email, password) => {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    const found = await loadProfile(cred.user.uid);
    if (!found) {
      // Same recovery as the onAuthStateChanged path — a login that
      // succeeds at the Auth layer but has no matching profile document
      // is the same broken state, just discovered via explicit sign-in
      // instead of an app relaunch. Sign back out and surface a clear
      // error rather than returning a "successful" login that then
      // leaves the app stuck.
      await signOut(auth);
      throw new Error('Your account could not be found. Please try signing up again.');
    }
    return cred;
  };

  const register = async (email, password, displayName) => {
    isSigningUp.current = true;
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName });
    return cred;
  };

  const logout = async () => {
    await signOut(auth);
    setUser(null);
    setProfile(null);
    setUnreadCount(0);
    setUnreadMessageCount(0);
  };

  const createProfile = async (uid, data) => {
    const { email, phone, ...publicFields } = data;
    const profileData = { ...publicFields, isAdmin: false, isSuspended: false, createdAt: serverTimestamp() };
    await setDoc(doc(db, 'users', uid), profileData);

    if (email !== undefined || phone !== undefined) {
      const contactData = {};
      if (email !== undefined) contactData.email = email;
      if (phone !== undefined) contactData.phone = phone;
      await setDoc(doc(db, 'users', uid, 'private', 'contact'), contactData, { merge: true });
    }

    setProfile({ uid, ...profileData, email, phone, createdAt: new Date() });
    // Signup is now genuinely complete — a missing profile from this
    // point on is a real problem again, not an expected in-progress state.
    isSigningUp.current = false;
  };

  const updateUserProfile = async (data) => {
    if (!user) return;
    const { email, phone, ...publicData } = data;
    const touchesContactFields = email !== undefined || phone !== undefined;

    if (touchesContactFields) {
      publicData.email = deleteField();
      publicData.phone = deleteField();
    }

    const writes = [];
    if (Object.keys(publicData).length > 0) {
      writes.push(updateDoc(doc(db, 'users', user.uid), publicData));
    }
    if (touchesContactFields) {
      const contactUpdate = {};
      if (email !== undefined) contactUpdate.email = email;
      if (phone !== undefined) contactUpdate.phone = phone;
      writes.push(setDoc(doc(db, 'users', user.uid, 'private', 'contact'), contactUpdate, { merge: true }));
    }
    await Promise.all(writes);
    setProfile(prev => ({ ...prev, ...data }));
  };

  const blockUser = async (uid, displayName) => {
    if (!user || !uid) return;
    const currentList = profile?.blockedUsers || [];
    if (currentList.some(b => b.uid === uid)) return;
    const currentIds = profile?.blockedUserIds || [];
    const newList = [...currentList, { uid, displayName: displayName || 'Neighbour', blockedAt: new Date().toISOString() }];
    const newIds = currentIds.includes(uid) ? currentIds : [...currentIds, uid];
    await updateUserProfile({ blockedUsers: newList, blockedUserIds: newIds });
  };

  const unblockUser = async (uid) => {
    if (!user || !uid) return;
    const currentList = profile?.blockedUsers || [];
    const currentIds = profile?.blockedUserIds || [];
    const newList = currentList.filter(b => b.uid !== uid);
    const newIds = currentIds.filter(id => id !== uid);
    await updateUserProfile({ blockedUsers: newList, blockedUserIds: newIds });
  };

  const reloadProfile = async () => {
    if (user) await loadProfile(user.uid);
  };

  return (
    <AuthContext.Provider value={{
      user, profile, loading, unreadCount, setUnreadCount, unreadMessageCount,
      login, register, logout,
      createProfile, updateUserProfile, reloadProfile,
      blockUser, unblockUser,
    }}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);