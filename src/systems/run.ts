/**
 * 單場挑戰的核心邏輯：閘門生成、左右滑選擇的結算、敵陣衝殺、首領戰。
 *
 * 本檔不 import Phaser，全部是純函式與純資料，好處是可以在 node 測試環境直接驗算，
 * 場景（src/scenes/RunScene.ts）只負責把這裡的狀態畫出來。
 */
import { BALANCE, ENEMIES, GATES } from '../data';
import type { BossDef, GateOp, GateTarget, GateTemplate } from '../data/types';
import type { Loadout } from './loadout';
import { realmForStage, realmIndexForStage } from './realms';
import type { Rng } from './rng';
import { createRng } from './rng';

/** 一側閘門。gold 的 value 已換算成實際金幣數。 */
export interface GateChoice {
  templateId: string;
  target: GateTarget;
  op: GateOp;
  value: number;
  trap: boolean;
  label: string;
}

export interface GateEncounter {
  kind: 'gate';
  left: GateChoice;
  right: GateChoice;
}

export interface MobEncounter {
  kind: 'mob';
  name: string;
  power: number;
}

export type Encounter = GateEncounter | MobEncounter;

export interface RunState {
  loadout: Loadout;
  stage: number;
  disciples: number;
  arms: number;
  /** 本場拾取的金幣（已乘門派／升級倍率）。 */
  goldCollected: number;
  encounters: Encounter[];
  /** 下一個待結算的遭遇索引。 */
  cursor: number;
}

export interface GateResult {
  choice: GateChoice;
  discipleDelta: number;
  armsDelta: number;
  goldDelta: number;
}

export interface BossState {
  def: BossDef;
  maxHp: number;
  hp: number;
  attack: number;
}

// ---------------------------------------------------------------- 閘門生成

function poolFor(target: GateTarget | null, trap: boolean): GateTemplate[] {
  return GATES.filter(
    (gate) =>
      gate.trap === trap && (target === null ? gate.target !== 'gold' : gate.target === target),
  );
}

function goldValue(template: GateTemplate, stage: number): number {
  const { gold } = BALANCE;
  return Math.round(template.value * (gold.gateGoldBase + gold.gateGoldPerStage * stage));
}

/**
 * 閘門的實際數值。
 *
 * 加算閘門隨關卡等比放大（乘算閘門不放大，否則後期會失控），
 * 讓「隊伍規模」與「首領血量」以同一條曲線成長，不會出現某一關突然輾壓或突然打不動。
 */
export function gateValue(template: GateTemplate, stage: number): number {
  if (template.target === 'gold') return goldValue(template, stage);
  if (template.op === 'mul') return template.value;
  const scaled = template.value * Math.pow(BALANCE.run.gateValueGrowth, stage - 1);
  const rounded = Math.round(scaled);
  // 小數值在早期關卡不能被四捨五入成 0，否則閘門會失去意義。
  return rounded === 0 ? Math.sign(template.value) : rounded;
}

/** 閘門文字。數值來自資料，這裡只做格式化。 */
export function gateLabel(target: GateTarget, op: GateOp, value: number): string {
  const noun = target === 'disciples' ? '弟子' : target === 'arms' ? '武裝' : '金幣';
  if (op === 'mul') {
    const shown = Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0$/, '');
    return `×${shown} ${noun}`;
  }
  return value >= 0 ? `＋${value} ${noun}` : `－${Math.abs(value)} ${noun}`;
}

function toChoice(template: GateTemplate, stage: number): GateChoice {
  const value = gateValue(template, stage);
  return {
    templateId: template.id,
    target: template.target,
    op: template.op,
    value,
    trap: template.trap,
    label: gateLabel(template.target, template.op, value),
  };
}

function pick(pool: readonly GateTemplate[], rng: Rng, fallback: readonly GateTemplate[]): GateTemplate {
  const source = pool.length > 0 ? pool : fallback;
  return rng.pickWeighted(source, (gate) => gate.weight);
}

