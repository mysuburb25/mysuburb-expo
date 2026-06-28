import { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../context/AuthContext';
import { Colors } from '../../constants/theme';

export default function MarketplaceScreen() {
  const { profile } = useAuth();
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => { if (profile?.suburb) fetchListings(); }, [profile, filter]);

  const fetchListings = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, 'posts'), where('suburb', '==', profile.suburb), where('category', '==', 'marketplace'), where('isRemoved', '==', false), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      let data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (filter === 'free') data = data.filter(p => p.isFree);
      if (filter === 'forsale') data = data.filter(p => !p.isFree);
      setListings(data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Marketplace</Text>
        <Text style={styles.subtitle}>{profile?.suburb} buy, sell & free</Text>
      </View>
      <View style={styles.filters}>
        {['all', 'forsale', 'free'].map(f => (
          <TouchableOpacity key={f} style={[styles.filterBtn, filter === f && styles.filterBtnActive]} onPress={() => setFilter(f)}>
            <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>{f === 'all' ? 'All' : f === 'forsale' ? 'For Sale' : 'Free'}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {loading ? <ActivityIndicator color={Colors.brandGreen} style={{ marginTop: 40 }} size="large" /> : (
        <FlatList
          data={listings}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.card} onPress={() => router.push(`/post/${item.id}`)}>
              <View style={styles.cardBody}>
                <Text style={styles.cardTitle} numberOfLines={2}>{item.content}</Text>
                {item.isFree ? <Text style={styles.freeLabel}>FREE</Text> : <Text style={styles.price}>${item.price?.toFixed(2)}</Text>}
                <Text style={styles.author}>by {item.authorName}</Text>
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={<View style={styles.empty}><Ionicons name="storefront-outline" size={48} color={Colors.lightGrey} /><Text style={styles.emptyText}>No listings yet</Text></View>}
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
  filters: { flexDirection: 'row', padding: 12, gap: 8 },
  filterBtn: { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 20, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.lightGrey },
  filterBtnActive: { backgroundColor: Colors.brandGreen, borderColor: Colors.brandGreen },
  filterText: { fontSize: 13, color: Colors.charcoal },
  filterTextActive: { color: Colors.white, fontWeight: '700' },
  list: { padding: 16, gap: 12, paddingBottom: 100 },
  card: { backgroundColor: Colors.white, borderRadius: 14, padding: 16 },
  cardBody: { gap: 6 },
  cardTitle: { fontSize: 15, color: Colors.charcoal, fontWeight: '600' },
  price: { fontSize: 16, fontWeight: '800', color: Colors.brandGreen },
  freeLabel: { fontSize: 13, fontWeight: '700', color: Colors.white, backgroundColor: Colors.brandGreen, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, alignSelf: 'flex-start' },
  author: { fontSize: 12, color: Colors.midGrey },
  empty: { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyText: { fontSize: 15, color: Colors.midGrey },
  fab: { position: 'absolute', bottom: 24, right: 24, width: 56, height: 56, borderRadius: 28, backgroundColor: Colors.brandGreen, justifyContent: 'center', alignItems: 'center', elevation: 8 },
});