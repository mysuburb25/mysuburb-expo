import { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Line } from 'react-native-svg';
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../context/AuthContext';
import { Colors } from '../../constants/theme';

const FILTERS = [
  { key: 'all', label: 'All', preselect: 'lost' },
  { key: 'lost', label: 'Lost', preselect: 'lost' },
  { key: 'found', label: 'Found', preselect: 'found' },
];

export default function LostFoundScreen() {
  const { profile } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState(FILTERS[0]);

  useEffect(() => { if (profile?.suburb) fetchItems(); }, [profile, activeFilter]);

  const fetchItems = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, 'posts'), where('suburb', '==', profile.suburb), where('category', '==', 'lostfound'), where('isRemoved', '==', false), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      let data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (activeFilter.key !== 'all') data = data.filter(p => p.lostFoundType === activeFilter.key);
      setItems(data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

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
        <TouchableOpacity onPress={() => router.push('/(tabs)/notifications')}>
          <Ionicons name="notifications-outline" size={26} color="#fff" />
        </TouchableOpacity>
      </View>
      <View style={styles.pageHeader}>
        <Text style={styles.pageTitle}>Lost & Found</Text>
      </View>
      <View style={styles.filterRow}>
        {FILTERS.map(f => (
          <TouchableOpacity key={f.key} style={[styles.chip, activeFilter.key === f.key && styles.chipActive]} onPress={() => setActiveFilter(f)}>
            <Text style={[styles.chipText, activeFilter.key === f.key && styles.chipTextActive]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {loading ? (
        <ActivityIndicator color={Colors.brandGreen} style={{ marginTop: 40 }} size="large" />
      ) : (
        <FlatList
          data={items}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.card} onPress={() => router.push('/post/' + item.id)}>
              <View style={[styles.typeBadge, { backgroundColor: item.lostFoundType === 'lost' ? '#FFF3E0' : Colors.brandGreenPale }]}>
                <Text style={[styles.typeText, { color: item.lostFoundType === 'lost' ? '#E65100' : Colors.brandGreen }]}>
                  {item.lostFoundType?.toUpperCase() || 'LOST/FOUND'}
                </Text>
              </View>
              <Text style={styles.cardContent} numberOfLines={3}>{item.content}</Text>
              <Text style={styles.cardAuthor}>by {item.authorName}</Text>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="search-outline" size={48} color={Colors.lightGrey} />
              <Text style={styles.emptyText}>No lost & found posts</Text>
            </View>
          }
        />
      )}
      <TouchableOpacity style={styles.fab} onPress={() => router.push({ pathname: '/create-post', params: { category: 'lostfound', preselect: activeFilter.preselect } })}>
        <Svg width="30" height="30" viewBox="0 0 30 30">
              <Line x1="15" y1="3" x2="15" y2="27" stroke="#FFD700" strokeWidth="4" strokeLinecap="round"/>
              <Line x1="3" y1="15" x2="27" y2="15" stroke="#FFD700" strokeWidth="4" strokeLinecap="round"/>
            </Svg>
      </TouchableOpacity>
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
  filterRow: { flexDirection: 'row', padding: 12, gap: 8 },
  chip: { paddingHorizontal: 18, paddingVertical: 9, borderRadius: 20, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.lightGrey },
  chipActive: { backgroundColor: Colors.brandGreen, borderColor: Colors.brandGreen },
  chipText: { fontSize: 15, color: Colors.charcoal, fontWeight: '600' },
  chipTextActive: { color: Colors.white, fontWeight: '700' },
  list: { padding: 16, gap: 12, paddingBottom: 100 },
  card: { backgroundColor: Colors.white, borderRadius: 14, padding: 16, gap: 8, borderWidth: 1, borderColor: Colors.lightGrey },
  typeBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, alignSelf: 'flex-start' },
  typeText: { fontSize: 12, fontWeight: '700' },
  cardContent: { fontSize: 15, color: Colors.charcoal, lineHeight: 22 },
  cardAuthor: { fontSize: 12, color: Colors.midGrey },
  empty: { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyText: { fontSize: 15, color: Colors.midGrey },
  fab: { position: 'absolute', bottom: 24, right: 24, width: 56, height: 56, borderRadius: 28, backgroundColor: Colors.brandGreen, justifyContent: 'center', alignItems: 'center', elevation: 8 },
});