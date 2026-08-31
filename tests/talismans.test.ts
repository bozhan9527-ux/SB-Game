import { describe, it, expect } from 'vitest';
import { BALANCE, CARDS, SECTS } from '../src/data';
import type { CardDef, Sect } from '../src/data/types';
import { boardBonuses, fieldPassives, neighboursOf } from '../src/systems/board';
import { cardDps, drawCard } from '../src/systems/deck';
import type { Card } from '../src/systems/deck';
import type { ActiveEnemy, DefenseState } from '../src/systems/defense';
import { createDefenseState, tickCombat } from '../src/systems/defense';
import { buildLoadoutFor } from '../src/systems/loadout';
import { createRng } from '../src/systems/rng';
import {
  TALISMAN_CATEGORIES,
  TALISMAN_SLOTS,
  matchesCategory,
  sortTalismans,
  effectLines,
  isCompleteLoadout,
  isUnlocked,
  nextUnlock,
  sanitizeTalismans,
  starterTalismans,
  talismanDefs,
  unlockedTalismans,
} from '../src/systems/talismans';

function sect(id = 'body'): Sect {
  const found = SECTS.find((item) => item.id === id);
  if (found === undefined) throw new Error(id);
  return found;
}

function def(id: string): CardDef {
  const found = CARDS.find((card) => card.id === id);
  if (found === undefined) throw new Error(id);
  return found;
}

/** 一場只放一張指定的符、其餘清空的戰場，用來單獨量一種特效。 */
function lab(type: string, tier = 6, seed = 5): DefenseState {
  const pool = talismanDefs([type, ...starterTalismans()], 999);
  const state = createDefenseState(buildLoadoutFor(sect(), {}, 1, pool), createRng(seed));
  state.field.fill(null);
  state.hand.fill(null);
  state.field[0] = { type, tier };
  state.queue = [];
  return state;
}

function mob(over: Partial<ActiveEnemy> = {}): ActiveEnemy {
  return {
    id: 1, name: 'x', art: 'bandit', bossArt: null, boss: false,
    hp: 1e9, maxHp: 1e9, y: 0, lane: 0, speed: 0,
    slowUntilMs: 0, slowPercent: 0, burnRemaining: 0, burnPerMs: 0,
    burnSource: null, trait: 'none', spawnedBySplit: false,
    ...over,
  };
}

/** 打 durationMs 之後這一隻總共掉了多少血。 */
function damageOver(state: DefenseState, durationMs: number, seed = 5): number {
  const rng = createRng(seed);
  const before = state.enemies[0]?.hp ?? 0;
  for (let t = 0; t < durationMs; t += 100) tickCombat(state, 100, rng);
  return before - (state.enemies[0]?.hp ?? 0);
}

