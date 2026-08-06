import { useState, useCallback, useRef, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl, Image, Share, Alert, Modal, Platform, ScrollView, TextInput } from 'react-native';
import { router } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { collection, query, where, orderBy, limit, startAfter, getDocs, updateDoc, increment, addDoc, serverTimestamp, doc } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../context/AuthContext';
import { Colors } from '../../constants/theme';
import AppName from '../../components/AppName';
import NotificationBell from '../../components/NotificationBell';
import AvatarWithOnlineDot from '../../components/AvatarWithOnlineDot';

const PAGE_SIZE = 15; // used for both the initial load and every Load More tap

const TABS = [
  { key: 'all',      label: 'All' },
  { key: 'offering', label: 'I  Offer' },
  { key: 'looking',  label: 'I  Need' },
];

const SERVICE_LABELS = {
  plumbing:   'Plumbing',
  painting:   'Painting',
  electrical: 'Electrical',
  handyman:   'Handyman',
  massage:    'Massage',
  physio:     'Physiotherapy',
  carpentry:  'Carpentry',
  cleaning:   'Cleaning',
  gardening:  'Gardening',
  petcare:    'Pet Care',
  childcare:  'Child & Aged Care',
  tutoring:   'Tutoring',
  others:     'Others',
};

function formatDate(date) {
  if (!date) return '';
  const d = date.toDate ? date.toDate() : new Date(date);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatTime(date) {
  if (!date) return '';
  const d = date.toDate ? date.toDate() : new Date(date);
  return d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });
}

