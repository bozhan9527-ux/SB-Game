/**
 * 山門防守戰的核心：出怪排程、法寶開火、漏怪結算、勝負判定。
 *
 * 本檔不 import Phaser，全部是純函式與純資料。**場景與平衡模擬跑的是同一份 tickCombat**，
 * 因此模擬出來的數字就是玩家實際會遇到的數字，不是另一套近似模型。
 *
 * 一個刻意的細節：傷害是逐目標結算、溢出的部分直接丟掉。
 * 天雷符一擊 40 點打在 20 血的小妖身上會浪費一半，風刃符則幾乎不浪費——
 * 四種符的取捨因此是從規則長出來的，不是寫死在說明文字裡。
 */
import { BALANCE, ENEMIES } from '../data';
import type { BossArt, BossDef, MobArt } from '../data/types';
import type { Card } from './deck';
import { cardDamage, cardDef, cardInterval, drawCard, maxTierForStage } from './deck';
import { NO_BONUS, bonusesForField } from './formation';
import type { Loadout } from './loadout';
import { realmForStage, realmIndexForStage } from './realms';
import type { Rng } from './rng';

export interface ActiveEnemy {
  id: number;
  name: string;
  art: MobArt;
  /** 首領才有的造型；一般妖魔為 null。 */
  bossArt: BossArt | null;
  boss: boolean;
  hp: number;
  maxHp: number;
  /** 已推進的距離（px）。0 為剛出場，達到 trackPx 就攻進山門。 */
  y: number;
  lane: number;
  speed: number;
}

interface SpawnEntry {
  atMs: number;
  lane: number;
  name: string;
  art: MobArt;
  bossArt: BossArt | null;
  boss: boolean;
  hp: number;
  speed: number;
}

export type Outcome = 'running' | 'cleared' | 'defeated' | 'timeout';

export interface DefenseState {
  loadout: Loadout;
  stage: number;
  /** 山門耐久。 */
  disciples: number;
  maxDisciples: number;
  /** 本場拾取的金幣（已乘門派／升級倍率）。 */
  gold: number;
  hand: (Card | null)[];
  field: (Card | null)[];
  /** 每個場上格位的出手倒數（ms）。 */
  cooldowns: number[];
  enemies: ActiveEnemy[];
  queue: SpawnEntry[];
  bossDef: BossDef;
  nextId: number;
  drawTimer: number;
  elapsedMs: number;
  /** 首領出場的時間點，用於時限判定；還沒出場為 null。 */
  bossSpawnedAtMs: number | null;
  /** 首領是否已經抵達山門，開始砸門。 */
  bossAtGate: boolean;
  /** 首領砸門的計時器。 */
  bossGateAccum: number;
  /**
   * 首領是否已被斬殺。
   *
   * 通關的必要條件。沒有這個旗標的話，只要場上清空就算過關——
   * 而首領走到山門「漏掉」之後也會離開場上，於是沒打死首領照樣判定通關。
   * 那是實際發生過的 bug：81 關裡有 10–20 關是這樣過的。
   */
  bossKilled: boolean;
  leaks: number;
  leakImmunityUsed: number;
  kills: number;
  merges: number;
  peakTier: number;
  outcome: Outcome;
}

export interface ShotEvent {
  slot: number;
  enemyId: number;
  damage: number;
  killed: boolean;
}

export interface KillEvent {
  enemyId: number;
  boss: boolean;
  gold: number;
}

export interface LeakEvent {
  enemyId: number;
  loss: number;
  /** 體修被動擋下時為 true，此時 loss 為 0。 */
  immune: boolean;
  /** 首領砸門（牠不會離開，會一直砸到死或山門破）。 */
  boss: boolean;
}

export interface TickReport {
  shots: ShotEvent[];
  kills: KillEvent[];
  leaks: LeakEvent[];
  spawned: ActiveEnemy[];
  /** 這一拍抽到符並放進手牌的格位；沒抽到為 null。 */
  drawnSlot: number | null;
  /** 手牌滿導致抽到的符流失。 */
  drawLost: boolean;
  bossSpawned: boolean;
}

const EMPTY_REPORT = (): TickReport => ({
  shots: [],
  kills: [],
  leaks: [],
  spawned: [],
  drawnSlot: null,
  drawLost: false,
  bossSpawned: false,
});

// ---------------------------------------------------------------- 關卡編成

/** 第 w 波（從 1 起算）的妖魔數。 */
export function waveCount(stage: number, wave: number): number {
  const { wave: cfg } = BALANCE;
  return Math.round(
    Math.min(
      cfg.countMax,
      cfg.countBase + cfg.countPerWave * (wave - 1) + cfg.countPerRealm * realmIndexForStage(stage),
    ),
  );
}

