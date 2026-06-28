import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { Colors } from '../../constants/theme';

export default function SignupScreen() {
  const { register } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <View style={styles.logoCircle}><Text style={styles.logoText}>MS</Text></View>
        <Text style={styles.title}>Create Account</Text>
        <Text style={styles.subtitle}>Join your local community</Text>
      </View>
      <Text style={styles.label}>Display Name</Text>
      <TextInput style={styles.input} placeholder="Your name" value={displayName} onChangeText={setDisplayName} autoCapitalize="words" />
      <Text style={styles.label}>Email</Text>
      <TextInput style={styles.input} placeholder="your@email.com" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
      <Text style={styles.label}>Password</Text>
      <TextInput style={styles.input} placeholder="Min. 6 characters" value={password} onChangeText={setPassword} secureTextEntry />
      <TouchableOpacity style={[styles.button, loading && styles.buttonDisabled]} onPress={handleSignup} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Create Account</Text>}
      </TouchableOpacity>
      <TouchableOpacity style={styles.linkButton} onPress={() => router.back()}>
        <Text style={styles.linkText}>Already have an account? <Text style={styles.linkBold}>Sign in</Text></Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: Colors.sand, padding: 24 },
  header: { alignItems: 'center', paddingTop: 80, paddingBottom: 40 },
  logoCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: Colors.brandGreen, justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  logoText: { color: '#fff', fontSize: 28, fontWeight: '800' },
  title: { fontSize: 28, fontWeight: '800', color: Colors.charcoal, marginBottom: 8 },
  subtitle: { fontSize: 15, color: Colors.midGrey, textAlign: 'center' },
  label: { fontSize: 14, fontWeight: '600', color: Colors.charcoal, marginBottom: 4, marginTop: 12 },
  input: { backgroundColor: Colors.white, borderRadius: 12, padding: 14, fontSize: 15, borderWidth: 1, borderColor: Colors.lightGrey, color: Colors.charcoal },
  button: { backgroundColor: Colors.brandGreen, borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 24 },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  linkButton: { alignItems: 'center', marginTop: 16, padding: 8 },
  linkText: { color: Colors.midGrey, fontSize: 14 },
  linkBold: { color: Colors.brandGreen, fontWeight: '700' },
});