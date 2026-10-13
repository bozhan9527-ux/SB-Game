// 測試環境沒有 node 型別（見 tsconfig 的 types），這兩個模組只在 vitest 的 node 底下跑。
// @ts-expect-error -- node:module 沒有型別
import { createRequire } from 'node:module';
import { describe, it, expect } from 'vitest';
import { ENEMY_ART_TOP, bossArtSize, enemyArtSize } from '../src/art';
import { BOSS_ART_NAMES } from '../src/data/types';
import type { MobArt } from '../src/data/types';

// sharp 只在開發環境有（devDependencies），用 require 載入免得型別檢查去找它的宣告。
const sharp = (createRequire as (url: string) => (id: string) => unknown)(import.meta.url)('sharp') as (file: string) => {
  ensureAlpha(): { raw(): { toBuffer(o: { resolveWithObject: true }): Promise<{ data: Uint8Array; info: { width: number; height: number } }> } };
};

/** 貼圖實際有畫的最上一列（alpha 夠深才算，和 scripts/sketch-art/render.mjs 的 opaqueTop 同一個門檻）。 */
async function opaqueTop(path: string): Promise<{ top: number; width: number; height: number }> {
  const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      if ((data[(y * info.width + x) * 4 + 3] ?? 0) > 24) return { top: y, width: info.width, height: info.height };
    }
  }
  return { top: info.height, width: info.width, height: info.height };
}

describe('妖物貼圖', () => {
  it('ENEMY_ART_TOP 和貼圖實際的上緣一致（重畫妖物後要重跑產生器）', async () => {
    for (const [art, top] of Object.entries(ENEMY_ART_TOP) as [MobArt, number][]) {
      const frames = await Promise.all([0, 1, 2, 3].map((frame) => opaqueTop(`public/art/enemy-${art}-${frame}.webp`)));
      expect([art, Math.min(...frames.map((f) => f.top))]).toEqual([art, top]);
      const size = enemyArtSize(art);
      expect([art, frames[0]!.width, frames[0]!.height]).toEqual([art, size.w, size.h]);
    }
  });

  it('每一隻首領都有兩幀貼圖，尺寸和 manifest 一致', async () => {
    for (const art of BOSS_ART_NAMES) {
      const size = bossArtSize(art);
      for (const frame of [0, 1]) {
        const img = await opaqueTop(`public/art/boss-${art}-${frame}.webp`);
        expect([art, img.width, img.height]).toEqual([art, size.w, size.h]);
      }
    }
  });
});
