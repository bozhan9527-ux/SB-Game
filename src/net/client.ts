/**
 * 呼叫後端的薄一層。
 *
 * 和遙測同一套規矩：**沒有設定 API 位址時，整包是 no-op**。
 * 沒設定的 build 完全不連網，雲端相關的畫面也整個不出現——
 * 一個按了會失敗的按鈕比沒有那個按鈕更糟。
 *
 * 所有請求都有逾時：後端掛掉時，遊戲該做的是「這次同步失敗」，
 * 不是「畫面卡在轉圈圈」。
 */
import type {
  AccountResult,
  BoardKind,
  AccountSaltResult,
  ApiResponse,
  Identity,
  LeaderboardResult,
  RecoveryQuestionResult,
  RecoveryRequestResult,
  SaveGetResult,
  SavePutResult,
  ScoreSubmitRequest,
  ScoreSubmitResult,
} from './protocol';
import { API_VERSION } from './protocol';

/** 單次請求的逾時。手機網路不好時要等一下，但不能無限等。 */
const TIMEOUT_MS = 8000;

export function apiBase(): string | null {
  const base = import.meta.env['VITE_API_BASE'];
  if (typeof base !== 'string' || base.length === 0) return null;
  return base.replace(/\/+$/, '');
}

/** 後端有沒有設定。沒有的話呼叫端要把雲端相關的 UI 整個藏起來。 */
export function cloudEnabled(): boolean {
  return apiBase() !== null;
}

async function call<T>(path: string, body: unknown | null): Promise<ApiResponse<T>> {
  const base = apiBase();
  if (base === null) return { ok: false, error: 'badRequest', detail: '未設定伺服器位址' };

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, TIMEOUT_MS);
  try {
    const response = await fetch(`${base}/${API_VERSION}${path}`, {
      method: body === null ? 'GET' : 'POST',
      headers: body === null ? {} : { 'content-type': 'application/json' },
      body: body === null ? null : JSON.stringify(body),
      signal: controller.signal,
    });
    // **伺服器沒回 JSON 是一種獨立的故障，不能和「連不上」混在一起。**
    //
    // 它最可能的成因是 Worker 在跑完之前就被平台砍掉——CPU 逾時的時候，
    // Cloudflare 回的是一頁 HTML 錯誤頁，不是這個 API 的 JSON。而重播驗證
    // 正是整個後端最貴的一支（一般通關 40 毫秒，最深的一場競技場 420 毫秒），
    // 所以真的發生的話，**被擋下來的會剛好是打得最深的那幾個人**。
    //
    // 直接 await json() 的話，這個故障會掉進下面的 catch，然後被說成
    // 「連不上伺服器，看一下網路」——玩家跑去重開 Wi-Fi，而問題不在那裡。
    // 這個專案已經被同一種「catch-all 蓋掉真正原因」咬過三次了。
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      try {
        return JSON.parse(text) as ApiResponse<T>;
      } catch {
        return {
          ok: false,
          error: 'serverError',
          detail: `伺服器沒能處理完這個請求（${response.status}），這一場沒有上榜`,
        };
      }
    }
    const parsed = (await response.json()) as ApiResponse<T>;
    return parsed;
  } catch {
    // **逾時和連不上要分開講。**
    //
    // 它們對程式來說是同一件事（這次沒成功），但對玩家不是：連不上要他
    // 看網路，逾時多半是等一下就好。全部寫成「連不上伺服器」的話，
    // 網路明明是通的那個人只會覺得這句話在騙他——而他就沒有下一步了。
    return timedOut
      ? { ok: false, error: 'serverError', detail: '伺服器太久沒回應，等一下再試' }
      : { ok: false, error: 'serverError', detail: '連不上伺服器，看一下網路' };
  } finally {
    clearTimeout(timer);
  }
}

export function accountSalt(body: { email: string }): Promise<ApiResponse<AccountSaltResult>> {
  return call('/account/salt', body);
}

export function accountRegister(body: {
  email: string;
  name: string;
  playerId: string;
  salt: string;
  secretHash: string;
  oldSecretHash: string;
}): Promise<ApiResponse<AccountResult>> {
  return call('/account/register', body);
}

export function accountRecover(body: {
  email: string;
}): Promise<ApiResponse<RecoveryRequestResult>> {
  return call<RecoveryRequestResult>('/account/recover', body);
}

export function accountReset(body: {
  email: string;
  code: string;
  secretHash: string;
}): Promise<ApiResponse<AccountResult>> {
  return call('/account/reset', body);
}

/** 改道號。帳號是信箱，所以這裡只動顯示用的名字。 */
/** 設定或更換救援問題。要先登入——身分密鑰就是證明。 */
export function accountSetQuestion(body: {
  playerId: string;
  secret: string;
  question: string;
  answerHash: string;
}): Promise<ApiResponse<{ question: string }>> {
  return call('/account/question/set', body);
}

/** 問這個信箱的救援問題。沒帳號和沒設問題回的都是 null。 */
export function accountQuestion(body: {
  email: string;
}): Promise<ApiResponse<RecoveryQuestionResult>> {
  return call('/account/question', body);
}

/** 答對問題，設一組新密碼。 */
export function accountAnswerReset(body: {
  email: string;
  answerHash: string;
  secretHash: string;
}): Promise<ApiResponse<AccountResult>> {
  return call('/account/question/reset', body);
}

export function accountRename(body: {
  playerId: string;
  secret: string;
  name: string;
}): Promise<ApiResponse<AccountResult>> {
  return call('/account/rename', body);
}

export function accountLogin(body: {
  email: string;
  secretHash: string;
}): Promise<ApiResponse<AccountResult>> {
  return call('/account/login', body);
}

export function putSave(body: Identity & { savedAt: number; blob: string }): Promise<ApiResponse<SavePutResult>> {
  return call<SavePutResult>('/save/put', body);
}

export function getSave(body: Identity): Promise<ApiResponse<SaveGetResult>> {
  return call<SaveGetResult>('/save/get', body);
}

export function submitScore(body: ScoreSubmitRequest): Promise<ApiResponse<ScoreSubmitResult>> {
  return call<ScoreSubmitResult>('/score', body);
}

export function fetchLeaderboard(
  board: BoardKind,
  playerId: string | null,
): Promise<ApiResponse<LeaderboardResult>> {
  const query = playerId === null ? `?board=${board}` : `?board=${board}&playerId=${encodeURIComponent(playerId)}`;
  return call(`/leaderboard${query}`, null);
}