describe('符籙譜', () => {
  it('二十張符，開局有四張，其餘靠推關解鎖', () => {
    expect(CARDS.length).toBe(20);
    const starters = CARDS.filter((card) => card.unlockStage <= 1);
    expect(starters.length).toBe(TALISMAN_SLOTS);
    expect(starterTalismans()).toEqual(['sword', 'bolt', 'fan', 'flame']);
    // 解鎖點散在 81 關裡，而且不重複——同一關一次解兩張，其中一張會被忽略。
    const later = CARDS.filter((card) => card.unlockStage > 1).map((card) => card.unlockStage);
    expect(new Set(later).size).toBe(later.length);
    expect(Math.max(...later)).toBeLessThanOrEqual(81);
  });

  it('解鎖看的是藏經閣打到第幾層，不是推到第幾關', () => {
    // v17 改制：十六張非基礎符只有藏經閣產出。推關再深也拿不到符，
    // 這正是「副本是必經內容」這個決定的具體後果。
    expect(unlockedTalismans(0)).toHaveLength(TALISMAN_SLOTS);
    expect(unlockedTalismans(16)).toHaveLength(CARDS.length);
    expect(unlockedTalismans(3)).toHaveLength(TALISMAN_SLOTS + 3);
    expect(isUnlocked('slayer', 3)).toBe(false);
    expect(isUnlocked('slayer', 16)).toBe(true);
    // 一層一張，順序就是 cards.json 的順序。
    expect(nextUnlock(0)?.id).toBe('frost');
    expect(nextUnlock(16)).toBeNull();
  });

  it('壞掉的配置一律修補成一份能開場的四張，不讓存檔炸掉開場', () => {
    // 不存在的 id、還沒解鎖的、重複的，全部丟掉再補滿。
    expect(sanitizeTalismans(['沒這張', 'slayer', 'sword', 'sword'], 1)).toHaveLength(TALISMAN_SLOTS);
    expect(sanitizeTalismans([], 1)).toEqual(starterTalismans());
    expect(sanitizeTalismans(['fan'], 1)[0]).toBe('fan');
    expect(new Set(sanitizeTalismans(['fan', 'fan', 'fan'], 1)).size).toBe(TALISMAN_SLOTS);
    // 已解鎖的照樣留下。
    expect(sanitizeTalismans(['slayer', 'sword', 'fan', 'flame'], 16)).toContain('slayer');
  });

  it('湊滿四張且都合法才能入場', () => {
    expect(isCompleteLoadout(['sword', 'bolt', 'fan'], 16)).toBe(false);
    expect(isCompleteLoadout(['sword', 'sword', 'fan', 'flame'], 16)).toBe(false);
    expect(isCompleteLoadout(['sword', 'bolt', 'fan', 'slayer'], 3)).toBe(false);
    expect(isCompleteLoadout(['sword', 'bolt', 'fan', 'slayer'], 16)).toBe(true);
  });

  it('抽符池就是帶的那四張，不會抽到沒帶的符', () => {
    const pool = ['frost', 'slayer', 'grand', 'seal'];
    const loadout = buildLoadoutFor(sect(), {}, 40, talismanDefs(pool, 999));
    const rng = createRng(3);
    const seen = new Set<string>();
    for (let i = 0; i < 400; i += 1) seen.add(drawCard(loadout, 40, rng).type);
    expect([...seen].sort()).toEqual([...pool].sort());
  });

  it('每一張符都真的有事做：不是特效就是規格上有取捨', () => {
    for (const card of CARDS) {
      const lines = effectLines(card);
      const plain = ['sword', 'bolt', 'fan', 'flame', 'myriad'].includes(card.id);
      // 起手四張與萬劍歸宗符靠規格（傷害／間隔／道數）本身區分，其餘一定有特效。
      expect(plain || lines.length > 0, `${card.name} 既沒有特效也沒有規格上的特色`).toBe(true);
      for (const line of lines) expect(line.length).toBeGreaterThan(0);
    }
  });

  it('沒有一張符是全面上位：帳面 dps 高的，一定在別處付了代價', () => {
    const loadout = buildLoadoutFor(sect(), {}, 1);
    const dps = (id: string): number => cardDps({ type: id, tier: 1 }, loadout);
    const ranked = [...CARDS].sort((a, b) => dps(b.id) - dps(a.id));
    const top = ranked[0];
    const bottom = ranked[ranked.length - 1];
    if (top === undefined || bottom === undefined) throw new Error('沒有符');
    // 帳面最高的那張沒有任何特效——強度全在數字上，看得見。
    expect(effectLines(top)).toHaveLength(0);
    // 帳面最低的那張一定有特效，否則它就只是一張爛牌。
    expect(effectLines(bottom).length).toBeGreaterThan(0);
    // 帳面差距控制在六倍以內：再大的話低 dps 的支援符會稀釋掉整個抽符池。
    expect(dps(top.id) / dps(bottom.id)).toBeLessThan(6);
  });
});

