'use strict';
// Phone bridge: a temporary page on your local network (reached by QR code) to send files
// between your phone and the Pulse shelf. Secret random URL, auto-stops after an hour.
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { EventEmitter } = require('node:events');
const QRCode = require('qrcode');

const LIFETIME_MS = 60 * 60 * 1000;
const MAX_UPLOAD = 4 * 1024 ** 3;

function lanAddress() {
  const all = Object.values(os.networkInterfaces()).flat().filter(a => a && a.family === 'IPv4' && !a.internal);
  const score = a => (/^192\.168\./.test(a.address) ? 3 : /^10\./.test(a.address) ? 2 : /^172\.(1[6-9]|2\d|3[01])\./.test(a.address) ? 1 : 0);
  return all.sort((a, b) => score(b) - score(a))[0]?.address || null;
}
const safeName = n => path.basename(String(n || 'file')).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 180) || 'file';

function page() {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Pulse</title><style>
body{margin:0;font:16px system-ui,sans-serif;background:#000;color:#eee;padding:24px}
h1{font-size:22px;margin:0 0 4px}p{color:#999;margin:0 0 20px}
.btn{display:block;width:100%;padding:16px;border-radius:16px;border:0;background:#ffc533;color:#211800;font-weight:700;font-size:17px}
ul{list-style:none;padding:0;margin:20px 0}li{padding:14px;border-radius:12px;background:#151515;margin-bottom:8px}
a{color:#7cc4ff;text-decoration:none;word-break:break-all}#s{color:#7ff0ad;margin-top:12px;min-height:20px}
</style></head><body><h1>Pulse</h1><p>Send files to your PC, or download what's on the shelf.</p>
<input id="f" type="file" multiple hidden><button class="btn" onclick="f.click()">Send files to PC</button><div id="s"></div>
<h1 style="margin-top:28px;font-size:18px">On the shelf</h1><ul id="l"></ul>
<script>
const base=location.pathname.replace(/\\/$/,'');
async function load(){const r=await fetch(base+'/files');const files=await r.json();l.innerHTML='';
 if(!files.length)l.innerHTML='<li style="color:#777">Nothing yet. Drop files on the island.</li>';
 files.forEach((x,i)=>{const li=document.createElement('li');const a=document.createElement('a');a.href=base+'/file/'+i;a.textContent=x.name;a.download=x.name;li.append(a);l.append(li);});}
f.onchange=async()=>{for(const file of f.files){s.textContent='Sending '+file.name+'…';
 const r=await fetch(base+'/upload?name='+encodeURIComponent(file.name),{method:'PUT',body:file});
 s.textContent=r.ok?'Sent '+file.name+' ✓':'Failed: '+file.name;}f.value='';};
load();setInterval(load,4000);
</script></body></html>`;
}

class PhoneBridge extends EventEmitter {
  constructor({ getShelf, saveDir }) {
    super();
    this.getShelf = getShelf; this.saveDir = saveDir;
    this.server = null; this.token = ''; this.url = ''; this.qr = ''; this.timer = null; this.connected = false; this.received = 0;
  }

  status() { return { on: Boolean(this.server), url: this.url, qr: this.qr, connected: this.connected, received: this.received, endsAt: this.endsAt || 0 }; }

  async start() {
    if (this.server) return this.status();
    const ip = lanAddress();
    if (!ip) throw new Error('No local network found. Connect to Wi-Fi first.');
    this.token = randomBytes(16).toString('hex');
    this.server = http.createServer((req, res) => this.#route(req, res));
    await new Promise((resolve, reject) => { this.server.once('error', reject); this.server.listen(0, '0.0.0.0', resolve); });
    this.url = `http://${ip}:${this.server.address().port}/p/${this.token}`;
    this.qr = await QRCode.toDataURL(this.url, { margin: 1, width: 360, color: { dark: '#000000', light: '#ffffff' } });
    this.connected = false; this.received = 0; this.endsAt = Date.now() + LIFETIME_MS;
    this.timer = setTimeout(() => this.stop(), LIFETIME_MS);
    this.emit('change');
    return this.status();
  }

  stop() {
    clearTimeout(this.timer);
    try { this.server?.close(); this.server?.closeAllConnections?.(); } catch {}
    this.server = null; this.url = ''; this.qr = ''; this.connected = false; this.endsAt = 0;
    this.emit('change');
  }

  #route(req, res) {
    const url = new URL(req.url, 'http://x');
    const prefix = `/p/${this.token}`;
    if (!url.pathname.startsWith(prefix)) { res.writeHead(404).end(); return; }
    const rest = url.pathname.slice(prefix.length) || '/';
    if (!this.connected) { this.connected = true; this.emit('change'); }

    if (req.method === 'GET' && rest === '/') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(page()); return; }
    if (req.method === 'GET' && rest === '/files') {
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(this.getShelf().map(f => ({ name: f.name })))); return;
    }
    const m = rest.match(/^\/file\/(\d+)$/);
    if (req.method === 'GET' && m) {
      const f = this.getShelf()[Number(m[1])];
      if (!f || !fs.existsSync(f.path) || !fs.statSync(f.path).isFile()) { res.writeHead(404).end(); return; }
      res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': fs.statSync(f.path).size,
        'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(f.name)}` });
      fs.createReadStream(f.path).pipe(res); return;
    }
    if (req.method === 'PUT' && rest === '/upload') {
      fs.mkdirSync(this.saveDir, { recursive: true });
      let name = safeName(url.searchParams.get('name')), target = path.join(this.saveDir, name), n = 1;
      while (fs.existsSync(target)) { const ext = path.extname(name); target = path.join(this.saveDir, `${path.basename(name, ext)} (${n++})${ext}`); }
      let size = 0;
      const out = fs.createWriteStream(target);
      req.on('data', c => { size += c.length; if (size > MAX_UPLOAD) { req.destroy(); out.destroy(); fs.rm(target, () => {}); } });
      req.pipe(out);
      out.on('finish', () => { this.received++; this.emit('received', target); this.emit('change'); res.writeHead(200).end('ok'); });
      out.on('error', () => { res.writeHead(500).end(); });
      return;
    }
    res.writeHead(404).end();
  }
}

module.exports = { PhoneBridge, lanAddress };
