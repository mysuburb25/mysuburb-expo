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
      <Ionicons name={icon} size={20} color={danger ? Colors.terracotta : Colors.charcoal} />
      <Text style={[styles.menuLabel, danger && { color: Colors.terracotta }]}>{label}</Text>
      <Ionicons name="chevron-forward" size={16} color={Colors.midGrey} />
    </TouchableOpacity>
  );

  return (
    <ScrollView style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account</Text>
        <MenuItem icon="location-outline" label="Change Suburb" onPress={() => router.push('/(auth)/select-suburb')} />
      </View>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>About</Text>
        <MenuItem icon="information-circle-outline" label="About My Suburb" onPress={() => {}} />
        <MenuItem icon="shield-outline" label="Privacy Policy" onPress={() => {}} />
      </View>
      <View style={styles.section}>
        <MenuItem icon="log-out-outline" label="Sign Out" onPress={handleLogout} danger />
      </View>
      <Text style={styles.version}>My Suburb v1.0.0</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.sand },
  section: { backgroundColor: Colors.white, marginTop: 16, borderTopWidth: 1, borderBottomWidth: 1, borderColor: Colors.lightGrey },
  sectionTitle: { fontSize: 12, fontWeight: '600', color: Colors.midGrey, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4, textTransform: 'uppercase' },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderBottomWidth: 1, borderBottomColor: Colors.lightGrey },
  menuLabel: { flex: 1, fontSize: 15, color: Colors.charcoal },
  version: { textAlign: 'center', fontSize: 13, color: Colors.midGrey, padding: 24 },
});