/** 第 w 波每隻妖魔的血量。 */
export function waveHp(stage: number, wave: number): number {
  const { wave: cfg } = BALANCE;
  return cfg.hpBase * Math.pow(cfg.hpGrowth, stage - 1) * (1 + cfg.hpPerWave * (wave - 1));
}

export function mobSpeed(stage: number): number {
  const { wave: cfg } = BALANCE;
  return Math.min(cfg.speedMax, cfg.speedBase + cfg.speedPerStage * (stage - 1));
}

/** 一隻妖魔攻進山門的代價。隨關卡成長，讓「堆耐久」不會變成唯一解。 */
export function leakCost(stage: number, boss: boolean): number {
  const { wave, boss: bossCfg } = BALANCE;
  const base = Math.max(
    1,
    Math.round(wave.leakCostBase * Math.pow(wave.leakCostGrowth, stage - 1)),
  );
  return boss ? base * bossCfg.gateHitMultiplier : base;
}

export function bossHp(stage: number): number {
  const { boss } = BALANCE;
  return boss.hpBase * Math.pow(boss.hpGrowth, stage - 1);
}

/** 擊殺一隻妖魔的金幣。 */
export function killGold(state: DefenseState, boss: boolean): number {
  const { gold } = BALANCE;
  const base = gold.killBase * Math.pow(gold.killGrowth, state.stage - 1);
  return base * (boss ? BALANCE.boss.goldBonus : 1) * state.loadout.goldMultiplier;
}

export function clearReward(state: DefenseState): number {
  const { gold } = BALANCE;
  return Math.round(
    gold.clearBase * Math.pow(gold.clearGrowth, state.stage - 1) * state.loadout.goldMultiplier,
  );
}

export function defeatReward(state: DefenseState): number {
  return Math.round(clearReward(state) * BALANCE.gold.defeatRatio);
}

/** 整關的出怪排程，含關底首領。給定種子完全可重現。 */
export function buildSpawnQueue(stage: number, rng: Rng): { queue: SpawnEntry[]; boss: BossDef } {
  const { wave: cfg } = BALANCE;
  const realm = realmForStage(stage);
  const mobs = ENEMIES.mobs.filter((mob) => mob.realm === realm.id);
  const bosses = ENEMIES.bosses.filter((item) => item.realm === realm.id);
  const boss = bosses[rng.int(0, Math.max(0, bosses.length - 1))];
  if (boss === undefined) throw new Error(`境界 ${realm.id} 沒有可用的首領`);

  const queue: SpawnEntry[] = [];
  const speed = mobSpeed(stage);

  for (let wave = 1; wave <= cfg.wavesPerStage; wave += 1) {
    const count = waveCount(stage, wave);
    const hp = waveHp(stage, wave);
    // 同一波用同一種妖魔，畫面上才看得出「這一波是狼群」而不是雜燴。
    const mob = mobs[rng.int(0, Math.max(0, mobs.length - 1))];
    // 攤開整波的出場時間，妖魔才是連續推進而不是一次湧出後空場。
    const gap = Math.max(cfg.minSpawnGapMs, (cfg.waveIntervalMs * cfg.waveSpread) / count);
    for (let i = 0; i < count; i += 1) {
      queue.push({
        atMs: (wave - 1) * cfg.waveIntervalMs + i * gap,
        lane: rng.int(0, LANES - 1),
        name: mob?.name ?? '無名之敵',
        art: mob?.art ?? 'bandit',
        bossArt: null,
        boss: false,
        hp,
        speed,
      });
    }
  }

  queue.push({
    atMs: cfg.wavesPerStage * cfg.waveIntervalMs,
    lane: Math.floor(LANES / 2),
    name: boss.name,
    art: 'demon',
    bossArt: boss.art,
    boss: true,
    hp: bossHp(stage),
    speed: BALANCE.boss.speed,
  });

  queue.sort((a, b) => a.atMs - b.atMs);
  return { queue, boss };
}

/** 妖魔可以走的縱列數。畫面上是五條路，決定的是視覺分佈而非數值。 */
export const LANES = 5;

