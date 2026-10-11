/**
 * 像素面板：漆木外框、金線、四角祥雲角飾，內底是半透明深色漆。
 *
 * 所有主要面板共用這一個畫法，不各自用 rectangle + setStrokeStyle 拼——
 * 各拼各的結果是框線粗細、透明度到處不一樣，像素畫一眼就看得出不齊。
 */
import Phaser from 'phaser';
import { BG_PANEL, EDGE, GOLD, GOLD_LO, WOOD, WOOD_HI, WOOD_LO, hexToNumber, shade } from './theme';

export interface PixelPanelOptions {
  /** 金線顏色，預設是暗金；重要的面板可以給亮金或境界色。 */
  accent?: number;
  fill?: number;
  alpha?: number;
  /** 四角祥雲角飾。小面板關掉比較乾淨。 */
  corners?: boolean;
}

/** 祥雲角飾：一格 = 3 點。G 是金、H 是亮金。左上角的樣子，其他三角鏡射。 */
const CORNER = [
  'GGGGGG.',
  'GHHHHG.',
  'GH..GGG',
  'GH.G..G',
  'GHG.GGG',
  'GG..G..',
  '..GGG..',
];
const CELL = 3;

export function drawPanelFrame(
  g: Phaser.GameObjects.Graphics,
  width: number,
  height: number,
  options: PixelPanelOptions = {},
): void {
  const hw = width / 2;
  const hh = height / 2;
  const accent = options.accent ?? GOLD_LO;
  const fill = options.fill ?? BG_PANEL;

  // 內底，上緣一條亮帶讓面板有厚度
  g.fillStyle(fill, options.alpha ?? 0.94);
  g.fillRect(-hw, -hh, width, height);
  g.fillStyle(shade(fill, 0.08), options.alpha ?? 0.94);
  g.fillRect(-hw + 12, -hh + 12, width - 24, 3);

  // 漆木框：外描邊 → 木（上左亮、下右暗）→ 金線
  const band = (inset: number, size: number, top: number, bottom: number): void => {
    g.fillStyle(top, 1);
    g.fillRect(-hw + inset, -hh + inset, width - inset * 2, size);
    g.fillRect(-hw + inset, -hh + inset, size, height - inset * 2);
    g.fillStyle(bottom, 1);
    g.fillRect(-hw + inset, hh - inset - size, width - inset * 2, size);
    g.fillRect(hw - inset - size, -hh + inset, size, height - inset * 2);
  };
  band(0, 3, EDGE, EDGE);
  band(3, 3, WOOD_HI, WOOD_LO);
  band(6, 3, WOOD, WOOD_LO);
  band(9, 2, shade(accent, 0.25), shade(accent, -0.3));

  if (options.corners !== false && width >= 120 && height >= 80) {
    const gold = hexToNumber(GOLD);
    const light = 0xfff1b0;
    for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]] as const) {
      const ox = sx > 0 ? -hw : hw - CELL;
      const oy = sy > 0 ? -hh : hh - CELL;
      CORNER.forEach((row, j) => {
        [...row].forEach((ch, i) => {
          if (ch === '.') return;
          g.fillStyle(ch === 'H' ? light : gold, 1);
          g.fillRect(ox + sx * i * CELL, oy + sy * j * CELL, CELL, CELL);
        });
      });
    }
  }
}

export function pixelPanel(
  scene: Phaser.Scene,
  cx: number,
  cy: number,
  width: number,
  height: number,
  options: PixelPanelOptions = {},
): Phaser.GameObjects.Container {
  const g = scene.add.graphics();
  drawPanelFrame(g, width, height, options);
  return scene.add.container(cx, cy, [g]);
}

/** 亮金線的面板：結算、突破這類「重要」的面板用。 */
export const GOLD_ACCENT = hexToNumber(GOLD);
