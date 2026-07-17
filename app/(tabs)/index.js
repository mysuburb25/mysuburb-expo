import { useState, useCallback, useRef, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl, ActivityIndicator, Image, Share, Alert, Modal, Platform, TextInput } from 'react-native';
import { router } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { collection, query, where, orderBy, limit, startAfter, getDocs, updateDoc, increment, addDoc, serverTimestamp, doc } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../context/AuthContext';
import { Colors } from '../../constants/theme';
import AppName from '../../components/AppName';
import PostCard from '../../components/PostCard';

const FILTERS = [
  { key: 'all', label: 'All', createCategory: 'community', preselect: 'updates' },
  { key: 'updates', label: 'General', createCategory: 'community', preselect: 'updates' },
  { key: 'notices', label: 'Notices', createCategory: 'community', preselect: 'notices' },
  { key: 'safety', label: 'Alerts', createCategory: 'community', preselect: 'safety' },
];

const PAGE_SIZE = 15; // used for both the initial load and every subsequent Load More tap

export default function HomeScreen() {
  const { profile, user, unreadCount, unreadMessageCount, updateUserProfile } = useAuth();
  const [newCutoff, setNewCutoff] = useState(null);
  const [posts, setPosts] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareTarget, setShareTarget] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState(FILTERS[0]);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  // Per-suburb Firestore cursors and exhaustion flags — since this screen
  // runs one query PER active suburb (in parallel) and merges the results,
  // each suburb needs its own independent "where did we leave off" cursor.
  // Kept in refs, not state, since updating them should never itself
  // trigger a re-render.
  const cursorsRef = useRef({});
  const exhaustedRef = useRef({});

  // Still used for lastVisited tracking in the focus-effect cleanup below,
  // where we deliberately want the latest value without retriggering effects.
  const profileRef = useRef(profile);
  useEffect(() => { profileRef.current = profile; }, [profile]);

  // fetchPosts depends directly on the actual profile fields it reads (not
  // a ref) — this is what makes it automatically re-run the moment `profile`
  // finishes loading after login, and guarantees setLoading(false) always
  // fires even on an early return, so the spinner can never get stuck.
  // isLoadMore=false (the default) always starts a fresh first page — used
  // for the initial load, filter changes, and pull-to-refresh. isLoadMore=true
  // fetches the NEXT batch per suburb using each suburb's own cursor, and
  // appends rather than replaces — this is what actually keeps costs
  // proportional to how much a person scrolls, instead of re-reading
  // already-seen posts every time.
  const fetchPosts = useCallback(async (isLoadMore = false) => {
    if (!profile?.suburb) { setLoading(false); setRefreshing(false); setLoadingMore(false); return; }
    try {
      // Active suburbs (suburb + state pair) — falls back to primary if suburbs array isn't set yet
      const activeSuburbs = profile?.suburbs
        ? profile.suburbs.filter(s => s.active).map(s => ({ suburb: s.suburb, state: s.state }))
        : [{ suburb: profile.suburb, state: profile.state }];
      if (activeSuburbs.length === 0) { setLoading(false); setRefreshing(false); setLoadingMore(false); return; }

      const batchSize = PAGE_SIZE;

      if (!isLoadMore) {
        cursorsRef.current = {};
        exhaustedRef.current = {};
      }

      // Skip suburbs already known to be exhausted, so we don't spend a
      // read confirming what we already know.
      const suburbsToQuery = activeSuburbs.filter(({ suburb, state }) => !exhaustedRef.current[`${suburb}|${state}`]);
      if (isLoadMore && suburbsToQuery.length === 0) {
        setHasMore(false);
        setLoadingMore(false);
        return;
      }

      // Run one query per active (non-exhausted) suburb, in parallel, always
      // scoped by BOTH suburb and state (suburb names repeat across
      // Australian states, so suburb alone isn't a safe filter). Each
      // continues from its own cursor if one exists.
      const queryPromises = suburbsToQuery.map(({ suburb, state }) => {
        const key = `${suburb}|${state}`;
        const constraints = [
          collection(db, 'posts'),
          where('suburb', '==', suburb),
          where('state', '==', state),
          // "All" combines General/Notices/Safety Alerts in one query
          // rather than a separate query per category, since Firestore's
          // 'in' operator handles that cleanly without extra reads.
          activeFilter.key === 'all'
            ? where('category', 'in', ['updates', 'notices', 'safety'])
            : where('category', '==', activeFilter.key),
          where('isRemoved', '==', false),
          orderBy('createdAt', 'desc'),
        ];
        const cursor = cursorsRef.current[key];
        if (cursor) constraints.push(startAfter(cursor));
        constraints.push(limit(batchSize));
        return getDocs(query(...constraints)).then(snap => ({ key, snap }));
      });

      const results = await Promise.all(queryPromises);

      let anyMore = false;
      const newDocs = [];
      for (const { key, snap } of results) {
        if (snap.docs.length > 0) {
          cursorsRef.current[key] = snap.docs[snap.docs.length - 1];
        }
        if (snap.docs.length < batchSize) {
          exhaustedRef.current[key] = true;
        } else {
          anyMore = true; // returned a full page — this suburb may have more
        }
        newDocs.push(...snap.docs.map(d => ({ id: d.id, ...d.data() })));
      }

      const blockedIds = profile?.blockedUsers?.map(b => b.uid) || [];
      const filteredNew = blockedIds.length ? newDocs.filter(p => !blockedIds.includes(p.authorId)) : newDocs;

      setPosts(prev => {
        const combined = isLoadMore ? [...prev, ...filteredNew] : filteredNew;
        // Sort the combined set since each suburb's posts arrive independently
        combined.sort((a, b) => {
          const aTime = a.createdAt?.toDate?.() || new Date(0);
          const bTime = b.createdAt?.toDate?.() || new Date(0);
          return bTime - aTime;
        });
        return combined;
      });
      setHasMore(anyMore);
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); setLoadingMore(false); }
  }, [activeFilter, profile?.suburb, profile?.state, profile?.suburbs, profile?.blockedUsers]);

  const handleLoadMore = () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    fetchPosts(true);
  };

  // Refetch whenever the filter tab changes OR profile finishes loading —
  // fetchPosts's identity now changes in both cases, so this effect covers
  // both triggers automatically.
  useEffect(() => { fetchPosts(); }, [fetchPosts]);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    fetchPosts();

    const stored = profileRef.current?.lastVisited?.home;
    setNewCutoff(stored ? (stored.toDate ? stored.toDate() : new Date(stored)) : null);

    return () => {
      updateUserProfile({ lastVisited: { ...(profileRef.current?.lastVisited || {}), home: new Date() } });
    };
  }, [fetchPosts]));

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
      if (newLiked && post.authorId !== user.uid) {
        await addDoc(collection(db, 'notifications'), {
          userId: post.authorId, type: 'like',
          message: `${profile.displayName} liked your post`,
          postId: post.id, fromUserId: user.uid, fromUserName: profile.displayName,
          isRead: false, createdAt: serverTimestamp(),
        });
      }
    } catch (e) { console.error(e); }
  };

  const handleToggleSave = async (post) => {
    const saved = post.savedBy?.includes(user.uid) || false;
    const newSaved = !saved;
    setPosts(prev => prev.map(p => p.id === post.id ? {
      ...p,
      savedBy: newSaved ? [...(p.savedBy || []), user.uid] : (p.savedBy || []).filter(u => u !== user.uid),
    } : p));
    try {
      await updateDoc(doc(db, 'posts', post.id), {
        savedBy: newSaved ? [...(post.savedBy || []), user.uid] : (post.savedBy || []).filter(u => u !== user.uid),
      });
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Could not update. Please try again.');
    }
  };

  const buildShareText = (item) => `${item.content}\n\nmysuburb://post/${item.id}\n(Tap to open in My Suburb — you'll need the app installed)\n\nShared from My Suburb`;

  const handleShare = (item) => {
    setShareTarget(item);
    setShowShareModal(true);
  };

  const handleShareToUser = () => {
    setShowShareModal(false);
    router.push({ pathname: '/share-picker', params: { shareText: buildShareText(shareTarget), sharePostId: shareTarget.id } });
  };

  // Native share sheet must wait for the custom Share modal to be FULLY
  // gone before presenting — not just "probably gone after a guessed
  // delay". iOS's Modal fires onDismiss at exactly that moment, so the
  // share sheet call is deferred there instead of a fixed setTimeout,
  // which was causing it to appear on top of the modal's still-fading
  // overlay (a washed-out look) or fail to appear at all. Android's Modal
  // doesn't support onDismiss, so it keeps a short fallback delay.
  const pendingExternalShareRef = useRef(false);

  const handleShareExternal = () => {
    pendingExternalShareRef.current = true;
    setShowShareModal(false);
    if (Platform.OS !== 'ios') {
      setTimeout(() => {
        if (pendingExternalShareRef.current) {
          pendingExternalShareRef.current = false;
          Share.share({ message: buildShareText(shareTarget) }).catch(e => console.error(e));
        }
      }, 400);
    }
  };

  const handleShareModalDismiss = () => {
    if (Platform.OS === 'ios' && pendingExternalShareRef.current) {
      pendingExternalShareRef.current = false;
      Share.share({ message: buildShareText(shareTarget) }).catch(e => console.error(e));
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.topHeader}>
        <TouchableOpacity style={styles.profileAvatar} onPress={() => router.push('/(tabs)/profile')}>
          {profile?.photoURL ? (
            <Image source={{ uri: profile.photoURL }} style={styles.profileAvatarImage} />
          ) : (
            <Text style={styles.profileAvatarText}>{profile?.displayName?.[0]?.toUpperCase() || '?'}</Text>
          )}
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <AppName style={styles.mySuburb} />
          <Text style={styles.suburbName}>{profile?.suburb}, {profile?.state}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          <TouchableOpacity onPress={() => router.push('/(tabs)/messages')} style={{ position: 'relative' }}>
            <Ionicons name="chatbubbles-outline" size={24} color="#fff" />
            {unreadMessageCount > 0 && (
              <View style={styles.bellBadge}>
                <Text style={styles.bellBadgeText}>{unreadMessageCount > 9 ? '9+' : unreadMessageCount}</Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/(tabs)/notifications')} style={{ position: 'relative' }}>
            <Ionicons name="notifications-outline" size={26} color="#fff" />
            {unreadCount > 0 && (
              <View style={styles.bellBadge}>
                <Text style={styles.bellBadgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>
      <View style={styles.pageHeader}>
        <View style={styles.pageHeaderCenterGroup}>
          <View style={styles.pageHeaderIconBadge}>
            <Ionicons name="home" size={22} color={Colors.brandGreen} />
          </View>
          <Text style={styles.pageTitle}>Community Hub</Text>
        </View>
        <TouchableOpacity onPress={() => router.push('/dashboard')} style={styles.dashboardShortcut}>
          <Ionicons name="grid-outline" size={21} color={Colors.brandGreen} />
        </TouchableOpacity>
      </View>
      <View style={styles.tabRow}>
        {FILTERS.map(f => (
          <TouchableOpacity key={f.key} style={[styles.tabBtn, activeFilter.key === f.key && styles.tabBtnActive]} onPress={() => setActiveFilter(f)}>
            <Text style={[styles.tabText, activeFilter.key === f.key && styles.tabTextActive]} numberOfLines={1}>{f.label}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity style={styles.filterBtn} onPress={() => { setShowSearch(v => !v); if (showSearch) setSearchQuery(''); }}>
          <Ionicons name="search-outline" size={20} color={Colors.brandGreen} />
        </TouchableOpacity>
      </View>
      {showSearch && (
        <View style={styles.searchRow}>
          <Ionicons name="search-outline" size={18} color={Colors.midGrey} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search posts..."
            placeholderTextColor={Colors.midGrey}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close-circle" size={18} color={Colors.midGrey} />
            </TouchableOpacity>
          )}
        </View>
      )}

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={Colors.brandGreen} size="large" />
      ) : (
        <FlatList
          data={searchQuery.trim() ? posts.filter(p => p.content?.toLowerCase().includes(searchQuery.trim().toLowerCase())) : posts}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchPosts(); }} tintColor={Colors.brandGreen} />}
          renderItem={({ item }) => (
            <PostCard
              item={item}
              currentUserUid={user?.uid}
              newCutoff={newCutoff}
              onLikeToggle={handleLikeToggle}
              onToggleSave={handleToggleSave}
              onShare={handleShare}
            />
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="home-outline" size={48} color={Colors.lightGrey} />
              <Text style={styles.emptyTitle}>No posts yet</Text>
              <Text style={styles.emptyText}>Be the first to post in {profile?.suburb}!</Text>
            </View>
          }
          ListFooterComponent={
            hasMore && posts.length > 0 ? (
              <TouchableOpacity style={styles.loadMoreBtn} onPress={handleLoadMore} disabled={loadingMore}>
                {loadingMore ? <ActivityIndicator color={Colors.brandGreen} size="small" /> : <Text style={styles.loadMoreBtnText}>Load More</Text>}
              </TouchableOpacity>
            ) : null
          }
        />
      )}

      <Modal visible={showShareModal} transparent animationType="slide" onDismiss={handleShareModalDismiss}>
        <TouchableOpacity style={styles.shareOverlay} activeOpacity={1} onPress={() => setShowShareModal(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.shareSheet} onPress={() => {}}>
            <View style={styles.shareHeaderBar}>
              <Text style={styles.shareHeaderText}>Share</Text>
            </View>
            <View style={styles.sharePad}>
              <TouchableOpacity style={styles.shareOption} onPress={handleShareToUser}>
                <View style={[styles.shareOptionIcon, { backgroundColor: Colors.brandGreenPale }]}>
                  <Ionicons name="people-outline" size={20} color={Colors.brandGreen} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.shareOptionTitle}>Share to a My Suburb User</Text>
                  <Text style={styles.shareOptionSubtitle}>Send this post as a message</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={Colors.lightGrey} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.shareOption} onPress={handleShareExternal}>
                <View style={[styles.shareOptionIcon, { backgroundColor: '#E3F2FD' }]}>
                  <Ionicons name="share-social-outline" size={20} color="#0D47A1" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.shareOptionTitle}>Share via Other Apps</Text>
                  <Text style={styles.shareOptionSubtitle}>WhatsApp, Messages, Email, and more</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={Colors.lightGrey} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.shareCancelBtn} onPress={() => setShowShareModal(false)}>
                <Text style={styles.shareCancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

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
  profileAvatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#FFD700', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  profileAvatarImage: { width: 42, height: 42, borderRadius: 21 },
  profileAvatarText: { fontSize: 15, fontWeight: '800', color: Colors.brandGreen },
  pageHeader: { backgroundColor: Colors.brandGreenPale, paddingVertical: 14, paddingHorizontal: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: Colors.lightGrey },
  pageHeaderCenterGroup: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
  dashboardShortcut: { padding: 4 },
  pageHeaderIconBadge: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.white, justifyContent: 'center', alignItems: 'center' },
  pageTitle: { fontSize: 21, fontWeight: '800', color: Colors.brandGreen, letterSpacing: 0.2 },
  tabRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 8, gap: 6, borderBottomWidth: 1, borderBottomColor: Colors.lightGrey },
  tabBtn: { flex: 1, paddingVertical: 10, paddingHorizontal: 2, alignItems: 'center', borderRadius: 25, backgroundColor: '#F0F0F0', borderWidth: 1, borderColor: Colors.lightGrey },
  tabBtnActive: { backgroundColor: Colors.brandGreen, borderColor: Colors.brandGreen },
  tabText: { fontSize: 13, color: Colors.midGrey, fontWeight: '800' },
  tabTextActive: { color: Colors.white, fontWeight: '700' },
  filterBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.brandGreenPale, justifyContent: 'center', alignItems: 'center' },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 12, marginTop: 12, marginBottom: 12, paddingHorizontal: 14, paddingVertical: 11, backgroundColor: '#F5F5F5', borderRadius: 14, borderWidth: 1, borderColor: Colors.lightGrey },
  searchInput: { flex: 1, fontSize: 14, color: Colors.charcoal },
  list: { padding: 12, gap: 12, paddingBottom: 100 },
  empty: { alignItems: 'center', paddingTop: 60, gap: 8 },
  loadMoreBtn: { marginTop: 4, marginBottom: 12, alignSelf: 'center', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24, backgroundColor: Colors.brandGreenPale, borderWidth: 1.5, borderColor: Colors.brandGreen },
  loadMoreBtnText: { fontSize: 14, fontWeight: '700', color: Colors.brandGreen },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: Colors.charcoal },
  emptyText: { fontSize: 15, color: Colors.midGrey, textAlign: 'center' },
  fab: { position: 'absolute', bottom: 24, right: 16, backgroundColor: '#FFD700', borderRadius: 25, paddingVertical: 10, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 6, elevation: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4 },
  shareOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  shareSheet: { backgroundColor: Colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden' },
  shareHeaderBar: { backgroundColor: Colors.brandGreen, paddingTop: 14, paddingBottom: 16, alignItems: 'center', borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  shareHeaderText: { fontSize: 19, fontWeight: '800', color: Colors.white },
  sharePad: { padding: 16, paddingBottom: 32 },
  shareOption: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, paddingHorizontal: 8, borderRadius: 14, marginBottom: 6 },
  shareOptionIcon: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  shareOptionTitle: { fontSize: 15, fontWeight: '700', color: Colors.charcoal },
  shareOptionSubtitle: { fontSize: 12, color: Colors.midGrey, marginTop: 2 },
  shareCancelBtn: { backgroundColor: Colors.brandGreenPale, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  shareCancelText: { fontSize: 15, fontWeight: '700', color: Colors.brandGreen },
  fabText: { fontSize: 15, fontWeight: '700', color: Colors.brandGreen },
  bellBadge: { position: 'absolute', top: -4, right: -4, backgroundColor: '#E53935', borderRadius: 8, minWidth: 16, height: 16, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 3 },
  bellBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
});