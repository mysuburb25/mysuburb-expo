import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Modal } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { doc, getDoc } from 'firebase/firestore';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth, db } from '../../config/firebase';
import { useAuth } from '../../context/AuthContext';
import { Colors } from '../../constants/theme';
import AppName from '../../components/AppName';

export default function LoginScreen() {
  const { login } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [showForgotModal, setShowForgotModal] = useState(false);
  const [resetIdentifier, setResetIdentifier] = useState('');
  const [sendingReset, setSendingReset] = useState(false);

  const handleLogin = async () => {
    if (!identifier.trim() || !password.trim()) {
      Alert.alert('Error', 'Please enter your email/phone and password.');
      return;
    }
    setLoading(true);
    try {
      const emailToUse = identifier.includes('@')
        ? identifier.trim()
        : `${identifier.replace(/\D/g, '')}@mysuburb.app`;
      await login(emailToUse, password);

      // A fresh direct read here, rather than AuthContext's profile state,
      // since that loads asynchronously after login and may not be ready
      // by the time we need to decide where to navigate.
      let skipDashboard = false;
      try {
        const snap = await getDoc(doc(db, 'users', auth.currentUser.uid));
        skipDashboard = snap.exists() && snap.data().skipDashboard === true;
      } catch (e) { console.error(e); }

      router.replace(skipDashboard ? '/(tabs)' : '/dashboard');
    } catch (e) {
      Alert.alert('Login Failed', 'Incorrect email/phone or password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const openForgotModal = () => {
    setResetIdentifier(identifier.includes('@') ? identifier : '');
    setShowForgotModal(true);
  };

  // Mobile-number accounts sign in with a fake generated email
  // ({phone}@mysuburb.app) that they can never actually access — sending a
  // reset link there would be useless, so those accounts get a clear
  // message instead, rather than silently failing or pretending to work.
  const handleSendReset = async () => {
    if (!resetIdentifier.trim()) {
      Alert.alert('Error', 'Please enter your email address.');
      return;
    }
    if (!resetIdentifier.includes('@')) {
      Alert.alert(
        'Mobile Number Accounts',
        "Password reset for accounts signed up with a mobile number isn't available yet. Please contact support to reset your password."
      );
      return;
    }
    setSendingReset(true);
    try {
      await sendPasswordResetEmail(auth, resetIdentifier.trim());
    } catch (e) {
      // Deliberately not surfacing auth/user-not-found here — showing the
      // exact same confirmation either way avoids revealing whether a
      // given email is actually registered, which is standard practice
      // for a password reset flow.
      if (e.code !== 'auth/user-not-found') {
        console.error(e);
      }
    } finally {
      setSendingReset(false);
      setShowForgotModal(false);
      setResetIdentifier('');
      Alert.alert(
        'Check Your Email',
        'If an account exists with this email, a password reset link has been sent. Check your inbox (and spam folder).'
      );
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.header}>
          <AppName style={styles.appName} />
          <Text style={styles.tagline}>Bringing suburbs together</Text>
        </View>

        {/* Fields */}
        <View style={styles.form}>
          <View style={styles.inputWrap}>
            <Ionicons name="person-outline" size={18} color="rgba(255,255,255,0.7)" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Email or mobile number"
              placeholderTextColor="rgba(255,255,255,0.5)"
              value={identifier}
              onChangeText={setIdentifier}
              autoCapitalize="none"
              keyboardType="email-address"
              autoCorrect={false}
            />
          </View>

          <View style={styles.inputWrap}>
            <Ionicons name="lock-closed-outline" size={18} color="rgba(255,255,255,0.7)" style={styles.inputIcon} />
            <TextInput
              style={[styles.input, { flex: 1 }]}
              placeholder="Password"
              placeholderTextColor="rgba(255,255,255,0.5)"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
            />
            <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
              <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color="rgba(255,255,255,0.7)" />
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={[styles.loginBtn, loading && { opacity: 0.7 }]} onPress={handleLogin} disabled={loading}>
            {loading ? <ActivityIndicator color={Colors.brandGreen} /> : <Text style={styles.loginBtnText}>Sign In</Text>}
          </TouchableOpacity>

          <View style={styles.signupRow}>
            <Text style={styles.signupText}>Don't have an account? </Text>
            <TouchableOpacity onPress={() => router.push('/(auth)/signup')}>
              <Text style={styles.signupLink}>Sign Up</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity onPress={openForgotModal} style={styles.forgotBtn}>
            <Text style={styles.forgotText}>Forgot Password?</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <Modal visible={showForgotModal} transparent animationType="fade">
        <View style={styles.forgotOverlay}>
          <View style={styles.forgotCard}>
            <Text style={styles.forgotTitle}>Reset Password</Text>
            <Text style={styles.forgotSubtitle}>Enter your email and we'll send you a link to reset your password.</Text>
            <View style={styles.forgotInputWrap}>
              <Ionicons name="mail-outline" size={18} color={Colors.midGrey} style={styles.inputIcon} />
              <TextInput
                style={styles.forgotInput}
                placeholder="Your email"
                placeholderTextColor={Colors.midGrey}
                value={resetIdentifier}
                onChangeText={setResetIdentifier}
                autoCapitalize="none"
                keyboardType="email-address"
                autoCorrect={false}
                autoFocus
              />
            </View>
            <TouchableOpacity style={[styles.forgotSendBtn, sendingReset && { opacity: 0.7 }]} onPress={handleSendReset} disabled={sendingReset}>
              {sendingReset ? <ActivityIndicator color={Colors.white} size="small" /> : <Text style={styles.forgotSendBtnText}>Send Reset Link</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={styles.forgotCancelBtn} onPress={() => setShowForgotModal(false)}>
              <Text style={styles.forgotCancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.brandGreen },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 28 },
  header: { alignItems: 'center', marginBottom: 48 },
  appName: { fontSize: 48, fontWeight: '800', color: Colors.white, letterSpacing: 1 },
  tagline: { fontSize: 16, color: '#FFD700', marginTop: 8, fontWeight: '500' },
  form: { gap: 14 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.3)', borderRadius: 14, paddingHorizontal: 16, backgroundColor: 'rgba(255,255,255,0.1)' },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, paddingVertical: 16, fontSize: 16, color: Colors.white },
  eyeBtn: { padding: 4 },
  forgotBtn: { alignSelf: 'center', marginTop: 4 },
  forgotText: { fontSize: 14, color: '#FFD700', fontWeight: '700' },
  loginBtn: { backgroundColor: '#FFD700', borderRadius: 14, height: 54, justifyContent: 'center', alignItems: 'center', marginTop: 8 },
  loginBtnText: { fontSize: 17, fontWeight: '800', color: Colors.brandGreen },
  signupRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 16 },
  signupText: { fontSize: 15, color: 'rgba(255,255,255,0.7)' },
  signupLink: { fontSize: 15, color: '#FFD700', fontWeight: '700' },

  forgotOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 28 },
  forgotCard: { backgroundColor: Colors.white, borderRadius: 20, padding: 24, width: '100%', maxWidth: 380 },
  forgotTitle: { fontSize: 20, fontWeight: '800', color: Colors.brandGreen, marginBottom: 6 },
  forgotSubtitle: { fontSize: 14, color: Colors.midGrey, lineHeight: 20, marginBottom: 18 },
  forgotInputWrap: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: Colors.lightGrey, borderRadius: 12, paddingHorizontal: 14, marginBottom: 14 },
  forgotInput: { flex: 1, paddingVertical: 13, fontSize: 15, color: Colors.charcoal },
  forgotSendBtn: { backgroundColor: Colors.brandGreen, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  forgotSendBtnText: { fontSize: 15, fontWeight: '700', color: Colors.white },
  forgotCancelBtn: { paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  forgotCancelBtnText: { fontSize: 14, fontWeight: '600', color: Colors.midGrey },
});