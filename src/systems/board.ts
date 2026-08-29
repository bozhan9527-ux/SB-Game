/**
 * 場上的總加成：陣法（連線）＋ 光環（相鄰格）＋ 在場被動（全場）。
 *
 * 本檔不 import Phaser，全部是純函式。
 *
 * 為什麼要有這一層而不是各自為政：一個陣位最後的傷害倍率是好幾個來源相乘相加出來的，
 * 若「HUD 顯示的每秒輸出」與「實際開火」各算各的，玩家看到的數字就是假的。
 * 這裡算一次，deck.fieldDps（顯示）與 defense.tickCombat（實戰）都用它。
 *
 * 三個來源的疊法是刻意分開的：
 * - **陣法**先加總，再乘上該格自己的 formationMultiplier（大衍符）
 * - **光環**是相鄰四格給的，直接加在陣法之後——所以它不會被大衍符放大
 * - **在場被動**（金幣／抽符／回耐久）不看格位，只看那張符有沒有在場上
 *
 * 若光環也被大衍符放大，「引靈符＋大衍符擺一起」會變成兩個乘區互撐的唯一解；
 * 分開之後兩者都值得帶，但誰也吃不掉誰。
 */
import { BALANCE } from '../data';
import type { CardDef } from '../data/types';
import { cardDef } from './deck';
import type { Card } from './deck';
import { activeFormations, formationColumns, tierOf } from './formation';

export interface SlotBonus {
  /** 傷害倍率，1 為無加成。 */
  damage: number;
  /** 出手速度倍率，1 為無加成。 */
  fireRate: number;
}

export const NO_SLOT_BONUS: SlotBonus = { damage: 1, fireRate: 1 };

/** 只要符還在場上就生效的加成，與擺在哪一格無關。 */
export interface FieldPassives {
  /** 金幣倍率，1 為無加成。 */
  goldMultiplier: number;
  /** 抽符速度倍率，1 為無加成。 */
  drawSpeedMultiplier: number;
  /** 每次斬殺回復一名弟子的機率，已取上限。 */
  repairChance: number;
}

export const NO_PASSIVES: FieldPassives = {
  goldMultiplier: 1,
  drawSpeedMultiplier: 1,
  repairChance: 0,
};

/**
 * 上下左右四格。刻意不含斜角：斜角相鄰的話，3×3 的正中央會照顧到全部八格，
 * 「擺中間」就變成唯一解，位置的選擇又消失了（這正是陣法一開始踩過的坑）。
 */
export function neighboursOf(slot: number, slotCount: number): number[] {
  const columns = formationColumns();
  const rows = Math.ceil(slotCount / columns);
  const row = Math.floor(slot / columns);
  const col = slot % columns;
  const found: number[] = [];
  if (col > 0) found.push(slot - 1);
  if (col < columns - 1) found.push(slot + 1);
  if (row > 0) found.push(slot - columns);
  if (row < rows - 1) found.push(slot + columns);
  return found.filter((index) => index >= 0 && index < slotCount);
}

/**
 * 一次算完整個場上每一格的加成。
 *
 * 每一格至多各吃一次橫、縱、斜。橫與縱本來就不會重複，但正中央那一格同時在兩條斜線上，
 * 不去重的話它會拿到雙倍斜陣加成——單一格位的上限必須是可預期的。
 */
export function boardBonuses(field: readonly (Card | null)[]): SlotBonus[] {
  const count = field.length;
  // 先把陣法的加成分開累積，因為它要整包乘上該格的 formationMultiplier。
  const formationDamage = new Array<number>(count).fill(0);
  const formationFireRate = new Array<number>(count).fill(0);
  const diagonalCounted = new Set<number>();

  for (const line of activeFormations(field)) {
    const tier = tierOf(line.pattern);
    for (const slot of line.slots) {
      if (slot >= count) continue;
      if (line.kind === 'row') formationDamage[slot] = (formationDamage[slot] ?? 0) + tier.rowDamage;
      else if (line.kind === 'column') {
        formationFireRate[slot] = (formationFireRate[slot] ?? 0) + tier.columnFireRate;
      } else if (!diagonalCounted.has(slot)) {
        diagonalCounted.add(slot);
        formationDamage[slot] = (formationDamage[slot] ?? 0) + tier.diagonalDamage;
      }
    }
  }

  // 光環由相鄰四格提供，可以來自好幾張符，直接相加。
  const auraDamage = new Array<number>(count).fill(0);
  const auraFireRate = new Array<number>(count).fill(0);
  for (let slot = 0; slot < count; slot += 1) {
    const card = field[slot];
    if (card === undefined || card === null) continue;
    const { effect } = cardDef(card.type);
    if (effect.auraDamage === 0 && effect.auraFireRate === 0) continue;
    for (const neighbour of neighboursOf(slot, count)) {
      auraDamage[neighbour] = (auraDamage[neighbour] ?? 0) + effect.auraDamage;
      auraFireRate[neighbour] = (auraFireRate[neighbour] ?? 0) + effect.auraFireRate;
    }
  }

  const bonuses: SlotBonus[] = [];
  for (let slot = 0; slot < count; slot += 1) {
    const card = field[slot];
    const multiplier = card === undefined || card === null
      ? 1
      : cardDef(card.type).effect.formationMultiplier;
    bonuses.push({
      damage: 1 + (formationDamage[slot] ?? 0) * multiplier + (auraDamage[slot] ?? 0),
      fireRate: 1 + (formationFireRate[slot] ?? 0) * multiplier + (auraFireRate[slot] ?? 0),
    });
  }
  return bonuses;
}

/** 單一格位吃到的加成。 */
export function bonusForSlot(field: readonly (Card | null)[], slot: number): SlotBonus {
  return boardBonuses(field)[slot] ?? { ...NO_SLOT_BONUS };
}

/**
 * 全場的在場被動。
 *
 * 同一種符放兩張會加兩次——那是刻意的，「整場鋪招財符」本來就該是一種可行的打法，
 * 代價是輸出全交出去了。回耐久的機率設上限，避免疊到「怎麼漏都不會死」。
 */
export function fieldPassives(field: readonly (Card | null)[]): FieldPassives {
  let gold = 0;
  let draw = 0;
  let repair = 0;
  for (const card of field) {
    if (card === undefined || card === null) continue;
    const { effect } = cardDef(card.type);
    gold += effect.goldBonus;
    draw += effect.drawSpeedBonus;
    repair += effect.repairChance;
  }
  return {
    goldMultiplier: 1 + gold,
    drawSpeedMultiplier: 1 + draw,
    repairChance: Math.min(BALANCE.field.maxRepairChance, repair),
  };
}

/** 帶進場的四張符裡，有沒有哪一張帶了某一項特效——選符畫面用來標記組合。 */
export function poolHasEffect(
  pool: readonly CardDef[],
  pick: (def: CardDef) => number | boolean,
): boolean {
  return pool.some((def) => {
    const value = pick(def);
    return typeof value === 'boolean' ? value : value !== 0;
  });
}