export function createDefenseState(loadout: Loadout, rng: Rng): DefenseState {
  const { field } = BALANCE;
  const { queue, boss } = buildSpawnQueue(loadout.stage, rng);

  const hand: (Card | null)[] = new Array<Card | null>(field.handSlots).fill(null);
  // 場上格位數受「陣法擴充」影響，因此看 loadout 而不是直接看 balance。
  const slots: (Card | null)[] = new Array<Card | null>(loadout.fieldSlots).fill(null);
  for (let i = 0; i < field.startingField && i < slots.length; i += 1) {
    slots[i] = drawCard(loadout.stage, rng);
  }
  for (let i = 0; i < field.startingHand && i < hand.length; i += 1) {
    hand[i] = drawCard(loadout.stage, rng);
  }

  const state: DefenseState = {
    loadout,
    stage: loadout.stage,
    disciples: loadout.disciples,
    maxDisciples: loadout.disciples,
    gold: 0,
    hand,
    field: slots,
    cooldowns: new Array<number>(loadout.fieldSlots).fill(0),
    enemies: [],
    queue,
    bossDef: boss,
    nextId: 1,
    drawTimer: field.drawIntervalMs / loadout.drawSpeedMultiplier,
    elapsedMs: 0,
    bossSpawnedAtMs: null,
    bossAtGate: false,
    bossGateAccum: 0,
    bossKilled: false,
    leaks: 0,
    leakImmunityUsed: 0,
    kills: 0,
    merges: 0,
    peakTier: 0,
    outcome: 'running',
  };
  state.peakTier = highestTier(state);
  return state;
}

export function highestTier(state: DefenseState): number {
  let best = 0;
  for (const card of state.field) if (card !== null) best = Math.max(best, card.tier);
  for (const card of state.hand) if (card !== null) best = Math.max(best, card.tier);
  return best;
}

// ---------------------------------------------------------------- 玩家操作

// ---------------------------------------------------------------- 玩家操作

export interface CardSlot {
  where: 'hand' | 'field';
  index: number;
}

function listOf(state: DefenseState, where: 'hand' | 'field'): (Card | null)[] {
  return where === 'hand' ? state.hand : state.field;
}

export function cardAt(state: DefenseState, slot: CardSlot): Card | null {
  return listOf(state, slot.where)[slot.index] ?? null;
}

function place(state: DefenseState, slot: CardSlot, card: Card | null): void {
  listOf(state, slot.where)[slot.index] = card;
  if (slot.where === 'field') state.cooldowns[slot.index] = 0;
  if (card !== null) state.peakTier = Math.max(state.peakTier, card.tier);
}

/** 把一張符搬到空的格位（手牌↔場上都行）。 */
export function moveCard(state: DefenseState, from: CardSlot, to: CardSlot): boolean {
  const card = cardAt(state, from);
  if (card === null || cardAt(state, to) !== null) return false;
  place(state, to, card);
  listOf(state, from.where)[from.index] = null;
  return true;
}

/** 兩個格位互換內容。至少一邊有符才有意義。 */
export function swapSlots(state: DefenseState, a: CardSlot, b: CardSlot): boolean {
  if (a.where === b.where && a.index === b.index) return false;
  const cardA = cardAt(state, a);
  const cardB = cardAt(state, b);
  if (cardA === null && cardB === null) return false;
  place(state, a, cardB);
  place(state, b, cardA);
  return true;
}

/** 把手牌的一張符放到空的場上格位。 */
export function deployCard(state: DefenseState, handIndex: number, fieldIndex: number): boolean {
  return moveCard(state, { where: 'hand', index: handIndex }, { where: 'field', index: fieldIndex });
}

/** 把場上的一張符收回手牌（手牌有空位才行），用來重新編排陣位。 */
export function recallCard(state: DefenseState, fieldIndex: number): boolean {
  const slot = state.hand.indexOf(null);
  if (slot < 0) return false;
  return moveCard(state, { where: 'field', index: fieldIndex }, { where: 'hand', index: slot });
}

/**
 * 手牌與場上的一張符互換。
 *
 * 沒有這個動作的話會出現死局：場上格位都被別種符佔滿、手上一直抽到合不了的符，
 * 玩家除了看著抽到的符流失之外什麼都不能做。互換讓「換掉最弱的那一張」永遠是選項。
 */
export function swapCards(state: DefenseState, handIndex: number, fieldIndex: number): boolean {
  return swapSlots(state, { where: 'hand', index: handIndex }, { where: 'field', index: fieldIndex });
}

/** 棄掉手牌的一張符。手牌塞滿低階符時的最後手段。 */
export function discardHand(state: DefenseState, handIndex: number): boolean {
  if (state.hand[handIndex] == null) return false;
  state.hand[handIndex] = null;
  return true;
}

