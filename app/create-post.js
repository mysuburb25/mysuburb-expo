import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { Colors, Categories } from '../constants/theme';

export default function CreatePostScreen() {
  const { user, profile } = useAuth();
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('general');
  const [price, setPrice] = useState('');
  const [isFree, setIsFree] = useState(false);
  const [eventLocation, setEventLocation] = useState('');
  const [loading, setLoading] = useState(false);

  const handlePost = async () => {
    if (!content.trim()) { Alert.alert('Error', 'Please write something.'); return; }
    setLoading(true);
    try {
      await addDoc(collection(db, 'posts'), {
        content: content.trim(),
        category,
        authorId: user.uid,
        authorName: profile.displayName,
        suburb: profile.suburb,
        state: profile.state,
        imageUrls: [],
        likeCount: 0,
        commentCount: 0,
        isRemoved: false,
        price: category === 'marketplace' && !isFree ? parseFloat(price) || 0 : null,
        isFree: category === 'marketplace' ? isFree : false,
        eventLocation: category === 'events' ? eventLocation : null,
        createdAt: serverTimestamp(),
      });
      router.back();
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally { setLoading(false); }
  };

  return (
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.label}>Category</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
        {Categories.map(cat => (
          <TouchableOpacity key={cat.key} style={[styles.catChip, category === cat.key && styles.catChipActive]} onPress={() => setCategory(cat.key)}>
            <Text style={[styles.catChipText, category === cat.key && styles.catChipTextActive]}>{cat.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <Text style={styles.label}>What's happening?</Text>
      <TextInput style={styles.textArea} placeholder="Share something with your neighbours..." value={content} onChangeText={setContent} multiline numberOfLines={6} textAlignVertical="top" />

      {category === 'marketplace' && (
        <View>
          <TouchableOpacity style={styles.checkRow} onPress={() => setIsFree(!isFree)}>
            <Ionicons name={isFree ? 'checkbox' : 'square-outline'} size={22} color={Colors.brandGreen} />
            <Text style={styles.checkLabel}>This is a free giveaway</Text>
          </TouchableOpacity>
          {!isFree && (
            <>
              <Text style={styles.label}>Price ($)</Text>
              <TextInput style={styles.input} placeholder="0.00" value={price} onChangeText={setPrice} keyboardType="decimal-pad" />
            </>
          )}
        </View>
      )}

      {category === 'events' && (
        <View>
          <Text style={styles.label}>Location</Text>
          <TextInput style={styles.input} placeholder="e.g. Town Hall, Main St" value={eventLocation} onChangeText={setEventLocation} />
        </View>
      )}

      <TouchableOpacity style={[styles.postBtn, loading && styles.postBtnDisabled]} onPress={handlePost} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.postBtnText}>Post to {profile?.suburb}</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.sand, padding: 16 },
  label: { fontSize: 14, fontWeight: '600', color: Colors.charcoal, marginBottom: 8, marginTop: 16 },
  catChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.lightGrey, marginRight: 8 },
  catChipActive: { backgroundColor: Colors.brandGreen, borderColor: Colors.brandGreen },
  catChipText: { fontSize: 13, color: Colors.midGrey },
  catChipTextActive: { color: Colors.white, fontWeight: '600' },
  textArea: { backgroundColor: Colors.white, borderRadius: 12, padding: 14, fontSize: 15, minHeight: 140, borderWidth: 1, borderColor: Colors.lightGrey, color: Colors.charcoal },
  input: { backgroundColor: Colors.white, borderRadius: 12, padding: 14, fontSize: 15, borderWidth: 1, borderColor: Colors.lightGrey, color: Colors.charcoal },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
  checkLabel: { fontSize: 15, color: Colors.charcoal },
  postBtn: { backgroundColor: Colors.brandGreen, borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 24, marginBottom: 40 },
  postBtnDisabled: { opacity: 0.7 },
  postBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});