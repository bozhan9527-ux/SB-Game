import { describe, expect, it } from 'vitest';
import { SHOP } from '../src/data';
// @ts-expect-error -- node:fs 沒有型別（見 tsconfig 的 types），只在 vitest 的 node 底下跑。
import { existsSync } from 'node:fs';
import { outfitParts } from '../src/art';
import { adoptSave, createDefaultSave } from '../src/save';
import { createMemoryStorage } from '../src/save/storage';
import { migrate } from '../src/save/migrations';
import {
  achievementStones,
  buyCostume,
  buyPaper,
  buyWeaponSkin,
  equipPaper,
  equipWeaponSkin,
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
    const [low, mid, high] = SHOP.grants.achievement.map(([, n]) => n);
    expect(achievementStones(60)).toBe(low);
    expect(achievementStones(30000)).toBe(mid);
    expect(achievementStones(9000000000)).toBe(high);
    const save = createDefaultSave(1);
    save.player.achievements.push('first_clear');
    expect(claimReward(save, 'first_clear')).toBeGreaterThan(0);
    expect(save.player.stones.balance).toBe(low);
    expect(claimReward(save, 'first_clear')).toBe(0);
    expect(save.player.stones.balance).toBe(low);
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
    const price = SHOP.costumes.find((c) => c.id === 'moonwhite')!.price;
    save.player.stones.balance = price + 200;
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
    const expected = SHOP.grants.firstBreak + 3 * SHOP.grants.realm + SHOP.grants.firstAscend + SHOP.grants.ascend + SHOP.grants.achievement[0]![1];
    expect(stones.balance).toBe(expected);
    expect(stones.claimed).toContain('ascend:first');
    expect(stones.claimed).toContain('ach:first_clear');
  });
});

describe('武器外觀與符紙紋樣', () => {
  it('武器外觀買了直接配在那一種武器上，卸下回原本的樣子', () => {
    const save = createDefaultSave(1);
    const skin = SHOP.weapons.find((w) => w.id === 'peachwood')!;
    expect(buyWeaponSkin(save, 'peachwood')).toBe('short');
    save.player.stones.balance = skin.price;
    expect(buyWeaponSkin(save, 'peachwood')).toBe('ok');
    expect(save.player.stones.balance).toBe(0);
    expect(save.player.stones.weaponOn).toEqual({ sword: 'peachwood' });
    expect(buyWeaponSkin(save, 'peachwood')).toBe('owned');
    // 沒買的配不上
    expect(equipWeaponSkin(save, 'azure', true)).toBe(false);
    expect(equipWeaponSkin(save, 'peachwood', false)).toBe(true);
    expect(save.player.stones.weaponOn).toEqual({});
  });

  it('外觀會換掉門人部件裡的武器那一格，別的武器不受影響', () => {
    const plain = outfitParts('sword', 0);
    expect(plain).toContain('weapon-sword');
    const skinned = outfitParts('sword', 0, { costume: null, weapons: { sword: 'azure', fist: 'tiger' } });
    expect(skinned).toContain('weapon-s-azure');
    expect(skinned).not.toContain('weapon-sword');
    expect(outfitParts('body', 0, { costume: null, weapons: { sword: 'azure' } })).toContain('weapon-fist');
  });

  it('符紙買了直接換上，可以換回黃符紙', () => {
    const save = createDefaultSave(1);
    save.player.stones.balance = 1000;
    expect(buyPaper(save, 'star')).toBe('ok');
    expect(save.player.stones.paper).toBe('star');
    expect(equipPaper(save, 'gold')).toBe(false);
    expect(equipPaper(save, null)).toBe(true);
    expect(save.player.stones.paper).toBeNull();
  });

  it('每一個商品都有圖', () => {
    for (const w of SHOP.weapons) expect(existsSync(`public/art/pd-weapon-s-${w.id}-0.webp`)).toBe(true);
    for (const p of SHOP.papers) expect(existsSync(`public/art/card-paper-${p.id}.webp`)).toBe(true);
  });

  it('v29 轉換：舊存檔補上空的欄位；被改過的存檔配不上沒買或不對種類的外觀', () => {
    const next = migrate({ version: 28, player: { stones: { balance: 5 } } }, 29) as Record<string, any>;
    expect(next['player']['stones']).toMatchObject({ weapons: [], weaponOn: {}, papers: [], paper: null, balance: 5 });
    const save = createDefaultSave(1);
    const raw = JSON.parse(JSON.stringify(save));
    raw.player.stones = { ...raw.player.stones, weapons: ['azure', 'bogus'], weaponOn: { sword: 'azure', fist: 'azure', fu: 'goldfu' }, papers: ['star'], paper: 'gold' };
    const loaded = adoptSave(raw, createMemoryStorage());
    expect(loaded.player.stones.weapons).toEqual(['azure']);
    expect(loaded.player.stones.weaponOn).toEqual({ sword: 'azure' });
    expect(loaded.player.stones.paper).toBeNull();
  });
});
