import { Text, Linking, Alert } from 'react-native';

// Splits `text` around every occurrence of `email`, rendering the email
// portion as a tappable mailto: link and everything else as plain text.
// Mirrors the existing renderTextWithMentions helper's approach (nested
// <Text> children within one parent <Text>, rather than a separate
// component per email) so styling and line-wrapping behave the same way
// paragraph text already does elsewhere in the app.
export function renderTextWithEmail(text, email, textStyle, linkStyle) {
  if (!text || !text.includes(email)) {
    return <Text style={textStyle}>{text}</Text>;
  }

  const parts = text.split(email);
  const openEmail = () => {
    Linking.openURL(`mailto:${email}`).catch(() =>
      Alert.alert('Error', 'Could not open your email app.')
    );
  };

  return (
    <Text style={textStyle}>
      {parts.map((part, i) => (
        <Text key={i}>
          {part}
          {i < parts.length - 1 && (
            <Text style={linkStyle} onPress={openEmail}>{email}</Text>
          )}
        </Text>
      ))}
    </Text>
  );
}
