import { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, FlatList, KeyboardAvoidingView, Platform, ActivityIndicator, Alert, Modal, Image, ScrollView } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { collection, query, orderBy, where, onSnapshot, addDoc, serverTimestamp, doc, getDoc, setDoc, updateDoc, writeBatch, increment, arrayRemove, arrayUnion } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../../config/firebase';
import { useAuth } from '../../context/AuthContext';
import { Colors } from '../../constants/theme';
import AppName from '../../components/AppName';
import useOnlineStatus from '../../utils/useOnlineStatus';
import ImageViewerModal from '../../components/ImageViewerModal';

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
  const { user, profile, blockUser, unblockUser, unreadCount } = useAuth();
  const insets = useSafeAreaInsets();
  const isOtherUserOnline = useOnlineStatus(userId);
  const [resolvedUserName, setResolvedUserName] = useState(userNameParam || null);
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState(prefillText || '');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [theyBlockedMe, setTheyBlockedMe] = useState(false);
  const [otherUserPhotoURL, setOtherUserPhotoURL] = useState(null);
  const [replyingTo, setReplyingTo] = useState(null); // { messageId, text, senderName }
  const [pendingImages, setPendingImages] = useState([]); // local uris, staged but not yet sent
  const [viewerIndex, setViewerIndex] = useState(null); // index into chatImageUrls, or null when closed
  const flatListRef = useRef(null);

  const userName = resolvedUserName || 'Neighbour';
  const iBlockedThem = profile?.blockedUsers?.some(b => b.uid === userId) || false;
  const isBlocked = iBlockedThem || theyBlockedMe;

  // Conversation ID — always sorted so same convo regardless of who starts
  const conversationId = [user.uid, userId].sort().join('_');
  const [isConvoPinned, setIsConvoPinned] = useState(false);
  // undefined = not yet loaded, null = never cleared. Messages sent
  // before this timestamp are hidden from this user — this is what
  // actually enforces "delete conversation" regardless of how the
  // screen is reached (notification tap, profile "Message" button,
  // deep link, etc.), not just hiding it from the inbox list.
  const [clearedAt, setClearedAt] = useState(undefined);

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'conversations', conversationId));
        if (snap.exists()) {
          const data = snap.data();
          setIsConvoPinned((data.pinnedBy || []).includes(user.uid));
          setClearedAt(data.clearedAt?.[user.uid] || null);
        } else {
          setClearedAt(null);
        }
      } catch (e) { console.error(e); }
    })();
  }, [conversationId, user.uid]);

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
        setOtherUserPhotoURL(snap.data().photoURL || null);
      } catch (e) {
        console.error(e);
      }
    })();
    return () => { cancelled = true; };
  }, [userId, userNameParam, user.uid]);

  useEffect(() => {
    // Wait until we know whether this conversation was ever cleared —
    // otherwise we'd briefly show full history before cutting it down,
    // which defeats the point.
    if (clearedAt === undefined) return;

    const messagesRef = collection(db, 'conversations', conversationId, 'messages');
    const q = clearedAt
      ? query(messagesRef, orderBy('createdAt', 'asc'), where('createdAt', '>', clearedAt))
      : query(messagesRef, orderBy('createdAt', 'asc'));
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
  }, [conversationId, user.uid, clearedAt]);

  // Shared by both text and image sends — handles the conversation
  // metadata update, the message document itself, and the notification.
  // previewText is what shows in the conversation list (e.g. "You: hey"
  // vs "You: 📷 Photo").
  const sendMessage = async ({ text, imageUrl, previewText }) => {
    await setDoc(doc(db, 'conversations', conversationId), {
      participants: [user.uid, userId],
      participantNames: { [user.uid]: profile.displayName, [userId]: userName },
      participantPhotos: { [user.uid]: profile.photoURL || null, [userId]: otherUserPhotoURL || null },
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

  // Picking photos only stages them (pendingImages) — nothing sends
  // immediately. Each staged photo becomes its own message on Send (same
  // as how most chat apps handle a multi-photo batch), with any typed
  // caption attached to the last one rather than sent as a separate
  // bubble on its own.
  const MAX_PENDING_IMAGES = 5;

  const handleSend = async () => {
    if ((!message.trim() && pendingImages.length === 0) || sending || isBlocked) return;
    const text = message.trim();
    const imagesToSend = pendingImages;
    setMessage('');
    setPendingImages([]);
    setSending(true);
    try {
      if (imagesToSend.length === 0) {
        await sendMessage({ text, previewText: text });
      } else {
        for (let i = 0; i < imagesToSend.length; i++) {
          const response = await fetch(imagesToSend[i]);
          const blob = await response.blob();
          const fileName = `${Date.now()}_${i}.jpg`;
          const storageRef = ref(storage, `chatImages/${conversationId}/${fileName}`);
          await uploadBytes(storageRef, blob);
          const imageUrl = await getDownloadURL(storageRef);
          const isLast = i === imagesToSend.length - 1;
          const captionForThis = isLast ? text : '';
          await sendMessage({
            text: captionForThis || undefined,
            imageUrl,
            previewText: captionForThis || '\ud83d\udcf7 Photo',
          });
        }
      }
    } catch (e) {
      console.error(e);
      setMessage(text);
      setPendingImages(imagesToSend);
    } finally {
      setSending(false);
    }
  };

  const handlePickImage = () => {
    if (pendingImages.length >= MAX_PENDING_IMAGES || isBlocked) return;
    const remaining = MAX_PENDING_IMAGES - pendingImages.length;
    Alert.alert('Add Photo', 'Choose an option', [
      {
        text: 'Take Photo',
        onPress: async () => {
          const { status } = await ImagePicker.requestCameraPermissionsAsync();
          if (status !== 'granted') { Alert.alert('Permission needed', 'Please allow camera access.'); return; }
          const result = await ImagePicker.launchCameraAsync({ allowsEditing: true, quality: 0.7 });
          if (!result.canceled) setPendingImages(prev => [...prev, result.assets[0].uri]);
        },
      },
      {
        text: 'Choose from Library',
        onPress: async () => {
          const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (status !== 'granted') { Alert.alert('Permission needed', 'Please allow photo library access.'); return; }
          const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality: 0.7,
            allowsMultipleSelection: true,
            selectionLimit: remaining,
          });
          if (!result.canceled) {
            const newUris = result.assets.slice(0, remaining).map(a => a.uri);
            setPendingImages(prev => [...prev, ...newUris]);
          }
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const removePendingImage = (index) => {
    setPendingImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleTogglePin = () => {
    setShowMenu(false);
    updateDoc(doc(db, 'conversations', conversationId), {
      pinnedBy: isConvoPinned ? arrayRemove(user.uid) : arrayUnion(user.uid),
    }).then(() => setIsConvoPinned(!isConvoPinned)).catch(e => console.error(e));
  };

  const handleDeleteConversation = () => {
    setShowMenu(false);
    Alert.alert(
      'Delete Conversation',
      `This removes the conversation with ${userName} from your list. It comes back if either of you sends a new message.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            try {
              await updateDoc(doc(db, 'conversations', conversationId), {
                deletedBy: arrayUnion(user.uid),
                [`clearedAt.${user.uid}`]: serverTimestamp(),
              });
              router.back();
            } catch (e) { console.error(e); }
          },
        },
      ]
    );
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
      imageUrl: item.imageUrl || null,
      senderName: item.senderId === user.uid ? 'You' : userName,
    });
  };

  // Every photo shared in this conversation, in the same order they
  // appear in the message list — lets the viewer swipe through all of
  // them starting from whichever one was tapped, rather than only
  // showing that single image with no way to browse the rest.
  const chatImageUrls = messages.filter(m => m.imageUrl).map(m => m.imageUrl);

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
              {otherUserPhotoURL ? (
                <Image source={{ uri: otherUserPhotoURL }} style={styles.avatarSmallImage} />
              ) : (
                <Text style={styles.avatarSmallText}>{userName?.[0]?.toUpperCase()}</Text>
              )}
            </View>
          )}
          <TouchableOpacity
            activeOpacity={0.85}
            onLongPress={() => handleLongPressMessage(item)}
            style={[
              (item.imageUrl && !item.text) ? styles.bubbleImageOnly : styles.bubble,
              !(item.imageUrl && !item.text) && (isMe ? styles.bubbleMe : styles.bubbleThem),
              replyingTo?.messageId === item.id && styles.bubbleReplyHighlight,
            ]}
          >
            {item.replyTo && (
              <View style={[styles.replyQuote, isMe && styles.replyQuoteMe]}>
                <Text style={[styles.replyQuoteSender, isMe && styles.replyQuoteSenderMe]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{item.replyTo.senderName}</Text>
                <Text style={[styles.replyQuoteText, isMe && styles.replyQuoteTextMe]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{item.replyTo.text}</Text>
              </View>
            )}
            {item.imageUrl && (
              <TouchableOpacity onPress={() => setViewerIndex(chatImageUrls.indexOf(item.imageUrl))}>
                <Image source={{ uri: item.imageUrl }} style={styles.msgImage} />
              </TouchableOpacity>
            )}
            {item.text ? renderMessageText(item.text, isMe, styles) : null}
            <Text style={[
              styles.bubbleTime,
              (item.imageUrl && !item.text) ? styles.bubbleTimeImageOnly : (isMe && styles.bubbleTimeMe),
            ]}>
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
          <Text style={styles.suburbName} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{profile?.suburb}, {profile?.state}</Text>
        </View>
        <TouchableOpacity onPress={() => router.push('/(tabs)/notifications')} style={{ position: 'relative', width: 40, alignItems: 'flex-end' }}>
          <Ionicons name="notifications-outline" size={26} color={Colors.white} />
          {unreadCount > 0 && (
            <View style={styles.bellBadge}>
              <Text style={styles.bellBadgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>
      <View style={styles.header}>
        <View style={styles.headerInfo}>
          <View style={styles.headerAvatar}>
            {otherUserPhotoURL ? (
              <Image source={{ uri: otherUserPhotoURL }} style={styles.headerAvatarImage} />
            ) : (
              <Text style={styles.headerAvatarText}>{userName?.[0]?.toUpperCase()}</Text>
            )}
            {isOtherUserOnline && <View style={styles.onlineDot} />}
          </View>
          <Text style={styles.headerName} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{userName}</Text>
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
          extraData={replyingTo}
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
        <View style={[styles.blockedBanner, { paddingBottom: 16 + insets.bottom }]}>
          <Ionicons name="ban-outline" size={18} color={Colors.midGrey} />
          <Text style={styles.blockedBannerText}>
            {iBlockedThem ? 'You blocked this person.' : "You can't message this person right now."}
          </Text>
          {iBlockedThem && (
            <TouchableOpacity onPress={handleToggleBlock}>
              <Text style={styles.unblockLink} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>Unblock</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <>
          {replyingTo && (
            <View style={styles.replyBar}>
              <View style={styles.replyBarAccent} />
              {replyingTo.imageUrl && (
                <Image source={{ uri: replyingTo.imageUrl }} style={styles.replyBarThumb} />
              )}
              <View style={{ flex: 1 }}>
                <View style={styles.replyBarHeader}>
                  <Ionicons name="arrow-undo" size={13} color={Colors.brandGreen} />
                  <Text style={styles.replyBarSender} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{replyingTo.senderName}</Text>
                </View>
                <Text style={styles.replyBarText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{replyingTo.text}</Text>
              </View>
              <TouchableOpacity onPress={() => setReplyingTo(null)} style={styles.replyBarCloseBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={15} color={Colors.white} />
              </TouchableOpacity>
            </View>
          )}
          {pendingImages.length > 0 && (
            <View style={styles.pendingImageBar}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {pendingImages.map((uri, i) => (
                  <View key={i} style={styles.pendingImageThumbWrap}>
                    <Image source={{ uri }} style={styles.pendingImageThumb} />
                    <TouchableOpacity style={styles.pendingImageRemoveBtn} onPress={() => removePendingImage(i)}>
                      <Ionicons name="close-circle" size={18} color="#E53935" />
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
              <Text style={styles.pendingImageCount}>{pendingImages.length}</Text>
            </View>
          )}
          {/* paddingBottom includes the safe-area inset (on top of the
              base 12) so the send button and camera button always sit
              fully above any on-screen Android navigation bar — without
              this, the input row's own edge lands right at the screen
              boundary and can end up partially covered by the system
              nav bar, which is what made the send button look "overlaid". */}
          <View style={[styles.inputRow, { paddingBottom: 12 + insets.bottom }]}>
            <TouchableOpacity style={styles.imageBtn} onPress={handlePickImage} disabled={pendingImages.length >= MAX_PENDING_IMAGES}>
              <Ionicons name="camera-outline" size={24} color={pendingImages.length >= MAX_PENDING_IMAGES ? Colors.lightGrey : Colors.brandGreen} />
            </TouchableOpacity>
            <TextInput
              style={styles.input}
              placeholder={pendingImages.length > 0 ? 'Add a caption (optional)...' : `Message ${userName}...`}
              placeholderTextColor={Colors.midGrey}
              value={message}
              onChangeText={setMessage}
              multiline
              maxLength={500}
              autoCorrect={true}
              autoCapitalize="sentences"
            />
            <TouchableOpacity
              style={[styles.sendBtn, (!message.trim() && pendingImages.length === 0 || sending) && styles.sendBtnDisabled]}
              onPress={handleSend}
              disabled={(!message.trim() && pendingImages.length === 0) || sending}
            >
              {sending
                ? <ActivityIndicator color={Colors.white} size="small" />
                : <Ionicons name="send" size={20} color={Colors.brandGreen} />
              }
            </TouchableOpacity>
          </View>
        </>
      )}

      <ImageViewerModal
        images={viewerIndex !== null ? chatImageUrls : null}
        initialIndex={viewerIndex ?? 0}
        onClose={() => setViewerIndex(null)}
      />

      <Modal visible={showMenu} transparent animationType="fade">
        <TouchableOpacity style={styles.menuOverlay} activeOpacity={1} onPress={() => setShowMenu(false)}>
          <View style={styles.menuSheet}>
            <View style={styles.menuHeaderBar}>
              <Text style={styles.menuHeaderText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>Select</Text>
            </View>
            <View style={[styles.menuPad, { paddingBottom: 32 + insets.bottom }]}>
              <TouchableOpacity style={styles.menuItem} onPress={handleTogglePin}>
                <View style={styles.menuItemIcon}>
                  <Ionicons name={isConvoPinned ? 'bookmark' : 'bookmark-outline'} size={20} color={Colors.brandGreen} />
                </View>
                <Text style={styles.menuItemText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{isConvoPinned ? 'Unpin' : 'Pin'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.menuItem} onPress={handleToggleBlock}>
                <View style={styles.menuItemIconDanger}>
                  <Ionicons name="ban-outline" size={20} color="#E53935" />
                </View>
                <Text style={styles.menuItemTextDanger} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{iBlockedThem ? 'Unblock' : 'Block'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.menuItem} onPress={handleDeleteConversation}>
                <View style={styles.menuItemIconDanger}>
                  <Ionicons name="trash-outline" size={20} color="#E53935" />
                </View>
                <Text style={styles.menuItemTextDanger} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>Delete</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.menuItem, styles.menuCancelBtn]} onPress={() => setShowMenu(false)}>
                <Text style={styles.menuCancelText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>Cancel</Text>
              </TouchableOpacity>
            </View>
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
  bellBadge: { position: 'absolute', top: -4, right: -4, backgroundColor: '#E53935', borderRadius: 8, minWidth: 16, height: 16, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 3 },
  bellBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  headerInfo: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, justifyContent: 'center' },
  headerAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#FFD700', justifyContent: 'center', alignItems: 'center', position: 'relative' },
  headerAvatarImage: { width: 36, height: 36, borderRadius: 18 },
  onlineDot: { position: 'absolute', bottom: -1, right: -1, width: 12, height: 12, borderRadius: 6, backgroundColor: '#4CAF50', borderWidth: 2, borderColor: Colors.brandGreenPale },
  headerAvatarText: { fontSize: 15, fontWeight: '800', color: Colors.brandGreen },
  headerName: { fontSize: 18, fontWeight: '800', color: Colors.charcoal },
  list: { padding: 16, gap: 4, paddingBottom: 8 },
  dateLabel: { textAlign: 'center', fontSize: 12, color: Colors.midGrey, marginVertical: 12, fontWeight: '600' },
  msgRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginBottom: 4 },
  msgRowMe: { justifyContent: 'flex-end' },
  avatarSmall: { width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.brandGreenPale, justifyContent: 'center', alignItems: 'center', marginBottom: 2 },
  avatarSmallImage: { width: 28, height: 28, borderRadius: 14 },
  avatarSmallText: { fontSize: 12, fontWeight: '700', color: Colors.brandGreen },
  bubble: { maxWidth: '75%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10, gap: 2, flexShrink: 1 },
  // Image-only messages skip the colored bubble background/padding
  // entirely — the photo shows edge-to-edge with just rounded corners,
  // rather than sitting inside a green/white frame like text messages.
  bubbleImageOnly: { maxWidth: '75%', borderRadius: 18, overflow: 'hidden', backgroundColor: 'transparent', gap: 2, flexShrink: 1 },
  // Light yellow highlight on whichever bubble is currently selected as
  // the reply target — overrides both bubbleMe (green) and bubbleThem
  // (white) backgrounds so it's clearly visible regardless of sender.
  bubbleReplyHighlight: { backgroundColor: '#FFF9C4', borderWidth: 1.5, borderColor: '#FFD700' },
  bubbleMe: { backgroundColor: Colors.brandGreen, borderBottomRightRadius: 4 },
  bubbleThem: { backgroundColor: Colors.white, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: Colors.lightGrey },
  bubbleText: { fontSize: 15, color: Colors.charcoal, lineHeight: 20, flexShrink: 1 },
  bubbleLink: { fontSize: 15, lineHeight: 20, color: '#0D47A1', textDecorationLine: 'underline', fontWeight: '600' },
  bubbleLinkMe: { color: '#FFD700' },
  bubbleTextMe: { color: Colors.white },
  bubbleTime: { fontSize: 10, color: Colors.midGrey, alignSelf: 'flex-end' },
  // Neutral grey regardless of sender, since there's no colored backdrop
  // behind an image-only message the way bubbleTimeMe's white assumes.
  bubbleTimeImageOnly: { color: Colors.midGrey, marginTop: 2 },
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
  replyBar: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.white, paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: Colors.lightGrey, shadowColor: '#000', shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 3 },
  replyBarAccent: { width: 4, alignSelf: 'stretch', borderRadius: 2, backgroundColor: Colors.brandGreen },
  replyBarThumb: { width: 38, height: 38, borderRadius: 8 },
  replyBarHeader: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 2 },
  replyBarCloseBtn: { width: 24, height: 24, borderRadius: 12, backgroundColor: Colors.midGrey, justifyContent: 'center', alignItems: 'center' },
  pendingImageBar: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.brandGreenPale, paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1, borderTopColor: Colors.lightGrey },
  pendingImageThumbWrap: { position: 'relative' },
  pendingImageThumb: { width: 52, height: 52, borderRadius: 10 },
  pendingImageRemoveBtn: { position: 'absolute', top: -6, right: -6, backgroundColor: Colors.white, borderRadius: 9 },
  pendingImageCount: { fontSize: 13, fontWeight: '800', color: Colors.brandGreen, minWidth: 20, textAlign: 'center' },
  replyBarSender: { fontSize: 12, fontWeight: '700', color: Colors.brandGreen },
  replyBarText: { fontSize: 12, color: Colors.midGrey, marginTop: 1 },
  // Image message + full-screen viewer
  msgImage: { width: 200, height: 200, borderRadius: 12, marginBottom: 4 },

  blockedBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 16, backgroundColor: '#F5F5F5', borderTopWidth: 1, borderTopColor: Colors.lightGrey },
  blockedBannerText: { flex: 1, fontSize: 13, color: Colors.midGrey },
  unblockLink: { fontSize: 13, fontWeight: '700', color: Colors.brandGreen },
  // Matches the same "green header + Select" menu pattern used on the
  // post detail screen and the Messages list's long-press action sheet.
  menuOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  menuSheet: { backgroundColor: Colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden' },
  menuHeaderBar: { backgroundColor: Colors.brandGreen, paddingTop: 14, paddingBottom: 16, paddingHorizontal: 20, alignItems: 'center' },
  menuHeaderText: { fontSize: 18, fontWeight: '800', color: Colors.white },
  menuPad: { padding: 16, paddingBottom: 32 },
  menuItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', gap: 14, paddingVertical: 9, paddingHorizontal: 14, borderRadius: 14, backgroundColor: '#FAFAFA', borderWidth: 1.5, borderColor: '#EFEFEF', marginBottom: 8 },
  menuItemIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.brandGreenPale, justifyContent: 'center', alignItems: 'center' },
  menuItemIconDanger: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#FFF0F0', justifyContent: 'center', alignItems: 'center' },
  menuItemText: { fontSize: 16, fontWeight: '700', color: Colors.charcoal },
  menuItemTextDanger: { fontSize: 16, fontWeight: '700', color: '#E53935' },
  menuCancelBtn: { backgroundColor: Colors.brandGreenPale, borderRadius: 14, justifyContent: 'center', marginTop: 8, borderWidth: 0 },
  menuCancelText: { fontSize: 16, fontWeight: '700', color: Colors.brandGreen, textAlign: 'center', flex: 1 },
});