/**
 * 存檔的讀寫與變更。所有會動到金幣、升級等級、關卡進度的操作都集中在這裡。
 */
import { UPGRADES } from '../data';
import { sanitizeTalismans, starterTalismans } from '../systems/talismans';
import { trackById, upgradeCost } from '../systems/upgrades';
import type { Storage } from './storage';
import { defaultStorage } from './storage';
import { migrate } from './migrations';
import type { SaveData } from './types';
import { SAVE_KEY, SAVE_VERSION } from './types';

export function createDefaultSave(now: number = Date.now()): SaveData {
  const upgrades: Record<string, number> = {};
  for (const track of UPGRADES) upgrades[track.id] = 0;

  return {
    version: SAVE_VERSION,
    savedAt: now,
    player: {
      sectId: null,
      wallet: { gold: 0 },
      upgrades,
      achievements: [],
      hints: [],
      talismans: starterTalismans(),
      stats: { maxTier: 0, totalKills: 0, perfectClears: 0, totalGoldEarned: 0, clearedSects: [] },
    },
    world: { stage: 1, highestStage: 1, runs: 0, clears: 0 },
    settings: { sound: true, speed: 1 },
  };
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** 把讀進來的物件補齊成完整存檔。欄位缺漏一律以預設值補，不讓壞存檔炸掉遊戲。 */
function normalize(raw: Record<string, unknown>, now: number): SaveData {
  const base = createDefaultSave(now);
  const player = (raw['player'] ?? {}) as Record<string, unknown>;
  const world = (raw['world'] ?? {}) as Record<string, unknown>;
  const wallet = (player['wallet'] ?? {}) as Record<string, unknown>;
  const upgrades = (player['upgrades'] ?? {}) as Record<string, unknown>;
  const settings = (raw['settings'] ?? {}) as Record<string, unknown>;
  const stats = (player['stats'] ?? {}) as Record<string, unknown>;
  const achievements = Array.isArray(player['achievements'])
    ? (player['achievements'] as unknown[]).filter((id): id is string => typeof id === 'string')
    : [];
  const hints = Array.isArray(player['hints'])
    ? (player['hints'] as unknown[]).filter((id): id is string => typeof id === 'string')
    : [];
  const savedTalismans = Array.isArray(player['talismans'])
    ? (player['talismans'] as unknown[]).filter((id): id is string => typeof id === 'string')
    : [];
  const clearedSects = Array.isArray(stats['clearedSects'])
    ? (stats['clearedSects'] as unknown[]).filter((id): id is string => typeof id === 'string')
    : [];

  const merged: Record<string, number> = { ...base.player.upgrades };
  for (const track of UPGRADES) {
    const level = asNumber(upgrades[track.id], 0);
    merged[track.id] = Math.max(0, Math.min(track.maxLevel, Math.floor(level)));
  }

  const stage = Math.max(1, Math.floor(asNumber(world['stage'], 1)));
  const highestStage = Math.max(stage, Math.floor(asNumber(world['highestStage'], stage)));
  return {
    version: SAVE_VERSION,
    savedAt: asNumber(raw['savedAt'], now),
    player: {
      sectId: typeof player['sectId'] === 'string' ? player['sectId'] : null,
      wallet: { gold: Math.max(0, Math.floor(asNumber(wallet['gold'], 0))) },
      upgrades: merged,
      achievements,
      hints,
      // 存檔可能引用到已改名或尚未解鎖的符，一律修補成一份能直接開場的四張。
      talismans: sanitizeTalismans(savedTalismans, highestStage),
      stats: {
        maxTier: Math.max(0, Math.floor(asNumber(stats['maxTier'], 0))),
        totalKills: Math.max(0, Math.floor(asNumber(stats['totalKills'], 0))),
        perfectClears: Math.max(0, Math.floor(asNumber(stats['perfectClears'], 0))),
        totalGoldEarned: Math.max(0, Math.floor(asNumber(stats['totalGoldEarned'], 0))),
        clearedSects,
      },
    },
    world: {
      stage,
      highestStage,
      runs: Math.max(0, Math.floor(asNumber(world['runs'], 0))),
      clears: Math.max(0, Math.floor(asNumber(world['clears'], 0))),
    },
    settings: {
      sound: settings['sound'] !== false,
      // 只收 1／2／3，其他一律當 1——存檔被手改成 99 倍不該讓遊戲失控。
      speed: [1, 2, 3].includes(asNumber(settings['speed'], 1)) ? asNumber(settings['speed'], 1) : 1,
    },
  };
}

export function loadSave(storage: Storage = defaultStorage(), now: number = Date.now()): SaveData {
  const raw = storage.read(SAVE_KEY);
  if (raw === null) return createDefaultSave(now);

  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return createDefaultSave(now);
    }
    const migrated = migrate(parsed as Record<string, unknown>, SAVE_VERSION);
    return normalize(migrated, now);
  } catch {
    // 壞掉的 JSON：當作新檔，不阻擋遊戲啟動。
    return createDefaultSave(now);
  }
}

export function saveGame(
  data: SaveData,
  storage: Storage = defaultStorage(),
  now: number = Date.now(),
): void {
  data.savedAt = now;
  storage.write(SAVE_KEY, JSON.stringify(data));
}

export function resetSave(storage: Storage = defaultStorage()): SaveData {
  storage.remove(SAVE_KEY);
  return createDefaultSave();
}

// ---------------------------------------------------------------- 變更操作

export function addGold(data: SaveData, amount: number): void {
  const rounded = Math.round(amount);
  data.player.wallet.gold = Math.max(0, data.player.wallet.gold + rounded);
  if (rounded > 0) data.player.stats.totalGoldEarned += rounded;
}

export interface PurchaseResult {
  ok: boolean;
  /** 失敗原因，成功時為 null。 */
  reason: 'maxed' | 'insufficient' | null;
  cost: number | null;
}

/** 買一級升級。金幣不足或已滿級都不會改動存檔。 */
export function buyUpgrade(data: SaveData, trackId: string): PurchaseResult {
  const track = trackById(trackId);
  const level = data.player.upgrades[trackId] ?? 0;
  const cost = upgradeCost(track, level);

  if (cost === null) return { ok: false, reason: 'maxed', cost: null };
  if (data.player.wallet.gold < cost) return { ok: false, reason: 'insufficient', cost };

  data.player.wallet.gold -= cost;
  data.player.upgrades[trackId] = level + 1;
  return { ok: true, reason: null, cost };
}

/** 通關：關卡前進一關，並記錄最高境界與門派通關紀錄。 */
export function recordClear(data: SaveData, gold: number): void {
  addGold(data, gold);
  const sectId = data.player.sectId;
  if (sectId !== null && !data.player.stats.clearedSects.includes(sectId)) {
    data.player.stats.clearedSects.push(sectId);
  }
  data.world.stage += 1;
  data.world.highestStage = Math.max(data.world.highestStage, data.world.stage);
  data.world.runs += 1;
  data.world.clears += 1;
}

/** 失敗：停在原關卡，只給安慰獎。 */
export function recordDefeat(data: SaveData, gold: number): void {
  addGold(data, gold);
  data.world.runs += 1;
}
