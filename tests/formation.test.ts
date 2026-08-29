import { describe, it, expect } from 'vitest';
import { BALANCE, CARDS } from '../src/data';
import type { Card } from '../src/systems/deck';
import { fieldDps } from '../src/systems/deck';
import {
  activeFormations,
  formationEffect,
  formationName,
  formationRows,
} from '../src/systems/formation';
import { bonusForSlot, boardBonuses } from '../src/systems/board';
import type { FormationKind, FormationPattern } from '../src/systems/formation';
import { buildLoadoutFor } from '../src/systems/loadout';
import { TALISMAN_SLOTS } from '../src/systems/talismans';
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

/** 整個場的平均加成（傷害×出手），用來比較不同排法的強弱。 */
function averageBonus(field: (Card | null)[]): number {
  const bonuses = boardBonuses(field);
  return bonuses.reduce((sum, bonus) => sum + bonus.damage * bonus.fireRate, 0) / bonuses.length;
}

/** 全同種：最好排的八條陣。 */
const MONO = field9(Array.from({ length: 9 }, () => S(1)));
/** 橫列各自同種、直行剛好三種不同：同樣八條，但橫縱吃到的階級不同。 */
const STRIPED = field9([
  S(1), S(1), S(1),
  F(1), F(1), F(1),
  B(1), B(1), B(1),
]);
/** 拉丁方：三橫三縱全不同種，主對角線也不同種——八條陣裡最強的一種。 */
const LATIN = field9([
  S(1), F(1), B(1),
  F(1), B(1), S(1),
  B(1), S(1), F(1),
]);

