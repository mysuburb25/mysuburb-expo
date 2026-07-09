import { useState, useCallback, useRef } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Modal, TextInput, ScrollView, Alert, Platform, KeyboardAvoidingView, RefreshControl, Keyboard, Image, Linking } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { collection, query, where, orderBy, getDocs, addDoc, serverTimestamp, updateDoc, increment, doc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../../config/firebase';
import { useAuth } from '../../context/AuthContext';
import { Colors } from '../../constants/theme';
import DateTimePicker from '@react-native-community/datetimepicker';

function formatDate(date) {
  if (!date) return '';
  const d = date.toDate ? date.toDate() : new Date(date);
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatTime(date) {
  if (!date) return '';
  const d = date.toDate ? date.toDate() : new Date(date);
  return d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });
}

// Defined at module level, not inside EventsScreen, so React treats it as the
// same component across renders — keeping it inside the screen would recreate
// it on every keystroke and cause the selected photos to flicker.
function ImagePickerSection({ images, onAddPhoto, onRemoveImage }) {
  return (
    <>
      <View style={styles.sectionBar}>
        <Text style={styles.sectionBarText}>Photos ({images.length}/3)</Text>
      </View>
      <View style={styles.fieldPad}>
        <View style={styles.imageRow}>
          {images.map((img, index) => (
            <View key={index} style={styles.imageThumbWrap}>
              <Image source={{ uri: img.uri }} style={styles.imageThumb} />
              <TouchableOpacity style={styles.removeImageBtn} onPress={() => onRemoveImage(index)}>
                <Ionicons name="close-circle" size={20} color="#E53935" />
              </TouchableOpacity>
            </View>
          ))}
          {images.length < 3 && (
            <TouchableOpacity style={styles.addImageBtn} onPress={onAddPhoto}>
              <Ionicons name="camera-outline" size={24} color={Colors.brandGreen} />
              <Text style={styles.addImageText}>Add Photo</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </>
  );
}

export default function EventsScreen() {
  const { profile, user, unreadCount} = useAuth();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState('upcoming');
  const [showModal, setShowModal] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [locationSuggestions, setLocationSuggestions] = useState([]);
  const [showLocationSuggestions, setShowLocationSuggestions] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const locationDebounceRef = useRef(null);
  const [eventDate, setEventDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [posting, setPosting] = useState(false);
  const [images, setImages] = useState([]);
  const scrollRef = useRef(null);

  const fetchLocationSuggestions = async (text) => {
    const apiKey = process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY;
    if (!apiKey) return; // Autocomplete silently does nothing if no key is configured yet
    setLoadingSuggestions(true);
    try {
      const response = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': 'suggestions.placePrediction.text,suggestions.placePrediction.placeId',
        },
        body: JSON.stringify({
          input: text,
          includedRegionCodes: ['au'],
          languageCode: 'en',
        }),
      });
      const data = await response.json();
      const suggestions = (data.suggestions || [])
        .filter(s => s.placePrediction)
        .map(s => ({ placeId: s.placePrediction.placeId, text: s.placePrediction.text.text }));
      setLocationSuggestions(suggestions);
      setShowLocationSuggestions(suggestions.length > 0);
    } catch (e) {
      console.error('Places autocomplete error:', e);
      setLocationSuggestions([]);
    } finally {
      setLoadingSuggestions(false);
    }
  };

  const handleLocationChange = (text) => {
    setLocation(text);
    if (locationDebounceRef.current) clearTimeout(locationDebounceRef.current);
    if (text.trim().length < 3) {
      setLocationSuggestions([]);
      setShowLocationSuggestions(false);
      return;
    }
    // Debounce so we don't fire a request on every keystroke.
    locationDebounceRef.current = setTimeout(() => fetchLocationSuggestions(text.trim()), 350);
  };

  const handleSelectLocationSuggestion = (suggestion) => {
    setLocation(suggestion.text);
    setLocationSuggestions([]);
    setShowLocationSuggestions(false);
    Keyboard.dismiss();
  };

  const fetchEvents = useCallback(async () => {
    if (!profile?.suburb) return;
    try {
      // Active suburbs (suburb + state pair) — falls back to primary if suburbs array isn't set yet
      const activeSuburbs = profile?.suburbs
        ? profile.suburbs.filter(s => s.active).map(s => ({ suburb: s.suburb, state: s.state }))
        : [{ suburb: profile.suburb, state: profile.state }];
      if (activeSuburbs.length === 0) return;

      // Run one query per active suburb, in parallel, always scoped by BOTH suburb and state
      // (suburb names repeat across Australian states, so suburb alone isn't a safe filter)
      const queryPromises = activeSuburbs.map(({ suburb, state }) => {
        const q = query(
          collection(db, 'posts'),
          where('suburb', '==', suburb),
          where('state', '==', state),
          where('category', '==', 'events'),
          where('isRemoved', '==', false),
          orderBy('createdAt', 'desc')
        );
        return getDocs(q);
      });

      const snaps = await Promise.all(queryPromises);
      let allEvents = snaps.flatMap(snap => snap.docs.map(d => ({ id: d.id, ...d.data() })));

      // Sort merged results by date since each suburb's events arrive independently
      allEvents.sort((a, b) => {
        const aTime = a.createdAt?.toDate?.() || new Date(0);
        const bTime = b.createdAt?.toDate?.() || new Date(0);
        return bTime - aTime;
      });
      const blockedIds = profile?.blockedUsers?.map(b => b.uid) || [];
      setEvents(blockedIds.length ? allEvents.filter(e => !blockedIds.includes(e.authorId)) : allEvents);
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  }, [profile]);

  useFocusEffect(useCallback(() => { setLoading(true); fetchEvents(); }, [fetchEvents]));

  const handleLikeToggle = async (post) => {
    const liked = post.likedBy?.includes(user.uid) || false;
    const newLiked = !liked;
    setEvents(prev => prev.map(p => p.id === post.id ? {
      ...p,
      likeCount: (p.likeCount || 0) + (newLiked ? 1 : -1),
      likedBy: newLiked ? [...(p.likedBy || []), user.uid] : (p.likedBy || []).filter(u => u !== user.uid),
    } : p));
    try {
      await updateDoc(doc(db, 'posts', post.id), {
        likeCount: increment(newLiked ? 1 : -1),
        likedBy: newLiked ? [...(post.likedBy || []), user.uid] : (post.likedBy || []).filter(u => u !== user.uid),
      });
      if (newLiked) {
        await addDoc(collection(db, 'notifications'), {
          userId: post.authorId, type: 'like',
          message: `${profile.displayName} liked your event`,
          postId: post.id, fromUserId: user.uid, fromUserName: profile.displayName,
          isRead: false, createdAt: serverTimestamp(),
        });
      }
    } catch (e) { console.error(e); }
  };

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
          if (!result.canceled) {
            setImages(prev => [...prev, { uri: result.assets[0].uri }]);
            Keyboard.dismiss();
          }
        },
      },
      {
        text: 'Choose from Library',
        onPress: async () => {
          const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (status !== 'granted') { Alert.alert('Permission needed', 'Please allow photo library access.'); return; }
          const result = await ImagePicker.launchImageLibraryAsync({
            quality: 0.7,
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsMultipleSelection: true,
            selectionLimit: remaining,
            allowsEditing: false,
          });
          if (!result.canceled) {
            const newImages = result.assets.slice(0, remaining).map(a => ({ uri: a.uri }));
            setImages(prev => [...prev, ...newImages]);
            Keyboard.dismiss();
          }
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const removeImage = (index) => {
    setImages(prev => prev.filter((_, i) => i !== index));
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
    if (!title.trim()) { Alert.alert('Error', 'Please enter an event title.'); return; }
    setPosting(true);
    try {
      const postRef = await addDoc(collection(db, 'posts'), {
        content: title.trim(), description: description.trim(),
        eventLocation: location.trim(), eventDate: eventDate,
        category: 'events', suburb: profile.suburb, state: profile.state,
        authorId: user.uid, authorName: profile.displayName,
        createdAt: serverTimestamp(), likeCount: 0, commentCount: 0, isRemoved: false,
        images: [],
      });

      if (images.length > 0) {
        const imageUrls = await uploadImages(postRef.id);
        await updateDoc(doc(db, 'posts', postRef.id), { images: imageUrls });
      }

      setShowModal(false);
      setTitle(''); setDescription(''); setLocation(''); setEventDate(new Date());
      setLocationSuggestions([]); setShowLocationSuggestions(false);
      setImages([]);
      fetchEvents();
    } catch (e) { Alert.alert('Error', e.message); }
    finally { setPosting(false); }
  };

  const now = new Date();
  const filteredEvents = events.filter(item => {
    if (!item.eventDate) return tab === 'upcoming';
    const ed = item.eventDate.toDate ? item.eventDate.toDate() : new Date(item.eventDate);
    return tab === 'upcoming' ? ed >= now : ed < now;
  });

  const formatDateFull = (date) => date.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  const onDateChange = (event, selectedDate) => { setShowDatePicker(false); if (selectedDate) setEventDate(selectedDate); };
  const onTimeChange = (event, selectedTime) => { setShowTimePicker(false); if (selectedTime) setEventDate(selectedTime); };

  const openDatePicker = () => { Keyboard.dismiss(); setShowTimePicker(false); setTimeout(() => setShowDatePicker(v => !v), 100); };
  const openTimePicker = () => { Keyboard.dismiss(); setShowDatePicker(false); setTimeout(() => { setShowTimePicker(v => !v); setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 300); }, 100); };

  return (
    <View style={styles.container}>
      <View style={styles.topHeader}>
        <TouchableOpacity style={styles.profileAvatar} onPress={() => router.push('/(tabs)/profile')}>
          {profile?.photoURL ? (
            <Image source={{ uri: profile.photoURL }} style={styles.profileAvatarImage} />
          ) : (
            <Text style={styles.profileAvatarText}>{profile?.displayName?.[0]?.toUpperCase() || '?'}</Text>
          )}
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.mySuburb}>My Suburb</Text>
          <Text style={styles.suburbName}>{profile?.suburb}, {profile?.state}</Text>
        </View>
        <TouchableOpacity onPress={() => router.push('/(tabs)/notifications')} style={{ position: 'relative' }}>
          <Ionicons name="notifications-outline" size={26} color="#fff" />
          {unreadCount > 0 && (
            <View style={styles.bellBadge}>
              <Text style={styles.bellBadgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>
      <View style={styles.pageHeader}>
        <Text style={styles.pageTitle}>Events</Text>
      </View>
      <View style={styles.tabRow}>
        <TouchableOpacity style={[styles.tabBtn, tab === 'upcoming' && styles.tabBtnActive]} onPress={() => setTab('upcoming')}>
          <Text style={[styles.tabText, tab === 'upcoming' && styles.tabTextActive]}>Upcoming</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tabBtn, tab === 'past' && styles.tabBtnActive]} onPress={() => setTab('past')}>
          <Text style={[styles.tabText, tab === 'past' && styles.tabTextActive]}>Past Events</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator color={Colors.brandGreen} style={{ marginTop: 40 }} size="large" />
      ) : (
        <FlatList
          data={filteredEvents}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchEvents(); }} tintColor={Colors.brandGreen} />}
          renderItem={({ item }) => {
            const ed = item.eventDate ? (item.eventDate.toDate ? item.eventDate.toDate() : new Date(item.eventDate)) : null;
            const liked = item.likedBy?.includes(user?.uid) || false;
            return (
              <TouchableOpacity style={styles.card} onPress={() => router.push('/post/' + item.id)} activeOpacity={0.85}>
                <View style={styles.cardBody}>
                  <View style={styles.cardRow}>
                    {ed && (
                      <View style={styles.dateBox}>
                        <Text style={styles.dateDay}>{ed.getDate()}</Text>
                        <Text style={styles.dateMonth}>{ed.toLocaleString('en-AU', { month: 'short' }).toUpperCase()}</Text>
                      </View>
                    )}
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text style={styles.cardTitle} numberOfLines={2}>{item.content}</Text>
                      {item.description ? <Text style={styles.cardDesc} numberOfLines={2}>{item.description}</Text> : null}
                      {item.eventLocation ? (
                        <TouchableOpacity
                          style={styles.infoRow}
                          onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.eventLocation)}`).catch(() => {})}
                        >
                          <Ionicons name="location-outline" size={13} color={Colors.brandGreen} />
                          <Text style={[styles.infoText, styles.locationLink]}>{item.eventLocation}</Text>
                        </TouchableOpacity>
                      ) : null}
                      {ed && (
                        <View style={styles.infoRow}>
                          <Ionicons name="time-outline" size={13} color={Colors.midGrey} />
                          <Text style={styles.infoText}>{formatTime(ed)}</Text>
                        </View>
                      )}
                      <View style={styles.metaRow}>
                        <Text style={styles.cardAuthor}>by {item.authorName}</Text>
                        <Text style={styles.metaText}>{formatDate(item.createdAt)}, {formatTime(item.createdAt)}</Text>
                      </View>
                      {tab === 'past' && (
                        <View style={styles.completedBadge}>
                          <Text style={styles.completedText}>Completed</Text>
                        </View>
                      )}
                    </View>
                  </View>
                </View>
                <View style={styles.footer}>
                  <TouchableOpacity style={styles.footerBtn} onPress={() => handleLikeToggle(item)}>
                    <Ionicons name={liked ? 'heart' : 'heart-outline'} size={18} color={liked ? '#E53935' : Colors.midGrey} />
                    <Text style={[styles.footerText, liked && { color: '#E53935' }]}>{item.likeCount || 0}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.footerBtn} onPress={() => router.push('/post/' + item.id)}>
                    <Ionicons name="chatbubble-outline" size={18} color={Colors.midGrey} />
                    <Text style={styles.footerText}>{item.commentCount || 0}</Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="calendar-outline" size={48} color={Colors.lightGrey} />
              <Text style={styles.emptyText}>{tab === 'upcoming' ? 'No upcoming events' : 'No past events'}</Text>
            </View>
          }
        />
      )}

      {tab === 'upcoming' && (
        <TouchableOpacity style={styles.fab} onPress={() => setShowModal(true)}>
          <Ionicons name="pencil-outline" size={16} color={Colors.brandGreen} />
          <Text style={styles.fabText}>New Post</Text>
        </TouchableOpacity>
      )}

      <Modal visible={showModal} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowModal(false)} style={{ width: 36 }}>
              <Ionicons name="close" size={24} color={Colors.white} />
            </TouchableOpacity>
            <View style={styles.headerCenter}>
              <Text style={styles.mySuburb}>My Suburb</Text>
              <Text style={styles.suburbName}>{profile?.suburb}, {profile?.state}</Text>
            </View>
            <View style={{ width: 60 }} />
          </View>
          <ScrollView ref={scrollRef} style={styles.modalBody} contentContainerStyle={{ paddingBottom: 140 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} automaticallyAdjustKeyboardInsets={true}>
            <View style={styles.sectionBar}><Text style={styles.sectionBarText}>Event Title</Text></View>
            <View style={styles.fieldPad}>
              <TextInput style={styles.input2Line} placeholder="e.g. Community Garage Sale, Street Festival..." placeholderTextColor={Colors.midGrey} value={title} onChangeText={setTitle} multiline numberOfLines={2} textAlignVertical="top" autoCapitalize="sentences" />
            </View>
            <View style={styles.sectionBar}><Text style={styles.sectionBarText}>Description</Text></View>
            <View style={styles.fieldPad}>
              <TextInput style={styles.input2Line} placeholder="Tell your neighbours what this event is about..." placeholderTextColor={Colors.midGrey} value={description} onChangeText={setDescription} multiline numberOfLines={2} textAlignVertical="top" autoCapitalize="sentences" />
            </View>
            <View style={styles.sectionBar}><Text style={styles.sectionBarText}>Date & Time</Text></View>
            <View style={styles.fieldPad}>
              <View style={styles.dateTimeRow}>
                <TouchableOpacity style={[styles.pickerBtn, styles.pickerBtnHalf]} onPress={openDatePicker}>
                  <Ionicons name="calendar-outline" size={18} color={Colors.brandGreen} />
                  <Text style={styles.pickerText} numberOfLines={1}>{formatDateFull(eventDate)}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.pickerBtn, styles.pickerBtnHalf]} onPress={openTimePicker}>
                  <Ionicons name="time-outline" size={18} color={Colors.brandGreen} />
                  <Text style={styles.pickerText} numberOfLines={1}>{formatTime(eventDate)}</Text>
                </TouchableOpacity>
              </View>
              {showDatePicker && (
                <View style={styles.pickerCenter}>
                  <DateTimePicker value={eventDate} mode="date" display="inline" minimumDate={new Date()} onChange={onDateChange} style={{ backgroundColor: '#fff' }} />
                </View>
              )}
              {showTimePicker && (
                <View style={styles.pickerCenter}>
                  <DateTimePicker value={eventDate} mode="time" display="spinner" onChange={onTimeChange} style={{ backgroundColor: '#fff', width: 320 }} />
                </View>
              )}
            </View>
            <View style={styles.sectionBar}><Text style={styles.sectionBarText}>Location</Text></View>
            <View style={styles.fieldPad}>
              <TextInput
                style={styles.input2Line}
                placeholder="e.g. Paddington Park, cnr Given Tce & Latrobe St"
                placeholderTextColor={Colors.midGrey}
                value={location}
                onChangeText={handleLocationChange}
                multiline
                numberOfLines={2}
                textAlignVertical="top"
                autoCapitalize="sentences"
                onFocus={() => { setShowDatePicker(false); setShowTimePicker(false); setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 300); }}
              />
              {loadingSuggestions && (
                <ActivityIndicator size="small" color={Colors.brandGreen} style={{ marginTop: 8 }} />
              )}
              {showLocationSuggestions && locationSuggestions.length > 0 && (
                <View style={styles.suggestionsBox}>
                  {locationSuggestions.map(item => (
                    <TouchableOpacity
                      key={item.placeId}
                      style={styles.suggestionItem}
                      onPress={() => handleSelectLocationSuggestion(item)}
                    >
                      <Ionicons name="location-outline" size={15} color={Colors.brandGreen} />
                      <Text style={styles.suggestionText} numberOfLines={2}>{item.text}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
            <ImagePickerSection images={images} onAddPhoto={handlePickImage} onRemoveImage={removeImage} />
            <View style={styles.fieldPad}>
              <TouchableOpacity style={[styles.postBtnBottom, posting && { opacity: 0.7 }]} onPress={handlePost} disabled={posting}>
                {posting ? <ActivityIndicator color={Colors.white} size="small" /> : <Text style={styles.postBtnBottomText}>Post Event</Text>}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.white },
  topHeader: { backgroundColor: Colors.brandGreen, paddingTop: 56, paddingBottom: 16, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerCenter: { alignItems: 'center' },
  mySuburb: { fontSize: 27, fontWeight: '800', color: Colors.white },
  suburbName: { fontSize: 17, color: '#FFD700', marginTop: 4 },
  profileAvatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#FFD700', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  profileAvatarImage: { width: 42, height: 42, borderRadius: 21 },
  profileAvatarText: { fontSize: 16, fontWeight: '800', color: Colors.brandGreen },
  pageHeader: { backgroundColor: Colors.brandGreenPale, paddingVertical: 10, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: Colors.lightGrey },
  bellBadge: { position: 'absolute', top: -4, right: -4, backgroundColor: '#E53935', borderRadius: 8, minWidth: 16, height: 16, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 3 },
  bellBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  pageTitle: { fontSize: 20, fontWeight: '700', color: Colors.brandGreen },
  tabRow: { flexDirection: 'row', padding: 12, gap: 10, borderBottomWidth: 1, borderBottomColor: Colors.lightGrey },
  tabBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 25, backgroundColor: '#F0F0F0', borderWidth: 1, borderColor: Colors.lightGrey },
  tabBtnActive: { backgroundColor: Colors.brandGreen, borderColor: Colors.brandGreen },
  tabText: { fontSize: 17, color: Colors.midGrey, fontWeight: '600' },
  tabTextActive: { color: Colors.white, fontWeight: '700' },
  list: { padding: 16, gap: 12, paddingBottom: 100 },
  card: { borderRadius: 14, borderWidth: 1, borderColor: Colors.lightGrey, overflow: 'hidden' },
  cardBody: { backgroundColor: Colors.brandGreenPale, padding: 16 },
  cardRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  dateBox: { width: 56, alignItems: 'center', backgroundColor: Colors.white, borderRadius: 12, paddingVertical: 8, borderWidth: 1, borderColor: Colors.lightGrey },
  dateDay: { fontSize: 24, fontWeight: '800', color: Colors.brandGreen },
  dateMonth: { fontSize: 11, fontWeight: '700', color: Colors.brandGreen },
  cardTitle: { fontSize: 16, fontWeight: '700', color: Colors.charcoal, lineHeight: 22 },
  cardDesc: { fontSize: 13, color: Colors.midGrey },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  infoText: { fontSize: 13, color: Colors.midGrey },
  locationLink: { color: Colors.brandGreen, textDecorationLine: 'underline', fontWeight: '600' },
  suggestionsBox: { marginTop: 6, borderWidth: 1, borderColor: Colors.lightGrey, borderRadius: 12, backgroundColor: Colors.white, overflow: 'hidden' },
  suggestionItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: Colors.lightGrey },
  suggestionText: { flex: 1, fontSize: 14, color: Colors.charcoal },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 },
  cardAuthor: { fontSize: 11, color: Colors.midGrey },
  metaText: { fontSize: 11, color: Colors.midGrey },
  completedBadge: { alignSelf: 'flex-start', marginTop: 4, backgroundColor: Colors.white, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  completedText: { fontSize: 11, color: Colors.brandGreen, fontWeight: '600' },
  footer: { flexDirection: 'row', gap: 16, alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, backgroundColor: Colors.white },
  footerBtn: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  footerText: { fontSize: 14, color: Colors.midGrey, fontWeight: '600' },
  empty: { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyText: { fontSize: 15, color: Colors.midGrey },
  fab: { position: 'absolute', bottom: 24, right: 16, backgroundColor: '#FFD700', borderRadius: 25, paddingVertical: 10, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 6, elevation: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4 },
  fabText: { fontSize: 15, fontWeight: '700', color: Colors.brandGreen },
  modalContainer: { flex: 1, backgroundColor: Colors.white },
  modalHeader: { backgroundColor: Colors.brandGreen, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 56, paddingBottom: 16, paddingHorizontal: 16 },
  modalBody: { flex: 1, backgroundColor: '#FAFAFA' },
  sectionBar: { backgroundColor: 'transparent', paddingTop: 18, paddingBottom: 6, paddingHorizontal: 16 },
  sectionBarText: { fontSize: 17, fontWeight: '700', color: Colors.brandGreen },
  fieldPad: { paddingHorizontal: 16, paddingVertical: 4 },
  input2Line: { borderWidth: 1, borderColor: '#EFEFEF', borderRadius: 12, padding: 12, fontSize: 15, color: Colors.charcoal, height: 68, textAlignVertical: 'top', backgroundColor: Colors.white, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 1 },
  pickerBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: '#EFEFEF', borderRadius: 12, padding: 14, backgroundColor: Colors.white, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 1 },
  dateTimeRow: { flexDirection: 'row', gap: 10 },
  pickerBtnHalf: { flex: 1 },
  pickerText: { flex: 1, fontSize: 15, color: Colors.charcoal },
  pickerCenter: { alignItems: 'center', marginTop: 8 },
  postBtnBottom: { backgroundColor: Colors.brandGreen, borderRadius: 16, paddingVertical: 14, alignItems: 'center' },
  postBtnBottomText: { fontSize: 20, fontWeight: '800', color: Colors.white },
  imageRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  imageThumbWrap: { position: 'relative' },
  imageThumb: { width: 90, height: 90, borderRadius: 10, borderWidth: 1, borderColor: Colors.lightGrey },
  removeImageBtn: { position: 'absolute', top: -8, right: -8, backgroundColor: Colors.white, borderRadius: 10 },
  addImageBtn: { width: 90, height: 90, borderRadius: 10, borderWidth: 1.5, borderColor: Colors.brandGreen, borderStyle: 'dashed', justifyContent: 'center', alignItems: 'center', gap: 4 },
  addImageText: { fontSize: 11, color: Colors.brandGreen, fontWeight: '600' },
});