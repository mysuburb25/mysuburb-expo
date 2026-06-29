import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { Colors } from '../constants/theme';

export default function SettingsScreen() {
  const { logout } = useAuth();

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: async () => { await logout(); router.replace('/(auth)/login'); } },
    ]);
  };

  const MenuItem = ({ icon, label, onPress, danger }) => (
    <TouchableOpacity style={styles.menuItem} onPress={onPress}>
      <Ionicons name={icon} size={20} color={danger ? '#E53935' : Colors.brandGreen} />
      <Text style={[styles.menuLabel, danger && { color: '#E53935' }]}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color={Colors.midGrey} />
    </TouchableOpacity>
  );

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.title}>Settings</Text>
        <View style={{ width: 40 }} />
      </View>

      <Text style={styles.sectionLabel}>Account</Text>
      <View style={styles.section}>
        <MenuItem icon="location-outline" label="Change Suburb" onPress={() => router.push('/(auth)/select-suburb')} />
        <MenuItem icon="lock-closed-outline" label="Change Password" onPress={() => router.push('/change-password')} />
        <MenuItem icon="notifications-outline" label="Notification Preferences" onPress={() => router.push('/notification-preferences')} />
      </View>

      <Text style={styles.sectionLabel}>Legal</Text>
      <View style={styles.section}>
        <MenuItem icon="document-text-outline" label="Privacy Policy" onPress={() => router.push('/privacy-policy')} />
        <MenuItem icon="reader-outline" label="Terms of Service" onPress={() => router.push('/terms-of-service')} />
        <MenuItem icon="people-outline" label="Community Guidelines" onPress={() => router.push('/community-guidelines')} />
      </View>

      <Text style={styles.sectionLabel}>Support</Text>
      <View style={styles.section}>
        <MenuItem icon="help-circle-outline" label="Help and FAQ" onPress={() => router.push('/help-faq')} />
        <MenuItem icon="flag-outline" label="Report a Problem" onPress={() => router.push('/report-problem')} />
        <MenuItem icon="information-circle-outline" label="About My Suburb" onPress={() => Alert.alert('My Suburb', 'Version 1.0.0 - Built for Australian communities.')} />
      </View>

      <Text style={styles.sectionLabel}>Account Actions</Text>
      <View style={styles.section}>
        <MenuItem icon="log-out-outline" label="Sign Out" onPress={handleLogout} danger />
        <MenuItem icon="trash-outline" label="Delete Account" onPress={() => Alert.alert('Delete Account', 'To delete your account please contact support@mysuburb.com.au')} danger />
      </View>

      <Text style={styles.version}>My Suburb v1.0.0 - Made with love in Australia</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { backgroundColor: Colors.brandGreen, paddingTop: 56, paddingBottom: 16, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  title: { fontSize: 20, fontWeight: '800', color: '#fff' },
  sectionLabel: { fontSize: 14, fontWeight: '700', color: Colors.brandGreen, paddingHorizontal: 16, paddingVertical: 9, backgroundColor: Colors.brandGreenPale, borderTopWidth: 0.5, borderBottomWidth: 0.5, borderColor: '#c8e6c9', marginTop: 8 },
  section: { backgroundColor: Colors.white, borderTopWidth: 0.5, borderBottomWidth: 0.5, borderColor: Colors.lightGrey },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: Colors.lightGrey },
  menuLabel: { flex: 1, fontSize: 15, color: Colors.charcoal },
  version: { textAlign: 'center', fontSize: 13, color: Colors.midGrey, padding: 24 },
});