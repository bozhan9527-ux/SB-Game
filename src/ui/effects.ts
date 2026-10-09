/**
 * 像素風的小特效：只用方塊、只走整數格，不用圓點與柔光。
 */
import Phaser from 'phaser';
import { GAME_WIDTH } from '../config';
import { hexToNumber } from './theme';

/** 特效方塊的邊長。背景的像素也是三點一格，兩邊對得上。 */
const PX = 3;

const snap = (value: number): number => Math.round(value / PX) * PX;

/** 背景上方一閃一閃的星點。透明度用跳階的，像素畫裡沒有平滑的漸亮。 */
export function addTwinklingStars(scene: Phaser.Scene, starCount = 12, color = '#e8c46a'): void {
  for (let i = 0; i < starCount; i += 1) {
    const star = scene.add.rectangle(
      snap(Phaser.Math.Between(20, GAME_WIDTH - 20)),
      snap(Phaser.Math.Between(20, 200)),
      PX,
      PX,
      hexToNumber(color),
      0.9,
    );
    scene.tweens.add({
      targets: star,
      alpha: 0.15,
      duration: Phaser.Math.Between(1500, 3000),
      ease: 'Stepped',
      easeParams: [3],
      yoyo: true,
      repeat: -1,
      delay: Phaser.Math.Between(0, 1000),
    });
  }
}

/** 按下按鈕時往外迸出的幾顆方塊。座標是場景座標，不是按鈕所在容器的座標。 */
export function burstPixels(scene: Phaser.Scene, x: number, y: number, color: string, count = 6): void {
  for (let i = 0; i < count; i += 1) {
    const angle = (Math.PI * 2 * i) / count + Math.PI / count;
    const bit = scene.add
      .rectangle(snap(x + Math.cos(angle) * 10), snap(y + Math.sin(angle) * 6), PX, PX, hexToNumber(color), 1)
      .setDepth(1000);
    scene.tweens.add({
      targets: bit,
      x: snap(x + Math.cos(angle) * 34),
      y: snap(y + Math.sin(angle) * 18 - 14),
      alpha: 0,
      duration: 360,
      ease: 'Stepped',
      easeParams: [6],
      onComplete: () => bit.destroy(),
    });
  }
}
