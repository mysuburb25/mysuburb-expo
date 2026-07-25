import { View, Text, TouchableOpacity, StyleSheet, Linking, Alert } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/theme';

// A dedicated, full-screen destination for admin warnings — reached by
// tapping a warning notification. Deliberately NOT just inline text in
// the notifications list: a warning about your account is more serious
// than a like or comment, and deserves its own clear moment with real
// actions, rather than blending into an ordinary scrollable list.
export default function WarningDetailScreen() {
  const { message } = useLocalSearchParams();

  const handleContactSupport = () => {
    const subject = encodeURIComponent('Re: Warning on my My Suburb account');
    const body = encodeURIComponent(
      `Hi,\n\nI received the following warning on my account and would like to discuss it:\n\n"${message}"\n\nMy message:\n`
    );
    const url = `mailto:support@mysuburb.app?subject=${subject}&body=${body}`;
    Linking.openURL(url).catch(() => {
      Alert.alert('Error', "Couldn't open your email app. Please email support@mysuburb.app directly.");
    });
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Account Warning</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.body}>
        <View style={styles.iconCircle}>
          <Ionicons name="warning" size={36} color="#fff" />
        </View>

        <Text style={styles.title}>You've received a warning</Text>
        <Text style={styles.subtitle}>
          A My Suburb admin has flagged something on your account that goes against our Community Guidelines.
        </Text>

        <View style={styles.messageCard}>
          <Text style={styles.messageText}>{message}</Text>
        </View>

        <Text style={styles.hint}>
          Repeated or serious violations can lead to account suspension. If you believe this warning was made in error, you can contact our support team below.
        </Text>

        <TouchableOpacity style={styles.understandBtn} onPress={() => router.back()}>
          <Text style={styles.understandBtnText}>I Understand</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.contactBtn} onPress={handleContactSupport}>
          <Ionicons name="mail-outline" size={18} color="#E53935" />
          <Text style={styles.contactBtnText}>Contact Support</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.white },
  header: { backgroundColor: '#E53935', paddingTop: 56, paddingBottom: 16, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#fff' },
  body: { flex: 1, padding: 24, alignItems: 'center' },
  iconCircle: { width: 76, height: 76, borderRadius: 38, backgroundColor: '#E53935', justifyContent: 'center', alignItems: 'center', marginTop: 24, marginBottom: 20 },
  title: { fontSize: 21, fontWeight: '800', color: Colors.charcoal, textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: 14, color: Colors.midGrey, textAlign: 'center', lineHeight: 20, marginBottom: 20 },
  messageCard: { backgroundColor: '#FFF0F0', borderRadius: 14, borderWidth: 1.5, borderColor: '#F5C6C6', padding: 18, width: '100%', marginBottom: 16 },
  messageText: { fontSize: 15, color: Colors.charcoal, lineHeight: 22 },
  hint: { fontSize: 13, color: Colors.midGrey, textAlign: 'center', lineHeight: 19, marginBottom: 28 },
  understandBtn: { backgroundColor: Colors.brandGreen, borderRadius: 14, paddingVertical: 15, alignItems: 'center', width: '100%', marginBottom: 12 },
  understandBtnText: { fontSize: 16, fontWeight: '700', color: Colors.white },
  contactBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1.5, borderColor: '#E53935', borderRadius: 14, paddingVertical: 14, width: '100%' },
  contactBtnText: { fontSize: 15, fontWeight: '700', color: '#E53935' },
});
