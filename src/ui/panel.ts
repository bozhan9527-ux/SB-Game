/**
 * 面板：一張攤在宣紙上的紙片——淡淡的投影、紙色底、手抖的墨線框，
 * 裡面再一圈細朱線（朱絲欄的框），重要的面板四角多兩道朱砂角線。
 *
 * 所有主要面板共用這一個畫法，不各自用 rectangle + setStrokeStyle 拼——
 * 各拼各的結果是框線粗細、透明度到處不一樣，手繪畫面一眼就看得出不齊。
 *
 * 名字沿用 pixelPanel／drawPanelFrame：呼叫的地方很多，改名只會製造一大片無關的 diff。
 */
import Phaser from 'phaser';
import { BG_PANEL, EDGE, FRAME, GOLD, LACQUER, hexToNumber } from './theme';
import { roughLine, roughRect } from './sketch';

export interface PixelPanelOptions {
  /** 內框線顏色，預設是淡朱；重要的面板給 GOLD_ACCENT，會改成較深的朱線加角線。 */
  accent?: number;
  fill?: number;
  alpha?: number;
  /** 四角的朱砂角線。小面板關掉比較乾淨。 */
  corners?: boolean;
}

export function drawPanelFrame(
  g: Phaser.GameObjects.Graphics,
  width: number,
  height: number,
  options: PixelPanelOptions = {},
): void {
  const hw = width / 2;
  const hh = height / 2;
  const important = options.accent === GOLD_ACCENT;
  const fill = options.fill ?? BG_PANEL;
  const alpha = options.alpha ?? 0.96;
  const seed = Math.round(width * 7 + height * 3);

  // 投影：往右下錯開一點的淡墨
  roughRect(g, -hw + 4, -hh + 5, width, height, { fill: EDGE, fillAlpha: 0.12 * alpha, stroke: null, seed });
  // 紙
  roughRect(g, -hw, -hh, width, height, { fill, fillAlpha: alpha, stroke: null, seed });
  // 外框：深赭粗筆（白紙雙框的粗框）
  roughRect(g, -hw, -hh, width, height, { stroke: FRAME, width: 2.8, seed });
  // 內框：細的一圈
  if (width >= 80 && height >= 60) {
    const inset = 7;
    roughRect(g, -hw + inset, -hh + inset, width - inset * 2, height - inset * 2, {
      stroke: options.accent !== undefined && !important ? options.accent : important ? LACQUER : FRAME,
      strokeAlpha: important ? 0.75 : 0.7,
      width: important ? 1.6 : 1.1,
      double: false,
      amp: 0.6,
      seed: seed + 1,
    });
  }

  if (options.corners !== false && important && width >= 120 && height >= 80) {
    const len = 16;
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      const cx = sx * (hw - 3);
      const cy = sy * (hh - 3);
      roughLine(g, cx, cy, cx - sx * len, cy, { stroke: LACQUER, width: 3, seed: seed + sx * 3 + sy });
      roughLine(g, cx, cy, cx, cy - sy * len, { stroke: LACQUER, width: 3, seed: seed + sx * 5 + sy * 7 });
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

/** 「重要」的面板（結算、突破）：深一點的朱線加四角角線。 */
export const GOLD_ACCENT = hexToNumber(GOLD);
