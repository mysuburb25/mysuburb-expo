import { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, RefreshControl, Image, Switch, Modal } from 'react-native';
import { router } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { collection, query, where, orderBy, getDocs, updateDoc, doc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../../config/firebase';
import { useAuth } from '../../context/AuthContext';
import { Colors } from '../../constants/theme';
import AppName from '../../components/AppName';

const CATEGORY_COLORS = {
  updates:     { bg: Colors.brandGreenPale, text: Colors.brandGreen, label: 'General' },
  notices:     { bg: '#E3F2FD', text: '#0D47A1', label: 'Notice' },
  safety:      { bg: '#FFF3E0', text: '#E65100', label: 'Alert' },
  events:      { bg: '#F3E5F5', text: '#6A1B9A', label: 'Event' },
  marketplace: { bg: Colors.brandGreenPale, text: Colors.brandGreen, label: 'Buy & Sell' },
  lostfound:   { bg: '#FFF3E0', text: '#E65100', label: 'Lost & Found' },
  services:    { bg: Colors.brandGreenPale, text: Colors.brandGreen, label: 'Services' },
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

export default function ProfileScreen() {
  const { user, profile, logout, updateUserProfile, unreadMessageCount, unreadCount, reloadProfile } = useAuth();
  const [posts, setPosts] = useState([]);
  const [savedPosts, setSavedPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingSaved, setLoadingSaved] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [activeTab, setActiveTab] = useState('suburbs'); // 'suburbs' | 'posts' | 'saved'

  const fetchMyPosts = useCallback(async () => {
    if (!user) return;
    try {
      const q = query(
        collection(db, 'posts'),
        where('authorId', '==', user.uid),
        where('isRemoved', '==', false),
        orderBy('createdAt', 'desc')
      );
      const snap = await getDocs(q);
      setPosts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [user]);

  const fetchSavedPosts = useCallback(async () => {
    if (!user) return;
    try {
      const q = query(
        collection(db, 'posts'),
        where('savedBy', 'array-contains', user.uid),
        where('isRemoved', '==', false),
        orderBy('createdAt', 'desc')
      );
      const snap = await getDocs(q);
      setSavedPosts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error(e); }
    finally { setLoadingSaved(false); }
  }, [user]);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    setLoadingSaved(true);
    fetchMyPosts();
    fetchSavedPosts();
  }, [fetchMyPosts, fetchSavedPosts]));

  // Pulling to refresh now also re-fetches the profile itself (not just
  // posts) — otherwise a change made elsewhere (e.g. an admin toggling
  // isAdmin/isSuspended directly in Firestore, or another device updating
  // your profile) would never show up here without a full sign-out/in,
  // since AuthContext only loads the profile once at login rather than
  // keeping a live listener on it.
  const handleRefresh = () => {
    setRefreshing(true);
    Promise.all([fetchMyPosts(), fetchSavedPosts(), reloadProfile()]).finally(() => setRefreshing(false));
  };

  const handlePickPhoto = async () => {
    Alert.alert('Profile Photo', 'Choose an option', [
      {
        text: 'Take Photo',
        onPress: async () => {
          const { status } = await ImagePicker.requestCameraPermissionsAsync();
          if (status !== 'granted') { Alert.alert('Permission needed', 'Please allow camera access.'); return; }
          const result = await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.7 });
          if (!result.canceled) uploadPhoto(result.assets[0].uri);
        },
      },
      {
        text: 'Choose from Library',
        onPress: async () => {
          const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (status !== 'granted') { Alert.alert('Permission needed', 'Please allow photo library access.'); return; }
          const result = await ImagePicker.launchImageLibraryAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.7, mediaTypes: ImagePicker.MediaTypeOptions.Images });
          if (!result.canceled) uploadPhoto(result.assets[0].uri);
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const uploadPhoto = async (uri) => {
    setUploadingPhoto(true);
    try {
      const response = await fetch(uri);
      const blob = await response.blob();
      const storageRef = ref(storage, `profilePhotos/${user.uid}.jpg`);
      await uploadBytes(storageRef, blob);
      const downloadURL = await getDownloadURL(storageRef);
      await updateUserProfile({ photoURL: downloadURL });
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Failed to upload photo. Please try again.');
    } finally { setUploadingPhoto(false); }
  };

  const [showSignOutModal, setShowSignOutModal] = useState(false);

  const handleLogout = () => {
    setShowSignOutModal(true);
  };

  const confirmLogout = async () => {
    setShowSignOutModal(false);
    await logout();
    router.replace('/(auth)/login');
  };

  const handleToggleSuburb = async (index) => {
    if (!profile?.suburbs) return;

    // Primary suburb (index 0) is locked — it's where posts are created.
    if (index === 0) {
      Alert.alert(
        'Primary suburb is locked',
        'Your Primary suburb can\'t be turned off. Use "Change Suburb" to replace it, or manage your other suburbs instead.'
      );
      return;
    }

    const updated = profile.suburbs.map((s, i) =>
      i === index ? { ...s, active: !s.active } : s
    );
    const activeSuburbKeys = updated
      .filter(s => s.active)
      .map(s => `${s.state}|${s.suburb}`);
    await updateUserProfile({ suburbs: updated, activeSuburbKeys });
  };

  const handleDeletePost = (postId) => {
    Alert.alert('Delete Post', 'Are you sure you want to delete this post?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            await updateDoc(doc(db, 'posts', postId), { isRemoved: true });
            setPosts(prev => prev.filter(p => p.id !== postId));
          } catch (e) { Alert.alert('Error', e.message); }
        }
      }
    ]);
  };

  const handleUnsave = async (post) => {
    setSavedPosts(prev => prev.filter(p => p.id !== post.id));
    try {
      await updateDoc(doc(db, 'posts', post.id), {
        savedBy: (post.savedBy || []).filter(uid => uid !== user.uid),
      });
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Could not remove from saved. Please try again.');
      fetchSavedPosts();
    }
  };

  const renderPostCard = (item, { onDelete, onUnsave }) => {
    const catStyle = CATEGORY_COLORS[item.category] || CATEGORY_COLORS.updates;
    return (
      <TouchableOpacity
        key={item.id}
        style={[styles.card, { borderLeftColor: catStyle.text, borderLeftWidth: 4 }]}
        onPress={() => router.push('/post/' + item.id)}
        activeOpacity={0.85}
      >
        <View style={styles.cardHeader}>
          <View style={[styles.catBadge, { backgroundColor: catStyle.bg }]}>
            <Text style={[styles.catBadgeText, { color: catStyle.text }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{catStyle.label}</Text>
          </View>
          <View style={{ flex: 1 }} />
          {onDelete && (
            <TouchableOpacity style={styles.deleteBtn} onPress={onDelete} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="trash-outline" size={16} color="#E53935" />
            </TouchableOpacity>
          )}
          {onUnsave && (
            <TouchableOpacity style={styles.deleteBtn} onPress={onUnsave} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="bookmark" size={16} color={Colors.brandGreen} />
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.cardOneLineRow}>
          <Text style={styles.cardOneLine} numberOfLines={1} ellipsizeMode="tail">{item.content}</Text>
          <Text style={styles.cardMetaInline}>{formatDate(item.createdAt)}, {formatTime(item.createdAt)}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Fixed top header */}
      <View style={styles.topHeader}>
        <TouchableOpacity onPress={() => router.push('/settings')}>
          <Ionicons name="settings-outline" size={28} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <AppName style={styles.mySuburb} />
          <Text style={styles.suburbName} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{profile?.suburb}, {profile?.state}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          <TouchableOpacity onPress={() => router.push('/(tabs)/messages')} style={{ position: 'relative' }}>
            <Ionicons name="chatbubbles-outline" size={26} color="#fff" />
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

      {/* Fixed page header */}
      <View style={styles.pageHeader}>
        <TouchableOpacity onPress={() => router.push('/settings')} style={styles.settingsShortcut}>
          <Ionicons name="settings-outline" size={21} color={Colors.brandGreen} />
        </TouchableOpacity>
        <Text style={styles.pageTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>Profile</Text>
        <TouchableOpacity onPress={() => router.push('/dashboard')} style={styles.dashboardShortcut}>
          <Ionicons name="grid-outline" size={21} color={Colors.brandGreen} />
        </TouchableOpacity>
      </View>

      {/* Fixed profile section */}
      <View style={styles.profileSection}>
        <TouchableOpacity style={styles.avatarWrapper} onPress={handlePickPhoto} disabled={uploadingPhoto}>
          {profile?.photoURL ? (
            <Image source={{ uri: profile.photoURL }} style={styles.avatarImage} />
          ) : (
            <View style={styles.avatarLarge}>
              <Text style={styles.avatarText}>{profile?.displayName?.[0]?.toUpperCase() || '?'}</Text>
            </View>
          )}
          <View style={styles.cameraBtn}>
            {uploadingPhoto
              ? <ActivityIndicator size="small" color={Colors.white} />
              : <Ionicons name="camera" size={12} color={Colors.white} />
            }
          </View>
        </TouchableOpacity>

        <View style={styles.profileInfo}>
          <Text style={styles.name} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{profile?.displayName}</Text>
          <Text style={styles.email} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{profile?.email}</Text>
        </View>

        <View style={styles.actions}>
          <TouchableOpacity style={[styles.iconBtn, styles.iconBtnRed]} onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={14} color="#E53935" />
            <Text style={[styles.iconBtnText, styles.iconBtnTextRed]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>Sign Out</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.dashboardRow}>
        <View style={styles.dashboardRowLeft}>
          <Ionicons name="grid-outline" size={20} color={Colors.brandGreen} />
          <Text style={styles.dashboardRowLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>Dashboard</Text>
          <TouchableOpacity style={styles.dashboardViewBtn} onPress={() => router.push('/dashboard')}>
            <Text style={styles.dashboardViewBtnText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>View Now</Text>
          </TouchableOpacity>
        </View>
        <Switch
          value={!profile?.skipDashboard}
          onValueChange={(v) => updateUserProfile({ skipDashboard: !v })}
          trackColor={{ false: Colors.lightGrey, true: Colors.brandGreen }}
          thumbColor={Colors.white}
          ios_backgroundColor={Colors.lightGrey}
        />
      </View>

      {/* Only ever visible to accounts with isAdmin: true on their Firestore
          user doc — a field no user can set on themselves, by design (see
          firestore.rules). Regular users never see this row at all. */}
      {profile?.isAdmin && (
        <TouchableOpacity style={styles.adminRow} onPress={() => router.push('/admin-dashboard')}>
          <View style={styles.dashboardRowLeft}>
            <Ionicons name="shield-checkmark-outline" size={20} color="#1B4F72" />
            <Text style={styles.adminRowLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>Admin Dashboard</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#1B4F72" />
        </TouchableOpacity>
      )}

      {/* 3-way tab bar — only the selected tab's content shows below */}
      <View style={styles.tabRow}>
        <TouchableOpacity style={[styles.tabBtn, activeTab === 'suburbs' && styles.tabBtnActive]} onPress={() => setActiveTab('suburbs')}>
          <Text
            style={[styles.tabText, activeTab === 'suburbs' && styles.tabTextActive]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
          >
            Suburbs
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tabBtn, activeTab === 'posts' && styles.tabBtnActive]} onPress={() => setActiveTab('posts')}>
          <Text
            style={[styles.tabText, activeTab === 'posts' && styles.tabTextActive]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
          >
            My Posts
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tabBtn, activeTab === 'saved' && styles.tabBtnActive]} onPress={() => setActiveTab('saved')}>
          <Text
            style={[styles.tabText, activeTab === 'saved' && styles.tabTextActive]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
          >
            Saved
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={Colors.brandGreen} />}
      >
        {/* Suburbs tab */}
        {activeTab === 'suburbs' && profile?.suburbs && profile.suburbs.length > 0 && (
          <View style={styles.tabContent}>
            <View style={styles.tabContentHeader}>
              <Text style={styles.tabContentSubtitle}>Toggle suburbs to control your feed.</Text>
              <TouchableOpacity
                onPress={() => router.push('/(auth)/select-suburb')}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="create-outline" size={24} color={Colors.brandGreen} />
              </TouchableOpacity>
            </View>
            {profile.suburbs.map((s, index) => (
              index === 0 ? (
                <TouchableOpacity key={index} style={styles.suburbRow} onPress={() => handleToggleSuburb(index)} activeOpacity={0.6}>
                  <View style={styles.suburbRowLeft}>
                    <View style={styles.suburbNumberBadge}>
                      <Text style={styles.suburbNumberText}>{index + 1}</Text>
                    </View>
                    <Text style={styles.suburbRowText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{s.suburb}, {s.state}</Text>
                    <Text style={styles.primaryLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>Primary</Text>
                  </View>
                  <Ionicons name="lock-closed" size={20} color={Colors.midGrey} />
                </TouchableOpacity>
              ) : (
                <View key={index} style={styles.suburbRow}>
                  <View style={styles.suburbRowLeft}>
                    <View style={styles.suburbNumberBadge}>
                      <Text style={styles.suburbNumberText}>{index + 1}</Text>
                    </View>
                    <Text style={styles.suburbRowText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{s.suburb}, {s.state}</Text>
                  </View>
                  <Switch
                    value={s.active}
                    onValueChange={() => handleToggleSuburb(index)}
                    trackColor={{ false: Colors.lightGrey, true: Colors.brandGreen }}
                    thumbColor={Colors.white}
                    ios_backgroundColor={Colors.lightGrey}
                  />
                </View>
              )
            ))}
          </View>
        )}

        {/* My Posts tab */}
        {activeTab === 'posts' && (
          <View style={styles.list}>
            {loading ? (
              <ActivityIndicator color={Colors.brandGreen} style={{ marginTop: 20 }} />
            ) : posts.length === 0 ? (
              <View style={styles.empty}>
                <Ionicons name="document-outline" size={48} color={Colors.lightGrey} />
                <Text style={styles.emptyText}>No posts yet</Text>
              </View>
            ) : (
              posts.map(item => renderPostCard(item, { onDelete: () => handleDeletePost(item.id) }))
            )}
          </View>
        )}

        {/* Saved Posts tab */}
        {activeTab === 'saved' && (
          <View style={styles.list}>
            {loadingSaved ? (
              <ActivityIndicator color={Colors.brandGreen} style={{ marginTop: 20 }} />
            ) : savedPosts.length === 0 ? (
              <View style={styles.empty}>
                <Ionicons name="bookmark-outline" size={48} color={Colors.lightGrey} />
                <Text style={styles.emptyText}>No saved posts yet</Text>
              </View>
            ) : (
              savedPosts.map(item => renderPostCard(item, { onUnsave: () => handleUnsave(item) }))
            )}
          </View>
        )}
      </ScrollView>

      <Modal visible={showSignOutModal} transparent animationType="fade">
        <View style={styles.centerOverlay}>
          <View style={styles.confirmCard}>
            <View style={styles.confirmIconCircle}>
              <Ionicons name="log-out-outline" size={28} color="#E53935" />
            </View>
            <Text style={styles.confirmTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>Sign Out</Text>
            <Text style={styles.confirmMessage}>Are you sure you want to sign out?</Text>
            <View style={styles.confirmBtnRow}>
              <TouchableOpacity style={styles.confirmCancelBtn} onPress={() => setShowSignOutModal(false)}>
                <Text style={styles.confirmCancelBtnText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmSignOutBtn} onPress={confirmLogout}>
                <Text style={styles.confirmSignOutBtnText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>Sign Out</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F2F2' },
  topHeader: { backgroundColor: Colors.brandGreen, paddingTop: 56, paddingBottom: 16, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerCenter: { alignItems: 'center', marginLeft: 8 },
  mySuburb: { fontSize: 27, fontWeight: '800', color: Colors.white },
  suburbName: { fontSize: 17, color: '#FFD700', marginTop: 4 },
  bellBadge: { position: 'absolute', top: -4, right: -4, backgroundColor: '#E53935', borderRadius: 8, minWidth: 16, height: 16, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 3 },
  bellBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  pageHeader: { backgroundColor: Colors.brandGreenPale, paddingVertical: 10, paddingHorizontal: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: Colors.lightGrey },
  settingsShortcut: { padding: 4 },
  dashboardShortcut: { padding: 4 },
  pageTitle: { fontSize: 21, fontWeight: '700', color: Colors.brandGreen },
  profileSection: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, gap: 12, backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.lightGrey },
  avatarWrapper: { position: 'relative' },
  avatarLarge: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#FFFFC5', borderWidth: 2, borderColor: Colors.brandGreen, justifyContent: 'center', alignItems: 'center' },
  avatarImage: { width: 56, height: 56, borderRadius: 28, borderWidth: 2, borderColor: Colors.brandGreen },
  avatarText: { fontSize: 22, fontWeight: '800', color: Colors.brandGreen },
  cameraBtn: { position: 'absolute', bottom: -2, right: -2, width: 20, height: 20, borderRadius: 10, backgroundColor: Colors.brandGreen, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#F2F2F2' },
  profileInfo: { flex: 1, minWidth: 0, marginRight: 6 },
  name: { fontSize: 16, fontWeight: '800', color: Colors.brandGreen },
  email: { fontSize: 11, color: Colors.midGrey, marginTop: 1 },
  actions: { flexDirection: 'row', gap: 6 },
  iconBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, backgroundColor: Colors.brandGreenPale, borderWidth: 1.2, borderColor: Colors.brandGreen },
  iconBtnRed: { backgroundColor: '#FCE8E7', borderColor: '#E53935' },
  iconBtnText: { fontSize: 11, fontWeight: '700', color: Colors.brandGreen },
  iconBtnTextRed: { color: '#E53935' },

  dashboardRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.lightGrey },
  dashboardRowLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  dashboardRowLabel: { fontSize: 17, fontWeight: '600', color: Colors.charcoal },
  dashboardViewBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, backgroundColor: Colors.brandGreenPale, borderWidth: 1, borderColor: Colors.brandGreen },
  dashboardViewBtnText: { fontSize: 12, fontWeight: '700', color: Colors.brandGreen },
  adminRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#C2D9E8', borderBottomWidth: 1, borderBottomColor: Colors.lightGrey },
  adminRowLabel: { fontSize: 17, fontWeight: '700', color: '#1B4F72' },
  tabRow: { flexDirection: 'row', padding: 12, gap: 10, backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.lightGrey },
  tabBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 25, backgroundColor: '#F0F0F0', borderWidth: 1, borderColor: Colors.lightGrey },
  tabBtnActive: { backgroundColor: Colors.brandGreen, borderColor: Colors.brandGreen },
  tabText: { fontSize: 15, color: Colors.midGrey, fontWeight: '600' },
  tabTextActive: { color: Colors.white, fontWeight: '700' },

  tabContent: { backgroundColor: Colors.white, marginHorizontal: 16, marginTop: 16, marginBottom: 12, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: '#D5D5D5' },
  tabContentHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  tabContentSubtitle: { fontSize: 12, color: Colors.midGrey, flex: 1 },
  suburbRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
  suburbRowLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  suburbNumberBadge: { width: 20, height: 20, borderRadius: 10, backgroundColor: Colors.brandGreenPale, justifyContent: 'center', alignItems: 'center' },
  suburbNumberText: { fontSize: 12, fontWeight: '900', color: Colors.brandGreen },
  suburbRowText: { fontSize: 14, color: Colors.charcoal, fontWeight: '500' },
  primaryLabel: { fontSize: 11, color: Colors.brandGreen, fontWeight: '700', backgroundColor: '#FFD700', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },

  list: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 16, gap: 12 },
  card: {
    backgroundColor: Colors.white, borderRadius: 16, overflow: 'hidden',
    borderWidth: 1, borderColor: '#D5D5D5',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 2,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingTop: 12, paddingBottom: 4 },
  catBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  catBadgeText: { fontSize: 11, fontWeight: '700' },
  deleteBtn: { padding: 4 },
  cardOneLineRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingTop: 4, paddingBottom: 14 },
  cardOneLine: { flex: 1, fontSize: 15, color: Colors.charcoal, fontWeight: '500' },
  cardMetaInline: { fontSize: 11, color: Colors.midGrey, fontWeight: '600', flexShrink: 0 },
  empty: { alignItems: 'center', paddingTop: 40, gap: 8 },
  emptyText: { fontSize: 15, color: Colors.midGrey },
  centerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', padding: 32 },
  confirmCard: { backgroundColor: Colors.white, borderRadius: 20, padding: 26, alignItems: 'center', width: '100%', maxWidth: 340 },
  confirmIconCircle: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#FCE8E7', justifyContent: 'center', alignItems: 'center', marginBottom: 14 },
  confirmTitle: { fontSize: 19, fontWeight: '800', color: Colors.charcoal, marginBottom: 6 },
  confirmMessage: { fontSize: 14, color: Colors.midGrey, textAlign: 'center', marginBottom: 20 },
  confirmBtnRow: { flexDirection: 'row', gap: 10, width: '100%' },
  confirmCancelBtn: { flex: 1, paddingVertical: 13, borderRadius: 14, alignItems: 'center', backgroundColor: '#F0F0F0' },
  confirmCancelBtnText: { fontSize: 15, fontWeight: '700', color: Colors.charcoal },
  confirmSignOutBtn: { flex: 1, paddingVertical: 13, borderRadius: 14, alignItems: 'center', backgroundColor: '#E53935' },
  confirmSignOutBtnText: { fontSize: 15, fontWeight: '700', color: Colors.white },
});