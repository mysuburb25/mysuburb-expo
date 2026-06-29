import { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Line } from 'react-native-svg';
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../context/AuthContext';
import { Colors } from '../../constants/theme';

const FILTERS = [
  { key: 'all', label: "What's Happening", createCategory: 'updates' },
  { key: 'notices', label: 'Notices', createCategory: 'notices' },
  { key: 'safety', label: 'Safety Alerts', createCategory: 'safety' },
];

const BADGE_COLORS = {
  general: { bg: '#E8F5E9', text: '#1B4332' },
  updates: { bg: '#E8F5E9', text: '#1B4332' },
  notices: { bg: '#E3F2FD', text: '#0D47A1' },
  safety: { bg: '#FFF3E0', text: '#E65100' },
};

function timeAgo(date) {
  if (!date) return '';
  const d = date.toDate ? date.toDate() : new Date(date);
  const seconds = Math.floor((new Date() - d) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago';
  if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago';
  return Math.floor(seconds / 86400) + 'd ago';
}

function PostCard({ post, onPress }) {
  const badge = BADGE_COLORS[post.category] || BADGE_COLORS.general;
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.authorRow}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{post.authorName?.[0]?.toUpperCase() || '?'}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.authorName}>{post.authorName}</Text>
          <Text style={styles.time}>{timeAgo(post.createdAt)}</Text>
        </View>
        <View style={[styles.badge, { backgroundColor: badge.bg }]}>
          <Text style={[styles.badgeText, { color: badge.text }]}>{post.category?.toUpperCase()}</Text>
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
  const [activeFilter, setActiveFilter] = useState(FILTERS[0]);

  const fetchPosts = async () => {
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
  };

  useEffect(() => { setLoading(true); fetchPosts(); }, [profile, activeFilter]);

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

      <View style={styles.filterRow}>
        {FILTERS.map(f => (
          <TouchableOpacity key={f.key} style={[styles.chip, activeFilter.key === f.key && styles.chipActive]} onPress={() => setActiveFilter(f)}>
            <Text style={[styles.chipText, activeFilter.key === f.key && styles.chipTextActive]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={Colors.brandGreen} size="large" />
      ) : (
        <FlatList
          data={posts}
          keyExtractor={item => item.id}
          renderItem={({ item }) => <PostCard post={item} onPress={() => router.push('/post/' + item.id)} />}
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

      <TouchableOpacity style={styles.fab} onPress={() => router.push({ pathname: '/create-post', params: { category: 'community', preselect: activeFilter.createCategory } })}>
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
  filterRow: { flexDirection: 'row', padding: 12, gap: 8, backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.lightGrey },
  chip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.lightGrey },
  chipActive: { backgroundColor: Colors.brandGreen, borderColor: Colors.brandGreen },
  chipText: { fontSize: 13, color: Colors.charcoal, fontWeight: '600' },
  chipTextActive: { color: Colors.white, fontWeight: '700' },
  list: { padding: 12, gap: 12, paddingBottom: 100 },
  card: { backgroundColor: Colors.white, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: Colors.lightGrey },
  authorRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 10 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.brandGreenPale, justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: 16, fontWeight: '700', color: Colors.brandGreen },
  authorName: { fontSize: 15, fontWeight: '700', color: Colors.charcoal },
  time: { fontSize: 12, color: Colors.midGrey, marginTop: 1 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  content: { fontSize: 15, color: Colors.charcoal, lineHeight: 22, marginBottom: 12 },
  footer: { flexDirection: 'row', gap: 8, alignItems: 'center', paddingTop: 8, borderTopWidth: 1, borderTopColor: Colors.lightGrey },
  footerText: { fontSize: 13, color: Colors.midGrey, marginRight: 8 },
  empty: { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: Colors.charcoal },
  emptyText: { fontSize: 15, color: Colors.midGrey, textAlign: 'center' },
  fab: { position: 'absolute', bottom: 24, right: 24, width: 56, height: 56, borderRadius: 28, backgroundColor: Colors.brandGreen, justifyContent: 'center', alignItems: 'center', elevation: 8 },
});