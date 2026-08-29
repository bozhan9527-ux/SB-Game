/**
 * 輪迴轉世與仙緣。
 *
 * 三條規矩守在這裡，缺一條這個系統就會壞掉：
 * 只有更深才給點、解鎖不跟著歸零、仙緣只給乘區。
 */
import { describe, expect, it } from 'vitest';
import { BALANCE, KARMA, UPGRADES } from '../src/data';
import { createDefaultSave } from '../src/save';
import type { SaveData } from '../src/save/types';
import { buildLoadout } from '../src/systems/loadout';
import {
  buyKarma,
  canRebirth,
  karmaCost,
  karmaPointsFor,
  karmaTrackById,
  pendingKarma,
  rebirth,
} from '../src/systems/karma';
import { unlockedTalismans } from '../src/systems/talismans';

function deep(stage = 100): SaveData {
  const save = createDefaultSave(1);
  save.player.sectId = 'body';
  save.world.stage = stage;
  save.world.highestStage = stage;
  save.player.wallet.gold = 50_000;
  for (const track of UPGRADES) save.player.upgrades[track.id] = 5;
  return save;
}

describe('仙緣點', () => {
  it('沒到門檻一點都沒有', () => {
    const { minStage } = BALANCE.rebirth;
    expect(karmaPointsFor(minStage - 1)).toBe(0);
    expect(karmaPointsFor(minStage)).toBe(1);
    expect(canRebirth(deep(minStage - 1))).toBe(false);
  });

  it('越深越多點', () => {
    const { minStage, stagesPerPoint } = BALANCE.rebirth;
    expect(karmaPointsFor(minStage + stagesPerPoint)).toBe(2);
    expect(karmaPointsFor(minStage + stagesPerPoint * 5)).toBe(6);
  });

  it('同一段進度不會重複換點', () => {
    // 沒有這條，轉世就從一個決定退化成一個必須重複執行的動作。
    const save = deep(120);
    const first = pendingKarma(save);
    expect(rebirth(save)).toBe(true);
    expect(save.player.karma.points).toBe(first);
    // 沒有推得更深就再轉一次：一點都拿不到，而且轉不成。
    expect(pendingKarma(save)).toBe(0);
    expect(rebirth(save)).toBe(false);
    expect(save.player.karma.points).toBe(first);

    // 推得更深之後只補「新增的那一段」。
    save.world.highestStage = 150;
    expect(pendingKarma(save)).toBe(karmaPointsFor(150) - karmaPointsFor(120));
  });
});

describe('轉世', () => {
  it('歸零這一世的資源，留下跨世的東西', () => {
    const save = deep(120);
    save.player.sectClears = { body: 30 };
    save.player.achievements = ['first_clear'];
    save.player.challengesDone = ['noMerge'];
    save.player.records.bestDps = 5000;
    rebirth(save);

    expect(save.world.stage).toBe(1);
    expect(save.player.wallet.gold).toBe(0);
    expect(Object.values(save.player.upgrades).every((level) => level === 0)).toBe(true);

    expect(save.player.sectId).toBe('body');
    expect(save.player.sectClears['body']).toBe(30);
    expect(save.player.achievements).toContain('first_clear');
    expect(save.player.challengesDone).toContain('noMerge');
    expect(save.player.records.bestDps).toBe(5000);
    expect(save.player.karma.rebirths).toBe(1);
  });

  it('符籙解鎖不跟著歸零', () => {
    // 收回玩家已經打出來的選擇，只會讓人不敢轉世。
    const save = deep(120);
    const before = unlockedTalismans(save.world.highestStage).length;
    rebirth(save);
    expect(unlockedTalismans(save.world.highestStage)).toHaveLength(before);
    expect(save.world.highestStage).toBe(120);
  });
});

describe('仙緣線', () => {
  it('買到滿級就買不動了，點數不夠也買不動', () => {
    const save = deep(120);
    rebirth(save);
    save.player.karma.points = 0;
    expect(buyKarma(save, 'karmaPower')).toBe('poor');

    save.player.karma.points = 999;
    const track = karmaTrackById('karmaPower');
    for (let i = 0; i < track.maxLevel; i += 1) expect(buyKarma(save, 'karmaPower')).toBe('ok');
    expect(buyKarma(save, 'karmaPower')).toBe('maxed');
    expect(karmaCost(track, track.maxLevel)).toBeNull();
  });

  it('買了之後真的進到 loadout：傷害、金幣、山門、階數上限', () => {
    const before = buildLoadout(deep(120), 30);
    const save = deep(120);
    save.player.karma.points = 999;
    for (const track of KARMA) buyKarma(save, track.id);
    const after = buildLoadout(save, 30);

    expect(after.damageMultiplier).toBeGreaterThan(before.damageMultiplier);
    expect(after.goldMultiplier).toBeGreaterThan(before.goldMultiplier);
    expect(after.disciples).toBeGreaterThan(before.disciples);
    expect(after.tierBonus).toBe(karmaTrackById('karmaTier').perLevel);
  });

  it('仙緣只給乘區，不解鎖任何內容', () => {
    // 一旦仙緣能換到別處拿不到的東西，不轉世的人會落後在「內容」而不只是「速度」上。
    for (const track of KARMA) {
      expect(Object.keys(track).sort()).toEqual(
        ['cost', 'costGrowth', 'desc', 'id', 'maxLevel', 'name', 'perLevel', 'unit'],
      );
      expect(track.perLevel).toBeGreaterThan(0);
    }
  });
});
