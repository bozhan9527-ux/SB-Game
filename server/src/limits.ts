/**
 * 速率限制。
 *
 * **為什麼非有不可。** 上榜的驗證是伺服器把整場戰鬥用同一份 tickCombat
 * 重跑一遍——那是這個榜唯一的防線，但它要花真實的 CPU：實測一般通關約
 * 40 毫秒，而跑滿 MAX_REPLAY_STEPS 的一場約 1.5 秒。沒有煞車的話，任何人
 * 只要上傳一次雲端存檔拿到身分，就能無限次送出 1.5 秒 CPU 的請求。
 * 那不會讓資料壞掉，它會讓帳單壞掉，而且是安靜地壞。
 *
 * **固定視窗，不是漏桶。** 一個 UPSERT 就做得完，而漏桶要嘛多存一個時間戳、
 * 要嘛多一次讀取。固定視窗在視窗邊界會放行兩倍的量，但這裡要擋的是
 * 「一個迴圈打幾千次」，不是「精準到個位數」——兩倍不影響結論。
 *
 * **不是交易。** D1 的兩個語句之間沒有隔離，所以這裡刻意寫成單一語句加
 * RETURNING：同時進來的兩個請求還是可能都放行，但不會出現「兩邊都讀到 0」
 * 這種完全失效的情況。
 */
import type { Env } from './http';
import { fail } from './http';

const MINUTE = 60_000;

/**
 * 各端點的額度。**集中在一個地方**，因為這幾個數字只有擺在一起才看得出
 * 鬆緊是否一致——散在各自的檔案裡，改一個會忘記另一個。
 *
 * 訂法一律是「真人怎麼玩都碰不到，但迴圈跑不動」：
 */
export const LIMITS = {
  /** 送成績（照身分算）。一場最快也要四十幾秒，30 次／5 分鐘對真人極寬鬆。 */
  score: { limit: 30, windowMs: 5 * MINUTE },
  /** 送成績（照 IP 算）。擋的是「一個人開一百個身分繞過上面那條」。 */
  scoreIp: { limit: 60, windowMs: 5 * MINUTE },
  /** 上傳存檔。它是取得身分的唯一入口，所以它決定了偽造身分有多便宜。 */
  saveIp: { limit: 60, windowMs: 5 * MINUTE },
  /** 註冊。真人一輩子做一次。 */
  registerIp: { limit: 5, windowMs: 60 * MINUTE },
  /** 登入。線上猜密碼唯一的煞車（離線猜要先破 PBKDF2，不走這裡）。 */
  loginIp: { limit: 20, windowMs: 5 * MINUTE },
  /** 救援問題的答案。那一支自己有猜錯次數上限，這裡擋的是「換信箱掃描」。 */
  answerIp: { limit: 20, windowMs: 15 * MINUTE },
} as const;

/** 這一次呼叫是被擋下來了（回傳還要等幾毫秒），還是放行（null）。 */
export type LimitVerdict = { retryInMs: number } | null;

/**
 * 從呼叫者的 IP 推一把鍵。
 *
 * `cf-connecting-ip` 是 Cloudflare 自己加的，客戶端偽造不了——它在到達
 * Worker 之前就被邊緣覆寫掉。本機 `wrangler dev` 沒有這個標頭，
 * 所以退回一個固定值：本機開發時所有請求共用一個桶，那正是想要的
 * （限制看得到、而且不必為了測試繞過它）。
 */
export function ipKey(request: Request): string {
  return request.headers.get('cf-connecting-ip') ?? 'local';
}

/**
 * 記一次，並回答「這一次要不要擋」。
 *
 * @param limit   一個視窗內最多幾次。
 * @param windowMs 視窗長度。
 */
export async function take(
  env: Env,
  key: string,
  limit: number,
  windowMs: number,
): Promise<LimitVerdict> {
  const now = Date.now();
  const row = await env.DB.prepare(
    `INSERT INTO rate_limits (key, hits, window_at) VALUES (?1, 1, ?2)
     ON CONFLICT(key) DO UPDATE SET
       hits = CASE WHEN ?2 - rate_limits.window_at >= ?3 THEN 1 ELSE rate_limits.hits + 1 END,
       window_at = CASE WHEN ?2 - rate_limits.window_at >= ?3 THEN ?2 ELSE rate_limits.window_at END
     RETURNING hits, window_at`,
  )
    .bind(key, now, windowMs)
    .first<{ hits: number; window_at: number }>();

  // 讀不到就放行。**限制壞掉不該讓遊戲壞掉**——這一層是防濫用的，
  // 不是正確性的一部分；擋住所有人的代價遠大於漏掉幾次請求。
  if (row === null) return null;
  if (row.hits <= limit) return null;
  return { retryInMs: Math.max(0, windowMs - (now - row.window_at)) };
}

/** 被擋下來時要回什麼。訊息講得出「多久之後再試」，不然玩家只會一直按。 */
export function tooMany(verdict: { retryInMs: number }, env: Env, origin: string | null): Response {
  const seconds = Math.max(1, Math.ceil(verdict.retryInMs / 1000));
  const wait = seconds >= 60 ? `${Math.ceil(seconds / 60)} 分鐘` : `${seconds} 秒`;
  return fail('rejected', env, origin, `太頻繁了，${wait}後再試`);
}

/**
 * 順手清掉過期的列。
 *
 * 不設清理的話這張表會隨著不同的鍵無限長大——一個換 IP 的攻擊者可以
 * 用垃圾列把資料庫塞滿，那是把速率限制本身變成攻擊面。
 *
 * 用機率而不是排程：Worker 沒有背景工作，而每一次請求都掃一遍太貴。
 * 百分之一的機率意味著平均每一百次請求清一次，量級完全足夠。
 */
export async function sweep(env: Env): Promise<void> {
  if (Math.random() >= 0.01) return;
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  try {
    await env.DB.prepare('DELETE FROM rate_limits WHERE window_at < ?').bind(cutoff).run();
  } catch {
    // 清理失敗不該讓這一次請求失敗。
  }
}
