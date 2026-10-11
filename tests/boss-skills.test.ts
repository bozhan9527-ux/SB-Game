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
    bossArt: 'ape',
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
  it('每個首領都有招式，每一種招式都有人用', () => {
    const used = new Set(ENEMIES.bosses.map((boss) => boss.skill));
    for (const skill of BOSS_SKILLS) expect(used.has(skill.kind), skill.kind).toBe(true);
    for (const boss of ENEMIES.bosses) expect(boss.skillName.length).toBeGreaterThan(0);
  });

  it('同一個境界的首領招式各不相同——同境界連打幾關不會是同一套打法', () => {
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

  it('萬妖號令：一陣子裡小妖走得更快，首領自己不加速', () => {
    const { state, boss } = arena('haste');
    state.field = state.field.map(() => null);
    const def = bossSkill('haste');
    const mob: ActiveEnemy = { ...boss, id: 1, boss: false, skill: null, y: 0, speed: 20, hp: 1e9, maxHp: 1e9 };
    state.enemies.push(mob);
    run(state, def.intervalMs);
    const before = mob.y;
    const bossBefore = boss.y;
    run(state, 1000);
    expect(mob.y - before).toBeCloseTo(20 * def.speedMultiplier, 0);
    expect(boss.y - bossBefore).toBeCloseTo(boss.speed, 0);
    run(state, def.durationMs);
    const after = mob.y;
    run(state, 1000);
    expect(mob.y - after).toBeCloseTo(20, 0);
  });

  it('蝕靈咒：被蝕的那一排照樣出手，但每一發都打折', () => {
    const def = bossSkill('curse');
    const damageOf = (cursed: boolean) => {
      const { state, boss } = arena('curse');
      state.field = state.field.map(() => null);
      state.field[0] = { type: 'sword', tier: 5 };
      boss.skill = null;
      if (cursed) {
        state.cursedUntil[0] = 1e9;
        state.curseAmount = def.amount;
      }
      const hp = boss.hp;
      run(state, 2000);
      return hp - boss.hp;
    };
    const plain = damageOf(false);
    expect(plain).toBeGreaterThan(0);
    expect(damageOf(true)).toBeCloseTo(plain * (1 - def.amount), 3);
  });

  it('蝕靈咒：一次蝕一整排（三格），挑的是有符的那一排', () => {
    const { state } = arena('curse');
    state.field = state.field.map(() => null);
    state.field[4] = { type: 'sword', tier: 2 };
    const reports = run(state, bossSkill('curse').intervalMs + TICK);
    expect(reports.flatMap((report) => report.cursed).sort()).toEqual([3, 4, 5]);
  });

  it('亂神咒：抽符變慢，時間到恢復', () => {
    const def = bossSkill('confuse');
    const drawsIn = (confused: boolean) => {
      const { state } = arena('confuse');
      state.field = state.field.map(() => null);
      state.hand = state.hand.map(() => null);
      state.enemies[0]!.skill = null;
      if (confused) {
        state.confusedUntil = 1e9;
        state.confuseMultiplier = def.speedMultiplier;
      }
      let drawn = 0;
      for (let t = 0; t < 20_000; t += TICK) {
        const report = tickCombat(state, TICK, createRng(5));
        if (report.drawnSlot !== null) {
          drawn += 1;
          state.hand = state.hand.map(() => null);
        }
      }
      return drawn;
    };
    expect(drawsIn(true)).toBeLessThan(drawsIn(false));
  });

  it('金剛不壞：直擊打折，灼燒照樣燒得進去', () => {
    const def = bossSkill('harden');
    const { state, boss } = arena('harden');
    state.field = state.field.map(() => null);
    boss.skill!.hardenUntilMs = 1e9;
    boss.skill!.timerMs = 1e9;
    state.field[0] = { type: 'sword', tier: 5 };
    const hp = boss.hp;
    run(state, 2000);
    const hardened = hp - boss.hp;
    const other = arena('harden');
    other.state.field = other.state.field.map(() => null);
    other.boss.skill!.timerMs = 1e9;
    other.state.field[0] = { type: 'sword', tier: 5 };
    const hp2 = other.boss.hp;
    run(other.state, 2000);
    expect(hardened).toBeCloseTo((hp2 - other.boss.hp) * (1 - def.amount), 3);
    // 灼燒走另一條路，不受金剛不壞影響
    boss.burnRemaining = 1000;
    boss.burnPerMs = 1;
    state.field = state.field.map(() => null);
    const before = boss.hp;
    run(state, 500);
    expect(before - boss.hp).toBeCloseTo(500, 0);
  });

  it('移形換位：兩張不同種的符對調，冷卻跟著符走', () => {
    const { state } = arena('swap');
    state.field = state.field.map(() => null);
    state.field[0] = { type: 'sword', tier: 3 };
    state.field[8] = { type: 'bolt', tier: 2 };
    const reports = run(state, bossSkill('swap').intervalMs + TICK);
    const swapped = reports.map((report) => report.swapped).find((pair) => pair !== null);
    expect(swapped?.slice().sort()).toEqual([0, 8]);
    expect(state.field[0]?.type).toBe('bolt');
    expect(state.field[8]?.type).toBe('sword');
  });

  it('碎符：場上最高階的那張降一階，一階的不會再碎', () => {
    const { state } = arena('shatter');
    state.field = state.field.map(() => null);
    state.field[1] = { type: 'sword', tier: 6 };
    state.field[2] = { type: 'bolt', tier: 4 };
    const reports = run(state, bossSkill('shatter').intervalMs + TICK);
    expect(reports.map((report) => report.shattered).filter((slot) => slot !== null)).toEqual([1]);
    expect(state.field[1]?.tier).toBe(5);
    state.field = state.field.map(() => null);
    state.field[0] = { type: 'sword', tier: 1 };
    const none = run(state, bossSkill('shatter').intervalMs + TICK);
    expect(none.every((report) => report.shattered === null)).toBe(true);
    expect(state.field[0]?.tier).toBe(1);
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
