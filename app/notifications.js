import { useState, useEffect } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { Colors } from '../constants/theme';

export default function NotificationsScreen() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) fetchNotifications();
  }, [user]);

  const fetchNotifications = async () => {
    try {
      const q = query(
        collection(db, 'notifications'),
        where('userId', '==', user.uid),
        orderBy('createdAt', 'desc')
      );
      const snap = await getDocs(q);
      setNotifications(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      {loading ? (
        <ActivityIndicator color={Colors.brandGreen} style={{ marginTop: 40 }} size="large" />
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={[styles.item, !item.isRead && styles.itemUnread]}>
              <View style={styles.iconBox}>
                <Ionicons name={item.type === 'like' ? 'heart' : 'chatbubble'} size={20} color={Colors.brandGreen} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.message}>{item.message}</Text>
                <Text style={styles.time}>{item.createdAt?.toDate?.()?.toLocaleDateString('en-AU') || ''}</Text>
              </View>
              {!item.isRead && <View style={styles.unreadDot} />}
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="notifications-outline" size={48} color={Colors.lightGrey} />
              <Text style={styles.emptyText}>No notifications yet</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.sand },
  list: { padding: 16, gap: 8 },
  item: { backgroundColor: Colors.white, borderRadius: 12, padding: 14, flexDirection: 'row', gap: 12, alignItems: 'center' },
  itemUnread: { borderLeftWidth: 3, borderLeftColor: Colors.brandGreen },
  iconBox: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.brandGreenPale, justifyContent: 'center', alignItems: 'center' },
  message: { fontSize: 14, color: Colors.charcoal, lineHeight: 20 },
  time: { fontSize: 12, color: Colors.midGrey, marginTop: 4 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.brandGreen },
  empty: { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyText: { fontSize: 15, color: Colors.midGrey },
});