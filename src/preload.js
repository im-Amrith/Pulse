'use strict';
const { contextBridge, ipcRenderer, webUtils } = require('electron');

const call = async (channel, ...args) => {
  const r = await ipcRenderer.invoke(channel, ...args);
  if (!r.ok) throw new Error(r.error);
  return r.value;
};
const on = channel => fn => { const h = (_e, v) => fn(v); ipcRenderer.on(channel, h); return () => ipcRenderer.off(channel, h); };

contextBridge.exposeInMainWorld('pulse', {
  state: () => call('state'),
  onState: on('state'),
  onOpen: on('island:open'),
  onToggle: on('island:toggle'),
  onBlur: on('island:blur'),
  onAttention: on('island:attention'),
  onFinished: on('island:finished'),
  onCursor: on('cursor'),
  onStats: on('stats'),
  onReminder: on('reminder'),
  onDownload: on('download'),
  interactive: v => call('island:interactive', Boolean(v)),
  focus: () => call('island:focus'),

  connect: () => call('claude:connect'),
  disconnect: () => call('claude:disconnect'),
  setModel: m => call('claude:model', m),
  allow: id => call('session:allow', id),
  deny: id => call('session:deny', id),
  answer: (id, answers) => call('session:answer', id, answers),
  plan: (id, approve, feedback) => call('session:plan', id, approve, feedback),
  reply: (id, text) => call('session:reply', id, text),
  dismiss: id => call('session:dismiss', id),
  ack: () => call('session:ack'),
  openFolder: cwd => call('session:openFolder', cwd),
  clearHistory: () => call('history:clear'),

  media: cmd => call('media', cmd),
  copy: text => call('clip:copy', text),
  clearClipboard: () => call('clip:clear'),
  setPrefs: patch => call('prefs:set', patch),
  setLogin: on => call('login:set', on),

  ask: (prompt, screen) => call('ask', { prompt, screen }),
  cancelAsk: () => call('ask:cancel'),

  // A FileList can't cross the context bridge, but single File objects can: the page maps each one through pathFor.
  pathFor: file => webUtils.getPathForFile(file),
  shelfAdd: paths => call('shelf:add', paths),
  shelfRemove: p => call('shelf:remove', p),
  shelfClear: () => call('shelf:clear'),
  shelfOpen: p => call('shelf:open', p),
  shelfReveal: p => call('shelf:reveal', p),
  shelfDrag: p => ipcRenderer.send('shelf:drag', p),
  pinAddPaths: paths => call('pins:add-paths', paths),
  pinPick: kind => call('pins:pick', kind),
  pinAddUrl: (name, url) => call('pins:add-url', name, url),
  pinSet: list => call('pins:set', list),
  pinOpen: id => call('pins:open', id),
  pinIcons: () => call('pins:icons'),
  phoneStart: () => call('phone:start'),
  phoneStop: () => call('phone:stop'),
  openTerms: () => call('app:terms'),
  openUpdate: () => call('app:update'),
  checkUpdate: () => call('app:check-update'),
  quit: () => call('quit'),
});
