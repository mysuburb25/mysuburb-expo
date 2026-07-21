import { Text, Linking, Alert } from 'react-native';

// Matches http(s):// URLs and bare www. URLs (people often paste links
// without the protocol). Deliberately doesn't try to catch every
// possible URL shape — this covers the vast majority of real-world
// pastes (YouTube links, business websites, etc.) without the
// false-positive risk of a more aggressive pattern.
const URL_REGEX = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;

async function openLink(url) {
  const normalized = url.startsWith('http') ? url : `https://${url}`;
  try {
    const supported = await Linking.canOpenURL(normalized);
    if (supported) {
      await Linking.openURL(normalized);
    } else {
      Alert.alert('Cannot open link', 'This link could not be opened.');
    }
  } catch (e) {
    Alert.alert('Cannot open link', 'This link could not be opened.');
  }
}

/**
 * Renders `text` with any URLs inside it as tappable links, leaving
 * everything else as normal text. Falls back to a plain <Text> when
 * there's nothing to link, so this is a safe drop-in replacement
 * wherever post content/description is currently rendered directly.
 */
export default function LinkifiedText({ text, style, linkStyle, numberOfLines }) {
  if (!text) return null;

  const parts = [];
  let lastIndex = 0;
  let match;
  const regex = new RegExp(URL_REGEX);
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', value: text.slice(lastIndex, match.index) });
    }
    parts.push({ type: 'link', value: match[0] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push({ type: 'text', value: text.slice(lastIndex) });
  }

  const hasLink = parts.some(p => p.type === 'link');
  if (!hasLink) {
    return <Text style={style} numberOfLines={numberOfLines}>{text}</Text>;
  }

  return (
    <Text style={style} numberOfLines={numberOfLines}>
      {parts.map((part, i) =>
        part.type === 'link' ? (
          <Text key={i} style={linkStyle} onPress={() => openLink(part.value)}>
            {part.value}
          </Text>
        ) : (
          <Text key={i}>{part.value}</Text>
        )
      )}
    </Text>
  );
}
