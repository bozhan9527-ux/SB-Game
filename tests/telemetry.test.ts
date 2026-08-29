/**
 * 戰績的換算。
 *
 * 這幾條守的是「數字不會騙人」：貢獻加起來要是一，陣法平均要是時間加權的，
 * 灼燒的傷害要記回點火那張符頭上——不然焚天符的戰報永遠是零，玩家會以為它沒用。
 */
import { describe, expect, it } from 'vitest';
import { SECTS } from '../src/data';
import type { Sect } from '../src/data/types';
import { createDefenseState, tickCombat } from '../src/systems/defense';
import type { ActiveEnemy, DefenseState } from '../src/systems/defense';
import { buildLoadoutFor } from '../src/systems/loadout';
import { createRng } from '../src/systems/rng';
import { starterTalismans, talismanDefs } from '../src/systems/talismans';
import {
  averageDps,
  averageFormationBonus,
  damageShares,
  dpsCurve,
  totalDamage,
} from '../src/systems/telemetry';

function sect(id = 'body'): Sect {
  const found = SECTS.find((item) => item.id === id);
  if (found === undefined) throw new Error(id);
  return found;
}

function lab(types: string[], tier = 8): DefenseState {
  const pool = talismanDefs([...types, ...starterTalismans()], 999);
  const state = createDefenseState(buildLoadoutFor(sect(), {}, 1, pool), createRng(7));
  state.field.fill(null);
  state.hand.fill(null);
  types.forEach((type, i) => {
    state.field[i] = { type, tier };
  });
  state.queue = [];
  state.enemies = [dummy()];
  return state;
}

function dummy(): ActiveEnemy {
  return {
    id: 1,
    name: 'x',
    art: 'bandit',
    bossArt: null,
    boss: false,
    hp: 1e9,
    maxHp: 1e9,
    y: 0,
    lane: 2,
    speed: 0,
    slowUntilMs: 0,
    slowPercent: 0,
    burnRemaining: 0,
    burnPerMs: 0,
    burnSource: null,
    trait: 'none',
    spawnedBySplit: false,
  };
}

function run(state: DefenseState, durationMs: number): void {
  let elapsed = 0;
  while (elapsed < durationMs) {
    tickCombat(state, 100, createRng(elapsed + 1));
    elapsed += 100;
  }
}

describe('戰績', () => {
  it('每一發都記到對應的符種，貢獻加起來就是全場總傷害', () => {
    const state = lab(['sword', 'bolt']);
    run(state, 5000);
    const shares = damageShares(state.telemetry);
    expect(shares.map((item) => item.type).sort()).toEqual(['bolt', 'sword']);
    const sum = shares.reduce((total, item) => total + item.damage, 0);
    expect(sum).toBeCloseTo(totalDamage(state.telemetry), 5);
    expect(shares.reduce((total, item) => total + item.share, 0)).toBeCloseTo(1, 5);
  });

  it('由多到少排序', () => {
    const state = lab(['spirit', 'myriad']);
    run(state, 5000);
    const shares = damageShares(state.telemetry);
    for (let i = 1; i < shares.length; i += 1) {
      expect(shares[i - 1]?.damage ?? 0).toBeGreaterThanOrEqual(shares[i]?.damage ?? 0);
    }
  });

  it('灼燒的傷害記回點火那張符，不會憑空消失', () => {
    // 焚天符自己那一發不高，價值全在後續的灼燒。若灼燒不記帳，
    // 戰報會顯示它幾乎沒有貢獻，玩家就會把一張好符換掉。
    const state = lab(['pyre']);
    run(state, 6000);
    const shares = damageShares(state.telemetry);
    expect(shares).toHaveLength(1);
    expect(shares[0]?.type).toBe('pyre');
    expect(totalDamage(state.telemetry)).toBeGreaterThan(0);
  });

  it('平均每秒輸出對得上總傷害', () => {
    const state = lab(['sword']);
    run(state, 4000);
    expect(averageDps(state.telemetry, state.elapsedMs)).toBeCloseTo(
      (totalDamage(state.telemetry) * 1000) / state.elapsedMs,
      5,
    );
  });

  it('沒有陣法時平均加成是 0，成陣之後為正', () => {
    const plain = lab(['sword']);
    run(plain, 2000);
    expect(averageFormationBonus(plain.telemetry)).toBeCloseTo(0, 6);

    const lined = lab(['sword', 'sword', 'sword']);
    run(lined, 2000);
    expect(averageFormationBonus(lined.telemetry)).toBeGreaterThan(0);
    expect(lined.telemetry.peakFormationLines).toBeGreaterThan(0);
  });

  it('輸出曲線壓成固定點數，長度不隨場次長度暴增', () => {
    const state = lab(['sword']);
    run(state, 90_000);
    expect(state.telemetry.damagePerSecond.length).toBeGreaterThan(30);
    expect(dpsCurve(state.telemetry, 30)).toHaveLength(30);
    // 短場次不補點：三十秒的場硬拉成三十個點只是插值出假的形狀。
    const short = lab(['sword']);
    run(short, 5000);
    expect(dpsCurve(short.telemetry, 30).length).toBeLessThanOrEqual(6);
  });
});
