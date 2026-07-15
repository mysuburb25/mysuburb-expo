import { useState, useCallback, useRef, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl, Image, Linking, Share, Alert, Modal, Platform, TextInput } from 'react-native';
import { router } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { collection, query, where, orderBy, getDocs, updateDoc, increment, addDoc, serverTimestamp, doc } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../context/AuthContext';
import { Colors } from '../../constants/theme';
import NotificationBell from '../../components/NotificationBell';
import AvatarWithOnlineDot from '../../components/AvatarWithOnlineDot';

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'lost', label: 'Lost' },
  { key: 'found', label: 'Found' },
];

const STATUS_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'open', label: 'Open' },
  { key: 'resolved', label: 'Resolved' },
];

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

// One generic "Closed" label, matching Buy & Sell's own generic status
// wording, rather than a separate Lost/Found-specific term.
function resolvedBadgeWord() {
  return 'Closed';
}

function formatTime(date) {
  if (!date) return '';
  const d = date.toDate ? date.toDate() : new Date(date);
  return d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });
}

export default function LostFoundScreen() {
  const { profile, user, updateUserProfile } = useAuth();
  const [newCutoff, setNewCutoff] = useState(null);
  const [items, setItems] = useState([]);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareTarget, setShareTarget] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('all');
  const [statusFilter, setStatusFilter] = useState('open'); // 'open' | 'resolved'
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);

  const profileRef = useRef(profile);
  useEffect(() => { profileRef.current = profile; }, [profile]);

  const fetchItems = useCallback(async () => {
    const currentProfile = profileRef.current;
    if (!currentProfile?.suburb) return;
    try {
      // Active suburbs (suburb + state pair) — falls back to primary if suburbs array isn't set yet
      const activeSuburbs = currentProfile?.suburbs
        ? currentProfile.suburbs.filter(s => s.active).map(s => ({ suburb: s.suburb, state: s.state }))
        : [{ suburb: currentProfile.suburb, state: currentProfile.state }];
      if (activeSuburbs.length === 0) return;

      // Run one query per active suburb, in parallel, always scoped by BOTH suburb and state
      // (suburb names repeat across Australian states, so suburb alone isn't a safe filter)
      const queryPromises = activeSuburbs.map(({ suburb, state }) => {
        const q = query(
          collection(db, 'posts'),
          where('suburb', '==', suburb),
          where('state', '==', state),
          where('category', '==', 'lostfound'),
          where('isRemoved', '==', false),
          orderBy('createdAt', 'desc')
        );
        return getDocs(q);
      });

      const snaps = await Promise.all(queryPromises);
      let allItems = snaps.flatMap(snap => snap.docs.map(d => ({ id: d.id, ...d.data() })));

      // Sort merged results by date since each suburb's items arrive independently
      allItems.sort((a, b) => {
        const aTime = a.createdAt?.toDate?.() || new Date(0);
        const bTime = b.createdAt?.toDate?.() || new Date(0);
        return bTime - aTime;
      });
      const blockedIds = currentProfile?.blockedUsers?.map(b => b.uid) || [];
      setItems(blockedIds.length ? allItems.filter(i => !blockedIds.includes(i.authorId)) : allItems);
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    fetchItems();

    const stored = profileRef.current?.lastVisited?.lostfound;
    setNewCutoff(stored ? (stored.toDate ? stored.toDate() : new Date(stored)) : null);

    return () => {
      updateUserProfile({ lastVisited: { ...(profileRef.current?.lastVisited || {}), lostfound: new Date() } });
    };
  }, [fetchItems]));

  const q = searchQuery.trim().toLowerCase();
  const filteredItems = items.filter(p => {
    if (activeTab !== 'all' && p.lostFoundType !== activeTab) return false;
    if (statusFilter === 'open' && p.isResolved) return false;
    if (statusFilter === 'resolved' && !p.isResolved) return false;
    if (q && !(p.content?.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q))) return false;
    return true;
  });

  const handleLikeToggle = async (post) => {
    const liked = post.likedBy?.includes(user.uid) || false;
    const newLiked = !liked;
    setItems(prev => prev.map(p => p.id === post.id ? {
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
    setItems(prev => prev.map(p => p.id === post.id ? {
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
          <Text style={styles.mySuburb}>My Suburb</Text>
          <Text style={styles.suburbName}>{profile?.suburb}, {profile?.state}</Text>
        </View>
        <NotificationBell />
      </View>
      <View style={styles.pageHeader}>
        <View style={styles.pageHeaderIconBadge}>
          <Ionicons name="flag" size={22} color={Colors.brandGreen} />
        </View>
        <Text style={styles.pageTitle}>Lost & Found</Text>
      </View>
      <View style={styles.tabRow}>
        {TABS.map(t => (
          <TouchableOpacity key={t.key} style={[styles.tabBtn, activeTab === t.key && styles.tabBtnActive]} onPress={() => setActiveTab(t.key)}>
            <Text style={[styles.tabText, activeTab === t.key && styles.tabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity style={styles.filterBtn} onPress={() => { setShowSearch(v => !v); if (showSearch) setSearchQuery(''); }}>
          <Ionicons name="search-outline" size={20} color={Colors.brandGreen} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.filterBtn} onPress={() => setShowStatusModal(true)}>
          <Ionicons name="options-outline" size={20} color={Colors.brandGreen} />
        </TouchableOpacity>
      </View>
      {showSearch && (
        <View style={styles.searchRow}>
          <Ionicons name="search-outline" size={18} color={Colors.midGrey} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search lost & found..."
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
          data={filteredItems}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchItems(); }} tintColor={Colors.brandGreen} />}
          renderItem={({ item }) => {
            const liked = item.likedBy?.includes(user?.uid) || false;
            const isLost = item.lostFoundType === 'lost';
            const itemCreatedAt = item.createdAt?.toDate ? item.createdAt.toDate() : (item.createdAt ? new Date(item.createdAt) : null);
            const isNew = newCutoff && itemCreatedAt && itemCreatedAt > newCutoff && item.authorId !== user?.uid;
            return (
              <TouchableOpacity style={styles.card} onPress={() => router.push('/post/' + item.id)}>
                <View style={styles.cardHeader}>
                  <AvatarWithOnlineDot authorId={item.authorId} photoURL={item.authorPhotoURL} name={item.authorName} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardAuthor} numberOfLines={1}>{item.authorName}</Text>
                    <Text style={styles.postedText}>{formatDate(item.createdAt)}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 6 }}>
                    {isNew && (
                      <View style={styles.newBadge}>
                        <Ionicons name="sparkles" size={10} color={Colors.brandGreen} /><Text style={styles.newBadgeText}>NEW</Text>
                      </View>
                    )}
                    <View style={[styles.typeBadge, { backgroundColor: isLost ? '#C62828' : Colors.brandGreen }]}>
                      <Text style={[styles.typeText, item.isResolved && styles.closedText]}>{isLost ? 'Lost' : 'Found'}</Text>
                    </View>
                    {item.isResolved && (
                      <View style={styles.soldTag}>
                        <Text style={styles.soldTagText}>{resolvedBadgeWord()}</Text>
                      </View>
                    )}
                  </View>
                </View>
                <View style={styles.cardBody}>
                  <Text style={styles.cardTitle} numberOfLines={2}>{item.content}</Text>
                  {item.description ? <Text style={[styles.cardDesc, item.isResolved && styles.closedText]} numberOfLines={2}>{item.description}</Text> : null}
                  {item.lostFoundLocation ? (
                    <TouchableOpacity
                      style={styles.locationRow}
                      onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.lostFoundLocation)}`).catch(() => {})}
                    >
                      <Ionicons name="location-outline" size={13} color={Colors.brandGreen} />
                      <Text style={[styles.locationText, styles.locationLink]}>{item.lostFoundLocation}</Text>
                    </TouchableOpacity>
                  ) : null}
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
              <Ionicons name="search-outline" size={48} color={Colors.lightGrey} />
              <Text style={styles.emptyText}>No lost & found posts</Text>
            </View>
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

      {/* Floating small pill FAB bottom right */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push({ pathname: '/create-post', params: { category: 'lostfound', preselect: activeTab === 'all' ? 'lost' : activeTab } })}
      >
        <Ionicons name="pencil-outline" size={16} color={Colors.brandGreen} />
        <Text style={styles.fabText}>New Post</Text>
      </TouchableOpacity>

      <Modal visible={showStatusModal} transparent animationType="slide">
        <TouchableOpacity style={styles.menuOverlay} activeOpacity={1} onPress={() => setShowStatusModal(false)}>
          <View style={styles.filterSheet}>
            <View style={styles.filterHeaderBar}>
              <Text style={styles.filterHeaderText}>Status</Text>
            </View>
            <View style={styles.filterPad}>
              {STATUS_FILTERS.map(opt => (
                <TouchableOpacity
                  key={opt.key}
                  style={[styles.filterOption, statusFilter === opt.key && styles.filterOptionActive]}
                  onPress={() => { setStatusFilter(opt.key); setShowStatusModal(false); }}
                >
                  <Ionicons name={statusFilter === opt.key ? 'radio-button-on' : 'radio-button-off'} size={18} color={statusFilter === opt.key ? Colors.brandGreen : Colors.midGrey} />
                  <Text style={[styles.filterOptionText, statusFilter === opt.key && styles.filterOptionTextActive]}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
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
  profileAvatarText: { fontSize: 16, fontWeight: '800', color: Colors.brandGreen },
  pageHeader: { backgroundColor: Colors.brandGreenPale, paddingVertical: 14, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, borderBottomWidth: 1, borderBottomColor: Colors.lightGrey },
  pageHeaderIconBadge: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.white, justifyContent: 'center', alignItems: 'center' },
  pageTitle: { fontSize: 21, fontWeight: '800', color: Colors.brandGreen, letterSpacing: 0.2 },
  tabRow: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10, borderBottomWidth: 1, borderBottomColor: Colors.lightGrey },
  tabBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 25, backgroundColor: '#F0F0F0', borderWidth: 1, borderColor: Colors.lightGrey },
  tabBtnActive: { backgroundColor: Colors.brandGreen, borderColor: Colors.brandGreen },
  tabText: { fontSize: 13, color: Colors.midGrey, fontWeight: '800' },
  tabTextActive: { color: Colors.white, fontWeight: '700' },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginTop: 12, marginBottom: 12, paddingHorizontal: 14, paddingVertical: 11, backgroundColor: '#F5F5F5', borderRadius: 14, borderWidth: 1, borderColor: Colors.lightGrey },
  searchInput: { flex: 1, fontSize: 14, color: Colors.charcoal },
  filterBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.brandGreenPale, justifyContent: 'center', alignItems: 'center' },
  menuOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  filterSheet: { backgroundColor: Colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden' },
  filterHeaderBar: { backgroundColor: Colors.brandGreen, paddingTop: 14, paddingBottom: 16, alignItems: 'center' },
  filterHeaderText: { fontSize: 19, fontWeight: '800', color: Colors.white },
  filterPad: { padding: 16, paddingBottom: 32 },
  filterOption: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 14, borderRadius: 14, backgroundColor: '#FAFAFA', borderWidth: 1.5, borderColor: '#EFEFEF', marginBottom: 8 },
  filterOptionActive: { backgroundColor: Colors.brandGreenPale, borderColor: Colors.brandGreen },
  filterOptionText: { fontSize: 15, color: Colors.charcoal, fontWeight: '600' },
  filterOptionTextActive: { color: Colors.brandGreen, fontWeight: '700' },
  list: { padding: 16, gap: 12, paddingBottom: 100 },
  card: {
    borderRadius: 14, borderWidth: 1, borderColor: '#D5D5D5', overflow: 'hidden', backgroundColor: Colors.white,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 2,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#EDF7EF', padding: 14 },
  cardAuthor: { fontSize: 17, fontWeight: '700', color: Colors.charcoal },
  postedText: { fontSize: 12, color: Colors.midGrey, fontStyle: 'italic', marginTop: 2 },
  cardBody: { backgroundColor: Colors.white, padding: 16, gap: 6 },
  cardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 },
  cardTitle: { flex: 1, fontSize: 16, color: Colors.charcoal, fontWeight: '700', lineHeight: 22 },
  newBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#FFD700', paddingHorizontal: 9, paddingVertical: 5, borderRadius: 12, borderWidth: 1, borderColor: Colors.brandGreen, marginBottom: 4 },
  newBadgeText: { fontSize: 11, fontWeight: '800', color: Colors.brandGreen, letterSpacing: 0.5 },
  typeBadge: { width: 72, paddingVertical: 5, borderRadius: 20, alignItems: 'center' },
  soldTag: { width: 72, paddingVertical: 5, borderRadius: 20, alignItems: 'center', backgroundColor: '#757575' },
  soldTagText: { fontSize: 14, fontWeight: '800', color: Colors.white },
  typeText: { fontSize: 14, fontWeight: '800', color: Colors.white },
  cardDesc: { fontSize: 13, color: Colors.midGrey, lineHeight: 18 },
  closedText: { textDecorationLine: 'line-through' },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  locationText: { fontSize: 13, color: Colors.midGrey },
  locationLink: { color: Colors.brandGreen, textDecorationLine: 'underline', fontWeight: '600' },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 },
  metaText: { fontSize: 11, color: Colors.midGrey },
  footer: { flexDirection: 'row', gap: 16, alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#EFEFEF', borderTopWidth: 1.5, borderTopColor: '#E0E0E0' },
  footerBtn: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  footerText: { fontSize: 14, color: Colors.charcoal, fontWeight: '600' },
  empty: { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyText: { fontSize: 15, color: Colors.midGrey },
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