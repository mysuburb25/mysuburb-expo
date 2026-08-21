import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Modal } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { Colors } from '../../constants/theme';
import AppName from '../../components/AppName';
import WheelPicker from '../../components/WheelPicker';

const TC_TEXT = `Terms & Conditions

Last updated: 16 July 2026

1. ACCEPTANCE
By using My Suburb, you agree to these terms. If you do not agree, please do not use the app.

2. USE OF SERVICE
My Suburb is a community platform for suburb residents to share information, events, and services. You must be 18 years or older to use this service.

3. USER CONTENT
You are responsible for all content you post. You must not post content that is:
- Offensive, abusive or hateful
- False or misleading
- Illegal or harmful
- Spam or advertising without permission

4. PRIVACY
We collect your name, email, and suburb to provide the service. Your email is kept private and is never shown to other users. We do not sell your data to third parties. Posts are visible to other users in your suburb. See our full Privacy Policy for details.

5. MODERATION
We reserve the right to remove posts, issue warnings, or suspend accounts that violate these terms.

6. LIABILITY
My Suburb is provided "as is". We are not responsible for content posted by users or any damages arising from use of the app.

7. CHANGES
We may update these terms at any time. Continued use of the app means you accept the updated terms.

8. CONTACT
For any questions, contact us through the app.`;

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 100 }, (_, i) => CURRENT_YEAR - i);

// Age is calculated conservatively since we only collect month + year, not
// the exact day: we assume the person was born on the LAST day of the
// selected month — the youngest possible date consistent with what they
// entered. If even that youngest-possible date is 18+, the real person
// (born any earlier day that month) definitely is too. This avoids ever
// letting someone who could plausibly be under 18 through, at the cost of
// occasionally asking a genuine 18-year-old to wait a few extra days
// right at their birthday month boundary — the safer direction to err in.
function isAtLeast18(month, year) {
  const lastDayOfMonth = new Date(year, month, 0); // month is 1-indexed here; day 0 of next month = last day of this one
  const today = new Date();
  let age = today.getFullYear() - lastDayOfMonth.getFullYear();
  const hasHadBirthdayThisYear =
    today.getMonth() > lastDayOfMonth.getMonth() ||
    (today.getMonth() === lastDayOfMonth.getMonth() && today.getDate() >= lastDayOfMonth.getDate());
  if (!hasHadBirthdayThisYear) age--;
  return age >= 18;
}

