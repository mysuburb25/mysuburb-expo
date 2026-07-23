import { useRef, useState, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { Colors } from '../constants/theme';

const ITEM_HEIGHT = 44;
const VISIBLE_ITEMS = 3; // odd, so there's a clear single centered row — kept small so there's minimal empty space above the first item
const WHEEL_HEIGHT = ITEM_HEIGHT * VISIBLE_ITEMS;
const CENTER_OFFSET = ITEM_HEIGHT * Math.floor(VISIBLE_ITEMS / 2);

/**
 * A vertically-scrolling wheel picker (like a native date picker): the
 * item centered in the highlighted band is the selected value. Snaps
 * cleanly to each row and highlights whichever item is centered as you
 * scroll, not just after you stop. Items fade and shrink slightly the
 * further they sit from center, giving a bit of the natural depth a
 * native wheel picker has, rather than a flat list of equal-weight rows.
 *
 * @param data - array of { label, value }
 * @param selectedValue - currently committed value
 * @param onValueChange - called once scrolling settles on a new value
 */
export default function WheelPicker({ data, selectedValue, onValueChange }) {
  const listRef = useRef(null);
  const initialIndex = Math.max(0, data.findIndex(d => d.value === selectedValue));
  const [centeredIndex, setCenteredIndex] = useState(initialIndex);

  const handleScroll = useCallback((e) => {
    const index = Math.round(e.nativeEvent.contentOffset.y / ITEM_HEIGHT);
    const clamped = Math.max(0, Math.min(data.length - 1, index));
    setCenteredIndex(clamped);
  }, [data.length]);

  const handleMomentumEnd = useCallback((e) => {
    const index = Math.round(e.nativeEvent.contentOffset.y / ITEM_HEIGHT);
    const clamped = Math.max(0, Math.min(data.length - 1, index));
    onValueChange(data[clamped].value);
  }, [data, onValueChange]);

  return (
    <View style={{ height: WHEEL_HEIGHT, flex: 1 }}>
      <View style={styles.centerHighlight} pointerEvents="none" />
      <FlatList
        ref={listRef}
        data={data}
        keyExtractor={(item) => String(item.value)}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_HEIGHT}
        decelerationRate="fast"
        getItemLayout={(_, index) => ({ length: ITEM_HEIGHT, offset: ITEM_HEIGHT * index, index })}
        initialScrollIndex={initialIndex}
        contentContainerStyle={{ paddingVertical: CENTER_OFFSET }}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        onMomentumScrollEnd={handleMomentumEnd}
        renderItem={({ item, index }) => {
          const distance = Math.abs(index - centeredIndex);
          const isCentered = distance === 0;
          // Fades and shrinks progressively further from center — one
          // row away is still clearly readable, two+ rows away recedes
          // into the background, giving the wheel a sense of depth
          // instead of every row looking equally weighted.
          const fadeStyle = isCentered
            ? { opacity: 1, transform: [{ scale: 1 }] }
            : distance === 1
              ? { opacity: 0.55, transform: [{ scale: 0.92 }] }
              : { opacity: 0.28, transform: [{ scale: 0.85 }] };
          return (
            <View style={styles.item}>
              <Text style={[styles.itemText, isCentered && styles.itemTextSelected, fadeStyle]}>
                {item.label}
              </Text>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  centerHighlight: {
    position: 'absolute',
    top: CENTER_OFFSET,
    left: 4, right: 4, height: ITEM_HEIGHT,
    backgroundColor: Colors.brandGreenPale,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.brandGreen + '30',
    shadowColor: Colors.brandGreen,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
    elevation: 1,
  },
  item: { height: ITEM_HEIGHT, justifyContent: 'center', alignItems: 'center' },
  itemText: { fontSize: 16, color: Colors.midGrey, fontWeight: '500' },
  itemTextSelected: { fontSize: 19, fontWeight: '800', color: Colors.brandGreen },
});