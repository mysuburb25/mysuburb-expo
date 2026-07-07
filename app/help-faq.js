import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

const FAQS = [
  { q: 'How does My Suburb work?', a: 'My Suburb connects you with neighbours in your exact suburb. All posts are only visible to people who live in the same suburb as you.' },
  { q: 'How do I change my suburb?', a: 'Go to Profile, tap Settings, then tap Change Suburb. You can search for any suburb in Australia.' },
  { q: 'Can I follow more than one suburb?', a: 'Yes, you can select up to 3 suburbs — a Primary, Second, and Third. Posts from all your active suburbs appear together in your feed.' },
  { q: 'What is a Primary suburb?', a: 'Your Primary suburb is the first one you select and is where all your posts are published. It cannot be turned off, but you can replace it any time from Change Suburb.' },
  { q: 'How do I turn a suburb on or off in my feed?', a: 'Go to Profile and find the Selected Suburbs section. Each Second and Third suburb has a switch you can toggle on or off to control whether its posts show in your feed. Your Primary suburb is always on.' },
  { q: 'Who can see my posts?', a: 'Only verified residents of your suburb can see your posts. Posts are never visible to people outside your suburb.' },
  { q: 'How do I report a post?', a: 'Tap on any post and look for the report button. Our moderation team reviews all reports promptly.' },
  { q: 'Is My Suburb free to use?', a: 'Yes, My Suburb is completely free to use. There are no ads or paid features.' },
  { q: 'How do I delete my account?', a: 'Go to Settings, scroll down to Account Actions and tap Delete Account. You can also email us at support@mysuburb.com.au' },
  { q: 'What is Buy and Sell?', a: 'Buy and Sell lets you list items for sale, give things away for free, or post what you are looking for. All transactions are between neighbours directly.' },
  { q: 'How do Safety Alerts work?', a: 'Safety Alerts are for genuine urgent safety concerns in your suburb such as break-ins or dangerous conditions. For emergencies always call 000 first.' },
  { q: 'How do I message another neighbour directly?', a: 'Tap on a neighbour\'s name or profile from any post to open a private one-on-one chat with them.' },
  { q: 'Can I add photos to a post?', a: 'Yes, when creating a post you can attach up to 3 photos from your camera or photo library.' },
  { q: 'How do I change my profile photo?', a: 'Go to Profile and tap the camera icon on your avatar. You can take a new photo or choose one from your photo library.' },
  { q: 'How do I turn off notifications?', a: 'Go to Settings to manage which notifications you receive, such as likes, comments, and new posts in your suburb.' },
  { q: 'Can I sign up using just my mobile number?', a: 'Yes, on the sign up screen choose the Mobile option instead of Email and enter your Australian mobile number.' },
  { q: 'What happens to my posts and data if I delete my account?', a: 'Deleting your account removes your profile and personal details. Your posts may remain visible to protect ongoing conversations, but they will no longer be linked to your name. Contact support@mysuburb.com.au if you would like your posts removed as well.' },
];

export default function HelpFAQScreen() {
  const [open, setOpen] = useState(null);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Help and FAQ</Text>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.intro}>Find answers to common questions below.</Text>
        {FAQS.map((faq, i) => (
          <TouchableOpacity key={i} style={styles.faqItem} onPress={() => setOpen(open === i ? null : i)}>
            <View style={styles.faqHeader}>
              <Text style={styles.question}>{faq.q}</Text>
              <Ionicons name={open === i ? 'chevron-up' : 'chevron-down'} size={18} color="#2D6A4F" />
            </View>
            {open === i && <Text style={styles.answer}>{faq.a}</Text>}
          </TouchableOpacity>
        ))}
        <View style={styles.contact}>
          <Text style={styles.contactTitle}>Still need help?</Text>
          <Text style={styles.contactText}>Email us at support@mysuburb.com.au and we will get back to you within 24 hours.</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { backgroundColor: '#2D6A4F', paddingTop: 56, paddingBottom: 16, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#fff' },
  content: { padding: 16, gap: 8, paddingBottom: 40 },
  intro: { fontSize: 15, color: '#6B7280', marginBottom: 8 },
  faqItem: { backgroundColor: '#fff', borderRadius: 12, padding: 16, borderWidth: 0.5, borderColor: '#E5E7EB' },
  faqHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  question: { flex: 1, fontSize: 15, fontWeight: '600', color: '#1B1F23' },
  answer: { fontSize: 14, color: '#6B7280', lineHeight: 22, marginTop: 10 },
  contact: { backgroundColor: '#E8F5E9', borderRadius: 12, padding: 16, marginTop: 8 },
  contactTitle: { fontSize: 16, fontWeight: '700', color: '#2D6A4F', marginBottom: 6 },
  contactText: { fontSize: 14, color: '#2D6A4F', lineHeight: 22 },
});