'use strict';
// Builds website/terms.html from TERMS.txt and LICENSE.txt, so the site and the app always say the same thing.
// Usage: node scripts/terms-page.js
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.join(__dirname, '..');
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Plain-text doc -> HTML: "1. Heading" lines become h2, "  - item" / "  a) item" lines become lists, the rest paragraphs.
function toHtml(text, skipTitle) {
  const lines = text.replace(/\r/g, '').split('\n');
  if (skipTitle) lines.shift();
  const out = []; let para = [], list = [];
  const flushP = () => { if (para.length) out.push(`<p>${esc(para.join(' '))}</p>`); para = []; };
  const flushL = () => { if (list.length) out.push(`<ul>${list.map(i => `<li>${esc(i)}</li>`).join('')}</ul>`); list = []; };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) { flushP(); flushL(); continue; }
    const head = line.match(/^(\d+)\.\s+(.*)$/);
    const item = line.match(/^\s+(?:-|[a-z]\))\s+(.*)$/);
    if (head) { flushP(); flushL(); out.push(`<h2><span>${head[1]}</span>${esc(head[2])}</h2>`); }
    else if (item) { flushP(); list.push(item[1]); }
    else if (/^\s{3,}/.test(raw) && list.length) list[list.length - 1] += ' ' + line.trim();
    else { flushL(); para.push(line.trim()); }
  }
  flushP(); flushL();
  return out.join('\n');
}

const terms = fs.readFileSync(path.join(ROOT, 'TERMS.txt'), 'utf8');
const licence = fs.readFileSync(path.join(ROOT, 'LICENSE.txt'), 'utf8');
const updated = (terms.match(/Last updated:\s*(.+)/) || [])[1] || '';
const termsBody = toHtml(terms.replace(/^.*\n.*Last updated:.*\n/, ''), false);
const licenceBody = toHtml(licence, true);

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Pulse terms of use and licence</title>
<meta name="description" content="The terms of use and software licence for Pulse, a free desktop companion for Windows.">
<meta name="theme-color" content="#090b16">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect x='4' y='20' width='56' height='24' rx='12' fill='%23171a2e'/%3E%3Cellipse cx='26' cy='32' rx='3.4' ry='5' fill='%23e9ebff'/%3E%3Cellipse cx='38' cy='32' rx='3.4' ry='5' fill='%23e9ebff'/%3E%3C/svg%3E">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<style>
html, body { background: #090b16; color: #f2f0ff; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font: 400 16px/1.65 "Inter", "Segoe UI", system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
a { color: #a9b5ff; } a:hover { color: #fff; }
:focus-visible { outline: 2px solid #8d9bff; outline-offset: 3px; border-radius: 4px; }
.top { position: sticky; top: 0; z-index: 2; display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 18px clamp(20px, 5vw, 72px);
  background: rgba(9, 11, 22, .8); backdrop-filter: blur(14px); border-bottom: 1px solid rgba(169, 174, 203, .14); }
.logo { display: flex; align-items: center; gap: 10px; color: #f2f0ff; text-decoration: none; font: 600 20px/1 "Barlow Condensed", sans-serif; }
.mark { width: 34px; height: 18px; border-radius: 9px; background: #171a2e; display: flex; align-items: center; justify-content: center; gap: 5px; box-shadow: inset 0 0 0 1px rgba(255,255,255,.12); }
.mark i { width: 4px; height: 6px; border-radius: 50%; background: #e9ebff; box-shadow: 0 0 6px #8d9bff; }
main { max-width: 760px; margin: 0 auto; padding: 64px 20px 96px; }
h1 { font: 600 clamp(44px, 7vw, 72px)/.95 "Barlow Condensed", sans-serif; letter-spacing: -.015em; }
.meta { margin-top: 14px; color: #a9aecb; }
nav.toc { margin: 32px 0 8px; display: flex; gap: 10px; flex-wrap: wrap; }
nav.toc a { padding: 8px 14px; border-radius: 999px; background: rgba(255,255,255,.05); box-shadow: inset 0 0 0 1px rgba(169,174,203,.14); color: #f2f0ff; text-decoration: none; font-size: 14px; }
section { margin-top: 56px; }
section > h1 { font-size: clamp(34px, 5vw, 48px); }
h2 { margin: 36px 0 10px; font: 600 24px/1.2 "Barlow Condensed", sans-serif; letter-spacing: .005em; display: flex; gap: 12px; align-items: baseline; }
h2 span { color: #8d9bff; font-size: 18px; min-width: 22px; }
p, li { color: #cfd2ea; } p + p { margin-top: 12px; }
ul { margin: 10px 0 0 22px; display: grid; gap: 6px; }
.note { margin-top: 48px; padding: 18px 20px; border-radius: 16px; background: rgba(15, 18, 34, .8); box-shadow: inset 0 0 0 1px rgba(169,174,203,.14); color: #a9aecb; font-size: 14px; }
footer { padding: 32px 20px 48px; text-align: center; color: #6c7194; font-size: 13px; }
</style>
</head>
<body>
<header class="top"><a class="logo" href="./"><span class="mark" aria-hidden="true"><i></i><i></i></span>Pulse</a><a href="./#download">Download</a></header>
<main>
  <h1>Terms of use</h1>
  <p class="meta">Last updated ${esc(updated)}. These are the same terms that come with the app.</p>
  <nav class="toc" aria-label="On this page"><a href="#terms">Terms of use</a><a href="#licence">Software licence</a></nav>
  <section id="terms" aria-label="Terms of use">${termsBody}</section>
  <section id="licence"><h1>Software licence</h1>${licenceBody}</section>
  <p class="note">Plain version: Pulse is free and comes with no guarantees. You decide what Claude Code is allowed to do, so read each request before you allow it and keep backups. Pulse isn't made by or affiliated with Anthropic.</p>
</main>
<footer>Pulse is an independent project by Amrithesh S Menon.</footer>
</body>
</html>
`;
fs.writeFileSync(path.join(ROOT, 'website', 'terms.html'), html);
console.log('wrote website/terms.html');
