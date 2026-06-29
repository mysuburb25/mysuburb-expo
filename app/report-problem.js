import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

const CATEGORIES = ['Bug or technical issue', 'Inappropriate content', 'Account issue', 'Safety concern', 'Other'];

export default function ReportProblemScreen() {
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = () => {
    if (!category) { Alert.alert('Error', 'Please select a category.'); return; }
    if (!description.trim()) { Alert.alert('Error', 'Please describe the problem.'); return; }
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      Alert.alert('Report Submitted', 'Thank you for your report. We will review it within 24 hours.', [
        { text: 'OK', onPress: () => router.back() }
      ]);
    }, 1000);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Report a Problem</Text>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.label}>Category</Text>
        <View style={styles.categories}>
          {CATEGORIES.map(cat => (
            <TouchableOpacity
              key={cat}
              style={[styles.catChip, category === cat && styles.catChipActive]}
              onPress={() => setCategory(cat)}
            >
              <Text style={[styles.catText, category === cat && styles.catTextActive]}>{cat}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Describe the Problem</Text>
        <TextInput
          style={styles.input}
          placeholder="Please describe what happened in as much detail as possible..."
          placeholderTextColor="#9CA3AF"
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={6}
          textAlignVertical="top"
        />

        <Text style={styles.hint}>We aim to review all reports within 24 hours. For urgent safety issues please call 000.</Text>

        <TouchableOpacity style={[styles.btn, loading && { opacity: 0.7 }]} onPress={handleSubmit} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Submit Report</Text>}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  header: { backgroundColor: '#2D6A4F', paddingTop: 56, paddingBottom: 16, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#fff' },
  content: { padding: 20, gap: 8, paddingBottom: 60 },
  label: { fontSize: 14, fontWeight: '700', color: '#2D6A4F', marginTop: 12, marginBottom: 10 },
  categories: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  catChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: '#E5E7EB', backgroundColor: '#fff' },
  catChipActive: { backgroundColor: '#2D6A4F', borderColor: '#2D6A4F' },
  catText: { fontSize: 14, color: '#1B1F23', fontWeight: '500' },
  catTextActive: { color: '#fff', fontWeight: '700' },
  input: { borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 12, padding: 14, fontSize: 15, color: '#1B1F23', minHeight: 140 },
  hint: { fontSize: 13, color: '#9CA3AF', lineHeight: 20, marginTop: 8 },
  btn: { backgroundColor: '#2D6A4F', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 16 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});