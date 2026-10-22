/**
 * 美術資源。
 *
 * 全部是手繪風（墨線、彩鉛排線、宣紙），存成 WebP（public/art/）。
 * 檔案由 scripts/sketch-art/ 的產生器輸出，改圖請改產生器再重跑，不要手改圖檔。
 *
 * 貼圖以遊戲點的兩倍（首領 1.5 倍、背景 1 倍）算圖；顯示倍數記在 art-manifest.json，
 * 其他元件在使用的地方用 setDisplaySize 指定遊戲點大小。
 */
import { CARDS, ENEMIES, REALMS, SHOP } from './data';
import artManifest from './data/art-manifest.json';
import type { BossArt, MobArt, SectArt } from './data/types';

export const ART = {
  cloud: 'cloud',
  slash: 'slash',
  gateBeam: 'gate-beam',
  gatePost: 'gate-post',
  arena: 'arena',
  gate: 'gate',
  cardPaper: 'card-paper',
  slot: 'slot',
  titleKey: 'title-key',
  titleLogo: 'title-logo',
  titleHero: 'title-hero',
  titleSword: 'title-sword',
  titleCrane0: 'title-crane-0',
  titleCrane1: 'title-crane-1',
} as const;

/**
 * 介面圖示。
 *
 * 按鈕原本只有文字，而「洞府」「符籙譜」「試煉」對第一次玩的人來說都是
 * 陌生的詞——文字要讀完才知道是什麼，圖示是先看到形狀再對上詞。
 * 兩個一起放，第二次之後就只靠圖示認得出來了。
 */
import { BOSS_ART_NAMES, ICON_NAMES } from './data/types';
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
 * 每種角色貼圖的尺寸、實際有畫的最上一列、顯示倍數。
 *
 * 由 scripts/sketch-art/build.mjs 量好寫進 art-manifest.json——重畫角色之後跑一次產生器，
 * 這裡就跟著對，不必再手改程式裡的數字。w、h 是貼圖像素，乘上 scale 才是遊戲點。
 */
export interface ArtSize {
  w: number;
  h: number;
  /** 實際有畫的最上一列（各幀取最高，貼圖像素），血條掛在這裡，不掛在貼圖頂端。 */
  top: number;
  scale: number;
}

const MANIFEST = artManifest as {
  enemy: Record<string, ArtSize>;
  boss: Record<string, ArtSize>;
  disciple: Record<string, ArtSize>;
  paperdoll?: { order: string[]; parts: Record<string, string>; outfits: Record<string, string[]>; weaponSkins?: Record<string, string> };
};
const FALLBACK: ArtSize = { w: 192, h: 184, top: 0, scale: 0.5 };

export function enemyArtSize(art: MobArt): ArtSize {
  return MANIFEST.enemy[art] ?? FALLBACK;
}

export function bossArtSize(art: BossArt): ArtSize {
  return MANIFEST.boss[art] ?? { w: 330, h: 318, top: 0, scale: 2 / 3 };
}

export function discipleArtSize(art: SectArt): ArtSize {
  return MANIFEST.disciple[art] ?? { w: 160, h: 224, top: 0, scale: 0.5 };
}

/** 各妖物貼圖實際的上緣（測試拿來和 PNG 對照）。 */
export const ENEMY_ART_TOP: Readonly<Record<string, number>> = Object.fromEntries(
  Object.entries(MANIFEST.enemy).map(([art, size]) => [art, size.top]),
);

/** 境界遠景（scripts/sketch-art/world.mjs 產生，540×960，一點對一像素）。 */
export function backdropTexture(realmId: string): string {
  return `bg-${realmId}`;
}

export function bossTexture(art: BossArt, frame = 0): string {
  return `boss-${art}-${frame}`;
}

export function bossIdleKey(art: BossArt): string {
  return `idle-boss-${art}`;
}

/**
 * 走路循環四幀：姿勢 A、A 上抬、姿勢 B、B 上抬。以獨立貼圖組成動畫，不需要 spritesheet。
 * 只有兩幀的話是左右腳硬切，四幀多了「彈起來」那一下，走起來才有重量。
 * 每幀的線條都重新抖過一次，換幀時輪廓會微微「沸騰」，是手繪動畫的質感。
 */
export const WALK_FRAMES = [0, 1, 2, 3] as const;

