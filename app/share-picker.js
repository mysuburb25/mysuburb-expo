import { useState, useCallback, useRef } from 'react';
import { View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { Colors } from '../constants/theme';
import AppName from '../components/AppName';

export default function SharePickerScreen() {
  const { user, profile } = useAuth();
  const { shareText, sharePostId } = useLocalSearchParams();
  const [searchText, setSearchText] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const debounceRef = useRef(null);

  const runSearch = useCallback(async (text) => {
    if (text.trim().length < 2) {
      setResults([]);
      setSearched(false);
      return;
    }
    setLoading(true);
    setSearched(true);
    try {
      // Firestore doesn't support real full-text search — this is a prefix
      // match on displayName, which is case-sensitive. Good enough for a
      // quick lookup, but typing "john" won't match a name stored "John".
      const q = query(
        collection(db, 'users'),
        where('displayName', '>=', text.trim()),
        where('displayName', '<=', text.trim() + '\uf8ff'),
        orderBy('displayName'),
        limit(25)
      );
      const snap = await getDocs(q);
      const matches = snap.docs
        .map(d => ({ uid: d.id, ...d.data() }))
        .filter(u => u.uid !== user?.uid); // never show yourself
      setResults(matches);
    } catch (e) {
      console.error('User search error:', e);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  const handleChangeText = (text) => {
    setSearchText(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(text), 350);
  };

  const handleSelectUser = (target) => {
    router.push({
      pathname: '/chat/' + target.uid,
      params: {
        userId: target.uid,
        userName: target.displayName,
        ...(shareText ? { prefillText: shareText } : {}),
      },
    });
  };

  return (
    <View style={styles.container}>
      <View style={styles.topHeader}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={Colors.white} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <AppName style={styles.mySuburb} />
          <Text style={styles.suburbName}>{profile?.suburb}, {profile?.state}</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>
      <View style={styles.pageHeader}>
        <Text style={styles.pageTitle}>{sharePostId ? 'Share With' : 'Find a Neighbour'}</Text>
      </View>

      <View style={styles.searchBox}>
        <Ionicons name="search" size={18} color={Colors.midGrey} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name..."
          placeholderTextColor={Colors.midGrey}
          value={searchText}
          onChangeText={handleChangeText}
          autoCapitalize="words"
          autoFocus
        />
        {loading && <ActivityIndicator size="small" color={Colors.brandGreen} />}
      </View>

      <FlatList
        data={results}
        keyExtractor={item => item.uid}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.userRow} onPress={() => handleSelectUser(item)}>
            {item.photoURL ? (
              <View style={styles.avatarWrap}>
                <Ionicons name="person-circle" size={44} color={Colors.lightGrey} />
              </View>
            ) : (
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{item.displayName?.[0]?.toUpperCase() || '?'}</Text>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.userName}>{item.displayName}</Text>
              {item.suburb && <Text style={styles.userSuburb}>{item.suburb}, {item.state}</Text>}
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.lightGrey} />
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          !loading && (
            <View style={styles.empty}>
              <Ionicons name={searched ? 'search-outline' : 'people-outline'} size={44} color={Colors.lightGrey} />
              <Text style={styles.emptyText}>
                {searched ? 'No matching users found' : 'Type at least 2 letters of a name to search'}
              </Text>
            </View>
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.white },
  topHeader: { backgroundColor: Colors.brandGreen, paddingTop: 56, paddingBottom: 16, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  headerCenter: { alignItems: 'center' },
  mySuburb: { fontSize: 27, fontWeight: '800', color: Colors.white },
  suburbName: { fontSize: 17, color: '#FFD700', marginTop: 4 },
  pageHeader: { backgroundColor: Colors.brandGreenPale, paddingVertical: 10, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: Colors.lightGrey },
  pageTitle: { fontSize: 20, fontWeight: '700', color: Colors.brandGreen },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 10, margin: 16, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: '#FAFAFA', borderRadius: 14, borderWidth: 1, borderColor: Colors.lightGrey },
  searchInput: { flex: 1, fontSize: 15, color: Colors.charcoal },
  list: { paddingHorizontal: 16, paddingBottom: 40, gap: 8 },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, backgroundColor: Colors.white, borderRadius: 14, borderWidth: 1, borderColor: Colors.lightGrey },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.brandGreenPale, justifyContent: 'center', alignItems: 'center' },
  avatarWrap: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: 17, fontWeight: '700', color: Colors.brandGreen },
  userName: { fontSize: 15, fontWeight: '700', color: Colors.charcoal },
  userSuburb: { fontSize: 12, color: Colors.midGrey, marginTop: 2 },
  empty: { alignItems: 'center', paddingTop: 60, gap: 10, paddingHorizontal: 32 },
  emptyText: { fontSize: 14, color: Colors.midGrey, textAlign: 'center', lineHeight: 20 },
});