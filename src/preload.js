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
  interactive: v => call('island:interactive', Boolean(v)),
  focus: () => call('island:focus'),

  connect: () => call('claude:connect'),
  disconnect: () => call('claude:disconnect'),
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

  shelfAdd: files => call('tray:add', [...files].map(f => webUtils.getPathForFile(f)).filter(Boolean)),
  shelfRemove: p => call('tray:remove', p),
  shelfOpen: p => call('tray:open', p),
  shelfReveal: p => call('tray:reveal', p),
  shelfDrag: p => ipcRenderer.send('tray:drag', p),
  quit: () => call('quit'),
});