describe('符籙特效', () => {
  it('寒冰符減速：同樣的時間，被打過的妖魔走得比較短', () => {
    const run = (type: string): number => {
      const state = lab(type, 4);
      state.enemies = [mob({ speed: 100, y: 0 })];
      const rng = createRng(11);
      for (let t = 0; t < 3000; t += 100) tickCombat(state, 100, rng);
      return state.enemies[0]?.y ?? 0;
    };
    expect(run('frost')).toBeLessThan(run('flame'));
    // 減速只影響推進，血量照扣——買的是時間，不是傷害。
    const state = lab('frost', 4);
    state.enemies = [mob({ speed: 100 })];
    damageOver(state, 1000);
    expect(state.enemies[0]?.slowPercent).toBeCloseTo(def('frost').effect.slowPercent, 6);
  });

  it('焚天符灼燒：出手停下來之後傷害還在繼續', () => {
    const state = lab('pyre', 6);
    state.enemies = [mob()];
    const rng = createRng(2);
    tickCombat(state, 100, rng);
    const afterShot = state.enemies[0]?.hp ?? 0;
    expect(state.enemies[0]?.burnRemaining).toBeGreaterThan(0);
    // 把符拿走，剩下的只有灼燒。
    state.field[0] = null;
    for (let t = 0; t < 2500; t += 100) tickCombat(state, 100, rng);
    expect(state.enemies[0]?.hp).toBeLessThan(afterShot);
    expect(state.enemies[0]?.burnRemaining).toBeCloseTo(0, 6);
  });

  it('穿雲符的溢傷會轉給下一隻，同一發打死兩隻', () => {
    const build = (type: string): DefenseState => {
      const state = lab(type, 9);
      state.enemies = [mob({ id: 1, hp: 1, maxHp: 400, y: 20 }), mob({ id: 2, hp: 1, maxHp: 400, y: 10 })];
      return state;
    };
    const pierce = build('pierce');
    const kills = tickCombat(pierce, 100, createRng(4)).kills.length;
    expect(kills).toBe(2);
    // 對照組：同樣單體、同樣一發，只打得死排頭那一隻。
    const bolt = build('bolt');
    expect(tickCombat(bolt, 100, createRng(4)).kills.length).toBe(1);
  });

  it('玄冥符收殘血，而且首領免疫', () => {
    const state = lab('abyss', 1);
    // 一發打不掉的血量，但落在斬殺線以下。
    state.enemies = [mob({ hp: 40, maxHp: 1000, y: 20 }), mob({ id: 2, hp: 40, maxHp: 1000, boss: true, y: 10 })];
    tickCombat(state, 100, createRng(6));
    expect(state.enemies.some((enemy) => enemy.boss)).toBe(true);
    expect(state.enemies.some((enemy) => !enemy.boss)).toBe(false);
  });

  it('誅仙符對首領更痛，對雜兵一般', () => {
    const dealt = (type: string, boss: boolean): number => {
      const state = lab(type, 5);
      state.enemies = [mob({ boss })];
      return damageOver(state, 4000);
    };
    const slayerBoss = dealt('slayer', true) / dealt('slayer', false);
    const swordBoss = dealt('sword', true) / dealt('sword', false);
    expect(slayerBoss / swordBoss).toBeCloseTo(def('slayer').effect.bossMultiplier, 1);
  });

  it('追魂符打殘血、破軍符打滿血，兩者剛好相反', () => {
    const dealt = (type: string, ratio: number): number => {
      const state = lab(type, 4);
      state.enemies = [mob({ hp: 1e9 * ratio, maxHp: 1e9 })];
      return damageOver(state, 2000);
    };
    expect(dealt('soul', 0.3)).toBeGreaterThan(dealt('soul', 1));
    expect(dealt('breaker', 1)).toBeGreaterThan(dealt('breaker', 0.3));
  });

  it('驚雷符會暴擊：同一發的傷害不是每次都一樣', () => {
    const state = lab('tempest', 4);
    state.enemies = [mob()];
    const rng = createRng(1);
    const seen = new Set<number>();
    for (let t = 0; t < 20000; t += 100) {
      for (const shot of tickCombat(state, 100, rng).shots) seen.add(Math.round(shot.damage));
    }
    expect(seen.size).toBeGreaterThan(1);
    const values = [...seen].sort((a, b) => a - b);
    const low = values[0] ?? 0;
    const high = values[values.length - 1] ?? 0;
    expect(high / low).toBeCloseTo(def('tempest').effect.critMultiplier, 1);
  });

  it('太乙符越打越重，場上一空就從頭來', () => {
    const state = lab('taiyi', 4);
    state.enemies = [mob()];
    const rng = createRng(8);
    const damages: number[] = [];
    for (let t = 0; t < 6000; t += 100) {
      for (const shot of tickCombat(state, 100, rng).shots) damages.push(shot.damage);
    }
    const first = damages[0] ?? 0;
    const last = damages[damages.length - 1] ?? 0;
    expect(last / first).toBeCloseTo(def('taiyi').effect.rampMax, 1);
    // 清場之後累積歸零。
    state.enemies = [];
    tickCombat(state, 500, rng);
    expect(state.ramps[0]).toBe(0);
  });

  it('山河符會補回弟子，但補不過起始上限', () => {
    const state = lab('bastion', 12);
    state.disciples = 1;
    state.enemies = Array.from({ length: 60 }, (_, i) => mob({ id: i + 1, hp: 1, maxHp: 1, y: i }));
    const rng = createRng(13);
    for (let t = 0; t < 3000; t += 100) tickCombat(state, 100, rng);
    expect(state.disciples).toBeGreaterThan(1);
    expect(state.disciples).toBeLessThanOrEqual(state.maxDisciples);
  });

  it('招財符加金幣、疾風符加抽符，兩者都只在場上才算', () => {
    const fortune: (Card | null)[] = [{ type: 'fortune', tier: 1 }, null, null];
    const gale: (Card | null)[] = [{ type: 'gale', tier: 1 }, null, null];
    expect(fieldPassives(fortune).goldMultiplier).toBeCloseTo(1 + def('fortune').effect.goldBonus, 6);
    expect(fieldPassives(gale).drawSpeedMultiplier).toBeCloseTo(
      1 + def('gale').effect.drawSpeedBonus,
      6,
    );
    expect(fieldPassives([null, null, null]).goldMultiplier).toBe(1);
    // 兩張疊起來加兩次——「整場鋪招財符」本來就該可行，代價是輸出全交出去。
    const two: (Card | null)[] = [{ type: 'fortune', tier: 1 }, { type: 'fortune', tier: 1 }, null];
    expect(fieldPassives(two).goldMultiplier).toBeCloseTo(1 + def('fortune').effect.goldBonus * 2, 6);
  });

  it('回耐久的機率有上限，鋪滿山河符也不會變成無敵', () => {
    const many: (Card | null)[] = Array.from({ length: 9 }, () => ({ type: 'bastion', tier: 1 }));
    expect(fieldPassives(many).repairChance).toBe(BALANCE.field.maxRepairChance);
  });
});

