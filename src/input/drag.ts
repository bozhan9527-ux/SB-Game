import type { DragConfig } from '../data/types';

/**
 * 階段 A 的拖曳走位。見 TECH_SPEC 第 4.5 節。
 *
 * 採相對位移：按下的位置為基準點，之後依相對於基準點的位移改變橫向位置。
 * 若採絕對座標，玩家的手指必須放在畫面正中央才能走直線，在手機上很難用。
 *
 * 不依賴 Phaser，只吃 (pointerId, x) 這種原始輸入，方便測試。
 */
export class DragTracker {
  private anchorScreenX: number | null = null;
  private anchorValueX = 0;
  private currentX = 0;

  constructor(
    private readonly cfg: DragConfig,
    private readonly maxX: number,
  ) {}

  /** 目前的橫向位置，範圍 [-maxX, maxX]，0 為道路中線。 */
  get x(): number {
    return this.currentX;
  }

  get isDragging(): boolean {
    return this.anchorScreenX !== null;
  }

  onPointerDown(screenX: number): void {
    this.anchorScreenX = screenX;
    this.anchorValueX = this.currentX;
  }

  onPointerMove(screenX: number): void {
    if (this.anchorScreenX === null) return;
    const deltaPx = screenX - this.anchorScreenX;
    const raw = this.anchorValueX + deltaPx / this.cfg.pixelsPerUnitX;
    this.currentX = Math.max(-this.maxX, Math.min(this.maxX, raw));
  }

  onPointerUp(): void {
    this.anchorScreenX = null;
    // 抬指後保持最後位置，不自動歸中（TECH_SPEC 第 4.5 節）。
    if (this.cfg.recenterOnRelease) this.currentX = 0;
  }

  /** 重置到中線，用於一場戰鬥開始時。 */
  reset(): void {
    this.anchorScreenX = null;
    this.anchorValueX = 0;
    this.currentX = 0;
  }
}
