import { ScrollView, Text, StyleSheet, View, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export default function PrivacyPolicyScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Privacy Policy</Text>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Privacy Policy</Text>
        <Text style={styles.updated}>Last updated: 29 June 2026</Text>
        <Text style={styles.intro}>My Suburb is committed to protecting your privacy. This policy explains how we collect, use and safeguard your information when you use our app.</Text>

        <Text style={styles.heading}>1. Information We Collect</Text>
        <Text style={styles.body}>We collect your name, email address, suburb and state when you register.</Text>
        <Text style={styles.body}>We collect posts, comments and listings you create within the app.</Text>
        <Text style={styles.body}>We collect basic device data for app performance purposes.</Text>

        <Text style={styles.heading}>2. How We Use Your Information</Text>
        <Text style={styles.body}>We use your information to provide and operate My Suburb, display your posts to neighbours in your suburb, send notifications about activity on your posts, and improve your experience.</Text>

        <Text style={styles.heading}>3. How We Share Your Information</Text>
        <Text style={styles.body}>We do not sell your personal information to third parties.</Text>
        <Text style={styles.body}>Your posts, profile name and suburb are visible to other users in your suburb.</Text>
        <Text style={styles.body}>We use Google Firebase for authentication and data storage. Your data may be stored on servers located outside Australia.</Text>
        <Text style={styles.body}>We may disclose your information if required by Australian law or to protect the safety of our users.</Text>

        <Text style={styles.heading}>4. Data Storage and Security</Text>
        <Text style={styles.body}>Your data is stored securely using Google Firebase with industry-standard encryption. We take reasonable steps to protect your information from unauthorised access.</Text>

        <Text style={styles.heading}>5. Your Rights</Text>
        <Text style={styles.body}>Under the Australian Privacy Act 1988, you have the right to access, correct or delete your personal information.</Text>
        <Text style={styles.body}>To exercise these rights, contact us at privacy@mysuburb.com.au</Text>

        <Text style={styles.heading}>6. Children</Text>
        <Text style={styles.body}>My Suburb is not intended for children under 13. We do not knowingly collect information from children under 13.</Text>

        <Text style={styles.heading}>7. Changes</Text>
        <Text style={styles.body}>We may update this policy from time to time and will notify you of significant changes through the app.</Text>

        <Text style={styles.heading}>8. Contact Us</Text>
        <Text style={styles.body}>Questions about this policy? Contact us at privacy@mysuburb.com.au</Text>

        <View style={styles.spacer} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  header: { backgroundColor: '#2D6A4F', paddingTop: 56, paddingBottom: 16, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#fff' },
  content: { padding: 20, paddingBottom: 60 },
  title: { fontSize: 24, fontWeight: '800', color: '#2D6A4F', marginBottom: 4 },
  updated: { fontSize: 13, color: '#6B7280', marginBottom: 20 },
  intro: { fontSize: 15, color: '#1B1F23', lineHeight: 24, marginBottom: 20 },
  heading: { fontSize: 17, fontWeight: '700', color: '#2D6A4F', marginTop: 20, marginBottom: 8 },
  body: { fontSize: 15, color: '#1B1F23', lineHeight: 24, marginBottom: 8 },
  spacer: { height: 40 },
});