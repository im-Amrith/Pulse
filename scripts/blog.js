'use strict';
// Builds the blog's generated files from the posts. Plain Node, no dependencies.
//
//   npm run blog          (scripts/deploy.js also runs it before every deploy)
//
// A post is website/blog/<slug>/index.html, written by hand (start from website/blog/_template.html).
// Its metadata comes from its own <head>: <title>, <meta name="description">, <meta name="pulse:date">
// (YYYY-MM-DD) and, optionally, <meta name="pulse:draft" content="true"> to keep it unlisted.
//
// This script:
//   - fills the shared nav and footer between the <!-- pulse:nav --> / <!-- pulse:footer --> markers in every post
//   - writes website/blog/index.html (the list of posts), website/blog/feed.xml (RSS) and website/sitemap.xml
const fs = require('node:fs');
const path = require('node:path');

const SITE = 'https://pulse-bot.dev';
const ROOT = path.join(__dirname, '..');
const WEB = path.join(ROOT, 'website');
const BLOG = path.join(WEB, 'blog');

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const unesc = s => String(s).replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const meta = (html, name) => unesc((html.match(new RegExp(`<meta\\s+(?:name|property)="${name}"\\s+content="([^"]*)"`, 'i')) || [])[1] || '');
const longDate = d => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

const GH = '<svg class="gh" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z"/></svg>';
const STAR = `<a class="btn btn-ghost star" href="https://github.com/im-Amrith/Pulse" target="_blank" rel="noopener" aria-label="Star Pulse on GitHub (opens in a new tab)">${GH}<span class="star-label">Star on GitHub</span><span class="star-count" hidden></span></a>`;

const nav = current => `<header class="nav">
  <a class="logo" href="/" aria-label="Pulse home"><span class="mark" aria-hidden="true"><i></i><i></i></span>Pulse</a>
  <nav class="nav-links" aria-label="Primary">
    <a href="/#features">Features</a>
    <a href="/#privacy">Privacy</a>
    <a href="/blog/"${current === 'blog' ? ' aria-current="page"' : ''}>Blog</a>
  </nav>
  <a class="btn btn-primary" href="/#download">Download</a>
  ${STAR}
</header>`;

const footer = `<footer>
  <div class="foot-row"><span>Pulse for Windows and macOS. Free and open source (MIT). Made by Amrithesh S Menon.</span>${STAR}</div>
  <nav class="foot-links" aria-label="More"><a href="/blog/">Blog</a><a href="/blog/feed.xml">RSS</a><a href="/terms">Terms of use</a><a href="https://github.com/im-Amrith/Pulse">Source code</a><a href="https://github.com/im-Amrith/Pulse-releases/releases">Release notes</a></nav>
  <span class="disclaimer">Pulse is an independent project and is not affiliated with or endorsed by Anthropic. Claude and Claude Code are trademarks of Anthropic, PBC.</span>
</footer>`;

const fill = (html, name, body) => {
  const re = new RegExp(`<!-- pulse:${name} -->[\\s\\S]*?<!-- /pulse:${name} -->`);
  if (!re.test(html)) throw new Error(`missing <!-- pulse:${name} --> ... <!-- /pulse:${name} --> markers`);
  return html.replace(re, `<!-- pulse:${name} -->\n${body}\n<!-- /pulse:${name} -->`);
};

function readPosts() {
  const posts = [];
  for (const slug of fs.readdirSync(BLOG).sort()) {
    const file = path.join(BLOG, slug, 'index.html');
    if (slug.startsWith('_') || !fs.existsSync(file)) continue;
    let html = fs.readFileSync(file, 'utf8');
    const title = unesc((html.match(/<title>([^<]*)<\/title>/i) || [])[1] || '').replace(/ · Pulse blog$/, '');
    const description = meta(html, 'description'), date = meta(html, 'pulse:date');
    if (!title || !description || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`${slug}: needs <title>, a description and pulse:date (YYYY-MM-DD)`);
    const url = `${SITE}/blog/${slug}/`;
    const canonical = (html.match(/<link rel="canonical" href="([^"]*)"/) || [])[1];
    if (canonical !== url) throw new Error(`${slug}: <link rel="canonical"> must be ${url}`);
    html = fill(fill(html, 'nav', nav('blog')), 'footer', footer);
    fs.writeFileSync(file, html);
    posts.push({ slug, title, description, date, url, draft: meta(html, 'pulse:draft') === 'true' });
  }
  return posts.filter(p => !p.draft).sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug));
}

