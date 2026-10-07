// Generates the app and extension icons (simple speaker glyph) with no dependencies.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

function png(size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size, v = (y + 0.5) / size;
      // rounded-square background
      const dx = Math.max(Math.abs(u - 0.5) - 0.34, 0), dy = Math.max(Math.abs(v - 0.5) - 0.34, 0);
      const inBg = Math.hypot(dx, dy) < 0.16;
      // speaker: box + cone + sound wave arc
      const box = u > 0.24 && u < 0.36 && v > 0.40 && v < 0.60;
      const t = (u - 0.36) / 0.2;
      const cone = u >= 0.36 && u <= 0.56 && Math.abs(v - 0.5) < 0.10 + 0.20 * t;
      const r = Math.hypot(u - 0.52, v - 0.5);
      const wave = u > 0.62 && r > 0.20 && r < 0.27;
      const white = inBg && (box || cone || wave);
      const i = y * (size * 4 + 1) + 1 + x * 4;
      const [R, G, B, A] = !inBg ? [0, 0, 0, 0] : white ? [255, 255, 255, 255] : [79, 140, 255, 255];
      raw[i] = R; raw[i + 1] = G; raw[i + 2] = B; raw[i + 3] = A;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))
  ]);
}

const root = path.join(__dirname, '..');
fs.writeFileSync(path.join(__dirname, 'icon.png'), png(256));
fs.mkdirSync(path.join(root, 'extension', 'icons'), { recursive: true });
for (const s of [16, 48, 128]) fs.writeFileSync(path.join(root, 'extension', 'icons', `${s}.png`), png(s));
// Stream Deck plugin images (each with an @2x variant).
const imgs = path.join(root, 'streamdeck-plugin', 'com.rmstep.ytsoundboard.sdPlugin', 'imgs');
fs.mkdirSync(imgs, { recursive: true });
for (const [name, size] of [['plugin', 256], ['category', 28], ['action', 20], ['key', 72]]) {
  fs.writeFileSync(path.join(imgs, `${name}.png`), png(size));
  fs.writeFileSync(path.join(imgs, `${name}@2x.png`), png(size * 2));
}
console.log('icons written');
