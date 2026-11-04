'use strict';
// Records the website demo video from the real island (see src/main/film.js) and composites it onto a clean backdrop.
//   npm run film            -> website/assets/demo.mp4, demo.jpg and demo.json (scene start times)
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

function record() {
  console.log('Recording the island (about a minute)...');
  const electron = require('electron'); // path to the binary when required from Node
  execFileSync(electron, ['.'], { cwd: ROOT, env: { ...process.env, PULSE_FILM: RAW }, stdio: 'inherit', timeout: 180000 });
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
  if (!process.argv.includes('--encode-only')) record();
  await encode();
})().catch(e => { console.error(e.message); process.exit(1); });
