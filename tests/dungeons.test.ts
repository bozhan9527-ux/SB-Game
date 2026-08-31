/**
 * 副本。
 *
 * 這一套取代了原本的「試煉」。舊做法的漏洞不是數值沒調好，是**結構性的**：
 * 限制疊在玩家自己挑的關卡上，而難度是相對於現在的實力的，所以玩家會把限制
 * 疊在一個早就打爛的關卡上，領走倍率卻沒有付出任何難度。實測第 26 關開
 * 「獨門一符」是勝率 100%、山門一滴血沒掉、金幣正好 ×1.5。
 *
 * 這裡守的就是那個漏洞不會回來：深度由副本決定、可重複的那一個深度跟著進度走、
 * 而且可重複的不得發放任何一次性的回報。
 */
import { describe, expect, it } from 'vitest';
import { CARDS, DUNGEONS } from '../src/data';
import { createDefaultSave } from '../src/save';
import type { SaveData } from '../src/save/types';
import { createDefenseState, mergeInto, tickCombat } from '../src/systems/defense';
import {
  clearedFloors,
  dungeonAvailable,
  dungeonById,
  dungeonSpecOf,
  floorAt,
  floorStage,
  grantFloor,
  nextFloor,
} from '../src/systems/dungeons';
import type { LoadoutSpec } from '../src/systems/loadout';
import { buildLoadoutFromSpec, loadoutSpecOf } from '../src/systems/loadout';
import { createRng } from '../src/systems/rng';

function saveAt(highestStage = 999): SaveData {
  const save = createDefaultSave(1);
  save.player.sectId = 'body';
  save.world.highestStage = highestStage;
  save.world.stage = 30;
  save.player.dungeons['library'] = 16;
  return save;
}

function specWith(rules: string[]): LoadoutSpec {
  return { ...loadoutSpecOf(saveAt(), 30), rules };
}

function dungeon(id: string) {
  const found = dungeonById(id);
  if (found === null) throw new Error(id);
  return found;
}

describe('副本的規則真的在模擬裡成立', () => {
  it('不合之道：模擬層直接擋掉合成，不是只把手勢關掉', () => {
    // 規則要在模擬裡成立，否則平衡模擬跑出來的數字和玩家看到的不是同一件事。
    const state = createDefenseState(buildLoadoutFromSpec(specWith(['noMerge'])), createRng(5));
    state.hand[0] = { type: 'sword', tier: 3 };
    state.hand[1] = { type: 'sword', tier: 3 };
    expect(
      mergeInto(state, { where: 'hand', index: 0 }, { where: 'hand', index: 1 }, createRng(1)),
    ).toBe(false);
  });

  it('獨門一符：抽符池縮成一種', () => {
    expect(buildLoadoutFromSpec(specWith(['soloTalisman'])).talismans).toHaveLength(1);
    expect(buildLoadoutFromSpec(specWith([])).talismans.length).toBeGreaterThan(1);
  });

  it('孤身守門：山門耐久砍到三成', () => {
    const thin = buildLoadoutFromSpec(specWith(['thinGate'])).disciples;
    const full = buildLoadoutFromSpec(specWith([])).disciples;
    expect(thin).toBeLessThan(full);
    expect(thin).toBeGreaterThan(0);
  });

  it('一夫當關：漏一隻直接失守，門派免傷擋不住', () => {
    // 體修的被動是「前兩次漏怪免傷」。若它能擋掉這一條，對體修來說這一層等於白打。
    const spec = specWith(['noLeak']);
    const state = createDefenseState(buildLoadoutFromSpec(spec), createRng(5));
    expect(state.loadout.sect.leakImmunityCount).toBeGreaterThan(0);

    state.queue = [];
    state.enemies = [
      {
        id: 99,
        name: 'x',
        art: 'bandit',
        bossArt: null,
        boss: false,
        hp: 1e12,
        maxHp: 1e12,
        y: 10_000,
        lane: 2,
        speed: 0,
        slowUntilMs: 0,
        slowPercent: 0,
        burnRemaining: 0,
        burnPerMs: 0,
        burnSource: null,
        trait: 'none',
        spawnedBySplit: false,
      },
    ];
    tickCombat(state, 16, createRng(2));
    expect(state.disciples).toBe(0);
  });

  it('速斬：首領時限砍半', () => {
    expect(buildLoadoutFromSpec(specWith(['hasteBoss'])).rules.bossTimeMultiplier).toBe(0.5);
    expect(buildLoadoutFromSpec(specWith([])).rules.bossTimeMultiplier).toBe(1);
  });
});

