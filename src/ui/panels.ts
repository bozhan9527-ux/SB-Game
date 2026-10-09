/**
 * 修仙風格的面板框架系統。
 * 為信息面板、對話框、菜單等 UI 元素提供統一的視覺設計。
 */
import Phaser from 'phaser';
import { hexToNumber } from './theme';

export interface PanelFrameOptions {
  width: number;
  height: number;
  accentColor: string;
  /** 邊框線寬 */
  lineWidth?: number;
  /** 是否添加四角裝飾 */
  hasCornerDeco?: boolean;
  /** 是否添加邊中點裝飾 */
  hasMidPointDeco?: boolean;
  /** 背景透明度 */
  bgAlpha?: number;
}

/**
 * 創建帶有修仙風格邊框的面板容器。
 * 包括主邊框、光暈邊框、四角和邊中裝飾。
 */
export function createPanelFrame(
  scene: Phaser.Scene,
  x: number,
  y: number,
  options: PanelFrameOptions,
): Phaser.GameObjects.Container {
  const g = scene.add.graphics();
  const accentNum = hexToNumber(options.accentColor);
  const lineWidth = options.lineWidth ?? 2;
  const hasCornerDeco = options.hasCornerDeco ?? true;
  const hasMidPointDeco = options.hasMidPointDeco ?? true;
  const bgAlpha = options.bgAlpha ?? 0.85;

  const halfW = options.width / 2;
  const halfH = options.height / 2;

  // 背景
  g.fillStyle(0x0a0f14, bgAlpha);
  g.fillRect(-halfW, -halfH, options.width, options.height);

  // 主邊框
  g.lineStyle(lineWidth, accentNum, 0.9);
  g.strokeRect(-halfW, -halfH, options.width, options.height);

  // 內側陰影邊框
  g.lineStyle(1, 0x000000, 0.3);
  g.strokeRect(-halfW + 1, -halfH + 1, options.width - 2, options.height - 2);

  // 四角裝飾
  if (hasCornerDeco) {
    const corners = [
      { x: -halfW, y: -halfH }, // 左上
      { x: halfW, y: -halfH }, // 右上
      { x: -halfW, y: halfH }, // 左下
      { x: halfW, y: halfH }, // 右下
    ];

    for (const corner of corners) {
      const radius = 5;
      // 外圓
      g.lineStyle(1, accentNum, 0.6);
      g.strokeCircle(corner.x, corner.y, radius);
      // 內點
      g.fillStyle(accentNum, 0.5);
      g.fillCircle(corner.x, corner.y, radius * 0.4);
    }
  }

  // 邊中點裝飾
  if (hasMidPointDeco) {
    const midPoints = [
      { x: 0, y: -halfH }, // 上
      { x: 0, y: halfH }, // 下
      { x: -halfW, y: 0 }, // 左
      { x: halfW, y: 0 }, // 右
    ];

    for (const point of midPoints) {
      g.fillStyle(accentNum, 0.4);
      g.fillCircle(point.x, point.y, 2.5);
    }
  }

  // 外層光暈邊框
  g.lineStyle(1, accentNum, 0.2);
  g.strokeRect(-halfW - 3, -halfH - 3, options.width + 6, options.height + 6);

  // 邊框角光暈
  g.lineStyle(1, accentNum, 0.15);
  g.strokeRect(-halfW - 6, -halfH - 6, options.width + 12, options.height + 12);

  const container = scene.add.container(x, y, [g]);
  container.setSize(options.width, options.height);

  return container;
}

/**
 * 為現有的矩形添加修仙風格的邊框效果（不創建新容器）。
 */
export function addOrnamentalBorder(
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  height: number,
  accentColor: string,
  lineWidth: number = 2,
): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  const accentNum = hexToNumber(accentColor);

  const halfW = width / 2;
  const halfH = height / 2;

  // 主邊框
  g.lineStyle(lineWidth, accentNum, 0.9);
  g.strokeRect(x - halfW, y - halfH, width, height);

  // 四角裝飾圓點
  const corners = [
    { x: x - halfW, y: y - halfH },
    { x: x + halfW, y: y - halfH },
    { x: x - halfW, y: y + halfH },
    { x: x + halfW, y: y + halfH },
  ];

  for (const corner of corners) {
    g.lineStyle(1, accentNum, 0.6);
    g.strokeCircle(corner.x, corner.y, 4);
    g.fillStyle(accentNum, 0.4);
    g.fillCircle(corner.x, corner.y, 2);
  }

  // 邊框光暈
  g.lineStyle(1, accentNum, 0.2);
  g.strokeRect(x - halfW - 2, y - halfH - 2, width + 4, height + 4);

  return g;
}

/**
 * 在面板上添加裝飾性的分隔線。
 */
export function addSeparatorLine(
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  accentColor: string,
  lineWidth: number = 1,
): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  const accentNum = hexToNumber(accentColor);

  // 主線
  g.lineStyle(lineWidth, accentNum, 0.6);
  g.lineBetween(x - width / 2, y, x + width / 2, y);

  // 邊上的裝飾點
  const dotRadius = 2;
  g.fillStyle(accentNum, 0.4);
  g.fillCircle(x - width / 2 - 8, y, dotRadius);
  g.fillCircle(x + width / 2 + 8, y, dotRadius);

  // 中點
  g.fillCircle(x, y, dotRadius * 0.8);

  return g;
}

/**
 * 在面板邊角添加小的光暈效果。
 */
export function addCornerGlow(
  scene: Phaser.Scene,
  x: number,
  y: number,
  accentColor: string,
  glowSize: number = 20,
): Phaser.GameObjects.Circle {
  const circle = scene.add.circle(x, y, glowSize, hexToNumber(accentColor), 0);
  circle.setStrokeStyle(1, hexToNumber(accentColor), 0.3);

  return circle;
}
