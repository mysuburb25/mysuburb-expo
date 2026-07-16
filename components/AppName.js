import { Text } from 'react-native';

// Renders "MySuburb" as a single word with the M and S in a heavier
// weight than the rest of the word. React Native's Text component can't
// style individual characters within one string, so this splits it into
// nested <Text> spans — each inherits the outer `style` prop (color, size,
// letter-spacing, etc.) automatically, with just the M/S given a bolder
// fontWeight override. Used everywhere the app name appears in a header,
// so the branding stays consistent and only needs to change in one place.
export default function AppName({ style, boldWeight = '900' }) {
  return (
    <Text style={style}>
      <Text style={{ fontWeight: boldWeight }}>M</Text>
      y
      <Text style={{ fontWeight: boldWeight }}>S</Text>
      uburb
    </Text>
  );
}