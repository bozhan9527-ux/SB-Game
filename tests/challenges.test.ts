/**
 * 挑戰條件。
 *
 * 最重要的一條在最下面：挑戰的獎勵只能是金幣倍率。
 * 只要它能換到別處拿不到的東西，就從「自己給自己找事做」變成「不做就落後」，
 * 那是完全相反的一件事。
 */
import { describe, expect, it } from 'vitest';
import { CHALLENGES } from '../src/data';
import { createDefaultSave } from '../src/save';
import type { SaveData } from '../src/save/types';
import {
  activeChallenges,
  availableChallenges,
  challengeGoldMultiplier,
  recordChallengeClears,
  sanitizeChallenges,
} from '../src/systems/challenges';
import { createDefenseState, mergeInto, tickCombat } from '../src/systems/defense';
import { buildLoadout } from '../src/systems/loadout';
import { createRng } from '../src/systems/rng';

function saveWith(ids: string[], highestStage = 999): SaveData {
  const save = createDefaultSave(1);
  save.player.sectId = 'body';
  save.world.highestStage = highestStage;
  save.world.stage = 30;
  save.player.challenges = ids;
  return save;
}

describe('挑戰條件', () => {
  it('沒到關卡的條件看不到、也套不上', () => {
    const early = availableChallenges(1);
    expect(early.every((item) => item.minStage <= 1)).toBe(true);
    // 新玩家不該有辦法用挑戰把自己卡死。
    expect(sanitizeChallenges(['noLeak'], 1)).toEqual([]);
    expect(sanitizeChallenges(['noLeak'], 999)).toEqual(['noLeak']);
  });

  it('重複與不存在的 id 一律吞掉，不 throw', () => {
    expect(sanitizeChallenges(['noMerge', 'noMerge', 'nope'], 999)).toEqual(['noMerge']);
  });

  it('多條同時開啟時倍率相乘', () => {
    const save = saveWith(['noMerge', 'thinGate']);
    const expected = activeChallenges(save).reduce((total, item) => total * item.goldMultiplier, 1);
    expect(challengeGoldMultiplier(save)).toBeCloseTo(expected, 10);
    expect(challengeGoldMultiplier(saveWith([]))).toBe(1);
  });

  it('不合之道：模擬層直接擋掉合成，不是只把手勢關掉', () => {
    // 規則要在模擬裡成立，否則平衡模擬跑出來的數字和玩家看到的不是同一件事。
    const save = saveWith(['noMerge']);
    const state = createDefenseState(buildLoadout(save, 30), createRng(5));
    state.hand[0] = { type: 'sword', tier: 3 };
    state.hand[1] = { type: 'sword', tier: 3 };
    expect(mergeInto(state, { where: 'hand', index: 0 }, { where: 'hand', index: 1 }, createRng(1))).toBe(
      false,
    );
  });

  it('獨門一符：抽符池縮成一種', () => {
    expect(buildLoadout(saveWith(['soloTalisman']), 30).talismans).toHaveLength(1);
    expect(buildLoadout(saveWith([]), 30).talismans.length).toBeGreaterThan(1);
  });

  it('孤身守門：山門耐久砍到三成', () => {
    const thin = buildLoadout(saveWith(['thinGate']), 30).disciples;
    const full = buildLoadout(saveWith([]), 30).disciples;
    expect(thin).toBeLessThan(full);
    expect(thin).toBeGreaterThan(0);
  });

  it('一夫當關：漏一隻直接失守，門派免傷擋不住', () => {
    // 體修的被動是「前兩次漏怪免傷」。若它能擋掉這一條，對體修來說這條挑戰等於白開。
    const save = saveWith(['noLeak']);
    const state = createDefenseState(buildLoadout(save, 30), createRng(5));
    expect(state.loadout.sect.leakImmunityCount).toBeGreaterThan(0);
    state.queue = [];
    state.enemies = [];
    tickCombat(state, 1, createRng(1));
    const enemy = state.enemies[0] ?? null;
    expect(enemy).toBeNull();

    // 直接把一隻放到山門前，走一拍就該結束。
    const victim = createDefenseState(buildLoadout(save, 30), createRng(5));
    victim.queue = [];
    const spawn = tickCombat(victim, 1, createRng(1));
    void spawn;
    victim.enemies = [
      {
        id: 99,
        name: 'x',
        art: 'bandit',
        bossArt: null,
        boss: false,
        hp: 1e12,
        maxHp: 1e12,
        y: 10_000,
        lane: 2,
        speed: 0,
        slowUntilMs: 0,
        slowPercent: 0,
        burnRemaining: 0,
        burnPerMs: 0,
        burnSource: null,
        trait: 'none',
        spawnedBySplit: false,
      },
    ];
    tickCombat(victim, 16, createRng(2));
    expect(victim.disciples).toBe(0);
  });

  it('速斬：首領時限砍半', () => {
    expect(buildLoadout(saveWith(['hasteBoss']), 30).rules.bossTimeMultiplier).toBe(0.5);
    expect(buildLoadout(saveWith([]), 30).rules.bossTimeMultiplier).toBe(1);
  });

  it('達成紀錄只在通關時累積，而且不重複', () => {
    const save = saveWith(['noMerge']);
    expect(recordChallengeClears(save).map((item) => item.id)).toEqual(['noMerge']);
    expect(recordChallengeClears(save)).toEqual([]);
    expect(save.player.challengesDone).toEqual(['noMerge']);
  });

  it('獎勵只有金幣倍率，而且不會低於一倍', () => {
    // 挑戰若能給別處拿不到的東西，它就從一個選項變成一份作業。
    for (const item of CHALLENGES) {
      expect(item.goldMultiplier).toBeGreaterThanOrEqual(1);
      expect(Object.keys(item).sort()).toEqual(
        ['desc', 'detail', 'goldMultiplier', 'id', 'minStage', 'name'],
      );
    }
  });
});
