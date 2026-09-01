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

/**
 * 名稱的正規化。用來擋「看起來一樣但實際不同」的重複名稱。
 *
 * **前後端一定要用同一份。** 客戶端說可以用、伺服器說重複，
 * 那個矛盾在畫面上無法解釋。
 */
export function nameKey(name: string): string {
  return name.normalize('NFKC').trim().toLowerCase();
}

/** 看不見的字元。留著會做出「和別人長得一模一樣」的名字。 */
const INVISIBLE = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\ufeff]/g;

/** 清過的名稱。不合法（空的、太長、不是字串）回 null。 */
export function cleanName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.replace(INVISIBLE, '').trim();
  if (cleaned.length === 0 || cleaned.length > MAX_NAME_LENGTH) return null;
  return cleaned;
}

/**
 * 電子信箱。**只用來找回帳號，不做任何別的事。**
 *
 * 驗證刻意寬鬆：只確認「看起來是一個信箱」。嚴格的正則會擋掉合法的位址
 * （加號、子網域、新的頂級網域都常被擋），而真正能證明信箱有效的只有
 * 「寄一封信過去，他收得到」——那件事在忘記密碼的流程裡本來就會做一次。
 */
export function cleanEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.trim().toLowerCase();
  if (cleaned.length === 0 || cleaned.length > 254) return null;
  if (!/^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(cleaned)) return null;
  return cleaned;
}

/** 找回帳號的驗證碼長度。六位數字：夠短到可以用手打，夠長到猜不中。 */
export const RECOVERY_CODE_LENGTH = 6;

/** 驗證碼多久過期。太長等於把信箱外洩的風險放大。 */
export const RECOVERY_TTL_MS = 30 * 60 * 1000;

export type ApiError =
  | 'badRequest'
  | 'unauthorized'
  | 'notFound'
  | 'tooLarge'
  | 'rejected'
  | 'serverError';

export type ApiResponse<T> = ({ ok: true } & T) | { ok: false; error: ApiError; detail?: string };

/** 註冊前先要一把鹽，順便問「這個名字有沒有人用了」。 */
export interface AccountSaltResult {
  salt: string;
  taken: boolean;
}

/** 註冊與登入回的都是「你是哪個帳號、哪個身分」。 */
export interface AccountResult {
  name: string;
  playerId: string;
}

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
  /** 這一筆要進哪個榜。 */
  board: BoardKind;
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
   * 門派秘傳的等級。和升級等級同一類：伺服器只能夾上限，不能確認他買過。
   *
   * 這條線沒有等級上限（成本是唯一的煞車），所以伺服器夾的是一個
   * 「怎麼玩都到不了」的天花板，不是資料檔裡的 maxLevel。
   */
  sectDepth: number;
  /**
   * 這一場的規則（副本帶進來的）。
   *
   * 它不是作弊面：每一條都只讓這一場更難，而且人人可打。
   * 漏掉它才是問題——在副本裡通關的成績會永遠驗不過。
   */
  rules: string[];
  goldMultiplier: number;
  /**
   * 上一次轉世時已經走到的深度。飛升境的世界依它變硬——
   * **少報會讓重播出一個比較好打的世界**。
   *
   * 和升級等級同一類的結構性限制：伺服器沒辦法確認這個數字。
   * 夾上限擋得住「宣稱一萬關」，擋不住「宣稱零」。寫在 server/README。
   */
  bankedStage: number;
  /** 轉世次數。決定妖魔長出習性的機率——同樣是少報會讓重播變簡單的欄位。 */
  rebirths: number;
}

export interface ScoreSubmitResult {
  /** 伺服器重播之後認定的關卡。可能低於玩家宣稱的。 */
  stage: number;
  rank: number;
  best: boolean;
  /** 伺服器重播算出來的模擬時間。速通榜與同分比較都看它。 */
  elapsedMs: number;
}

export interface LeaderboardEntry {
  rank: number;
  name: string;
  /** 這個榜的分數：深度／秒數／波數，由 board 決定怎麼讀。 */
  score: number;
  stage: number;
  elapsedMs: number;
}

export interface LeaderboardResult {
  entries: LeaderboardEntry[];
  total: number;
  /**
   * 呼叫者自己那一列。
   *
   * **前 N 名之外的人也要看得到自己。** 沒有這一欄的話，第 400 名的玩家
   * 在這一頁永遠找不到自己——而他才是絕大多數。
   */
  mine: LeaderboardEntry | null;
}

/** 三個榜。字串直接進網址與資料庫，改名等於改協定。 */
export type BoardKind = 'depth' | 'speed' | 'arena';

/**
 * 速通榜的賽道：主線的最後一關。
 *
 * **賽道必須固定，而且兩邊必須是同一個數字。** 不同關卡的秒數不能比——
 * 「第 1 關 40 秒」會贏過「第 81 關 3 分鐘」，榜單就退化成
 * 「誰最快打完最簡單的一關」。前後端各寫一份的話，客戶端會送出
 * 一筆伺服器一定退回的成績，而畫面上說不出原因。
 */
export const SPEED_STAGE = 81;

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
