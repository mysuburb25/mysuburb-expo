import { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, FlatList, Modal, Image, Keyboard, Linking, Share } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { doc, getDoc, collection, query, where, orderBy, getDocs, addDoc, serverTimestamp, updateDoc, increment, arrayUnion } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../context/AuthContext';
import { Colors } from '../../constants/theme';
import AppName from '../../components/AppName';
import AvatarWithOnlineDot from '../../components/AvatarWithOnlineDot';
import MediaViewerModal from '../../components/MediaViewerModal';
import LinkifiedText from '../../components/LinkifiedText';
import MentionInput from '../../components/MentionInput';
import { renderTextWithMentions } from '../../utils/renderTextWithMentions';
import AsyncStorage from '@react-native-async-storage/async-storage';
import addEventToCalendar from '../../utils/addEventToCalendar';
import { useVideoPlayer, VideoView } from 'expo-video';
import { getOrderedMedia } from '../../utils/mediaOrder';

const REPORT_REASONS = [
  'Spam or scam',
  'Harassment or bullying',
  'Inappropriate content',
  'False or misleading information',
  'Other',
];

function timeAgo(date) {
  if (!date) return '';
  const d = date.toDate ? date.toDate() : new Date(date);
  const seconds = Math.floor((new Date() - d) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago';
  if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago';
  return Math.floor(seconds / 86400) + 'd ago';
}

function formatDateTime(date) {
  if (!date) return '';
  const d = date.toDate ? date.toDate() : new Date(date);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const time = d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === today.toDateString()) return 'Today · ' + time;
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday · ' + time;
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) + ' · ' + time;
}

// Turns a flat comments array into a depth-first ordered list with a `depth`
// property, so replies can nest under any comment (not just top-level ones)
// while still rendering in a single flat FlatList.
function flattenCommentTree(comments) {
  const byParent = {};
  comments.forEach(c => {
    const key = c.parentCommentId || 'root';
    if (!byParent[key]) byParent[key] = [];
    byParent[key].push(c);
  });
  const result = [];
  const walk = (parentKey, depth) => {
    (byParent[parentKey] || []).forEach(c => {
      result.push({ ...c, depth });
      walk(c.id, depth + 1);
    });
  };
  walk('root', 0);
  return result;
}

const PAGE_TITLES = {
  updates: 'Community Hub', notices: 'Community Hub', safety: 'Community Hub',
  events: 'Events', marketplace: 'Buy & Sell', lostfound: 'Lost & Found', services: 'Services',
};

const CATEGORY_LABELS = {
  updates: 'General', notices: 'Notice', safety: 'Alert',
  events: 'Event', marketplace: 'Buy & Sell', services: 'Service',
};

// Post detail shows the SPECIFIC marketplace type (matching the Buy & Sell
// tab card) rather than the generic "Buy & Sell" category label.
const MARKETPLACE_TYPE_CONFIG = {
  forsale:  { label: 'For Sale',  bg: Colors.brandGreen },
  giveaway: { label: 'Give Away', bg: '#1565C0' },
  seeking:  { label: 'Seeking',   bg: '#6A1B9A' },
};

const CATEGORY_ACCENT = {
  updates: Colors.brandGreen, notices: '#0D47A1', safety: '#E65100',
  events: '#6A1B9A', marketplace: Colors.brandGreen, lostfound: '#E65100', services: Colors.brandGreen,
};

const SERVICE_LABELS = {
  plumbing: 'Plumbing', painting: 'Painting', electrical: 'Electrical', handyman: 'Handyman',
  massage: 'Massage', physio: 'Physiotherapy', carpentry: 'Carpentry', cleaning: 'Cleaning',
  gardening: 'Gardening', petcare: 'Pet Care', childcare: 'Child & Aged Care', tutoring: 'Tutoring', others: 'Others',
};

// Matches services.js's own TABS labels — combined with SERVICE_LABELS
// below so a service post shows 'I Offer · Tutoring' as one label,
// instead of a generic 'Service' pill and a separate 'Tutoring' badge
// that used to sit on different lines with no visual connection.
const SERVICE_TAB_LABELS = { offering: 'I Offer', looking: 'I Need' };

// One generic "Closed" status across Buy & Sell and Lost & Found, rather
// than type-specific wording (SOLD/TAKEN/FOUND/RETURNED/etc.) — simpler,
// and avoids any two categories ever landing on the same word for
// different meanings. Marketplace uses the isSold field underneath;
// Lost & Found uses a separate isResolved field — see firestore.rules.
function getStatusLabels() {
  return { action: 'Mark as Closed', undo: 'Reopen Post', badge: 'Closed' };
}

// True when a post has been closed, regardless of category/field name.
function isPostClosed(post) {
  return post.category === 'lostfound' ? !!post.isResolved : !!post.isSold;
}

// One player instance per video — useVideoPlayer is a hook, so it can't
// be called inside a .map() loop directly, hence this being its own
// component. Doesn't autoplay: starts paused, person taps the native
// controls to play, same as tapping "play" on any other video app —
// nobody's mobile data gets used for a video they didn't ask to watch.
//
// The expand button opens the app's own unified MediaViewerModal (big
// mode) at this video's position, rather than the native OS-level
// fullscreen — that keeps it consistent with photos, letting someone
// swipe through every photo and video in the post, in posted order,
// from one unified full-screen viewer instead of two separate systems.
function PostVideoPlayer({ url, onExpand }) {
  const videoViewRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const player = useVideoPlayer(url, (p) => {
    p.loop = false;
  });

  // Same reasoning as the feed card's version — the play-button overlay
  // only shows while paused/not-yet-started, so a video is visually
  // distinguishable from a photo at a glance, and disappears once
  // someone actually starts watching.
  useEffect(() => {
    const sub = player.addListener('playingChange', (event) => {
      setIsPlaying(event.isPlaying);
    });
    return () => sub.remove();
  }, [player]);

  return (
    <View>
      <VideoView
        ref={videoViewRef}
        style={styles.postVideo}
        player={player}
        nativeControls
        allowsFullscreen
        contentFit="cover"
      />
      {!isPlaying && (
        <View style={styles.postVideoPlayOverlay} pointerEvents="none">
          <Ionicons name="play-circle" size={54} color="rgba(255,255,255,0.92)" />
        </View>
      )}
      {/* Custom expand-to-app-viewer button removed — expo-video's own
          native fullscreen control (top-left, enabled via allowsFullscreen
          below) already covers this and works correctly, unlike the app's
          MediaViewerModal which has a separate playback bug. */}
    </View>
  );
}

