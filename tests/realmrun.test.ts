import { describe, expect, it } from 'vitest';
import { createDefaultSave, recordClear } from '../src/save';
import type { SaveData } from '../src/save/types';
import {
  endsRun,
  layerInRun,
  newbieShield,
  onStageCleared,
  onStageFailed,
  pickBlessing,
  rerollOffer,
  rerollsLeft,
  runStartFor,
} from '../src/systems/realmrun';

function at(stage: number, rebirths = 1): SaveData {
  const save = createDefaultSave(1);
  save.player.sectId = 'sword';
  save.world.stage = stage;
  save.world.highestStage = stage;
  save.world.realmRun.startStage = runStartFor(stage);
  save.player.karma.rebirths = rebirths;
  return save;
}

/** 打過目前這一關（和結算頁同一個順序：先 recordClear 再 onStageCleared）。 */
function clear(save: SaveData, survivors: number, max = 40) {
  const stage = save.world.stage;
  recordClear(save, 0);
  return onStageCleared(save, stage, survivors, max);
}

describe('一境一局', () => {
  it('九關一局：第 9、18 關破境；飛升境照九關切段', () => {
    expect(endsRun(9)).toBe(true);
    expect(endsRun(8)).toBe(false);
    expect(endsRun(18)).toBe(true);
    expect(layerInRun(10)).toBe(1);
    expect(layerInRun(14)).toBe(5);
    expect(endsRun(90)).toBe(true);
    expect(runStartFor(95)).toBe(91);
  });

  it('過關：耐久回三成帶進下一關，抽好下一次三選一', () => {
    const save = at(10);
    const outcome = clear(save, 10, 40);
    expect(outcome.brokeThrough).toBe(false);
    expect(save.world.realmRun.gate).toBe(22);
    expect(save.world.realmRun.offer?.ids.length).toBe(3);
    expect(save.world.realmRun.offer?.rare).toBe(false);
  });

  it('第五關給稀有三選一', () => {
    const save = at(14);
    clear(save, 40);
    expect(save.world.realmRun.offer?.rare).toBe(true);
  });

  it('回到滿血就記成 null（滿血開打）', () => {
    const save = at(10);
    clear(save, 39, 40);
    expect(save.world.realmRun.gate).toBeNull();
  });

  it('破境：本局清空，下一境重新開局', () => {
    const save = at(18);
    save.world.realmRun.blessings = { guardian: 2 };
    save.world.realmRun.gate = 5;
    const outcome = clear(save, 3);
    expect(outcome.brokeThrough).toBe(true);
    expect(save.world.stage).toBe(19);
    expect(save.world.realmRun).toEqual({ startStage: 19, gate: null, blessings: {}, offer: null, rerolls: 0 });
  });

  it('失守：退回本局第一關、機緣散去', () => {
    const save = at(13);
    save.world.realmRun.blessings = { guardian: 1 };
    expect(onStageFailed(save)).toBe(10);
    expect(save.world.stage).toBe(10);
    expect(save.world.realmRun.blessings).toEqual({});
  });

  it('新手護體：第一世的煉氣期失守只重打那一關，機緣留著', () => {
    const save = at(4, 0);
    save.world.realmRun.blessings = { guardian: 1 };
    save.world.realmRun.gate = 3;
    expect(newbieShield(save)).toBe(true);
    expect(onStageFailed(save)).toBe(4);
    expect(save.world.realmRun.blessings).toEqual({ guardian: 1 });
    expect(save.world.realmRun.gate).toBeNull();
    // 第二世起、或過了煉氣期就沒有護體
    expect(newbieShield(at(4, 1))).toBe(false);
    expect(newbieShield(at(12, 0))).toBe(false);
  });

  it('選機緣只收候選裡的；重抽有次數', () => {
    const save = at(10);
    clear(save, 40);
    const offer = save.world.realmRun.offer;
    expect(offer).not.toBeNull();
    expect(pickBlessing(save, 'nope')).toBe(false);
    expect(rerollsLeft(save)).toBe(1);
    expect(rerollOffer(save)).toBe(true);
    expect(rerollsLeft(save)).toBe(0);
    expect(rerollOffer(save)).toBe(false);
    const id = save.world.realmRun.offer!.ids[0]!;
    expect(pickBlessing(save, id)).toBe(true);
    expect(save.world.realmRun.blessings[id]).toBe(1);
    expect(save.world.realmRun.offer).toBeNull();
  });
});

import { featureOpen } from '../src/systems/unlocks';

