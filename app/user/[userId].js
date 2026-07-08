import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Image, Alert } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../context/AuthContext';
import { Colors } from '../../constants/theme';

function formatMemberSince(date) {
  if (!date) return '';
  const d = date.toDate ? date.toDate() : new Date(date);
  return d.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' });
}

export default function UserProfileScreen() {
  const { userId } = useLocalSearchParams();
  const { user, profile, updateUserProfile } = useAuth();
  const [targetUser, setTargetUser] = useState(null);
  const [loading, setLoading] = useState(true);

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

  return (
    <View style={styles.container}>
      {/* Standard header */}
      <View style={styles.topHeader}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={Colors.white} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.mySuburb}>My Suburb</Text>
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
            {targetUser.photoURL ? (
              <Image source={{ uri: targetUser.photoURL }} style={styles.avatarImage} />
            ) : (
              <View style={styles.avatarLarge}>
                <Text style={styles.avatarText}>{targetUser.displayName?.[0]?.toUpperCase() || '?'}</Text>
              </View>
            )}

            <Text style={styles.name}>{targetUser.displayName}</Text>

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
        </View>
      )}
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
  avatarLarge: { width: 96, height: 96, borderRadius: 48, backgroundColor: '#FFFFC5', borderWidth: 2.5, borderColor: Colors.brandGreen, justifyContent: 'center', alignItems: 'center', marginBottom: 14 },
  avatarImage: { width: 96, height: 96, borderRadius: 48, borderWidth: 2.5, borderColor: Colors.brandGreen, marginBottom: 14 },
  avatarText: { fontSize: 36, fontWeight: '800', color: Colors.brandGreen },
  name: { fontSize: 22, fontWeight: '800', color: Colors.charcoal, marginBottom: 8 },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 10 },
  location: { fontSize: 14, color: Colors.charcoal, fontWeight: '500' },
  memberPill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.white, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14 },
  memberSince: { fontSize: 12, color: Colors.brandGreen, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 12, justifyContent: 'center' },
  messageBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.brandGreen, paddingHorizontal: 22, paddingVertical: 14, borderRadius: 26, flex: 1, justifyContent: 'center' },
  messageBtnText: { fontSize: 15, fontWeight: '700', color: Colors.white },
  blockBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.white, paddingHorizontal: 22, paddingVertical: 14, borderRadius: 26, borderWidth: 1.5, borderColor: '#E53935', flex: 1, justifyContent: 'center' },
  blockBtnText: { fontSize: 15, fontWeight: '700', color: '#E53935' },
  btnDisabled: { opacity: 0.5 },
  blockedNote: { fontSize: 13, color: Colors.midGrey, textAlign: 'center', marginTop: 16 },
  notFoundText: { fontSize: 15, color: Colors.midGrey },
});