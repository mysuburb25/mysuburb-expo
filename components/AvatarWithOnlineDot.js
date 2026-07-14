import { View, Text, Image, StyleSheet } from 'react-native';
import useOnlineStatus from '../utils/useOnlineStatus';
import { Colors } from '../constants/theme';

// A small shared component so useOnlineStatus can be called safely from
// inside a FlatList's renderItem — each instance created via JSX (as
// <AvatarWithOnlineDot .../>) gets its own proper hook state per list
// item, unlike calling the hook directly inside an inline renderItem
// function, which isn't safe under React's rules of hooks.
export default function AvatarWithOnlineDot({ authorId, photoURL, name, size = 34, dotBorderColor = '#EDF7EF' }) {
  const isOnline = useOnlineStatus(authorId);
  const imageSize = size - 4;

  return (
    <View style={styles.wrap}>
      <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
        {photoURL ? (
          <Image source={{ uri: photoURL }} style={{ width: imageSize, height: imageSize, borderRadius: imageSize / 2 }} />
        ) : (
          <Text style={styles.avatarText}>{name?.[0]?.toUpperCase() || '?'}</Text>
        )}
      </View>
      {isOnline && <View style={[styles.onlineDot, { borderColor: dotBorderColor }]} />}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'relative' },
  avatar: { backgroundColor: Colors.white, borderWidth: 2, borderColor: Colors.brandGreen, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  avatarText: { fontSize: 15, fontWeight: '700', color: Colors.brandGreen },
  onlineDot: { position: 'absolute', bottom: -1, right: -1, width: 11, height: 11, borderRadius: 6, backgroundColor: '#4CAF50', borderWidth: 2 },
});