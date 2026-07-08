import { useState, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, FlatList, Alert, ActivityIndicator, Modal, Image, KeyboardAvoidingView, Platform } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { collection, addDoc, serverTimestamp, getDocs, query, where, writeBatch } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { Colors } from '../constants/theme';

const COMMUNITY_TABS = [
  { key: 'updates', label: 'General' },
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
  updates: "Share news, updates or anything happening in your suburb with your neighbours...",
  notices: "Post an important notice — road closures, local meetings, community news...",
  safety:  "Report a safety concern — suspicious activity, hazards, emergencies in your area...",
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
  const [lfLocationSuggestions, setLfLocationSuggestions] = useState([]);
  const [showLfLocationSuggestions, setShowLfLocationSuggestions] = useState(false);
  const [loadingLfSuggestions, setLoadingLfSuggestions] = useState(false);
  const lfLocationDebounceRef = useRef(null);
  const [mpTitle, setMpTitle] = useState('');
  const [mpDescription, setMpDescription] = useState('');
  const [mpPrice, setMpPrice] = useState('');
  const [selectedService, setSelectedService] = useState(null);
  const [showServiceModal, setShowServiceModal] = useState(false);
  const [images, setImages] = useState([]); // array of { uri }
  const [posting, setPosting] = useState(false);
  const scrollRef = useRef(null);

  const isLostFound = initialCategory === 'lostfound';
  const isMarketplace = initialCategory === 'marketplace';
  const isServices = initialCategory === 'services';
  const isCommunity = !isLostFound && !isMarketplace && !isServices;

  const pageTitle = isCommunity ? 'Community Hub' : isMarketplace ? 'Buy & Sell' : isLostFound ? 'Lost & Found' : 'Services';

  const handlePickImage = () => {
    if (images.length >= 3) { Alert.alert('Limit reached', 'You can only add up to 3 images.'); return; }
    const remaining = 3 - images.length;
    Alert.alert('Add Photos', 'Choose an option', [
      {
        text: 'Take Photo',
        onPress: async () => {
          const { status } = await ImagePicker.requestCameraPermissionsAsync();
          if (status !== 'granted') { Alert.alert('Permission needed', 'Please allow camera access.'); return; }
          const result = await ImagePicker.launchCameraAsync({ allowsEditing: true, quality: 0.7, aspect: [4, 3] });
          if (!result.canceled) setImages(prev => [...prev, { uri: result.assets[0].uri }]);
        },
      },
      {
        text: `Choose from Library`,
        onPress: async () => {
          const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (status !== 'granted') { Alert.alert('Permission needed', 'Please allow photo library access.'); return; }
          const result = await ImagePicker.launchImageLibraryAsync({
            quality: 0.7,
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsMultipleSelection: true,
            selectionLimit: remaining,
            allowsEditing: false,
            preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Current,
          });
          if (!result.canceled) {
            const newImages = result.assets.slice(0, remaining).map(a => ({ uri: a.uri }));
            setImages(prev => [...prev, ...newImages]);
          }
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const removeImage = (index) => {
    setImages(prev => prev.filter((_, i) => i !== index));
  };

  const fetchLfLocationSuggestions = async (text) => {
    const apiKey = process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY;
    if (!apiKey) return;
    setLoadingLfSuggestions(true);
    try {
      const response = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': 'suggestions.placePrediction.text,suggestions.placePrediction.placeId',
        },
        body: JSON.stringify({ input: text, includedRegionCodes: ['au'], languageCode: 'en' }),
      });
      const data = await response.json();
      const suggestions = (data.suggestions || [])
        .filter(s => s.placePrediction)
        .map(s => ({ placeId: s.placePrediction.placeId, text: s.placePrediction.text.text }));
      setLfLocationSuggestions(suggestions);
      setShowLfLocationSuggestions(suggestions.length > 0);
    } catch (e) {
      console.error('Places autocomplete error:', e);
      setLfLocationSuggestions([]);
    } finally {
      setLoadingLfSuggestions(false);
    }
  };

  const handleLfLocationChange = (text) => {
    setLfLocation(text);
    if (lfLocationDebounceRef.current) clearTimeout(lfLocationDebounceRef.current);
    if (text.trim().length < 3) {
      setLfLocationSuggestions([]);
      setShowLfLocationSuggestions(false);
      return;
    }
    lfLocationDebounceRef.current = setTimeout(() => fetchLfLocationSuggestions(text.trim()), 350);
  };

  const handleSelectLfLocationSuggestion = (suggestion) => {
    setLfLocation(suggestion.text);
    setLfLocationSuggestions([]);
    setShowLfLocationSuggestions(false);
  };

  const uploadImages = async (postId) => {
    const urls = [];
    for (let i = 0; i < images.length; i++) {
      const response = await fetch(images[i].uri);
      const blob = await response.blob();
      const storageRef = ref(storage, `posts/${postId}/image_${i}.jpg`);
      await uploadBytes(storageRef, blob);
      const url = await getDownloadURL(storageRef);
      urls.push(url);
    }
    return urls;
  };

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
        images: [],
        ...extraFields,
      });

      // Upload images if any
      if (images.length > 0) {
        const imageUrls = await uploadImages(postRef.id);
        const { updateDoc, doc } = await import('firebase/firestore');
        await updateDoc(doc(db, 'posts', postRef.id), { images: imageUrls });
      }

      // Notify all users who have this suburb active — whether it's their
      // Primary, Second, or Third suburb — except the poster themselves,
      // and only if they haven't turned off notifications for this category.
      // General community posts (updates/notices) have no dedicated toggle,
      // so those always notify.
      try {
        const key = `${profile.state}|${profile.suburb}`;
        const usersSnap = await getDocs(query(collection(db, 'users'), where('activeSuburbKeys', 'array-contains', key)));

        const prefKeyForCategory = {
          safety: 'safety',
          marketplace: 'marketplace',
          lostfound: 'lostfound',
          services: 'services',
        };
        const prefKey = prefKeyForCategory[categoryValue]; // undefined for updates/notices — always notify

        const otherUsers = usersSnap.docs.filter(d => {
          if (d.id === user.uid) return false;
          if (!prefKey) return true;
          const recipientPrefs = d.data().notificationPrefs;
          // Default to notifying if the recipient has no saved preference yet.
          return recipientPrefs ? recipientPrefs[prefKey] !== false : true;
        });

        const categoryLabels = {
          community: 'Community', marketplace: 'Buy & Sell', lostfound: 'Lost & Found',
          events: 'Event', services: 'Service',
        };
        const label = categoryLabels[categoryValue] || 'Post';
        await Promise.all(otherUsers.map(u =>
          addDoc(collection(db, 'notifications'), {
            userId: u.id, type: 'new_post',
            message: `${profile.displayName} posted a new ${label} in ${profile.suburb}`,
            postId: postRef.id, fromUserId: user.uid, fromUserName: profile.displayName,
            isRead: false, createdAt: serverTimestamp(),
          })
        ));
      } catch (e) { console.error('notification error:', e); }

      router.back();
    } catch (e) { Alert.alert('Error', e.message); }
    finally { setPosting(false); }
  };

  const tabs = isCommunity ? COMMUNITY_TABS : isMarketplace ? MARKETPLACE_TABS : isServices ? SERVICE_TABS : null;

  // Image picker section — reusable
  const ImagePickerSection = () => (
    <>
      <View style={styles.sectionBar}>
        <Text style={styles.sectionBarText}>Photos ({images.length}/3)</Text>
      </View>
      <View style={styles.fieldPad}>
        <View style={styles.imageRow}>
          {images.map((img, index) => (
            <View key={index} style={styles.imageThumbWrap}>
              <Image source={{ uri: img.uri }} style={styles.imageThumb} />
              <TouchableOpacity style={styles.removeImageBtn} onPress={() => removeImage(index)}>
                <Ionicons name="close-circle" size={20} color="#E53935" />
              </TouchableOpacity>
            </View>
          ))}
          {images.length < 3 && (
            <TouchableOpacity style={styles.addImageBtn} onPress={handlePickImage}>
              <Ionicons name="camera-outline" size={24} color={Colors.brandGreen} />
              <Text style={styles.addImageText}>Add Photo</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </>
  );

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={0}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.closeBtn}>
          <Ionicons name="close" size={24} color={Colors.white} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.mySuburb}>My Suburb</Text>
          <Text style={styles.suburbName}>{profile?.suburb}, {profile?.state}</Text>
        </View>
        <View style={{ width: 60 }} />
      </View>

      <View style={styles.pageHeader}>
        <Text style={styles.pageTitle}>{pageTitle}</Text>
      </View>
      {/* Primary suburb notice */}
      <View style={styles.primarySuburbBanner}>
        <Ionicons name="location-outline" size={14} color={Colors.brandGreen} />
        <Text style={styles.primarySuburbText}>
          Posting to <Text style={{ fontWeight: '700' }}>{profile?.suburb}, {profile?.state}</Text>
        </Text>
      </View>

      <ScrollView ref={scrollRef} style={styles.body} contentContainerStyle={{ paddingBottom: 120 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

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

        {/* SERVICES */}
        {isServices && (
          <>
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
            <View style={styles.sectionBar}>
              <Text style={styles.sectionBarText}>{selectedCategory === 'offering' ? 'Describe your service' : 'What are you looking for?'}</Text>
            </View>
            <View style={styles.fieldPad}>
              <TextInput
                style={[styles.input, styles.inputLarge]}
                placeholder={selectedCategory === 'offering' ? 'Tell neighbours about your service — experience, availability, rates...' : 'Describe what you need — location, timing, budget...'}
                placeholderTextColor={Colors.midGrey} value={content} onChangeText={setContent}
                multiline textAlignVertical="top" autoCapitalize="sentences" autoCorrect={true}
                onFocus={() => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 300)}
              />
            </View>
            <ImagePickerSection />
            <View style={styles.fieldPad}>
              <TouchableOpacity style={[styles.postBtnBottom, posting && { opacity: 0.7 }]} onPress={handlePost} disabled={posting}>
                {posting ? <ActivityIndicator color={Colors.white} size="small" /> : <Text style={styles.postBtnBottomText}>Post</Text>}
              </TouchableOpacity>
            </View>
            <Modal visible={showServiceModal} transparent animationType="slide">
              <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowServiceModal(false)}>
                <TouchableOpacity activeOpacity={1} style={styles.modalSheet} onPress={() => {}}>
                  <View style={styles.modalHeaderBar}>
                    <View style={styles.modalHandle} />
                    <Text style={styles.modalHeaderBarText}>Select a Service</Text>
                  </View>
                  <FlatList
                    data={SERVICE_CATEGORIES}
                    keyExtractor={item => item.key}
                    showsVerticalScrollIndicator={false}
                    style={styles.modalList}
                    contentContainerStyle={styles.modalListContent}
                    renderItem={({ item: s }) => {
                      const isSelected = selectedService?.key === s.key;
                      return (
                        <TouchableOpacity
                          style={[styles.modalItem, isSelected && styles.modalItemActive]}
                          activeOpacity={0.7}
                          onPress={() => { setSelectedService(s); setShowServiceModal(false); }}
                        >
                          <View style={[styles.modalItemIcon, isSelected && styles.modalItemIconActive]}>
                            <Ionicons name={s.icon} size={21} color={isSelected ? Colors.white : Colors.brandGreen} />
                          </View>
                          <Text style={[styles.modalItemText, isSelected && styles.modalItemTextActive]}>{s.label}</Text>
                          {isSelected
                            ? <Ionicons name="checkmark-circle" size={22} color={Colors.brandGreen} />
                            : <Ionicons name="chevron-forward" size={18} color={Colors.lightGrey} />
                          }
                        </TouchableOpacity>
                      );
                    }}
                  />
                  <View style={styles.modalFooter}>
                    <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setShowServiceModal(false)}>
                      <Text style={styles.modalCloseBtnText}>Close</Text>
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
              </TouchableOpacity>
            </Modal>
          </>
        )}

        {/* COMMUNITY */}
        {isCommunity && (
          <>
            <View style={styles.sectionBar}>
              <Text style={styles.sectionBarText}>
                {selectedCategory === 'updates' ? "What's in your suburb?" : selectedCategory === 'notices' ? 'Post a notice...' : 'Report a safety concern...'}
              </Text>
            </View>
            <View style={styles.fieldPad}>
              <TextInput style={[styles.input, styles.inputLarge]} placeholder={COMMUNITY_PLACEHOLDERS[selectedCategory]} placeholderTextColor={Colors.midGrey} value={content} onChangeText={setContent} multiline textAlignVertical="top" autoCapitalize="sentences" autoCorrect={true} onFocus={() => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 300)} />
            </View>
            <ImagePickerSection />
            <View style={styles.fieldPad}>
              <TouchableOpacity style={[styles.postBtnBottom, posting && { opacity: 0.7 }]} onPress={handlePost} disabled={posting}>
                {posting ? <ActivityIndicator color={Colors.white} size="small" /> : <Text style={styles.postBtnBottomText}>Post</Text>}
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* MARKETPLACE */}
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
            <ImagePickerSection />
            <View style={styles.fieldPad}>
              <TouchableOpacity style={[styles.postBtnBottom, posting && { opacity: 0.7 }]} onPress={handlePost} disabled={posting}>
                {posting ? <ActivityIndicator color={Colors.white} size="small" /> : <Text style={styles.postBtnBottomText}>Post</Text>}
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* LOST & FOUND */}
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
              <TextInput
                style={styles.input2Line}
                placeholder={selectedCategory === 'lost' ? 'Where did you last see it?' : 'Where did you find it?'}
                placeholderTextColor={Colors.midGrey}
                value={lfLocation}
                onChangeText={handleLfLocationChange}
                multiline
                numberOfLines={2}
                textAlignVertical="top"
                autoCapitalize="sentences"
                autoCorrect={true}
                onFocus={() => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 300)}
              />
              {loadingLfSuggestions && (
                <ActivityIndicator size="small" color={Colors.brandGreen} style={{ marginTop: 8 }} />
              )}
              {showLfLocationSuggestions && lfLocationSuggestions.length > 0 && (
                <View style={styles.suggestionsBox}>
                  {lfLocationSuggestions.map(item => (
                    <TouchableOpacity
                      key={item.placeId}
                      style={styles.suggestionItem}
                      onPress={() => handleSelectLfLocationSuggestion(item)}
                    >
                      <Ionicons name="location-outline" size={15} color={Colors.brandGreen} />
                      <Text style={styles.suggestionText} numberOfLines={2}>{item.text}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
            <ImagePickerSection />
            <View style={styles.fieldPad}>
              <TouchableOpacity style={[styles.postBtnBottom, posting && { opacity: 0.7 }]} onPress={handlePost} disabled={posting}>
                {posting ? <ActivityIndicator color={Colors.white} size="small" /> : <Text style={styles.postBtnBottomText}>Post</Text>}
              </TouchableOpacity>
            </View>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.white },
  header: { backgroundColor: Colors.brandGreen, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 56, paddingBottom: 16, paddingHorizontal: 16 },
  closeBtn: { width: 36, justifyContent: 'center' },
  headerCenter: { alignItems: 'center' },
  mySuburb: { fontSize: 27, fontWeight: '800', color: Colors.white },
  suburbName: { fontSize: 17, color: '#FFD700', marginTop: 4 },
  primarySuburbBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.brandGreenPale, paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.lightGrey },
  primarySuburbText: { fontSize: 13, color: Colors.brandGreen },
  postBtnHeader: { backgroundColor: Colors.white, paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20 },
  postBtnHeaderText: { fontSize: 14, fontWeight: '700', color: Colors.brandGreen },
  pageHeader: { backgroundColor: Colors.brandGreenPale, paddingVertical: 10, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: Colors.lightGrey },
  pageTitle: { fontSize: 20, fontWeight: '700', color: Colors.brandGreen },
  body: { flex: 1 },
  tabRow: { flexDirection: 'row', padding: 12, gap: 8, borderBottomWidth: 1, borderBottomColor: Colors.lightGrey },
  tabBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 25, backgroundColor: '#F0F0F0', borderWidth: 1, borderColor: Colors.lightGrey },
  tabBtnActive: { backgroundColor: Colors.brandGreen, borderColor: Colors.brandGreen },
  tabText: { fontSize: 14, color: Colors.midGrey, fontWeight: '600' },
  tabTextActive: { color: Colors.white, fontWeight: '700' },
  sectionBar: { backgroundColor: Colors.brandGreenPale, paddingVertical: 8, paddingHorizontal: 16, borderTopWidth: 1, borderBottomWidth: 1, borderColor: Colors.lightGrey },
  sectionBarText: { fontSize: 17, fontWeight: '700', color: Colors.brandGreen },
  fieldPad: { paddingHorizontal: 16, paddingVertical: 8 },
  serviceSelector: { borderWidth: 1.5, borderColor: Colors.brandGreen, borderRadius: 12, overflow: 'hidden' },
  serviceSelectorSelected: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  serviceSelectorIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.brandGreen, justifyContent: 'center', alignItems: 'center' },
  serviceSelectorText: { flex: 1, fontSize: 16, fontWeight: '700', color: Colors.brandGreen },
  serviceSelectorPlaceholder: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  serviceSelectorPlaceholderText: { flex: 1, fontSize: 15, color: Colors.midGrey },
  input: { borderWidth: 1, borderColor: Colors.lightGrey, borderRadius: 12, padding: 12, fontSize: 15, color: Colors.charcoal },
  input2Line: { borderWidth: 1, borderColor: Colors.lightGrey, borderRadius: 12, padding: 12, fontSize: 15, color: Colors.charcoal, height: 68, textAlignVertical: 'top' },
  suggestionsBox: { marginTop: 6, borderWidth: 1, borderColor: Colors.lightGrey, borderRadius: 12, backgroundColor: Colors.white, overflow: 'hidden' },
  suggestionItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: Colors.lightGrey },
  suggestionText: { flex: 1, fontSize: 14, color: Colors.charcoal },
  inputLarge: { minHeight: 100, textAlignVertical: 'top' },
  inputSingle: { borderWidth: 1, borderColor: Colors.lightGrey, borderRadius: 12, padding: 12, fontSize: 15, color: Colors.charcoal },
  postBtnBottom: { backgroundColor: Colors.brandGreen, borderRadius: 16, paddingVertical: 14, alignItems: 'center' },
  postBtnBottomText: { fontSize: 20, fontWeight: '800', color: Colors.white },
  // Image picker
  imageRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  imageThumbWrap: { position: 'relative' },
  imageThumb: { width: 90, height: 90, borderRadius: 10, borderWidth: 1, borderColor: Colors.lightGrey },
  removeImageBtn: { position: 'absolute', top: -8, right: -8, backgroundColor: Colors.white, borderRadius: 10 },
  addImageBtn: { width: 90, height: 90, borderRadius: 10, borderWidth: 1.5, borderColor: Colors.brandGreen, borderStyle: 'dashed', justifyContent: 'center', alignItems: 'center', gap: 4 },
  addImageText: { fontSize: 11, color: Colors.brandGreen, fontWeight: '600' },
  // Service modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: Colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '80%', overflow: 'hidden' },
  modalHandle: { width: 40, height: 4, backgroundColor: 'rgba(255,255,255,0.5)', borderRadius: 2, alignSelf: 'center', marginBottom: 10 },
  modalHeaderBar: { backgroundColor: Colors.brandGreen, paddingTop: 14, paddingBottom: 16, alignItems: 'center', borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  modalHeaderBarText: { fontSize: 18, fontWeight: '800', color: Colors.white },
  modalList: { flexGrow: 0 },
  modalListContent: { padding: 16, paddingBottom: 8 },
  modalFooter: { padding: 16, borderTopWidth: 1, borderTopColor: Colors.lightGrey, backgroundColor: Colors.white },
  modalTitle: { fontSize: 18, fontWeight: '800', color: Colors.brandGreen, textAlign: 'center', marginBottom: 16 },
  modalItem: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 13, paddingHorizontal: 14, borderRadius: 14, marginBottom: 8, backgroundColor: '#FAFAFA', borderWidth: 1, borderColor: '#EFEFEF' },
  modalItemActive: { backgroundColor: Colors.brandGreenPale, borderColor: Colors.brandGreen },
  modalItemIcon: { width: 42, height: 42, borderRadius: 21, backgroundColor: Colors.white, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#EFEFEF' },
  modalItemIconActive: { backgroundColor: Colors.brandGreen, borderColor: Colors.brandGreen },
  modalItemText: { flex: 1, fontSize: 16, color: Colors.charcoal, fontWeight: '600' },
  modalItemTextActive: { color: Colors.brandGreen, fontWeight: '700' },
  modalCloseBtn: { backgroundColor: Colors.brandGreen, borderRadius: 16, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  modalCloseBtnText: { fontSize: 18, fontWeight: '700', color: Colors.white },
});