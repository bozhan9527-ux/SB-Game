import { describe, it, expect } from 'vitest';
import { BALANCE, CARDS, REALMS, SECTS, UPGRADES, parseCards, parseRealms, parseUpgrades } from '../src/data';
import { DataError } from '../src/data/validate';
import { realmForStage, realmIndexForStage, realmTitle } from '../src/systems/realms';

describe('資料檔驗證（TECH_SPEC 第 3 節）', () => {
  it('境界涵蓋第 1 關起的所有關卡且不重疊', () => {
    for (let stage = 1; stage <= 40; stage += 1) {
      const realm = realmForStage(stage);
      expect(realm).toBeDefined();
      expect(REALMS.filter((r) => stage >= r.stageFrom && stage <= r.stageTo).length).toBeLessThanOrEqual(1);
    }
  });

  it('境界順序符合修仙設定：煉氣 → 築基 → 金丹 → 元嬰', () => {
    expect(REALMS.map((r) => r.name).slice(0, 4)).toEqual(['煉氣期', '築基期', '金丹期', '元嬰期']);
    expect(REALMS[REALMS.length - 1]?.name).toBe('飛升境');
  });

  it('境界壓制隨境界遞增', () => {
    for (let i = 1; i < REALMS.length; i += 1) {
      expect(REALMS[i]!.powerBonus).toBeGreaterThan(REALMS[i - 1]!.powerBonus);
    }
  });

  it('超出資料表的關卡落在最後一個境界，不會查不到', () => {
    expect(realmForStage(9999).id).toBe(REALMS[REALMS.length - 1]?.id);
    expect(realmIndexForStage(9999)).toBe(REALMS.length - 1);
  });

  it('每個境界九層，關卡編號換算成境界與層數', () => {
    expect(realmTitle(1)).toBe('煉氣期 一層');
    expect(realmTitle(9)).toBe('煉氣期 九層');
    expect(realmTitle(10)).toBe('築基期 一層');
    expect(realmTitle(27)).toBe('金丹期 九層');
    expect(realmTitle(73)).toBe('渡劫期 一層');
  });

  it('境界區間一律九關', () => {
    for (const realm of REALMS.slice(0, -1)) {
      expect(realm.stageTo - realm.stageFrom + 1, `${realm.name} 不是九層`).toBe(9);
    }
  });

  it('門派齊備體修 / 劍修 / 符修 / 丹修', () => {
    expect(SECTS.map((s) => s.path).sort()).toEqual(['丹修', '劍修', '體修', '符修'].sort());
  });

  it('升級線正好是要求的六項', () => {
    expect(UPGRADES.map((u) => u.id).sort()).toEqual(
      ['drawSpeed', 'fieldSlots', 'goldGain', 'startAttack', 'startDefense', 'startDisciples'].sort(),
    );
  });

  it('四種法寶符各有不同的取捨：單體高傷、多目標、快慢有別', () => {
    expect(CARDS.length).toBeGreaterThanOrEqual(4);
    // 有單體重擊也有多目標，否則「該放哪一種」不成為選擇。
    expect(CARDS.some((c) => c.targets === 1)).toBe(true);
    expect(CARDS.some((c) => c.targets >= 3)).toBe(true);
    // 傷害高的必然出手慢，不得有一張在兩個維度上全面勝出。
    const best = [...CARDS].sort((a, b) => b.damage - a.damage)[0]!;
    for (const card of CARDS) {
      if (card.id === best.id) continue;
      expect(best.intervalMs, `${best.name} 又快又痛，其他符沒有存在意義`).toBeGreaterThan(card.intervalMs);
    }
  });

  it('每個門派專精的符種都存在，且四派不重複', () => {
    const favored = SECTS.map((s) => s.favoredCard);
    for (const id of favored) expect(CARDS.some((c) => c.id === id)).toBe(true);
    expect(new Set(favored).size).toBe(SECTS.length);
  });

  it('平衡數值為正常範圍', () => {
    expect(BALANCE.boss.hpGrowth).toBeGreaterThan(1);
    expect(BALANCE.wave.hpGrowth).toBeGreaterThan(1);
    expect(BALANCE.field.tierGrowth).toBeGreaterThan(1);
    expect(BALANCE.field.stagesPerTier).toBeGreaterThanOrEqual(1);
    expect(BALANCE.gold.defeatRatio).toBeGreaterThan(0);
    expect(BALANCE.gold.defeatRatio).toBeLessThan(1);
  });

  it('格式錯誤在載入階段就報錯，不會等到跑到該筆資料', () => {
    expect(() => parseRealms([{ id: 'a' }])).toThrow(DataError);
    expect(() =>
      parseRealms([
        { id: 'a', name: 'A', subtitle: 's', stageFrom: 1, stageTo: 3, color: '#fff', powerBonus: 0, scenery: 'peaks' },
        { id: 'b', name: 'B', subtitle: 's', stageFrom: 9, stageTo: 12, color: '#fff', powerBonus: 0, scenery: 'peaks' },
      ]),
    ).toThrow(/連續/);
    expect(() =>
      parseCards([
        {
          id: 'x', name: 'N', desc: 'D', color: '#fff', art: 'a',
          damage: 1, intervalMs: 0, targets: 1, weight: 1, unlockStage: 1, effect: {},
        },
      ]),
    ).toThrow(/intervalMs/);
    expect(() =>
      parseUpgrades([
        { id: 'x', name: 'N', desc: 'D', unit: '點', perLevel: 1, baseCost: 10, costGrowth: 0.5, maxLevel: 3 },
      ]),
    ).toThrow(/costGrowth/);
  });
});