/** 首領兩幀（呼吸起伏）：首領圖大，四幀太吃顯示記憶體，而牠本來就不走路。 */
export const BOSS_FRAMES = [0, 1] as const;

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
const BOSS_ARTS: readonly BossArt[] = BOSS_ART_NAMES;
const MOB_ARTS: readonly MobArt[] = [
  'wolf', 'bear', 'yeti', 'centipede', 'scorpion', 'serpent',
  'bandit', 'undead', 'demon', 'celestial',
  'treant', 'wisp', 'golem',
  'fox', 'toad', 'bat', 'skeleton', 'puppet', 'spider', 'lion', 'crane', 'raiju', 'jadeguard',
];

/** 符紙紋樣（藏寶閣賣的），從 shop.json 推得。 */
const PAPER_SKINS: readonly string[] = SHOP.papers.map((p) => p.id);

const ASSETS: readonly ArtSpec[] = [
  ...Object.keys(MANIFEST.paperdoll?.parts ?? {}).flatMap((id) =>
    WALK_FRAMES.map((frame) => ({ key: partTexture(id, frame), file: `pd-${id}-${frame}` })),
  ),
  ...MOB_ARTS.flatMap((art) =>
    WALK_FRAMES.map((frame) => ({ key: enemyTexture(art, frame), file: `enemy-${art}-${frame}` })),
  ),
  ...BOSS_ARTS.flatMap((art) =>
    BOSS_FRAMES.map((frame) => ({ key: bossTexture(art, frame), file: `boss-${art}-${frame}` })),
  ),
  ...GLYPH_ARTS.map((art) => ({ key: glyphTexture(art), file: `glyph-${art}` })),
  ...ICON_NAMES.map((name) => ({ key: iconTexture(name), file: `icon-${name}` })),
  ...REALMS.map((realm) => ({ key: backdropTexture(realm.id), file: `bg-${realm.id}` })),
  { key: ART.cloud, file: 'cloud' },
  { key: ART.slash, file: 'slash' },
  { key: ART.gateBeam, file: 'gate-beam' },
  { key: ART.gatePost, file: 'gate-post' },
  { key: ART.arena, file: 'arena' },
  { key: ART.gate, file: 'gate' },
  { key: ART.cardPaper, file: 'card-paper' },
  ...PAPER_SKINS.map((id) => ({ key: `card-paper-${id}`, file: `card-paper-${id}` })),
  { key: ART.slot, file: 'slot' },
  { key: ART.titleKey, file: 'title-key' },
  { key: ART.titleLogo, file: 'title-logo' },
  { key: ART.titleHero, file: 'title-hero' },
  { key: ART.titleSword, file: 'title-sword' },
  { key: ART.titleCrane0, file: 'title-crane-0' },
  { key: ART.titleCrane1, file: 'title-crane-1' },
];

/**
 * 門人是分層組成的（paper doll）：雙足、外袍、武器、頭面、頭飾……各是一層（scripts/sketch-art/chars.mjs 的 PARTS），
 * 同一張畫布、同一套走路起伏。這裡把一套部件照順序畫進同一張畫布，當成一張一般的貼圖用。
 *
 * 以後的時裝或武器外觀＝換掉清單裡某一格的部件，再用新的 key 疊一次，其他層不用重畫。
 */
export function partTexture(id: string, frame: number): string {
  return `pd-${id}-${frame}`;
}

/**
 * 門人的外觀：穿哪一套時裝、每一種武器配哪個外觀（藏寶閣買的）。
 * weapons 的 key 是武器種類（sword／fist／fu／gourd），值是外觀 id。
 */
export interface Look {
  costume: string | null;
  weapons: Readonly<Record<string, string>>;
}

export const PLAIN_LOOK: Look = { costume: null, weapons: {} };

/** 一個門派、一階的部件清單；穿著時裝的話換成那套時裝的（沒有這套時裝的圖就退回門派原本的）。武器配了外觀就換掉武器那一格。 */
export function outfitParts(art: SectArt, tier: number, look: Look = PLAIN_LOOK): readonly string[] {
  const outfits = MANIFEST.paperdoll?.outfits ?? {};
  const costume = look.costume;
  const parts = (costume !== null ? outfits[`${costume}:${art}-${tier}`] : undefined) ?? outfits[`${art}-${tier}`] ?? [];
  return parts.map((id) => {
    const skin = id.startsWith('weapon-') ? look.weapons[id.slice(7)] : undefined;
    return skin !== undefined && MANIFEST.paperdoll?.weaponSkins?.[skin] === id.slice(7) ? `weapon-s-${skin}` : id;
  });
}

