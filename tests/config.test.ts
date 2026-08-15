import { describe, it, expect } from 'vitest';
import {
  GAME_WIDTH,
  GAME_HEIGHT,
  MIN_SUPPORTED_WIDTH,
  MIN_SUPPORTED_HEIGHT,
  aspectRatio,
} from '../src/config';

describe('畫面基準解析度', () => {
  it('維持 9:16 直向比例（GAME_DESIGN 第 0 節）', () => {
    expect(aspectRatio(GAME_WIDTH, GAME_HEIGHT)).toBeCloseTo(9 / 16, 5);
  });

  it('為直向，不得寫成橫向', () => {
    expect(GAME_HEIGHT).toBeGreaterThan(GAME_WIDTH);
  });

  it('基準解析度不低於最小支援裝置（TECH_SPEC 第 6 節）', () => {
    expect(GAME_WIDTH).toBeGreaterThanOrEqual(MIN_SUPPORTED_WIDTH);
    expect(GAME_HEIGHT).toBeGreaterThanOrEqual(MIN_SUPPORTED_HEIGHT);
  });

  it('最小支援裝置本身也是直向', () => {
    expect(MIN_SUPPORTED_HEIGHT).toBeGreaterThan(MIN_SUPPORTED_WIDTH);
  });
});
