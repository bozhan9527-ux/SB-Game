/**
 * 帳號：註冊與登入。
 *
 * **密碼不會離開這台裝置。** 送出去的是「密碼 + 這個帳號的鹽」推導出來的
 * 那一把身分密鑰的 SHA-256，伺服器存的也只有它——和匿名時代的規則完全一樣。
 * 也就是說整套帳號沒有引進任何一種新的秘密，只是把「隨機產生的 secret」
 * 換成「從密碼算出來的 secret」。
 *
 * **帳號是電子信箱，道號只負責顯示。** 登入要的是一個唯一、記得住、
 * 能拿來找回帳號的東西；榜上要的是一個看得順眼的名字。綁在一起的話，
 * 改個名就變成換一個帳號。
 *
 * 兩個後果，寫在這裡而不是散在各處：
 *
 * - **登入 = 重新算出同一把 secret**。所以換裝置登入之後，下載存檔、上榜
 *   全部走既有的路，一行都不必改。
 * - **密碼有多強，身分就有多強。** PBKDF2 的迭代數是唯一的緩衝，
 *   而忘記密碼是靠信箱收驗證碼救回來的。
 */
import {
  accountAnswerReset,
  accountLogin,
  accountQuestion,
  accountRecover,
  accountRegister,
  accountRename,
  accountReset,
  accountSalt,
  accountSetQuestion,
} from '../net/client';
import {
  ANSWER_PREFIX,
  MAX_QUESTION_LENGTH,
  MIN_ANSWER_LENGTH,
  cleanAnswer,
  cleanEmail,
  cleanQuestion,
} from '../net/protocol';
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
  email: string,
  name: string,
  password: string,
): Promise<AccountOutcome> {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { kind: 'failed', reason: `密碼至少要 ${MIN_PASSWORD_LENGTH} 個字` };
  }
  const cleaned = cleanEmail(email);
  if (cleaned === null) return { kind: 'failed', reason: '電子信箱看起來不對' };
  const identity = ensureCloudIdentity(save);

  const salted = await accountSalt({ email: cleaned });
  if (!salted.ok) return { kind: 'failed', reason: '連不上伺服器' };
  // 這裡原本先問一次「這個信箱註冊過了沒」再決定要不要往下走。拿掉了：
  // 那個問題本身就是一支任何人都能打的帳號查詢工具（見 AccountSaltResult）。
  // 伺服器的 register 本來就會回一模一樣的那句話，前端這一步只省了一次
  // PBKDF2——兩百毫秒，換一份全體玩家的信箱名單，不划算。

  const secret = await deriveSecret(password, salted.salt);
  const result = await accountRegister({
    name,
    email: cleaned,
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
  save.player.account = { email: cleaned, name: result.name, salt: salted.salt };
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
  email: string,
  password: string,
): Promise<AccountOutcome> {
  const cleaned = cleanEmail(email);
  if (cleaned === null) return { kind: 'failed', reason: '電子信箱看起來不對' };

  const salted = await accountSalt({ email: cleaned });
  if (!salted.ok) return { kind: 'failed', reason: '連不上伺服器' };
  // 沒註冊過的信箱拿到的是一把假鹽，密碼再對也算不出伺服器存的那把密鑰，
  // 所以下面的 login 一定會失敗，而且失敗的那句話和密碼錯誤完全一樣。
  // **這正是不在這裡提前判斷的原因**——提前判斷要先問伺服器
  // 「這個信箱註冊過了沒」，而那句話就是洩漏本身。

  const secret = await deriveSecret(password, salted.salt);
  const result = await accountLogin({ email: cleaned, secretHash: await sha256(secret) });
  if (!result.ok) {
    return { kind: 'failed', reason: result.detail ?? '信箱或密碼不對' };
  }

  const identity = ensureCloudIdentity(save);
  identity.playerId = result.playerId;
  identity.secret = secret;
  identity.syncedAt = 0;
  save.player.account = { email: cleaned, name: result.name, salt: salted.salt };
  save.player.name = result.name;
  return { kind: 'ok', name: result.name };
}

/**
 * 忘記密碼：請伺服器寄一組驗證碼。
 *
 * **成功與否和帳號存不存在無關**，即使那個帳號不存在也回成功——伺服器那邊
 * 也是同一個規則。分開回等於送人一份「哪些信箱有註冊」的查詢工具。
 *
 * mail 是另一回事：**這台伺服器有沒有開通寄信**。沒開通的話，
 * 呼叫端要說一句誠實的「這條路目前走不通」，而不是「驗證碼已經在路上了」
 * 然後讓玩家等一封永遠不會到的信。
 */
export async function requestRecovery(
  email: string,
): Promise<{ kind: 'ok'; mail: boolean } | { kind: 'failed'; reason: string }> {
  const cleaned = cleanEmail(email);
  if (cleaned === null) return { kind: 'failed', reason: '電子信箱看起來不對' };
  const result = await accountRecover({ email: cleaned });
  if (!result.ok) return { kind: 'failed', reason: result.detail ?? '連不上伺服器' };
  // 舊版伺服器沒有這個欄位。把 undefined 當成「有開通」——多問一次總比
  // 對著一個其實正常的部署說「走不通」好。
  return { kind: 'ok', mail: result.mail !== false };
}

/**
 * 用驗證碼設一組新密碼，順便登入。
 *
 * 新的身分密鑰一樣是用新密碼推出來的。**進度不會有任何變化**：
 * 雲端存檔那一列只換密鑰，內容原封不動。
 */
export async function resetPassword(
  save: SaveData,
  email: string,
  code: string,
  password: string,
): Promise<AccountOutcome> {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { kind: 'failed', reason: `密碼至少要 ${MIN_PASSWORD_LENGTH} 個字` };
  }
  const cleaned = cleanEmail(email);
  if (cleaned === null) return { kind: 'failed', reason: '電子信箱看起來不對' };

  const salted = await accountSalt({ email: cleaned });
  if (!salted.ok) return { kind: 'failed', reason: '連不上伺服器' };
  // 不提前判斷「這個信箱註冊過了沒」——見 login 那一段。沒註冊的信箱
  // 走到底會拿到「驗證碼不對或已經過期」，和真的打錯驗證碼一模一樣。

  // 鹽不變，所以新密碼推出來的密鑰和伺服器接下來要存的是同一把。
  const secret = await deriveSecret(password, salted.salt);
  const result = await accountReset({
    email: cleaned,
    code: code.trim(),
    secretHash: await sha256(secret),
  });
  if (!result.ok) return { kind: 'failed', reason: result.detail ?? '驗證碼不對或已經過期' };

  const identity = ensureCloudIdentity(save);
  identity.playerId = result.playerId;
  identity.secret = secret;
  identity.syncedAt = 0;
  save.player.account = { email: cleaned, name: result.name, salt: salted.salt };
  save.player.name = result.name;
  return { kind: 'ok', name: result.name };
}

