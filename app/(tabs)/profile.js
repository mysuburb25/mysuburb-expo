import { useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, RefreshControl, Image } from 'react-native';
import { router } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../../config/firebase';
import { useAuth } from '../../context/AuthContext';
import { Colors } from '../../constants/theme';

const CATEGORY_COLORS = {
  updates:     { bg: Colors.brandGreenPale, text: Colors.brandGreen, label: "What's Happening" },
  notices:     { bg: '#E3F2FD', text: '#0D47A1', label: 'Notice' },
  safety:      { bg: '#FFF3E0', text: '#E65100', label: 'Safety Alert' },
  events:      { bg: '#F3E5F5', text: '#6A1B9A', label: 'Event' },
  marketplace: { bg: Colors.brandGreenPale, text: Colors.brandGreen, label: 'Buy & Sell' },
  lostfound:   { bg: '#FFF3E0', text: '#E65100', label: 'Lost & Found' },
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
  const { user, profile, logout, updateUserProfile } = useAuth();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

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
      Alert.alert('Success', 'Profile photo updated!');
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

  return (
    <View style={styles.container}>
      {/* Fixed top header */}
      <View style={styles.topHeader}>
        <View style={{ width: 36 }} />
        <View style={styles.headerCenter}>
          <Text style={styles.mySuburb}>My Suburb</Text>
          <Text style={styles.suburbName}>{profile?.suburb}, {profile?.state}</Text>
        </View>
        <TouchableOpacity onPress={() => router.push('/(tabs)/notifications')}>
          <Ionicons name="notifications-outline" size={26} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Fixed page header */}
      <View style={styles.pageHeader}>
        <Text style={styles.pageTitle}>Profile</Text>
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
              : <Ionicons name="camera" size={16} color={Colors.white} />
            }
          </View>
        </TouchableOpacity>

        <Text style={styles.name}>{profile?.displayName}</Text>
        <Text style={styles.location}>{profile?.suburb}, {profile?.state}</Text>
        <Text style={styles.email}>{profile?.email}</Text>

        <View style={styles.actions}>
          <TouchableOpacity style={styles.actionBtn} onPress={() => router.push('/(auth)/select-suburb')}>
            <Ionicons name="location-outline" size={16} color={Colors.brandGreen} />
            <Text style={styles.actionText}>Change Suburb</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={() => router.push('/settings')}>
            <Ionicons name="settings-outline" size={16} color={Colors.brandGreen} />
            <Text style={styles.actionText}>Settings</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, styles.actionBtnRed]} onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={16} color="#E53935" />
            <Text style={[styles.actionText, { color: '#E53935' }]}>Sign Out</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Posts section header */}
      <View style={styles.postsSectionHeader}>
        <Text style={styles.sectionTitle}>My Posts ({posts.length})</Text>
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
              <TouchableOpacity style={styles.card} onPress={() => router.push('/post/' + item.id)}>
                {/* Light green category bar at top */}
                <View style={styles.cardHeader}>
                  <View style={{ flex: 1 }} />
                  <View style={[styles.catBadge, { backgroundColor: catStyle.bg }]}>
                    <Text style={[styles.catBadgeText, { color: catStyle.text }]}>{catStyle.label}</Text>
                  </View>
                </View>
                {/* Post content */}
                <Text style={styles.cardContent} numberOfLines={3}>{item.content}</Text>
                {/* Date & time bottom right */}
                <View style={styles.cardFooter}>
                  <View style={{ flex: 1 }} />
                  <Text style={styles.cardMeta}>{formatDate(item.createdAt)}, {formatTime(item.createdAt)}</Text>
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
  container: { flex: 1, backgroundColor: Colors.white },
  topHeader: { backgroundColor: Colors.brandGreen, paddingTop: 56, paddingBottom: 16, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerCenter: { alignItems: 'center' },
  mySuburb: { fontSize: 27, fontWeight: '800', color: Colors.white },
  suburbName: { fontSize: 17, color: '#FFD700', marginTop: 4 },
  pageHeader: { backgroundColor: Colors.brandGreenPale, paddingVertical: 10, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: Colors.lightGrey },
  pageTitle: { fontSize: 20, fontWeight: '700', color: Colors.brandGreen },
  profileSection: { backgroundColor: Colors.white, alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: Colors.lightGrey },
  avatarWrapper: { position: 'relative', marginBottom: 10 },
  avatarLarge: { width: 90, height: 90, borderRadius: 45, backgroundColor: '#FFFFC5', borderWidth: 2, borderColor: Colors.brandGreen, justifyContent: 'center', alignItems: 'center' },
  avatarImage: { width: 90, height: 90, borderRadius: 45, borderWidth: 2, borderColor: Colors.brandGreen },
  avatarText: { fontSize: 36, fontWeight: '800', color: Colors.brandGreen },
  cameraBtn: { position: 'absolute', bottom: 0, right: 0, width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.brandGreen, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: Colors.white },
  name: { fontSize: 22, fontWeight: '800', color: Colors.brandGreen, marginBottom: 2 },
  location: { fontSize: 14, color: Colors.midGrey, marginBottom: 2 },
  email: { fontSize: 13, color: Colors.midGrey, marginBottom: 12 },
  actions: { flexDirection: 'row', gap: 10, flexWrap: 'wrap', justifyContent: 'center' },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: Colors.brandGreen },
  actionBtnRed: { borderColor: '#E53935' },
  actionText: { fontSize: 13, color: Colors.brandGreen, fontWeight: '600' },
  postsSectionHeader: { paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.lightGrey, backgroundColor: Colors.white },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: Colors.brandGreen },
  list: { padding: 16, gap: 10, paddingBottom: 40 },
  card: { backgroundColor: Colors.white, borderRadius: 12, borderWidth: 1, borderColor: Colors.lightGrey, overflow: 'hidden' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.brandGreenPale, paddingHorizontal: 12, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.lightGrey },
  catBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8 },
  catBadgeText: { fontSize: 12, fontWeight: '700' },
  cardContent: { fontSize: 15, color: Colors.charcoal, lineHeight: 22, padding: 12 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingBottom: 10 },
  cardMeta: { fontSize: 11, color: Colors.midGrey },
  empty: { alignItems: 'center', paddingTop: 40, gap: 8 },
  emptyText: { fontSize: 15, color: Colors.midGrey },
});