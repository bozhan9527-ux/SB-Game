import { describe, it, expect } from 'vitest';
import { detectSwipe, SwipeTracker } from '../src/input/swipe';
import { BALANCE } from '../src/data';

const T = BALANCE.swipe;

describe('滑動手勢辨識（TECH_SPEC 第 4.5 節）', () => {
  it('位移足夠的水平滑動判為左右', () => {
    expect(detectSwipe({ x: 200, y: 500, t: 0 }, { x: 300, y: 505, t: 120 }, T)).toBe('right');
    expect(detectSwipe({ x: 300, y: 500, t: 0 }, { x: 200, y: 495, t: 120 }, T)).toBe('left');
  });

  it('位移未達門檻不判定', () => {
    const short = T.minDistancePx - 1;
    expect(detectSwipe({ x: 0, y: 0, t: 0 }, { x: short, y: 0, t: 100 }, T)).toBeNull();
  });

  it('時間超過上限不判定', () => {
    expect(detectSwipe({ x: 0, y: 0, t: 0 }, { x: 200, y: 0, t: T.maxDurationMs + 1 }, T)).toBeNull();
  });

  it('斜向且兩軸差距不足 axisRatio 時不判定，避免誤判', () => {
    expect(detectSwipe({ x: 0, y: 0, t: 0 }, { x: 60, y: 55, t: 100 }, T)).toBeNull();
  });

  it('垂直位移足夠時判為上下', () => {
    expect(detectSwipe({ x: 0, y: 0, t: 0 }, { x: 5, y: -80, t: 100 }, T)).toBe('up');
    expect(detectSwipe({ x: 0, y: 0, t: 0 }, { x: 5, y: 80, t: 100 }, T)).toBe('down');
  });

  it('一次手勢只觸發一次：end 之後狀態已清空', () => {
    const tracker = new SwipeTracker(T);
    tracker.begin(0, 0, 0);
    expect(tracker.isTracking).toBe(true);
    expect(tracker.end(100, 0, 100)).toBe('right');
    expect(tracker.isTracking).toBe(false);
    expect(tracker.end(200, 0, 200)).toBeNull();
  });

  it('未 begin 就 end 不產生事件', () => {
    expect(new SwipeTracker(T).end(100, 0, 100)).toBeNull();
  });
});
