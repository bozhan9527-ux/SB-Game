// 測試環境沒有 node 型別（見 tsconfig 的 types），這兩個模組只在 vitest 的 node 底下跑。
// @ts-expect-error -- node:fs 沒有型別
import { readFileSync } from 'node:fs';
// @ts-expect-error -- node:zlib 沒有型別
import { inflateSync } from 'node:zlib';
import { describe, it, expect } from 'vitest';
import { ENEMY_ART_TOP } from '../src/art';
import type { MobArt } from '../src/data/types';

const read = readFileSync as (path: string) => Uint8Array;
const inflate = inflateSync as (data: Uint8Array) => Uint8Array;

/**
 * 讀 scripts/pixel-art 寫出的 PNG：RGBA、每列 filter 0。
 * 只為了量不透明範圍，不是通用的 PNG 解碼器。
 */
function opaqueTop(path: string): number {
  const file = read(path);
  const view = new DataView(file.buffer, file.byteOffset, file.byteLength);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  const parts: Uint8Array[] = [];
  for (let at = 8; at < file.length; ) {
    const length = view.getUint32(at);
    const tag = String.fromCharCode(...file.subarray(at + 4, at + 8));
    if (tag === 'IDAT') parts.push(file.subarray(at + 8, at + 8 + length));
    at += 12 + length;
  }
  const joined = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    joined.set(part, offset);
    offset += part.length;
  }
  const raw = inflate(joined);
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
