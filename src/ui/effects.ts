/**
 * 手繪風的小特效：墨點、朱砂點、飄字。動作要柔，像筆尖點在紙上。
 */
import Phaser from 'phaser';
import { GAME_WIDTH } from '../config';
import { hexToNumber, textStyle } from './theme';

const snap = (value: number): number => value;

/** 背景上方一閃一閃的小金點（像灑金宣紙上的金箔）。 */
export function addTwinklingStars(scene: Phaser.Scene, starCount = 12, color = '#e8c46a'): void {
  for (let i = 0; i < starCount; i += 1) {
    const star = scene.add.circle(
      Phaser.Math.Between(20, GAME_WIDTH - 20),
      Phaser.Math.Between(20, 200),
      1.6,
      hexToNumber(color),
      0.7,
    );
    scene.tweens.add({
      targets: star,
      alpha: 0.1,
      duration: Phaser.Math.Between(1500, 3000),
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
      delay: Phaser.Math.Between(0, 1000),
    });
  }
}

/** 按下按鈕時往外濺出的幾滴墨點。座標是場景座標，不是按鈕所在容器的座標。 */
export function burstPixels(scene: Phaser.Scene, x: number, y: number, color: string, count = 6): void {
  for (let i = 0; i < count; i += 1) {
    const angle = (Math.PI * 2 * i) / count + Math.PI / count;
    const bit = scene.add
      .circle(x + Math.cos(angle) * 10, y + Math.sin(angle) * 6, 1.5 + (i % 3) * 0.6, hexToNumber(color), 0.85)
      .setDepth(1000);
    scene.tweens.add({
      targets: bit,
      x: snap(x + Math.cos(angle) * 34),
      y: snap(y + Math.sin(angle) * 18 - 14),
      alpha: 0,
      scale: 0.4,
      duration: 360,
      ease: 'Quad.easeOut',
      onComplete: () => bit.destroy(),
    });
  }
}

/**
 * 往上飄的一行字（「+60 金」）。領到、買到的東西要看得到數目，
 * 不然只有右上角的總數悄悄變大，玩家不會注意到。
 */
export function floatLabel(scene: Phaser.Scene, x: number, y: number, text: string, color: string, size = 22): void {
  const label = scene.add
    .text(snap(x), snap(y), text, textStyle({ size, color, bold: true }))
    .setOrigin(0.5)
    .setStroke('#f5eddb', 6)
    .setDepth(1000);
  scene.tweens.add({
    targets: label,
    y: snap(y - 36),
    alpha: 0,
    delay: 250,
    duration: 650,
    ease: 'Quad.easeOut',
    onComplete: () => label.destroy(),
  });
}
