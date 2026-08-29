import { describe, it, expect } from 'vitest';
import { BALANCE } from '../src/data';
import type { Card } from '../src/systems/deck';
import { cardDps, fieldDps } from '../src/systems/deck';
import {
  activeFormations,
  bonusForSlot,
  bonusesForField,
  formationEffect,
  formationName,
  formationRows,
} from '../src/systems/formation';
import { buildLoadoutFor } from '../src/systems/loadout';
import { SECTS } from '../src/data';

const sect = SECTS.find((item) => item.id === 'body');
if (sect === undefined) throw new Error('缺少測試用門派');
const loadout = buildLoadoutFor(sect, {}, 1);

const S = (tier: number): Card => ({ type: 'sword', tier });
const F = (tier: number): Card => ({ type: 'fan', tier });
const B = (tier: number): Card => ({ type: 'bolt', tier });
const A = (tier: number): Card => ({ type: 'flame', tier });

/** 六格＝兩列三欄；九格＝三列三欄。 */
function field6(cards: (Card | null)[]): (Card | null)[] {
  return [...cards, ...new Array<Card | null>(6 - cards.length).fill(null)].slice(0, 6);
}
function field9(cards: (Card | null)[]): (Card | null)[] {
  return [...cards, ...new Array<Card | null>(9 - cards.length).fill(null)].slice(0, 9);
}

describe('陣法', () => {
  it('格子的列數由格位總數與欄數推得', () => {
    expect(formationRows(6)).toBe(2);
    expect(formationRows(9)).toBe(3);
  });

  it('一整橫列都是不同種的符才成橫陣', () => {
    expect(activeFormations(field6([S(1), F(3), B(2)]))).toEqual([
      { kind: 'row', slots: [0, 1, 2] },
    ]);
    // 缺一格
    expect(activeFormations(field6([S(1), null, B(2)]))).toHaveLength(0);
    // 有兩張同種
    expect(activeFormations(field6([S(1), F(1), S(2)]))).toHaveLength(0);
  });

  it('全場鋪同一種符，一條陣都成不了——這是規則的重點', () => {
    // 第一版的條件是「同種連線」，全同色會同時吃到三橫三縱兩斜共八條陣，
    // 而同種本來就最好合成，湊同色變成純上位解。反過來要求不同種之後這條路直接斷掉。
    const mono = field9(Array.from({ length: 9 }, () => S(8)));
    expect(activeFormations(mono)).toHaveLength(0);
    expect(fieldDps(mono, loadout)).toBeCloseTo(cardDps(S(8), loadout) * 9, 4);
  });

  it('階數不影響成陣，只看種類', () => {
    const lines = activeFormations(field6([S(1), F(6), B(11)]));
    expect(lines).toHaveLength(1);
    expect(lines[0]?.kind).toBe('row');
  });

  it('六格的場上只有橫陣；縱陣與斜陣要把陣法擴充買到 3×3', () => {
    // 六格時直行只有兩格，湊「不同種」太容易，因此不算一條線。
    const six = field6([S(1), F(1), B(1), F(2), B(2), S(2)]);
    expect(activeFormations(six).every((line) => line.kind === 'row')).toBe(true);

    const nine = field9([
      S(1), F(1), B(1),
      F(2), B(2), S(2),
      B(3), S(3), F(3),
    ]);
    const kinds = activeFormations(nine).map((line) => line.kind);
    expect(kinds.filter((k) => k === 'row')).toHaveLength(3);
    expect(kinds.filter((k) => k === 'column')).toHaveLength(3);
  });

  it('對角線需要 3×3', () => {
    const nine = field9([
      S(1), F(1), B(1),
      F(2), B(2), S(2),
      B(3), S(3), F(3),
    ]);
    expect(activeFormations(nine).some((line) => line.kind === 'diagonal')).toBe(true);
  });

  it('橫陣加傷害、縱陣加出手速度', () => {
    const { formation } = BALANCE;
    const row = bonusForSlot(field6([S(1), F(1), B(1)]), 0);
    expect(row.damage).toBeCloseTo(1 + formation.rowDamage, 6);
    expect(row.fireRate).toBeCloseTo(1, 6);
  });

  it('同時落在橫陣與縱陣上的那一格，兩種加成相加', () => {
    const { formation } = BALANCE;
    const nine = field9([
      S(1), F(1), B(1),
      F(2), B(2), S(2),
      B(3), S(3), F(3),
    ]);
    const bonus = bonusesForField(nine)[1];
    expect(bonus?.damage).toBeCloseTo(1 + formation.rowDamage, 6);
    expect(bonus?.fireRate).toBeCloseTo(1 + formation.columnFireRate, 6);
  });

  it('正中央那一格同時在兩條斜線上，但斜陣加成只算一次', () => {
    const { formation } = BALANCE;
    // 兩條斜線都成立的排法：0,4,8 與 2,4,6 各自三種不同。
    const nine = field9([
      S(1), S(1), F(1),
      S(1), B(1), S(1),
      A(1), S(1), F(1),
    ]);
    const lines = activeFormations(nine).filter((line) => line.kind === 'diagonal');
    expect(lines).toHaveLength(2);
    const centre = bonusesForField(nine)[4];
    expect(centre?.damage).toBeCloseTo(1 + formation.diagonalDamage, 6);
  });

  it('單一格位吃到的加成上限，仍小於兩階的成長', () => {
    const { formation, field } = BALANCE;
    // 最壞情況：一格同時在橫陣、縱陣與（去重後的）一條斜陣上。
    const best = (1 + formation.rowDamage + formation.diagonalDamage) * (1 + formation.columnFireRate);
    expect(best).toBeLessThan(Math.pow(field.tierGrowth, 2));
    expect(formation.rowDamage).toBeLessThan(field.tierGrowth - 1);
    expect(formation.columnFireRate).toBeLessThan(field.tierGrowth - 1);
    expect(formation.diagonalDamage).toBeLessThan(field.tierGrowth - 1);
    expect(formation.diagonalDamage).toBeGreaterThan(formation.rowDamage);
  });

  it('成陣會反映在「道行」上，玩家排好的當下就看得到', () => {
    const plain = field6([S(1), S(1), S(1)]);
    const formed = field6([S(1), F(1), B(1)]);
    expect(activeFormations(plain)).toHaveLength(0);
    expect(fieldDps(formed, loadout)).toBeGreaterThan(fieldDps(plain, loadout) * 1.0);
  });

  it('每種陣法都有名稱與效果說明，供畫面顯示', () => {
    for (const kind of ['row', 'column', 'diagonal'] as const) {
      expect(formationName(kind).length).toBeGreaterThan(0);
      expect(formationEffect(kind)).toMatch(/\+\d+%/);
    }
  });
});
