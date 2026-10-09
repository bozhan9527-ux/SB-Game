/**
 * 美術資源。
 *
 * 全部是像素畫，以 SVG 的方格存檔（public/art/），由 Phaser 在載入時點陣化。
 * 檔案由 scripts/pixel-art/ 的產生器輸出，改圖請改產生器再重跑，不要手改 SVG。
 *
 * 點陣化的尺寸一律是格數的整數倍，畫面上每一格才會一樣大。
 */
import { CARDS } from './data';
import type { BossArt, MobArt, SectArt } from './data/types';

export const ART = {
  cloud: 'cloud',
  slash: 'slash',
} as const;

/**
 * 介面圖示。
 *
 * 按鈕原本只有文字，而「洞府」「符籙譜」「試煉」對第一次玩的人來說都是
 * 陌生的詞——文字要讀完才知道是什麼，圖示是先看到形狀再對上詞。
 * 兩個一起放，第二次之後就只靠圖示認得出來了。
 */
import { ICON_NAMES } from './data/types';
import type { IconName } from './data/types';

export { ICON_NAMES };
export type { IconName };

export function iconTexture(name: IconName): string {
  return `icon-${name}`;
}

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

/**
 * 門人與妖物都是 28 格高。點陣化成 4 倍（112），顯示成 2 倍（56）與 3 倍（84）——
 * 顯示倍數不是整數的話，有的格子會被畫成兩點、有的三點，像素畫一眼就看得出歪。
 */
export const DISCIPLE_SOURCE_HEIGHT = 112;
export const DISCIPLE_DISPLAY_HEIGHT = 56;
export const ENEMY_SOURCE_HEIGHT = 112;
export const ENEMY_DISPLAY_HEIGHT = 84;

/** 首領是 50×50 格，點陣化成 8 倍。 */
const BOSS_SOURCE_SIZE = 400;

export function bossTexture(art: BossArt, frame = 0): string {
  return `boss-${art}-${frame}`;
}

export function bossIdleKey(art: BossArt): string {
  return `idle-boss-${art}`;
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
const BOSS_ARTS: readonly BossArt[] = ['beast', 'demon', 'storm', 'celestial'];
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
  ...ICON_NAMES.map((name) => ({
    key: iconTexture(name),
    file: `icon-${name}.svg`,
    // 兩倍尺寸點陣化再縮小，和門人圖同一個理由：手機的 DPR 多半是 2 或 3。
    width: 64,
    height: 64,
  })),
  { key: ART.cloud, file: 'cloud.svg', width: 240, height: 80 },
  { key: ART.slash, file: 'slash.svg', width: 160, height: 160 },
  ...BOSS_ARTS.flatMap((art) =>
    WALK_FRAMES.map((frame) => ({
      key: bossTexture(art, frame),
      file: `boss-${art}-${frame}.svg`,
      width: BOSS_SOURCE_SIZE,
      height: BOSS_SOURCE_SIZE,
    })),
  ),
];

/** 建立走路與首領待機動畫。動畫由兩張獨立貼圖組成，Phaser 允許 frames 直接列貼圖 key。 */
export function createWalkAnimations(scene: Phaser.Scene): void {
  const define = (key: string, frames: string[], frameRate = 7): void => {
    if (scene.anims.exists(key)) return;
    scene.anims.create({
      key,
      frames: frames.map((texture) => ({ key: texture })),
      frameRate,
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
  // 首領比小妖慢一拍：牠是在呼吸，不是在跑。
  for (const art of BOSS_ARTS) {
    define(bossIdleKey(art), WALK_FRAMES.map((f) => bossTexture(art, f)), 3);
  }
}

export function preloadArt(scene: Phaser.Scene): void {
  // BASE_URL 在 GitHub Pages 上是 /SB-Game/，寫死路徑會 404。
  const base = import.meta.env.BASE_URL;
  for (const svg of SVGS) {
    scene.load.svg(svg.key, `${base}art/${svg.file}`, { width: svg.width, height: svg.height });
  }
}
