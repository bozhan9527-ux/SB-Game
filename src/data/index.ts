/**
 * 遊戲資料的唯一入口。
 *
 * TECH_SPEC 第 3 節：所有數值一律來自 data/*.json，src/ 內不得硬編碼。
 * 本檔在 module 載入時就完成驗證，資料壞掉會在開場即報錯而非中途崩潰。
 */
import balanceJson from '../../data/balance.json';
import realmsJson from '../../data/realms.json';
import sectsJson from '../../data/sects.json';
import gatesJson from '../../data/gates.json';
import upgradesJson from '../../data/upgrades.json';
import enemiesJson from '../../data/enemies.json';

import type {
  Balance,
  BossArt,
  BossDef,
  MobArt,
  EnemyBook,
  GateOp,
  GateTarget,
  GateTemplate,
  MobDef,
  Realm,
  Sect,
  SectArt,
  UpgradeTrack,
} from './types';
import { assertUniqueIds, bool, field, list, num, obj, oneOf, str, DataError } from './validate';

const GATE_TARGETS: readonly GateTarget[] = ['disciples', 'arms', 'gold'];
const GATE_OPS: readonly GateOp[] = ['add', 'mul'];
const BOSS_ARTS: readonly BossArt[] = ['beast', 'demon', 'storm', 'celestial'];
const SECT_ARTS: readonly SectArt[] = ['body', 'sword', 'talisman', 'alchemy'];
const MOB_ARTS: readonly MobArt[] = ['beast', 'bandit', 'undead', 'demon', 'celestial'];

export function parseBalance(raw: unknown, path = 'balance.json'): Balance {
  const input = obj(raw, 'input', path);
  const run = obj(raw, 'run', path);
  const power = obj(raw, 'power', path);
  const mob = obj(raw, 'mob', path);
  const boss = obj(raw, 'boss', path);
  const gold = obj(raw, 'gold', path);
  const p = (o: unknown, k: string, sub: string): number => num(o, k, `${path}.${sub}`);

  return {
    input: {
      followSpeed: p(input, 'followSpeed', 'input'),
      trackMarginPx: p(input, 'trackMarginPx', 'input'),
      momentumPerPixel: p(input, 'momentumPerPixel', 'input'),
    },
    run: {
      gateSpeedBase: p(run, 'gateSpeedBase', 'run'),
      gateSpeedPerStage: p(run, 'gateSpeedPerStage', 'run'),
      gateSpeedMax: p(run, 'gateSpeedMax', 'run'),
      encounterSpacingPx: p(run, 'encounterSpacingPx', 'run'),
      gateValueGrowth: p(run, 'gateValueGrowth', 'run'),
      gatesPerStageBase: p(run, 'gatesPerStageBase', 'run'),
      gatesPerStagePerRealm: p(run, 'gatesPerStagePerRealm', 'run'),
      gatesPerStageMax: p(run, 'gatesPerStageMax', 'run'),
      mobWaveEvery: p(run, 'mobWaveEvery', 'run'),
      goldGateChance: p(run, 'goldGateChance', 'run'),
      trapChance: p(run, 'trapChance', 'run'),
    },
    power: {
      baseDisciples: p(power, 'baseDisciples', 'power'),
      baseAttack: p(power, 'baseAttack', 'power'),
      baseDefense: p(power, 'baseDefense', 'power'),
      baseArms: p(power, 'baseArms', 'power'),
      maxDisciples: p(power, 'maxDisciples', 'power'),
      defenseMitigation: p(power, 'defenseMitigation', 'power'),
      armsMitigation: p(power, 'armsMitigation', 'power'),
      mitigationFloor: p(power, 'mitigationFloor', 'power'),
      minLossPerHit: p(power, 'minLossPerHit', 'power'),
    },
    mob: {
      powerBase: p(mob, 'powerBase', 'mob'),
      powerExponent: p(mob, 'powerExponent', 'mob'),
      powerJitter: p(mob, 'powerJitter', 'mob'),
    },
    boss: {
      hpBase: p(boss, 'hpBase', 'boss'),
      hpGrowth: p(boss, 'hpGrowth', 'boss'),
      attackBase: p(boss, 'attackBase', 'boss'),
      attackGrowth: p(boss, 'attackGrowth', 'boss'),
      attackIntervalMs: p(boss, 'attackIntervalMs', 'boss'),
      timeLimitMs: p(boss, 'timeLimitMs', 'boss'),
      dpsFactor: p(boss, 'dpsFactor', 'boss'),
      tickMs: p(boss, 'tickMs', 'boss'),
      momentumMax: p(boss, 'momentumMax', 'boss'),
      momentumDecayPerSec: p(boss, 'momentumDecayPerSec', 'boss'),
    },
    gold: {
      clearBase: p(gold, 'clearBase', 'gold'),
      clearPerStage: p(gold, 'clearPerStage', 'gold'),
      gateGoldBase: p(gold, 'gateGoldBase', 'gold'),
      gateGoldPerStage: p(gold, 'gateGoldPerStage', 'gold'),
      defeatRatio: p(gold, 'defeatRatio', 'gold'),
    },
  };
}

