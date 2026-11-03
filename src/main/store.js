'use strict';
// Tiny atomic JSON file store under Electron's userData folder.
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');

function jsonFile(file, fallback) {
  let value;
  try { value = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { value = structuredClone(fallback); }
  let timer = null;
  const flush = () => {
    clearTimeout(timer); timer = null;
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file + '.tmp', JSON.stringify(value, null, 2));
      fs.renameSync(file + '.tmp', file);
    } catch {}
  };
  return {
    get: () => value,
    set(next) { value = next; clearTimeout(timer); timer = setTimeout(flush, 250); },
    flush,
  };
}

function loadToken(dir) {
  const file = path.join(dir, 'hook-token');
  try { const t = fs.readFileSync(file, 'utf8').trim(); if (/^[a-f0-9]{48}$/.test(t)) return t; } catch {}
  const t = randomBytes(24).toString('hex');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, t, { mode: 0o600 });
  return t;
}

function historyStore(dir, limit = 50) {
  const f = jsonFile(path.join(dir, 'history.json'), []);
  if (!Array.isArray(f.get())) f.set([]);
  return {
    list: () => f.get(),
    add(entry) { f.set([entry, ...f.get()].slice(0, limit)); },
    clear() { f.set([]); },
    flush: f.flush,
  };
}

module.exports = { jsonFile, loadToken, historyStore };
