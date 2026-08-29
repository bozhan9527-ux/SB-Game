import { describe, it, expect } from 'vitest';
import { BALANCE, CARDS, SECTS } from '../src/data';
import type { Sect } from '../src/data/types';
import {
  canMerge,
  cardDamage,
  cardDps,
  cardInterval,
  drawCard,
  fieldDps,
  maxTierForStage,
  mergedCard,
} from '../src/systems/deck';
import type { Card } from '../src/systems/deck';
import type { ActiveEnemy } from '../src/systems/defense';
import {
  bossHp,
  clearReward,
  createDefenseState,
  defeatReward,
  deployCard,
  discardHand,
  dropOn,
  highestTier,
  killGold,
  leakCost,
  mergeInto,
  mobSpeed,
  recallCard,
  swapCards,
  tickCombat,
  waveCount,
  waveHp,
} from '../src/systems/defense';
import { activeFormations } from '../src/systems/formation';
import { buildLoadoutFor } from '../src/systems/loadout';
import { talismanDefs } from '../src/systems/talismans';
import { createRng } from '../src/systems/rng';

function sect(id: string): Sect {
  const found = SECTS.find((item) => item.id === id);
  if (found === undefined) throw new Error(id);
  return found;
}

function stateFor(
  sectId: string,
  stage = 1,
  seed = 42,
  upgrades: Record<string, number> = {},
  talismans?: string[],
) {
  const pool = talismans === undefined ? undefined : talismanDefs(talismans, 999);
  return createDefenseState(
    buildLoadoutFor(sect(sectId), upgrades, stage, pool),
    createRng(seed),
  );
}

/** 測試用的妖魔。減速與灼燒欄位一律從乾淨狀態起算。 */
function mob(over: Partial<ActiveEnemy> = {}): ActiveEnemy {
  return {
    id: 1,
    name: 'x',
    art: 'bandit',
    bossArt: null,
    boss: false,
    hp: 100,
    maxHp: 100,
    y: 0,
    lane: 0,
    speed: 0,
    slowUntilMs: 0,
    slowPercent: 0,
    burnRemaining: 0,
    burnPerMs: 0,
    trait: 'none',
    spawnedBySplit: false,
    ...over,
  };
}

describe('法寶符', () => {
  it('階數上限隨關卡成長——這是長期成長唯一的指數來源', () => {
    const { field } = BALANCE;
    expect(maxTierForStage(1)).toBe(field.maxTierBase);
    expect(maxTierForStage(1 + field.stagesPerTier)).toBe(field.maxTierBase + 1);
    expect(maxTierForStage(81)).toBeGreaterThan(maxTierForStage(1));
  });

  it('每升一階傷害乘上 tierGrowth', () => {
    const loadout = buildLoadoutFor(sect('body'), {}, 1);
    const low: Card = { type: 'flame', tier: 1 };
    const high: Card = { type: 'flame', tier: 2 };
    expect(cardDamage(high, loadout) / cardDamage(low, loadout)).toBeCloseTo(BALANCE.field.tierGrowth, 6);
  });

  it('只有同種同階、且未達上限的兩張符能合成', () => {
    const a: Card = { type: 'sword', tier: 2 };
    expect(canMerge(a, { type: 'sword', tier: 2 }, 1)).toBe(true);
    expect(canMerge(a, { type: 'bolt', tier: 2 }, 1)).toBe(false);
    expect(canMerge(a, { type: 'sword', tier: 3 }, 1)).toBe(false);
    const capped: Card = { type: 'sword', tier: maxTierForStage(1) };
    expect(canMerge(capped, { ...capped }, 1)).toBe(false);
    expect(mergedCard(a).tier).toBe(3);
  });

  it('抽到的符落在上限以下若干階，不會直接抽到頂', () => {
    const rng = createRng(7);
    for (let i = 0; i < 200; i += 1) {
      const card = drawCard(buildLoadoutFor(sect('body'), {}, 20), 20, rng);
      expect(card.tier).toBeLessThanOrEqual(maxTierForStage(20));
      expect(card.tier).toBeGreaterThanOrEqual(1);
      expect(CARDS.some((def) => def.id === card.type)).toBe(true);
    }
  });

  it('御器訣加快出手，門派專精讓那一種符更痛', () => {
    const plain = buildLoadoutFor(sect('body'), {}, 1);
    const fast = buildLoadoutFor(sect('body'), { startDefense: 20 }, 1);
    const card: Card = { type: 'sword', tier: 1 };
    expect(cardInterval(card, fast)).toBeLessThan(cardInterval(card, plain));

    const swordSect = buildLoadoutFor(sect('sword'), {}, 1);
    const bodySect = buildLoadoutFor(sect('body'), {}, 1);
    expect(cardDamage(card, swordSect) / cardDamage(card, bodySect)).toBeCloseTo(
      (sect('sword').damageMultiplier * sect('sword').favoredDamageMultiplier) /
        sect('body').damageMultiplier,
      6,
    );
  });

  it('沒有成陣時，場上總輸出就是各張符的加總', () => {
    const loadout = buildLoadoutFor(sect('body'), {}, 1);
    // 六格兩列三欄，刻意排成沒有任何一條線同種。
    const field: (Card | null)[] = [
      { type: 'sword', tier: 2 }, null, { type: 'fan', tier: 1 },
      null, { type: 'bolt', tier: 1 }, null,
    ];
    expect(activeFormations(field)).toHaveLength(0);
    expect(fieldDps(field, loadout)).toBeCloseTo(
      cardDps({ type: 'sword', tier: 2 }, loadout) +
        cardDps({ type: 'fan', tier: 1 }, loadout) +
        cardDps({ type: 'bolt', tier: 1 }, loadout),
      6,
    );
  });
});

