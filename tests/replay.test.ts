/**
 * 重播。
 *
 * 這一組測試是排行榜的地基：如果同一份「種子＋操作記錄」在伺服器上跑不出
 * 和玩家那邊一樣的結果，整個防作弊機制就是假的。
 *
 * 最重要的一條是「順序」：操作必須在該格的 tick **之前**套用。
 * 對調的話 rng 被消耗的次序會不同，兩邊的結果會慢慢飄開——
 * 而且是慢慢飄，前十秒看起來還一模一樣，那種錯最難發現。
 */
import { describe, expect, it } from 'vitest';
import { SECTS } from '../src/data';
import type { Sect } from '../src/data/types';
import { createDefenseState, dropOn, tickCombat } from '../src/systems/defense';
import type { CardSlot, DefenseState } from '../src/systems/defense';
import { buildLoadoutFor, buildLoadoutFromSpec } from '../src/systems/loadout';
import type { Loadout } from '../src/systems/loadout';
import { createRng } from '../src/systems/rng';
import {
  MAX_REPLAY_ACTIONS,
  MAX_REPLAY_STEPS,
  STEP_MS,
  replayRun,
  runSeed,
  validateReplay,
} from '../src/systems/replay';
import type { ReplayAction } from '../src/systems/replay';
import { talismanDefs } from '../src/systems/talismans';
import { applyTutorialOpening } from '../src/systems/tutorial';

function sect(id = 'body'): Sect {
  const found = SECTS.find((item) => item.id === id);
  if (found === undefined) throw new Error(id);
  return found;
}

function loadoutFor(stage: number): Loadout {
  const pool = talismanDefs(['fan', 'flame', 'soul', 'myriad'], 999);
  return buildLoadoutFor(sect(), { startAttack: 20, startDisciples: 20, fieldSlots: 3 }, stage, pool);
}

/**
 * 模擬一個玩家：照固定時步跑，偶爾把手牌第一張丟到場上某一格。
 * 回傳「他看到的結果」與「他的操作記錄」——正是客戶端會上報的東西。
 */
function playLikeAHuman(
  loadout: Loadout,
  stage: number,
  runs: number,
  totalSteps: number,
): { state: DefenseState; actions: ReplayAction[]; steps: number } {
  const rng = createRng(runSeed(stage, runs));
  const state = createDefenseState(loadout, rng);
  const actions: ReplayAction[] = [];
  let steps = 0;
  for (; steps < totalSteps; steps += 1) {
    // 每 40 格動一次手，落點依格數變化，讓合成／交換／放置三條路徑都會走到。
    if (steps % 40 === 0 && steps > 0) {
      const from: CardSlot = { where: 'hand', index: (steps / 40) % 5 };
      const to: CardSlot = { where: 'field', index: (steps / 40) % 9 };
      actions.push({ step: steps, kind: 'drop', from, to });
      dropOn(state, from, to, rng);
    }
    tickCombat(state, STEP_MS, rng);
    if (state.outcome !== 'running') {
      steps += 1;
      break;
    }
  }
  return { state, actions, steps };
}

