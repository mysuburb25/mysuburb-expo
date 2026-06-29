import { ScrollView, Text, StyleSheet, View, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export default function TermsOfServiceScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Terms of Service</Text>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Terms of Service</Text>
        <Text style={styles.updated}>Last updated: 29 June 2026</Text>
        <Text style={styles.intro}>By using My Suburb, you agree to these Terms of Service. Please read them carefully before using the app.</Text>

        <Text style={styles.heading}>1. Acceptance of Terms</Text>
        <Text style={styles.body}>By creating an account or using My Suburb, you agree to be bound by these Terms of Service and our Privacy Policy and Community Guidelines. If you do not agree, please do not use the app.</Text>

        <Text style={styles.heading}>2. Eligibility</Text>
        <Text style={styles.body}>You must be at least 13 years of age to use My Suburb. By using the app, you confirm that you are at least 13 years old and that the information you provide is accurate and truthful.</Text>

        <Text style={styles.heading}>3. Your Account</Text>
        <Text style={styles.body}>You are responsible for maintaining the security of your account and password. You must not share your account with others or allow unauthorised access.</Text>
        <Text style={styles.body}>You agree to provide accurate information including your real suburb and state. Using a false location to access another suburb feed is a violation of these terms.</Text>
        <Text style={styles.body}>You may only have one My Suburb account.</Text>

        <Text style={styles.heading}>4. User Content</Text>
        <Text style={styles.body}>You retain ownership of the content you post on My Suburb. By posting content, you grant My Suburb a non-exclusive, royalty-free licence to display your content within the app.</Text>
        <Text style={styles.body}>You are solely responsible for the content you post. My Suburb does not endorse or verify user-generated content.</Text>
        <Text style={styles.body}>You agree not to post content that is false, misleading, defamatory, offensive, or in violation of Australian law.</Text>

        <Text style={styles.heading}>5. Prohibited Conduct</Text>
        <Text style={styles.body}>You must not:</Text>
        <Text style={styles.bullet}>- Harass, threaten or bully other users</Text>
        <Text style={styles.bullet}>- Post spam, advertising or unsolicited messages</Text>
        <Text style={styles.bullet}>- Impersonate another person or organisation</Text>
        <Text style={styles.bullet}>- Post content that is illegal under Australian law</Text>
        <Text style={styles.bullet}>- Attempt to hack or disrupt the app or its servers</Text>
        <Text style={styles.bullet}>- Scrape or collect other users data without consent</Text>
        <Text style={styles.bullet}>- Use the app for commercial solicitation without permission</Text>
        <Text style={styles.bullet}>- Post false safety alerts or misleading community notices</Text>

        <Text style={styles.heading}>6. Content Moderation</Text>
        <Text style={styles.body}>My Suburb reserves the right to remove any content that violates these terms or our Community Guidelines without prior notice.</Text>
        <Text style={styles.body}>We may suspend or terminate accounts that repeatedly violate our terms.</Text>

        <Text style={styles.heading}>7. Limitation of Liability</Text>
        <Text style={styles.body}>My Suburb is provided as-is without warranties of any kind. We do not guarantee the app will be available at all times or free from errors.</Text>
        <Text style={styles.body}>My Suburb does not verify the accuracy of user-posted content. Use your own judgement when responding to posts.</Text>

        <Text style={styles.heading}>8. Governing Law</Text>
        <Text style={styles.body}>These Terms of Service are governed by the laws of Queensland, Australia. Any disputes will be resolved in the courts of Queensland.</Text>

        <Text style={styles.heading}>9. Changes to Terms</Text>
        <Text style={styles.body}>We may update these terms from time to time. Continued use of My Suburb after changes constitutes acceptance.</Text>

        <Text style={styles.heading}>10. Contact Us</Text>
        <Text style={styles.body}>For questions about these terms, contact us at legal@mysuburb.com.au</Text>

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
  bullet: { fontSize: 15, color: '#1B1F23', lineHeight: 24, paddingLeft: 12, marginBottom: 4 },
  spacer: { height: 40 },
});