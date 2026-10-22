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
