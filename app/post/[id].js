import { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, FlatList, Modal, Image } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { doc, getDoc, collection, query, where, orderBy, getDocs, addDoc, serverTimestamp, updateDoc, increment, deleteDoc } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../context/AuthContext';
import { Colors } from '../../constants/theme';

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
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) +
    ' · ' + d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });
}

const PAGE_TITLES = {
  updates: 'Community Hub', notices: 'Community Hub', safety: 'Community Hub',
  events: 'Events', marketplace: 'Buy & Sell', lostfound: 'Lost & Found', services: 'Services',
};

const CATEGORY_LABELS = {
  updates: 'General', notices: 'Notice', safety: 'Safety Alert',
  events: 'Event', marketplace: 'Buy & Sell', services: 'Service',
};

export default function PostDetailScreen() {
  const { id } = useLocalSearchParams();
  const { user, profile } = useAuth();
  const [post, setPost] = useState(null);
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [comment, setComment] = useState('');
  const [posting, setPosting] = useState(false);
  const [liked, setLiked] = useState(false);
  const [liking, setLiking] = useState(false);
  const [showPostMenu, setShowPostMenu] = useState(false);
  const [deletingPost, setDeletingPost] = useState(false);
  const flatListRef = useRef(null);

  useEffect(() => { fetchPost(); fetchComments(); }, [id]);

  const fetchPost = async () => {
    try {
      const snap = await getDoc(doc(db, 'posts', id));
      if (snap.exists()) {
        const data = { id: snap.id, ...snap.data() };
        setPost(data);
        setLiked(data.likedBy?.includes(user?.uid) || false);
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

  const handleComment = async () => {
    if (!comment.trim()) return;
    setPosting(true);
    try {
      await addDoc(collection(db, 'comments'), {
        postId: id, content: comment.trim(),
        authorId: user.uid, authorName: profile.displayName,
        createdAt: serverTimestamp(), likeCount: 0,
      });
      await updateDoc(doc(db, 'posts', id), { commentCount: increment(1) });
      if (post.authorId !== user.uid) {
        await addDoc(collection(db, 'notifications'), {
          userId: post.authorId, type: 'comment',
          message: `${profile.displayName} commented on your post`,
          postId: id, fromUserId: user.uid, fromUserName: profile.displayName,
          isRead: false, createdAt: serverTimestamp(),
        });
      }
      setComment('');
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
    Alert.alert('Report Post', 'Thank you for reporting. Our team will review this post.');
  };

  const handleDeleteComment = (commentId) => {
    Alert.alert('Delete Comment', 'Are you sure you want to delete this comment?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            await deleteDoc(doc(db, 'comments', commentId));
            await updateDoc(doc(db, 'posts', id), { commentCount: increment(-1) });
            setComments(prev => prev.filter(c => c.id !== commentId));
            setPost(prev => ({ ...prev, commentCount: Math.max((prev.commentCount || 1) - 1, 0) }));
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
  const isOwner = post.authorId === user?.uid;
  const pageTitle = PAGE_TITLES[post.category] || 'Community Hub';
  const categoryLabel = CATEGORY_LABELS[post.category];

  const eventDate = isEvent && post.eventDate
    ? (post.eventDate.toDate ? post.eventDate.toDate() : new Date(post.eventDate))
    : null;
  const formatEventDate = (d) => d.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const formatEventTime = (d) => d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });

  const listData = [
    { type: 'post' },
    ...comments.map(c => ({ type: 'comment', ...c })),
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
                {isEvent && eventDate && (
                  <View style={styles.eventBanner}>
                    <View style={styles.eventDateBox}>
                      <Text style={styles.eventDay}>{eventDate.getDate()}</Text>
                      <Text style={styles.eventMonth}>{eventDate.toLocaleString('en-AU', { month: 'short' }).toUpperCase()}</Text>
                    </View>
                    <View style={styles.eventBannerInfo}>
                      <View style={styles.eventInfoRow}>
                        <Ionicons name="time-outline" size={16} color={Colors.brandGreen} />
                        <Text style={styles.eventInfoText}>{formatEventTime(eventDate)}</Text>
                      </View>
                      <View style={styles.eventInfoRow}>
                        <Ionicons name="calendar-outline" size={16} color={Colors.brandGreen} />
                        <Text style={styles.eventInfoText}>{formatEventDate(eventDate)}</Text>
                      </View>
                      {post.eventLocation ? (
                        <View style={styles.eventInfoRow}>
                          <Ionicons name="location-outline" size={16} color={Colors.brandGreen} />
                          <Text style={styles.eventInfoText}>{post.eventLocation}</Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                )}

                <View style={styles.postCard}>
                  <View style={styles.authorRow}>
                    <TouchableOpacity
                      style={styles.avatar}
                      onPress={() => {
                        if (post.authorId !== user?.uid) {
                          router.push({ pathname: '/chat/' + post.authorId, params: { userId: post.authorId, userName: post.authorName } });
                        }
                      }}
                    >
                      <Text style={styles.avatarText}>{post.authorName?.[0]?.toUpperCase()}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={{ flex: 1 }}
                      onPress={() => {
                        if (post.authorId !== user?.uid) {
                          router.push({ pathname: '/chat/' + post.authorId, params: { userId: post.authorId, userName: post.authorName } });
                        }
                      }}
                    >
                      <Text style={styles.authorName}>{post.authorName}</Text>
                      <Text style={styles.dateTime}>{formatDateTime(post.createdAt)}</Text>
                    </TouchableOpacity>
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

                  <Text style={styles.contentBold}>{post.content}</Text>

                  {/* Images */}
                  {post.images && post.images.length > 0 && (
                    <View style={styles.imagesWrap}>
                      {post.images.map((url, i) => (
                        <Image key={i} source={{ uri: url }} style={styles.postImage} resizeMode="cover" />
                      ))}
                    </View>
                  )}

                  {isLostFound && post.description ? (
                    <Text style={styles.description}>{post.description}</Text>
                  ) : null}
                  {isLostFound && post.lostFoundLocation ? (
                    <View style={styles.locationRow}>
                      <Ionicons name="location-outline" size={15} color={Colors.brandGreen} />
                      <Text style={styles.locationText}>{post.lostFoundLocation}</Text>
                    </View>
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
                      <Ionicons name={liked ? 'heart' : 'heart-outline'} size={20} color={liked ? '#E53935' : Colors.midGrey} />
                      <Text style={[styles.footerText, liked && { color: '#E53935' }]}>{post.likeCount || 0} likes</Text>
                    </TouchableOpacity>
                    <View style={styles.footerBtn}>
                      <Ionicons name="chatbubble-outline" size={20} color={Colors.midGrey} />
                      <Text style={styles.footerText}>{post.commentCount || 0} comments</Text>
                    </View>
                  </View>
                </View>

                <Text style={styles.commentsTitle}>Comments ({comments.length})</Text>
                {comments.length === 0 && (
                  <View style={styles.noComments}>
                    <Ionicons name="chatbubble-outline" size={32} color={Colors.lightGrey} />
                    <Text style={styles.noCommentsText}>Be the first to comment</Text>
                  </View>
                )}
              </View>
            );
          }

          const isMyComment = item.authorId === user?.uid;
          return (
            <View style={styles.comment}>
              <View style={styles.commentAvatar}>
                <Text style={styles.commentAvatarText}>{item.authorName?.[0]?.toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.commentAuthor}>{item.authorName}</Text>
                <Text style={styles.commentContent}>{item.content}</Text>
                <Text style={styles.commentTime}>{formatDateTime(item.createdAt)}</Text>
              </View>
              {isMyComment && (
                <TouchableOpacity onPress={() => handleDeleteComment(item.id)} style={styles.deleteCommentBtn}>
                  <Ionicons name="trash-outline" size={16} color="#E53935" />
                </TouchableOpacity>
              )}
            </View>
          );
        }}
      />

      {/* Comment Input */}
      <View style={styles.commentInputRow}>
        <TextInput
          style={styles.input}
          placeholder="Write a comment..."
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
              <TouchableOpacity style={styles.menuItem} onPress={handleReportPost}>
                <View style={styles.menuItemIcon}>
                  <Ionicons name="flag-outline" size={20} color="#E65100" />
                </View>
                <Text style={styles.menuItemTextWarn}>Report Post</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[styles.menuItem, styles.menuCancelBtn]} onPress={() => setShowPostMenu(false)}>
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
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  headerCenter: { alignItems: 'center' },
  mySuburb: { fontSize: 27, fontWeight: '800', color: Colors.white },
  suburbName: { fontSize: 17, color: '#FFD700', marginTop: 4 },
  pageHeader: { backgroundColor: Colors.brandGreenPale, paddingVertical: 10, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: Colors.lightGrey },
  pageTitle: { fontSize: 20, fontWeight: '700', color: Colors.brandGreen },
  scroll: { padding: 16, gap: 12, paddingBottom: 20 },
  eventBanner: { backgroundColor: Colors.white, borderRadius: 16, padding: 16, flexDirection: 'row', gap: 16, borderWidth: 1, borderColor: Colors.lightGrey, alignItems: 'center', marginBottom: 12 },
  eventDateBox: { width: 60, alignItems: 'center', backgroundColor: Colors.brandGreenPale, borderRadius: 12, paddingVertical: 10 },
  eventDay: { fontSize: 28, fontWeight: '800', color: Colors.brandGreen },
  eventMonth: { fontSize: 12, fontWeight: '700', color: Colors.brandGreen },
  eventBannerInfo: { flex: 1, gap: 6 },
  eventInfoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  eventInfoText: { fontSize: 14, color: Colors.charcoal, fontWeight: '500', flex: 1 },
  postCard: { backgroundColor: Colors.brandGreenPale, borderRadius: 16, borderWidth: 1, borderColor: Colors.brandGreen + '30', marginBottom: 12, overflow: 'hidden' },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16, paddingBottom: 8 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.white, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: Colors.brandGreen + '40' },
  avatarText: { fontSize: 18, fontWeight: '700', color: Colors.brandGreen },
  authorName: { fontSize: 15, fontWeight: '700', color: Colors.charcoal },
  dateTime: { fontSize: 11, color: Colors.midGrey, marginTop: 2 },
  pillTag: { backgroundColor: Colors.brandGreen, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20 },
  pillTagText: { fontSize: 14, fontWeight: '800', color: Colors.white },
  messageBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.white, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, borderWidth: 1, borderColor: Colors.brandGreen },
  messageBtnText: { fontSize: 12, fontWeight: '700', color: Colors.brandGreen },
  menuBtn: { padding: 4 },
  contentBold: { fontSize: 17, color: Colors.charcoal, lineHeight: 26, fontWeight: '700', paddingHorizontal: 16, paddingBottom: 6 },
  description: { fontSize: 14, color: Colors.charcoal, lineHeight: 22, paddingHorizontal: 16, paddingBottom: 6 },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingBottom: 8 },
  locationText: { fontSize: 14, color: Colors.charcoal },
  detailRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 8 },
  priceTag: { fontSize: 18, fontWeight: '800', color: Colors.brandGreen },
  freeTag: { backgroundColor: Colors.white, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  freeTagText: { fontSize: 13, fontWeight: '700', color: Colors.brandGreen },
  seekingTag: { backgroundColor: '#E3F2FD', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  seekingTagText: { fontSize: 13, fontWeight: '700', color: '#0D47A1' },
  footer: { flexDirection: 'row', gap: 16, alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: Colors.white, borderTopWidth: 1, borderTopColor: Colors.lightGrey },
  footerBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  footerText: { fontSize: 14, color: Colors.midGrey, fontWeight: '600' },
  commentsTitle: { fontSize: 16, fontWeight: '700', color: Colors.charcoal, marginBottom: 8 },
  noComments: { alignItems: 'center', paddingVertical: 16, gap: 8 },
  noCommentsText: { fontSize: 14, color: Colors.midGrey },
  comment: { backgroundColor: Colors.white, borderRadius: 12, padding: 12, flexDirection: 'row', gap: 10, borderWidth: 1, borderColor: Colors.lightGrey, marginBottom: 8 },
  commentAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.brandGreenPale, justifyContent: 'center', alignItems: 'center' },
  inputAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.white, justifyContent: 'center', alignItems: 'center', marginBottom: 2 },
  commentAvatarText: { fontSize: 14, fontWeight: '700', color: Colors.brandGreen },
  commentAuthor: { fontSize: 13, fontWeight: '700', color: Colors.charcoal },
  commentContent: { fontSize: 14, fontWeight: '500', color: Colors.charcoal, marginTop: 2, lineHeight: 20 },
  commentTime: { fontSize: 11, color: Colors.midGrey, marginTop: 4 },
  deleteCommentBtn: { padding: 6, justifyContent: 'center' },
  commentInputRow: { flexDirection: 'row', padding: 12, gap: 10, backgroundColor: Colors.brandGreen, borderTopWidth: 1, borderTopColor: Colors.brandGreen, alignItems: 'flex-end' },
  input: { flex: 1, backgroundColor: Colors.white, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, color: Colors.charcoal, maxHeight: 120 },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#FFD700', justifyContent: 'center', alignItems: 'center', marginBottom: 2 },
  imagesWrap: { paddingHorizontal: 16, paddingBottom: 10, gap: 8 },
  postImage: { width: '100%', height: 200, borderRadius: 12, backgroundColor: Colors.lightGrey },
  // Post menu modal
  menuOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  menuSheet: { backgroundColor: Colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16, paddingBottom: 32 },
  menuHandle: { width: 40, height: 4, backgroundColor: Colors.lightGrey, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, paddingHorizontal: 8, borderRadius: 12 },
  menuItemIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#FFF0F0', justifyContent: 'center', alignItems: 'center' },
  menuItemTextDanger: { fontSize: 16, fontWeight: '700', color: '#E53935' },
  menuItemTextWarn: { fontSize: 16, fontWeight: '700', color: '#E65100' },
  menuCancelBtn: { backgroundColor: Colors.brandGreenPale, borderRadius: 14, justifyContent: 'center', marginTop: 8 },
  menuCancelText: { fontSize: 16, fontWeight: '700', color: Colors.brandGreen, textAlign: 'center', flex: 1 },
});