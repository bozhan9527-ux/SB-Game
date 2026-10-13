// @ts-expect-error -- node:fs 沒有型別（見 tsconfig 的 types），只在 vitest 的 node 底下跑。
import { readFileSync, readdirSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const read = readFileSync as (path: string, encoding: string) => string;
const list = readdirSync as (path: string, options: { recursive: true }) => string[];

/**
 * 遊戲字型是霞鶩文楷的子集（只收用到的字）。新寫的文案用到字表外的字，
 * 那幾個字會由系統字型補上——在手寫字裡夾一個黑體字，一眼就看得出來。
 * 這個測試抓的就是那種情況：失敗時重跑 scripts/sketch-art/subset-font.py。
 */
describe('遊戲字型', () => {
  it('src/ 與 data/ 裡用到的字都收在字型子集裡', () => {
    const covered = new Set(read('public/fonts/game-chars.txt', 'utf8'));
    const missing = new Set<string>();
    for (const top of ['src', 'data']) {
      for (const file of list(top, { recursive: true })) {
        if (!/\.(ts|json)$/.test(file)) continue;
        for (const char of read(`${top}/${file}`, 'utf8')) {
          if (char.codePointAt(0)! >= 0x2000 && !covered.has(char)) missing.add(char);
        }
      }
    }
    expect([...missing].join('')).toBe('');
  });
});
