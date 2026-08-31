/**
 * 雲端存檔。
 *
 * **這是整個後端裡唯一沒有對抗面的一塊**：它只是「把一包 JSON 存起來、
 * 憑一把 token 取回」。存檔結構從第一天就設計成單一可序列化物件
 * （TECH_SPEC 第 9 節），所以這裡不必拆欄位，也就不會有前後端算法不一致的問題。
 *
 * 身分是匿名的：客戶端自己產一組 playerId + secret，兩者都存在存檔裡，
 * 因此**已經做好的存檔碼順便就是雲端身分的救援手段**——換裝置貼碼回來，
 * 身分跟著回來。要到真的上架才需要正式的帳號系統。
 */
import type { Env } from './http';
import { fail, isNonEmptyString, json, readJson, sha256, timingSafeEqual } from './http';
import type { SaveGetResult, SavePutResult } from '../../src/net/protocol';
import { MAX_BLOB_BYTES } from '../../src/net/protocol';

interface Row {
  secret_hash: string;
  blob: string;
  saved_at: number;
}

function identityOf(body: unknown): { playerId: string; secret: string } | null {
  if (typeof body !== 'object' || body === null) return null;
  const record = body as Record<string, unknown>;
  if (!isNonEmptyString(record['playerId'], 64)) return null;
  if (!isNonEmptyString(record['secret'], 128)) return null;
  return { playerId: record['playerId'], secret: record['secret'] };
}

/**
 * 上傳。第一次上傳等於註冊，之後每一次都要對得上同一把 secret。
 *
 * 沒有「註冊」這個獨立步驟是刻意的：多一步就多一個會失敗、會卡住玩家的地方，
 * 而它換不到任何東西——第一次寫入時把雜湊記下來，效果完全一樣。
 */
export async function putSave(request: Request, env: Env, origin: string | null): Promise<Response> {
  const body = await readJson(request);
  if (body === 'tooLarge') return fail('tooLarge', env, origin);
  if (body === 'badRequest') return fail('badRequest', env, origin);
  const identity = identityOf(body);
  if (identity === null) return fail('badRequest', env, origin, '缺少 playerId 或 secret');

  const record = body as Record<string, unknown>;
  const blob = record['blob'];
  const savedAt = record['savedAt'];
  if (typeof blob !== 'string' || blob.length === 0) return fail('badRequest', env, origin, 'blob 不合法');
  if (blob.length > MAX_BLOB_BYTES) return fail('tooLarge', env, origin);
  if (typeof savedAt !== 'number' || !Number.isFinite(savedAt)) {
    return fail('badRequest', env, origin, 'savedAt 不合法');
  }

  const hash = await sha256(identity.secret);
  const existing = await env.DB.prepare('SELECT secret_hash, blob, saved_at FROM saves WHERE player_id = ?')
    .bind(identity.playerId)
    .first<Row>();

  if (existing !== null && !timingSafeEqual(existing.secret_hash, hash)) {
    return fail('unauthorized', env, origin);
  }

  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO saves (player_id, secret_hash, blob, saved_at, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(player_id) DO UPDATE SET blob = excluded.blob,
                                          saved_at = excluded.saved_at,
                                          updated_at = excluded.updated_at`,
  )
    .bind(identity.playerId, hash, blob, Math.floor(savedAt), now)
    .run();

  return json<SavePutResult>({ ok: true, savedAt: Math.floor(savedAt) }, env, origin);
}

/** 下載。找不到不是錯誤，是「這個身分還沒上傳過」。 */
export async function getSave(request: Request, env: Env, origin: string | null): Promise<Response> {
  const body = await readJson(request);
  if (body === 'tooLarge') return fail('tooLarge', env, origin);
  if (body === 'badRequest') return fail('badRequest', env, origin);
  const identity = identityOf(body);
  if (identity === null) return fail('badRequest', env, origin, '缺少 playerId 或 secret');

  const row = await env.DB.prepare('SELECT secret_hash, blob, saved_at FROM saves WHERE player_id = ?')
    .bind(identity.playerId)
    .first<Row>();
  if (row === null) return fail('notFound', env, origin);

  const hash = await sha256(identity.secret);
  if (!timingSafeEqual(row.secret_hash, hash)) return fail('unauthorized', env, origin);

  return json<SaveGetResult>({ ok: true, blob: row.blob, savedAt: row.saved_at }, env, origin);
}
