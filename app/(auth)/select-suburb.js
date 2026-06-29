import { useState, useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, FlatList, Alert, ActivityIndicator } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { Colors, AustralianStates } from '../../constants/theme';
import SUBURBS_BY_STATE from '../../constants/suburbs.json';

export default function SelectSuburbScreen() {
  const { uid, email, displayName } = useLocalSearchParams();
  const { createProfile, updateUserProfile, user, profile } = useAuth();
  const [selectedState, setSelectedState] = useState(profile?.state || '');
  const [suburb, setSuburb] = useState(profile?.suburb || '');
  const [search, setSearch] = useState(profile?.suburb || '');
  const [showStateDropdown, setShowStateDropdown] = useState(false);
  const [showSuburbDropdown, setShowSuburbDropdown] = useState(false);
  const [loading, setLoading] = useState(false);
  const isEditing = !!profile?.suburb;

  const filteredSuburbs = useMemo(() => {
    if (!selectedState) return [];
    const all = SUBURBS_BY_STATE[selectedState] || [];
    if (!search.trim()) return all;
    return all.filter(s => s.toLowerCase().startsWith(search.toLowerCase()));
  }, [selectedState, search]);

  const handleSelectState = (state) => {
    setSelectedState(state);
    setSuburb('');
    setSearch('');
    setShowStateDropdown(false);
    setShowSuburbDropdown(true);
  };

  const handleSelectSuburb = (s) => {
    setSuburb(s);
    setSearch(s);
    setShowSuburbDropdown(false);
  };

  const handleSave = async () => {
    if (!selectedState || !suburb.trim()) {
      Alert.alert('Error', 'Please select your state and suburb.');
      return;
    }
    setLoading(true);
    try {
      if (isEditing) {
        await updateUserProfile({ state: selectedState, suburb: suburb.trim() });
      } else {
        await createProfile(uid || user?.uid, {
          email: email || user?.email,
          displayName: displayName || user?.displayName,
          state: selectedState,
          suburb: suburb.trim(),
          photoUrl: null,
        });
      }
      router.replace('/(tabs)');
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerBar}>
        <Text style={styles.headerTitle}>My Suburb</Text>
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{isEditing ? 'Change Suburb' : 'Select Your Suburb'}</Text>
        <Text style={styles.subtitle}>Your feed will show posts from your suburb only.</Text>

        {/* State Dropdown */}
        <Text style={styles.label}>State or Territory</Text>
        <TouchableOpacity
          style={styles.dropdownBtn}
          onPress={() => setShowStateDropdown(!showStateDropdown)}
        >
          <Text style={[styles.dropdownBtnText, !selectedState && { color: Colors.midGrey }]}>
            {selectedState || 'Select your state...'}
          </Text>
          <Ionicons name={showStateDropdown ? 'chevron-up' : 'chevron-down'} size={20} color={Colors.brandGreen} />
        </TouchableOpacity>

        {showStateDropdown && (
          <View style={styles.stateDropdown}>
            {AustralianStates.map(state => (
              <TouchableOpacity
                key={state}
                style={[styles.stateItem, selectedState === state && styles.stateItemSelected]}
                onPress={() => handleSelectState(state)}
              >
                <Ionicons name="location-outline" size={16} color={selectedState === state ? Colors.white : Colors.brandGreen} />
                <Text style={[styles.stateItemText, selectedState === state && styles.stateItemTextSelected]}>
                  {state}
                </Text>
                {selectedState === state && <Ionicons name="checkmark" size={16} color={Colors.white} />}
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Suburb Search */}
        {selectedState ? (
          <View style={{ marginTop: 16 }}>
            <Text style={styles.label}>Suburb in {selectedState}</Text>
            <View style={styles.searchBox}>
              <Ionicons name="search-outline" size={18} color={Colors.midGrey} />
              <TextInput
                style={styles.searchInput}
                placeholder="Type suburb name..."
                placeholderTextColor={Colors.midGrey}
                value={search}
                onChangeText={(text) => { setSearch(text); setSuburb(''); setShowSuburbDropdown(true); }}
                onFocus={() => setShowSuburbDropdown(true)}
                autoCapitalize="words"
              />
              {search.length > 0 && (
                <TouchableOpacity onPress={() => { setSearch(''); setSuburb(''); setShowSuburbDropdown(true); }}>
                  <Ionicons name="close-circle" size={18} color={Colors.midGrey} />
                </TouchableOpacity>
              )}
            </View>

            {showSuburbDropdown && filteredSuburbs.length > 0 && !suburb && (
              <View style={styles.suburbDropdown}>
                <FlatList
                  data={filteredSuburbs}
                  keyExtractor={item => item}
                  style={{ maxHeight: 240 }}
                  keyboardShouldPersistTaps="handled"
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={styles.suburbItem}
                      onPress={() => handleSelectSuburb(item)}
                    >
                      <Ionicons name="location-outline" size={14} color={Colors.brandGreen} />
                      <Text style={styles.suburbItemText}>{item}</Text>
                    </TouchableOpacity>
                  )}
                />
              </View>
            )}

            {suburb ? (
              <View style={styles.selectedBadge}>
                <Ionicons name="checkmark-circle" size={18} color={Colors.brandGreen} />
                <Text style={styles.selectedText}>
                  Selected: <Text style={{ fontWeight: '700' }}>{suburb}</Text>
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {suburb && selectedState ? (
          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleSave}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.buttonText}>{isEditing ? 'Save Changes' : 'Continue'}</Text>}
          </TouchableOpacity>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.white },
  headerBar: { backgroundColor: Colors.brandGreen, paddingTop: 56, paddingBottom: 16, alignItems: 'center' },
  headerTitle: { fontSize: 27, fontWeight: '800', color: Colors.white },
  body: { padding: 24, paddingBottom: 60 },
  title: { fontSize: 24, fontWeight: '800', color: Colors.brandGreen, marginBottom: 8 },
  subtitle: { fontSize: 15, color: Colors.midGrey, marginBottom: 24 },
  label: { fontSize: 15, fontWeight: '700', color: Colors.brandGreen, marginBottom: 10 },
  dropdownBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1.5, borderColor: Colors.lightGrey, borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 14, backgroundColor: Colors.white,
  },
  dropdownBtnText: { fontSize: 16, color: Colors.charcoal, fontWeight: '600' },
  stateDropdown: {
    borderWidth: 1, borderColor: Colors.lightGrey, borderRadius: 12,
    marginTop: 4, overflow: 'hidden', backgroundColor: Colors.white,
  },
  stateItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 14, borderBottomWidth: 0.5, borderBottomColor: Colors.lightGrey,
  },
  stateItemSelected: { backgroundColor: Colors.brandGreen },
  stateItemText: { flex: 1, fontSize: 15, color: Colors.charcoal, fontWeight: '500' },
  stateItemTextSelected: { color: Colors.white, fontWeight: '700' },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.white, borderRadius: 12,
    borderWidth: 1.5, borderColor: Colors.lightGrey,
    paddingHorizontal: 14, paddingVertical: 12, marginBottom: 4,
  },
  searchInput: { flex: 1, fontSize: 15, color: Colors.charcoal },
  suburbDropdown: {
    backgroundColor: Colors.white, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.lightGrey,
    marginBottom: 12, overflow: 'hidden',
  },
  suburbItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 14, borderBottomWidth: 0.5, borderBottomColor: Colors.lightGrey,
  },
  suburbItemText: { fontSize: 15, color: Colors.charcoal },
  selectedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    padding: 12, backgroundColor: Colors.brandGreenPale,
    borderRadius: 10, marginTop: 8,
  },
  selectedText: { fontSize: 14, color: Colors.brandGreen },
  button: {
    backgroundColor: Colors.brandGreen, borderRadius: 12,
    padding: 16, alignItems: 'center', marginTop: 24,
  },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});