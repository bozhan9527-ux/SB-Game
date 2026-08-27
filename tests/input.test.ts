import { describe, it, expect } from 'vitest';
import { BALANCE } from '../src/data';
import { addMomentum, approach, clampToTrack } from '../src/input/follow';

describe('觸控跟隨（TECH_SPEC 第 4.5 節）', () => {
  it('目標座標會被夾在路面範圍內', () => {
    expect(clampToTrack(0, 40, 500, 70)).toBe(110);
    expect(clampToTrack(999, 40, 500, 70)).toBe(430);
    expect(clampToTrack(270, 40, 500, 70)).toBe(270);
  });

  it('路面比邊界還窄時退回中央，不會回傳顛倒的範圍', () => {
    expect(clampToTrack(10, 100, 200, 90)).toBe(150);
  });

  it('逼近目標但不會超過', () => {
    const next = approach(0, 100, 16, BALANCE.input.followSpeed);
    expect(next).toBeGreaterThan(0);
    expect(next).toBeLessThan(100);
  });

  it('手感與畫格率解耦：兩次 8ms 與一次 16ms 的結果相同', () => {
    const speed = BALANCE.input.followSpeed;
    const oneStep = approach(0, 100, 16, speed);
    const twoSteps = approach(approach(0, 100, 8, speed), 100, 8, speed);
    expect(twoSteps).toBeCloseTo(oneStep, 10);
  });

  it('時間為 0 或速度為 0 時不移動', () => {
    expect(approach(30, 100, 0, 15)).toBe(30);
    expect(approach(30, 100, 16, 0)).toBe(30);
  });

  it('氣勢依移動距離累積，方向不影響，且有上限', () => {
    const { momentumPerPixel } = BALANCE.input;
    const max = BALANCE.boss.momentumMax;
    expect(addMomentum(0, 100, momentumPerPixel, max)).toBeCloseTo(100 * momentumPerPixel, 10);
    expect(addMomentum(0, -100, momentumPerPixel, max)).toBeCloseTo(100 * momentumPerPixel, 10);
    expect(addMomentum(0, 999999, momentumPerPixel, max)).toBe(max);
  });
});
