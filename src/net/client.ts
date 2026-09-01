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
  DistributionResult,
  Identity,
  LeaderboardResult,
  RecoveryQuestionResult,
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
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${base}/${API_VERSION}${path}`, {
      method: body === null ? 'GET' : 'POST',
      headers: body === null ? {} : { 'content-type': 'application/json' },
      body: body === null ? null : JSON.stringify(body),
      signal: controller.signal,
    });
    const parsed = (await response.json()) as ApiResponse<T>;
    return parsed;
  } catch {
    // 連不上、逾時、回的不是 JSON——對呼叫端來說都是同一件事：這次沒成功。
    return { ok: false, error: 'serverError', detail: '連不上伺服器' };
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
}): Promise<ApiResponse<Record<string, never>>> {
  return call('/account/recover', body);
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

export function fetchDistribution(): Promise<ApiResponse<DistributionResult>> {
  return call<DistributionResult>('/distribution', null);
}
