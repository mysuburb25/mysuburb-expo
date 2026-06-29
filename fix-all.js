const fs = require('fs');
const path = require('path');

const dirs = ['app', 'app/(tabs)', 'app/(auth)', 'context', 'constants'];

let totalFixed = 0;

dirs.forEach(dir => {
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.js'));
  files.forEach(file => {
    const filePath = path.join(dir, file);
    let content = fs.readFileSync(filePath, 'utf8');
    const original = content;

    // Fix 1: \n inside single-quoted JSX strings — replace with space
    content = content.replace(/'\s*\\n\s*'/g, "' '");

    // Fix 2: apostrophes inside template literal JSX text that break strings
    // e.g. "can't" "don't" "user's" inside JSX Text — these are fine in JSX but break in JS strings
    // Replace curly apostrophes with straight ones
    content = content.replace(/\u2019/g, "'");
    content = content.replace(/\u2018/g, "'");

    // Fix 3: unterminated strings caused by apostrophe in words inside Alert.alert strings
    // Already handled by using double quotes for Alert strings - no action needed

    // Fix 4: Remove any stray \n in Alert.alert calls
    content = content.replace(/Alert\.alert\(([^)]+)\)/g, (match) => {
      return match.replace(/\\n/g, ' ');
    });

    if (content !== original) {
      fs.writeFileSync(filePath, content, 'utf8');
      console.log('✅ Fixed: ' + filePath);
      totalFixed++;
    } else {
      console.log('✓ OK: ' + filePath);
    }
  });
});

console.log('\nDone! Fixed ' + totalFixed + ' files.');