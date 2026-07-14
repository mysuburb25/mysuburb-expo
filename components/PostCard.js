import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AvatarWithOnlineDot from '../components/AvatarWithOnlineDot';
import { Colors } from '../constants/theme';

const CATEGORY_CONFIG = {
  updates:     { label: 'General', bg: Colors.brandGreen },
  notices:     { label: 'Notice',           bg: '#1565C0' },
  safety:      { label: 'Safety Alert',     bg: '#E65100' },
  events:      { label: 'Event',            bg: '#6A1B9A' },
  marketplace: { label: 'Buy & Sell',       bg: Colors.brandGreen },
  lostfound:   { label: 'Lost & Found',     bg: '#C62828' },
};

function formatDate(date) {
  if (!date) return '';
  const d = date.toDate ? date.toDate() : new Date(date);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function PostCard({ item, currentUserUid, newCutoff, onLikeToggle, onToggleSave, onShare }) {
  const liked = item.likedBy?.includes(currentUserUid) || false;
  const saved = item.savedBy?.includes(currentUserUid) || false;
  const catConf = CATEGORY_CONFIG[item.category] || CATEGORY_CONFIG.updates;
  const itemCreatedAt = item.createdAt?.toDate ? item.createdAt.toDate() : (item.createdAt ? new Date(item.createdAt) : null);
  const isNew = newCutoff && itemCreatedAt && itemCreatedAt > newCutoff && item.authorId !== currentUserUid;

  return (
    <TouchableOpacity style={styles.card} onPress={() => router.push('/post/' + item.id)} activeOpacity={0.85}>
      <View style={styles.cardHeader}>
        <AvatarWithOnlineDot authorId={item.authorId} photoURL={item.authorPhotoURL} name={item.authorName} />
        <View style={{ flex: 1 }}>
          <Text style={styles.authorName} numberOfLines={1}>{item.authorName}</Text>
          <Text style={styles.postedText}>{formatDate(item.createdAt)}</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
          {isNew && (
            <View style={styles.newBadge}>
              <Ionicons name="sparkles" size={10} color={Colors.brandGreen} /><Text style={styles.newBadgeText}>NEW</Text>
            </View>
          )}
          <View style={[styles.badge, { backgroundColor: catConf.bg }]}>
            <Text style={styles.badgeText}>{catConf.label}</Text>
          </View>
        </View>
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.content} numberOfLines={4}>{item.content}</Text>
      </View>
      <View style={styles.footer}>
        <TouchableOpacity style={styles.footerBtn} onPress={() => onLikeToggle(item)}>
          <Ionicons name={liked ? 'heart' : 'heart-outline'} size={18} color={liked ? '#E53935' : Colors.charcoal} />
          <Text style={[styles.footerText, liked && { color: '#E53935' }]}>{item.likeCount || 0}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.footerBtn} onPress={() => router.push('/post/' + item.id)}>
          <Ionicons name="chatbubble-outline" size={18} color={Colors.charcoal} />
          <Text style={styles.footerText}>{item.commentCount || 0}</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }} />
        <TouchableOpacity onPress={() => onToggleSave(item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name={saved ? 'bookmark' : 'bookmark-outline'} size={18} color={saved ? Colors.brandGreen : Colors.charcoal} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => onShare(item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="share-outline" size={18} color={Colors.charcoal} />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16, borderWidth: 1, borderColor: '#D5D5D5', overflow: 'hidden', backgroundColor: Colors.white,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 2,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#EDF7EF', padding: 14 },
  cardBody: { backgroundColor: Colors.white, padding: 16, gap: 8 },
  authorName: { fontSize: 17, fontWeight: '700', color: Colors.charcoal },
  postedText: { fontSize: 12, color: Colors.midGrey, fontStyle: 'italic', marginTop: 2 },
  content: { fontSize: 15, color: Colors.charcoal, lineHeight: 22 },
  footer: { flexDirection: 'row', gap: 16, alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#EFEFEF', borderTopWidth: 1.5, borderTopColor: '#E0E0E0' },
  footerBtn: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  footerText: { fontSize: 14, color: Colors.charcoal, fontWeight: '600' },
  newBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#FFD700', paddingHorizontal: 9, paddingVertical: 5, borderRadius: 12, borderWidth: 1, borderColor: Colors.brandGreen, marginBottom: 4 },
  newBadgeText: { fontSize: 11, fontWeight: '800', color: Colors.brandGreen, letterSpacing: 0.5 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  badgeText: { fontSize: 11, fontWeight: '700', color: '#fff' },
});