/**
 * 玩家把一張符拖到另一個格位時，一次決定要做什麼：能合就合，空位就搬，否則互換。
 *
 * 收斂成一個入口是刻意的：拖曳只有一種手勢，若「合成／放置／換位」各有各的條件，
 * 玩家會遇到「拖了半天什麼都沒發生」的挫折，而那正是這類遊戲最容易勸退人的地方。
 */
export type DropResult = 'merged' | 'moved' | 'swapped' | 'none';

export function dropOn(
  state: DefenseState,
  source: CardSlot,
  target: CardSlot,
  rng: Rng,
): DropResult {
  if (source.where === target.where && source.index === target.index) return 'none';
  if (mergeInto(state, source, target, rng)) return 'merged';
  if (cardAt(state, target) === null) return moveCard(state, source, target) ? 'moved' : 'none';
  return swapSlots(state, source, target) ? 'swapped' : 'none';
}

/**
 * 合成：把來源的符疊到同種同階的另一張上，階數 +1。
 *
 * 手牌之間也能合，不是只有場上——不然抽到的符只要和場上對不上就只能丟掉，
 * 玩家沒辦法「先在手裡湊一對再放下去」，整個決策層就少了一半。
 *
 * 符修的「符籙相生」有機率保留來源那一張符（留在原處），因此堆階數最快。
 */
export function mergeInto(
  state: DefenseState,
  source: CardSlot,
  target: CardSlot,
  rng: Rng,
): boolean {
  if (source.where === target.where && source.index === target.index) return false;
  const from = listOf(state, source.where);
  const into = listOf(state, target.where);
  const card = from[source.index];
  const onto = into[target.index];
  if (card === undefined || card === null || onto === undefined || onto === null) return false;
  if (card.type !== onto.type || card.tier !== onto.tier) return false;
  if (onto.tier >= maxTier(state)) return false;

  into[target.index] = { type: onto.type, tier: onto.tier + 1 };
  const refunded = rng.next() < state.loadout.sect.mergeRefundChance;
  if (!refunded) from[source.index] = null;
  if (target.where === 'field') state.cooldowns[target.index] = 0;
  state.merges += 1;
  state.peakTier = Math.max(state.peakTier, onto.tier + 1);
  return true;
}

function maxTier(state: DefenseState): number {
  return maxTierForStage(state.stage);
}

// ---------------------------------------------------------------- 每一拍

/** 依「離山門最近」排序，法寶永遠先打最急的那一隻。 */
function frontMost(state: DefenseState, count: number): ActiveEnemy[] {
  return [...state.enemies].sort((a, b) => b.y - a.y).slice(0, count);
}

/**
 * 推進一拍。場景與平衡模擬都呼叫這一支。
 *
 * 順序刻意是「開火 → 移動 → 判定漏怪」：這一拍打得死的妖魔就不會先攻進山門，
 * 否則在低畫格率的手機上會莫名其妙多漏幾隻。
 */