/**
 * 改道號。
 *
 * 帳號是信箱，所以這裡只動顯示用的名字——身分、進度、雲端存檔全部不變，
 * 而且榜上那幾列會跟著改掉，不必再破一次自己的紀錄。
 */
export async function rename(save: SaveData, name: string): Promise<AccountOutcome> {
  const account = save.player.account;
  if (account === null) return { kind: 'failed', reason: '還沒註冊' };
  const identity = ensureCloudIdentity(save);
  const result = await accountRename({
    playerId: identity.playerId,
    secret: identity.secret,
    name,
  });
  if (!result.ok) return { kind: 'failed', reason: result.detail ?? '改名沒有成功' };
  save.player.account = { ...account, name: result.name };
  save.player.name = result.name;
  return { kind: 'ok', name: result.name };
}

/**
 * 從答案推出那一把救援密鑰。
 *
 * 和密碼**完全同一條路**（PBKDF2 + 帳號的鹽），只差一個前綴。
 * 前綴是域分離：沒有它的話，有人把答案設成和密碼一樣的字，
 * 兩把密鑰就會一模一樣——猜中答案等於直接拿到身分本身。
 */
async function answerSecret(answer: string, salt: string): Promise<string> {
  const cleaned = cleanAnswer(answer);
  if (cleaned === null) return '';
  return deriveSecret(ANSWER_PREFIX + cleaned, salt);
}