/**
 * 把一組部件畫進 key 這張畫布貼圖。已經存在就擦掉重畫（換裝走這條）——
 * 沿用同一張貼圖物件，走路動畫和場上的門人不用重建就會換上新衣服。
 */
export function composeOutfit(scene: Phaser.Scene, key: string, parts: readonly string[], frame: number): void {
  const layers = parts.map((id) => partTexture(id, frame)).filter((k) => scene.textures.exists(k));
  const first = layers[0];
  if (first === undefined) return;
  const src = scene.textures.get(first).getSourceImage() as HTMLImageElement;
  const existing = scene.textures.exists(key) ? scene.textures.get(key) : null;
  const canvas = existing instanceof Phaser.Textures.CanvasTexture ? existing : existing === null ? scene.textures.createCanvas(key, src.width, src.height) : null;
  if (canvas === null) return;
  canvas.context.clearRect(0, 0, canvas.width, canvas.height);
  for (const layer of layers) canvas.context.drawImage(scene.textures.get(layer).getSourceImage() as HTMLImageElement, 0, 0);
  canvas.refresh();
}

/** 門人（門派 × 階級）疊成 disciple-* 貼圖 key，場景程式照舊用。穿著時裝、配了武器外觀就疊那些部件。 */
export function composeDisciples(scene: Phaser.Scene, look: Look = PLAIN_LOOK): void {
  for (const art of SECT_ARTS) {
    for (const tier of DISCIPLE_TIERS) {
      for (const frame of WALK_FRAMES) composeOutfit(scene, discipleTexture(art, tier, frame), outfitParts(art, tier, look), frame);
    }
  }
}

function lookKey(look: Look): string {
  return `${look.costume ?? 'plain'}~${Object.entries(look.weapons).sort().map(([k, v]) => `${k}.${v}`).join('.')}`;
}

/** 某個外觀穿在某派某階身上的預覽貼圖（藏寶閣用），第 0 幀。 */
export function costumePreview(scene: Phaser.Scene, look: Look, art: SectArt, tier: number): string {
  const key = `preview-${lookKey(look)}-${art}-t${tier}`;
  if (!scene.textures.exists(key)) composeOutfit(scene, key, outfitParts(art, tier, look), 0);
  return key;
}

/** 某個外觀的走路動畫（藏寶閣裡選中的那一件會動，看得出穿上之後走起來的樣子）。 */
export function costumePreviewAnim(scene: Phaser.Scene, look: Look, art: SectArt, tier: number): string {
  const key = `preview-walk-${lookKey(look)}-${art}-t${tier}`;
  if (scene.anims.exists(key)) return key;
  const frames = WALK_FRAMES.map((frame) => {
    const texture = `preview-${lookKey(look)}-${art}-t${tier}-f${frame}`;
    if (!scene.textures.exists(texture)) composeOutfit(scene, texture, outfitParts(art, tier, look), frame);
    return { key: texture };
  });
  scene.anims.create({ key, frames, frameRate: 6, repeat: -1 });
  return key;
}

/** 建立走路與首領待機動畫。動畫由兩張獨立貼圖組成，Phaser 允許 frames 直接列貼圖 key。 */
export function createWalkAnimations(scene: Phaser.Scene): void {
  const define = (key: string, frames: string[], frameRate = 8): void => {
    if (scene.anims.exists(key)) return;
    // 圖是分批載的（見 preloadArt）：還沒載到的先不建，下一次進場再建——
    // 建了空的動畫會被 exists 擋住，之後圖載好了也不會再補。
    if (!frames.every((texture) => scene.textures.exists(texture))) return;
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
    define(bossIdleKey(art), BOSS_FRAMES.map((f) => bossTexture(art, f)), 3);
  }
}

/**
 * 分批載圖。
 *
 * 全部 340 多張一次載完約 3MB，手機網路差的時候開場要等很久，而開場其實只用得到一小部分：
 * 介面、主畫面、符、戰場、門人的基本部件，加上**現在這個境界**的背景、妖物與首領。
 * 這些在開場（BootScene）載；其餘進主畫面後在背景慢慢載（loadRemainingArt），
 * 戰鬥場景開打前再確認一次它要的那一境有沒有到（ensureRealmArt）。
 */
