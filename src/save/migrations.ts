/**
 * 存檔遷移（TECH_SPEC 第 4.2 節）。
 *
 * 規則：存檔結構一有變更就把 SAVE_VERSION +1，並在此陣列尾端追加一支遷移函式，
 * 索引 i 的函式負責 v(i+1) → v(i+2)。禁止改結構而不寫遷移。
 */
export type Migration = (data: Record<string, unknown>) => Record<string, unknown>;

/** v1 → v2：加入音效開關。舊存檔沒有這個欄位，預設開啟。 */
const addSettings: Migration = (data) => ({
  ...data,
  settings: { sound: true },
});

/** v2 → v3：加入成就與長期統計。舊存檔沒有這些欄位，一律從零開始累計。 */
const addAchievements: Migration = (data) => {
  const player = (data['player'] ?? {}) as Record<string, unknown>;
  return {
    ...data,
    player: {
      ...player,
      achievements: [],
      stats: { maxCrowd: 0, maxArms: 0, fastestBossMs: 0, totalGoldEarned: 0, clearedSects: [] },
    },
  };
};

/**
 * v3 → v4：玩法由閘門跑酷改為山門防守，長期統計換成新玩法的原始事實。
 * 金幣、關卡進度、升級等級與已達成的成就一律保留；只有統計欄位重新開始累計
 * （舊的「單場人數／武裝值」在新玩法裡沒有對應的量）。
 */
const toDefenseStats: Migration = (data) => {
  const player = (data['player'] ?? {}) as Record<string, unknown>;
  const old = (player['stats'] ?? {}) as Record<string, unknown>;
  return {
    ...data,
    player: {
      ...player,
      stats: {
        maxTier: 0,
        totalKills: 0,
        perfectClears: 0,
        totalGoldEarned: typeof old['totalGoldEarned'] === 'number' ? old['totalGoldEarned'] : 0,
        clearedSects: Array.isArray(old['clearedSects']) ? old['clearedSects'] : [],
      },
    },
  };
};

/**
 * v4 → v5：加入新手教學與一次性提示的紀錄。
 * 舊玩家（存檔已存在）視為已經會玩，不再被教學打斷；新玩家才會走教學。
 */
const addHints: Migration = (data) => {
  const player = (data['player'] ?? {}) as Record<string, unknown>;
  const world = (data['world'] ?? {}) as Record<string, unknown>;
  const played = typeof world['runs'] === 'number' && world['runs'] > 0;
  return {
    ...data,
    player: { ...player, hints: played ? ['tutorial'] : [] },
  };
};

/** 索引 i 的函式負責 v(i+1) → v(i+2)。新增時往後 push，不得插隊或修改既有項目。 */
export const MIGRATIONS: readonly Migration[] = [
  addSettings,
  addAchievements,
  toDefenseStats,
  addHints,
];

/**
 * 把任意版本的存檔套用至最新版。
 * 版本高於目前程式（玩家降版）時原樣回傳，交由上層決定是否放棄該存檔。
 */
export function migrate(data: Record<string, unknown>, targetVersion: number): Record<string, unknown> {
  let current = data;
  let version = typeof current['version'] === 'number' ? (current['version'] as number) : 1;

  while (version < targetVersion) {
    const migration = MIGRATIONS[version - 1];
    if (migration === undefined) break;
    current = migration(current);
    version += 1;
    current['version'] = version;
  }
  return current;
}