/**
 * 設定或更換救援問題。
 *
 * 要先登入（身分密鑰就是證明），所以這是「已經進得去的人替未來的自己
 * 留一條路」，不是任何人都能打的端點。
 */
export async function setQuestion(
  save: SaveData,
  question: string,
  answer: string,
): Promise<AccountOutcome> {
  const account = save.player.account;
  if (account === null) return { kind: 'failed', reason: '還沒註冊' };
  if (cleanQuestion(question) === null) {
    return { kind: 'failed', reason: `問題不能空白，也不要超過 ${MAX_QUESTION_LENGTH} 個字` };
  }
  if (cleanAnswer(answer) === null) {
    return { kind: 'failed', reason: `答案至少要 ${MIN_ANSWER_LENGTH} 個字` };
  }

  const identity = ensureCloudIdentity(save);
  const result = await accountSetQuestion({
    playerId: identity.playerId,
    secret: identity.secret,
    question,
    answerHash: await sha256(await answerSecret(answer, account.salt)),
  });
  if (!result.ok) return { kind: 'failed', reason: result.detail ?? '設定沒有成功' };
  return { kind: 'ok', name: result.question };
}

/** 這個信箱的救援問題。沒有帳號、或還沒設過，都是 null。 */
export async function questionFor(email: string): Promise<string | null> {
  const cleaned = cleanEmail(email);
  if (cleaned === null) return null;
  const result = await accountQuestion({ email: cleaned });
  return result.ok ? result.question : null;
}

/**
 * 答對救援問題，設一組新密碼。
 *
 * **拿到的是「設一組新的」，不是「看到舊的」。** 舊密碼在這整套系統裡從來
 * 沒有存在過——存的只有它推導出來的密鑰的雜湊，而雜湊不可逆。要能顯示密碼
 * 就得另外存一份還原得回來的，那等於資料庫外洩就是所有人的密碼外流；
 * 而玩家會重複用密碼，傷害會跑到這個遊戲以外的地方。
 *
 * 和信箱驗證碼那條路一樣：**進度一個位元組都不會變**，只換身分密鑰。
 */
export async function resetByQuestion(
  save: SaveData,
  email: string,
  answer: string,
  password: string,
): Promise<AccountOutcome> {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { kind: 'failed', reason: `密碼至少要 ${MIN_PASSWORD_LENGTH} 個字` };
  }
  const cleaned = cleanEmail(email);
  if (cleaned === null) return { kind: 'failed', reason: '電子信箱看起來不對' };
  if (cleanAnswer(answer) === null) {
    return { kind: 'failed', reason: `答案至少要 ${MIN_ANSWER_LENGTH} 個字` };
  }

  const salted = await accountSalt({ email: cleaned });
  if (!salted.ok) return { kind: 'failed', reason: '連不上伺服器' };
  // 同樣不提前判斷。沒註冊的信箱拿到假鹽，算出來的答案雜湊一定對不上，
  // 伺服器回的是「答案不對」——和真的答錯一模一樣。

  // 鹽不變，所以新密碼推出來的密鑰和伺服器接下來要存的是同一把。
  const secret = await deriveSecret(password, salted.salt);
  const result = await accountAnswerReset({
    email: cleaned,
    answerHash: await sha256(await answerSecret(answer, salted.salt)),
    secretHash: await sha256(secret),
  });
  if (!result.ok) return { kind: 'failed', reason: result.detail ?? '答案不對' };

  const identity = ensureCloudIdentity(save);
  identity.playerId = result.playerId;
  identity.secret = secret;
  identity.syncedAt = 0;
  save.player.account = { email: cleaned, name: result.name, salt: salted.salt };
  save.player.name = result.name;
  return { kind: 'ok', name: result.name };
}
