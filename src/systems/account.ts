/**
 * 帳號：註冊與登入。
 *
 * **密碼不會離開這台裝置。** 送出去的是「密碼 + 這個帳號的鹽」推導出來的
 * 那一把身分密鑰的 SHA-256，伺服器存的也只有它——和匿名時代的規則完全一樣。
 * 也就是說整套帳號沒有引進任何一種新的秘密，只是把「隨機產生的 secret」
 * 換成「從密碼算出來的 secret」。
 *
 * 三個後果，寫在這裡而不是散在各處：
 *
 * - **登入 = 重新算出同一把 secret**。所以換裝置登入之後，下載存檔、上榜
 *   全部走既有的路，一行都不必改。
 * - **密碼有多強，身分就有多強。** PBKDF2 的迭代數是唯一的緩衝。
 * - **忘記密碼救不回來**（沒有 email）。救援手段是既有的存檔碼——
 *   它本來就把身分整組帶著走。這一點要在註冊畫面上講清楚。
 */
import { accountLogin, accountRegister, accountSalt } from '../net/client';
import type { SaveData } from '../save/types';
import { ensureCloudIdentity } from './cloud';

/**
 * PBKDF2 的迭代數。
 *
 * 這個數字是「使用者願意等多久」和「攻擊者要花多少錢」的對價。
 * 210000 在手機上大約是零點幾秒，是 OWASP 對 PBKDF2-HMAC-SHA256 的建議值。
 * **改了它，所有既有帳號都登不進來**——它是推導的一部分，不是設定。
 */
const ITERATIONS = 210_000;

/** 密碼最短長度。太短的密碼在這套設計裡等於一把弱的身分密鑰。 */
export const MIN_PASSWORD_LENGTH = 8;

function hex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * 密碼 + 鹽 → 身分密鑰。
 *
 * 回傳十六進位字串而不是位元組，是因為既有的身分本來就是字串
 * （存在存檔裡、放進 JSON body），換成別的形狀會動到一整條路徑。
 */
export async function deriveSecret(password: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: encoder.encode(salt), iterations: ITERATIONS, hash: 'SHA-256' },
    key,
    256,
  );
  return hex(bits);
}

export async function sha256(text: string): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
}

export type AccountOutcome =
  | { kind: 'ok'; name: string }
  | { kind: 'failed'; reason: string };

/** 這份存檔有沒有綁帳號。沒綁的人不能上榜。 */
export function hasAccount(save: SaveData): boolean {
  return save.player.account !== null;
}

/**
 * 註冊。
 *
 * **會把現在這個匿名身分收編進帳號**，不是發一個新的：玩家可能已經玩了
 * 幾十關，換一個 playerId 等於把他的雲端存檔孤立掉。
 */
export async function register(
  save: SaveData,
  name: string,
  password: string,
): Promise<AccountOutcome> {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { kind: 'failed', reason: `密碼至少要 ${MIN_PASSWORD_LENGTH} 個字` };
  }
  const identity = ensureCloudIdentity(save);

  const salted = await accountSalt({ name });
  if (!salted.ok) return { kind: 'failed', reason: '連不上伺服器' };
  if (salted.taken) return { kind: 'failed', reason: '這個名字已經有人用了' };

  const secret = await deriveSecret(password, salted.salt);
  const result = await accountRegister({
    name,
    playerId: identity.playerId,
    salt: salted.salt,
    secretHash: await sha256(secret),
    // 雲端已經有這份存檔的話，要先證明是本人。舊的那把密鑰就是證明。
    oldSecretHash: await sha256(identity.secret),
  });
  if (!result.ok) {
    return { kind: 'failed', reason: result.detail ?? '註冊沒有成功' };
  }

  // 身分的密鑰換成密碼推導出來的那一把——伺服器那邊已經同步改過了。
  identity.secret = secret;
  save.player.account = { name: result.name, salt: salted.salt };
  save.player.name = result.name;
  return { kind: 'ok', name: result.name };
}

/**
 * 登入。
 *
 * 拿回來的是 playerId；secret 是自己用密碼算的，伺服器從來沒有它。
 * **這裡只換身分，不動進度**——把雲端那份存檔拉下來是另一個明確的動作，
 * 蓋掉本機進度這種事不該藏在「登入」兩個字底下。
 */
export async function login(
  save: SaveData,
  name: string,
  password: string,
): Promise<AccountOutcome> {
  const salted = await accountSalt({ name });
  if (!salted.ok) return { kind: 'failed', reason: '連不上伺服器' };
  // 名字沒人用過就一定不是這個帳號的鹽，密碼再對也算不出同一把密鑰。
  if (!salted.taken) return { kind: 'failed', reason: '名稱或密碼不對' };

  const secret = await deriveSecret(password, salted.salt);
  const result = await accountLogin({ name, secretHash: await sha256(secret) });
  if (!result.ok) {
    return { kind: 'failed', reason: result.detail ?? '名稱或密碼不對' };
  }

  const identity = ensureCloudIdentity(save);
  identity.playerId = result.playerId;
  identity.secret = secret;
  identity.syncedAt = 0;
  save.player.account = { name: result.name, salt: salted.salt };
  save.player.name = result.name;
  return { kind: 'ok', name: result.name };
}