const COSTUME_PART = /^(robe-c-|hat-(?!bun$|band$|crown$)|cape-(?!red$)|weapon-s-)/;

/** 藏寶閣賣的東西（時裝部件、武器外觀、符紙紋樣）：沒穿沒用的不在開場那一批。 */
function isCostumePart(file: string): boolean {
  if (file.startsWith('card-paper-')) return true;
  return file.startsWith('pd-') && COSTUME_PART.test(file.slice(3).replace(/-\d+$/, ''));
}

function realmFiles(realmId: string): Set<string> {
  const files = new Set<string>([`bg-${realmId}`]);
  for (const mob of ENEMIES.mobs) if (mob.realm === realmId) for (const f of WALK_FRAMES) files.add(`enemy-${mob.art}-${f}`);
  for (const boss of ENEMIES.bosses) if (boss.realm === realmId) for (const f of BOSS_FRAMES) files.add(`boss-${boss.art}-${f}`);
  return files;
}

function isRealmFile(file: string): boolean {
  return file.startsWith('bg-') || file.startsWith('enemy-') || file.startsWith('boss-');
}

function queue(scene: Phaser.Scene, assets: readonly ArtSpec[]): number {
  // BASE_URL 在 GitHub Pages 上是 /SB-Game/，寫死路徑會 404。
  const base = import.meta.env.BASE_URL;
  let n = 0;
  for (const asset of assets) {
    if (scene.textures.exists(asset.key)) continue;
    scene.load.image(asset.key, `${base}art/${asset.file}.webp`);
    n += 1;
  }
  return n;
}

/** 開場要的那一批。realmId：玩家現在所在的境界；look：穿著的外觀（要它的部件才疊得出門人）；paper：用的符紙。 */
export function preloadArt(scene: Phaser.Scene, realmId: string, look: Look = PLAIN_LOOK, paper: string | null = null): void {
  const realm = realmFiles(realmId);
  const costume = look.costume;
  const worn = new Set(costume === null ? [] : Object.entries(MANIFEST.paperdoll?.outfits ?? {}).filter(([k]) => k.startsWith(`${costume}:`)).flatMap(([, parts]) => parts.map((id) => `pd-${id}`)));
  for (const skin of Object.values(look.weapons)) worn.add(`pd-weapon-s-${skin}`);
  if (paper !== null) worn.add(cardPaperTexture(paper));
  queue(
    scene,
    ASSETS.filter((asset) => {
      if (isRealmFile(asset.file)) return realm.has(asset.file);
      if (isCostumePart(asset.file)) return worn.has(asset.file.replace(/-\d+$/, ''));
      return true;
    }),
  );
}

/** 某一境的背景、妖物與首領（戰鬥開打前確認；無限副本會一路往下打，給 all）。 */
export function ensureRealmArt(scene: Phaser.Scene, realmIds: readonly string[] | 'all'): number {
  const wanted = realmIds === 'all' ? null : new Set(realmIds.flatMap((id) => [...realmFiles(id)]));
  return queue(scene, ASSETS.filter((asset) => isRealmFile(asset.file) && (wanted === null || wanted.has(asset.file))));
}

/** 符紙紋樣的貼圖 key（null 是原本的黃符紙）。 */
export function cardPaperTexture(paper: string | null): string {
  return paper === null ? ART.cardPaper : `card-paper-${paper}`;
}

let currentPaper: string | null = null;

/** 換符紙：之後新建的符牌都用這張（ui/card.ts 讀 cardPaperKey）。 */
export function setCardPaper(paper: string | null): void {
  currentPaper = paper;
}

/** 現在該用的符紙；還沒載到就先用原本的。 */
export function cardPaperKey(scene: Phaser.Scene): string {
  const key = cardPaperTexture(currentPaper);
  return scene.textures.exists(key) ? key : ART.cardPaper;
}

/** 時裝部件（藏寶閣用）。 */
export function ensureCostumeArt(scene: Phaser.Scene): number {
  return queue(scene, ASSETS.filter((asset) => isCostumePart(asset.file)));
}

/** 其餘全部，背景慢慢載。主畫面呼叫；中途換場景也沒關係，下次進主畫面會接著載剩下的。 */
export function loadRemainingArt(scene: Phaser.Scene): void {
  if (queue(scene, ASSETS) > 0) scene.load.start();
}
