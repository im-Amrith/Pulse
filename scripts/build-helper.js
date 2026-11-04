'use strict';
// Compiles the Windows media helper (src/native/PulseMedia.cs -> src/main/bin/pulse-media.exe)
// with the C# compiler that ships with every Windows 10/11 (.NET Framework 4.8). No SDK needed.
//   node scripts/build-helper.js
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

if (process.platform !== 'win32') { console.log('Media helper is Windows only; skipped.'); process.exit(0); }

const ROOT = path.join(__dirname, '..');
const WIN = process.env.WINDIR || 'C:\\Windows';
const FW = path.join(WIN, 'Microsoft.NET', 'Framework64', 'v4.0.30319');
// The single Windows.winmd from the Windows SDK (the per-namespace files in System32 can't be referenced together).
function unionWinmd() {
  const base = path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Windows Kits', '10', 'UnionMetadata');
  if (!fs.existsSync(base)) return null;
  const versions = fs.readdirSync(base).filter(v => /^\d/.test(v)).sort().reverse();
  for (const v of versions) { const f = path.join(base, v, 'Windows.winmd'); if (fs.existsSync(f)) return f; }
  return null;
}
const src = path.join(ROOT, 'src', 'native', 'PulseMedia.cs');
const out = path.join(ROOT, 'src', 'main', 'bin', 'pulse-media.exe');

const refs = [
  path.join(FW, 'System.Runtime.WindowsRuntime.dll'),
  path.join(FW, 'System.Runtime.dll'),
  path.join(FW, 'System.Runtime.InteropServices.WindowsRuntime.dll'),
  path.join(FW, 'System.Threading.Tasks.dll'),
  path.join(FW, 'System.IO.dll'),
  path.join(FW, 'System.Core.dll'),
  unionWinmd(),
].filter(f => f && fs.existsSync(f));
if (!refs.some(r => r.endsWith('Windows.winmd'))) { console.error('Windows SDK not found (needs Windows Kits/10/UnionMetadata). Install the Windows SDK to rebuild the helper.'); process.exit(1); }

fs.mkdirSync(path.dirname(out), { recursive: true });
const args = ['/nologo', '/optimize+', '/platform:anycpu', '/target:exe', `/out:${out}`, ...refs.map(r => `/r:${r}`), src];
try {
  execFileSync(path.join(FW, 'csc.exe'), args, { stdio: 'pipe' });
} catch (e) {
  console.error(String(e.stdout || '') + String(e.stderr || ''));
  process.exit(1);
}
console.log(`Built ${path.relative(ROOT, out)} (${Math.round(fs.statSync(out).size / 1024)} KB)`);
