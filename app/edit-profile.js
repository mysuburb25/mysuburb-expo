import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { EmailAuthProvider, reauthenticateWithCredential, updateEmail } from 'firebase/auth';
import { auth } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { Colors } from '../constants/theme';

export default function EditProfileScreen() {
  const { profile, updateUserProfile } = useAuth();

  // A phone-signup account's "email" field is really a system-generated
  // login identifier ({digits}@mysuburb.app), not a real address the person
  // chose — so we don't let them edit it directly. Phone-based accounts edit
  // their phone number instead, which regenerates that identifier under the
  // hood. Email-signup accounts do the reverse: phone is just a contact
  // field with no login impact.
  const isPhoneAccount = !!profile?.phone;

  const [name, setName] = useState(profile?.displayName || '');
  const [email, setEmail] = useState(profile?.email || '');
  const [phone, setPhone] = useState(profile?.phone || '');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const nameChanged = name.trim() !== (profile?.displayName || '');
  const emailChanged = !isPhoneAccount && email.trim() !== (profile?.email || '');
  const phoneChanged = phone.trim() !== (profile?.phone || '');

  // Changing the account's actual login identity (email for email-accounts,
  // phone for phone-accounts) is security-sensitive and needs re-auth.
  // A plain contact-info phone number on an email-account does not.
  const needsReauth = emailChanged || (isPhoneAccount && phoneChanged);

  const handleSave = async () => {
    if (!name.trim()) { Alert.alert('Error', 'Name cannot be empty.'); return; }
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
      if (nameChanged) firestoreUpdates.displayName = name.trim();

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
        <Text style={styles.label}>Name</Text>
        <View style={styles.inputRow}>
          <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Your name" placeholderTextColor="#9CA3AF" autoCapitalize="words" />
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