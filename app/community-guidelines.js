import { ScrollView, Text, StyleSheet, View, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export default function CommunityGuidelinesScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Community Guidelines</Text>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Community Guidelines</Text>
        <Text style={styles.updated}>Last updated: 29 June 2026</Text>
        <Text style={styles.intro}>My Suburb is your local community. These guidelines help keep our community safe, respectful and useful for everyone.</Text>

        <Text style={styles.heading}>Be Respectful</Text>
        <Text style={styles.body}>Treat your neighbours the way you want to be treated. Disagreements happen, but personal attacks, name-calling and harassment have no place in My Suburb.</Text>
        <Text style={styles.body}>Posts that target individuals based on race, religion, gender, sexuality, disability or cultural background will be removed immediately.</Text>

        <Text style={styles.heading}>Be Honest</Text>
        <Text style={styles.body}>Only post information you believe to be true. False safety alerts, misleading notices or fabricated posts damage trust in the community.</Text>
        <Text style={styles.body}>Use your real name and your actual suburb. Fake profiles or location spoofing will result in account removal.</Text>

        <Text style={styles.heading}>Stay Local and On-Topic</Text>
        <Text style={styles.body}>Posts should be relevant to your suburb and its residents. Keep content in the right category:</Text>
        <Text style={styles.bullet}>- Community Hub: General updates, important notices, safety alerts</Text>
        <Text style={styles.bullet}>- Events: Local events with date, time and location</Text>
        <Text style={styles.bullet}>- Buy and Sell: Items for sale, give away or seeking</Text>
        <Text style={styles.bullet}>- Lost and Found: Lost or found pets, items and belongings</Text>

        <Text style={styles.heading}>What Is Not Allowed</Text>
        <Text style={styles.body}>The following content will be removed and may result in account suspension:</Text>
        <Text style={styles.bullet}>- Hate speech, racism, or discrimination of any kind</Text>
        <Text style={styles.bullet}>- Threats of violence or harm to any person</Text>
        <Text style={styles.bullet}>- Sexual or explicit content</Text>
        <Text style={styles.bullet}>- Content involving or targeting minors inappropriately</Text>
        <Text style={styles.bullet}>- Spam, scams or fraudulent listings</Text>
        <Text style={styles.bullet}>- Unsolicited advertising or commercial promotion</Text>
        <Text style={styles.bullet}>- False emergency alerts or misleading safety warnings</Text>
        <Text style={styles.bullet}>- Sharing someone private information without consent</Text>
        <Text style={styles.bullet}>- Content that violates Australian law</Text>

        <Text style={styles.heading}>Buy and Sell Guidelines</Text>
        <Text style={styles.body}>My Suburb is for private sales between neighbours, not commercial businesses. Be honest about the condition of items.</Text>
        <Text style={styles.body}>Always meet in a safe public place when exchanging items with strangers. My Suburb is not responsible for transactions between users.</Text>

        <Text style={styles.heading}>Lost and Found Guidelines</Text>
        <Text style={styles.body}>When posting about a lost pet or item, include as much detail as possible including description, location last seen, and a contact method.</Text>
        <Text style={styles.body}>If you find something valuable, hand it in to your local police station if the owner cannot be found through the app.</Text>

        <Text style={styles.heading}>Safety Alerts</Text>
        <Text style={styles.body}>Safety alerts should only be used for genuine safety concerns such as suspicious activity, dangerous road conditions, or local emergencies.</Text>
        <Text style={styles.body}>For life-threatening emergencies, always call 000 first before posting to the app. False safety alerts will result in immediate account suspension.</Text>

        <Text style={styles.heading}>Enforcement</Text>
        <Text style={styles.body}>Violations of these guidelines may result in content removal, a warning, temporary suspension or permanent account ban.</Text>
        <Text style={styles.body}>Serious violations including threats of violence, illegal content or repeat offending will result in immediate permanent banning and may be referred to Australian authorities.</Text>

        <Text style={styles.heading}>Contact Us</Text>
        <Text style={styles.body}>To report a serious issue or appeal a moderation decision, contact us at community@mysuburb.com.au</Text>

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