describe('陣法', () => {
  it('格子的列數由格位總數與欄數推得', () => {
    expect(formationRows(6)).toBe(2);
    expect(formationRows(9)).toBe(3);
  });

  it('一整橫列全同種或全不同種都成陣，夾雜的不算', () => {
    // 全不同種＝五行陣
    expect(activeFormations(field6([S(1), F(3), B(2)]))).toEqual([
      { kind: 'row', pattern: 'distinct', slots: [0, 1, 2] },
    ]);
    // 全同種＝同心陣
    expect(activeFormations(field6([S(1), S(3), S(2)]))).toEqual([
      { kind: 'row', pattern: 'same', slots: [0, 1, 2] },
    ]);
    // 兩同一異：唯一擺錯的方式
    expect(activeFormations(field6([S(1), F(1), S(2)]))).toHaveLength(0);
    // 缺一格
    expect(activeFormations(field6([S(1), null, B(2)]))).toHaveLength(0);
  });

  it('全場鋪同一種符會成滿八條，但那是八條裡最弱的一種', () => {
    // 只認同種時，同色是純上位解（好排又好合），取捨消失；
    // 只認不同種時，走同色流的玩家一條陣都吃不到，後期硬得過頭。
    // 兩種都認、但同心給得少，才同時保住「好上手」與「排得好有賞」。
    expect(activeFormations(MONO)).toHaveLength(8);
    expect(activeFormations(LATIN)).toHaveLength(8);
    expect(averageBonus(MONO)).toBeGreaterThan(1);
    expect(averageBonus(MONO)).toBeLessThan(averageBonus(STRIPED));
    expect(averageBonus(STRIPED)).toBeLessThan(averageBonus(LATIN));
  });

  it('階數不影響成陣，只看種類', () => {
    const lines = activeFormations(field6([S(1), F(6), B(11)]));
    expect(lines).toHaveLength(1);
    expect(lines[0]?.kind).toBe('row');
    expect(activeFormations(field6([S(1), S(6), S(11)]))[0]?.pattern).toBe('same');
  });

  it('六格的場上只有橫陣；縱陣與斜陣要把陣法擴充買到 3×3', () => {
    // 六格時直行只有兩格，湊「不同種」太容易，因此不算一條線。
    const six = field6([S(1), F(1), B(1), F(2), B(2), S(2)]);
    expect(activeFormations(six).every((line) => line.kind === 'row')).toBe(true);

    const kinds = activeFormations(LATIN).map((line) => line.kind);
    expect(kinds.filter((k) => k === 'row')).toHaveLength(3);
    expect(kinds.filter((k) => k === 'column')).toHaveLength(3);
  });

  it('對角線需要 3×3', () => {
    expect(activeFormations(LATIN).some((line) => line.kind === 'diagonal')).toBe(true);
  });

  it('橫陣加傷害、縱陣加出手速度，同心與五行吃的是不同的量', () => {
    const { formation } = BALANCE;
    const distinct = bonusForSlot(field6([S(1), F(1), B(1)]), 0);
    expect(distinct.damage).toBeCloseTo(1 + formation.distinct.rowDamage, 6);
    expect(distinct.fireRate).toBeCloseTo(1, 6);

    const same = bonusForSlot(field6([S(1), S(1), S(1)]), 0);
    expect(same.damage).toBeCloseTo(1 + formation.same.rowDamage, 6);
    expect(same.damage).toBeLessThan(distinct.damage);
  });

  it('同時落在橫陣與縱陣上的那一格，兩種加成相加', () => {
    const { formation } = BALANCE;
    const bonus = boardBonuses(LATIN)[1];
    expect(bonus?.damage).toBeCloseTo(1 + formation.distinct.rowDamage, 6);
    expect(bonus?.fireRate).toBeCloseTo(1 + formation.distinct.columnFireRate, 6);
  });

  it('橫同心、縱五行可以並存於同一格——不強迫玩家選一條路', () => {
    const { formation } = BALANCE;
    const bonus = boardBonuses(STRIPED)[1];
    expect(bonus?.damage).toBeCloseTo(1 + formation.same.rowDamage, 6);
    expect(bonus?.fireRate).toBeCloseTo(1 + formation.distinct.columnFireRate, 6);
  });

  it('正中央那一格同時在兩條斜線上，但斜陣加成只算一次', () => {
    const { formation } = BALANCE;
    // 兩條斜線都成立：0,4,8 三種不同，2,4,6 也三種不同。
    const nine = field9([
      S(1), S(1), F(1),
      S(1), B(1), S(1),
      A(1), S(1), F(1),
    ]);
    const lines = activeFormations(nine).filter((line) => line.kind === 'diagonal');
    expect(lines).toHaveLength(2);
    const centre = boardBonuses(nine)[4];
    expect(centre?.damage).toBeCloseTo(1 + formation.distinct.diagonalDamage, 6);
  });

  it('同心給得比五行少，但兩者都比不上一階的成長', () => {
    const { formation, field } = BALANCE;
    for (const tier of [formation.same, formation.distinct]) {
      expect(tier.rowDamage).toBeLessThan(field.tierGrowth - 1);
      expect(tier.columnFireRate).toBeLessThan(field.tierGrowth - 1);
      expect(tier.diagonalDamage).toBeLessThan(field.tierGrowth - 1);
      // 斜陣最難排，所以給得比橫縱多。
      expect(tier.diagonalDamage).toBeGreaterThan(tier.rowDamage);
    }
    expect(formation.same.rowDamage).toBeLessThan(formation.distinct.rowDamage);
    expect(formation.same.columnFireRate).toBeLessThan(formation.distinct.columnFireRate);
    expect(formation.same.diagonalDamage).toBeLessThan(formation.distinct.diagonalDamage);
  });

  it('單一格位吃到的加成上限，仍小於兩階的成長', () => {
    const { formation, field } = BALANCE;
    // 最壞情況：一格同時在（五行的）橫陣、縱陣與去重後的一條斜陣上。
    const tier = formation.distinct;
    const best = (1 + tier.rowDamage + tier.diagonalDamage) * (1 + tier.columnFireRate);
    expect(best).toBeLessThan(Math.pow(field.tierGrowth, 2));
    // 實際擺得出來的最高單格，也要在這條線以下。
    const peak = Math.max(...boardBonuses(LATIN).map((b) => b.damage * b.fireRate));
    expect(peak).toBeLessThanOrEqual(best);
  });

  it('成陣會反映在「道行」上，玩家排好的當下就看得到', () => {
    const plain = field6([S(1), F(1), S(1)]);
    const formed = field6([S(1), F(1), B(1)]);
    expect(activeFormations(plain)).toHaveLength(0);
    expect(fieldDps(formed, loadout)).toBeGreaterThan(fieldDps(plain, loadout));
  });

  it('3×3 八條陣湊得到，但只有 0.18% 的擺法做得到', () => {
    // 天花板是在「場上只有四種符」的前提下算的——那正是一副符籙配置帶的張數，
    // 不是符籙譜的總數（二十張）。窮舉 4^9 把上限釘住。
    // 日後改動 TALISMAN_SLOTS 或成陣規則時，這條會失敗並提醒重算天花板。
    expect(TALISMAN_SLOTS, '一場帶的符數變了，陣法的天花板要重算').toBe(4);
    const types = CARDS.slice(0, TALISMAN_SLOTS).map((card) => card.id);

    let best = 0;
    let perfect = 0;
    let total = 0;
    const grid: (Card | null)[] = new Array<Card | null>(9).fill(null);
    const walk = (index: number): void => {
      if (index === 9) {
        total += 1;
        const count = activeFormations(grid).length;
        best = Math.max(best, count);
        if (count === 8) perfect += 1;
        return;
      }
      for (const type of types) {
        grid[index] = { type, tier: 1 };
        walk(index + 1);
      }
    };
    walk(0);
    expect(best, '陣法上限變了').toBe(8);
    expect(total).toBe(TALISMAN_SLOTS ** 9);
    expect(perfect, '滿陣的擺法數變了').toBe(484);
    expect(perfect / total).toBeLessThan(0.002);
  });

  it('排到最滿時全場的加成上限，仍在一階與兩階的成長之間', () => {
    const step = BALANCE.field.tierGrowth;
    // 拉丁方是八條陣裡最強的排法，而且要在合成不斷把符換掉的情況下維持住——
    // 這是技巧上限，不是隨手就有的。
    const bonuses = boardBonuses(LATIN);
    const average =
      bonuses.reduce((sum, bonus) => sum + bonus.damage * bonus.fireRate, 0) / bonuses.length;
    const peak = Math.max(...bonuses.map((bonus) => bonus.damage * bonus.fireRate));
    expect(average).toBeGreaterThan(step - 0.05);
    expect(average).toBeLessThan(step * step);
    expect(peak).toBeLessThan(step * step);
    // 最好排的同色流也要有感，否則等於沒放開。
    expect(averageBonus(MONO)).toBeGreaterThan(1.3);
  });

  it('每種陣法都有名稱與效果說明，供畫面顯示', () => {
    const kinds: FormationKind[] = ['row', 'column', 'diagonal'];
    const patterns: FormationPattern[] = ['same', 'distinct'];
    const names = new Set<string>();
    for (const kind of kinds) {
      for (const pattern of patterns) {
        const line = { kind, pattern, slots: [0, 1, 2] };
        names.add(formationName(line));
        expect(formationName(line).length).toBeGreaterThan(0);
        expect(formationEffect(line)).toMatch(/\+\d+%/);
      }
    }
    // 六種組合各有各的名字，玩家看得出剛剛成的是哪一種。
    expect(names.size).toBe(6);
  });
});
