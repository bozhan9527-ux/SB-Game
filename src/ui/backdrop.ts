/**
 * 水墨風背景：遠山、明月、飄浮靈光。全部以程式繪製，不需美術素材。
 */
import Phaser from 'phaser';
import { ART } from '../art';
import { GAME_HEIGHT, GAME_WIDTH } from '../config';
import { hexToNumber } from './theme';

/** 依境界色調畫一層背景。回傳的容器已置於最底層。 */
export function drawBackdrop(scene: Phaser.Scene, accentHex: string): Phaser.GameObjects.Container {
  const accent = hexToNumber(accentHex);
  const layer = scene.add.container(0, 0);
  const g = scene.add.graphics();

  // 天空：由上而下疊三段色塊，避免使用漸層貼圖。
  g.fillStyle(0x0b0f14, 1);
  g.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
  g.fillStyle(accent, 0.06);
  g.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT * 0.55);
  g.fillStyle(accent, 0.04);
  g.fillRect(0, GAME_HEIGHT * 0.55, GAME_WIDTH, GAME_HEIGHT * 0.45);

  // 明月
  g.fillStyle(0xf4efe0, 0.16);
  g.fillCircle(GAME_WIDTH * 0.74, GAME_HEIGHT * 0.16, 74);
  g.fillStyle(0xf4efe0, 0.5);
  g.fillCircle(GAME_WIDTH * 0.74, GAME_HEIGHT * 0.16, 52);

  // 遠山三層，越近越暗
  const ridges: { y: number; height: number; alpha: number; color: number }[] = [
    { y: GAME_HEIGHT * 0.3, height: 150, alpha: 0.35, color: accent },
    { y: GAME_HEIGHT * 0.38, height: 190, alpha: 0.25, color: 0x24313c },
    { y: GAME_HEIGHT * 0.46, height: 240, alpha: 0.9, color: 0x121820 },
  ];
  ridges.forEach((ridge, index) => {
    const points: Phaser.Types.Math.Vector2Like[] = [{ x: -20, y: GAME_HEIGHT }];
    const peaks = 5 + index;
    for (let i = 0; i <= peaks; i += 1) {
      const x = (GAME_WIDTH + 40) * (i / peaks) - 20;
      const wobble = Math.sin(i * 2.3 + index * 1.7) * 0.5 + 0.5;
      points.push({ x, y: ridge.y + ridge.height * (0.35 + wobble * 0.65) - ridge.height });
    }
    points.push({ x: GAME_WIDTH + 20, y: GAME_HEIGHT });
    g.fillStyle(ridge.color, ridge.alpha);
    g.fillPoints(points, true);
  });

  layer.add(g);

  // 祥雲：三層緩慢橫移，讓遠景不是一張死圖。
  const clouds: { y: number; scale: number; alpha: number; duration: number }[] = [
    { y: GAME_HEIGHT * 0.13, scale: 1.1, alpha: 0.12, duration: 46000 },
    { y: GAME_HEIGHT * 0.24, scale: 0.8, alpha: 0.09, duration: 62000 },
    { y: GAME_HEIGHT * 0.34, scale: 1.4, alpha: 0.07, duration: 78000 },
  ];
  for (const spec of clouds) {
    if (!scene.textures.exists(ART.cloud)) break;
    const cloud = scene.add
      .image(-140, spec.y, ART.cloud)
      .setScale(spec.scale)
      .setAlpha(spec.alpha)
      .setTint(accent);
    layer.add(cloud);
    scene.tweens.add({
      targets: cloud,
      x: GAME_WIDTH + 200,
      duration: spec.duration,
      delay: Phaser.Math.Between(0, 12000),
      repeat: -1,
    });
  }

  // 飄浮靈光：緩慢上升的小點，讓靜態畫面有呼吸感。
  for (let i = 0; i < 18; i += 1) {
    const mote = scene.add.circle(
      Phaser.Math.Between(20, GAME_WIDTH - 20),
      Phaser.Math.Between(80, GAME_HEIGHT - 80),
      Phaser.Math.Between(1, 3),
      accent,
      Phaser.Math.FloatBetween(0.25, 0.6),
    );
    layer.add(mote);
    scene.tweens.add({
      targets: mote,
      y: mote.y - Phaser.Math.Between(60, 160),
      alpha: 0,
      duration: Phaser.Math.Between(4000, 9000),
      delay: Phaser.Math.Between(0, 4000),
      repeat: -1,
      onRepeat: () => {
        mote.setPosition(Phaser.Math.Between(20, GAME_WIDTH - 20), Phaser.Math.Between(200, GAME_HEIGHT));
        mote.setAlpha(Phaser.Math.FloatBetween(0.25, 0.6));
      },
    });
  }

  layer.setDepth(-100);
  return layer;
}
