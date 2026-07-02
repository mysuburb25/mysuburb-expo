import { useState, useCallback, useRef } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Modal, TextInput, ScrollView, Alert, Platform, KeyboardAvoidingView, RefreshControl, Keyboard } from 'react-native';
import { router } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { collection, query, where, orderBy, getDocs, addDoc, serverTimestamp, updateDoc, increment, doc } from 'firebase/firestore';
import { db } from '../../config/firebase';
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

export default function EventsScreen() {
  const { profile, user } = useAuth();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState('upcoming');
  const [showModal, setShowModal] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [eventDate, setEventDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [posting, setPosting] = useState(false);
  const scrollRef = useRef(null);

  const fetchEvents = useCallback(async () => {
    if (!profile?.suburb) return;
    try {
      const q = query(collection(db, 'posts'), where('suburb', '==', profile.suburb), where('category', '==', 'events'), where('isRemoved', '==', false), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      setEvents(snap.docs.map(d => ({ id: d.id, ...d.data() })));
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

  const handlePost = async () => {
    if (!title.trim()) { Alert.alert('Error', 'Please enter an event title.'); return; }
    setPosting(true);
    try {
      await addDoc(collection(db, 'posts'), {
        content: title.trim(), description: description.trim(),
        eventLocation: location.trim(), eventDate: eventDate,
        category: 'events', suburb: profile.suburb, state: profile.state,
        authorId: user.uid, authorName: profile.displayName,
        createdAt: serverTimestamp(), likeCount: 0, commentCount: 0, isRemoved: false,
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

  const formatDateFull = (date) => date.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  const onDateChange = (event, selectedDate) => { setShowDatePicker(false); if (selectedDate) setEventDate(selectedDate); };
  const onTimeChange = (event, selectedTime) => { setShowTimePicker(false); if (selectedTime) setEventDate(selectedTime); };

  const openDatePicker = () => { Keyboard.dismiss(); setShowTimePicker(false); setTimeout(() => setShowDatePicker(v => !v), 100); };
  const openTimePicker = () => { Keyboard.dismiss(); setShowDatePicker(false); setTimeout(() => { setShowTimePicker(v => !v); setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 300); }, 100); };

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
          <Ionicons name="notifications-outline" size={26} color="#fff" />
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
                        <View style={styles.infoRow}>
                          <Ionicons name="location-outline" size={13} color={Colors.midGrey} />
                          <Text style={styles.infoText}>{item.eventLocation}</Text>
                        </View>
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
          <ScrollView ref={scrollRef} style={styles.modalBody} contentContainerStyle={{ paddingBottom: 60 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} automaticallyAdjustKeyboardInsets={true}>
            <View style={styles.sectionBar}><Text style={styles.sectionBarText}>Event Title</Text></View>
            <View style={styles.fieldPad}>
              <TextInput style={styles.input2Line} placeholder="e.g. Community Garage Sale, Street Festival..." placeholderTextColor={Colors.midGrey} value={title} onChangeText={setTitle} multiline numberOfLines={2} textAlignVertical="top" autoCapitalize="sentences" />
            </View>
            <View style={styles.sectionBar}><Text style={styles.sectionBarText}>Description</Text></View>
            <View style={styles.fieldPad}>
              <TextInput style={styles.input2Line} placeholder="Tell your neighbours what this event is about..." placeholderTextColor={Colors.midGrey} value={description} onChangeText={setDescription} multiline numberOfLines={2} textAlignVertical="top" autoCapitalize="sentences" />
            </View>
            <View style={styles.sectionBar}><Text style={styles.sectionBarText}>Date</Text></View>
            <View style={styles.fieldPad}>
              <TouchableOpacity style={styles.pickerBtn} onPress={openDatePicker}>
                <Ionicons name="calendar-outline" size={18} color={Colors.brandGreen} />
                <Text style={styles.pickerText}>{formatDateFull(eventDate)}</Text>
                <Ionicons name={showDatePicker ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.midGrey} />
              </TouchableOpacity>
              {showDatePicker && (
                <View style={styles.pickerCenter}>
                  <DateTimePicker value={eventDate} mode="date" display="inline" minimumDate={new Date()} onChange={onDateChange} style={{ backgroundColor: '#fff' }} />
                </View>
              )}
            </View>
            <View style={styles.sectionBar}><Text style={styles.sectionBarText}>Time</Text></View>
            <View style={styles.fieldPad}>
              <TouchableOpacity style={styles.pickerBtn} onPress={openTimePicker}>
                <Ionicons name="time-outline" size={18} color={Colors.brandGreen} />
                <Text style={styles.pickerText}>{formatTime(eventDate)}</Text>
                <Ionicons name={showTimePicker ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.midGrey} />
              </TouchableOpacity>
              {showTimePicker && (
                <View style={styles.pickerCenter}>
                  <DateTimePicker value={eventDate} mode="time" display="spinner" onChange={onTimeChange} style={{ backgroundColor: '#fff', width: 320 }} />
                </View>
              )}
            </View>
            <View style={styles.sectionBar}><Text style={styles.sectionBarText}>Location</Text></View>
            <View style={styles.fieldPad}>
              <TextInput style={styles.input2Line} placeholder="e.g. Paddington Park, cnr Given Tce & Latrobe St" placeholderTextColor={Colors.midGrey} value={location} onChangeText={setLocation} multiline numberOfLines={2} textAlignVertical="top" autoCapitalize="sentences" onFocus={() => { setShowDatePicker(false); setShowTimePicker(false); setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 300); }} />
            </View>
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
  profileAvatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#FFD700', justifyContent: 'center', alignItems: 'center' },
  profileAvatarText: { fontSize: 16, fontWeight: '800', color: Colors.brandGreen },
  pageHeader: { backgroundColor: Colors.brandGreenPale, paddingVertical: 10, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: Colors.lightGrey },
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
  modalBody: { flex: 1 },
  sectionBar: { backgroundColor: Colors.brandGreenPale, paddingVertical: 8, paddingHorizontal: 16, borderTopWidth: 1, borderBottomWidth: 1, borderColor: Colors.lightGrey },
  sectionBarText: { fontSize: 17, fontWeight: '700', color: Colors.brandGreen },
  fieldPad: { paddingHorizontal: 16, paddingVertical: 8 },
  input2Line: { borderWidth: 1, borderColor: Colors.lightGrey, borderRadius: 12, padding: 12, fontSize: 15, color: Colors.charcoal, height: 68, textAlignVertical: 'top' },
  pickerBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: Colors.lightGrey, borderRadius: 12, padding: 14 },
  pickerText: { flex: 1, fontSize: 15, color: Colors.charcoal },
  pickerCenter: { alignItems: 'center', marginTop: 8 },
  postBtnBottom: { backgroundColor: Colors.brandGreen, borderRadius: 16, paddingVertical: 14, alignItems: 'center' },
  postBtnBottomText: { fontSize: 20, fontWeight: '800', color: Colors.white },
});