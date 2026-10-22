// 開發用：同一批素材用兩種畫風各算一次，左右並排。node scripts/sketch-art/compare.mjs <輸出.png> [realmIndex]
import { createRequire } from 'node:module';
import fs from 'node:fs';
import { Pic, groundShadow, seedRng, setStyle } from './lib.mjs';
import { rasterize } from './render.mjs';
import { MOBS, disciple } from './chars.mjs';
import { BOSSES } from './bosses.mjs';
import * as W from './world.mjs';
const require = createRequire(import.meta.url);
const sharp = require('sharp');
const [out, ri = '1'] = process.argv.slice(2);
const realms = JSON.parse(fs.readFileSync(new URL('../../data/realms.json', import.meta.url), 'utf8'));
const realm = (Array.isArray(realms) ? realms : realms.realms)[Number(ri)];
const mobKeys = Object.keys(MOBS).slice(0, 3), bossKey = Object.keys(BOSSES)[2];
const png = async (pic, res, paper = false) => {
  const img = rasterize(pic, res, { paper });
  return sharp(Buffer.from(img.data), { raw: { width: img.width, height: img.height, channels: 4 } }).png().toBuffer();
};
const char = (w, h, draw) => { const p = new Pic(w, h, { vivid: true }); groundShadow(p, w / 2, h - 6, w * 0.3, 5); draw(p, w / 2, h - 3, 0); return p; };
async function panel(style) {
  setStyle(style);
  const comps = [];
  seedRng(7); comps.push({ input: await png(W.backdrop(realm), 0.5, true), left: 0, top: 0 });
  let x = 280;
  for (const [i, s] of ['sword', 'talisman', 'alchemy'].entries()) { seedRng(11 + i); comps.push({ input: await png(char(80, 112, disciple(s, i)), 1.6), left: x, top: 0 }); x += 130; }
  x = 280;
  for (const [i, k] of mobKeys.entries()) { seedRng(21 + i); const m = MOBS[k]; comps.push({ input: await png(char(m.w, m.h, m.draw), 1.4), left: x, top: 190 }); x += 130; }
  seedRng(31); const b = BOSSES[bossKey]; comps.push({ input: await png(char(b.w ?? 200, b.h ?? 200, b.draw), 1), left: 280, top: 330 });
  seedRng(41); comps.push({ input: await png(W.cardPaper(), 1.2), left: 520, top: 340 });
  seedRng(42); comps.push({ input: await png(W.glyph(W.GLYPH_NAMES[0]), 1.2), left: 520, top: 340 });
  const bg = style === 'marker' ? '#fbfaf5' : '#efe6d2';
  return sharp({ create: { width: 700, height: 560, channels: 4, background: bg } }).composite(comps).png().toBuffer();
}
const a = await panel('pencil'), b = await panel('marker');
await sharp({ create: { width: 1420, height: 560, channels: 4, background: '#888' } }).composite([{ input: a, left: 0, top: 0 }, { input: b, left: 720, top: 0 }]).png().toFile(out);
console.log('ok');