describe('光環與陣法的疊法', () => {
  it('光環只給上下左右四格，不含斜角', () => {
    // 3×3 的正中央若連斜角都照顧到，「擺中間」會變成唯一解，位置的選擇就消失了。
    expect(neighboursOf(4, 9).sort((a, b) => a - b)).toEqual([1, 3, 5, 7]);
    expect(neighboursOf(0, 9).sort((a, b) => a - b)).toEqual([1, 3]);
    expect(neighboursOf(8, 9).sort((a, b) => a - b)).toEqual([5, 7]);
  });

  it('引靈符撐起相鄰四格，但撐不到自己', () => {
    const field: (Card | null)[] = [
      null, { type: 'sword', tier: 1 }, null,
      { type: 'sword', tier: 1 }, { type: 'spirit', tier: 1 }, { type: 'sword', tier: 1 },
      null, { type: 'sword', tier: 1 }, null,
    ];
    const bonuses = boardBonuses(field);
    const aura = def('spirit').effect.auraDamage;
    expect(bonuses[1]?.damage).toBeCloseTo(1 + aura, 6);
    expect(bonuses[3]?.damage).toBeCloseTo(1 + aura, 6);
    expect(bonuses[4]?.damage).toBeCloseTo(1, 6);
    // 角落不相鄰，拿不到。
    expect(bonuses[0]?.damage).toBeCloseTo(1, 6);
  });

  it('大衍符放大自己吃到的陣法加成，但放大不到光環', () => {
    const line: (Card | null)[] = [
      { type: 'grand', tier: 1 }, { type: 'sword', tier: 1 }, { type: 'fan', tier: 1 },
    ];
    const rowDamage = BALANCE.formation.distinct.rowDamage;
    const bonuses = boardBonuses(line);
    expect(bonuses[0]?.damage).toBeCloseTo(1 + rowDamage * def('grand').effect.formationMultiplier, 6);
    expect(bonuses[1]?.damage).toBeCloseTo(1 + rowDamage, 6);

    // 同一格再吃到光環時，光環那一段不被放大——否則「引靈＋大衍」會變成唯一解。
    const withAura: (Card | null)[] = [
      { type: 'grand', tier: 1 }, { type: 'sword', tier: 1 }, { type: 'fan', tier: 1 },
      { type: 'spirit', tier: 1 }, null, null,
    ];
    const aura = def('spirit').effect.auraDamage;
    expect(boardBonuses(withAura)[0]?.damage).toBeCloseTo(
      1 + rowDamage * def('grand').effect.formationMultiplier + aura,
      6,
    );
  });
});

