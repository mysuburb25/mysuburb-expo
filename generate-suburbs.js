const fs = require('fs');
const path = require('path');

const dataPath = path.join(__dirname, 'node_modules', 'aus-postcode-suburbs', 'lib', 'resources', 'aus_postcodes.json');
const raw = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

const STATE_CODES = {
  'Queensland': 'QLD',
  'New South Wales': 'NSW',
  'Victoria': 'VIC',
  'Western Australia': 'WA',
  'South Australia': 'SA',
  'Tasmania': 'TAS',
  'Australian Capital Territory': 'ACT',
  'Northern Territory': 'NT',
};

const result = {};

raw.forEach(loc => {
  if (!loc.locality || !loc.state) return;
  if (loc.type !== 'Delivery Area') return;
  const stateName = Object.keys(STATE_CODES).find(k => STATE_CODES[k] === loc.state);
  if (!stateName) return;
  if (!result[stateName]) result[stateName] = new Set();
  const name = loc.locality.split(' ').map(w => w.charAt(0) + w.slice(1).toLowerCase()).join(' ');
  result[stateName].add(name);
});

const final = {};
Object.keys(result).forEach(state => {
  final[state] = Array.from(result[state]).sort();
  console.log(state + ': ' + final[state].length + ' suburbs');
});

fs.writeFileSync('constants/suburbs.json', JSON.stringify(final));
console.log('\n✅ suburbs.json generated!');