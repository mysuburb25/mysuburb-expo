import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AvatarWithOnlineDot from '../components/AvatarWithOnlineDot';
import { Colors } from '../constants/theme';
import { getOrderedMedia } from '../utils/mediaOrder';
import LinkifiedText from '../components/LinkifiedText';

const CATEGORY_CONFIG = {
  updates:     { label: 'General', bg: Colors.brandGreen },
  notices:     { label: 'Notice',           bg: '#1565C0' },
  safety:      { label: 'Alert',            bg: '#E65100' },
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
  const [imgWidth, setImgWidth] = useState(0);
  const [activeImgIndex, setActiveImgIndex] = useState(0);
  const liked = item.likedBy?.includes(currentUserUid) || false;
  const saved = item.savedBy?.includes(currentUserUid) || false;
  const catConf = CATEGORY_CONFIG[item.category] || CATEGORY_CONFIG.updates;
  const itemCreatedAt = item.createdAt?.toDate ? item.createdAt.toDate() : (item.createdAt ? new Date(item.createdAt) : null);
  const isNew = newCutoff && itemCreatedAt && itemCreatedAt > newCutoff && item.authorId !== currentUserUid;

  const media = getOrderedMedia(item);

  return (
    <View style={styles.card}>
      <TouchableOpacity onPress={() => router.push('/post/' + item.id)} activeOpacity={0.85}>
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
      </TouchableOpacity>

      {media.length > 0 && (
        <View
          style={styles.imageCarouselWrap}
          onLayout={(e) => setImgWidth(e.nativeEvent.layout.width)}
        >
          {imgWidth > 0 && (
            <ScrollView
              horizontal
              pagingEnabled
              directionalLockEnabled
              showsHorizontalScrollIndicator={false}
              decelerationRate="fast"
              scrollEventThrottle={16}
              onMomentumScrollEnd={(e) => {
                const idx = Math.round(e.nativeEvent.contentOffset.x / imgWidth);
                setActiveImgIndex(idx);
              }}
            >
              {media.map((m, i) => (
                <TouchableOpacity key={i} activeOpacity={0.9} onPress={() => router.push('/post/' + item.id)}>
                  {m.type === 'video' ? (
                    <View style={{ width: imgWidth, height: 220 }}>
                      {m.thumbnailUrl ? (
                        <Image source={{ uri: m.thumbnailUrl }} style={{ width: imgWidth, height: 220 }} resizeMode="cover" />
                      ) : (
                        <View style={[{ width: imgWidth, height: 220 }, styles.videoThumbFallback]}>
                          <Ionicons name="videocam" size={32} color="#fff" />
                        </View>
                      )}
                      <View style={styles.videoPlayOverlay}>
                        <Ionicons name="play" size={20} color="#fff" />
                      </View>
                      {m.duration > 0 && (
                        <View style={styles.videoDurationBadge}>
                          <Text style={styles.videoDurationText}>{Math.floor(m.duration / 60)}:{String(m.duration % 60).padStart(2, '0')}</Text>
                        </View>
                      )}
                    </View>
                  ) : (
                    <Image source={{ uri: m.url }} style={{ width: imgWidth, height: 220 }} resizeMode="cover" />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
          {media.length > 1 && (
            <View style={styles.dotsRow}>
              {media.map((_, i) => (
                <View key={i} style={[styles.dot, i === activeImgIndex && styles.dotActive]} />
              ))}
            </View>
          )}
        </View>
      )}

      <TouchableOpacity onPress={() => router.push('/post/' + item.id)} activeOpacity={0.85}>
        <View style={styles.cardBody}>
          <LinkifiedText text={item.content} style={styles.content} linkStyle={styles.contentLink} numberOfLines={4} />
        </View>
      </TouchableOpacity>
      <View style={styles.footer}>
        <TouchableOpacity style={styles.footerBtn} onPress={() => onLikeToggle(item)}>
          <Ionicons name={liked ? 'heart' : 'heart-outline'} size={20} color={liked ? '#E53935' : Colors.charcoal} />
          <Text style={[styles.footerText, liked && { color: '#E53935' }]}>{item.likeCount || 0}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.footerBtn} onPress={() => router.push('/post/' + item.id)}>
          <Ionicons name="chatbubble-outline" size={20} color={Colors.charcoal} />
          <Text style={styles.footerText}>{item.commentCount || 0}</Text>
        </TouchableOpacity>
        <View style={styles.footerBtn}>
          <Ionicons name="eye-outline" size={19} color={Colors.midGrey} />
          <Text style={[styles.footerText, { color: Colors.midGrey }]}>{item.viewCount || 0}</Text>
        </View>
        <View style={{ flex: 1 }} />
        <TouchableOpacity onPress={() => onToggleSave(item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name={saved ? 'bookmark' : 'bookmark-outline'} size={20} color={saved ? Colors.brandGreen : Colors.charcoal} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => onShare(item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ marginLeft: 8 }}>
          <Ionicons name="share-outline" size={20} color={Colors.charcoal} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16, borderWidth: 1.5, borderColor: Colors.brandGreen, overflow: 'hidden', backgroundColor: Colors.white,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 2,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#EDF7EF', padding: 14 },
  imageCarouselWrap: { position: 'relative', backgroundColor: '#000' },
  dotsRow: { position: 'absolute', bottom: 10, alignSelf: 'center', flexDirection: 'row', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.5)' },
  dotActive: { backgroundColor: '#fff', width: 8, height: 8, borderRadius: 4 },
  cardBody: { backgroundColor: Colors.white, padding: 16, gap: 8 },
  videoThumbFallback: { backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
  videoPlayOverlay: {
    position: 'absolute', top: '50%', left: '50%', marginTop: -12, marginLeft: -12,
    width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center', alignItems: 'center',
  },
  videoDurationBadge: { position: 'absolute', bottom: 4, right: 4, backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1 },
  videoDurationText: { fontSize: 10, fontWeight: '700', color: '#fff' },
  authorName: { fontSize: 17, fontWeight: '700', color: Colors.charcoal },
  postedText: { fontSize: 12, color: Colors.midGrey, fontStyle: 'italic', marginTop: 2 },
  content: { fontSize: 15, color: Colors.charcoal, lineHeight: 22 },
  contentLink: { color: '#1565C0', textDecorationLine: 'underline' },
  footer: { flexDirection: 'row', gap: 16, alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#EFEFEF', borderTopWidth: 1.5, borderTopColor: '#E0E0E0' },
  footerBtn: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  footerText: { fontSize: 14, color: Colors.charcoal, fontWeight: '600' },
  newBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#FFD700', paddingHorizontal: 9, paddingVertical: 5, borderRadius: 12, borderWidth: 1, borderColor: Colors.brandGreen, marginBottom: 4 },
  newBadgeText: { fontSize: 11, fontWeight: '800', color: Colors.brandGreen, letterSpacing: 0.5 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  badgeText: { fontSize: 11, fontWeight: '700', color: '#fff' },
});