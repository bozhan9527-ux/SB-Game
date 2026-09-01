/**
 * 帳號。
 *
 * **伺服器不存任何可以直接拿來用的秘密。** 身分那一把 secret 是客戶端用
 * 「密碼 + 這個帳號的鹽」推導出來的（PBKDF2），伺服器看到的仍然只有它的
 * SHA-256——和匿名時代完全一樣。因此：
 *
 * - 登入 = 用密碼重新推出同一把 secret，下游的存檔與上榜一行都不必改。
 * - 資料庫外洩也拿不到任何人的身分（要先破 PBKDF2）。
 * - 沒有 session、沒有 token、沒有過期，也就沒有那一整套要維護的東西。
 *
 * 代價寫在這裡，不藏起來：**密碼有多強，身分就有多強**，而且沒有 email
 * 就沒有重設密碼。忘記密碼的救援手段是既有的存檔碼——它本來就把身分帶著走。
 */
import type { Env } from './http';
import { fail, isNonEmptyString, json, readJson, timingSafeEqual } from './http';
import { cleanName, nameKey } from '../../src/net/protocol';

interface AccountRow {
  name: string;
  player_id: string;
  salt: string;
  secret_hash: string;
}

/**
 * 註冊要用的鹽。
 *
 * 註冊分兩步是刻意的：客戶端要先拿到鹽才推導得出 secret，而鹽必須由
 * 伺服器決定——讓客戶端自己挑鹽的話，兩個人可以挑同一個，
 * 而鹽的唯一工作就是讓「同樣的密碼在不同帳號上推出不同的 secret」。
 *
 * 這一步同時回答「這個名字有沒有人用了」，所以它也是註冊頁的即時檢查。
 */
export async function accountSalt(
  request: Request,
  env: Env,
  origin: string | null,
): Promise<Response> {
  const body = await readJson(request);
  if (typeof body !== 'object' || body === null) return fail('badRequest', env, origin);
  const record = body as Record<string, unknown>;

  const name = cleanName(record['name']);
  if (name === null) return fail('badRequest', env, origin, '名稱不合法');

  const existing = await env.DB.prepare('SELECT salt FROM accounts WHERE name_key = ?')
    .bind(nameKey(name))
    .first<{ salt: string }>();

  if (existing !== null) {
    return json({ ok: true, salt: existing.salt, taken: true }, env, origin);
  }

  // 還沒有人用這個名字：發一把新的鹽。**不寫進資料庫**——寫了就等於任何人
  // 都能用一個請求佔住任意名稱。真正的佔用發生在 register。
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

  const name = cleanName(record['name']);
  if (name === null) return fail('badRequest', env, origin, '名稱不合法');
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

  const taken = await env.DB.prepare('SELECT name FROM accounts WHERE name_key = ?')
    .bind(key)
    .first<{ name: string }>();
  if (taken !== null) return fail('rejected', env, origin, '這個名字已經有人用了');

  const bound = await env.DB.prepare('SELECT name FROM accounts WHERE player_id = ?')
    .bind(playerId)
    .first<{ name: string }>();
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
    `INSERT INTO accounts (name_key, name, player_id, salt, secret_hash, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(key, name, playerId, salt, secretHash, Date.now())
    .run();

  return json({ ok: true, name, playerId }, env, origin);
}

/**
 * 登入。
 *
 * 客戶端已經用密碼推出 secret 了，這裡只比雜湊——和存檔那條路同一種比對。
 * 回傳的是 player_id：拿到它，客戶端手上就有一組完整的身分，
 * 接下來下載存檔、上榜全部走既有的路。
 */
export async function loginAccount(
  request: Request,
  env: Env,
  origin: string | null,
): Promise<Response> {
  const body = await readJson(request);
  if (typeof body !== 'object' || body === null) return fail('badRequest', env, origin);
  const record = body as Record<string, unknown>;

  const name = cleanName(record['name']);
  if (name === null) return fail('badRequest', env, origin, '名稱不合法');
  if (!isNonEmptyString(record['secretHash'], 128)) {
    return fail('badRequest', env, origin, '缺少密鑰');
  }

  const row = await env.DB.prepare(
    'SELECT name, player_id, salt, secret_hash FROM accounts WHERE name_key = ?',
  )
    .bind(nameKey(name))
    .first<AccountRow>();

  // 帳號不存在和密碼錯誤回同一句話：分開回等於送人一份「哪些名字存在」的名單。
  if (row === null) return fail('unauthorized', env, origin, '名稱或密碼不對');
  if (!timingSafeEqual(row.secret_hash, record['secretHash'])) {
    return fail('unauthorized', env, origin, '名稱或密碼不對');
  }

  return json({ ok: true, name: row.name, playerId: row.player_id }, env, origin);
}

/**
 * 這個身分綁在哪個帳號上。沒綁就是 null。
 *
 * 上榜要看它：**沒有帳號就不上榜**，這是製作人的決定。榜上每一筆都對得到
 * 一個帳號，改名、檢舉、跨裝置才都有意義。
 */
export async function accountOf(env: Env, playerId: string): Promise<string | null> {
  const row = await env.DB.prepare('SELECT name FROM accounts WHERE player_id = ?')
    .bind(playerId)
    .first<{ name: string }>();
  return row === null ? null : row.name;
}
