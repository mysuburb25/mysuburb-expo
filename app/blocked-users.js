import { View, Text, TouchableOpacity, StyleSheet, FlatList, Alert } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { Colors } from '../constants/theme';

export default function BlockedUsersScreen() {
  const { profile, unblockUser } = useAuth();
  const blockedUsers = profile?.blockedUsers || [];

  const handleUnblock = (blockedUser) => {
    Alert.alert(
      `Unblock ${blockedUser.displayName}?`,
      'They will be able to message you again, and their posts will reappear in your feed.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unblock', onPress: async () => {
            try {
              await unblockUser(blockedUser.uid);
            } catch (e) {
              Alert.alert('Error', 'Could not unblock this user. Please try again.');
            }
          }
        }
      ]
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>Blocked Users</Text>
        <View style={{ width: 40 }} />
      </View>

      <FlatList
        data={blockedUsers}
        keyExtractor={item => item.uid}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{item.displayName?.[0]?.toUpperCase() || '?'}</Text>
            </View>
            <Text style={styles.name} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{item.displayName}</Text>
            <TouchableOpacity style={styles.unblockBtn} onPress={() => handleUnblock(item)}>
              <Text style={styles.unblockBtnText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>Unblock</Text>
            </TouchableOpacity>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="ban-outline" size={48} color={Colors.lightGrey} />
            <Text style={styles.emptyTitle}>No blocked users</Text>
            <Text style={styles.emptyText}>Anyone you block will show up here.</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { backgroundColor: Colors.brandGreen, paddingTop: 56, paddingBottom: 16, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#fff' },
  list: { padding: 16, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.white, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: Colors.lightGrey },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.brandGreenPale, justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: 16, fontWeight: '700', color: Colors.brandGreen },
  name: { flex: 1, fontSize: 15, fontWeight: '600', color: Colors.charcoal },
  unblockBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: Colors.brandGreen },
  unblockBtnText: { fontSize: 13, fontWeight: '700', color: Colors.brandGreen },
  empty: { alignItems: 'center', paddingTop: 80, gap: 8, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: Colors.charcoal },
  emptyText: { fontSize: 14, color: Colors.midGrey, textAlign: 'center' },
});
