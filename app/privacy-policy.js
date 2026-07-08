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
        <Text style={styles.updated}>Last updated: 8 July 2026</Text>
        <Text style={styles.intro}>My Suburb is committed to protecting your privacy. This policy explains how we collect, use, store, and share your information when you use our app, and how you can contact us with questions, requests, or complaints.</Text>

        <Text style={styles.heading}>1. Information We Collect</Text>
        <Text style={styles.body}>We collect your name, email address or mobile number, and password when you register.</Text>
        <Text style={styles.body}>We collect your suburb, state, and any additional suburbs you add to your profile.</Text>
        <Text style={styles.body}>We collect posts, comments, replies, likes, listings, and photos you create or upload within the app.</Text>
        <Text style={styles.body}>We collect the content of private messages you send to other users through the app's chat feature.</Text>
        <Text style={styles.body}>We collect a list of any users you choose to block.</Text>
        <Text style={styles.body}>We collect basic device and usage data (such as app version and crash reports) for performance and troubleshooting purposes.</Text>

        <Text style={styles.heading}>2. How We Use Your Information</Text>
        <Text style={styles.body}>We use your information to provide and operate My Suburb, display your posts to neighbours in your active suburbs, deliver private messages to their intended recipient, send notifications about activity relevant to you, and improve and troubleshoot your experience.</Text>

        <Text style={styles.heading}>3. How We Share Your Information</Text>
        <Text style={styles.body}>We do not sell your personal information to third parties.</Text>
        <Text style={styles.body}>Your posts, display name, and suburb are visible to other users who share an active suburb with you. Direct messages are only visible to you and the recipient.</Text>
        <Text style={styles.body}>We use Google Firebase (a Google Cloud service) for authentication, data storage, and file storage. Firebase may store and process your data on servers located outside Australia, including in the United States, as part of Google's global infrastructure. We take reasonable steps to only work with providers that maintain appropriate security and confidentiality standards, but we cannot guarantee that overseas recipients will handle your data exactly as Australian law would require, and Australian privacy law may not apply to acts done overseas.</Text>
        <Text style={styles.body}>We may disclose your information if required by Australian law, in response to a valid legal request, or where necessary to protect the safety of our users.</Text>

        <Text style={styles.heading}>4. Data Storage and Security</Text>
        <Text style={styles.body}>Your data is stored using Google Firebase with industry-standard encryption in transit and at rest. We take reasonable technical and organisational steps to protect your information from unauthorised access, misuse, or loss.</Text>
        <Text style={styles.body}>No method of transmission or storage is completely secure, and we cannot guarantee absolute security.</Text>

        <Text style={styles.heading}>5. Data Retention and Account Deletion</Text>
        <Text style={styles.body}>We retain your personal information for as long as your account is active, or as needed to provide the app to you.</Text>
        <Text style={styles.body}>If you delete your account, we remove your profile information and Firebase authentication record. Posts and comments you've made may remain visible to preserve the integrity of conversations they're part of, but they will no longer be linked to an active account or your personal details beyond the display name already shown at the time of posting.</Text>
        <Text style={styles.body}>If you would like your posts and comments removed as well as your account, contact us at privacy@mysuburb.com.au and we will action this within a reasonable time.</Text>

        <Text style={styles.heading}>6. Your Rights and How to Complain</Text>
        <Text style={styles.body}>Under the Australian Privacy Act 1988 and the Australian Privacy Principles, you have the right to access, correct, or request deletion of your personal information.</Text>
        <Text style={styles.body}>To exercise these rights, or to make a complaint about how we've handled your personal information, contact us at privacy@mysuburb.com.au. We will investigate your complaint and aim to respond within 30 days.</Text>
        <Text style={styles.body}>If you're not satisfied with our response, you can lodge a complaint with the Office of the Australian Information Commissioner (OAIC) at oaic.gov.au.</Text>

        <Text style={styles.heading}>7. Automated Decision-Making</Text>
        <Text style={styles.body}>We do not currently use automated systems to make decisions that significantly affect your rights or interests. If this changes in future, we will update this policy to explain how and provide details of the automated processes used.</Text>

        <Text style={styles.heading}>8. Age Requirements</Text>
        <Text style={styles.body}>My Suburb is intended for users aged 16 and over. We do not knowingly collect personal information from anyone under 16. If you believe a user under 16 has provided us with personal information, please contact us at privacy@mysuburb.com.au so we can investigate and take appropriate action.</Text>

        <Text style={styles.heading}>9. Changes to This Policy</Text>
        <Text style={styles.body}>We may update this policy from time to time to reflect changes in our practices or in the law. If we make material changes, we will notify you through the app before they take effect. Your continued use of My Suburb after a change takes effect means you accept the updated policy.</Text>

        <Text style={styles.heading}>10. Contact Us</Text>
        <Text style={styles.body}>Questions, requests, or complaints about this policy or your personal information can be sent to privacy@mysuburb.com.au</Text>

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