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

  it('一整橫列同種符才成橫陣，缺一格或混了別種都不算', () => {
    expect(activeFormations(field6([S(1), S(3), S(2)]))).toEqual([
      { kind: 'row', slots: [0, 1, 2], type: 'sword' },
    ]);
    // 缺一格
    expect(activeFormations(field6([S(1), null, S(2)]))).toHaveLength(0);
    // 混了別種
    expect(activeFormations(field6([S(1), F(1), S(2)]))).toHaveLength(0);
  });

  it('階數不必相同——同階本來就該合成，用同階當條件等於在懲罰合成', () => {
    const lines = activeFormations(field6([S(1), S(6), S(11)]));
    expect(lines).toHaveLength(1);
    expect(lines[0]?.kind).toBe('row');
  });

  it('一整直行同種符成縱陣', () => {
    const lines = activeFormations(field6([S(1), null, null, S(2), null, null]));
    expect(lines).toEqual([{ kind: 'column', slots: [0, 3], type: 'sword' }]);
  });

  it('對角線需要 3×3，六格時不成立', () => {
    const nine = field9([S(1), null, null, null, S(2), null, null, null, S(3)]);
    expect(activeFormations(nine)).toEqual([
      { kind: 'diagonal', slots: [0, 4, 8], type: 'sword' },
    ]);
    // 同樣的擺法在六格的場上沒有對角線可言。
    expect(activeFormations(field6([S(1), null, null, null, S(2), null]))).toHaveLength(0);
  });

  it('橫陣加傷害、縱陣加出手速度、斜陣加傷害', () => {
    const { formation } = BALANCE;
    const row = bonusForSlot(field6([S(1), S(1), S(1)]), 0);
    expect(row.damage).toBeCloseTo(1 + formation.rowDamage, 6);
    expect(row.fireRate).toBeCloseTo(1, 6);

    const column = bonusForSlot(field6([S(1), null, null, S(1), null, null]), 0);
    expect(column.fireRate).toBeCloseTo(1 + formation.columnFireRate, 6);
    expect(column.damage).toBeCloseTo(1, 6);
  });

  it('同時落在橫陣與縱陣上的那一格，兩種加成相加', () => {
    // 上下兩列都是劍陣符：兩條橫陣 + 三條縱陣，每一格都吃到十字加成。
    const { formation } = BALANCE;
    const cross = field6([S(1), S(2), S(3), S(4), S(5), S(6)]);
    const lines = activeFormations(cross);
    expect(lines.filter((line) => line.kind === 'row')).toHaveLength(2);
    expect(lines.filter((line) => line.kind === 'column')).toHaveLength(3);

    const bonus = bonusesForField(cross)[0];
    expect(bonus?.damage).toBeCloseTo(1 + formation.rowDamage, 6);
    expect(bonus?.fireRate).toBeCloseTo(1 + formation.columnFireRate, 6);
  });

  it('成陣會反映在「道行」上，玩家排好的當下就看得到', () => {
    const plain = field6([S(1), F(1), S(1)]);
    const formed = field6([S(1), S(1), S(1)]);
    expect(fieldDps(formed, loadout)).toBeGreaterThan(
      cardDps(S(1), loadout) * 3 * 0.999,
    );
    // 同樣三張、只差在有沒有成陣。
    const plainTotal = cardDps(S(1), loadout) * 2 + cardDps(F(1), loadout);
    expect(fieldDps(plain, loadout)).toBeCloseTo(plainTotal, 6);
    expect(fieldDps(formed, loadout)).toBeGreaterThan(cardDps(S(1), loadout) * 3);
  });

  it('每一種陣法都比一階的成長小，才不會逼玩家為了排陣而不敢合成', () => {
    const { formation, field } = BALANCE;
    const step = field.tierGrowth - 1;
    expect(formation.rowDamage).toBeLessThan(step);
    expect(formation.columnFireRate).toBeLessThan(step);
    expect(formation.diagonalDamage).toBeLessThan(step);
    // 越難排的陣，給得越多：斜陣要 3×3（陣法擴充買滿）才排得出來。
    expect(formation.diagonalDamage).toBeGreaterThan(formation.rowDamage);
  });

  it('每種陣法都有名稱與效果說明，供畫面顯示', () => {
    for (const kind of ['row', 'column', 'diagonal'] as const) {
      expect(formationName(kind).length).toBeGreaterThan(0);
      expect(formationEffect(kind)).toMatch(/\+\d+%/);
    }
  });
});