describe('副本的結構', () => {
  it('十六張非基礎符每一張都有且只有一層產出', () => {
    const granted = DUNGEONS.flatMap((item) => item.floors)
      .map((floor) => floor.talisman)
      .filter((id): id is string => id !== undefined);
    const nonStarters = CARDS.filter((card) => card.unlockStage > 1).map((card) => card.id);
    expect([...granted].sort()).toEqual([...nonStarters].sort());
  });

  it('可重複的副本不得發放一次性回報，否則就是無限產出', () => {
    for (const item of DUNGEONS.filter((d) => d.repeatable)) {
      for (const floor of item.floors) {
        expect(floor.talisman).toBeUndefined();
        expect(floor.mastery).toBeUndefined();
        expect(floor.karma).toBeUndefined();
        expect(floor.fieldSlot).toBeUndefined();
      }
    }
  });

  it('刷金幣的那一個，深度跟著進度走——這是它不會退化成提款機的唯一原因', () => {
    const trove = dungeon('trove');
    expect(trove.repeatable).toBe(true);
    const floor = floorAt(trove, 1);
    expect(floor).not.toBeNull();
    if (floor === null) return;
    // 舊制的漏洞就是「回頭打第 26 關領 1.5 倍」。深度綁在最高關卡上，那條路不存在。
    expect(floorStage(floor, 40)).toBeLessThan(floorStage(floor, 140));
    expect(floorStage(floor, 140)).toBeGreaterThan(100);
  });

  it('一層一層開，沒過前一層就不會有下一層', () => {
    const library = dungeon('library');
    const save = saveAt();
    save.player.dungeons = {};
    expect(nextFloor(save, library)).toBe(1);
    grantFloor(save, library, 1);
    expect(clearedFloors(save, 'library')).toBe(1);
    expect(nextFloor(save, library)).toBe(2);
  });

  it('整個副本要到打得動第一層才出現，新玩家不會看到五個打不動的入口', () => {
    const rookie = saveAt(2);
    const veteran = saveAt(999);
    expect(dungeonAvailable(rookie, dungeon('arena'))).toBe(false);
    expect(dungeonAvailable(veteran, dungeon('arena'))).toBe(true);
  });

  it('每個副本的回報都真的寫進存檔', () => {
    const save = saveAt();
    save.player.dungeons = {};
    save.player.karma.points = 0;
    save.player.sectClears = {};

    grantFloor(save, dungeon('cliff'), 1);
    expect(save.player.sectClears['body']).toBeGreaterThan(0);

    grantFloor(save, dungeon('pagoda'), 1);
    expect(save.player.karma.points).toBeGreaterThan(0);

    grantFloor(save, dungeon('arena'), 1);
    expect(save.player.dungeonFieldSlots).toBe(1);
    expect(buildLoadoutFromSpec(loadoutSpecOf(save, 30)).fieldSlots).toBeGreaterThan(
      buildLoadoutFromSpec(loadoutSpecOf(saveAt(), 30)).fieldSlots,
    );
  });

  it('可重複的副本不留進度，一次性的會留', () => {
    const save = saveAt();
    save.player.dungeons = {};
    grantFloor(save, dungeon('trove'), 1);
    expect(clearedFloors(save, 'trove')).toBe(0);
    grantFloor(save, dungeon('pagoda'), 1);
    expect(clearedFloors(save, 'pagoda')).toBe(1);
  });

  it('副本走的是同一個組裝函式，規則與倍率都在裡面', () => {
    const save = saveAt();
    const spec = dungeonSpecOf(save, dungeon('trove'), 1);
    expect(spec.rules).toEqual(['hasteBoss']);
    expect(spec.goldMultiplier).toBeGreaterThan(1);
    const loadout = buildLoadoutFromSpec(spec);
    expect(loadout.rules.bossTimeMultiplier).toBe(0.5);
    expect(loadout.goldMultiplier).toBeGreaterThan(
      buildLoadoutFromSpec(loadoutSpecOf(save, spec.stage)).goldMultiplier,
    );
  });
});
