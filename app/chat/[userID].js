import { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, FlatList, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { collection, query, where, orderBy, onSnapshot, addDoc, serverTimestamp, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../context/AuthContext';
import { Colors } from '../../constants/theme';

function formatTime(date) {
  if (!date) return '';
  const d = date.toDate ? date.toDate() : new Date(date);
  return d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });
}

function formatDate(date) {
  if (!date) return '';
  const d = date.toDate ? date.toDate() : new Date(date);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
}

export default function ChatScreen() {
  const { userId, userName } = useLocalSearchParams();
  const { user, profile } = useAuth();
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const flatListRef = useRef(null);

  // Conversation ID — always sorted so same convo regardless of who starts
  const conversationId = [user.uid, userId].sort().join('_');

  useEffect(() => {
    const q = query(
      collection(db, 'conversations', conversationId, 'messages'),
      orderBy('createdAt', 'asc')
    );
    const unsub = onSnapshot(q, (snap) => {
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    });
    return unsub;
  }, [conversationId]);

  const handleSend = async () => {
    if (!message.trim() || sending) return;
    const text = message.trim();
    setMessage('');
    setSending(true);
    try {
      // Create/update conversation metadata
      await setDoc(doc(db, 'conversations', conversationId), {
        participants: [user.uid, userId],
        participantNames: { [user.uid]: profile.displayName, [userId]: userName },
        lastMessage: text,
        lastMessageAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }, { merge: true });

      // Add message
      await addDoc(collection(db, 'conversations', conversationId, 'messages'), {
        text,
        senderId: user.uid,
        senderName: profile.displayName,
        createdAt: serverTimestamp(),
        read: false,
      });
    } catch (e) { console.error(e); }
    finally { setSending(false); }
  };

  const renderItem = ({ item, index }) => {
    const isMe = item.senderId === user.uid;
    const prevMsg = index > 0 ? messages[index - 1] : null;
    const showDate = !prevMsg || (
      item.createdAt && prevMsg.createdAt &&
      formatDate(item.createdAt) !== formatDate(prevMsg.createdAt)
    );

    return (
      <>
        {showDate && item.createdAt && (
          <Text style={styles.dateLabel}>{formatDate(item.createdAt)}</Text>
        )}
        <View style={[styles.msgRow, isMe && styles.msgRowMe]}>
          {!isMe && (
            <View style={styles.avatarSmall}>
              <Text style={styles.avatarSmallText}>{userName?.[0]?.toUpperCase()}</Text>
            </View>
          )}
          <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
            <Text style={[styles.bubbleText, isMe && styles.bubbleTextMe]}>{item.text}</Text>
            <Text style={[styles.bubbleTime, isMe && styles.bubbleTimeMe]}>
              {item.createdAt ? formatTime(item.createdAt) : ''}
            </Text>
          </View>
        </View>
      </>
    );
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={Colors.white} />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <View style={styles.headerAvatar}>
            <Text style={styles.headerAvatarText}>{userName?.[0]?.toUpperCase()}</Text>
          </View>
          <Text style={styles.headerName}>{userName}</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {/* Messages */}
      {loading ? (
        <ActivityIndicator color={Colors.brandGreen} style={{ marginTop: 40 }} size="large" />
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          renderItem={renderItem}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="chatbubbles-outline" size={48} color={Colors.lightGrey} />
              <Text style={styles.emptyText}>Say hi to {userName}!</Text>
              <Text style={styles.emptySubText}>Start a conversation</Text>
            </View>
          }
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
        />
      )}

      {/* Input */}
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder={`Message ${userName}...`}
          placeholderTextColor={Colors.midGrey}
          value={message}
          onChangeText={setMessage}
          multiline
          maxLength={500}
          autoCorrect={true}
          autoCapitalize="sentences"
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!message.trim() || sending) && styles.sendBtnDisabled]}
          onPress={handleSend}
          disabled={!message.trim() || sending}
        >
          {sending
            ? <ActivityIndicator color={Colors.white} size="small" />
            : <Ionicons name="send" size={20} color={Colors.brandGreen} />
          }
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.white },
  header: { backgroundColor: Colors.brandGreen, paddingTop: 56, paddingBottom: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  headerInfo: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, justifyContent: 'center' },
  headerAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#FFD700', justifyContent: 'center', alignItems: 'center' },
  headerAvatarText: { fontSize: 15, fontWeight: '800', color: Colors.brandGreen },
  headerName: { fontSize: 18, fontWeight: '800', color: Colors.white },
  list: { padding: 16, gap: 4, paddingBottom: 8 },
  dateLabel: { textAlign: 'center', fontSize: 12, color: Colors.midGrey, marginVertical: 12, fontWeight: '600' },
  msgRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginBottom: 4 },
  msgRowMe: { justifyContent: 'flex-end' },
  avatarSmall: { width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.brandGreenPale, justifyContent: 'center', alignItems: 'center', marginBottom: 2 },
  avatarSmallText: { fontSize: 12, fontWeight: '700', color: Colors.brandGreen },
  bubble: { maxWidth: '75%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10, gap: 2 },
  bubbleMe: { backgroundColor: Colors.brandGreen, borderBottomRightRadius: 4 },
  bubbleThem: { backgroundColor: Colors.white, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: Colors.lightGrey },
  bubbleText: { fontSize: 15, color: Colors.charcoal, lineHeight: 20 },
  bubbleTextMe: { color: Colors.white },
  bubbleTime: { fontSize: 10, color: Colors.midGrey, alignSelf: 'flex-end' },
  bubbleTimeMe: { color: 'rgba(255,255,255,0.7)' },
  empty: { alignItems: 'center', paddingTop: 80, gap: 10 },
  emptyText: { fontSize: 18, fontWeight: '700', color: Colors.charcoal },
  emptySubText: { fontSize: 14, color: Colors.midGrey },
  inputRow: { flexDirection: 'row', padding: 12, gap: 10, backgroundColor: Colors.brandGreen, alignItems: 'flex-end' },
  input: { flex: 1, backgroundColor: Colors.white, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, fontSize: 15, color: Colors.charcoal, maxHeight: 120 },
  sendBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#FFD700', justifyContent: 'center', alignItems: 'center' },
  sendBtnDisabled: { backgroundColor: '#FFD700', opacity: 0.5 },
});