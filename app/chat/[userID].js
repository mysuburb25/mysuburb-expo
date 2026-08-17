import { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, FlatList, KeyboardAvoidingView, Platform, ActivityIndicator, Alert, Modal, Image, ScrollView, Animated, Keyboard } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as VideoThumbnails from 'expo-video-thumbnails';
import * as Clipboard from 'expo-clipboard';
import * as MediaLibrary from 'expo-media-library';
// The legacy import path — the default 'expo-file-system' export now
// points to a newer File/Directory-class API that doesn't include
// downloadAsync at all, which is what the actual runtime error revealed
// ("downloadAsync is deprecated... import the legacy API from
// expo-file-system/legacy"). This is the specific fix that error message
// points to, not a guess.
import * as FileSystem from 'expo-file-system/legacy';
import { collection, query, orderBy, where, onSnapshot, addDoc, serverTimestamp, doc, getDoc, setDoc, updateDoc, writeBatch, increment, arrayRemove, arrayUnion } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../../config/firebase';
import { useAuth } from '../../context/AuthContext';
import { Colors } from '../../constants/theme';
import AppName from '../../components/AppName';
import useOnlineStatus from '../../utils/useOnlineStatus';
import MediaViewerModal from '../../components/MediaViewerModal';

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

// Normalizes a message's media into a single, consistent shape regardless
// of whether it's a legacy single-photo message (the old imageUrl field)
// or a newer grouped message (the media array). Every caller downstream —
// rendering, the viewer, the reply bar — only ever has to deal with one
// shape, rather than branching on which schema a given message happens
// to use.
function getItemMedia(item) {
  if (item.media && item.media.length > 0) return item.media;
  if (item.imageUrl) return [{ type: 'photo', url: item.imageUrl, thumbnailUrl: null }];
  return [];
}

