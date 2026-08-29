/**
 * 陣法：場上的符排成一線時的加成。
 *
 * 本檔不 import Phaser，全部是純函式。
 *
 * 為什麼需要它：沒有陣法的話，六個陣位彼此完全可以互換——那個格子只是「放東西的地方」，
 * 玩家沒有任何理由在意哪一張放哪一格，畫面上的網格等於在說謊。
 *
 * 為什麼條件是「一整條線都**不同種**」：
 *
 * 第一版寫成「同種連線」，結果全場鋪同一種符會同時吃到三橫、三縱、兩斜共八條陣，
 * 而同種本來就最好合成——湊同色是純上位解，完全沒有取捨可言。
 *
 * 反過來要求「線上每一張都不同種」之後，兩件事直接對立：
 * **合成需要湊同種，結陣需要湊不同種**。全場同色的陣法數是零。
 * 玩家因此得決定哪幾格拿來排陣、哪幾格（與手牌）拿來養合成，這才是真的取捨。
 * 設定上也說得通：陣法本就要五行俱全，清一色成不了陣。
 */
import { BALANCE } from '../data';
import type { Card } from './deck';

export type FormationKind = 'row' | 'column' | 'diagonal';

export interface FormationLine {
  kind: FormationKind;
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

/** 一整條線都放了符、而且彼此都不同種，才算成陣。 */
function lineIsFormed(field: readonly (Card | null)[], slots: readonly number[]): boolean {
  const seen = new Set<string>();
  for (const slot of slots) {
    const card = field[slot];
    if (card === undefined || card === null) return false;
    if (seen.has(card.type)) return false;
    seen.add(card.type);
  }
  return true;
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
    if (lineIsFormed(field, slots)) found.push({ kind, slots });
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
    for (const slot of line.slots) {
      const bonus = bonuses[slot];
      if (bonus === undefined) continue;
      if (line.kind === 'row') bonus.damage += formation.rowDamage;
      else if (line.kind === 'column') bonus.fireRate += formation.columnFireRate;
      else if (!diagonalCounted.has(slot)) {
        diagonalCounted.add(slot);
        bonus.damage += formation.diagonalDamage;
      }
    }
  }
  return bonuses;
}
