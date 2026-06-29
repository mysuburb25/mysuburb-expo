import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';

export default function SignupScreen() {
  const { register } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSignup = async () => {
    if (!displayName || !email || !password) { Alert.alert('Error', 'Please fill in all fields.'); return; }
    if (password.length < 6) { Alert.alert('Error', 'Password must be at least 6 characters.'); return; }
    setLoading(true);
    try {
      const cred = await register(email.trim(), password, displayName.trim());
      router.replace({ pathname: '/(auth)/select-suburb', params: { uid: cred.user.uid, email: email.trim(), displayName: displayName.trim() } });
    } catch (e) {
      Alert.alert('Sign up failed', e.message);
    } finally { setLoading(false); }
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
        <View style={{ height: 100 }} />
        <Text style={styles.appName}>My Suburb</Text>
        <Text style={styles.tagline}>Bringing suburbs together</Text>
        <View style={{ height: 40 }} />
        <Text style={styles.label}>YOUR NAME</Text>
        <TextInput
          style={styles.input}
          placeholder="Your full name"
          placeholderTextColor="rgba(255,255,255,0.4)"
          value={displayName}
          onChangeText={setDisplayName}
          autoCapitalize="words"
          returnKeyType="next"
        />
        <View style={{ height: 16 }} />
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
            placeholder="Min. 6 characters"
            placeholderTextColor="rgba(255,255,255,0.4)"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            returnKeyType="done"
            onSubmitEditing={handleSignup}
          />
          <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
            <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color="rgba(255,255,255,0.6)" />
          </TouchableOpacity>
        </View>
        <View style={{ height: 48 }} />
        <TouchableOpacity style={[styles.signUpBtn, loading && { opacity: 0.7 }]} onPress={handleSignup} disabled={loading}>
          {loading ? <ActivityIndicator color="#2D6A4F" /> : <Text style={styles.signUpText}>Create Account</Text>}
        </TouchableOpacity>
        <View style={{ height: 36 }} />
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.signinText}>Already have an account? <Text style={styles.signinLink}>Sign in</Text></Text>
        </TouchableOpacity>
        <View style={{ height: 60 }} />
      </ScrollView>
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
  signUpBtn: { width: '100%', backgroundColor: '#FFD700', borderRadius: 12, padding: 14, alignItems: 'center' },
  signUpText: { fontSize: 18, fontWeight: '800', color: '#2D6A4F' },
  signinText: { color: '#c8e6c9', fontSize: 15, textAlign: 'center' },
  signinLink: { color: '#FFD700', fontWeight: '700' },
});