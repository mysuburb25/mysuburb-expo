import { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, FlatList, KeyboardAvoidingView, Platform, ActivityIndicator, Alert, Modal } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, doc, getDoc, setDoc, writeBatch, increment } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../context/AuthContext';
import { Colors } from '../../constants/theme';
import useOnlineStatus from '../../utils/useOnlineStatus';

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

// Splits message text around any mysuburb://post/{id} deep links so they
// can render as real tappable text instead of inert plain text — since
// we're already inside the app, tapping navigates directly rather than
// going through the OS-level Linking API.
const DEEP_LINK_REGEX = /mysuburb:\/\/post\/([a-zA-Z0-9_-]+)/g;

function renderMessageText(text, isMe, styles) {
  const parts = [];
  let lastIndex = 0;
  let match;
  DEEP_LINK_REGEX.lastIndex = 0;
  while ((match = DEEP_LINK_REGEX.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', value: text.slice(lastIndex, match.index) });
    }
    parts.push({ type: 'link', value: match[0], postId: match[1] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push({ type: 'text', value: text.slice(lastIndex) });
  }
  if (parts.length === 0) return <Text style={[styles.bubbleText, isMe && styles.bubbleTextMe]}>{text}</Text>;

  return (
    <Text style={[styles.bubbleText, isMe && styles.bubbleTextMe]}>
      {parts.map((part, i) =>
        part.type === 'link' ? (
          <Text key={i} style={[styles.bubbleLink, isMe && styles.bubbleLinkMe]} onPress={() => router.push('/post/' + part.postId)}>
            {part.value}
          </Text>
        ) : (
          <Text key={i}>{part.value}</Text>
        )
      )}
    </Text>
  );
}

export default function ChatScreen() {
  const { userId, userName: userNameParam, prefillText } = useLocalSearchParams();
  const { user, profile, updateUserProfile } = useAuth();
  const isOtherUserOnline = useOnlineStatus(userId);
  const [resolvedUserName, setResolvedUserName] = useState(userNameParam || null);
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState(prefillText || '');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [theyBlockedMe, setTheyBlockedMe] = useState(false);
  const flatListRef = useRef(null);

  const userName = resolvedUserName || 'Neighbour';
  const iBlockedThem = profile?.blockedUsers?.some(b => b.uid === userId) || false;
  const isBlocked = iBlockedThem || theyBlockedMe;

  // Conversation ID — always sorted so same convo regardless of who starts
  const conversationId = [user.uid, userId].sort().join('_');

  // If the screen was opened without a userName param (e.g. a deep link),
  // look the recipient's name up directly so we never write `undefined`
  // into Firestore, which throws and silently breaks sending. Also checks
  // whether they've blocked us, since that's only knowable from their doc.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'users', userId));
        if (cancelled || !snap.exists()) return;
        if (!userNameParam) setResolvedUserName(snap.data().displayName || 'Neighbour');
        const theirBlocked = snap.data().blockedUsers || [];
        setTheyBlockedMe(theirBlocked.some(b => b.uid === user.uid));
      } catch (e) {
        console.error(e);
      }
    })();
    return () => { cancelled = true; };
  }, [userId, userNameParam, user.uid]);

  useEffect(() => {
    const q = query(
      collection(db, 'conversations', conversationId, 'messages'),
      orderBy('createdAt', 'asc')
    );
    const unsub = onSnapshot(q, (snap) => {
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setMessages(items);
      setLoading(false);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);

      const unreadFromThem = snap.docs.filter(d => !d.data().read && d.data().senderId !== user.uid);
      if (unreadFromThem.length > 0) {
        const batch = writeBatch(db);
        unreadFromThem.forEach(d => batch.update(doc(db, 'conversations', conversationId, 'messages', d.id), { read: true }));
        batch.commit().catch(e => console.error(e));
        setDoc(doc(db, 'conversations', conversationId), { unreadCount: { [user.uid]: 0 } }, { merge: true }).catch(e => console.error(e));
      }
    });
    return unsub;
  }, [conversationId, user.uid]);

  const handleSend = async () => {
    if (!message.trim() || sending || isBlocked) return;
    const text = message.trim();
    setMessage('');
    setSending(true);
    try {
      await setDoc(doc(db, 'conversations', conversationId), {
        participants: [user.uid, userId],
        participantNames: { [user.uid]: profile.displayName, [userId]: userName },
        lastMessage: text,
        lastMessageSenderId: user.uid,
        lastMessageAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        unreadCount: { [userId]: increment(1) },
      }, { merge: true });

      await addDoc(collection(db, 'conversations', conversationId, 'messages'), {
        text,
        senderId: user.uid,
        senderName: profile.displayName,
        createdAt: serverTimestamp(),
        read: false,
      });

      try {
        await addDoc(collection(db, 'notifications'), {
          userId: userId,
          type: 'message',
          message: `${profile.displayName} sent you a message`,
          fromUserId: user.uid,
          fromUserName: profile.displayName,
          conversationId,
          isRead: false,
          createdAt: serverTimestamp(),
        });
      } catch (e) { console.error('notification error:', e); }
    } catch (e) {
      console.error(e);
      setMessage(text);
    } finally {
      setSending(false);
    }
  };

  const handleToggleBlock = () => {
    setShowMenu(false);
    Alert.alert(
      iBlockedThem ? `Unblock ${userName}?` : `Block ${userName}?`,
      iBlockedThem
        ? 'They will be able to message you again, and their posts will reappear in your feed.'
        : "They won't be able to message you, and their posts will be hidden from your feed.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: iBlockedThem ? 'Unblock' : 'Block',
          style: iBlockedThem ? 'default' : 'destructive',
          onPress: async () => {
            const current = profile?.blockedUsers || [];
            const updated = iBlockedThem
              ? current.filter(b => b.uid !== userId)
              : [...current, { uid: userId, displayName: userName, blockedAt: new Date().toISOString() }];
            try {
              await updateUserProfile({ blockedUsers: updated });
            } catch (e) {
              Alert.alert('Error', 'Could not update block status. Please try again.');
            }
          }
        }
      ]
    );
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
            {renderMessageText(item.text, isMe, styles)}
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
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={Colors.white} />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <View style={styles.headerAvatar}>
            <Text style={styles.headerAvatarText}>{userName?.[0]?.toUpperCase()}</Text>
            {isOtherUserOnline && <View style={styles.onlineDot} />}
          </View>
          <Text style={styles.headerName}>{userName}</Text>
        </View>
        <TouchableOpacity onPress={() => setShowMenu(true)} style={styles.backBtn}>
          <Ionicons name="ellipsis-vertical" size={22} color={Colors.white} />
        </TouchableOpacity>
      </View>

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

      {isBlocked ? (
        <View style={styles.blockedBanner}>
          <Ionicons name="ban-outline" size={18} color={Colors.midGrey} />
          <Text style={styles.blockedBannerText}>
            {iBlockedThem ? 'You blocked this person.' : "You can't message this person right now."}
          </Text>
          {iBlockedThem && (
            <TouchableOpacity onPress={handleToggleBlock}>
              <Text style={styles.unblockLink}>Unblock</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
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
      )}

      <Modal visible={showMenu} transparent animationType="fade">
        <TouchableOpacity style={styles.menuOverlay} activeOpacity={1} onPress={() => setShowMenu(false)}>
          <View style={styles.menuSheet}>
            <View style={styles.menuHandle} />
            <TouchableOpacity style={styles.menuItem} onPress={handleToggleBlock}>
              <View style={styles.menuItemIcon}>
                <Ionicons name="ban-outline" size={20} color="#E53935" />
              </View>
              <Text style={styles.menuItemTextDanger}>{iBlockedThem ? `Unblock ${userName}` : `Block ${userName}`}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.menuItem, styles.menuCancelBtn]} onPress={() => setShowMenu(false)}>
              <Text style={styles.menuCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.white },
  header: { backgroundColor: Colors.brandGreen, paddingTop: 56, paddingBottom: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  headerInfo: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, justifyContent: 'center' },
  headerAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#FFD700', justifyContent: 'center', alignItems: 'center', position: 'relative' },
  onlineDot: { position: 'absolute', bottom: -1, right: -1, width: 12, height: 12, borderRadius: 6, backgroundColor: '#4CAF50', borderWidth: 2, borderColor: Colors.brandGreen },
  headerAvatarText: { fontSize: 15, fontWeight: '800', color: Colors.brandGreen },
  headerName: { fontSize: 18, fontWeight: '800', color: Colors.white },
  list: { padding: 16, gap: 4, paddingBottom: 8 },
  dateLabel: { textAlign: 'center', fontSize: 12, color: Colors.midGrey, marginVertical: 12, fontWeight: '600' },
  msgRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginBottom: 4 },
  msgRowMe: { justifyContent: 'flex-end' },
  avatarSmall: { width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.brandGreenPale, justifyContent: 'center', alignItems: 'center', marginBottom: 2 },
  avatarSmallText: { fontSize: 12, fontWeight: '700', color: Colors.brandGreen },
  bubble: { maxWidth: '75%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10, gap: 2, flexShrink: 1 },
  bubbleMe: { backgroundColor: Colors.brandGreen, borderBottomRightRadius: 4 },
  bubbleThem: { backgroundColor: Colors.white, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: Colors.lightGrey },
  bubbleText: { fontSize: 15, color: Colors.charcoal, lineHeight: 20, flexShrink: 1 },
  bubbleLink: { fontSize: 15, lineHeight: 20, color: '#0D47A1', textDecorationLine: 'underline', fontWeight: '600' },
  bubbleLinkMe: { color: '#FFD700' },
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
  blockedBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 16, backgroundColor: '#F5F5F5', borderTopWidth: 1, borderTopColor: Colors.lightGrey },
  blockedBannerText: { flex: 1, fontSize: 13, color: Colors.midGrey },
  unblockLink: { fontSize: 13, fontWeight: '700', color: Colors.brandGreen },
  menuOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  menuSheet: { backgroundColor: Colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16, paddingBottom: 32 },
  menuHandle: { width: 40, height: 4, backgroundColor: Colors.lightGrey, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, paddingHorizontal: 8, borderRadius: 12 },
  menuItemIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#FFF0F0', justifyContent: 'center', alignItems: 'center' },
  menuItemTextDanger: { fontSize: 16, fontWeight: '700', color: '#E53935' },
  menuCancelBtn: { backgroundColor: Colors.brandGreenPale, borderRadius: 14, justifyContent: 'center', marginTop: 8 },
  menuCancelText: { fontSize: 16, fontWeight: '700', color: Colors.brandGreen, textAlign: 'center', flex: 1 },
});