export function parseRealms(raw: unknown, path = 'realms.json'): Realm[] {
  const realms = list(raw, path, (item, p) => ({
    id: str(item, 'id', p),
    name: str(item, 'name', p),
    subtitle: str(item, 'subtitle', p),
    stageFrom: num(item, 'stageFrom', p),
    stageTo: num(item, 'stageTo', p),
    color: str(item, 'color', p),
    powerBonus: num(item, 'powerBonus', p),
  }));
  assertUniqueIds(realms, path);

  // 境界必須從第 1 關開始、連續、且不重疊，否則會有關卡查不到境界。
  if (realms[0]?.stageFrom !== 1) throw new DataError(path, '第一個境界必須從第 1 關開始');
  for (let i = 0; i < realms.length; i += 1) {
    const realm = realms[i];
    if (realm === undefined) continue;
    if (realm.stageTo < realm.stageFrom) {
      throw new DataError(`${path}[${i}]`, 'stageTo 不得小於 stageFrom');
    }
    const next = realms[i + 1];
    if (next !== undefined && next.stageFrom !== realm.stageTo + 1) {
      throw new DataError(`${path}[${i + 1}]`, '境界的關卡區間必須連續且不重疊');
    }
  }
  return realms;
}

export function parseSects(raw: unknown, path = 'sects.json'): Sect[] {
  const sects = list(raw, path, (item, p) => ({
    id: str(item, 'id', p),
    art: oneOf(item, 'art', p, SECT_ARTS),
    name: str(item, 'name', p),
    path: str(item, 'path', p),
    motto: str(item, 'motto', p),
    desc: str(item, 'desc', p),
    color: str(item, 'color', p),
    discipleBonus: num(item, 'discipleBonus', p),
    attackBonus: num(item, 'attackBonus', p),
    defenseBonus: num(item, 'defenseBonus', p),
    armsMultiplier: num(item, 'armsMultiplier', p),
    bossDamageMultiplier: num(item, 'bossDamageMultiplier', p),
    goldMultiplier: num(item, 'goldMultiplier', p),
    mobLossMultiplier: num(item, 'mobLossMultiplier', p),
  }));
  assertUniqueIds(sects, path);
  return sects;
}

export function parseGates(raw: unknown, path = 'gates.json'): GateTemplate[] {
  const gates = list(raw, path, (item, p) => ({
    id: str(item, 'id', p),
    target: oneOf(item, 'target', p, GATE_TARGETS),
    op: oneOf(item, 'op', p, GATE_OPS),
    value: num(item, 'value', p),
    weight: num(item, 'weight', p),
    trap: bool(item, 'trap', p),
  }));
  assertUniqueIds(gates, path);
  for (const gate of gates) {
    if (gate.weight <= 0) throw new DataError(path, `${gate.id} 的 weight 必須大於 0`);
    if (gate.op === 'mul' && gate.value < 0) {
      throw new DataError(path, `${gate.id} 的乘算 value 不得為負`);
    }
  }
  return gates;
}

export function parseUpgrades(raw: unknown, path = 'upgrades.json'): UpgradeTrack[] {
  const tracks = list(raw, path, (item, p) => ({
    id: str(item, 'id', p),
    name: str(item, 'name', p),
    desc: str(item, 'desc', p),
    unit: str(item, 'unit', p),
    perLevel: num(item, 'perLevel', p),
    baseCost: num(item, 'baseCost', p),
    costGrowth: num(item, 'costGrowth', p),
    maxLevel: num(item, 'maxLevel', p),
  }));
  assertUniqueIds(tracks, path);
  for (const track of tracks) {
    if (track.costGrowth < 1) throw new DataError(path, `${track.id} 的 costGrowth 不得小於 1`);
    if (track.maxLevel < 1) throw new DataError(path, `${track.id} 的 maxLevel 必須大於 0`);
  }
  return tracks;
}

export function parseEnemies(raw: unknown, path = 'enemies.json'): EnemyBook {
  const mobs: MobDef[] = list(field(raw, 'mobs', path), `${path}.mobs`, (item, p) => ({
    id: str(item, 'id', p),
    realm: str(item, 'realm', p),
    name: str(item, 'name', p),
    art: oneOf(item, 'art', p, MOB_ARTS),
  }));
  const bosses: BossDef[] = list(field(raw, 'bosses', path), `${path}.bosses`, (item, p) => ({
    id: str(item, 'id', p),
    realm: str(item, 'realm', p),
    name: str(item, 'name', p),
    taunt: str(item, 'taunt', p),
    art: oneOf(item, 'art', p, BOSS_ARTS),
  }));
  assertUniqueIds(mobs, `${path}.mobs`);
  assertUniqueIds(bosses, `${path}.bosses`);
  return { mobs, bosses };
}

export const BALANCE: Balance = parseBalance(balanceJson);
export const REALMS: readonly Realm[] = parseRealms(realmsJson);
export const SECTS: readonly Sect[] = parseSects(sectsJson);
export const GATES: readonly GateTemplate[] = parseGates(gatesJson);
export const UPGRADES: readonly UpgradeTrack[] = parseUpgrades(upgradesJson);
export const ENEMIES: EnemyBook = parseEnemies(enemiesJson);

/** 每個境界都必須有敵陣與首領可抽，否則該境界的關卡生不出遭遇。 */
for (const realm of REALMS) {
  if (!ENEMIES.mobs.some((mob) => mob.realm === realm.id)) {
    throw new DataError('enemies.json.mobs', `境界 ${realm.id} 沒有對應的敵陣`);
  }
  if (!ENEMIES.bosses.some((boss) => boss.realm === realm.id)) {
    throw new DataError('enemies.json.bosses', `境界 ${realm.id} 沒有對應的首領`);
  }
}
