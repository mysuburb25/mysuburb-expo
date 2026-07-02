import { useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { collection, query, where, orderBy, limit, getDocs, updateDoc, increment, addDoc, serverTimestamp, doc } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../context/AuthContext';
import { Colors } from '../../constants/theme';

const FILTERS = [
  { key: 'all', label: "What's Happening", createCategory: 'community', preselect: 'updates' },
  { key: 'notices', label: 'Notices', createCategory: 'community', preselect: 'notices' },
  { key: 'safety', label: 'Safety Alerts', createCategory: 'community', preselect: 'safety' },
];

const CATEGORY_CONFIG = {
  updates:     { label: "What's Happening", bg: Colors.brandGreen },
  notices:     { label: 'Notice',           bg: '#1565C0' },
  safety:      { label: 'Safety Alert',     bg: '#E65100' },
  events:      { label: 'Event',            bg: '#6A1B9A' },
  marketplace: { label: 'Buy & Sell',       bg: Colors.brandGreen },
  lostfound:   { label: 'Lost & Found',     bg: '#C62828' },
};

function formatDate(date) {
  if (!date) return '';
  const d = date.toDate ? date.toDate() : new Date(date);
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatTime(date) {
  if (!date) return '';
  const d = date.toDate ? date.toDate() : new Date(date);
  return d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });
}

export default function HomeScreen() {
  const { profile, user } = useAuth();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState(FILTERS[0]);

  const fetchPosts = useCallback(async () => {
    if (!profile?.suburb) return;
    try {
      let q;
      if (activeFilter.key === 'all') {
        q = query(collection(db, 'posts'), where('suburb', '==', profile.suburb), where('isRemoved', '==', false), orderBy('createdAt', 'desc'), limit(20));
      } else {
        q = query(collection(db, 'posts'), where('suburb', '==', profile.suburb), where('category', '==', activeFilter.key), where('isRemoved', '==', false), orderBy('createdAt', 'desc'), limit(20));
      }
      const snap = await getDocs(q);
      setPosts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  }, [profile, activeFilter]);

  useFocusEffect(useCallback(() => { setLoading(true); fetchPosts(); }, [fetchPosts]));

  const handleLikeToggle = async (post) => {
    const liked = post.likedBy?.includes(user.uid) || false;
    const newLiked = !liked;
    setPosts(prev => prev.map(p => p.id === post.id ? {
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
          message: `${profile.displayName} liked your post`,
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
        <Text style={styles.pageTitle}>Community Hub</Text>
      </View>
      <View style={styles.tabRow}>
        {FILTERS.map(f => (
          <TouchableOpacity key={f.key} style={[styles.tabBtn, activeFilter.key === f.key && styles.tabBtnActive]} onPress={() => setActiveFilter(f)}>
            <Text style={[styles.tabText, activeFilter.key === f.key && styles.tabTextActive]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={Colors.brandGreen} size="large" />
      ) : (
        <FlatList
          data={posts}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchPosts(); }} tintColor={Colors.brandGreen} />}
          renderItem={({ item }) => {
            const liked = item.likedBy?.includes(user?.uid) || false;
            const catConf = CATEGORY_CONFIG[item.category] || CATEGORY_CONFIG.updates;
            return (
              <TouchableOpacity style={styles.card} onPress={() => router.push('/post/' + item.id)} activeOpacity={0.85}>
                <View style={styles.cardBody}>
                  <View style={styles.authorRow}>
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>{item.authorName?.[0]?.toUpperCase() || '?'}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.authorName}>{item.authorName}</Text>
                    </View>
                    <View style={[styles.badge, { backgroundColor: catConf.bg }]}>
                      <Text style={styles.badgeText}>{catConf.label}</Text>
                    </View>
                  </View>
                  <Text style={styles.content} numberOfLines={4}>{item.content}</Text>
                  <View style={styles.metaRow}>
                    <Text style={styles.metaText}>{formatDate(item.createdAt)}, {formatTime(item.createdAt)}</Text>
                  </View>
                </View>
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
              <Ionicons name="home-outline" size={48} color={Colors.lightGrey} />
              <Text style={styles.emptyTitle}>No posts yet</Text>
              <Text style={styles.emptyText}>Be the first to post in {profile?.suburb}!</Text>
            </View>
          }
        />
      )}

      <TouchableOpacity style={styles.fab} onPress={() => router.push({ pathname: '/create-post', params: { category: activeFilter.createCategory, preselect: activeFilter.preselect } })}>
        <Ionicons name="pencil-outline" size={16} color={Colors.brandGreen} />
        <Text style={styles.fabText}>New Post</Text>
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
  tabRow: { flexDirection: 'row', padding: 12, gap: 8, borderBottomWidth: 1, borderBottomColor: Colors.lightGrey },
  tabBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 25, backgroundColor: '#F0F0F0', borderWidth: 1, borderColor: Colors.lightGrey },
  tabBtnActive: { backgroundColor: Colors.brandGreen, borderColor: Colors.brandGreen },
  tabText: { fontSize: 12, color: Colors.midGrey, fontWeight: '600' },
  tabTextActive: { color: Colors.white, fontWeight: '700' },
  list: { padding: 12, gap: 12, paddingBottom: 100 },
  card: { borderRadius: 16, borderWidth: 1, borderColor: Colors.lightGrey, overflow: 'hidden' },
  cardBody: { backgroundColor: Colors.brandGreenPale, padding: 16, gap: 8 },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.white, justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: 16, fontWeight: '700', color: Colors.brandGreen },
  authorName: { fontSize: 15, fontWeight: '700', color: Colors.charcoal },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  badgeText: { fontSize: 11, fontWeight: '700', color: '#fff' },
  content: { fontSize: 15, color: Colors.charcoal, lineHeight: 22 },
  metaRow: { flexDirection: 'row', justifyContent: 'flex-end' },
  metaText: { fontSize: 11, color: Colors.midGrey },
  footer: { flexDirection: 'row', gap: 16, alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, backgroundColor: Colors.white },
  footerBtn: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  footerText: { fontSize: 14, color: Colors.midGrey, fontWeight: '600' },
  empty: { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: Colors.charcoal },
  emptyText: { fontSize: 15, color: Colors.midGrey, textAlign: 'center' },
  fab: { position: 'absolute', bottom: 24, right: 16, backgroundColor: '#FFD700', borderRadius: 25, paddingVertical: 10, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 6, elevation: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4 },
  fabText: { fontSize: 15, fontWeight: '700', color: Colors.brandGreen },
});