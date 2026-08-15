import type { GateRunConfig, Gates, GateEffect } from '../data/types';

/**
 * 階段 A（閘門推進）的推進與判定邏輯。見 TECH_SPEC 第 4.6 節。
 *
 * 硬性要求：不含 Phaser。輸入為經過的毫秒數與玩家橫向位置，
 * 輸出為閘門狀態與結算事件，BattleScene 只負責把狀態畫出來。
 *
 * 這樣做的理由：閘門判定是本作最核心也最容易出錯的規則，
 * 必須能在測試中以固定的時間序列重現。
 */

export type GateChoice = 'left' | 'right' | 'wall';

export interface RunGate {
  /** 這道閘門在攝影機前方的距離，隨時間遞減。 */
  z: number;
  left: string;
  right: string;
  resolved: boolean;
  choice: GateChoice | null;
}

export interface RunStats {
  /** 閘門的加法加成總和。 */
  attackAdd: number;
  /** 閘門的乘法加成總積。 */
  attackMul: number;
  gel: number;
  shield: number;
}

export interface GateRunState {
  gates: RunGate[];
  stats: RunStats;
  /** 已經推進的總距離，用來畫路面條紋。 */
  travelled: number;
  finished: boolean;
}

export interface GateResolvedEvent {
  type: 'gate';
  index: number;
  choice: GateChoice;
  /** 撞牆時為 null。 */
  gateId: string | null;
}

export interface RunFinishedEvent {
  type: 'finished';
}

export type RunEvent = GateResolvedEvent | RunFinishedEvent;

export interface StepResult {
  state: GateRunState;
  events: RunEvent[];
}

export interface StartOptions {
  gateCount: number;
  startGel: number;
  gelMax: number;
  startShield: number;
  /** 回傳 [0, 1) 的亂數，測試時可注入固定序列。 */
  random: () => number;
}

/** 建立一場閘門推進的初始狀態。 */
export function createRun(
  gates: Gates,
  cfg: GateRunConfig,
  opts: StartOptions,
): GateRunState {
  const runGates: RunGate[] = [];
  for (let i = 0; i < opts.gateCount; i++) {
    const pair = gates.pairs[Math.floor(opts.random() * gates.pairs.length) % gates.pairs.length];
    // pairs 已由 zod 驗證為非空陣列，索引必然命中；此處僅為滿足型別檢查。
    if (pair === undefined) continue;
    runGates.push({
      z: cfg.firstGateZ + i * cfg.gateSpacingZ,
      left: pair.left,
      right: pair.right,
      resolved: false,
      choice: null,
    });
  }

  return {
    gates: runGates,
    stats: {
      attackAdd: 0,
      attackMul: 1,
      gel: opts.startGel,
      shield: opts.startShield,
    },
    travelled: 0,
    finished: runGates.length === 0,
  };
}

function applyEffects(stats: RunStats, effects: GateEffect[], gelMax: number): RunStats {
  const next: RunStats = { ...stats };
  for (const e of effects) {
    switch (e.stat) {
      case 'attack':
        if (e.op === 'mul') next.attackMul *= e.value;
        else next.attackAdd += e.value;
        break;
      case 'gel':
        next.gel = e.op === 'mul' ? next.gel * e.value : next.gel + e.value;
        break;
      case 'shield':
        next.shield = e.op === 'mul' ? next.shield * e.value : next.shield + e.value;
        break;
    }
  }
  next.gel = Math.max(0, Math.min(gelMax, next.gel));
  next.shield = Math.max(0, next.shield);
  return next;
}

/**
 * 依玩家的橫向位置判定選中哪一邊。
 * 落在中線死區內視為未選擇（撞牆），見 GAME_DESIGN 第 3.2 節。
 */
export function chooseSide(playerX: number, deadZoneX: number): GateChoice {
  if (Math.abs(playerX) <= deadZoneX) return 'wall';
  return playerX < 0 ? 'left' : 'right';
}

/**
 * 推進一個時間步。
 *
 * @param deltaMs 經過的毫秒數。推進量由時間決定，不由畫格決定——
 *                低階手機掉幀時閘門的抵達時機不得改變。
 * @param playerX 玩家當下的橫向位置
 */
export function step(
  state: GateRunState,
  deltaMs: number,
  playerX: number,
  gates: Gates,
  cfg: GateRunConfig,
  gelMax: number,
): StepResult {
  if (state.finished) return { state, events: [] };

  const advance = (cfg.speedZPerSecond * deltaMs) / 1000;
  const events: RunEvent[] = [];

  let stats = state.stats;
  const nextGates = state.gates.map((g) => ({ ...g, z: g.z - advance }));

  for (let i = 0; i < nextGates.length; i++) {
    const g = nextGates[i];
    if (g === undefined || g.resolved || g.z > 0) continue;

    const choice = chooseSide(playerX, cfg.deadZoneX);
    g.resolved = true;
    g.choice = choice;

    if (choice === 'wall') {
      stats = { ...stats, gel: Math.max(0, stats.gel - cfg.wallHitGelPenalty) };
      events.push({ type: 'gate', index: i, choice, gateId: null });
    } else {
      const gateId = choice === 'left' ? g.left : g.right;
      const type = gates.types[gateId];
      if (type !== undefined) stats = applyEffects(stats, type.effects, gelMax);
      events.push({ type: 'gate', index: i, choice, gateId });
    }
  }

  const finished = nextGates.every((g) => g.resolved);
  if (finished && !state.finished) events.push({ type: 'finished' });

  return {
    state: {
      gates: nextGates,
      stats,
      travelled: state.travelled + advance,
      finished,
    },
    events,
  };
}

/**
 * 閘門加成後的反擊傷害。
 *
 * 公式為 `(基礎攻擊 + 加法總和) × 乘法總積`，刻意與閘門的選擇順序無關——
 * 玩家是照閘門出現的順序被動選擇的，若結果隨順序改變，等於引入玩家無法規劃的隱藏規則。
 * 連段加成於階段 B 另行套用，見 GAME_DESIGN 第 3.3 節。
 */
export function attackAfterGates(baseAttack: number, stats: RunStats): number {
  return (baseAttack + stats.attackAdd) * stats.attackMul;
}
