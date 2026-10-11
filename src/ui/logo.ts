/**
 * 招牌字：金色由亮到暗的三段漸層、深色粗描邊、往下的實心影。
 *
 * 開場與主畫面共用。漸層切成硬邊的三段而不是平滑過渡——
 * 平滑漸層放在點陣字上會糊成一團，三段色帶才像像素畫裡上色的方式。
 */
import Phaser from 'phaser';
import { GOLD, textStyle } from './theme';

export function applyGoldFace(text: Phaser.GameObjects.Text): Phaser.GameObjects.Text {
  const height = text.height;
  const gradient = text.context.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, '#fff3b8');
  gradient.addColorStop(0.42, '#fff3b8');
  gradient.addColorStop(0.42, GOLD);
  gradient.addColorStop(0.7, GOLD);
  gradient.addColorStop(0.7, '#c4862e');
  gradient.addColorStop(1, '#c4862e');
  return text
    .setFill(gradient)
    .setStroke('#2a0c0a', Math.max(6, Math.round(text.style.fontSize ? parseInt(String(text.style.fontSize), 10) / 9 : 8)))
    .setShadow(0, 6, '#1a0606', 0, true, true);
}

/** 一整行招牌字（主畫面用）。 */
export function addLogo(scene: Phaser.Scene, x: number, y: number, size: number, label = '問道飛升'): Phaser.GameObjects.Text {
  const text = scene.add.text(x, y, label, textStyle({ size, color: GOLD })).setOrigin(0.5).setPadding(8, 8, 8, 14);
  return applyGoldFace(text);
}

/** 直書紅印，蓋在招牌字旁邊。 */
export function addSeal(scene: Phaser.Scene, x: number, y: number, label = '仙俠'): Phaser.GameObjects.Container {
  const chars = [...label];
  const size = 18;
  const h = chars.length * (size + 2) + 12;
  const box = scene.add.rectangle(0, 0, size + 14, h, 0xb3302a).setStrokeStyle(3, 0x6e1a18);
  const parts: Phaser.GameObjects.GameObject[] = [box];
  chars.forEach((char, i) => {
    parts.push(
      scene.add
        .text(0, -h / 2 + 6 + (size + 2) * i + size / 2 + 1, char, textStyle({ size, color: '#fff1dc' }))
        .setOrigin(0.5),
    );
  });
  return scene.add.container(x, y, parts);
}
