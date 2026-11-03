'use strict';
const { app, BrowserWindow, Tray, Menu, ipcMain, globalShortcut, screen, shell, nativeImage, Notification, desktopCapturer, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { Hub } = require('./hub');
const { createClaudeConfig } = require('./claude-config');
const { jsonFile, loadToken, historyStore } = require('./store');
const { Media } = require('./media');
const { ClipboardHistory } = require('./clipboard');
const { SystemStatus } = require('./system');
const { createAsk } = require('./ask');
const { PhoneBridge } = require('./phone');
const { Lyrics } = require('./lyrics');
const { DownloadsWatcher } = require('./downloads');
const { randomUUID } = require('node:crypto');
const { iconPng } = require('./icon');

if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }
app.setAppUserModelId('com.amrithesh.pulse');

// The window is a fixed transparent canvas hanging from the top edge; the island inside grows and shrinks.
const WIDTH = 720, HEIGHT = 560;
let win = null, tray = null, hub, claude, media, clips, sys, ask, phone, lyrics, downloads, prefs, history;

const userData = () => app.getPath('userData');
const send = (channel, payload) => { if (win && !win.isDestroyed()) win.webContents.send(channel, payload); };
const shelf = () => prefs.get().shelf || [];

function place() {
  const { bounds } = screen.getPrimaryDisplay();
  win?.setBounds({ x: Math.round(bounds.x + (bounds.width - WIDTH) / 2), y: bounds.y, width: WIDTH, height: HEIGHT });
}

function createWindow() {
  win = new BrowserWindow({
    width: WIDTH, height: HEIGHT, frame: false, transparent: true, resizable: false, movable: false, skipTaskbar: true,
    alwaysOnTop: true, hasShadow: false, show: false, backgroundColor: '#00000000', roundedCorners: false,
    webPreferences: { preload: path.join(__dirname, '..', 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false },
  });
  place();
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true);
  win.setIgnoreMouseEvents(true, { forward: true });
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  win.once('ready-to-show', () => win.showInactive());
  win.on('blur', () => send('island:blur'));
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', e => e.preventDefault());
}

// The eyes glance toward the mouse, so the renderer gets the cursor relative to the top-centre of the island.
function trackCursor() {
  let last = '';
  setInterval(() => {
    if (!win || win.isDestroyed()) return;
    const p = screen.getCursorScreenPoint(), b = win.getBounds();
    const msg = `${p.x - (b.x + b.width / 2)},${p.y - b.y}`;
    if (msg !== last) { last = msg; const [dx, dy] = msg.split(',').map(Number); send('cursor', { dx, dy }); }
  }, 50);
}

function createTray() {
  tray = new Tray(nativeImage.createFromBuffer(iconPng(32)));
  tray.setToolTip('Pulse');
  const rebuild = () => tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open island', click: () => send('island:open') },
    { label: 'Settings', click: () => send('island:open', 'settings') },
    { type: 'separator' },
    { label: 'Start with Windows', type: 'checkbox', checked: app.getLoginItemSettings().openAtLogin,
      click: item => { app.setLoginItemSettings({ openAtLogin: item.checked }); rebuild(); push(); } },
    { type: 'separator' },
    { label: 'Quit Pulse', click: () => app.quit() },
  ]));
  rebuild();
  tray.on('click', () => send('island:open'));
}

function state() {
  return {
    hub: hub.snapshot(), claude: { ...claude.status(), model: claude.getModel() },
    media: media.state, volume: media.volume, lyrics: lyrics.current, system: sys.state, clipboard: clips.items,
    prefs: prefs.get(), history: history.list(), phone: phone.status(), askBusy: ask.busy(),
    startWithWindows: app.getLoginItemSettings().openAtLogin,
  };
}
let pushTimer = null;
const push = () => { if (pushTimer) return; pushTimer = setTimeout(() => { pushTimer = null; send('state', state()); }, 40); };

function notify(title, body) {
  if (prefs.get().notifications === false || !Notification.isSupported() || win?.isFocused()) return;
  const n = new Notification({ title, body: body || '', icon: nativeImage.createFromBuffer(iconPng(64)), silent: true });
  n.on('click', () => send('island:open', 'claude'));
  n.show();
}

async function captureScreen() {
  const { size, scaleFactor } = screen.getPrimaryDisplay();
  win.setOpacity(0); // keep the island itself out of the picture
  try {
    const [src] = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: Math.round(size.width * scaleFactor), height: Math.round(size.height * scaleFactor) } });
    if (!src) throw new Error('Could not capture the screen.');
    const file = path.join(ask.dir, 'screen.png');
    fs.writeFileSync(file, src.thumbnail.toPNG());
    return file;
  } finally { win.setOpacity(1); }
}

