import { useState, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, FlatList, Alert, ActivityIndicator, Modal } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { collection, addDoc, serverTimestamp, getDocs, query, where, writeBatch } from 'firebase/firestore';
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

const SERVICE_TABS = [
  { key: 'offering', label: 'I am Offering' },
  { key: 'looking',  label: 'I am Looking For' },
];

const SERVICE_CATEGORIES = [
  { key: 'plumbing',   label: 'Plumbing',           icon: 'water-outline' },
  { key: 'painting',   label: 'Painting',           icon: 'color-palette-outline' },
  { key: 'electrical', label: 'Electrical',         icon: 'flash-outline' },
  { key: 'handyman',   label: 'Handyman',           icon: 'hammer-outline' },
  { key: 'massage',    label: 'Massage',            icon: 'hand-left-outline' },
  { key: 'physio',     label: 'Physiotherapy',      icon: 'fitness-outline' },
  { key: 'carpentry',  label: 'Carpentry',          icon: 'construct-outline' },
  { key: 'cleaning',   label: 'Cleaning',           icon: 'sparkles-outline' },
  { key: 'gardening',  label: 'Gardening',          icon: 'leaf-outline' },
  { key: 'petcare',    label: 'Pet Care',           icon: 'paw-outline' },
  { key: 'childcare',  label: 'Child & Aged Care',  icon: 'heart-outline' },
  { key: 'tutoring',   label: 'Tutoring',           icon: 'school-outline' },
  { key: 'others',     label: 'Others',             icon: 'ellipsis-horizontal-outline' },
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
    if (initialCategory === 'services') return preselect || 'offering';
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
  const [selectedService, setSelectedService] = useState(null);
  const [showServiceModal, setShowServiceModal] = useState(false);
  const [posting, setPosting] = useState(false);
  const scrollRef = useRef(null);

  const isLostFound = initialCategory === 'lostfound';
  const isMarketplace = initialCategory === 'marketplace';
  const isServices = initialCategory === 'services';
  const isCommunity = !isLostFound && !isMarketplace && !isServices;

  const pageTitle = isCommunity ? 'Community Hub' : isMarketplace ? 'Buy & Sell' : isLostFound ? 'Lost & Found' : 'Services';

  const handlePost = async () => {
    if (isServices) {
      if (!selectedService) { Alert.alert('Error', 'Please select a service.'); return; }
      if (!content.trim()) { Alert.alert('Error', 'Please add a description.'); return; }
    } else if (isLostFound) {
      if (!lfItem.trim()) { Alert.alert('Error', `Please describe what you ${selectedCategory === 'lost' ? 'lost' : 'found'}.`); return; }
    } else if (isMarketplace) {
      if (!mpTitle.trim()) { Alert.alert('Error', 'Please describe your listing.'); return; }
    } else {
      if (!content.trim()) { Alert.alert('Error', 'Please write something!'); return; }
    }

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
      } else if (isServices) {
        categoryValue = 'services';
        extraFields = { serviceType: selectedService.key, serviceTab: selectedCategory };
      }

      const postRef = await addDoc(collection(db, 'posts'), {
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

      // Notify all users in same suburb except the poster
      try {
        const usersSnap = await getDocs(query(collection(db, 'users'), where('suburb', '==', profile.suburb)));
        const otherUsers = usersSnap.docs.filter(d => d.id !== user.uid);
        const categoryLabels = {
          community: 'Community', marketplace: 'Buy & Sell', lostfound: 'Lost & Found',
          events: 'Event', services: 'Service',
        };
        const label = categoryLabels[categoryValue] || 'Post';
        const batch = writeBatch(db);
        otherUsers.forEach(u => {
          const notifRef = collection(db, 'notifications');
          // Use addDoc outside batch for notifications
        });
        // Send individually (batch doesn't support addDoc)
        await Promise.all(otherUsers.map(u =>
          addDoc(collection(db, 'notifications'), {
            userId: u.id,
            type: 'new_post',
            message: `${profile.displayName} posted a new ${label} in ${profile.suburb}`,
            postId: postRef.id,
            fromUserId: user.uid,
            fromUserName: profile.displayName,
            isRead: false,
            createdAt: serverTimestamp(),
          })
        ));
      } catch (e) { console.error('notification error:', e); }

      router.back();
    } catch (e) { Alert.alert('Error', e.message); }
    finally { setPosting(false); }
  };

  const tabs = isCommunity ? COMMUNITY_TABS : isMarketplace ? MARKETPLACE_TABS : isServices ? SERVICE_TABS : null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.closeBtn}>
          <Ionicons name="close" size={24} color={Colors.white} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.mySuburb}>My Suburb</Text>
          <Text style={styles.suburbName}>{profile?.suburb}, {profile?.state}</Text>
        </View>
        {isCommunity ? (
          <TouchableOpacity style={[styles.postBtnHeader, posting && { opacity: 0.7 }]} onPress={handlePost} disabled={posting}>
            {posting ? <ActivityIndicator color={Colors.white} size="small" /> : <Text style={styles.postBtnHeaderText}>Post</Text>}
          </TouchableOpacity>
        ) : (
          <View style={{ width: 60 }} />
        )}
      </View>

      <View style={styles.pageHeader}>
        <Text style={styles.pageTitle}>{pageTitle}</Text>
      </View>

      <ScrollView ref={scrollRef} style={styles.body} contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} automaticallyAdjustKeyboardInsets={true}>

        {/* Tabs */}
        {tabs && (
          <View style={styles.tabRow}>
            {tabs.map(t => (
              <TouchableOpacity key={t.key} style={[styles.tabBtn, selectedCategory === t.key && styles.tabBtnActive]} onPress={() => setSelectedCategory(t.key)}>
                <Text style={[styles.tabText, selectedCategory === t.key && styles.tabTextActive]}>{t.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

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

        {/* SERVICES FORM — Select service then description */}
        {isServices && (
          <>
            {/* Step 1: Select service */}
            <View style={styles.sectionBar}>
              <Text style={styles.sectionBarText}>Select a Service</Text>
            </View>
            <View style={styles.fieldPad}>
              <TouchableOpacity style={styles.serviceSelector} onPress={() => setShowServiceModal(true)}>
                {selectedService ? (
                  <View style={styles.serviceSelectorSelected}>
                    <View style={styles.serviceSelectorIcon}>
                      <Ionicons name={SERVICE_CATEGORIES.find(s => s.key === selectedService.key)?.icon || 'briefcase-outline'} size={20} color={Colors.white} />
                    </View>
                    <Text style={styles.serviceSelectorText}>{selectedService.label}</Text>
                    <Ionicons name="chevron-down" size={18} color={Colors.brandGreen} />
                  </View>
                ) : (
                  <View style={styles.serviceSelectorPlaceholder}>
                    <Ionicons name="briefcase-outline" size={20} color={Colors.midGrey} />
                    <Text style={styles.serviceSelectorPlaceholderText}>Tap to select a service...</Text>
                    <Ionicons name="chevron-down" size={18} color={Colors.midGrey} />
                  </View>
                )}
              </TouchableOpacity>
            </View>

            {/* Step 2: Description */}
            <View style={styles.sectionBar}>
              <Text style={styles.sectionBarText}>
                {selectedCategory === 'offering' ? 'Describe your service' : 'What are you looking for?'}
              </Text>
            </View>
            <View style={styles.fieldPad}>
              <TextInput
                style={[styles.input, styles.inputLarge]}
                placeholder={selectedCategory === 'offering'
                  ? 'Tell neighbours about your service — experience, availability, rates...'
                  : 'Describe what you need — location, timing, budget...'}
                placeholderTextColor={Colors.midGrey}
                value={content}
                onChangeText={setContent}
                multiline
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

            {/* Service picker modal */}
            <Modal visible={showServiceModal} transparent animationType="slide">
              <View style={styles.modalOverlay}>
                <View style={styles.modalSheet}>
                  <View style={styles.modalHandle} />
                  <Text style={styles.modalTitle}>Select a Service</Text>
                  <FlatList
                    data={SERVICE_CATEGORIES}
                    keyExtractor={item => item.key}
                    showsVerticalScrollIndicator={false}
                    ListFooterComponent={<View style={{ height: 20 }} />}
                    renderItem={({ item: s }) => {
                      const isSelected = selectedService?.key === s.key;
                      return (
                        <TouchableOpacity key={s.key} style={[styles.modalItem, isSelected && styles.modalItemActive]} onPress={() => { setSelectedService(s); setShowServiceModal(false); }}>
                          <View style={[styles.modalItemIcon, isSelected && styles.modalItemIconActive]}>
                            <Ionicons name={s.icon} size={20} color={isSelected ? Colors.white : Colors.brandGreen} />
                          </View>
                          <Text style={[styles.modalItemText, isSelected && styles.modalItemTextActive]}>{s.label}</Text>
                          {isSelected && <Ionicons name="checkmark-circle" size={22} color={Colors.brandGreen} />}
                        </TouchableOpacity>
                      );
                    }}
                  />
                  <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setShowServiceModal(false)}>
                    <Text style={styles.modalCloseBtnText}>Close</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </Modal>
          </>
        )}

        {/* Community form */}
        {isCommunity && (
          <>
            <View style={styles.sectionBar}>
              <Text style={styles.sectionBarText}>
                {selectedCategory === 'updates' ? "What's happening?" : selectedCategory === 'notices' ? 'Post a notice...' : 'Report a safety concern...'}
              </Text>
            </View>
            <View style={styles.fieldPad}>
              <TextInput style={[styles.input, styles.inputLarge]} placeholder={COMMUNITY_PLACEHOLDERS[selectedCategory]} placeholderTextColor={Colors.midGrey} value={content} onChangeText={setContent} multiline textAlignVertical="top" autoCapitalize="sentences" autoCorrect={true} />
            </View>
          </>
        )}

        {/* Marketplace form */}
        {isMarketplace && (
          <>
            <View style={styles.sectionBar}>
              <Text style={styles.sectionBarText}>{selectedCategory === 'forsale' ? 'I am selling...' : selectedCategory === 'giveaway' ? 'I am giving away...' : 'I am looking for...'}</Text>
            </View>
            <View style={styles.fieldPad}>
              <TextInput style={styles.input2Line} placeholder={selectedCategory === 'forsale' ? 'e.g. iPhone 14, Toyota Corolla...' : selectedCategory === 'giveaway' ? 'e.g. Kids toys, old furniture...' : 'e.g. Second hand bike...'} placeholderTextColor={Colors.midGrey} value={mpTitle} onChangeText={setMpTitle} multiline numberOfLines={2} textAlignVertical="top" autoCapitalize="sentences" autoCorrect={true} />
            </View>
            <View style={styles.sectionBar}><Text style={styles.sectionBarText}>Description</Text></View>
            <View style={styles.fieldPad}>
              <TextInput style={styles.input2Line} placeholder="Condition, colour, size, any other details..." placeholderTextColor={Colors.midGrey} value={mpDescription} onChangeText={setMpDescription} multiline numberOfLines={2} textAlignVertical="top" autoCapitalize="sentences" autoCorrect={true} />
            </View>
            {selectedCategory === 'forsale' && (
              <>
                <View style={styles.sectionBar}><Text style={styles.sectionBarText}>Price</Text></View>
                <View style={styles.fieldPad}>
                  <TextInput style={styles.inputSingle} placeholder="e.g. 25.00" placeholderTextColor={Colors.midGrey} value={mpPrice} onChangeText={setMpPrice} keyboardType="numeric" />
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
            <View style={styles.sectionBar}><Text style={styles.sectionBarText}>{selectedCategory === 'lost' ? 'I lost...' : 'I found...'}</Text></View>
            <View style={styles.fieldPad}>
              <TextInput style={styles.input2Line} placeholder={selectedCategory === 'lost' ? 'e.g. Black wallet, iPhone 15...' : 'e.g. Black wallet, iPhone 15...'} placeholderTextColor={Colors.midGrey} value={lfItem} onChangeText={setLfItem} multiline numberOfLines={2} textAlignVertical="top" autoCapitalize="sentences" autoCorrect={true} />
            </View>
            <View style={styles.sectionBar}><Text style={styles.sectionBarText}>Description</Text></View>
            <View style={styles.fieldPad}>
              <TextInput style={styles.input2Line} placeholder="Colour, size, features..." placeholderTextColor={Colors.midGrey} value={lfDescription} onChangeText={setLfDescription} multiline numberOfLines={2} textAlignVertical="top" autoCapitalize="sentences" autoCorrect={true} />
            </View>
            <View style={styles.sectionBar}><Text style={styles.sectionBarText}>Location</Text></View>
            <View style={styles.fieldPad}>
              <TextInput style={styles.input2Line} placeholder={selectedCategory === 'lost' ? 'Where did you last see it?' : 'Where did you find it?'} placeholderTextColor={Colors.midGrey} value={lfLocation} onChangeText={setLfLocation} multiline numberOfLines={2} textAlignVertical="top" autoCapitalize="sentences" autoCorrect={true} onFocus={() => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 300)} />
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
  // Service selector
  serviceSelector: { borderWidth: 1.5, borderColor: Colors.brandGreen, borderRadius: 12, overflow: 'hidden' },
  serviceSelectorSelected: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  serviceSelectorIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.brandGreen, justifyContent: 'center', alignItems: 'center' },
  serviceSelectorText: { flex: 1, fontSize: 16, fontWeight: '700', color: Colors.brandGreen },
  serviceSelectorPlaceholder: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  serviceSelectorPlaceholderText: { flex: 1, fontSize: 15, color: Colors.midGrey },
  // Inputs
  input: { borderWidth: 1, borderColor: Colors.lightGrey, borderRadius: 12, padding: 12, fontSize: 15, color: Colors.charcoal },
  input2Line: { borderWidth: 1, borderColor: Colors.lightGrey, borderRadius: 12, padding: 12, fontSize: 15, color: Colors.charcoal, height: 68, textAlignVertical: 'top' },
  inputLarge: { minHeight: 160, textAlignVertical: 'top' },
  inputSingle: { borderWidth: 1, borderColor: Colors.lightGrey, borderRadius: 12, padding: 12, fontSize: 15, color: Colors.charcoal },
  postBtnBottom: { backgroundColor: Colors.brandGreen, borderRadius: 16, paddingVertical: 14, alignItems: 'center' },
  postBtnBottomText: { fontSize: 20, fontWeight: '800', color: Colors.white },
  // Service modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: Colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 32, maxHeight: '80%' },
  modalHandle: { width: 40, height: 4, backgroundColor: Colors.lightGrey, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: Colors.brandGreen, textAlign: 'center', marginBottom: 16 },
  modalItem: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, paddingHorizontal: 8, borderRadius: 14, marginBottom: 4 },
  modalItemActive: { backgroundColor: Colors.brandGreenPale },
  modalItemIcon: { width: 42, height: 42, borderRadius: 21, backgroundColor: Colors.brandGreenPale, justifyContent: 'center', alignItems: 'center' },
  modalItemIconActive: { backgroundColor: Colors.brandGreen },
  modalItemText: { flex: 1, fontSize: 16, color: Colors.charcoal, fontWeight: '600' },
  modalItemTextActive: { color: Colors.brandGreen, fontWeight: '700' },
  modalCloseBtn: { backgroundColor: Colors.brandGreenPale, borderRadius: 16, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  modalCloseBtnText: { fontSize: 16, fontWeight: '700', color: Colors.brandGreen },
});