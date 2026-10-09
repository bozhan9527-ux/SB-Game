import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { describe, it, expect } from 'vitest';
import { ENEMY_ART_TOP } from '../src/art';
import type { MobArt } from '../src/data/types';

/**
 * 讀 scripts/pixel-art 寫出的 PNG：RGBA、單一 IDAT、每列 filter 0。
 * 只為了量不透明範圍，不是通用的 PNG 解碼器。
 */
function opaqueTop(path: string): number {
  const file = readFileSync(path);
  const width = file.readUInt32BE(16);
  const height = file.readUInt32BE(20);
  const chunks: Buffer[] = [];
  for (let at = 8; at < file.length; ) {
    const length = file.readUInt32BE(at);
    const tag = file.toString('latin1', at + 4, at + 8);
    if (tag === 'IDAT') chunks.push(file.subarray(at + 8, at + 8 + length));
    at += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(chunks));
  const stride = 1 + width * 4;
  for (let y = 0; y < height; y += 1) {
    expect(raw[y * stride]).toBe(0);
    for (let x = 0; x < width; x += 1) {
      if ((raw[y * stride + 1 + x * 4 + 3] ?? 0) > 0) return y;
    }
  }
  return height;
}

describe('妖物貼圖', () => {
  it('ENEMY_ART_TOP 和貼圖實際的上緣一致（重畫妖物後要跟著改）', () => {
    for (const [art, top] of Object.entries(ENEMY_ART_TOP) as [MobArt, number][]) {
      const tops = [0, 1, 2, 3].map((frame) => opaqueTop(`public/art/enemy-${art}-${frame}.png`));
      expect([art, Math.min(...tops)]).toEqual([art, top]);
    }
  });
});
