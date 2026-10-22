/**
 * 強制飛升、天劫與仙緣（v23 起，見 ROGUELITE_DESIGN.md）。
 *
 * 舊制是「推過第 82 關之後自己選要不要轉世」，仙緣加的是傷害、金幣、耐久、階數四條乘區。
 * 實測輪迴一次之後 1–81 關全部被輾平：仙緣對整條主線生效，世界卻只在 82 關以後變硬。
 * 新制：
 * - **打完第 81 關就飛升**，不再停在原地刷。
 * - 下一世開始前在飛升台**自己選要背哪些天劫**；背得越多，這一世的仙緣越多。
 *   重天就是背了多少劫，九重天（劫數 18）渡劫就是「證道」，證道之後才開放第 82 關以後的飛升境。
 * - 仙緣主要拿來**解鎖**：機緣卡、天劫的第二三重。只剩一條很小的傷害線。
 *
 * 以下是舊制的說明，保留給還在讀舊程式的人：
 *
 * **為什麼需要這一層。** 通關 81 關之後只剩無限模式：沒有轉生、沒有傳承、沒有新周目，
 * 也就沒有任何理由再開一輪。轉世把「已經爬到多深」換成跨世永久生效的仙緣點——
 * 進度歸零，但下一世爬得快得多，而且爬的過程本身變成一個可以優化的東西。
 *
 * 三條規矩，缺一條這個系統就會壞掉：
 *
 * 1. **只有比上一次更深才給點數。**（claimedStage）沒有這條，同一段進度可以反覆轉世
 *    刷點，轉世就從一個決定退化成一個必須重複執行的動作。
 * 2. **符籙與試煉的解鎖不跟著歸零。**它們看的是 highestStage，而轉世不動它——
 *    收回玩家已經打出來的選擇，只會讓人不敢轉世。
 * 3. **仙緣只給乘區，不給別處拿不到的東西。**它加速重爬，不解鎖新內容；
 *    否則不轉世的人會落後在「內容」而不只是「速度」上。
 *
 * 本檔不 import Phaser，全部是純函式。
 */
import { BLESSINGS, KARMA, TRIBULATIONS, UPGRADES } from '../data';
import { freshRealmRun, lastFiniteStage } from './realmrun';
import type { KarmaTrack } from '../data/types';
import type { SaveData } from '../save/types';

export function karmaTrackById(id: string): KarmaTrack {
  const track = KARMA.find((item) => item.id === id);
  if (track === undefined) throw new Error(`未知的仙緣項目：${id}`);
  return track;
}

/** 升到下一級要幾點。已滿級回 null。 */
export function karmaCost(track: KarmaTrack, level: number): number | null {
  if (level >= track.maxLevel) return null;
  return Math.round(track.cost * Math.pow(track.costGrowth, level));
}

export function karmaLevel(save: SaveData, id: string): number {
  return Math.max(0, save.player.karma.spent[id] ?? 0);
}

/**
 * 該線目前的累計數值（0 級為 0）。
 *
 * 和修為同一個理由吃純資料：伺服器重播時只有玩家上報的等級表，沒有存檔。
 */
export function karmaAmountOf(spent: Readonly<Record<string, number>>, id: string): number {
  const track = KARMA.find((item) => item.id === id);
  if (track === undefined) return 0;
  return track.perLevel * Math.max(0, Math.min(track.maxLevel, spent[id] ?? 0));
}

export function karmaAmount(save: SaveData, id: string): number {
  return karmaAmountOf(save.player.karma.spent, id);
}

export type KarmaPurchase = 'ok' | 'maxed' | 'poor';

export function buyKarma(save: SaveData, id: string): KarmaPurchase {
  const track = karmaTrackById(id);
  const level = karmaLevel(save, id);
  const cost = karmaCost(track, level);
  if (cost === null) return 'maxed';
  if (save.player.karma.points < cost) return 'poor';
  save.player.karma.points -= cost;
  save.player.karma.spent[id] = level + 1;
  return 'ok';
}

// ---------------------------------------------------------------- 飛升（v23）

/** 一次飛升的基本仙緣。 */
export const ASCEND_BASE_POINTS = 8;
/** 每一劫數多給幾成。 */
export const JIE_POINT_RATIO = 0.25;
/** 天劫最多幾重。 */
export const MAX_TRIB_LEVEL = 3;

export const HEAVEN_NAMES = ['凡世', '一重天', '二重天', '三重天', '四重天', '五重天', '六重天', '七重天', '八重天', '九重天'] as const;

/** 這一世背的天劫總共幾劫。不認得的天劫、超過三重的一律不算。 */
export function jieCount(levels: Readonly<Record<string, number>>): number {
  let total = 0;
  for (const def of TRIBULATIONS) {
    total += Math.max(0, Math.min(MAX_TRIB_LEVEL, Math.floor(levels[def.id] ?? 0)));
  }
  return total;
}

/** 劫數換算成重天：劫數 2 為一重天，每 2 劫數一重，劫數 18 為九重天。 */
export function heavenOf(jie: number): number {
  if (jie < 2) return 0;
  return Math.min(9, Math.floor(jie / 2));
}

export function heavenName(heaven: number): string {
  return HEAVEN_NAMES[Math.max(0, Math.min(9, heaven))] ?? '凡世';
}

/** 仙緣倍率。 */
export function karmaMultiplier(jie: number): number {
  return 1 + JIE_POINT_RATIO * jie;
}

