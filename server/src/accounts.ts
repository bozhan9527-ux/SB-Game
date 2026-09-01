/**
 * 帳號。
 *
 * **帳號是電子信箱，道號只負責顯示。** 兩者分開的理由：登入要的是一個唯一、
 * 記得住、而且能拿來找回帳號的東西（信箱正好是這三樣），而榜上要的是一個
 * 看得順眼的名字。綁在一起的話，改個名就變成換一個帳號。
 *
 * **伺服器不存任何可以直接拿來用的秘密。** 身分那一把 secret 是客戶端用
 * 「密碼 + 這個帳號的鹽」推導出來的（PBKDF2），伺服器看到的仍然只有它的
 * SHA-256——和匿名時代完全一樣。因此：
 *
 * - 登入 = 用密碼重新推出同一把 secret，下游的存檔與上榜一行都不必改。
 * - 資料庫外洩也拿不到任何人的身分（要先破 PBKDF2）。
 * - 沒有 session、沒有 token、沒有過期，也就沒有那一整套要維護的東西。
 *
 * 信箱是**這個專案唯一存下來的個人資料**，而且只有一個用途：
 * 忘記密碼時寄一組驗證碼過去。
 */
import type { Env } from './http';
import { fail, isNonEmptyString, json, readJson, sha256, timingSafeEqual } from './http';
import {
  ANSWER_LOCK_MS,
  MAX_ANSWER_ATTEMPTS,
  RECOVERY_CODE_LENGTH,
  RECOVERY_TTL_MS,
  cleanEmail,
  cleanName,
  cleanQuestion,
  nameKey,
} from '../../src/net/protocol';
import { sendRecoveryMail } from './mail';

interface AccountRow {
  email: string;
  name: string;
  player_id: string;
  salt: string;
  secret_hash: string;
}

/**
 * 註冊要用的鹽，順便回答「這個信箱註冊過了沒」。
 *
 * 鹽必須由伺服器決定：讓客戶端自己挑的話，兩個人可以挑同一個，
 * 而鹽的唯一工作就是讓「同樣的密碼在不同帳號上推出不同的 secret」。
 *
 * 登入也走這一支——它要先拿到鹽才算得出密鑰。
 */
export async function accountSalt(
  request: Request,
  env: Env,
  origin: string | null,
): Promise<Response> {
  const body = await readJson(request);
  if (typeof body !== 'object' || body === null) return fail('badRequest', env, origin);
  const record = body as Record<string, unknown>;

  const email = cleanEmail(record['email']);
  if (email === null) return fail('badRequest', env, origin, '電子信箱不合法');

  const existing = await env.DB.prepare('SELECT salt FROM accounts WHERE email = ?')
    .bind(email)
    .first<{ salt: string }>();

  if (existing !== null) {
    return json({ ok: true, salt: existing.salt, taken: true }, env, origin);
  }

  // 還沒註冊：發一把新的鹽。**不寫進資料庫**——寫了就等於任何人都能用一個
  // 請求佔住任意信箱。真正的佔用發生在 register。
  const salt = crypto.randomUUID().replace(/-/g, '');
  return json({ ok: true, salt, taken: false }, env, origin);
}

/**
 * 註冊。
 *
 * **會把呼叫者現在的匿名身分收編過來**，而不是發一個新的：玩家可能已經玩了
 * 幾十關，換一個 player_id 等於把他的雲端存檔和榜上那一筆孤立掉。
 * 因此要先證明他真的是那個匿名身分的主人——規則和 putSave 一模一樣：
 * 雲端沒有那一份就放行，有就要密鑰對得上。
 */
