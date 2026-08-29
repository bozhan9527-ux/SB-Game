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
import lessonsJson from '../../data/lessons.json';

import type {
  Achievement,
  Scenery,
  AchievementKind,
  Balance,
  BossArt,
  BossDef,
  CardDef,
  CardEffect,
  FormationTierBalance,
  MobArt,
  MobTrait,
  EnemyBook,
  MobDef,
  LessonDef,
  Realm,
  Sect,
  SectArt,
  UpgradeTrack,
} from './types';
import {
  assertKnownKeys,
  assertUniqueIds,
  field,
  list,
  num,
  obj,
  oneOf,
  optBool,
  optNum,
  optStr,
  str,
  DataError,
} from './validate';

/**
 * 一副符籙配置帶幾張。
 *
 * 四這個數字不是隨手挑的：3×3 的陣法天花板（八條、484 種解）是在「場上只有四種符」
 * 這個前提下算出來的，帶超過四種會把那個推導整個推翻；帶少於四種則湊不出五行陣。
 * 二十張符裡選四張，選擇本身就是玩法。
 */
export const TALISMAN_SLOTS = 4;

const BOSS_ARTS: readonly BossArt[] = ['beast', 'demon', 'storm', 'celestial'];
const SCENERIES: readonly Scenery[] = [
  'peaks', 'forest', 'sea', 'volcano', 'voidrock', 'storm', 'palace', 'celestial',
];
const SECT_ARTS: readonly SectArt[] = ['body', 'sword', 'talisman', 'alchemy'];
const ACHIEVEMENT_KINDS: readonly AchievementKind[] = [
  'stage', 'maxTier', 'kills', 'perfect', 'clears', 'gold', 'sects',
  'sectMastery',
];
const MOB_ARTS: readonly MobArt[] = [
  'wolf', 'bear', 'yeti', 'centipede', 'scorpion', 'serpent',
  'bandit', 'undead', 'demon', 'celestial',
];
const MOB_TRAITS: readonly MobTrait[] = ['none', 'armor', 'swift', 'split'];

function parseFormationTier(raw: unknown, path: string): FormationTierBalance {
  return {
    rowDamage: num(raw, 'rowDamage', path),
    columnFireRate: num(raw, 'columnFireRate', path),
    diagonalDamage: num(raw, 'diagonalDamage', path),
  };
}

