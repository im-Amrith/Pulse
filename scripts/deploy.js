'use strict';
// Publishes the website to Cloudflare Pages (project "pulse", https://pulse-a5j.pages.dev).
// Run `npm run release` first when shipping a new version, so website/version.json is current.
//
//   npm run deploy                 build dist/site and publish it (needs a Cloudflare login, or
//                                  CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID as in .github/workflows/site.yml)
//   node scripts/deploy.js --build only build dist/site, to check it locally
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'website');
const OUT = path.join(ROOT, 'dist', 'site');
const SKIP = new Set(['SPEC.md']); // internal notes stay off the public site
const BUILD_ONLY = process.argv.includes('--build');

// the blog's index, RSS feed and the sitemap are generated from the posts
require('./blog').build();

fs.rmSync(OUT, { recursive: true, force: true });
// files and folders starting with "_" (like the blog post template) are never published
fs.cpSync(SRC, OUT, { recursive: true, filter: src => !SKIP.has(path.basename(src)) && !path.basename(src).startsWith('_') });

// the version in the page's static text comes from version.json, so it's right even before the script runs
const version = JSON.parse(fs.readFileSync(path.join(SRC, 'version.json'), 'utf8')).version;
const page = path.join(OUT, 'index.html');
fs.writeFileSync(page, fs.readFileSync(page, 'utf8').replace(/(<span data-version>)[^<]*(<\/span>)/g, `$1${version}$2`));
// long cache for media, always-fresh version.json so new releases show up at once
fs.writeFileSync(path.join(OUT, '_headers'), [
  '/assets/*', '  Cache-Control: public, max-age=2592000, immutable',
  '/version.json', '  Cache-Control: no-cache',
  '/blog/feed.xml', '  Content-Type: application/rss+xml; charset=utf-8',
  '/*', '  X-Content-Type-Options: nosniff', '  Referrer-Policy: strict-origin-when-cross-origin', '',
].join('\n'));

const big = [];
(function walk(dir) { for (const f of fs.readdirSync(dir)) { const p = path.join(dir, f); fs.statSync(p).isDirectory() ? walk(p) : fs.statSync(p).size > 25 * 1048576 && big.push(p); } })(OUT);
if (big.length) { console.error('Cloudflare Pages allows 25 MB per file. Too big:\n' + big.join('\n')); process.exit(1); }

if (BUILD_ONLY) { console.log(`Built ${OUT} (version ${version}); not deployed.`); process.exit(0); }
execSync(`npx -y wrangler@4.45.0 pages deploy "${OUT}" --project-name pulse --branch main --commit-dirty=true`, { stdio: 'inherit', cwd: ROOT });
