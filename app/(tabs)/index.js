import { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../context/AuthContext';
import { Colors, Categories } from '../../constants/theme';

function PostCard({ post, onPress }) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.authorRow}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{post.authorName?.[0]?.toUpperCase() || '?'}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.authorName}>{post.authorName}</Text>
          <Text style={styles.suburb}>{post.suburb}</Text>
        </View>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{post.category?.toUpperCase()}</Text>
        </View>
      </View>
      <Text style={styles.content} numberOfLines={4}>{post.content}</Text>
      <View style={styles.footer}>
        <Ionicons name="heart-outline" size={16} color={Colors.midGrey} />
        <Text style={styles.footerText}>{post.likeCount || 0}</Text>
        <Ionicons name="chatbubble-outline" size={16} color={Colors.midGrey} />
        <Text style={styles.footerText}>{post.commentCount || 0}</Text>
      </View>
    </TouchableOpacity>
  );
}

export default function HomeScreen() {
  const { profile } = useAuth();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeCategory, setActiveCategory] = useState('all');

  const fetchPosts = async () => {
    if (!profile?.suburb) return;
    try {
      let q = query(collection(db, 'posts'), where('suburb', '==', profile.suburb), where('isRemoved', '==', false), orderBy('createdAt', 'desc'), limit(20));
      if (activeCategory !== 'all') {
        q = query(collection(db, 'posts'), where('suburb', '==', profile.suburb), where('category', '==', activeCategory), where('isRemoved', '==', false), orderBy('createdAt', 'desc'), limit(20));
      }
      const snap = await getDocs(q);
      setPosts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { setLoading(true); fetchPosts(); }, [profile, activeCategory]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>My Suburb</Text>
          <Text style={styles.headerSubtitle}>{profile?.suburb}, {profile?.state}</Text>
        </View>
        <TouchableOpacity onPress={() => router.push('/notifications')}>
          <Ionicons name="notifications-outline" size={24} color={Colors.charcoal} />
        </TouchableOpacity>
      </View>
      <FlatList
        horizontal showsHorizontalScrollIndicator={false}
        data={[{ key: 'all', label: 'All', icon: 'apps' }, ...Categories]}
        keyExtractor={item => item.key}
        contentContainerStyle={styles.categoryList}
        renderItem={({ item }) => (
          <TouchableOpacity style={[styles.chip, activeCategory === item.key && styles.chipActive]} onPress={() => setActiveCategory(item.key)}>
            <Text style={[styles.chipText, activeCategory === item.key && styles.chipTextActive]}>{item.label}</Text>
          </TouchableOpacity>
        )}
      />
      {loading ? <ActivityIndicator style={{ marginTop: 40 }} color={Colors.brandGreen} size="large" /> : (
        <FlatList
          data={posts}
          keyExtractor={item => item.id}
          renderItem={({ item }) => <PostCard post={item} onPress={() => router.push(`/post/${item.id}`)} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchPosts(); }} tintColor={Colors.brandGreen} />}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="home-outline" size={48} color={Colors.lightGrey} />
              <Text style={styles.emptyTitle}>No posts yet</Text>
              <Text style={styles.emptyText}>Be the first to post in {profile?.suburb}!</Text>
            </View>
          }
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
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12, backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.lightGrey },
  headerTitle: { fontSize: 20, fontWeight: '800', color: Colors.charcoal },
  headerSubtitle: { fontSize: 13, color: Colors.midGrey, marginTop: 2 },
  categoryList: { paddingHorizontal: 12, paddingVertical: 12, gap: 8 },
  chip: { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 20, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.lightGrey },
  chipActive: { backgroundColor: Colors.brandGreen, borderColor: Colors.brandGreen },
  chipText: { fontSize: 13, color: Colors.charcoal, fontWeight: '500' },
  chipTextActive: { color: Colors.white, fontWeight: '700' },
  list: { padding: 12, gap: 12, paddingBottom: 100 },
  card: { backgroundColor: Colors.white, borderRadius: 16, padding: 16 },
  authorRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 10 },
  avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: Colors.brandGreenPale, justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: 16, fontWeight: '700', color: Colors.brandGreen },
  authorName: { fontSize: 14, fontWeight: '700', color: Colors.charcoal },
  suburb: { fontSize: 12, color: Colors.midGrey },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, backgroundColor: Colors.brandGreenPale },
  badgeText: { fontSize: 10, fontWeight: '700', color: Colors.brandGreen },
  content: { fontSize: 15, color: Colors.charcoal, lineHeight: 22, marginBottom: 12 },
  footer: { flexDirection: 'row', gap: 8, alignItems: 'center', paddingTop: 8, borderTopWidth: 1, borderTopColor: Colors.lightGrey },
  footerText: { fontSize: 13, color: Colors.midGrey, marginRight: 8 },
  empty: { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: Colors.charcoal },
  emptyText: { fontSize: 14, color: Colors.midGrey, textAlign: 'center' },
  fab: { position: 'absolute', bottom: 24, right: 24, width: 56, height: 56, borderRadius: 28, backgroundColor: Colors.brandGreen, justifyContent: 'center', alignItems: 'center', elevation: 8 },
});