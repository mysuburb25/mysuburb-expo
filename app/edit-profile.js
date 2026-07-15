import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { EmailAuthProvider, reauthenticateWithCredential, updateEmail } from 'firebase/auth';
import { auth } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { Colors } from '../constants/theme';

export default function EditProfileScreen() {
  const { profile, updateUserProfile, user: authUser } = useAuth();

  const parseName = (fullName) => {
    const trimmed = (fullName || '').trim();
    if (!trimmed) return { first: '', last: '' };
    const spaceIndex = trimmed.indexOf(' ');
    if (spaceIndex === -1) return { first: trimmed, last: '' };
    return { first: trimmed.slice(0, spaceIndex), last: trimmed.slice(spaceIndex + 1) };
  };
  const originalName = parseName(profile?.displayName);

  // isPhoneAccount is decided once, permanently, at signup (see
  // select-suburb.js's createProfile call) — it must NOT be inferred from
  // whether profile.phone merely exists, since an email-signup account can
  // also add a phone number later as a plain contact field, which would
  // otherwise get misread as "this is a phone-login account" and try to
  // swap the real login email for a fake generated one. For accounts
  // created before that permanent flag existed, we fall back to checking
  // whether the real Firebase Auth login email matches the fake-email
  // pattern phone signups always get (see signup.js's emailToUse logic).
  const isPhoneAccount = profile?.isPhoneAccount ?? (authUser?.email || '').endsWith('@mysuburb.app');

  const [firstName, setFirstName] = useState(originalName.first);
  const [lastName, setLastName] = useState(originalName.last);
  const [email, setEmail] = useState(profile?.email || '');
  const [phone, setPhone] = useState(profile?.phone || '');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const nameChanged = firstName.trim() !== originalName.first || lastName.trim() !== originalName.last;
  const emailChanged = !isPhoneAccount && email.trim() !== (profile?.email || '');
  const phoneChanged = phone.trim() !== (profile?.phone || '');

  const needsReauth = emailChanged || (isPhoneAccount && phoneChanged);

  const handleSave = async () => {
    if (!firstName.trim()) { Alert.alert('Error', 'First name cannot be empty.'); return; }
    if (emailChanged && !email.trim()) { Alert.alert('Error', 'Email cannot be empty.'); return; }
    if (isPhoneAccount && phoneChanged && !phone.trim()) { Alert.alert('Error', 'Mobile number cannot be empty.'); return; }
    if (!nameChanged && !emailChanged && !phoneChanged) { router.back(); return; }
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

      if (isPhoneAccount) {
        if (phoneChanged) {
          const newFakeEmail = `${phone.replace(/\D/g, '')}@mysuburb.app`;
          await updateEmail(user, newFakeEmail);
          firestoreUpdates.phone = phone.trim();
          firestoreUpdates.email = newFakeEmail;
        }
      } else {
        if (emailChanged) {
          await updateEmail(user, email.trim());
          firestoreUpdates.email = email.trim();
        }
        if (phoneChanged) {
          firestoreUpdates.phone = phone.trim();
        }
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
        Alert.alert('Error', isPhoneAccount ? 'That mobile number is already registered to another account.' : 'That email is already registered to another account.');
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
        <Text style={styles.headerTitle}>Edit Profile</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>First Name</Text>
        <View style={styles.inputRow}>
          <TextInput style={styles.input} value={firstName} onChangeText={setFirstName} placeholder="First name" placeholderTextColor="#9CA3AF" autoCapitalize="words" />
        </View>

        <Text style={styles.label}>Last Name</Text>
        <View style={styles.inputRow}>
          <TextInput style={styles.input} value={lastName} onChangeText={setLastName} placeholder="Last name" placeholderTextColor="#9CA3AF" autoCapitalize="words" />
        </View>

        {isPhoneAccount ? (
          <>
            <Text style={styles.label}>Mobile Number</Text>
            <View style={styles.inputRow}>
              <TextInput style={styles.input} value={phone} onChangeText={setPhone} placeholder="Your mobile number" placeholderTextColor="#9CA3AF" keyboardType="phone-pad" />
            </View>
            <Text style={styles.hint}>You log in with this number, so changing it updates your sign-in details too.</Text>
          </>
        ) : (
          <>
            <Text style={styles.label}>Email</Text>
            <View style={styles.inputRow}>
              <TextInput style={styles.input} value={email} onChangeText={setEmail} placeholder="Your email" placeholderTextColor="#9CA3AF" keyboardType="email-address" autoCapitalize="none" />
            </View>
            <Text style={styles.hint}>You log in with this email, so changing it updates your sign-in details too.</Text>

            <Text style={styles.label}>Mobile Number (optional)</Text>
            <View style={styles.inputRow}>
              <TextInput style={styles.input} value={phone} onChangeText={setPhone} placeholder="Add a contact number" placeholderTextColor="#9CA3AF" keyboardType="phone-pad" />
            </View>
          </>
        )}

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
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Save Changes</Text>}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  header: { backgroundColor: Colors.brandGreen, paddingTop: 56, paddingBottom: 16, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#fff' },
  body: { padding: 20, gap: 8, paddingBottom: 40 },
  label: { fontSize: 14, fontWeight: '700', color: Colors.brandGreen, marginTop: 12, marginBottom: 6 },
  inputRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 12, paddingHorizontal: 14 },
  input: { flex: 1, fontSize: 15, color: '#1B1F23', paddingVertical: 14 },
  eyeBtn: { padding: 8 },
  hint: { fontSize: 12, color: '#9CA3AF', marginTop: 4 },
  btn: { backgroundColor: Colors.brandGreen, borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 28 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});