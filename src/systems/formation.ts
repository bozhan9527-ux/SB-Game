/**
 * 陣法：場上的符排成一線時的加成。
 *
 * 本檔不 import Phaser，全部是純函式。
 *
 * 為什麼需要它：沒有陣法的話，六個陣位彼此完全可以互換——那個格子只是「放東西的地方」，
 * 玩家沒有任何理由在意哪一張放哪一格，畫面上的網格等於在說謊。
 *
 * 為什麼是「同種符」而不是「同階」：同階的兩張本來就該合成，
 * 用同階當條件等於在懲罰合成；用同種當條件才會形成真正的取捨——
 * 合成會空出一格、把線打斷，所以「現在合，還是先讓這一列成陣」是每次都要做的決定。
 */
import { BALANCE } from '../data';
import type { Card } from './deck';

export type FormationKind = 'row' | 'column' | 'diagonal';

export interface FormationLine {
  kind: FormationKind;
  /** 構成這一條線的陣位索引。 */
  slots: number[];
  /** 這一條線是哪一種符。 */
  type: string;
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

/** 名稱只用於畫面提示。 */
export function formationName(kind: FormationKind): string {
  if (kind === 'row') return '橫陣';
  if (kind === 'column') return '縱陣';
  return '斜陣';
}

export function formationEffect(kind: FormationKind): string {
  const { formation } = BALANCE;
  if (kind === 'row') return `傷害 +${Math.round(formation.rowDamage * 100)}%`;
  if (kind === 'column') return `出手 +${Math.round(formation.columnFireRate * 100)}%`;
  return `傷害 +${Math.round(formation.diagonalDamage * 100)}%`;
}

/** 一整條線都放了符、而且是同一種符，才算成陣。 */
function lineIsFormed(field: readonly (Card | null)[], slots: readonly number[]): string | null {
  const first = field[slots[0] ?? -1];
  if (first === undefined || first === null) return null;
  for (const slot of slots) {
    const card = field[slot];
    if (card === undefined || card === null || card.type !== first.type) return null;
  }
  return first.type;
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
    // 一格不成線；格位數不是欄數的整數倍時，最後一列會缺格，那一列也不成陣。
    if (slots.length < 2) return;
    if (slots.some((slot) => slot >= field.length)) return;
    const type = lineIsFormed(field, slots);
    if (type !== null) found.push({ kind, slots, type });
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
  const { formation } = BALANCE;
  let damage = 1;
  let fireRate = 1;
  for (const line of activeFormations(field)) {
    if (!line.slots.includes(slot)) continue;
    if (line.kind === 'row') damage += formation.rowDamage;
    else if (line.kind === 'column') fireRate += formation.columnFireRate;
    else damage += formation.diagonalDamage;
  }
  return { damage, fireRate };
}

/** 一次算完整個場上的加成，讓每一拍只走一次 activeFormations。 */
export function bonusesForField(field: readonly (Card | null)[]): FormationBonus[] {
  const { formation } = BALANCE;
  const bonuses: FormationBonus[] = field.map(() => ({ damage: 1, fireRate: 1 }));
  for (const line of activeFormations(field)) {
    for (const slot of line.slots) {
      const bonus = bonuses[slot];
      if (bonus === undefined) continue;
      if (line.kind === 'row') bonus.damage += formation.rowDamage;
      else if (line.kind === 'column') bonus.fireRate += formation.columnFireRate;
      else bonus.damage += formation.diagonalDamage;
    }
  }
  return bonuses;
}
