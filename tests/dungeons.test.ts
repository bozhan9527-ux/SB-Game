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
import { rebirth } from '../src/systems/karma';
import type { SaveData } from '../src/save/types';
import { createDefenseState, mergeInto, tickCombat } from '../src/systems/defense';
import {
  clearedFloors,
  dungeonAvailable,
  dungeonById,
  dungeonSpecOf,
  floorAt,
  floorDepth,
  floorOpen,
  floorStage,
  grantFloor,
  nextFloor,
} from '../src/systems/dungeons';
import type { LoadoutSpec } from '../src/systems/loadout';
import { buildLoadoutFromSpec, loadoutSpecOf } from '../src/systems/loadout';
import { createRng } from '../src/systems/rng';

/**
 * 一份「這一世推到第 N 關」的存檔。
 *
 * stage 與 highestStage 一起設：副本的門檻看的是**這一世**的進度
 * （world.stage），因為 highestStage 不會因為轉世歸零——拿它當門檻的話，
 * 轉世之後所有副本會在第一秒全部開放。
 */
function saveAt(stage = 999): SaveData {
  const save = createDefaultSave(1);
  save.player.sectId = 'body';
  save.world.stage = stage;
  save.world.highestStage = stage;
  save.player.dungeons['library'] = 16;
  return save;
}

function specWith(rules: string[]): LoadoutSpec {
  return { ...loadoutSpecOf(saveAt(30), 30), rules };
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
    expect(dungeonAvailable(rookie, dungeon('pagoda'))).toBe(false);
    expect(dungeonAvailable(veteran, dungeon('pagoda'))).toBe(true);
  });

  it('轉世之後副本整條重來：進度清空、門檻回到這一世的進度', () => {
    // highestStage 不會因為轉世歸零，所以門檻若看它，轉世之後所有副本會在
    // 第一秒全部開放——進度被清光、關卡卻一層都不用再爬。
    const save = saveAt(200);
    save.player.dungeons = { library: 16, pagoda: 5 };
    save.player.karma.claimedStage = 0;
    expect(rebirth(save)).toBe(true);

    expect(clearedFloors(save, 'library')).toBe(0);
    expect(save.world.highestStage).toBeGreaterThan(100);
    expect(save.world.stage).toBe(1);
    // 深的副本關起來了，藏經閣第一層照樣開著——新的一世從第一張符重新爬。
    expect(dungeonAvailable(save, dungeon('pagoda'))).toBe(false);
    expect(dungeonAvailable(save, dungeon('trove'))).toBe(false);
    expect(floorOpen(save, dungeon('library'), 1)).toBe(true);
    expect(floorOpen(save, dungeon('library'), 10)).toBe(false);
  });

  it('轉世之後同一層會變深，但永遠不會深過它自己的門檻', () => {
    const before = saveAt(60);
    const library = dungeon('library');
    const base = floorDepth(before, library, 12);

    const after = saveAt(60);
    // 上一世推到第 200 關的人，重走的這一趟每一層都更深。
    after.player.karma.claimedStage = 200;
    const scaled = floorDepth(after, library, 12);
    expect(scaled).toBeGreaterThan(base);

    // 但深度永遠不過門檻——副本難的是規則不是深度，這是整套平衡的地基。
    const extreme = saveAt(60);
    extreme.player.karma.claimedStage = 99_999;
    for (const item of DUNGEONS) {
      item.floors.forEach((floor, index) => {
        if (floor.stage === undefined) return;
        const gate = floor.minStage ?? item.minStage;
        expect(floorDepth(extreme, item, index + 1), `${item.name} 第 ${index + 1} 層`)
          .toBeLessThanOrEqual(gate);
      });
    }
  });

  it('聚寶洞的深度看這一世，不看歷史最高——剛轉世的人不會一進去就必死', () => {
    const save = saveAt(200);
    save.player.karma.claimedStage = 0;
    rebirth(save);
    save.world.stage = 40;
    // 歷史最高還是 200，但這一趟只會開在第 40 關附近。
    expect(save.world.highestStage).toBeGreaterThan(100);
    expect(floorDepth(save, dungeon('trove'), 1)).toBeLessThan(50);
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

  });

  it('已經通過的層不再發獎勵——重打同一層不是無限產出', () => {
    // 真實故障：副本打完之後，每通一關就再發一次獎勵。
    // 原因是這裡不管那一層是不是已經過了，一律照發。
    const save = saveAt();
    save.player.dungeons = {};
    save.player.karma.points = 0;
    const pagoda = dungeon('pagoda');
    expect(grantFloor(save, pagoda, 1).lines.length).toBeGreaterThan(0);
    const after = save.player.karma.points;
    expect(after).toBeGreaterThan(0);
    // 再打一次同一層：沒有回報，點數也不會再加。
    expect(grantFloor(save, pagoda, 1).lines).toEqual([]);
    expect(save.player.karma.points).toBe(after);
  });

  it('可重複的副本不留進度，一次性的會留', () => {
    const save = saveAt();
    save.player.dungeons = {};
    grantFloor(save, dungeon('trove'), 1);
    expect(clearedFloors(save, 'trove')).toBe(0);
    grantFloor(save, dungeon('pagoda'), 1);
    expect(clearedFloors(save, 'pagoda')).toBe(1);
  });

  it('聚寶洞是無限的：打完一波直接接下一波，深度往上跳', () => {
    const save = saveAt();
    const spec = dungeonSpecOf(save, dungeon('trove'), 1);
    expect(spec.endless).toBe(true);
    const state = createDefenseState(buildLoadoutFromSpec(spec), createRng(5));
    const startStage = state.stage;
    const startGold = state.gold;
    // 直接把這一波打完：清空排程與場上，再讓 tickCombat 判定一次。
    state.queue = [];
    state.enemies = [];
    state.bossKilled = true;
    tickCombat(state, 16, createRng(5));
    // 沒有結束，而是接上了下一波。
    expect(state.outcome).toBe('running');
    expect(state.clearedStages).toBe(1);
    expect(state.stage).toBeGreaterThan(startStage);
    expect(state.threat).toBeGreaterThan(startStage);
    // 通關獎勵照發，而且新的一波真的排了怪。
    expect(state.gold).toBeGreaterThan(startGold);
    expect(state.queue.length).toBeGreaterThan(0);
    expect(state.bossKilled).toBe(false);
    // 新的一波從現在起算，HUD 的波次進度才不會一開始就滿格。
    expect(state.stageStartMs).toBeGreaterThanOrEqual(state.elapsedMs);
    expect(Math.min(...state.queue.map((entry) => entry.atMs))).toBeGreaterThanOrEqual(
      state.stageStartMs,
    );
  });

  it('有終點的副本打完就是打完，不會自己接下一關', () => {
    const save = saveAt();
    const spec = dungeonSpecOf(save, dungeon('pagoda'), 1);
    expect(spec.endless).toBeFalsy();
    const state = createDefenseState(buildLoadoutFromSpec(spec), createRng(5));
    state.queue = [];
    state.enemies = [];
    state.bossKilled = true;
    tickCombat(state, 16, createRng(5));
    expect(state.outcome).toBe('cleared');
    expect(state.clearedStages).toBe(0);
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
