/**
 * 修仙風格的裝飾元素：邊框、粒子、光暈。
 * 用於增強 UI 的視覺層次和質感。
 */
import Phaser from 'phaser';
import { ACCENT_GLOW, JADE_GLOW, hexToNumber } from './theme';

/**
 * 繪製傳統中式邊框，四個角有裝飾紋樣。
 */
export function drawOrnamentalFrame(
  scene: Phaser.Scene,
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  width: number,
  height: number,
  accentColor: number,
  lineWidth: number = 2,
): void {
  // 主邊框
  g.lineStyle(lineWidth, accentColor, 0.9);
  g.strokeRect(x - width / 2, y - height / 2, width, height);

  // 四個角的裝飾圓點
  const cornerRadius = 6;
  const corners = [
    { x: x - width / 2, y: y - height / 2 }, // 左上
    { x: x + width / 2, y: y - height / 2 }, // 右上
    { x: x - width / 2, y: y + height / 2 }, // 左下
    { x: x + width / 2, y: y + height / 2 }, // 右下
  ];

  for (const corner of corners) {
    // 外圓
    g.lineStyle(1, accentColor, 0.6);
    g.strokeCircle(corner.x, corner.y, cornerRadius);
    // 內圓點
    g.fillStyle(accentColor, 0.5);
    g.fillCircle(corner.x, corner.y, cornerRadius * 0.4);
  }

  // 邊中點裝飾
  const midPoints = [
    { x: x, y: y - height / 2 }, // 上
    { x: x, y: y + height / 2 }, // 下
    { x: x - width / 2, y: y }, // 左
    { x: x + width / 2, y: y }, // 右
  ];

  for (const point of midPoints) {
    g.fillStyle(accentColor, 0.4);
    g.fillCircle(point.x, point.y, 3);
  }

  // 外層光暈邊框
  g.lineStyle(1, accentColor, 0.2);
  g.strokeRect(x - width / 2 - 4, y - height / 2 - 4, width + 8, height + 8);
}

/**
 * 在給定位置創建上升的靈光粒子效果（用於重要互動）。
 */
export function createAscendingGlow(
  scene: Phaser.Scene,
  x: number,
  y: number,
  glowColor: string,
  particleCount: number = 8,
  duration: number = 800,
): void {
  const angleStep = (Math.PI * 2) / particleCount;

  for (let i = 0; i < particleCount; i += 1) {
    const angle = angleStep * i;
    const startRadius = 8;
    const endRadius = 30;

    const particle = scene.add.circle(
      x + Math.cos(angle) * startRadius,
      y + Math.sin(angle) * startRadius,
      2,
      hexToNumber(glowColor),
      0.8,
    );

    scene.tweens.add({
      targets: particle,
      x: x + Math.cos(angle) * endRadius,
      y: y + Math.sin(angle) * endRadius - 20,
      alpha: 0,
      scale: 0.5,
      duration,
      ease: 'Power2.out',
      onComplete: () => particle.destroy(),
    });
  }
}

/**
 * 在目標周圍創建旋轉的光暈環效果（用於強調重要元素）。
 */
export function createGlowRing(
  scene: Phaser.Scene,
  x: number,
  y: number,
  radius: number,
  glowColor: string,
  duration: number = 2000,
): Phaser.GameObjects.Arc {
  const ring = scene.add.circle(x, y, radius, 0x000000, 0);
  ring.setStrokeStyle(2, hexToNumber(glowColor), 0.6);

  scene.tweens.add({
    targets: ring,
    radius: radius + 8,
    alpha: 0,
    duration,
    ease: 'Power1.out',
    onComplete: () => ring.destroy(),
  });

  return ring;
}

/**
 * 創建連續的旋轉軌跡效果（用於UI強調）。
 */
export function createRotatingOrbit(
  scene: Phaser.Scene,
  centerX: number,
  centerY: number,
  orbitRadius: number,
  glowColor: string,
  duration: number = 3000,
): Phaser.GameObjects.Arc {
  const orbit = scene.add.circle(centerX, centerY, orbitRadius, 0x000000, 0);
  orbit.setStrokeStyle(1, hexToNumber(glowColor), 0.4);

  scene.tweens.add({
    targets: orbit,
    angle: 360,
    duration,
    repeat: -1,
    ease: 'Linear',
  });

  return orbit;
}

/**
 * 為容器添加脈搏式發光效果（用於吸引注意）。
 */
export function addPulseGlow(
  scene: Phaser.Scene,
  target: Phaser.GameObjects.Container,
  glowColor: string,
  intensity: number = 0.3,
  duration: number = 1000,
): void {
  scene.tweens.add({
    targets: target,
    alpha: 1 + intensity,
    duration,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.inOut',
  });
}

/**
 * 為目標添加柔和的陰影效果（深化空間感）。
 */
export function addSoftShadow(
  scene: Phaser.Scene,
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  width: number,
  height: number,
  shadowColor: number = 0x000000,
  shadowAlpha: number = 0.3,
): void {
  // 四層漸淡的陰影營造柔和邊緣
  for (let i = 0; i < 4; i += 1) {
    const offset = i + 1;
    g.fillStyle(shadowColor, shadowAlpha * (1 - i / 4));
    g.fillRect(
      x - width / 2 + offset,
      y - height / 2 + offset,
      width,
      height,
    );
  }
}
