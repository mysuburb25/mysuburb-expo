import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Modal } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { Colors } from '../../constants/theme';
import AppName from '../../components/AppName';

const TC_TEXT = `Terms & Conditions

Last updated: 16 July 2026

1. ACCEPTANCE
By using My Suburb, you agree to these terms. If you do not agree, please do not use the app.

2. USE OF SERVICE
My Suburb is a community platform for suburb residents to share information, events, and services. You must be 18 years or older to use this service.

3. USER CONTENT
You are responsible for all content you post. You must not post content that is:
• Offensive, abusive or hateful
• False or misleading
• Illegal or harmful
• Spam or advertising without permission

4. PRIVACY
We collect your name, email/phone, and suburb to provide the service. Your email/phone is kept private and is never shown to other users. We do not sell your data to third parties. Posts are visible to other users in your suburb. See our full Privacy Policy for details.

5. MODERATION
We reserve the right to remove posts, issue warnings, or suspend accounts that violate these terms.

6. LIABILITY
My Suburb is provided "as is". We are not responsible for content posted by users or any damages arising from use of the app.

7. CHANGES
We may update these terms at any time. Continued use of the app means you accept the updated terms.

8. CONTACT
For any questions, contact us through the app.`;

export default function SignupScreen() {
  const { register, createProfile } = useAuth();
  const [signupMethod, setSignupMethod] = useState('email'); // 'email' or 'phone'
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [agreedToTC, setAgreedToTC] = useState(false);
  const [showTC, setShowTC] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSignup = async () => {
    if (!firstName.trim()) { Alert.alert('Error', 'Please enter your first name.'); return; }
    if (!lastName.trim()) { Alert.alert('Error', 'Please enter your last name.'); return; }
    if (signupMethod === 'email' && !email.trim()) { Alert.alert('Error', 'Please enter your email.'); return; }
    if (signupMethod === 'phone' && !phone.trim()) { Alert.alert('Error', 'Please enter your mobile number.'); return; }
    if (!password.trim()) { Alert.alert('Error', 'Please enter a password.'); return; }
    if (password.length < 6) { Alert.alert('Error', 'Password must be at least 6 characters.'); return; }
    if (password !== confirmPassword) { Alert.alert('Error', 'Passwords do not match.'); return; }
    if (!agreedToTC) { Alert.alert('Error', 'Please agree to the Terms & Conditions.'); return; }

    const displayName = `${firstName.trim()} ${lastName.trim()}`;

    setLoading(true);
    try {
      // For phone signup, create a fake email format
      const emailToUse = signupMethod === 'email'
        ? email.trim()
        : `${phone.replace(/\D/g, '')}@mysuburb.app`;

      const cred = await register(emailToUse, password, displayName);

      // Navigate to suburb selection
      router.replace({
        pathname: '/(auth)/select-suburb',
        params: {
          uid: cred.user.uid,
          email: emailToUse,
          displayName,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          phone: signupMethod === 'phone' ? phone.trim() : '',
        }
      });
    } catch (e) {
      if (e.code === 'auth/email-already-in-use') {
        Alert.alert('Error', 'This email/phone is already registered. Please sign in.');
      } else {
        Alert.alert('Error', e.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} automaticallyAdjustKeyboardInsets={true}>

        {/* Header */}
        <View style={styles.header}>
          <AppName style={styles.appName} />
          <Text style={styles.tagline}>Bringing suburbs together</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>Create Account</Text>
          <Text style={styles.subtitle}>Join your suburb community</Text>

          {/* Sign up method toggle */}
          <View style={styles.methodToggle}>
            <TouchableOpacity
              style={[styles.methodBtn, signupMethod === 'email' && styles.methodBtnActive]}
              onPress={() => setSignupMethod('email')}
            >
              <Ionicons name="mail-outline" size={16} color={signupMethod === 'email' ? Colors.white : Colors.brandGreen} />
              <Text style={[styles.methodBtnText, signupMethod === 'email' && styles.methodBtnTextActive]}>Email</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.methodBtn, signupMethod === 'phone' && styles.methodBtnActive]}
              onPress={() => setSignupMethod('phone')}
            >
              <Ionicons name="phone-portrait-outline" size={16} color={signupMethod === 'phone' ? Colors.white : Colors.brandGreen} />
              <Text style={[styles.methodBtnText, signupMethod === 'phone' && styles.methodBtnTextActive]}>Mobile</Text>
            </TouchableOpacity>
          </View>

          {/* First name */}
          <View style={styles.inputWrap}>
            <Ionicons name="person-outline" size={18} color={Colors.midGrey} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="First name"
              placeholderTextColor={Colors.midGrey}
              value={firstName}
              onChangeText={setFirstName}
              autoCapitalize="words"
              autoCorrect={false}
            />
          </View>

          {/* Last name */}
          <View style={styles.inputWrap}>
            <Ionicons name="person-outline" size={18} color={Colors.midGrey} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Last name"
              placeholderTextColor={Colors.midGrey}
              value={lastName}
              onChangeText={setLastName}
              autoCapitalize="words"
              autoCorrect={false}
            />
          </View>

          {/* Email or Phone */}
          {signupMethod === 'email' ? (
            <View style={styles.inputWrap}>
              <Ionicons name="mail-outline" size={18} color={Colors.midGrey} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Email address"
                placeholderTextColor={Colors.midGrey}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                autoCorrect={false}
              />
            </View>
          ) : (
            <View style={styles.inputWrap}>
              <Ionicons name="phone-portrait-outline" size={18} color={Colors.midGrey} style={styles.inputIcon} />
              <Text style={styles.countryCode}>+61</Text>
              <TextInput
                style={styles.input}
                placeholder="Mobile number"
                placeholderTextColor={Colors.midGrey}
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                autoCorrect={false}
              />
            </View>
          )}

          {/* Password */}
          <View style={styles.inputWrap}>
            <Ionicons name="lock-closed-outline" size={18} color={Colors.midGrey} style={styles.inputIcon} />
            <TextInput
              style={[styles.input, { flex: 1 }]}
              placeholder="Password (min 6 characters)"
              placeholderTextColor={Colors.midGrey}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
            />
            <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
              <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color={Colors.midGrey} />
            </TouchableOpacity>
          </View>

          {/* Confirm Password */}
          <View style={styles.inputWrap}>
            <Ionicons name="lock-closed-outline" size={18} color={Colors.midGrey} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Confirm password"
              placeholderTextColor={Colors.midGrey}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
            />
          </View>

          {/* Terms & Conditions */}
          <View style={styles.tcRow}>
            <TouchableOpacity style={styles.checkbox} onPress={() => setAgreedToTC(!agreedToTC)}>
              {agreedToTC
                ? <Ionicons name="checkbox" size={22} color={Colors.brandGreen} />
                : <Ionicons name="square-outline" size={22} color={Colors.midGrey} />
              }
            </TouchableOpacity>
            <Text style={styles.tcText}>I agree to the </Text>
            <TouchableOpacity onPress={() => setShowTC(true)}>
              <Text style={styles.tcLink}>Terms & Conditions</Text>
            </TouchableOpacity>
          </View>

          {/* Sign Up Button */}
          <TouchableOpacity style={[styles.signupBtn, loading && { opacity: 0.7 }]} onPress={handleSignup} disabled={loading}>
            {loading ? <ActivityIndicator color={Colors.white} /> : <Text style={styles.signupBtnText}>Create Account</Text>}
          </TouchableOpacity>

          {/* Login link */}
          <View style={styles.loginRow}>
            <Text style={styles.loginText}>Already have an account? </Text>
            <TouchableOpacity onPress={() => router.push('/(auth)/login')}>
              <Text style={styles.loginLink}>Sign In</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      {/* T&C Modal */}
      <Modal visible={showTC} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.tcModal}>
          <View style={styles.tcHeader}>
            <Text style={styles.tcTitle}>Terms & Conditions</Text>
            <TouchableOpacity onPress={() => setShowTC(false)} style={styles.tcCloseBtn}>
              <Ionicons name="close" size={24} color={Colors.white} />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.tcBody} contentContainerStyle={{ paddingBottom: 40 }}>
            <Text style={styles.tcContent}>{TC_TEXT}</Text>
          </ScrollView>
          <View style={styles.tcFooter}>
            <TouchableOpacity style={styles.tcAgreeBtn} onPress={() => { setAgreedToTC(true); setShowTC(false); }}>
              <Text style={styles.tcAgreeBtnText}>I Agree</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.brandGreen },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 24, paddingTop: 60 },
  header: { alignItems: 'center', marginBottom: 28 },
  appName: { fontSize: 42, fontWeight: '800', color: Colors.white, letterSpacing: 1 },
  tagline: { fontSize: 16, color: '#FFD700', marginTop: 8, fontWeight: '500' },
  card: { backgroundColor: Colors.white, borderRadius: 24, padding: 28, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 5 },
  title: { fontSize: 26, fontWeight: '800', color: Colors.brandGreen, marginBottom: 4, textAlign: 'center' },
  subtitle: { fontSize: 15, color: Colors.midGrey, marginBottom: 20, textAlign: 'center' },
  methodToggle: { flexDirection: 'row', gap: 10, marginBottom: 20, backgroundColor: Colors.brandGreenPale, borderRadius: 14, padding: 4 },
  methodBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 12 },
  methodBtnActive: { backgroundColor: Colors.brandGreen },
  methodBtnText: { fontSize: 14, fontWeight: '700', color: Colors.brandGreen },
  methodBtnTextActive: { color: Colors.white },
  inputWrap: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: Colors.lightGrey, borderRadius: 12, marginBottom: 12, paddingHorizontal: 14, backgroundColor: '#FAFAFA' },
  inputIcon: { marginRight: 8 },
  input: { flex: 1, paddingVertical: 14, fontSize: 15, color: Colors.charcoal },
  countryCode: { fontSize: 15, color: Colors.charcoal, fontWeight: '600', marginRight: 6 },
  eyeBtn: { padding: 4 },
  tcRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, marginTop: 4 },
  checkbox: { marginRight: 8 },
  tcText: { fontSize: 14, color: Colors.midGrey },
  tcLink: { fontSize: 14, color: Colors.brandGreen, fontWeight: '700', textDecorationLine: 'underline' },
  signupBtn: { backgroundColor: Colors.brandGreen, borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  signupBtnText: { fontSize: 17, fontWeight: '700', color: Colors.white },
  loginRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 20 },
  loginText: { fontSize: 14, color: Colors.midGrey },
  loginLink: { fontSize: 14, color: Colors.brandGreen, fontWeight: '700' },
  // T&C Modal
  tcModal: { flex: 1, backgroundColor: Colors.white },
  tcHeader: { backgroundColor: Colors.brandGreen, paddingTop: 56, paddingBottom: 16, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tcTitle: { fontSize: 20, fontWeight: '800', color: Colors.white },
  tcCloseBtn: { padding: 4 },
  tcBody: { flex: 1, padding: 20 },
  tcContent: { fontSize: 15, color: Colors.charcoal, lineHeight: 24 },
  tcFooter: { padding: 20, borderTopWidth: 1, borderTopColor: Colors.lightGrey },
  tcAgreeBtn: { backgroundColor: Colors.brandGreen, borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  tcAgreeBtnText: { fontSize: 17, fontWeight: '700', color: Colors.white },
});