export function parseBalance(raw: unknown, path = 'balance.json'): Balance {
  const field_ = obj(raw, 'field', path);
  const formation = obj(raw, 'formation', path);
  const wave = obj(raw, 'wave', path);
  const power = obj(raw, 'power', path);
  const trait = obj(raw, 'trait', path);
  const sect = obj(raw, 'sect', path);
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
      ascendStagesPerTier: p(field_, 'ascendStagesPerTier', 'field'),
      drawTierBelowMax: p(field_, 'drawTierBelowMax', 'field'),
      drawTierBonusChance: p(field_, 'drawTierBonusChance', 'field'),
      drawIntervalMs: p(field_, 'drawIntervalMs', 'field'),
      maxRepairChance: p(field_, 'maxRepairChance', 'field'),
    },
    formation: {
      columns: p(formation, 'columns', 'formation'),
      same: parseFormationTier(obj(formation, 'same', `${path}.formation`), `${path}.formation.same`),
      distinct: parseFormationTier(
        obj(formation, 'distinct', `${path}.formation`),
        `${path}.formation.distinct`,
      ),
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
    trait: {
      armorPercentOfMaxHp: p(trait, 'armorPercentOfMaxHp', 'trait'),
      armorMaxCut: p(trait, 'armorMaxCut', 'trait'),
      armorHpRatio: p(trait, 'armorHpRatio', 'trait'),
      swiftMultiplier: p(trait, 'swiftMultiplier', 'trait'),
      swiftHpRatio: p(trait, 'swiftHpRatio', 'trait'),
      splitParentHpRatio: p(trait, 'splitParentHpRatio', 'trait'),
      splitCount: p(trait, 'splitCount', 'trait'),
      splitHpRatio: p(trait, 'splitHpRatio', 'trait'),
      splitSpeedMultiplier: p(trait, 'splitSpeedMultiplier', 'trait'),
    },
    sect: {
      clearsPerMastery: p(sect, 'clearsPerMastery', 'sect'),
      maxMasteryTier: p(sect, 'maxMasteryTier', 'sect'),
      masteryDamagePerTier: p(sect, 'masteryDamagePerTier', 'sect'),
      switchCostPerClear: p(sect, 'switchCostPerClear', 'sect'),
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

/**
 * 符籙特效的預設值：全部等於「沒有這個特效」。
 *
 * 倍率類的預設是 1（乘上去不變），加成類的預設是 0。
 * 資料檔裡只寫真正生效的那幾項，其餘留白。
 */
export const NO_EFFECT: CardEffect = {
  slowPercent: 0,
  slowMs: 0,
  burnPercent: 0,
  burnMs: 0,
  executeBelow: 0,
  carryOverkill: false,
  critChance: 0,
  critMultiplier: 1,
  bossMultiplier: 1,
  woundedMultiplier: 1,
  freshMultiplier: 1,
  rampPerShot: 0,
  rampMax: 1,
  auraDamage: 0,
  auraFireRate: 0,
  goldBonus: 0,
  drawSpeedBonus: 0,
  repairChance: 0,
  formationMultiplier: 1,
};

const EFFECT_KEYS: readonly string[] = Object.keys(NO_EFFECT);

function parseEffect(raw: unknown, path: string): CardEffect {
  // 打錯特效名稱（例如 slowPercnet）會靜默失效，那種 bug 只有靠人玩才看得出來，
  // 所以在載入階段就把不認得的鍵擋掉。
  assertKnownKeys(raw, path, EFFECT_KEYS);
  const n = (key: keyof CardEffect): number =>
    optNum(raw, key, path, NO_EFFECT[key] as number);
  return {
    slowPercent: n('slowPercent'),
    slowMs: n('slowMs'),
    burnPercent: n('burnPercent'),
    burnMs: n('burnMs'),
    executeBelow: n('executeBelow'),
    carryOverkill: optBool(raw, 'carryOverkill', path, false),
    critChance: n('critChance'),
    critMultiplier: n('critMultiplier'),
    bossMultiplier: n('bossMultiplier'),
    woundedMultiplier: n('woundedMultiplier'),
    freshMultiplier: n('freshMultiplier'),
    rampPerShot: n('rampPerShot'),
    rampMax: n('rampMax'),
    auraDamage: n('auraDamage'),
    auraFireRate: n('auraFireRate'),
    goldBonus: n('goldBonus'),
    drawSpeedBonus: n('drawSpeedBonus'),
    repairChance: n('repairChance'),
    formationMultiplier: n('formationMultiplier'),
  };
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
    unlockStage: num(item, 'unlockStage', p),
    effect: parseEffect(obj(item, 'effect', p), `${p}.effect`),
  }));
  assertUniqueIds(cards, path);
  for (const card of cards) {
    if (card.weight <= 0) throw new DataError(path, `${card.id} 的 weight 必須大於 0`);
    if (card.intervalMs <= 0) throw new DataError(path, `${card.id} 的 intervalMs 必須大於 0`);
    if (card.targets < 1) throw new DataError(path, `${card.id} 的 targets 至少為 1`);
    if (card.unlockStage < 1) throw new DataError(path, `${card.id} 的 unlockStage 至少為 1`);
  }
  // 一副符籙配置要選滿四張，所以開局（第 1 關）就必須有四張以上可選，
  // 而且四種正好對上 3×3 陣法的天花板推導。
  const starters = cards.filter((card) => card.unlockStage <= 1);
  if (starters.length < TALISMAN_SLOTS) {
    throw new DataError(path, `開局可用的符不足 ${TALISMAN_SLOTS} 張，湊不出一副符籙配置`);
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
    trait: oneOf(item, 'trait', p, MOB_TRAITS),
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
export function parseLessons(raw: unknown, path = 'lessons.json'): LessonDef[] {
  const lessons = list(raw, path, (item, p) => ({
    id: str(item, 'id', p),
    stage: num(item, 'stage', p),
    title: str(item, 'title', p),
    body: str(item, 'body', p),
    hint: optStr(item, 'hint', p, ''),
  }));
  assertUniqueIds(lessons, path);
  let previous = 0;
  for (const lesson of lessons) {
    if (lesson.stage < 1) throw new DataError(path, `${lesson.id} 的 stage 至少為 1`);
    // 依關卡遞增排列，才能「一場只上一課、而且照順序上」。
    if (lesson.stage < previous) throw new DataError(path, `${lesson.id} 的 stage 沒有照關卡遞增`);
    previous = lesson.stage;
    // 兩行是硬性上限：這一頁的存在理由就是不讓文字多到沒人看。
    if (lesson.body.split('\n').length > 2) {
      throw new DataError(path, `${lesson.id} 的 body 超過兩行`);
    }
  }
  return lessons;
}

export const CARDS: readonly CardDef[] = parseCards(cardsJson);
export const LESSONS: readonly LessonDef[] = parseLessons(lessonsJson);
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
