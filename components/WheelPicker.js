import { useRef, useState, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { Colors } from '../constants/theme';

const ITEM_HEIGHT = 44;
const VISIBLE_ITEMS = 5; // odd, so there's a clear single centered row
const WHEEL_HEIGHT = ITEM_HEIGHT * VISIBLE_ITEMS;
const CENTER_OFFSET = ITEM_HEIGHT * Math.floor(VISIBLE_ITEMS / 2);

/**
 * A vertically-scrolling wheel picker (like a native date picker): the
 * item centered in the highlighted band is the selected value. Snaps
 * cleanly to each row and highlights whichever item is centered as you
 * scroll, not just after you stop.
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

  const scrollToIndex = (index) => {
    listRef.current?.scrollToOffset({ offset: index * ITEM_HEIGHT, animated: true });
  };

  return (
    <View style={{ height: WHEEL_HEIGHT, width: '100%' }}>
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
          const isCentered = index === centeredIndex;
          return (
            <View style={styles.item} onTouchEnd={() => scrollToIndex(index)}>
              <Text style={[styles.itemText, isCentered && styles.itemTextSelected]}>{item.label}</Text>
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
    left: 0, right: 0, height: ITEM_HEIGHT,
    backgroundColor: '#F4F9F6',
    borderTopWidth: 1, borderBottomWidth: 1,
    borderColor: '#D7E9DF',
  },
  item: { height: ITEM_HEIGHT, justifyContent: 'center', alignItems: 'center' },
  itemText: { fontSize: 17, color: Colors.midGrey },
  itemTextSelected: { fontSize: 19, fontWeight: '800', color: Colors.brandGreen },
});
