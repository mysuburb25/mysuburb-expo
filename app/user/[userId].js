import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Image, Alert } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db } from '../../config/firebase';
import { useAuth } from '../../context/AuthContext';
import { Colors } from '../../constants/theme';
import AppName from '../../components/AppName';
import useOnlineStatus from '../../utils/useOnlineStatus';
import ImageViewerModal from '../../components/ImageViewerModal';

function formatMemberSince(date) {
  if (!date) return '';
  const d = date.toDate ? date.toDate() : new Date(date);
  return d.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' });
}

export default function UserProfileScreen() {
  const { userId } = useLocalSearchParams();
  const isOnline = useOnlineStatus(userId);
  const { user, profile, updateUserProfile } = useAuth();
  const [targetUser, setTargetUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [viewerImageUrl, setViewerImageUrl] = useState(null);
  const [deletingUser, setDeletingUser] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'users', userId));
        if (!cancelled && snap.exists()) {
          setTargetUser({ uid: userId, ...snap.data() });
        }
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  const isBlocked = profile?.blockedUsers?.some(b => b.uid === userId) || false;
  const theyBlockedMe = targetUser?.blockedUsers?.some(b => b.uid === user?.uid) || false;
  const messagingDisabled = isBlocked || theyBlockedMe;

  // Admin actions are only ever shown when viewing SOMEONE ELSE's
  // profile — an admin viewing their own profile never sees Suspend or
  // Delete here at all, since acting on your own account through this
  // path would be confusing and risky (self-service account deletion
  // already exists separately in Settings, requiring password
  // re-entry — this admin path is deliberately not a substitute for
  // that). The Cloud Function itself also rejects this case as a
  // second line of defence, but not showing the option in the first
  // place is the clearer, safer UX.
  const showAdminActions = profile?.isAdmin && userId !== user?.uid;

  const handleMessage = () => {
    router.push({ pathname: '/chat/' + userId, params: { userId, userName: targetUser?.displayName } });
  };

  const handleToggleBlock = () => {
    Alert.alert(
      isBlocked ? `Unblock ${targetUser?.displayName}?` : `Block ${targetUser?.displayName}?`,
      isBlocked
        ? 'They will be able to message you again, and their posts will reappear in your feed.'
        : "They won't be able to message you, and their posts will be hidden from your feed.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: isBlocked ? 'Unblock' : 'Block',
          style: isBlocked ? 'default' : 'destructive',
          onPress: async () => {
            const current = profile?.blockedUsers || [];
            const updated = isBlocked
              ? current.filter(b => b.uid !== userId)
              : [...current, { uid: userId, displayName: targetUser?.displayName, blockedAt: new Date().toISOString() }];
            try {
              await updateUserProfile({ blockedUsers: updated });
            } catch (e) {
              Alert.alert('Error', 'Could not update block status. Please try again.');
            }
          }
        }
      ]
    );
  };

  // Suspend/unsuspend a user's account directly — proactive, doesn't
  // require a report to exist first (separate from the Reports tab's
  // own suspend action, which is reached from an actual report).
  const handleToggleSuspend = () => {
    const isSuspending = !targetUser.isSuspended;
    Alert.alert(
      `${isSuspending ? 'Suspend' : 'Unsuspend'} ${targetUser.displayName}?`,
      isSuspending
        ? 'They will be signed out and unable to use the app until you unsuspend them.'
        : 'They will be able to use the app again.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: isSuspending ? 'Suspend' : 'Unsuspend',
          style: isSuspending ? 'destructive' : 'default',
          onPress: async () => {
            try {
              await updateDoc(doc(db, 'users', userId), { isSuspended: isSuspending });
              setTargetUser(prev => ({ ...prev, isSuspended: isSuspending }));
            } catch (e) {
              Alert.alert('Error', 'Could not update this user. Please try again.');
            }
          }
        }
      ]
    );
  };

  // Permanently deletes this user's account entirely — their Auth
  // login and Firestore profile — via the adminDeleteUser Cloud
  // Function. This can't be done directly from the client the way
  // suspend/unsuspend can: only the Admin SDK (server-side only) is
  // able to delete an account other than the one currently signed in.
  // Deleting the profile doc server-side also automatically triggers
  // the existing cleanupUserDataOnDelete function, so this gets the
  // same private-message/media cleanup a self-service deletion does.
  const handleDeleteAccount = () => {
    Alert.alert(
      `Permanently delete ${targetUser.displayName}?`,
      "This deletes their login, profile, and all their private messages. This cannot be undone. Their posts and comments will remain but will no longer be linked to their account.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive', onPress: async () => {
            setDeletingUser(true);
            try {
              const adminDeleteUserFn = httpsCallable(getFunctions(), 'adminDeleteUser');
              await adminDeleteUserFn({ targetUid: userId });
              Alert.alert('Deleted', `${targetUser.displayName}'s account has been permanently deleted.`, [
                { text: 'OK', onPress: () => router.back() }
              ]);
            } catch (e) {
              Alert.alert('Error', e.message || 'Could not delete this user. Please try again.');
            } finally {
              setDeletingUser(false);
            }
          }
        }
      ]
    );
  };

  return (
    <View style={styles.container}>
      {/* Standard header */}
      <View style={styles.topHeader}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={Colors.white} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <AppName style={styles.mySuburb} />
          <Text style={styles.suburbName}>{profile?.suburb}, {profile?.state}</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>
      <View style={styles.pageHeader}>
        <Text style={styles.pageTitle}>Profile</Text>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={Colors.brandGreen} size="large" />
        </View>
      ) : !targetUser ? (
        <View style={styles.centered}>
          <Ionicons name="person-outline" size={40} color={Colors.lightGrey} />
          <Text style={styles.notFoundText}>This profile isn't available.</Text>
        </View>
      ) : (
        <View style={styles.body}>
          {/* Cover card */}
          <View style={styles.coverCard}>
            <View style={styles.avatarWrap}>
              {targetUser.photoURL ? (
                <TouchableOpacity onPress={() => setViewerImageUrl(targetUser.photoURL)}>
                  <Image source={{ uri: targetUser.photoURL }} style={styles.avatarImage} />
                </TouchableOpacity>
              ) : (
                <View style={styles.avatarLarge}>
                  <Text style={styles.avatarText}>{targetUser.displayName?.[0]?.toUpperCase() || '?'}</Text>
                </View>
              )}
              {isOnline && <View style={styles.onlineDot} />}
            </View>

            <Text style={styles.name}>{targetUser.displayName}</Text>
            <View style={styles.statusRow}>
              <View style={[styles.statusDotInline, { backgroundColor: isOnline ? '#4CAF50' : Colors.lightGrey }]} />
              <Text style={styles.statusText}>{isOnline ? 'Online' : 'Offline'}</Text>
            </View>

            {targetUser.suburb && targetUser.state && (
              <View style={styles.locationRow}>
                <Ionicons name="location" size={14} color={Colors.brandGreen} />
                <Text style={styles.location}>{targetUser.suburb}, {targetUser.state}</Text>
              </View>
            )}

            {targetUser.createdAt && (
              <View style={styles.memberPill}>
                <Ionicons name="calendar-outline" size={12} color={Colors.brandGreen} />
                <Text style={styles.memberSince}>Member since {formatMemberSince(targetUser.createdAt)}</Text>
              </View>
            )}

            {targetUser.isSuspended && (
              <View style={styles.suspendedPill}>
                <Ionicons name="ban" size={12} color="#E65100" />
                <Text style={styles.suspendedPillText}>Suspended</Text>
              </View>
            )}
          </View>

          {/* Actions */}
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.messageBtn, messagingDisabled && styles.btnDisabled]}
              onPress={handleMessage}
              disabled={messagingDisabled}
            >
              <Ionicons name="chatbubble-ellipses-outline" size={18} color={Colors.white} />
              <Text style={styles.messageBtnText}>Message</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.blockBtn} onPress={handleToggleBlock}>
              <Ionicons name="ban-outline" size={18} color="#E53935" />
              <Text style={styles.blockBtnText}>{isBlocked ? 'Unblock' : 'Block'}</Text>
            </TouchableOpacity>
          </View>

          {isBlocked && (
            <Text style={styles.blockedNote}>You've blocked this person. Unblock them to send a message.</Text>
          )}
          {!isBlocked && theyBlockedMe && (
            <Text style={styles.blockedNote}>You can't message this person right now.</Text>
          )}

          {/* Admin Actions — deliberately visually separate from the
              regular Message/Block row above (its own labeled section,
              different background) so it reads clearly as a distinct,
              more powerful set of controls rather than being confused
              with the ordinary user-facing actions every viewer sees. */}
          {showAdminActions && (
            <View style={styles.adminSection}>
              <Text style={styles.adminSectionLabel}>Admin Actions</Text>
              <View style={styles.adminActionsRow}>
                <TouchableOpacity style={styles.suspendBtn} onPress={handleToggleSuspend}>
                  <Ionicons name={targetUser.isSuspended ? 'refresh-outline' : 'ban-outline'} size={18} color="#E65100" />
                  <Text style={styles.suspendBtnText}>{targetUser.isSuspended ? 'Unsuspend' : 'Suspend'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.deleteBtn} onPress={handleDeleteAccount} disabled={deletingUser}>
                  {deletingUser
                    ? <ActivityIndicator color="#E53935" size="small" />
                    : <Ionicons name="trash-outline" size={18} color="#E53935" />
                  }
                  <Text style={styles.deleteBtnText}>Delete Account</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      )}
      <ImageViewerModal images={viewerImageUrl ? [viewerImageUrl] : null} initialIndex={0} onClose={() => setViewerImageUrl(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.white },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 10 },
  topHeader: { backgroundColor: Colors.brandGreen, paddingTop: 56, paddingBottom: 16, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  headerCenter: { alignItems: 'center' },
  mySuburb: { fontSize: 27, fontWeight: '800', color: Colors.white },
  suburbName: { fontSize: 17, color: '#FFD700', marginTop: 4 },
  pageHeader: { backgroundColor: Colors.brandGreenPale, paddingVertical: 10, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: Colors.lightGrey },
  pageTitle: { fontSize: 20, fontWeight: '700', color: Colors.brandGreen },
  body: { padding: 20 },
  coverCard: { backgroundColor: Colors.brandGreenPale, borderRadius: 20, borderWidth: 1, borderColor: Colors.brandGreen + '30', alignItems: 'center', paddingVertical: 32, paddingHorizontal: 20, marginBottom: 20 },
  avatarLarge: { width: 96, height: 96, borderRadius: 48, backgroundColor: '#FFFFC5', borderWidth: 2.5, borderColor: Colors.brandGreen, justifyContent: 'center', alignItems: 'center' },
  avatarImage: { width: 96, height: 96, borderRadius: 48, borderWidth: 2.5, borderColor: Colors.brandGreen },
  avatarWrap: { position: 'relative', marginBottom: 14 },
  onlineDot: { position: 'absolute', bottom: 4, right: 4, width: 20, height: 20, borderRadius: 10, backgroundColor: '#4CAF50', borderWidth: 3, borderColor: Colors.white },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, marginBottom: 6 },
  statusDotInline: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 13, color: Colors.midGrey, fontWeight: '600' },
  avatarText: { fontSize: 36, fontWeight: '800', color: Colors.brandGreen },
  name: { fontSize: 22, fontWeight: '800', color: Colors.charcoal, marginBottom: 8 },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 10 },
  location: { fontSize: 14, color: Colors.charcoal, fontWeight: '500' },
  memberPill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.white, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14 },
  memberSince: { fontSize: 12, color: Colors.brandGreen, fontWeight: '600' },
  suspendedPill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FFF3E0', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, marginTop: 8 },
  suspendedPillText: { fontSize: 12, color: '#E65100', fontWeight: '700' },
  actions: { flexDirection: 'row', gap: 12, justifyContent: 'center' },
  messageBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.brandGreen, paddingHorizontal: 22, paddingVertical: 14, borderRadius: 26, flex: 1, justifyContent: 'center' },
  messageBtnText: { fontSize: 15, fontWeight: '700', color: Colors.white },
  blockBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.white, paddingHorizontal: 22, paddingVertical: 14, borderRadius: 26, borderWidth: 1.5, borderColor: '#E53935', flex: 1, justifyContent: 'center' },
  blockBtnText: { fontSize: 15, fontWeight: '700', color: '#E53935' },
  btnDisabled: { opacity: 0.5 },
  blockedNote: { fontSize: 13, color: Colors.midGrey, textAlign: 'center', marginTop: 16 },
  notFoundText: { fontSize: 15, color: Colors.midGrey },
  // Admin Actions section — a separate, clearly distinct card below the
  // regular actions, rather than mixed into the same row, so it never
  // gets mistaken for a normal user-facing control.
  adminSection: { marginTop: 20, backgroundColor: '#FFF8F0', borderRadius: 16, borderWidth: 1, borderColor: '#FFE0B2', padding: 16 },
  adminSectionLabel: { fontSize: 12, fontWeight: '800', color: '#E65100', letterSpacing: 0.5, marginBottom: 10, textTransform: 'uppercase' },
  adminActionsRow: { flexDirection: 'row', gap: 12 },
  suspendBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.white, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 22, borderWidth: 1.5, borderColor: '#E65100', flex: 1, justifyContent: 'center' },
  suspendBtnText: { fontSize: 14, fontWeight: '700', color: '#E65100' },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.white, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 22, borderWidth: 1.5, borderColor: '#E53935', flex: 1, justifyContent: 'center' },
  deleteBtnText: { fontSize: 14, fontWeight: '700', color: '#E53935' },
});