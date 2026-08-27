/**
 * 美術資源。
 *
 * 全部是手寫的 SVG（public/art/），由 Phaser 在載入時點陣化。
 * 用 SVG 的理由：檔案小、可任意縮放、可以用 setTint 依門派／境界換色，
 * 不需要為每個配色各存一張圖。
 */
import type { BossArt, MobArt, SectArt } from './data/types';

export const ART = {
  gateArch: 'gate-arch',
  cloud: 'cloud',
  slash: 'slash',
} as const;

/** 人物圖以兩倍尺寸點陣化再縮小，避免在高解析度手機上糊掉。 */
export const DISCIPLE_SOURCE_HEIGHT = 112;
export const DISCIPLE_DISPLAY_HEIGHT = 62;
export const ENEMY_SOURCE_HEIGHT = 112;
export const ENEMY_DISPLAY_HEIGHT = 76;

export function bossTexture(art: BossArt): string {
  return `boss-${art}`;
}

/** 門人造型依門派而異：體修、劍修、符修、丹修各有一張。 */
export function discipleTexture(art: SectArt): string {
  return `disciple-${art}`;
}

/** 敵陣造型依敵人類型而異：妖獸、流寇、屍傀、魔修、天兵。 */
export function enemyTexture(art: MobArt): string {
  return `enemy-${art}`;
}

interface SvgSpec {
  key: string;
  file: string;
  width: number;
  height: number;
}

const SECT_ARTS: readonly SectArt[] = ['body', 'sword', 'talisman', 'alchemy'];
const MOB_ARTS: readonly MobArt[] = ['beast', 'bandit', 'undead', 'demon', 'celestial'];

const SVGS: readonly SvgSpec[] = [
  ...SECT_ARTS.map((art) => ({
    key: discipleTexture(art),
    file: `disciple-${art}.svg`,
    width: 80,
    height: DISCIPLE_SOURCE_HEIGHT,
  })),
  ...MOB_ARTS.map((art) => ({
    key: enemyTexture(art),
    file: `enemy-${art}.svg`,
    width: 92,
    height: ENEMY_SOURCE_HEIGHT,
  })),
  { key: ART.gateArch, file: 'gate-arch.svg', width: 448, height: 232 },
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