// Reminders fire from here so they go off even while the island is folded away.
function checkReminders() {
  const list = prefs.get().reminders || [];
  const now = Date.now();
  let changed = false;
  for (const r of list) {
    if (r.done || r.fired || !(r.at <= now)) continue;
    r.fired = true; changed = true;
    send('reminder', r.id);
    if (Notification.isSupported()) {
      const n = new Notification({ title: 'Reminder', body: r.text, icon: nativeImage.createFromBuffer(iconPng(64)) });
      n.on('click', () => send('island:open', 'plan'));
      n.show();
    }
  }
  if (changed) { prefs.set({ ...prefs.get(), reminders: list }); push(); }
}

// ---------- launcher pins ----------
const pins = () => prefs.get().pins || [];
const pinName = p => path.basename(p).replace(/\.(lnk|exe|url)$/i, '');
function addPins(entries) {
  const list = pins();
  const fresh = entries.filter(e => e && !list.some(p => p.target === e.target)).map(e => ({ id: randomUUID(), ...e }));
  prefs.set({ ...prefs.get(), pins: [...list, ...fresh].slice(0, 40) }); push();
  return fresh.length;
}
function pinFromPath(p) {
  let st; try { st = fs.statSync(p); } catch { return null; }
  return { type: st.isDirectory() ? 'folder' : /\.(exe|lnk)$/i.test(p) ? 'app' : 'file', name: pinName(p), target: p };
}

function addToShelf(paths) {
  const files = shelf();
  const fresh = paths.filter(p => typeof p === 'string' && fs.existsSync(p) && !files.some(f => f.path === p))
    .map(p => ({ path: p, name: path.basename(p), at: Date.now() }));
  prefs.set({ ...prefs.get(), shelf: [...fresh, ...files].slice(0, 30) }); push();
}

// Every IPC handler returns { ok, value } or { ok: false, error } so the UI can show the reason.
function handle(channel, fn) {
  ipcMain.handle(channel, async (_e, ...args) => {
    try { return { ok: true, value: await fn(...args) }; } catch (err) { return { ok: false, error: err.message }; }
  });
}