export default function PostDetailScreen() {
  const { id } = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const { user, profile, updateUserProfile, blockUser } = useAuth();
  const [post, setPost] = useState(null);
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [comment, setComment] = useState('');
  const [commentMentions, setCommentMentions] = useState([]);
  const [posting, setPosting] = useState(false);
  const [liked, setLiked] = useState(false);
  const [liking, setLiking] = useState(false);
  const [attending, setAttending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showPostMenu, setShowPostMenu] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState(null);
  const [reportDetails, setReportDetails] = useState('');
  const [submittingReport, setSubmittingReport] = useState(false);
  const [showReportSuccess, setShowReportSuccess] = useState(false);
  const [errorModalMessage, setErrorModalMessage] = useState(null);
  const [deletingPost, setDeletingPost] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(null); // index into post.images, or null when closed
  const [replyTarget, setReplyTarget] = useState(null); // { id, authorName } or null
  const [addingToCalendar, setAddingToCalendar] = useState(false);
  const [addedToCalendar, setAddedToCalendar] = useState(false);
  const inputRef = useRef(null);
  const flatListRef = useRef(null);

  useEffect(() => { fetchPost(); fetchComments(); }, [id]);

  // Registers a view once per person, skipping the post's own author (a
  // view count that includes the author checking their own post repeatedly
  // isn't a meaningful signal). Runs once post + user are both available,
  // and only if this user isn't already in viewedBy — both to avoid a
  // wasted write and because the rules would reject a second attempt
  // anyway.
  useEffect(() => {
    if (!post || !user) return;
    if (post.authorId === user.uid) return;
    if ((post.viewedBy || []).includes(user.uid)) return;
    updateDoc(doc(db, 'posts', id), {
      viewCount: increment(1),
      viewedBy: arrayUnion(user.uid),
    }).then(() => {
      setPost(prev => ({
        ...prev,
        viewCount: (prev.viewCount || 0) + 1,
        viewedBy: [...(prev.viewedBy || []), user.uid],
      }));
    }).catch(e => console.error('view count error:', e));
  }, [post?.id, user?.uid]);


  // "Added to calendar" is a per-device fact (it lives in the phone's own
  // calendar app, not our account data), so it's tracked in AsyncStorage
  // rather than Firestore.
  useEffect(() => {
    AsyncStorage.getItem(`calendarEvent:${id}`)
      .then(v => setAddedToCalendar(v === 'true'))
      .catch(() => {});
  }, [id]);

  const fetchPost = async () => {
    try {
      const snap = await getDoc(doc(db, 'posts', id));
      if (snap.exists()) {
        const data = { id: snap.id, ...snap.data() };
        setPost(data);
        setLiked(data.likedBy?.includes(user?.uid) || false);
        setAttending(data.attendees?.includes(user?.uid) || false);
        setSaved(data.savedBy?.includes(user?.uid) || false);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const fetchComments = async () => {
    try {
      const q = query(collection(db, 'comments'), where('postId', '==', id), orderBy('createdAt', 'asc'));
      const snap = await getDocs(q);
      setComments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error(e); }
  };

  const handleLike = async () => {
    if (!post || liking) return;
    setLiking(true);
    const newLiked = !liked;
    setLiked(newLiked);
    setPost(prev => ({ ...prev, likeCount: (prev.likeCount || 0) + (newLiked ? 1 : -1) }));
    try {
      await updateDoc(doc(db, 'posts', id), {
        likeCount: increment(newLiked ? 1 : -1),
        likedBy: newLiked
          ? [...(post.likedBy || []), user.uid]
          : (post.likedBy || []).filter(uid => uid !== user.uid),
      });
      if (newLiked && post.authorId !== user.uid) {
        await addDoc(collection(db, 'notifications'), {
          userId: post.authorId, type: 'like',
          message: `${profile.displayName} liked your post`,
          postId: id, fromUserId: user.uid, fromUserName: profile.displayName,
          isRead: false, createdAt: serverTimestamp(),
        });
      }
    } catch (e) { console.error(e); }
    finally { setLiking(false); }
  };

  const handleToggleAttending = async () => {
    if (!post) return;
    const newAttending = !attending;
    setAttending(newAttending);
    setPost(prev => ({ ...prev, attendeeCount: (prev.attendeeCount || 0) + (newAttending ? 1 : -1) }));
    try {
      await updateDoc(doc(db, 'posts', id), {
        attendeeCount: increment(newAttending ? 1 : -1),
        attendees: newAttending
          ? [...(post.attendees || []), user.uid]
          : (post.attendees || []).filter(uid => uid !== user.uid),
      });
    } catch (e) {
      console.error(e);
      setErrorModalMessage('Could not update. Please try again.');
    }
  };

  const handleToggleSave = async () => {
    if (!post) return;
    const newSaved = !saved;
    setSaved(newSaved);
    try {
      await updateDoc(doc(db, 'posts', id), {
        savedBy: newSaved
          ? [...(post.savedBy || []), user.uid]
          : (post.savedBy || []).filter(uid => uid !== user.uid),
      });
    } catch (e) {
      console.error(e);
      setErrorModalMessage('Could not update. Please try again.');
    }
  };

  const buildShareText = () => {
    const when = eventDate ? `${eventIsToday ? 'Today' : formatEventDate(eventDate)}, ${formatEventTime(eventDate)}` : '';
    // A regular https:// link, not the raw mysuburb:// scheme — this is
    // what makes WhatsApp (and everywhere else) actually show and let
    // people tap/copy it as a real link. The page it points to
    // (post-redirect.html) immediately hands off into the app via the
    // custom scheme, so tapping it still opens MySuburb directly, same
    // as before, just via one small bridge page instead of a raw
    // custom-scheme link most apps won't recognize.
    const deepLink = `https://mysuburb.app/post/${id}`;
    const lines = [
      `Event Title: ${post.content}`,
      post.description ? `Description: ${post.description}` : null,
      post.isFree !== undefined ? `Price: ${post.isFree === false ? `$${post.eventPrice?.toFixed(2)}` : 'Free'}` : null,
      when ? `Date & Time: ${when}` : null,
      post.eventLocation ? `Location: ${post.eventLocation}` : null,
    ].filter(Boolean);
    return `${lines.join('\n')}\n\n${deepLink}\n\nShared from My Suburb`;
  };

  const handleShareToUser = () => {
    setShowShareModal(false);
    router.push({ pathname: '/share-picker', params: { shareText: buildShareText(), sharePostId: id } });
  };

  // Native share sheet must wait for the custom Share modal to be FULLY
  // gone before presenting — not just "probably gone after a guessed
  // delay". iOS's Modal fires onDismiss at exactly that moment, so the
  // share sheet call is deferred there instead of a fixed setTimeout,
  // which was causing it to appear on top of the modal's still-fading
  // overlay (a washed-out look) or fail to appear at all. Android's Modal
  // doesn't support onDismiss, so it keeps a short fallback delay.
  const pendingExternalShareRef = useRef(false);

  const handleShareExternal = () => {
    pendingExternalShareRef.current = true;
    setShowShareModal(false);
    if (Platform.OS !== 'ios') {
      setTimeout(() => {
        if (pendingExternalShareRef.current) {
          pendingExternalShareRef.current = false;
          Share.share({ message: buildShareText() }).catch(e => console.error(e));
        }
      }, 400);
    }
  };

  const handleShareModalDismiss = () => {
    if (Platform.OS === 'ios' && pendingExternalShareRef.current) {
      pendingExternalShareRef.current = false;
      Share.share({ message: buildShareText() }).catch(e => console.error(e));
    }
  };

  const handleCommentLike = async (item) => {
    const isLiked = item.likedBy?.includes(user.uid) || false;
    const newLiked = !isLiked;
    setComments(prev => prev.map(c => c.id === item.id ? {
      ...c,
      likeCount: (c.likeCount || 0) + (newLiked ? 1 : -1),
      likedBy: newLiked ? [...(c.likedBy || []), user.uid] : (c.likedBy || []).filter(u => u !== user.uid),
    } : c));
    try {
      await updateDoc(doc(db, 'comments', item.id), {
        likeCount: increment(newLiked ? 1 : -1),
        likedBy: newLiked
          ? [...(item.likedBy || []), user.uid]
          : (item.likedBy || []).filter(u => u !== user.uid),
      });
      if (newLiked && item.authorId !== user.uid) {
        await addDoc(collection(db, 'notifications'), {
          userId: item.authorId, type: 'comment_like',
          message: `${profile.displayName} liked your comment`,
          postId: id, commentId: item.id, fromUserId: user.uid, fromUserName: profile.displayName,
          isRead: false, createdAt: serverTimestamp(),
        });
      }
    } catch (e) { console.error(e); }
  };

  const startReply = (targetComment) => {
    setReplyTarget({ id: targetComment.id, authorName: targetComment.authorName });
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const cancelReply = () => setReplyTarget(null);

  const handleComment = async () => {
    if (!comment.trim()) return;
    setPosting(true);
    const parentCommentId = replyTarget?.id || null;
    try {
      const newCommentRef = await addDoc(collection(db, 'comments'), {
        postId: id, content: comment.trim(),
        authorId: user.uid, authorName: profile.displayName,
        createdAt: serverTimestamp(), likeCount: 0, likedBy: [],
        parentCommentId,
        mentions: commentMentions,
        mentionedUserIds: commentMentions.map(m => m.uid),
      });
      await updateDoc(doc(db, 'posts', id), { commentCount: increment(1) });

      if (parentCommentId) {
        // Notify the specific comment author being replied to, if not ourselves.
        const parentComment = comments.find(c => c.id === parentCommentId);
        if (parentComment && parentComment.authorId !== user.uid) {
          await addDoc(collection(db, 'notifications'), {
            userId: parentComment.authorId, type: 'comment_reply',
            message: `${profile.displayName} replied to your comment`,
            postId: id, commentId: parentComment.id, fromUserId: user.uid, fromUserName: profile.displayName,
            isRead: false, createdAt: serverTimestamp(),
          });
        }
      } else if (post.authorId !== user.uid) {
        await addDoc(collection(db, 'notifications'), {
          userId: post.authorId, type: 'comment',
          message: `${profile.displayName} commented on your post`,
          postId: id, fromUserId: user.uid, fromUserName: profile.displayName,
          isRead: false, createdAt: serverTimestamp(),
        });
      }

      // @mention notifications — one per mentioned person, skipping
      // yourself and anyone who already got a comment/reply notification
      // above (no need to double-notify the same person twice for the
      // same comment).
      const alreadyNotified = parentCommentId
        ? [comments.find(c => c.id === parentCommentId)?.authorId]
        : [post.authorId];
      for (const mention of commentMentions) {
        if (mention.uid === user.uid) continue;
        if (alreadyNotified.includes(mention.uid)) continue;
        try {
          await addDoc(collection(db, 'notifications'), {
            userId: mention.uid, type: 'mention',
            message: `${profile.displayName} mentioned you in a comment`,
            postId: id, commentId: newCommentRef.id, fromUserId: user.uid, fromUserName: profile.displayName,
            isRead: false, createdAt: serverTimestamp(),
          });
        } catch (e) { console.error('mention notification error:', e); }
      }

      setComment('');
      setCommentMentions([]);
      setReplyTarget(null);
      Keyboard.dismiss();
      inputRef.current?.blur();
      setPost(prev => ({ ...prev, commentCount: (prev.commentCount || 0) + 1 }));
      await fetchComments();
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (e) { Alert.alert('Error', e.message); }
    finally { setPosting(false); }
  };

  // closedAt records exactly when a post was marked closed, so the tab
  // lists can keep showing it (with the Closed badge + strikethrough) for
  // a 24-hour grace period afterward instead of hiding it the instant
  // it's closed — see the isStaleClosed() check in lost-found.js.
  const handleToggleStatus = async () => {
    setShowPostMenu(false);
    const fieldName = post.category === 'lostfound' ? 'isResolved' : 'isSold';
    const newValue = !post[fieldName];
    const localClosedAt = newValue ? new Date() : null;
    setPost(prev => ({ ...prev, [fieldName]: newValue, closedAt: localClosedAt }));
    try {
      await updateDoc(doc(db, 'posts', id), { [fieldName]: newValue, closedAt: newValue ? serverTimestamp() : null });
    } catch (e) {
      console.error(e);
      setPost(prev => ({ ...prev, [fieldName]: !newValue, closedAt: !newValue ? localClosedAt : null }));
      setErrorModalMessage('Could not update. Please try again.');
    }
  };

  const openEditPost = () => {
    setShowPostMenu(false);
    // Events aren't handled by create-post.js at all — "New Event" lives
    // entirely inside events.js as its own modal — so editing an event
    // routes there instead, where it auto-opens pre-filled.
    if (post.category === 'events') {
      router.push({ pathname: '/(tabs)/events', params: { editEventId: post.id } });
    } else {
      router.push({ pathname: '/create-post', params: { editPostId: post.id } });
    }
  };

  const handleDeletePost = () => {
    setShowPostMenu(false);
    Alert.alert('Delete Post', 'Are you sure you want to delete this post?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          setDeletingPost(true);
          try {
            await updateDoc(doc(db, 'posts', id), { isRemoved: true });
            router.back();
          } catch (e) { Alert.alert('Error', e.message); }
          finally { setDeletingPost(false); }
        }
      }
    ]);
  };

  // Same effect as handleDeletePost (isRemoved: true — hides it from
  // every feed and direct access, never a hard delete), but reachable by
  // an admin on ANY post, not just their own. Backed by the dedicated
  // isAdmin() clause in firestore.rules, separate from the owner-edit
  // clause. This exists so a report doesn't have to go through the
  // Moderation/Admin dashboard report queue first — if an admin spots
  // something directly on a post (e.g. a tip received outside the app),
  // they can act immediately from right here.
  const handleAdminRemovePost = () => {
    setShowPostMenu(false);
    Alert.alert('Remove Post (Admin)', 'This will hide the post from all feeds immediately. Continue?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive', onPress: async () => {
          setDeletingPost(true);
          try {
            await updateDoc(doc(db, 'posts', id), { isRemoved: true });
            router.back();
          } catch (e) { Alert.alert('Error', e.message); }
          finally { setDeletingPost(false); }
        }
      }
    ]);
  };

  const handleReportPost = () => {
    setShowPostMenu(false);
    setReportReason(null);
    setReportDetails('');
    setShowReportModal(true);
  };

  const handleSubmitReport = async () => {
    if (!reportReason) {
      Alert.alert('Select a reason', 'Please choose a reason for reporting this post.');
      return;
    }
    setSubmittingReport(true);
    try {
      await addDoc(collection(db, 'reports'), {
        category: 'Post content',
        reason: reportReason,
        description: reportDetails.trim() || null,
        postId: post.id,
        postContent: (post.content || '').slice(0, 300),
        postAuthorId: post.authorId,
        postAuthorName: post.authorName,
        userId: user.uid,
        userEmail: profile?.email || user.email || null,
        userDisplayName: profile?.displayName || null,
        suburb: post.suburb || null,
        state: post.state || null,
        status: 'open',
        createdAt: serverTimestamp(),
      });
      setShowReportModal(false);
      setShowReportSuccess(true);
    } catch (e) {
      Alert.alert('Error', 'Could not submit your report. Please check your connection and try again.');
    } finally {
      setSubmittingReport(false);
    }
  };

  const handleBlockUser = () => {
    setShowPostMenu(false);
    Alert.alert(
      `Block ${post.authorName}?`,
      "They won't be able to message you, and their posts will be hidden from your feed.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block', style: 'destructive', onPress: async () => {
            try {
              await blockUser(post.authorId, post.authorName);
              router.back();
            } catch (e) {
              Alert.alert('Error', 'Could not block this user. Please try again.');
            }
          }
        }
      ]
    );
  };

  const DELETED_COMMENT_TEXT = '[This comment was deleted]';
  const ADMIN_DELETED_COMMENT_TEXT = '[Deleted by Admin]';

  // Same soft-delete pattern either way (replace content with a
  // placeholder, never hard-delete, since replies may depend on this
  // comment still existing) — but the placeholder text differs depending
  // on who removed it, and Firestore rules distinguish the two paths:
  // authors can update their own comments, admins can update any comment
  // via a separate isAdmin() clause (see firestore.rules).
  const handleDeleteComment = (commentId, isAdminAction = false) => {
    const title = isAdminAction ? 'Remove Comment (Admin)' : 'Delete Comment';
    const message = isAdminAction
      ? 'This removes the comment for everyone and marks it as removed by an admin. Replies to it will stay visible.'
      : 'Are you sure you want to delete this comment? Replies to it will stay visible.';
    const placeholderText = isAdminAction ? ADMIN_DELETED_COMMENT_TEXT : DELETED_COMMENT_TEXT;
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: isAdminAction ? 'Remove' : 'Delete', style: 'destructive', onPress: async () => {
          try {
            await updateDoc(doc(db, 'comments', commentId), { content: placeholderText, isDeleted: true });
            setComments(prev => prev.map(c => c.id === commentId ? { ...c, content: placeholderText, isDeleted: true } : c));
          } catch (e) { Alert.alert('Error', e.message); }
        }
      }
    ]);
  };

  // Shared calendar helper defaults to a 1-hour duration since events only
  // store a start time, not an end time.
  const handleAddToCalendar = async () => {
    if (addedToCalendar) {
      Alert.alert('Already Added', 'This event is already in your calendar.');
      return;
    }
    if (!eventDate || addingToCalendar) return;
    setAddingToCalendar(true);
    const result = await addEventToCalendar({ title: post.content, description: post.description, location: post.eventLocation, startDate: eventDate });
    setAddingToCalendar(false);
    if (result.success) {
      await AsyncStorage.setItem(`calendarEvent:${id}`, 'true').catch(() => {});
      setAddedToCalendar(true);
      Alert.alert('Added to Calendar', 'This event has been added to your calendar.');
    } else {
      setErrorModalMessage(result.message);
    }
  };

  if (loading) return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.white }}>
      <ActivityIndicator color={Colors.brandGreen} size="large" />
    </View>
  );

  if (!post) return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <Text>Post not found.</Text>
    </View>
  );

  // Covers posts removed by their author/an admin, and posts auto-hidden
  // by the server-side content screening (functions/index.js
  // screenNewPost). Without this check, anyone who already has a link or
  // notification pointing at this post — even after it's gone — could
  // still open it directly, the same gap we fixed for deleted messages.
  //
  // Admins are exempt from this block — they need to actually be able to
  // open a removed post (e.g. from the Admin Dashboard's Resolved tab)
  // to review what was removed and why. They see the real post below,
  // with a banner making it clear it's been removed from public view.
  if (post.isRemoved && !profile?.isAdmin) return (
    <View style={styles.container}>
      <View style={styles.topHeader}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={Colors.white} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <AppName style={styles.mySuburb} />
        </View>
        <View style={{ width: 40 }} />
      </View>
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 10 }}>
        <Ionicons name="eye-off-outline" size={40} color={Colors.lightGrey} />
        <Text style={{ fontSize: 15, color: Colors.midGrey, textAlign: 'center' }}>
          This post is no longer available.
        </Text>
      </View>
    </View>
  );

  const isEvent = post.category === 'events';
  const orderedMedia = getOrderedMedia(post);
  const isLostFound = post.category === 'lostfound';
  const isServices = post.category === 'services';
  const isOwner = post.authorId === user?.uid;
  const pageTitle = PAGE_TITLES[post.category] || 'Community Hub';
  const categoryLabel = CATEGORY_LABELS[post.category];
  const accentColor = CATEGORY_ACCENT[post.category] || Colors.brandGreen;

  const eventDate = isEvent && post.eventDate
    ? (post.eventDate.toDate ? post.eventDate.toDate() : new Date(post.eventDate))
    : null;
  const eventIsToday = eventDate && eventDate.toDateString() === new Date().toDateString();
  const formatEventDate = (d) => d.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const formatEventTime = (d) => d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });

  const goToChat = () => {
    if (post.authorId !== user?.uid) {
      router.push({ pathname: '/chat/' + post.authorId, params: { userId: post.authorId, userName: post.authorName } });
    }
  };

  const goToUserProfile = () => {
    if (post.authorId !== user?.uid) {
      router.push('/user/' + post.authorId);
    } else {
      router.push('/(tabs)/profile');
    }
  };

  const handleGetDirections = () => {
    const address = post.eventLocation || post.lostFoundLocation;
    if (!address) return;
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
    Linking.openURL(url).catch(() => Alert.alert('Error', 'Could not open Maps.'));
  };

  const topLevelCount = comments.filter(c => !c.parentCommentId).length;
  const nestedComments = flattenCommentTree(comments);
  const listData = [
    { type: 'post' },
    ...nestedComments.map(c => ({ type: 'comment', ...c })),
  ];

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      {/* Header */}
      <View style={styles.topHeader}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={Colors.white} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <AppName style={styles.mySuburb} />
          <Text style={styles.suburbName} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{post.suburb}, {post.state}</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.pageHeader}>
        <Text style={styles.pageTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{pageTitle}</Text>
      </View>

      {post.isRemoved && profile?.isAdmin && (
        <View style={styles.adminRemovedBanner}>
          <Ionicons name="eye-off" size={16} color="#fff" />
          <Text style={styles.adminRemovedBannerText}>Removed — hidden from all users. Only visible to you as an admin.</Text>
        </View>
      )}

      <FlatList
        ref={flatListRef}
        data={listData}
        keyExtractor={(item, index) => item.type === 'post' ? 'post' : item.id || String(index)}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        renderItem={({ item }) => {
          if (item.type === 'post') {
            return (
              <View>
                <View style={[styles.postCard, { borderLeftColor: accentColor, borderLeftWidth: 4 }]}>
                <View style={styles.postCardInner}>
                  <View style={[styles.authorRow, isEvent && styles.authorRowEvent]}>
                    {isEvent && eventDate && (
                      eventIsToday ? (
                        <View style={styles.eventTodayBadge}>
                          <Text style={styles.eventTodayBadgeText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>TODAY</Text>
                        </View>
                      ) : (
                        <View style={styles.eventDateBox}>
                          <Text style={styles.eventWeekday} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{eventDate.toLocaleString('en-AU', { weekday: 'short' }).toUpperCase()}</Text>
                          <Text style={styles.eventDay} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{eventDate.getDate()}</Text>
                          <Text style={styles.eventMonth} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{eventDate.toLocaleString('en-AU', { month: 'short' }).toUpperCase()}</Text>
                        </View>
                      )
                    )}
                    <TouchableOpacity onPress={goToUserProfile}>
                      <AvatarWithOnlineDot authorId={post.authorId} photoURL={post.authorPhotoURL} name={post.authorName} />
                    </TouchableOpacity>
                    <TouchableOpacity style={{ flex: 1 }} onPress={goToUserProfile}>
                      <Text style={styles.authorName} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{post.authorName}</Text>
                      <Text style={styles.dateTime} numberOfLines={1}>{formatDateTime(post.createdAt)}</Text>
                    </TouchableOpacity>
                    {!isOwner && (
                      <TouchableOpacity style={styles.messageBtn} onPress={goToChat}>
                        <Ionicons name="chatbubble-ellipses-outline" size={16} color={Colors.brandGreen} />
                      </TouchableOpacity>
                    )}
                    <View style={styles.headerBadgeStack}>
                      {isLostFound && post.lostFoundType && (
                        <View style={[styles.pillTag, { backgroundColor: post.lostFoundType === 'lost' ? '#C62828' : Colors.brandGreen }]}>
                          <Text style={[styles.pillTagText, post.isResolved && styles.closedText]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{post.lostFoundType === 'lost' ? 'Lost' : 'Found'}</Text>
                        </View>
                      )}
                      {isLostFound && post.isResolved && (
                        <View style={styles.soldTag}>
                          <Text style={styles.soldTagText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{getStatusLabels().badge}</Text>
                        </View>
                      )}
                      {post.category === 'marketplace' && post.marketplaceType && (
                        <View style={[styles.pillTag, { backgroundColor: MARKETPLACE_TYPE_CONFIG[post.marketplaceType]?.bg || Colors.brandGreen }]}>
                          <Text style={[styles.pillTagText, post.isSold && styles.closedText]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{MARKETPLACE_TYPE_CONFIG[post.marketplaceType]?.label || categoryLabel}</Text>
                        </View>
                      )}
                      {post.category === 'marketplace' && post.isSold && (
                        <View style={styles.soldTag}>
                          <Text style={styles.soldTagText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{getStatusLabels().badge}</Text>
                        </View>
                      )}
                      {!isLostFound && !isEvent && !isServices && post.category !== 'marketplace' && categoryLabel && (
                        <View style={styles.pillTag}>
                          <Text style={styles.pillTagText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{categoryLabel}</Text>
                        </View>
                      )}
                      {isServices && SERVICE_TAB_LABELS[post.serviceTab] && (
                        <View style={[styles.tabBadge, { backgroundColor: post.serviceTab === 'offering' ? Colors.brandGreen : '#1565C0' }]}>
                          <Text style={styles.tabBadgeText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{SERVICE_TAB_LABELS[post.serviceTab]}</Text>
                        </View>
                      )}
                      {isServices && (
                        <View style={styles.serviceLabelBadge}>
                          <Text style={styles.serviceLabelBadgeText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{SERVICE_LABELS[post.serviceType] || 'Service'}</Text>
                        </View>
                      )}
                    </View>
                    {isEvent && eventDate && (
                      <TouchableOpacity style={styles.calendarBtn} onPress={handleAddToCalendar} disabled={addingToCalendar}>
                        {addingToCalendar ? (
                          <ActivityIndicator color={Colors.brandGreen} size="small" />
                        ) : (
                          <Ionicons name="calendar-outline" size={32} color={Colors.brandGreen} />
                        )}
                      </TouchableOpacity>
                    )}
                    {/* 3-dot menu button */}
                    <TouchableOpacity style={styles.menuBtn} onPress={() => setShowPostMenu(true)}>
                      <Ionicons name="ellipsis-vertical" size={20} color={Colors.midGrey} />
                    </TouchableOpacity>
                  </View>

                  {!isEvent && (
                    <LinkifiedText
                      text={post.content}
                      style={(post.category === 'marketplace' || isLostFound) ? styles.contentBold : styles.description}
                      linkStyle={styles.contentLink}
                    />
                  )}

                  {isEvent && eventDate && (
                    <View style={styles.eventDetailsBody}>
                      <View style={styles.detailField}>
                        <View style={styles.labelBadgeWrap}>
                          <View style={[styles.labelBadge, styles.titleBadge]}>
                            <Text style={styles.labelBadgeText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>EVENT TITLE</Text>
                          </View>
                        </View>
                        <Text style={styles.fieldValue}>{post.content}</Text>
                      </View>
                      {post.description ? (
                        <View style={styles.detailField}>
                          <View style={styles.labelBadgeWrap}>
                            <View style={[styles.labelBadge, styles.aboutBadge]}>
                              <Text style={[styles.labelBadgeText, styles.aboutBadgeText]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>DESCRIPTION</Text>
                            </View>
                          </View>
                          <LinkifiedText text={post.description} style={styles.fieldValue} linkStyle={styles.contentLink} />
                        </View>
                      ) : null}
                      {post.isFree !== undefined && (
                        <View style={styles.detailField}>
                          <View style={styles.labelBadgeWrap}>
                            <View style={[styles.labelBadge, styles.priceBadge]}>
                              <Text style={styles.labelBadgeText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>PRICE</Text>
                            </View>
                          </View>
                          <Text style={styles.fieldValue}>{post.isFree === false ? `$${post.eventPrice?.toFixed(2)}` : 'Free'}</Text>
                        </View>
                      )}
                      <View style={styles.detailField}>
                        <View style={styles.labelBadgeWrap}>
                          <View style={[styles.labelBadge, styles.dateBadgeLabel]}>
                            <Text style={styles.labelBadgeText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>DATE & TIME</Text>
                          </View>
                        </View>
                        <Text style={styles.fieldValue}>{eventIsToday ? 'Today' : formatEventDate(eventDate)}, {formatEventTime(eventDate)}</Text>
                      </View>
                      <View style={styles.detailField}>
                        <View style={styles.labelBadgeWrap}>
                          <View style={[styles.labelBadge, styles.attendingBadge]}>
                            <Text style={styles.labelBadgeText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>ATTENDING</Text>
                          </View>
                        </View>
                        <Text style={styles.fieldValue}>{post.attendeeCount || 0} interested</Text>
                      </View>
                      {post.eventLocation ? (
                        <TouchableOpacity style={styles.detailField} onPress={handleGetDirections}>
                          <View style={styles.labelBadgeWrap}>
                            <View style={[styles.labelBadge, styles.locationBadge]}>
                              <Text style={styles.labelBadgeText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>LOCATION</Text>
                            </View>
                          </View>
                          <View style={styles.locationValueRow}>
                            <Ionicons name="location-outline" size={14} color={Colors.midGrey} />
                            <Text style={[styles.fieldValue, styles.eventLocationLink]}>{post.eventLocation}</Text>
                          </View>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  )}

                  {/* Photos & Videos, interleaved in original pick order */}
                  {orderedMedia.length > 0 && (
                    <View style={styles.imagesWrap}>
                      {orderedMedia.map((m, i) => (
                        m.type === 'video'
                          ? <PostVideoPlayer key={i} url={m.url} onExpand={() => setViewerIndex(i)} />
                          : (
                            <TouchableOpacity key={i} onPress={() => setViewerIndex(i)}>
                              <Image source={{ uri: m.url }} style={styles.postImage} resizeMode="cover" />
                            </TouchableOpacity>
                          )
                      ))}
                    </View>
                  )}

                  {!isEvent && post.description ? (
                    <LinkifiedText
                      text={post.description}
                      style={[styles.description, isPostClosed(post) && styles.closedText]}
                      linkStyle={styles.contentLink}
                    />
                  ) : null}
                  {isLostFound && post.lostFoundLocation ? (
                    <TouchableOpacity style={styles.locationRow} onPress={handleGetDirections}>
                      <Ionicons name="location-outline" size={15} color={Colors.brandGreen} />
                      <Text style={[styles.locationText, styles.eventLocationLink]}>{post.lostFoundLocation}</Text>
                    </TouchableOpacity>
                  ) : null}

                  {post.category === 'marketplace' && (
                    <View style={styles.detailRow}>
                      {post.price > 0 && <Text style={styles.priceTag}>${post.price?.toFixed(2)}</Text>}
                      {post.isFree && <View style={styles.freeTag}><Text style={styles.freeTagText}>FREE</Text></View>}
                      {post.isWanted && <View style={styles.seekingTag}><Text style={styles.seekingTagText}>SEEKING</Text></View>}
                    </View>
                  )}

                  <View style={styles.footer}>
                    <View style={styles.footerSideGroup}>
                      <TouchableOpacity style={styles.footerBtn} onPress={handleLike} disabled={liking}>
                        <Ionicons name={liked ? 'heart' : 'heart-outline'} size={20} color={liked ? '#E53935' : Colors.charcoal} />
                        <Text style={[styles.footerText, liked && { color: '#E53935' }]}>{post.likeCount || 0}</Text>
                      </TouchableOpacity>
                      <View style={styles.footerBtn}>
                        <Ionicons name="chatbubble-outline" size={20} color={Colors.charcoal} />
                        <Text style={styles.footerText}>{post.commentCount || 0}</Text>
                      </View>
                      <View style={styles.footerBtn}>
                        <Ionicons name="eye-outline" size={19} color={Colors.midGrey} />
                        <Text style={[styles.footerText, { color: Colors.midGrey }]}>{post.viewCount || 0}</Text>
                      </View>
                    </View>
                    <View style={{ flex: 1 }} />
                    {isEvent && (
                      <>
                        <TouchableOpacity style={[styles.interestedPill, attending && styles.interestedPillActive]} onPress={handleToggleAttending}>
                          <Ionicons name={attending ? 'checkmark-circle' : 'checkmark-circle-outline'} size={16} color={attending ? Colors.white : '#1B4F72'} />
                          <Text
                            style={[styles.interestedPillText, attending && styles.interestedPillTextActive]}
                            numberOfLines={1}
                            adjustsFontSizeToFit
                            minimumFontScale={0.8}
                          >
                            Interested
                          </Text>
                        </TouchableOpacity>
                        <View style={{ flex: 1 }} />
                      </>
                    )}
                    <View style={styles.footerSideGroup}>
                      <TouchableOpacity onPress={handleToggleSave} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Ionicons name={saved ? 'bookmark' : 'bookmark-outline'} size={20} color={saved ? Colors.brandGreen : Colors.charcoal} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => setShowShareModal(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ marginLeft: 8 }}>
                        <Ionicons name="share-outline" size={20} color={Colors.charcoal} />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
                </View>

                <Text style={styles.commentsTitle} numberOfLines={1}>Comments ({topLevelCount})</Text>
                {comments.length === 0 && (
                  <View style={styles.noComments}>
                    <Ionicons name="chatbubble-outline" size={32} color={Colors.lightGrey} />
                    <Text style={styles.noCommentsText}>Be the first to comment</Text>
                  </View>
                )}
              </View>
            );
          }

          const depth = item.depth || 0;
          const isTopLevel = depth === 0;
          const isMyComment = item.authorId === user?.uid;
          const commentLiked = item.likedBy?.includes(user?.uid) || false;
          // Cap visual indent so deep threads don't squeeze the text column
          // down to nothing on a narrow phone — logically still unlimited depth.
          const indent = Math.min(depth, 3) * 20;

          const FooterRow = (
            <View style={styles.commentFooter}>
              <Text style={styles.commentTime}>{timeAgo(item.createdAt)}</Text>
              {!item.isDeleted && (
                <TouchableOpacity style={styles.likeRow} onPress={() => handleCommentLike(item)}>
                  <Ionicons name={commentLiked ? 'heart' : 'heart-outline'} size={13} color={commentLiked ? '#E53935' : Colors.midGrey} />
                  {item.likeCount > 0 && <Text style={[styles.likeCountText, commentLiked && { color: '#E53935' }]}>{item.likeCount}</Text>}
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={() => startReply(item)}>
                <Text style={styles.replyBtnText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>Reply</Text>
              </TouchableOpacity>
            </View>
          );

          if (isTopLevel) {
            return (
              <View style={styles.commentCard}>
                <View style={styles.commentRow}>
                  <TouchableOpacity
                    style={styles.commentAvatar}
                    onPress={() => !isMyComment && router.push('/user/' + item.authorId)}
                    disabled={isMyComment}
                  >
                    <Text style={styles.commentAvatarText}>{item.authorName?.[0]?.toUpperCase()}</Text>
                  </TouchableOpacity>
                  <View style={{ flex: 1 }}>
                    <TouchableOpacity onPress={() => !isMyComment && router.push('/user/' + item.authorId)} disabled={isMyComment}>
                      <Text style={styles.commentAuthor} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{item.authorName}</Text>
                    </TouchableOpacity>
                    {item.isDeleted ? (
                      <Text style={[styles.commentContent, styles.deletedText]}>{item.content}</Text>
                    ) : (
                      renderTextWithMentions(item.content, item.mentions, styles.commentContent, styles.mentionLink)
                    )}
                    {FooterRow}
                  </View>
                  {!item.isDeleted && (isMyComment || profile?.isAdmin) && (
                    <TouchableOpacity onPress={() => handleDeleteComment(item.id, !isMyComment)} style={styles.deleteCommentBtn}>
                      <Ionicons name="trash-outline" size={15} color="#E53935" />
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          }

          // Nested reply — compact threaded style with a connecting line,
          // instead of a full bordered card nested inside another card.
          return (
            <View style={[styles.replyRow, { marginLeft: indent }]}>
              <View style={styles.threadLine} />
              <TouchableOpacity
                style={styles.replyAvatar}
                onPress={() => !isMyComment && router.push('/user/' + item.authorId)}
                disabled={isMyComment}
              >
                <Text style={styles.replyAvatarText}>{item.authorName?.[0]?.toUpperCase()}</Text>
              </TouchableOpacity>
              <View style={{ flex: 1 }}>
                <View style={styles.replyBubble}>
                  <TouchableOpacity onPress={() => !isMyComment && router.push('/user/' + item.authorId)} disabled={isMyComment}>
                    <Text style={styles.replyAuthorInline} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{item.authorName}</Text>
                  </TouchableOpacity>
                  {item.isDeleted ? (
                    <Text style={[styles.replyText, styles.deletedText]}>{item.content}</Text>
                  ) : (
                    renderTextWithMentions(item.content, item.mentions, styles.replyText, styles.mentionLink)
                  )}
                </View>
                {FooterRow}
              </View>
              {!item.isDeleted && (isMyComment || profile?.isAdmin) && (
                <TouchableOpacity onPress={() => handleDeleteComment(item.id, !isMyComment)} style={styles.deleteCommentBtn}>
                  <Ionicons name="trash-outline" size={14} color="#E53935" />
                </TouchableOpacity>
              )}
            </View>
          );
        }}
      />

      {/* Reply banner */}
      {replyTarget && (
        <View style={styles.replyBanner}>
          <Text style={styles.replyBannerText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>Replying to {replyTarget.authorName}</Text>
          <TouchableOpacity onPress={cancelReply}>
            <Ionicons name="close-circle" size={18} color={Colors.midGrey} />
          </TouchableOpacity>
        </View>
      )}

      {/* Comment Input — @mention autocomplete works in both a fresh
          comment and a reply, since they share this same input. */}
      <View style={[styles.commentInputRow, { paddingBottom: 12 + insets.bottom }]}>
        <MentionInput
          ref={inputRef}
          style={styles.input}
          placeholder={replyTarget ? `Reply to ${replyTarget.authorName}...` : 'Write a comment...'}
          placeholderTextColor={Colors.midGrey}
          value={comment}
          onChangeText={setComment}
          mentions={commentMentions}
          onMentionsChange={setCommentMentions}
          suburb={post?.suburb}
          state={post?.state}
          currentUserId={user.uid}
          multiline
          autoCorrect={true}
          autoCapitalize="sentences"
          spellCheck={true}
        />
        <TouchableOpacity style={[styles.sendBtn, posting && { opacity: 0.7 }]} onPress={handleComment} disabled={posting}>
          {posting ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="send" size={18} color="#fff" />}
        </TouchableOpacity>
      </View>

      {/* 3-dot Post Menu Modal */}
      <Modal visible={showPostMenu} transparent animationType="fade">
        <TouchableOpacity style={styles.menuOverlay} activeOpacity={1} onPress={() => setShowPostMenu(false)}>
          <View style={styles.menuSheet}>
            <View style={styles.menuHeaderBar}>
              <Text style={styles.menuHeaderText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>Select</Text>
            </View>
            <View style={[styles.menuPad, { paddingBottom: 32 + insets.bottom }]}>
            {isOwner ? (
              <>
                {(post.category === 'marketplace' || post.category === 'lostfound') && (
                  <TouchableOpacity style={styles.menuItem} onPress={handleToggleStatus}>
                    <View style={styles.menuItemIcon}>
                      <Ionicons name={(post.category === 'lostfound' ? post.isResolved : post.isSold) ? 'refresh-outline' : 'checkmark-circle-outline'} size={20} color={Colors.brandGreen} />
                    </View>
                    <Text style={styles.menuItemText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{(post.category === 'lostfound' ? post.isResolved : post.isSold) ? getStatusLabels(post).undo : getStatusLabels(post).action}</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={styles.menuItem} onPress={openEditPost}>
                  <View style={styles.menuItemIcon}>
                    <Ionicons name="create-outline" size={20} color={Colors.brandGreen} />
                  </View>
                  <Text style={styles.menuItemText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>Edit Post</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.menuItem} onPress={handleDeletePost} disabled={deletingPost}>
                  <View style={styles.menuItemIcon}>
                    <Ionicons name="trash-outline" size={20} color="#E53935" />
                  </View>
                  <Text style={styles.menuItemTextDanger} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>Delete Post</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <TouchableOpacity style={styles.menuItem} onPress={() => { setShowPostMenu(false); goToChat(); }}>
                  <View style={styles.menuItemIcon}>
                    <Ionicons name="chatbubble-ellipses-outline" size={20} color={Colors.brandGreen} />
                  </View>
                  <Text style={styles.menuItemText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>Message {post.authorName}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.menuItem} onPress={handleReportPost}>
                  <View style={styles.menuItemIcon}>
                    <Ionicons name="flag-outline" size={20} color="#E65100" />
                  </View>
                  <Text style={styles.menuItemTextWarn} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>Report Post</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.menuItem} onPress={handleBlockUser}>
                  <View style={styles.menuItemIcon}>
                    <Ionicons name="ban-outline" size={20} color="#E53935" />
                  </View>
                  <Text style={styles.menuItemTextDanger} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>Block {post.authorName}</Text>
                </TouchableOpacity>
                {profile?.isAdmin && (
                  <TouchableOpacity style={styles.menuItem} onPress={handleAdminRemovePost} disabled={deletingPost}>
                    <View style={styles.menuItemIcon}>
                      <Ionicons name="shield-outline" size={20} color="#E53935" />
                    </View>
                    <Text style={styles.menuItemTextDanger} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>Remove Post (Admin)</Text>
                  </TouchableOpacity>
                )}
              </>
            )}
            <TouchableOpacity style={[styles.menuItem, styles.menuCancelBtn]} onPress={() => setShowPostMenu(false)}>
              <Text style={styles.menuCancelText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>Cancel</Text>
            </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      <MediaViewerModal media={viewerIndex !== null ? orderedMedia : null} initialIndex={viewerIndex ?? 0} onClose={() => setViewerIndex(null)} />

      {/* Share modal */}
      <Modal visible={showShareModal} transparent animationType="slide" onDismiss={handleShareModalDismiss}>
        <TouchableOpacity style={styles.shareOverlay} activeOpacity={1} onPress={() => setShowShareModal(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.shareSheet} onPress={() => {}}>
            <View style={styles.shareHeaderBar}>
              <Text style={styles.shareHeaderText} numberOfLines={1}>Share</Text>
            </View>
            <View style={[styles.sharePad, { paddingBottom: 32 + insets.bottom }]}>
              <TouchableOpacity style={styles.shareOption} onPress={handleShareToUser}>
                <View style={[styles.shareOptionIcon, { backgroundColor: Colors.brandGreenPale }]}>
                  <Ionicons name="people-outline" size={20} color={Colors.brandGreen} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.shareOptionTitle}>Share to a My Suburb User</Text>
                  <Text style={styles.shareOptionSubtitle}>Send this as a message</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={Colors.lightGrey} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.shareOption} onPress={handleShareExternal}>
                <View style={[styles.shareOptionIcon, { backgroundColor: '#E3F2FD' }]}>
                  <Ionicons name="share-social-outline" size={20} color="#0D47A1" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.shareOptionTitle}>Share via Other Apps</Text>
                  <Text style={styles.shareOptionSubtitle}>WhatsApp, Messages, Email, and more</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={Colors.lightGrey} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.shareCancelBtn} onPress={() => setShowShareModal(false)}>
                <Text style={styles.shareCancelText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Report reason modal */}
      <Modal visible={showReportModal} transparent animationType="slide">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <TouchableOpacity style={styles.menuOverlay} activeOpacity={1} onPress={() => setShowReportModal(false)}>
            <TouchableOpacity activeOpacity={1} style={styles.reportSheet} onPress={() => {}}>
            <View style={styles.reportHeaderBar}>
              <View style={styles.shareHandle} />
              <Text style={styles.reportTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>Report this post</Text>
              <Text style={styles.reportSubtitle}>Why are you reporting this post?</Text>
            </View>

            <View style={[styles.reportPad, { paddingBottom: 32 + insets.bottom }]}>
              {REPORT_REASONS.map(reason => (
                <TouchableOpacity
                  key={reason}
                  style={[styles.reasonChip, reportReason === reason && styles.reasonChipActive]}
                  onPress={() => setReportReason(reason)}
                >
                  <Ionicons
                    name={reportReason === reason ? 'radio-button-on' : 'radio-button-off'}
                    size={18}
                    color={reportReason === reason ? Colors.brandGreen : Colors.midGrey}
                  />
                  <Text
                    style={[styles.reasonChipText, reportReason === reason && styles.reasonChipTextActive]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.8}
                  >
                    {reason}
                  </Text>
                </TouchableOpacity>
              ))}

              <TextInput
                style={styles.reportDetailsInput}
                placeholder="Add any extra details (optional)"
                placeholderTextColor={Colors.midGrey}
                value={reportDetails}
                onChangeText={setReportDetails}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />

              <TouchableOpacity
                style={[styles.reportSubmitBtn, submittingReport && { opacity: 0.7 }]}
                onPress={handleSubmitReport}
                disabled={submittingReport}
              >
                {submittingReport
                  ? <ActivityIndicator color={Colors.white} size="small" />
                  : <Text style={styles.reportSubmitBtnText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>Submit Report</Text>
                }
              </TouchableOpacity>
              <TouchableOpacity style={styles.reportCancelBtn} onPress={() => setShowReportModal(false)} disabled={submittingReport}>
                <Text style={styles.reportCancelBtnText} numberOfLines={1}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </Modal>

      {/* Report submitted confirmation */}
      <Modal visible={showReportSuccess} transparent animationType="fade">
        <View style={styles.centerOverlay}>
          <View style={styles.successCard}>
            <View style={styles.successIconCircle}>
              <Ionicons name="checkmark" size={32} color={Colors.white} />
            </View>
            <Text style={styles.successTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>Report Submitted</Text>
            <Text style={styles.successMessage}>Thank you for reporting this post. Our team will review it within 24 hours.</Text>
            <TouchableOpacity style={styles.successOkBtn} onPress={() => setShowReportSuccess(false)}>
              <Text style={styles.successOkBtnText}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Generic error confirmation */}
      <Modal visible={!!errorModalMessage} transparent animationType="fade">
        <View style={styles.centerOverlay}>
          <View style={styles.successCard}>
            <View style={[styles.successIconCircle, { backgroundColor: '#E53935' }]}>
              <Ionicons name="alert" size={30} color={Colors.white} />
            </View>
            <Text style={styles.successTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>Something Went Wrong</Text>
            <Text style={styles.successMessage}>{errorModalMessage}</Text>
            <TouchableOpacity style={[styles.successOkBtn, { backgroundColor: '#E53935' }]} onPress={() => setErrorModalMessage(null)}>
              <Text style={styles.successOkBtnText}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.white },
  topHeader: { backgroundColor: Colors.brandGreen, paddingTop: 56, paddingBottom: 16, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  headerCenter: { alignItems: 'center', marginLeft: 8 },
  mySuburb: { fontSize: 27, fontWeight: '800', color: Colors.white },
  suburbName: { fontSize: 17, color: '#FFD700', marginTop: 4 },
  pageHeader: { backgroundColor: Colors.brandGreenPale, paddingVertical: 10, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: Colors.lightGrey },
  pageTitle: { fontSize: 20, fontWeight: '700', color: Colors.brandGreen },
  adminRemovedBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#E53935', paddingVertical: 10, paddingHorizontal: 16 },
  adminRemovedBannerText: { color: '#fff', fontSize: 13, fontWeight: '600', flexShrink: 1, textAlign: 'center' },
  scroll: { padding: 16, gap: 10, paddingBottom: 20 },
  eventDateBox: { width: 52, height: 58, borderRadius: 12, backgroundColor: '#5B7DB1', justifyContent: 'center', alignItems: 'center', gap: 1 },
  eventWeekday: { fontSize: 9, fontWeight: '900', color: 'rgba(255,255,255,0.75)' },
  eventDay: { fontSize: 18, fontWeight: '900', color: Colors.white, lineHeight: 20 },
  eventMonth: { fontSize: 9, fontWeight: '900', color: 'rgba(255,255,255,0.85)' },
  eventTodayBadge: { width: 52, height: 58, borderRadius: 12, backgroundColor: '#5B7DB1', justifyContent: 'center', alignItems: 'center' },
  eventTodayBadgeText: { fontSize: 12, fontWeight: '900', color: Colors.white, textAlign: 'center' },
  eventDetailsBody: { padding: 16, paddingTop: 8, gap: 6 },
  detailField: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 3 },
  labelBadgeWrap: { width: 98 },
  labelBadge: { width: 90, alignItems: 'center', paddingHorizontal: 6, paddingVertical: 4, borderRadius: 20, backgroundColor: '#C2D9E8' },
  labelBadgeText: { fontSize: 9, fontWeight: '900', color: '#1B4F72', letterSpacing: 0.3 },
  titleBadge: {},
  aboutBadge: {},
  aboutBadgeText: {},
  priceBadge: {},
  dateBadgeLabel: {},
  locationBadge: {},
  attendingBadge: {},
  fieldValue: { fontSize: 14, color: Colors.charcoal, fontWeight: '600', lineHeight: 19, flex: 1 },
  locationValueRow: { flexDirection: 'row', alignItems: 'center', gap: 5, flex: 1 },
  eventLocationLink: { textDecorationLine: 'underline' },
  calendarBtn: { width: 60, height: 60, borderRadius: 30, backgroundColor: Colors.brandGreenPale, justifyContent: 'center', alignItems: 'center' },
  postCard: {
    backgroundColor: Colors.white, borderRadius: 16, marginBottom: 12,
    borderWidth: 1, borderColor: '#D5D5D5',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 2,
  },
  postCardInner: { borderRadius: 16, overflow: 'hidden' },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 16, paddingBottom: 8 },
  headerBadgeStack: { alignItems: 'stretch', gap: 4 },
  authorRowEvent: { backgroundColor: '#EDF7EF', paddingBottom: 8, borderTopLeftRadius: 16, borderTopRightRadius: 16, alignItems: 'center' },
  authorName: { fontSize: 17, fontWeight: '700', color: Colors.charcoal },
  dateTime: { fontSize: 12, color: Colors.midGrey, marginTop: 2, fontStyle: 'italic' },
  pillTag: { backgroundColor: Colors.brandGreen, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, alignItems: 'center' },
  pillTagText: { fontSize: 14, fontWeight: '800', color: Colors.white },
  messageBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#FFD700', justifyContent: 'center', alignItems: 'center' },
  messageBtnText: { fontSize: 12, fontWeight: '700', color: Colors.brandGreen },
  menuBtn: { padding: 4 },
  contentBold: { fontSize: 17, color: Colors.charcoal, lineHeight: 26, fontWeight: '700', paddingHorizontal: 16, paddingBottom: 6 },
  serviceBadgeStack: { alignItems: 'flex-start', gap: 6, marginHorizontal: 16, marginBottom: 6 },
  tabBadge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20, alignItems: 'center' },
  tabBadgeText: { fontSize: 12, fontWeight: '800', color: Colors.white },
  serviceLabelBadge: { alignSelf: 'flex-start', backgroundColor: '#C2D9E8', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  serviceLabelBadgeText: { fontSize: 12, color: '#1B4F72', fontWeight: '800' },
  description: { fontSize: 14, color: Colors.charcoal, lineHeight: 22, paddingHorizontal: 16, paddingBottom: 6 },
  contentLink: { color: '#1565C0', textDecorationLine: 'underline' },
  mentionLink: { color: Colors.brandGreen, fontWeight: '700' },
  closedText: { textDecorationLine: 'line-through' },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingBottom: 8 },
  locationText: { fontSize: 14, color: Colors.charcoal },
  detailRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 8 },
  priceTag: { fontSize: 18, fontWeight: '800', color: Colors.brandGreen },
  freeTag: { backgroundColor: Colors.white, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  freeTagText: { fontSize: 13, fontWeight: '700', color: Colors.brandGreen },
  soldTag: { backgroundColor: '#757575', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, alignItems: 'center' },
  soldTagText: { fontSize: 14, fontWeight: '800', color: Colors.white },
  seekingTag: { backgroundColor: '#E3F2FD', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  seekingTagText: { fontSize: 13, fontWeight: '700', color: '#0D47A1' },
  footer: { flexDirection: 'row', gap: 12, alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#EFEFEF', borderTopWidth: 1.5, borderTopColor: '#E0E0E0' },
  footerBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  footerSideGroup: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  interestedPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1.5, borderColor: '#1B4F72', backgroundColor: Colors.white },
  interestedPillActive: { backgroundColor: '#1B4F72', borderColor: '#1B4F72' },
  interestedPillText: { fontSize: 13, fontWeight: '700', color: '#1B4F72' },
  interestedPillTextActive: { color: Colors.white },
  footerText: { fontSize: 14, color: Colors.charcoal, fontWeight: '600' },
  commentsTitle: { fontSize: 16, fontWeight: '700', color: Colors.charcoal, marginBottom: 4 },
  noComments: { alignItems: 'center', paddingVertical: 16, gap: 8 },
  noCommentsText: { fontSize: 14, color: Colors.midGrey },

  // Top-level comment card
  commentCard: { backgroundColor: Colors.white, borderRadius: 12, borderWidth: 1, borderColor: Colors.lightGrey, padding: 12 },
  commentRow: { flexDirection: 'row', gap: 10 },
  commentAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.brandGreenPale, justifyContent: 'center', alignItems: 'center' },
  commentAvatarText: { fontSize: 14, fontWeight: '700', color: Colors.brandGreen },
  commentAuthor: { fontSize: 13, fontWeight: '700', color: Colors.charcoal },
  commentContent: { fontSize: 14, fontWeight: '500', color: Colors.charcoal, marginTop: 2, lineHeight: 20 },
  deletedText: { fontStyle: 'italic', color: Colors.midGrey, fontWeight: '400' },

  // Threaded reply — compact, no boxed nesting
  replyRow: { flexDirection: 'row', gap: 8, paddingTop: 8, alignItems: 'flex-start' },
  threadLine: { width: 16, height: 20, borderLeftWidth: 2, borderBottomWidth: 2, borderColor: Colors.lightGrey, borderBottomLeftRadius: 8, marginTop: -8 },
  replyAvatar: { width: 26, height: 26, borderRadius: 13, backgroundColor: Colors.brandGreenPale, justifyContent: 'center', alignItems: 'center', marginTop: 2 },
  replyAvatarText: { fontSize: 11, fontWeight: '700', color: Colors.brandGreen },
  replyBubble: { backgroundColor: '#F2F2F2', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8, alignSelf: 'flex-start' },
  replyAuthorInline: { fontSize: 13, fontWeight: '700', color: Colors.charcoal, marginBottom: 2 },
  replyText: { fontSize: 13, color: Colors.charcoal, lineHeight: 18 },

  commentFooter: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 5, paddingLeft: 2 },
  commentTime: { fontSize: 11, color: Colors.midGrey },
  likeRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  likeCountText: { fontSize: 11, color: Colors.midGrey, fontWeight: '600' },
  replyBtnText: { fontSize: 12, fontWeight: '700', color: Colors.brandGreen },
  deleteCommentBtn: { padding: 6, justifyContent: 'flex-start' },

  replyBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 8, backgroundColor: Colors.brandGreenPale, borderTopWidth: 1, borderTopColor: Colors.lightGrey },
  replyBannerText: { fontSize: 13, color: Colors.brandGreen, fontWeight: '600', flex: 1, marginRight: 8 },
  commentInputRow: { flexDirection: 'row', padding: 12, gap: 10, backgroundColor: Colors.brandGreen, borderTopWidth: 1, borderTopColor: Colors.brandGreen, alignItems: 'flex-end' },
  input: { flex: 1, backgroundColor: Colors.white, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, color: Colors.charcoal, maxHeight: 120 },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#FFD700', justifyContent: 'center', alignItems: 'center', marginBottom: 2 },
  imagesWrap: { paddingHorizontal: 16, paddingBottom: 10, gap: 8 },
  postImage: { width: '100%', height: 200, borderRadius: 12, backgroundColor: Colors.lightGrey },
  postVideo: { width: '100%', height: 220, borderRadius: 12, backgroundColor: '#000' },
  postVideoPlayOverlay: { position: 'absolute', top: 0, left: 0, right: 0, height: 220, justifyContent: 'center', alignItems: 'center' },
  videoFullscreenBtn: {
    position: 'absolute', top: 10, right: 10,
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center', alignItems: 'center',
  },
  // Post menu modal
  menuOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  menuSheet: { backgroundColor: Colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden' },
  menuHeaderBar: { backgroundColor: Colors.brandGreen, paddingTop: 14, paddingBottom: 16, paddingHorizontal: 20, alignItems: 'center' },
  menuHeaderText: { fontSize: 18, fontWeight: '800', color: Colors.white },
  menuPad: { padding: 16, paddingBottom: 32 },
  shareOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  shareSheet: { backgroundColor: Colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden' },
  shareHeaderBar: { backgroundColor: Colors.brandGreen, paddingTop: 14, paddingBottom: 16, alignItems: 'center', borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  shareHeaderText: { fontSize: 19, fontWeight: '800', color: Colors.white },
  sharePad: { padding: 16, paddingBottom: 32 },
  shareOption: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, paddingHorizontal: 8, borderRadius: 14, marginBottom: 6 },
  shareOptionIcon: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  shareOptionTitle: { fontSize: 15, fontWeight: '700', color: Colors.charcoal },
  shareOptionSubtitle: { fontSize: 12, color: Colors.midGrey, marginTop: 2 },
  shareCancelBtn: { backgroundColor: Colors.brandGreenPale, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  shareCancelText: { fontSize: 15, fontWeight: '700', color: Colors.brandGreen },
  menuItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', gap: 14, paddingVertical: 9, paddingHorizontal: 14, borderRadius: 14, backgroundColor: '#FAFAFA', borderWidth: 1.5, borderColor: '#EFEFEF', marginBottom: 8 },
  menuItemIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#FFF0F0', justifyContent: 'center', alignItems: 'center' },
  menuItemTextDanger: { fontSize: 16, fontWeight: '700', color: '#E53935', flexShrink: 1 },
  menuItemTextWarn: { fontSize: 16, fontWeight: '700', color: '#E65100', flexShrink: 1 },
  menuItemText: { fontSize: 16, fontWeight: '700', color: Colors.charcoal, flexShrink: 1 },
  menuCancelBtn: { backgroundColor: Colors.brandGreenPale, borderRadius: 14, justifyContent: 'center', marginTop: 8, borderWidth: 0 },
  menuCancelText: { fontSize: 16, fontWeight: '700', color: Colors.brandGreen, textAlign: 'center', flex: 1 },
  reportSheet: { backgroundColor: Colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden' },
  reportHeaderBar: { backgroundColor: Colors.brandGreen, paddingTop: 14, paddingBottom: 16, paddingHorizontal: 20, alignItems: 'center' },
  reportTitle: { fontSize: 19, fontWeight: '800', color: Colors.white, textAlign: 'center', marginBottom: 4 },
  reportSubtitle: { fontSize: 13, color: 'rgba(255,255,255,0.85)', textAlign: 'center' },
  reportPad: { padding: 16, paddingBottom: 32 },
  reasonChip: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 14, borderRadius: 14, backgroundColor: '#FAFAFA', borderWidth: 1.5, borderColor: '#EFEFEF', marginBottom: 9, borderLeftWidth: 4, borderLeftColor: 'transparent' },
  reasonChipActive: { backgroundColor: Colors.brandGreenPale, borderColor: Colors.brandGreen, borderLeftColor: Colors.brandGreen },
  reasonChipText: { fontSize: 15, color: Colors.charcoal, fontWeight: '600', flex: 1 },
  reasonChipTextActive: { color: Colors.brandGreen, fontWeight: '700' },
  reportDetailsInput: { borderWidth: 1, borderColor: Colors.lightGrey, borderRadius: 12, padding: 12, fontSize: 14, color: Colors.charcoal, minHeight: 70, marginTop: 4, marginBottom: 16 },
  reportSubmitBtn: { backgroundColor: Colors.brandGreen, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  reportSubmitBtnText: { fontSize: 16, fontWeight: '700', color: Colors.white },
  reportCancelBtn: { paddingVertical: 12, alignItems: 'center' },
  reportCancelBtnText: { fontSize: 14, fontWeight: '600', color: Colors.midGrey },
  centerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', padding: 32 },
  successCard: { backgroundColor: Colors.white, borderRadius: 20, padding: 28, alignItems: 'center', width: '100%', maxWidth: 340 },
  successIconCircle: { width: 60, height: 60, borderRadius: 30, backgroundColor: Colors.brandGreen, justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  successTitle: { fontSize: 19, fontWeight: '800', color: Colors.charcoal, marginBottom: 8 },
  successMessage: { fontSize: 14, color: Colors.midGrey, textAlign: 'center', lineHeight: 20, marginBottom: 22 },
  successOkBtn: { backgroundColor: Colors.brandGreen, borderRadius: 14, paddingVertical: 13, alignItems: 'center', width: '100%' },
  successOkBtnText: { fontSize: 16, fontWeight: '700', color: Colors.white },
});