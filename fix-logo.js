const Jimp = require('jimp');

async function fixLogo() {
  const image = await Jimp.Jimp.read('assets/logo.png');
  
  image.scan(0, 0, image.bitmap.width, image.bitmap.height, function(x, y, idx) {
    const r = this.bitmap.data[idx];
    const g = this.bitmap.data[idx + 1];
    const b = this.bitmap.data[idx + 2];
    if (r > 200 && g > 200 && b > 200) {
      this.bitmap.data[idx] = 255;
      this.bitmap.data[idx + 1] = 255;
      this.bitmap.data[idx + 2] = 255;
    }
  });

  await image.write('assets/logo.png');
  console.log('✅ Logo background fixed to pure white!');
}

fixLogo().catch(console.error);