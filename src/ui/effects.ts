/**
 * 修仙風格的全局視覺效果系統。
 * 整合各種光暈、粒子、動畫效果，創造沉浸式的 UI 體驗。
 */
import Phaser from 'phaser';
import { hexToNumber } from './theme';

/**
 * 為場景添加環境光影粒子（模擬修仙仙氣氛圍）。
 */
export function addAmbientLighting(
  scene: Phaser.Scene,
  x: number,
  y: number,
  radius: number,
  glowColor: string,
  intensity: number = 0.3,
): void {
  // 漸淡的光圈
  const glow = scene.add.circle(x, y, radius, hexToNumber(glowColor), 0);
  glow.setStrokeStyle(2, hexToNumber(glowColor), intensity);

  // 幾層漸淡光圈
  for (let i = 1; i < 4; i += 1) {
    const ring = scene.add.circle(
      x,
      y,
      radius + i * 8,
      hexToNumber(glowColor),
      0,
    );
    ring.setStrokeStyle(1, hexToNumber(glowColor), intensity * (1 - i / 4));
  }
}

/**
 * 創建縱向的光柱效果（用於強調重要信息）。
 */
export function createLightBeam(
  scene: Phaser.Scene,
  x: number,
  y: number,
  height: number,
  glowColor: string,
  duration: number = 1500,
): void {
  const beam = scene.add.rectangle(x, y - height / 2, 30, height, hexToNumber(glowColor), 0.1);

  scene.tweens.add({
    targets: beam,
    alpha: 0,
    duration,
    ease: 'Power2.out',
    onComplete: () => beam.destroy(),
  });
}

/**
 * 為場景添加脈動的星點粒子效果（背景氛圍）。
 */
export function addTwinklingStars(
  scene: Phaser.Scene,
  starCount: number = 12,
  glowColor: string = '#e8c46a',
): void {
  for (let i = 0; i < starCount; i += 1) {
    const x = Phaser.Math.Between(20, 520);
    const y = Phaser.Math.Between(20, 200);
    const star = scene.add.circle(x, y, 1, hexToNumber(glowColor), Phaser.Math.FloatBetween(0.2, 0.8));

    scene.tweens.add({
      targets: star,
      alpha: Phaser.Math.FloatBetween(0.2, 0.8),
      duration: Phaser.Math.Between(1500, 3000),
      yoyo: true,
      repeat: -1,
      delay: Phaser.Math.Between(0, 1000),
    });
  }
}

/**
 * 創建環繞目標的光暈軌跡效果。
 */
export function createOrbitalGlow(
  scene: Phaser.Scene,
  centerX: number,
  centerY: number,
  radius: number,
  glowColor: string,
  particleCount: number = 8,
): void {
  const angleStep = (Math.PI * 2) / particleCount;

  for (let i = 0; i < particleCount; i += 1) {
    const angle = angleStep * i;
    const x = centerX + Math.cos(angle) * radius;
    const y = centerY + Math.sin(angle) * radius;

    const particle = scene.add.circle(x, y, 2, hexToNumber(glowColor), 0.6);

    scene.tweens.add({
      targets: particle,
      angle: 360,
      duration: 4000 + i * 200,
      repeat: -1,
      ease: 'Linear',
      onUpdate: (tween) => {
        const progress = tween.progress;
        const currentAngle = angleStep * i + (progress * Math.PI * 2);
        particle.x = centerX + Math.cos(currentAngle) * radius;
        particle.y = centerY + Math.sin(currentAngle) * radius;
      },
    });
  }
}

/**
 * 創建連續下落的粒子雨效果（優雅的背景效果）。
 */
export function createFallingParticles(
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  height: number,
  glowColor: string,
  particleCount: number = 6,
): void {
  for (let i = 0; i < particleCount; i += 1) {
    const startX = x - width / 2 + Math.random() * width;
    const startY = y - height / 2 + Math.random() * height;
    const duration = 2000 + Math.random() * 1000;

    const particle = scene.add.circle(startX, startY, 1, hexToNumber(glowColor), Phaser.Math.FloatBetween(0.3, 0.7));

    scene.tweens.add({
      targets: particle,
      y: startY + Phaser.Math.Between(40, 100),
      alpha: 0,
      duration,
      ease: 'Linear',
      onComplete: () => particle.destroy(),
      onRepeat: () => {
        particle.setPosition(
          x - width / 2 + Math.random() * width,
          y - height / 2,
        );
        particle.setAlpha(Phaser.Math.FloatBetween(0.3, 0.7));
      },
    });
  }
}

/**
 * 為元素添加柔和的脈搏效果（吸引視線）。
 */
export function addGentlePulse(
  scene: Phaser.Scene,
  target: Phaser.GameObjects.GameObject,
  duration: number = 2000,
): void {
  scene.tweens.add({
    targets: target,
    scale: 1.05,
    duration,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.inOut',
  });
}

/**
 * 創建鼠標跟蹤的光跡效果（交互反饋）。
 */
export function addMouseTrailGlow(
  scene: Phaser.Scene,
  glowColor: string = '#e8c46a',
  trailLength: number = 15,
): void {
  let lastTrailTime = 0;
  const trailInterval = 50;

  scene.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
    const now = scene.game.loop.time;
    if (now - lastTrailTime < trailInterval) return;
    lastTrailTime = now;

    const particle = scene.add.circle(pointer.x, pointer.y, 3, hexToNumber(glowColor), 0.4);

    scene.tweens.add({
      targets: particle,
      scale: 0.5,
      alpha: 0,
      duration: trailLength * 2,
      ease: 'Power2.out',
      onComplete: () => particle.destroy(),
    });
  });
}
