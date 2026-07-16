import { useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
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
  const otherUserId = item.participants?.find(p => p !== user.uid);
  const otherUserName = item.participantNames?.[otherUserId] || 'Neighbour';
  const unread = item.unreadCount?.[user.uid] || 0;
  const isLastFromMe = item.lastMessageSenderId === user.uid;
  const isOnline = useOnlineStatus(otherUserId);

  return (
    <TouchableOpacity
      style={styles.row}
      onPress={() => router.push({
        pathname: '/chat/' + otherUserId,
        params: shareText ? { userId: otherUserId, userName: otherUserName, prefillText: shareText } : { userId: otherUserId, userName: otherUserName },
      })}
    >
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{otherUserName[0]?.toUpperCase()}</Text>
        {isOnline && <View style={styles.onlineDot} />}
      </View>
      <View style={styles.rowBody}>
        <View style={styles.rowTop}>
          <Text style={[styles.name, unread > 0 && styles.nameUnread]} numberOfLines={1}>{otherUserName}</Text>
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
  );
}

export default function MessagesScreen() {
  const { user, profile } = useAuth();
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
        setConversations(snap.docs.map(d => ({ id: d.id, ...d.data() })));
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
          <Text style={styles.profileAvatarText}>{profile?.displayName?.[0]?.toUpperCase() || '?'}</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <AppName style={styles.mySuburb} />
          <Text style={styles.suburbName}>{profile?.suburb}, {profile?.state}</Text>
        </View>
        <View style={{ width: 42 }} />
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
  container: { flex: 1, backgroundColor: Colors.white },
  topHeader: { backgroundColor: Colors.brandGreen, paddingTop: 56, paddingBottom: 16, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerCenter: { alignItems: 'center' },
  mySuburb: { fontSize: 27, fontWeight: '800', color: Colors.white },
  suburbName: { fontSize: 17, color: '#FFD700', marginTop: 4 },
  profileAvatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#FFD700', justifyContent: 'center', alignItems: 'center' },
  profileAvatarText: { fontSize: 15, fontWeight: '800', color: Colors.brandGreen },
  pageHeader: { backgroundColor: Colors.brandGreenPale, paddingVertical: 10, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: Colors.lightGrey },
  pageTitle: { fontSize: 20, fontWeight: '700', color: Colors.brandGreen },
  shareBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.brandGreenPale, paddingHorizontal: 16, paddingVertical: 10 },
  shareBannerText: { fontSize: 13, fontWeight: '600', color: Colors.brandGreen },
  list: { padding: 12, gap: 4, paddingBottom: 40 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 8, borderRadius: 12 },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: Colors.brandGreenPale, justifyContent: 'center', alignItems: 'center', position: 'relative' },
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