'use strict';
// Film mode: records the real island for the website demo. Development only (never shipped).
//   PULSE_FILM=<output folder> electron .        (or: npm run film)
// Runs Pulse with its own empty profile and made-up content (a fictional Claude Code session, a fictional
// song with invented lyrics, fixed Wi-Fi and CPU numbers), so nothing personal can appear on screen.
// A drawn cursor moves over the island and real mouse events drive it, exactly as hovering would.
// Every painted frame is saved (raw BGRA, deflated off the main thread) with its time; scripts/film.js turns them into video.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { EventEmitter } = require('node:events');

class FakeMedia extends EventEmitter {
  constructor() { super(); this.state = { active: false }; this.volume = { level: 64, muted: false }; }
  start() {} stop() {} command() {}
  set(state) { this.state = state; this.emit('change'); }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const SID = 'film-session';
const CWD = 'C:\\code\\acme-site';

// a fictional song, with lyrics written for this demo
const SONG = { title: 'Paper Lanterns', artist: 'The Quiet Hours', duration: 204 };
const LINES = [
  [40, 'Paper lanterns over the harbour'], [44.2, 'every window humming low'], [48.4, 'we keep the light on for the night shift'],
  [52.6, 'and let the slow tide take the glow'], [56.8, 'Paper lanterns, paper lanterns'], [61, 'drifting out where the quiet goes'],
].map(([t, text]) => ({ t, text }));

async function run({ win, hub, media, lyrics, sys, claude, prefs, push, send, outDir }) {
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  const wc = win.webContents;
  const js = code => wc.executeJavaScript(code, true);

  // fixed, impersonal surroundings
  prefs.set({ ...prefs.get(), notifications: false, sound: false, autoOpen: true, lyrics: true, termsAccepted: 'film' });
  claude.status = () => ({ connected: true, statusLine: 'ours' });
  claude.getModel = () => '';
  lyrics.update = () => {};
  sys.state = { wifi: 'on', ssid: 'Studio', signal: 92 };
  setInterval(() => send('stats', { cpu: 9 + Math.round(Math.random() * 6), ram: 41 }), 2000);
  push();

  await new Promise(r => (wc.isLoading() ? wc.once('did-finish-load', r) : r()));
  await sleep(1200);

  // a drawn cursor; moving it sends real mousemove events to whatever is under it
  await js(`(() => {
    const c = document.createElement('div');
    c.id = 'film-cursor';
    c.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24"><path d="M5 3l14 8-6.2 1.6L10 19z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>';
    Object.assign(c.style, { position: 'fixed', left: '0', top: '0', zIndex: 99999, pointerEvents: 'none', opacity: '0',
      transition: 'opacity .3s', filter: 'drop-shadow(0 2px 3px rgba(0,0,0,.45))' });
    document.body.append(c);
    let x = 360, y = 300;
    const at = (nx, ny) => {
      x = nx; y = ny; c.style.transform = 'translate(' + x + 'px,' + y + 'px)';
      const el = document.elementFromPoint(x, y) || document.body;
      el.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: x, clientY: y }));
    };
    const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    window.__film = {
      show(v) { c.style.opacity = v ? '1' : '0'; },
      jump: at,
      move(nx, ny, ms = 700) {
        const sx = x, sy = y, t0 = performance.now();
        return new Promise(done => { const step = now => { const k = Math.min(1, (now - t0) / ms), e = ease(k);
          at(sx + (nx - sx) * e, sy + (ny - sy) * e); k < 1 ? requestAnimationFrame(step) : done(); }; requestAnimationFrame(step); });
      },
      async clickText(text, sel = 'button') {
        const el = [...document.querySelectorAll(sel)].find(b => b.textContent.trim() === text && b.offsetParent);
        if (!el) return false;
        const r = el.getBoundingClientRect();
        await this.move(r.left + r.width * .5, r.top + r.height * .6, 650);
        await new Promise(r => setTimeout(r, 180));
        c.animate([{ transform: c.style.transform + ' scale(1)' }, { transform: c.style.transform + ' scale(.82)' }, { transform: c.style.transform + ' scale(1)' }], { duration: 220 });
        el.click(); return true;
      },
      art() {
        const k = document.createElement('canvas'); k.width = k.height = 256; const g = k.getContext('2d');
        let gr = g.createLinearGradient(0, 0, 256, 256); gr.addColorStop(0, '#ff9a62'); gr.addColorStop(.55, '#c2417a'); gr.addColorStop(1, '#2b1f5c');
        g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
        for (let i = 0; i < 7; i++) { g.fillStyle = 'rgba(255,236,200,' + (.5 - i * .05) + ')'; g.beginPath(); g.arc(40 + i * 30, 70 + (i % 3) * 40, 10 + (i % 2) * 6, 0, 7); g.fill(); }
        g.fillStyle = 'rgba(10,8,30,.55)'; g.fillRect(0, 190, 256, 66);
        return k.toDataURL('image/png');
      },
    };
  })()`);
  const cursor = (x, y, ms) => js(`__film.move(${x}, ${y}, ${ms || 700})`);

  // ---------- record ----------
  const frames = [];
  let n = 0;
  const t0 = Date.now();
  let pending = 0;
  wc.beginFrameSubscription(false, image => {
    const file = `f${String(n++).padStart(5, '0')}.bgra.z`, { width: w, height: h } = image.getSize();
    frames.push({ file, t: Date.now() - t0, w, h });
    pending++;
    zlib.deflate(image.toBitmap(), { level: 1 }, (err, z) => { if (err) { pending--; return; } fs.writeFile(path.join(outDir, file), z, () => pending--); });
  });
  const marks = [];
  const mark = name => marks.push({ name, t: Date.now() - t0 });
  const ev = e => hub.handleEvent({ session_id: SID, cwd: CWD, ...e });

  // 1. Claude is working: the pill shows the step, the eyes scan
  mark('working');
  await sleep(1200);
  ev({ hook_event_name: 'SessionStart' });
  ev({ hook_event_name: 'UserPromptSubmit', prompt: 'Make the navbar sticky and give it a soft blur' });
  await sleep(1400);
  ev({ hook_event_name: 'PreToolUse', tool_name: 'Read', tool_input: { file_path: `${CWD}\\src\\components\\Navbar.tsx` } });
  await sleep(1300);
  ev({ hook_event_name: 'PostToolUse', tool_name: 'Read' });
  ev({ hook_event_name: 'PreToolUse', tool_name: 'Grep', tool_input: { pattern: 'position:' } });
  await sleep(1000);
  ev({ hook_event_name: 'PostToolUse', tool_name: 'Grep' });
  ev({ hook_event_name: 'PreToolUse', tool_name: 'Edit', tool_input: { file_path: `${CWD}\\src\\components\\Navbar.tsx`,
    old_string: '<nav className="nav">', new_string: '<nav className="nav sticky top-0 backdrop-blur-md bg-black/40">' } });
  await sleep(1400);

  // 2. hover: it unfolds into the live view of the session
  mark('hover');
  await js('current = "claude"; __film.jump(560, 260); __film.show(true)');
  await cursor(372, 22, 900);
  await sleep(350);
  await js('if (!open) setOpen(true, { to: "claude" })');
  await sleep(250);
  ev({ hook_event_name: 'PostToolUse', tool_name: 'Edit' });
  ev({ hook_event_name: 'PreToolUse', tool_name: 'Edit', tool_input: { file_path: `${CWD}\\src\\styles\\nav.css`,
    old_string: '.nav {\n  position: relative;', new_string: '.nav {\n  position: sticky;\n  top: 0;\n  backdrop-filter: blur(14px);' } });
  await sleep(2600);
  ev({ hook_event_name: 'PostToolUse', tool_name: 'Edit' });
  await cursor(600, 520, 800);
  await sleep(1300);

  // 3. it asks before running a command, and one click allows it
  mark('allow');
  const cmd = 'npm install @radix-ui/react-dialog';
  ev({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: cmd } });
  const fakeRes = new EventEmitter(); fakeRes.writeHead = () => fakeRes; fakeRes.end = () => fakeRes;
  hub.handleEvent({ session_id: SID, cwd: CWD, hook_event_name: 'PermissionRequest', tool_name: 'Bash', tool_input: { command: cmd } }, fakeRes);
  send('island:attention', SID);
  await sleep(2000);
  await js(`__film.clickText('Allow')`);
  await sleep(900);
  await cursor(610, 500, 700);
  await sleep(500);
  ev({ hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_response: { stdout: 'added 3 packages, and audited 214 packages in 2s\nfound 0 vulnerabilities' } });
  await sleep(1600);