describe('山門防守', () => {
  it('開局有起始手牌與起始法寶，格位數由陣法擴充決定', () => {
    const state = stateFor('body', 1, 1, { fieldSlots: 2 });
    expect(state.field.length).toBe(BALANCE.field.fieldSlots + 2);
    expect(state.hand.filter((c) => c !== null).length).toBe(BALANCE.field.startingHand);
    expect(state.field.filter((c) => c !== null).length).toBe(BALANCE.field.startingField);
  });

  it('放置、收回、互換、棄置都只在合法的情況下成立', () => {
    const state = stateFor('body');
    const empty = state.field.indexOf(null);
    const held = state.hand.findIndex((c) => c !== null);
    expect(deployCard(state, held, empty)).toBe(true);
    expect(state.hand[held]).toBeNull();
    // 同一格已經有符，不能再放。
    expect(deployCard(state, state.hand.findIndex((c) => c !== null), empty)).toBe(false);
    expect(recallCard(state, empty)).toBe(true);
    expect(recallCard(state, empty)).toBe(false);
  });

  it('合成把場上那一張升一階，並消耗來源', () => {
    const state = stateFor('body');
    state.hand[0] = { type: 'sword', tier: 2 };
    state.field[0] = { type: 'sword', tier: 2 };
    expect(mergeInto(state, { where: 'hand', index: 0 }, { where: 'field', index: 0 }, createRng(1))).toBe(true);
    expect(state.field[0]).toEqual({ type: 'sword', tier: 3 });
    expect(state.hand[0]).toBeNull();
    expect(state.merges).toBe(1);
    expect(state.peakTier).toBeGreaterThanOrEqual(3);
  });

  it('符修的「符籙相生」會保留來源那一張，其他門派不會', () => {
    const trial = (sectId: string): number => {
      let kept = 0;
      for (let i = 0; i < 200; i += 1) {
        const state = stateFor(sectId, 1, 100 + i);
        state.hand[0] = { type: 'sword', tier: 1 };
        state.field[0] = { type: 'sword', tier: 1 };
        mergeInto(state, { where: 'hand', index: 0 }, { where: 'field', index: 0 }, createRng(i * 31 + 7));
        if (state.hand[0] !== null) kept += 1;
      }
      return kept;
    };
    expect(trial('talisman')).toBeGreaterThan(0);
    expect(trial('body')).toBe(0);
  });

  it('不同種或不同階不能合成，達到上限也不能', () => {
    const state = stateFor('body');
    const rng = createRng(1);
    state.hand[0] = { type: 'sword', tier: 1 };
    state.field[0] = { type: 'bolt', tier: 1 };
    expect(mergeInto(state, { where: 'hand', index: 0 }, { where: 'field', index: 0 }, rng)).toBe(false);
    state.field[0] = { type: 'sword', tier: 2 };
    expect(mergeInto(state, { where: 'hand', index: 0 }, { where: 'field', index: 0 }, rng)).toBe(false);
    const cap = maxTierForStage(state.stage);
    state.hand[0] = { type: 'sword', tier: cap };
    state.field[0] = { type: 'sword', tier: cap };
    expect(mergeInto(state, { where: 'hand', index: 0 }, { where: 'field', index: 0 }, rng)).toBe(false);
  });

  it('拖放只有一個入口：能合就合、空位就搬、否則互換', () => {
    const state = stateFor('body');
    const rng = createRng(17);
    state.hand[0] = { type: 'fan', tier: 2 };
    state.hand[1] = { type: 'fan', tier: 2 };
    state.field[0] = { type: 'bolt', tier: 1 };
    state.field[1] = null;

    expect(dropOn(state, { where: 'hand', index: 0 }, { where: 'hand', index: 1 }, rng)).toBe('merged');
    expect(dropOn(state, { where: 'hand', index: 1 }, { where: 'field', index: 1 }, rng)).toBe('moved');
    state.hand[0] = { type: 'sword', tier: 1 };
    expect(dropOn(state, { where: 'hand', index: 0 }, { where: 'field', index: 0 }, rng)).toBe('swapped');
    expect(dropOn(state, { where: 'hand', index: 0 }, { where: 'hand', index: 0 }, rng)).toBe('none');
  });

  it('手牌之間也能合成：可以先在手裡湊一對再放下去', () => {
    const state = stateFor('body');
    state.hand[0] = { type: 'flame', tier: 2 };
    state.hand[1] = { type: 'flame', tier: 2 };
    expect(mergeInto(state, { where: 'hand', index: 0 }, { where: 'hand', index: 1 }, createRng(3))).toBe(true);
    expect(state.hand[1]).toEqual({ type: 'flame', tier: 3 });
    expect(state.hand[0]).toBeNull();
  });

  it('互換與棄置讓「場上塞滿爛符」不會變成死局', () => {
    const state = stateFor('body');
    state.hand[0] = { type: 'bolt', tier: 5 };
    state.field[0] = { type: 'sword', tier: 1 };
    expect(swapCards(state, 0, 0)).toBe(true);
    expect(state.field[0]).toEqual({ type: 'bolt', tier: 5 });
    expect(state.hand[0]).toEqual({ type: 'sword', tier: 1 });
    expect(discardHand(state, 0)).toBe(true);
    expect(state.hand[0]).toBeNull();
    expect(discardHand(state, 0)).toBe(false);
  });

  it('漏怪代價隨關卡成長，首領砸門更貴', () => {
    expect(leakCost(1, false)).toBeGreaterThanOrEqual(1);
    expect(leakCost(60, false)).toBeGreaterThan(leakCost(1, false));
    expect(leakCost(1, true)).toBe(leakCost(1, false) * BALANCE.boss.gateHitMultiplier);
  });

  it('首領走到山門不會離開，會停在門口一直砸', () => {
    const state = stateFor('sword', 1, 21);
    const rng = createRng(21);
    state.queue = [];
    state.enemies = [
      mob({
        name: '首領', art: 'demon', bossArt: 'beast', boss: true,
        hp: 1e9, maxHp: 1e9, y: BALANCE.wave.trackPx, lane: 2, speed: BALANCE.boss.speed,
      }),
    ];
    const before = state.disciples;

    // 砸門的間隔一到就扣耐久，而且首領還在場上。
    const report = tickCombat(state, BALANCE.boss.gateHitIntervalMs, rng);
    expect(report.leaks.some((leak) => leak.boss)).toBe(true);
    expect(state.disciples).toBe(before - leakCost(state.stage, true));
    expect(state.enemies).toHaveLength(1);
    expect(state.outcome).toBe('running');
  });

  it('首領沒死就不算通關——場上清空也一樣', () => {
    const state = stateFor('body', 1, 22);
    state.queue = [];
    state.enemies = [];
    state.bossKilled = false;
    tickCombat(state, 100, createRng(22));
    expect(state.outcome).toBe('running');

    state.bossKilled = true;
    tickCombat(state, 100, createRng(22));
    expect(state.outcome).toBe('cleared');
  });

  it('一波比一波多、一關比一關硬', () => {
    expect(waveCount(1, 2)).toBeGreaterThan(waveCount(1, 1));
    expect(waveHp(1, 2)).toBeGreaterThan(waveHp(1, 1));
    expect(waveHp(20, 1)).toBeGreaterThan(waveHp(1, 1));
    expect(bossHp(20)).toBeGreaterThan(bossHp(1));
    expect(mobSpeed(40)).toBeGreaterThan(mobSpeed(1));
    expect(mobSpeed(9999)).toBeLessThanOrEqual(BALANCE.wave.speedMax);
  });

  it('反應窗口有下限：妖魔走完全程的時間不會被無限壓縮', () => {
    // 這是 PROGRESS L-18：製作人在第 97 關回報「出怪太快，符陣來不及排」。
    // 走完全程的時間就是玩家從看到妖魔到它砸門之間能做事的全部時間，
    // 而排一次陣需要的拖曳次數是固定的。這個窗口若隨關卡單調縮短，
    // 「肯花時間排陣」在後期就變成純懲罰——和陣法的設計意圖完全相反。
    const crossingMs = (stage: number): number => (BALANCE.wave.trackPx / mobSpeed(stage)) * 1000;

    // 前期仍然要越來越快，壓力感是真的。
    expect(crossingMs(1)).toBeGreaterThan(crossingMs(40));
    // 但有地板，而且地板不能低於「把一列三格排好」所需的時間。
    // 8 秒是實測值：低於這個數字，慢慢排陣的玩家在第 97 關的勝率會掉到三成以下。
    const floorMs = crossingMs(99999);
    expect(floorMs, '反應窗口的下限太短，後期排陣會變成懲罰').toBeGreaterThanOrEqual(8000);
    for (const stage of [82, 97, 120, 500, 9999]) {
      expect(crossingMs(stage)).toBeCloseTo(floorMs, 6);
    }
  });

  it('飛升境（第 82 關之後）只長血量，不再加速也不再加量', () => {
    // 無限模式從來沒被模擬過，這正是 L-18 的根本原因：測試只跑到第 81 關。
    // 難度的指數來源是血量（hpGrowth），那條可以無限長；
    // 速度與密度是「玩家的操作預算」，它們不能無限被吃掉。
    expect(mobSpeed(97)).toBe(mobSpeed(200));
    expect(waveCount(97, 5)).toBe(waveCount(200, 5));
    expect(waveHp(200, 5)).toBeGreaterThan(waveHp(97, 5));
    expect(bossHp(200)).toBeGreaterThan(bossHp(97));
  });

  it('飛升境的階數上限走比較快的節奏，但第 1–81 關一格都不動', () => {
    // 長期難度是兩條指數在賽跑：傷害上限每 3 關 ×1.35，血量每關 ×1.148。
    // 主線用 3 關 +1 階，一段淨值 1.35÷1.148³ = ×0.892——每三關玩家掉 10.8%，
    // 複利下去必然撞牆（實測第 130 關附近）。飛升境改用較快的節奏把牆推遠。
    const { field } = BALANCE;
    const steady = (stage: number): number =>
      field.maxTierBase + Math.floor((Math.max(1, stage) - 1) / field.stagesPerTier);

    // 主線完全不受影響——那條曲線是校準過的，不能因為改飛升境而動到。
    for (let stage = 1; stage <= 81; stage += 1) {
      expect(maxTierForStage(stage), `第 ${stage} 關的階數上限變了`).toBe(steady(stage));
    }
    // 任何一關都不得低於原本的節奏：換節奏若讓某幾關倒退，玩家看到的是「越推越弱」。
    for (let stage = 1; stage <= 400; stage += 1) {
      expect(maxTierForStage(stage), `第 ${stage} 關比舊規則還低`).toBeGreaterThanOrEqual(steady(stage));
    }
    // 而且要真的比較快，否則這條設定等於沒作用。
    expect(field.ascendStagesPerTier).toBeLessThan(field.stagesPerTier);
    expect(maxTierForStage(200)).toBeGreaterThan(steady(200));
  });

  it('飛升境仍然會越來越難，只是慢得多——無限模式不該永遠不難', () => {
    const { field } = BALANCE;
    const net = field.tierGrowth / Math.pow(BALANCE.wave.hpGrowth, field.ascendStagesPerTier);
    // 小於 1：難度仍在爬升，飛升境終究會結束。等於 1 的話進飛升境時多輕鬆就永遠多輕鬆，
    // 那條「無限」就變成無限的無聊。
    expect(net, '飛升境不再變難，等於沒有難度曲線').toBeLessThan(1);
    // 但要慢到讓飛升境的長度和主線（81 關）相當。實測：相對戰力減半約 90 關時，
    // 真人速度下起手四符從第 82 關可以推到 170 附近，也就是再玩一輪主線的長度。
    const halveIn = (Math.log(0.5) / Math.log(net)) * field.ascendStagesPerTier;
    expect(halveIn, `戰力減半只需 ${halveIn.toFixed(0)} 關，飛升境太短`).toBeGreaterThan(60);
    expect(halveIn, `戰力減半要 ${halveIn.toFixed(0)} 關，飛升境長到沒有終點`).toBeLessThan(130);
  });

  it('妖魔走到山門就扣耐久，扣到零即失守', () => {
    const state = stateFor('sword', 1, 5);
    const rng = createRng(5);
    // 直接把一隻妖魔放到終點前一步，驗證漏怪的結算。
    tickCombat(state, 100, rng);
    const enemy = state.enemies[0];
    expect(enemy).toBeDefined();
    if (enemy === undefined) return;
    enemy.y = BALANCE.wave.trackPx;
    enemy.hp = 1e9;
    const before = state.disciples;
    const report = tickCombat(state, 100, rng);
    expect(report.leaks.length).toBe(1);
    expect(state.disciples).toBe(before - leakCost(state.stage, false));
  });

  it('體修的「銅皮鐵骨」擋下前幾次漏怪', () => {
    const state = stateFor('body', 1, 5);
    const rng = createRng(5);
    tickCombat(state, 100, rng);
    const before = state.disciples;
    for (let i = 0; i < sect('body').leakImmunityCount; i += 1) {
      tickCombat(state, 100, rng);
      const enemy = state.enemies[0];
      if (enemy === undefined) break;
      enemy.y = BALANCE.wave.trackPx;
      enemy.hp = 1e9;
      const report = tickCombat(state, 100, rng);
      expect(report.leaks[0]?.immune).toBe(true);
    }
    expect(state.disciples).toBe(before);
  });

  it('溢傷是真的：天雷符打小妖會浪費，風刃符不會', () => {
    // 兩張理論 dps 相近的符，打一群低血量小妖時，多目標的那張實際效率更高。
    const run = (type: string): number => {
      const state = stateFor('body', 1, 9);
      const rng = createRng(9);
      state.field.fill(null);
      state.field[0] = { type, tier: 6 };
      state.enemies = Array.from({ length: 8 }, (_, i) => mob({ id: i + 1, hp: 30, maxHp: 30 }));
      state.queue = [];
      let killed = 0;
      for (let i = 0; i < 40; i += 1) killed += tickCombat(state, 100, rng).kills.length;
      return killed;
    };
    expect(run('fan')).toBeGreaterThan(run('bolt'));
  });

  it('掉幀不影響輸出總量：一次 200ms 與兩次 100ms 打出的傷害相同', () => {
    const build = () => {
      const state = stateFor('body', 1, 3);
      state.field.fill(null);
      state.field[0] = { type: 'sword', tier: 3 };
      state.queue = [];
      state.enemies = [mob({ hp: 1e9, maxHp: 1e9 })];
      return state;
    };
    const coarse = build();
    const fine = build();
    for (let i = 0; i < 10; i += 1) tickCombat(coarse, 200, createRng(1));
    for (let i = 0; i < 20; i += 1) tickCombat(fine, 100, createRng(1));
    expect(coarse.enemies[0]!.hp).toBeCloseTo(fine.enemies[0]!.hp, 4);
  });

  it('清完所有妖魔與首領就是通關，耐久歸零就是失守', () => {
    const state = stateFor('body', 1, 11);
    const rng = createRng(11);
    state.queue = [];
    state.enemies = [];
    state.bossKilled = true;
    tickCombat(state, 100, rng);
    expect(state.outcome).toBe('cleared');

    const lost = stateFor('body', 1, 12);
    lost.disciples = 0;
    tickCombat(lost, 100, createRng(12));
    expect(lost.outcome).toBe('defeated');
  });

  it('金幣獎勵隨關卡等比成長（指數花費配線性收入會讓升級停擺）', () => {
    const early = stateFor('body', 1);
    const late = stateFor('body', 30);
    expect(clearReward(late)).toBeGreaterThan(clearReward(early) * 5);
    expect(killGold(late, false)).toBeGreaterThan(killGold(early, false));
    expect(killGold(early, true)).toBeGreaterThan(killGold(early, false));
    expect(defeatReward(early)).toBeLessThan(clearReward(early));
  });

  it('最高階數會被記錄下來，供成就判定', () => {
    const state = stateFor('body');
    state.field[0] = { type: 'sword', tier: 7 };
    expect(highestTier(state)).toBe(7);
  });
});
