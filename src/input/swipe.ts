/**
 * 滑動手勢辨識（TECH_SPEC 第 4.5 節）。
 *
 * 判定規範：
 * - 位移 ≥ minDistancePx 且時間 ≤ maxDurationMs
 * - 水平位移 > 垂直位移 × axisRatio 才算左右滑，反之才算上下滑
 * - 一次手勢只觸發一次事件，抬指前不重複觸發
 *
 * 不 import Phaser：辨識本身是純運算，可在 node 測試中直接驗。
 */
import type { SwipeThresholds } from '../data/types';

export type SwipeDirection = 'left' | 'right' | 'up' | 'down';

export interface Point {
  x: number;
  y: number;
  /** 時間戳，單位 ms。 */
  t: number;
}

/** 判定一次「按下 → 放開」是否構成滑動，不成立回傳 null。 */
export function detectSwipe(start: Point, end: Point, thresholds: SwipeThresholds): SwipeDirection | null {
  const duration = end.t - start.t;
  if (duration < 0 || duration > thresholds.maxDurationMs) return null;

  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);

  if (absX >= thresholds.minDistancePx && absX > absY * thresholds.axisRatio) {
    return dx > 0 ? 'right' : 'left';
  }
  if (absY >= thresholds.minDistancePx && absY > absX * thresholds.axisRatio) {
    return dy > 0 ? 'down' : 'up';
  }
  // 斜向且兩軸差距不夠：視為誤觸，不判定。
  return null;
}

/**
 * 一次按壓的狀態機。pointerdown 呼叫 begin，pointerup 呼叫 end。
 * 未 begin 就 end（例如手指從畫面外滑入）不會產生事件。
 */
export class SwipeTracker {
  private start: Point | null = null;

  constructor(private readonly thresholds: SwipeThresholds) {}

  begin(x: number, y: number, t: number): void {
    this.start = { x, y, t };
  }

  end(x: number, y: number, t: number): SwipeDirection | null {
    const start = this.start;
    this.start = null;
    if (start === null) return null;
    return detectSwipe(start, { x, y, t }, this.thresholds);
  }

  cancel(): void {
    this.start = null;
  }

  get isTracking(): boolean {
    return this.start !== null;
  }
}
