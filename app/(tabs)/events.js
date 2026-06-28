import { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../context/AuthContext';
import { Colors } from '../../constants/theme';

export default function EventsScreen() {
  const { profile } = useAuth();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { if (profile?.suburb) fetchEvents(); }, [profile]);

  const fetchEvents = async () => {
    try {
      const q = query(collection(db, 'posts'), where('suburb', '==', profile.suburb), where('category', '==', 'events'), where('isRemoved', '==', false), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      setEvents(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Events</Text>
        <Text style={styles.subtitle}>What's on in {profile?.suburb}</Text>
      </View>
      {loading ? <ActivityIndicator color={Colors.brandGreen} style={{ marginTop: 40 }} size="large" /> : (
        <FlatList
          data={events}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.card} onPress={() => router.push(`/post/${item.id}`)}>
              <View style={styles.dateBox}>
                <Text style={styles.dateDay}>{item.eventDate ? new Date(item.eventDate?.toDate?.() || item.eventDate).getDate() : '?'}</Text>
                <Text style={styles.dateMonth}>{item.eventDate ? new Date(item.eventDate?.toDate?.() || item.eventDate).toLocaleString('en-AU', { month: 'short' }) : ''}</Text>
              </View>
              <View style={styles.cardBody}>
                <Text style={styles.cardTitle} numberOfLines={2}>{item.content}</Text>
                {item.eventLocation && <Text style={styles.location}>{item.eventLocation}</Text>}
                <Text style={styles.author}>by {item.authorName}</Text>
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={<View style={styles.empty}><Ionicons name="calendar-outline" size={48} color={Colors.lightGrey} /><Text style={styles.emptyText}>No upcoming events</Text></View>}
        />
      )}
      <TouchableOpacity style={styles.fab} onPress={() => router.push('/create-post')}>
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.sand },
  header: { padding: 16, paddingTop: 56, backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.lightGrey },
  title: { fontSize: 22, fontWeight: '800', color: Colors.charcoal },
  subtitle: { fontSize: 13, color: Colors.midGrey, marginTop: 2 },
  list: { padding: 16, gap: 12, paddingBottom: 100 },
  card: { backgroundColor: Colors.white, borderRadius: 14, padding: 16, flexDirection: 'row', gap: 14 },
  dateBox: { width: 50, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.brandGreenPale, borderRadius: 10, padding: 8 },
  dateDay: { fontSize: 22, fontWeight: '800', color: Colors.brandGreen },
  dateMonth: { fontSize: 11, fontWeight: '600', color: Colors.brandGreen, textTransform: 'uppercase' },
  cardBody: { flex: 1, gap: 4 },
  cardTitle: { fontSize: 15, fontWeight: '600', color: Colors.charcoal },
  location: { fontSize: 12, color: Colors.midGrey },
  author: { fontSize: 12, color: Colors.midGrey },
  empty: { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyText: { fontSize: 15, color: Colors.midGrey },
  fab: { position: 'absolute', bottom: 24, right: 24, width: 56, height: 56, borderRadius: 28, backgroundColor: Colors.brandGreen, justifyContent: 'center', alignItems: 'center', elevation: 8 },
});