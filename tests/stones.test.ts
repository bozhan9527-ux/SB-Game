import { describe, expect, it } from 'vitest';
import { SHOP } from '../src/data';
import { createDefaultSave } from '../src/save';
import { migrate } from '../src/save/migrations';
import {
  achievementStones,
  buyCostume,
  cardActive,
  cardDaysLeft,
  creditPurchase,
  equipCostume,
  grantAfterRun,
  grantAscension,
  grantDaily,
  grantTower,
} from '../src/systems/stones';
import { claimReward } from '../src/systems/achievements';

const run = (over: Partial<Parameters<typeof grantAfterRun>[1]> = {}) => ({
  victory: true,
  stage: 9,
  mainline: true,
  brokeThrough: true,
  bossId: 'b_x',
  bossName: '測試首領',
  bossKilled: true,
  replay: false,
  ...over,
});

describe('免費靈石', () => {
  it('第一次破境、每境第一次、首領第一次：都只給一次', () => {
    const save = createDefaultSave(1);
    const gains = grantAfterRun(save, run());
    expect(gains.map((g) => g.amount)).toEqual([SHOP.grants.firstBreak, SHOP.grants.realm, SHOP.grants.boss]);
    expect(save.player.stones.balance).toBe(SHOP.grants.firstBreak + SHOP.grants.realm + SHOP.grants.boss);
    // 輪迴後重打同一境、同一隻首領：不再給
    expect(grantAfterRun(save, run())).toEqual([]);
    // 下一境的破境只給那一境的
    expect(grantAfterRun(save, run({ stage: 18, bossId: 'b_y' })).map((g) => g.amount)).toEqual([SHOP.grants.realm, SHOP.grants.boss]);
  });

  it('重播、沒破境、沒斬首領都不給', () => {
    const save = createDefaultSave(1);
    expect(grantAfterRun(save, run({ replay: true }))).toEqual([]);
    expect(grantAfterRun(save, run({ brokeThrough: false, bossKilled: false }))).toEqual([]);
  });

  it('飛升：第一次 500，之後每次 200', () => {
    const save = createDefaultSave(1);
    expect(grantAscension(save).amount).toBe(SHOP.grants.firstAscend);
    expect(grantAscension(save).amount).toBe(SHOP.grants.ascend);
    expect(save.player.stones.balance).toBe(SHOP.grants.firstAscend + SHOP.grants.ascend);
  });

  it('每日挑戰：撐過門檻一天一次；天劫塔一週一次', () => {
    const save = createDefaultSave(1);
    expect(grantDaily(save, 100, SHOP.grants.dailyWaves - 1)).toEqual([]);
    expect(grantDaily(save, 100, SHOP.grants.dailyWaves)[0]?.amount).toBe(SHOP.grants.daily);
    expect(grantDaily(save, 100, 30)).toEqual([]);
    expect(grantDaily(save, 101, 30)).toHaveLength(1);
    expect(grantTower(save, 7)?.amount).toBe(SHOP.grants.tower);
    expect(grantTower(save, 7)).toBeNull();
    expect(grantTower(save, 8)).not.toBeNull();
  });

  it('成就：照金幣獎勵分三檔，領獎時一起入帳', () => {
    expect(achievementStones(60)).toBe(50);
    expect(achievementStones(30000)).toBe(100);
    expect(achievementStones(9000000000)).toBe(200);
    const save = createDefaultSave(1);
    save.player.achievements.push('first_clear');
    expect(claimReward(save, 'first_clear')).toBeGreaterThan(0);
    expect(save.player.stones.balance).toBe(50);
    expect(claimReward(save, 'first_clear')).toBe(0);
    expect(save.player.stones.balance).toBe(50);
  });
});

describe('付款與月卡', () => {
  it('靈石包入帳並記流水；不認得的商品不入帳', () => {
    const save = createDefaultSave(1);
    expect(creditPurchase(save, 'stones_600', 10, 123)).toBe(600);
    expect(creditPurchase(save, 'nope', 10, 124)).toBe(0);
    expect(save.player.stones.balance).toBe(600);
    expect(save.player.stones.ledger).toEqual([{ item: 'stones_600', stones: 600, at: 123 }]);
  });

  it('月卡：立刻給、三十天內每天打完每日挑戰再給；疊買往後延', () => {
    const save = createDefaultSave(1);
    creditPurchase(save, 'month_card', 10, 1);
    expect(save.player.stones.balance).toBe(SHOP.monthCard.stones);
    expect(cardActive(save, 10)).toBe(true);
    expect(cardDaysLeft(save, 10)).toBe(30);
    // 只打了一波（沒到每日門檻）也有月卡那一份
    expect(grantDaily(save, 10, 1).map((g) => g.amount)).toEqual([SHOP.monthCard.daily]);
    expect(grantDaily(save, 10, 1)).toEqual([]);
    expect(cardActive(save, 40)).toBe(false);
    creditPurchase(save, 'month_card', 20, 2);
    expect(cardDaysLeft(save, 20)).toBe(50);
  });
});

describe('時裝', () => {
  it('買得起才買、買到直接穿上；沒有的穿不上', () => {
    const save = createDefaultSave(1);
    expect(buyCostume(save, 'moonwhite')).toBe('short');
    save.player.stones.balance = 2000;
    expect(buyCostume(save, 'moonwhite')).toBe('ok');
    expect(save.player.stones.balance).toBe(200);
    expect(save.player.stones.equipped).toBe('moonwhite');
    expect(buyCostume(save, 'moonwhite')).toBe('owned');
    expect(equipCostume(save, 'dragon')).toBe(false);
    expect(equipCostume(save, null)).toBe(true);
    expect(save.player.stones.equipped).toBeNull();
  });
});

describe('v26 轉換', () => {
  it('舊玩家補發：打過的境界、飛升過的次數、已經領過的成就', () => {
    const old = {
      version: 25,
      player: { karma: { rebirths: 2 }, achievementsClaimed: ['first_clear'] },
      world: { highestStage: 30 },
    };
    const next = migrate(old as unknown as Record<string, unknown>, 26) as Record<string, any>;
    const stones = next['player']['stones'];
    // 30 關＝過了三境
    const expected = SHOP.grants.firstBreak + 3 * SHOP.grants.realm + SHOP.grants.firstAscend + SHOP.grants.ascend + 50;
    expect(stones.balance).toBe(expected);
    expect(stones.claimed).toContain('ascend:first');
    expect(stones.claimed).toContain('ach:first_clear');
  });
});
