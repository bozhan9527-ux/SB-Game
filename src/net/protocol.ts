/**
 * 前後端之間的協定。
 *
 * 這一份型別同時被遊戲與 Cloudflare Worker import——兩邊共用同一個定義，
 * 欄位改名時另一邊會編譯失敗，而不是靜靜地送出對方看不懂的東西。
 * 這和 src/systems/replay.ts 是同一套態度：會分岔的東西就不要寫兩份。
 *
 * 幾條規矩：
 * - **所有帶 secret 的請求一律用 POST + JSON body**，不放 query string。
 *   網址會進到各種存取記錄裡，密鑰不該出現在那些地方。
 * - 回應一律是 `{ ok: true, ... }` 或 `{ ok: false, error: ... }`，
 *   不靠 HTTP 狀態碼傳遞語意——前端只需要看一個欄位。
 */

/** 目前的 API 版本。路徑前綴，改協定時整組換掉，不做欄位相容。 */
export const API_VERSION = 'v1';

/** 上傳的存檔最大幾個位元組。目前一份完整存檔約 1KB，64KB 是很寬鬆的上限。 */
export const MAX_BLOB_BYTES = 64 * 1024;
/** 排行榜名稱長度上限。 */
export const MAX_NAME_LENGTH = 16;

export type ApiError =
  | 'badRequest'
  | 'unauthorized'
  | 'notFound'
  | 'tooLarge'
  | 'rejected'
  | 'serverError';

export type ApiResponse<T> = ({ ok: true } & T) | { ok: false; error: ApiError; detail?: string };

/** 匿名身分。playerId 是誰，secret 證明是他本人。 */
export interface Identity {
  playerId: string;
  secret: string;
}

export interface SavePutRequest extends Identity {
  /** 存檔自己的時間戳（SaveData.savedAt）。用來判斷兩邊誰比較新。 */
  savedAt: number;
  blob: string;
}

export interface SavePutResult {
  savedAt: number;
}

export type SaveGetRequest = Identity;

export interface SaveGetResult {
  blob: string;
  savedAt: number;
}

export interface ScoreSubmitRequest extends Identity {
  name: string;
  /** 宣稱通關到第幾關。伺服器會自己重播算一次，不採信這個數字。 */
  stage: number;
  runs: number;
  steps: number;
  actions: unknown[];
  /** 重播時要用的配置。伺服器會夾在合法範圍內。 */
  loadout: ScoreLoadout;
}

/**
 * 上報的配置。
 *
 * **這裡是作弊的入口，而且堵不死。** 升級等級、仙緣、門派修為都是玩家的機器
 * 報上來的，伺服器只能把每個欄位夾在資料檔允許的範圍內（例如等級不得超過
 * maxLevel），沒辦法確認他真的花錢買過。要堵死得讓伺服器變成進度的權威，
 * 那是完全另一個量級的工程。夾範圍至少讓「宣稱一千級」這種事不成立。
 */
export interface ScoreLoadout {
  sectId: string;
  /** 藏經閣通關層數。它決定抽符池——漏掉它，重播抽到的就不是同一組符。 */
  libraryFloor: number;
  talismans: string[];
  upgrades: Record<string, number>;
  karma: Record<string, number>;
  /** 門派修為的來源。漏掉它，重播出來的傷害就和玩家當時不一樣。 */
  sectClears: number;
  /**
   * 這一場的規則（副本帶進來的）。
   *
   * 它不是作弊面：每一條都只讓這一場更難，而且人人可打。
   * 漏掉它才是問題——在副本裡通關的成績會永遠驗不過。
   */
  rules: string[];
  goldMultiplier: number;
  extraFieldSlots: number;
}

export interface ScoreSubmitResult {
  /** 伺服器重播之後認定的關卡。可能低於玩家宣稱的。 */
  stage: number;
  rank: number;
  best: boolean;
}

export interface LeaderboardEntry {
  rank: number;
  name: string;
  stage: number;
}

export interface LeaderboardResult {
  entries: LeaderboardEntry[];
  total: number;
}

/**
 * 關卡分布。索引就是關卡編號，值是「最深只到這一關的人數」。
 *
 * 回一份直方圖而不是「你贏過幾成」，是因為百分位要在客戶端算——
 * 這樣同一份回應可以在 CDN 上快取給所有人，不必為每個玩家算一次。
 */
export interface DistributionResult {
  /** buckets[i] = 最深停在第 i 關的人數。 */
  buckets: number[];
  total: number;
}

/** 從直方圖算出「你超過了幾成人」。0.92 = 超過 92%。 */
export function percentileOf(buckets: readonly number[], stage: number): number {
  let below = 0;
  let total = 0;
  for (let i = 0; i < buckets.length; i += 1) {
    const count = buckets[i] ?? 0;
    total += count;
    if (i < stage) below += count;
  }
  if (total === 0) return 0;
  return below / total;
}
