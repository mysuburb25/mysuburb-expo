import { useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, RefreshControl, Image, Switch } from 'react-native';
import { router } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { collection, query, where, orderBy, getDocs, updateDoc, doc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../../config/firebase';
import { useAuth } from '../../context/AuthContext';
import { Colors } from '../../constants/theme';

const CATEGORY_COLORS = {
  updates:     { bg: Colors.brandGreenPale, text: Colors.brandGreen, label: 'General' },
  notices:     { bg: '#E3F2FD', text: '#0D47A1', label: 'Notice' },
  safety:      { bg: '#FFF3E0', text: '#E65100', label: 'Safety Alert' },
  events:      { bg: '#F3E5F5', text: '#6A1B9A', label: 'Event' },
  marketplace: { bg: Colors.brandGreenPale, text: Colors.brandGreen, label: 'Buy & Sell' },
  lostfound:   { bg: '#FFF3E0', text: '#E65100', label: 'Lost & Found' },
  services:    { bg: Colors.brandGreenPale, text: Colors.brandGreen, label: 'Services' },
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

export default function ProfileScreen() {
  const { user, profile, logout, updateUserProfile, unreadCount, unreadMessageCount } = useAuth();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [showSuburbs, setShowSuburbs] = useState(false);

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
    finally { setLoading(false); setRefreshing(false); }
  }, [user]);

  useFocusEffect(useCallback(() => { setLoading(true); fetchMyPosts(); }, [fetchMyPosts]));

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

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: async () => { await logout(); router.replace('/(auth)/login'); } },
    ]);
  };

  const handleToggleSuburb = async (index) => {
    if (!profile?.suburbs) return;

    // Primary suburb (index 0) is locked — it's where posts are created.
    if (index === 0) {
      Alert.alert(
        'Primary suburb is locked',
        'Your Primary suburb can\'t be turned off. Use "Change Suburb" to replace it, or manage your Second/Third suburbs instead.'
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

  return (
    <View style={styles.container}>
      {/* Fixed top header */}
      <View style={styles.topHeader}>
        <TouchableOpacity onPress={() => router.push('/(tabs)/messages')} style={{ position: 'relative' }}>
          <Ionicons name="chatbubbles-outline" size={26} color="#fff" />
          {unreadMessageCount > 0 && (
            <View style={styles.bellBadge}>
              <Text style={styles.bellBadgeText}>{unreadMessageCount > 9 ? '9+' : unreadMessageCount}</Text>
            </View>
          )}
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.mySuburb}>My Suburb</Text>
          <Text style={styles.suburbName}>{profile?.suburb}, {profile?.state}</Text>
        </View>
        <TouchableOpacity onPress={() => router.push('/(tabs)/notifications')} style={{ position: 'relative' }}>
          <Ionicons name="notifications-outline" size={26} color="#fff" />
          {unreadCount > 0 && (
            <View style={styles.bellBadge}>
              <Text style={styles.bellBadgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* Fixed page header */}
      <View style={styles.pageHeader}>
        <Text style={styles.pageTitle}>Profile</Text>
      </View>

      {/* Fixed profile section — compact horizontal row instead of a tall vertical stack */}
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
          <Text style={styles.name} numberOfLines={1}>{profile?.displayName}</Text>
          <Text style={styles.email} numberOfLines={1}>{profile?.email}</Text>
        </View>

        <View style={styles.actions}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.push('/settings')}>
            <Ionicons name="settings-outline" size={14} color={Colors.brandGreen} />
            <Text style={styles.iconBtnText}>Settings</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.iconBtn, styles.iconBtnRed]} onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={14} color="#E53935" />
            <Text style={[styles.iconBtnText, styles.iconBtnTextRed]}>Sign Out</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* My Suburbs section — tap the bar to expand/collapse, edit icon jumps to Change Suburb */}
      {profile?.suburbs && profile.suburbs.length > 0 && (
        <View style={styles.sectionCard}>
          <TouchableOpacity
            style={styles.sectionCardHeader}
            onPress={() => setShowSuburbs(prev => !prev)}
            activeOpacity={0.85}
          >
            <View style={styles.sectionIconBadge}>
              <Ionicons name="location" size={14} color={Colors.brandGreen} />
            </View>
            <Text style={styles.sectionTitle}>Selected Suburbs</Text>
            <TouchableOpacity
              onPress={() => router.push('/(auth)/select-suburb')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={styles.headerEditBtn}
            >
              <Ionicons name="create-outline" size={18} color={Colors.white} />
            </TouchableOpacity>
            <Ionicons
              name={showSuburbs ? 'chevron-up' : 'chevron-down'}
              size={18}
              color={Colors.white}
              style={styles.postsChevron}
            />
          </TouchableOpacity>

          {showSuburbs && (
            <View style={styles.suburbsSection}>
              <Text style={styles.suburbsSectionSubtitle}>Toggle suburbs to control your feed. Tap the pencil to change a suburb.</Text>
              {profile.suburbs.map((s, index) => (
                index === 0 ? (
                  <TouchableOpacity key={index} style={styles.suburbRow} onPress={() => handleToggleSuburb(index)} activeOpacity={0.6}>
                    <View style={styles.suburbRowLeft}>
                      <View style={styles.suburbNumberBadge}>
                        <Text style={styles.suburbNumberText}>{index + 1}</Text>
                      </View>
                      <Text style={styles.suburbRowText}>{s.suburb}, {s.state}</Text>
                      <TouchableOpacity
                        onPress={() => router.push('/(auth)/select-suburb')}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons name="pencil" size={14} color={Colors.brandGreen} />
                      </TouchableOpacity>
                      <Text style={styles.primaryLabel}>Primary</Text>
                    </View>
                    <Ionicons name="lock-closed" size={20} color={Colors.midGrey} />
                  </TouchableOpacity>
                ) : (
                  <View key={index} style={styles.suburbRow}>
                    <View style={styles.suburbRowLeft}>
                      <View style={styles.suburbNumberBadge}>
                        <Text style={styles.suburbNumberText}>{index + 1}</Text>
                      </View>
                      <Text style={styles.suburbRowText}>{s.suburb}, {s.state}</Text>
                      <TouchableOpacity
                        onPress={() => router.push('/(auth)/select-suburb')}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons name="pencil" size={14} color={Colors.brandGreen} />
                      </TouchableOpacity>
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
        </View>
      )}

      {/* Posts section header */}
      <View style={[styles.sectionCard, styles.postsHeaderCard]}>
        <View style={[styles.sectionCardHeader, { borderBottomLeftRadius: 18, borderBottomRightRadius: 18 }]}>
          <View style={styles.sectionIconBadge}>
            <Ionicons name="document-text" size={14} color={Colors.brandGreen} />
          </View>
          <Text style={styles.sectionTitle}>My Posts</Text>
        </View>
      </View>

      {/* Scrollable posts list */}
      {loading ? (
        <ActivityIndicator color={Colors.brandGreen} style={{ marginTop: 20 }} />
      ) : (
        <FlatList
          data={posts}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchMyPosts(); }} tintColor={Colors.brandGreen} />}
          renderItem={({ item }) => {
            const catStyle = CATEGORY_COLORS[item.category] || CATEGORY_COLORS.updates;
            return (
              <TouchableOpacity
                style={[styles.card, { borderLeftColor: catStyle.text, borderLeftWidth: 4 }]}
                onPress={() => router.push('/post/' + item.id)}
                activeOpacity={0.85}
              >
                {/* Card header with category badge and delete button */}
                <View style={styles.cardHeader}>
                  <View style={[styles.catBadge, { backgroundColor: catStyle.bg }]}>
                    <Text style={[styles.catBadgeText, { color: catStyle.text }]}>{catStyle.label}</Text>
                  </View>
                  <View style={{ flex: 1 }} />
                  <TouchableOpacity
                    style={styles.deleteBtn}
                    onPress={() => handleDeletePost(item.id)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="trash-outline" size={16} color="#E53935" />
                  </TouchableOpacity>
                </View>
                {/* Content truncates on the left; timestamp stays fixed and fully visible on the right */}
                <View style={styles.cardOneLineRow}>
                  <Text style={styles.cardOneLine} numberOfLines={1} ellipsizeMode="tail">{item.content}</Text>
                  <Text style={styles.cardMetaInline}>{formatDate(item.createdAt)}, {formatTime(item.createdAt)}</Text>
                </View>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="document-outline" size={48} color={Colors.lightGrey} />
              <Text style={styles.emptyText}>No posts yet</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F2F2' },
  topHeader: { backgroundColor: Colors.brandGreen, paddingTop: 56, paddingBottom: 16, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerCenter: { alignItems: 'center' },
  mySuburb: { fontSize: 27, fontWeight: '800', color: Colors.white },
  suburbName: { fontSize: 17, color: '#FFD700', marginTop: 4 },
  bellBadge: { position: 'absolute', top: -4, right: -4, backgroundColor: '#E53935', borderRadius: 8, minWidth: 16, height: 16, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 3 },
  bellBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  pageHeader: { backgroundColor: Colors.brandGreenPale, paddingVertical: 10, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: Colors.lightGrey },
  pageTitle: { fontSize: 21, fontWeight: '700', color: Colors.brandGreen },
  profileSection: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, gap: 12 },
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

  // Card wrapper shared by "Selected Suburbs" and "My Posts" headers
  sectionCard: {
    backgroundColor: Colors.white, marginHorizontal: 16, marginBottom: 12, borderRadius: 18, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 3,
  },
  postsHeaderCard: { paddingVertical: 2 },
  sectionCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, paddingHorizontal: 16, backgroundColor: Colors.brandGreen, borderTopLeftRadius: 18, borderTopRightRadius: 18 },
  sectionIconBadge: { width: 24, height: 24, borderRadius: 12, backgroundColor: Colors.white, justifyContent: 'center', alignItems: 'center', marginRight: 8 },
  postsChevron: { marginLeft: 8 },
  headerEditBtn: { marginLeft: 10, padding: 2 },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: Colors.white, textAlign: 'center' },

  suburbsSection: { paddingHorizontal: 16, paddingBottom: 14, paddingTop: 4, borderTopWidth: 1, borderTopColor: '#F0F0F0' },
  suburbsSectionSubtitle: { fontSize: 12, color: Colors.midGrey, marginBottom: 10 },
  suburbRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
  suburbRowLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  suburbNumberBadge: { width: 20, height: 20, borderRadius: 10, backgroundColor: Colors.brandGreenPale, justifyContent: 'center', alignItems: 'center' },
  suburbNumberText: { fontSize: 12, fontWeight: '900', color: Colors.brandGreen },
  suburbRowText: { fontSize: 14, color: Colors.charcoal, fontWeight: '500' },
  primaryLabel: { fontSize: 11, color: Colors.brandGreen, fontWeight: '700', backgroundColor: '#FFD700', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },

  list: { paddingHorizontal: 16, paddingBottom: 40, gap: 12 },
  card: {
    backgroundColor: Colors.white, borderRadius: 16, overflow: 'hidden',
    borderWidth: 1, borderColor: Colors.brandGreen + '40',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 2,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingTop: 12, paddingBottom: 4 },
  catBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  catBadgeText: { fontSize: 11, fontWeight: '700' },
  deleteBtn: { padding: 4 },
  cardContent: { fontSize: 15, color: Colors.charcoal, lineHeight: 22, padding: 12 },
  cardOneLineRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingTop: 4, paddingBottom: 14 },
  cardOneLine: { flex: 1, fontSize: 15, color: Colors.charcoal, fontWeight: '500' },
  cardMetaInline: { fontSize: 11, color: Colors.midGrey, fontWeight: '600', flexShrink: 0 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingBottom: 10 },
  cardMeta: { fontSize: 11, color: Colors.midGrey },
  empty: { alignItems: 'center', paddingTop: 40, gap: 8 },
  emptyText: { fontSize: 15, color: Colors.midGrey },
});