/**
 * 存檔的讀寫與變更。所有會動到金幣、升級等級、關卡進度的操作都集中在這裡。
 */
import { KARMA, SECTS, UPGRADES } from '../data';
import { sanitizeChallenges } from '../systems/challenges';
import { sanitizeTalismans, starterTalismans } from '../systems/talismans';
import { trackById, upgradeCost } from '../systems/upgrades';
import type { Storage } from './storage';
import { defaultStorage } from './storage';
import { migrate } from './migrations';
import type { KarmaState, RecordsState, SaveData } from './types';
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
      sectClears: {},
      challenges: [],
      challengesDone: [],
      karma: { rebirths: 0, points: 0, spent: {}, claimedStage: 0 },
      records: {
        bestDps: 0,
        fastestClearMs: 0,
        bestFormationBonus: 0,
        bestChallengeStage: 0,
        bestKills: 0,
      },
      stats: { maxTier: 0, totalKills: 0, perfectClears: 0, totalGoldEarned: 0, clearedSects: [] },
    },
    world: { stage: 1, highestStage: 1, runs: 0, clears: 0, retreatAt: now },
    settings: { sound: true, speed: 1 },
  };
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** 仙緣一律夾成非負整數，等級也夾在該線的上限之內。 */
function normalizeKarma(raw: unknown): KarmaState {
  const source = (raw ?? {}) as Record<string, unknown>;
  const spentRaw = (source['spent'] ?? {}) as Record<string, unknown>;
  const spent: Record<string, number> = {};
  for (const track of KARMA) {
    const level = Math.max(0, Math.floor(asNumber(spentRaw[track.id], 0)));
    spent[track.id] = Math.min(track.maxLevel, level);
  }
  return {
    rebirths: Math.max(0, Math.floor(asNumber(source['rebirths'], 0))),
    points: Math.max(0, Math.floor(asNumber(source['points'], 0))),
    spent,
    claimedStage: Math.max(0, Math.floor(asNumber(source['claimedStage'], 0))),
  };
}

/** 紀錄一律夾成非負數：負的最佳紀錄會讓「破紀錄」的判定永遠成立。 */
function normalizeRecords(raw: unknown): RecordsState {
  const source = (raw ?? {}) as Record<string, unknown>;
  const at = (key: string): number => Math.max(0, asNumber(source[key], 0));
  return {
    bestDps: at('bestDps'),
    fastestClearMs: at('fastestClearMs'),
    bestFormationBonus: at('bestFormationBonus'),
    bestChallengeStage: at('bestChallengeStage'),
    bestKills: at('bestKills'),
  };
}

/**
 * 門派修為只收「已存在的門派」的非負整數。
 *
 * 這份紀錄會直接換成傷害加成，所以壞值不能放行：手改成 99999 等於自己把難度調成零。
 */
function normalizeSectClears(raw: unknown): Record<string, number> {
  const source = (raw ?? {}) as Record<string, unknown>;
  const out: Record<string, number> = {};
  for (const sect of SECTS) {
    const value = Math.floor(asNumber(source[sect.id], 0));
    if (value > 0) out[sect.id] = value;
  }
  return out;
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
  const strings = (value: unknown): string[] =>
    Array.isArray(value) ? (value as unknown[]).filter((id): id is string => typeof id === 'string') : [];
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
      sectClears: normalizeSectClears(player['sectClears']),
      challenges: sanitizeChallenges(strings(player['challenges']), highestStage),
      challengesDone: strings(player['challengesDone']),
      records: normalizeRecords(player['records']),
      karma: normalizeKarma(player['karma']),
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
      // 未來的時間一律夾回現在：手改存檔或裝置時鐘跑掉都不該產生負的閉關時數。
      retreatAt: Math.min(now, Math.max(0, asNumber(world['retreatAt'], now))),
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

/**
 * 把一份外來的存檔物件套用進來（匯入碼用）。
 *
 * 走的是和 loadSave 完全相同的遷移與正規化路徑：匯入的碼可能來自幾個版本以前，
 * 若這裡自己做一套修補，兩份規則會各自演化，而舊碼遲早會踩到差異。
 */
export function adoptSave(
  raw: Record<string, unknown>,
  storage: Storage = defaultStorage(),
  now: number = Date.now(),
): SaveData {
  const data = normalize(migrate(raw, SAVE_VERSION), now);
  saveGame(data, storage, now);
  return data;
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
  if (sectId !== null) {
    if (!data.player.stats.clearedSects.includes(sectId)) data.player.stats.clearedSects.push(sectId);
    // 門派修為只在「用這一派通關」時長，而且只長在這一派身上。
    data.player.sectClears[sectId] = (data.player.sectClears[sectId] ?? 0) + 1;
  }
  data.world.stage += 1;
  data.world.highestStage = Math.max(data.world.highestStage, data.world.stage);
  data.world.runs += 1;
  data.world.clears += 1;
  data.world.retreatAt = Date.now();
}

/** 失敗：停在原關卡，只給安慰獎。 */
export function recordDefeat(data: SaveData, gold: number): void {
  addGold(data, gold);
  data.world.runs += 1;
  // 輸了也算「人在場上」：閉關給的是不在的時候的收益，不是打輸的補償。
  data.world.retreatAt = Date.now();
}