export async function registerAccount(
  request: Request,
  env: Env,
  origin: string | null,
): Promise<Response> {
  const body = await readJson(request);
  if (body === 'tooLarge') return fail('tooLarge', env, origin);
  if (typeof body !== 'object' || body === null) return fail('badRequest', env, origin);
  const record = body as Record<string, unknown>;

  const email = cleanEmail(record['email']);
  if (email === null) return fail('badRequest', env, origin, '電子信箱不合法');
  const name = cleanName(record['name']);
  if (name === null) return fail('badRequest', env, origin, '道號不合法');
  if (!isNonEmptyString(record['playerId'], 64)) return fail('badRequest', env, origin, '缺少身分');
  if (!isNonEmptyString(record['salt'], 64)) return fail('badRequest', env, origin, '缺少鹽');
  // 新的 secret 是客戶端用密碼推導出來的，這裡只收它的雜湊。
  if (!isNonEmptyString(record['secretHash'], 128)) {
    return fail('badRequest', env, origin, '缺少密鑰');
  }

  const playerId = record['playerId'];
  const salt = record['salt'];
  const secretHash = record['secretHash'];
  const key = nameKey(name);

  const taken = await env.DB.prepare('SELECT email FROM accounts WHERE email = ?')
    .bind(email)
    .first<{ email: string }>();
  if (taken !== null) return fail('rejected', env, origin, '這個信箱已經註冊過了');

  // 道號也唯一。榜上兩個一模一樣的名字，等於誰都能冒充誰。
  const dupName = await env.DB.prepare('SELECT name FROM accounts WHERE name_key = ?')
    .bind(key)
    .first<{ name: string }>();
  if (dupName !== null) return fail('rejected', env, origin, '這個道號已經有人用了');

  const bound = await env.DB.prepare('SELECT email FROM accounts WHERE player_id = ?')
    .bind(playerId)
    .first<{ email: string }>();
  if (bound !== null) return fail('rejected', env, origin, '這個身分已經綁過帳號了');

  // 收編既有的匿名身分：雲端已經有這一份存檔的話，要先證明他是主人。
  const save = await env.DB.prepare('SELECT secret_hash FROM saves WHERE player_id = ?')
    .bind(playerId)
    .first<{ secret_hash: string }>();
  if (save !== null) {
    const oldHash = record['oldSecretHash'];
    if (!isNonEmptyString(oldHash, 128) || !timingSafeEqual(save.secret_hash, oldHash)) {
      return fail('unauthorized', env, origin, '這個身分的密鑰對不上');
    }
    // 身分的密鑰換成密碼推導出來的那一把，雲端存檔跟著改。
    await env.DB.prepare('UPDATE saves SET secret_hash = ? WHERE player_id = ?')
      .bind(secretHash, playerId)
      .run();
  }

  await env.DB.prepare(
    `INSERT INTO accounts (email, name, name_key, player_id, salt, secret_hash, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(email, name, key, playerId, salt, secretHash, Date.now())
    .run();

  return json({ ok: true, name, playerId }, env, origin);
}

/**
 * 登入。
 *
 * 客戶端已經用密碼推出 secret 了，這裡只比雜湊——和存檔那條路同一種比對。
 * 回傳 player_id 與道號：拿到它們，客戶端手上就有一組完整的身分。
 */
export async function loginAccount(
  request: Request,
  env: Env,
  origin: string | null,
): Promise<Response> {
  const body = await readJson(request);
  if (typeof body !== 'object' || body === null) return fail('badRequest', env, origin);
  const record = body as Record<string, unknown>;

  const email = cleanEmail(record['email']);
  if (email === null) return fail('badRequest', env, origin, '電子信箱不合法');
  if (!isNonEmptyString(record['secretHash'], 128)) {
    return fail('badRequest', env, origin, '缺少密鑰');
  }

  const row = await env.DB.prepare(
    'SELECT email, name, player_id, salt, secret_hash FROM accounts WHERE email = ?',
  )
    .bind(email)
    .first<AccountRow>();

  // 帳號不存在和密碼錯誤回同一句話：分開回等於送人一份「哪些信箱註冊過」的名單。
  if (row === null) return fail('unauthorized', env, origin, '信箱或密碼不對');
  if (!timingSafeEqual(row.secret_hash, record['secretHash'])) {
    return fail('unauthorized', env, origin, '信箱或密碼不對');
  }

  return json({ ok: true, name: row.name, playerId: row.player_id }, env, origin);
}

/**
 * 改道號。
 *
 * 帳號是信箱，所以改名只動顯示用的那一欄——身分、進度、雲端存檔全部不動。
 * 榜單那幾列存的是當時的名字，這裡一併改過去：不然改完名還要再破一次
 * 自己的紀錄才看得到，那是上一版就被嫌過的事。
 */
export async function renameAccount(
  request: Request,
  env: Env,
  origin: string | null,
): Promise<Response> {
  const body = await readJson(request);
  if (typeof body !== 'object' || body === null) return fail('badRequest', env, origin);
  const record = body as Record<string, unknown>;

  if (!isNonEmptyString(record['playerId'], 64) || !isNonEmptyString(record['secret'], 128)) {
    return fail('badRequest', env, origin, '缺少身分');
  }
  const name = cleanName(record['name']);
  if (name === null) return fail('badRequest', env, origin, '道號不合法');
  const playerId = record['playerId'];
  const key = nameKey(name);

  const row = await env.DB.prepare('SELECT secret_hash FROM accounts WHERE player_id = ?')
    .bind(playerId)
    .first<{ secret_hash: string }>();
  if (row === null) return fail('unauthorized', env, origin, '沒有這個帳號');
  if (!timingSafeEqual(row.secret_hash, await sha256(record['secret']))) {
    return fail('unauthorized', env, origin, '密鑰對不上');
  }

  const dup = await env.DB.prepare(
    'SELECT player_id FROM accounts WHERE name_key = ? AND player_id != ?',
  )
    .bind(key, playerId)
    .first<{ player_id: string }>();
  if (dup !== null) return fail('rejected', env, origin, '這個道號已經有人用了');

  await env.DB.prepare('UPDATE accounts SET name = ?, name_key = ? WHERE player_id = ?')
    .bind(name, key, playerId)
    .run();
  await env.DB.prepare('UPDATE board_runs SET name = ? WHERE player_id = ?')
    .bind(name, playerId)
    .run();

  return json({ ok: true, name, playerId }, env, origin);
}

/**
 * 忘記密碼：寄一組驗證碼到註冊時留的信箱。
 *
 * **回應永遠是成功**，不管那個信箱有沒有註冊過。分開回等於送人一份
 * 「哪些信箱註冊過」的查詢工具——那是這個端點唯一的濫用方式。
 *
 * 驗證碼只存雜湊，和密碼同一種待遇：資料庫外洩也不能拿它去重設別人的密碼。
 */
export async function requestRecovery(
  request: Request,
  env: Env,
  origin: string | null,
): Promise<Response> {
  const body = await readJson(request);
  if (typeof body !== 'object' || body === null) return fail('badRequest', env, origin);
  const record = body as Record<string, unknown>;

  const email = cleanEmail(record['email']);
  if (email === null) return fail('badRequest', env, origin, '電子信箱不合法');

  const row = await env.DB.prepare('SELECT name FROM accounts WHERE email = ?')
    .bind(email)
    .first<{ name: string }>();

  if (row !== null) {
    const digits = crypto.getRandomValues(new Uint32Array(1))[0] ?? 0;
    const code = String(digits).padStart(RECOVERY_CODE_LENGTH, '0').slice(-RECOVERY_CODE_LENGTH);
    await env.DB.prepare('UPDATE accounts SET reset_hash = ?, reset_at = ? WHERE email = ?')
      .bind(await sha256(code), Date.now(), email)
      .run();
    await sendRecoveryMail(env, email, row.name, code);
  }

  return json({ ok: true }, env, origin);
}

/**
 * 用驗證碼設一組新密碼。
 *
 * 新的身分密鑰同樣是客戶端用新密碼推出來的，伺服器只收雜湊——
 * **重設密碼不會動到任何進度**：雲端存檔那一列只換密鑰，內容原封不動。
 */
export async function resetPassword(
  request: Request,
  env: Env,
  origin: string | null,
): Promise<Response> {
  const body = await readJson(request);
  if (typeof body !== 'object' || body === null) return fail('badRequest', env, origin);
  const record = body as Record<string, unknown>;

  const email = cleanEmail(record['email']);
  if (email === null) return fail('badRequest', env, origin, '電子信箱不合法');
  if (!isNonEmptyString(record['code'], 16)) return fail('badRequest', env, origin, '缺少驗證碼');
  if (!isNonEmptyString(record['secretHash'], 128)) {
    return fail('badRequest', env, origin, '缺少密鑰');
  }

  const row = await env.DB.prepare(
    'SELECT name, player_id, salt, reset_hash, reset_at FROM accounts WHERE email = ?',
  )
    .bind(email)
    .first<{
      name: string;
      player_id: string;
      salt: string;
      reset_hash: string | null;
      reset_at: number | null;
    }>();

  // 三種失敗回同一句話：沒有這個帳號、驗證碼不對、驗證碼過期。
  if (row === null || row.reset_hash === null || row.reset_at === null) {
    return fail('unauthorized', env, origin, '驗證碼不對或已經過期');
  }
  if (Date.now() - row.reset_at > RECOVERY_TTL_MS) {
    return fail('unauthorized', env, origin, '驗證碼不對或已經過期');
  }
  if (!timingSafeEqual(row.reset_hash, await sha256(record['code']))) {
    return fail('unauthorized', env, origin, '驗證碼不對或已經過期');
  }

  const secretHash = record['secretHash'];
  // 用掉就作廢：一組驗證碼只能設一次密碼。
  await env.DB.prepare(
    'UPDATE accounts SET secret_hash = ?, reset_hash = NULL, reset_at = NULL WHERE email = ?',
  )
    .bind(secretHash, email)
    .run();
  await env.DB.prepare('UPDATE saves SET secret_hash = ? WHERE player_id = ?')
    .bind(secretHash, row.player_id)
    .run();

  return json({ ok: true, name: row.name, playerId: row.player_id }, env, origin);
}

/**
 * 這個身分綁在哪個帳號上，回傳它的道號。沒綁就是 null。
 *
 * 上榜要看它：**沒有帳號就不上榜**。榜上每一筆都對得到一個帳號，
 * 改名、檢舉、跨裝置才都有意義。
 */
export async function accountOf(env: Env, playerId: string): Promise<string | null> {
  const row = await env.DB.prepare('SELECT name FROM accounts WHERE player_id = ?')
    .bind(playerId)
    .first<{ name: string }>();
  return row === null ? null : row.name;
}

/**
 * 設定（或更換）救援問題。
 *
 * 要先證明是本人——用現在的身分密鑰，和改道號同一種比對。所以這件事
 * **只有登入中的人做得到**，不是一支任何人都能打的端點。
 *
 * 答案的密鑰是客戶端推的，這裡一樣只收雜湊。伺服器從頭到尾不知道答案是什麼，
 * 也就無從「把密碼顯示出來」——那正是這套設計的重點。
 */
export async function setRecoveryQuestion(
  request: Request,
  env: Env,
  origin: string | null,
): Promise<Response> {
  const body = await readJson(request);
  if (typeof body !== 'object' || body === null) return fail('badRequest', env, origin);
  const record = body as Record<string, unknown>;

  if (!isNonEmptyString(record['playerId'], 64) || !isNonEmptyString(record['secret'], 128)) {
    return fail('badRequest', env, origin, '缺少身分');
  }
  const question = cleanQuestion(record['question']);
  if (question === null) return fail('badRequest', env, origin, '問題不合法');
  if (!isNonEmptyString(record['answerHash'], 128)) {
    return fail('badRequest', env, origin, '缺少答案');
  }

  const row = await env.DB.prepare('SELECT email, secret_hash FROM accounts WHERE player_id = ?')
    .bind(record['playerId'])
    .first<{ email: string; secret_hash: string }>();
  if (row === null) return fail('unauthorized', env, origin, '沒有這個帳號');
  if (!timingSafeEqual(row.secret_hash, await sha256(record['secret']))) {
    return fail('unauthorized', env, origin, '密鑰對不上');
  }

  // 換一個新問題時把猜錯次數與鎖一起清掉：那些是舊答案的帳，
  // 留著等於讓上一次被人亂猜的紀錄繼續懲罰他。
  await env.DB.prepare(
    `INSERT INTO account_recovery (email, question, answer_hash, attempts, locked_at, set_at)
     VALUES (?, ?, ?, 0, NULL, ?)
     ON CONFLICT(email) DO UPDATE SET question = excluded.question,
                                      answer_hash = excluded.answer_hash,
                                      attempts = 0,
                                      locked_at = NULL,
                                      set_at = excluded.set_at`,
  )
    .bind(row.email, question, record['answerHash'], Date.now())
    .run();

  return json({ ok: true, question }, env, origin);
}

/**
 * 問這個信箱的救援問題是什麼。
 *
 * **沒有帳號、和有帳號但沒設問題，回的是同一個 null。** 分開回等於在這一支
 * 上多開一個「哪些信箱註冊過」的查詢工具。
 */
export async function recoveryQuestion(
  request: Request,
  env: Env,
  origin: string | null,
): Promise<Response> {
  const body = await readJson(request);
  if (typeof body !== 'object' || body === null) return fail('badRequest', env, origin);
  const record = body as Record<string, unknown>;

  const email = cleanEmail(record['email']);
  if (email === null) return fail('badRequest', env, origin, '電子信箱不合法');

  const row = await env.DB.prepare('SELECT question FROM account_recovery WHERE email = ?')
    .bind(email)
    .first<{ question: string }>();

  return json({ ok: true, question: row?.question ?? null }, env, origin);
}

/**
 * 答對問題，設一組新密碼。
 *
 * **答對拿到的是「設一組新的」，不是「看到舊的」。** 舊密碼在這個系統裡
 * 從來沒有存在過——存的只有它推導出來的密鑰的雜湊。要顯示密碼就得反過來
 * 存一份可還原的，那等於資料庫外洩就是所有人的密碼外流；而玩家會重複用密碼，
 * 傷害會跑到這個遊戲以外的地方去。
 *
 * 猜錯次數的上限是這裡唯一真正的煞車，見 MAX_ANSWER_ATTEMPTS。
 */
export async function resetByAnswer(
  request: Request,
  env: Env,
  origin: string | null,
): Promise<Response> {
  const body = await readJson(request);
  if (typeof body !== 'object' || body === null) return fail('badRequest', env, origin);
  const record = body as Record<string, unknown>;

  const email = cleanEmail(record['email']);
  if (email === null) return fail('badRequest', env, origin, '電子信箱不合法');
  if (!isNonEmptyString(record['answerHash'], 128)) {
    return fail('badRequest', env, origin, '缺少答案');
  }
  if (!isNonEmptyString(record['secretHash'], 128)) {
    return fail('badRequest', env, origin, '缺少密鑰');
  }

  const row = await env.DB.prepare(
    'SELECT answer_hash, attempts, locked_at FROM account_recovery WHERE email = ?',
  )
    .bind(email)
    .first<{ answer_hash: string; attempts: number; locked_at: number | null }>();
  const account = await env.DB.prepare(
    'SELECT email, name, player_id, salt, secret_hash FROM accounts WHERE email = ?',
  )
    .bind(email)
    .first<AccountRow>();

  // 沒有帳號、沒設問題、答案不對——三種一律同一句話。
  if (row === null || account === null) {
    return fail('unauthorized', env, origin, '答案不對');
  }

  const now = Date.now();
  // 鎖還在有效期內就直接擋掉，連比對都不做。
  if (row.locked_at !== null && now - row.locked_at < ANSWER_LOCK_MS) {
    const minutes = Math.max(1, Math.ceil((ANSWER_LOCK_MS - (now - row.locked_at)) / 60000));
    return fail('rejected', env, origin, `猜錯太多次了，${minutes} 分鐘後再試`);
  }
  // 鎖過期了就把帳一併清掉，重新給滿次數。
  const attempts = row.locked_at !== null ? 0 : row.attempts;

  if (!timingSafeEqual(row.answer_hash, record['answerHash'])) {
    const next = attempts + 1;
    const locked = next >= MAX_ANSWER_ATTEMPTS;
    await env.DB.prepare('UPDATE account_recovery SET attempts = ?, locked_at = ? WHERE email = ?')
      .bind(locked ? 0 : next, locked ? now : null, email)
      .run();
    if (locked) {
      const minutes = Math.ceil(ANSWER_LOCK_MS / 60000);
      return fail('rejected', env, origin, `猜錯太多次了，${minutes} 分鐘後再試`);
    }
    return fail('unauthorized', env, origin, '答案不對');
  }

  // 答對了。**只換密鑰，進度一個位元組都不動。**
  await env.DB.prepare('UPDATE accounts SET secret_hash = ? WHERE email = ?')
    .bind(record['secretHash'], email)
    .run();
  await env.DB.prepare('UPDATE saves SET secret_hash = ? WHERE player_id = ?')
    .bind(record['secretHash'], account.player_id)
    .run();
  await env.DB.prepare(
    'UPDATE account_recovery SET attempts = 0, locked_at = NULL WHERE email = ?',
  )
    .bind(email)
    .run();

  return json({ ok: true, name: account.name, playerId: account.player_id }, env, origin);
}
