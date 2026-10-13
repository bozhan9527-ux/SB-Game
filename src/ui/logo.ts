/**
 * 招牌字：濃墨寫在紙上，外圈一道紙色留白，右下錯開一層淡朱——像蓋在墨字底下的印泥。
 *
 * 開場與主畫面共用。名字沿用 applyGoldFace（呼叫的地方不必改）。
 */
import Phaser from 'phaser';
import { GOLD, textStyle } from './theme';

export function applyGoldFace(text: Phaser.GameObjects.Text): Phaser.GameObjects.Text {
  const height = text.height;
  const gradient = text.context.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, '#3a2a22');
  gradient.addColorStop(1, '#1a1410');
  const size = text.style.fontSize ? parseInt(String(text.style.fontSize), 10) : 60;
  return text
    .setFill(gradient)
    .setStroke('#f5eddb', Math.max(6, Math.round(size / 9)))
    .setShadow(Math.round(size / 22), Math.round(size / 18), 'rgba(200,55,45,0.45)', 0, false, true);
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
  const box = scene.add.rectangle(0, 0, size + 14, h, 0xc8372d).setStrokeStyle(2, 0x8a2018);
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
