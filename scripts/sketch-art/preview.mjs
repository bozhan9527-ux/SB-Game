// 開發用：把一組角色排成一張總覽圖（不進遊戲）。node scripts/sketch-art/preview.mjs <輸出.png> mobs|disciples|bosses
import { createRequire } from 'node:module';
import { Pic, seedRng } from './lib.mjs';
import { rasterize } from './render.mjs';
import { MOBS, SECTS, disciple } from './chars.mjs';
const require = createRequire(import.meta.url);
const sharp = require('sharp');
const [out, which = 'mobs', frames = '0,2'] = process.argv.slice(2);
let items = [];
if (which === 'mobs') items = Object.entries(MOBS).map(([k, v]) => [k, v.w, v.h, v.draw]);
if (which === 'disciples') items = SECTS.flatMap((s) => [0, 1, 2].map((t) => [`${s}${t}`, 80, 112, disciple(s, t)]));
if (which === 'bosses') { const { BOSSES } = await import('./bosses.mjs'); items = Object.entries(BOSSES).map(([k, v]) => [k, v.w, v.h, v.draw]); }
const fr = frames.split(',').map(Number);
const cell = which === 'bosses' ? 240 : 120, cols = which === 'bosses' ? 6 : 8;
const comps = [];
let i = 0;
for (const [name, w, h, draw] of items) for (const f of fr) {
  seedRng(name.length * 977 + f * 31 + 5);
  const p = new Pic(w, h); draw(p, w / 2, h - 3, f);
  const img = rasterize(p, 1);
  const buf = await sharp(Buffer.from(img.data), { raw: { width: img.width, height: img.height, channels: 4 } }).png().toBuffer();
  const c = i % cols, r = Math.floor(i / cols);
  comps.push({ input: buf, left: c * cell + Math.round((cell - img.width) / 2), top: r * (cell + 4) + Math.round(cell - img.height) });
  i++;
}
const rows = Math.ceil(i / cols);
await sharp({ create: { width: cols * cell, height: rows * (cell + 4), channels: 4, background: '#efe6d2' } }).composite(comps).png().toFile(out);
console.log('ok', i);
