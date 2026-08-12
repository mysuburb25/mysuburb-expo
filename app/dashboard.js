import { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Image } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { Colors } from '../constants/theme';
import AppName from '../components/AppName';
import useTabBadgeCounts from '../hooks/useTabBadgeCounts';

const SECTIONS = [
  { key: 'community', label: 'Community Hub', icon: 'home', color: Colors.brandGreen },
  { key: 'events', label: 'Events', icon: 'calendar', color: '#6A1B9A' },
  { key: 'marketplace', label: 'Buy & Sell', icon: 'pricetag', color: Colors.brandGreen },
  { key: 'services', label: 'Services', icon: 'briefcase', color: Colors.brandGreen },
  { key: 'lostfound', label: 'Lost & Found', icon: 'search', color: '#E65100' },
];

// Where each section's count pill navigates to when tapped.
const SECTION_ROUTES = {
  community: '/(tabs)',
  events: '/(tabs)/events',
  marketplace: '/(tabs)/buy-sell',
  services: '/(tabs)/services',
  lostfound: '/(tabs)/lost-found',
};

function formatDate(date) {
  if (!date) return '';
  const d = date.toDate ? date.toDate() : new Date(date);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
}

export default function DashboardScreen() {
  const { user, profile, updateUserProfile, unreadCount, unreadMessageCount } = useAuth();
  const insets = useSafeAreaInsets();
  const badgeCounts = useTabBadgeCounts(user, profile);
  const [grouped, setGrouped] = useState({});
  const [loading, setLoading] = useState(true);
  // Only actually shows the spinner if loading takes longer than 200ms —
  // fast loads (the common case) never flash a spinner at all, which
  // reads as noticeably smoother than a spinner that flickers on for a
  // fraction of a second before content replaces it. Genuinely slow
  // loads still show the spinner normally once they cross the threshold.
  const [showSpinner, setShowSpinner] = useState(false);
  useEffect(() => {
    if (!loading) { setShowSpinner(false); return; }
    const t = setTimeout(() => setShowSpinner(true), 200);
    return () => clearTimeout(t);
  }, [loading]);
  const [dontShowAgain, setDontShowAgain] = useState(profile?.skipDashboard || false);
  const [continuing, setContinuing] = useState(false);

  useEffect(() => {
    fetchHighlights();
  }, []);

  const fetchHighlights = async () => {
    try {
      const activeSuburbs = profile?.suburbs
        ? profile.suburbs.filter(s => s.active).map(s => ({ suburb: s.suburb, state: s.state }))
        : [{ suburb: profile?.suburb, state: profile?.state }];

      const queryPromises = activeSuburbs
        .filter(s => s.suburb && s.state)
        .map(({ suburb, state }) => {
          const q = query(
            collection(db, 'posts'),
            where('suburb', '==', suburb),
            where('state', '==', state),
            where('isRemoved', '==', false),
            orderBy('createdAt', 'desc'),
            limit(30)
          );
          return getDocs(q);
        });

      const snaps = await Promise.all(queryPromises);
      let allPosts = snaps.flatMap(snap => snap.docs.map(d => ({ id: d.id, ...d.data() })));

      allPosts.sort((a, b) => {
        const aTime = a.createdAt?.toDate?.() || new Date(0);
        const bTime = b.createdAt?.toDate?.() || new Date(0);
        return bTime - aTime;
      });

      const blockedIds = profile?.blockedUsers?.map(b => b.uid) || [];
      if (blockedIds.length) allPosts = allPosts.filter(p => !blockedIds.includes(p.authorId));

      // Group into sections, capping each at 3 so the dashboard stays a
      // quick skim rather than a full duplicate of every tab.
      const result = {};
      for (const post of allPosts) {
        const sectionKey = ['updates', 'notices', 'safety'].includes(post.category) ? 'community' : post.category;
        if (!result[sectionKey]) result[sectionKey] = [];
        if (result[sectionKey].length < 3) result[sectionKey].push(post);
      }
      setGrouped(result);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleContinue = async () => {
    setContinuing(true);
    try {
      // Always sync, not just when checked — otherwise someone who
      // previously checked this and later opens the dashboard from
      // Profile to uncheck it would have that change silently ignored,
      // and skipDashboard would stay stuck at true.
      if (dontShowAgain !== !!profile?.skipDashboard) {
        await updateUserProfile({ skipDashboard: dontShowAgain });
      }
    } catch (e) {
      console.error(e);
    } finally {
      router.replace('/(tabs)');
    }
  };

  const hasAnyHighlights = Object.values(grouped).some(arr => arr.length > 0);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.profileAvatar} onPress={() => router.push('/(tabs)/profile')}>
          {profile?.photoURL ? (
            <Image source={{ uri: profile.photoURL }} style={styles.profileAvatarImage} />
          ) : (
            <Text style={styles.profileAvatarText}>{profile?.displayName?.[0]?.toUpperCase() || '?'}</Text>
          )}
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <AppName style={styles.mySuburb} />
          <Text style={styles.suburbName} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{profile?.suburb}, {profile?.state}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          <TouchableOpacity onPress={() => router.push('/(tabs)/messages')} style={{ position: 'relative' }}>
            <Ionicons name="chatbubbles-outline" size={24} color="#fff" />
            {unreadMessageCount > 0 && (
              <View style={styles.bellBadge}>
                <Text style={styles.bellBadgeText}>{unreadMessageCount > 9 ? '9+' : unreadMessageCount}</Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/(tabs)/notifications')} style={{ position: 'relative' }}>
            <Ionicons name="notifications-outline" size={26} color="#fff" />
            {unreadCount > 0 && (
              <View style={styles.bellBadge}>
                <Text style={styles.bellBadgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.pageHeader}>
        <Text style={styles.pageTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{profile?.displayName?.split(' ')[0] || 'Your'}'s Dashboard</Text>
      </View>

      {loading ? (showSpinner && (
        <ActivityIndicator color={Colors.brandGreen} style={{ marginTop: 40 }} size="large" />
      )) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          {!hasAnyHighlights && (
            <View style={styles.empty}>
              <Ionicons name="sparkles-outline" size={48} color={Colors.lightGrey} />
              <Text style={styles.emptyText}>Nothing posted here yet — be the first!</Text>
            </View>
          )}

          {SECTIONS.map(section => {
            const items = grouped[section.key];
            if (!items || items.length === 0) return null;
            // dashboard's 'community' section corresponds to the 'home'
            // tab everywhere else (tab bar badges, lastVisited tracking).
            const badgeKey = section.key === 'community' ? 'home' : section.key;
            const newCount = badgeCounts[badgeKey] || 0;
            return (
              <View key={section.key} style={styles.section}>
                <View style={styles.sectionHeader}>
                  <View style={styles.sectionHeaderLeft}>
                    <View style={[styles.sectionIconBadge, { backgroundColor: section.color + '20' }]}>
                      <Ionicons name={section.icon} size={17} color={section.color} />
                    </View>
                    <Text style={styles.sectionTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{section.label}</Text>
                  </View>
                  {newCount > 0 && (
                    <TouchableOpacity
                      style={styles.sectionCountPill}
                      onPress={() => router.push(SECTION_ROUTES[section.key])}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Text style={styles.sectionCountText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{newCount > 9 ? '9+' : newCount} new</Text>
                    </TouchableOpacity>
                  )}
                </View>
                {items.map(item => (
                  <TouchableOpacity
                    key={item.id}
                    style={[styles.card, { borderLeftColor: section.color, borderLeftWidth: 4 }]}
                    onPress={() => router.push('/post/' + item.id)}
                    activeOpacity={0.85}
                  >
                    <View style={styles.cardAvatar}>
                      {item.authorPhotoURL ? (
                        <Image source={{ uri: item.authorPhotoURL }} style={styles.cardAvatarImage} />
                      ) : (
                        <Text style={styles.cardAvatarText}>{item.authorName?.[0]?.toUpperCase() || '?'}</Text>
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cardTitle} numberOfLines={1}>{item.content}</Text>
                      <Text style={styles.cardMeta}>{item.authorName} · {formatDate(item.createdAt)}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={Colors.lightGrey} />
                  </TouchableOpacity>
                ))}
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* paddingBottom includes the device's safe-area inset (on top of
          the base 16) so this footer — and the Continue button inside it
          — always sits fully above any on-screen system navigation bar.
          Without this, older Android devices using traditional 3-button
          navigation (rather than gesture navigation) can end up with
          this button partially or fully hidden underneath that bar,
          since insets.bottom is 0 on iOS/gesture-nav Android but can be
          40-50px+ on devices with a persistent on-screen nav bar. */}
      <View style={[styles.footer, { paddingBottom: 16 + insets.bottom }]}>
        <TouchableOpacity style={styles.checkboxRow} onPress={() => setDontShowAgain(v => !v)}>
          <Ionicons name={dontShowAgain ? 'checkbox' : 'square-outline'} size={22} color={Colors.brandGreen} />
          <Text style={styles.checkboxLabel}>Don't show this dashboard again</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.continueBtn, continuing && { opacity: 0.7 }]} onPress={handleContinue} disabled={continuing}>
          {continuing ? <ActivityIndicator color={Colors.white} /> : <Text style={styles.continueBtnText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>Continue to Hub</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F2F2' },
  header: { backgroundColor: Colors.brandGreen, paddingTop: 56, paddingBottom: 20, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerCenter: { alignItems: 'center', marginLeft: 8 },
  profileAvatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#FFD700', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  bellBadge: { position: 'absolute', top: -4, right: -4, backgroundColor: '#E53935', borderRadius: 8, minWidth: 16, height: 16, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 3 },
  bellBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  profileAvatarImage: { width: 42, height: 42, borderRadius: 21 },
  profileAvatarText: { fontSize: 16, fontWeight: '800', color: Colors.brandGreen },
  mySuburb: { fontSize: 27, fontWeight: '800', color: Colors.white, marginTop: 2 },
  suburbName: { fontSize: 17, color: '#FFD700', marginTop: 4 },
  pageHeader: { backgroundColor: Colors.brandGreenPale, paddingVertical: 10, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: Colors.lightGrey },
  pageTitle: { fontSize: 20, fontWeight: '700', color: Colors.brandGreen },
  scroll: { padding: 16, paddingBottom: 20 },
  empty: { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyText: { fontSize: 15, color: Colors.midGrey },
  section: { marginBottom: 20 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10 },
  sectionHeaderLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  sectionIconBadge: { width: 30, height: 30, borderRadius: 15, justifyContent: 'center', alignItems: 'center' },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: Colors.charcoal },
  sectionCountPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, minWidth: 26, alignItems: 'center', backgroundColor: '#FFD700' },
  sectionCountText: { fontSize: 12, fontWeight: '800', color: Colors.brandGreen },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.white, borderRadius: 16, padding: 13, marginBottom: 9,
    borderWidth: 1, borderColor: '#D5D5D5',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 6, elevation: 2,
  },
  cardAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.white, borderWidth: 2, borderColor: Colors.brandGreen, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  cardAvatarImage: { width: 32, height: 32, borderRadius: 16 },
  cardAvatarText: { fontSize: 14, fontWeight: '700', color: Colors.brandGreen },
  cardTitle: { fontSize: 14, fontWeight: '700', color: Colors.charcoal },
  cardMeta: { fontSize: 12, color: Colors.midGrey, marginTop: 2 },
  footer: { backgroundColor: Colors.white, borderTopWidth: 1, borderTopColor: Colors.lightGrey, padding: 16, gap: 12 },
  checkboxRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  checkboxLabel: { fontSize: 14, color: Colors.charcoal },
  continueBtn: { backgroundColor: Colors.brandGreen, borderRadius: 28, paddingVertical: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8, shadowColor: Colors.brandGreen, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  continueBtnText: { color: Colors.white, fontSize: 16, fontWeight: '700' },
});