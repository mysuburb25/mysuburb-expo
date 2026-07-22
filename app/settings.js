import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert, Platform } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Application from 'expo-application';
import { useAuth } from '../context/AuthContext';
import { Colors } from '../constants/theme';
import AppName from '../components/AppName';

// expo-constants' Constants.expoConfig has no buildNumber/versionCode
// here — this project uses eas.json's appVersionSource: "remote", which
// means EAS injects the real build number directly into the native
// project during the build step, but never writes it back into
// app.json, so Constants.expoConfig has nothing to read. expo-application
// reads the actual compiled binary's metadata directly from the OS
// instead, which is accurate regardless of how the version was assigned.
const APP_VERSION = Application.nativeApplicationVersion || '—';
const BUILD_NUMBER = Application.nativeBuildVersion;
const VERSION_STRING = BUILD_NUMBER ? `${APP_VERSION} (${BUILD_NUMBER})` : APP_VERSION;

export default function SettingsScreen() {
  const { profile } = useAuth();

  const MenuItem = ({ icon, label, onPress, danger }) => (
    <TouchableOpacity style={styles.menuItem} onPress={onPress}>
      <Ionicons name={icon} size={20} color={danger ? '#E53935' : Colors.brandGreen} />
      <Text style={[styles.menuLabel, danger && { color: '#E53935' }]}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color={Colors.midGrey} />
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <AppName style={styles.mySuburb} />
          <Text style={styles.suburbName}>{profile?.suburb}, {profile?.state}</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.pageHeader}>
        <View style={styles.pageHeaderIconBadge}>
          <Ionicons name="settings" size={22} color={Colors.brandGreen} />
        </View>
        <Text style={styles.pageTitle}>Settings</Text>
      </View>

      <ScrollView style={styles.scrollBody}>
      <Text style={styles.sectionLabel}>Account</Text>
      <View style={styles.section}>
        <MenuItem icon="person-outline" label="Edit Profile" onPress={() => router.push('/edit-profile')} />
        <MenuItem icon="lock-closed-outline" label="Change Password" onPress={() => router.push('/change-password')} />
        <MenuItem icon="notifications-outline" label="Notification Preferences" onPress={() => router.push('/notification-preferences')} />
        <MenuItem icon="ban-outline" label="Blocked Users" onPress={() => router.push('/blocked-users')} />
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
        <MenuItem icon="information-circle-outline" label="About My Suburb" onPress={() => Alert.alert('My Suburb', `Version ${VERSION_STRING}\nMade in Australia`)} />
      </View>

      <Text style={styles.sectionLabel}>Account Actions</Text>
      <View style={styles.section}>
        <MenuItem icon="trash-outline" label="Delete Account" onPress={() => router.push('/delete-account')} danger />
      </View>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  scrollBody: { flex: 1 },
  header: { backgroundColor: Colors.brandGreen, paddingTop: 56, paddingBottom: 16, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  headerCenter: { alignItems: 'center' },
  mySuburb: { fontSize: 27, fontWeight: '800', color: Colors.white },
  suburbName: { fontSize: 17, color: '#FFD700', marginTop: 4 },
  pageHeader: { backgroundColor: Colors.brandGreenPale, paddingVertical: 14, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, borderBottomWidth: 1, borderBottomColor: Colors.lightGrey },
  pageHeaderIconBadge: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.white, justifyContent: 'center', alignItems: 'center' },
  pageTitle: { fontSize: 21, fontWeight: '800', color: Colors.brandGreen, letterSpacing: 0.2 },
  sectionLabel: { fontSize: 14, fontWeight: '900', color: Colors.brandGreen, paddingHorizontal: 16, paddingVertical: 9, backgroundColor: Colors.brandGreenPale, borderTopWidth: 0.5, borderBottomWidth: 0.5, borderColor: '#c8e6c9', marginTop: 8 },
  section: { backgroundColor: Colors.white, borderTopWidth: 0.5, borderBottomWidth: 0.5, borderColor: Colors.lightGrey },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: Colors.lightGrey },
  menuLabel: { flex: 1, fontSize: 15, color: Colors.charcoal },
});