// Standard, widely-used pattern for catching obviously malformed emails
// (missing @, missing domain, stray spaces) without being so strict it
// rejects legitimate edge-case addresses — full RFC 5322 compliance is
// unnecessary here and would reject real addresses people actually use.
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SignupScreen() {
  const { register, createProfile } = useAuth();
  const insets = useSafeAreaInsets();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [agreedToTC, setAgreedToTC] = useState(false);
  const [showTC, setShowTC] = useState(false);
  const [birthMonth, setBirthMonth] = useState(null); // 1-12
  const [birthYear, setBirthYear] = useState(null);
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [showYearPicker, setShowYearPicker] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSignup = async () => {
    if (!firstName.trim()) { Alert.alert('Error', 'Please enter your first name.'); return; }
    if (!lastName.trim()) { Alert.alert('Error', 'Please enter your last name.'); return; }
    if (!email.trim()) { Alert.alert('Error', 'Please enter your email.'); return; }
    if (!EMAIL_REGEX.test(email.trim())) { Alert.alert('Error', 'Please enter a valid email address.'); return; }
    if (!password.trim()) { Alert.alert('Error', 'Please enter a password.'); return; }
    if (password.length < 6) { Alert.alert('Error', 'Password must be at least 6 characters.'); return; }
    if (password !== confirmPassword) { Alert.alert('Error', 'Passwords do not match.'); return; }
    if (!birthMonth || !birthYear) { Alert.alert('Error', 'Please select your date of birth.'); return; }
    if (!isAtLeast18(birthMonth, birthYear)) {
      Alert.alert('Age requirement', 'You must be 18 or older to use MySuburb.');
      return;
    }
    if (!agreedToTC) { Alert.alert('Error', 'Please agree to the Terms & Conditions.'); return; }

    const displayName = `${firstName.trim()} ${lastName.trim()}`;

    setLoading(true);
    try {
      const cred = await register(email.trim(), password, displayName);

      // Navigate to suburb selection
      router.replace({
        pathname: '/(auth)/select-suburb',
        params: {
          uid: cred.user.uid,
          email: email.trim(),
          displayName,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          birthMonth: String(birthMonth),
          birthYear: String(birthYear),
        }
      });
    } catch (e) {
      if (e.code === 'auth/email-already-in-use') {
        Alert.alert('Error', 'This email is already registered. Please sign in.');
      } else {
        Alert.alert('Error', e.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          // Stopgap: insets.bottom appears unreliable here on Android
          // without expo-navigation-bar/edge-to-edge properly configured
          // (a native-level fix queued for a future build) — the OS can
          // report insets.bottom as too small even while visually
          // drawing a transparent bar over content. Math.max forces a
          // real minimum regardless of what that value reports, so the
          // Create Account button clears the bar either way. Safe to
          // revert to the simpler insets-only version once the native
          // fix ships.
          { paddingBottom: Math.max(24 + insets.bottom, 110) },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        automaticallyAdjustKeyboardInsets={true}
      >

        {/* Header */}
        <View style={styles.header}>
          <AppName style={styles.appName} />
          <Text style={styles.tagline} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>Bringing suburbs together</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.title} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>Create Account</Text>
          <Text style={styles.subtitle}>Join your suburb community</Text>

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

          {/* Email */}
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

          {/* Date of birth (month + year only) */}
          <Text style={styles.dobLabel}>Date of birth</Text>
          <Text style={styles.dobHint}>MySuburb is for adults 18 and over.</Text>
          <View style={styles.dobRow}>
            <TouchableOpacity style={[styles.inputWrap, styles.dobField]} onPress={() => setShowMonthPicker(true)}>
              <Ionicons name="calendar-outline" size={18} color={Colors.midGrey} style={styles.inputIcon} />
              <Text style={[styles.input, !birthMonth && { color: Colors.midGrey }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                {birthMonth ? MONTHS[birthMonth - 1] : 'Month'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.inputWrap, styles.dobField]} onPress={() => setShowYearPicker(true)}>
              <Ionicons name="calendar-outline" size={18} color={Colors.midGrey} style={styles.inputIcon} />
              <Text style={[styles.input, !birthYear && { color: Colors.midGrey }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                {birthYear || 'Year'}
              </Text>
            </TouchableOpacity>
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
              <Text style={styles.tcLink} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>Terms & Conditions</Text>
            </TouchableOpacity>
          </View>

          {/* Sign Up Button */}
          <TouchableOpacity style={[styles.signupBtn, loading && { opacity: 0.7 }]} onPress={handleSignup} disabled={loading}>
            {loading ? <ActivityIndicator color={Colors.white} /> : <Text style={styles.signupBtnText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>Create Account</Text>}
          </TouchableOpacity>

          {/* Login link */}
          <View style={styles.loginRow}>
            <Text style={styles.loginText}>Already have an account? </Text>
            <TouchableOpacity onPress={() => router.push('/(auth)/login')}>
              <Text style={styles.loginLink} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>Sign In</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      {/* T&C Modal */}
      <Modal visible={showTC} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.tcModal}>
          <View style={styles.tcHeader}>
            <Text style={styles.tcTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>Terms & Conditions</Text>
            <TouchableOpacity onPress={() => setShowTC(false)} style={styles.tcCloseBtn}>
              <Ionicons name="close" size={24} color={Colors.white} />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.tcBody} contentContainerStyle={{ paddingBottom: 40 }}>
            <Text style={styles.tcContent}>{TC_TEXT}</Text>
          </ScrollView>
          <View style={styles.tcFooter}>
            <TouchableOpacity style={styles.tcAgreeBtn} onPress={() => { setAgreedToTC(true); setShowTC(false); }}>
              <Text style={styles.tcAgreeBtnText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>I Agree</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Birth Month Picker */}
      <Modal visible={showMonthPicker} animationType="slide" transparent onRequestClose={() => setShowMonthPicker(false)}>
        <TouchableOpacity style={styles.pickerOverlay} activeOpacity={1} onPress={() => setShowMonthPicker(false)}>
          <TouchableOpacity activeOpacity={1} style={[styles.pickerSheet, { paddingBottom: 24 + insets.bottom }]} onPress={() => {}}>
            <View style={styles.wheelHeaderBar}>
              <Text style={styles.wheelHeaderText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>Select Month</Text>
            </View>
            <View style={styles.wheelRow}>
              <WheelPicker
                data={MONTHS.map((m, i) => ({ label: m, value: i + 1 }))}
                selectedValue={birthMonth}
                onValueChange={setBirthMonth}
              />
            </View>
            <TouchableOpacity style={styles.dobDoneBtn} onPress={() => setShowMonthPicker(false)}>
              <Text style={styles.dobDoneBtnText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>Done</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Birth Year Picker */}
      <Modal visible={showYearPicker} animationType="slide" transparent onRequestClose={() => setShowYearPicker(false)}>
        <TouchableOpacity style={styles.pickerOverlay} activeOpacity={1} onPress={() => setShowYearPicker(false)}>
          <TouchableOpacity activeOpacity={1} style={[styles.pickerSheet, { paddingBottom: 24 + insets.bottom }]} onPress={() => {}}>
            <View style={styles.wheelHeaderBar}>
              <Text style={styles.wheelHeaderText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>Select Year</Text>
            </View>
            <View style={styles.wheelRow}>
              <WheelPicker
                data={YEARS.map((y) => ({ label: String(y), value: y }))}
                selectedValue={birthYear}
                onValueChange={setBirthYear}
              />
            </View>
            <TouchableOpacity style={styles.dobDoneBtn} onPress={() => setShowYearPicker(false)}>
              <Text style={styles.dobDoneBtnText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>Done</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
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
  inputWrap: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: Colors.lightGrey, borderRadius: 12, marginBottom: 12, paddingHorizontal: 14, backgroundColor: '#FAFAFA' },
  inputIcon: { marginRight: 8 },
  input: { flex: 1, paddingVertical: 14, fontSize: 15, color: Colors.charcoal },
  eyeBtn: { padding: 4 },
  dobLabel: { fontSize: 13, fontWeight: '700', color: Colors.charcoal, marginBottom: 2 },
  dobHint: { fontSize: 12, color: Colors.midGrey, marginBottom: 8 },
  dobRow: { flexDirection: 'row', gap: 10 },
  dobField: { flex: 1 },
  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  pickerSheet: { backgroundColor: Colors.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: 'hidden', paddingBottom: 24 },
  wheelHeaderBar: { flexDirection: 'row', backgroundColor: Colors.brandGreen, paddingVertical: 10 },
  wheelHeaderText: { flex: 1, textAlign: 'center', color: Colors.white, fontSize: 19, fontWeight: '800' },
  wheelRow: { flexDirection: 'row', paddingHorizontal: 20, paddingTop: 0 },
  dobDoneBtn: { marginTop: 12, alignSelf: 'center', width: '50%', backgroundColor: Colors.brandGreen, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  dobDoneBtnText: { color: Colors.white, fontSize: 19, fontWeight: '700' },
  pickerItemText: { fontSize: 16, color: Colors.charcoal },
  pickerItemTextActive: { color: Colors.brandGreen, fontWeight: '700' },
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