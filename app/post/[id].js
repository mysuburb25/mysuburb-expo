import { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, FlatList, Modal, Image, Keyboard, Linking, Share } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { doc, getDoc, collection, query, where, orderBy, getDocs, addDoc, serverTimestamp, updateDoc, increment } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../context/AuthContext';
import { Colors } from '../../constants/theme';

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
  updates: 'General', notices: 'Notice', safety: 'Safety Alert',
  events: 'Event', marketplace: 'Buy & Sell', services: 'Service',
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

export default function PostDetailScreen() {
  const { id } = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const { user, profile, updateUserProfile } = useAuth();
  const [post, setPost] = useState(null);
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [comment, setComment] = useState('');
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
  const [deletingPost, setDeletingPost] = useState(false);
  const [replyTarget, setReplyTarget] = useState(null); // { id, authorName } or null
  const inputRef = useRef(null);
  const flatListRef = useRef(null);

  useEffect(() => { fetchPost(); fetchComments(); }, [id]);

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
      if (newLiked) {
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
      Alert.alert('Error', 'Could not update. Please try again.');
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
      Alert.alert('Error', 'Could not update. Please try again.');
    }
  };

  const buildShareText = () => {
    const when = eventDate ? `${eventIsToday ? 'Today' : formatEventDate(eventDate)}, ${formatEventTime(eventDate)}` : '';
    const deepLink = `mysuburb://post/${id}`;
    const lines = [
      `Event Title: ${post.content}`,
      post.description ? `Description: ${post.description}` : null,
      post.isFree !== undefined ? `Price: ${post.isFree === false ? `$${post.eventPrice?.toFixed(2)}` : 'Free'}` : null,
      when ? `Date & Time: ${when}` : null,
      post.eventLocation ? `Location: ${post.eventLocation}` : null,
    ].filter(Boolean);
    return `${lines.join('\n')}\n\n${deepLink}\n(Tap to open in My Suburb — you'll need the app installed)\n\nShared from My Suburb`;
  };

  const handleShareToUser = () => {
    setShowShareModal(false);
    router.push({ pathname: '/share-picker', params: { shareText: buildShareText(), sharePostId: id } });
  };

  const handleShareExternal = async () => {
    setShowShareModal(false);
    try {
      await Share.share({ message: buildShareText() });
    } catch (e) { console.error(e); }
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
          postId: id, fromUserId: user.uid, fromUserName: profile.displayName,
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
      await addDoc(collection(db, 'comments'), {
        postId: id, content: comment.trim(),
        authorId: user.uid, authorName: profile.displayName,
        createdAt: serverTimestamp(), likeCount: 0, likedBy: [],
        parentCommentId,
      });
      await updateDoc(doc(db, 'posts', id), { commentCount: increment(1) });

      if (parentCommentId) {
        // Notify the specific comment author being replied to, if not ourselves.
        const parentComment = comments.find(c => c.id === parentCommentId);
        if (parentComment && parentComment.authorId !== user.uid) {
          await addDoc(collection(db, 'notifications'), {
            userId: parentComment.authorId, type: 'comment_reply',
            message: `${profile.displayName} replied to your comment`,
            postId: id, fromUserId: user.uid, fromUserName: profile.displayName,
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

      setComment('');
      setReplyTarget(null);
      Keyboard.dismiss();
      inputRef.current?.blur();
      setPost(prev => ({ ...prev, commentCount: (prev.commentCount || 0) + 1 }));
      await fetchComments();
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (e) { Alert.alert('Error', e.message); }
    finally { setPosting(false); }
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
            const current = profile?.blockedUsers || [];
            if (current.some(b => b.uid === post.authorId)) return;
            try {
              await updateUserProfile({
                blockedUsers: [...current, { uid: post.authorId, displayName: post.authorName, blockedAt: new Date().toISOString() }]
              });
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

  const handleDeleteComment = (commentId) => {
    Alert.alert('Delete Comment', 'Are you sure you want to delete this comment? Replies to it will stay visible.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            // Soft-delete only — replace the content with a placeholder rather
            // than hard-deleting, since replies from other users may depend
            // on this comment still existing (and Firestore rules only allow
            // authors to modify their own comments, not delete others' replies).
            await updateDoc(doc(db, 'comments', commentId), { content: DELETED_COMMENT_TEXT, isDeleted: true });
            setComments(prev => prev.map(c => c.id === commentId ? { ...c, content: DELETED_COMMENT_TEXT, isDeleted: true } : c));
          } catch (e) { Alert.alert('Error', e.message); }
        }
      }
    ]);
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

  const isEvent = post.category === 'events';
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
          <Text style={styles.mySuburb}>My Suburb</Text>
          <Text style={styles.suburbName}>{post.suburb}, {post.state}</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.pageHeader}>
        <Text style={styles.pageTitle}>{pageTitle}</Text>
      </View>

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
                          <Text style={styles.eventTodayBadgeText}>TODAY</Text>
                        </View>
                      ) : (
                        <View style={styles.eventDateBox}>
                          <Text style={styles.eventWeekday}>{eventDate.toLocaleString('en-AU', { weekday: 'short' }).toUpperCase()}</Text>
                          <Text style={styles.eventDay}>{eventDate.getDate()}</Text>
                          <Text style={styles.eventMonth}>{eventDate.toLocaleString('en-AU', { month: 'short' }).toUpperCase()}</Text>
                        </View>
                      )
                    )}
                    <TouchableOpacity style={styles.avatar} onPress={goToUserProfile}>
                      {post.authorPhotoURL ? (
                        <Image source={{ uri: post.authorPhotoURL }} style={styles.avatarImage} />
                      ) : (
                        <Text style={styles.avatarText}>{post.authorName?.[0]?.toUpperCase()}</Text>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity style={{ flex: 1 }} onPress={goToUserProfile}>
                      <Text style={styles.authorName}>{post.authorName}</Text>
                      <Text style={styles.dateTime}>{formatDateTime(post.createdAt)}</Text>
                    </TouchableOpacity>
                    {!isOwner && (
                      <TouchableOpacity style={styles.messageBtn} onPress={goToChat}>
                        <Ionicons name="chatbubble-ellipses-outline" size={16} color={Colors.brandGreen} />
                      </TouchableOpacity>
                    )}
                    {isLostFound && post.lostFoundType && (
                      <View style={[styles.pillTag, { backgroundColor: post.lostFoundType === 'lost' ? '#C62828' : Colors.brandGreen }]}>
                        <Text style={styles.pillTagText}>{post.lostFoundType === 'lost' ? 'Lost' : 'Found'}</Text>
                      </View>
                    )}
                    {!isLostFound && !isEvent && categoryLabel && (
                      <View style={styles.pillTag}>
                        <Text style={styles.pillTagText}>{categoryLabel}</Text>
                      </View>
                    )}
                    {/* 3-dot menu button */}
                    <TouchableOpacity style={styles.menuBtn} onPress={() => setShowPostMenu(true)}>
                      <Ionicons name="ellipsis-vertical" size={20} color={Colors.midGrey} />
                    </TouchableOpacity>
                  </View>

                  {isServices && (
                    <View style={styles.serviceLabelBadge}>
                      <Text style={styles.serviceLabelBadgeText}>{SERVICE_LABELS[post.serviceType] || 'Service'}</Text>
                    </View>
                  )}
                  {!isEvent && (
                    <Text style={(post.category === 'marketplace' || isLostFound) ? styles.contentBold : styles.description}>{post.content}</Text>
                  )}

                  {isEvent && eventDate && (
                    <View style={styles.eventDetailsBody}>
                      <View style={styles.detailField}>
                        <View style={styles.labelBadgeWrap}>
                          <View style={[styles.labelBadge, styles.titleBadge]}>
                            <Text style={styles.labelBadgeText}>EVENT TITLE</Text>
                          </View>
                        </View>
                        <Text style={styles.fieldValue}>{post.content}</Text>
                      </View>
                      {post.description ? (
                        <View style={styles.detailField}>
                          <View style={styles.labelBadgeWrap}>
                            <View style={[styles.labelBadge, styles.aboutBadge]}>
                              <Text style={[styles.labelBadgeText, styles.aboutBadgeText]}>DESCRIPTION</Text>
                            </View>
                          </View>
                          <Text style={styles.fieldValue}>{post.description}</Text>
                        </View>
                      ) : null}
                      {post.isFree !== undefined && (
                        <View style={styles.detailField}>
                          <View style={styles.labelBadgeWrap}>
                            <View style={[styles.labelBadge, styles.priceBadge]}>
                              <Text style={styles.labelBadgeText}>PRICE</Text>
                            </View>
                          </View>
                          <Text style={styles.fieldValue}>{post.isFree === false ? `$${post.eventPrice?.toFixed(2)}` : 'Free'}</Text>
                        </View>
                      )}
                      <View style={styles.detailField}>
                        <View style={styles.labelBadgeWrap}>
                          <View style={[styles.labelBadge, styles.dateBadgeLabel]}>
                            <Text style={styles.labelBadgeText}>DATE & TIME</Text>
                          </View>
                        </View>
                        <Text style={styles.fieldValue}>{eventIsToday ? 'Today' : formatEventDate(eventDate)}, {formatEventTime(eventDate)}</Text>
                      </View>
                      {post.eventLocation ? (
                        <TouchableOpacity style={styles.detailField} onPress={handleGetDirections}>
                          <View style={styles.labelBadgeWrap}>
                            <View style={[styles.labelBadge, styles.locationBadge]}>
                              <Text style={styles.labelBadgeText}>LOCATION</Text>
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

                  {/* Images */}
                  {post.images && post.images.length > 0 && (
                    <View style={styles.imagesWrap}>
                      {post.images.map((url, i) => (
                        <Image key={i} source={{ uri: url }} style={styles.postImage} resizeMode="cover" />
                      ))}
                    </View>
                  )}

                  {!isEvent && post.description ? (
                    <Text style={styles.description}>{post.description}</Text>
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
                    <TouchableOpacity style={styles.footerBtn} onPress={handleLike} disabled={liking}>
                      <Ionicons name={liked ? 'heart' : 'heart-outline'} size={18} color={liked ? '#E53935' : Colors.charcoal} />
                      <Text style={[styles.footerText, liked && { color: '#E53935' }]}>{post.likeCount || 0}</Text>
                    </TouchableOpacity>
                    <View style={styles.footerBtn}>
                      <Ionicons name="chatbubble-outline" size={18} color={Colors.charcoal} />
                      <Text style={styles.footerText}>{post.commentCount || 0}</Text>
                    </View>
                    {isEvent && (
                      <TouchableOpacity style={[styles.footerBtn, { flexShrink: 1 }]} onPress={handleToggleAttending}>
                        <Ionicons name={attending ? 'checkmark-circle' : 'checkmark-circle-outline'} size={18} color={attending ? Colors.brandGreen : Colors.charcoal} />
                        <Text style={[styles.footerText, attending && { color: Colors.brandGreen }]} numberOfLines={1}>
                          Interested{post.attendeeCount > 0 ? ` · ${post.attendeeCount}` : ''}
                        </Text>
                      </TouchableOpacity>
                    )}
                    <View style={{ flex: 1 }} />
                    <TouchableOpacity onPress={handleToggleSave} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Ionicons name={saved ? 'bookmark' : 'bookmark-outline'} size={18} color={saved ? Colors.brandGreen : Colors.charcoal} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setShowShareModal(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Ionicons name="share-outline" size={18} color={Colors.charcoal} />
                    </TouchableOpacity>
                  </View>
                </View>
                </View>

                <Text style={styles.commentsTitle}>Comments ({topLevelCount})</Text>
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
                <Text style={styles.replyBtnText}>Reply</Text>
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
                      <Text style={styles.commentAuthor}>{item.authorName}</Text>
                    </TouchableOpacity>
                    <Text style={[styles.commentContent, item.isDeleted && styles.deletedText]}>{item.content}</Text>
                    {FooterRow}
                  </View>
                  {isMyComment && !item.isDeleted && (
                    <TouchableOpacity onPress={() => handleDeleteComment(item.id)} style={styles.deleteCommentBtn}>
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
                    <Text style={styles.replyAuthorInline}>{item.authorName}</Text>
                  </TouchableOpacity>
                  <Text style={[styles.replyText, item.isDeleted && styles.deletedText]}>{item.content}</Text>
                </View>
                {FooterRow}
              </View>
              {isMyComment && !item.isDeleted && (
                <TouchableOpacity onPress={() => handleDeleteComment(item.id)} style={styles.deleteCommentBtn}>
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
          <Text style={styles.replyBannerText}>Replying to {replyTarget.authorName}</Text>
          <TouchableOpacity onPress={cancelReply}>
            <Ionicons name="close-circle" size={18} color={Colors.midGrey} />
          </TouchableOpacity>
        </View>
      )}

      {/* Comment Input */}
      <View style={[styles.commentInputRow, { paddingBottom: Math.max(12, insets.bottom) }]}>
        <TextInput
          ref={inputRef}
          style={styles.input}
          placeholder={replyTarget ? `Reply to ${replyTarget.authorName}...` : 'Write a comment...'}
          placeholderTextColor={Colors.midGrey}
          value={comment}
          onChangeText={setComment}
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
            <View style={styles.menuHandle} />
            {isOwner ? (
              <>
                <TouchableOpacity style={styles.menuItem} onPress={handleDeletePost} disabled={deletingPost}>
                  <View style={styles.menuItemIcon}>
                    <Ionicons name="trash-outline" size={20} color="#E53935" />
                  </View>
                  <Text style={styles.menuItemTextDanger}>Delete Post</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <TouchableOpacity style={styles.menuItem} onPress={handleReportPost}>
                  <View style={styles.menuItemIcon}>
                    <Ionicons name="flag-outline" size={20} color="#E65100" />
                  </View>
                  <Text style={styles.menuItemTextWarn}>Report Post</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.menuItem} onPress={handleBlockUser}>
                  <View style={styles.menuItemIcon}>
                    <Ionicons name="ban-outline" size={20} color="#E53935" />
                  </View>
                  <Text style={styles.menuItemTextDanger}>Block {post.authorName}</Text>
                </TouchableOpacity>
              </>
            )}
            <TouchableOpacity style={[styles.menuItem, styles.menuCancelBtn]} onPress={() => setShowPostMenu(false)}>
              <Text style={styles.menuCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Share modal */}
      <Modal visible={showShareModal} transparent animationType="slide">
        <TouchableOpacity style={styles.shareOverlay} activeOpacity={1} onPress={() => setShowShareModal(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.shareSheet} onPress={() => {}}>
            <View style={styles.shareHeaderBar}>
              <Text style={styles.shareHeaderText}>Share</Text>
            </View>
            <View style={styles.sharePad}>
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
                <Text style={styles.shareCancelText}>Cancel</Text>
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
              <Text style={styles.reportTitle}>Report this post</Text>
              <Text style={styles.reportSubtitle}>Why are you reporting this post?</Text>
            </View>

            <View style={styles.reportPad}>
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
                  <Text style={[styles.reasonChipText, reportReason === reason && styles.reasonChipTextActive]}>{reason}</Text>
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
                  : <Text style={styles.reportSubmitBtnText}>Submit Report</Text>
                }
              </TouchableOpacity>
              <TouchableOpacity style={styles.reportCancelBtn} onPress={() => setShowReportModal(false)} disabled={submittingReport}>
                <Text style={styles.reportCancelBtnText}>Cancel</Text>
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
            <Text style={styles.successTitle}>Report Submitted</Text>
            <Text style={styles.successMessage}>Thank you for reporting this post. Our team will review it within 24 hours.</Text>
            <TouchableOpacity style={styles.successOkBtn} onPress={() => setShowReportSuccess(false)}>
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
  headerCenter: { alignItems: 'center' },
  mySuburb: { fontSize: 27, fontWeight: '800', color: Colors.white },
  suburbName: { fontSize: 17, color: '#FFD700', marginTop: 4 },
  pageHeader: { backgroundColor: Colors.brandGreenPale, paddingVertical: 10, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: Colors.lightGrey },
  pageTitle: { fontSize: 20, fontWeight: '700', color: Colors.brandGreen },
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
  labelBadgeText: { fontSize: 8, fontWeight: '900', color: '#1B4F72', letterSpacing: 0.3 },
  titleBadge: {},
  aboutBadge: {},
  aboutBadgeText: {},
  priceBadge: {},
  dateBadgeLabel: {},
  locationBadge: {},
  fieldValue: { fontSize: 14, color: Colors.charcoal, fontWeight: '600', lineHeight: 19, flex: 1 },
  locationValueRow: { flexDirection: 'row', alignItems: 'center', gap: 5, flex: 1 },
  eventLocationLink: { textDecorationLine: 'underline' },
  postCard: {
    backgroundColor: Colors.white, borderRadius: 16, marginBottom: 12,
    borderWidth: 1, borderColor: '#D5D5D5',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 2,
  },
  postCardInner: { borderRadius: 16, overflow: 'hidden' },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16, paddingBottom: 8 },
  authorRowEvent: { backgroundColor: '#EDF7EF', paddingBottom: 8, borderTopLeftRadius: 16, borderTopRightRadius: 16, alignItems: 'center' },
  avatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: Colors.white, borderWidth: 2, borderColor: Colors.brandGreen, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  avatarImage: { width: 30, height: 30, borderRadius: 15 },
  avatarText: { fontSize: 15, fontWeight: '700', color: Colors.brandGreen },
  authorName: { fontSize: 17, fontWeight: '700', color: Colors.charcoal },
  dateTime: { fontSize: 12, color: Colors.midGrey, marginTop: 2, fontStyle: 'italic' },
  pillTag: { backgroundColor: Colors.brandGreen, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20 },
  pillTagText: { fontSize: 14, fontWeight: '800', color: Colors.white },
  messageBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#FFD700', justifyContent: 'center', alignItems: 'center' },
  messageBtnText: { fontSize: 12, fontWeight: '700', color: Colors.brandGreen },
  menuBtn: { padding: 4 },
  contentBold: { fontSize: 17, color: Colors.charcoal, lineHeight: 26, fontWeight: '700', paddingHorizontal: 16, paddingBottom: 6 },
  serviceLabelBadge: { alignSelf: 'flex-start', backgroundColor: Colors.brandGreenPale, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, marginHorizontal: 16, marginBottom: 6 },
  serviceLabelBadgeText: { fontSize: 15, color: Colors.brandGreen, fontWeight: '800' },
  description: { fontSize: 14, color: Colors.charcoal, lineHeight: 22, paddingHorizontal: 16, paddingBottom: 6 },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingBottom: 8 },
  locationText: { fontSize: 14, color: Colors.charcoal },
  detailRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 8 },
  priceTag: { fontSize: 18, fontWeight: '800', color: Colors.brandGreen },
  freeTag: { backgroundColor: Colors.white, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  freeTagText: { fontSize: 13, fontWeight: '700', color: Colors.brandGreen },
  seekingTag: { backgroundColor: '#E3F2FD', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  seekingTagText: { fontSize: 13, fontWeight: '700', color: '#0D47A1' },
  footer: { flexDirection: 'row', gap: 12, alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#EFEFEF', borderTopWidth: 1.5, borderTopColor: '#E0E0E0' },
  footerBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
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
  replyBannerText: { fontSize: 13, color: Colors.brandGreen, fontWeight: '600' },
  commentInputRow: { flexDirection: 'row', padding: 12, gap: 10, backgroundColor: Colors.brandGreen, borderTopWidth: 1, borderTopColor: Colors.brandGreen, alignItems: 'flex-end' },
  input: { flex: 1, backgroundColor: Colors.white, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, color: Colors.charcoal, maxHeight: 120 },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#FFD700', justifyContent: 'center', alignItems: 'center', marginBottom: 2 },
  imagesWrap: { paddingHorizontal: 16, paddingBottom: 10, gap: 8 },
  postImage: { width: '100%', height: 200, borderRadius: 12, backgroundColor: Colors.lightGrey },
  // Post menu modal
  menuOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  menuSheet: { backgroundColor: Colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16, paddingBottom: 32 },
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
  menuHandle: { width: 40, height: 4, backgroundColor: Colors.lightGrey, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, paddingHorizontal: 8, borderRadius: 12 },
  menuItemIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#FFF0F0', justifyContent: 'center', alignItems: 'center' },
  menuItemTextDanger: { fontSize: 16, fontWeight: '700', color: '#E53935' },
  menuItemTextWarn: { fontSize: 16, fontWeight: '700', color: '#E65100' },
  menuItemText: { fontSize: 16, fontWeight: '700', color: Colors.charcoal },
  menuCancelBtn: { backgroundColor: Colors.brandGreenPale, borderRadius: 14, justifyContent: 'center', marginTop: 8 },
  menuCancelText: { fontSize: 16, fontWeight: '700', color: Colors.brandGreen, textAlign: 'center', flex: 1 },
  reportSheet: { backgroundColor: Colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden' },
  reportHeaderBar: { backgroundColor: Colors.brandGreen, paddingTop: 14, paddingBottom: 16, paddingHorizontal: 20, alignItems: 'center' },
  reportTitle: { fontSize: 19, fontWeight: '800', color: Colors.white, textAlign: 'center', marginBottom: 4 },
  reportSubtitle: { fontSize: 13, color: 'rgba(255,255,255,0.85)', textAlign: 'center' },
  reportPad: { padding: 16, paddingBottom: 32 },
  reasonChip: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 14, borderRadius: 14, backgroundColor: '#FAFAFA', borderWidth: 1.5, borderColor: '#EFEFEF', marginBottom: 9, borderLeftWidth: 4, borderLeftColor: 'transparent' },
  reasonChipActive: { backgroundColor: Colors.brandGreenPale, borderColor: Colors.brandGreen, borderLeftColor: Colors.brandGreen },
  reasonChipText: { fontSize: 15, color: Colors.charcoal, fontWeight: '600' },
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