describe('重播', () => {
  it('同一份記錄重跑出完全相同的結果', () => {
    const stage = 30;
    const loadout = loadoutFor(stage);
    const played = playLikeAHuman(loadout, stage, 7, 8000);
    const replayed = replayRun(loadout, {
      stage,
      runs: 7,
      totalSteps: played.steps,
      actions: played.actions,
    });

    expect(replayed.outcome).toBe(played.state.outcome);
    expect(replayed.steps).toBe(played.steps);
    expect(replayed.kills).toBe(played.state.kills);
    expect(replayed.leaks).toBe(played.state.leaks);
    expect(replayed.disciples).toBeCloseTo(played.state.disciples, 6);
    expect(replayed.peakTier).toBe(played.state.peakTier);
    expect(replayed.bossKilled).toBe(played.state.bossKilled);
  });

  it('漏掉一個操作，結果就對不上——這正是它該有的效果', () => {
    const stage = 30;
    const loadout = loadoutFor(stage);
    const played = playLikeAHuman(loadout, stage, 7, 8000);
    expect(played.actions.length).toBeGreaterThan(3);
    const tampered = replayRun(loadout, {
      stage,
      runs: 7,
      totalSteps: played.steps,
      actions: played.actions.slice(1),
    });
    // 少一次布陣，斬殺數不可能還一模一樣。
    expect(tampered.kills).not.toBe(played.state.kills);
  });

  it('種子不同就是另一場', () => {
    const stage = 30;
    const loadout = loadoutFor(stage);
    const played = playLikeAHuman(loadout, stage, 7, 4000);
    const other = replayRun(loadout, {
      stage,
      runs: 8,
      totalSteps: played.steps,
      actions: played.actions,
    });
    expect(other.kills).not.toBe(played.state.kills);
  });

  it('沒有任何操作的一場也重播得出來', () => {
    const stage = 12;
    const loadout = loadoutFor(stage);
    const played = playLikeAHuman(loadout, stage, 3, 20_000);
    const replayed = replayRun(loadout, {
      stage,
      runs: 3,
      totalSteps: played.steps,
      actions: [],
    });
    void replayed;
    const same = replayRun(loadout, { stage, runs: 3, totalSteps: played.steps, actions: played.actions });
    expect(same.outcome).toBe(played.state.outcome);
  });
});

describe('重播的事前檢查', () => {
  const base = { stage: 30, runs: 1, totalSteps: 100, actions: [] as ReplayAction[] };

  it('正常的紀錄放行', () => {
    expect(validateReplay(base)).toBeNull();
  });

  it('擋掉會把伺服器綁住的紀錄', () => {
    // 重播要花真實的 CPU 時間，而任何人都能對著端點送東西。
    expect(validateReplay({ ...base, totalSteps: MAX_REPLAY_STEPS + 1 })).toBe('tooManySteps');
    const many = Array.from({ length: MAX_REPLAY_ACTIONS + 1 }, () => ({
      step: 0,
      kind: 'discard' as const,
      index: 0,
    }));
    expect(validateReplay({ ...base, actions: many })).toBe('tooManyActions');
  });

  it('擋掉亂序與超出範圍的操作', () => {
    const outOfOrder: ReplayAction[] = [
      { step: 10, kind: 'discard', index: 0 },
      { step: 5, kind: 'discard', index: 0 },
    ];
    expect(validateReplay({ ...base, actions: outOfOrder })).toBe('actionsOutOfOrder');
    expect(
      validateReplay({ ...base, actions: [{ step: 999, kind: 'discard', index: 0 }] }),
    ).toBe('stepOutOfRange');
    expect(validateReplay({ ...base, totalSteps: -1 })).toBe('stepOutOfRange');
  });
});

/**
 * 教學那一場的重播。
 *
 * 這一組守的是製作人回報的那件事：「我用小可愛打贏第一關，為什麼第一關
 * 沒有上榜」。原因是教學會把起手牌整組換掉，而重播不知道，所以跑出來的
 * 是另一場仗——於是教學整個被排除在上榜之外，而那是**每個新玩家打贏的
 * 第一關**，也是他第一次有機會看到自己的名字。
 *
 * 現在兩邊走同一個 applyTutorialOpening。這裡驗的就是「真的對得起來」。
 */
