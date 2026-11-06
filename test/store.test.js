'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { jsonFile, loadToken, historyStore } = require('../src/main/store');

function temporaryDirectory(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-store-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

for (const initial of [undefined, '{broken json']) {
  test(`jsonFile: ${initial === undefined ? 'missing' : 'broken'} file clones the fallback`, t => {
    const file = path.join(temporaryDirectory(t), 'prefs.json');
    if (initial !== undefined) fs.writeFileSync(file, initial);
    const fallback = { nested: { enabled: true }, items: ['original'] };
    const first = jsonFile(file, fallback);
    first.get().nested.enabled = false;
    first.get().items.push('changed');
    assert.deepEqual(fallback, { nested: { enabled: true }, items: ['original'] });
    assert.deepEqual(jsonFile(file, fallback).get(), fallback);
  });
}

test('jsonFile: flush persists through a temporary file and rename', t => {
  const file = path.join(temporaryDirectory(t), 'nested', 'prefs.json');
  const store = jsonFile(file, {});
  const value = { note: 'Remember this', enabled: false, items: [1, 2] };
  const rename = fs.renameSync;
  const calls = [];
  t.mock.method(fs, 'renameSync', (from, to) => {
    calls.push([from, to]);
    assert.deepEqual(JSON.parse(fs.readFileSync(from, 'utf8')), value);
    return rename(from, to);
  });
  store.set(value);
  store.flush();
  assert.deepEqual(calls, [[file + '.tmp', file]]);
  assert.equal(fs.existsSync(file + '.tmp'), false);
  assert.deepEqual(jsonFile(file, {}).get(), value);
});

test('loadToken: creates and reuses a 48-character lowercase hex token', t => {
  const dir = path.join(temporaryDirectory(t), 'new-profile');
  const token = loadToken(dir);
  assert.match(token, /^[a-f0-9]{48}$/);
  assert.equal(fs.readFileSync(path.join(dir, 'hook-token'), 'utf8'), token);
  assert.equal(loadToken(dir), token);
});

for (const invalid of ['', 'abc', 'g'.repeat(48), 'A'.repeat(48), 'a'.repeat(49)]) {
  test(`loadToken: replaces invalid token ${JSON.stringify(invalid)}`, t => {
    const dir = temporaryDirectory(t);
    const file = path.join(dir, 'hook-token');
    fs.writeFileSync(file, invalid);
    const token = loadToken(dir);
    assert.match(token, /^[a-f0-9]{48}$/);
    assert.notEqual(token, invalid);
    assert.equal(fs.readFileSync(file, 'utf8'), token);
    assert.equal(loadToken(dir), token);
  });
}

test('loadToken: new token is readable and writable only by its owner', {
  skip: process.platform === 'win32' ? 'POSIX file modes are not enforced on Windows' : false,
}, t => {
  const dir = temporaryDirectory(t);
  loadToken(dir);
  assert.equal(fs.statSync(path.join(dir, 'hook-token')).mode & 0o777, 0o600);
});

test('historyStore: newest first, bounded, persisted, and clearable', t => {
  const dir = temporaryDirectory(t);
  const history = historyStore(dir, 2);
  const entries = [{ id: 1 }, { id: 2 }, { id: 3 }];
  entries.forEach(entry => history.add(entry));
  history.flush();
  assert.deepEqual(history.list(), [entries[2], entries[1]]);
  assert.deepEqual(historyStore(dir, 2).list(), [entries[2], entries[1]]);
  history.clear();
  history.flush();
  assert.deepEqual(history.list(), []);
  assert.deepEqual(historyStore(dir, 2).list(), []);
});

for (const invalid of [{ wrong: true }, null, 'not an array', 42]) {
  test(`historyStore: resets non-array ${JSON.stringify(invalid)} to an empty array`, t => {
    const dir = temporaryDirectory(t);
    const file = path.join(dir, 'history.json');
    fs.writeFileSync(file, JSON.stringify(invalid));
    const history = historyStore(dir);
    history.flush();
    assert.deepEqual(history.list(), []);
    assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), []);
  });
}
