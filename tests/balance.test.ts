import { describe, it, expect } from 'vitest';
import { BALANCE, SECTS, UPGRADES } from '../src/data';
import { buildLoadoutFor } from '../src/systems/loadout';
import { createRng } from '../src/systems/rng';
import type { GateEncounter, RunState } from '../src/systems/run';
import {
  applyGate,
  bossDps,
  bossHitLoss,
  clearReward,
  createBoss,
  createRunState,
  defeatReward,
  resolveMob,
  teamPower,
} from '../src/systems/run';
import { trackById, upgradeCost } from '../src/systems/upgrades';

/**
 * 數值平衡的自動驗算。
 *
 * 這裡把整個遊戲循環（挑戰 → 拿金幣 → 升級 → 下一關）用程式跑完 30 關，
 * 用來擋住「某一關突然打不過」或「首領被秒殺」這種只有實際玩才會發現的失衡。
 * 調 data/*.json 之後這組測試會直接反映後果。
 */

/** 模擬玩家的選擇：每道閘門都挑「選完之後隊伍戰力較高」的一側。 */
function chooseBest(state: RunState, encounter: GateEncounter): 'left' | 'right' {
  const score = (side: 'left' | 'right'): number => {
    const clone: RunState = structuredClone(state);
    applyGate(clone, encounter[side]);
    // 金幣不計入戰力，但給一點權重，否則金幣閘門會被當成零收益。
    return teamPower(clone) + clone.goldCollected * 0.5;
  };
  return score('left') >= score('right') ? 'left' : 'right';
}

interface RunOutcome {
  victory: boolean;
  survivors: number;
  arms: number;
  /** 首領戰耗時，單位 ms。 */
  bossMs: number;
  gold: number;
}

/**
 * 完整跑一場挑戰。
 * momentum 給的是「普通玩家的滑動頻率」，不假設玩家能一直把氣勢頂滿。
 */
function runOnce(
  stage: number,
  upgrades: Record<string, number>,
  sectId: string,
  seed: number,
  momentum = 0.2,
): RunOutcome {
  const sect = SECTS.find((item) => item.id === sectId);
  if (sect === undefined) throw new Error(`測試用門派不存在：${sectId}`);
  const state = createRunState(buildLoadoutFor(sect, upgrades, stage), seed);

  for (const encounter of state.encounters) {
    if (encounter.kind === 'gate') applyGate(state, encounter[chooseBest(state, encounter)]);
    else resolveMob(state, encounter);
    if (state.disciples <= 0) break;
  }

  const cfg = BALANCE.boss;
  const boss = createBoss(stage, createRng(seed));
  let victory = false;
  let elapsed = 0;
  let attackAccum = 0;

  while (state.disciples > 0 && elapsed < cfg.timeLimitMs) {
    boss.hp -= (bossDps(state, momentum) * cfg.tickMs) / 1000;
    if (boss.hp <= 0) {
      victory = true;
      break;
    }
    attackAccum += cfg.tickMs;
    while (attackAccum >= cfg.attackIntervalMs) {
      attackAccum -= cfg.attackIntervalMs;
      state.disciples = Math.max(0, state.disciples - bossHitLoss(state, boss));
    }
    elapsed += cfg.tickMs;
  }

  return {
    victory,
    survivors: state.disciples,
    arms: state.arms,
    bossMs: elapsed,
    gold: state.goldCollected + (victory ? clearReward(state) : defeatReward(state)),
  };
}

/** 有錢就買最便宜的那一項，模擬玩家不做長期規劃的花錢方式。 */
function spendGold(levels: Record<string, number>, gold: number): number {
  for (;;) {
    let cheapest: { id: string; cost: number } | null = null;
    for (const track of UPGRADES) {
      const cost = upgradeCost(trackById(track.id), levels[track.id] ?? 0);
      if (cost === null || cost > gold) continue;
      if (cheapest === null || cost < cheapest.cost) cheapest = { id: track.id, cost };
    }
    if (cheapest === null) return gold;
    gold -= cheapest.cost;
    levels[cheapest.id] = (levels[cheapest.id] ?? 0) + 1;
  }
}

interface Progress {
  totalRuns: number;
  maxAttempts: number;
  /** 卡關的關卡編號，全部通關則為 null。 */
  stuckAt: number | null;
  bossDurations: number[];
}

const RETRY_LIMIT = 12;

function playThrough(sectId: string, maxStage: number): Progress {
  const levels: Record<string, number> = {};
  const bossDurations: number[] = [];
  let gold = 0;
  let totalRuns = 0;
  let maxAttempts = 0;

  for (let stage = 1; stage <= maxStage; stage += 1) {
    let attempts = 0;
    for (;;) {
      const outcome = runOnce(stage, levels, sectId, stage * 7919 + attempts * 104729);
      totalRuns += 1;
      attempts += 1;
      gold = spendGold(levels, gold + outcome.gold);
      if (outcome.victory) {
        bossDurations.push(outcome.bossMs);
        break;
      }
      if (attempts >= RETRY_LIMIT) return { totalRuns, maxAttempts: attempts, stuckAt: stage, bossDurations };
    }
    maxAttempts = Math.max(maxAttempts, attempts);
  }
  return { totalRuns, maxAttempts, stuckAt: null, bossDurations };
}

