import { useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Image, Modal } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { collection, query, where, orderBy, onSnapshot, doc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../context/AuthContext';
import { Colors } from '../../constants/theme';
import AppName from '../../components/AppName';
import useOnlineStatus from '../../utils/useOnlineStatus';

function timeAgo(date) {
  if (!date) return '';
  const d = date.toDate ? date.toDate() : new Date(date);
  const seconds = Math.floor((new Date() - d) / 1000);
  if (seconds < 60) return 'now';
  if (seconds < 3600) return Math.floor(seconds / 60) + 'm';
  if (seconds < 86400) return Math.floor(seconds / 3600) + 'h';
  if (seconds < 604800) return Math.floor(seconds / 86400) + 'd';
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
}

function ConversationRow({ item, user, shareText }) {
  const { profile, blockUser, unblockUser } = useAuth();
  const otherUserId = item.participants?.find(p => p !== user.uid);
  const otherUserName = item.participantNames?.[otherUserId] || 'Neighbour';
  const unread = item.unreadCount?.[user.uid] || 0;
  const isLastFromMe = item.lastMessageSenderId === user.uid;
  const isOnline = useOnlineStatus(otherUserId);
  const isPinned = (item.pinnedBy || []).includes(user.uid);
  const isBlocked = (profile?.blockedUserIds || []).includes(otherUserId);
  const [showActionSheet, setShowActionSheet] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleTogglePin = () => {
    setShowActionSheet(false);
    updateDoc(doc(db, 'conversations', item.id), {
      pinnedBy: isPinned ? arrayRemove(user.uid) : arrayUnion(user.uid),
    }).catch(e => console.error(e));
  };

  const handleToggleBlock = async () => {
    setShowActionSheet(false);
    try {
      if (isBlocked) await unblockUser(otherUserId);
      else await blockUser(otherUserId, otherUserName);
    } catch (e) { console.error(e); }
  };

  const handleDelete = () => {
    setShowDeleteConfirm(false);
    updateDoc(doc(db, 'conversations', item.id), {
      deletedBy: arrayUnion(user.uid),
    }).catch(e => console.error(e));
  };

  return (
    <>
      <TouchableOpacity
        style={styles.row}
        onLongPress={() => setShowActionSheet(true)}
        onPress={() => router.push({
          pathname: '/chat/' + otherUserId,
          params: shareText ? { userId: otherUserId, userName: otherUserName, prefillText: shareText } : { userId: otherUserId, userName: otherUserName },
        })}
      >
      <View style={styles.avatar}>
        {item.participantPhotos?.[otherUserId] ? (
          <Image source={{ uri: item.participantPhotos[otherUserId] }} style={styles.avatarImage} />
        ) : (
          <Text style={styles.avatarText}>{otherUserName[0]?.toUpperCase()}</Text>
        )}
        {isOnline && <View style={styles.onlineDot} />}
      </View>
      <View style={styles.rowBody}>
        <View style={styles.rowTop}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, flex: 1 }}>
            {isPinned && <Ionicons name="bookmark" size={13} color={Colors.brandGreen} />}
            <Text style={[styles.name, unread > 0 && styles.nameUnread]} numberOfLines={1}>{otherUserName}</Text>
          </View>
          <Text style={styles.time}>{timeAgo(item.lastMessageAt)}</Text>
        </View>
        <View style={styles.rowBottom}>
          <Text style={[styles.preview, unread > 0 && styles.previewUnread]} numberOfLines={1}>
            {isLastFromMe ? 'You: ' : ''}{item.lastMessage || 'Start a conversation'}
          </Text>
          {unread > 0 && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadBadgeText}>{unread > 9 ? '9+' : unread}</Text>
            </View>
          )}
        </View>
      </View>
      </TouchableOpacity>

      <Modal visible={showActionSheet} transparent animationType="fade">
        <TouchableOpacity style={styles.menuOverlay} activeOpacity={1} onPress={() => setShowActionSheet(false)}>
          <View style={styles.menuSheet}>
            <View style={styles.menuHeaderBar}>
              <Text style={styles.menuHeaderText}>Select</Text>
            </View>
            <View style={styles.menuPad}>
              <TouchableOpacity style={styles.menuItem} onPress={handleTogglePin}>
                <View style={styles.menuItemIcon}>
                  <Ionicons name={isPinned ? 'bookmark' : 'bookmark-outline'} size={20} color={Colors.brandGreen} />
                </View>
                <Text style={styles.menuItemText}>{isPinned ? 'Unpin' : 'Pin'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.menuItem} onPress={handleToggleBlock}>
                <View style={styles.menuItemIconDanger}>
                  <Ionicons name="ban-outline" size={20} color="#E53935" />
                </View>
                <Text style={styles.menuItemTextDanger}>{isBlocked ? 'Unblock' : 'Block'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.menuItem} onPress={() => { setShowActionSheet(false); setShowDeleteConfirm(true); }}>
                <View style={styles.menuItemIconDanger}>
                  <Ionicons name="trash-outline" size={20} color="#E53935" />
                </View>
                <Text style={styles.menuItemTextDanger}>Delete</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.menuItem, styles.menuCancelBtn]} onPress={() => setShowActionSheet(false)}>
                <Text style={styles.menuCancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal visible={showDeleteConfirm} transparent animationType="fade">
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmCard}>
            <View style={styles.confirmIconCircle}>
              <Ionicons name="trash-outline" size={26} color="#E53935" />
            </View>
            <Text style={styles.confirmTitle}>Delete Conversation</Text>
            <Text style={styles.confirmMessage}>This removes the conversation with {otherUserName} from your list. It comes back if either of you sends a new message.</Text>
            <View style={styles.confirmBtnRow}>
              <TouchableOpacity style={styles.confirmCancelBtn} onPress={() => setShowDeleteConfirm(false)}>
                <Text style={styles.confirmCancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmDeleteBtn} onPress={handleDelete}>
                <Text style={styles.confirmDeleteBtnText}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

