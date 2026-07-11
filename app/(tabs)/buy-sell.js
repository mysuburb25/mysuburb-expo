import { useState, useCallback, useRef, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl, Image, Share, Alert, Modal } from 'react-native';
import { router } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { collection, query, where, orderBy, getDocs, updateDoc, increment, addDoc, serverTimestamp, doc } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../context/AuthContext';
import { Colors } from '../../constants/theme';
import NotificationBell from '../../components/NotificationBell';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'forsale', label: 'For Sale' },
  { key: 'giveaway', label: 'Give Away' },
  { key: 'seeking', label: 'Seeking' },
];

const TYPE_CONFIG = {
  forsale:  { label: 'For Sale',  bg: Colors.brandGreen },
  giveaway: { label: 'Give Away', bg: '#1565C0' },
  seeking:  { label: 'Seeking',   bg: '#6A1B9A' },
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

export default function BuySellScreen() {
  const { profile, user, updateUserProfile } = useAuth();
  const [newCutoff, setNewCutoff] = useState(null);
  const [listings, setListings] = useState([]);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareTarget, setShareTarget] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState(FILTERS[0]);

  const fetchListings = useCallback(async () => {
    if (!profile?.suburb) return;
    try {
      // Active suburbs (suburb + state pair) — falls back to primary if suburbs array isn't set yet
      const activeSuburbs = profile?.suburbs
        ? profile.suburbs.filter(s => s.active).map(s => ({ suburb: s.suburb, state: s.state }))
        : [{ suburb: profile.suburb, state: profile.state }];
      if (activeSuburbs.length === 0) return;

      // Run one query per active suburb, in parallel, always scoped by BOTH suburb and state
      // (suburb names repeat across Australian states, so suburb alone isn't a safe filter)
      const queryPromises = activeSuburbs.map(({ suburb, state }) => {
        const filters = [
          where('suburb', '==', suburb),
          where('state', '==', state),
          where('category', '==', 'marketplace'),
        ];
        if (activeFilter.key !== 'all') {
          filters.push(where('marketplaceType', '==', activeFilter.key));
        }
        filters.push(where('isRemoved', '==', false));
        const q = query(collection(db, 'posts'), ...filters, orderBy('createdAt', 'desc'));
        return getDocs(q);
      });

      const snaps = await Promise.all(queryPromises);
      let allListings = snaps.flatMap(snap => snap.docs.map(d => ({ id: d.id, ...d.data() })));

      // Sort merged results by date since each suburb's listings arrive independently
      allListings.sort((a, b) => {
        const aTime = a.createdAt?.toDate?.() || new Date(0);
        const bTime = b.createdAt?.toDate?.() || new Date(0);
        return bTime - aTime;
      });
      const blockedIds = profile?.blockedUsers?.map(b => b.uid) || [];
      setListings(blockedIds.length ? allListings.filter(l => !blockedIds.includes(l.authorId)) : allListings);
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  }, [profile, activeFilter]);

  const profileRef = useRef(profile);
  useEffect(() => { profileRef.current = profile; }, [profile]);
  const fetchListingsRef = useRef(fetchListings);
  useEffect(() => { fetchListingsRef.current = fetchListings; }, [fetchListings]);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    fetchListingsRef.current();

    const stored = profileRef.current?.lastVisited?.marketplace;
    setNewCutoff(stored ? (stored.toDate ? stored.toDate() : new Date(stored)) : null);

    return () => {
      updateUserProfile({ lastVisited: { ...(profileRef.current?.lastVisited || {}), marketplace: new Date() } });
    };
  }, []));

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

  const handleToggleSave = async (post) => {
    const saved = post.savedBy?.includes(user.uid) || false;
    const newSaved = !saved;
    setListings(prev => prev.map(p => p.id === post.id ? {
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

  const handleShareExternal = async () => {
    setShowShareModal(false);
    try {
      await Share.share({ message: buildShareText(shareTarget) });
    } catch (e) { console.error(e); }
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
        <Text style={styles.pageTitle}>Buy & Sell</Text>
      </View>
      <View style={styles.tabRow}>
        {FILTERS.map(f => (
          <TouchableOpacity key={f.key} style={[styles.tabBtn, activeFilter.key === f.key && styles.tabBtnActive]} onPress={() => setActiveFilter(f)}>
            <Text style={[styles.tabText, activeFilter.key === f.key && styles.tabTextActive]}>{f.label}</Text>
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
            const typeConf = TYPE_CONFIG[item.marketplaceType] || TYPE_CONFIG.forsale;
            const itemCreatedAt = item.createdAt?.toDate ? item.createdAt.toDate() : (item.createdAt ? new Date(item.createdAt) : null);
            const isNew = newCutoff && itemCreatedAt && itemCreatedAt > newCutoff && item.authorId !== user?.uid;
            return (
              <TouchableOpacity style={styles.card} onPress={() => router.push('/post/' + item.id)}>
                <View style={styles.cardHeader}>
                  <View style={styles.avatar}>
                    {item.authorPhotoURL ? (
                      <Image source={{ uri: item.authorPhotoURL }} style={styles.avatarImage} />
                    ) : (
                      <Text style={styles.avatarText}>{item.authorName?.[0]?.toUpperCase() || '?'}</Text>
                    )}
                  </View>
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
                    <View style={[styles.typeBadge, { backgroundColor: typeConf.bg }]}>
                      <Text style={styles.typeText}>{typeConf.label}</Text>
                    </View>
                  </View>
                </View>
                <View style={styles.cardBody}>
                  <Text style={styles.cardTitle} numberOfLines={2}>{item.content}</Text>
                  {item.description ? <Text style={styles.cardDesc} numberOfLines={2}>{item.description}</Text> : null}
                  {item.marketplaceType === 'forsale' && item.price > 0 && (
                    <Text style={styles.price}>${item.price?.toFixed(2)}</Text>
                  )}
                </View>
                <View style={styles.footer}>
                  <TouchableOpacity style={styles.footerBtn} onPress={() => handleLikeToggle(item)}>
                    <Ionicons name={liked ? 'heart' : 'heart-outline'} size={18} color={liked ? '#E53935' : Colors.charcoal} />
                    <Text style={[styles.footerText, liked && { color: '#E53935' }]}>{item.likeCount || 0}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.footerBtn} onPress={() => router.push('/post/' + item.id)}>
                    <Ionicons name="chatbubble-outline" size={18} color={Colors.charcoal} />
                    <Text style={styles.footerText}>{item.commentCount || 0}</Text>
                  </TouchableOpacity>
                  <View style={{ flex: 1 }} />
                  <TouchableOpacity onPress={() => handleToggleSave(item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name={item.savedBy?.includes(user?.uid) ? 'bookmark' : 'bookmark-outline'} size={18} color={item.savedBy?.includes(user?.uid) ? Colors.brandGreen : Colors.charcoal} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleShare(item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="share-outline" size={18} color={Colors.charcoal} />
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

      <Modal visible={showShareModal} transparent animationType="slide">
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
                  <Text style={styles.shareOptionSubtitle}>Send this listing as a message</Text>
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

      <TouchableOpacity style={styles.fab} onPress={() => router.push({ pathname: '/create-post', params: { category: 'marketplace', preselect: activeFilter.key === 'all' ? 'forsale' : activeFilter.key } })}>
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
  profileAvatarText: { fontSize: 16, fontWeight: '800', color: Colors.brandGreen },
  pageHeader: { backgroundColor: Colors.brandGreenPale, paddingVertical: 10, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: Colors.lightGrey },
  pageTitle: { fontSize: 20, fontWeight: '700', color: Colors.brandGreen },
  tabRow: { flexDirection: 'row', padding: 12, gap: 8, borderBottomWidth: 1, borderBottomColor: Colors.lightGrey },
  tabBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 25, backgroundColor: '#F0F0F0', borderWidth: 1, borderColor: Colors.lightGrey },
  tabBtnActive: { backgroundColor: Colors.brandGreen, borderColor: Colors.brandGreen },
  tabText: { fontSize: 13, color: Colors.midGrey, fontWeight: '800' },
  tabTextActive: { color: Colors.white, fontWeight: '700' },
  list: { padding: 16, gap: 12, paddingBottom: 100 },
  card: {
    borderRadius: 14, borderWidth: 1, borderColor: '#D5D5D5', overflow: 'hidden', backgroundColor: Colors.white,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 2,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#EDF7EF', padding: 14 },
  avatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: Colors.white, borderWidth: 2, borderColor: Colors.brandGreen, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  avatarImage: { width: 30, height: 30, borderRadius: 15 },
  avatarText: { fontSize: 15, fontWeight: '700', color: Colors.brandGreen },
  cardAuthor: { fontSize: 17, fontWeight: '700', color: Colors.charcoal },
  postedText: { fontSize: 12, color: Colors.midGrey, fontStyle: 'italic', marginTop: 2 },
  cardBody: { backgroundColor: Colors.white, padding: 16, gap: 6 },
  cardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 },
  cardTitle: { flex: 1, fontSize: 16, color: Colors.charcoal, fontWeight: '700', lineHeight: 22 },
  cardDesc: { fontSize: 13, color: Colors.midGrey, lineHeight: 18 },
  newBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#FFD700', paddingHorizontal: 9, paddingVertical: 5, borderRadius: 12, borderWidth: 1, borderColor: Colors.brandGreen, marginBottom: 4 },
  newBadgeText: { fontSize: 11, fontWeight: '800', color: Colors.brandGreen, letterSpacing: 0.5 },
  typeBadge: { width: 86, paddingVertical: 5, borderRadius: 20, alignItems: 'center' },
  typeText: { fontSize: 13, fontWeight: '800', color: Colors.white },
  price: { fontSize: 17, fontWeight: '800', color: Colors.brandGreen },
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