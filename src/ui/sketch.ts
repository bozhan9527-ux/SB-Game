/**
 * 手繪線條：用 Phaser 的 Graphics 畫出「手抖」的框與線。
 *
 * 貼圖（scripts/sketch-art）負責角色與場景；面板、按鈕、牌框這種尺寸每個地方都不一樣的東西
 * 沒辦法事先畫好，就在這裡即時畫——邊線細分成小段、每段加一點固定的抖動，再描第二筆。
 * 抖動用固定種子（由尺寸算出），同一個面板每次打開長得一樣，不會每幀亂跳。
 */
import Phaser from 'phaser';

type G = Phaser.GameObjects.Graphics;
type Pt = { x: number; y: number };

function rng(seed: number): () => number {
  let s = (Math.abs(Math.floor(seed)) % 2147483646) + 1;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

/** 把多邊形的每條邊切成約 step 長的小段，每個點抖一下。 */
export function wobble(points: Pt[], amp: number, seed: number, step = 14, closed = true): Pt[] {
  const r = rng(seed);
  const out: Pt[] = [];
  const n = points.length;
  const edges = closed ? n : n - 1;
  for (let i = 0; i < edges; i += 1) {
    const a = points[i]!;
    const b = points[(i + 1) % n]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const k = Math.max(1, Math.round(len / step));
    for (let j = 0; j < k; j += 1) {
      const t = j / k;
      out.push({ x: a.x + (b.x - a.x) * t + (r() * 2 - 1) * amp, y: a.y + (b.y - a.y) * t + (r() * 2 - 1) * amp });
    }
  }
  if (!closed) {
    const last = points[n - 1]!;
    out.push({ x: last.x + (r() * 2 - 1) * amp, y: last.y + (r() * 2 - 1) * amp });
  }
  return out;
}

export function rectPoints(x: number, y: number, w: number, h: number): Pt[] {
  return [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ];
}

export interface RoughOptions {
  fill?: number;
  fillAlpha?: number;
  /** 墨線顏色；null 不描邊。 */
  stroke?: number | null;
  width?: number;
  strokeAlpha?: number;
  /** 抖動幅度（點）。 */
  amp?: number;
  seed?: number;
  /** 第二筆（細、略錯位）。手繪感主要來自這一筆。 */
  double?: boolean;
}

/** 手繪多邊形：填色 + 兩筆墨線。 */
export function roughPoly(g: G, points: Pt[], options: RoughOptions = {}): void {
  const seed = options.seed ?? Math.round(points.reduce((sum, p) => sum + p.x * 7 + p.y * 13, 0));
  const amp = options.amp ?? 1.1;
  const shape = wobble(points, amp, seed);
  if (options.fill !== undefined) {
    g.fillStyle(options.fill, options.fillAlpha ?? 1);
    g.fillPoints(shape, true);
  }
  if (options.stroke === null) return;
  const stroke = options.stroke ?? 0x2a2622;
  const width = options.width ?? 2.6;
  g.lineStyle(width, stroke, options.strokeAlpha ?? 1);
  g.strokePoints(shape, true, true);
  if (options.double !== false) {
    g.lineStyle(width * 0.55, stroke, (options.strokeAlpha ?? 1) * 0.7);
    g.strokePoints(wobble(points, amp * 1.3, seed + 7), true, true);
  }
}

export function roughRect(g: G, x: number, y: number, w: number, h: number, options: RoughOptions = {}): void {
  roughPoly(g, rectPoints(x, y, w, h), { seed: Math.round(w * 31 + h * 17 + x + y), ...options });
}

/** 手繪直線（可兩筆）。 */
export function roughLine(g: G, x1: number, y1: number, x2: number, y2: number, options: RoughOptions = {}): void {
  const seed = options.seed ?? Math.round(x1 * 3 + y1 * 5 + x2 * 7 + y2 * 11);
  const amp = options.amp ?? 0.8;
  g.lineStyle(options.width ?? 2, options.stroke ?? 0x2a2622, options.strokeAlpha ?? 1);
  g.strokePoints(wobble([{ x: x1, y: y1 }, { x: x2, y: y2 }], amp, seed, 12, false), false, false);
  if (options.double) {
    g.lineStyle((options.width ?? 2) * 0.55, options.stroke ?? 0x2a2622, (options.strokeAlpha ?? 1) * 0.7);
    g.strokePoints(wobble([{ x: x1, y: y1 }, { x: x2, y: y2 }], amp * 1.3, seed + 3, 12, false), false, false);
  }
}

/**
 * 彩鉛排線：在矩形範圍裡畫斜線，模擬色鉛筆塗色。
 * Graphics 沒有剪裁，所以每條線自己算進出矩形的交點。
 */
export function hatchRect(
  g: G,
  x: number,
  y: number,
  w: number,
  h: number,
  color: number,
  { gap = 5, alpha = 0.35, width = 1.4, seed = 1 }: { gap?: number; alpha?: number; width?: number; seed?: number } = {},
): void {
  const r = rng(seed + Math.round(w + h));
  g.lineStyle(width, color, alpha);
  // 斜率 -1 的平行線：x + y = c
  for (let c = x + y + gap * r(); c < x + w + y + h; c += gap * (0.8 + r() * 0.5)) {
    const x0 = Math.max(x, c - (y + h));
    const x1 = Math.min(x + w, c - y);
    if (x1 - x0 < 2) continue;
    g.lineBetween(x0 + 1, c - x0 - 1, x1 - 1, c - x1 + 1);
  }
}

/** 一枚朱印（方形，略歪）。 */
export function drawSeal(g: G, cx: number, cy: number, w: number, h: number, color = 0xc8372d): void {
  roughRect(g, cx - w / 2, cy - h / 2, w, h, { fill: color, fillAlpha: 0.92, stroke: color, width: 1.4, amp: 0.7, double: false });
}
