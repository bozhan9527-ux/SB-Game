/**
 * 像素面板：實心底、深色外框、亮色內框、四角金飾。
 *
 * 所有主要面板共用這一個畫法，不各自用 rectangle + setStrokeStyle 拼——
 * 各拼各的結果是框線粗細、透明度到處不一樣，像素畫一眼就看得出不齊。
 */
import Phaser from 'phaser';
import { BG_PANEL, EDGE, GOLD, LINE, hexToNumber } from './theme';

export interface PixelPanelOptions {
  /** 內框顏色，預設是一般的線色；重要的面板可以給金色或境界色。 */
  accent?: number;
  fill?: number;
  alpha?: number;
  /** 四角金飾。小面板關掉比較乾淨。 */
  corners?: boolean;
}

export function pixelPanel(
  scene: Phaser.Scene,
  cx: number,
  cy: number,
  width: number,
  height: number,
  options: PixelPanelOptions = {},
): Phaser.GameObjects.Container {
  const body = scene.add
    .rectangle(0, 0, width, height, options.fill ?? BG_PANEL, options.alpha ?? 0.94)
    .setStrokeStyle(3, EDGE);
  const inset = scene.add
    .rectangle(0, 0, width - 6, height - 6, 0x000000, 0)
    .setStrokeStyle(3, options.accent ?? LINE);
  const parts: Phaser.GameObjects.GameObject[] = [body, inset];

  if (options.corners !== false) {
    const g = scene.add.graphics();
    g.fillStyle(hexToNumber(GOLD), 1);
    const hw = width / 2;
    const hh = height / 2;
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      const x = sx * hw;
      const y = sy * hh;
      // 一個 L 形的角，往面板內側長
      g.fillRect(sx < 0 ? x - 1 : x - 11, y - 1, 12, 3);
      g.fillRect(x - 1, sy < 0 ? y - 1 : y - 11, 3, 12);
    }
    parts.push(g);
  }

  return scene.add.container(cx, cy, parts);
}
