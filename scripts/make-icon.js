'use strict';
// Writes the app icon: a .ico for Windows, or a 1024 px .png (macOS builds turn it into the app icon).
// Usage: node scripts/make-icon.js [out.ico | out.png]
const fs = require('node:fs');
const path = require('node:path');
const { iconPng, iconIco } = require('../src/main/icon');

const makeIco = iconIco;

if (require.main === module) {
  const out = process.argv[2] || path.join(__dirname, '..', 'build', 'pulse.ico');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, out.endsWith('.png') ? iconPng(1024) : makeIco());
  console.log('wrote', out);
}
module.exports = { makeIco };
