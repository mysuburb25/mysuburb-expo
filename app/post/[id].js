import { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, FlatList } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { doc, getDoc, collection, query, where, orderBy, getDocs, addDoc, serverTimestamp, updateDoc, increment } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../context/AuthContext';
import { Colors } from '../../constants/theme';
import { sendNotification } from '../../utils/notifications';

function timeAgo(date) {
  if (!date) return '';
  const d = date.toDate ? date.toDate() : new Date(date);
  const seconds = Math.floor((new Date() - d) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago';
  if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago';
  return Math.floor(seconds / 86400) + 'd ago';
}

const CATEGORY_COLORS = {
  updates:     { bg: '#E8F5E9', text: '#1B4332', label: 'HAPPENING' },
  notices:     { bg: '#E3F2FD', text: '#0D47A1', label: 'NOTICE' },
  safety:      { bg: '#FFF3E0', text: '#E65100', label: 'SAFETY' },
  events:      { bg: '#F3E5F5', text: '#6A1B9A', label: 'EVENT' },
  marketplace: { bg: '#E8F5E9', text: '#1B4332', label: 'MARKETPLACE' },
  lostfound:   { bg: '#FFF3E0', text: '#E65100', label: 'LOST & FOUND' },
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
        await sendNotification({
          toUserId: post.authorId,
          fromUserName: profile.displayName,
          type: 'like',
          message: `${profile.displayName} liked your post`,
          postId: id,
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
        postId: id,
        content: comment.trim(),
        authorId: user.uid,
        authorName: profile.displayName,
        createdAt: serverTimestamp(),
        likeCount: 0,
      });
      await updateDoc(doc(db, 'posts', id), { commentCount: increment(1) });

      await sendNotification({
        toUserId: post.authorId,
        fromUserName: profile.displayName,
        type: 'comment',
        message: `${profile.displayName} commented on your post`,
        postId: id,
      });

      setComment('');
      setPost(prev => ({ ...prev, commentCount: (prev.commentCount || 0) + 1 }));
      await fetchComments();
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (e) { Alert.alert('Error', e.message); }
    finally { setPosting(false); }
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
  const catStyle = CATEGORY_COLORS[post.category] || CATEGORY_COLORS.updates;
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
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
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
                <View style={[styles.categoryBadge, { backgroundColor: catStyle.bg }]}>
                  <Text style={[styles.categoryBadgeText, { color: catStyle.text }]}>{catStyle.label}</Text>
                </View>

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

                <View style={styles.postCardGreen}>
                  <View style={styles.authorRow}>
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>{post.authorName?.[0]?.toUpperCase()}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.authorName}>{post.authorName}</Text>
                      <Text style={styles.time}>{timeAgo(post.createdAt)}</Text>
                    </View>
                  </View>
                  <Text style={styles.contentBold}>{post.content}</Text>

                  {post.category === 'marketplace' && (
                    <View style={styles.detailRow}>
                      {post.price > 0 && <Text style={styles.priceTag}>${post.price?.toFixed(2)}</Text>}
                      {post.isFree && <View style={styles.freeTag}><Text style={styles.freeTagText}>FREE</Text></View>}
                      {post.isWanted && <View style={styles.seekingTag}><Text style={styles.seekingTagText}>SEEKING</Text></View>}
                    </View>
                  )}

                  {post.category === 'lostfound' && post.lostFoundType && (
                    <View style={[styles.lostFoundBadge, { backgroundColor: post.lostFoundType === 'lost' ? '#FFF3E0' : Colors.white }]}>
                      <Text style={[styles.lostFoundText, { color: post.lostFoundType === 'lost' ? '#E65100' : Colors.brandGreen }]}>
                        {post.lostFoundType.toUpperCase()}
                      </Text>
                    </View>
                  )}

                  <View style={styles.footer}>
                    <TouchableOpacity style={styles.footerBtn} onPress={handleLike} disabled={liking}>
                      <Ionicons name={liked ? 'heart' : 'heart-outline'} size={20} color={liked ? '#E53935' : Colors.brandGreen} />
                      <Text style={[styles.footerText, liked && { color: '#E53935' }]}>{post.likeCount || 0} likes</Text>
                    </TouchableOpacity>
                    <View style={styles.footerBtn}>
                      <Ionicons name="chatbubble-outline" size={20} color={Colors.brandGreen} />
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

          return (
            <View style={styles.comment}>
              <View style={styles.commentAvatar}>
                <Text style={styles.commentAvatarText}>{item.authorName?.[0]?.toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.commentAuthor}>{item.authorName}</Text>
                <Text style={styles.commentContent}>{item.content}</Text>
                <Text style={styles.commentTime}>{timeAgo(item.createdAt)}</Text>
              </View>
            </View>
          );
        }}
      />

      <View style={styles.commentInputRow}>
        <View style={styles.inputAvatar}>
          <Text style={styles.commentAvatarText}>{profile?.displayName?.[0]?.toUpperCase() || '?'}</Text>
        </View>
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
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  topHeader: { backgroundColor: Colors.brandGreen, paddingTop: 56, paddingBottom: 16, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  headerCenter: { alignItems: 'center' },
  mySuburb: { fontSize: 27, fontWeight: '800', color: Colors.white },
  suburbName: { fontSize: 17, color: '#FFD700', marginTop: 4 },
  scroll: { padding: 16, gap: 12, paddingBottom: 20 },
  categoryBadge: { alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, marginBottom: 12 },
  categoryBadgeText: { fontSize: 13, fontWeight: '700' },
  eventBanner: { backgroundColor: Colors.white, borderRadius: 16, padding: 16, flexDirection: 'row', gap: 16, borderWidth: 1, borderColor: Colors.lightGrey, alignItems: 'center', marginBottom: 12 },
  eventDateBox: { width: 60, alignItems: 'center', backgroundColor: Colors.brandGreenPale, borderRadius: 12, paddingVertical: 10 },
  eventDay: { fontSize: 28, fontWeight: '800', color: Colors.brandGreen },
  eventMonth: { fontSize: 12, fontWeight: '700', color: Colors.brandGreen },
  eventBannerInfo: { flex: 1, gap: 6 },
  eventInfoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  eventInfoText: { fontSize: 14, color: Colors.charcoal, fontWeight: '500', flex: 1 },
  postCardGreen: { backgroundColor: Colors.brandGreenPale, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: Colors.brandGreen + '40', marginBottom: 12 },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.white, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: Colors.brandGreen + '40' },
  avatarText: { fontSize: 18, fontWeight: '700', color: Colors.brandGreen },
  authorName: { fontSize: 15, fontWeight: '700', color: Colors.charcoal },
  time: { fontSize: 12, color: Colors.midGrey, marginTop: 2 },
  contentBold: { fontSize: 17, color: Colors.charcoal, lineHeight: 26, marginBottom: 8, fontWeight: '700' },
  detailRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  priceTag: { fontSize: 18, fontWeight: '800', color: Colors.brandGreen },
  freeTag: { backgroundColor: Colors.white, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  freeTagText: { fontSize: 13, fontWeight: '700', color: Colors.brandGreen },
  seekingTag: { backgroundColor: '#E3F2FD', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  seekingTagText: { fontSize: 13, fontWeight: '700', color: '#0D47A1' },
  lostFoundBadge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, marginBottom: 8 },
  lostFoundText: { fontSize: 13, fontWeight: '700' },
  footer: { flexDirection: 'row', gap: 16, alignItems: 'center', paddingTop: 12, borderTopWidth: 1, borderTopColor: Colors.brandGreen + '30', marginTop: 8 },
  footerBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  footerText: { fontSize: 14, color: Colors.brandGreen, fontWeight: '600' },
  commentsTitle: { fontSize: 16, fontWeight: '700', color: Colors.charcoal, marginBottom: 8 },
  noComments: { alignItems: 'center', paddingVertical: 24, gap: 8 },
  noCommentsText: { fontSize: 14, color: Colors.midGrey },
  comment: { backgroundColor: Colors.white, borderRadius: 12, padding: 12, flexDirection: 'row', gap: 10, borderWidth: 1, borderColor: Colors.lightGrey, marginBottom: 8 },
  commentAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.brandGreenPale, justifyContent: 'center', alignItems: 'center' },
  commentAvatarText: { fontSize: 14, fontWeight: '700', color: Colors.brandGreen },
  commentAuthor: { fontSize: 13, fontWeight: '700', color: Colors.charcoal },
  commentContent: { fontSize: 14, fontWeight: '500', color: Colors.charcoal, marginTop: 2, lineHeight: 20 },
  commentTime: { fontSize: 11, color: Colors.midGrey, marginTop: 4 },
  commentInputRow: { flexDirection: 'row', padding: 12, gap: 10, backgroundColor: Colors.white, borderTopWidth: 1, borderTopColor: Colors.lightGrey, alignItems: 'flex-end' },
  inputAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.brandGreenPale, justifyContent: 'center', alignItems: 'center', marginBottom: 2 },
  input: { flex: 1, backgroundColor: '#F5F5F5', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, color: Colors.charcoal, maxHeight: 120 },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.brandGreen, justifyContent: 'center', alignItems: 'center', marginBottom: 2 },
});