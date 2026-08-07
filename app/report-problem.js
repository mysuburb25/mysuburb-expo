import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert, ActivityIndicator, Platform, KeyboardAvoidingView } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { collection, addDoc, serverTimestamp, query, where, getDocs } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../context/AuthContext';

const CATEGORIES = ['Bug or technical issue', 'Inappropriate content', 'Account issue', 'Safety concern', 'Other'];

export default function ReportProblemScreen() {
  const { user, profile } = useAuth();
  const insets = useSafeAreaInsets();
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [issueLocation, setIssueLocation] = useState('');
  const [loading, setLoading] = useState(false);
  const [reportedUser, setReportedUser] = useState(null); // { uid, displayName } | null
  const [userSearch, setUserSearch] = useState('');
  const [userResults, setUserResults] = useState([]);
  const [showUserResults, setShowUserResults] = useState(false);
  const [searchingUsers, setSearchingUsers] = useState(false);

  const isTechnicalIssue = category === 'Bug or technical issue';
  // Only these two categories are actually about someone's behavior —
  // asking "who is this about" for a bug report or generic account
  // issue wouldn't make sense.
  const needsReportedUser = category === 'Safety concern' || category === 'Inappropriate content';

  // Scoped to the reporter's own suburb, same as the suggestion pattern
  // used for @mentions elsewhere in the app — keeps results relevant
  // and avoids a full unscoped user search.
  const handleUserSearch = async (text) => {
    setUserSearch(text);
    setReportedUser(null);
    if (text.trim().length < 2 || !profile?.suburb || !profile?.state) {
      setUserResults([]);
      setShowUserResults(false);
      return;
    }
    setSearchingUsers(true);
    try {
      const key = `${profile.state}|${profile.suburb}`;
      const snap = await getDocs(query(collection(db, 'users'), where('activeSuburbKeys', 'array-contains', key)));
      const matches = snap.docs
        .map(d => ({ uid: d.id, displayName: d.data().displayName || '' }))
        .filter(m => m.displayName && m.uid !== user?.uid && m.displayName.toLowerCase().includes(text.trim().toLowerCase()))
        .slice(0, 5);
      setUserResults(matches);
      setShowUserResults(matches.length > 0);
    } catch (e) {
      console.error('User search error:', e);
    } finally {
      setSearchingUsers(false);
    }
  };

  const handleSelectReportedUser = (u) => {
    setReportedUser(u);
    setUserSearch(u.displayName);
    setShowUserResults(false);
  };

  const handleSubmit = async () => {
    if (!category) { Alert.alert('Error', 'Please select a category.'); return; }
    if (!description.trim()) { Alert.alert('Error', 'Please describe the problem.'); return; }

    setLoading(true);
    try {
      const reportData = {
        category,
        description: description.trim(),
        userId: user?.uid || null,
        userEmail: profile?.email || user?.email || null,
        userDisplayName: profile?.displayName || null,
        suburb: profile?.suburb || null,
        state: profile?.state || null,
        status: 'open',
        createdAt: serverTimestamp(),
      };

      // For bug reports specifically, capture technical context automatically
      // (device/app details, which are always accurate) alongside the
      // user's own description of where in the app it happened — auto-
      // detecting the screen isn't reliable here, since it would only ever
      // reflect wherever they navigated to in order to open this form, not
      // necessarily where the actual problem occurred.
      if (isTechnicalIssue) {
        reportData.reportedLocation = issueLocation.trim() || null;
        reportData.technicalContext = {
          platform: Platform.OS,
          osVersion: String(Platform.Version),
          appVersion: Constants.expoConfig?.version || null,
        };
      }

      if (needsReportedUser && reportedUser) {
        reportData.reportedUserId = reportedUser.uid;
        reportData.reportedUserName = reportedUser.displayName;
      }

      await addDoc(collection(db, 'reports'), reportData);

      Alert.alert('Report Submitted', 'Thank you for your report. We will review it within 24 hours.', [
        { text: 'OK', onPress: () => router.back() }
      ]);
    } catch (e) {
      Alert.alert('Error', 'Could not submit your report. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>Report a Problem</Text>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 60 + insets.bottom }]} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>Category</Text>
        <View style={styles.categories}>
          {CATEGORIES.map(cat => (
            <TouchableOpacity
              key={cat}
              style={[styles.catChip, category === cat && styles.catChipActive]}
              onPress={() => setCategory(cat)}
            >
              <Text
                style={[styles.catText, category === cat && styles.catTextActive]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
              >
                {cat}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {isTechnicalIssue && (
          <>
            <Text style={styles.label}>Where did this happen?</Text>
            <TextInput
              style={styles.locationInput}
              placeholder="e.g. Home feed, Create Post, Chat with a neighbour..."
              placeholderTextColor="#9CA3AF"
              value={issueLocation}
              onChangeText={setIssueLocation}
            />
          </>
        )}

        {needsReportedUser && (
          <>
            <Text style={styles.label}>Who is this about? (optional)</Text>
            <View style={styles.userSearchWrap}>
              <Ionicons name="search-outline" size={16} color="#9CA3AF" style={{ marginRight: 8 }} />
              <TextInput
                style={styles.userSearchInput}
                placeholder="Search their name..."
                placeholderTextColor="#9CA3AF"
                value={userSearch}
                onChangeText={handleUserSearch}
                onFocus={() => setShowUserResults(userResults.length > 0)}
              />
              {searchingUsers && <ActivityIndicator size="small" color="#2D6A4F" />}
              {reportedUser && (
                <Ionicons name="checkmark-circle" size={18} color="#2D6A4F" />
              )}
            </View>
            {showUserResults && (
              <View style={styles.userResultsBox}>
                {userResults.map(u => (
                  <TouchableOpacity key={u.uid} style={styles.userResultItem} onPress={() => handleSelectReportedUser(u)}>
                    <Text style={styles.userResultText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{u.displayName}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            <Text style={styles.userSearchHint}>
              If you know who this is about, search for their name so our team can review their account directly. Leave blank if you're not sure.
            </Text>
          </>
        )}

        <Text style={styles.label}>Describe the Problem</Text>
        <TextInput
          style={styles.input}
          placeholder={isTechnicalIssue
            ? "What were you trying to do, and what happened instead? Include any error message you saw..."
            : "Please describe what happened in as much detail as possible..."}
          placeholderTextColor="#9CA3AF"
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={6}
          textAlignVertical="top"
        />

        {isTechnicalIssue && (
          <View style={styles.techNote}>
            <Ionicons name="information-circle-outline" size={16} color="#6B7280" />
            <Text style={styles.techNoteText}>
              We'll automatically include your device type and app version to help us investigate.
            </Text>
          </View>
        )}

        <Text style={styles.hint}>We aim to review all reports within 24 hours. For urgent safety issues please call 000.</Text>

        <TouchableOpacity style={[styles.btn, loading && { opacity: 0.7 }]} onPress={handleSubmit} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>Submit Report</Text>}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  header: { backgroundColor: '#2D6A4F', paddingTop: 56, paddingBottom: 16, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#fff' },
  content: { padding: 20, gap: 8, paddingBottom: 60 },
  label: { fontSize: 14, fontWeight: '700', color: '#2D6A4F', marginTop: 12, marginBottom: 10 },
  categories: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  catChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: '#E5E7EB', backgroundColor: '#fff' },
  catChipActive: { backgroundColor: '#2D6A4F', borderColor: '#2D6A4F' },
  catText: { fontSize: 14, color: '#1B1F23', fontWeight: '500' },
  catTextActive: { color: '#fff', fontWeight: '700' },
  input: { borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 12, padding: 14, fontSize: 15, color: '#1B1F23', minHeight: 140 },
  locationInput: { borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 12, padding: 14, fontSize: 15, color: '#1B1F23' },
  userSearchWrap: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 4 },
  userSearchInput: { flex: 1, paddingVertical: 10, fontSize: 15, color: '#1B1F23' },
  userResultsBox: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, marginTop: 4, backgroundColor: '#fff', overflow: 'hidden' },
  userResultItem: { paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 0.5, borderBottomColor: '#F0F0F0' },
  userResultText: { fontSize: 14, color: '#1B1F23', fontWeight: '600' },
  userSearchHint: { fontSize: 12, color: '#9CA3AF', lineHeight: 17, marginTop: 4 },
  techNote: { flexDirection: 'row', gap: 8, backgroundColor: '#F3F4F6', borderRadius: 10, padding: 12, marginTop: 4, alignItems: 'flex-start' },
  techNoteText: { flex: 1, fontSize: 12, color: '#6B7280', lineHeight: 17 },
  hint: { fontSize: 13, color: '#9CA3AF', lineHeight: 20, marginTop: 8 },
  btn: { backgroundColor: '#2D6A4F', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 16 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
