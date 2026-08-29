/**
 * 美術資源。
 *
 * 全部是手寫的 SVG（public/art/），由 Phaser 在載入時點陣化。
 * 用 SVG 的理由：檔案小、可任意縮放、可以用 setTint 依門派／境界換色，
 * 不需要為每個配色各存一張圖。
 */
import { CARDS } from './data';
import type { BossArt, MobArt, SectArt } from './data/types';

export const ART = {
  cloud: 'cloud',
  slash: 'slash',
} as const;

/** 法寶符牌上的圖騰，用來一眼分辨符種。 */
export function glyphTexture(art: string): string {
  return `glyph-${art}`;
}

/**
 * 要預載哪些圖騰，直接從 cards.json 推得。
 *
 * 手抄一份清單的話，新增一張符卻忘了補這裡，牌面會變成一片空白——
 * 而那種錯誤只有在那張符被抽到時才看得出來。讓資料自己說。
 */
const GLYPH_ARTS: readonly string[] = [...new Set(CARDS.map((card) => card.art))];

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

/** 門人造型分三階，隨境界提升換裝。 */
export const DISCIPLE_TIERS = [0, 1, 2] as const;

/**
 * 境界索引 → 門人造型階級。
 * 0：煉氣–金丹（素袍）／1：元嬰–煉虛（金邊披肩）／2：合體以上（披風、頭冠、靈光）。
 */
export function discipleTierForRealm(realmIndex: number): number {
  if (realmIndex >= 6) return 2;
  if (realmIndex >= 3) return 1;
  return 0;
}

/** 門人造型依門派與階級而異，各有一套兩幀。 */
export function discipleTexture(art: SectArt, tier: number, frame: number): string {
  return `disciple-${art}-t${tier}-${frame}`;
}

/** 敵陣造型依敵人類型而異：妖獸、流寇、屍傀、魔修、天兵。 */
export function enemyTexture(art: MobArt, frame: number): string {
  return `enemy-${art}-${frame}`;
}

export function discipleWalkKey(art: SectArt, tier: number): string {
  return `walk-disciple-${art}-t${tier}`;
}

export function enemyWalkKey(art: MobArt): string {
  return `walk-enemy-${art}`;
}

/** 各敵陣造型的 viewBox 寬度，未列出者為 46。 */
const MOB_VIEWBOX_WIDTH: Partial<Record<MobArt, number>> = {
  centipede: 58,
  scorpion: 50,
};

interface SvgSpec {
  key: string;
  file: string;
  width: number;
  height: number;
}

const SECT_ARTS: readonly SectArt[] = ['body', 'sword', 'talisman', 'alchemy'];
const MOB_ARTS: readonly MobArt[] = [
  'wolf', 'bear', 'yeti', 'centipede', 'scorpion', 'serpent',
  'bandit', 'undead', 'demon', 'celestial',
];

const SVGS: readonly SvgSpec[] = [
  ...SECT_ARTS.flatMap((art) =>
    DISCIPLE_TIERS.flatMap((tier) =>
      WALK_FRAMES.map((frame) => ({
        key: discipleTexture(art, tier, frame),
        file: `disciple-${art}-t${tier}-${frame}.svg`,
        width: 80,
        height: DISCIPLE_SOURCE_HEIGHT,
      })),
    ),
  ),
  ...MOB_ARTS.flatMap((art) =>
    WALK_FRAMES.map((frame) => ({
      key: enemyTexture(art, frame),
      file: `enemy-${art}-${frame}.svg`,
      // 蜈蚣與火蠍的 viewBox 較寬，貼圖寬度要跟著走，否則會被拉扁。
      width: (MOB_VIEWBOX_WIDTH[art] ?? 46) * 2,
      height: ENEMY_SOURCE_HEIGHT,
    })),
  ),
  ...GLYPH_ARTS.map((art) => ({
    key: glyphTexture(art),
    file: `glyph-${art}.svg`,
    width: 64,
    height: 80,
  })),
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
    for (const tier of DISCIPLE_TIERS) {
      define(discipleWalkKey(art, tier), WALK_FRAMES.map((f) => discipleTexture(art, tier, f)));
    }
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
