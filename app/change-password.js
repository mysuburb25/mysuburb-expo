import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from 'firebase/auth';
import { auth } from '../config/firebase';
import AppName from '../components/AppName';

export default function ChangePasswordScreen() {
  const insets = useSafeAreaInsets();
  const [current, setCurrent] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleUpdate = async () => {
    if (!current || !newPass || !confirm) {
      Alert.alert('Error', 'Please fill in all fields.');
      return;
    }
    if (newPass !== confirm) {
      Alert.alert('Error', 'New passwords do not match.');
      return;
    }
    if (newPass.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters.');
      return;
    }

    const user = auth.currentUser;
    if (!user || !user.email) {
      Alert.alert('Error', 'Could not find your account. Please sign in again.');
      return;
    }

    setLoading(true);
    try {
      // Firebase requires re-authentication with the current password before
      // allowing a password change, since this is a security-sensitive action.
      const credential = EmailAuthProvider.credential(user.email, current);
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, newPass);

      Alert.alert('Success', 'Your password has been updated.', [
        { text: 'OK', onPress: () => router.back() }
      ]);
    } catch (e) {
      if (e.code === 'auth/wrong-password' || e.code === 'auth/invalid-credential') {
        Alert.alert('Error', 'Your current password is incorrect.');
      } else if (e.code === 'auth/weak-password') {
        Alert.alert('Error', 'Please choose a stronger password.');
      } else if (e.code === 'auth/requires-recent-login') {
        Alert.alert('Error', 'For security, please sign out and sign back in before changing your password.');
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
        <Text style={styles.pageTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>Change Password</Text>
      </View>

      {/* Was a plain View before — on a small screen, or with the keyboard
          open, the Update Password button could end up unreachable with
          no way to scroll to it. Switched to ScrollView so the content
          always remains reachable, matching every other form screen in
          the app. contentContainerStyle's paddingBottom includes the
          safe-area inset so the button also clears an on-screen Android
          nav bar, the same fix applied elsewhere this session. */}
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: 24 + insets.bottom }]} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>Current Password</Text>
        <View style={styles.inputRow}>
          <TextInput style={styles.input} value={current} onChangeText={setCurrent} secureTextEntry={!showCurrent} placeholder="Enter current password" placeholderTextColor="#9CA3AF" />
          <TouchableOpacity onPress={() => setShowCurrent(!showCurrent)} style={styles.eyeBtn}>
            <Ionicons name={showCurrent ? 'eye-off-outline' : 'eye-outline'} size={20} color="#9CA3AF" />
          </TouchableOpacity>
        </View>

        <Text style={styles.label}>New Password</Text>
        <View style={styles.inputRow}>
          <TextInput style={styles.input} value={newPass} onChangeText={setNewPass} secureTextEntry={!showNew} placeholder="Enter new password" placeholderTextColor="#9CA3AF" />
          <TouchableOpacity onPress={() => setShowNew(!showNew)} style={styles.eyeBtn}>
            <Ionicons name={showNew ? 'eye-off-outline' : 'eye-outline'} size={20} color="#9CA3AF" />
          </TouchableOpacity>
        </View>

        <Text style={styles.label}>Confirm New Password</Text>
        <View style={styles.inputRow}>
          <TextInput style={styles.input} value={confirm} onChangeText={setConfirm} secureTextEntry={!showConfirm} placeholder="Confirm new password" placeholderTextColor="#9CA3AF" />
          <TouchableOpacity onPress={() => setShowConfirm(!showConfirm)} style={styles.eyeBtn}>
            <Ionicons name={showConfirm ? 'eye-off-outline' : 'eye-outline'} size={20} color="#9CA3AF" />
          </TouchableOpacity>
        </View>

        <Text style={styles.hint}>Password must be at least 6 characters.</Text>

        <TouchableOpacity style={[styles.btn, loading && { opacity: 0.7 }]} onPress={handleUpdate} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>Update Password</Text>}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  header: { backgroundColor: '#2D6A4F', paddingTop: 56, paddingBottom: 16, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  headerCenter: { alignItems: 'center', marginLeft: 8 },
  mySuburb: { fontSize: 27, fontWeight: '800', color: '#fff' },
  tagline: { fontSize: 15, color: '#FFD700', marginTop: 4, fontWeight: '500' },
  pageHeader: { backgroundColor: '#E8F5E9', paddingVertical: 10, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  pageTitle: { fontSize: 20, fontWeight: '700', color: '#2D6A4F' },
  body: { padding: 20, gap: 8 },
  label: { fontSize: 14, fontWeight: '700', color: '#2D6A4F', marginTop: 12, marginBottom: 6 },
  inputRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 12, paddingHorizontal: 14 },
  input: { flex: 1, fontSize: 15, color: '#1B1F23', paddingVertical: 14 },
  eyeBtn: { padding: 8 },
  hint: { fontSize: 13, color: '#9CA3AF', marginTop: 4 },
  btn: { backgroundColor: '#2D6A4F', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 24 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});