/**
 * 門派修為與換派代價。
 *
 * 這一組測試守的是設計本身，不只是算式：
 * 修為只長在自己身上、換派不會沒收它、而且價碼看的是「你要離開的那一派」。
 * 這三條一旦被改壞，門派就會退回成一個隨時可改的修飾選單。
 */
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/data';
import { createDefaultSave, recordClear } from '../src/save';
import { buildLoadout } from '../src/systems/loadout';
import { clearsToNextMastery, masteryBonus, masteryTier, switchCost } from '../src/systems/sects';
import type { SaveData } from '../src/save/types';

function saveWith(sectId: string, clears: Record<string, number> = {}): SaveData {
  const save = createDefaultSave(1);
  save.player.sectId = sectId;
  save.player.sectClears = { ...clears };
  return save;
}

describe('門派修為', () => {
  it('每 clearsPerMastery 次通關升一階，並在 maxMasteryTier 封頂', () => {
    const { clearsPerMastery, maxMasteryTier } = BALANCE.sect;
    expect(masteryTier(saveWith('body', { body: clearsPerMastery - 1 }), 'body')).toBe(0);
    expect(masteryTier(saveWith('body', { body: clearsPerMastery }), 'body')).toBe(1);
    expect(masteryTier(saveWith('body', { body: clearsPerMastery * 999 }), 'body')).toBe(maxMasteryTier);
  });

  it('修為只長在通關時用的那一派身上', () => {
    const save = saveWith('sword');
    recordClear(save, 0);
    recordClear(save, 0);
    expect(save.player.sectClears['sword']).toBe(2);
    expect(save.player.sectClears['body']).toBeUndefined();
  });

  it('換派不會沒收舊修為——回去的時候它還在', () => {
    const save = saveWith('sword', { sword: 20 });
    save.player.sectId = 'body';
    expect(masteryTier(save, 'sword')).toBe(BALANCE.sect.maxMasteryTier);
    // 換派若會清空修為，玩家就會因為怕虧而永遠不敢嘗試第二個門派。
    expect(save.player.sectClears['sword']).toBe(20);
  });

  it('修為換成法寶傷害，並真的進到 loadout 裡', () => {
    const { clearsPerMastery, masteryDamagePerTier } = BALANCE.sect;
    const none = buildLoadout(saveWith('body'), 1);
    const deep = buildLoadout(saveWith('body', { body: clearsPerMastery * 2 }), 1);
    expect(masteryBonus(2)).toBeCloseTo(masteryDamagePerTier * 2, 10);
    expect(deep.damageMultiplier / none.damageMultiplier).toBeCloseTo(1 + masteryDamagePerTier * 2, 10);
  });

  it('距離下一階的場數會遞減，滿階回 null', () => {
    const { clearsPerMastery, maxMasteryTier } = BALANCE.sect;
    expect(clearsToNextMastery(saveWith('body'), 'body')).toBe(clearsPerMastery);
    expect(clearsToNextMastery(saveWith('body', { body: 1 }), 'body')).toBe(clearsPerMastery - 1);
    expect(clearsToNextMastery(saveWith('body', { body: clearsPerMastery * maxMasteryTier }), 'body')).toBeNull();
  });
});

describe('換派代價', () => {
  it('價碼看的是要離開的那一派累積了多少，不是要去的那一派', () => {
    const save = saveWith('sword', { sword: 10, body: 30 });
    expect(switchCost(save, 'body')).toBe(10 * BALANCE.sect.switchCostPerClear);
  });

  it('第一次入門與留在原派都免費', () => {
    const fresh = createDefaultSave(1);
    expect(switchCost(fresh, 'body')).toBe(0);
    // 新玩家不該為了一個他還看不懂的選擇付錢。
    expect(switchCost(saveWith('body', { body: 9 }), 'body')).toBe(0);
  });
});
