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
  RECOVERY_CODE_LENGTH,
  RECOVERY_TTL_MS,
  cleanEmail,
  cleanName,
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
