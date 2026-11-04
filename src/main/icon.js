'use strict';
// Draws Pulse's icon (a glowing ring with a dot) as a PNG at runtime, so no binary assets are needed.
const zlib = require('node:zlib');

const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc32 = buf => { let c = -1; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function iconPng(size = 32, rgb = [124, 92, 255]) {
  const rows = [];
  const c = (size - 1) / 2, ringR = size * 0.38, ringW = size * 0.09, dotR = size * 0.14;
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 4);
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - c, y - c);
      const ring = Math.max(0, 1 - Math.abs(d - ringR) / ringW);
      const dot = Math.max(0, Math.min(1, dotR - d + 0.5));
      const a = Math.min(1, Math.max(ring, dot));
      const o = 1 + x * 4;
      row[o] = rgb[0]; row[o + 1] = rgb[1]; row[o + 2] = rgb[2]; row[o + 3] = Math.round(a * 255);
    }
    rows.push(row);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))]);
}

// A Windows .ico holding PNG images at several sizes (used for the app icon and the Start menu shortcut).
function iconIco(sizes = [16, 24, 32, 48, 64, 128, 256]) {
  const images = sizes.map(s => ({ s, png: iconPng(s) }));
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(images.length, 4);
  const dir = Buffer.alloc(16 * images.length);
  let offset = 6 + dir.length;
  images.forEach(({ s, png }, i) => {
    const o = i * 16;
    dir[o] = s >= 256 ? 0 : s; dir[o + 1] = s >= 256 ? 0 : s;  // 0 means 256
    dir.writeUInt16LE(1, o + 4); dir.writeUInt16LE(32, o + 6);   // planes, bits per pixel
    dir.writeUInt32LE(png.length, o + 8); dir.writeUInt32LE(offset, o + 12);
    offset += png.length;
  });
  return Buffer.concat([header, dir, ...images.map(i => i.png)]);
}

module.exports = { iconPng, iconIco };
