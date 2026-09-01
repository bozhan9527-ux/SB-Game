/**
 * HTTP 的共用部分：CORS、JSON 回應、讀取有大小上限的 body。
 */
import type { ApiError, ApiResponse } from '../../src/net/protocol';
import { MAX_BLOB_BYTES } from '../../src/net/protocol';

export interface Env {
  DB: D1Database;
  ALLOWED_ORIGIN: string;
  /** 寄信服務（忘記密碼的驗證碼）。沒設定時整包是 no-op，見 mail.ts。 */
  RESEND_KEY?: string;
  RESEND_FROM?: string;
}

/**
 * CORS。
 *
 * 只放行設定裡那一個來源，不用 `*`：這幾個端點會接受帶密鑰的請求，
 * 讓任何網頁都能從瀏覽器打它，等於把玩家的存檔暴露給任何一個他造訪過的網站。
 */
export function corsHeaders(env: Env, origin: string | null): Record<string, string> {
  // 逗號分隔的白名單。本機開發時用 `wrangler dev --var` 覆蓋成 localhost，
  // 正式部署的值不含 localhost——那是別人的機器上也存在的位址。
  const allowed = (env.ALLOWED_ORIGIN ?? '').split(',').map((item) => item.trim());
  const headers: Record<string, string> = {
    'access-control-allow-methods': 'POST, GET, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-max-age': '86400',
  };
  if (origin !== null && (allowed.includes(origin) || allowed.includes('*'))) {
    headers['access-control-allow-origin'] = origin;
    headers['vary'] = 'origin';
  }
  return headers;
}

export function json<T>(
  body: ApiResponse<T>,
  env: Env,
  origin: string | null,
  status = 200,
  extra: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...corsHeaders(env, origin), ...extra },
  });
}

export function fail(
  error: ApiError,
  env: Env,
  origin: string | null,
  detail?: string,
): Response {
  const status = error === 'unauthorized' ? 401 : error === 'notFound' ? 404 : error === 'serverError' ? 500 : 400;
  return json(detail === undefined ? { ok: false, error } : { ok: false, error, detail }, env, origin, status);
}

/**
 * 讀 JSON body，但先擋大小。
 *
 * 不先看 content-length 就 await text() 的話，一個宣稱要傳 500MB 的請求
 * 會把 Worker 的記憶體與 CPU 時間吃光——而任何人都能對著公開端點送東西。
 */
export async function readJson(request: Request): Promise<unknown | 'tooLarge' | 'badRequest'> {
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > MAX_BLOB_BYTES * 4) return 'tooLarge';
  let text: string;
  try {
    text = await request.text();
  } catch {
    return 'badRequest';
  }
  if (text.length > MAX_BLOB_BYTES * 4) return 'tooLarge';
  try {
    return JSON.parse(text);
  } catch {
    return 'badRequest';
  }
}

/** SHA-256，回十六進位。存 secret 的雜湊而不是原文。 */
export async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * 定時比較。
 *
 * 雜湊比對其實不太容易被時序攻擊（攻擊者不能自由選擇雜湊值），
 * 但這種地方沒有理由省——寫成定時只多三行。
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function isNonEmptyString(value: unknown, max = 200): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max;
}
