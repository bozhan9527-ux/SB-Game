/**
 * 存檔的匯出與匯入碼。
 *
 * **為什麼是一串碼而不是雲端。** 存檔目前只在 localStorage：清快取或換一支手機就全沒了，
 * 而這個遊戲的進度是以「幾十個小時」為單位的。真正的解法是雲端存檔，但那需要一個
 * 這個專案還沒有的後端。在那之前，一串可以自己貼到記事本、傳給自己的碼，
 * 就足以把「一次誤觸清掉一百小時」這個最貴的失敗擋掉。
 *
 * 存檔結構本來就設計成單一可序列化物件（TECH_SPEC 第 4 節），所以這裡只做三件事：
 * 轉字串、轉 base64、加一段校驗碼。
 *
 * 校驗碼不是為了防作弊——存檔在玩家自己的機器上，防不了也沒必要防。
 * 它防的是**貼漏了**：從聊天視窗複製一串幾千字的碼，少貼最後一行是很常見的事，
 * 而一個被截斷的存檔會安靜地變成一個壞掉的進度。
 */
import type { SaveData } from './types';

/** 碼的前綴。日後格式若變，靠它分辨。 */
const PREFIX = 'XX1';
const SEPARATOR = '.';

export type ImportResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; reason: string };

function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(code: string): string {
  const binary = atob(code);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** FNV-1a。夠短、夠快，而且不需要任何相依——它只要抓得到「少了一段」就夠了。 */
function checksum(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36).padStart(7, '0');
}

export function exportCode(save: SaveData): string {
  const body = toBase64(JSON.stringify(save));
  return `${PREFIX}${SEPARATOR}${checksum(body)}${SEPARATOR}${body}`;
}

/**
 * 把碼還原成存檔物件。
 *
 * 回傳的是**未正規化的原始物件**，交給 loadSave 那條既有的路徑去遷移與補齊——
 * 這裡若自己做一套修補，就會有兩份規則各自演化，而舊版本的碼遲早會踩到差異。
 */
export function importCode(raw: string): ImportResult {
  const code = raw.trim().replace(/\s+/g, '');
  if (code.length === 0) return { ok: false, reason: '沒有輸入任何內容' };

  const parts = code.split(SEPARATOR);
  if (parts.length !== 3 || parts[0] !== PREFIX) {
    return { ok: false, reason: '這不是本遊戲的存檔碼' };
  }
  const [, sum, body] = parts;
  if (sum === undefined || body === undefined) return { ok: false, reason: '存檔碼格式不完整' };
  if (checksum(body) !== sum) return { ok: false, reason: '存檔碼不完整或被改過——請確認整串都貼上了' };

  let text: string;
  try {
    text = fromBase64(body);
  } catch {
    return { ok: false, reason: '存檔碼解不開' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, reason: '存檔內容不是合法的資料' };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, reason: '存檔內容不是合法的資料' };
  }
  return { ok: true, data: parsed as Record<string, unknown> };
}
