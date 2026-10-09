import { describe, it, expect } from 'vitest';
import { TRIBULATIONS } from '../src/data';
import { createDefaultSave } from '../src/save';
import { createDefenseState, tickCombat } from '../src/systems/defense';
import { buildLoadoutFromSpec, loadoutSpecOf } from '../src/systems/loadout';
import { omenRule } from '../src/systems/omens';
import { createRng } from '../src/systems/rng';
import { MAX_TRIBULATIONS, TRIBULATION_STEP, tribulationStart, tribulationsFor } from '../src/systems/tribulations';

const START = tribulationStart();

function spec(stage: number, rules: string[] = [], endless = false) {
  const save = createDefaultSave(0);
  save.player.sectId = 'body';
  return { ...loadoutSpecOf(save, stage), rules, endless };
}

describe('天劫的編排', () => {
  it('飛升境之前沒有天劫', () => {
    for (let stage = 1; stage < START; stage += 1) expect(tribulationsFor(stage)).toEqual([]);
  });

  it('從一條開始，每深十關多一條，最多三條', () => {
    expect(tribulationsFor(START).length).toBe(1);
    expect(tribulationsFor(START + TRIBULATION_STEP).length).toBe(2);
    expect(tribulationsFor(START + TRIBULATION_STEP * 2).length).toBe(3);
    expect(tribulationsFor(START + 500).length).toBe(MAX_TRIBULATIONS);
  });

  it('只看關卡編號：同一關永遠是同一組，而且不重複', () => {
    for (let stage = START; stage < START + 60; stage += 1) {
      const a = tribulationsFor(stage).map((item) => item.id);
      expect(tribulationsFor(stage).map((item) => item.id)).toEqual(a);
      expect(new Set(a).size).toBe(a.length);
    }
  });

  it('七種天劫在前一百關內都會輪到', () => {
    const seen = new Set<string>();
    for (let stage = START; stage < START + 100; stage += 1) {
      for (const item of tribulationsFor(stage)) seen.add(item.id);
    }
    expect(seen.size).toBe(TRIBULATIONS.length);
  });
});

describe('天劫套在哪裡', () => {
  it('主線吃天劫，帶著奇遇也一樣', () => {
    expect(buildLoadoutFromSpec(spec(START)).tribulations.length).toBe(1);
    expect(buildLoadoutFromSpec(spec(START, [omenRule('spring')])).tribulations.length).toBe(1);
  });

  it('副本與無限模式不吃：它們有自己的規則', () => {
    expect(buildLoadoutFromSpec(spec(START, ['noMerge'])).tribulations).toEqual([]);
    expect(buildLoadoutFromSpec(spec(START, [], true)).tribulations).toEqual([]);
  });

  it('每一條天劫都另給金幣', () => {
    const before = buildLoadoutFromSpec(spec(START - 1)).goldMultiplier;
    const after = buildLoadoutFromSpec(spec(START + TRIBULATION_STEP * 2)).goldMultiplier;
    expect(after).toBeGreaterThan(before * 1.5);
  });
});

describe('定時的天劫', () => {
  function stateWith(id: string) {
    const loadout = buildLoadoutFromSpec(spec(5));
    const item = TRIBULATIONS.find((trib) => trib.id === id);
    if (item === undefined) throw new Error(id);
    loadout.tribulations = [item];
    const state = createDefenseState(loadout, createRng(1));
    state.queue = [];
    state.drawTimer = 1e9;
    return { state, item };
  }

  it('雷劫：到時間封住一格有符的陣位', () => {
    const { state, item } = stateWith('thunder');
    state.field.fill(null);
    state.field[3] = { type: 'sword', tier: 1 };
    const rng = createRng(2);
    const sealed: number[] = [];
    for (let t = 0; t < item.intervalMs + 100; t += 50) sealed.push(...tickCombat(state, 50, rng).sealed);
    expect(sealed).toEqual([3]);
    expect(state.sealedUntil[3]).toBeGreaterThan(state.elapsedMs);
  });

  it('天火：到時間燒掉手牌裡最低階的一張', () => {
    const { state, item } = stateWith('heavenfire');
    state.hand.fill(null);
    state.hand[1] = { type: 'sword', tier: 4 };
    state.hand[4] = { type: 'sword', tier: 2 };
    const rng = createRng(2);
    const burned: number[] = [];
    for (let t = 0; t < item.intervalMs + 100; t += 50) burned.push(...tickCombat(state, 50, rng).devoured);
    expect(burned).toEqual([4]);
    expect(state.hand[1]).not.toBeNull();
  });
});
