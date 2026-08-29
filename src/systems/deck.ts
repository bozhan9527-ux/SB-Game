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
import { BALANCE, CARDS, REALMS } from '../data';
import type { CardDef } from '../data/types';
import type { Loadout } from './loadout';
import type { Rng } from './rng';
import { NO_SLOT_BONUS, boardBonuses } from './board';

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

/** 飛升境（最後一個境界）從第幾關開始。資料驅動，不寫死 82。 */
function ascensionStart(): number {
  return REALMS[REALMS.length - 1]?.stageFrom ?? Number.POSITIVE_INFINITY;
}

/**
 * 該關卡的法寶階數上限。第 1–81 關每 stagesPerTier 關 +1，飛升境改用較快的節奏。
 *
 * 為什麼飛升境要換節奏：長期難度是兩條指數在賽跑——傷害上限每 3 關 ×1.35，
 * 血量每關 ×1.148（3 關 ×1.513）。淨值 ×0.892，每三關玩家掉 10.8% 相對戰力，
 * 複利下去必然撞牆。詳見 FieldBalance.ascendStagesPerTier 的說明。
 *
 * 取兩條的較大值，是為了保證**不會有任何一關的上限比舊規則低**——
 * 換節奏若讓某幾關倒退，玩家看到的是「越推越弱」，那比撞牆更糟。
 */
export function maxTierForStage(stage: number): number {
  const { field } = BALANCE;
  const current = Math.max(1, stage);
  const steady = field.maxTierBase + Math.floor((current - 1) / field.stagesPerTier);
  const start = ascensionStart();
  if (current < start) return steady;
  const atStart = field.maxTierBase + Math.floor((start - 2) / field.stagesPerTier);
  const ascended = atStart + Math.floor((current - start + 1) / field.ascendStagesPerTier);
  return Math.max(steady, ascended);
}

/** 抽到的符大約落在上限往下數幾階，偶爾多一階。 */
export function drawTierForStage(stage: number, rng: Rng): number {
  const { field } = BALANCE;
  const base = Math.max(1, maxTierForStage(stage) - field.drawTierBelowMax);
  const bonus = rng.next() < field.drawTierBonusChance ? 1 : 0;
  return Math.min(maxTierForStage(stage), base + bonus);
}

/**
 * 抽一張符。**抽符池就是這一場帶的四張**，不是全部二十張。
 *
 * 這是符籙系統最要緊的一條：池子若含全部二十種，同一種要湊到第二張的機率剩二十分之一，
 * 合成——遊戲唯一的指數成長來源——會直接停擺。帶四張既保住合成，
 * 也正好對上 3×3 陣法天花板的推導前提。
 */
export function drawCard(loadout: Loadout, stage: number, rng: Rng): Card {
  const def = rng.pickWeighted(loadout.talismans, (card) => card.weight);
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
 * 只用於顯示與比較，而且**刻意不把特效算進去**：溢傷、減速、灼燒、暴擊、
 * 對首領加成這些東西的價值全看戰場長什麼樣，硬折成一個數字只會騙人
 * （天雷符一擊 40 打 20 血的妖會浪費一半，這裡也看不出來）。
 * 特效在選符畫面用文字列出，讓玩家自己判斷——那正是「帶哪四張」的樂趣所在。
 */
export function cardDps(card: Card, loadout: Loadout): number {
  const def = cardDef(card.type);
  return (cardDamage(card, loadout) * def.targets * 1000) / cardInterval(card, loadout);
}

/**
 * 場上所有符的理論總輸出，用於 HUD 的「道行」。
 *
 * 陣法加成算在裡面——玩家把一列排成同種符時，這個數字要立刻跳，
 * 不然他不會知道剛剛那一下有沒有用。
 */
export function fieldDps(field: readonly (Card | null)[], loadout: Loadout): number {
  const bonuses = boardBonuses(field);
  let total = 0;
  for (let i = 0; i < field.length; i += 1) {
    const card = field[i];
    if (card === undefined || card === null) continue;
    const bonus = bonuses[i] ?? NO_SLOT_BONUS;
    total += cardDps(card, loadout) * bonus.damage * bonus.fireRate;
  }
  return total;
}
