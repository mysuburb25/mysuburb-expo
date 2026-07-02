import { useState, useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, FlatList, Alert, ActivityIndicator, Modal, ScrollView, Keyboard, TouchableWithoutFeedback } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { Colors, AustralianStates } from '../../constants/theme';
import SUBURBS_BY_STATE from '../../constants/suburbs.json';

const STATE_ICONS = {
  'New South Wales':             'sunny-outline',
  'Victoria':                    'business-outline',
  'Queensland':                  'partly-sunny-outline',
  'Western Australia':           'water-outline',
  'South Australia':             'wine-outline',
  'Tasmania':                    'snow-outline',
  'Australian Capital Territory':'library-outline',
  'Northern Territory':          'globe-outline',
};

export default function SelectSuburbScreen() {
  const { uid, email, displayName } = useLocalSearchParams();
  const { createProfile, updateUserProfile, user, profile } = useAuth();
  const [selectedState, setSelectedState] = useState(profile?.state || '');
  const [suburb, setSuburb] = useState(profile?.suburb || '');
  const [search, setSearch] = useState('');
  const [showStateModal, setShowStateModal] = useState(false);
  const [showSuburbList, setShowSuburbList] = useState(false);
  const [loading, setLoading] = useState(false);
  const isEditing = !!profile?.suburb;

  const filteredSuburbs = useMemo(() => {
    if (!selectedState) return [];
    const all = SUBURBS_BY_STATE[selectedState] || [];
    if (!search.trim()) return all.slice(0, 50);
    return all.filter(s => s.toLowerCase().startsWith(search.toLowerCase())).slice(0, 50);
  }, [selectedState, search]);

  const handleSelectState = (state) => {
    setSelectedState(state);
    setSuburb('');
    setSearch('');
    setShowSuburbList(true);
    setShowStateModal(false);
  };

  const handleSelectSuburb = (s) => {
    setSuburb(s);
    setSearch(s);
    setShowSuburbList(false);
    Keyboard.dismiss();
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
          photoURL: null,
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

      {/* Fixed top */}
      <View style={styles.topSection}>
        <Text style={styles.title}>{isEditing ? 'Change Suburb' : 'Select Your Suburb'}</Text>
        <Text style={styles.subtitle}>Your feed will show posts from your suburb only.</Text>

        {/* State button */}
        <Text style={styles.label}>State or Territory</Text>
        <TouchableOpacity
          style={styles.selectorBtn}
          onPress={() => {
            Keyboard.dismiss();
            setShowSuburbList(false);
            setTimeout(() => setShowStateModal(true), 200);
          }}
        >
          <Ionicons name={STATE_ICONS[selectedState] || 'map-outline'} size={18} color={Colors.brandGreen} />
          <Text style={[styles.selectorBtnText, !selectedState && { color: Colors.midGrey }]}>
            {selectedState || 'Select your state...'}
          </Text>
          <Ionicons name="chevron-down" size={18} color={Colors.brandGreen} />
        </TouchableOpacity>

        {/* Suburb search - ONLY shows when no suburb selected */}
        {selectedState && !suburb ? (
          <View style={{ marginTop: 16 }}>
            <Text style={styles.label}>Suburb in {selectedState}</Text>
            <View style={styles.searchBox}>
              <Ionicons name="search-outline" size={18} color={Colors.brandGreen} />
              <TextInput
                style={styles.searchInput}
                placeholder="Type suburb name..."
                placeholderTextColor={Colors.midGrey}
                value={search}
                onChangeText={(t) => { setSearch(t); setShowSuburbList(true); }}
                onFocus={() => setShowSuburbList(true)}
                autoCapitalize="words"
                autoCorrect={false}
              />
              {search.length > 0 && (
                <TouchableOpacity onPress={() => { setSearch(''); setShowSuburbList(true); }}>
                  <Ionicons name="close-circle" size={18} color={Colors.midGrey} />
                </TouchableOpacity>
              )}
            </View>
          </View>
        ) : null}

        {/* Selected suburb badge - shows INSTEAD of TextInput */}
        {suburb ? (
          <TouchableWithoutFeedback onPress={() => { Keyboard.dismiss(); setSuburb(''); setSearch(''); setShowSuburbList(true); }}>
            <View style={[styles.selectedBadge, { marginTop: 16 }]}>
              <Ionicons name="checkmark-circle" size={20} color={Colors.brandGreen} />
              <Text style={styles.selectedText}><Text style={{ fontWeight: '800' }}>{suburb}</Text>, {selectedState}</Text>
              <Ionicons name="pencil-outline" size={16} color={Colors.brandGreen} />
            </View>
          </TouchableWithoutFeedback>
        ) : null}
      </View>

      {/* Suburb results list */}
      {showSuburbList && !suburb ? (
        <FlatList
          data={filteredSuburbs}
          keyExtractor={item => item}
          keyboardShouldPersistTaps="always"
          keyboardDismissMode="none"
          style={styles.suburbList}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.suburbItem} onPress={() => handleSelectSuburb(item)}>
              <View style={styles.suburbItemIcon}>
                <Ionicons name="location-outline" size={16} color={Colors.brandGreen} />
              </View>
              <Text style={styles.suburbItemText}>{item}</Text>
            </TouchableOpacity>
          )}
          ListEmptyComponent={<View style={styles.emptyList}><Text style={styles.emptyListText}>No suburbs found</Text></View>}
        />
      ) : null}

      {/* Continue button */}
      {suburb && !showSuburbList ? (
        <View style={styles.saveWrap}>
          <TouchableOpacity style={[styles.button, loading && styles.buttonDisabled]} onPress={handleSave} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{isEditing ? 'Save Changes' : 'Continue'}</Text>}
          </TouchableOpacity>
        </View>
      ) : null}

      {/* State modal */}
      <Modal visible={showStateModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Select State or Territory</Text>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="always">
              {AustralianStates.map(state => (
                <TouchableOpacity
                  key={state}
                  style={[styles.modalItem, selectedState === state && styles.modalItemActive]}
                  onPress={() => handleSelectState(state)}
                >
                  <View style={[styles.modalItemIcon, selectedState === state && styles.modalItemIconActive]}>
                    <Ionicons name={STATE_ICONS[state] || 'map-outline'} size={18} color={selectedState === state ? Colors.white : Colors.brandGreen} />
                  </View>
                  <Text style={[styles.modalItemText, selectedState === state && styles.modalItemTextActive]}>{state}</Text>
                  {selectedState === state && <Ionicons name="checkmark-circle" size={20} color={Colors.brandGreen} />}
                </TouchableOpacity>
              ))}
              <View style={{ height: 20 }} />
            </ScrollView>
            <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setShowStateModal(false)}>
              <Text style={styles.modalCloseBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.white },
  headerBar: { backgroundColor: Colors.brandGreen, paddingTop: 56, paddingBottom: 16, alignItems: 'center' },
  headerTitle: { fontSize: 27, fontWeight: '800', color: Colors.white },
  topSection: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8 },
  title: { fontSize: 22, fontWeight: '800', color: Colors.brandGreen, marginBottom: 6 },
  subtitle: { fontSize: 14, color: Colors.midGrey, marginBottom: 20 },
  label: { fontSize: 13, fontWeight: '700', color: Colors.brandGreen, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  selectorBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1.5, borderColor: Colors.brandGreen, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, backgroundColor: Colors.brandGreenPale },
  selectorBtnText: { flex: 1, fontSize: 16, color: Colors.brandGreen, fontWeight: '800' },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.white, borderRadius: 14, borderWidth: 1.5, borderColor: Colors.brandGreen, paddingHorizontal: 14, paddingVertical: 13 },
  searchInput: { flex: 1, fontSize: 15, color: Colors.charcoal, fontWeight: '600' },
  selectedBadge: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, backgroundColor: Colors.brandGreenPale, borderRadius: 14, borderWidth: 1.5, borderColor: Colors.brandGreen },
  selectedText: { flex: 1, fontSize: 15, color: Colors.brandGreen },
  suburbList: { flex: 1 },
  separator: { height: 1, backgroundColor: Colors.lightGrey, marginLeft: 56 },
  suburbItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 14 },
  suburbItemIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.brandGreenPale, justifyContent: 'center', alignItems: 'center' },
  suburbItemText: { fontSize: 15, color: Colors.charcoal, fontWeight: '400' },
  emptyList: { alignItems: 'center', paddingTop: 40 },
  emptyListText: { fontSize: 15, color: Colors.midGrey },
  saveWrap: { padding: 20, borderTopWidth: 1, borderTopColor: Colors.lightGrey },
  button: { backgroundColor: Colors.brandGreen, borderRadius: 14, padding: 16, alignItems: 'center' },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: Colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 32, maxHeight: '75%' },
  modalHandle: { width: 40, height: 4, backgroundColor: Colors.lightGrey, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: Colors.brandGreen, textAlign: 'center', marginBottom: 16 },
  modalItem: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, paddingHorizontal: 8, borderRadius: 14, marginBottom: 4 },
  modalItemActive: { backgroundColor: Colors.brandGreenPale },
  modalItemIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.brandGreenPale, justifyContent: 'center', alignItems: 'center' },
  modalItemIconActive: { backgroundColor: Colors.brandGreen },
  modalItemText: { flex: 1, fontSize: 16, color: Colors.charcoal, fontWeight: '400' },
  modalItemTextActive: { color: Colors.brandGreen, fontWeight: '800' },
  modalCloseBtn: { backgroundColor: Colors.brandGreen, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  modalCloseBtnText: { fontSize: 16, fontWeight: '700', color: Colors.white },
});