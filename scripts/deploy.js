'use strict';
// Publishes the website to Cloudflare Pages (project "pulse", https://pulse-a5j.pages.dev).
// Run `npm run release` first when shipping a new version, so website/version.json is current.
//
//   npm run deploy
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'website');
const OUT = path.join(ROOT, 'dist', 'site');
const SKIP = new Set(['SPEC.md']); // internal notes stay off the public site

fs.rmSync(OUT, { recursive: true, force: true });
fs.cpSync(SRC, OUT, { recursive: true, filter: src => !SKIP.has(path.basename(src)) });
// long cache for media, always-fresh version.json so new releases show up at once
fs.writeFileSync(path.join(OUT, '_headers'), [
  '/assets/*', '  Cache-Control: public, max-age=2592000, immutable',
  '/version.json', '  Cache-Control: no-cache',
  '/*', '  X-Content-Type-Options: nosniff', '  Referrer-Policy: strict-origin-when-cross-origin', '',
].join('\n'));

const big = [];
(function walk(dir) { for (const f of fs.readdirSync(dir)) { const p = path.join(dir, f); fs.statSync(p).isDirectory() ? walk(p) : fs.statSync(p).size > 25 * 1048576 && big.push(p); } })(OUT);
if (big.length) { console.error('Cloudflare Pages allows 25 MB per file. Too big:\n' + big.join('\n')); process.exit(1); }

execSync(`npx -y wrangler@4.45.0 pages deploy "${OUT}" --project-name pulse --branch main --commit-dirty=true`, { stdio: 'inherit', cwd: ROOT });
