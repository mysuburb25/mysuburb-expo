import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { Colors } from '../constants/theme';

const CATEGORY_CONFIGS = {
  community: {
    title: 'Community Hub',
    categories: [
      { key: 'updates', label: "What's Happening", placeholder: "Share what's going on in your suburb — local news, community updates, questions or anything neighbours should know about." },
      { key: 'notices', label: 'Notice', placeholder: 'Post an important notice for your suburb — upcoming roadworks, council announcements, community meetings or local alerts.' },
      { key: 'safety', label: 'Safety Alert', placeholder: 'Report a safety concern in your suburb — suspicious activity, dangerous road conditions, break-ins, or anything that affects the safety of your neighbours.' },
    ],
  },
  events: {
    title: 'Events',
    categories: [
      { key: 'events', label: 'Event', placeholder: 'Tell your neighbours about a local event — include the date, time, location and what to expect!' },
    ],
  },
  marketplace: {
    title: 'Buy & Sell',
    categories: [
      { key: 'forsale', label: 'For Sale', placeholder: 'Selling something? Describe the item, its condition and your asking price. Local pickup preferred!' },
      { key: 'giveaway', label: 'Give Away', placeholder: 'Giving something away for free? Describe the item and any pickup details. First come first served!' },
      { key: 'seeking', label: 'Seeking', placeholder: "Looking for something specific? Let your neighbours know what you're after!" },
    ],
  },
  lostfound: {
    title: 'Lost & Found',
    categories: [
      { key: 'lost', label: 'Lost', placeholder: 'Lost something? Describe the item, where you last saw it and when. Include a contact method so neighbours can reach you.' },
      { key: 'found', label: 'Found', placeholder: 'Found something? Describe what you found and where. Help reunite it with its owner!' },
    ],
  },
};

export default function CreatePostScreen() {
  const { category: initialCategory, preselect } = useLocalSearchParams();
  const { user, profile } = useAuth();
  const config = CATEGORY_CONFIGS[initialCategory] || CATEGORY_CONFIGS.community;
  const defaultCat = config.categories.find(c => c.key === preselect) || config.categories[0];
  const [selectedCategory, setSelectedCategory] = useState(defaultCat.key);
  const [content, setContent] = useState('');
  const [price, setPrice] = useState('');
  const [eventLocation, setEventLocation] = useState('');
  const [posting, setPosting] = useState(false);

  const currentCat = config.categories.find(c => c.key === selectedCategory) || config.categories[0];

  const handlePost = async () => {
    if (!content.trim()) { Alert.alert('Error', 'Please write something!'); return; }
    setPosting(true);
    try {
      await addDoc(collection(db, 'posts'), {
        content: content.trim(),
        category: selectedCategory,
        suburb: profile.suburb,
        state: profile.state,
        authorId: user.uid,
        authorName: profile.displayName,
        createdAt: serverTimestamp(),
        likeCount: 0,
        commentCount: 0,
        isRemoved: false,
        ...(selectedCategory === 'forsale' && price ? { price: parseFloat(price) } : {}),
        ...(selectedCategory === 'giveaway' ? { isFree: true } : {}),
        ...(selectedCategory === 'seeking' ? { isWanted: true } : {}),
        ...(selectedCategory === 'lost' ? { lostFoundType: 'lost' } : {}),
        ...(selectedCategory === 'found' ? { lostFoundType: 'found' } : {}),
        ...(eventLocation ? { eventLocation } : {}),
      });
      router.back();
    } catch (e) { Alert.alert('Error', e.message); }
    finally { setPosting(false); }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="close" size={24} color={Colors.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Post to {profile?.suburb}</Text>
        <TouchableOpacity style={[styles.postBtn, posting && { opacity: 0.7 }]} onPress={handlePost} disabled={posting}>
          {posting ? <ActivityIndicator color={Colors.white} size="small" /> : <Text style={styles.postBtnText}>Post</Text>}
        </TouchableOpacity>
      </View>
      <ScrollView style={styles.body} contentContainerStyle={{ gap: 16, padding: 16 }}>
        <Text style={styles.label}>{config.title}</Text>
        <View style={styles.categoryRow}>
          {config.categories.map(c => (
            <TouchableOpacity key={c.key} style={[styles.chip, selectedCategory === c.key && styles.chipActive]} onPress={() => setSelectedCategory(c.key)}>
              <Text style={[styles.chipText, selectedCategory === c.key && styles.chipTextActive]}>{c.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TextInput
          style={styles.input}
          placeholder={currentCat.placeholder}
          placeholderTextColor={Colors.midGrey}
          value={content}
          onChangeText={setContent}
          multiline
          numberOfLines={5}
          textAlignVertical="top"
        />
        {selectedCategory === 'forsale' && (
          <TextInput style={styles.inputSmall} placeholder="Price (e.g. 25.00)" placeholderTextColor={Colors.midGrey} value={price} onChangeText={setPrice} keyboardType="numeric" />
        )}
        {selectedCategory === 'events' && (
          <TextInput style={styles.inputSmall} placeholder="Event location (e.g. Paddington Park)" placeholderTextColor={Colors.midGrey} value={eventLocation} onChangeText={setEventLocation} />
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.white },
  header: { backgroundColor: Colors.brandGreen, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 56, paddingBottom: 16, paddingHorizontal: 16 },
  headerTitle: { fontSize: 16, fontWeight: '700', color: Colors.white },
  postBtn: { backgroundColor: Colors.white, paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20 },
  postBtnText: { fontSize: 14, fontWeight: '700', color: Colors.brandGreen },
  body: { flex: 1 },
  label: { fontSize: 16, fontWeight: '700', color: Colors.brandGreen },
  categoryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: Colors.lightGrey },
  chipActive: { backgroundColor: Colors.brandGreen, borderColor: Colors.brandGreen },
  chipText: { fontSize: 14, color: Colors.charcoal, fontWeight: '600' },
  chipTextActive: { color: Colors.white, fontWeight: '700' },
  input: { borderWidth: 1, borderColor: Colors.lightGrey, borderRadius: 12, padding: 14, fontSize: 15, color: Colors.charcoal, minHeight: 180 },
  inputSmall: { borderWidth: 1, borderColor: Colors.lightGrey, borderRadius: 12, padding: 14, fontSize: 15, color: Colors.charcoal },
});