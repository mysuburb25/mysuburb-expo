import { Text } from 'react-native';
import { router } from 'expo-router';

// Splits text on @token patterns and turns any token matching a known
// mention into a tappable, styled span linking to that user's profile.
// Requires the resolved `mentions` array stored on the post/comment
// (see MentionInput) — a plain regex over the text alone can't reliably
// tell us which account "@JohnSmith" refers to, since names aren't
// guaranteed unique. Any @token NOT in the mentions array (e.g. someone
// typed "@" without picking a suggestion) just renders as plain text.
export function renderTextWithMentions(text, mentions, textStyle, mentionStyle) {
  if (!text) return null;
  if (!mentions || mentions.length === 0) {
    return <Text style={textStyle}>{text}</Text>;
  }

  const mentionMap = new Map(mentions.map(m => [m.name, m.uid]));
  const regex = /@(\w+)/g;
  const parts = [];
  let lastIndex = 0;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (!mentionMap.has(match[1])) continue;
    if (match.index > lastIndex) {
      parts.push({ type: 'text', value: text.slice(lastIndex, match.index) });
    }
    parts.push({ type: 'mention', value: match[0], uid: mentionMap.get(match[1]) });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push({ type: 'text', value: text.slice(lastIndex) });
  }
  if (parts.length === 0 || (parts.length === 1 && parts[0].type === 'text')) {
    return <Text style={textStyle}>{text}</Text>;
  }

  return (
    <Text style={textStyle}>
      {parts.map((part, i) =>
        part.type === 'mention' ? (
          <Text key={i} style={mentionStyle} onPress={() => router.push('/user/' + part.uid)}>
            {part.value}
          </Text>
        ) : (
          <Text key={i}>{part.value}</Text>
        )
      )}
    </Text>
  );
}
