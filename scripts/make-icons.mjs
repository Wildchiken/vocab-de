// Writes the PNG app icons (Safari needs PNG for the Home Screen). No image library needed.
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

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
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
// iOS rounds the corners itself, so the background fills the square.
function render(size) {
  const bg = hex('#1d1e22');
  const bars = [
    [150, hex('#3b7be6')],
    [230, hex('#e24b5a')],
    [310, hex('#2aa866')],
  ];
  const s = size / 512;
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const X = (x + 0.5) / s;
      const Y = (y + 0.5) / s;
      let col = bg;
      for (const [top, c] of bars) {
        const cy = top + 26;
        const dx = Math.max(0, Math.abs(X - 256) - (136 - 26));
        if (Math.hypot(dx, Y - cy) <= 26) col = c;
      }
      const o = y * (size * 3 + 1) + 1 + x * 3;
      raw[o] = col[0];
      raw[o + 1] = col[1];
      raw[o + 2] = col[2];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
for (const size of [180, 512]) writeFileSync(new URL(`../public/icons/icon-${size}.png`, import.meta.url), render(size));
console.log('icons written');
