'use strict';
// Writes build/pulse.ico from the same drawing the tray icon uses (PNG-in-ICO, 16 to 256 px).
// Usage: node scripts/make-icon.js [out.ico]
const fs = require('node:fs');
const path = require('node:path');
const { iconPng } = require('../src/main/icon');

function makeIco(sizes = [16, 24, 32, 48, 64, 128, 256]) {
  const images = sizes.map(s => ({ s, png: iconPng(s) }));
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(images.length, 4);
  const dir = Buffer.alloc(16 * images.length);
  let offset = 6 + dir.length;
  images.forEach(({ s, png }, i) => {
    const o = i * 16;
    dir[o] = s >= 256 ? 0 : s; dir[o + 1] = s >= 256 ? 0 : s;  // 0 means 256
    dir.writeUInt16LE(1, o + 4); dir.writeUInt16LE(32, o + 6);   // planes, bits per pixel
    dir.writeUInt32LE(png.length, o + 8); dir.writeUInt32LE(offset, o + 12);
    offset += png.length;
  });
  return Buffer.concat([header, dir, ...images.map(i => i.png)]);
}

if (require.main === module) {
  // .ico for Windows; a .png path writes a 1024 px image (macOS builds turn it into the app icon)
  const out = process.argv[2] || path.join(__dirname, '..', 'build', 'pulse.ico');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, out.endsWith('.png') ? iconPng(1024) : makeIco());
  console.log('wrote', out);
}
module.exports = { makeIco };
