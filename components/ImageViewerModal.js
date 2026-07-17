import { useState, useEffect } from 'react';
import { Modal, TouchableOpacity, Image, StyleSheet, FlatList, View, Text, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Shared full-screen image viewer — used anywhere an image should be
// tappable to view larger (post images, chat photos, profile photos,
// etc). Pass `images` (an array of URLs — or null/empty to keep it
// closed) and `initialIndex` (which one was tapped). When there's more
// than one image, swipe left/right to browse the rest, with a page
// counter at the top. Tapping the image or the close button closes it.
export default function ImageViewerModal({ images, initialIndex = 0, onClose }) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const visible = !!images && images.length > 0;

  // Reset to the tapped image each time the viewer is freshly opened,
  // rather than remembering wherever it was left after a previous swipe.
  useEffect(() => {
    if (visible) setCurrentIndex(initialIndex);
  }, [visible, initialIndex]);

  const onScrollEnd = (e) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    setCurrentIndex(idx);
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        {visible && (
          <FlatList
            data={images}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            keyExtractor={(_, i) => String(i)}
            initialScrollIndex={initialIndex}
            getItemLayout={(_, i) => ({ length: SCREEN_WIDTH, offset: SCREEN_WIDTH * i, index: i })}
            onMomentumScrollEnd={onScrollEnd}
            renderItem={({ item }) => (
              <TouchableOpacity activeOpacity={1} onPress={onClose} style={styles.page}>
                <Image source={{ uri: item }} style={styles.image} resizeMode="contain" />
              </TouchableOpacity>
            )}
          />
        )}
        {images && images.length > 1 && (
          <View style={styles.counter}>
            <Text style={styles.counterText}>{currentIndex + 1} / {images.length}</Text>
          </View>
        )}
        <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
          <Ionicons name="close" size={28} color="#fff" />
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center' },
  page: { width: SCREEN_WIDTH, justifyContent: 'center', alignItems: 'center' },
  image: { width: SCREEN_WIDTH, height: '80%' },
  closeBtn: { position: 'absolute', top: 56, right: 20, padding: 8 },
  counter: { position: 'absolute', top: 60, alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 12 },
  counterText: { color: '#fff', fontSize: 13, fontWeight: '700' },
});