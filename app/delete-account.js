import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { EmailAuthProvider, reauthenticateWithCredential, deleteUser } from 'firebase/auth';
import { doc, deleteDoc } from 'firebase/firestore';
import { auth, db } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import AppName from '../components/AppName';

export default function DeleteAccountScreen() {
  const { logout } = useAuth();
  const insets = useSafeAreaInsets();
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleDelete = () => {
    if (!password.trim()) {
      Alert.alert('Error', 'Please enter your password to confirm.');
      return;
    }
    if (!confirmChecked) {
      Alert.alert('Error', 'Please confirm you understand this cannot be undone.');
      return;
    }
    Alert.alert(
      'Delete your account?',
      'This is permanent and cannot be undone. Are you absolutely sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete Account', style: 'destructive', onPress: doDelete },
      ]
    );
  };

  const doDelete = async () => {
    const user = auth.currentUser;
    if (!user || !user.email) {
      Alert.alert('Error', 'Could not find your account. Please sign in again.');
      return;
    }

    setLoading(true);
    try {
      // Firebase requires re-authentication before allowing account deletion.
      const credential = EmailAuthProvider.credential(user.email, password);
      await reauthenticateWithCredential(user, credential);

      // Remove the private/push subcollection doc BEFORE the main profile
      // doc. deleteDoc only ever removes the exact document it's pointed
      // at — it does not cascade into subcollections nested underneath
      // it, even though users/{uid}/private/push's path starts with the
      // profile doc's own path. Without this explicit second delete, the
      // push token document would be silently orphaned in Firestore
      // forever after every account deletion, with nothing left that
      // ever points to it or cleans it up. Deleting it first, before the
      // Auth account itself, keeps the same "if something fails partway,
      // the user can just try again" safety property the existing code
      // already relies on for the profile doc below.
      await deleteDoc(doc(db, 'users', user.uid, 'private', 'push'));

      // Remove the Firestore profile doc next — if this fails, the Auth
      // account is untouched and the user can simply try again.
      await deleteDoc(doc(db, 'users', user.uid));

      // Delete the Firebase Auth account itself. Existing posts/comments
      // remain (they already store a denormalized authorName), but they're
      // no longer linked to a real account since the profile doc is gone.
      await deleteUser(user);

      Alert.alert('Account Deleted', 'Your account has been permanently deleted.', [
        { text: 'OK', onPress: () => router.replace('/(auth)/login') }
      ]);
    } catch (e) {
      if (e.code === 'auth/wrong-password' || e.code === 'auth/invalid-credential') {
        Alert.alert('Error', 'Your password is incorrect.');
      } else if (e.code === 'auth/requires-recent-login') {
        Alert.alert(
          'Please sign in again',
          'For security, you need to sign out and sign back in before deleting your account.',
          [{ text: 'Sign Out', style: 'destructive', onPress: async () => { await logout(); router.replace('/(auth)/login'); } }, { text: 'Cancel', style: 'cancel' }]
        );
      } else {
        Alert.alert('Error', e.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
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
        <Text style={styles.pageTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>Delete Account</Text>
      </View>

      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: 60 + insets.bottom }]}>
        <View style={styles.warningBox}>
          <Ionicons name="warning-outline" size={22} color="#E53935" />
          <Text style={styles.warningText}>
            Deleting your account is permanent. Your profile, saved suburbs, and messages will be removed.
            Your existing posts and comments will remain visible but will no longer be linked to your account.
          </Text>
        </View>

        <Text style={styles.label}>Enter your password to confirm</Text>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            placeholder="Password"
            placeholderTextColor="#9CA3AF"
            autoCapitalize="none"
          />
          <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
            <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color="#9CA3AF" />
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.checkRow} onPress={() => setConfirmChecked(!confirmChecked)}>
          <Ionicons name={confirmChecked ? 'checkbox' : 'square-outline'} size={22} color={confirmChecked ? '#E53935' : '#9CA3AF'} />
          <Text style={styles.checkText}>I understand this cannot be undone</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.deleteBtn, loading && { opacity: 0.7 }]} onPress={handleDelete} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.deleteBtnText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>Permanently Delete Account</Text>}
        </TouchableOpacity>

        <TouchableOpacity style={styles.cancelBtn} onPress={() => router.back()} disabled={loading}>
          <Text style={styles.cancelBtnText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>Cancel</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
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
  body: { padding: 20, paddingBottom: 60 },
  warningBox: { flexDirection: 'row', gap: 12, backgroundColor: '#FCEBEB', borderRadius: 12, padding: 14, marginBottom: 24, alignItems: 'flex-start' },
  warningText: { flex: 1, fontSize: 13, color: '#A32D2D', lineHeight: 19 },
  label: { fontSize: 14, fontWeight: '700', color: '#2D6A4F', marginBottom: 8 },
  inputRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 12, paddingHorizontal: 14, marginBottom: 20 },
  input: { flex: 1, fontSize: 15, color: '#1B1F23', paddingVertical: 14 },
  eyeBtn: { padding: 8 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 28 },
  checkText: { fontSize: 14, color: '#1B1F23', flex: 1 },
  deleteBtn: { backgroundColor: '#E53935', borderRadius: 12, padding: 16, alignItems: 'center', marginBottom: 12 },
  deleteBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  cancelBtn: { padding: 14, alignItems: 'center' },
  cancelBtnText: { color: '#6B7280', fontSize: 15, fontWeight: '600' },
});