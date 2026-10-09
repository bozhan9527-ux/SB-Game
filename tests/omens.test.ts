import { describe, it, expect } from 'vitest';
import { OMENS } from '../src/data';
import { createDefaultSave, loadSave } from '../src/save';
import { createMemoryStorage } from '../src/save/storage';
import { SAVE_KEY } from '../src/save/types';
import { buildLoadoutFromSpec, loadoutSpecOf, ARENA_RULE } from '../src/systems/loadout';
import {
  OMEN_CHOICES,
  OMEN_MIN_STAGE,
  omenOffer,
  omenRule,
  omenRulesValid,
  omenSummary,
} from '../src/systems/omens';

describe('關間奇遇的出現', () => {
  it('同一關、同一個挑戰次數，給的永遠是同一組——伺服器才算得出當時給了什麼', () => {
    for (let runs = 0; runs < 40; runs += 1) {
      expect(omenOffer(12, runs).map((omen) => omen.id)).toEqual(
        omenOffer(12, runs).map((omen) => omen.id),
      );
    }
  });

  it('要嘛不出現，要嘛三個互不重複的選項', () => {
    for (let runs = 0; runs < 200; runs += 1) {
      const offer = omenOffer(20, runs);
      expect([0, OMEN_CHOICES]).toContain(offer.length);
      expect(new Set(offer.map((omen) => omen.id)).size).toBe(offer.length);
    }
  });

  it('前兩關不出現：新手還在學擺符', () => {
    for (let runs = 0; runs < 100; runs += 1) {
      for (let stage = 1; stage < OMEN_MIN_STAGE; stage += 1) {
        expect(omenOffer(stage, runs)).toEqual([]);
      }
    }
  });

  it('大約三成的通關會遇到——太常就不叫奇遇了', () => {
    let hits = 0;
    let total = 0;
    for (let stage = 3; stage < 80; stage += 1) {
      for (let runs = stage; runs < stage + 20; runs += 1) {
        total += 1;
        if (omenOffer(stage, runs).length > 0) hits += 1;
      }
    }
    expect(hits / total).toBeGreaterThan(0.22);
    expect(hits / total).toBeLessThan(0.38);
  });
});

describe('關間奇遇的驗證', () => {
  // 找一組真的會出奇遇的（上一關、上一場挑戰次數）。
  function offered(): { stage: number; runs: number; id: string } {
    for (let runs = 5; runs < 500; runs += 1) {
      const offer = omenOffer(10, runs);
      const first = offer[0];
      if (first !== undefined) return { stage: 11, runs: runs + 1, id: first.id };
    }
    throw new Error('沒找到');
  }

  it('沒帶奇遇的一場一律合法', () => {
    expect(omenRulesValid([], 11, 7)).toBe(true);
    expect(omenRulesValid(['noMerge'], 11, 7)).toBe(true);
  });

  it('帶的奇遇在上一關給過的三個裡面才合法', () => {
    const { stage, runs, id } = offered();
    expect(omenRulesValid([omenRule(id)], stage, runs)).toBe(true);
    // 挑戰次數差一，就不是同一次給的。
    expect(omenRulesValid([omenRule(id)], stage, runs + 1)).toBe(
      omenOffer(stage - 1, runs).some((omen) => omen.id === id),
    );
  });

  it('沒給過的奇遇、不存在的奇遇、一次帶兩個，全部不合法', () => {
    const { stage, runs } = offered();
    const given = new Set(omenOffer(stage - 1, runs - 1).map((omen) => omen.id));
    const other = OMENS.find((omen) => !given.has(omen.id));
    if (other !== undefined) expect(omenRulesValid([omenRule(other.id)], stage, runs)).toBe(false);
    expect(omenRulesValid([omenRule('nope')], stage, runs)).toBe(false);
    const [a, b] = [...given];
    if (a !== undefined && b !== undefined) {
      expect(omenRulesValid([omenRule(a), omenRule(b)], stage, runs)).toBe(false);
    }
  });
});

describe('關間奇遇的效果', () => {
  function specWith(rules: string[]) {
    const save = createDefaultSave(0);
    save.player.sectId = 'body';
    return { ...loadoutSpecOf(save, 20), rules };
  }

  it('每一個奇遇都真的改到了配置', () => {
    const plain = buildLoadoutFromSpec(specWith([]));
    for (const omen of OMENS) {
      const loadout = buildLoadoutFromSpec(specWith([omenRule(omen.id)]));
      const changed =
        loadout.disciples !== plain.disciples ||
        loadout.damageMultiplier !== plain.damageMultiplier ||
        loadout.drawSpeedMultiplier !== plain.drawSpeedMultiplier ||
        loadout.goldMultiplier !== plain.goldMultiplier ||
        loadout.mobHpMultiplier !== plain.mobHpMultiplier ||
        loadout.rules.bossTimeMultiplier !== plain.rules.bossTimeMultiplier ||
        loadout.tierBonus !== plain.tierBonus;
      expect(changed, omen.id).toBe(true);
    }
  });

  it('競技場不吃奇遇：那一場要所有人起點一樣', () => {
    const swordTemper = OMENS.find((omen) => omen.damage !== 1);
    if (swordTemper === undefined) throw new Error('需要一個加傷害的奇遇');
    const arena = buildLoadoutFromSpec(specWith([ARENA_RULE]));
    const both = buildLoadoutFromSpec(specWith([ARENA_RULE, omenRule(swordTemper.id)]));
    expect(both.damageMultiplier).toBe(arena.damageMultiplier);
  });

  it('效果文字由數字組成，有代價的一定寫出「但」', () => {
    for (const omen of OMENS) {
      const summary = omenSummary(omen);
      expect(summary.length).toBeGreaterThan(0);
      const hasCost = omen.mobHp > 1 || omen.disciples < 1 || omen.damage < 1 || omen.bossTime < 1;
      expect(summary.includes('但'), omen.id).toBe(hasCost);
    }
  });

  it('存檔：待用的奇遇讀得回來，壞掉的當成沒有', () => {
    const storage = createMemoryStorage();
    const save = createDefaultSave(0);
    save.player.omen = { id: 'spring', stage: 9, runs: 30 };
    storage.write(SAVE_KEY, JSON.stringify(save));
    expect(loadSave(storage).player.omen).toEqual({ id: 'spring', stage: 9, runs: 30 });
    storage.write(SAVE_KEY, JSON.stringify({ ...save, player: { ...save.player, omen: { id: 3 } } }));
    expect(loadSave(storage).player.omen).toBeNull();
  });
});
