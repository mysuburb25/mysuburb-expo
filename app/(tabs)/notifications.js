import { useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { collection, query, where, orderBy, getDocs, writeBatch, doc } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../context/AuthContext';
import { Colors } from '../../constants/theme';

function timeAgo(date) {
  if (!date) return '';
  const d = date.toDate ? date.toDate() : new Date(date);
  const seconds = Math.floor((new Date() - d) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago';
  if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago';
  return Math.floor(seconds / 86400) + 'd ago';
}

export default function NotificationsScreen() {
  const { user, profile, setUnreadCount } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchAndMarkRead = useCallback(async () => {
    if (!user) return;
    try {
      const q = query(
        collection(db, 'notifications'),
        where('userId', '==', user.uid),
        orderBy('createdAt', 'desc')
      );
      const snap = await getDocs(q);
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setNotifications(data);

      // Mark all unread as read in a batch
      const unread = snap.docs.filter(d => !d.data().isRead);
      if (unread.length > 0) {
        const batch = writeBatch(db);
        unread.forEach(d => batch.update(doc(db, 'notifications', d.id), { isRead: true }));
        await batch.commit();
        setUnreadCount(0);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      fetchAndMarkRead();
    }, [fetchAndMarkRead])
  );

  return (
    <View style={styles.container}>
      <View style={styles.topHeader}>
        <TouchableOpacity style={styles.profileAvatar} onPress={() => router.push('/(tabs)/profile')}>
          <Text style={styles.profileAvatarText}>{profile?.displayName?.[0]?.toUpperCase() || '?'}</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.mySuburb}>My Suburb</Text>
          <Text style={styles.suburbName}>{profile?.suburb}, {profile?.state}</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>
      <View style={styles.pageHeader}>
        <Text style={styles.pageTitle}>Notifications</Text>
      </View>
      {loading ? (
        <ActivityIndicator color={Colors.brandGreen} style={{ marginTop: 40 }} size="large" />
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.item, !item.isRead && styles.itemUnread]}
              onPress={() => item.postId ? router.push('/post/' + item.postId) : null}
              activeOpacity={item.postId ? 0.7 : 1}
            >
              <View style={[styles.iconBox, { backgroundColor: item.type === 'like' ? '#FFF0F0' : Colors.brandGreenPale }]}>
                <Ionicons
                  name={item.type === 'like' ? 'heart' : 'chatbubble'}
                  size={20}
                  color={item.type === 'like' ? '#E53935' : Colors.brandGreen}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.message}>{item.message}</Text>
                <Text style={styles.time}>{timeAgo(item.createdAt)}</Text>
              </View>
              {!item.isRead && <View style={styles.unreadDot} />}
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="notifications-outline" size={48} color={Colors.lightGrey} />
              <Text style={styles.emptyTitle}>No notifications yet</Text>
              <Text style={styles.emptyText}>We'll let you know when someone likes or comments on your posts!</Text>
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
  profileAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#FFFFC5', justifyContent: 'center', alignItems: 'center' },
  profileAvatarText: { fontSize: 14, fontWeight: '800', color: Colors.brandGreen },
  pageHeader: { backgroundColor: Colors.brandGreenPale, paddingVertical: 10, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: Colors.lightGrey },
  pageTitle: { fontSize: 20, fontWeight: '700', color: Colors.brandGreen },
  list: { padding: 16, gap: 10, paddingBottom: 100 },
  item: { backgroundColor: Colors.white, borderRadius: 12, padding: 14, flexDirection: 'row', gap: 12, alignItems: 'center', borderWidth: 1, borderColor: Colors.lightGrey },
  itemUnread: { borderLeftWidth: 3, borderLeftColor: Colors.brandGreen, backgroundColor: '#F9FFF9' },
  iconBox: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  message: { fontSize: 14, color: Colors.charcoal, lineHeight: 20, fontWeight: '600' },
  time: { fontSize: 12, color: Colors.midGrey, marginTop: 4 },
  unreadDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.brandGreen },
  empty: { alignItems: 'center', paddingTop: 60, gap: 8, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: Colors.charcoal },
  emptyText: { fontSize: 14, color: Colors.midGrey, textAlign: 'center', lineHeight: 20 },
});