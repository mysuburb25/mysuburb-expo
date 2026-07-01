import { useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import { router } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Line } from 'react-native-svg';
import { collection, query, where, orderBy, getDocs, updateDoc, increment, addDoc, serverTimestamp, doc } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../context/AuthContext';
import { Colors } from '../../constants/theme';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'forsale', label: 'For Sale' },
  { key: 'giveaway', label: 'Give Away' },
  { key: 'seeking', label: 'Seeking' },
];

export default function BuySellScreen() {
  const { profile, user } = useAuth();
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState(FILTERS[0]);

  const fetchListings = useCallback(async () => {
    if (!profile?.suburb) return;
    try {
      let q;
      if (activeFilter.key === 'all') {
        q = query(collection(db, 'posts'), where('suburb', '==', profile.suburb), where('category', '==', 'marketplace'), where('isRemoved', '==', false), orderBy('createdAt', 'desc'));
      } else {
        q = query(collection(db, 'posts'), where('suburb', '==', profile.suburb), where('category', '==', 'marketplace'), where('marketplaceType', '==', activeFilter.key), where('isRemoved', '==', false), orderBy('createdAt', 'desc'));
      }
      const snap = await getDocs(q);
      setListings(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  }, [profile, activeFilter]);

  useFocusEffect(useCallback(() => { setLoading(true); fetchListings(); }, [fetchListings]));

  const handleLikeToggle = async (post) => {
    const liked = post.likedBy?.includes(user.uid) || false;
    const newLiked = !liked;
    setListings(prev => prev.map(p => p.id === post.id ? {
      ...p,
      likeCount: (p.likeCount || 0) + (newLiked ? 1 : -1),
      likedBy: newLiked ? [...(p.likedBy || []), user.uid] : (p.likedBy || []).filter(u => u !== user.uid),
    } : p));
    try {
      await updateDoc(doc(db, 'posts', post.id), {
        likeCount: increment(newLiked ? 1 : -1),
        likedBy: newLiked ? [...(post.likedBy || []), user.uid] : (post.likedBy || []).filter(u => u !== user.uid),
      });
      if (newLiked) {
        await addDoc(collection(db, 'notifications'), {
          userId: post.authorId, type: 'like',
          message: `${profile.displayName} liked your listing`,
          postId: post.id, fromUserId: user.uid, fromUserName: profile.displayName,
          isRead: false, createdAt: serverTimestamp(),
        });
      }
    } catch (e) { console.error(e); }
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
        <Text style={styles.pageTitle}>Buy & Sell</Text>
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
          data={listings}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchListings(); }} tintColor={Colors.brandGreen} />}
          renderItem={({ item }) => {
            const liked = item.likedBy?.includes(user?.uid) || false;
            return (
              <TouchableOpacity style={styles.card} onPress={() => router.push('/post/' + item.id)}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle} numberOfLines={2}>{item.content}</Text>
                  {item.marketplaceType === 'giveaway' || item.isFree ? (
                    <View style={styles.freeTag}><Text style={styles.freeTagText}>FREE</Text></View>
                  ) : item.price > 0 ? (
                    <Text style={styles.price}>${item.price?.toFixed(2)}</Text>
                  ) : item.marketplaceType === 'seeking' ? (
                    <View style={styles.seekingTag}><Text style={styles.seekingTagText}>SEEKING</Text></View>
                  ) : null}
                </View>
                <Text style={styles.author}>by {item.authorName}</Text>
                <View style={styles.footer}>
                  <TouchableOpacity style={styles.footerBtn} onPress={() => handleLikeToggle(item)}>
                    <Ionicons name={liked ? 'heart' : 'heart-outline'} size={18} color={liked ? '#E53935' : Colors.midGrey} />
                    <Text style={[styles.footerText, liked && { color: '#E53935' }]}>{item.likeCount || 0}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.footerBtn} onPress={() => router.push('/post/' + item.id)}>
                    <Ionicons name="chatbubble-outline" size={18} color={Colors.midGrey} />
                    <Text style={styles.footerText}>{item.commentCount || 0}</Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="pricetag-outline" size={48} color={Colors.lightGrey} />
              <Text style={styles.emptyText}>No listings yet</Text>
            </View>
          }
        />
      )}
      <TouchableOpacity style={styles.fab} onPress={() => router.push({ pathname: '/create-post', params: { category: 'marketplace', preselect: activeFilter.key === 'all' ? 'forsale' : activeFilter.key } })}>
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
  profileAvatarText: { fontSize: 16, fontWeight: '800', color: Colors.brandGreen },
  pageHeader: { backgroundColor: Colors.brandGreenPale, paddingVertical: 10, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: Colors.lightGrey },
  pageTitle: { fontSize: 20, fontWeight: '700', color: Colors.brandGreen },
  filterRow: { flexDirection: 'row', padding: 12, gap: 8 },
  chip: { paddingHorizontal: 18, paddingVertical: 9, borderRadius: 20, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.lightGrey },
  chipActive: { backgroundColor: Colors.brandGreen, borderColor: Colors.brandGreen },
  chipText: { fontSize: 15, color: Colors.charcoal, fontWeight: '600' },
  chipTextActive: { color: Colors.white, fontWeight: '700' },
  list: { padding: 16, gap: 12, paddingBottom: 100 },
  card: { backgroundColor: Colors.white, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: Colors.lightGrey },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 4 },
  cardTitle: { flex: 1, fontSize: 15, color: Colors.charcoal, fontWeight: '600' },
  price: { fontSize: 16, fontWeight: '800', color: Colors.brandGreen },
  freeTag: { backgroundColor: Colors.brandGreenPale, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  freeTagText: { fontSize: 12, fontWeight: '700', color: Colors.brandGreen },
  seekingTag: { backgroundColor: '#E3F2FD', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  seekingTagText: { fontSize: 12, fontWeight: '700', color: '#0D47A1' },
  author: { fontSize: 12, color: Colors.midGrey, marginBottom: 10 },
  footer: { flexDirection: 'row', gap: 16, alignItems: 'center', paddingTop: 10, borderTopWidth: 1, borderTopColor: Colors.lightGrey },
  footerBtn: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  footerText: { fontSize: 14, color: Colors.midGrey, fontWeight: '600' },
  empty: { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyText: { fontSize: 15, color: Colors.midGrey },
  fab: { position: 'absolute', bottom: 24, right: 24, width: 56, height: 56, borderRadius: 28, backgroundColor: Colors.brandGreen, justifyContent: 'center', alignItems: 'center', elevation: 8 },
});