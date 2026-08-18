import { useState, useCallback, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl, Alert, Modal, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { router } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { collection, query, where, orderBy, limit, getDocs, getCountFromServer, onSnapshot, updateDoc, addDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { Colors } from '../constants/theme';
import AppName from '../components/AppName';

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'users', label: 'Users' },
  { key: 'reports', label: 'Reports' },
  { key: 'suspended', label: 'Suspended' },
];

function formatDate(date) {
  if (!date) return '';
  const d = date.toDate ? date.toDate() : new Date(date);
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function AdminDashboardScreen() {
  const { user, profile, unreadCount, unreadMessageCount } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');

  // --- Overview / stats ---
  const [stats, setStats] = useState(null);
  const [loadingStats, setLoadingStats] = useState(true);

  // --- Users (full list) ---
  // Fetched lazily — only when this tab is actually opened, rather than
  // unconditionally alongside the other tabs' data on every focus. The
  // Overview tab's own user count already comes from a cheap
  // getCountFromServer call; pulling every user's full document on each
  // visit regardless of whether the tab is even viewed would get more
  // expensive as the user base grows, for a list that isn't always needed.
  const [allUsers, setAllUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [usersLoaded, setUsersLoaded] = useState(false);

  // --- Reports ---
  const [reportStatus, setReportStatus] = useState('open'); // 'open' | 'resolved'
  const [reports, setReports] = useState([]);
  const [loadingReports, setLoadingReports] = useState(true);
  const [showWarnModal, setShowWarnModal] = useState(false);
  const [warnTarget, setWarnTarget] = useState(null);
  const [warnMessage, setWarnMessage] = useState('');
  const [sendingWarning, setSendingWarning] = useState(false);

  // --- Suspended users ---
  const [suspendedUsers, setSuspendedUsers] = useState([]);
  const [loadingSuspended, setLoadingSuspended] = useState(true);

  // Stats use getCountFromServer — a count-only query that doesn't read
  // full documents, so it stays cheap regardless of how large the
  // collections grow (unlike getDocs, which reads and bills for every
  // matching document). Both openReports and resolvedReports are
  // fetched here so the Reports tab chips can show live counts without
  // needing their own separate query.
  const fetchStats = useCallback(async () => {
    setLoadingStats(true);
    try {
      const [
        totalUsers, totalPosts, homeCount, mpCount, eventsCount,
        servicesCount, lfCount, openReports, resolvedReports, suspendedCount,
      ] = await Promise.all([
        getCountFromServer(collection(db, 'users')),
        getCountFromServer(query(collection(db, 'posts'), where('isRemoved', '==', false))),
        getCountFromServer(query(collection(db, 'posts'), where('isRemoved', '==', false), where('category', 'in', ['updates', 'notices', 'safety']))),
        getCountFromServer(query(collection(db, 'posts'), where('isRemoved', '==', false), where('category', '==', 'marketplace'))),
        getCountFromServer(query(collection(db, 'posts'), where('isRemoved', '==', false), where('category', '==', 'events'))),
        getCountFromServer(query(collection(db, 'posts'), where('isRemoved', '==', false), where('category', '==', 'services'))),
        getCountFromServer(query(collection(db, 'posts'), where('isRemoved', '==', false), where('category', '==', 'lostfound'))),
        getCountFromServer(query(collection(db, 'reports'), where('status', '==', 'open'))),
        getCountFromServer(query(collection(db, 'reports'), where('status', '==', 'resolved'))),
        getCountFromServer(query(collection(db, 'users'), where('isSuspended', '==', true))),
      ]);
      setStats({
        totalUsers: totalUsers.data().count,
        totalPosts: totalPosts.data().count,
        home: homeCount.data().count,
        marketplace: mpCount.data().count,
        events: eventsCount.data().count,
        services: servicesCount.data().count,
        lostfound: lfCount.data().count,
        openReports: openReports.data().count,
        resolvedReports: resolvedReports.data().count,
        suspendedUsers: suspendedCount.data().count,
      });
    } catch (e) { console.error(e); }
    finally { setLoadingStats(false); }
  }, []);

  // Capped at 200 — matches the same cost-conscious reasoning as
  // Reports' own limit(30). Fine for the app's current size; worth
  // revisiting with proper pagination once the user base grows well
  // beyond this.
  const fetchAllUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const q = query(collection(db, 'users'), orderBy('displayName', 'asc'), limit(200));
      const snap = await getDocs(q);
      setAllUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setUsersLoaded(true);
    } catch (e) { console.error(e); }
    finally { setLoadingUsers(false); }
  }, []);

  // Live listeners instead of one-time getDocs() calls — the same
  // pattern already proven reliable in chat throughout this app. The
  // one-time getDocs() version of these two queries specifically was
  // hanging indefinitely (confirmed via a 10-second timeout race,
  // ruling out "just slow"), while onSnapshot on the exact same
  // collections/filters works normally elsewhere in the app. Switching
  // to it here sidesteps whatever that one-time-query-specific issue
  // was, and also means reports/suspended users now update live rather
  // than needing a manual refetch.
  useEffect(() => {
    setLoadingReports(true);
    const q = query(
      collection(db, 'reports'),
      where('status', '==', reportStatus),
      orderBy('createdAt', 'desc'),
      limit(30)
    );
    const unsubscribe = onSnapshot(q, (snap) => {
      setReports(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoadingReports(false);
    }, (e) => {
      console.error(e);
      setLoadingReports(false);
    });
    return () => unsubscribe();
  }, [reportStatus]);

  useEffect(() => {
    setLoadingSuspended(true);
    const q = query(collection(db, 'users'), where('isSuspended', '==', true));
    const unsubscribe = onSnapshot(q, (snap) => {
      setSuspendedUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoadingSuspended(false);
    }, (e) => {
      console.error(e);
      setLoadingSuspended(false);
    });
    return () => unsubscribe();
  }, []);

  useFocusEffect(useCallback(() => {
    fetchStats();
  }, [fetchStats]));

  // Lazy-load: only fetches the first time the Users tab is actually
  // opened, not on every screen focus — see fetchAllUsers' own comment
  // for the cost reasoning.
  useEffect(() => {
    if (activeTab === 'users' && !usersLoaded) {
      fetchAllUsers();
    }
  }, [activeTab, usersLoaded, fetchAllUsers]);

  // Reports and Suspended no longer need manual refetching here — their
  // onSnapshot listeners above keep them live automatically. Stats and
  // the Users list (a one-time snapshot, not a live listener) still do.
  const handleRefresh = () => {
    fetchStats();
    if (activeTab === 'users') fetchAllUsers();
  };

  const handleRemovePost = (report) => {
    Alert.alert(
      'Remove Post',
      'This removes the reported post from the app for everyone, and marks this report as resolved.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove Post', style: 'destructive', onPress: async () => {
            try {
              await updateDoc(doc(db, 'posts', report.postId), { isRemoved: true });
              await updateDoc(doc(db, 'reports', report.id), { status: 'resolved', resolvedAt: serverTimestamp(), resolvedBy: user.uid });
              setReports(prev => prev.filter(r => r.id !== report.id));
              fetchStats();
            } catch (e) { Alert.alert('Error', e.message); }
          }
        }
      ]
    );
  };

  const handleDismissReport = (report) => {
    Alert.alert('Dismiss Report', 'This marks the report as resolved without removing the post.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Dismiss', onPress: async () => {
          try {
            await updateDoc(doc(db, 'reports', report.id), { status: 'resolved', resolvedAt: serverTimestamp(), resolvedBy: user.uid });
            setReports(prev => prev.filter(r => r.id !== report.id));
            fetchStats();
          } catch (e) { Alert.alert('Error', e.message); }
        }
      }
    ]);
  };

  const handleReopenReport = (report) => {
    Alert.alert('Reopen Report', 'This moves the report back to Open so it can be reviewed again.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reopen', onPress: async () => {
          try {
            await updateDoc(doc(db, 'reports', report.id), { status: 'open', resolvedAt: null, resolvedBy: null });
            setReports(prev => prev.filter(r => r.id !== report.id));
            fetchStats();
          } catch (e) { Alert.alert('Error', e.message); }
        }
      }
    ]);
  };

  // Works for either kind of report — a post-content report always has
  // postAuthorId; a Report a Problem submission about someone's
  // behaviour (Safety concern / Inappropriate content) has
  // reportedUserId instead, from the optional "Who is this about?"
  // search field.
  const getTargetUser = (report) => ({
    id: report.postAuthorId || report.reportedUserId || null,
    name: report.postAuthorName || report.reportedUserName || null,
  });

  const handleSuspendUser = (report) => {
    const target = getTargetUser(report);
    if (!target.id) { Alert.alert('Error', 'No user was identified for this report.'); return; }
    Alert.alert(
      `Suspend ${target.name || 'this user'}?`,
      'They will be signed out and unable to use the app until you unsuspend them.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Suspend', style: 'destructive', onPress: async () => {
            try {
              await updateDoc(doc(db, 'users', target.id), { isSuspended: true });
              Alert.alert('User Suspended', `${target.name || 'This user'} has been suspended.`);
              // No manual refetch needed — the Suspended tab's
              // onSnapshot listener picks this up automatically.
            } catch (e) { Alert.alert('Error', e.message); }
          }
        }
      ]
    );
  };

  const openWarnModal = (report) => {
    const target = getTargetUser(report);
    if (!target.id) { Alert.alert('Error', 'No user was identified for this report.'); return; }
    setWarnTarget(report);
    setWarnMessage('');
    setShowWarnModal(true);
  };

  const submitWarning = async () => {
    if (!warnMessage.trim()) { Alert.alert('Error', 'Please enter a warning message.'); return; }
    const target = getTargetUser(warnTarget);
    if (!target.id) { Alert.alert('Error', 'No user was identified for this report.'); setShowWarnModal(false); return; }
    setSendingWarning(true);
    try {
      await addDoc(collection(db, 'notifications'), {
        userId: target.id,
        type: 'admin_warning',
        message: warnMessage.trim(),
        fromUserId: user.uid,
        fromUserName: 'Admin',
        isRead: false,
        createdAt: serverTimestamp(),
      });
      setShowWarnModal(false);
      Alert.alert('Warning Sent', `${target.name || 'The user'} has been notified.`);
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setSendingWarning(false);
    }
  };

  const handleUnsuspend = (targetUser) => {
    Alert.alert(`Unsuspend ${targetUser.displayName || 'this user'}?`, 'They will be able to use the app again.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Unsuspend', onPress: async () => {
          try {
            await updateDoc(doc(db, 'users', targetUser.id), { isSuspended: false });
            setSuspendedUsers(prev => prev.filter(u => u.id !== targetUser.id));
          } catch (e) { Alert.alert('Error', e.message); }
        }
      }
    ]);
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <AppName style={styles.mySuburb} />
          <Text style={styles.suburbName}>Bringing suburbs together</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <TouchableOpacity onPress={() => router.push('/(tabs)/messages')} style={{ position: 'relative' }}>
            <Ionicons name="chatbubbles-outline" size={22} color="#fff" />
            {unreadMessageCount > 0 && (
              <View style={styles.bellBadge}>
                <Text style={styles.bellBadgeText}>{unreadMessageCount > 9 ? '9+' : unreadMessageCount}</Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/(tabs)/notifications')} style={{ position: 'relative' }}>
            <Ionicons name="notifications-outline" size={24} color="#fff" />
            {unreadCount > 0 && (
              <View style={styles.bellBadge}>
                <Text style={styles.bellBadgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.pageHeader}>
        <View style={styles.pageHeaderIconBadge}>
          <Ionicons name="shield-checkmark" size={22} color="#1B4F72" />
        </View>
        <Text style={styles.pageTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>Admin Dashboard</Text>
      </View>

      <View style={styles.tabRow}>
        {TABS.map(t => (
          <TouchableOpacity key={t.key} style={[styles.tabBtn, activeTab === t.key && styles.tabBtnActive]} onPress={() => setActiveTab(t.key)}>
            <Text
              style={[styles.tabText, activeTab === t.key && styles.tabTextActive]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
            >
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={handleRefresh} tintColor="#1B4F72" />}
      >
        {/* OVERVIEW */}
        {activeTab === 'overview' && (
          loadingStats ? (
            <ActivityIndicator color="#1B4F72" style={{ marginTop: 40 }} size="large" />
          ) : (
            <View style={styles.statsGrid}>
              {/* Total Users is now a shortcut into the new Users tab —
                  tapping it takes you straight to the full list rather
                  than just showing a static count. */}
              <TouchableOpacity style={[styles.statCard, { backgroundColor: '#C2D9E8' }]} onPress={() => setActiveTab('users')}>
                <Ionicons name="people-outline" size={22} color="#1B4F72" />
                <Text style={styles.statNumber}>{stats?.totalUsers ?? 0}</Text>
                <Text style={styles.statLabel}>Total Users</Text>
              </TouchableOpacity>
              <View style={[styles.statCard, { backgroundColor: Colors.brandGreenPale }]}>
                <Ionicons name="documents-outline" size={22} color={Colors.brandGreen} />
                <Text style={styles.statNumber}>{stats?.totalPosts ?? 0}</Text>
                <Text style={styles.statLabel}>Total Posts</Text>
              </View>
              <View style={[styles.statCard, { backgroundColor: stats?.openReports > 0 ? '#FFEBEE' : '#F0F0F0' }]}>
                <Ionicons name="flag-outline" size={22} color={stats?.openReports > 0 ? '#E53935' : Colors.midGrey} />
                <Text style={[styles.statNumber, stats?.openReports > 0 && { color: '#E53935' }]}>{stats?.openReports ?? 0}</Text>
                <Text style={styles.statLabel}>Open Reports</Text>
              </View>
              <View style={[styles.statCard, { backgroundColor: '#FFF3E0' }]}>
                <Ionicons name="ban-outline" size={22} color="#E65100" />
                <Text style={styles.statNumber}>{stats?.suspendedUsers ?? 0}</Text>
                <Text style={styles.statLabel}>Suspended</Text>
              </View>

              <View style={styles.statsSectionHeader}>
                <Text style={styles.statsSectionTitle}>Posts by Category</Text>
              </View>
              <View style={[styles.statCard, styles.statCardWide, { backgroundColor: '#F5F5F5' }]}>
                <Ionicons name="home-outline" size={18} color={Colors.brandGreen} />
                <Text style={styles.statRowLabel}>Community Hub</Text>
                <Text style={styles.statRowNumber}>{stats?.home ?? 0}</Text>
              </View>
              <View style={[styles.statCard, styles.statCardWide, { backgroundColor: '#F5F5F5' }]}>
                <Ionicons name="pricetag-outline" size={18} color={Colors.brandGreen} />
                <Text style={styles.statRowLabel}>Buy & Sell</Text>
                <Text style={styles.statRowNumber}>{stats?.marketplace ?? 0}</Text>
              </View>
              <View style={[styles.statCard, styles.statCardWide, { backgroundColor: '#F5F5F5' }]}>
                <Ionicons name="calendar-outline" size={18} color={Colors.brandGreen} />
                <Text style={styles.statRowLabel}>Events</Text>
                <Text style={styles.statRowNumber}>{stats?.events ?? 0}</Text>
              </View>
              <View style={[styles.statCard, styles.statCardWide, { backgroundColor: '#F5F5F5' }]}>
                <Ionicons name="briefcase-outline" size={18} color={Colors.brandGreen} />
                <Text style={styles.statRowLabel}>Services</Text>
                <Text style={styles.statRowNumber}>{stats?.services ?? 0}</Text>
              </View>
              <View style={[styles.statCard, styles.statCardWide, { backgroundColor: '#F5F5F5' }]}>
                <Ionicons name="flag-outline" size={18} color={Colors.brandGreen} />
                <Text style={styles.statRowLabel}>Lost & Found</Text>
                <Text style={styles.statRowNumber}>{stats?.lostfound ?? 0}</Text>
              </View>
            </View>
          )
        )}

        {/* USERS */}
        {activeTab === 'users' && (
          <View style={styles.section}>
            {loadingUsers ? (
              <ActivityIndicator color="#1B4F72" style={{ marginTop: 30 }} />
            ) : allUsers.length === 0 ? (
              <View style={styles.empty}>
                <Ionicons name="people-outline" size={48} color={Colors.lightGrey} />
                <Text style={styles.emptyText}>No users found</Text>
              </View>
            ) : (
              <>
                <Text style={styles.userListCount} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                  {allUsers.length}{allUsers.length >= 200 ? '+' : ''} user{allUsers.length === 1 ? '' : 's'}
                </Text>
                {allUsers.map(u => (
                  <TouchableOpacity key={u.id} style={styles.userRow} onPress={() => router.push('/user/' + u.id)}>
                    <View style={styles.userAvatar}>
                      <Text style={styles.userAvatarText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{u.displayName?.[0]?.toUpperCase() || '?'}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.userName} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>{u.displayName || 'Unknown'}</Text>
                      <Text style={styles.userEmail} numberOfLines={1}>{u.email || 'No email'}</Text>
                      <Text style={styles.userSuburb} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>{u.suburb ? `${u.suburb}, ${u.state}` : 'No suburb set'}</Text>
                    </View>
                    {u.isSuspended && (
                      <View style={styles.userSuspendedBadge}>
                        <Text style={styles.userSuspendedBadgeText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>Suspended</Text>
                      </View>
                    )}
                    <Ionicons name="chevron-forward" size={18} color={Colors.lightGrey} />
                  </TouchableOpacity>
                ))}
              </>
            )}
          </View>
        )}

        {/* REPORTS */}
        {activeTab === 'reports' && (
          <View style={styles.section}>
            <View style={styles.reportStatusRow}>
              <TouchableOpacity
                style={[styles.reportStatusChipOpen, reportStatus === 'open' && styles.reportStatusChipActiveOpen]}
                onPress={() => setReportStatus('open')}
              >
                <Ionicons name="alert-circle" size={14} color="#E53935" />
                <Text
                  style={[styles.reportStatusChipTextOpen, reportStatus === 'open' && styles.reportStatusChipTextActiveOpen]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                >
                  Open{stats ? ` (${stats.openReports ?? 0})` : ''}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.reportStatusChipResolved, reportStatus === 'resolved' && styles.reportStatusChipActiveResolved]}
                onPress={() => setReportStatus('resolved')}
              >
                <Ionicons name="checkmark-circle" size={14} color={Colors.brandGreen} />
                <Text
                  style={[styles.reportStatusChipTextResolved, reportStatus === 'resolved' && styles.reportStatusChipTextActiveResolved]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                >
                  Resolved{stats ? ` (${stats.resolvedReports ?? 0})` : ''}
                </Text>
              </TouchableOpacity>
            </View>

            {loadingReports ? (
              <ActivityIndicator color="#1B4F72" style={{ marginTop: 30 }} />
            ) : reports.length === 0 ? (
              <View style={styles.empty}>
                <Ionicons name="checkmark-done-circle-outline" size={48} color={Colors.lightGrey} />
                <Text style={styles.emptyText}>{reportStatus === 'open' ? 'No open reports' : 'No resolved reports yet'}</Text>
              </View>
            ) : (
              reports.map(report => (
                <View key={report.id} style={styles.reportCard}>
                  <View style={styles.reportCardHeader}>
                    <Text style={styles.reasonHeading} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{report.reason || report.category || 'Other'}</Text>
                    <Text style={styles.reportDate}>{formatDate(report.createdAt)}</Text>
                  </View>

                  {report.description ? (
                    <Text style={styles.reportDescription}>{report.description}</Text>
                  ) : null}

                  <View style={styles.reportFieldRow}>
                    <View style={[styles.reportFieldLabel, styles.reportFieldLabelAlt]}>
                      <Text style={[styles.reportFieldLabelText, styles.reportFieldLabelTextAlt]}>REPORTED BY</Text>
                    </View>
                    <TouchableOpacity
                      style={{ flex: 1 }}
                      disabled={!report.userId}
                      onPress={() => report.userId && router.push('/user/' + report.userId)}
                    >
                      <Text style={[styles.reportFieldValue, styles.reportFieldValueLink]}>{report.userDisplayName || 'Someone'}</Text>
                    </TouchableOpacity>
                  </View>

                  {report.postId ? (
                    <>
                      <View style={styles.reportFieldRow}>
                        <View style={styles.reportFieldLabel}>
                          <Text style={styles.reportFieldLabelText}>POSTED BY</Text>
                        </View>
                        <TouchableOpacity
                          style={{ flex: 1 }}
                          disabled={!report.postAuthorId}
                          onPress={() => report.postAuthorId && router.push('/user/' + report.postAuthorId)}
                        >
                          <Text style={[styles.reportFieldValue, styles.reportFieldValueLink]}>{report.postAuthorName || 'Unknown'}</Text>
                        </TouchableOpacity>
                      </View>

                      <TouchableOpacity style={styles.reportPostPreview} onPress={() => report.postId && router.push('/post/' + report.postId)}>
                        <Text style={styles.reportPostPreviewContent} numberOfLines={2}>{report.postContent || '(post content unavailable)'}</Text>
                      </TouchableOpacity>
                    </>
                  ) : report.reportedUserId ? (
                    <View style={styles.reportFieldRow}>
                      <View style={styles.reportFieldLabel}>
                        <Text style={styles.reportFieldLabelText}>ABOUT</Text>
                      </View>
                      <TouchableOpacity style={{ flex: 1 }} onPress={() => router.push('/user/' + report.reportedUserId)}>
                        <Text style={[styles.reportFieldValue, styles.reportFieldValueLink]}>{report.reportedUserName || 'View profile'}</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <>
                      {report.reportedLocation ? (
                        <View style={styles.reportFieldRow}>
                          <View style={styles.reportFieldLabel}>
                            <Text style={styles.reportFieldLabelText}>WHERE</Text>
                          </View>
                          <Text style={[styles.reportFieldValue, { flex: 1 }]}>{report.reportedLocation}</Text>
                        </View>
                      ) : null}
                      {report.technicalContext ? (
                        <Text style={styles.metaLine}>
                          {report.technicalContext.platform} · OS {report.technicalContext.osVersion} · App v{report.technicalContext.appVersion || '—'}
                        </Text>
                      ) : null}
                    </>
                  )}

                  {reportStatus === 'open' ? (
                    <View style={styles.reportActions}>
                      {report.postId ? (
                        <TouchableOpacity style={styles.reportActionBtn} onPress={() => handleRemovePost(report)}>
                          <Ionicons name="trash-outline" size={15} color={Colors.midGrey} />
                          <Text style={styles.reportActionText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>Remove</Text>
                        </TouchableOpacity>
                      ) : null}
                      {(report.postId || report.reportedUserId) ? (
                        <>
                          <TouchableOpacity style={styles.reportActionBtn} onPress={() => openWarnModal(report)}>
                            <Ionicons name="warning-outline" size={15} color={Colors.midGrey} />
                            <Text style={styles.reportActionText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>Warn</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={styles.reportActionBtn} onPress={() => handleSuspendUser(report)}>
                            <Ionicons name="ban-outline" size={15} color={Colors.midGrey} />
                            <Text style={styles.reportActionText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>Suspend</Text>
                          </TouchableOpacity>
                        </>
                      ) : null}
                      <TouchableOpacity style={styles.reportActionBtn} onPress={() => handleDismissReport(report)}>
                        <Ionicons name="close-circle-outline" size={15} color={Colors.midGrey} />
                        <Text style={styles.reportActionText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>Dismiss</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View style={styles.reportActions}>
                      <TouchableOpacity style={styles.reportActionBtn} onPress={() => handleReopenReport(report)}>
                        <Ionicons name="refresh-outline" size={15} color={Colors.midGrey} />
                        <Text style={styles.reportActionText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>Reopen</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              ))
            )}
          </View>
        )}

        {/* SUSPENDED USERS */}
        {activeTab === 'suspended' && (
          <View style={styles.section}>
            {loadingSuspended ? (
              <ActivityIndicator color="#1B4F72" style={{ marginTop: 30 }} />
            ) : suspendedUsers.length === 0 ? (
              <View style={styles.empty}>
                <Ionicons name="checkmark-done-circle-outline" size={48} color={Colors.lightGrey} />
                <Text style={styles.emptyText}>No suspended users</Text>
              </View>
            ) : (
              suspendedUsers.map(u => (
                <View key={u.id} style={styles.suspendedRow}>
                  <View style={styles.suspendedAvatar}>
                    <Text style={styles.suspendedAvatarText}>{u.displayName?.[0]?.toUpperCase() || '?'}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.suspendedName}>{u.displayName || 'Unknown'}</Text>
                    <Text style={styles.suspendedSuburb}>{u.suburb}, {u.state}</Text>
                  </View>
                  <TouchableOpacity style={styles.unsuspendBtn} onPress={() => handleUnsuspend(u)}>
                    <Text style={styles.unsuspendBtnText}>Unsuspend</Text>
                  </TouchableOpacity>
                </View>
              ))
            )}
          </View>
        )}
      </ScrollView>

      <Modal visible={showWarnModal} transparent animationType="slide">
        <KeyboardAvoidingView style={styles.warnOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.warnSheet}>
            <View style={styles.warnHeaderBar}>
              <Text style={styles.warnHeaderText}>Warn {warnTarget?.postAuthorName || 'User'}</Text>
            </View>
            <View style={styles.warnPad}>
              <Text style={styles.warnLabel}>Message to send</Text>
              <TextInput
                style={styles.warnInput}
                placeholder="Explain what rule was broken and what needs to change..."
                placeholderTextColor={Colors.midGrey}
                value={warnMessage}
                onChangeText={setWarnMessage}
                multiline
                textAlignVertical="top"
              />
              <TouchableOpacity style={[styles.warnSendBtn, sendingWarning && { opacity: 0.7 }]} onPress={submitWarning} disabled={sendingWarning}>
                {sendingWarning ? <ActivityIndicator color={Colors.white} size="small" /> : <Text style={styles.warnSendBtnText}>Send Warning</Text>}
              </TouchableOpacity>
              <TouchableOpacity style={styles.warnCancelBtn} onPress={() => setShowWarnModal(false)}>
                <Text style={styles.warnCancelBtnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F2F2' },
  header: { backgroundColor: Colors.brandGreen, paddingTop: 56, paddingBottom: 16, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  bellBadge: { position: 'absolute', top: -4, right: -4, backgroundColor: '#E53935', borderRadius: 8, minWidth: 16, height: 16, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 3 },
  bellBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  headerCenter: { alignItems: 'center', marginLeft: 8 },
  mySuburb: { fontSize: 27, fontWeight: '800', color: Colors.white },
  suburbName: { fontSize: 17, color: '#FFD700', marginTop: 4 },
  pageHeader: { backgroundColor: '#C2D9E8', paddingVertical: 14, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, borderBottomWidth: 1, borderBottomColor: Colors.lightGrey },
  pageHeaderIconBadge: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.white, justifyContent: 'center', alignItems: 'center' },
  pageTitle: { fontSize: 21, fontWeight: '800', color: '#1B4F72', letterSpacing: 0.2 },
  tabRow: { flexDirection: 'row', padding: 12, gap: 8, backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.lightGrey },
  tabBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 25, backgroundColor: '#F0F0F0', borderWidth: 1.5, borderColor: Colors.midGrey },
  tabBtnActive: { backgroundColor: '#1B4F72', borderColor: '#1B4F72' },
  tabText: { fontSize: 13, color: Colors.midGrey, fontWeight: '700' },
  tabTextActive: { color: Colors.white, fontWeight: '800' },

  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', padding: 16, gap: 12 },
  statCard: { width: '47%', borderRadius: 16, padding: 16, gap: 6, alignItems: 'flex-start', borderWidth: 1, borderColor: '#D5D5D5' },
  statCardWide: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 14, borderWidth: 1, borderColor: '#D5D5D5' },
  statNumber: { fontSize: 26, fontWeight: '900', color: Colors.charcoal },
  statLabel: { fontSize: 12, color: Colors.midGrey, fontWeight: '600' },
  statsSectionHeader: { width: '100%', marginTop: 8, marginBottom: 2 },
  statsSectionTitle: { fontSize: 17, fontWeight: '800', color: Colors.charcoal },
  statRowLabel: { flex: 1, fontSize: 16, fontWeight: '600', color: Colors.charcoal },
  statRowNumber: { fontSize: 16, fontWeight: '800', color: Colors.brandGreen },

  section: { padding: 16, gap: 12 },

  userListCount: { fontSize: 13, fontWeight: '700', color: Colors.midGrey, marginBottom: 2 },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.white, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: '#D5D5D5' },
  userAvatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#C2D9E8', justifyContent: 'center', alignItems: 'center' },
  userAvatarText: { fontSize: 16, fontWeight: '800', color: '#1B4F72' },
  userName: { fontSize: 15, fontWeight: '700', color: Colors.charcoal },
  userEmail: { fontSize: 12, color: Colors.midGrey, marginTop: 1 },
  userSuburb: { fontSize: 12, color: Colors.midGrey, marginTop: 1 },
  userSuspendedBadge: { backgroundColor: '#FFF3E0', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 },
  userSuspendedBadgeText: { fontSize: 10, fontWeight: '800', color: '#E65100' },

  reportStatusRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  // Smaller and left-aligned (not full-width like the main tab bar
  // above), with an icon and meaning-based colors — this reads as a
  // filter within the Reports tab, not a second row of navigation tabs.
  // Muted-but-always-visible base color per chip (not neutral gray),
  // with a bolder, more saturated version layered on top when that
  // chip is the active filter — so the meaning (open=red,
  // resolved=green) is visible at a glance either way, not just once
  // you've clicked something.
  reportStatusChipOpen: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, backgroundColor: '#FFF5F5', borderWidth: 1, borderColor: '#FFCDD2' },
  reportStatusChipResolved: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, backgroundColor: '#F1F8F4', borderWidth: 1, borderColor: '#C8E6C9' },
  reportStatusChipActiveOpen: { backgroundColor: '#FFEBEE', borderColor: '#E53935', borderWidth: 1.5 },
  reportStatusChipActiveResolved: { backgroundColor: Colors.brandGreenPale, borderColor: Colors.brandGreen, borderWidth: 1.5 },
  reportStatusChipTextOpen: { fontSize: 12, fontWeight: '600', color: '#C62828' },
  reportStatusChipTextResolved: { fontSize: 12, fontWeight: '600', color: '#2E7D32' },
  reportStatusChipTextActiveOpen: { color: '#E53935', fontWeight: '800' },
  reportStatusChipTextActiveResolved: { color: Colors.brandGreen, fontWeight: '800' },

  reportCard: { backgroundColor: Colors.white, borderRadius: 16, padding: 14, gap: 10, borderWidth: 1.5, borderColor: '#D5D5D5' },
  reportCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  reasonHeading: { fontSize: 17, fontWeight: '800', color: Colors.charcoal, flexShrink: 1 },
  reportDate: { fontSize: 12, color: Colors.midGrey },
  reportDescription: { fontSize: 14, color: Colors.charcoal, lineHeight: 20 },

  reportFieldRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FAFAFA', borderRadius: 12, borderWidth: 1, borderColor: '#EFEFEF', paddingVertical: 8, paddingHorizontal: 10 },
  reportFieldLabel: { backgroundColor: '#C2D9E8', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 },
  reportFieldLabelAlt: { backgroundColor: '#E8EAF6' },
  reportFieldLabelText: { fontSize: 10, fontWeight: '900', color: '#1B4F72', letterSpacing: 0.3 },
  reportFieldLabelTextAlt: { color: '#3949AB' },
  reportFieldValue: { fontSize: 13, fontWeight: '600', color: Colors.charcoal },
  metaLine: { fontSize: 12, color: Colors.midGrey, marginTop: 2 },
  reportFieldValueLink: { color: '#1B4F72', textDecorationLine: 'underline' },

  reportPostPreview: { backgroundColor: '#FAFAFA', borderRadius: 12, padding: 10, borderWidth: 1, borderColor: '#EFEFEF' },
  reportPostPreviewContent: { fontSize: 13, color: Colors.charcoal },
  reportActions: { flexDirection: 'row', gap: 6, marginTop: 4 },
  reportActionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 8, borderRadius: 12, borderWidth: 1.5, backgroundColor: '#F0F0F0', borderColor: Colors.midGrey },
  reportActionText: { fontSize: 12, fontWeight: '700', color: Colors.midGrey },

  suspendedRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.white, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: '#D5D5D5' },
  suspendedAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#FFF3E0', justifyContent: 'center', alignItems: 'center' },
  suspendedAvatarText: { fontSize: 16, fontWeight: '800', color: '#E65100' },
  suspendedName: { fontSize: 15, fontWeight: '700', color: Colors.charcoal },
  suspendedSuburb: { fontSize: 12, color: Colors.midGrey, marginTop: 1 },
  unsuspendBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16, borderWidth: 1, borderColor: Colors.brandGreen },
  unsuspendBtnText: { fontSize: 13, fontWeight: '700', color: Colors.brandGreen },

  empty: { alignItems: 'center', paddingTop: 50, gap: 8 },
  emptyText: { fontSize: 15, color: Colors.midGrey },

  warnOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  warnSheet: { backgroundColor: Colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden' },
  warnHeaderBar: { backgroundColor: '#1B4F72', paddingTop: 14, paddingBottom: 16, alignItems: 'center' },
  warnHeaderText: { fontSize: 18, fontWeight: '800', color: Colors.white },
  warnPad: { padding: 16, paddingBottom: 32, gap: 10 },
  warnLabel: { fontSize: 13, fontWeight: '700', color: Colors.charcoal },
  warnInput: { borderWidth: 1, borderColor: Colors.lightGrey, borderRadius: 12, padding: 12, fontSize: 14, color: Colors.charcoal, height: 100 },
  warnSendBtn: { backgroundColor: '#1B4F72', borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  warnSendBtnText: { fontSize: 15, fontWeight: '700', color: Colors.white },
  warnCancelBtn: { paddingVertical: 12, alignItems: 'center' },
  warnCancelBtnText: { fontSize: 14, fontWeight: '600', color: Colors.midGrey },
});