import { describe, it, expect } from 'vitest';
import { BLESSINGS, SECTS } from '../src/data';
import type { Sect } from '../src/data/types';
import {
  blessingText,
  blessingValue,
  offerPool,
  rollOffer,
  sanitizeBlessings,
  takeBlessing,
  valueAtStars,
} from '../src/systems/blessings';
import type { OfferContext } from '../src/systems/blessings';
import { createDefenseState, discardHand, mergeInto, tickCombat } from '../src/systems/defense';
import { applyBlessings, buildLoadoutFor, buildLoadoutFromSpec } from '../src/systems/loadout';
import { createRng } from '../src/systems/rng';
import { starterTalismans } from '../src/systems/talismans';

function sect(id: string): Sect {
  const found = SECTS.find((item) => item.id === id);
  if (found === undefined) throw new Error(id);
  return found;
}

function stateWith(blessings: Record<string, number>, stage = 5, seed = 7) {
  const loadout = buildLoadoutFor(sect('sword'), {}, stage);
  applyBlessings(loadout, blessings);
  return createDefenseState(loadout, createRng(seed));
}

const ctx = (over: Partial<OfferContext> = {}): OfferContext => ({
  owned: {},
  unlocked: [],
  sectId: 'sword',
  talismans: starterTalismans(),
  rare: false,
  ...over,
});

describe('機緣資料', () => {
  it('開局卡池攻守運各四張，加上該門派一張專屬', () => {
    for (const s of SECTS) {
      const pool = offerPool(ctx({ sectId: s.id }));
      const count = (c: string) => pool.filter((def) => def.category === c && def.sect === null).length;
      expect(count('attack'), s.id).toBe(4);
      expect(count('guard'), s.id).toBe(4);
      expect(count('fortune'), s.id).toBe(4);
      expect(pool.filter((def) => def.sect === s.id)).toHaveLength(1);
    }
  });

  it('開局稀有卡池有兩張', () => {
    expect(offerPool(ctx({ rare: true }))).toHaveLength(2);
  });

  it('每一張機緣的說明都寫得出三星的數值', () => {
    for (const def of BLESSINGS) {
      for (let star = 1; star <= def.values.length; star += 1) {
        expect(blessingText(def, star)).not.toContain('{v}');
      }
    }
  });

  it('萬法歸宗把三星往外推成四星', () => {
    const def = BLESSINGS.find((item) => item.id === 'concord')!;
    expect(valueAtStars(def, 4)).toBeCloseTo(0.32);
    expect(blessingValue({ concord: 3, allStar: 1 }, 'concord')).toBeCloseTo(0.32);
  });
});

describe('三選一', () => {
  it('不會三張全是攻', () => {
    for (let seed = 1; seed < 200; seed += 1) {
      const ids = rollOffer(ctx(), createRng(seed));
      expect(ids).toHaveLength(3);
      expect(new Set(ids).size).toBe(3);
      const cats = ids.map((id) => BLESSINGS.find((d) => d.id === id)!.category);
      expect(cats.some((c) => c !== 'attack'), ids.join()).toBe(true);
    }
  });

  it('沒帶的符，綁定它的機緣不出現；解鎖之後才進池', () => {
    const plain = offerPool(ctx({ unlocked: ['fireIce'] })).map((d) => d.id);
    expect(plain).not.toContain('fireIce');
    const withFrost = offerPool(ctx({ unlocked: ['fireIce'], talismans: ['frost', 'flame', 'sword', 'bolt'] })).map((d) => d.id);
    expect(withFrost).toContain('fireIce');
    const locked = offerPool(ctx({ talismans: ['frost', 'flame', 'sword', 'bolt'] })).map((d) => d.id);
    expect(locked).not.toContain('fireIce');
  });

  it('三星的機緣不再出現；選同一張是升星', () => {
    let owned = takeBlessing({}, 'guardian');
    owned = takeBlessing(owned, 'guardian');
    expect(owned['guardian']).toBe(2);
    owned = takeBlessing(owned, 'guardian');
    expect(offerPool(ctx({ owned })).map((d) => d.id)).not.toContain('guardian');
  });

  it('存檔與上報的機緣表會被清洗', () => {
    expect(sanitizeBlessings({ guardian: 9, nope: 1, revive: 3, zhuxie: -1 })).toEqual({ guardian: 3, revive: 1 });
    expect(sanitizeBlessings('x')).toEqual({});
  });
});

