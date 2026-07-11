import React, { createContext, useContext, useState, useEffect } from 'react';
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
import { doc, getDoc, setDoc, updateDoc, collection, query, where, onSnapshot, serverTimestamp } from 'firebase/firestore';

const AuthContext = createContext({});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        await loadProfile(firebaseUser.uid);
        // Fire-and-forget — don't block app startup on permission prompts
        // or network calls, and never fail the auth flow if this errors.
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

  // Real-time unread notification count (likes, comments, new posts, messages — everything)
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

  // Real-time unread message count — summed across all conversations' per-user
  // unread counters, separate from the general notification bell count above.
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

  const loadProfile = async (uid) => {
    try {
      const snap = await getDoc(doc(db, 'users', uid));
      if (snap.exists()) setProfile({ uid, ...snap.data() });
    } catch (e) { console.error('loadProfile error:', e); }
  };

  // Requests notification permission and saves the device's Expo push token
  // to a private subcollection only the owner can read/write. Silently does
  // nothing on a simulator/emulator, or if the user declines permission —
  // push notifications are additive, never required for the app to work.
  const registerForPushNotifications = async (uid) => {
    try {
      if (!Device.isDevice) return; // simulators/emulators don't get real tokens

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
      // Never let a push-registration failure block the rest of the app.
      console.error('registerForPushNotifications error:', e);
    }
  };

  const login = async (email, password) => {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    await loadProfile(cred.user.uid);
    return cred;
  };

  const register = async (email, password, displayName) => {
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
    const profileData = { ...data, isAdmin: false, isSuspended: false, createdAt: serverTimestamp() };
    await setDoc(doc(db, 'users', uid), profileData);
    // Reflect locally with a real Date immediately, since serverTimestamp()
    // resolves to null until the write round-trips back from the server —
    // reloadProfile() will pick up the true value on next fetch.
    setProfile({ uid, ...profileData, createdAt: new Date() });
  };

  const updateUserProfile = async (data) => {
    if (!user) return;
    await updateDoc(doc(db, 'users', user.uid), data);
    setProfile(prev => ({ ...prev, ...data }));
  };

  const reloadProfile = async () => {
    if (user) await loadProfile(user.uid);
  };

  return (
    <AuthContext.Provider value={{
      user, profile, loading, unreadCount, setUnreadCount, unreadMessageCount,
      login, register, logout,
      createProfile, updateUserProfile, reloadProfile,
    }}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);