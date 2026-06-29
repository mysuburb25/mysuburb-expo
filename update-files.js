const fs = require('fs');

// Fix bottom tab bar - shorter labels
let layout = fs.readFileSync('app/(tabs)/_layout.js', 'utf8');

layout = layout.replace("tabBarLabel: 'Lost & Found',", "tabBarLabel: 'Lost+Found',");
layout = layout.replace("tabBarLabel: 'Buy & Sell',", "tabBarLabel: 'Buy&Sell',");
layout = layout.replace(
  /tabBarLabelStyle: \{[^}]+\}/,
  "tabBarLabelStyle: { fontSize: 10, fontWeight: '600', marginTop: -2 }"
);
layout = layout.replace(
  /tabBarItemStyle: \{[^}]+\}/,
  "tabBarItemStyle: { flex: 1, alignItems: 'center', justifyContent: 'center' }"
);

fs.writeFileSync('app/(tabs)/_layout.js', layout, 'utf8');
console.log('✅ Updated _layout.js');

// Fix + button to bold SVG across all tab screens
const tabFiles = [
  'app/(tabs)/index.js',
  'app/(tabs)/events.js',
  'app/(tabs)/marketplace.js',
  'app/(tabs)/lost-found.js',
];

const boldPlus = `<Svg width="30" height="30" viewBox="0 0 30 30">
              <Line x1="15" y1="3" x2="15" y2="27" stroke="#FFD700" strokeWidth="4" strokeLinecap="round"/>
              <Line x1="3" y1="15" x2="27" y2="15" stroke="#FFD700" strokeWidth="4" strokeLinecap="round"/>
            </Svg>`;

tabFiles.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');

  // Add Svg import if not present
  if (!content.includes("import { Svg")) {
    content = content.replace(
      "import { Ionicons } from '@expo/vector-icons';",
      "import { Ionicons } from '@expo/vector-icons';\nimport Svg, { Line } from 'react-native-svg';"
    );
  }

  // Replace + icon with bold SVG
  content = content.replace(/<Ionicons name="add" size=\{[0-9]+\} color="#FFD700"[^/]*\/>/g, boldPlus);

  fs.writeFileSync(file, content, 'utf8');
  console.log('✅ Updated: ' + file);
});

console.log('\nDone!');