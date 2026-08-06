import { Text } from 'react-native';

// Renders "MySuburb" as a single plain string, not nested <Text> spans.
//
// Previously this split the word into nested spans (M and S in a bolder
// weight than the rest) so React Native could style individual
// characters — Text can't do that within one string otherwise. But
// numberOfLines/adjustsFontSizeToFit measure unreliably on Android when
// a Text node contains nested child Text spans rather than one plain
// string: the shrink calculation doesn't account for the nested pieces
// correctly, so on devices with larger system font scaling it silently
// fails to shrink at all, and the tail of the word gets clipped (e.g.
// "MySuburb" rendering as "Mysubur"). Every other text fix made this
// session relies on adjustsFontSizeToFit working correctly, which only
// holds for plain-string Text — so this trades the subtle bold M/S
// flourish for guaranteed correct shrink-to-fit behavior everywhere
// this component is used.
export default function AppName({ style }) {
  return (
    <Text style={style} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
      MySuburb
    </Text>
  );
}