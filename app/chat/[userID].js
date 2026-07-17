import { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, FlatList, KeyboardAvoidingView, Platform, ActivityIndicator, Alert, Modal, Image } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, doc, getDoc, setDoc, writeBatch, increment, arrayRemove } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../../config/firebase';
import { useAuth } from '../../context/AuthContext';
import { Colors } from '../../constants/theme';
import AppName from '../../components/AppName';
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
  const { user, profile, blockUser, unblockUser } = useAuth();
  const isOtherUserOnline = useOnlineStatus(userId);
  const [resolvedUserName, setResolvedUserName] = useState(userNameParam || null);
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState(prefillText || '');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [theyBlockedMe, setTheyBlockedMe] = useState(false);
  const [replyingTo, setReplyingTo] = useState(null); // { messageId, text, senderName }
  const [uploadingImage, setUploadingImage] = useState(false);
  const [viewerImageUrl, setViewerImageUrl] = useState(null);
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

  // Shared by both text and image sends — handles the conversation
  // metadata update, the message document itself, and the notification.
  // previewText is what shows in the conversation list (e.g. "You: hey"
  // vs "You: 📷 Photo").
  const sendMessage = async ({ text, imageUrl, previewText }) => {
    await setDoc(doc(db, 'conversations', conversationId), {
      participants: [user.uid, userId],
      participantNames: { [user.uid]: profile.displayName, [userId]: userName },
      lastMessage: previewText,
      lastMessageSenderId: user.uid,
      lastMessageAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      unreadCount: { [userId]: increment(1) },
      // A new message means the conversation is active again for both
      // people — clears it from "deleted" for either side, so nobody's
      // left with a hidden conversation that actually has new activity.
      deletedBy: arrayRemove(user.uid, userId),
    }, { merge: true });

    const messageData = {
      senderId: user.uid,
      senderName: profile.displayName,
      createdAt: serverTimestamp(),
      read: false,
    };
    if (text) messageData.text = text;
    if (imageUrl) messageData.imageUrl = imageUrl;
    if (replyingTo) {
      messageData.replyTo = {
        messageId: replyingTo.messageId,
        text: replyingTo.text,
        senderName: replyingTo.senderName,
      };
    }

    await addDoc(collection(db, 'conversations', conversationId, 'messages'), messageData);
    setReplyingTo(null);

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
  };

  const handleSend = async () => {
    if (!message.trim() || sending || isBlocked) return;
    const text = message.trim();
    setMessage('');
    setSending(true);
    try {
      await sendMessage({ text, previewText: text });
    } catch (e) {
      console.error(e);
      setMessage(text);
    } finally {
      setSending(false);
    }
  };

  const handlePickImage = () => {
    if (uploadingImage || isBlocked) return;
    Alert.alert('Send Photo', 'Choose an option', [
      {
        text: 'Take Photo',
        onPress: async () => {
          const { status } = await ImagePicker.requestCameraPermissionsAsync();
          if (status !== 'granted') { Alert.alert('Permission needed', 'Please allow camera access.'); return; }
          const result = await ImagePicker.launchCameraAsync({ allowsEditing: true, quality: 0.7 });
          if (!result.canceled) uploadAndSendImage(result.assets[0].uri);
        },
      },
      {
        text: 'Choose from Library',
        onPress: async () => {
          const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (status !== 'granted') { Alert.alert('Permission needed', 'Please allow photo library access.'); return; }
          const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7 });
          if (!result.canceled) uploadAndSendImage(result.assets[0].uri);
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const uploadAndSendImage = async (uri) => {
    setUploadingImage(true);
    try {
      const response = await fetch(uri);
      const blob = await response.blob();
      const fileName = `${Date.now()}.jpg`;
      const storageRef = ref(storage, `chatImages/${conversationId}/${fileName}`);
      await uploadBytes(storageRef, blob);
      const imageUrl = await getDownloadURL(storageRef);
      await sendMessage({ imageUrl, previewText: '\ud83d\udcf7 Photo' });
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Could not send photo. Please try again.');
    } finally {
      setUploadingImage(false);
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
            try {
              if (iBlockedThem) {
                await unblockUser(userId);
              } else {
                await blockUser(userId, userName);
              }
            } catch (e) {
              Alert.alert('Error', 'Could not update block status. Please try again.');
            }
          }
        }
      ]
    );
  };

  const handleLongPressMessage = (item) => {
    setReplyingTo({
      messageId: item.id,
      text: item.text || (item.imageUrl ? 'Photo' : ''),
      senderName: item.senderId === user.uid ? 'You' : userName,
    });
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
          <TouchableOpacity
            activeOpacity={0.85}
            onLongPress={() => handleLongPressMessage(item)}
            style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}
          >
            {item.replyTo && (
              <View style={[styles.replyQuote, isMe && styles.replyQuoteMe]}>
                <Text style={[styles.replyQuoteSender, isMe && styles.replyQuoteSenderMe]} numberOfLines={1}>{item.replyTo.senderName}</Text>
                <Text style={[styles.replyQuoteText, isMe && styles.replyQuoteTextMe]} numberOfLines={1}>{item.replyTo.text}</Text>
              </View>
            )}
            {item.imageUrl && (
              <TouchableOpacity onPress={() => setViewerImageUrl(item.imageUrl)}>
                <Image source={{ uri: item.imageUrl }} style={styles.msgImage} />
              </TouchableOpacity>
            )}
            {item.text ? renderMessageText(item.text, isMe, styles) : null}
            <Text style={[styles.bubbleTime, isMe && styles.bubbleTimeMe]}>
              {item.createdAt ? formatTime(item.createdAt) : ''}
            </Text>
          </TouchableOpacity>
        </View>
      </>
    );
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.topHeader}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={Colors.white} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <AppName style={styles.mySuburb} />
          <Text style={styles.suburbName}>{profile?.suburb}, {profile?.state}</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>
      <View style={styles.header}>
        <View style={styles.headerInfo}>
          <View style={styles.headerAvatar}>
            <Text style={styles.headerAvatarText}>{userName?.[0]?.toUpperCase()}</Text>
            {isOtherUserOnline && <View style={styles.onlineDot} />}
          </View>
          <Text style={styles.headerName}>{userName}</Text>
        </View>
        <TouchableOpacity onPress={() => setShowMenu(true)} style={styles.menuBtn}>
          <Ionicons name="ellipsis-vertical" size={22} color={Colors.brandGreen} />
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
        <>
          {replyingTo && (
            <View style={styles.replyBar}>
              <View style={{ flex: 1 }}>
                <Text style={styles.replyBarSender}>Replying to {replyingTo.senderName}</Text>
                <Text style={styles.replyBarText} numberOfLines={1}>{replyingTo.text}</Text>
              </View>
              <TouchableOpacity onPress={() => setReplyingTo(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={18} color={Colors.midGrey} />
              </TouchableOpacity>
            </View>
          )}
          <View style={styles.inputRow}>
            <TouchableOpacity style={styles.imageBtn} onPress={handlePickImage} disabled={uploadingImage}>
              {uploadingImage
                ? <ActivityIndicator color={Colors.brandGreen} size="small" />
                : <Ionicons name="camera-outline" size={24} color={Colors.brandGreen} />
              }
            </TouchableOpacity>
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
        </>
      )}

      <Modal visible={!!viewerImageUrl} transparent animationType="fade">
        <TouchableOpacity style={styles.imageViewerOverlay} activeOpacity={1} onPress={() => setViewerImageUrl(null)}>
          <Image source={{ uri: viewerImageUrl }} style={styles.imageViewerImage} resizeMode="contain" />
          <TouchableOpacity style={styles.imageViewerCloseBtn} onPress={() => setViewerImageUrl(null)}>
            <Ionicons name="close" size={28} color={Colors.white} />
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

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
  topHeader: { backgroundColor: Colors.brandGreen, paddingTop: 56, paddingBottom: 16, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerCenter: { alignItems: 'center' },
  mySuburb: { fontSize: 27, fontWeight: '800', color: Colors.white },
  suburbName: { fontSize: 17, color: '#FFD700', marginTop: 4 },
  header: { backgroundColor: Colors.brandGreenPale, paddingVertical: 12, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: Colors.lightGrey },
  menuBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  backBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  headerInfo: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, justifyContent: 'center' },
  headerAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#FFD700', justifyContent: 'center', alignItems: 'center', position: 'relative' },
  onlineDot: { position: 'absolute', bottom: -1, right: -1, width: 12, height: 12, borderRadius: 6, backgroundColor: '#4CAF50', borderWidth: 2, borderColor: Colors.brandGreenPale },
  headerAvatarText: { fontSize: 15, fontWeight: '800', color: Colors.brandGreen },
  headerName: { fontSize: 18, fontWeight: '800', color: Colors.charcoal },
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
  imageBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: Colors.white, justifyContent: 'center', alignItems: 'center' },
  input: { flex: 1, backgroundColor: Colors.white, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, fontSize: 15, color: Colors.charcoal, maxHeight: 120 },
  sendBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#FFD700', justifyContent: 'center', alignItems: 'center' },
  sendBtnDisabled: { backgroundColor: '#FFD700', opacity: 0.5 },
  // Reply quote shown inside a bubble, above the actual message content
  replyQuote: { backgroundColor: '#FAFAFA', borderLeftWidth: 3, borderLeftColor: Colors.brandGreen, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 5, marginBottom: 6 },
  replyQuoteMe: { backgroundColor: 'rgba(255,255,255,0.15)', borderLeftColor: '#FFD700' },
  replyQuoteSender: { fontSize: 11, fontWeight: '700', color: Colors.brandGreen },
  replyQuoteSenderMe: { color: '#FFD700' },
  replyQuoteText: { fontSize: 12, color: Colors.midGrey },
  replyQuoteTextMe: { color: 'rgba(255,255,255,0.85)' },
  // Reply preview bar shown above the composer while replying
  replyBar: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.brandGreenPale, paddingHorizontal: 14, paddingVertical: 8, borderTopWidth: 1, borderTopColor: Colors.lightGrey },
  replyBarSender: { fontSize: 12, fontWeight: '700', color: Colors.brandGreen },
  replyBarText: { fontSize: 12, color: Colors.midGrey, marginTop: 1 },
  // Image message + full-screen viewer
  msgImage: { width: 200, height: 200, borderRadius: 12, marginBottom: 4 },
  imageViewerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', alignItems: 'center' },
  imageViewerImage: { width: '100%', height: '80%' },
  imageViewerCloseBtn: { position: 'absolute', top: 56, right: 20, padding: 8 },
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