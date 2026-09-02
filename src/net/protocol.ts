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

/**
 * 重播契約的版本。**任何會改變「同一組操作跑出什麼結果」的東西改了就要 +1。**
 *
 * 存在的理由是一個實際發生過兩次的故障：玩家的瀏覽器快取住舊的那包 JS，
 * 於是他打的那一場和伺服器重播的規則不是同一套，成績被退回——而畫面上
 * 只寫得出「紀錄和伺服器對不起來」，玩家完全無從得知自己在跑舊版本。
 * 兩次我都只能叫他重新整理，那不是答案，那是把我的問題丟給他。
 *
 * 有了它，同一個情況會直接說「你的遊戲是舊版本，重新整理就好」。
 *
 * 要 +1 的例子：戰鬥數值（balance.json）、tickCombat 的邏輯、抽符規則、
 * 無限模式的級距、上報欄位的意義。純畫面的改動不必動它。
 */
export const REPLAY_CONTRACT_VERSION = 4;

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

/**
 * 還沒註冊的人在榜上叫什麼。
 *
 * **名字由伺服器從 playerId 推出來，不收客戶端報的。** 匿名也能上榜之後，
 * 如果名字是自己報的，任何人都能把自己叫做別人的道號——榜上就分不出
 * 誰是誰了。推導出來的名字擋掉這件事，而且同一個人每一場都是同一個名字。
 *
 * 註冊過的人用自己的道號；註冊的那一刻，榜上那幾列會一起改過去。
 */
export const ANON_NAME_PREFIX = '無名修士·';

/** 這個身分在榜上的匿名名字。同一個 playerId 永遠推出同一個。 */
export function anonName(playerId: string): string {
  // 取尾巴而不是開頭：playerId 是 UUID，開頭那幾碼在某些版本裡是時間戳，
  // 同一批進來的人會長得一模一樣。
  const tail = playerId.replace(/[^0-9a-z]/gi, '').slice(-6).toLowerCase();
  return `${ANON_NAME_PREFIX}${tail.length > 0 ? tail : '000000'}`;
}

/**
 * 這個道號是不是在冒充匿名的名字。
 *
 * 擋掉的是「註冊一個叫做無名修士·a3f2 的帳號」——那會讓榜上出現一列
 * 看起來是匿名、實際上是別人的紀錄。
 */
export function looksAnon(name: string): boolean {
  return nameKey(name).startsWith(nameKey(ANON_NAME_PREFIX));
}

/** 找回帳號的驗證碼長度。六位數字：夠短到可以用手打，夠長到猜不中。 */
export const RECOVERY_CODE_LENGTH = 6;

/** 驗證碼多久過期。太長等於把信箱外洩的風險放大。 */
export const RECOVERY_TTL_MS = 30 * 60 * 1000;

/**
 * 兩封救援信之間至少要隔多久。
 *
 * **這是這支端點唯一的煞車。** 沒有它的話，任何人只要知道一個註冊過的信箱，
 * 就能對著 /account/recover 連打，讓那個人的收件匣被灌爆——而受害者
 * 完全不需要做錯任何事，也沒有任何辦法擋。順帶擋住的是寄信服務的帳單：
 * 一個迴圈就能把免費額度打光，之後真的忘記密碼的人反而收不到信。
 *
 * 冷卻期間仍然回成功，和「這個信箱沒註冊過」一樣——回一句「太頻繁了」
 * 等於告訴對方這個信箱存在，那正是這支端點一開始要避免的事。
 */
export const RECOVERY_RESEND_MS = 60 * 1000;

/** 提示問題的長度上限。 */
export const MAX_QUESTION_LENGTH = 40;

/**
 * 答案的最短長度（正規化之後）。
 *
 * 這個下限比密碼那個低很多，因為答案本來就是短的（「台北」兩個字）。
 * 它擋的是「a」這種等於沒設的答案，不是拿來當強度保證——
 * 真正的煞車是猜錯次數的上限。
 */
export const MIN_ANSWER_LENGTH = 2;

/**
 * 答案推導密鑰時加的前綴。
 *
 * **域分離。** 沒有它的話，一個人如果把答案設成和密碼一樣的字，
 * 答案推出來的密鑰就會和身分密鑰完全相同——那等於把答案的雜湊
 * 變成身分密鑰的雜湊，猜中答案就直接拿到身分本身。
 */
export const ANSWER_PREFIX = 'answer:';

/**
 * 答案可以猜錯幾次。
 *
 * **這是這套救援唯一真正的煞車。** 提示問題的答案熵很低（「你出生的城市」
 * 猜個十次就中了），所以能不能守住完全看猜的次數有沒有上限——
 * 沒有上限的話，這個機制等於把帳號的密碼換成一個四位數的鎖。
 */
