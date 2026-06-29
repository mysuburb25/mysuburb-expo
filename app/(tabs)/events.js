import { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Modal, TextInput, ScrollView, Alert } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Line } from 'react-native-svg';
import { collection, query, where, orderBy, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../context/AuthContext';
import { Colors } from '../../constants/theme';
import DateTimePicker from '@react-native-community/datetimepicker';

export default function EventsScreen() {
  const { profile, user } = useAuth();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('upcoming');
  const [showModal, setShowModal] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [eventDate, setEventDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [posting, setPosting] = useState(false);

  useEffect(() => { if (profile?.suburb) fetchEvents(); }, [profile]);

  const fetchEvents = async () => {
    try {
      const q = query(collection(db, 'posts'), where('suburb', '==', profile.suburb), where('category', '==', 'events'), where('isRemoved', '==', false), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      setEvents(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handlePost = async () => {
    if (!title.trim()) { Alert.alert('Error', 'Please enter an event title.'); return; }
    setPosting(true);
    try {
      await addDoc(collection(db, 'posts'), {
        content: title.trim(),
        description: description.trim(),
        eventLocation: location.trim(),
        eventDate: eventDate,
        category: 'events',
        suburb: profile.suburb,
        state: profile.state,
        authorId: user.uid,
        authorName: profile.displayName,
        createdAt: serverTimestamp(),
        likeCount: 0,
        commentCount: 0,
        isRemoved: false,
      });
      setShowModal(false);
      setTitle(''); setDescription(''); setLocation(''); setEventDate(new Date());
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

  const formatDate = (date) => date.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  const formatTime = (date) => date.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });

  return (
    <View style={styles.container}>
      <View style={styles.topHeader}>
        <TouchableOpacity style={styles.profileAvatar} onPress={() => router.push('/(tabs)/profile')}>
          <Text style={styles.profileAvatarText}>{profile?.displayName?.[0]?.toUpperCase() || '?'}</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.mySuburb}>My Suburb</Text>
          <Text style={styles.suburbName}>{profile?.suburb}, {profile?.state}</Text>
        </View>
        <TouchableOpacity onPress={() => router.push('/(tabs)/notifications')}>
          <Ionicons name="notifications-outline" size={24} color="#fff" />
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
          renderItem={({ item }) => {
            const ed = item.eventDate ? (item.eventDate.toDate ? item.eventDate.toDate() : new Date(item.eventDate)) : null;
            return (
              <TouchableOpacity style={[styles.card, tab === 'past' && styles.cardPast]} onPress={() => tab === 'upcoming' ? router.push('/post/' + item.id) : null} activeOpacity={tab === 'past' ? 1 : 0.7}>
                <View style={styles.dateBox}>
                  <Text style={styles.dateDay}>{ed ? ed.getDate() : '?'}</Text>
                  <Text style={styles.dateMonth}>{ed ? ed.toLocaleString('en-AU', { month: 'short' }) : ''}</Text>
                </View>
                <View style={styles.cardBody}>
                  <Text style={styles.cardTitle} numberOfLines={2}>{item.content}</Text>
                  {item.description ? <Text style={styles.cardDesc} numberOfLines={2}>{item.description}</Text> : null}
                  {item.eventLocation ? (
                    <View style={styles.locationRow}>
                      <Ionicons name="location-outline" size={13} color={Colors.midGrey} />
                      <Text style={styles.location}>{item.eventLocation}</Text>
                    </View>
                  ) : null}
                  {ed ? (
                    <View style={styles.locationRow}>
                      <Ionicons name="time-outline" size={13} color={Colors.midGrey} />
                      <Text style={styles.location}>{formatTime(ed)}</Text>
                    </View>
                  ) : null}
                  <Text style={styles.author}>by {item.authorName}</Text>
                  {tab === 'past' && <View style={styles.completedBadge}><Text style={styles.completedText}>Completed</Text></View>}
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
          <Svg width="30" height="30" viewBox="0 0 30 30">
              <Line x1="15" y1="3" x2="15" y2="27" stroke="#FFD700" strokeWidth="4" strokeLinecap="round"/>
              <Line x1="3" y1="15" x2="27" y2="15" stroke="#FFD700" strokeWidth="4" strokeLinecap="round"/>
            </Svg>
        </TouchableOpacity>
      )}

      <Modal visible={showModal} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowModal(false)}>
              <Ionicons name="close" size={24} color="#FFD700" />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Add Event</Text>
            <TouchableOpacity style={[styles.postBtn, posting && { opacity: 0.7 }]} onPress={handlePost} disabled={posting}>
              {posting ? <ActivityIndicator color={Colors.white} size="small" /> : <Text style={styles.postBtnText}>Post</Text>}
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.modalBody} contentContainerStyle={{ gap: 16, padding: 16 }}>
            <Text style={styles.inputLabel}>Event Title *</Text>
            <TextInput style={styles.input} placeholder="e.g. Community Garage Sale" placeholderTextColor={Colors.midGrey} value={title} onChangeText={setTitle} />
            <Text style={styles.inputLabel}>Description</Text>
            <TextInput style={[styles.input, styles.inputMulti]} placeholder="Tell your neighbours what this event is about..." placeholderTextColor={Colors.midGrey} value={description} onChangeText={setDescription} multiline numberOfLines={4} textAlignVertical="top" />
            <Text style={styles.inputLabel}>Date</Text>
            <TouchableOpacity style={styles.dateBtn} onPress={() => setShowDatePicker(true)}>
              <Ionicons name="calendar-outline" size={18} color="#FFD700" />
              <Text style={styles.dateBtnText}>{formatDate(eventDate)}</Text>
            </TouchableOpacity>
            <Text style={styles.inputLabel}>Time</Text>
            <TouchableOpacity style={styles.dateBtn} onPress={() => setShowTimePicker(true)}>
              <Ionicons name="time-outline" size={18} color="#FFD700" />
              <Text style={styles.dateBtnText}>{formatTime(eventDate)}</Text>
            </TouchableOpacity>
            <Text style={styles.inputLabel}>Location</Text>
            <TextInput style={styles.input} placeholder="e.g. Paddington Park, cnr Given Tce & Latrobe St" placeholderTextColor={Colors.midGrey} value={location} onChangeText={setLocation} />
            {showDatePicker && (
              <DateTimePicker value={eventDate} mode="date" display="default" minimumDate={new Date()}
                onChange={(e, date) => { setShowDatePicker(false); if (date) setEventDate(date); }} />
            )}
            {showTimePicker && (
              <DateTimePicker value={eventDate} mode="time" display="default"
                onChange={(e, date) => { setShowTimePicker(false); if (date) setEventDate(date); }} />
            )}
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
  profileAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#FFFFC5', justifyContent: 'center', alignItems: 'center' },
  profileAvatarText: { fontSize: 14, fontWeight: '800', color: Colors.brandGreen },
  pageHeader: { backgroundColor: Colors.brandGreenPale, paddingVertical: 10, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: Colors.lightGrey },
  pageTitle: { fontSize: 20, fontWeight: '700', color: Colors.brandGreen },
  tabRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: Colors.lightGrey, backgroundColor: Colors.white },
  tabBtn: { flex: 1, paddingVertical: 14, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabBtnActive: { borderBottomColor: Colors.brandGreen },
  tabText: { fontSize: 15, color: Colors.midGrey, fontWeight: '600' },
  tabTextActive: { color: Colors.brandGreen, fontWeight: '700' },
  list: { padding: 16, gap: 12, paddingBottom: 100 },
  card: { backgroundColor: Colors.white, borderRadius: 14, padding: 16, flexDirection: 'row', gap: 14, borderWidth: 1, borderColor: Colors.lightGrey },
  cardPast: { opacity: 0.7 },
  dateBox: { width: 52, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.brandGreenPale, borderRadius: 10, padding: 8 },
  dateDay: { fontSize: 22, fontWeight: '800', color: Colors.brandGreen },
  dateMonth: { fontSize: 11, fontWeight: '600', color: Colors.brandGreen, textTransform: 'uppercase' },
  cardBody: { flex: 1, gap: 4 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: Colors.charcoal },
  cardDesc: { fontSize: 13, color: Colors.midGrey, lineHeight: 18 },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  location: { fontSize: 13, color: Colors.midGrey },
  author: { fontSize: 12, color: Colors.midGrey },
  completedBadge: { alignSelf: 'flex-start', marginTop: 4, backgroundColor: Colors.brandGreenPale, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  completedText: { fontSize: 11, color: Colors.brandGreen, fontWeight: '600' },
  empty: { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyText: { fontSize: 15, color: Colors.midGrey },
  fab: { position: 'absolute', bottom: 24, right: 24, width: 56, height: 56, borderRadius: 28, backgroundColor: Colors.brandGreen, justifyContent: 'center', alignItems: 'center', elevation: 8 },
  modalContainer: { flex: 1, backgroundColor: Colors.white },
  modalHeader: { backgroundColor: Colors.brandGreen, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 56, paddingBottom: 16, paddingHorizontal: 16 },
  modalTitle: { fontSize: 16, fontWeight: '700', color: Colors.white },
  postBtn: { backgroundColor: Colors.white, paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20 },
  postBtnText: { fontSize: 14, fontWeight: '700', color: Colors.brandGreen },
  modalBody: { flex: 1 },
  inputLabel: { fontSize: 14, fontWeight: '700', color: Colors.brandGreen },
  input: { borderWidth: 1, borderColor: Colors.lightGrey, borderRadius: 12, padding: 14, fontSize: 15, color: Colors.charcoal },
  inputMulti: { minHeight: 100 },
  dateBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: Colors.lightGrey, borderRadius: 12, padding: 14 },
  dateBtnText: { fontSize: 15, color: Colors.charcoal },
});