describe('符籙譜的分類與排序', () => {
  it('分類把二十張分乾淨，而且「全部」真的是全部', () => {
    expect(CARDS.every((def) => matchesCategory(def, 'all'))).toBe(true);
    // 單體與多目標互斥且涵蓋全部：這兩類講的是溢傷的取捨，不能有漏網的。
    for (const def of CARDS) {
      const single = matchesCategory(def, 'single');
      const multi = matchesCategory(def, 'multi');
      expect(single).not.toBe(multi);
    }
    expect(TALISMAN_CATEGORIES.map((item) => item.id)).toContain('all');
  });

  it('控場與增益抓得到該抓的符', () => {
    const control = CARDS.filter((def) => matchesCategory(def, 'control')).map((def) => def.id);
    expect(control).toContain('frost');
    expect(control).toContain('pyre');
    expect(control).toContain('abyss');
    const support = CARDS.filter((def) => matchesCategory(def, 'support')).map((def) => def.id);
    expect(support).toContain('spirit');
    expect(support).toContain('gale');
    expect(support).toContain('grand');
  });

  it('排序不動 cards.json 本身的順序——那份順序同時是解鎖順序', () => {
    const before = CARDS.map((def) => def.id);
    sortTalismans(CARDS, 'dps', (def) => def.damage);
    expect(CARDS.map((def) => def.id)).toEqual(before);
    expect(sortTalismans(CARDS, 'unlock', () => 0).map((def) => def.id)).toEqual(before);
  });

  it('每一種排序都真的照那個鍵排', () => {
    const dpsOf = (def: CardDef): number => (def.damage * def.targets * 1000) / def.intervalMs;
    const byDps = sortTalismans(CARDS, 'dps', dpsOf);
    for (let i = 1; i < byDps.length; i += 1) {
      expect(dpsOf(byDps[i - 1] as CardDef)).toBeGreaterThanOrEqual(dpsOf(byDps[i] as CardDef));
    }
    const byRate = sortTalismans(CARDS, 'rate', dpsOf);
    for (let i = 1; i < byRate.length; i += 1) {
      expect((byRate[i - 1] as CardDef).intervalMs).toBeLessThanOrEqual((byRate[i] as CardDef).intervalMs);
    }
    const byTargets = sortTalismans(CARDS, 'targets', dpsOf);
    for (let i = 1; i < byTargets.length; i += 1) {
      expect((byTargets[i - 1] as CardDef).targets).toBeGreaterThanOrEqual((byTargets[i] as CardDef).targets);
    }
  });
});
