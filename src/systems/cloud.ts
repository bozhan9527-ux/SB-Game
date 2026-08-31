/**
 * 雲端存檔的客戶端邏輯。
 *
 * 這裡只管「身分」與「哪一份比較新」，實際的 HTTP 在 src/net/client.ts，
 * 畫面在 ArchiveScene。
 */
import { adoptSave } from '../save';
import type { CloudIdentity, SaveData } from '../save/types';

/**
 * 確保有一組身分，沒有就當場產一組。
 *
 * playerId 用 randomUUID，secret 用 32 個位元組的亂數——它等同於密碼，
 * 不能用可預測的東西（例如時間戳或 playerId 的變形）產生。
 */
export function ensureCloudIdentity(save: SaveData): CloudIdentity {
  const existing = save.player.cloud;
  if (existing !== null) return existing;
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const secret = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  const identity: CloudIdentity = { playerId: crypto.randomUUID(), secret, syncedAt: 0 };
  save.player.cloud = identity;
  return identity;
}

/** 兩份存檔誰比較新。用存檔自己帶的 savedAt，不用伺服器的寫入時間。 */
export type Freshness = 'localNewer' | 'cloudNewer' | 'same';

export function compare(localSavedAt: number, cloudSavedAt: number): Freshness {
  if (localSavedAt > cloudSavedAt) return 'localNewer';
  if (localSavedAt < cloudSavedAt) return 'cloudNewer';
  return 'same';
}

/**
 * 把雲端下載回來的那一份套用進來。
 *
 * 走的是 adoptSave——也就是和匯入存檔碼完全相同的遷移與正規化路徑。
 * 雲端那份可能是幾個版本以前上傳的，若這裡自己做一套修補，
 * 兩份規則會各自演化，舊資料遲早會踩到差異。
 */
export function adoptCloudBlob(blob: string, identity: CloudIdentity, now: number): SaveData | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(blob);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
  const next = adoptSave(parsed as Record<string, unknown>, undefined, now);
  // 身分不跟著雲端那份走：那份可能是從別的裝置上傳的，但身分是「這一組帳號」的。
  next.player.cloud = { ...identity, syncedAt: now };
  return next;
}
