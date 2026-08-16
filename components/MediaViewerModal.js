import { useState, useEffect, useRef } from 'react';
import { Modal, TouchableOpacity, Image, StyleSheet, FlatList, View, Text, Dimensions, Animated, PanResponder } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useVideoPlayer, VideoView } from 'expo-video';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Full-screen "big mode" for a mixed sequence of photos AND videos, in
// whatever order they were originally posted — the video-capable
// counterpart to ImageViewerModal (which stays photo-only, since it's
// also used for chat images and profile photos that never have video).
//
// Pass `media` as an array of { type: 'photo'|'video', url,
// thumbnailUrl? } in posted order, and `initialIndex` for which one was
// tapped. Swipe left/right to move between items; videos get native
// playback controls right there in the swiper, same as anywhere else
// video plays in the app. A plain tap does NOT close the viewer — that
// would conflict with tapping a video's own controls — closing is a
// deliberate swipe-down gesture instead, the same "pull to dismiss"
// pattern most full-screen media viewers use.
// onDownload is optional — when provided, a download button appears next
// to the close button, calling onDownload(currentItem, currentIndex) when
// tapped. Left out entirely by any caller that doesn't need it (this
// component is shared across several screens, most of which have no
// reason to offer downloading).
export default function MediaViewerModal({ media, initialIndex = 0, onClose, onDownload }) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const visible = !!media && media.length > 0;
  const translateY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setCurrentIndex(initialIndex);
      translateY.setValue(0);
    }
  }, [visible, initialIndex]);

  const onScrollEnd = (e) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    setCurrentIndex(idx);
  };

  // Only claims the gesture once movement is clearly more vertical than
  // horizontal — this keeps the FlatList's own left/right paging (swipe
  // between photos/videos) working normally, and only a genuine
  // downward drag triggers the dismiss gesture below.
  // Capture phase, not just bubble phase — the FlatList underneath is
  // itself a scrollable component that wants to claim touches for its
  // own gesture handling, and without onMoveShouldSetPanResponderCapture
  // specifically, the FlatList can grab the touch first, so a clearly-
  // vertical downward drag never reaches this PanResponder at all. The
  // capture handler runs before children get a say, so it reliably
  // intercepts vertical drags while still leaving horizontal swipes
  // (paging between photos/videos) alone for the FlatList to handle.
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponderCapture: (_, g) => Math.abs(g.dy) > 12 && Math.abs(g.dy) > Math.abs(g.dx) * 1.5,
      onPanResponderMove: (_, g) => {
        if (g.dy > 0) translateY.setValue(g.dy);
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy > 120 || g.vy > 0.8) {
          onClose();
        } else {
          Animated.spring(translateY, { toValue: 0, useNativeDriver: true, friction: 8 }).start();
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(translateY, { toValue: 0, useNativeDriver: true, friction: 8 }).start();
      },
    })
  ).current;

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        {visible && (
          <Animated.View style={{ flex: 1, transform: [{ translateY }] }} {...panResponder.panHandlers}>
            <FlatList
              data={media}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              keyExtractor={(_, i) => String(i)}
              initialScrollIndex={initialIndex}
              getItemLayout={(_, i) => ({ length: SCREEN_WIDTH, offset: SCREEN_WIDTH * i, index: i })}
              onMomentumScrollEnd={onScrollEnd}
              renderItem={({ item, index }) => <MediaPage item={item} isActive={index === currentIndex} onClose={onClose} />}
            />
          </Animated.View>
        )}
        {media && media.length > 1 && (
          <View style={styles.counter} pointerEvents="none">
            <Text style={styles.counterText}>{currentIndex + 1} / {media.length}</Text>
          </View>
        )}
        {onDownload && (
          <TouchableOpacity style={styles.downloadBtn} onPress={() => onDownload(media[currentIndex], currentIndex)}>
            <Ionicons name="download-outline" size={26} color="#fff" />
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
          <Ionicons name="close" size={28} color="#fff" />
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

// Its own component (not inlined in renderItem) because useVideoPlayer
// is a hook — it can't be called conditionally or inside a .map/render-
// item callback directly. Every page gets its own instance; photo pages
// simply never touch the player.
function MediaPage({ item, isActive, onClose }) {
  const videoViewRef = useRef(null);
  const isVideo = item.type === 'video';
  const [isPlaying, setIsPlaying] = useState(false);
  const player = useVideoPlayer(isVideo ? item.url : null, (p) => {
    if (p) p.loop = false;
  });

  // Same play-button overlay as the small inline players elsewhere —
  // native controls stay hidden until tapped, so without this a paused
  // video here would look identical to a photo at a glance.
  useEffect(() => {
    if (!isVideo) return;
    const sub = player.addListener('playingChange', (event) => {
      setIsPlaying(event.isPlaying);
    });
    return () => sub.remove();
  }, [player, isVideo]);

  // Autoplay the moment this page becomes the active one (scrolled fully
  // into view) — matches the request that swiping onto a video should
  // just start playing it, not require an extra tap on a play button.
  useEffect(() => {
    if (!isVideo || !isActive) return;
    player.play();
  }, [isActive, isVideo, player]);

  // Pause and rewind to the start the moment this page scrolls out of
  // view — without this, a video kept playing invisibly in the
  // background after swiping away, audio and all.
  useEffect(() => {
    if (!isVideo || isActive) return;
    player.pause();
    player.currentTime = 0;
  }, [isActive, isVideo, player]);

  if (isVideo) {
    return (
      <TouchableOpacity activeOpacity={1} onPress={onClose} style={styles.page}>
        {/* Inner no-op TouchableOpacity absorbs taps on the video itself —
            same pattern as the photo page below. Without this, tapping
            anywhere on the video (including its own native play button)
            also triggered the outer TouchableOpacity's onClose, which is
            why pressing play appeared to close the viewer and navigate
            back to the post instead of actually playing. */}
        <TouchableOpacity activeOpacity={1} onPress={() => {}}>
          <VideoView
            ref={videoViewRef}
            style={styles.video}
            player={player}
            nativeControls
            allowsFullscreen
            contentFit="contain"
          />
          {!isPlaying && (
            <View style={styles.playOverlay} pointerEvents="none">
              <Ionicons name="play-circle" size={64} color="rgba(255,255,255,0.92)" />
            </View>
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity activeOpacity={1} onPress={onClose} style={styles.page}>
      <TouchableOpacity activeOpacity={1} onPress={() => {}}>
        <Image source={{ uri: item.url }} style={styles.image} resizeMode="contain" />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center' },
  page: { width: SCREEN_WIDTH, justifyContent: 'center', alignItems: 'center' },
  image: { width: SCREEN_WIDTH, height: '90%' },
  video: { width: SCREEN_WIDTH, height: '90%' },
  playOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center' },
  closeBtn: { position: 'absolute', top: 56, right: 20, padding: 8 },
  downloadBtn: { position: 'absolute', top: 56, right: 64, padding: 8 },
  counter: { position: 'absolute', top: 60, alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 12 },
  counterText: { color: '#fff', fontSize: 13, fontWeight: '700' },
});