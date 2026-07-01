import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform, Modal } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';

export default function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showSignupModal, setShowSignupModal] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) { Alert.alert('Error', 'Please enter your email and password.'); return; }
    setLoading(true);
    try {
      await login(email, password);
      router.replace('/(tabs)');
    } catch (e) {
      // Check if error is user-not-found or invalid credentials
      const msg = e.message || '';
      if (
        msg.includes('user-not-found') ||
        msg.includes('invalid-credential') ||
        msg.includes('no user record') ||
        msg.includes('INVALID_LOGIN_CREDENTIALS')
      ) {
        setShowSignupModal(true);
      } else {
        Alert.alert('Error', e.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={{ height: 129 }} />
        <Text style={styles.appName}>My Suburb</Text>
        <Text style={styles.tagline}>Bringing suburbs together</Text>
        <View style={{ height: 40 }} />
        <Text style={styles.label}>EMAIL</Text>
        <TextInput
          style={styles.input}
          placeholder="your@email.com"
          placeholderTextColor="rgba(255,255,255,0.4)"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          returnKeyType="next"
        />
        <View style={{ height: 16 }} />
        <Text style={styles.label}>PASSWORD</Text>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.inputInner}
            placeholder="Your password"
            placeholderTextColor="rgba(255,255,255,0.4)"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            returnKeyType="done"
            onSubmitEditing={handleLogin}
          />
          <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
            <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color="rgba(255,255,255,0.6)" />
          </TouchableOpacity>
        </View>
        <View style={{ height: 48 }} />
        <TouchableOpacity style={[styles.signInBtn, loading && { opacity: 0.7 }]} onPress={handleLogin} disabled={loading}>
          {loading ? <ActivityIndicator color="#2D6A4F" /> : <Text style={styles.signInText}>Sign In</Text>}
        </TouchableOpacity>
        <View style={{ height: 36 }} />
        <TouchableOpacity onPress={() => router.push('/(auth)/signup')}>
          <Text style={styles.signupText}>No account? <Text style={styles.signupLink}>Sign up</Text></Text>
        </TouchableOpacity>
        <View style={{ height: 60 }} />
      </ScrollView>

      {/* Sign Up Prompt Modal */}
      <Modal visible={showSignupModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <View style={styles.modalIcon}>
              <Ionicons name="person-add-outline" size={36} color="#2D6A4F" />
            </View>
            <Text style={styles.modalTitle}>No Account Found</Text>
            <Text style={styles.modalMessage}>
              We couldn't find an account for <Text style={styles.modalEmail}>{email}</Text>. Would you like to create one?
            </Text>
            <TouchableOpacity
              style={styles.modalSignupBtn}
              onPress={() => { setShowSignupModal(false); router.push('/(auth)/signup'); }}
            >
              <Text style={styles.modalSignupText}>Create Account</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.modalCancelBtn}
              onPress={() => setShowSignupModal(false)}
            >
              <Text style={styles.modalCancelText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#2D6A4F' },
  content: { alignItems: 'center', paddingHorizontal: 28 },
  appName: { fontSize: 38, fontWeight: '800', color: '#fff', marginBottom: 8 },
  tagline: { fontSize: 15, fontWeight: '600', color: '#FFD700', textAlign: 'center' },
  label: { fontSize: 14, fontWeight: '800', color: '#fff', letterSpacing: 1.5, marginBottom: 8, alignSelf: 'flex-start' },
  input: { width: '100%', backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 12, padding: 16, fontSize: 16, color: '#fff', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' },
  inputRow: { width: '100%', flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)', paddingRight: 12 },
  inputInner: { flex: 1, padding: 16, fontSize: 16, color: '#fff' },
  eyeBtn: { padding: 4 },
  signInBtn: { width: '100%', backgroundColor: '#FFD700', borderRadius: 12, padding: 14, alignItems: 'center' },
  signInText: { fontSize: 18, fontWeight: '800', color: '#2D6A4F' },
  signupText: { color: '#c8e6c9', fontSize: 15, textAlign: 'center' },
  signupLink: { color: '#FFD700', fontWeight: '700' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 32 },
  modalBox: { backgroundColor: '#fff', borderRadius: 20, padding: 28, alignItems: 'center', width: '100%' },
  modalIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#E8F5E9', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 20, fontWeight: '800', color: '#1B4332', marginBottom: 10 },
  modalMessage: { fontSize: 15, color: '#555', textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  modalEmail: { fontWeight: '700', color: '#2D6A4F' },
  modalSignupBtn: { width: '100%', backgroundColor: '#2D6A4F', borderRadius: 12, padding: 14, alignItems: 'center', marginBottom: 10 },
  modalSignupText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  modalCancelBtn: { width: '100%', padding: 12, alignItems: 'center' },
  modalCancelText: { fontSize: 15, color: '#888', fontWeight: '600' },
});