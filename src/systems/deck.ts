/**
 * 法寶符牌：階數、傷害、合成規則。
 *
 * 本檔不 import Phaser，全部是純函式，好處是可以在 node 測試環境直接驗算。
 *
 * 設計上最關鍵的一條：**階數上限隨關卡成長**（每 `stagesPerTier` 關 +1）。
 * 合成是 2 倍成長，因此上限每 +1 就把玩家的輸出天花板乘上 tierGrowth——
 * 這是整個遊戲唯一的指數成長來源。若上限固定，長期難度（同樣是指數）就永遠追不上，
 * 這正是舊版升級系統失效的原因（見 PROGRESS 的 L-05）。
 */
import { BALANCE, CARDS } from '../data';
import type { CardDef } from '../data/types';
import type { Loadout } from './loadout';
import type { Rng } from './rng';

export interface Card {
  /** 對應 cards.json 的 id。 */
  type: string;
  /** 階數，從 1 起算。 */
  tier: number;
}

export function cardDef(type: string): CardDef {
  const def = CARDS.find((card) => card.id === type);
  if (def === undefined) throw new Error(`不存在的法寶符：${type}`);
  return def;
}

/** 該關卡的法寶階數上限。每 stagesPerTier 關 +1。 */
export function maxTierForStage(stage: number): number {
  const { field } = BALANCE;
  return field.maxTierBase + Math.floor((Math.max(1, stage) - 1) / field.stagesPerTier);
}

/** 抽到的符大約落在上限往下數幾階，偶爾多一階。 */
export function drawTierForStage(stage: number, rng: Rng): number {
  const { field } = BALANCE;
  const base = Math.max(1, maxTierForStage(stage) - field.drawTierBelowMax);
  const bonus = rng.next() < field.drawTierBonusChance ? 1 : 0;
  return Math.min(maxTierForStage(stage), base + bonus);
}

export function drawCard(stage: number, rng: Rng): Card {
  const def = rng.pickWeighted(CARDS, (card) => card.weight);
  return { type: def.id, tier: drawTierForStage(stage, rng) };
}

/** 兩張符能不能合：同一種符、同一階，且還沒到這一關的上限。 */
export function canMerge(a: Card, b: Card, stage: number): boolean {
  return a.type === b.type && a.tier === b.tier && a.tier < maxTierForStage(stage);
}

export function mergedCard(a: Card): Card {
  return { type: a.type, tier: a.tier + 1 };
}

/** 一張符每一道的傷害。 */
export function cardDamage(card: Card, loadout: Loadout): number {
  const def = cardDef(card.type);
  const favored = card.type === loadout.sect.favoredCard ? loadout.sect.favoredDamageMultiplier : 1;
  return (
    def.damage *
    Math.pow(BALANCE.field.tierGrowth, card.tier - 1) *
    loadout.damageMultiplier *
    favored *
    (1 + loadout.realmPowerBonus)
  );
}

/** 一張符的出手間隔（御器訣越高越快）。 */
export function cardInterval(card: Card, loadout: Loadout): number {
  return cardDef(card.type).intervalMs / loadout.fireRateMultiplier;
}

/**
 * 一張符的理論每秒傷害。
 *
 * 只用於顯示與比較：實戰中打小妖會有溢傷（天雷符一擊 40 打 20 血的妖會浪費一半），
 * 因此天雷符的實際效率會低於這個數字，而風刃符高於它。這正是四種符的取捨所在。
 */
export function cardDps(card: Card, loadout: Loadout): number {
  const def = cardDef(card.type);
  return (cardDamage(card, loadout) * def.targets * 1000) / cardInterval(card, loadout);
}

/** 場上所有符的理論總輸出，用於 HUD 的「道行」。 */
export function fieldDps(field: readonly (Card | null)[], loadout: Loadout): number {
  let total = 0;
  for (const card of field) if (card !== null) total += cardDps(card, loadout);
  return total;
}
