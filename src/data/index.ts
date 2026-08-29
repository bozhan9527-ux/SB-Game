/**
 * 遊戲資料的唯一入口。
 *
 * TECH_SPEC 第 3 節：所有數值一律來自 data/*.json，src/ 內不得硬編碼。
 * 本檔在 module 載入時就完成驗證，資料壞掉會在開場即報錯而非中途崩潰。
 */
import balanceJson from '../../data/balance.json';
import realmsJson from '../../data/realms.json';
import sectsJson from '../../data/sects.json';
import cardsJson from '../../data/cards.json';
import upgradesJson from '../../data/upgrades.json';
import enemiesJson from '../../data/enemies.json';
import achievementsJson from '../../data/achievements.json';

import type {
  Achievement,
  Scenery,
  AchievementKind,
  Balance,
  BossArt,
  BossDef,
  CardDef,
  MobArt,
  EnemyBook,
  MobDef,
  Realm,
  Sect,
  SectArt,
  UpgradeTrack,
} from './types';
import { assertUniqueIds, field, list, num, obj, oneOf, str, DataError } from './validate';

const BOSS_ARTS: readonly BossArt[] = ['beast', 'demon', 'storm', 'celestial'];
const SCENERIES: readonly Scenery[] = [
  'peaks', 'forest', 'sea', 'volcano', 'voidrock', 'storm', 'palace', 'celestial',
];
const SECT_ARTS: readonly SectArt[] = ['body', 'sword', 'talisman', 'alchemy'];
const ACHIEVEMENT_KINDS: readonly AchievementKind[] = [
  'stage', 'maxTier', 'kills', 'perfect', 'clears', 'gold', 'sects',
];
const MOB_ARTS: readonly MobArt[] = [
  'wolf', 'bear', 'yeti', 'centipede', 'scorpion', 'serpent',
  'bandit', 'undead', 'demon', 'celestial',
];

export function parseBalance(raw: unknown, path = 'balance.json'): Balance {
  const field_ = obj(raw, 'field', path);
  const formation = obj(raw, 'formation', path);
  const wave = obj(raw, 'wave', path);
  const power = obj(raw, 'power', path);
  const boss = obj(raw, 'boss', path);
  const gold = obj(raw, 'gold', path);
  const p = (o: unknown, k: string, sub: string): number => num(o, k, `${path}.${sub}`);

  return {
    field: {
      fieldSlots: p(field_, 'fieldSlots', 'field'),
      handSlots: p(field_, 'handSlots', 'field'),
      startingHand: p(field_, 'startingHand', 'field'),
      startingField: p(field_, 'startingField', 'field'),
      tierGrowth: p(field_, 'tierGrowth', 'field'),
      maxTierBase: p(field_, 'maxTierBase', 'field'),
      stagesPerTier: p(field_, 'stagesPerTier', 'field'),
      drawTierBelowMax: p(field_, 'drawTierBelowMax', 'field'),
      drawTierBonusChance: p(field_, 'drawTierBonusChance', 'field'),
      drawIntervalMs: p(field_, 'drawIntervalMs', 'field'),
    },
    formation: {
      columns: p(formation, 'columns', 'formation'),
      rowDamage: p(formation, 'rowDamage', 'formation'),
      columnFireRate: p(formation, 'columnFireRate', 'formation'),
      diagonalDamage: p(formation, 'diagonalDamage', 'formation'),
    },
    wave: {
      wavesPerStage: p(wave, 'wavesPerStage', 'wave'),
      waveIntervalMs: p(wave, 'waveIntervalMs', 'wave'),
      waveSpread: p(wave, 'waveSpread', 'wave'),
      minSpawnGapMs: p(wave, 'minSpawnGapMs', 'wave'),
      countBase: p(wave, 'countBase', 'wave'),
      countPerWave: p(wave, 'countPerWave', 'wave'),
      countPerRealm: p(wave, 'countPerRealm', 'wave'),
      countMax: p(wave, 'countMax', 'wave'),
      hpBase: p(wave, 'hpBase', 'wave'),
      hpGrowth: p(wave, 'hpGrowth', 'wave'),
      hpPerWave: p(wave, 'hpPerWave', 'wave'),
      speedBase: p(wave, 'speedBase', 'wave'),
      speedPerStage: p(wave, 'speedPerStage', 'wave'),
      speedMax: p(wave, 'speedMax', 'wave'),
      trackPx: p(wave, 'trackPx', 'wave'),
      leakCostBase: p(wave, 'leakCostBase', 'wave'),
      leakCostGrowth: p(wave, 'leakCostGrowth', 'wave'),
    },
    power: {
      baseDisciples: p(power, 'baseDisciples', 'power'),
      maxDisciples: p(power, 'maxDisciples', 'power'),
    },
    boss: {
      hpBase: p(boss, 'hpBase', 'boss'),
      hpGrowth: p(boss, 'hpGrowth', 'boss'),
      speed: p(boss, 'speed', 'boss'),
      gateHitMultiplier: p(boss, 'gateHitMultiplier', 'boss'),
      gateHitIntervalMs: p(boss, 'gateHitIntervalMs', 'boss'),
      timeLimitMs: p(boss, 'timeLimitMs', 'boss'),
      goldBonus: p(boss, 'goldBonus', 'boss'),
    },
    gold: {
      clearBase: p(gold, 'clearBase', 'gold'),
      clearGrowth: p(gold, 'clearGrowth', 'gold'),
      killBase: p(gold, 'killBase', 'gold'),
      killGrowth: p(gold, 'killGrowth', 'gold'),
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
    scenery: oneOf(item, 'scenery', p, SCENERIES),
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
    discipleMultiplier: num(item, 'discipleMultiplier', p),
    damageMultiplier: num(item, 'damageMultiplier', p),
    goldMultiplier: num(item, 'goldMultiplier', p),
    drawSpeedMultiplier: num(item, 'drawSpeedMultiplier', p),
    bossDamageMultiplier: num(item, 'bossDamageMultiplier', p),
    passive: str(item, 'passive', p),
    favoredCard: str(item, 'favoredCard', p),
    favoredDamageMultiplier: num(item, 'favoredDamageMultiplier', p),
    leakImmunityCount: num(item, 'leakImmunityCount', p),
    mergeRefundChance: num(item, 'mergeRefundChance', p),
  }));
  assertUniqueIds(sects, path);
  return sects;
}