describe('功能開放節奏', () => {
  it('新手跟著進度一顆一顆開；飛升過的人全開', () => {
    const fresh = at(1, 0);
    expect(featureOpen(fresh, 'upgrade')).toBe(false);
    expect(featureOpen(fresh, 'dungeon')).toBe(false);
    fresh.world.highestStage = 4;
    expect(featureOpen(fresh, 'upgrade')).toBe(true);
    expect(featureOpen(fresh, 'talisman')).toBe(true);
    expect(featureOpen(fresh, 'dungeon')).toBe(false);
    expect(featureOpen(at(1, 1), 'dungeon')).toBe(true);
  });
});

import { migrate } from '../src/save/migrations';
import { SECT_UPGRADES } from '../src/data';
import { startRealmRun } from '../src/systems/realmrun';
import { offerContextOf } from '../src/systems/realmrun';

describe('門派傳承與 v24 轉換', () => {
  it('修為滿階：每一局開局自帶本門專屬機緣；未滿階只提高出現權重', () => {
    const save = at(10);
    save.player.sectClears['sword'] = 20;
    expect(startRealmRun(save, 10).blessings).toEqual({ swordIntent: 1 });
    save.player.sectClears['sword'] = 10;
    expect(startRealmRun(save, 10).blessings).toEqual({});
    expect(offerContextOf(save, false).sectWeight).toBe(2);
  });

  it('門派秘傳照原價退回金幣；奇遇與鎮妖塔舊層數清掉', () => {
    const track = SECT_UPGRADES.find((t) => t.sectId === 'body')!;
    const old = {
      version: 23,
      player: { wallet: { gold: 100 }, sectDepth: { body: 2 }, omen: { id: 'spring', stage: 3, runs: 1 }, dungeons: { library: 4, pagoda: 3 } },
      world: { stage: 3 },
    };
    const next = migrate(old as unknown as Record<string, unknown>, 24) as Record<string, any>;
    const refund = Math.round(track.baseCost) + Math.round(track.baseCost * track.costGrowth);
    expect(next['player']['wallet']['gold']).toBe(100 + refund);
    expect(next['player']['sectDepth']).toEqual({});
    expect(next['player']['omen']).toBeNull();
    expect(next['player']['dungeons']).toEqual({ library: 4 });
  });
});

import { claimDaily, dailyConfig, dailyRule, dayOf } from '../src/systems/daily';
import { buildLoadoutFromSpec as buildSpec } from '../src/systems/loadout';
import { boardsFor } from '../src/systems/leaderboard';
import { dungeonById as findDungeon, dungeonSpecOf as specOfDungeon } from '../src/systems/dungeons';

describe('每日挑戰', () => {
  it('同一天全服同一組；換一天換一組；四張符含一張起手符', () => {
    const a = dailyConfig(1000);
    expect(dailyConfig(1000)).toEqual(a);
    expect(a.talismans).toHaveLength(4);
    expect(new Set(a.talismans).size).toBe(4);
    expect(a.talismans.some((id) => ['sword', 'bolt', 'fan', 'flame'].includes(id))).toBe(true);
    expect(Object.values(a.blessings).every((v) => v === 2)).toBe(true);
    const days = new Set([1000, 1001, 1002, 1003, 1004].map((d) => JSON.stringify(dailyConfig(d))));
    expect(days.size).toBeGreaterThan(1);
  });

  it('配置不管客戶端報什麼門派與符，一律照當天那一組', () => {
    const save = at(30);
    save.player.sectId = 'body';
    const now = Date.UTC(2026, 9, 22, 4);
    const spec = specOfDungeon(save, findDungeon('daily')!, 1, now);
    const day = dayOf(now);
    expect(dailyRule(spec.rules)).toBe(day);
    const cfg = dailyConfig(day);
    const loadout = buildSpec(spec);
    expect(loadout.arena).toBe(true);
    expect(loadout.sect.id).toBe(cfg.sectId);
    expect(loadout.talismans.map((t) => t.id).sort()).toEqual([...cfg.talismans].sort());
    expect(Object.keys(loadout.blessings).sort()).toEqual(Object.keys(cfg.blessings).sort());
    expect(boardsFor(1, true, false, day)).toEqual([`daily${day}`]);
  });

  it('每天第一次撐過 3 波、10 波各給 1 點仙緣；換日重來', () => {
    const save = at(5);
    expect(claimDaily(save, 50, 2)).toBe(0);
    expect(claimDaily(save, 50, 4)).toBe(1);
    expect(claimDaily(save, 50, 12)).toBe(1);
    expect(claimDaily(save, 50, 20)).toBe(0);
    expect(claimDaily(save, 51, 12)).toBe(2);
  });
});
