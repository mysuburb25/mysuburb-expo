import { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../context/AuthContext';
import { Colors } from '../../constants/theme';

export default function ProfileScreen() {
  const { user, profile, logout } = useAuth();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { if (user) fetchMyPosts(); }, [user]);

  const fetchMyPosts = async () => {
    try {
      const q = query(collection(db, 'posts'), where('authorId', '==', user.uid), where('isRemoved', '==', false), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      setPosts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: async () => { await logout(); router.replace('/(auth)/login'); } },
    ]);
  };

  return (
    <FlatList
      data={posts}
      keyExtractor={item => item.id}
      contentContainerStyle={styles.list}
      renderItem={({ item }) => (
        <TouchableOpacity style={styles.card} onPress={() => router.push('/post/' + item.id)}>
          <Text style={styles.cardContent} numberOfLines={3}>{item.content}</Text>
          <View style={styles.cardFooter}>
            <Text style={styles.cardCategory}>{item.category?.toUpperCase()}</Text>
          </View>
        </TouchableOpacity>
      )}
      ListHeaderComponent={
        <View>
          <View style={styles.topHeader}>
            <View style={{ width: 36 }} />
            <View style={styles.headerCenter}>
              <Text style={styles.mySuburb}>My Suburb</Text>
            </View>
            <TouchableOpacity onPress={() => router.push('/(tabs)/notifications')}>
              <Ionicons name="notifications-outline" size={24} color="#fff" />
            </TouchableOpacity>
          </View>
          <View style={styles.pageHeader}>
            <Text style={styles.pageTitle}>Profile</Text>
          </View>
          <View style={styles.profileSection}>
            <View style={styles.avatarLarge}>
              <Text style={styles.avatarText}>{profile?.displayName?.[0]?.toUpperCase() || '?'}</Text>
            </View>
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
            </View>
          </View>
          <Text style={styles.sectionTitle}>My Posts ({posts.length})</Text>
          {loading && <ActivityIndicator color={Colors.brandGreen} style={{ marginTop: 20 }} />}
        </View>
      }
      ListEmptyComponent={
        !loading && (
          <View style={styles.empty}>
            <Ionicons name="document-outline" size={48} color={Colors.lightGrey} />
            <Text style={styles.emptyText}>No posts yet</Text>
          </View>
        )
      }
      ListFooterComponent={
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={18} color="#E53935" />
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>
      }
    />
  );
}

const styles = StyleSheet.create({
  list: { paddingBottom: 40, backgroundColor: Colors.white },
  topHeader: { backgroundColor: Colors.brandGreen, paddingTop: 56, paddingBottom: 16, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerCenter: { alignItems: 'center' },
  mySuburb: { fontSize: 27, fontWeight: '800', color: Colors.white },
  pageHeader: { backgroundColor: Colors.brandGreenPale, paddingVertical: 10, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: Colors.lightGrey },
  pageTitle: { fontSize: 20, fontWeight: '700', color: Colors.brandGreen },
  profileSection: { backgroundColor: Colors.white, alignItems: 'center', padding: 24, borderBottomWidth: 1, borderBottomColor: Colors.lightGrey },
  avatarLarge: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#FFFFC5', borderWidth: 2, borderColor: Colors.brandGreen, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  avatarText: { fontSize: 32, fontWeight: '800', color: Colors.brandGreen },
  name: { fontSize: 22, fontWeight: '800', color: Colors.brandGreen, marginBottom: 4 },
  location: { fontSize: 14, color: Colors.midGrey, marginBottom: 2 },
  email: { fontSize: 13, color: Colors.midGrey, marginBottom: 16 },
  actions: { flexDirection: 'row', gap: 12, flexWrap: 'wrap', justifyContent: 'center' },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: Colors.brandGreen },
  actionText: { fontSize: 13, color: Colors.brandGreen, fontWeight: '600' },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: Colors.brandGreen, padding: 16, paddingBottom: 8 },
  card: { backgroundColor: Colors.white, borderRadius: 12, padding: 14, marginHorizontal: 16, marginBottom: 10, borderWidth: 1, borderColor: Colors.lightGrey },
  cardContent: { fontSize: 15, color: Colors.charcoal, lineHeight: 22, marginBottom: 8 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between' },
  cardCategory: { fontSize: 11, fontWeight: '700', color: Colors.brandGreen },
  empty: { alignItems: 'center', paddingTop: 40, gap: 8 },
  emptyText: { fontSize: 15, color: Colors.midGrey },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, margin: 24, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#E53935' },
  logoutText: { fontSize: 15, color: '#E53935', fontWeight: '600' },
});