/**
 * 美術資源。
 *
 * 全部是手寫的 SVG（public/art/），由 Phaser 在載入時點陣化。
 * 用 SVG 的理由：檔案小、可任意縮放、可以用 setTint 依門派／境界換色，
 * 不需要為每個配色各存一張圖。
 */
import type { BossArt } from './data/types';

export const ART = {
  disciple: 'disciple',
  gateArch: 'gate-arch',
  mobLine: 'mob-line',
  cloud: 'cloud',
  slash: 'slash',
} as const;

/** 門人圖以兩倍尺寸點陣化再縮小，避免在高解析度手機上糊掉。 */
export const DISCIPLE_SOURCE_HEIGHT = 80;
export const DISCIPLE_DISPLAY_HEIGHT = 30;

export function bossTexture(art: BossArt): string {
  return `boss-${art}`;
}

interface SvgSpec {
  key: string;
  file: string;
  width: number;
  height: number;
}

const SVGS: readonly SvgSpec[] = [
  { key: ART.disciple, file: 'disciple.svg', width: 56, height: DISCIPLE_SOURCE_HEIGHT },
  { key: ART.gateArch, file: 'gate-arch.svg', width: 448, height: 232 },
  { key: ART.mobLine, file: 'mob-line.svg', width: 448, height: 92 },
  { key: ART.cloud, file: 'cloud.svg', width: 240, height: 76 },
  { key: ART.slash, file: 'slash.svg', width: 240, height: 240 },
  { key: bossTexture('beast'), file: 'boss-beast.svg', width: 320, height: 320 },
  { key: bossTexture('demon'), file: 'boss-demon.svg', width: 320, height: 320 },
  { key: bossTexture('storm'), file: 'boss-storm.svg', width: 320, height: 320 },
  { key: bossTexture('celestial'), file: 'boss-celestial.svg', width: 320, height: 320 },
];

export function preloadArt(scene: Phaser.Scene): void {
  // BASE_URL 在 GitHub Pages 上是 /SB-Game/，寫死路徑會 404。
  const base = import.meta.env.BASE_URL;
  for (const svg of SVGS) {
    scene.load.svg(svg.key, `${base}art/${svg.file}`, { width: svg.width, height: svg.height });
  }
}
