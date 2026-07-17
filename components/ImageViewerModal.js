import { Modal, TouchableOpacity, Image, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// Shared full-screen image viewer — used anywhere an image should be
// tappable to view larger (post images, profile photos, etc). Pass the
// currently-open image's URL (or null to keep it closed) and an onClose
// handler. Tapping anywhere, including the image itself, closes it.
export default function ImageViewerModal({ imageUrl, onClose }) {
  return (
    <Modal visible={!!imageUrl} transparent animationType="fade">
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <Image source={{ uri: imageUrl }} style={styles.image} resizeMode="contain" />
        <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
          <Ionicons name="close" size={28} color="#fff" />
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', alignItems: 'center' },
  image: { width: '100%', height: '80%' },
  closeBtn: { position: 'absolute', top: 56, right: 20, padding: 8 },
});