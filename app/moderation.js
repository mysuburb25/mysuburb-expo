import { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, ActivityIndicator, Alert } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { collection, query, where, orderBy, getDocs, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { Colors } from '../constants/theme';

const TABS = [
  { key: 'open', label: 'Open' },
  { key: 'resolved', label: 'Resolved' },
];

const CATEGORY_COLORS = {
  'Post content': '#C62828',
  'Bug or technical issue': '#1565C0',
  'Inappropriate content': '#E65100',
  'Account issue': '#6A1B9A',
  'Safety concern': '#C62828',
  'Other': Colors.midGrey,
};

function formatDateTime(date) {
  if (!date) return '';
  const d = date.toDate ? date.toDate() : new Date(date);
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) +
    ' · ' + d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });
}

export default function ModerationScreen() {
  const { user, profile } = useAuth();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('open');
  const [resolvingId, setResolvingId] = useState(null);

  const fetchReports = useCallback(async () => {
    if (!profile?.isAdmin) { setLoading(false); return; }
    setLoading(true);
    try {
      const q = query(
        collection(db, 'reports'),
        where('status', '==', tab === 'open' ? 'open' : 'resolved'),
        orderBy('createdAt', 'desc')
      );
      const snap = await getDocs(q);
      setReports(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error('Fetch reports error:', e);
    } finally {
      setLoading(false);
    }
  }, [profile, tab]);

  useFocusEffect(useCallback(() => { fetchReports(); }, [fetchReports]));

  const handleResolve = (reportId) => {
    Alert.alert('Mark as Resolved?', 'This report will move to the Resolved tab.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Resolve', onPress: async () => {
          setResolvingId(reportId);
          try {
            await updateDoc(doc(db, 'reports', reportId), {
              status: 'resolved',
              resolvedAt: serverTimestamp(),
              resolvedBy: user.uid,
            });
            setReports(prev => prev.filter(r => r.id !== reportId));
          } catch (e) {
            Alert.alert('Error', 'Could not resolve this report. Please try again.');
          } finally {
            setResolvingId(null);
          }
        }
      }
    ]);
  };

  // Non-admins never see report content, even if they somehow land on this screen.
  if (!profile?.isAdmin) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Moderation</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.centered}>
          <Ionicons name="lock-closed-outline" size={40} color={Colors.lightGrey} />
          <Text style={styles.deniedText}>You don't have access to this page.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Moderation</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.tabRow}>
        {TABS.map(t => (
          <TouchableOpacity key={t.key} style={[styles.tabBtn, tab === t.key && styles.tabBtnActive]} onPress={() => setTab(t.key)}>
            <Text
              style={[styles.tabText, tab === t.key && styles.tabTextActive]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
            >
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator color={Colors.brandGreen} style={{ marginTop: 40 }} size="large" />
      ) : (
        <FlatList
          data={reports}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const badgeColor = CATEGORY_COLORS[item.category] || Colors.midGrey;
            return (
              <View style={styles.card}>
                <View style={styles.cardTop}>
                  <View style={[styles.catBadge, { backgroundColor: badgeColor }]}>
                    <Text style={styles.catBadgeText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{item.category}</Text>
                  </View>
                  <Text style={styles.cardTime}>{formatDateTime(item.createdAt)}</Text>
                </View>

                {item.reason && (
                  <Text style={styles.reasonText}>Reason: {item.reason}</Text>
                )}

                {item.description && (
                  <Text style={styles.description}>{item.description}</Text>
                )}

                {item.postContent && (
                  <View style={styles.contextBox}>
                    <Text style={styles.contextLabel}>Reported post by {item.postAuthorName}:</Text>
                    <Text style={styles.contextText} numberOfLines={3}>{item.postContent}</Text>
                    <TouchableOpacity onPress={() => router.push('/post/' + item.postId)}>
                      <Text style={styles.viewPostLink}>View post →</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {item.reportedLocation && (
                  <Text style={styles.metaLine}>Where: {item.reportedLocation}</Text>
                )}

                {item.technicalContext && (
                  <View style={styles.techBox}>
                    <Text style={styles.techText}>
                      {item.technicalContext.platform} · OS {item.technicalContext.osVersion} · App v{item.technicalContext.appVersion || '—'}
                    </Text>
                  </View>
                )}

                <View style={styles.reporterRow}>
                  <Ionicons name="person-outline" size={13} color={Colors.midGrey} />
                  <Text style={styles.reporterText}>
                    {item.userDisplayName || 'Unknown'} {item.userEmail ? `(${item.userEmail})` : ''}
                  </Text>
                </View>
                {item.suburb && (
                  <Text style={styles.metaLine}>{item.suburb}, {item.state}</Text>
                )}

                {tab === 'open' && (
                  <TouchableOpacity
                    style={styles.resolveBtn}
                    onPress={() => handleResolve(item.id)}
                    disabled={resolvingId === item.id}
                  >
                    {resolvingId === item.id
                      ? <ActivityIndicator color={Colors.white} size="small" />
                      : (
                        <>
                          <Ionicons name="checkmark-circle-outline" size={16} color={Colors.white} />
                          <Text style={styles.resolveBtnText}>Mark Resolved</Text>
                        </>
                      )
                    }
                  </TouchableOpacity>
                )}
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="checkmark-done-outline" size={48} color={Colors.lightGrey} />
              <Text style={styles.emptyText}>{tab === 'open' ? 'No open reports' : 'No resolved reports yet'}</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 10 },
  deniedText: { fontSize: 15, color: Colors.midGrey },
  header: { backgroundColor: Colors.brandGreen, paddingTop: 56, paddingBottom: 16, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#fff' },
  tabRow: { flexDirection: 'row', padding: 12, gap: 10, backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.lightGrey },
  tabBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 20, backgroundColor: '#F0F0F0' },
  tabBtnActive: { backgroundColor: Colors.brandGreen },
  tabText: { fontSize: 14, color: Colors.midGrey, fontWeight: '700' },
  tabTextActive: { color: Colors.white },
  list: { padding: 16, gap: 12, paddingBottom: 40 },
  card: { backgroundColor: Colors.white, borderRadius: 14, borderWidth: 1, borderColor: Colors.lightGrey, padding: 14, gap: 8 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  catBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  catBadgeText: { fontSize: 11, fontWeight: '700', color: Colors.white },
  cardTime: { fontSize: 11, color: Colors.midGrey },
  reasonText: { fontSize: 14, fontWeight: '700', color: Colors.charcoal },
  description: { fontSize: 14, color: Colors.charcoal, lineHeight: 20 },
  contextBox: { backgroundColor: '#FAFAFA', borderRadius: 10, padding: 10, gap: 4 },
  contextLabel: { fontSize: 12, fontWeight: '700', color: Colors.midGrey },
  contextText: { fontSize: 13, color: Colors.charcoal },
  viewPostLink: { fontSize: 12, fontWeight: '700', color: Colors.brandGreen, marginTop: 2 },
  techBox: { backgroundColor: '#F3F4F6', borderRadius: 8, padding: 8 },
  techText: { fontSize: 11, color: Colors.midGrey },
  metaLine: { fontSize: 12, color: Colors.midGrey },
  reporterRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  reporterText: { fontSize: 12, color: Colors.midGrey },
  resolveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: Colors.brandGreen, borderRadius: 10, paddingVertical: 10, marginTop: 6 },
  resolveBtnText: { fontSize: 13, fontWeight: '700', color: Colors.white },
  empty: { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyText: { fontSize: 15, color: Colors.midGrey },
});