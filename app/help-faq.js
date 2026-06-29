import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

const FAQS = [
  { q: 'How does My Suburb work?', a: 'My Suburb connects you with neighbours in your exact suburb. All posts are only visible to people who live in the same suburb as you.' },
  { q: 'How do I change my suburb?', a: 'Go to Profile, tap Settings, then tap Change Suburb. You can search for any suburb in Australia.' },
  { q: 'Who can see my posts?', a: 'Only verified residents of your suburb can see your posts. Posts are never visible to people outside your suburb.' },
  { q: 'How do I report a post?', a: 'Tap on any post and look for the report button. Our moderation team reviews all reports promptly.' },
  { q: 'Is My Suburb free to use?', a: 'Yes, My Suburb is completely free to use. There are no ads or paid features.' },
  { q: 'How do I delete my account?', a: 'Go to Settings, scroll down to Account Actions and tap Delete Account. You can also email us at support@mysuburb.com.au' },
  { q: 'What is Buy and Sell?', a: 'Buy and Sell lets you list items for sale, give things away for free, or post what you are looking for. All transactions are between neighbours directly.' },
  { q: 'How do Safety Alerts work?', a: 'Safety Alerts are for genuine urgent safety concerns in your suburb such as break-ins or dangerous conditions. For emergencies always call 000 first.' },
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