describe('機緣效果', () => {
  it('沒有機緣的一場和以前完全一樣（亂數序列不被多擲）', () => {
    const run = (withEmpty: boolean) => {
      const loadout = buildLoadoutFor(sect('sword'), {}, 12);
      if (withEmpty) applyBlessings(loadout, {});
      const state = createDefenseState(loadout, createRng(99));
      const rng = createRng(5);
      for (let i = 0; i < 400; i += 1) tickCombat(state, 100, rng);
      return [state.kills, state.leaks, Math.round(state.gold), state.disciples];
    };
    expect(run(true)).toEqual(run(false));
  });

  it('疾抽與陣眼在開場就改掉配置', () => {
    const base = buildLoadoutFor(sect('sword'), {}, 5);
    const blessed = buildLoadoutFor(sect('sword'), {}, 5);
    applyBlessings(blessed, { quickDraw: 3, formationEye: 1 });
    expect(blessed.drawSpeedMultiplier).toBeCloseTo(base.drawSpeedMultiplier / 0.8);
    expect(blessed.formationMultiplier).toBeCloseTo(1.1);
  });

  it('金鐘罩：前幾次漏怪不扣耐久', () => {
    const state = stateWith({ goldenBell: 2 });
    state.field.fill(null);
    state.hand.fill(null);
    const rng = createRng(1);
    for (let i = 0; i < 400 && state.leaks < 2; i += 1) tickCombat(state, 100, rng);
    expect(state.leaks).toBeGreaterThanOrEqual(2);
    expect(state.disciples).toBe(state.maxDisciples);
  });

  it('同心滿值時合成必定多升一階；一氣化三清留下低兩階的符', () => {
    const state = stateWith({ trinity: 1 }, 20);
    state.bless = { ...state.bless, concord: 1 };
    state.hand[0] = { type: 'sword', tier: 3 };
    state.hand[1] = { type: 'sword', tier: 3 };
    expect(mergeInto(state, { where: 'hand', index: 0 }, { where: 'hand', index: 1 }, createRng(3))).toBe(true);
    expect(state.hand[1]).toEqual({ type: 'sword', tier: 5 });
    expect(state.hand[0]).toEqual({ type: 'sword', tier: 3 });
  });

  it('九轉還魂：山門被破時回滿一次', () => {
    const state = stateWith({ revive: 1 });
    state.disciples = 0;
    const report = tickCombat(state, 100, createRng(1));
    expect(report.revived).toBe(true);
    expect(state.outcome).toBe('running');
    expect(state.disciples).toBe(state.maxDisciples);
    state.disciples = 0;
    tickCombat(state, 100, createRng(1));
    expect(state.outcome).toBe('defeated');
  });

  it('護山大陣：每一波開始時補弟子', () => {
    const state = stateWith({ guardian: 3 });
    state.disciples = 1;
    tickCombat(state, 100, createRng(1));
    expect(state.disciples).toBe(4);
  });

  it('斷捨離：棄一張符，抽符計時往前推', () => {
    const state = stateWith({ letGo: 3 });
    state.hand[0] = { type: 'sword', tier: 1 };
    const before = state.drawTimer;
    discardHand(state, 0);
    expect(state.drawTimer).toBeLessThan(before);
  });

  it('一境一局：帶著上一關剩下的耐久開打，但不超過上限', () => {
    const spec = {
      sectId: 'sword',
      stage: 3,
      libraryFloor: 0,
      talismans: starterTalismans(),
      upgrades: {},
      karma: {},
      sectClears: 0,
      sectDepth: 0,
      rules: [],
      goldMultiplier: 1,
      bankedStage: 0,
      rebirths: 0,
    };
    const full = createDefenseState(buildLoadoutFromSpec(spec), createRng(1));
    const carried = createDefenseState(buildLoadoutFromSpec({ ...spec, gate: 7, blessings: { guardian: 1 } }), createRng(1));
    expect(carried.disciples).toBe(7);
    expect(carried.maxDisciples).toBe(full.maxDisciples);
    expect(carried.bless['guardian']).toBe(1);
    const over = createDefenseState(buildLoadoutFromSpec({ ...spec, gate: 9999 }), createRng(1));
    expect(over.disciples).toBe(full.maxDisciples);
    // 副本不吃機緣與帶入耐久
    const dungeon = createDefenseState(buildLoadoutFromSpec({ ...spec, rules: ['noMerge'], gate: 7, blessings: { guardian: 1 } }), createRng(1));
    expect(dungeon.disciples).toBe(full.maxDisciples);
    expect(dungeon.bless).toEqual({});
  });
});