export default function MessagesScreen() {
  const { user, profile, unreadCount } = useAuth();
  const { shareText } = useLocalSearchParams();
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      setLoading(true);
      const q = query(
        collection(db, 'conversations'),
        where('participants', 'array-contains', user.uid),
        orderBy('updatedAt', 'desc')
      );
      const unsub = onSnapshot(q, (snap) => {
        const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        // Hide anything the current user has deleted from their own list
        // (deleting is per-user — the other participant still sees it
        // normally). Pinned conversations float to the top; within each
        // group, the existing updatedAt-desc order from the query holds.
        const visible = all.filter(c => !(c.deletedBy || []).includes(user.uid));
        visible.sort((a, b) => {
          const aPinned = (a.pinnedBy || []).includes(user.uid) ? 1 : 0;
          const bPinned = (b.pinnedBy || []).includes(user.uid) ? 1 : 0;
          return bPinned - aPinned;
        });
        setConversations(visible);
        setLoading(false);
      }, (e) => {
        console.error(e);
        setLoading(false);
      });
      return unsub;
    }, [user])
  );

  return (
    <View style={styles.container}>
      <View style={styles.topHeader}>
        <TouchableOpacity style={styles.profileAvatar} onPress={() => router.push('/(tabs)/profile')}>
          {profile?.photoURL ? (
            <Image source={{ uri: profile.photoURL }} style={styles.profileAvatarImage} />
          ) : (
            <Text style={styles.profileAvatarText}>{profile?.displayName?.[0]?.toUpperCase() || '?'}</Text>
          )}
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <AppName style={styles.mySuburb} />
          <Text style={styles.suburbName}>{profile?.suburb}, {profile?.state}</Text>
        </View>
        <TouchableOpacity onPress={() => router.push('/(tabs)/notifications')} style={{ position: 'relative', width: 42, alignItems: 'flex-end' }}>
          <Ionicons name="notifications-outline" size={26} color="#fff" />
          {unreadCount > 0 && (
            <View style={styles.bellBadge}>
              <Text style={styles.bellBadgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>
      <View style={styles.pageHeader}>
        <Text style={styles.pageTitle}>Messages</Text>
      </View>

      {shareText && (
        <View style={styles.shareBanner}>
          <Ionicons name="share-outline" size={16} color={Colors.brandGreen} />
          <Text style={styles.shareBannerText}>Pick a neighbour to share with</Text>
        </View>
      )}

      {loading ? (
        <ActivityIndicator color={Colors.brandGreen} style={{ marginTop: 40 }} size="large" />
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <ConversationRow item={item} user={user} shareText={shareText} />
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="chatbubbles-outline" size={48} color={Colors.lightGrey} />
              <Text style={styles.emptyTitle}>No messages yet</Text>
              <Text style={styles.emptyText}>Start a conversation with a neighbour from any post</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // Matches the same "green header + Select" menu pattern used on the
  // post detail screen's 3-dot menu, and the individual chat screen's
  // own menu — kept visually identical across all three so this kind of
  // action sheet always looks the same no matter where it's opened from.
  menuOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  menuSheet: { backgroundColor: Colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden' },
  menuHeaderBar: { backgroundColor: Colors.brandGreen, paddingTop: 14, paddingBottom: 16, paddingHorizontal: 20, alignItems: 'center' },
  menuHeaderText: { fontSize: 18, fontWeight: '800', color: Colors.white },
  menuPad: { padding: 16, paddingBottom: 32 },
  menuItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14, paddingVertical: 9, paddingHorizontal: 14, borderRadius: 14, backgroundColor: '#FAFAFA', borderWidth: 1.5, borderColor: '#EFEFEF', marginBottom: 8 },
  menuItemIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.brandGreenPale, justifyContent: 'center', alignItems: 'center' },
  menuItemIconDanger: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#FFF0F0', justifyContent: 'center', alignItems: 'center' },
  menuItemText: { fontSize: 16, fontWeight: '700', color: Colors.charcoal },
  menuItemTextDanger: { fontSize: 16, fontWeight: '700', color: '#E53935' },
  menuCancelBtn: { backgroundColor: Colors.brandGreenPale, borderRadius: 14, justifyContent: 'center', marginTop: 8, borderWidth: 0 },
  menuCancelText: { fontSize: 16, fontWeight: '700', color: Colors.brandGreen, textAlign: 'center', flex: 1 },
  confirmOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', padding: 32 },
  confirmCard: { backgroundColor: Colors.white, borderRadius: 20, padding: 26, alignItems: 'center', width: '100%', maxWidth: 340 },
  confirmIconCircle: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#FCE8E7', justifyContent: 'center', alignItems: 'center', marginBottom: 14 },
  confirmTitle: { fontSize: 19, fontWeight: '800', color: Colors.charcoal, marginBottom: 6 },
  confirmMessage: { fontSize: 14, color: Colors.midGrey, textAlign: 'center', lineHeight: 20, marginBottom: 20 },
  confirmBtnRow: { flexDirection: 'row', gap: 10, width: '100%' },
  confirmCancelBtn: { flex: 1, paddingVertical: 13, borderRadius: 14, alignItems: 'center', backgroundColor: '#F0F0F0' },
  confirmCancelBtnText: { fontSize: 15, fontWeight: '700', color: Colors.charcoal },
  confirmDeleteBtn: { flex: 1, paddingVertical: 13, borderRadius: 14, alignItems: 'center', backgroundColor: '#E53935' },
  confirmDeleteBtnText: { fontSize: 15, fontWeight: '700', color: Colors.white },
  container: { flex: 1, backgroundColor: Colors.white },
  topHeader: { backgroundColor: Colors.brandGreen, paddingTop: 56, paddingBottom: 16, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerCenter: { alignItems: 'center' },
  mySuburb: { fontSize: 27, fontWeight: '800', color: Colors.white },
  suburbName: { fontSize: 17, color: '#FFD700', marginTop: 4 },
  profileAvatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#FFD700', justifyContent: 'center', alignItems: 'center' },
  profileAvatarImage: { width: 42, height: 42, borderRadius: 21 },
  bellBadge: { position: 'absolute', top: -4, right: -4, backgroundColor: '#E53935', borderRadius: 8, minWidth: 16, height: 16, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 3 },
  bellBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  profileAvatarText: { fontSize: 15, fontWeight: '800', color: Colors.brandGreen },
  pageHeader: { backgroundColor: Colors.brandGreenPale, paddingVertical: 10, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: Colors.lightGrey },
  pageTitle: { fontSize: 20, fontWeight: '700', color: Colors.brandGreen },
  shareBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.brandGreenPale, paddingHorizontal: 16, paddingVertical: 10 },
  shareBannerText: { fontSize: 13, fontWeight: '600', color: Colors.brandGreen },
  list: { padding: 12, gap: 4, paddingBottom: 40 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 8, borderRadius: 12 },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: Colors.brandGreenPale, justifyContent: 'center', alignItems: 'center', position: 'relative' },
  avatarImage: { width: 48, height: 48, borderRadius: 24 },
  onlineDot: { position: 'absolute', bottom: -1, right: -1, width: 14, height: 14, borderRadius: 7, backgroundColor: '#4CAF50', borderWidth: 2, borderColor: Colors.white },
  avatarText: { fontSize: 18, fontWeight: '700', color: Colors.brandGreen },
  rowBody: { flex: 1, gap: 3 },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  name: { fontSize: 15, color: Colors.charcoal, fontWeight: '600', flex: 1 },
  nameUnread: { fontWeight: '800', color: Colors.brandGreen },
  time: { fontSize: 12, color: Colors.midGrey, marginLeft: 8 },
  rowBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  preview: { flex: 1, fontSize: 13, color: Colors.midGrey },
  previewUnread: { color: Colors.charcoal, fontWeight: '600' },
  unreadBadge: { backgroundColor: Colors.brandGreen, borderRadius: 10, minWidth: 20, height: 20, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 5 },
  unreadBadgeText: { color: Colors.white, fontSize: 11, fontWeight: '700' },
  empty: { alignItems: 'center', paddingTop: 80, gap: 8, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: Colors.charcoal },
  emptyText: { fontSize: 14, color: Colors.midGrey, textAlign: 'center', lineHeight: 20 },
});