/** 一組左右閘門。至少一側是好處，另一側可能是陷阱或另一種好處，構成取捨。 */
export function buildGateEncounter(stage: number, rng: Rng): GateEncounter {
  const { run } = BALANCE;
  const goodPool = poolFor(null, false);
  const allGood = goodPool;

  const first = pick(goodPool, rng, allGood);

  let secondTemplate: GateTemplate;
  if (rng.next() < run.goldGateChance) {
    secondTemplate = pick(poolFor('gold', false), rng, GATES.filter((gate) => gate.target === 'gold'));
  } else if (rng.next() < run.trapChance) {
    secondTemplate = pick(poolFor(null, true), rng, GATES.filter((gate) => gate.trap));
  } else {
    // 兩側都是好處時，盡量給不同的資源，讓「人數 vs 武裝」成為真正的選擇。
    const other = goodPool.filter((gate) => gate.target !== first.target);
    secondTemplate = pick(other.length > 0 ? other : goodPool.filter((g) => g.id !== first.id), rng, allGood);
  }

  const left = toChoice(first, stage);
  const right = toChoice(secondTemplate, stage);
  return rng.next() < 0.5 ? { kind: 'gate', left, right } : { kind: 'gate', left: right, right: left };
}

function buildMobEncounter(stage: number, rng: Rng): MobEncounter {
  const realm = realmForStage(stage);
  const candidates = ENEMIES.mobs.filter((mob) => mob.realm === realm.id);
  const mob = candidates[rng.int(0, Math.max(0, candidates.length - 1))];
  const { powerBase, powerExponent, powerJitter } = BALANCE.mob;
  const jitter = 1 + (rng.next() * 2 - 1) * powerJitter;
  return {
    kind: 'mob',
    name: mob?.name ?? '無名之敵',
    power: Math.max(0.1, powerBase * Math.pow(stage, powerExponent) * jitter),
  };
}

/** 本關的閘門數，隨境界成長。 */
export function gateCountForStage(stage: number): number {
  const { run } = BALANCE;
  return Math.min(
    run.gatesPerStageMax,
    run.gatesPerStageBase + run.gatesPerStagePerRealm * realmIndexForStage(stage),
  );
}

/** 關卡的遭遇序列：閘門為主，每隔數道插入一次敵陣。 */
export function buildEncounters(stage: number, rng: Rng): Encounter[] {
  const gateCount = gateCountForStage(stage);
  const every = Math.max(1, Math.round(BALANCE.run.mobWaveEvery));
  const encounters: Encounter[] = [];

  for (let i = 1; i <= gateCount; i += 1) {
    encounters.push(buildGateEncounter(stage, rng));
    // 最後一道閘門之後直接接首領，不再插敵陣。
    if (i % every === 0 && i < gateCount) encounters.push(buildMobEncounter(stage, rng));
  }
  return encounters;
}

/** 閘門捲動速度（px/秒），隨關卡加快。 */
export function gateSpeedForStage(stage: number): number {
  const { run } = BALANCE;
  return Math.min(run.gateSpeedMax, run.gateSpeedBase + run.gateSpeedPerStage * (stage - 1));
}

// ---------------------------------------------------------------- 挑戰狀態

export function createRunState(loadout: Loadout, seed: number): RunState {
  const rng = createRng(seed);
  return {
    loadout,
    stage: loadout.stage,
    disciples: loadout.disciples,
    arms: loadout.arms,
    goldCollected: 0,
    encounters: buildEncounters(loadout.stage, rng),
    cursor: 0,
  };
}

/**
 * 套用玩家選中的那一側閘門。
 *
 * 符修的武裝加成只放大好處，不放大陷阱——否則「武裝效果提升」在踩到減武裝閘門時
 * 反而變成懲罰，與門派敘述不符。
 */
export function applyGate(state: RunState, choice: GateChoice): GateResult {
  const before = { disciples: state.disciples, arms: state.arms };
  const armsMul = state.loadout.armsMultiplier;

  if (choice.target === 'disciples') {
    state.disciples =
      choice.op === 'add' ? state.disciples + choice.value : state.disciples * choice.value;
  } else if (choice.target === 'arms') {
    if (choice.op === 'add') {
      const value = choice.value > 0 ? choice.value * armsMul : choice.value;
      state.arms += value;
    } else {
      const value = choice.value > 1 ? 1 + (choice.value - 1) * armsMul : choice.value;
      state.arms *= value;
    }
  }

  state.disciples = Math.max(0, Math.min(BALANCE.power.maxDisciples, Math.round(state.disciples)));
  state.arms = Math.max(0, Math.round(state.arms));

  const goldDelta =
    choice.target === 'gold' ? Math.round(choice.value * state.loadout.goldMultiplier) : 0;
  state.goldCollected += goldDelta;

  return {
    choice,
    discipleDelta: state.disciples - before.disciples,
    armsDelta: state.arms - before.arms,
    goldDelta,
  };
}

