/**
 * 機緣：每過一關三選一，本境內有效。
 *
 * 這是 B 路線的核心（見 ROGUELITE_DESIGN.md）。原本每一場要做的決定都一樣——
 * 「放下去還是留著合」——打十場就摸透了。機緣改的是**規則**而不是數字：
 * 冰火相激讓寒冰與烈焰變成一組，風刃回旋讓風刃在妖魔稀疏時不再空揮。
 * 每一局拿到的組合不同，同一關打起來就是另一種仗。
 *
 * 效果分兩種落點：
 * - 開場就決定的（抽符速度、陣法倍率）在這裡改 loadout；
 * - 戰鬥中才成立的（首領登場、合成、漏怪）由 defense.ts 在對應的地方讀 blessingValue。
 *
 * 本檔不 import Phaser，全部是純函式。
 */
import { BLESSINGS } from '../data';
import type { BlessingDef } from '../data/types';
import type { Rng } from './rng';

/** 機緣 id → 星級（稀有機緣固定 1）。 */
export type BlessingMap = Readonly<Record<string, number>>;

export const NO_BLESSINGS: BlessingMap = Object.freeze({});

/** 一般機緣的星級上限。萬法歸宗可以再往上推一星。 */
export const MAX_STARS = 3;

export function blessingDef(id: string): BlessingDef | null {
  return BLESSINGS.find((item) => item.id === id) ?? null;
}

/**
 * 某一星級的數值。超過資料給的星級時照最後兩星的差往外推——
 * 萬法歸宗把三星推成「四星」，數值要接著長，而不是停在三星。
 */
export function valueAtStars(def: BlessingDef, stars: number): number {
  if (stars <= 0) return 0;
  const values = def.values;
  const last = values[values.length - 1] ?? 0;
  if (stars <= values.length) return values[stars - 1] ?? last;
  const prev = values[values.length - 2] ?? last;
  return last + (last - prev) * (stars - values.length);
}

/** 這一局某張機緣的有效星級：本身星級，加上萬法歸宗的 +1（它自己不吃）。 */
export function effectiveStars(blessings: BlessingMap, id: string): number {
  const stars = blessings[id] ?? 0;
  if (stars <= 0) return 0;
  const def = blessingDef(id);
  if (def === null || def.rare) return stars;
  return stars + ((blessings['allStar'] ?? 0) > 0 ? 1 : 0);
}

/** 戰鬥中讀機緣的入口：沒有這張機緣就是 0。 */
export function blessingValue(blessings: BlessingMap, id: string): number {
  const def = blessingDef(id);
  if (def === null) return 0;
  return valueAtStars(def, effectiveStars(blessings, id));
}

export function hasBlessing(blessings: BlessingMap, id: string): boolean {
  return (blessings[id] ?? 0) > 0;
}

/** 把數值寫成玩家看得懂的樣子。 */
export function formatBlessingValue(def: BlessingDef, value: number): string {
  if (def.format === 'percent') return `${Math.round(value * 100)}%`;
  if (def.format === 'times') return `×${Number(value.toFixed(2))}`;
  if (def.format === 'seconds') return `${Number(value.toFixed(1))} 秒`;
  return `${Number(value.toFixed(2))}`;
}

/** 某一星級的說明文字。 */
export function blessingText(def: BlessingDef, stars: number): string {
  return def.desc.replace('{v}', formatBlessingValue(def, valueAtStars(def, Math.max(1, stars))));
}

export const CATEGORY_LABEL: Readonly<Record<BlessingDef['category'], string>> = {
  attack: '攻',
  guard: '守',
  fortune: '運',
};

/** 三選一的候選條件。 */
export interface OfferContext {
  /** 本局已有的機緣。 */
  owned: BlessingMap;
  /** 用仙緣解鎖過的機緣 id。 */
  unlocked: readonly string[];
  sectId: string;
  /** 本局帶的符（抽符池）。 */
  talismans: readonly string[];
  /** 境底首領給的稀有三選一。 */
  rare: boolean;
  /** 本門專屬機緣的出現權重（門派傳承）。缺席為 1。 */
  sectWeight?: number;
}

/** 這張機緣在這一局有沒有資格出現。 */
export function blessingEligible(def: BlessingDef, ctx: OfferContext): boolean {
  if (def.rare !== ctx.rare) return false;
  if (def.unlock === 'karma' && !ctx.unlocked.includes(def.id)) return false;
  if (def.sect !== null && def.sect !== ctx.sectId) return false;
  // 綁定的符沒帶就不出現：沒帶寒冰卻抽到冰火相激，等於少了一個選項。
  for (const group of def.requires) {
    if (!group.some((id) => ctx.talismans.includes(id))) return false;
  }
  const stars = ctx.owned[def.id] ?? 0;
  if (def.rare) return stars <= 0;
  return stars < MAX_STARS;
}

export function offerPool(ctx: OfferContext): BlessingDef[] {
  return BLESSINGS.filter((def) => blessingEligible(def, ctx));
}

/**
 * 抽出這一次的候選。
 *
 * 兩條規矩：
 * - **至少一張不是攻**：只給三張攻擊，玩家只能堆傷害，鐵壁與運轉兩種打法永遠長不出來。
 * - **已經有的機緣稍微好抽**：升星是這個系統的樂趣之一，完全均勻的話三星幾乎湊不到。
 */
export function rollOffer(ctx: OfferContext, rng: Rng, count = 3): string[] {
  const pool = offerPool(ctx);
  const picked: BlessingDef[] = [];
  const weightOf = (def: BlessingDef): number =>
    ((ctx.owned[def.id] ?? 0) > 0 ? 1.6 : 1) * (def.sect !== null ? ctx.sectWeight ?? 1 : 1);
  while (picked.length < count && pool.length > 0) {
    const needSupport = picked.length === count - 1 && picked.every((def) => def.category === 'attack');
    const candidates = needSupport ? pool.filter((def) => def.category !== 'attack') : pool;
    const from = candidates.length > 0 ? candidates : pool;
    const def = rng.pickWeighted(from, weightOf);
    picked.push(def);
    pool.splice(pool.indexOf(def), 1);
  }
  return picked.map((def) => def.id);
}

/** 選下一張：沒有就給一星，有就升一星（稀有不升）。回傳新的機緣表。 */
export function takeBlessing(owned: BlessingMap, id: string): Record<string, number> {
  const def = blessingDef(id);
  const next = { ...owned };
  if (def === null) return next;
  const stars = next[id] ?? 0;
  next[id] = def.rare ? 1 : Math.min(MAX_STARS, stars + 1);
  return next;
}

/** 上報或存檔讀進來的機緣表一律走這裡：不認得的 id 與不合理的星級直接丟掉。 */
export function sanitizeBlessings(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return out;
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    const def = blessingDef(id);
    if (def === null || typeof value !== 'number' || !Number.isFinite(value)) continue;
    const stars = Math.floor(value);
    if (stars <= 0) continue;
    out[id] = def.rare ? 1 : Math.min(MAX_STARS, stars);
  }
  return out;
}

/** 這一局三選一要給幾張（乾坤袋讓之後都變成四選一）。 */
export function offerSize(owned: BlessingMap): number {
  return hasBlessing(owned, 'bigBag') ? 4 : 3;
}
