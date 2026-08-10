import { useState, useCallback, useRef, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Modal, TextInput, ScrollView, Alert, Platform, KeyboardAvoidingView, RefreshControl, Keyboard, Image, Linking, Share } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { getOrderedMedia } from '../../utils/mediaOrder';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { collection, query, where, orderBy, limit, startAfter, getDocs, addDoc, serverTimestamp, updateDoc, increment, doc, getDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../../config/firebase';
import { useAuth } from '../../context/AuthContext';
import { Colors } from '../../constants/theme';
import AppName from '../../components/AppName';
import NotificationBell from '../../components/NotificationBell';
import AvatarWithOnlineDot from '../../components/AvatarWithOnlineDot';
import AsyncStorage from '@react-native-async-storage/async-storage';
import addEventToCalendar from '../../utils/addEventToCalendar';
import DateTimePicker from '@react-native-community/datetimepicker';

function formatDate(date) {
  if (!date) return '';
  const d = date.toDate ? date.toDate() : new Date(date);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatTime(date) {
  if (!date) return '';
  const d = date.toDate ? date.toDate() : new Date(date);
  return d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });
}

// Shortens a full Google Places address down to venue/street/suburb only —
// drops the trailing state and "Australia" that Places always appends,
// since that's noise for a quick glance at an event card. The FULL address
// is still what's stored and used for the actual "Get Directions" link.
function shortenLocation(loc) {
  if (!loc) return '';
  let parts = loc.split(',').map(p => p.trim()).filter(Boolean);
  if (parts[parts.length - 1]?.toLowerCase() === 'australia') parts.pop();
  if (parts.length > 0) {
    const stateAbbrevs = ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT'];
    const regex = new RegExp(`\\s+(${stateAbbrevs.join('|')})(\\s+\\d{4})?$`, 'i');
    parts[parts.length - 1] = parts[parts.length - 1].replace(regex, '').trim();
  }
  return parts.join(', ');
}

function isToday(date) {
  if (!date) return false;
  const today = new Date();
  return date.toDateString() === today.toDateString();
}

// Defined at module level, not inside EventsScreen, so React treats it as the
// same component across renders — keeping it inside the screen would recreate
// it on every keystroke and cause the selected photos to flicker.
// Media: 8 total (photos + videos combined) — same model as
// app/create-post.js. Kept in sync since events use a fully separate
// creation flow, not the shared one.
const MAX_MEDIA = 8;
const MAX_VIDEO_DURATION_SEC = 120;
const MAX_VIDEO_SIZE_BYTES = 50 * 1024 * 1024;