const MAX_GRID_PREVIEW = 4; // how many thumbnails show before collapsing into a "+N" overlay

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
  const [replyingTo, setReplyingTo] = useState(null); // { messageId, text, senderName, imageUrl }
  const [actionSheetMessage, setActionSheetMessage] = useState(null); // the message item currently showing its long-press menu, or null
  const [actionSheetMediaIndex, setActionSheetMediaIndex] = useState(null); // which specific photo/video within actionSheetMessage.media was long-pressed, or null if the long-press wasn't on a specific item
  const [pendingMedia, setPendingMedia] = useState([]); // [{ kind: 'image'|'video', uri, thumbnailUri? }], staged but not yet sent
  const [viewerMedia, setViewerMedia] = useState(null); // full media array for the tapped message, or null when closed
  const [viewerIndex, setViewerIndex] = useState(0);
  const [viewerSourceMessage, setViewerSourceMessage] = useState(null); // the message the currently-open viewer's media belongs to, so long-pressing inside the viewer can still open the right action sheet
  const flatListRef = useRef(null);
  // iOS-only: KeyboardAvoidingView's built-in 'padding' behavior visibly
  // lagged a beat behind the keyboard's own animation (the keyboard would
  // finish rising before the composer caught up). Manually listening for
  // keyboardWillShow/keyboardWillHide and animating with the SAME duration
  // the OS reports keeps the composer moving in exact lockstep with the
  // keyboard instead of reacting to it after the fact. Android already
  // works correctly via KeyboardAvoidingView's 'height' behavior, so this
  // stays iOS-only to avoid touching what's already confirmed working.
  const keyboardHeight = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    const showSub = Keyboard.addListener('keyboardWillShow', (e) => {
      Animated.timing(keyboardHeight, {
        toValue: e.endCoordinates.height,
        duration: e.duration || 250,
        useNativeDriver: false,
      }).start();
    });
    const hideSub = Keyboard.addListener('keyboardWillHide', (e) => {
      Animated.timing(keyboardHeight, {
        toValue: 0,
        duration: e.duration || 250,
        useNativeDriver: false,
      }).start();
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

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
      } catch (e) {
        console.error(e);
        // Without this, a failed read here (e.g. a permission error while
        // route params are still settling right after navigation) leaves
        // clearedAt stuck at undefined forever — which blocks the messages
        // listener below from ever starting, which means loading never
        // turns off. The visible result is a spinner that never resolves
        // and, since the FlatList never mounts to fill the remaining
        // space, the composer ends up sitting awkwardly mid-screen instead
        // of anchored to the bottom. Falling back to null here guarantees
        // the rest of the screen can always finish loading regardless of
        // what happened with this specific fetch.
        setClearedAt(null);
      }
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
      // Messages the current user has "deleted for me" are filtered out
      // here rather than at query level (Firestore can't query "array
      // does NOT contain X" efficiently) — they still exist in Firestore
      // for the other participant, who never sees this filtering.
      const items = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(m => !(m.deletedFor || []).includes(user.uid));
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

  // Shared by both text and media sends — handles the conversation
  // metadata update, the message document itself, and the notification.
  // previewText is what shows in the conversation list (e.g. "You: hey"
  // vs "You: 📷 Photo"). `media` is an array of { type, url, thumbnailUrl }
  // — every photo/video sent together lands on ONE message document as
  // one array, rather than each becoming its own separate message.
  // replyToOverride lets a caller supply the reply-to data directly,
  // bypassing the replyingTo state entirely — used by the photo viewer's
  // own reply box, which sends immediately rather than staging through
  // the main composer. Reading replyingTo via setReplyingTo() followed
  // immediately by sendMessage() would risk using its stale pre-update
  // value, since React state updates aren't applied synchronously.
  const sendMessage = async ({ text, media, previewText, replyToOverride }) => {
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
    if (media && media.length > 0) messageData.media = media;
    const effectiveReplyTo = replyToOverride || replyingTo;
    if (effectiveReplyTo) {
      messageData.replyTo = {
        messageId: effectiveReplyTo.messageId,
        text: effectiveReplyTo.text,
        senderName: effectiveReplyTo.senderName,
        imageUrl: effectiveReplyTo.imageUrl || null,
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

  // Picking media only stages it (pendingMedia) — nothing sends
  // immediately. Everything staged becomes ONE message on Send, shown as
  // a stack/grid rather than separate bubbles, with any typed caption
  // attached to that same message.
  const MAX_PENDING_MEDIA = 8;
  const MAX_VIDEO_DURATION_SEC = 120;
  const MAX_VIDEO_SIZE_BYTES = 50 * 1024 * 1024;

  const handleSend = async () => {
    if ((!message.trim() && pendingMedia.length === 0) || sending || isBlocked) return;
    const text = message.trim();
    const mediaToSend = pendingMedia;
    setMessage('');
    setPendingMedia([]);
    setSending(true);
    try {
      if (mediaToSend.length === 0) {
        await sendMessage({ text, previewText: text });
      } else {
        // Every staged item uploads concurrently instead of one at a
        // time — this is what actually fixes the slow send. Previously
        // each photo waited for the previous one to fully finish before
        // starting, so sending N items took roughly N times as long as a
        // single upload. Running them in parallel means the total wait
        // is close to the time of the single slowest upload, not the sum
        // of all of them.
        const uploaded = await Promise.all(mediaToSend.map(async (item, i) => {
          const response = await fetch(item.uri);
          const blob = await response.blob();
          const ext = item.kind === 'video' ? 'mp4' : 'jpg';
          const fileName = `${Date.now()}_${i}.${ext}`;
          const storageRef = ref(storage, `chatMedia/${conversationId}/${fileName}`);
          await uploadBytes(storageRef, blob, item.kind === 'video' ? { contentType: blob.type || 'video/mp4' } : undefined);
          const url = await getDownloadURL(storageRef);

          let thumbnailUrl = null;
          if (item.kind === 'video' && item.thumbnailUri) {
            try {
              const thumbResponse = await fetch(item.thumbnailUri);
              const thumbBlob = await thumbResponse.blob();
              const thumbRef = ref(storage, `chatMedia/${conversationId}/thumb_${Date.now()}_${i}.jpg`);
              await uploadBytes(thumbRef, thumbBlob);
              thumbnailUrl = await getDownloadURL(thumbRef);
            } catch (e) {
              console.error('Chat video thumbnail upload failed:', e);
            }
          }

          return { type: item.kind === 'video' ? 'video' : 'photo', url, thumbnailUrl };
        }));

        const previewText = text || (
          mediaToSend.length > 1
            ? `\ud83d\udcf7 ${mediaToSend.length} items`
            : (mediaToSend[0].kind === 'video' ? '\ud83c\udfa5 Video' : '\ud83d\udcf7 Photo')
        );

        await sendMessage({
          text: text || undefined,
          media: uploaded,
          previewText,
        });
      }
    } catch (e) {
      console.error(e);
      setMessage(text);
      setPendingMedia(mediaToSend);
    } finally {
      setSending(false);
    }
  };

  // Single "Add Photo or Video" entry point — camera and library both
  // accept either media type in one go, matching the same pattern used
  // for event/post creation elsewhere in the app.
  const handlePickMedia = () => {
    if (pendingMedia.length >= MAX_PENDING_MEDIA || isBlocked) return;
    const remaining = MAX_PENDING_MEDIA - pendingMedia.length;
    Alert.alert('Add Photo or Video', 'Choose an option', [
      {
        text: 'Take Photo or Video',
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
          const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.All,
            quality: 0.7,
            allowsMultipleSelection: true,
            selectionLimit: remaining,
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
        Alert.alert('Video skipped', `That video is ${Math.round(durationSec)}s, which is over the ${MAX_VIDEO_DURATION_SEC}s limit, so it wasn't added.`);
        return;
      }
      if (asset.fileSize && asset.fileSize > MAX_VIDEO_SIZE_BYTES) {
        Alert.alert('Video skipped', `That video is ${(asset.fileSize / (1024 * 1024)).toFixed(1)}MB, which is over the ${MAX_VIDEO_SIZE_BYTES / (1024 * 1024)}MB limit, so it wasn't added.`);
        return;
      }
      let thumbnailUri = null;
      try {
        const thumb = await VideoThumbnails.getThumbnailAsync(asset.uri, { time: 0 });
        thumbnailUri = thumb.uri;
      } catch (e) {
        console.error('Video thumbnail generation failed:', e);
      }
      setPendingMedia(prev => [...prev, { kind: 'video', uri: asset.uri, thumbnailUri }]);
    } else {
      setPendingMedia(prev => [...prev, { kind: 'image', uri: asset.uri }]);
    }
  };

  const removePendingMedia = (index) => {
    setPendingMedia(prev => prev.filter((_, i) => i !== index));
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

  const handleLongPressMessage = (item, mediaIndex = null) => {
    if (item.unsent) return; // nothing to do on an already-unsent message
    Keyboard.dismiss();
    setActionSheetMessage(item);
    setActionSheetMediaIndex(mediaIndex);
  };

  // Single "Reply" — automatically replies to the exact photo/video that
  // was long-pressed if there was one (shown as that item's own
  // thumbnail, both while composing and once sent), or to the whole
  // message otherwise. This used to be two separate menu items (plain
  // "Reply" and "Reply to this Photo") shown together, which was
  // confusing since they looked like different actions when one was
  // really just a more specific version of the other.
  const handleReplyFromSheet = () => {
    const item = actionSheetMessage;
    const mediaIndex = actionSheetMediaIndex;
    setActionSheetMessage(null);
    setActionSheetMediaIndex(null);
    const itemMedia = getItemMedia(item);

    if (mediaIndex !== null) {
      const target = itemMedia[mediaIndex];
      if (target) {
        setReplyingTo({
          messageId: item.id,
          text: target.type === 'video' ? 'Video' : 'Photo',
          imageUrl: target.thumbnailUrl || target.url,
          senderName: item.senderId === user.uid ? 'You' : userName,
          mediaIndex,
        });
        return;
      }
    }

    setReplyingTo({
      messageId: item.id,
      text: item.text || (itemMedia.length > 1 ? `${itemMedia.length} items` : (itemMedia.length === 1 ? (itemMedia[0].type === 'video' ? 'Video' : 'Photo') : '')),
      imageUrl: itemMedia.length > 0 ? (itemMedia[0].thumbnailUrl || itemMedia[0].url) : null,
      senderName: item.senderId === user.uid ? 'You' : userName,
    });
  };

  const handleCopyTextFromSheet = async () => {
    const item = actionSheetMessage;
    setActionSheetMessage(null);
    setActionSheetMediaIndex(null);
    if (!item.text) return;
    try {
      await Clipboard.setStringAsync(item.text);
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Could not copy text.');
    }
  };

  // Downloads either the one specific photo/video that was long-pressed
  // (when actionSheetMediaIndex is set) or every item in the message
  // (when the long-press wasn't on any particular item — e.g. it landed
  // on a caption below a photo grid). Requires photo library write
  // permission, requested here rather than at app startup, since it's
  // only ever needed at the moment someone actually tries to download
  // something.
  // Shared by the action sheet's Download option and the full-screen
  // viewer's own download button — both just hand this a list of
  // { type, url } items and it handles permission, downloading, and
  // saving to the photo library the same way either time.
  const saveMediaToLibrary = async (targets) => {
    if (targets.length === 0 || !targets[0]) return;
    try {
      // writeOnly requests only save-to-library access, matching
      // NSPhotoLibraryAddUsageDescription — the correct, more reliable
      // permission for a save-only feature like this one, rather than
      // requesting full read+write library access we never actually need.
      const { status } = await MediaLibrary.requestPermissionsAsync(true);
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Please allow photo library access to save media.');
        return;
      }
      for (const t of targets) {
        const localUri = FileSystem.cacheDirectory + Date.now() + '_' + Math.random().toString(36).slice(2) + (t.type === 'video' ? '.mp4' : '.jpg');
        const { uri } = await FileSystem.downloadAsync(t.url, localUri);
        await MediaLibrary.saveToLibraryAsync(uri);
      }
      Alert.alert('Saved', targets.length > 1 ? `${targets.length} items saved to your photo library.` : 'Saved to your photo library.');
    } catch (e) {
      console.error(e);
      // Temporarily showing the actual error message rather than a
      // generic one — my last fix attempt (writeOnly permission) didn't
      // resolve this, so guessing again without more information isn't
      // the right move. This lets us see exactly what's failing.
      Alert.alert('Error', 'Could not save to your photo library. Please try again.');
    }
  };

  const handleDownloadFromSheet = () => {
    const item = actionSheetMessage;
    const mediaIndex = actionSheetMediaIndex;
    setActionSheetMessage(null);
    setActionSheetMediaIndex(null);
    const itemMedia = getItemMedia(item);
    const targets = mediaIndex !== null ? [itemMedia[mediaIndex]] : itemMedia;
    saveMediaToLibrary(targets);
  };

  // Hides the message from the current user's own view only — the other
  // participant keeps seeing it normally. The message document itself
  // isn't touched beyond adding this uid to deletedFor; the onSnapshot
  // listener above is what actually filters it out of what renders.
  const handleDeleteForMe = () => {
    const item = actionSheetMessage;
    setActionSheetMessage(null);
    Keyboard.dismiss();
    updateDoc(doc(db, 'conversations', conversationId, 'messages', item.id), {
      deletedFor: arrayUnion(user.uid),
    }).catch(e => {
      console.error(e);
      Alert.alert('Error', 'Could not delete this message. Please try again.');
    });
  };

  // Only ever offered to the sender (see the menu's own conditional
  // rendering below). Clears the message's actual content and marks it
  // unsent, rather than deleting the Firestore document outright — this
  // keeps a "This message was unsent" placeholder in both people's
  // conversation history instead of leaving a confusing silent gap.
  const handleUnsend = () => {
    const item = actionSheetMessage;
    setActionSheetMessage(null);
    Keyboard.dismiss();
    Alert.alert(
      'Unsend Message',
      'This will remove the message for both you and ' + userName + '. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unsend', style: 'destructive',
          onPress: () => {
            updateDoc(doc(db, 'conversations', conversationId, 'messages', item.id), {
              unsent: true,
              text: null,
              media: null,
              imageUrl: null,
              replyTo: null,
            }).catch(e => {
              console.error(e);
              Alert.alert('Error', 'Could not unsend this message. Please try again.');
            });
          },
        },
      ]
    );
  };

  // Reuses the same reports collection the rest of the app already
  // writes to (see report-problem.js) — pre-filled with the message's
  // own context rather than sending the person to a separate form, so
  // reporting something mid-conversation stays a single quick action.
  const handleReportUser = () => {
    setShowMenu(false);
    Alert.alert(
      `Report ${userName}?`,
      'Our moderation team will review this conversation. This is anonymous to ' + userName + '.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Report', style: 'destructive',
          onPress: async () => {
            try {
              await addDoc(collection(db, 'reports'), {
                category: 'User conduct',
                description: 'Reported from a conversation with ' + userName,
                userId: user?.uid || null,
                userEmail: profile?.email || user?.email || null,
                userDisplayName: profile?.displayName || null,
                reportedUserId: userId,
                reportedUserName: userName,
                conversationId,
                status: 'open',
                createdAt: serverTimestamp(),
              });
              Alert.alert('Reported', 'Thank you — our team will review this within 24 hours.');
            } catch (e) {
              console.error(e);
              Alert.alert('Error', 'Could not submit the report. Please try again.');
            }
          },
        },
      ]
    );
  };

  const openViewer = (itemMedia, index, sourceMessage) => {
    Keyboard.dismiss();
    setViewerMedia(itemMedia);
    setViewerIndex(index);
    setViewerSourceMessage(sourceMessage);
  };

  // Sends a reply directly from the viewer's own reply box — typed and
  // sent right there, rather than staging it through the main composer
  // the way the ordinary Reply option does. Closes the viewer immediately
  // on send so the person lands back in the conversation and sees their
  // reply arrive, same as sending any other message.
  const handleSendPhotoReply = async (text, targetItem, targetIndex) => {
    if (!text.trim() || !viewerSourceMessage) return;
    const trimmed = text.trim();
    const replyToOverride = {
      messageId: viewerSourceMessage.id,
      text: targetItem.type === 'video' ? 'Video' : 'Photo',
      senderName: viewerSourceMessage.senderId === user.uid ? 'You' : userName,
      imageUrl: targetItem.thumbnailUrl || targetItem.url,
    };
    setViewerMedia(null);
    setViewerSourceMessage(null);
    try {
      await sendMessage({ text: trimmed, previewText: trimmed, replyToOverride });
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Could not send reply. Please try again.');
    }
  };

  const renderItem = ({ item, index }) => {
    const isMe = item.senderId === user.uid;
    const prevMsg = index > 0 ? messages[index - 1] : null;
    const showDate = !prevMsg || (
      item.createdAt && prevMsg.createdAt &&
      formatDate(item.createdAt) !== formatDate(prevMsg.createdAt)
    );
    const itemMedia = getItemMedia(item);
    const hasMedia = itemMedia.length > 0;
    const isMediaOnly = hasMedia && !item.text;

    // An unsent message keeps its place in the conversation (rather than
    // vanishing, which would leave a confusing silent gap) but shows only
    // a neutral placeholder — no text, media, or reply preview, and it's
    // no longer interactive (no long-press menu, see handleLongPressMessage).
    if (item.unsent) {
      return (
        <>
          {showDate && item.createdAt && (
            <Text style={styles.dateLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{formatDate(item.createdAt)}</Text>
          )}
          <View style={[styles.msgRow, isMe && styles.msgRowMe]}>
            {!isMe && (
              <View style={styles.avatarSmall}>
                {otherUserPhotoURL ? (
                  <Image source={{ uri: otherUserPhotoURL }} style={styles.avatarSmallImage} />
                ) : (
                  <Text style={styles.avatarSmallText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{userName?.[0]?.toUpperCase()}</Text>
                )}
              </View>
            )}
            <View style={styles.bubbleUnsent}>
              <Ionicons name="ban-outline" size={14} color={Colors.midGrey} />
              <Text style={styles.bubbleUnsentText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>This message was unsent</Text>
            </View>
          </View>
        </>
      );
    }

    return (
      <>
        {showDate && item.createdAt && (
          <Text style={styles.dateLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{formatDate(item.createdAt)}</Text>
        )}
        <View style={[styles.msgRow, isMe && styles.msgRowMe]}>
          {!isMe && (
            <View style={styles.avatarSmall}>
              {otherUserPhotoURL ? (
                <Image source={{ uri: otherUserPhotoURL }} style={styles.avatarSmallImage} />
              ) : (
                <Text style={styles.avatarSmallText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{userName?.[0]?.toUpperCase()}</Text>
              )}
            </View>
          )}
          <TouchableOpacity
            activeOpacity={0.85}
            onLongPress={() => handleLongPressMessage(item)}
            style={[
              isMediaOnly ? styles.bubbleImageOnly : styles.bubble,
              !isMediaOnly && (isMe ? styles.bubbleMe : styles.bubbleThem),
              replyingTo?.messageId === item.id && styles.bubbleReplyHighlight,
            ]}
          >
            {item.replyTo && (
              <View style={[styles.replyQuote, isMe && styles.replyQuoteMe]}>
                {item.replyTo.imageUrl && (
                  <Image source={{ uri: item.replyTo.imageUrl }} style={styles.replyQuoteThumb} />
                )}
                <View style={{ flex: 1 }}>
                  <Text style={[styles.replyQuoteSender, isMe && styles.replyQuoteSenderMe]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{item.replyTo.senderName}</Text>
                  <Text style={[styles.replyQuoteText, isMe && styles.replyQuoteTextMe]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{item.replyTo.text}</Text>
                </View>
              </View>
            )}
            {hasMedia && itemMedia.length === 1 && (
              <TouchableOpacity onPress={() => openViewer(itemMedia, 0, item)} onLongPress={() => handleLongPressMessage(item, 0)}>
                <Image source={{ uri: itemMedia[0].thumbnailUrl || itemMedia[0].url }} style={styles.msgImage} />
                {itemMedia[0].type === 'video' && (
                  <View style={styles.videoPlayBadge} pointerEvents="none">
                    <Ionicons name="play" size={18} color="#fff" />
                  </View>
                )}
              </TouchableOpacity>
            )}
            {hasMedia && itemMedia.length > 1 && (
              <View style={styles.mediaGrid}>
                {itemMedia.slice(0, MAX_GRID_PREVIEW).map((m, i) => {
                  const isLastVisible = i === MAX_GRID_PREVIEW - 1 && itemMedia.length > MAX_GRID_PREVIEW;
                  return (
                    <TouchableOpacity key={i} onPress={() => openViewer(itemMedia, i, item)} onLongPress={() => handleLongPressMessage(item, i)} style={styles.mediaGridCell}>
                      <Image source={{ uri: m.thumbnailUrl || m.url }} style={styles.mediaGridImage} />
                      {m.type === 'video' && !isLastVisible && (
                        <View style={styles.videoPlayBadgeSmall} pointerEvents="none">
                          <Ionicons name="play" size={14} color="#fff" />
                        </View>
                      )}
                      {isLastVisible && (
                        <View style={styles.mediaGridMoreOverlay} pointerEvents="none">
                          <Text style={styles.mediaGridMoreText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>+{itemMedia.length - MAX_GRID_PREVIEW}</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
            {item.text ? renderMessageText(item.text, isMe, styles) : null}
            <Text
              style={[
                styles.bubbleTime,
                isMediaOnly ? styles.bubbleTimeImageOnly : (isMe && styles.bubbleTimeMe),
              ]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
            >
              {item.createdAt ? formatTime(item.createdAt) : ''}
            </Text>
          </TouchableOpacity>
        </View>
      </>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      // Reverted: setting behavior to undefined on Android was based on
      // an assumption that the OS's native window resize was already
      // active here — it wasn't, and the result was the composer getting
      // completely hidden behind the keyboard instead of just animating
      // slowly. 'height' is back, since a working-but-slightly-slow
      // composer beats a fully hidden one. The slow-animation complaint
      // is real but needs a different fix (e.g. confirming/adding
      // android.softwareKeyboardLayoutMode in app.json) rather than
      // removing KeyboardAvoidingView's own handling outright.
      behavior={Platform.OS === 'android' ? 'height' : undefined}
      // Reverted: keyboardVerticalOffset={insets.top} was an attempt to
      // fix the iOS composer lagging a beat behind the keyboard, but it
      // over-corrected and introduced a persistent visible gap between
      // the composer and the keyboard instead. A working screen with the
      // original timing lag beats a broken one with a gap — this needs a
      // different, more carefully tested approach before trying again.
    >
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
              <Text style={styles.bellBadgeText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
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
              <Text style={styles.headerAvatarText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{userName?.[0]?.toUpperCase()}</Text>
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
          keyboardDismissMode="on-drag"
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="chatbubbles-outline" size={48} color={Colors.lightGrey} />
              <Text style={styles.emptyText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>Say hi to {userName}!</Text>
              <Text style={styles.emptySubText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>Start a conversation</Text>
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
          {pendingMedia.length > 0 && (
            <View style={styles.pendingImageBar}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {pendingMedia.map((item, i) => (
                  <View key={i} style={styles.pendingImageThumbWrap}>
                    <Image source={{ uri: item.kind === 'video' ? (item.thumbnailUri || item.uri) : item.uri }} style={styles.pendingImageThumb} />
                    {item.kind === 'video' && (
                      <View style={styles.pendingVideoBadge} pointerEvents="none">
                        <Ionicons name="play" size={12} color="#fff" />
                      </View>
                    )}
                    <TouchableOpacity style={styles.pendingImageRemoveBtn} onPress={() => removePendingMedia(i)}>
                      <Ionicons name="close-circle" size={18} color="#E53935" />
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            </View>
          )}
          {/* paddingBottom includes the safe-area inset (on top of the
              base 12) so the send button and camera button always sit
              fully above any on-screen Android navigation bar — without
              this, the input row's own edge lands right at the screen
              boundary and can end up partially covered by the system
              nav bar, which is what made the send button look "overlaid". */}
          <View style={[styles.inputRow, { paddingBottom: 12 + insets.bottom }]}>
            <TouchableOpacity style={styles.imageBtn} onPress={handlePickMedia} disabled={pendingMedia.length >= MAX_PENDING_MEDIA}>
              <Ionicons name="camera-outline" size={24} color={pendingMedia.length >= MAX_PENDING_MEDIA ? Colors.lightGrey : Colors.brandGreen} />
            </TouchableOpacity>
            <TextInput
              style={styles.input}
              placeholder={pendingMedia.length > 0 ? 'Add a caption (optional)...' : `Message ${userName}...`}
              placeholderTextColor={Colors.midGrey}
              value={message}
              onChangeText={setMessage}
              multiline
              maxLength={500}
              autoCorrect={true}
              autoCapitalize="sentences"
            />
            <TouchableOpacity
              style={[styles.sendBtn, (!message.trim() && pendingMedia.length === 0 || sending) && styles.sendBtnDisabled]}
              onPress={handleSend}
              disabled={(!message.trim() && pendingMedia.length === 0) || sending}
            >
              {sending
                ? <ActivityIndicator color={Colors.white} size="small" />
                : <Ionicons name="send" size={20} color={Colors.brandGreen} />
              }
            </TouchableOpacity>
          </View>
        </>
      )}
      {/* Empty spacer sibling, not padding on the composer itself — its
          height grows to match the keyboard, which is what actually
          forces the FlatList above (flex: 1) to shrink and the composer
          to end up sitting right above the keyboard. Padding inside the
          composer's own wrapper only added invisible space below it
          without moving anything, which is why that first attempt did
          nothing visible at all. */}
      <Animated.View style={{ height: keyboardHeight }} />

      <MediaViewerModal
        media={viewerMedia}
        initialIndex={viewerIndex}
        onClose={() => { setViewerMedia(null); setViewerSourceMessage(null); }}
        onDownload={(item) => saveMediaToLibrary([item])}
        onSendReply={(text, item, index) => handleSendPhotoReply(text, item, index)}
      />

      {/* Long-press message action sheet — Reply, Report (only on the
          other person's messages), Unsend (only on your own), and Delete
          for me (always available, hides it from your view only). Same
          green-header "Select" pattern as the conversation's own 3-dot
          menu below, kept visually consistent across every action sheet
          in the app. */}
      <Modal visible={!!actionSheetMessage} transparent animationType="fade">
        <TouchableOpacity style={styles.menuOverlay} activeOpacity={1} onPress={() => { setActionSheetMessage(null); setActionSheetMediaIndex(null); }}>
          <View style={styles.menuSheet}>
            <View style={styles.menuHeaderBar}>
              <Text style={styles.menuHeaderText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>Select</Text>
            </View>
            <View style={[styles.menuPad, { paddingBottom: 32 + insets.bottom }]}>
              <TouchableOpacity style={styles.menuItem} onPress={handleReplyFromSheet}>
                <View style={styles.menuItemIcon}>
                  <Ionicons name="arrow-undo-outline" size={20} color={Colors.brandGreen} />
                </View>
                <Text style={styles.menuItemText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>Reply</Text>
              </TouchableOpacity>
              {!!actionSheetMessage?.text && (
                <TouchableOpacity style={styles.menuItem} onPress={handleCopyTextFromSheet}>
                  <View style={styles.menuItemIcon}>
                    <Ionicons name="copy-outline" size={20} color={Colors.brandGreen} />
                  </View>
                  <Text style={styles.menuItemText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>Copy Text</Text>
                </TouchableOpacity>
              )}
              {getItemMedia(actionSheetMessage || {}).length > 0 && (
                <TouchableOpacity style={styles.menuItem} onPress={handleDownloadFromSheet}>
                  <View style={styles.menuItemIcon}>
                    <Ionicons name="download-outline" size={20} color={Colors.brandGreen} />
                  </View>
                  <Text style={styles.menuItemText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
                    Download
                  </Text>
                </TouchableOpacity>
              )}
              {actionSheetMessage?.senderId === user.uid && (
                <TouchableOpacity style={styles.menuItem} onPress={handleUnsend}>
                  <View style={styles.menuItemIconDanger}>
                    <Ionicons name="close-circle-outline" size={20} color="#E53935" />
                  </View>
                  <Text style={styles.menuItemTextDanger} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>Unsend</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.menuItem} onPress={handleDeleteForMe}>
                <View style={styles.menuItemIconDanger}>
                  <Ionicons name="trash-outline" size={20} color="#E53935" />
                </View>
                <Text style={styles.menuItemTextDanger} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>Delete for Me</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.menuItem, styles.menuCancelBtn]} onPress={() => { setActionSheetMessage(null); setActionSheetMediaIndex(null); }}>
                <Text style={styles.menuCancelText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

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
              <TouchableOpacity style={styles.menuItem} onPress={handleReportUser}>
                <View style={styles.menuItemIconDanger}>
                  <Ionicons name="flag-outline" size={20} color="#E53935" />
                </View>
                <Text style={styles.menuItemTextDanger} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>Report User</Text>
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
  // Media-only messages skip the colored bubble background/padding
  // entirely — the photo/video shows edge-to-edge with just rounded
  // corners, rather than sitting inside a green/white frame like text
  // messages.
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
  // behind a media-only message the way bubbleTimeMe's white assumes.
  // marginRight pushes the text away from the bubble's rounded corner —
  // without it, the corner's curve (from overflow: hidden + borderRadius
  // on bubbleImageOnly) was visually clipping into the last character,
  // even though the text itself was never actually being told to shrink.
  bubbleTimeImageOnly: { color: Colors.midGrey, marginTop: 2, marginRight: 8 },
  bubbleTimeMe: { color: 'rgba(255,255,255,0.7)' },
  bubbleUnsent: { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '75%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: '#F0F0F0', borderWidth: 1, borderColor: Colors.lightGrey },
  bubbleUnsentText: { fontSize: 13, color: Colors.midGrey, fontStyle: 'italic' },
  empty: { alignItems: 'center', paddingTop: 80, gap: 10 },
  emptyText: { fontSize: 18, fontWeight: '700', color: Colors.charcoal },
  emptySubText: { fontSize: 14, color: Colors.midGrey },
  inputRow: { flexDirection: 'row', padding: 12, gap: 10, backgroundColor: Colors.brandGreen, alignItems: 'flex-end' },
  imageBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: Colors.white, justifyContent: 'center', alignItems: 'center' },
  input: { flex: 1, backgroundColor: Colors.white, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, fontSize: 15, color: Colors.charcoal, maxHeight: 120 },
  sendBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#FFD700', justifyContent: 'center', alignItems: 'center' },
  sendBtnDisabled: { backgroundColor: '#FFD700', opacity: 0.5 },
  // Reply quote shown inside a bubble, above the actual message content
  replyQuote: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FAFAFA', borderLeftWidth: 3, borderLeftColor: Colors.brandGreen, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 5, marginBottom: 6 },
  replyQuoteThumb: { width: 32, height: 32, borderRadius: 6 },
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
  pendingVideoBadge: {
    position: 'absolute', top: '50%', left: '50%', marginTop: -10, marginLeft: -10,
    width: 20, height: 20, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center', alignItems: 'center',
  },
  pendingImageRemoveBtn: { position: 'absolute', top: -6, right: -6, backgroundColor: Colors.white, borderRadius: 9 },
  replyBarSender: { fontSize: 12, fontWeight: '700', color: Colors.brandGreen },
  replyBarText: { fontSize: 12, color: Colors.midGrey, marginTop: 1 },
  // Single-image/video message + full-screen viewer
  msgImage: { width: 200, height: 200, borderRadius: 12, marginBottom: 4 },
  videoPlayBadge: {
    position: 'absolute', top: '50%', left: '50%', marginTop: -18, marginLeft: -18,
    width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center', alignItems: 'center',
  },
  // Multi-photo/video grid — 2 columns, up to 4 visible thumbnails, with
  // a "+N" overlay on the last one if there are more than 4 in total.
  mediaGrid: { width: 200, flexDirection: 'row', flexWrap: 'wrap', gap: 3, marginBottom: 4 },
  mediaGridCell: { width: 98.5, height: 98.5, borderRadius: 8, overflow: 'hidden', position: 'relative', backgroundColor: '#00000010' },
  mediaGridImage: { width: '100%', height: '100%' },
  videoPlayBadgeSmall: {
    position: 'absolute', top: '50%', left: '50%', marginTop: -14, marginLeft: -14,
    width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center', alignItems: 'center',
  },
  mediaGridMoreOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center' },
  mediaGridMoreText: { color: '#fff', fontSize: 20, fontWeight: '800' },

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