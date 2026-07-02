import { useState, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { Colors } from '../constants/theme';

const COMMUNITY_TABS = [
  { key: 'updates', label: "What's Happening" },
  { key: 'notices', label: 'Notice' },
  { key: 'safety', label: 'Safety Alert' },
];

const MARKETPLACE_TABS = [
  { key: 'forsale', label: 'For Sale' },
  { key: 'giveaway', label: 'Give Away' },
  { key: 'seeking', label: 'Seeking' },
];

const COMMUNITY_PLACEHOLDERS = {
  updates: "Share what's going on in your suburb...",
  notices: 'Post an important notice for your suburb...',
  safety:  'Report a safety concern in your suburb...',
};

export default function CreatePostScreen() {
  const { category: initialCategory, preselect } = useLocalSearchParams();
  const { user, profile } = useAuth();

  const getDefaultCat = () => {
    if (initialCategory === 'community') return preselect || 'updates';
    if (initialCategory === 'marketplace') return preselect || 'forsale';
    if (initialCategory === 'lostfound') return preselect || 'lost';
    return preselect || 'updates';
  };

  const [selectedCategory, setSelectedCategory] = useState(getDefaultCat());
  const [content, setContent] = useState('');
  const [lfItem, setLfItem] = useState('');
  const [lfDescription, setLfDescription] = useState('');
  const [lfLocation, setLfLocation] = useState('');
  const [mpTitle, setMpTitle] = useState('');
  const [mpDescription, setMpDescription] = useState('');
  const [mpPrice, setMpPrice] = useState('');
  const [posting, setPosting] = useState(false);
  const scrollRef = useRef(null);

  const isLostFound = initialCategory === 'lostfound';
  const isMarketplace = initialCategory === 'marketplace';
  const isCommunity = initialCategory === 'community' || (!isLostFound && !isMarketplace);

  const pageTitle = isLostFound ? 'Lost & Found' : isMarketplace ? 'Buy & Sell' : 'Community Hub';

  const handlePost = async () => {
    if (isLostFound && !lfItem.trim()) { Alert.alert('Error', `Please describe what you ${selectedCategory === 'lost' ? 'lost' : 'found'}.`); return; }
    if (isMarketplace && !mpTitle.trim()) { Alert.alert('Error', 'Please describe your listing.'); return; }
    if (isCommunity && !content.trim()) { Alert.alert('Error', 'Please write something!'); return; }

    setPosting(true);
    try {
      let categoryValue = selectedCategory;
      let extraFields = {};
      let postContent = content.trim();

      if (isLostFound) {
        categoryValue = 'lostfound';
        extraFields = { lostFoundType: selectedCategory };
        postContent = lfItem.trim();
        if (lfDescription.trim()) extraFields.description = lfDescription.trim();
        if (lfLocation.trim()) extraFields.lostFoundLocation = lfLocation.trim();
      } else if (isMarketplace) {
        categoryValue = 'marketplace';
        postContent = mpTitle.trim();
        if (selectedCategory === 'forsale') extraFields = { marketplaceType: 'forsale', price: mpPrice ? parseFloat(mpPrice) : 0, isFree: false, isWanted: false };
        else if (selectedCategory === 'giveaway') extraFields = { marketplaceType: 'giveaway', isFree: true, isWanted: false, price: 0 };
        else if (selectedCategory === 'seeking') extraFields = { marketplaceType: 'seeking', isWanted: true, isFree: false, price: 0 };
        if (mpDescription.trim()) extraFields.description = mpDescription.trim();
      }
      // community: categoryValue is already 'updates'|'notices'|'safety'

      await addDoc(collection(db, 'posts'), {
        content: postContent,
        category: categoryValue,
        suburb: profile.suburb,
        state: profile.state,
        authorId: user.uid,
        authorName: profile.displayName,
        createdAt: serverTimestamp(),
        likeCount: 0,
        commentCount: 0,
        isRemoved: false,
        ...extraFields,
      });
      router.back();
    } catch (e) { Alert.alert('Error', e.message); }
    finally { setPosting(false); }
  };

  const tabs = isCommunity ? COMMUNITY_TABS : isMarketplace ? MARKETPLACE_TABS : null;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.closeBtn}>
          <Ionicons name="close" size={24} color={Colors.white} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.mySuburb}>My Suburb</Text>
          <Text style={styles.suburbName}>{profile?.suburb}, {profile?.state}</Text>
        </View>
        {/* Post button in header only for community */}
        {isCommunity ? (
          <TouchableOpacity style={[styles.postBtnHeader, posting && { opacity: 0.7 }]} onPress={handlePost} disabled={posting}>
            {posting ? <ActivityIndicator color={Colors.white} size="small" /> : <Text style={styles.postBtnHeaderText}>Post</Text>}
          </TouchableOpacity>
        ) : (
          <View style={{ width: 60 }} />
        )}
      </View>

      {/* Page sub-header */}
      <View style={styles.pageHeader}>
        <Text style={styles.pageTitle}>{pageTitle}</Text>
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.body}
        contentContainerStyle={{ paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        automaticallyAdjustKeyboardInsets={true}
      >
        {/* Solid pill tabs for all categories */}
        {tabs && (
          <View style={styles.tabRow}>
            {tabs.map(t => (
              <TouchableOpacity
                key={t.key}
                style={[styles.tabBtn, selectedCategory === t.key && styles.tabBtnActive]}
                onPress={() => setSelectedCategory(t.key)}
              >
                <Text style={[styles.tabText, selectedCategory === t.key && styles.tabTextActive]}>{t.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Lost & Found tabs */}
        {isLostFound && (
          <View style={styles.tabRow}>
            <TouchableOpacity style={[styles.tabBtn, selectedCategory === 'lost' && styles.tabBtnActive]} onPress={() => setSelectedCategory('lost')}>
              <Text style={[styles.tabText, selectedCategory === 'lost' && styles.tabTextActive]}>Lost</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.tabBtn, selectedCategory === 'found' && styles.tabBtnActive]} onPress={() => setSelectedCategory('found')}>
              <Text style={[styles.tabText, selectedCategory === 'found' && styles.tabTextActive]}>Found</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Community form */}
        {isCommunity && (
          <>
            <View style={styles.sectionBar}>
              <Text style={styles.sectionBarText}>
                {selectedCategory === 'updates' ? "What's happening in your suburb?" :
                 selectedCategory === 'notices' ? 'Post a notice...' : 'Report a safety concern...'}
              </Text>
            </View>
            <View style={styles.fieldPad}>
              <TextInput
                style={[styles.input, styles.inputLarge]}
                placeholder={COMMUNITY_PLACEHOLDERS[selectedCategory]}
                placeholderTextColor={Colors.midGrey}
                value={content}
                onChangeText={setContent}
                multiline
                textAlignVertical="top"
                autoCapitalize="sentences"
                autoCorrect={true}
              />
            </View>
          </>
        )}

        {/* Marketplace form */}
        {isMarketplace && (
          <>
            <View style={styles.sectionBar}>
              <Text style={styles.sectionBarText}>
                {selectedCategory === 'forsale' ? 'I am selling...' : selectedCategory === 'giveaway' ? 'I am giving away...' : 'I am looking for...'}
              </Text>
            </View>
            <View style={styles.fieldPad}>
              <TextInput
                style={styles.input2Line}
                placeholder={selectedCategory === 'forsale' ? 'e.g. iPhone 14, Toyota Corolla...' : selectedCategory === 'giveaway' ? 'e.g. Kids toys, old furniture...' : 'e.g. Second hand bike, lawn mower...'}
                placeholderTextColor={Colors.midGrey}
                value={mpTitle}
                onChangeText={setMpTitle}
                multiline
                numberOfLines={2}
                textAlignVertical="top"
                autoCapitalize="sentences"
                autoCorrect={true}
              />
            </View>

            <View style={styles.sectionBar}>
              <Text style={styles.sectionBarText}>Description</Text>
            </View>
            <View style={styles.fieldPad}>
              <TextInput
                style={styles.input2Line}
                placeholder="Condition, colour, size, any other details..."
                placeholderTextColor={Colors.midGrey}
                value={mpDescription}
                onChangeText={setMpDescription}
                multiline
                numberOfLines={2}
                textAlignVertical="top"
                autoCapitalize="sentences"
                autoCorrect={true}
              />
            </View>

            {selectedCategory === 'forsale' && (
              <>
                <View style={styles.sectionBar}>
                  <Text style={styles.sectionBarText}>Price</Text>
                </View>
                <View style={styles.fieldPad}>
                  <TextInput
                    style={styles.inputSingle}
                    placeholder="e.g. 25.00"
                    placeholderTextColor={Colors.midGrey}
                    value={mpPrice}
                    onChangeText={setMpPrice}
                    keyboardType="numeric"
                  />
                </View>
              </>
            )}

            <View style={styles.fieldPad}>
              <TouchableOpacity style={[styles.postBtnBottom, posting && { opacity: 0.7 }]} onPress={handlePost} disabled={posting}>
                {posting ? <ActivityIndicator color={Colors.white} size="small" /> : <Text style={styles.postBtnBottomText}>Post</Text>}
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* Lost & Found form */}
        {isLostFound && (
          <>
            <View style={styles.sectionBar}>
              <Text style={styles.sectionBarText}>{selectedCategory === 'lost' ? 'I lost...' : 'I found...'}</Text>
            </View>
            <View style={styles.fieldPad}>
              <TextInput
                style={styles.input2Line}
                placeholder={selectedCategory === 'lost' ? 'e.g. Black wallet, iPhone 15...' : 'e.g. Black wallet, iPhone 15...'}
                placeholderTextColor={Colors.midGrey}
                value={lfItem}
                onChangeText={setLfItem}
                multiline
                numberOfLines={2}
                textAlignVertical="top"
                autoCapitalize="sentences"
                autoCorrect={true}
              />
            </View>

            <View style={styles.sectionBar}>
              <Text style={styles.sectionBarText}>Description</Text>
            </View>
            <View style={styles.fieldPad}>
              <TextInput
                style={styles.input2Line}
                placeholder="Colour, size, features..."
                placeholderTextColor={Colors.midGrey}
                value={lfDescription}
                onChangeText={setLfDescription}
                multiline
                numberOfLines={2}
                textAlignVertical="top"
                autoCapitalize="sentences"
                autoCorrect={true}
              />
            </View>

            <View style={styles.sectionBar}>
              <Text style={styles.sectionBarText}>Location</Text>
            </View>
            <View style={styles.fieldPad}>
              <TextInput
                style={styles.input2Line}
                placeholder={selectedCategory === 'lost' ? 'Where did you last see it?' : 'Where did you find it?'}
                placeholderTextColor={Colors.midGrey}
                value={lfLocation}
                onChangeText={setLfLocation}
                multiline
                numberOfLines={2}
                textAlignVertical="top"
                autoCapitalize="sentences"
                autoCorrect={true}
                onFocus={() => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 300)}
              />
            </View>

            <View style={styles.fieldPad}>
              <TouchableOpacity style={[styles.postBtnBottom, posting && { opacity: 0.7 }]} onPress={handlePost} disabled={posting}>
                {posting ? <ActivityIndicator color={Colors.white} size="small" /> : <Text style={styles.postBtnBottomText}>Post</Text>}
              </TouchableOpacity>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.white },
  header: { backgroundColor: Colors.brandGreen, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 56, paddingBottom: 16, paddingHorizontal: 16 },
  closeBtn: { width: 36, justifyContent: 'center' },
  headerCenter: { alignItems: 'center' },
  mySuburb: { fontSize: 27, fontWeight: '800', color: Colors.white },
  suburbName: { fontSize: 17, color: '#FFD700', marginTop: 4 },
  postBtnHeader: { backgroundColor: Colors.white, paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20 },
  postBtnHeaderText: { fontSize: 14, fontWeight: '700', color: Colors.brandGreen },
  pageHeader: { backgroundColor: Colors.brandGreenPale, paddingVertical: 10, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: Colors.lightGrey },
  pageTitle: { fontSize: 20, fontWeight: '700', color: Colors.brandGreen },
  body: { flex: 1 },
  tabRow: { flexDirection: 'row', padding: 12, gap: 8, borderBottomWidth: 1, borderBottomColor: Colors.lightGrey },
  tabBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 25, backgroundColor: '#F0F0F0', borderWidth: 1, borderColor: Colors.lightGrey },
  tabBtnActive: { backgroundColor: Colors.brandGreen, borderColor: Colors.brandGreen },
  tabText: { fontSize: 13, color: Colors.midGrey, fontWeight: '600' },
  tabTextActive: { color: Colors.white, fontWeight: '700' },
  sectionBar: { backgroundColor: Colors.brandGreenPale, paddingVertical: 8, paddingHorizontal: 16, borderTopWidth: 1, borderBottomWidth: 1, borderColor: Colors.lightGrey },
  sectionBarText: { fontSize: 17, fontWeight: '700', color: Colors.brandGreen },
  fieldPad: { paddingHorizontal: 16, paddingVertical: 8 },
  input: { borderWidth: 1, borderColor: Colors.lightGrey, borderRadius: 12, padding: 12, fontSize: 15, color: Colors.charcoal },
  input2Line: { borderWidth: 1, borderColor: Colors.lightGrey, borderRadius: 12, padding: 12, fontSize: 15, color: Colors.charcoal, height: 68, textAlignVertical: 'top' },
  inputLarge: { minHeight: 160, textAlignVertical: 'top' },
  inputSingle: { borderWidth: 1, borderColor: Colors.lightGrey, borderRadius: 12, padding: 12, fontSize: 15, color: Colors.charcoal },
  postBtnBottom: { backgroundColor: Colors.brandGreen, borderRadius: 16, paddingVertical: 14, alignItems: 'center' },
  postBtnBottomText: { fontSize: 20, fontWeight: '800', color: Colors.white },
});