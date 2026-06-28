import { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, Alert, ActivityIndicator } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { doc, getDoc, collection, query, where, orderBy, getDocs, addDoc, serverTimestamp, updateDoc, increment } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../context/AuthContext';
import { Colors } from '../../constants/theme';

export default function PostDetailScreen() {
  const { id } = useLocalSearchParams();
  const { user, profile } = useAuth();
  const [post, setPost] = useState(null);
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [comment, setComment] = useState('');
  const [posting, setPosting] = useState(false);

  useEffect(() => { fetchPost(); fetchComments(); }, [id]);

  const fetchPost = async () => {
    try {
      const snap = await getDoc(doc(db, 'posts', id));
      if (snap.exists()) setPost({ id: snap.id, ...snap.data() });
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

  const handleComment = async () => {
    if (!comment.trim()) return;
    setPosting(true);
    try {
      await addDoc(collection(db, 'comments'), { postId: id, content: comment.trim(), authorId: user.uid, authorName: profile.displayName, createdAt: serverTimestamp(), likeCount: 0 });
      await updateDoc(doc(db, 'posts', id), { commentCount: increment(1) });
      setComment('');
      fetchComments();
    } catch (e) { Alert.alert('Error', e.message); }
    finally { setPosting(false); }
  };

  if (loading) return <ActivityIndicator style={{ flex: 1 }} color={Colors.brandGreen} size="large" />;
  if (!post) return <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}><Text>Post not found.</Text></View>;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.post}>
          <View style={styles.authorRow}>
            <View style={styles.avatar}><Text style={styles.avatarText}>{post.authorName?.[0]?.toUpperCase()}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.authorName}>{post.authorName}</Text>
              <Text style={styles.suburb}>{post.suburb}</Text>
            </View>
          </View>
          <Text style={styles.content}>{post.content}</Text>
          <View style={styles.footer}>
            <Ionicons name="heart-outline" size={18} color={Colors.midGrey} />
            <Text style={styles.footerText}>{post.likeCount || 0} likes</Text>
            <Ionicons name="chatbubble-outline" size={18} color={Colors.midGrey} />
            <Text style={styles.footerText}>{post.commentCount || 0} comments</Text>
          </View>
        </View>
        <Text style={styles.commentsTitle}>Comments ({comments.length})</Text>
        {comments.map(c => (
          <View key={c.id} style={styles.comment}>
            <View style={styles.commentAvatar}><Text style={styles.commentAvatarText}>{c.authorName?.[0]?.toUpperCase()}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.commentAuthor}>{c.authorName}</Text>
              <Text style={styles.commentContent}>{c.content}</Text>
            </View>
          </View>
        ))}
      </ScrollView>
      <View style={styles.commentInput}>
        <TextInput style={styles.input} placeholder="Write a comment..." value={comment} onChangeText={setComment} multiline />
        <TouchableOpacity style={[styles.sendBtn, posting && { opacity: 0.7 }]} onPress={handleComment} disabled={posting}>
          {posting ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="send" size={18} color="#fff" />}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.sand },
  scroll: { padding: 16, gap: 12, paddingBottom: 100 },
  post: { backgroundColor: Colors.white, borderRadius: 16, padding: 16 },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.brandGreenPale, justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: 16, fontWeight: '700', color: Colors.brandGreen },
  authorName: { fontSize: 15, fontWeight: '700', color: Colors.charcoal },
  suburb: { fontSize: 12, color: Colors.midGrey },
  content: { fontSize: 16, color: Colors.charcoal, lineHeight: 24, marginBottom: 12 },
  footer: { flexDirection: 'row', gap: 8, alignItems: 'center', paddingTop: 10, borderTopWidth: 1, borderTopColor: Colors.lightGrey },
  footerText: { fontSize: 13, color: Colors.midGrey, marginRight: 8 },
  commentsTitle: { fontSize: 16, fontWeight: '700', color: Colors.charcoal, marginTop: 8 },
  comment: { backgroundColor: Colors.white, borderRadius: 12, padding: 12, flexDirection: 'row', gap: 10 },
  commentAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.brandGreenPale, justifyContent: 'center', alignItems: 'center' },
  commentAvatarText: { fontSize: 13, fontWeight: '700', color: Colors.brandGreen },
  commentAuthor: { fontSize: 13, fontWeight: '700', color: Colors.charcoal },
  commentContent: { fontSize: 14, color: Colors.charcoal, marginTop: 2 },
  commentInput: { flexDirection: 'row', padding: 12, gap: 10, backgroundColor: Colors.white, borderTopWidth: 1, borderTopColor: Colors.lightGrey },
  input: { flex: 1, backgroundColor: Colors.sand, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14 },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.brandGreen, justifyContent: 'center', alignItems: 'center' },
});