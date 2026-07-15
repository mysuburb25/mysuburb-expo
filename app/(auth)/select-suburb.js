import { useState, useMemo, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, FlatList, Alert, ActivityIndicator, Modal, ScrollView, Keyboard, KeyboardAvoidingView, Platform } from 'react-native';
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

const SUBURB_SLOTS = [
  { key: 'primary',   label: 'Primary Suburb',  required: true  },
  { key: 'second',    label: 'Second Suburb',    required: false },
  { key: 'third',     label: 'Third Suburb',     required: false },
];

const emptySlot = () => ({ state: '', suburb: '', active: true });

// Builds the "STATE|suburb" key used by activeSuburbKeys so Firestore can
// array-contains query for any user who has this suburb active, regardless
// of whether it's their Primary, Second, or Third suburb.
const suburbKey = (state, suburb) => `${state}|${suburb}`;

export default function SelectSuburbScreen() {
  const { uid, email, displayName, phone } = useLocalSearchParams();
  const { createProfile, updateUserProfile, user, profile } = useAuth();
  const isEditing = !!profile?.suburb;

  const initSlots = () => {
    if (profile?.suburbs && profile.suburbs.length > 0) {
      return [
        profile.suburbs[0] || emptySlot(),
        profile.suburbs[1] || emptySlot(),
        profile.suburbs[2] || emptySlot(),
      ];
    }
    if (profile?.suburb) {
      return [
        { state: profile.state || '', suburb: profile.suburb, active: true },
        emptySlot(),
        emptySlot(),
      ];
    }
    return [emptySlot(), emptySlot(), emptySlot()];
  };

  const [slots, setSlots] = useState(initSlots());
  const [activeSlotIndex, setActiveSlotIndex] = useState(null); // which slot is being edited
  const [search, setSearch] = useState('');
  const [showStateModal, setShowStateModal] = useState(false);
  const [showSuburbList, setShowSuburbList] = useState(false);
  const [loading, setLoading] = useState(false);
  const searchRef = useRef(null);

  const filteredSuburbs = useMemo(() => {
    if (activeSlotIndex === null || !slots[activeSlotIndex]?.state) return [];
    const all = SUBURBS_BY_STATE[slots[activeSlotIndex].state] || [];
    if (!search.trim()) return all.slice(0, 50);
    return all.filter(s => s.toLowerCase().startsWith(search.toLowerCase())).slice(0, 50);
  }, [activeSlotIndex, slots, search]);

  const openStateModal = (index) => {
    Keyboard.dismiss();
    setActiveSlotIndex(index);
    setSearch('');
    setShowSuburbList(false);
    setTimeout(() => setShowStateModal(true), 150);
  };

  const handleSelectState = (state) => {
    setSlots(prev => prev.map((s, i) => i === activeSlotIndex ? { ...s, state, suburb: '' } : s));
    setSearch('');
    setShowStateModal(false);
    setShowSuburbList(true);
    setTimeout(() => searchRef.current?.focus(), 300);
  };

  const handleSelectSuburb = (suburb) => {
    setSlots(prev => prev.map((s, i) => i === activeSlotIndex ? { ...s, suburb, active: true } : s));
    setSearch('');
    setShowSuburbList(false);
    Keyboard.dismiss();
    searchRef.current?.blur();
  };

  const handleClearSlot = (index) => {
    if (index === 0) {
      Alert.alert('Cannot clear', 'Primary suburb is required.');
      return;
    }
    setSlots(prev => prev.map((s, i) => i === index ? emptySlot() : s));
    if (activeSlotIndex === index) {
      setActiveSlotIndex(null);
      setShowSuburbList(false);
    }
  };

  const handleSave = async () => {
    if (!slots[0].suburb || !slots[0].state) {
      Alert.alert('Error', 'Please select your primary suburb.');
      return;
    }

    const filledSlots = slots.filter(s => s.suburb && s.state);

    // Guard against selecting the same suburb+state in more than one slot.
    const seen = new Set();
    for (const s of filledSlots) {
      const key = suburbKey(s.state, s.suburb);
      if (seen.has(key)) {
        Alert.alert('Duplicate suburb', 'You\'ve selected the same suburb more than once.');
        return;
      }
      seen.add(key);
    }

    setLoading(true);
    try {
      const activeSuburbKeys = filledSlots
        .filter(s => s.active)
        .map(s => suburbKey(s.state, s.suburb));

      const data = {
        suburb: slots[0].suburb,
        state: slots[0].state,
        suburbs: filledSlots,
        activeSuburbKeys,
      };
      if (isEditing) {
        await updateUserProfile(data);
        router.back();
      } else {
        // isPhoneAccount is recorded permanently, once, right here at
        // signup — this is the only moment it's safe to infer account
        // type from whether a phone number was provided. Later on, phone
        // may also get added to an email account as a plain contact
        // field (via Edit Profile), so profile.phone alone can never be
        // used to infer signup method after this point — see edit-profile.js.
        await createProfile(uid || user?.uid, {
          email: email || user?.email,
          displayName: displayName || user?.displayName,
          photoURL: null,
          isPhoneAccount: !!phone,
          ...(phone ? { phone } : {}),
          ...data,
        });
        router.replace('/dashboard');
      }
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.headerBar}>
        <Text style={styles.headerTitle}>My Suburb</Text>
        <Text style={styles.headerTagline}>
          {isEditing ? `${profile?.suburb}, ${profile?.state}` : 'Bringing suburbs together'}
        </Text>
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 40 }} automaticallyAdjustKeyboardInsets={true}>
        <View style={styles.topSection}>
          <Text style={styles.title}>{isEditing ? 'My Suburbs' : 'Select Your Suburbs'}</Text>
          <Text style={styles.subtitle}>Select up to 3 suburbs. Your Primary suburb is where your posts will appear.</Text>

          {SUBURB_SLOTS.map((slot, index) => (
            <View key={slot.key} style={styles.slotSection}>
              <Text style={styles.slotLabel}>
                {slot.label} {slot.required ? <Text style={styles.required}>*</Text> : <Text style={styles.optionalLabel}>(optional)</Text>}
              </Text>

              {/* State selector */}
              <TouchableOpacity
                style={[styles.selectorBtn, activeSlotIndex === index && styles.selectorBtnActive]}
                onPress={() => openStateModal(index)}
              >
                <Ionicons name={STATE_ICONS[slots[index].state] || 'map-outline'} size={18} color={Colors.brandGreen} />
                <Text style={[styles.selectorBtnText, !slots[index].state && { color: Colors.midGrey }]}>
                  {slots[index].state || 'Select state...'}
                </Text>
                <Ionicons name="chevron-down" size={16} color={Colors.midGrey} />
              </TouchableOpacity>

              {/* Suburb search - only show when this slot is active and has state */}
              {activeSlotIndex === index && slots[index].state && !slots[index].suburb && (
                <View style={styles.searchBox}>
                  <Ionicons name="search-outline" size={18} color={Colors.brandGreen} />
                  <TextInput
                    ref={searchRef}
                    style={styles.searchInput}
                    placeholder={`Search suburb in ${slots[index].state}...`}
                    placeholderTextColor={Colors.midGrey}
                    value={search}
                    onChangeText={(t) => { setSearch(t); setShowSuburbList(true); }}
                    onFocus={() => setShowSuburbList(true)}
                    autoCapitalize="words"
                    autoCorrect={false}
                  />
                  {search.length > 0 && (
                    <TouchableOpacity onPress={() => setSearch('')}>
                      <Ionicons name="close-circle" size={18} color={Colors.midGrey} />
                    </TouchableOpacity>
                  )}
                </View>
              )}

              {/* Selected suburb badge */}
              {slots[index].suburb ? (
                <View style={styles.selectedBadge}>
                  <Ionicons name="location" size={16} color={Colors.brandGreen} />
                  <Text style={styles.selectedBadgeText}>{slots[index].suburb}, {slots[index].state}</Text>
                  <TouchableOpacity onPress={() => {
                    setSlots(prev => prev.map((s, i) => i === index ? { ...s, suburb: '' } : s));
                    setActiveSlotIndex(index);
                    setSearch('');
                    setShowSuburbList(true);
                    setTimeout(() => searchRef.current?.focus(), 100);
                  }}>
                    <Ionicons name="pencil-outline" size={16} color={Colors.brandGreen} />
                  </TouchableOpacity>
                  {index > 0 && (
                    <TouchableOpacity onPress={() => handleClearSlot(index)}>
                      <Ionicons name="close-circle" size={18} color="#E53935" />
                    </TouchableOpacity>
                  )}
                </View>
              ) : null}

              {/* Suburb list dropdown */}
              {activeSlotIndex === index && showSuburbList && slots[index].state && !slots[index].suburb && (
                <View style={styles.dropdownList}>
                  {filteredSuburbs.length === 0 ? (
                    <Text style={styles.emptyListText}>No suburbs found</Text>
                  ) : (
                    filteredSuburbs.map(item => (
                      <TouchableOpacity key={item} style={styles.dropdownItem} onPress={() => handleSelectSuburb(item)}>
                        <Ionicons name="location-outline" size={14} color={Colors.brandGreen} />
                        <Text style={styles.dropdownItemText}>{item}</Text>
                      </TouchableOpacity>
                    ))
                  )}
                </View>
              )}
            </View>
          ))}
        </View>

        {/* Save button */}
        <View style={styles.saveWrap}>
          <TouchableOpacity style={[styles.button, loading && styles.buttonDisabled]} onPress={handleSave} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{isEditing ? 'Save Changes' : 'Continue'}</Text>}
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* State modal */}
      <Modal visible={showStateModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Select State or Territory</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {AustralianStates.map(state => (
                <TouchableOpacity
                  key={state}
                  style={[styles.modalItem, slots[activeSlotIndex]?.state === state && styles.modalItemActive]}
                  onPress={() => handleSelectState(state)}
                >
                  <View style={[styles.modalItemIcon, slots[activeSlotIndex]?.state === state && styles.modalItemIconActive]}>
                    <Ionicons name={STATE_ICONS[state] || 'map-outline'} size={18} color={slots[activeSlotIndex]?.state === state ? Colors.white : Colors.brandGreen} />
                  </View>
                  <Text style={[styles.modalItemText, slots[activeSlotIndex]?.state === state && styles.modalItemTextActive]}>{state}</Text>
                  {slots[activeSlotIndex]?.state === state && <Ionicons name="checkmark-circle" size={20} color={Colors.brandGreen} />}
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
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.white },
  headerBar: { backgroundColor: Colors.brandGreen, paddingTop: 56, paddingBottom: 16, alignItems: 'center' },
  headerTitle: { fontSize: 27, fontWeight: '800', color: Colors.white },
  headerTagline: { fontSize: 17, color: '#FFD700', marginTop: 4 },
  topSection: { padding: 20 },
  title: { fontSize: 22, fontWeight: '800', color: Colors.brandGreen, marginBottom: 6 },
  subtitle: { fontSize: 13, color: Colors.midGrey, marginBottom: 24, lineHeight: 18 },
  slotSection: { marginBottom: 24 },
  slotLabel: { fontSize: 15, fontWeight: '700', color: Colors.brandGreen, marginBottom: 8 },
  optionalLabel: { fontSize: 13, fontWeight: '500', color: Colors.midGrey },
  required: { color: '#E53935' },
  selectorBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1.5, borderColor: Colors.lightGrey, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#FAFAFA' },
  selectorBtnActive: { borderColor: Colors.brandGreen, backgroundColor: Colors.brandGreenPale },
  selectorBtnText: { flex: 1, fontSize: 15, color: Colors.brandGreen, fontWeight: '600' },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.white, borderRadius: 14, borderWidth: 1.5, borderColor: Colors.brandGreen, paddingHorizontal: 14, paddingVertical: 13, marginTop: 8 },
  searchInput: { flex: 1, fontSize: 15, color: Colors.charcoal },
  selectedBadge: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, padding: 12, backgroundColor: Colors.brandGreenPale, borderRadius: 12, borderWidth: 1, borderColor: Colors.brandGreen + '40' },
  selectedBadgeText: { flex: 1, fontSize: 14, fontWeight: '600', color: Colors.brandGreen },
  dropdownList: { marginTop: 4, borderWidth: 1, borderColor: Colors.lightGrey, borderRadius: 12, backgroundColor: Colors.white, maxHeight: 200, overflow: 'hidden' },
  dropdownItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: Colors.lightGrey },
  dropdownItemText: { fontSize: 14, color: Colors.charcoal },
  emptyListText: { fontSize: 14, color: Colors.midGrey, padding: 16, textAlign: 'center' },
  saveWrap: { paddingHorizontal: 20, paddingBottom: 20 },
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
  modalItemText: { flex: 1, fontSize: 16, color: Colors.charcoal },
  modalItemTextActive: { color: Colors.brandGreen, fontWeight: '700' },
  modalCloseBtn: { backgroundColor: Colors.brandGreen, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  modalCloseBtnText: { fontSize: 16, fontWeight: '700', color: Colors.white },
});