function wireIpc() {
  handle('state', () => state());
  handle('island:interactive', on => win.setIgnoreMouseEvents(!on, { forward: true }));
  handle('island:focus', () => { win.setIgnoreMouseEvents(false); win.focus(); });

  handle('claude:connect', () => { const r = claude.connect(); push(); return r; });
  handle('claude:disconnect', () => { const r = claude.disconnect(); push(); return r; });
  handle('claude:model', m => { claude.setModel(String(m)); push(); });
  handle('session:allow', id => hub.allow(id));
  handle('session:deny', id => hub.deny(id));
  handle('session:answer', (id, answers) => hub.answer(id, answers));
  handle('session:plan', (id, approve, feedback) => hub.reviewPlan(id, approve, feedback));
  handle('session:reply', (id, text) => hub.reply(id, text));
  handle('session:dismiss', id => hub.dismiss(id));
  handle('session:ack', () => hub.acknowledge());
  handle('session:openFolder', cwd => { if (cwd && fs.existsSync(cwd)) return shell.openPath(cwd); });
  handle('history:clear', () => { history.clear(); push(); });

  handle('media', cmd => media.command(String(cmd)));
  handle('clip:copy', text => clips.copy(String(text)));
  handle('clip:clear', () => clips.clear());
  handle('prefs:set', patch => {
    prefs.set({ ...prefs.get(), ...patch });
    if ('lyrics' in patch) { lyrics.enabled = patch.lyrics !== false; lyrics.key = ''; lyrics.update(media.state); }
    push(); return prefs.get();
  });
  handle('login:set', on => { app.setLoginItemSettings({ openAtLogin: Boolean(on) }); push(); });

  handle('ask', async ({ prompt, screen: withScreen }) => {
    let text = String(prompt || '').trim();
    if (!text) throw new Error('Ask something first.');
    if (withScreen) { await captureScreen(); text = `A screenshot of my screen is saved as screen.png in the current folder. Look at it first.\n\n${text}`; }
    push();
    try { return await ask.run(`${text}\n\nAnswer briefly and plainly; this is shown in a small panel.`); } finally { push(); }
  });
  handle('ask:cancel', () => { ask.cancel(); push(); });

  handle('shelf:add', paths => addToShelf(paths));
  handle('shelf:remove', p => { prefs.set({ ...prefs.get(), shelf: shelf().filter(f => f.path !== p) }); push(); });
  handle('shelf:clear', () => { prefs.set({ ...prefs.get(), shelf: [] }); push(); });
  handle('shelf:open', p => { if (shelf().some(f => f.path === p)) return shell.openPath(p); });
  handle('shelf:reveal', p => { if (shelf().some(f => f.path === p)) shell.showItemInFolder(p); });
  ipcMain.on('shelf:drag', (e, p) => {
    if (!shelf().some(f => f.path === p) || !fs.existsSync(p)) return;
    e.sender.startDrag({ file: p, icon: nativeImage.createFromBuffer(iconPng(32)) });
  });
  handle('pins:add-paths', paths => addPins(paths.filter(p => typeof p === 'string').map(pinFromPath)));
  handle('pins:pick', async kind => {
    const r = await dialog.showOpenDialog(win, kind === 'folder'
      ? { title: 'Pin a folder', properties: ['openDirectory', 'multiSelections'] }
      : { title: 'Pin an app or file', properties: ['openFile', 'multiSelections'], filters: [{ name: 'Apps and files', extensions: ['*'] }] });
    return r.canceled ? 0 : addPins(r.filePaths.map(pinFromPath));
  });
  handle('pins:add-url', (name, url) => {
    let u; try { u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`); } catch { throw new Error('That doesn\'t look like a web address.'); }
    if (!/^https?:$/.test(u.protocol)) throw new Error('Only http and https links can be pinned.');
    return addPins([{ type: 'url', name: String(name || '').trim().slice(0, 40) || u.hostname.replace(/^www\./, ''), target: u.href }]);
  });
  handle('pins:set', list => { // rename / reorder / remove: only pins that already exist are kept
    const byId = new Map(pins().map(p => [p.id, p]));
    const next = (Array.isArray(list) ? list : []).filter(p => byId.has(p?.id)).map(p => ({ ...byId.get(p.id), name: String(p.name || byId.get(p.id).name).slice(0, 40) }));
    prefs.set({ ...prefs.get(), pins: next }); push();
  });
  handle('pins:open', id => {
    const p = pins().find(x => x.id === id);
    if (!p) throw new Error('That pin no longer exists.');
    if (p.type === 'url') return shell.openExternal(p.target);
    if (!fs.existsSync(p.target)) throw new Error(`${p.name} was moved or deleted.`);
    return shell.openPath(p.target).then(err => { if (err) throw new Error(err); });
  });
  const iconCache = new Map();
  handle('pins:icons', async () => {
    const out = {};
    for (const p of pins()) {
      if (p.type === 'url') continue;
      if (!iconCache.has(p.target)) {
        try { iconCache.set(p.target, (await app.getFileIcon(p.target, { size: 'large' })).toDataURL()); } catch { iconCache.set(p.target, ''); }
      }
      out[p.id] = iconCache.get(p.target);
    }
    return out;
  });
  handle('phone:start', () => phone.start());
  handle('phone:stop', () => phone.stop());

  handle('quit', () => app.quit());
}

app.whenReady().then(async () => {
  const dir = userData();
  const token = loadToken(dir);
  prefs = jsonFile(path.join(dir, 'prefs.json'), { note: '', shelf: [], notifications: true, sound: true, autoOpen: true, focusMinutes: 25 });
  history = historyStore(dir);
  ask = createAsk({ dir: path.join(dir, 'ask') });
  hub = new Hub({ token, history, ignoreCwd: ask.dir });
  claude = createClaudeConfig({ token });
  media = new Media();
  clips = new ClipboardHistory();
  sys = new SystemStatus();
  phone = new PhoneBridge({ getShelf: shelf, saveDir: path.join(app.getPath('downloads'), 'Pulse') });
  downloads = new DownloadsWatcher(app.getPath('downloads'));
  downloads.on('file', file => {
    if (prefs.get().watchDownloads === false) return;
    addToShelf([file]);
    send('download', path.basename(file));
  });
  lyrics = new Lyrics();
  lyrics.enabled = prefs.get().lyrics !== false;
  media.on('change', () => lyrics.update(media.state));
  lyrics.on('change', push);

  hub.on('change', push);
  hub.on('attention', s => { send('island:attention', s.id); notify(`${s.project || 'Claude Code'} needs you`, s.label); });
  hub.on('finished', s => { send('island:finished', s.state); notify(`${s.project || 'Claude Code'}: ${s.state === 'failed' ? 'failed' : 'done'}`, s.prompt); });
  for (const src of [media, clips, sys, phone]) src.on('change', push);
  phone.on('received', file => { addToShelf([file]); send('island:open', 'tray'); });

  wireIpc();
  createWindow();
  createTray();
  trackCursor();
  await hub.start();
  media.start(); clips.start(); sys.start(); downloads.start();
  // CPU / RAM go out on their own channel so the page isn't re-rendered every 2 seconds.
  sys.on('stats', stats => send('stats', stats));
  setInterval(checkReminders, 5000);
  checkReminders();

  globalShortcut.register('Control+Alt+P', () => send('island:toggle'));
  screen.on('display-metrics-changed', place);
});

app.on('second-instance', () => send('island:open'));
app.on('window-all-closed', e => e.preventDefault?.());
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  media?.stop(); clips?.stop(); sys?.stop(); downloads?.stop(); phone?.stop(); ask?.cancel(); hub?.stop(); prefs?.flush(); history?.flush();
});
