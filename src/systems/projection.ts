import type { ProjectionConfig } from '../data/types';

/**
 * 2.5D 偽透視投影。見 TECH_SPEC 第 4.6 節。
 *
 * 硬性要求：純函式，不 import Phaser、不讀取全域狀態。
 * 這是整個戰鬥畫面的座標來源，必須能在 node 環境下驗證。
 */

export interface Projected {
  /** 螢幕 X（像素）。 */
  x: number;
  /** 螢幕 Y（像素）。 */
  y: number;
  /** 縮放倍率，越近越大。 */
  scale: number;
}

/**
 * 把世界座標 (worldX, z) 投影到螢幕。
 *
 * @param worldX 橫向偏移，0 為道路中線
 * @param z      在攝影機前方的距離，必須為正；小於 nearZ 會被夾住
 * @param screenWidth 畫面寬度，用來取中線
 */
export function project(
  worldX: number,
  z: number,
  cfg: ProjectionConfig,
  screenWidth: number,
): Projected {
  // z → 0 會使 scale → ∞ 造成座標溢位與繪製崩潰，故夾在 nearZ 以上。
  const safeZ = Math.max(z, cfg.nearZ);
  const scale = cfg.focalLength / safeZ;

  return {
    x: screenWidth / 2 + worldX * scale,
    y: cfg.horizonY + cfg.cameraHeight * scale,
    scale,
  };
}

/** 該距離是否在可見範圍內。超出 farZ 的物件不需繪製。 */
export function isVisible(z: number, cfg: ProjectionConfig): boolean {
  return z > 0 && z <= cfg.farZ;
}

/**
 * 道路在某個距離上的左右邊緣螢幕 X。
 * 用來畫出向消失點收斂的路面。
 */
export function roadEdgesAt(
  z: number,
  cfg: ProjectionConfig,
  screenWidth: number,
): { left: number; right: number; y: number } {
  const l = project(-cfg.roadHalfWidth, z, cfg, screenWidth);
  const r = project(cfg.roadHalfWidth, z, cfg, screenWidth);
  return { left: l.x, right: r.x, y: l.y };
}
