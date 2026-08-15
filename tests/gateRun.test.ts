import { describe, it, expect } from 'vitest';
import {
  createRun,
  step,
  chooseSide,
  attackAfterGates,
  type GateRunState,
} from '../src/systems/gateRun';
import type { GateRunConfig, Gates } from '../src/data/types';

const cfg: GateRunConfig = {
  speedZPerSecond: 4,
  gateSpacingZ: 4,
  firstGateZ: 8,
  deadZoneX: 0.12,
  playerMaxX: 1,
  wallHitGelPenalty: 20,
};

const gates: Gates = {
  types: {
    good: { label: '攻擊 ×2', effects: [{ stat: 'attack', op: 'mul', value: 2 }] },
    plus: { label: '攻擊 +20', effects: [{ stat: 'attack', op: 'add', value: 20 }] },
    gel: { label: '凝膠 +40', effects: [{ stat: 'gel', op: 'add', value: 40 }] },
    drain: { label: '凝膠 -30', effects: [{ stat: 'gel', op: 'add', value: -30 }] },
  },
  pairs: [{ left: 'good', right: 'gel' }],
};

const GEL_MAX = 100;

function makeRun(gateCount: number, startGel = 100): GateRunState {
  return createRun(gates, cfg, {
    gateCount,
    startGel,
    gelMax: GEL_MAX,
    startShield: 0,
    random: () => 0,
  });
}

/** 以固定步長推進，模擬穩定畫格率。 */
function run(state: GateRunState, ms: number, playerX: number, stepMs = 16) {
  let s = state;
  const events = [];
  for (let t = 0; t < ms; t += stepMs) {
    const r = step(s, stepMs, playerX, gates, cfg, GEL_MAX);
    s = r.state;
    events.push(...r.events);
  }
  return { state: s, events };
}

describe('選邊判定', () => {
  it('死區內視為未選擇', () => {
    expect(chooseSide(0, 0.12)).toBe('wall');
    expect(chooseSide(0.12, 0.12)).toBe('wall');
    expect(chooseSide(-0.12, 0.12)).toBe('wall');
  });

  it('死區外依正負判定左右', () => {
    expect(chooseSide(-0.13, 0.12)).toBe('left');
    expect(chooseSide(0.13, 0.12)).toBe('right');
  });
});

describe('閘門推進', () => {
  it('推進量由時間決定，與畫格率無關', () => {
    // 同樣 2 秒，60fps 與 20fps 應推進到相同距離
    const smooth = run(makeRun(3), 2000, -0.5, 16);
    const choppy = run(makeRun(3), 2000, -0.5, 50);
    expect(smooth.state.travelled).toBeCloseTo(choppy.state.travelled, 1);
    expect(smooth.state.gates.filter((g) => g.resolved).length).toBe(
      choppy.state.gates.filter((g) => g.resolved).length,
    );
  });

  it('停在中線通過閘門會撞牆並扣凝膠', () => {
    const r = run(makeRun(1), 3000, 0);
    const gateEvents = r.events.filter((e) => e.type === 'gate');
    expect(gateEvents).toHaveLength(1);
    expect(gateEvents[0]).toMatchObject({ choice: 'wall', gateId: null });
    expect(r.state.stats.gel).toBe(100 - cfg.wallHitGelPenalty);
  });

  it('選左邊套用左邊閘門的效果', () => {
    const r = run(makeRun(1), 3000, -0.8);
    expect(r.state.stats.attackMul).toBe(2);
    expect(r.state.stats.gel).toBe(100);
  });

  it('選右邊套用右邊閘門的效果', () => {
    const r = run(makeRun(1), 3000, 0.8);
    expect(r.state.stats.attackMul).toBe(1);
    // gel 已在上限，+40 應被夾住
    expect(r.state.stats.gel).toBe(GEL_MAX);
  });

  it('凝膠不會超過上限也不會低於零', () => {
    const low = run(makeRun(1, 10), 3000, 0);
    expect(low.state.stats.gel).toBe(0);

    const high = run(makeRun(1, 80), 3000, 0.8);
    expect(high.state.stats.gel).toBe(GEL_MAX);
  });

  it('所有閘門通過後結束，且只發出一次 finished', () => {
    const r = run(makeRun(3), 12000, -0.8);
    expect(r.state.finished).toBe(true);
    expect(r.events.filter((e) => e.type === 'finished')).toHaveLength(1);
  });

  it('結束後再推進不會有任何變化', () => {
    const done = run(makeRun(1), 5000, -0.8);
    const after = step(done.state, 1000, 0.8, gates, cfg, GEL_MAX);
    expect(after.events).toHaveLength(0);
    expect(after.state).toBe(done.state);
  });

  it('閘門依序解析，不會跳號', () => {
    const r = run(makeRun(3), 12000, -0.8);
    const indices = r.events
      .filter((e) => e.type === 'gate')
      .map((e) => (e.type === 'gate' ? e.index : -1));
    expect(indices).toEqual([0, 1, 2]);
  });

  it('單一超大時間步不會漏判閘門', () => {
    // 掉幀導致一次 delta 跨過多道閘門時，全部都要被結算
    const r = step(makeRun(3), 10000, -0.8, gates, cfg, GEL_MAX);
    expect(r.state.gates.every((g) => g.resolved)).toBe(true);
    expect(r.events.filter((e) => e.type === 'gate')).toHaveLength(3);
  });
});

describe('反擊傷害公式', () => {
  it('先加後乘', () => {
    expect(attackAfterGates(10, { attackAdd: 20, attackMul: 2, gel: 0, shield: 0 })).toBe(60);
  });

  it('與閘門選擇順序無關', () => {
    const a = attackAfterGates(10, { attackAdd: 20, attackMul: 3, gel: 0, shield: 0 });
    const b = attackAfterGates(10, { attackAdd: 20, attackMul: 3, gel: 0, shield: 0 });
    expect(a).toBe(b);
  });
});
