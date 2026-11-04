'use strict';
// Records the website demo video from the real island (see src/main/film.js) and composites it onto a clean backdrop.
//   npm run film            -> website/assets/demo.mp4, demo.jpg and demo.json (scene start times)
//   npm run film -- --promo -> promo/shared/island/<scene>.webm: transparent clips (VP9 with alpha, 2x) for the promo video
// Needs ffmpeg on PATH.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const zlib = require('node:zlib');
const { spawn, execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'website', 'assets');
const RAW = path.join(os.tmpdir(), 'pulse-film-frames');
const W = 1440, H = 810, FPS = 30, SCALE = 0.8; // island frames come at 2x: 1440x1120, shown at 0.8

function record(dir = RAW, script = '') {
  console.log('Recording the island (about a minute)...');
  const electron = require('electron'); // path to the binary when required from Node
  execFileSync(electron, ['.'], { cwd: ROOT, env: { ...process.env, PULSE_FILM: dir, PULSE_FILM_SCRIPT: script }, stdio: 'inherit', timeout: 240000 });
}

// Streams the recorded frames between two times to ffmpeg at a steady FPS (holding a frame until the next one was painted).
async function pipeFrames(dir, frames, from, to, ff) {
  const fw = frames[0].w, fh = frames[0].h;
  const write = buf => new Promise(r => (ff.stdin.write(buf) ? r() : ff.stdin.once('drain', r)));
  let k = 0, cache = { file: '', buf: null };
  for (let i = 0; from + i * 1000 / FPS < to; i++) {
    const t = from + i * 1000 / FPS;
    while (k + 1 < frames.length && frames[k + 1].t <= t) k++;
    const f = frames[k];
    if (cache.file !== f.file) {
      let buf = null;
      try { buf = zlib.inflateSync(fs.readFileSync(path.join(dir, f.file))); } catch {}
      if (buf && buf.length === fw * fh * 4) cache = { file: f.file, buf };
    }
    if (cache.buf) await write(cache.buf);
  }
  ff.stdin.end();
  await new Promise((res, rej) => ff.on('close', c => (c ? rej(new Error('ffmpeg failed')) : res())));
}

// One transparent clip per scene, plus scenes.json (durations) and a contact sheet to check by eye.
async function promoClips() {
  const dir = path.join(os.tmpdir(), 'pulse-film-promo');
  const out = path.join(ROOT, 'promo', 'shared', 'island');
  if (!process.argv.includes('--encode-only')) record(dir, 'promo');
  const { frames, marks } = JSON.parse(fs.readFileSync(path.join(dir, 'frames.json'), 'utf8'));
  const fw = frames[0].w, fh = frames[0].h;
  fs.mkdirSync(out, { recursive: true });
  const scenes = {};
  const sheet = [];
  for (let i = 0; i + 1 < marks.length; i++) {
    const { name, t } = marks[i], to = marks[i + 1].t;
    const file = path.join(out, `${name}.webm`);
    console.log(`  ${name}: ${((to - t) / 1000).toFixed(2)} s`);
    const ff = spawn('ffmpeg', ['-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'bgra', '-s', `${fw}x${fh}`, '-r', String(FPS), '-i', '-',
      '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-b:v', '0', '-crf', '20', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '2',
      '-auto-alt-ref', '0', '-an', file], { stdio: ['pipe', 'inherit', 'inherit'] });
    await pipeFrames(dir, frames, t, to, ff);
    scenes[name] = +((to - t) / 1000).toFixed(3);
    // contact sheet: the middle of each scene over a mid-grey, so the shape and any text are easy to read
    const png = path.join(dir, `sheet-${name}.png`);
    const mid = ((to - t) / 2000).toFixed(2);
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-c:v', 'libvpx-vp9', '-i', file, '-f', 'lavfi', '-i', `color=c=0x3a3a3a:s=${fw}x${fh}`,
      '-filter_complex', `[1][0]overlay=shortest=1,scale=720:-1,drawtext=fontfile=arial.ttf:text='${name}':x=16:y=h-40:fontsize=24:fontcolor=white`, '-ss', mid, '-frames:v', '1', png], { cwd: process.platform === 'win32' ? 'C:/Windows/Fonts' : ROOT });
    sheet.push(png);
  }
  fs.writeFileSync(path.join(out, 'scenes.json'), JSON.stringify(scenes, null, 1) + '\n');
  const cols = 4, inputs = sheet.flatMap(f => ['-i', f]);
  const layout = sheet.map((_, i) => `${(i % cols) ? Array.from({ length: i % cols }, (_, j) => 'w0').join('+') : '0'}_${Math.floor(i / cols) ? Array.from({ length: Math.floor(i / cols) }, () => 'h0').join('+') : '0'}`).join('|');
  execFileSync('ffmpeg', ['-v', 'error', '-y', ...inputs, '-filter_complex', `xstack=inputs=${sheet.length}:layout=${layout}:fill=black`, path.join(ROOT, 'promo', 'shared', 'contact-sheet.png')]);
  console.log(`Wrote ${Object.keys(scenes).length} clips to ${path.relative(ROOT, out)} and promo/shared/contact-sheet.png`);
}