export const MAX_ANSWER_ATTEMPTS = 5;

/**
 * 猜錯太多次之後鎖多久。
 *
 * **是冷卻不是永久鎖定。** 永久鎖定的話，任何知道你信箱的人都可以故意
 * 猜錯五次把你的救援管道關掉——防守變成攻擊面。
 */
export const ANSWER_LOCK_MS = 15 * 60 * 1000;

/**
 * 答案的正規化。
 *
 * **比名稱那一份更用力，而且是刻意的。** 玩家半年後打的不會是當初那個字串：
 * 「台北」「台北市」擋不掉（那是不同答案），但「 台北 」「台 北」「ＴＡＩＰＥＩ」
 * 都應該算對。空白全部去掉、NFKC、小寫。
 *
 * 這裡每寬鬆一分，答案就好猜一分——但一個記不起來的答案救不了任何人，
 * 而**打錯字被鎖在外面**是這種機制最常見的失敗方式，不是被猜中。
 */
export function cleanAnswer(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = raw
    .normalize('NFKC')
    .replace(INVISIBLE, '')
    .replace(/\s+/g, '')
    .toLowerCase();
  if (cleaned.length < MIN_ANSWER_LENGTH) return null;
  return cleaned;
}

/** 清過的提示問題。它會顯示給「知道這個信箱」的任何人看，不是秘密。 */
export function cleanQuestion(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.replace(INVISIBLE, '').trim();
  if (cleaned.length === 0 || cleaned.length > MAX_QUESTION_LENGTH) return null;
  return cleaned;
}

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

/**
 * 這個信箱的提示問題。
 *
 * **沒有帳號、和有帳號但沒設問題，回的是同一種東西（null）。**
 * 分開回等於在這一支上多開一個「哪些信箱註冊過」的查詢工具。
 */
export interface RecoveryQuestionResult {
  question: string | null;
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
  /** 這一場是不是教學。教學換過起手牌，伺服器重播前要先做同一件事。 */
  tutorial?: boolean;
  /**
   * 客戶端手上的重播契約版本。
   *
   * 對不上的話伺服器會直接說「你的遊戲是舊版本」，而不是丟一句
   * 「紀錄和伺服器對不起來」讓玩家自己猜。
   */
  contract: number;
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

/**
 * 所有的榜。字串直接進網址與資料庫，改名等於改協定。
 *
 * 速通是**一關一個**（speed1、speed40…），關卡編在榜名裡。
 */
export type BoardKind = 'depth' | 'arena' | `speed${number}`;

/** 速通最後那一條賽道：主線的終點。 */
export const SPEED_STAGE = 81;

/**
 * 速通：**每一關各自是一個獨立的榜。**
 *
 * 原本只有第 81 關一條，而那是主線的終點——榜上要等到有人走完全程才會
 * 出現第一筆，在那之前它是一個永遠空著的分頁。空的榜看起來像壞掉的功能。
 *
 * 但「有成績就先上去」不能做成「不管第幾關都丟進同一個榜」：那樣
 * 第 1 關 40 秒會贏過第 81 關 3 分鐘，它就退化成「誰最快打完最簡單的一關」。
 *
 * 一關一個榜同時解決兩件事——**同一個榜上大家打的必然是同一關**，
 * 秒數直接可比；而第一關就有榜，新玩家打完第一場就上得去。
 *
 * 賽道編在榜名裡（speed1、speed40…），所以多一關不必動資料表：
 * board 本來就是主鍵的一部分。
 */

/** 速通榜收到第幾關為止。飛升境沒有終點，但榜總得有個界。 */
export const MAX_SPEED_STAGE = 9999;

/** 這一關有沒有對應的速通榜。超出範圍回 null。 */
export function speedTrackOf(stage: number): number | null {
  if (!Number.isInteger(stage) || stage < 1 || stage > MAX_SPEED_STAGE) return null;
  return stage;
}

/** 關卡 → 榜別。 */
export function speedBoard(stage: number): BoardKind {
  return `speed${stage}`;
}

/** 榜別 → 那一關。不是速通榜就回 null。 */
export function trackOfBoard(board: BoardKind): number | null {
  const match = /^speed(\d+)$/.exec(board);
  if (match === null) return null;
  return speedTrackOf(Number(match[1]));
}

/** 這個字串是不是一個合法的榜別。**認不得的一律不收**，見 scores.ts 的說明。 */
export function isBoardKind(raw: unknown): raw is BoardKind {
  if (typeof raw !== 'string') return false;
  if (raw === 'depth' || raw === 'arena') return true;
  return trackOfBoard(raw as BoardKind) !== null;
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
