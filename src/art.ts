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

/** 走路循環的兩幀。以兩張獨立貼圖組成動畫，不需要 spritesheet。 */
export const WALK_FRAMES = [0, 1] as const;

/** 門人造型依門派而異：體修、劍修、符修、丹修各有一套兩幀。 */
export function discipleTexture(art: SectArt, frame: number): string {
  return `disciple-${art}-${frame}`;
}

/** 敵陣造型依敵人類型而異：妖獸、流寇、屍傀、魔修、天兵。 */
export function enemyTexture(art: MobArt, frame: number): string {
  return `enemy-${art}-${frame}`;
}

export function discipleWalkKey(art: SectArt): string {
  return `walk-disciple-${art}`;
}

export function enemyWalkKey(art: MobArt): string {
  return `walk-enemy-${art}`;
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
  ...SECT_ARTS.flatMap((art) =>
    WALK_FRAMES.map((frame) => ({
      key: discipleTexture(art, frame),
      file: `disciple-${art}-${frame}.svg`,
      width: 80,
      height: DISCIPLE_SOURCE_HEIGHT,
    })),
  ),
  ...MOB_ARTS.flatMap((art) =>
    WALK_FRAMES.map((frame) => ({
      key: enemyTexture(art, frame),
      file: `enemy-${art}-${frame}.svg`,
      width: 92,
      height: ENEMY_SOURCE_HEIGHT,
    })),
  ),
  { key: ART.gateArch, file: 'gate-arch.svg', width: 448, height: 232 },
  { key: ART.cloud, file: 'cloud.svg', width: 240, height: 76 },
  { key: ART.slash, file: 'slash.svg', width: 240, height: 240 },
  { key: bossTexture('beast'), file: 'boss-beast.svg', width: 320, height: 320 },
  { key: bossTexture('demon'), file: 'boss-demon.svg', width: 320, height: 320 },
  { key: bossTexture('storm'), file: 'boss-storm.svg', width: 320, height: 320 },
  { key: bossTexture('celestial'), file: 'boss-celestial.svg', width: 320, height: 320 },
];

/** 建立走路動畫。動畫由兩張獨立貼圖組成，Phaser 允許 frames 直接列貼圖 key。 */
export function createWalkAnimations(scene: Phaser.Scene): void {
  const define = (key: string, frames: string[]): void => {
    if (scene.anims.exists(key)) return;
    scene.anims.create({
      key,
      frames: frames.map((texture) => ({ key: texture })),
      frameRate: 7,
      repeat: -1,
    });
  };
  for (const art of SECT_ARTS) {
    define(discipleWalkKey(art), WALK_FRAMES.map((f) => discipleTexture(art, f)));
  }
  for (const art of MOB_ARTS) {
    define(enemyWalkKey(art), WALK_FRAMES.map((f) => enemyTexture(art, f)));
  }
}

export function preloadArt(scene: Phaser.Scene): void {
  // BASE_URL 在 GitHub Pages 上是 /SB-Game/，寫死路徑會 404。
  const base = import.meta.env.BASE_URL;
  for (const svg of SVGS) {
    scene.load.svg(svg.key, `${base}art/${svg.file}`, { width: svg.width, height: svg.height });
  }
}