function backdrop(file) {
  // near-black blue with a soft light under the island and a faint accent glow from below
  const glow = (cx, cy, sx, sy) => `exp(-((X-${cx})*(X-${cx})/(2*${sx}*${sx})+(Y-${cy})*(Y-${cy})/(2*${sy}*${sy})))`;
  const top = glow(W / 2, -40, 520, 260), low = glow(W / 2, H + 120, 620, 300);
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', `color=c=black:s=${W}x${H}`, '-vf',
    `geq=r='9+22*${top}+20*${low}':g='11+24*${top}+24*${low}':b='22+40*${top}+70*${low}',noise=alls=3:allf=t`,
    '-frames:v', '1', file]);
}

async function encode() {
  const meta = JSON.parse(fs.readFileSync(path.join(RAW, 'frames.json'), 'utf8'));
  const { frames, marks } = meta;
  const fw = frames[0].w, fh = frames[0].h;
  const end = marks.find(m => m.name === 'end').t;
  const bg = path.join(RAW, 'bg.png');
  backdrop(bg);
  const mp4 = path.join(OUT, 'demo.mp4');
  console.log(`Encoding ${Math.round(end / 1000)} s at ${FPS} fps from ${frames.length} frames (${fw}x${fh})...`);
  const ff = spawn('ffmpeg', ['-v', 'error', '-y',
    '-f', 'rawvideo', '-pix_fmt', 'bgra', '-s', `${fw}x${fh}`, '-r', String(FPS), '-i', '-',
    '-framerate', String(FPS), '-loop', '1', '-i', bg,
    '-filter_complex', `[0]scale=${Math.round(fw * SCALE)}:-1:flags=lanczos[fg];[1][fg]overlay=(W-w)/2:0:shortest=1,format=yuv420p`,
    '-r', String(FPS), '-fps_mode', 'cfr', '-c:v', 'libx264', '-preset', 'slow', '-crf', '22', '-movflags', '+faststart', '-an', mp4], { stdio: ['pipe', 'inherit', 'inherit'] });
  const write = buf => new Promise(r => (ff.stdin.write(buf) ? r() : ff.stdin.once('drain', r)));
  let k = 0, cache = { file: '', buf: null };
  for (let i = 0; i * 1000 / FPS < end; i++) {
    const t = i * 1000 / FPS;
    while (k + 1 < frames.length && frames[k + 1].t <= t) k++;
    const f = frames[k];
    if (cache.file !== f.file) {
      let buf = null;
      try { buf = zlib.inflateSync(fs.readFileSync(path.join(RAW, f.file))); } catch {}
      if (buf && buf.length === fw * fh * 4) cache = { file: f.file, buf };
    }
    await write(cache.buf);
  }
  ff.stdin.end();
  await new Promise((res, rej) => ff.on('close', c => (c ? rej(new Error('ffmpeg failed')) : res())));
  // a poster from the moment it asks for permission, and the scene start times for the page
  const at = (marks.find(m => m.name === 'allow').t + 2500) / 1000;
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', String(at), '-i', mp4, '-frames:v', '1', '-q:v', '4', path.join(OUT, 'demo.jpg')]);
  fs.writeFileSync(path.join(OUT, 'demo.json'), JSON.stringify(Object.fromEntries(marks.map(m => [m.name, +(m.t / 1000).toFixed(2)]))) + '\n');
  console.log(`Wrote ${path.relative(ROOT, mp4)} (${(fs.statSync(mp4).size / 1048576).toFixed(1)} MB)`);
}

(async () => {
  if (process.argv.includes('--promo')) return promoClips();
  if (!process.argv.includes('--encode-only')) record();
  await encode();
})().catch(e => { console.error(e.message); process.exit(1); });