function indexPage(posts) {
  const list = posts.length
    ? `<ol class="posts">\n${posts.map(p => `      <li><a href="/blog/${p.slug}/"><time datetime="${p.date}">${longDate(p.date)}</time><h2>${esc(p.title)}</h2><p>${esc(p.description)}</p></a></li>`).join('\n')}\n    </ol>`
    : '<p class="empty">The first posts are on their way.</p>';
  const desc = 'Notes from building Pulse, an open-source island for Claude Code on Windows and macOS: memory, hooks, and the small details.';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Blog · Pulse</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${SITE}/blog/">
<link rel="alternate" type="application/rss+xml" title="Pulse blog" href="${SITE}/blog/feed.xml">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Pulse">
<meta property="og:title" content="The Pulse blog">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${SITE}/blog/">
<meta property="og:image" content="${SITE}/assets/og.jpg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#090b16">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect x='4' y='20' width='56' height='24' rx='12' fill='%23171a2e'/%3E%3Cellipse cx='26' cy='32' rx='3.4' ry='5' fill='%23e9ebff'/%3E%3Cellipse cx='38' cy='32' rx='3.4' ry='5' fill='%23e9ebff'/%3E%3C/svg%3E">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/blog/blog.css">
<script src="/star.js" defer></script>
</head>
<body>
<!-- generated by scripts/blog.js: edit the posts, not this file -->
${nav('blog')}
<main>
  <div class="wrap">
    <div class="kicker">Blog</div>
    <h1>Notes from building Pulse.</h1>
    <p class="lede">How the island works under the hood: memory, Claude Code hooks, and the small details. Written by the person who makes it.</p>
    ${list}
    <p class="rss">Follow along with the <a href="/blog/feed.xml">RSS feed</a>.</p>
  </div>
</main>
${footer}
</body>
</html>
`;
}

function feed(posts) {
  const updated = posts[0]?.date || new Date().toISOString().slice(0, 10);
  const rfc = d => new Date(`${d}T09:00:00Z`).toUTCString();
  return `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>Pulse blog</title>
  <link>${SITE}/blog/</link>
  <atom:link href="${SITE}/blog/feed.xml" rel="self" type="application/rss+xml"/>
  <description>Notes from building Pulse, an open-source island for Claude Code on Windows and macOS.</description>
  <language>en</language>
  <lastBuildDate>${rfc(updated)}</lastBuildDate>
${posts.map(p => `  <item>
    <title>${esc(p.title)}</title>
    <link>${p.url}</link>
    <guid isPermaLink="true">${p.url}</guid>
    <pubDate>${rfc(p.date)}</pubDate>
    <description>${esc(p.description)}</description>
  </item>`).join('\n')}
</channel>
</rss>
`;
}

function sitemap(posts) {
  const urls = [[`${SITE}/`], [`${SITE}/blog/`, posts[0]?.date], [`${SITE}/terms`], ...posts.map(p => [p.url, p.date])];
  return `<?xml version="1.0" encoding="utf-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(([u, d]) => `  <url><loc>${u}</loc>${d ? `<lastmod>${d}</lastmod>` : ''}</url>`).join('\n')}
</urlset>
`;
}

function build() {
  const posts = readPosts();
  fs.writeFileSync(path.join(BLOG, 'index.html'), indexPage(posts));
  fs.writeFileSync(path.join(BLOG, 'feed.xml'), feed(posts));
  fs.writeFileSync(path.join(WEB, 'sitemap.xml'), sitemap(posts));
  return posts;
}

if (require.main === module) {
  const posts = build();
  console.log(`Blog: ${posts.length} post${posts.length === 1 ? '' : 's'}, index, feed.xml and sitemap.xml written.`);
}
module.exports = { build };
