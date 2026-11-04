'use strict';
// Records the Mac build in website/version.json, so the site shows "Download for Mac".
// Get the .dmg first:  gh run download <run-id> --name Pulse-mac --dir release-mac
//
//   node scripts/add-mac.js [path/to/Pulse-mac-universal.dmg] [--signed]
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.join(__dirname, '..');
const RELEASES_REPO = 'im-Amrith/Pulse-releases';
const dmg = process.argv.slice(2).find(a => !a.startsWith('--')) || path.join(ROOT, 'release-mac', 'Pulse-mac-universal.dmg');
const signed = process.argv.includes('--signed');
if (!fs.existsSync(dmg)) { console.error(`Not found: ${dmg}`); process.exit(1); }

const vfile = path.join(ROOT, 'website', 'version.json');
const info = JSON.parse(fs.readFileSync(vfile, 'utf8'));
const version = require('../package.json').version;
if (info.version !== version) { console.error(`version.json is for ${info.version}, package.json is ${version}. Run npm run release first.`); process.exit(1); }

const bytes = fs.statSync(dmg).size;
info.mac = {
  sizeMB: Math.round(bytes / 1048576),
  sha256: crypto.createHash('sha256').update(fs.readFileSync(dmg)).digest('hex'),
  signed,
  download: `https://github.com/${RELEASES_REPO}/releases/latest/download/Pulse-mac-universal.dmg`,
};
fs.writeFileSync(vfile, JSON.stringify(info, null, 2) + '\n');
console.log(`Mac ${version}: ${info.mac.sizeMB} MB, ${signed ? 'signed' : 'not notarized'}`);