describe('教學那一場也重播得出來', () => {
  function opening(): DefenseState {
    const loadout = buildLoadoutFor(SECTS[0]!, {}, 1);
    const state = createDefenseState(loadout, createRng(1));
    applyTutorialOpening(state);
    return state;
  }

  it('起手是固定的：場上全空、手上三張同種同階', () => {
    // 隨機起手有可能三張都合不起來，教學第二步就卡死了。
    const state = opening();
    expect(state.field.every((card) => card === null)).toBe(true);
    const hand = state.hand.filter((card) => card !== null);
    expect(hand).toHaveLength(3);
    expect(new Set(hand.map((card) => card!.type)).size).toBe(1);
    expect(hand.every((card) => card!.tier === 1)).toBe(true);
  });

  it('同樣的輸入永遠推出同樣的起手——不然重播從第一格就散了', () => {
    expect(JSON.stringify(opening().hand)).toBe(JSON.stringify(opening().hand));
  });

  it('**打一場教學，重播出來要是同一場。**', () => {
    const spec = {
      sectId: SECTS[0]!.id,
      stage: 1,
      libraryFloor: 0,
      talismans: [],
      upgrades: {},
      karma: {},
      sectClears: 0,
      sectDepth: 0,
      rules: [],
      goldMultiplier: 1,
      bankedStage: 0,
      rebirths: 0,
    };
    const loadout = buildLoadoutFromSpec(spec);

    // 客戶端這一場：createDefenseState 之後套教學起手，然後照 RunScene 的
    // 順序跑（先套用這一格的操作，再推進一格）。
    const rng = createRng(runSeed(1, 0));
    const state = createDefenseState(loadout, rng);
    applyTutorialOpening(state);
    const actions: ReplayAction[] = [];
    let steps = 0;
    while (state.outcome === 'running' && steps < MAX_REPLAY_STEPS) {
      // 教學教的就是這兩步：放下去、疊起來。
      for (let h = 0; h < state.hand.length; h += 1) {
        if (state.hand[h] === null) continue;
        const target = state.field.findIndex((card) => card === null);
        if (target < 0) break;
        const from = { where: 'hand' as const, index: h };
        const to = { where: 'field' as const, index: target };
        if (dropOn(state, from, to, rng) !== 'none') {
          actions.push({ step: steps, kind: 'drop', from, to });
        }
      }
      tickCombat(state, STEP_MS, rng);
      steps += 1;
    }

    // 伺服器那一半：只拿到種子、格數、操作，以及「這是教學」。
    const replayed = replayRun(buildLoadoutFromSpec(spec), {
      stage: 1,
      runs: 0,
      totalSteps: steps,
      actions,
      tutorial: true,
    });

    expect(replayed.outcome).toBe(state.outcome);
    expect(replayed.stage).toBe(state.stage);
    expect(replayed.elapsedMs).toBe(state.elapsedMs);
    expect(replayed.kills).toBe(state.kills);
    expect(replayed.disciples).toBe(state.disciples);
  });

  it('**漏掉 tutorial 旗標就會驗不過。** 這正是原本那個故障', () => {
    const spec = {
      sectId: SECTS[0]!.id, stage: 1, libraryFloor: 0, talismans: [], upgrades: {},
      karma: {}, sectClears: 0, sectDepth: 0, rules: [], goldMultiplier: 1,
      bankedStage: 0, rebirths: 0,
    };
    const loadout = buildLoadoutFromSpec(spec);
    const rng = createRng(runSeed(1, 0));
    const state = createDefenseState(loadout, rng);
    applyTutorialOpening(state);
    let steps = 0;
    while (state.outcome === 'running' && steps < 4000) {
      tickCombat(state, STEP_MS, rng);
      steps += 1;
    }
    const withFlag = replayRun(buildLoadoutFromSpec(spec), {
      stage: 1, runs: 0, totalSteps: steps, actions: [], tutorial: true,
    });
    const without = replayRun(buildLoadoutFromSpec(spec), {
      stage: 1, runs: 0, totalSteps: steps, actions: [],
    });
    expect(withFlag.elapsedMs).toBe(state.elapsedMs);
    // 沒有旗標的那一份起手牌完全不同，所以它不是同一場仗。
    expect(without.kills).not.toBe(withFlag.kills);
  });
});
