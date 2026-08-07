import { useState } from 'react';
import { View, Text, Switch, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';

const DEFAULT_PREFS = {
  likes: true,
  comments: true,
  safety: true,
  events: true,
  marketplace: false,
  lostfound: true,
  services: true,
};

function NotificationItem({ label, desc, value, onToggle, disabled }) {
  return (
    <View style={styles.item}>
      <View style={styles.itemText}>
        <Text style={styles.itemLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{label}</Text>
        <Text style={styles.itemDesc}>{desc}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        disabled={disabled}
        trackColor={{ false: '#E5E7EB', true: '#2D6A4F' }}
        thumbColor="#fff"
      />
    </View>
  );
}

export default function NotificationPreferencesScreen() {
  const { profile, updateUserProfile } = useAuth();
  const insets = useSafeAreaInsets();
  const [prefs, setPrefs] = useState({ ...DEFAULT_PREFS, ...(profile?.notificationPrefs || {}) });
  const [saving, setSaving] = useState(false);

  const toggle = async (key) => {
    const updated = { ...prefs, [key]: !prefs[key] };
    setPrefs(updated); // optimistic update so the switch responds instantly
    setSaving(true);
    try {
      await updateUserProfile({ notificationPrefs: updated });
    } catch (e) {
      // Revert on failure so the UI doesn't claim a preference that wasn't saved.
      setPrefs(prefs);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>Notifications</Text>
        <View style={{ width: 40, alignItems: 'flex-end' }}>
          {saving && <ActivityIndicator size="small" color="#fff" />}
        </View>
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: 20 + insets.bottom }}>
        <Text style={styles.sectionLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>Activity</Text>
        <View style={styles.section}>
          <NotificationItem label="Likes" desc="When someone likes your post" value={prefs.likes} onToggle={() => toggle('likes')} />
          <NotificationItem label="Comments" desc="When someone comments on your post" value={prefs.comments} onToggle={() => toggle('comments')} />
        </View>
        <Text style={styles.sectionLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>Community</Text>
        <View style={styles.section}>
          <NotificationItem label="Safety Alerts" desc="Urgent safety alerts in your suburb" value={prefs.safety} onToggle={() => toggle('safety')} />
          <NotificationItem label="Events" desc="New events posted in your suburb" value={prefs.events} onToggle={() => toggle('events')} />
          <NotificationItem label="Buy and Sell" desc="New listings in your suburb" value={prefs.marketplace} onToggle={() => toggle('marketplace')} />
          <NotificationItem label="Lost and Found" desc="Lost and found posts in your suburb" value={prefs.lostfound} onToggle={() => toggle('lostfound')} />
          <NotificationItem label="Services" desc="New service posts in your suburb" value={prefs.services} onToggle={() => toggle('services')} />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { backgroundColor: '#2D6A4F', paddingTop: 56, paddingBottom: 16, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#fff' },
  sectionLabel: { fontSize: 12, fontWeight: '700', color: '#6B7280', paddingHorizontal: 16, paddingTop: 20, paddingBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  section: { backgroundColor: '#fff', borderTopWidth: 0.5, borderBottomWidth: 0.5, borderColor: '#E5E7EB' },
  item: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: '#F3F4F6', gap: 12 },
  itemText: { flex: 1 },
  itemLabel: { fontSize: 15, color: '#1B1F23', fontWeight: '600' },
  itemDesc: { fontSize: 13, color: '#6B7280', marginTop: 2 },
});