/** 打完第 81 關之後（world.stage 已經是 82）就該飛升。證道之後可以繼續往飛升境走。 */
export function mustAscend(save: SaveData): boolean {
  return save.world.stage > lastFiniteStage() && !save.player.karma.dao;
}

/** 現在可以飛升嗎（證道之後在飛升境裡也可以隨時飛升）。 */
export function canAscend(save: SaveData): boolean {
  return save.world.stage > lastFiniteStage();
}

/**
 * 這一次飛升能拿到幾點。
 *
 * 證道之後往飛升境推得越深，額外多一點：每 6 關 1 點，只算比上一次更深的那一段——
 * 和舊制同一條規矩，同一段進度不能反覆刷。
 */
export function ascensionGain(save: SaveData): number {
  const base = Math.round(ASCEND_BASE_POINTS * karmaMultiplier(jieCount(save.world.tribulations)));
  const finite = lastFiniteStage() + 1;
  const deeper = Math.max(0, save.world.highestStage - Math.max(finite, save.player.karma.claimedStage));
  return base + Math.floor(deeper / 6);
}

/**
 * 飛升。歸零的是這一世的東西：關卡、金幣、洞府、副本、門派秘傳、一境一局。
 * 留下的是跨世的東西：門派與修為、符籙解鎖、成就、紀錄、仙緣與解鎖。
 * 天劫留著當下一世的預設，飛升台上再改。回傳拿到幾點。
 */
export function ascend(save: SaveData): number {
  if (!canAscend(save)) return 0;
  const gained = ascensionGain(save);
  const karma = save.player.karma;
  const heaven = heavenOf(jieCount(save.world.tribulations));
  karma.points += gained;
  karma.rebirths += 1;
  karma.claimedStage = Math.max(karma.claimedStage, save.world.highestStage);
  karma.bestHeaven = Math.max(karma.bestHeaven, heaven);
  if (heaven >= 9) karma.dao = true;

  save.world.stage = 1;
  save.world.realmRun = freshRealmRun(1);
  save.player.wallet.gold = 0;
  for (const track of UPGRADES) save.player.upgrades[track.id] = 0;
  save.player.dungeons = {};
  save.player.sectDepth = {};
  save.player.omen = null;
  return gained;
}

// ---------------------------------------------------------------- 仙緣解鎖

/** 天劫某一重的解鎖鍵。第一重不用解鎖。 */
export function tribKey(id: string, level: number): string {
  return `trib:${id}:${level}`;
}

/** 解鎖要幾點；不是能解鎖的東西回 null。 */
export function unlockCost(key: string): number | null {
  const match = /^trib:([^:]+):([23])$/.exec(key);
  if (match !== null) {
    if (!TRIBULATIONS.some((def) => def.id === match[1])) return null;
    return Number(match[2]);
  }
  const blessing = BLESSINGS.find((def) => def.id === key);
  if (blessing === undefined || blessing.unlock !== 'karma') return null;
  return blessing.cost;
}

export function isUnlocked(save: SaveData, key: string): boolean {
  return save.player.karma.unlocks.includes(key);
}

/** 天劫的這一重能不能選。 */
export function tribLevelOpen(save: SaveData, id: string, level: number): boolean {
  if (level <= 0) return true;
  if (level === 1) return true;
  return isUnlocked(save, tribKey(id, level));
}

export type UnlockResult = 'ok' | 'poor' | 'done' | 'locked' | 'invalid';

export function unlock(save: SaveData, key: string): UnlockResult {
  const cost = unlockCost(key);
  if (cost === null) return 'invalid';
  if (isUnlocked(save, key)) return 'done';
  // 第三重要先開第二重。
  const third = /^trib:([^:]+):3$/.exec(key);
  if (third !== null && !isUnlocked(save, tribKey(third[1] ?? '', 2))) return 'locked';
  if (save.player.karma.points < cost) return 'poor';
  save.player.karma.points -= cost;
  save.player.karma.unlocks.push(key);
  return 'ok';
}

/** 飛升台上設定某一條天劫背幾重（0 為不背）。沒解鎖的重數不收。 */
export function setTribulation(save: SaveData, id: string, level: number): boolean {
  if (!TRIBULATIONS.some((def) => def.id === id)) return false;
  const want = Math.max(0, Math.min(MAX_TRIB_LEVEL, Math.floor(level)));
  if (!tribLevelOpen(save, id, want)) return false;
  if (want === 0) {
    const { [id]: _drop, ...rest } = save.world.tribulations;
    save.world.tribulations = rest;
  } else {
    save.world.tribulations = { ...save.world.tribulations, [id]: want };
  }
  return true;
}

/** 舊制四條仙緣線的花費（v22 以前），轉換存檔時用來退點。 */
const LEGACY_TRACKS: Readonly<Record<string, { cost: number; growth: number }>> = {
  karmaPower: { cost: 1, growth: 1.06 },
  karmaGold: { cost: 1, growth: 1.06 },
  karmaGate: { cost: 1, growth: 1.06 },
  karmaTier: { cost: 6, growth: 1.6 },
};

/** 舊制花掉的仙緣總共值幾點。 */
export function legacyKarmaRefund(spent: Readonly<Record<string, unknown>>): number {
  let total = 0;
  for (const [id, track] of Object.entries(LEGACY_TRACKS)) {
    const raw = spent[id];
    const level = typeof raw === 'number' && Number.isFinite(raw) ? Math.max(0, Math.min(500, Math.floor(raw))) : 0;
    for (let l = 0; l < level; l += 1) total += Math.round(track.cost * Math.pow(track.growth, l));
  }
  return total;
}
