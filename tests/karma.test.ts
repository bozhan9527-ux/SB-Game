/**
 * 強制飛升、天劫與仙緣（v23）。
 *
 * 守的規矩：打完第 81 關一定飛升；背的天劫越多仙緣越多；仙緣拿來解鎖、
 * 不再把主線輾平；飛升台只能在一世開頭改。
 */
import { describe, expect, it } from 'vitest';
import { KARMA, TRIBULATIONS, UPGRADES } from '../src/data';
import { createDefaultSave } from '../src/save';
import { migrate } from '../src/save/migrations';
import type { SaveData } from '../src/save/types';
import { buildLoadout } from '../src/systems/loadout';
import {
  ASCEND_BASE_POINTS,
  ascend,
  ascensionGain,
  buyKarma,
  canAscend,
  heavenOf,
  jieCount,
  karmaCost,
  karmaTrackById,
  legacyKarmaRefund,
  mustAscend,
  setTribulation,
  tribKey,
  tribLevelOpen,
  unlock,
} from '../src/systems/karma';
import { offerPool } from '../src/systems/blessings';
import { unlockedTalismans } from '../src/systems/talismans';

function at(stage: number): SaveData {
  const save = createDefaultSave(1);
  save.player.sectId = 'body';
  save.world.stage = stage;
  save.world.highestStage = stage;
  save.player.wallet.gold = 50_000;
  for (const track of UPGRADES) save.player.upgrades[track.id] = 5;
  return save;
}

describe('強制飛升', () => {
  it('打完第 81 關之前不能飛升；打完就一定要飛升', () => {
    expect(canAscend(at(81))).toBe(false);
    expect(mustAscend(at(82))).toBe(true);
    expect(ascend(at(60))).toBe(0);
  });

  it('證道之後不再強制，可以往飛升境走', () => {
    const save = at(82);
    save.player.karma.dao = true;
    expect(mustAscend(save)).toBe(false);
    expect(canAscend(save)).toBe(true);
  });

  it('歸零這一世的資源，留下跨世的東西', () => {
    const save = at(82);
    save.player.dungeons = { library: 6 };
    save.world.realmRun.blessings = { guardian: 2 };
    const highest = save.world.highestStage;
    const gained = ascend(save);
    expect(gained).toBe(ASCEND_BASE_POINTS);
    expect(save.player.karma.points).toBe(gained);
    expect(save.player.karma.rebirths).toBe(1);
    expect(save.world.stage).toBe(1);
    expect(save.world.highestStage).toBe(highest);
    expect(save.player.wallet.gold).toBe(0);
    for (const track of UPGRADES) expect(save.player.upgrades[track.id]).toBe(0);
    expect(save.player.dungeons).toEqual({});
    expect(save.world.realmRun.blessings).toEqual({});
  });

  it('符籙選擇不跟著歸零', () => {
    const save = at(82);
    const before = unlockedTalismans(9).length;
    ascend(save);
    expect(unlockedTalismans(9).length).toBe(before);
    expect(save.player.talismans.length).toBeGreaterThan(0);
  });
});

