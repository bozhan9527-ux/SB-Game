import { describe, it, expect } from 'vitest';
import { UPGRADES } from '../src/data';
import {
  addGold,
  buyUpgrade,
  createDefaultSave,
  loadSave,
  recordClear,
  recordDefeat,
  saveGame,
} from '../src/save';
import { migrate } from '../src/save/migrations';
import { createMemoryStorage } from '../src/save/storage';
import { SAVE_KEY, SAVE_VERSION } from '../src/save/types';
import { upgradeCost } from '../src/systems/upgrades';
import { trackById } from '../src/systems/upgrades';

describe('存檔（TECH_SPEC 第 4 節）', () => {
  it('新存檔帶版本號與時間戳', () => {
    const save = createDefaultSave(1000);
    expect(save.version).toBe(SAVE_VERSION);
    expect(save.savedAt).toBe(1000);
    expect(save.world.stage).toBe(1);
    expect(save.player.sectId).toBeNull();
  });

  it('五條升級線都在存檔中初始化為 0 級', () => {
    const save = createDefaultSave();
    for (const track of UPGRADES) expect(save.player.upgrades[track.id]).toBe(0);
  });

  it('存檔是單一可序列化物件，寫入後可原樣讀回（第 9.1 節）', () => {
    const storage = createMemoryStorage();
    const save = createDefaultSave(1);
    save.player.sectId = 'sword';
    addGold(save, 500);
    save.world.stage = 7;
    saveGame(save, storage, 2000);

    const loaded = loadSave(storage);
    expect(loaded.player.sectId).toBe('sword');
    expect(loaded.player.wallet.gold).toBe(500);
    expect(loaded.world.stage).toBe(7);
    expect(loaded.savedAt).toBe(2000);
  });

  it('壞掉的存檔不會讓遊戲啟動失敗', () => {
    const storage = createMemoryStorage();
    storage.write(SAVE_KEY, '{ 這不是 JSON');
    expect(loadSave(storage).world.stage).toBe(1);

    storage.write(SAVE_KEY, JSON.stringify({ version: 1, world: { stage: 'x' } }));
    expect(loadSave(storage).world.stage).toBe(1);
  });

  it('等級超過上限的存檔會被夾回上限', () => {
    const storage = createMemoryStorage();
    const track = UPGRADES[0]!;
    storage.write(
      SAVE_KEY,
      JSON.stringify({ version: 1, player: { upgrades: { [track.id]: 9999 } } }),
    );
    expect(loadSave(storage).player.upgrades[track.id]).toBe(track.maxLevel);
  });

  it('遷移框架就位：未知版本不會無窮迴圈', () => {
    const migrated = migrate({ version: 1 }, SAVE_VERSION);
    expect(migrated['version']).toBe(SAVE_VERSION);
    expect(migrate({ version: 99 }, SAVE_VERSION)['version']).toBe(99);
  });

  it('v1 舊存檔會被遷移出音效設定，且進度不流失', () => {
    const storage = createMemoryStorage();
    storage.write(
      SAVE_KEY,
      JSON.stringify({
        version: 1,
        savedAt: 1,
        player: { sectId: 'body', wallet: { gold: 320 }, upgrades: { startAttack: 3 } },
        world: { stage: 9, highestStage: 9, runs: 12, clears: 8 },
      }),
    );
    const loaded = loadSave(storage);
    expect(loaded.version).toBe(SAVE_VERSION);
    expect(loaded.settings.sound).toBe(true);
    expect(loaded.world.stage).toBe(9);
    expect(loaded.player.wallet.gold).toBe(320);
    expect(loaded.player.upgrades['startAttack']).toBe(3);
  });

  it('音效關閉的設定會被存下來', () => {
    const storage = createMemoryStorage();
    const save = createDefaultSave(1);
    save.settings.sound = false;
    saveGame(save, storage, 2);
    expect(loadSave(storage).settings.sound).toBe(false);
  });
});

describe('金幣升級', () => {
  it('金幣足夠時扣款並升級', () => {
    const save = createDefaultSave();
    const track = trackById('startDisciples');
    const cost = upgradeCost(track, 0)!;
    addGold(save, cost);

    const result = buyUpgrade(save, 'startDisciples');
    expect(result.ok).toBe(true);
    expect(result.cost).toBe(cost);
    expect(save.player.wallet.gold).toBe(0);
    expect(save.player.upgrades['startDisciples']).toBe(1);
  });

  it('金幣不足時不改動存檔', () => {
    const save = createDefaultSave();
    const result = buyUpgrade(save, 'startAttack');
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('insufficient');
    expect(save.player.upgrades['startAttack']).toBe(0);
  });

  it('滿級後無法再買', () => {
    const save = createDefaultSave();
    const track = trackById('bossDamage');
    save.player.upgrades[track.id] = track.maxLevel;
    addGold(save, 10_000_000);
    const result = buyUpgrade(save, track.id);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('maxed');
  });

  it('花費逐級遞增', () => {
    const track = trackById('goldGain');
    expect(upgradeCost(track, 1)!).toBeGreaterThan(upgradeCost(track, 0)!);
    expect(upgradeCost(track, track.maxLevel)).toBeNull();
  });
});

describe('關卡進度', () => {
  it('通關推進一關並更新最高境界', () => {
    const save = createDefaultSave();
    recordClear(save, 100);
    expect(save.world.stage).toBe(2);
    expect(save.world.highestStage).toBe(2);
    expect(save.world.clears).toBe(1);
    expect(save.player.wallet.gold).toBe(100);
  });

  it('失敗停在原關卡，只拿到金幣', () => {
    const save = createDefaultSave();
    save.world.stage = 5;
    recordDefeat(save, 30);
    expect(save.world.stage).toBe(5);
    expect(save.world.clears).toBe(0);
    expect(save.world.runs).toBe(1);
    expect(save.player.wallet.gold).toBe(30);
  });
});
