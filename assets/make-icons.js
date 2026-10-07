// Generates the app, extension and Stream Deck icons with no dependencies:
// a red round badge with a white ring and bold "YTS" lettering. Deliberately not the
// YouTube logo shape (no play button, no rounded rectangle).
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

const RED = [255, 0, 0];
const WHITE = [255, 255, 255];

// Letter strokes as polylines in a unit box (0..1 each axis).
const LETTERS = {
  Y: [[[0, 0], [0.5, 0.5]], [[1, 0], [0.5, 0.5]], [[0.5, 0.5], [0.5, 1]]],
  T: [[[0, 0], [1, 0]], [[0.5, 0], [0.5, 1]]],
  S: [[[0.95, 0.1], [0.08, 0.1], [0.08, 0.5], [0.92, 0.5], [0.92, 0.9], [0.05, 0.9]]]
};

function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

// Is canvas point (u, v) inside the lettering?
function inLetters(u, v, stroke) {
  const w = 0.18, h = 0.3, gap = 0.05, x0 = 0.5 - (3 * w + 2 * gap) / 2, y0 = 0.5 - h / 2;
  'YTS'.split('').forEach(() => {});
  let hit = false;
  'YTS'.split('').forEach((ch, i) => {
    if (hit) return;
    const ox = x0 + i * (w + gap);
    for (const line of LETTERS[ch]) {
      for (let k = 0; k < line.length - 1; k++) {
        const [ax, ay] = line[k], [bx, by] = line[k + 1];
        if (segDist(u, v, ox + ax * w, y0 + ay * h, ox + bx * w, y0 + by * h) <= stroke / 2) { hit = true; return; }
      }
    }
  });
  return hit;
}

function sample(u, v, size) {
  const r = Math.hypot(u - 0.5, v - 0.5);
  if (r > 0.47) return null;                                  // transparent outside the badge
  const stroke = size <= 32 ? 0.075 : 0.062;
  if (inLetters(u, v, stroke)) return WHITE;
  if (size >= 48 && r > 0.40 && r < 0.43) return WHITE;       // thin inner ring on larger sizes
  return RED;
}

// `scale` shrinks the artwork inside the canvas (the Web Store wants 96px of art in a 128px icon).
function png(size, scale = 1) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const SS = 4;                                               // 4x4 supersampling for smooth edges
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
        const u = ((x + (sx + 0.5) / SS) / size - 0.5) / scale + 0.5;
        const v = ((y + (sy + 0.5) / SS) / size - 0.5) / scale + 0.5;
        const c = sample(u, v, size * scale);
        if (c) { r += c[0]; g += c[1]; b += c[2]; a++; }
      }
      const i = y * (size * 4 + 1) + 1 + x * 4;
      const n = SS * SS;
      raw[i] = a ? Math.round(r / a) : 0;
      raw[i + 1] = a ? Math.round(g / a) : 0;
      raw[i + 2] = a ? Math.round(b / a) : 0;
      raw[i + 3] = Math.round((a / n) * 255);
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

// Chrome Web Store listing icon: 128x128 with 96x96 artwork and 16px transparent padding.
fs.mkdirSync(path.join(root, 'store-assets'), { recursive: true });
fs.writeFileSync(path.join(root, 'store-assets', 'store-icon-128.png'), png(128, 96 / 128));

// Stream Deck plugin images (each with an @2x variant).
const imgs = path.join(root, 'streamdeck-plugin', 'com.rmstep.ytsoundboard.sdPlugin', 'imgs');
fs.mkdirSync(imgs, { recursive: true });
for (const [name, size] of [['plugin', 256], ['category', 28], ['action', 20], ['key', 72]]) {
  fs.writeFileSync(path.join(imgs, `${name}.png`), png(size));
  fs.writeFileSync(path.join(imgs, `${name}@2x.png`), png(size * 2));
}
console.log('icons written');
