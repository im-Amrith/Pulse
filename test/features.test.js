'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { parseWhen } = require('../src/renderer/when');
const { DownloadsWatcher, isPartial } = require('../src/main/downloads');
const { cpuPercent } = require('../src/main/system');

const NOW = new Date(2026, 10, 4, 14, 30, 0); // 4 Nov 2026, 14:30 local

test('parseWhen: relative times', () => {
  assert.equal(parseWhen('in 20 min', NOW), NOW.getTime() + 20 * 60_000);
  assert.equal(parseWhen('in 2 hours', NOW), NOW.getTime() + 2 * 3_600_000);
  assert.equal(parseWhen('In 1.5 h', NOW), NOW.getTime() + 1.5 * 3_600_000);
});

test('parseWhen: clock times', () => {
  const at = (h, m, dayOffset = 0) => new Date(2026, 10, 4 + dayOffset, h, m).getTime();
  assert.equal(parseWhen('at 5pm', NOW), at(17, 0));
  assert.equal(parseWhen('17:45', NOW), at(17, 45));
  assert.equal(parseWhen('9am', NOW), at(9, 0, 1), 'a time already past today means tomorrow');
  assert.equal(parseWhen('tomorrow 9:15am', NOW), at(9, 15, 1));
  assert.equal(parseWhen('tomorrow at 8', NOW), at(8, 0, 1));
  assert.equal(parseWhen('12am', NOW), at(0, 0, 1));
});

test('parseWhen: rejects nonsense', () => {
  for (const s of ['', 'soon', '5', '25:00', '13pm', 'in min']) assert.equal(parseWhen(s, NOW), null, s);
});

test('downloads: skips partial files and reports finished ones once', async () => {
  for (const n of ['a.crdownload', 'b.part', '~$doc.docx', 'c.tmp']) assert.equal(isPartial(n), true, n);
  assert.equal(isPartial('slides.pptx'), false);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-dl-'));
  fs.writeFileSync(path.join(dir, 'old.txt'), 'already here');
  const w = new DownloadsWatcher(dir, { settleMs: 120 });
  const got = [];
  w.on('file', f => got.push(path.basename(f)));
  w.start();
  fs.writeFileSync(path.join(dir, 'report.pdf.crdownload'), 'half');
  await new Promise(r => setTimeout(r, 60));
  fs.renameSync(path.join(dir, 'report.pdf.crdownload'), path.join(dir, 'report.pdf')); // browser finishes
  await new Promise(r => setTimeout(r, 700));
  w.stop();
  assert.deepEqual(got, ['report.pdf']);
});

test('cpuPercent from two samples', () => {
  assert.equal(cpuPercent({ idle: 100, total: 200 }, { idle: 150, total: 400 }), 75);
  assert.equal(cpuPercent({ idle: 0, total: 0 }, { idle: 0, total: 0 }), 0);
});
