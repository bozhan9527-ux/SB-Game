/**
 * SVG → 貼圖。resvg 算圖，sharp 壓成 WebP（手繪排線用 PNG 存太大，WebP 小五到十倍）。
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { Resvg } = require('@resvg/resvg-js');
const sharp = require('sharp');

const HERE = path.dirname(fileURLToPath(import.meta.url));
import fs from 'node:fs';
export const FONT_FILES = [path.join(HERE, 'fonts', 'LXGWWenKaiTC-art.ttf')].filter((f) => fs.existsSync(f));

/** 算成 RGBA。res：一個遊戲點對幾個貼圖像素。 */
export function rasterize(pic, res, { paper = false } = {}) {
  const r = new Resvg(pic.svg({ paper }), {
    fitTo: { mode: 'zoom', value: res },
    font: { fontFiles: FONT_FILES, loadSystemFonts: false, defaultFontFamily: 'LXGW WenKai TC Medium' },
  });
  const img = r.render();
  return { data: img.pixels, width: img.width, height: img.height };
}

/** 實際有畫的最上一列（alpha 夠深才算，排線邊緣的淡顆粒不算）。 */
export function opaqueTop(img, threshold = 24) {
  const { data, width, height } = img;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (data[(y * width + x) * 4 + 3] > threshold) return y;
  return height;
}

export async function writeImage(img, file, { quality = 82, lossless = false } = {}) {
  await sharp(Buffer.from(img.data), { raw: { width: img.width, height: img.height, channels: 4 } })
    .webp({ quality, alphaQuality: 90, effort: 5, lossless })
    .toFile(file);
}

/** 讀回寫出的檔案（WebP 有損，alpha 會和算圖時差一點；manifest 量的是玩家實際拿到的那一張）。 */
export async function readImage(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}
