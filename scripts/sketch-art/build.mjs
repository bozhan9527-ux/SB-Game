/**
 * 產生全部手繪美術到 public/art/（WebP），並寫出 src/data/art-manifest.json。
 *
 * 用法：node scripts/sketch-art/build.mjs [只產生某一類：chars|bosses|world|title]
 * 改圖請改產生器再重跑，不要手改輸出的圖檔。
 *
 * 解析度：遊戲畫布是 540×960 點、以兩倍像素算圖（見 src/config.ts 的 RENDER_SCALE），
 * 所以角色與介面元件都以 2 倍算圖、一個貼圖像素對一個螢幕像素。
 * 首領圖大、背景整張，各降到 1.5 倍與 1 倍——全部 2 倍的話，手機的顯示記憶體會吃緊。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pic, seedRng } from './lib.mjs';
import { opaqueTop, rasterize, readImage, writeImage } from './render.mjs';
import { MOBS, SECTS, disciple } from './chars.mjs';
import { BOSSES } from './bosses.mjs';
import * as W from './world.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..', '..');
const OUT = path.join(ROOT, 'public', 'art');
const MANIFEST = path.join(ROOT, 'src', 'data', 'art-manifest.json');
const only = process.argv[2] ?? 'all';
fs.mkdirSync(OUT, { recursive: true });

const RES = { char: 2, boss: 1.5, ui: 2, backdrop: 1 };

function hash(s) {
  let h = 7;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) % 1000003;
  return h;
}

async function save(name, pic, res, opt = {}) {
  const img = rasterize(pic, res, opt);
  const file = path.join(OUT, `${name}.webp`);
  await writeImage(img, file, opt);
  return readImage(file);
}

/** 一組動畫幀；回傳 manifest 用的尺寸（貼圖像素）與顯示倍數。 */
async function frames(prefix, w, h, draw, count, res) {
  let top = Infinity, size = null;
  for (let f = 0; f < count; f++) {
    seedRng(hash(prefix) * 13 + f * 101);
    const p = new Pic(w, h);
    draw(p, w / 2, h - 3, f);
    const img = await save(`${prefix}-${f}`, p, res);
    top = Math.min(top, opaqueTop(img));
    size = { w: img.width, h: img.height };
  }
  return { w: size.w, h: size.h, top, scale: 1 / res };
}

const manifest = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) : {};
manifest.enemy ??= {};
manifest.boss ??= {};
manifest.disciple ??= {};

if (only === 'all' || only === 'chars') {
  for (const [art, def] of Object.entries(MOBS)) {
    manifest.enemy[art] = await frames(`enemy-${art}`, def.w, def.h, def.draw, 4, RES.char);
  }
  for (const sect of SECTS) {
    let size = null;
    for (const tier of [0, 1, 2]) size = await frames(`disciple-${sect}-t${tier}`, 80, 112, disciple(sect, tier), 4, RES.char);
    manifest.disciple[sect] = size;
  }
  console.log('角色完成');
}

if (only === 'all' || only === 'bosses') {
  for (const [art, def] of Object.entries(BOSSES)) {
    manifest.boss[art] = await frames(`boss-${art}`, def.w, def.h, def.draw, 2, RES.boss);
  }
  console.log('首領完成');
}

if (only === 'all' || only === 'world') {
  const realms = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'realms.json'), 'utf8'));
  for (const realm of Array.isArray(realms) ? realms : realms.realms) {
    seedRng(hash(realm.id));
    await save(`bg-${realm.id}`, W.backdrop(realm), RES.backdrop, { paper: true, quality: 78 });
  }
  const one = async (name, make, res = RES.ui, opt = {}) => {
    seedRng(hash(name));
    await save(name, make(), res, opt);
  };
  await one('arena', W.arena);
  await one('gate', W.gate);
  await one('gate-beam', W.gateBeam);
  await one('gate-post', W.gatePost);
  await one('slot', W.slot);
  await one('card-paper', W.cardPaper);
  await one('cloud', W.cloud);
  await one('slash', W.slash);
  for (const g of W.GLYPH_NAMES) await one(`glyph-${g}`, () => W.glyph(g));
  for (const i of W.ICON_LIST) await one(`icon-${i}`, () => W.icon(i));
  console.log('場景完成');
}

if (only === 'all' || only === 'title') {
  const one = async (name, make, res = RES.ui, opt = {}) => {
    seedRng(hash(name));
    await save(name, make(), res, opt);
  };
  await one('title-key', W.titleKey, RES.backdrop, { paper: true, quality: 80 });
  await one('title-logo', W.titleLogo);
  await one('title-hero', W.titleHero);
  await one('title-sword', W.titleSword);
  await one('title-crane-0', () => W.titleCrane(0));
  await one('title-crane-1', () => W.titleCrane(1));
  console.log('主畫面完成');
}

const sortKeys = (o) => Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]));
fs.writeFileSync(MANIFEST, JSON.stringify({ boss: sortKeys(manifest.boss), disciple: sortKeys(manifest.disciple), enemy: sortKeys(manifest.enemy) }, null, 1) + '\n');
