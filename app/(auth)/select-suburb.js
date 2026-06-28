import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { Colors, AustralianStates } from '../../constants/theme';

export default function SelectSuburbScreen() {
  const { uid, email, displayName } = useLocalSearchParams();
  const { createProfile, updateUserProfile, user, profile } = useAuth();
  const [selectedState, setSelectedState] = useState(profile?.state || '');
  const [suburb, setSuburb] = useState(profile?.suburb || '');
  const [loading, setLoading] = useState(false);
  const isEditing = !!profile?.suburb;

  const handleSave = async () => {
    if (!selectedState || !suburb.trim()) {
      Alert.alert('Error', 'Please select your state and enter your suburb.');
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
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>{isEditing ? 'Change Suburb' : 'Select Your Suburb'}</Text>
      <Text style={styles.subtitle}>Your feed will show posts from your suburb only.</Text>
      <Text style={styles.label}>State / Territory</Text>
      <View style={styles.stateGrid}>
        {AustralianStates.map((state) => (
          <TouchableOpacity
            key={state}
            style={[styles.stateChip, selectedState === state && styles.stateChipSelected]}
            onPress={() => setSelectedState(state)}
          >
            <Text style={[styles.stateChipText, selectedState === state && styles.stateChipTextSelected]}>
              {state}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={styles.label}>Suburb</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. Paddington"
        value={suburb}
        onChangeText={setSuburb}
        autoCapitalize="words"
      />
      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handleSave}
        disabled={loading}
      >
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{isEditing ? 'Save Changes' : 'Continue'}</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: Colors.sand, padding: 24, paddingTop: 60 },
  title: { fontSize: 26, fontWeight: '800', color: Colors.charcoal, marginBottom: 8 },
  subtitle: { fontSize: 15, color: Colors.midGrey, marginBottom: 32 },
  label: { fontSize: 14, fontWeight: '600', color: Colors.charcoal, marginBottom: 12, marginTop: 8 },
  stateGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 },
  stateChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: Colors.lightGrey, backgroundColor: Colors.white },
  stateChipSelected: { backgroundColor: Colors.brandGreen, borderColor: Colors.brandGreen },
  stateChipText: { fontSize: 13, color: Colors.charcoal },
  stateChipTextSelected: { color: Colors.white, fontWeight: '600' },
  input: { backgroundColor: Colors.white, borderRadius: 12, padding: 14, fontSize: 15, borderWidth: 1, borderColor: Colors.lightGrey, color: Colors.charcoal, marginBottom: 24 },
  button: { backgroundColor: Colors.brandGreen, borderRadius: 12, padding: 16, alignItems: 'center' },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});