export default function ServicesScreen() {
  const { profile, user, unreadMessageCount, updateUserProfile } = useAuth();
  const [newCutoff, setNewCutoff] = useState(null);
  const [posts, setPosts] = useState([]);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareTarget, setShareTarget] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all'); // applied client-side, avoids a new Firestore composite index
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const cursorsRef = useRef({});
  const exhaustedRef = useRef({});
  // Lets the focus effect check "do we already have posts?" without
  // needing posts itself as a dependency.
  const postsRef = useRef([]);
  useEffect(() => { postsRef.current = posts; }, [posts]);

  const profileRef = useRef(profile);
  useEffect(() => { profileRef.current = profile; }, [profile]);

  const fetchPosts = useCallback(async (isLoadMore = false) => {
    const currentProfile = profileRef.current;
    if (!currentProfile?.suburb) { setLoading(false); setLoadingMore(false); return; }
    // Active suburbs (suburb + state pair) — falls back to primary if suburbs array isn't set yet
    const activeSuburbs = currentProfile?.suburbs
      ? currentProfile.suburbs.filter(s => s.active).map(s => ({ suburb: s.suburb, state: s.state }))
      : [{ suburb: currentProfile.suburb, state: currentProfile.state }];
    if (activeSuburbs.length === 0) { setLoading(false); setLoadingMore(false); return; }
    if (!isLoadMore) setLoading(true);
    try {
      if (!isLoadMore) {
        cursorsRef.current = {};
        exhaustedRef.current = {};
      }
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
        const filters = [
          where('suburb', '==', suburb),
          where('state', '==', state),
          where('category', '==', 'services'),
        ];
        if (activeTab !== 'all') {
          filters.push(where('serviceTab', '==', activeTab));
        }
        filters.push(where('isRemoved', '==', false));
        const constraints = [collection(db, 'posts'), ...filters, orderBy('createdAt', 'desc')];
        const cursor = cursorsRef.current[key];
        if (cursor) constraints.push(startAfter(cursor));
        constraints.push(limit(PAGE_SIZE));
        return getDocs(query(...constraints)).then(snap => ({ key, snap }));
      });

      const results = await Promise.all(queryPromises);

      let anyMore = false;
      const newDocs = [];
      for (const { key, snap } of results) {
        if (snap.docs.length > 0) cursorsRef.current[key] = snap.docs[snap.docs.length - 1];
        if (snap.docs.length < PAGE_SIZE) exhaustedRef.current[key] = true;
        else anyMore = true;
        newDocs.push(...snap.docs.map(d => ({ id: d.id, ...d.data() })));
      }

      const blockedIds = currentProfile?.blockedUsers?.map(b => b.uid) || [];
      const filteredNew = blockedIds.length ? newDocs.filter(p => !blockedIds.includes(p.authorId)) : newDocs;

      setPosts(prev => {
        const combined = isLoadMore ? [...prev, ...filteredNew] : filteredNew;
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
  }, [activeTab]);

  const handleLoadMore = () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    fetchPosts(true);
  };

  // Refetch when the service tab changes — previously nothing triggered
  // this at all, since fetchPosts was only ever called from the focus
  // effect below.
  useEffect(() => { fetchPosts(); }, [fetchPosts]);

  useFocusEffect(useCallback(() => {
    // Only show the full-screen spinner when we have nothing yet — see
    // app/(tabs)/index.js for the full explanation.
    if (postsRef.current.length === 0) {
      setLoading(true);
    }
    fetchPosts();

    const stored = profileRef.current?.lastVisited?.services;
    setNewCutoff(stored ? (stored.toDate ? stored.toDate() : new Date(stored)) : null);

    return () => {
      updateUserProfile({ lastVisited: { ...(profileRef.current?.lastVisited || {}), services: new Date() } });
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
          message: `${profile.displayName} liked your service post`,
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
          <Text style={styles.suburbName} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{profile?.suburb}, {profile?.state}</Text>
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
          <NotificationBell />
        </View>
      </View>

      <View style={styles.pageHeader}>
        <View style={styles.pageHeaderCenterGroup}>
          <View style={styles.pageHeaderIconBadge}>
            <Ionicons name="briefcase" size={22} color={Colors.brandGreen} />
          </View>
          <Text style={styles.pageTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>Services</Text>
        </View>
        <TouchableOpacity onPress={() => router.push('/dashboard')} style={styles.dashboardShortcut}>
          <Ionicons name="grid-outline" size={21} color={Colors.brandGreen} />
        </TouchableOpacity>
      </View>

      <View style={styles.tabRow}>
        {TABS.map(t => (
          <TouchableOpacity key={t.key} style={[styles.tabBtn, activeTab === t.key && styles.tabBtnActive]} onPress={() => { setLoading(true); setActiveTab(t.key); }}>
            <Text
              style={[styles.tabText, activeTab === t.key && styles.tabTextActive]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
            >
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity style={styles.filterBtn} onPress={() => { setShowSearch(v => !v); if (showSearch) setSearchQuery(''); }}>
          <Ionicons name="search-outline" size={20} color={Colors.brandGreen} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.filterBtn} onPress={() => setShowCategoryModal(true)}>
          <Ionicons name="options-outline" size={20} color={Colors.brandGreen} />
        </TouchableOpacity>
      </View>
      {showSearch && (
        <View style={styles.searchRow}>
          <Ionicons name="search-outline" size={18} color={Colors.midGrey} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search services..."
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
        <ActivityIndicator color={Colors.brandGreen} style={{ marginTop: 40 }} size="large" />
      ) : (
        <FlatList
          data={(() => {
            const q = searchQuery.trim().toLowerCase();
            let result = categoryFilter === 'all' ? posts : posts.filter(p => p.serviceType === categoryFilter);
            if (q) result = result.filter(p => p.content?.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q));
            return result;
          })()}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchPosts(); }} tintColor={Colors.brandGreen} />}
          renderItem={({ item }) => {
            const liked = item.likedBy?.includes(user?.uid) || false;
            const serviceLabel = SERVICE_LABELS[item.serviceType] || 'Service';
            const itemCreatedAt = item.createdAt?.toDate ? item.createdAt.toDate() : (item.createdAt ? new Date(item.createdAt) : null);
            const isNew = newCutoff && itemCreatedAt && itemCreatedAt > newCutoff && item.authorId !== user?.uid;
            return (
              <TouchableOpacity style={styles.card} onPress={() => router.push('/post/' + item.id)}>
                <View style={styles.cardHeader}>
                  <AvatarWithOnlineDot authorId={item.authorId} photoURL={item.authorPhotoURL} name={item.authorName} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.authorName} numberOfLines={1}>{item.authorName}</Text>
                    <Text style={styles.postedText}>{formatDate(item.createdAt)}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 6 }}>
                    {isNew && (
                      <View style={styles.newBadge}>
                        <Ionicons name="sparkles" size={10} color={Colors.brandGreen} /><Text style={styles.newBadgeText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>NEW</Text>
                      </View>
                    )}
                    <View style={styles.serviceBadgeStack}>
                      <View style={[styles.tabBadge, { backgroundColor: item.serviceTab === 'offering' ? Colors.brandGreen : '#1565C0' }]}>
                        <Text style={styles.tabBadgeText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{item.serviceTab === 'offering' ? 'I  Offer' : 'I  Need'}</Text>
                      </View>
                      <View style={styles.serviceLabelBadge}>
                        <Text style={styles.serviceLabelBadgeText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{serviceLabel}</Text>
                      </View>
                    </View>
                  </View>
                </View>
                <View style={styles.cardBody}>
                  <Text style={styles.cardContent} numberOfLines={2}>{item.content}</Text>
                </View>
                <View style={styles.footer}>
                  <TouchableOpacity style={styles.footerBtn} onPress={() => handleLikeToggle(item)}>
                    <Ionicons name={liked ? 'heart' : 'heart-outline'} size={20} color={liked ? '#E53935' : Colors.charcoal} />
                    <Text style={[styles.footerText, liked && { color: '#E53935' }]}>{item.likeCount || 0}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.footerBtn} onPress={() => router.push('/post/' + item.id)}>
                    <Ionicons name="chatbubble-outline" size={20} color={Colors.charcoal} />
                    <Text style={styles.footerText}>{item.commentCount || 0}</Text>
                  </TouchableOpacity>
                  <View style={styles.footerBtn}>
                    <Ionicons name="eye-outline" size={19} color={Colors.midGrey} />
                    <Text style={[styles.footerText, { color: Colors.midGrey }]}>{item.viewCount || 0}</Text>
                  </View>
                  <View style={{ flex: 1 }} />
                  <TouchableOpacity onPress={() => handleToggleSave(item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name={item.savedBy?.includes(user?.uid) ? 'bookmark' : 'bookmark-outline'} size={20} color={item.savedBy?.includes(user?.uid) ? Colors.brandGreen : Colors.charcoal} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleShare(item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ marginLeft: 8 }}>
                    <Ionicons name="share-outline" size={20} color={Colors.charcoal} />
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="briefcase-outline" size={48} color={Colors.lightGrey} />
              <Text style={styles.emptyText}>No service posts yet in {profile?.suburb}</Text>
            </View>
          }
          ListFooterComponent={
            hasMore && posts.length > 0 ? (
              <TouchableOpacity style={styles.loadMoreBtn} onPress={handleLoadMore} disabled={loadingMore}>
                {loadingMore ? <ActivityIndicator color={Colors.brandGreen} size="small" /> : <Text style={styles.loadMoreBtnText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>Load More</Text>}
              </TouchableOpacity>
            ) : null
          }
        />
      )}

      <Modal visible={showShareModal} transparent animationType="slide" onDismiss={handleShareModalDismiss}>
        <TouchableOpacity style={styles.shareOverlay} activeOpacity={1} onPress={() => setShowShareModal(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.shareSheet} onPress={() => {}}>
            <View style={styles.shareHeaderBar}>
              <Text style={styles.shareHeaderText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>Share</Text>
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
                <Text style={styles.shareCancelText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <TouchableOpacity style={styles.fab} onPress={() => router.push({ pathname: '/create-post', params: { category: 'services', preselect: activeTab === 'all' ? 'offering' : activeTab } })}>
        <Ionicons name="pencil-outline" size={16} color={Colors.brandGreen} />
        <Text style={styles.fabText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>New Post</Text>
      </TouchableOpacity>

      <Modal visible={showCategoryModal} transparent animationType="slide">
        <TouchableOpacity style={styles.menuOverlay} activeOpacity={1} onPress={() => setShowCategoryModal(false)}>
          <View style={styles.filterSheet}>
            <View style={styles.filterHeaderBar}>
              <Text style={styles.filterHeaderText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>Category</Text>
            </View>
            <ScrollView style={styles.filterScrollPad} contentContainerStyle={{ paddingBottom: 32 }}>
              <TouchableOpacity
                style={[styles.filterOption, categoryFilter === 'all' && styles.filterOptionActive]}
                onPress={() => { setCategoryFilter('all'); setShowCategoryModal(false); }}
              >
                <Ionicons name={categoryFilter === 'all' ? 'radio-button-on' : 'radio-button-off'} size={18} color={categoryFilter === 'all' ? Colors.brandGreen : Colors.midGrey} />
                <Text style={[styles.filterOptionText, categoryFilter === 'all' && styles.filterOptionTextActive]}>All Categories</Text>
              </TouchableOpacity>
              {Object.entries(SERVICE_LABELS).map(([key, label]) => (
                <TouchableOpacity
                  key={key}
                  style={[styles.filterOption, categoryFilter === key && styles.filterOptionActive]}
                  onPress={() => { setCategoryFilter(key); setShowCategoryModal(false); }}
                >
                  <Ionicons name={categoryFilter === key ? 'radio-button-on' : 'radio-button-off'} size={18} color={categoryFilter === key ? Colors.brandGreen : Colors.midGrey} />
                  <Text style={[styles.filterOptionText, categoryFilter === key && styles.filterOptionTextActive]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.white },
  topHeader: { backgroundColor: Colors.brandGreen, paddingTop: 56, paddingBottom: 16, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerCenter: { alignItems: 'center', marginLeft: 8 },
  mySuburb: { fontSize: 27, fontWeight: '800', color: Colors.white },
  suburbName: { fontSize: 17, color: '#FFD700', marginTop: 4 },
  profileAvatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#FFD700', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  profileAvatarImage: { width: 42, height: 42, borderRadius: 21 },
  profileAvatarText: { fontSize: 16, fontWeight: '800', color: Colors.brandGreen },
  bellBadge: { position: 'absolute', top: -4, right: -4, backgroundColor: '#E53935', borderRadius: 8, minWidth: 16, height: 16, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 3 },
  bellBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  pageHeader: { backgroundColor: Colors.brandGreenPale, paddingVertical: 14, paddingHorizontal: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: Colors.lightGrey },
  pageHeaderCenterGroup: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
  dashboardShortcut: { padding: 4 },
  pageHeaderIconBadge: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.white, justifyContent: 'center', alignItems: 'center' },
  pageTitle: { fontSize: 21, fontWeight: '800', color: Colors.brandGreen, letterSpacing: 0.2 },
  tabRow: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8, borderBottomWidth: 1, borderBottomColor: Colors.lightGrey },
  tabBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 25, backgroundColor: '#F0F0F0', borderWidth: 1, borderColor: Colors.lightGrey },
  tabBtnActive: { backgroundColor: Colors.brandGreen, borderColor: Colors.brandGreen },
  tabText: { fontSize: 13, color: Colors.midGrey, fontWeight: '800' },
  tabTextActive: { color: Colors.white, fontWeight: '800' },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginTop: 12, marginBottom: 12, paddingHorizontal: 14, paddingVertical: 11, backgroundColor: '#F5F5F5', borderRadius: 14, borderWidth: 1, borderColor: Colors.lightGrey },
  searchInput: { flex: 1, fontSize: 14, color: Colors.charcoal },
  filterBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.brandGreenPale, justifyContent: 'center', alignItems: 'center' },
  menuOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  filterSheet: { backgroundColor: Colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden' },
  filterHeaderBar: { backgroundColor: Colors.brandGreen, paddingTop: 14, paddingBottom: 16, alignItems: 'center' },
  filterHeaderText: { fontSize: 19, fontWeight: '800', color: Colors.white },
  filterScrollPad: { paddingHorizontal: 16, paddingTop: 16, maxHeight: 420 },
  filterOption: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 14, borderRadius: 14, backgroundColor: '#FAFAFA', borderWidth: 1.5, borderColor: '#EFEFEF', marginBottom: 8 },
  filterOptionActive: { backgroundColor: Colors.brandGreenPale, borderColor: Colors.brandGreen },
  filterOptionText: { fontSize: 15, color: Colors.charcoal, fontWeight: '600' },
  filterOptionTextActive: { color: Colors.brandGreen, fontWeight: '700' },
  list: { padding: 16, gap: 12, paddingBottom: 100 },
  card: {
    borderRadius: 14, borderWidth: 1.5, borderColor: Colors.brandGreen, overflow: 'hidden', backgroundColor: Colors.white,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 2,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#EDF7EF', padding: 14 },
  cardBody: { backgroundColor: Colors.white, padding: 16, gap: 8 },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardAuthorRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  authorName: { fontSize: 17, fontWeight: '700', color: Colors.charcoal },
  postedText: { fontSize: 12, color: Colors.midGrey, fontStyle: 'italic', marginTop: 2 },
  serviceBadgeStack: { alignItems: 'stretch', gap: 6 },
  serviceLabelBadge: { backgroundColor: '#C2D9E8', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, alignItems: 'center' },
  serviceLabelBadgeText: { fontSize: 12, color: '#1B4F72', fontWeight: '800' },
  cardContent: { fontSize: 15, color: Colors.charcoal, lineHeight: 22 },
  metaRow: { flexDirection: 'row', justifyContent: 'flex-end' },
  metaText: { fontSize: 11, color: Colors.midGrey },
  footer: { flexDirection: 'row', gap: 16, alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#EFEFEF', borderTopWidth: 1.5, borderTopColor: '#E0E0E0' },
  footerBtn: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  footerText: { fontSize: 14, color: Colors.charcoal, fontWeight: '600' },
  newBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#FFD700', paddingHorizontal: 9, paddingVertical: 5, borderRadius: 12, borderWidth: 1, borderColor: Colors.brandGreen, marginBottom: 4 },
  newBadgeText: { fontSize: 11, fontWeight: '800', color: Colors.brandGreen, letterSpacing: 0.5 },
  tabBadge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20, alignItems: 'center' },
  tabBadgeText: { fontSize: 12, fontWeight: '800', color: Colors.white },
  empty: { alignItems: 'center', paddingTop: 60, gap: 8 },
  loadMoreBtn: { marginTop: 4, marginBottom: 12, alignSelf: 'center', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24, backgroundColor: Colors.brandGreenPale, borderWidth: 1.5, borderColor: Colors.brandGreen },
  loadMoreBtnText: { fontSize: 14, fontWeight: '700', color: Colors.brandGreen },
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
});