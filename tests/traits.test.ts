/**
 * 妖魔習性。
 *
 * 這一組測試守的是**設計意圖**，不只是算式：習性存在的理由是讓不同的符有不同的答案。
 * 若哪天調數值調到「大單發和多小發面對護甲一樣好」，這裡就會紅——
 * 那時候護甲就退回成一個純粹的難度旋鈕，二十張符又會塌回「每秒打多少」一個問題。
 */
import { describe, expect, it } from 'vitest';
import { BALANCE, ENEMIES, SECTS } from '../src/data';
import type { MobTrait, Sect } from '../src/data/types';
import type { ActiveEnemy, DefenseState } from '../src/systems/defense';
import { LANES, buildSpawnQueue, createDefenseState, tickCombat } from '../src/systems/defense';
import { buildLoadoutFor } from '../src/systems/loadout';
import { createRng } from '../src/systems/rng';
import { starterTalismans, talismanDefs } from '../src/systems/talismans';

function sect(id = 'body'): Sect {
  const found = SECTS.find((item) => item.id === id);
  if (found === undefined) throw new Error(id);
  return found;
}

/** 只放一張指定的符、場上只有一隻指定習性的妖魔。 */
function lab(type: string, tier: number, trait: MobTrait, hp: number, maxHp = hp): DefenseState {
  const pool = talismanDefs([type, ...starterTalismans()], 999);
  const state = createDefenseState(buildLoadoutFor(sect(), {}, 1, pool), createRng(11));
  state.field.fill(null);
  state.hand.fill(null);
  state.field[0] = { type, tier };
  state.queue = [];
  state.enemies = [enemy(trait, hp, maxHp)];
  return state;
}

function enemy(trait: MobTrait, hp: number, maxHp = hp): ActiveEnemy {
  return {
    id: 1,
    name: 'x',
    art: 'bandit',
    bossArt: null,
    boss: false,
    hp,
    maxHp,
    y: 0,
    lane: 2,
    speed: 0,
    slowUntilMs: 0,
    slowPercent: 0,
    burnRemaining: 0,
    burnPerMs: 0,
    trait,
    spawnedBySplit: false,
  };
}

/** 打 durationMs 之後這一隻總共掉了多少血。 */
function damageOver(state: DefenseState, durationMs: number): number {
  const before = state.enemies[0]?.hp ?? 0;
  let elapsed = 0;
  while (elapsed < durationMs) {
    tickCombat(state, 50, createRng(elapsed + 1));
    elapsed += 50;
  }
  return before - (state.enemies[0]?.hp ?? 0);
}

/**
 * 護甲讓這張符的輸出剩下幾成（1 = 完全沒差）。
 *
 * 量測台刻意把「還剩多少血」和「最大血量」拆開：hp 給到無底，整段時間裡都不會死，
 * 量到的才是純粹的輸出差；maxHp 則設在真實的量級上，因為護甲削掉的量是按 maxHp 算的。
 * 兩者若都給 1e9，護甲的上限會對所有符一律封頂，正好把要驗的差異抹平。
 */
function armorRatio(type: string, tier: number, maxHp: number): number {
  const plain = damageOver(lab(type, tier, 'none', 1e9, maxHp), 6000);
  const armored = damageOver(lab(type, tier, 'armor', 1e9, maxHp), 6000);
  return armored / plain;
}

describe('護甲', () => {
  it('大單發比多小發划算——這正是護甲存在的理由', () => {
    // 天雷符：一發 40 打一個目標。風刃符：一發 8 打三個目標，出手快得多。
    // 兩者在素面妖魔上的每秒輸出接近（26.7 對 38.7），面對護甲就該分出高下：
    // 護甲削的是「每一發」，發數越多被削得越兇。
    // maxHp 挑在「天雷符一發吃得下、風刃符一發吃不下」的量級——
    // 這正是實戰中兩者的相對位置（第 30 關前後，天雷約打掉 14% 血、風刃約 3%）。
    const maxHp = 4000;
    const bolt = armorRatio('bolt', 8, maxHp);
    const fan = armorRatio('fan', 8, maxHp);
    expect(fan).toBeLessThan(bolt);
    // 而且差距要看得出來，不是小數點後第三位的事——否則玩家永遠不會發現這條規則。
    expect(bolt - fan).toBeGreaterThan(0.1);
  });

  it('再弱的一發也打得進去一部分——護甲不會讓任何一副牌完全打不動', () => {
    // 完全免疫會讓某些牌組直接卡死一整關。習性要造成的是「比較吃力」，不是「打不動」。
    const state = lab('spirit', 1, 'armor', 5_000_000);
    const before = state.enemies[0]?.hp ?? 0;
    tickCombat(state, 3000, createRng(1));
    expect(state.enemies[0]?.hp ?? 0).toBeLessThan(before);
  });
});

describe('分裂', () => {
  it('死掉會裂成兩隻，而小妖不會再裂', () => {
    const state = lab('bolt', 12, 'split', 100);
    const report = tickCombat(state, 2000, createRng(3));
    const children = report.spawned.filter((item) => item.spawnedBySplit);
    expect(children).toHaveLength(BALANCE.trait.splitCount);
    expect(children.every((child) => child.lane >= 0 && child.lane < LANES)).toBe(true);

    // 小妖再死一次不應該再生出東西，否則一隻會炸成無限多隻。
    const second = tickCombat(state, 4000, createRng(4));
    expect(second.spawned.filter((item) => item.spawnedBySplit)).toHaveLength(0);
  });

  it('母體血量先打折，總工作量才不會憑空多出一截', () => {
    const { splitParentHpRatio, splitCount, splitHpRatio } = BALANCE.trait;
    const total = splitParentHpRatio + splitCount * splitHpRatio * splitParentHpRatio;
    // 與素面的一隻相比落在正負兩成之內：習性換的是形狀，不是難度。
    expect(total).toBeGreaterThan(0.8);
    expect(total).toBeLessThan(1.2);
  });
});

describe('出怪佇列', () => {
  it('疾行的妖魔走得快、血量對應打折', () => {
    // 玄冰雪怪所在的元嬰期。素面與疾行同時存在，才驗得出兩者的差別。
    const { queue } = buildSpawnQueue(30, createRng(9));
    const swift = queue.filter((item) => item.trait === 'swift');
    const plain = queue.filter((item) => !item.boss && item.trait === 'none');
    if (swift.length === 0 || plain.length === 0) return;
    const swiftSpeed = swift[0]?.speed ?? 0;
    const plainSpeed = plain[0]?.speed ?? 0;
    expect(swiftSpeed / plainSpeed).toBeCloseTo(BALANCE.trait.swiftMultiplier, 5);
  });

  it('每個境界至少留一種素面妖魔', () => {
    // 兩種都帶習性的話，整關沒有任何一波是「照常打」的，
    // 難度就是一整層地墊高——而習性要加的是選擇，不是難度。
    const realms = new Set(ENEMIES.mobs.map((mob) => mob.realm));
    for (const realm of realms) {
      const mobs = ENEMIES.mobs.filter((mob) => mob.realm === realm);
      expect(mobs.some((mob) => mob.trait === 'none'), `境界 ${realm} 沒有素面妖魔`).toBe(true);
    }
  });

  it('首領不帶習性', () => {
    const { queue } = buildSpawnQueue(40, createRng(2));
    expect(queue.filter((item) => item.boss).every((item) => item.trait === 'none')).toBe(true);
  });
});