export function parseCards(raw: unknown, path = 'cards.json'): CardDef[] {
  const cards = list(raw, path, (item, p) => ({
    id: str(item, 'id', p),
    name: str(item, 'name', p),
    desc: str(item, 'desc', p),
    color: str(item, 'color', p),
    art: str(item, 'art', p),
    damage: num(item, 'damage', p),
    intervalMs: num(item, 'intervalMs', p),
    targets: num(item, 'targets', p),
    weight: num(item, 'weight', p),
  }));
  assertUniqueIds(cards, path);
  for (const card of cards) {
    if (card.weight <= 0) throw new DataError(path, `${card.id} 的 weight 必須大於 0`);
    if (card.intervalMs <= 0) throw new DataError(path, `${card.id} 的 intervalMs 必須大於 0`);
    if (card.targets < 1) throw new DataError(path, `${card.id} 的 targets 至少為 1`);
  }
  return cards;
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

export function parseAchievements(raw: unknown, path = 'achievements.json'): Achievement[] {
  const items = list(raw, path, (item, p) => ({
    id: str(item, 'id', p),
    name: str(item, 'name', p),
    desc: str(item, 'desc', p),
    kind: oneOf(item, 'kind', p, ACHIEVEMENT_KINDS),
    value: num(item, 'value', p),
    reward: num(item, 'reward', p),
  }));
  assertUniqueIds(items, path);
  return items;
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
export const CARDS: readonly CardDef[] = parseCards(cardsJson);
export const UPGRADES: readonly UpgradeTrack[] = parseUpgrades(upgradesJson);
export const ENEMIES: EnemyBook = parseEnemies(enemiesJson);
export const ACHIEVEMENTS: readonly Achievement[] = parseAchievements(achievementsJson);

/** 每個境界都必須有敵陣與首領可抽，否則該境界的關卡生不出遭遇。 */
for (const realm of REALMS) {
  if (!ENEMIES.mobs.some((mob) => mob.realm === realm.id)) {
    throw new DataError('enemies.json.mobs', `境界 ${realm.id} 沒有對應的敵陣`);
  }
  if (!ENEMIES.bosses.some((boss) => boss.realm === realm.id)) {
    throw new DataError('enemies.json.bosses', `境界 ${realm.id} 沒有對應的首領`);
  }
}

/** 門派專精的符種必須真的存在，否則被動會靜默失效。 */
for (const sect of SECTS) {
  if (!CARDS.some((card) => card.id === sect.favoredCard)) {
    throw new DataError('sects.json', `${sect.id} 的 favoredCard「${sect.favoredCard}」不存在`);
  }
}