  // 4. done: it folds back up and smiles
  mark('done');
  ev({ hook_event_name: 'Stop', last_assistant_message: 'The navbar now sticks to the top with a soft blur behind it, and the dialog package is installed for the mobile menu.' });
  await sleep(500);
  await js('__film.show(false)');
  await sleep(3400);

  // 5. music: the capsule widens and sings along
  mark('lyrics');
  hub.acknowledge();   // what folding the island after a finished session does
  const art = await js('__film.art()');
  lyrics.current = { key: `${SONG.artist}\u0000${SONG.title}`, lines: LINES };
  media.set({ active: true, app: 'Spotify.exe', title: SONG.title, artist: SONG.artist, playing: true,
    position: 39.2, duration: SONG.duration, art, updatedAt: Date.now() });
  await sleep(9000);

  // 6. and the music page, one hover away
  mark('music');
  await js('current = "music"; __film.jump(560, 230); __film.show(true)');
  await cursor(380, 24, 900);
  await sleep(350);
  await js('if (!open) setOpen(true, { to: "music" })');
  await sleep(4200);
  await cursor(620, 520, 800);
  await sleep(1500);
  await js('__film.show(false)');
  await sleep(800);
  mark('end');

  wc.endFrameSubscription();
  while (pending > 0) await sleep(100);   // let the last writes finish
  fs.writeFileSync(path.join(outDir, 'frames.json'), JSON.stringify({ frames, marks, scale: win.webContents.zoomFactor }, null, 1));
  console.log(`FILM done: ${frames.length} frames in ${outDir}`);
}

module.exports = { run, FakeMedia };
