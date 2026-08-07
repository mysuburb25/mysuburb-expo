import { ScrollView, Text, StyleSheet, View, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { renderTextWithEmail } from '../utils/renderTextWithEmail';

export default function CommunityGuidelinesScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>Community Guidelines</Text>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Community Guidelines</Text>
        <Text style={styles.updated}>Last updated: 20 July 2026</Text>
        <Text style={styles.intro}>My Suburb is your local community. These guidelines help keep our community safe, respectful and useful for everyone.</Text>

        <Text style={styles.heading}>Be Respectful</Text>
        <Text style={styles.body}>Treat your neighbours the way you want to be treated. Disagreements happen, but personal attacks, name-calling and harassment have no place in My Suburb.</Text>
        <Text style={styles.body}>Posts that target individuals based on race, religion, gender, sexuality, disability or cultural background will be removed immediately.</Text>

        <Text style={styles.heading}>Be Honest</Text>
        <Text style={styles.body}>Only post information you believe to be true. False safety alerts, misleading notices or fabricated posts damage trust in the community.</Text>
        <Text style={styles.body}>Use your real name and your actual suburb. Fake profiles or location spoofing will result in account removal.</Text>

        <Text style={styles.heading}>Stay Local and On-Topic</Text>
        <Text style={styles.body}>Posts should be relevant to your suburb and its residents. Keep content in the right category:</Text>
        <Text style={styles.bullet}>- Home: General updates, important notices, safety alerts</Text>
        <Text style={styles.bullet}>- Events: Local events with date, time and location</Text>
        <Text style={styles.bullet}>- Buy and Sell: Items for sale, give away or seeking</Text>
        <Text style={styles.bullet}>- Lost and Found: Lost or found pets, items and belongings</Text>
        <Text style={styles.bullet}>- Services: Services you're offering or looking for</Text>

        <Text style={styles.heading}>Child Safety — Zero Tolerance</Text>
        <Text style={styles.body}>My Suburb strictly and explicitly prohibits Child Sexual Abuse and Exploitation (CSAE) in any form. This includes, but is not limited to, Child Sexual Abuse Material (CSAM), grooming, sexualisation of minors, sextortion, trafficking, and any content or behaviour that sexually exploits, abuses, or endangers a child.</Text>
        <Text style={styles.body}>My Suburb is intended for users aged 18 and over. Any account found to be engaging in, facilitating, or distributing CSAE/CSAM content will be permanently banned immediately upon discovery, with no warning and no exceptions.</Text>
        <Text style={styles.body}>Confirmed CSAM is removed immediately upon our becoming aware of it, and is reported to the relevant authorities, including the Australian Centre to Counter Child Exploitation (ACCCE) and/or the National Center for Missing & Exploited Children (NCMEC), in accordance with applicable law.</Text>
        {renderTextWithEmail('If you encounter any content that concerns child safety, please report it immediately using the Report feature on the relevant post, comment, or user, or contact us at support@mysuburb.app.', 'support@mysuburb.app', styles.body, styles.emailLink)}

        <Text style={styles.heading}>What Is Not Allowed</Text>
        <Text style={styles.body}>The following content will be removed and may result in account suspension:</Text>
        <Text style={styles.bullet}>- Hate speech, racism, or discrimination of any kind</Text>
        <Text style={styles.bullet}>- Threats of violence or harm to any person</Text>
        <Text style={styles.bullet}>- Sexual or explicit content</Text>
        <Text style={styles.bullet}>- Child Sexual Abuse and Exploitation (CSAE) in any form — see dedicated section above</Text>
        <Text style={styles.bullet}>- Spam, scams or fraudulent listings</Text>
        <Text style={styles.bullet}>- Unsolicited advertising or commercial promotion</Text>
        <Text style={styles.bullet}>- False emergency alerts or misleading safety warnings</Text>
        <Text style={styles.bullet}>- Sharing someone's private information without consent</Text>
        <Text style={styles.bullet}>- Cyberbullying, image-based abuse, or other seriously harmful content</Text>
        <Text style={styles.bullet}>- Content that violates Australian law</Text>

        <Text style={styles.heading}>Buy and Sell Guidelines</Text>
        <Text style={styles.body}>My Suburb is for private sales between neighbours, not commercial businesses. Be honest about the condition of items.</Text>
        <Text style={styles.body}>Always meet in a safe public place when exchanging items with strangers. My Suburb is not responsible for transactions between users.</Text>
        <Text style={styles.body}>Once an item is sold, given away, or no longer available, mark the listing as Closed so other neighbours don't waste time asking.</Text>

        <Text style={styles.heading}>Prohibited Items</Text>
        <Text style={styles.body}>The following must never be listed for sale, trade, or giveaway on My Suburb. Listings will be removed immediately and the account permanently banned:</Text>
        <Text style={styles.bullet}>- Illegal drugs or controlled substances of any kind</Text>
        <Text style={styles.bullet}>- Prescription medicines or pharmaceuticals</Text>
        <Text style={styles.bullet}>- Weapons, firearms, ammunition, or knives restricted under Australian law</Text>
        <Text style={styles.bullet}>- Alcohol or tobacco products</Text>
        <Text style={styles.bullet}>- Infant formula and baby food (these are regulated products in Australia and cannot be resold through informal listings)</Text>
        <Text style={styles.bullet}>- Recalled, counterfeit, or stolen goods</Text>
        <Text style={styles.bullet}>- Animals or pets (for adoption/rehoming, please use registered services)</Text>
        <Text style={styles.body}>If you're unsure whether an item is allowed, please contact us before posting. Reported listings involving prohibited items will be escalated for immediate review.</Text>

        <Text style={styles.heading}>Lost and Found Guidelines</Text>
        <Text style={styles.body}>When posting about a lost pet or item, include as much detail as possible including description, location last seen, and a contact method.</Text>
        <Text style={styles.body}>If you find something valuable, hand it in to your local police station if the owner cannot be found through the app.</Text>
        <Text style={styles.body}>Once a lost item or pet has been recovered, or a found item has been returned to its owner, mark the post as Closed.</Text>

        <Text style={styles.heading}>Safety Alerts</Text>
        <Text style={styles.body}>Safety alerts should only be used for genuine safety concerns such as suspicious activity, dangerous road conditions, or local emergencies.</Text>
        <Text style={styles.body}>For life-threatening emergencies, always call 000 first before posting to the app. False safety alerts will result in immediate account suspension.</Text>

        <Text style={styles.heading}>Blocking Other Users</Text>
        <Text style={styles.body}>If another user is bothering you, you can block them at any time from their profile, or from the menu on any of their posts. Blocking someone stops them from messaging you and hides their posts from your feed.</Text>
        <Text style={styles.body}>Blocking is a personal tool for your own feed and inbox — it doesn't remove the other person's content for everyone else, or notify them that you've blocked them. If their behaviour breaks these guidelines, please also report them so our moderation team can review it.</Text>

        <Text style={styles.heading}>Reporting and Enforcement</Text>
        <Text style={styles.body}>You can report a post, comment, or user directly within the app. Our moderation team reviews reports promptly.</Text>
        <Text style={styles.body}>For cyberbullying, image-based abuse, or other seriously harmful content, you can report directly to the eSafety Commissioner at esafety.gov.au in addition to reporting within the app.</Text>
        <Text style={styles.body}>Violations of these guidelines may result in content removal, a warning, temporary suspension or permanent account ban.</Text>
        <Text style={styles.body}>Serious violations including threats of violence, illegal content or repeat offending will result in immediate permanent banning and may be referred to Australian authorities.</Text>

        <Text style={styles.heading}>Appeals</Text>
        {renderTextWithEmail('If you believe a moderation decision was made in error, you can appeal by contacting support@mysuburb.app with details of the decision and why you believe it should be reviewed.', 'support@mysuburb.app', styles.body, styles.emailLink)}

        <Text style={styles.heading}>Contact Us</Text>
        {renderTextWithEmail('To report a serious issue or appeal a moderation decision, contact us at support@mysuburb.app', 'support@mysuburb.app', styles.body, styles.emailLink)}

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
  emailLink: { color: '#1565C0', textDecorationLine: 'underline' },
  spacer: { height: 40 },
});