function MediaPickerSection({ media, onAddMedia, onRemoveMedia }) {
  const atLimit = media.length >= MAX_MEDIA;
  return (
    <>
      <View style={styles.sectionBar}>
        <Text style={styles.sectionBarText}>Photos & Videos ({media.length}/{MAX_MEDIA})</Text>
      </View>
      <View style={styles.fieldPad}>
        <View style={styles.imageRow}>
          {media.map((item, index) => (
            <View key={index} style={styles.imageThumbWrap}>
              {item.kind === 'video' ? (
                item.thumbnailUri ? (
                  <Image source={{ uri: item.thumbnailUri }} style={styles.imageThumb} />
                ) : (
                  <View style={[styles.imageThumb, { backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' }]}>
                    <Ionicons name="videocam" size={22} color="#fff" />
                  </View>
                )
              ) : (
                <Image source={{ uri: item.uri }} style={styles.imageThumb} />
              )}
              {item.kind === 'video' && (
                <View style={styles.videoPlayBadge}>
                  <Ionicons name="play" size={12} color="#fff" />
                </View>
              )}
              <TouchableOpacity style={styles.removeImageBtn} onPress={() => onRemoveMedia(index)}>
                <Ionicons name="close-circle" size={20} color="#E53935" />
              </TouchableOpacity>
            </View>
          ))}
          {!atLimit && (
            <TouchableOpacity style={styles.addImageBtn} onPress={onAddMedia}>
              <Ionicons name="images-outline" size={24} color={Colors.brandGreen} />
              <Text style={styles.addImageText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>Add Media</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </>
  );
}

const DATE_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'today', label: 'Today' },
  { key: 'weekend', label: 'This Weekend' },
  { key: 'later', label: 'Later' },
];

const PAGE_SIZE = 15; // used for both the initial load and every Load More tap

export default function EventsScreen() {
  const { profile, user, unreadMessageCount, updateUserProfile } = useAuth();
  const insets = useSafeAreaInsets();
  const [newCutoff, setNewCutoff] = useState(null);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState('upcoming');
  const [dateFilter, setDateFilter] = useState('all'); // 'all' | 'today' | 'weekend' — only applies to the Upcoming tab
  const [showDateFilterModal, setShowDateFilterModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const { editEventId } = useLocalSearchParams();
  const [editingEventId, setEditingEventId] = useState(null);
  const [loadingEditEvent, setLoadingEditEvent] = useState(false);
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
  // One combined, ordered array — see app/create-post.js for the full
  // reasoning (kept in sync since events use a separate creation flow).
  const [media, setMedia] = useState([]);
  const [priceType, setPriceType] = useState('free'); // 'free' or 'paid'
  const [eventPrice, setEventPrice] = useState('');
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareTarget, setShareTarget] = useState(null);
  const [addingCalendarId, setAddingCalendarId] = useState(null);
  const [addedCalendarIds, setAddedCalendarIds] = useState(new Set());
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const cursorsRef = useRef({});
  const exhaustedRef = useRef({});
  const scrollRef = useRef(null);
  // Lets the focus effect check "do we already have events?" without
  // needing events itself as a dependency.
  const eventsRef = useRef([]);
  useEffect(() => { eventsRef.current = events; }, [events]);

  // Reached from post/[id].js's "Edit Post" menu option on an event —
  // fetches the event and pre-fills the same New Event form, then opens
  // it automatically, same idea as create-post.js's edit mode but for
  // events specifically, since New Event lives here as its own modal
  // rather than being routable on its own.
  useEffect(() => {
    if (!editEventId) return;
    setLoadingEditEvent(true);
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'posts', editEventId));
        if (!snap.exists()) {
          Alert.alert('Error', 'This event could not be found.');
          return;
        }
        const data = snap.data();
        setEditingEventId(editEventId);
        setTitle(data.content || '');
        setDescription(data.description || '');
        setLocation(data.eventLocation || '');
        setEventDate(data.eventDate?.toDate ? data.eventDate.toDate() : (data.eventDate ? new Date(data.eventDate) : new Date()));
        setPriceType(data.isFree === false ? 'paid' : 'free');
        setEventPrice(data.eventPrice != null ? String(data.eventPrice) : '');
        const orderedMedia = getOrderedMedia(data);
        if (orderedMedia.length > 0) {
          setMedia(orderedMedia.map(item =>
            item.type === 'video'
              ? { kind: 'video', uri: item.url, thumbnailUri: item.thumbnailUrl, duration: item.duration, existing: true }
              : { kind: 'image', uri: item.url, existing: true }
          ));
        }
        setShowModal(true);
      } catch (e) {
        console.error(e);
        Alert.alert('Error', 'Could not load this event for editing.');
      } finally {
        setLoadingEditEvent(false);
      }
    })();
  }, [editEventId]);

  // "Added to calendar" is inherently a per-device fact (it lives in the
  // phone's own calendar app, not our account data), so it's tracked in
  // AsyncStorage rather than Firestore — checked once whenever the visible
  // event list changes, so re-renders don't keep re-adding duplicates.
  useEffect(() => {
    if (events.length === 0) return;
    (async () => {
      try {
        const keys = events.map(e => `calendarEvent:${e.id}`);
        const pairs = await AsyncStorage.multiGet(keys);
        const addedIds = pairs
          .filter(([, value]) => value === 'true')
          .map(([key]) => key.replace('calendarEvent:', ''));
        setAddedCalendarIds(new Set(addedIds));
      } catch (e) { console.error(e); }
    })();
  }, [events]);

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

  const profileRef = useRef(profile);
  useEffect(() => { profileRef.current = profile; }, [profile]);

  const fetchEvents = useCallback(async (isLoadMore = false) => {
    const currentProfile = profileRef.current;
    if (!currentProfile?.suburb) { setLoading(false); setRefreshing(false); setLoadingMore(false); return; }
    try {
      // Active suburbs (suburb + state pair) — falls back to primary if suburbs array isn't set yet
      const activeSuburbs = currentProfile?.suburbs
        ? currentProfile.suburbs.filter(s => s.active).map(s => ({ suburb: s.suburb, state: s.state }))
        : [{ suburb: currentProfile.suburb, state: currentProfile.state }];
      if (activeSuburbs.length === 0) { setLoading(false); setRefreshing(false); setLoadingMore(false); return; }

      if (!isLoadMore) {
        cursorsRef.current = {};
        exhaustedRef.current = {};
      }
      const suburbsToQuery = activeSuburbs.filter(({ suburb, state }) => !exhaustedRef.current[`${suburb}|${state}`]);
      if (isLoadMore && suburbsToQuery.length === 0) {
        setHasMore(false);
        setLoadingMore(false);
        return;
      }

      // Run one query per active (non-exhausted) suburb, in parallel, always
      // scoped by BOTH suburb and state (suburb names repeat across
      // Australian states, so suburb alone isn't a safe filter). Each
      // continues from its own cursor if one exists. Note: this paginates
      // by createdAt (post creation order), same as before pagination
      // existed — the Upcoming/Past/date-filter/search splitting still
      // happens client-side on whatever's been loaded so far.
      const queryPromises = suburbsToQuery.map(({ suburb, state }) => {
        const key = `${suburb}|${state}`;
        const constraints = [
          collection(db, 'posts'),
          where('suburb', '==', suburb),
          where('state', '==', state),
          where('category', '==', 'events'),
          where('isRemoved', '==', false),
          orderBy('createdAt', 'desc'),
        ];
        const cursor = cursorsRef.current[key];
        if (cursor) constraints.push(startAfter(cursor));
        constraints.push(limit(PAGE_SIZE));
        return getDocs(query(...constraints)).then(snap => ({ key, snap }));
      });

      const results = await Promise.all(queryPromises);

      let anyMore = false;
      const newDocs = [];
      for (const { key, snap } of results) {
        if (snap.docs.length > 0) cursorsRef.current[key] = snap.docs[snap.docs.length - 1];
        if (snap.docs.length < PAGE_SIZE) exhaustedRef.current[key] = true;
        else anyMore = true;
        newDocs.push(...snap.docs.map(d => ({ id: d.id, ...d.data() })));
      }

      const blockedIds = currentProfile?.blockedUsers?.map(b => b.uid) || [];
      const filteredNew = blockedIds.length ? newDocs.filter(e => !blockedIds.includes(e.authorId)) : newDocs;

      setEvents(prev => {
        const combined = isLoadMore ? [...prev, ...filteredNew] : filteredNew;
        combined.sort((a, b) => {
          const aTime = a.createdAt?.toDate?.() || new Date(0);
          const bTime = b.createdAt?.toDate?.() || new Date(0);
          return bTime - aTime;
        });
        return combined;
      });
      setHasMore(anyMore);
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); setLoadingMore(false); }
  }, []);

  const handleLoadMore = () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    fetchEvents(true);
  };

  useFocusEffect(useCallback(() => {
    // Only show the full-screen spinner when we have nothing yet — see
    // app/(tabs)/index.js for the full explanation.
    if (eventsRef.current.length === 0) {
      setLoading(true);
    }
    fetchEvents();

    // Capture the cutoff BEFORE updating it, so "NEW" badges stay visible
    // for this entire visit — only the NEXT visit sees a fresh cutoff.
    const stored = profileRef.current?.lastVisited?.events;
    setNewCutoff(stored ? (stored.toDate ? stored.toDate() : new Date(stored)) : null);

    return () => {
      updateUserProfile({ lastVisited: { ...(profileRef.current?.lastVisited || {}), events: new Date() } });
    };
  }, [fetchEvents]));

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
      if (newLiked && post.authorId !== user.uid) {
        await addDoc(collection(db, 'notifications'), {
          userId: post.authorId, type: 'like',
          message: `${profile.displayName} liked your event`,
          postId: post.id, fromUserId: user.uid, fromUserName: profile.displayName,
          isRead: false, createdAt: serverTimestamp(),
        });
      }
    } catch (e) { console.error(e); }
  };

  const handleToggleAttending = async (post) => {
    const attending = post.attendees?.includes(user.uid) || false;
    const newAttending = !attending;
    setEvents(prev => prev.map(p => p.id === post.id ? {
      ...p,
      attendeeCount: (p.attendeeCount || 0) + (newAttending ? 1 : -1),
      attendees: newAttending ? [...(p.attendees || []), user.uid] : (p.attendees || []).filter(u => u !== user.uid),
    } : p));
    try {
      await updateDoc(doc(db, 'posts', post.id), {
        attendeeCount: increment(newAttending ? 1 : -1),
        attendees: newAttending ? [...(post.attendees || []), user.uid] : (post.attendees || []).filter(u => u !== user.uid),
      });
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Could not update. Please try again.');
    }
  };

  const handleToggleSave = async (post) => {
    const saved = post.savedBy?.includes(user.uid) || false;
    const newSaved = !saved;
    setEvents(prev => prev.map(p => p.id === post.id ? {
      ...p,
      savedBy: newSaved ? [...(p.savedBy || []), user.uid] : (p.savedBy || []).filter(u => u !== user.uid),
    } : p));
    try {
      await updateDoc(doc(db, 'posts', post.id), {
        savedBy: newSaved ? [...(post.savedBy || []), user.uid] : (post.savedBy || []).filter(u => u !== user.uid),
      });
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Could not update. Please try again.');
    }
  };

  const buildShareText = (item) => {
    const ed = item.eventDate ? (item.eventDate.toDate ? item.eventDate.toDate() : new Date(item.eventDate)) : null;
    const when = ed ? `${isToday(ed) ? 'Today' : formatDate(ed)}, ${formatTime(ed)}` : '';
    const deepLink = `mysuburb://post/${item.id}`;
    const lines = [
      `Event Title: ${item.content}`,
      item.description ? `Description: ${item.description}` : null,
      item.isFree !== undefined ? `Price: ${item.isFree === false ? `$${item.eventPrice?.toFixed(2)}` : 'Free'}` : null,
      when ? `Date & Time: ${when}` : null,
      item.eventLocation ? `Location: ${item.eventLocation}` : null,
    ].filter(Boolean);
    return `${lines.join('\n')}\n\n${deepLink}\n(Tap to open in My Suburb — you'll need the app installed)\n\nShared from My Suburb`;
  };

  const handleShare = (item) => {
    setShareTarget(item);
    setShowShareModal(true);
  };

  const handleShareToUser = () => {
    setShowShareModal(false);
    router.push({ pathname: '/share-picker', params: { shareText: buildShareText(shareTarget), sharePostId: shareTarget.id } });
  };

  // Native share sheet must wait for the custom Share modal to be FULLY
  // gone before presenting — not just "probably gone after a guessed
  // delay". iOS's Modal fires onDismiss at exactly that moment, so the
  // share sheet call is deferred there instead of a fixed setTimeout,
  // which was causing it to appear on top of the modal's still-fading
  // overlay (a washed-out look) or fail to appear at all. Android's Modal
  // doesn't support onDismiss, so it keeps a short fallback delay.
  const pendingExternalShareRef = useRef(false);

  const handleShareExternal = () => {
    pendingExternalShareRef.current = true;
    setShowShareModal(false);
    if (Platform.OS !== 'ios') {
      setTimeout(() => {
        if (pendingExternalShareRef.current) {
          pendingExternalShareRef.current = false;
          Share.share({ message: buildShareText(shareTarget) }).catch(e => console.error(e));
        }
      }, 400);
    }
  };

  const handleShareModalDismiss = () => {
    if (Platform.OS === 'ios' && pendingExternalShareRef.current) {
      pendingExternalShareRef.current = false;
      Share.share({ message: buildShareText(shareTarget) }).catch(e => console.error(e));
    }
  };

  // Shared calendar helper defaults to a 1-hour duration since events only
  // store a start time. Tracks which specific card is mid-add (by id) so
  // only that card's button shows a spinner, not every card at once.
  const handleAddToCalendar = async (item) => {
    if (addedCalendarIds.has(item.id)) {
      Alert.alert('Already Added', 'This event is already in your calendar.');
      return;
    }
    const ed = item.eventDate ? (item.eventDate.toDate ? item.eventDate.toDate() : new Date(item.eventDate)) : null;
    if (!ed || addingCalendarId) return;
    setAddingCalendarId(item.id);
    const result = await addEventToCalendar({ title: item.content, description: item.description, location: item.eventLocation, startDate: ed });
    setAddingCalendarId(null);
    if (result.success) {
      await AsyncStorage.setItem(`calendarEvent:${item.id}`, 'true').catch(() => {});
      setAddedCalendarIds(prev => new Set(prev).add(item.id));
      Alert.alert('Added to Calendar', 'This event has been added to your calendar.');
    } else {
      Alert.alert('Error', result.message);
    }
  };

  // Single "Add Media" entry point — mirrors create-post.js. Camera and
  // Library both accept either media type in one go; each result is
  // appended to the single ordered `media` array.
  const handleAddMedia = () => {
    if (media.length >= MAX_MEDIA) {
      Alert.alert('Limit reached', `You can add up to ${MAX_MEDIA} photos and videos in total.`);
      return;
    }
    Alert.alert('Add Media', 'Choose an option', [
      {
        text: 'Use Camera',
        onPress: async () => {
          const { status } = await ImagePicker.requestCameraPermissionsAsync();
          if (status !== 'granted') { Alert.alert('Permission needed', 'Please allow camera access.'); return; }
          const result = await ImagePicker.launchCameraAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.All,
            videoMaxDuration: MAX_VIDEO_DURATION_SEC,
            quality: 0.7,
          });
          if (!result.canceled) await routeAsset(result.assets[0]);
        },
      },
      {
        text: 'Choose from Library',
        onPress: async () => {
          const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (status !== 'granted') { Alert.alert('Permission needed', 'Please allow photo library access.'); return; }
          const remaining = MAX_MEDIA - media.length;
          const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.All,
            quality: 0.7,
            allowsMultipleSelection: true,
            selectionLimit: remaining,
            allowsEditing: false,
          });
          if (!result.canceled) {
            for (const asset of result.assets.slice(0, remaining)) {
              await routeAsset(asset);
            }
          }
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const routeAsset = async (asset) => {
    if (asset.type === 'video') {
      const durationSec = (asset.duration || 0) / 1000;
      if (durationSec > MAX_VIDEO_DURATION_SEC) {
        Alert.alert('Video skipped', `"${asset.fileName || 'A video'}" is ${Math.round(durationSec)}s, which is over the ${MAX_VIDEO_DURATION_SEC}s limit, so it wasn't added. Any other photos or videos you selected were added normally.`);
        return;
      }
      if (asset.fileSize && asset.fileSize > MAX_VIDEO_SIZE_BYTES) {
        Alert.alert('Video skipped', `"${asset.fileName || 'A video'}" is ${(asset.fileSize / (1024 * 1024)).toFixed(1)}MB, which is over the ${MAX_VIDEO_SIZE_BYTES / (1024 * 1024)}MB limit, so it wasn't added. Any other photos or videos you selected were added normally.`);
        return;
      }
      let thumbnailUri = null;
      try {
        const thumb = await VideoThumbnails.getThumbnailAsync(asset.uri, { time: 0 });
        thumbnailUri = thumb.uri;
      } catch (e) {
        console.error('Video thumbnail generation failed:', e);
      }
      setMedia(prev => [...prev, { kind: 'video', uri: asset.uri, thumbnailUri, duration: Math.round(durationSec) }]);
    } else {
      setMedia(prev => [...prev, { kind: 'image', uri: asset.uri }]);
    }
    Keyboard.dismiss();
  };

  const removeMedia = (index) => {
    setMedia(prev => prev.filter((_, i) => i !== index));
  };

  // Existing (already-uploaded) images keep their URL as-is — only
  // freshly-picked local images need uploading. Mirrors create-post.js's
  // same edit-mode handling.
  const uploadImages = async (postId, imageItems) => {
    const urls = [];
    for (let i = 0; i < imageItems.length; i++) {
      if (imageItems[i].existing) {
        urls.push(imageItems[i].uri);
        continue;
      }
      const response = await fetch(imageItems[i].uri);
      const blob = await response.blob();
      const storageRef = ref(storage, `posts/${postId}/image_${i}_${Date.now()}.jpg`);
      await uploadBytes(storageRef, blob);
      const url = await getDownloadURL(storageRef);
      urls.push(url);
    }
    return urls;
  };

  // Mirrors create-post.js's uploadVideos — uploads each video alongside
  // its own thumbnail, and returns objects (not bare URLs) since
  // duration travels with each one.
  const uploadVideos = async (postId, videoItems) => {
    const results = [];
    for (let i = 0; i < videoItems.length; i++) {
      const vid = videoItems[i];
      if (vid.existing) {
        results.push({ url: vid.uri, thumbnailUrl: vid.thumbnailUri, duration: vid.duration });
        continue;
      }
      const videoResponse = await fetch(vid.uri);
      const videoBlob = await videoResponse.blob();
      const videoRef = ref(storage, `posts/${postId}/video_${i}_${Date.now()}.mp4`);
      await uploadBytes(videoRef, videoBlob, { contentType: videoBlob.type || 'video/mp4' });
      const url = await getDownloadURL(videoRef);

      let thumbnailUrl = null;
      if (vid.thumbnailUri) {
        try {
          const thumbResponse = await fetch(vid.thumbnailUri);
          const thumbBlob = await thumbResponse.blob();
          const thumbRef = ref(storage, `posts/${postId}/video_thumb_${i}_${Date.now()}.jpg`);
          await uploadBytes(thumbRef, thumbBlob);
          thumbnailUrl = await getDownloadURL(thumbRef);
        } catch (e) {
          console.error('Video thumbnail upload failed:', e);
        }
      }
      results.push({ url, thumbnailUrl, duration: vid.duration || 0 });
    }
    return results;
  };

  // Mirrors create-post.js's uploadMedia — splits by kind for upload,
  // then reassembles pick order as mediaOrder.
  const uploadMedia = async (postId) => {
    const imageItems = media.filter(m => m.kind === 'image');
    const videoItems = media.filter(m => m.kind === 'video');
    const [images, videos] = await Promise.all([
      imageItems.length > 0 ? uploadImages(postId, imageItems) : Promise.resolve([]),
      videoItems.length > 0 ? uploadVideos(postId, videoItems) : Promise.resolve([]),
    ]);
    const mediaOrder = media.map(m => m.kind);
    return { images, videos, mediaOrder };
  };

  const resetForm = () => {
    setShowModal(false);
    setEditingEventId(null);
    setTitle(''); setDescription(''); setLocation(''); setEventDate(new Date());
    setLocationSuggestions([]); setShowLocationSuggestions(false);
    setMedia([]);
    setPriceType('free'); setEventPrice('');
  };

  const handlePost = async () => {
    if (!title.trim()) { Alert.alert('Error', 'Please enter an event title.'); return; }
    if (priceType === 'paid' && !eventPrice.trim()) { Alert.alert('Error', 'Please enter a price, or switch to Free.'); return; }
    setPosting(true);
    try {
      // --- Editing an existing event ---
      if (editingEventId) {
        const { images, videos, mediaOrder } = await uploadMedia(editingEventId);
        await updateDoc(doc(db, 'posts', editingEventId), {
          content: title.trim(), description: description.trim(),
          eventLocation: location.trim(), eventDate: eventDate,
          images, videos, mediaOrder,
          isFree: priceType === 'free',
          eventPrice: priceType === 'paid' ? parseFloat(eventPrice) || 0 : 0,
        });
        resetForm();
        router.replace('/post/' + editingEventId);
        return;
      }

      // --- Creating a new event ---
      const postRef = await addDoc(collection(db, 'posts'), {
        content: title.trim(), description: description.trim(),
        eventLocation: location.trim(), eventDate: eventDate,
        category: 'events', suburb: profile.suburb, state: profile.state,
        authorId: user.uid, authorName: profile.displayName, authorPhotoURL: profile.photoURL || null,
        createdAt: serverTimestamp(), likeCount: 0, commentCount: 0, isRemoved: false,
        images: [],
        videos: [],
        mediaOrder: [],
        isFree: priceType === 'free',
        eventPrice: priceType === 'paid' ? parseFloat(eventPrice) || 0 : 0,
        attendeeCount: 0, attendees: [], savedBy: [],
      });

      if (media.length > 0) {
        const { images, videos, mediaOrder } = await uploadMedia(postRef.id);
        await updateDoc(doc(db, 'posts', postRef.id), { images, videos, mediaOrder });
      }

      resetForm();
      fetchEvents();
    } catch (e) { Alert.alert('Error', e.message); }
    finally { setPosting(false); }
  };

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  // Upcoming weekend = the next Saturday/Sunday from today (inclusive of
  // today if today itself is a Saturday or Sunday).
  const daysUntilSaturday = (6 - todayStart.getDay() + 7) % 7;
  const upcomingSaturday = new Date(todayStart);
  upcomingSaturday.setDate(todayStart.getDate() + daysUntilSaturday);
  const upcomingSunday = new Date(upcomingSaturday);
  upcomingSunday.setDate(upcomingSaturday.getDate() + 1);

  const searchQ = searchQuery.trim().toLowerCase();
  const filteredEvents = events.filter(item => {
    if (searchQ && !(item.content?.toLowerCase().includes(searchQ) || item.description?.toLowerCase().includes(searchQ))) return false;
    if (!item.eventDate) return tab === 'upcoming';
    const ed = item.eventDate.toDate ? item.eventDate.toDate() : new Date(item.eventDate);
    // Compare by calendar date, not exact time — an event happening later
    // today shouldn't flip to "past" the moment its clock time passes if
    // the day itself hasn't ended yet.
    const edDateOnly = new Date(ed.getFullYear(), ed.getMonth(), ed.getDate());
    if (tab === 'past') return edDateOnly < todayStart;
    if (edDateOnly < todayStart) return false;
    if (dateFilter === 'today') return edDateOnly.getTime() === todayStart.getTime();
    if (dateFilter === 'weekend') {
      return edDateOnly.getTime() === upcomingSaturday.getTime() || edDateOnly.getTime() === upcomingSunday.getTime();
    }
    // Everything from the Monday after this coming weekend onward.
    if (dateFilter === 'later') return edDateOnly.getTime() > upcomingSunday.getTime();
    return true;
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
          <AppName style={styles.mySuburb} />
          <Text style={styles.suburbName} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{profile?.suburb}, {profile?.state}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          <TouchableOpacity onPress={() => router.push('/(tabs)/messages')} style={{ position: 'relative' }}>
            <Ionicons name="chatbubbles-outline" size={24} color="#fff" />
            {unreadMessageCount > 0 && (
              <View style={styles.bellBadge}>
                <Text style={styles.bellBadgeText}>{unreadMessageCount > 9 ? '9+' : unreadMessageCount}</Text>
              </View>
            )}
          </TouchableOpacity>
          <NotificationBell />
        </View>
      </View>
      <View style={styles.pageHeader}>
        <View style={styles.pageHeaderCenterGroup}>
          <View style={styles.pageHeaderIconBadge}>
            <Ionicons name="calendar" size={22} color={Colors.brandGreen} />
          </View>
          <Text style={styles.pageTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>Events</Text>
        </View>
        <TouchableOpacity onPress={() => router.push('/dashboard')} style={styles.dashboardShortcut}>
          <Ionicons name="grid-outline" size={21} color={Colors.brandGreen} />
        </TouchableOpacity>
      </View>
      <View style={styles.tabRow}>
        <TouchableOpacity style={[styles.tabBtn, tab === 'upcoming' && styles.tabBtnActive]} onPress={() => setTab('upcoming')}>
          <Text
            style={[styles.tabText, tab === 'upcoming' && styles.tabTextActive]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
          >
            Upcoming
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tabBtn, tab === 'past' && styles.tabBtnActive]} onPress={() => setTab('past')}>
          <Text
            style={[styles.tabText, tab === 'past' && styles.tabTextActive]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
          >
            Past Events
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.filterBtn} onPress={() => { setShowSearch(v => !v); if (showSearch) setSearchQuery(''); }}>
          <Ionicons name="search-outline" size={20} color={Colors.brandGreen} />
        </TouchableOpacity>
        {tab === 'upcoming' && (
          <TouchableOpacity style={styles.filterBtn} onPress={() => setShowDateFilterModal(true)}>
            <Ionicons name="options-outline" size={20} color={Colors.brandGreen} />
          </TouchableOpacity>
        )}
      </View>
      {showSearch && (
        <View style={styles.searchRow}>
          <Ionicons name="search-outline" size={18} color={Colors.midGrey} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search events..."
            placeholderTextColor={Colors.midGrey}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close-circle" size={18} color={Colors.midGrey} />
            </TouchableOpacity>
          )}
        </View>
      )}

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
            const attending = item.attendees?.includes(user?.uid) || false;
            const saved = item.savedBy?.includes(user?.uid) || false;
            const eventIsToday = ed && isToday(ed);
            const shortLoc = shortenLocation(item.eventLocation);
            const itemCreatedAt = item.createdAt?.toDate ? item.createdAt.toDate() : (item.createdAt ? new Date(item.createdAt) : null);
            const isNew = newCutoff && itemCreatedAt && itemCreatedAt > newCutoff && item.authorId !== user?.uid;
            return (
              <TouchableOpacity style={styles.card} onPress={() => router.push('/post/' + item.id)} activeOpacity={0.9}>
              <View style={styles.cardInner}>
                <View style={styles.cardHeader}>
                  {ed && (
                    eventIsToday ? (
                      <View style={styles.todayBadge}>
                        <Text style={styles.todayBadgeText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>TODAY</Text>
                      </View>
                    ) : (
                      <View style={styles.dateBadge}>
                        <Text style={styles.dateWeekday} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{ed.toLocaleString('en-AU', { weekday: 'short' }).toUpperCase()}</Text>
                        <Text style={styles.dateDay} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{ed.getDate()}</Text>
                        <Text style={styles.dateMonth} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{ed.toLocaleString('en-AU', { month: 'short' }).toUpperCase()}</Text>
                      </View>
                    )
                  )}
                  <View style={{ flex: 1 }}>
                    <View style={styles.authorRow}>
                      <AvatarWithOnlineDot authorId={item.authorId} photoURL={item.authorPhotoURL} name={item.authorName} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.cardAuthor} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{item.authorName}</Text>
                        <Text style={styles.postedText}>{formatDate(item.createdAt)}</Text>
                      </View>
                    </View>
                  </View>
                  {isNew && (
                    <View style={styles.newBadge}>
                      <Ionicons name="sparkles" size={10} color={Colors.brandGreen} /><Text style={styles.newBadgeText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>NEW</Text>
                    </View>
                  )}
                  {tab === 'past' && (
                    <View style={styles.completedBadge}>
                      <Text style={styles.completedText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>Done</Text>
                    </View>
                  )}
                  {ed && (
                    <TouchableOpacity style={styles.calendarBtn} onPress={() => handleAddToCalendar(item)} disabled={addingCalendarId === item.id}>
                      {addingCalendarId === item.id ? (
                        <ActivityIndicator color={Colors.brandGreen} size="small" />
                      ) : (
                        <Ionicons name="calendar-outline" size={32} color={Colors.brandGreen} />
                      )}
                    </TouchableOpacity>
                  )}
                </View>

                <View style={styles.detailsBody}>
                  <View style={styles.detailField}>
                    <View style={styles.labelBadgeWrap}>
                      <View style={[styles.labelBadge, styles.titleBadge]}>
                        <Text style={styles.labelBadgeText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>EVENT TITLE</Text>
                      </View>
                    </View>
                    <Text style={styles.fieldValue} numberOfLines={2}>{item.content}</Text>
                  </View>
                  {item.isFree !== undefined && (
                    <View style={styles.detailField}>
                      <View style={styles.labelBadgeWrap}>
                        <View style={[styles.labelBadge, styles.priceBadge]}>
                          <Text style={styles.labelBadgeText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>PRICE</Text>
                        </View>
                      </View>
                      <Text style={styles.fieldValue}>
                        {item.isFree === false ? `$${item.eventPrice?.toFixed(2)}` : 'Free'}
                      </Text>
                    </View>
                  )}
                  {ed && (
                    <View style={styles.detailField}>
                      <View style={styles.labelBadgeWrap}>
                        <View style={[styles.labelBadge, styles.dateBadgeLabel]}>
                          <Text style={styles.labelBadgeText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>DATE & TIME</Text>
                        </View>
                      </View>
                      <Text style={styles.fieldValue}>
                        {eventIsToday ? 'Today' : formatDate(ed)}, {formatTime(ed)}
                      </Text>
                    </View>
                  )}
                  <View style={styles.detailField}>
                    <View style={styles.labelBadgeWrap}>
                      <View style={[styles.labelBadge, styles.attendingBadge]}>
                        <Text style={styles.labelBadgeText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>ATTENDING</Text>
                      </View>
                    </View>
                    <Text style={styles.fieldValue}>{item.attendeeCount || 0} interested</Text>
                  </View>
                  {item.eventLocation ? (
                    <TouchableOpacity
                      style={styles.detailField}
                      onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.eventLocation)}`).catch(() => {})}
                    >
                      <View style={styles.labelBadgeWrap}>
                        <View style={[styles.labelBadge, styles.locationBadge]}>
                          <Text style={styles.labelBadgeText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>LOCATION</Text>
                        </View>
                      </View>
                      <View style={styles.locationValueRow}>
                        <Ionicons name="location-outline" size={14} color={Colors.midGrey} />
                        <Text style={[styles.fieldValue, styles.whereLink]} numberOfLines={1}>{shortLoc}</Text>
                      </View>
                    </TouchableOpacity>
                  ) : null}
                </View>

                <View style={styles.footer}>
                  <View style={styles.footerSideGroup}>
                    <TouchableOpacity style={styles.footerBtn} onPress={() => handleLikeToggle(item)}>
                      <Ionicons name={liked ? 'heart' : 'heart-outline'} size={20} color={liked ? '#E53935' : Colors.charcoal} />
                      <Text style={[styles.footerText, liked && { color: '#E53935' }]}>{item.likeCount || 0}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.footerBtn} onPress={() => router.push('/post/' + item.id)}>
                      <Ionicons name="chatbubble-outline" size={20} color={Colors.charcoal} />
                      <Text style={styles.footerText}>{item.commentCount || 0}</Text>
                    </TouchableOpacity>
                    <View style={styles.footerBtn}>
                      <Ionicons name="eye-outline" size={19} color={Colors.midGrey} />
                      <Text style={[styles.footerText, { color: Colors.midGrey }]}>{item.viewCount || 0}</Text>
                    </View>
                  </View>
                  <View style={{ flex: 1 }} />
                  {tab === 'upcoming' && (
                    <>
                      <TouchableOpacity style={[styles.interestedPill, attending && styles.interestedPillActive]} onPress={() => handleToggleAttending(item)}>
                        <Ionicons name={attending ? 'checkmark-circle' : 'checkmark-circle-outline'} size={16} color={attending ? Colors.white : '#1B4F72'} />
                        <Text
                          style={[styles.interestedPillText, attending && styles.interestedPillTextActive]}
                          numberOfLines={1}
                          adjustsFontSizeToFit
                          minimumFontScale={0.8}
                        >
                          Interested
                        </Text>
                      </TouchableOpacity>
                      <View style={{ flex: 1 }} />
                    </>
                  )}
                  <View style={styles.footerSideGroup}>
                    <TouchableOpacity onPress={() => handleToggleSave(item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Ionicons name={saved ? 'bookmark' : 'bookmark-outline'} size={20} color={saved ? Colors.brandGreen : Colors.charcoal} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleShare(item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ marginLeft: 8 }}>
                      <Ionicons name="share-outline" size={20} color={Colors.charcoal} />
                    </TouchableOpacity>
                  </View>
                </View>
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
          ListFooterComponent={
            hasMore && events.length > 0 ? (
              <TouchableOpacity style={styles.loadMoreBtn} onPress={handleLoadMore} disabled={loadingMore}>
                {loadingMore ? <ActivityIndicator color={Colors.brandGreen} size="small" /> : <Text style={styles.loadMoreBtnText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>Load More</Text>}
              </TouchableOpacity>
            ) : null
          }
        />
      )}

      {tab === 'upcoming' && (
        <TouchableOpacity style={styles.fab} onPress={() => setShowModal(true)}>
          <Ionicons name="pencil-outline" size={16} color={Colors.brandGreen} />
          <Text style={styles.fabText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>New Event</Text>
        </TouchableOpacity>
      )}

      <Modal visible={showDateFilterModal} transparent animationType="slide">
        <TouchableOpacity style={styles.menuOverlay} activeOpacity={1} onPress={() => setShowDateFilterModal(false)}>
          <View style={styles.filterSheet}>
            <View style={styles.filterHeaderBar}>
              <Text style={styles.filterHeaderText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>When</Text>
            </View>
            <View style={[styles.filterPad, { paddingBottom: 32 + insets.bottom }]}>
              {DATE_FILTERS.map(opt => (
                <TouchableOpacity
                  key={opt.key}
                  style={[styles.filterOption, dateFilter === opt.key && styles.filterOptionActive]}
                  onPress={() => { setDateFilter(opt.key); setShowDateFilterModal(false); }}
                >
                  <Ionicons name={dateFilter === opt.key ? 'radio-button-on' : 'radio-button-off'} size={18} color={dateFilter === opt.key ? Colors.brandGreen : Colors.midGrey} />
                  <Text style={[styles.filterOptionText, dateFilter === opt.key && styles.filterOptionTextActive]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal visible={showShareModal} transparent animationType="slide" onDismiss={handleShareModalDismiss}>
        <TouchableOpacity style={styles.shareOverlay} activeOpacity={1} onPress={() => setShowShareModal(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.shareSheet} onPress={() => {}}>
            <View style={styles.shareHeaderBar}>
              <Text style={styles.shareHeaderText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>Share</Text>
            </View>
            <View style={styles.sharePad}>
              <TouchableOpacity style={styles.shareOption} onPress={handleShareToUser}>
                <View style={[styles.shareOptionIcon, { backgroundColor: Colors.brandGreenPale }]}>
                  <Ionicons name="people-outline" size={20} color={Colors.brandGreen} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.shareOptionTitle}>Share to a My Suburb User</Text>
                  <Text style={styles.shareOptionSubtitle}>Send this event as a message</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={Colors.lightGrey} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.shareOption} onPress={handleShareExternal}>
                <View style={[styles.shareOptionIcon, { backgroundColor: '#E3F2FD' }]}>
                  <Ionicons name="share-social-outline" size={20} color="#0D47A1" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.shareOptionTitle}>Share via Other Apps</Text>
                  <Text style={styles.shareOptionSubtitle}>WhatsApp, Messages, Email, and more</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={Colors.lightGrey} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.shareCancelBtn} onPress={() => setShowShareModal(false)}>
                <Text style={styles.shareCancelText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <Modal visible={showModal} animationType="slide" presentationStyle="fullScreen">
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={resetForm} style={{ width: 36 }}>
              <Ionicons name="close" size={24} color={Colors.white} />
            </TouchableOpacity>
            <View style={styles.headerCenter}>
              <AppName style={styles.mySuburb} />
              <Text style={styles.suburbName} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>Bringing suburbs together</Text>
            </View>
            <View style={{ width: 60 }} />
          </View>
          <View style={styles.pageHeader}>
            <View style={styles.pageHeaderCenterGroup}>
              <View style={styles.pageHeaderIconBadge}>
                <Ionicons name={editingEventId ? 'create' : 'calendar'} size={22} color={Colors.brandGreen} />
              </View>
              <Text style={styles.pageTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{editingEventId ? 'Edit Event' : 'New Event'}</Text>
            </View>
          </View>
          <View style={styles.primarySuburbBanner}>
            <Ionicons name="location-outline" size={15} color={Colors.brandGreen} />
            <Text style={styles.primarySuburbText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
              {`Posting to ${profile?.suburb}, ${profile?.state}`}
            </Text>
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
            <View style={styles.sectionBar}><Text style={styles.sectionBarText}>Price</Text></View>
            <View style={styles.fieldPad}>
              <View style={styles.priceToggleRow}>
                <TouchableOpacity
                  style={[styles.priceToggleBtn, priceType === 'free' && styles.priceToggleBtnActive]}
                  onPress={() => setPriceType('free')}
                >
                  <Text style={[styles.priceToggleText, priceType === 'free' && styles.priceToggleTextActive]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>Free</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.priceToggleBtn, priceType === 'paid' && styles.priceToggleBtnActive]}
                  onPress={() => setPriceType('paid')}
                >
                  <Text style={[styles.priceToggleText, priceType === 'paid' && styles.priceToggleTextActive]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>Paid</Text>
                </TouchableOpacity>
              </View>
              {priceType === 'paid' && (
                <TextInput
                  style={[styles.input2Line, { height: 48, marginTop: 8 }]}
                  placeholder="e.g. 15.00"
                  placeholderTextColor={Colors.midGrey}
                  value={eventPrice}
                  onChangeText={setEventPrice}
                  keyboardType="decimal-pad"
                />
              )}
            </View>
            <View style={styles.sectionBar}><Text style={styles.sectionBarText}>Date & Time</Text></View>
            <View style={styles.fieldPad}>
              <View style={styles.dateTimeRow}>
                <TouchableOpacity style={[styles.pickerBtn, styles.pickerBtnHalf]} onPress={openDatePicker}>
                  <Ionicons name="calendar-outline" size={18} color={Colors.brandGreen} />
                  <Text style={styles.pickerText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{formatDateFull(eventDate)}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.pickerBtn, styles.pickerBtnHalf]} onPress={openTimePicker}>
                  <Ionicons name="time-outline" size={18} color={Colors.brandGreen} />
                  <Text style={styles.pickerText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{formatTime(eventDate)}</Text>
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
            <MediaPickerSection media={media} onAddMedia={handleAddMedia} onRemoveMedia={removeMedia} />
            <View style={styles.fieldPad}>
              <TouchableOpacity style={[styles.postBtnBottom, posting && { opacity: 0.7 }]} onPress={handlePost} disabled={posting}>
                {posting ? <ActivityIndicator color={Colors.white} size="small" /> : <Text style={styles.postBtnBottomText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{editingEventId ? 'Save Changes' : 'Post Event'}</Text>}
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
  headerCenter: { alignItems: 'center', marginLeft: 8 },
  mySuburb: { fontSize: 27, fontWeight: '800', color: Colors.white },
  suburbName: { fontSize: 17, color: '#FFD700', marginTop: 4 },
  profileAvatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#FFD700', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  profileAvatarImage: { width: 42, height: 42, borderRadius: 21 },
  profileAvatarText: { fontSize: 16, fontWeight: '800', color: Colors.brandGreen },
  bellBadge: { position: 'absolute', top: -4, right: -4, backgroundColor: '#E53935', borderRadius: 8, minWidth: 16, height: 16, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 3 },
  bellBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  pageHeader: { backgroundColor: Colors.brandGreenPale, paddingVertical: 14, paddingHorizontal: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: Colors.lightGrey },
  pageHeaderCenterGroup: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
  dashboardShortcut: { padding: 4 },
  pageHeaderIconBadge: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.white, justifyContent: 'center', alignItems: 'center' },
  pageTitle: { fontSize: 21, fontWeight: '800', color: Colors.brandGreen, letterSpacing: 0.2 },
  primarySuburbBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: Colors.white, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.lightGrey },
  primarySuburbText: { fontSize: 14, color: Colors.brandGreen },
  tabRow: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10, borderBottomWidth: 1, borderBottomColor: Colors.lightGrey },
  filterBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.brandGreenPale, justifyContent: 'center', alignItems: 'center' },
  filterSheet: { backgroundColor: Colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden' },
  filterHeaderBar: { backgroundColor: Colors.brandGreen, paddingTop: 14, paddingBottom: 16, alignItems: 'center' },
  filterHeaderText: { fontSize: 19, fontWeight: '800', color: Colors.white },
  filterPad: { padding: 16, paddingBottom: 32 },
  filterOption: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 14, borderRadius: 14, backgroundColor: '#FAFAFA', borderWidth: 1.5, borderColor: '#EFEFEF', marginBottom: 8 },
  filterOptionActive: { backgroundColor: Colors.brandGreenPale, borderColor: Colors.brandGreen },
  filterOptionText: { fontSize: 15, color: Colors.charcoal, fontWeight: '600' },
  filterOptionTextActive: { color: Colors.brandGreen, fontWeight: '700' },
  tabBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 25, backgroundColor: '#F0F0F0', borderWidth: 1, borderColor: Colors.lightGrey },
  tabBtnActive: { backgroundColor: Colors.brandGreen, borderColor: Colors.brandGreen },
  tabText: { fontSize: 17, color: Colors.midGrey, fontWeight: '600' },
  tabTextActive: { color: Colors.white, fontWeight: '700' },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginTop: 12, marginBottom: 12, paddingHorizontal: 14, paddingVertical: 11, backgroundColor: '#F5F5F5', borderRadius: 14, borderWidth: 1, borderColor: Colors.lightGrey },
  searchInput: { flex: 1, fontSize: 14, color: Colors.charcoal },
  list: { padding: 16, gap: 20, paddingBottom: 100 },
  card: {
    backgroundColor: Colors.white, borderRadius: 18,
    borderWidth: 1.5, borderColor: Colors.brandGreen,
    borderLeftWidth: 4, borderLeftColor: '#6A1B9A',
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.08, shadowRadius: 10, elevation: 3,
  },
  cardInner: { padding: 14, overflow: 'hidden', borderTopRightRadius: 18, borderBottomLeftRadius: 18, borderBottomRightRadius: 18 },
  cardHeader: { flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: '#EDF7EF', marginHorizontal: -14, marginTop: -14, paddingHorizontal: 14, paddingTop: 14, paddingBottom: 6, borderTopLeftRadius: 18, borderTopRightRadius: 18 },
  detailsBody: { marginTop: 6, gap: 6 },
  detailField: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 3 },
  labelBadgeWrap: { width: 98 },
  labelBadge: { width: 90, alignItems: 'center', paddingHorizontal: 6, paddingVertical: 4, borderRadius: 20, backgroundColor: '#C2D9E8' },
  labelBadgeText: { fontSize: 9, fontWeight: '900', color: '#1B4F72', letterSpacing: 0.3 },
  titleBadge: {},
  aboutBadge: {},
  aboutBadgeText: {},
  priceBadge: {},
  dateBadgeLabel: {},
  locationBadge: {},
  attendingBadge: {},
  fieldValue: { fontSize: 14, color: Colors.charcoal, fontWeight: '600', lineHeight: 19, flex: 1 },
  locationValueRow: { flexDirection: 'row', alignItems: 'center', gap: 5, flex: 1 },
  whereLink: { textDecorationLine: 'underline' },
  calendarBtn: { width: 60, height: 60, borderRadius: 30, backgroundColor: Colors.brandGreenPale, justifyContent: 'center', alignItems: 'center' },
  dateBadge: { width: 56, height: 62, borderRadius: 14, backgroundColor: '#5B7DB1', justifyContent: 'center', alignItems: 'center', gap: 1 },
  dateWeekday: { fontSize: 9, fontWeight: '900', color: 'rgba(255,255,255,0.75)' },
  dateDay: { fontSize: 19, fontWeight: '900', color: Colors.white, lineHeight: 21 },
  dateMonth: { fontSize: 10, fontWeight: '900', color: 'rgba(255,255,255,0.85)' },
  todayBadge: { width: 56, height: 62, borderRadius: 14, backgroundColor: '#5B7DB1', justifyContent: 'center', alignItems: 'center' },
  todayBadgeText: { fontSize: 13, fontWeight: '900', color: Colors.white, textAlign: 'center' },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardAuthor: { fontSize: 17, color: Colors.charcoal, fontWeight: '600', flexShrink: 1 },
  postedText: { fontSize: 12, color: Colors.midGrey, fontStyle: 'italic', marginTop: 2 },
  suggestionsBox: { marginTop: 6, borderWidth: 1, borderColor: Colors.lightGrey, borderRadius: 12, backgroundColor: Colors.white, overflow: 'hidden' },
  suggestionItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: Colors.lightGrey },
  suggestionText: { flex: 1, fontSize: 14, color: Colors.charcoal },
  newBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#FFD700', paddingHorizontal: 9, paddingVertical: 5, borderRadius: 12, borderWidth: 1, borderColor: Colors.brandGreen, marginBottom: 4 },
  newBadgeText: { fontSize: 11, fontWeight: '800', color: Colors.brandGreen, letterSpacing: 0.5 },
  completedBadge: { backgroundColor: '#F0F0F0', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 10 },
  completedText: { fontSize: 11, color: Colors.midGrey, fontWeight: '700' },
  footer: { flexDirection: 'row', gap: 16, alignItems: 'center', marginTop: 12, marginHorizontal: -14, marginBottom: -14, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: '#EFEFEF', borderTopWidth: 1.5, borderTopColor: '#E0E0E0', borderBottomLeftRadius: 18, borderBottomRightRadius: 18 },
  footerBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  footerSideGroup: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  interestedPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1.5, borderColor: '#1B4F72', backgroundColor: Colors.white },
  interestedPillActive: { backgroundColor: '#1B4F72', borderColor: '#1B4F72' },
  interestedPillText: { fontSize: 13, fontWeight: '700', color: '#1B4F72' },
  interestedPillTextActive: { color: Colors.white },
  footerText: { fontSize: 13, color: Colors.charcoal, fontWeight: '700' },
  priceToggleRow: { flexDirection: 'row', gap: 10 },
  priceToggleBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 12, backgroundColor: '#F0F0F0', borderWidth: 1, borderColor: Colors.lightGrey },
  priceToggleBtnActive: { backgroundColor: Colors.brandGreen, borderColor: Colors.brandGreen },
  priceToggleText: { fontSize: 14, fontWeight: '700', color: Colors.midGrey },
  priceToggleTextActive: { color: Colors.white },
  empty: { alignItems: 'center', paddingTop: 60, gap: 8 },
  loadMoreBtn: { marginTop: 4, marginBottom: 12, alignSelf: 'center', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24, backgroundColor: Colors.brandGreenPale, borderWidth: 1.5, borderColor: Colors.brandGreen },
  loadMoreBtnText: { fontSize: 14, fontWeight: '700', color: Colors.brandGreen },
  emptyText: { fontSize: 15, color: Colors.midGrey },
  fab: { position: 'absolute', bottom: 24, right: 16, backgroundColor: '#FFD700', borderRadius: 25, paddingVertical: 10, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 6, elevation: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4 },
  shareOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  menuOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  shareSheet: { backgroundColor: Colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden' },
  shareHeaderBar: { backgroundColor: Colors.brandGreen, paddingTop: 14, paddingBottom: 16, alignItems: 'center', borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  shareHeaderText: { fontSize: 19, fontWeight: '800', color: Colors.white },
  sharePad: { padding: 16, paddingBottom: 32 },
  shareOption: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, paddingHorizontal: 8, borderRadius: 14, marginBottom: 6 },
  shareOptionIcon: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  shareOptionTitle: { fontSize: 15, fontWeight: '700', color: Colors.charcoal },
  shareOptionSubtitle: { fontSize: 12, color: Colors.midGrey, marginTop: 2 },
  shareCancelBtn: { backgroundColor: Colors.brandGreenPale, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  shareCancelText: { fontSize: 15, fontWeight: '700', color: Colors.brandGreen },
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
  videoPlayBadge: {
    position: 'absolute', top: '50%', left: '50%', marginTop: -12, marginLeft: -12,
    width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center', alignItems: 'center',
  },
  addImageBtn: { width: 90, height: 90, borderRadius: 10, borderWidth: 1.5, borderColor: Colors.brandGreen, borderStyle: 'dashed', justifyContent: 'center', alignItems: 'center', gap: 4 },
  addImageText: { fontSize: 11, color: Colors.brandGreen, fontWeight: '600' },
});