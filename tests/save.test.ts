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
    // 舊存檔沒有速度設定，補成 1×——不能是 undefined，RunScene 會直接拿它去乘 delta。
    expect(loaded.settings.speed).toBe(1);
    expect(loaded.world.stage).toBe(9);
    expect(loaded.player.wallet.gold).toBe(320);
    expect(loaded.player.upgrades['startAttack']).toBe(3);
  });

  it('v3 舊存檔（閘門跑酷時代）遷到防守玩法：金幣與進度保留，統計重新累計', () => {
    const storage = createMemoryStorage();
    storage.write(
      SAVE_KEY,
      JSON.stringify({
        version: 3,
        savedAt: 1,
        player: {
          sectId: 'sword',
          wallet: { gold: 5000 },
          upgrades: { startAttack: 7 },
          achievements: ['first_clear'],
          stats: { maxCrowd: 900, maxArms: 400, fastestBossMs: 2100, totalGoldEarned: 88000, clearedSects: ['sword'] },
        },
        world: { stage: 22, highestStage: 22, runs: 40, clears: 30 },
        settings: { sound: false },
      }),
    );
    const loaded = loadSave(storage);
    expect(loaded.version).toBe(SAVE_VERSION);
    expect(loaded.world.stage).toBe(22);
    expect(loaded.player.wallet.gold).toBe(5000);
    expect(loaded.player.upgrades['startAttack']).toBe(7);
    expect(loaded.player.achievements).toContain('first_clear');
    // 跨玩法仍然成立的長期事實留著，只跟舊玩法有關的量歸零。
    expect(loaded.player.stats.totalGoldEarned).toBe(88000);
    expect(loaded.player.stats.clearedSects).toEqual(['sword']);
    expect(loaded.player.stats.maxTier).toBe(0);
    expect(loaded.player.stats.totalKills).toBe(0);
  });

  it('v4 舊存檔：已經玩過的人不會被新手教學打斷，全新存檔才會走教學', () => {
    const storage = createMemoryStorage();
    storage.write(
      SAVE_KEY,
      JSON.stringify({
        version: 4,
        savedAt: 1,
        player: { sectId: 'body', wallet: { gold: 10 }, upgrades: {}, achievements: [],
          stats: { maxTier: 3, totalKills: 20, perfectClears: 0, totalGoldEarned: 500, clearedSects: [] } },
        world: { stage: 6, highestStage: 6, runs: 9, clears: 5 },
        settings: { sound: true },
      }),
    );
    const veteran = loadSave(storage);
    expect(veteran.player.hints).toContain('tutorial');

    const empty = createMemoryStorage();
    empty.write(
      SAVE_KEY,
      JSON.stringify({
        version: 4, savedAt: 1,
        player: { sectId: null, wallet: { gold: 0 }, upgrades: {}, achievements: [],
          stats: { maxTier: 0, totalKills: 0, perfectClears: 0, totalGoldEarned: 0, clearedSects: [] } },
        world: { stage: 1, highestStage: 1, runs: 0, clears: 0 },
        settings: { sound: true },
      }),
    );
    expect(loadSave(empty).player.hints).toEqual([]);
  });

  it('v5 舊存檔補上符籙配置：拿到的正是舊版本唯一存在的那四張', () => {
    const storage = createMemoryStorage();
    storage.write(
      SAVE_KEY,
      JSON.stringify({
        version: 5,
        savedAt: 1,
        player: {
          sectId: 'body', wallet: { gold: 700 }, upgrades: { startAttack: 4 },
          achievements: [], hints: ['tutorial'],
          stats: { maxTier: 8, totalKills: 400, perfectClears: 1, totalGoldEarned: 9000, clearedSects: ['body'] },
        },
        world: { stage: 30, highestStage: 30, runs: 50, clears: 40 },
        settings: { sound: true },
      }),
    );
    const loaded = loadSave(storage);
    expect(loaded.version).toBe(SAVE_VERSION);
    // 老玩家的下一場要和他上一場玩到的完全一樣，不能因為改版突然變成另一個遊戲。
    expect(loaded.player.talismans).toEqual(['sword', 'bolt', 'fan', 'flame']);
    expect(loaded.world.stage).toBe(30);
    expect(loaded.player.wallet.gold).toBe(700);
    expect(loaded.player.upgrades['startAttack']).toBe(4);
    expect(loaded.player.hints).toContain('tutorial');
  });

  it('存檔裡的符籙壞掉（改名、未解鎖、重複）不會擋住開場', () => {
    const storage = createMemoryStorage();
    storage.write(
      SAVE_KEY,
      JSON.stringify({
        version: SAVE_VERSION,
        savedAt: 1,
        player: {
          sectId: 'body', wallet: { gold: 0 }, upgrades: {}, achievements: [], hints: [],
          talismans: ['沒這張', 'slayer', 'sword', 'sword'],
          stats: { maxTier: 0, totalKills: 0, perfectClears: 0, totalGoldEarned: 0, clearedSects: [] },
        },
        // 最高只到第 3 關，誅仙符（第 53 關）此時還沒解鎖。
        world: { stage: 3, highestStage: 3, runs: 1, clears: 0 },
        settings: { sound: true },
      }),
    );
    const loaded = loadSave(storage);
    expect(loaded.player.talismans).toHaveLength(4);
    expect(new Set(loaded.player.talismans).size).toBe(4);
    expect(loaded.player.talismans).not.toContain('slayer');
    expect(loaded.player.talismans).not.toContain('沒這張');
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
    // 「陣法擴充」那條已經整條移出洞府（格位改成固定的 3×3），
    // 所以這裡改用還在的一條線。
    const track = trackById('startAttack');
    save.player.upgrades[track.id] = track.maxLevel;
    addGold(save, 1e18);
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

  it('壞掉的速度設定夾回合法檔位', () => {
    const storage = createMemoryStorage();
    const base = createDefaultSave(1);
    storage.write(SAVE_KEY, JSON.stringify({ ...base, settings: { sound: true, speed: 9 } }));
    // 速度會直接乘進 tickCombat 的 delta，放行一個 9× 等於讓存檔決定遊戲難度。
    expect(loadSave(storage).settings.speed).toBe(1);
    storage.write(SAVE_KEY, JSON.stringify({ ...base, settings: { sound: true, speed: 2 } }));
    expect(loadSave(storage).settings.speed).toBe(2);
  });
});
