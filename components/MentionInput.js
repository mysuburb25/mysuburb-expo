import { useState, useRef, forwardRef } from 'react';
import { View, TextInput, TouchableOpacity, Text, StyleSheet, Platform } from 'react-native';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../config/firebase';
import { Colors } from '../constants/theme';

// A controlled TextInput that shows an autocomplete dropdown of suburb
// members when the user types "@" followed by characters. Selecting a
// suggestion inserts their name (spaces stripped, e.g. "John Smith" ->
// "@JohnSmith") and records { uid, name } in the `mentions` array — that
// resolved array, not the raw text, is what makes rendering and
// notifications reliable later, since re-parsing "@JohnSmith" from text
// alone can't tell us which account that refers to.
//
// Props: value, onChangeText, mentions, onMentionsChange, suburb, state,
// plus anything else (style, placeholder, multiline, maxLength, ...)
// gets passed straight through to the underlying TextInput.
const MentionInput = forwardRef(function MentionInput({
  value, onChangeText, mentions, onMentionsChange,
  suburb, state, currentUserId, style, ...rest
}, ref) {
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionStartIndex, setMentionStartIndex] = useState(null);
  const membersCache = useRef(null);

  const fetchMembers = async () => {
    if (membersCache.current) return membersCache.current;
    if (!suburb || !state) return [];
    const key = `${state}|${suburb}`;
    try {
      const snap = await getDocs(query(collection(db, 'users'), where('activeSuburbKeys', 'array-contains', key)));
      const members = snap.docs
        .map(d => ({ uid: d.id, displayName: d.data().displayName || '' }))
        .filter(m => m.displayName && m.uid !== currentUserId);
      membersCache.current = members;
      return members;
    } catch (e) {
      console.error('MentionInput member fetch error:', e);
      return [];
    }
  };

  const handleChangeText = async (text) => {
    onChangeText(text);

    // Detect an active @mention being typed — an @ followed by
    // non-space characters, right at the end of the current text. This
    // approximates "at the cursor" without needing RN's more involved
    // cursor-position tracking, which is fine for how people actually
    // type mentions (rarely editing mid-sentence mid-mention).
    const match = text.match(/@(\w*)$/);
    if (match) {
      const q = match[1].toLowerCase();
      setMentionQuery(q);
      setMentionStartIndex(text.length - match[0].length);
      const members = await fetchMembers();
      const filtered = members
        .filter(m => m.displayName.replace(/\s/g, '').toLowerCase().startsWith(q))
        .slice(0, 5);
      setSuggestions(filtered);
      setShowSuggestions(filtered.length > 0);
    } else {
      setShowSuggestions(false);
    }
  };

  const handleSelectMention = (member) => {
    const token = member.displayName.replace(/\s/g, '');
    const before = value.slice(0, mentionStartIndex);
    const after = value.slice(mentionStartIndex + 1 + mentionQuery.length); // +1 skips the '@'
    const newText = `${before}@${token} ${after}`;
    onChangeText(newText);
    onMentionsChange([...(mentions || []), { uid: member.uid, name: token }]);
    setShowSuggestions(false);
  };

  return (
    <View style={{ flex: 1 }}>
      <TextInput
        ref={ref}
        // The wrapping View above keeps flex:1 to fill the row
        // horizontally, but the incoming `style` prop also often
        // contains flex:1 of its own — that double-flex nesting is a
        // known cause of multiline TextInput auto-grow breaking
        // specifically on Android. Scoped to Android only: applying the
        // same width:'100%' override on iOS (which never had this bug)
        // meant the input had to re-resolve its width against the
        // parent on every layout change, which is what was causing a
        // visible flash/blink each time a new line was typed there.
        style={Platform.OS === 'android' ? [style, { flex: undefined, width: '100%' }] : style}
        value={value}
        onChangeText={handleChangeText}
        {...rest}
      />
      {showSuggestions && (
        <View style={styles.suggestionBox}>
          {suggestions.map(item => (
            <TouchableOpacity key={item.uid} style={styles.suggestionItem} onPress={() => handleSelectMention(item)}>
              <View style={styles.suggestionAvatar}>
                <Text style={styles.suggestionAvatarText}>{item.displayName[0]?.toUpperCase()}</Text>
              </View>
              <Text style={styles.suggestionText}>{item.displayName}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
});

export default MentionInput;

const styles = StyleSheet.create({
  suggestionBox: { backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.lightGrey, borderRadius: 12, marginTop: 4, maxHeight: 200, overflow: 'hidden' },
  suggestionItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: Colors.lightGrey },
  suggestionAvatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.brandGreenPale, justifyContent: 'center', alignItems: 'center' },
  suggestionAvatarText: { fontSize: 12, fontWeight: '700', color: Colors.brandGreen },
  suggestionText: { fontSize: 14, color: Colors.charcoal, fontWeight: '600' },
});