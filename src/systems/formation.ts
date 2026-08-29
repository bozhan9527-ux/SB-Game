/**
 * 陣法：場上的符排成一線時的加成。
 *
 * 本檔不 import Phaser，全部是純函式。
 *
 * 為什麼需要它：沒有陣法的話，六個陣位彼此完全可以互換——那個格子只是「放東西的地方」，
 * 玩家沒有任何理由在意哪一張放哪一格，畫面上的網格等於在說謊。
 *
 * 一條線有兩種成陣方式，效果不同：
 *
 * - **同心陣**：三張都是同一種符。好排，而且同種本來就好合成，所以給得少。
 * - **五行陣**：三張都不同種。難排，而且和合成互相牽制（合成要湊同種），所以給得多。
 *
 * 混在一起（兩同一異）什麼都不算——這是唯一「白放」的情況，
 * 所以擺放仍然要想，但兩種自然的打法都有回報，不會逼玩家只能走一條路。
 *
 * 走過的兩個極端都不好：
 * 只認同種時，同色是純上位解（好排又好合），取捨消失；
 * 只認異種時，走同色流的玩家一條陣都吃不到，後期硬得過頭。
 * 兩種都認、但給不同的量，才同時保住「好上手」與「排得好有賞」。
 */
import { BALANCE } from '../data';
import type { FormationTierBalance } from '../data/types';
import type { Card } from './deck';

export type FormationKind = 'row' | 'column' | 'diagonal';
/** same＝三張同種（同心陣）；distinct＝三張皆不同種（五行陣）。 */
export type FormationPattern = 'same' | 'distinct';

export interface FormationLine {
  kind: FormationKind;
  pattern: FormationPattern;
  /** 構成這一條線的陣位索引。 */
  slots: number[];
}

export interface FormationBonus {
  /** 傷害倍率，1 為無加成。 */
  damage: number;
  /** 出手速度倍率，1 為無加成。 */
  fireRate: number;
}

export const NO_BONUS: FormationBonus = { damage: 1, fireRate: 1 };

export function formationColumns(): number {
  return Math.max(1, Math.round(BALANCE.formation.columns));
}

export function formationRows(slots: number): number {
  return Math.ceil(slots / formationColumns());
}

export function patternName(pattern: FormationPattern): string {
  return pattern === 'same' ? '同心' : '五行';
}

/** 名稱只用於畫面提示，例如「五行橫陣」。 */
export function formationName(line: FormationLine): string {
  const direction = line.kind === 'row' ? '橫陣' : line.kind === 'column' ? '縱陣' : '斜陣';
  return `${patternName(line.pattern)}${direction}`;
}

export function tierOf(pattern: FormationPattern): FormationTierBalance {
  return pattern === 'same' ? BALANCE.formation.same : BALANCE.formation.distinct;
}

export function formationEffect(line: FormationLine): string {
  const tier = tierOf(line.pattern);
  if (line.kind === 'row') return `傷害 +${Math.round(tier.rowDamage * 100)}%`;
  if (line.kind === 'column') return `出手 +${Math.round(tier.columnFireRate * 100)}%`;
  return `傷害 +${Math.round(tier.diagonalDamage * 100)}%`;
}

/**
 * 一整條線都放了符，而且「全部同種」或「全部不同種」，才算成陣。
 * 兩同一異這種夾雜的情況什麼都不算——那是唯一擺錯的方式。
 */
function patternOf(
  field: readonly (Card | null)[],
  slots: readonly number[],
): FormationPattern | null {
  const types: string[] = [];
  for (const slot of slots) {
    const card = field[slot];
    if (card === undefined || card === null) return null;
    types.push(card.type);
  }
  const unique = new Set(types).size;
  if (unique === 1) return 'same';
  if (unique === types.length) return 'distinct';
  return null;
}

/**
 * 目前成立的所有陣法。
 *
 * 對角線需要正方形的格子（3×3，也就是「陣法擴充」買滿），因此它同時是那條升級線的獎勵。
 */
export function activeFormations(field: readonly (Card | null)[]): FormationLine[] {
  const columns = formationColumns();
  const rows = formationRows(field.length);
  const found: FormationLine[] = [];

  const push = (kind: FormationKind, slots: number[]): void => {
    // 一條線一律要滿 columns 格才算數：兩格的「不同種」太容易湊到，等於白送。
    // 因此六格的場上只有兩條橫陣，要有縱陣與斜陣得先把陣法擴充買起來。
    if (slots.length !== columns) return;
    if (slots.some((slot) => slot >= field.length)) return;
    const pattern = patternOf(field, slots);
    if (pattern !== null) found.push({ kind, pattern, slots });
  };

  for (let row = 0; row < rows; row += 1) {
    push('row', Array.from({ length: columns }, (_, col) => row * columns + col));
  }
  for (let col = 0; col < columns; col += 1) {
    push('column', Array.from({ length: rows }, (_, row) => row * columns + col));
  }
  if (rows === columns && rows >= 3) {
    push('diagonal', Array.from({ length: rows }, (_, i) => i * columns + i));
    push('diagonal', Array.from({ length: rows }, (_, i) => i * columns + (columns - 1 - i)));
  }
  return found;
}

/**
 * 單一陣位吃到的加成。同時落在橫陣與縱陣上時兩者相加（十字），這是排陣的最高獎勵。
 */
export function bonusForSlot(field: readonly (Card | null)[], slot: number): FormationBonus {
  return bonusesForField(field)[slot] ?? { damage: 1, fireRate: 1 };
}

/**
 * 一次算完整個場上的加成，讓每一拍只走一次 activeFormations。
 *
 * 每一格至多各吃一次橫、縱、斜。橫與縱本來就不會重複，但正中央那一格同時在兩條斜線上，
 * 不去重的話它會拿到雙倍斜陣加成——單一格位的上限必須是可預期的。
 */
export function bonusesForField(field: readonly (Card | null)[]): FormationBonus[] {
  const { formation } = BALANCE;
  const bonuses: FormationBonus[] = field.map(() => ({ damage: 1, fireRate: 1 }));
  const diagonalCounted = new Set<number>();
  for (const line of activeFormations(field)) {
    const tier = line.pattern === 'same' ? formation.same : formation.distinct;
    for (const slot of line.slots) {
      const bonus = bonuses[slot];
      if (bonus === undefined) continue;
      if (line.kind === 'row') bonus.damage += tier.rowDamage;
      else if (line.kind === 'column') bonus.fireRate += tier.columnFireRate;
      else if (!diagonalCounted.has(slot)) {
        diagonalCounted.add(slot);
        bonus.damage += tier.diagonalDamage;
      }
    }
  }
  return bonuses;
}