export function tickCombat(state: DefenseState, deltaMs: number, rng: Rng): TickReport {
  const report = EMPTY_REPORT();
  if (state.outcome !== 'running') return report;

  const { wave: waveCfg, field: fieldCfg } = BALANCE;
  state.elapsedMs += deltaMs;

  // 1. 抽符
  state.drawTimer -= deltaMs;
  while (state.drawTimer <= 0) {
    state.drawTimer += fieldCfg.drawIntervalMs / state.loadout.drawSpeedMultiplier;
    const slot = state.hand.indexOf(null);
    if (slot < 0) {
      report.drawLost = true;
      continue;
    }
    state.hand[slot] = drawCard(state.stage, rng);
    report.drawnSlot = slot;
  }

  // 2. 出怪
  while (state.queue.length > 0) {
    const next = state.queue[0];
    if (next === undefined || next.atMs > state.elapsedMs) break;
    state.queue.shift();
    const enemy: ActiveEnemy = {
      id: state.nextId,
      name: next.name,
      art: next.art,
      bossArt: next.bossArt,
      boss: next.boss,
      hp: next.hp,
      maxHp: next.hp,
      y: 0,
      lane: next.lane,
      speed: next.speed,
    };
    state.nextId += 1;
    state.enemies.push(enemy);
    report.spawned.push(enemy);
    if (next.boss) {
      state.bossSpawnedAtMs = state.elapsedMs;
      report.bossSpawned = true;
    }
  }

  // 3. 法寶開火。陣法加成每一拍重算一次——玩家隨時可能把符搬到別格。
  const bonuses = bonusesForField(state.field);
  for (let slot = 0; slot < state.field.length; slot += 1) {
    const card = state.field[slot];
    if (card === undefined || card === null) continue;
    const bonus = bonuses[slot] ?? NO_BONUS;
    const interval = cardInterval(card, state.loadout) / bonus.fireRate;
    const cooling = state.cooldowns[slot] ?? 0;
    let remaining = cooling - deltaMs;
    // 出手間隔可能比一拍還短，用 while 補齊，掉幀時輸出不會憑空消失。
    while (remaining <= 0) {
      remaining += interval;
      if (state.enemies.length === 0) {
        remaining = 0;
        break;
      }
      const def = cardDef(card.type);
      for (const target of frontMost(state, def.targets)) {
        if (target.hp <= 0) continue;
        const damage =
          cardDamage(card, state.loadout) *
          bonus.damage *
          (target.boss ? state.loadout.bossDamageMultiplier : 1);
        target.hp -= damage;
        report.shots.push({ slot, enemyId: target.id, damage, killed: target.hp <= 0 });
      }
    }
    state.cooldowns[slot] = remaining;
  }

  // 4. 收屍與發金幣
  const survivors: ActiveEnemy[] = [];
  for (const enemy of state.enemies) {
    if (enemy.hp > 0) {
      survivors.push(enemy);
      continue;
    }
    const gold = killGold(state, enemy.boss);
    state.gold += gold;
    state.kills += 1;
    if (enemy.boss) state.bossKilled = true;
    report.kills.push({ enemyId: enemy.id, boss: enemy.boss, gold });
  }
  state.enemies = survivors;

  // 5. 推進、砸門與漏怪
  const step = deltaMs / 1000;
  const stillOnTrack: ActiveEnemy[] = [];
  state.bossAtGate = false;
  for (const enemy of state.enemies) {
    enemy.y += enemy.speed * step;
    if (enemy.y < waveCfg.trackPx) {
      stillOnTrack.push(enemy);
      continue;
    }
    // 首領走到山門不會離開，牠停在門口一直砸，直到被打死或山門破。
    // 這就是「沒打死首領就不算通關」的結構性保證。
    if (enemy.boss) {
      enemy.y = waveCfg.trackPx;
      state.bossAtGate = true;
      stillOnTrack.push(enemy);
      continue;
    }
    state.leaks += 1;
    // 體修：每關前幾次漏怪由門人硬擋，山門不掉耐久。
    if (state.leakImmunityUsed < state.loadout.sect.leakImmunityCount) {
      state.leakImmunityUsed += 1;
      report.leaks.push({ enemyId: enemy.id, loss: 0, immune: true, boss: false });
      continue;
    }
    const loss = leakCost(state.stage, enemy.boss);
    state.disciples = Math.max(0, state.disciples - loss);
    report.leaks.push({ enemyId: enemy.id, loss, immune: false, boss: false });
  }
  state.enemies = stillOnTrack;

  // 5b. 首領砸門：以毫秒累積，掉幀時節奏不變。
  if (state.bossAtGate) {
    state.bossGateAccum += deltaMs;
    const boss = state.enemies.find((enemy) => enemy.boss);
    while (state.bossGateAccum >= BALANCE.boss.gateHitIntervalMs && boss !== undefined) {
      state.bossGateAccum -= BALANCE.boss.gateHitIntervalMs;
      state.leaks += 1;
      const loss = leakCost(state.stage, true);
      state.disciples = Math.max(0, state.disciples - loss);
      report.leaks.push({ enemyId: boss.id, loss, immune: false, boss: true });
    }
  } else {
    state.bossGateAccum = 0;
  }

  // 6. 勝負
  if (state.disciples <= 0) {
    state.outcome = 'defeated';
  } else if (state.queue.length === 0 && state.enemies.length === 0 && state.bossKilled) {
    // 首領沒死就不算通關。首領不會自己離開場上，所以這個條件在實作上也是必然的，
    // 但仍然明寫出來——這是規則，不是副作用。
    state.outcome = 'cleared';
  } else if (
    state.bossSpawnedAtMs !== null &&
    state.elapsedMs - state.bossSpawnedAtMs >= BALANCE.boss.timeLimitMs
  ) {
    state.outcome = 'timeout';
  }

  return report;
}

/** 首領當前的血量比例，沒有首領在場時為 null。 */
export function bossProgress(state: DefenseState): { enemy: ActiveEnemy; ratio: number } | null {
  const boss = state.enemies.find((enemy) => enemy.boss);
  if (boss === undefined) return null;
  return { enemy: boss, ratio: Math.max(0, boss.hp / boss.maxHp) };
}