describe('天劫與重天', () => {
  it('劫數 2 為一重天，劫數 18 為九重天', () => {
    expect(heavenOf(0)).toBe(0);
    expect(heavenOf(1)).toBe(0);
    expect(heavenOf(2)).toBe(1);
    expect(heavenOf(7)).toBe(3);
    expect(heavenOf(18)).toBe(9);
    expect(heavenOf(21)).toBe(9);
  });

  it('背得越多，飛升時仙緣越多', () => {
    const plain = at(82);
    const heavy = at(82);
    heavy.world.tribulations = { thunder: 1, heartDemon: 1, gale: 1, cloud: 1 };
    expect(jieCount(heavy.world.tribulations)).toBe(4);
    expect(ascensionGain(heavy)).toBe(Math.round(ASCEND_BASE_POINTS * 2));
    expect(ascensionGain(heavy)).toBeGreaterThan(ascensionGain(plain));
  });

  it('九重天渡劫就證道', () => {
    const save = at(82);
    const levels: Record<string, number> = {};
    for (const def of TRIBULATIONS) levels[def.id] = 3;
    save.world.tribulations = levels;
    ascend(save);
    expect(save.player.karma.dao).toBe(true);
    expect(save.player.karma.bestHeaven).toBe(9);
  });

  it('第二三重要解鎖，第三重要先開第二重', () => {
    const save = at(1);
    save.player.karma.points = 10;
    expect(tribLevelOpen(save, 'thunder', 1)).toBe(true);
    expect(setTribulation(save, 'thunder', 2)).toBe(false);
    expect(unlock(save, tribKey('thunder', 3))).toBe('locked');
    expect(unlock(save, tribKey('thunder', 2))).toBe('ok');
    expect(setTribulation(save, 'thunder', 2)).toBe(true);
    expect(save.world.tribulations['thunder']).toBe(2);
    expect(setTribulation(save, 'thunder', 0)).toBe(true);
    expect(save.world.tribulations['thunder']).toBeUndefined();
  });

  it('背的天劫真的進到主線的配置，副本不吃', () => {
    const save = at(10);
    save.world.tribulations = { heartDemon: 1 };
    const loadout = buildLoadout(save, 10);
    expect(loadout.tribulations.map((t) => t.id)).toContain('heartDemon');
    expect(loadout.mobHpMultiplier).toBeCloseTo(TRIBULATIONS.find((t) => t.id === 'heartDemon')!.levels[0]!.mobHp);
    // 自己背的天劫不加金幣：獎勵是飛升時的仙緣倍率。
    expect(loadout.goldMultiplier).toBeCloseTo(buildLoadout(at(10), 10).goldMultiplier);
  });
});

describe('仙緣解鎖', () => {
  it('解鎖機緣之後才進三選一的卡池', () => {
    const save = at(1);
    const ctx = { owned: {}, unlocked: save.player.karma.unlocks, sectId: 'body', talismans: ['frost', 'flame', 'sword', 'bolt'], rare: false };
    expect(offerPool(ctx).map((d) => d.id)).not.toContain('fireIce');
    save.player.karma.points = 5;
    expect(unlock(save, 'fireIce')).toBe('ok');
    expect(offerPool({ ...ctx, unlocked: save.player.karma.unlocks }).map((d) => d.id)).toContain('fireIce');
    expect(unlock(save, 'fireIce')).toBe('done');
    expect(unlock(save, 'guardian')).toBe('invalid');
  });

  it('道基永固上限很低：滿級也只有三成傷害', () => {
    const track = karmaTrackById('karmaPower');
    expect(track.perLevel * track.maxLevel).toBeLessThanOrEqual(30);
    expect(KARMA).toHaveLength(1);
    const save = at(1);
    save.player.karma.points = 9999;
    while (buyKarma(save, 'karmaPower') === 'ok');
    expect(karmaCost(track, save.player.karma.spent['karmaPower'] ?? 0)).toBeNull();
  });
});

describe('舊存檔（v22 → v23）', () => {
  it('舊制花掉的仙緣全數退回成點數，一境一局從目前這一關開始', () => {
    const old = {
      version: 22,
      player: { karma: { rebirths: 2, points: 3, spent: { karmaPower: 3, karmaTier: 1 }, claimedStage: 120 } },
      world: { stage: 37, highestStage: 120, runs: 5, clears: 4 },
    };
    const next = migrate(old as unknown as Record<string, unknown>, 23) as Record<string, any>;
    const refund = legacyKarmaRefund({ karmaPower: 3, karmaTier: 1 });
    expect(refund).toBe(1 + 1 + 1 + 6);
    expect(next['player']['karma']['points']).toBe(3 + refund);
    expect(next['player']['karma']['spent']).toEqual({});
    expect(next['world']['realmRun']['startStage']).toBe(37);
  });
});