/** 減傷分母：防禦與武裝各以自己的權重計入。 */
export function mitigation(state: RunState): number {
  const { power } = BALANCE;
  return Math.max(
    power.mitigationFloor,
    state.loadout.defense * power.defenseMitigation + state.arms * power.armsMitigation,
  );
}

/** 抵禦敵陣的能力：攻擊與武裝直接對砍，防禦另計。 */
function guard(state: RunState): number {
  return Math.max(BALANCE.power.mitigationFloor, state.loadout.attack + mitigation(state));
}

/**
 * 敵陣造成的傷亡比例（0–1）。
 *
 * 用比例而非固定人數，是因為固定人數會讓運氣不好的小隊在中途直接被抹平，
 * 關卡難度應該由首領決定，敵陣只是消耗。武裝值越高，這個比例越低。
 */
export function mobLossRatio(state: RunState, encounter: MobEncounter): number {
  const threat = encounter.power * state.loadout.mobLossMultiplier;
  return threat / (threat + guard(state));
}

/** 敵陣衝殺造成的傷亡人數。 */
export function mobLoss(state: RunState, encounter: MobEncounter): number {
  const raw = state.disciples * mobLossRatio(state, encounter);
  return Math.min(
    state.disciples,
    Math.max(BALANCE.power.minLossPerHit, Math.round(raw)),
  );
}

/** 結算敵陣，回傳實際損失人數。 */
export function resolveMob(state: RunState, encounter: MobEncounter): number {
  const loss = Math.min(state.disciples, mobLoss(state, encounter));
  state.disciples -= loss;
  return loss;
}

/** 隊伍總戰力＝人數 ×（攻擊＋武裝）× 境界壓制。 */
export function teamPower(state: RunState): number {
  return (
    state.disciples * (state.loadout.attack + state.arms) * (1 + state.loadout.realmPowerBonus)
  );
}

// ---------------------------------------------------------------- 首領戰

export function createBoss(stage: number, rng: Rng): BossState {
  const realm = realmForStage(stage);
  const candidates = ENEMIES.bosses.filter((boss) => boss.realm === realm.id);
  const def = candidates[rng.int(0, Math.max(0, candidates.length - 1))];
  if (def === undefined) throw new Error(`境界 ${realm.id} 沒有可用的首領`);
  const { boss } = BALANCE;
  const hp = Math.round(boss.hpBase * Math.pow(boss.hpGrowth, stage - 1));
  return {
    def,
    maxHp: hp,
    hp,
    attack: Math.round(boss.attackBase * Math.pow(boss.attackGrowth, stage - 1)),
  };
}

/** 對首領的每秒傷害。momentum 為首領戰中連續滑動累積的氣勢加成。 */
export function bossDps(state: RunState, momentum: number): number {
  return (
    teamPower(state) * BALANCE.boss.dpsFactor * state.loadout.bossDamageMultiplier * (1 + momentum)
  );
}

/**
 * 首領一次攻擊打掉的人數比例。
 *
 * 與敵陣同樣採比例制。若改用固定人數，隊伍被打掉一半之後輸出也砍半，
 * 會變成「前幾秒沒殺死就必輸」的雪崩，玩家只能看著隊伍融化。
 * 比例制讓人數平滑衰減，戰鬥維持在「快一點就贏得下來」的張力。
 */
export function bossHitRatio(state: RunState, boss: BossState): number {
  const guard = Math.max(BALANCE.power.mitigationFloor, state.loadout.attack + mitigation(state));
  return boss.attack / (boss.attack + guard);
}

/** 首領一次攻擊造成的傷亡人數。 */
export function bossHitLoss(state: RunState, boss: BossState): number {
  const { power } = BALANCE;
  return Math.min(
    state.disciples,
    Math.max(power.minLossPerHit, Math.round(state.disciples * bossHitRatio(state, boss))),
  );
}

// ---------------------------------------------------------------- 結算

/** 通關獎勵金幣。 */
export function clearReward(state: RunState): number {
  const { gold } = BALANCE;
  return Math.round(
    (gold.clearBase + gold.clearPerStage * state.stage) * state.loadout.goldMultiplier,
  );
}

/** 失敗時的安慰獎金幣。 */
export function defeatReward(state: RunState): number {
  return Math.round(clearReward(state) * BALANCE.gold.defeatRatio);
}
