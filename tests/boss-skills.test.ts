import { describe, it, expect } from 'vitest';
import { BOSS_SKILLS, ENEMIES, SECTS, bossSkill } from '../src/data';
import type { BossSkillKind } from '../src/data/types';
import type { ActiveEnemy, DefenseState } from '../src/systems/defense';
import { createDefenseState, skillStateFor, tickCombat, waveHp } from '../src/systems/defense';
import { buildLoadoutFor } from '../src/systems/loadout';
import { createRng } from '../src/systems/rng';

const TICK = 50;

/** 一場只剩一隻帶招式首領的戰鬥：出怪排程清空，首領直接站在場上。 */
function arena(kind: BossSkillKind, hp = 1e9): { state: DefenseState; boss: ActiveEnemy } {
  const sect = SECTS[0];
  if (sect === undefined) throw new Error('no sect');
  const state = createDefenseState(buildLoadoutFor(sect, {}, 1), createRng(7));
  state.queue = [];
  const boss: ActiveEnemy = {
    id: 999,
    name: '測試首領',
    art: 'demon',
    bossArt: 'demon',
    boss: true,
    hp,
    maxHp: hp,
    y: 100,
    lane: 2,
    speed: 30,
    slowUntilMs: 0,
    slowPercent: 0,
    burnRemaining: 0,
    burnPerMs: 0,
    burnSource: null,
    trait: 'none',
    spawnedBySplit: false,
    skill: skillStateFor(kind),
    wardHits: 0,
  };
  state.enemies = [boss];
  state.bossSpawnedAtMs = 0;
  return { state, boss };
}

function run(state: DefenseState, ms: number, rng = createRng(3)) {
  const reports = [];
  for (let t = 0; t < ms; t += TICK) reports.push(tickCombat(state, TICK, rng));
  return reports;
}

describe('首領招式資料', () => {
  it('二十個首領都有招式，八種招式都有人用', () => {
    const used = new Set(ENEMIES.bosses.map((boss) => boss.skill));
    for (const skill of BOSS_SKILLS) expect(used.has(skill.kind), skill.kind).toBe(true);
    for (const boss of ENEMIES.bosses) expect(boss.skillName.length).toBeGreaterThan(0);
  });

  it('同一個境界的兩個首領招式不同——同境界連打兩關不會是同一套打法', () => {
    const realms = new Set(ENEMIES.bosses.map((boss) => boss.realm));
    for (const realm of realms) {
      const kinds = ENEMIES.bosses.filter((boss) => boss.realm === realm).map((boss) => boss.skill);
      expect(new Set(kinds).size, realm).toBe(kinds.length);
    }
  });
});

