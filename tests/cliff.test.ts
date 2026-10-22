import { describe, expect, it } from 'vitest';
import { DUNGEONS } from '../src/data';
import { createDefaultSave } from '../src/save';
import { createDefenseState, discardHand, tickCombat } from '../src/systems/defense';
import { dungeonSpecOf } from '../src/systems/dungeons';
import { buildLoadoutFromSpec } from '../src/systems/loadout';
import { createRng } from '../src/systems/rng';

describe('問心崖・定陣', () => {
  const cliff = DUNGEONS.find((d) => d.id === 'cliff')!;
  const setup = (floor: number) => {
    const save = createDefaultSave(1);
    save.player.sectId = 'sword';
    const loadout = buildLoadoutFromSpec(dungeonSpecOf(save, cliff, floor));
    const rng = createRng(1);
    return { loadout, rng, state: createDefenseState(loadout, rng) };
  };

  it('每一層都有給定的符，規則字串帶著它（伺服器重播也組得出同一組）', () => {
    cliff.floors.forEach((floor, i) => {
      expect(floor.preset?.length ?? 0).toBeGreaterThan(5);
      const spec = dungeonSpecOf(createDefaultSave(1), cliff, i + 1);
      expect(spec.rules.some((r) => r.startsWith('preset:'))).toBe(true);
    });
  });

  it('開場：先擺上場、剩五張進手牌，張數和種類照資料', () => {
    const { loadout, state } = setup(1);
    expect(loadout.rules.noDraw).toBe(true);
    const cards = [...state.field, ...state.hand].filter((c) => c !== null);
    expect(cards.length).toBe(cliff.floors[0]!.preset!.length);
    expect(state.hand.every((c) => c !== null)).toBe(true);
  });

  it('整場不抽符，手牌也丟不掉', () => {
    const { state, rng } = setup(1);
    const before = [...state.field, ...state.hand].filter((c) => c !== null).length;
    for (let t = 0; t < 400; t += 1) tickCombat(state, 50, rng);
    const after = [...state.field, ...state.hand].filter((c) => c !== null).length;
    expect(after).toBeLessThanOrEqual(before);
    expect(discardHand(state, 0)).toBe(false);
  });
});
