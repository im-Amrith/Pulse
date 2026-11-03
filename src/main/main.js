'use strict';
const { app, BrowserWindow, Tray, Menu, ipcMain, globalShortcut, screen, shell, nativeImage, Notification } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { Hub } = require('./hub');
const { createClaudeConfig } = require('./claude-config');
const { jsonFile, loadToken, historyStore } = require('./store');
const { Media } = require('./media');
const { ClipboardHistory } = require('./clipboard');
const { iconPng } = require('./icon');

if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }
app.setAppUserModelId('com.amrithesh.pulse');

const WIDTH = 640, HEIGHT = 600; // the window is a transparent canvas; the island inside it grows and shrinks
let win = null, tray = null, hub, claude, media, clips, prefs, history;

const userData = () => app.getPath('userData');
const send = (channel, payload) => { if (win && !win.isDestroyed()) win.webContents.send(channel, payload); };

function createWindow() {
  const { workArea } = screen.getPrimaryDisplay();
  win = new BrowserWindow({
    width: WIDTH, height: HEIGHT,
    x: Math.round(workArea.x + (workArea.width - WIDTH) / 2), y: workArea.y + 6,
    frame: false, transparent: true, resizable: false, movable: false, skipTaskbar: true,
    alwaysOnTop: true, hasShadow: false, show: false, focusable: true, backgroundColor: '#00000000',
    webPreferences: { preload: path.join(__dirname, '..', 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true);
  win.setIgnoreMouseEvents(true, { forward: true });
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  win.once('ready-to-show', () => win.showInactive());
  win.on('blur', () => send('island:blur'));
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', e => e.preventDefault());
}

function createTray() {
  const img = nativeImage.createFromBuffer(iconPng(32));
  tray = new Tray(img);
  tray.setToolTip('Pulse');
  const rebuild = () => tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open island', click: () => send('island:open') },
    { type: 'separator' },
    { label: 'Start with Windows', type: 'checkbox', checked: app.getLoginItemSettings().openAtLogin,
      click: item => { app.setLoginItemSettings({ openAtLogin: item.checked }); rebuild(); } },
    { label: 'Open data folder', click: () => shell.openPath(userData()) },
    { type: 'separator' },
    { label: 'Quit Pulse', click: () => app.quit() },
  ]));
  rebuild();
  tray.on('click', () => send('island:open'));
}

function state() {
  return { hub: hub.snapshot(), claude: claude.status(), media: media.state, clipboard: clips.items,
    prefs: prefs.get(), history: history.list() };
}
let pushTimer = null;
const push = () => { if (pushTimer) return; pushTimer = setTimeout(() => { pushTimer = null; send('state', state()); }, 40); };

function notify(title, body) {
  if (!prefs.get().notifications || !Notification.isSupported()) return;
  if (win?.isFocused()) return;
  const n = new Notification({ title, body, icon: nativeImage.createFromBuffer(iconPng(64)), silent: true });
  n.on('click', () => send('island:open'));
  n.show();
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
  handle('prefs:set', patch => { prefs.set({ ...prefs.get(), ...patch }); push(); return prefs.get(); });
  handle('tray:add', paths => {
    const files = prefs.get().shelf || [];
    const fresh = paths.filter(p => typeof p === 'string' && fs.existsSync(p) && !files.some(f => f.path === p))
      .map(p => ({ path: p, name: path.basename(p), at: Date.now() }));
    prefs.set({ ...prefs.get(), shelf: [...fresh, ...files].slice(0, 24) }); push();
  });
  handle('tray:remove', p => { prefs.set({ ...prefs.get(), shelf: (prefs.get().shelf || []).filter(f => f.path !== p) }); push(); });
  handle('tray:open', p => { if ((prefs.get().shelf || []).some(f => f.path === p)) return shell.openPath(p); });
  handle('tray:reveal', p => { if ((prefs.get().shelf || []).some(f => f.path === p)) shell.showItemInFolder(p); });
  ipcMain.on('tray:drag', (e, p) => {
    if (!(prefs.get().shelf || []).some(f => f.path === p) || !fs.existsSync(p)) return;
    e.sender.startDrag({ file: p, icon: nativeImage.createFromBuffer(iconPng(32)) });
  });
  handle('quit', () => app.quit());
}

app.whenReady().then(async () => {
  const dir = userData();
  const token = loadToken(dir);
  prefs = jsonFile(path.join(dir, 'prefs.json'), { note: '', shelf: [], notifications: true, sound: true, focusMinutes: 25, accent: '#7c5cff' });
  history = historyStore(dir);
  hub = new Hub({ token, history });
  claude = createClaudeConfig({ token });
  media = new Media();
  clips = new ClipboardHistory();

  hub.on('change', push);
  hub.on('attention', s => { send('island:attention', s.id); notify(`${s.project || 'Claude Code'} needs you`, s.label); });
  hub.on('finished', s => { send('island:finished', s.state); notify(`${s.project || 'Claude Code'}: ${s.state === 'failed' ? 'failed' : 'done'}`, s.prompt); });
  media.on('change', push);
  clips.on('change', push);

  wireIpc();
  createWindow();
  createTray();
  await hub.start();
  media.start();
  clips.start();

  globalShortcut.register('Control+Alt+P', () => send('island:toggle'));
  screen.on('display-metrics-changed', () => {
    const { workArea } = screen.getPrimaryDisplay();
    win?.setBounds({ x: Math.round(workArea.x + (workArea.width - WIDTH) / 2), y: workArea.y + 6, width: WIDTH, height: HEIGHT });
  });
});

app.on('second-instance', () => send('island:open'));
app.on('window-all-closed', e => e.preventDefault?.());
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  media?.stop(); clips?.stop(); hub?.stop(); prefs?.flush(); history?.flush();
});