describe('首領招式', () => {
  it('召喚：到時間就從首領兩側叫出護衛，血量看本關最後一波而不是首領', () => {
    const { state } = arena('summon');
    state.field = state.field.map(() => null);
    const def = bossSkill('summon');
    const reports = run(state, def.intervalMs + TICK);
    const spawned = reports.flatMap((report) => report.spawned);
    expect(spawned.length).toBe(def.count);
    expect(reports.some((report) => report.bossSkill === 'summon')).toBe(true);
    for (const minion of spawned) {
      expect(minion.boss).toBe(false);
      expect(minion.skill).toBeNull();
      expect(minion.maxHp).toBeCloseTo(waveHp(state.threat, 5) * def.amount, 6);
      expect(minion.lane).not.toBe(2);
    }
  });

  it('護體：罩上的護盾先吃傷害，打穿了才扣血', () => {
    const { state, boss } = arena('shield', 1000);
    state.field = state.field.map(() => null);
    run(state, bossSkill('shield').intervalMs + TICK);
    expect(boss.skill?.shield).toBeCloseTo(1000 * bossSkill('shield').amount, 6);
    state.field[0] = { type: 'sword', tier: 1 };
    const before = boss.hp;
    const shieldBefore = boss.skill?.shield ?? 0;
    run(state, 600);
    expect(boss.skill?.shield ?? 0).toBeLessThan(shieldBefore);
    // 一張一階劍陣符半秒內打不穿一百點護盾，血量一點都不該少。
    expect(boss.hp).toBe(before);
  });

  it('封符：被封的格位不出手；把符搬到別格就脫困', () => {
    const { state, boss } = arena('seal');
    state.field = state.field.map(() => null);
    state.field[4] = { type: 'sword', tier: 1 };
    // 先讓計時器剛好走完，封到唯一有符的第 4 格。
    const reports = run(state, bossSkill('seal').intervalMs);
    expect(reports.flatMap((report) => report.sealed)).toEqual([4]);
    const hp = boss.hp;
    const sealedShots = run(state, 1000).flatMap((report) => report.shots);
    expect(sealedShots.length).toBe(0);
    expect(boss.hp).toBe(hp);
    // 搬到第 0 格，立刻恢復出手。
    state.field[0] = state.field[4] ?? null;
    state.field[4] = null;
    const freed = run(state, 1000).flatMap((report) => report.shots);
    expect(freed.length).toBeGreaterThan(0);
  });

  it('衝鋒：衝鋒期間推進得比平常快得多', () => {
    const { state, boss } = arena('charge');
    state.field = state.field.map(() => null);
    const def = bossSkill('charge');
    run(state, def.intervalMs - TICK);
    const before = boss.y;
    run(state, def.durationMs);
    const dashed = boss.y - before;
    const normal = boss.speed * (def.durationMs / 1000);
    expect(dashed).toBeGreaterThan(normal * (def.speedMultiplier - 1));
  });

  it('回春：定期回血，但不會超過最大血量', () => {
    const { state, boss } = arena('regen', 1000);
    state.field = state.field.map(() => null);
    boss.hp = 500;
    run(state, bossSkill('regen').intervalMs + TICK);
    expect(boss.hp).toBeCloseTo(500 + 1000 * bossSkill('regen').amount, 6);
    boss.hp = 999;
    run(state, bossSkill('regen').intervalMs);
    expect(boss.hp).toBe(1000);
  });

  it('狂暴：過半血才發動，而且只發動一次；之後走得更快', () => {
    const { state, boss } = arena('rage', 1000);
    state.field = state.field.map(() => null);
    run(state, 2000);
    expect(boss.skill?.triggered).toBe(false);
    boss.hp = 400;
    const reports = run(state, 2000);
    expect(reports.filter((report) => report.bossSkill === 'rage').length).toBe(1);
    const before = boss.y;
    run(state, 1000);
    expect(boss.y - before).toBeCloseTo(boss.speed * bossSkill('rage').speedMultiplier, 0);
  });

  it('分身：過半血分出幻身，只分一次', () => {
    const { state, boss } = arena('mirror', 1000);
    state.field = state.field.map(() => null);
    boss.hp = 300;
    const reports = run(state, 3000);
    const shades = reports.flatMap((report) => report.spawned);
    expect(shades.length).toBe(bossSkill('mirror').count);
    expect(shades.every((shade) => shade.name.includes('幻身'))).toBe(true);
  });

  it('噬符：吃掉手牌裡最低階的那一張，手牌空了就沒得吃', () => {
    const { state } = arena('devour');
    state.field = state.field.map(() => null);
    state.drawTimer = 1e9;
    state.hand = state.hand.map(() => null);
    state.hand[0] = { type: 'sword', tier: 3 };
    state.hand[2] = { type: 'bolt', tier: 1 };
    const reports = run(state, bossSkill('devour').intervalMs + TICK);
    expect(reports.flatMap((report) => report.devoured)).toEqual([2]);
    expect(state.hand[0]).not.toBeNull();
    expect(state.hand[2]).toBeNull();
    state.hand = state.hand.map(() => null);
    const empty = run(state, bossSkill('devour').intervalMs);
    expect(empty.flatMap((report) => report.devoured)).toEqual([]);
  });

  it('同一個種子跑兩次，招式的每一個結果都一模一樣——伺服器重播才對得上', () => {
    const once = () => {
      const { state, boss } = arena('seal', 5000);
      run(state, 30_000, createRng(11));
      return [boss.hp, state.sealedUntil.join(','), state.elapsedMs].join('|');
    };
    expect(once()).toBe(once());
  });
});
