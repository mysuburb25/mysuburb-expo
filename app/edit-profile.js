import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { EmailAuthProvider, reauthenticateWithCredential, updateEmail } from 'firebase/auth';
import { auth } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { Colors } from '../constants/theme';
import AppName from '../components/AppName';

export default function EditProfileScreen() {
  const { profile, updateUserProfile } = useAuth();
  const insets = useSafeAreaInsets();

  const parseName = (fullName) => {
    const trimmed = (fullName || '').trim();
    if (!trimmed) return { first: '', last: '' };
    const spaceIndex = trimmed.indexOf(' ');
    if (spaceIndex === -1) return { first: trimmed, last: '' };
    return { first: trimmed.slice(0, spaceIndex), last: trimmed.slice(spaceIndex + 1) };
  };
  const originalName = parseName(profile?.displayName);

  const [firstName, setFirstName] = useState(originalName.first);
  const [lastName, setLastName] = useState(originalName.last);
  const [email, setEmail] = useState(profile?.email || '');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const nameChanged = firstName.trim() !== originalName.first || lastName.trim() !== originalName.last;
  const emailChanged = email.trim() !== (profile?.email || '');
  const needsReauth = emailChanged;

  const handleSave = async () => {
    if (!firstName.trim()) { Alert.alert('Error', 'First name cannot be empty.'); return; }
    if (emailChanged && !email.trim()) { Alert.alert('Error', 'Email cannot be empty.'); return; }
    if (!nameChanged && !emailChanged) { router.back(); return; }
    if (needsReauth && !password) { Alert.alert('Error', 'Please enter your current password to confirm this change.'); return; }

    setLoading(true);
    try {
      const user = auth.currentUser;

      if (needsReauth) {
        if (!user?.email) { Alert.alert('Error', 'Could not find your account. Please sign in again.'); setLoading(false); return; }
        const credential = EmailAuthProvider.credential(user.email, password);
        await reauthenticateWithCredential(user, credential);
      }

      const firestoreUpdates = {};
      if (nameChanged) firestoreUpdates.displayName = [firstName.trim(), lastName.trim()].filter(Boolean).join(' ');

      if (emailChanged) {
        await updateEmail(user, email.trim());
        firestoreUpdates.email = email.trim();
      }

      if (Object.keys(firestoreUpdates).length > 0) {
        await updateUserProfile(firestoreUpdates);
      }

      Alert.alert('Success', 'Your profile has been updated.', [
        { text: 'OK', onPress: () => router.back() }
      ]);
    } catch (e) {
      if (e.code === 'auth/wrong-password' || e.code === 'auth/invalid-credential') {
        Alert.alert('Error', 'Your current password is incorrect.');
      } else if (e.code === 'auth/email-already-in-use') {
        Alert.alert('Error', 'That email is already registered to another account.');
      } else if (e.code === 'auth/requires-recent-login') {
        Alert.alert('Error', 'For security, please sign out and sign back in before making this change.');
      } else if (e.code === 'auth/invalid-email') {
        Alert.alert('Error', 'Please enter a valid email address.');
      } else {
        Alert.alert('Error', e.message);
      }
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
        <View style={styles.headerCenter}>
          <AppName style={styles.mySuburb} />
          <Text style={styles.tagline} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>Bringing suburbs together</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.pageHeader}>
        <Text style={styles.pageTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>Edit Profile</Text>
      </View>

      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: 40 + insets.bottom }]} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>First Name</Text>
        <View style={styles.inputRow}>
          <TextInput style={styles.input} value={firstName} onChangeText={setFirstName} placeholder="First name" placeholderTextColor="#9CA3AF" autoCapitalize="words" />
        </View>

        <Text style={styles.label}>Last Name</Text>
        <View style={styles.inputRow}>
          <TextInput style={styles.input} value={lastName} onChangeText={setLastName} placeholder="Last name" placeholderTextColor="#9CA3AF" autoCapitalize="words" />
        </View>

        <Text style={styles.label}>Email</Text>
        <View style={styles.inputRow}>
          <TextInput style={styles.input} value={email} onChangeText={setEmail} placeholder="Your email" placeholderTextColor="#9CA3AF" keyboardType="email-address" autoCapitalize="none" />
        </View>
        <Text style={styles.hint}>You log in with this email, so changing it updates your sign-in details too.</Text>

        {needsReauth && (
          <>
            <Text style={styles.label}>Current Password</Text>
            <View style={styles.inputRow}>
              <TextInput style={styles.input} value={password} onChangeText={setPassword} secureTextEntry={!showPassword} placeholder="Confirm with your current password" placeholderTextColor="#9CA3AF" />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
                <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
            <Text style={styles.hint}>Required to confirm changes to your sign-in details.</Text>
          </>
        )}

        <TouchableOpacity style={[styles.btn, loading && { opacity: 0.7 }]} onPress={handleSave} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>Save Changes</Text>}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  header: { backgroundColor: Colors.brandGreen, paddingTop: 56, paddingBottom: 16, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  headerCenter: { alignItems: 'center', marginLeft: 8 },
  mySuburb: { fontSize: 27, fontWeight: '800', color: '#fff' },
  tagline: { fontSize: 15, color: '#FFD700', marginTop: 4, fontWeight: '500' },
  pageHeader: { backgroundColor: Colors.brandGreenPale, paddingVertical: 10, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: Colors.lightGrey },
  pageTitle: { fontSize: 20, fontWeight: '700', color: Colors.brandGreen },
  body: { padding: 20, gap: 8, paddingBottom: 40 },
  label: { fontSize: 14, fontWeight: '700', color: Colors.brandGreen, marginTop: 12, marginBottom: 6 },
  inputRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 12, paddingHorizontal: 14 },
  input: { flex: 1, fontSize: 15, color: '#1B1F23', paddingVertical: 14 },
  eyeBtn: { padding: 8 },
  hint: { fontSize: 12, color: '#9CA3AF', marginTop: 4 },
  btn: { backgroundColor: Colors.brandGreen, borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 28 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});