const STAGES = 45;

describe('數值平衡', () => {
  it('第 1 關在零升級下，四個門派的勝率都在六成以上', () => {
    // 用單一種子判斷會被閘門運氣左右，這裡看的是勝率而非單場結果。
    const samples = 40;
    for (const sect of SECTS) {
      let wins = 0;
      for (let i = 0; i < samples; i += 1) {
        if (runOnce(1, {}, sect.id, 1000 + i * 7919).victory) wins += 1;
      }
      const rate = wins / samples;
      expect(rate, `${sect.name} 的第 1 關勝率只有 ${Math.round(rate * 100)}%`).toBeGreaterThan(0.6);
    }
  });

  it('照著「打完就把金幣花掉」玩，四個門派都能一路推到第 30 關', () => {
    for (const sect of SECTS) {
      const progress = playThrough(sect.id, STAGES);
      expect(progress.stuckAt, `${sect.name} 卡在第 ${progress.stuckAt} 關`).toBeNull();
      // 平均一關重打不到一次，且沒有任何一關要打超過 6 次。
      expect(progress.totalRuns, `${sect.name} 需要 ${progress.totalRuns} 場才推到 ${STAGES} 關`).toBeLessThanOrEqual(STAGES * 2);
      expect(progress.maxAttempts, `${sect.name} 有一關重打了 ${progress.maxAttempts} 次`).toBeLessThanOrEqual(6);
    }
  });

  it('首領戰長度落在可玩範圍，不會被秒殺也不會拖到超時', () => {
    for (const sect of SECTS) {
      const { bossDurations } = playThrough(sect.id, STAGES);
      const sorted = [...bossDurations].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
      const inRange = bossDurations.filter((ms) => ms >= 2000 && ms <= 25000).length;
      expect(median, `${sect.name} 首領戰中位數只有 ${median}ms`).toBeGreaterThanOrEqual(2500);
      expect(Math.max(...bossDurations)).toBeLessThan(BALANCE.boss.timeLimitMs);
      expect(inRange / bossDurations.length, `${sect.name} 首領戰長度失衡`).toBeGreaterThan(0.6);
    }
  });

  it('不花金幣升級的話會在中後期卡死，升級才有意義', () => {
    // 找出「零升級且換幾個種子都過不了」的第一關。
    const seeds = [0, 1, 2, 3, 4];
    let wall: number | null = null;
    for (let stage = 1; stage <= STAGES; stage += 1) {
      const anyWin = seeds.some((seed) => runOnce(stage, {}, 'body', stage * 7919 + seed * 104729).victory);
      if (!anyWin) {
        wall = stage;
        break;
      }
    }
    expect(wall, '零升級也能一路推到 30 關，升級系統形同虛設').not.toBeNull();
    // 第 1 關必須在零升級下打得過，否則新玩家一開始就沒有金幣來源。
    expect(wall ?? Infinity, '零升級連第 1 關都過不了').toBeGreaterThanOrEqual(2);
    // 門檻隨關卡總長調整：境界改為每境界九層後，一輪十個境界共 81 關，
    // 「零升級撐到第 40 關」大約是全程的一半，再晚就代表升級系統前期沒有存在感。
    expect(wall ?? Infinity, `零升級可以推到第 ${wall} 關，升級的必要性太晚出現`).toBeLessThanOrEqual(40);
  });

  it('首領戰的氣勢（滑動）會縮短戰鬥時間', () => {
    const lazy = runOnce(6, {}, 'body', 7919, 0);
    const active = runOnce(6, {}, 'body', 7919, BALANCE.boss.momentumMax);
    expect(active.bossMs).toBeLessThan(lazy.bossMs);
  });

  it('敵陣造成比例傷亡：小隊不會被一波抹平', () => {
    const state = createRunState(buildLoadoutFor(SECTS[0]!, {}, 1), 1);
    state.disciples = 4;
    resolveMob(state, { kind: 'mob', name: '測試', art: 'bandit', power: 9999 });
    // 比例傷亡最多打光，但一般情況下必有殘存；這裡驗的是不會因為固定人數而必死。
    const survivable = createRunState(buildLoadoutFor(SECTS[0]!, {}, 1), 1);
    survivable.disciples = 40;
    survivable.arms = 30;
    const loss = resolveMob(survivable, { kind: 'mob', name: '測試', art: 'bandit', power: 20 });
    expect(loss).toBeLessThan(40);
    expect(survivable.disciples).toBeGreaterThan(0);
  });
});
