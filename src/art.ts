/**
 * 美術資源。
 *
 * 全部是像素畫，存成一格一點的 PNG（public/art/）。
 * 檔案由 scripts/pixel-art/ 的產生器輸出，改圖請改產生器再重跑，不要手改 PNG。
 *
 * 遊戲開了 pixelArt，放大時取最近點；顯示倍數盡量取整數，每一格才會一樣大。
 */
import { CARDS } from './data';
import type { BossArt, MobArt, SectArt } from './data/types';

export const ART = {
  cloud: 'cloud',
  slash: 'slash',
  gateBeam: 'gate-beam',
  gatePost: 'gate-post',
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

/** 門人與妖物的貼圖都是 56 格高；門人原寸顯示，妖物放大 1.5 倍。 */
export const DISCIPLE_SOURCE_HEIGHT = 56;
export const DISCIPLE_DISPLAY_HEIGHT = 56;
export const ENEMY_SOURCE_HEIGHT = 56;
export const ENEMY_DISPLAY_HEIGHT = 84;

/**
 * 每種妖物貼圖裡實際有畫的最上一列（四幀取最高的那幀），單位是原圖像素。
 *
 * 貼圖一律 56 格高，但蜈蚣、熊這種矮胖的身體只畫在下半部——血條要是固定掛在
 * 貼圖頂端，就會浮在身體上方四五十像素，看起來像沒人的血條。
 * 數字是量 public/art/enemy-*.png 的不透明範圍得來的；重畫妖物時要跟著重量。
 */
export const ENEMY_ART_TOP: Readonly<Record<MobArt, number>> = {
  bandit: 2,
  bear: 22,
  celestial: 0,
  centipede: 24,
  demon: 0,
  scorpion: 12,
  serpent: 12,
  undead: 0,
  wolf: 14,
  yeti: 8,
};

export function bossTexture(art: BossArt, frame = 0): string {
  return `boss-${art}-${frame}`;
}

export function bossIdleKey(art: BossArt): string {
  return `idle-boss-${art}`;
}

/**
 * 走路循環四幀：姿勢 A、A 上抬、姿勢 B、B 上抬。以獨立貼圖組成動畫，不需要 spritesheet。
 * 只有兩幀的話是左右腳硬切，四幀多了「彈起來」那一下，走起來才有重量。
 */
export const WALK_FRAMES = [0, 1, 2, 3] as const;

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

interface ArtSpec {
  key: string;
  file: string;
}

const SECT_ARTS: readonly SectArt[] = ['body', 'sword', 'talisman', 'alchemy'];
const BOSS_ARTS: readonly BossArt[] = ['beast', 'demon', 'storm', 'celestial'];
const MOB_ARTS: readonly MobArt[] = [
  'wolf', 'bear', 'yeti', 'centipede', 'scorpion', 'serpent',
  'bandit', 'undead', 'demon', 'celestial',
];

const ASSETS: readonly ArtSpec[] = [
  ...SECT_ARTS.flatMap((art) =>
    DISCIPLE_TIERS.flatMap((tier) =>
      WALK_FRAMES.map((frame) => ({ key: discipleTexture(art, tier, frame), file: `disciple-${art}-t${tier}-${frame}` })),
    ),
  ),
  ...MOB_ARTS.flatMap((art) =>
    WALK_FRAMES.map((frame) => ({ key: enemyTexture(art, frame), file: `enemy-${art}-${frame}` })),
  ),
  ...BOSS_ARTS.flatMap((art) =>
    WALK_FRAMES.map((frame) => ({ key: bossTexture(art, frame), file: `boss-${art}-${frame}` })),
  ),
  ...GLYPH_ARTS.map((art) => ({ key: glyphTexture(art), file: `glyph-${art}` })),
  ...ICON_NAMES.map((name) => ({ key: iconTexture(name), file: `icon-${name}` })),
  { key: ART.cloud, file: 'cloud' },
  { key: ART.slash, file: 'slash' },
  { key: ART.gateBeam, file: 'gate-beam' },
  { key: ART.gatePost, file: 'gate-post' },
];

/** 建立走路與首領待機動畫。動畫由兩張獨立貼圖組成，Phaser 允許 frames 直接列貼圖 key。 */
export function createWalkAnimations(scene: Phaser.Scene): void {
  const define = (key: string, frames: string[], frameRate = 11): void => {
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
    define(bossIdleKey(art), WALK_FRAMES.map((f) => bossTexture(art, f)), 5);
  }
}

export function preloadArt(scene: Phaser.Scene): void {
  // BASE_URL 在 GitHub Pages 上是 /SB-Game/，寫死路徑會 404。
  const base = import.meta.env.BASE_URL;
  for (const asset of ASSETS) {
    scene.load.image(asset.key, `${base}art/${asset.file}.png`);
  }
}
