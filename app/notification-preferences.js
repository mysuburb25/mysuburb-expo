import { useState } from 'react';
import { View, Text, Switch, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export default function NotificationPreferencesScreen() {
  const [prefs, setPrefs] = useState({
    likes: true,
    comments: true,
    safety: true,
    events: true,
    marketplace: false,
    lostfound: true,
  });

  const toggle = (key) => setPrefs(prev => ({ ...prev, [key]: !prev[key] }));

  const Item = ({ label, desc, keyName }) => (
    <View style={styles.item}>
      <View style={styles.itemText}>
        <Text style={styles.itemLabel}>{label}</Text>
        <Text style={styles.itemDesc}>{desc}</Text>
      </View>
      <Switch
        value={prefs[keyName]}
        onValueChange={() => toggle(keyName)}
        trackColor={{ false: '#E5E7EB', true: '#2D6A4F' }}
        thumbColor="#fff"
      />
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notifications</Text>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView>
        <Text style={styles.sectionLabel}>Activity</Text>
        <View style={styles.section}>
          <Item label="Likes" desc="When someone likes your post" keyName="likes" />
          <Item label="Comments" desc="When someone comments on your post" keyName="comments" />
        </View>
        <Text style={styles.sectionLabel}>Community</Text>
        <View style={styles.section}>
          <Item label="Safety Alerts" desc="Urgent safety alerts in your suburb" keyName="safety" />
          <Item label="Events" desc="New events posted in your suburb" keyName="events" />
          <Item label="Buy and Sell" desc="New listings in your suburb" keyName="marketplace" />
          <Item label="Lost and Found" desc="Lost and found posts in your suburb" keyName="lostfound" />
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