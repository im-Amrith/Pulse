'use strict';
// Builds the Windows release of Pulse. The version comes from package.json and goes everywhere:
// Pulse.exe's file details, the app, the zip, and website/version.json.
//
//   npm run release
//
// Output: release/Pulse-win-x64.zip (+ .sha256) and website/version.json.
//
// Code signing runs automatically when one of these is set (otherwise the build is unsigned):
//   PULSE_SIGN_PFX=path\to\cert.pfx  PULSE_SIGN_PASSWORD=...        a certificate file
//   PULSE_SIGN_THUMBPRINT=ABC123...                                  a certificate in your Windows store or on a USB key
//   PULSE_SIGN_DLIB=...\Azure.CodeSigning.Dlib.dll PULSE_SIGN_METADATA=...\metadata.json   Azure Trusted Signing
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync, execSync } = require('node:child_process');
const rcedit = require('rcedit');
const { makeIco } = require('./make-icon');

const ROOT = path.join(__dirname, '..');
const pkg = require('../package.json');
const VERSION = pkg.version;
const PUBLISHER = 'Amrithesh S Menon';
const RELEASES_REPO = 'im-Amrith/Pulse-releases';
const DIST = path.join(ROOT, 'dist', 'Pulse');
const OUT = path.join(ROOT, 'release');
const ZIP = path.join(OUT, 'Pulse-win-x64.zip');
const step = msg => console.log(`\n> ${msg}`);

async function main() {
  step(`Building Pulse ${VERSION}`);
  fs.rmSync(path.join(ROOT, 'dist'), { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });

  step('Copying the Electron runtime');
  fs.cpSync(path.join(ROOT, 'node_modules', 'electron', 'dist'), DIST, { recursive: true });
  fs.renameSync(path.join(DIST, 'electron.exe'), path.join(DIST, 'Pulse.exe'));
  fs.rmSync(path.join(DIST, 'resources', 'default_app.asar'), { force: true });
  for (const f of fs.readdirSync(path.join(DIST, 'locales'))) if (!/^en-(US|GB)\.pak$/.test(f)) fs.rmSync(path.join(DIST, 'locales', f));

  step('Adding the app and its production dependencies');
  const app = path.join(DIST, 'resources', 'app');
  fs.mkdirSync(app, { recursive: true });
  for (const f of ['package.json', 'package-lock.json', 'LICENSE.txt', 'TERMS.txt']) fs.copyFileSync(path.join(ROOT, f), path.join(app, f));
  execFileSync(process.execPath, [path.join(__dirname, 'build-helper.js')], { stdio: 'inherit' });
  fs.cpSync(path.join(ROOT, 'src'), path.join(app, 'src'), { recursive: true, filter: f => !f.includes(path.join('src', 'native')) });
  execSync('npm install --omit=dev --no-audit --no-fund --loglevel=error', { cwd: app, stdio: 'inherit' });
  for (const f of ['LICENSE.txt', 'TERMS.txt']) fs.copyFileSync(path.join(ROOT, f), path.join(DIST, f));

  step('Setting Pulse.exe details and icon');
  const ico = path.join(ROOT, 'build', 'pulse.ico');
  fs.mkdirSync(path.dirname(ico), { recursive: true });
  fs.writeFileSync(ico, makeIco());
  await rcedit(path.join(DIST, 'Pulse.exe'), {
    icon: ico,
    'file-version': VERSION,
    'product-version': VERSION,
    'version-string': {
      ProductName: 'Pulse', FileDescription: 'Pulse', InternalName: 'Pulse', OriginalFilename: 'Pulse.exe',
      CompanyName: PUBLISHER, LegalCopyright: `Copyright © ${new Date().getFullYear()} ${PUBLISHER}. All rights reserved.`,
    },
  });

  sign(path.join(DIST, 'Pulse.exe'));
  sign(path.join(app, 'src', 'main', 'bin', 'pulse-media.exe'));

  step('Zipping');
  fs.rmSync(ZIP, { force: true });
  execFileSync('powershell.exe', ['-NoProfile', '-Command', `Compress-Archive -Path '${DIST}' -DestinationPath '${ZIP}' -CompressionLevel Optimal`], { stdio: 'inherit' });
  const bytes = fs.statSync(ZIP).size;
  const sha256 = crypto.createHash('sha256').update(fs.readFileSync(ZIP)).digest('hex');
  fs.writeFileSync(`${ZIP}.sha256`, `${sha256}  Pulse-win-x64.zip\n`);

  step('Writing website/version.json');
  const info = {
    version: VERSION,
    released: new Date().toISOString().slice(0, 10),
    sizeMB: Math.round(bytes / 1048576),
    sha256,
    signed: Boolean(signingMode()),
    download: `https://github.com/${RELEASES_REPO}/releases/latest/download/Pulse-win-x64.zip`,
    notes: `https://github.com/${RELEASES_REPO}/releases/tag/v${VERSION}`,
  };
  // keep the Mac download details (written by scripts/add-mac.js) when the Windows build is redone
  const vfile = path.join(ROOT, 'website', 'version.json');
  let prev = {}; try { prev = JSON.parse(fs.readFileSync(vfile, 'utf8')); } catch {}
  const mac = prev.version === VERSION && prev.mac ? { mac: prev.mac } : {};
  fs.writeFileSync(vfile, JSON.stringify({ ...info, ...mac }, null, 2) + '\n');
  console.log(`\nDone: ${ZIP} (${info.sizeMB} MB, ${info.signed ? 'signed' : 'unsigned'})`);
}

function signingMode() {
  const e = process.env;
  if (e.PULSE_SIGN_DLIB && e.PULSE_SIGN_METADATA) return 'azure';
  if (e.PULSE_SIGN_PFX) return 'pfx';
  if (e.PULSE_SIGN_THUMBPRINT) return 'store';
  return null;
}
function findSigntool() {
  const kits = 'C:\\Program Files (x86)\\Windows Kits\\10\\bin';
  if (!fs.existsSync(kits)) return null;
  const versions = fs.readdirSync(kits).filter(v => /^10\./.test(v)).sort().reverse();
  for (const v of versions) { const p = path.join(kits, v, 'x64', 'signtool.exe'); if (fs.existsSync(p)) return p; }
  return null;
}
function sign(file) {
  const mode = signingMode(), e = process.env;
  if (!mode) { step('Not signing (no certificate configured; see the top of scripts/release.js)'); return; }
  const tool = findSigntool();
  if (!tool) throw new Error('signtool.exe not found. Install the Windows SDK signing tools.');
  step(`Signing Pulse.exe (${mode})`);
  const common = ['sign', '/fd', 'SHA256', '/tr', 'http://timestamp.digicert.com', '/td', 'SHA256', '/d', 'Pulse'];
  const args = mode === 'azure' ? ['sign', '/fd', 'SHA256', '/tr', 'http://timestamp.acs.microsoft.com', '/td', 'SHA256', '/dlib', e.PULSE_SIGN_DLIB, '/dmdf', e.PULSE_SIGN_METADATA]
    : mode === 'pfx' ? [...common, '/f', e.PULSE_SIGN_PFX, ...(e.PULSE_SIGN_PASSWORD ? ['/p', e.PULSE_SIGN_PASSWORD] : [])]
      : [...common, '/sha1', e.PULSE_SIGN_THUMBPRINT];
  execFileSync(tool, [...args, file], { stdio: 'inherit' });
  execFileSync(tool, ['verify', '/pa', file], { stdio: 'inherit' });
}

main().catch(err => { console.error(err.message); process.exit(1); });
