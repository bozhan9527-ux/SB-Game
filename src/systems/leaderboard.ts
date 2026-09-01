/**
 * 排行榜的客戶端邏輯。
 *
 * 上榜這件事對玩家來說必須是**背景發生、失敗也不打斷**的：
 * 他剛通關，正在看結算表，此時跳一個「連不上伺服器」的錯誤只是掃興。
 * 所以這裡所有的失敗路徑都只是回傳一個結果，由呼叫端決定要不要顯示。
 *
 * 本檔不 import Phaser。
 */
import { fetchDistribution, getSave, putSave, submitScore } from '../net/client';
import { percentileOf } from '../net/protocol';
import type { ScoreLoadout } from '../net/protocol';
import type { SaveData } from '../save/types';
import type { RunSubmission } from '../scenes/types';
import { ensureCloudIdentity } from './cloud';
import type { CloudIdentity } from '../save/types';
import { loadoutSpecOf } from './loadout';
import type { LoadoutSpec } from './loadout';

/**
 * 把存檔裡的配置整理成伺服器重播要用的那一份。
 *
 * 直接沿用 loadoutSpecOf——伺服器收到之後補上關卡就是一份 LoadoutSpec，
 * 和玩家這一場實際用的是同一個組裝函式。這裡若自己挑欄位，
 * 兩邊遲早會走散，而症狀是「合法成績被退回」。
 */
export function scoreLoadoutOf(spec: LoadoutSpec): ScoreLoadout {
  const { stage: _stage, endless: _endless, ...rest } = spec;
  return {
    ...rest,
    talismans: [...rest.talismans],
    upgrades: { ...rest.upgrades },
    karma: { ...rest.karma },
    rules: [...rest.rules],
  };
}

/**
 * 從存檔現算一份。
 *
 * **只適合「當下就要開打」的情境。** 上報成績不能用它——見 submitRun 的註解，
 * 存檔在那一刻已經被這一場的結算改過了。
 */
export function loadoutFor(save: SaveData): ScoreLoadout {
  return scoreLoadoutOf(loadoutSpecOf(save, 1));
}

export type SubmitOutcome =
  | { kind: 'ok'; rank: number; best: boolean }
  | { kind: 'skipped' }
  | { kind: 'failed'; reason: string };

/**
 * 把這個身分登記到伺服器上（＝上傳一次雲端存檔）。
 *
 * 上榜要求伺服器認得這個身分，理由是「被檢舉時查得到是誰」——那是對的，
 * 但**那一步對玩家毫無意義**：他要的是上榜，不是同步存檔，而在他通關之前
 * 沒有任何地方會告訴他少做了這一步。所以改成由程式自己補。
 *
 * 只在伺服器說「沒看過這個身分」時才做，因此**不可能蓋掉任何東西**：
 * 那句話的意思就是雲端還沒有這一份。手動上傳那條路留著，
 * 它處理的是另一件事（換裝置、覆蓋、看時間戳決定要不要蓋）。
 */
export async function registerForBoard(save: SaveData): Promise<boolean> {
  const identity = ensureCloudIdentity(save);

  // **先問，再寫。** 伺服器上已經有這個身分的話，登記這件事本來就完成了，
  // 一個位元組都不必上傳。這一條讓「自動開通」在任何情況下都不可能蓋掉
  // 雲端那一份——而那正是手動上傳存在的理由（它要處理覆蓋，所以會問人）。
  const existing = await getSave({
    playerId: identity.playerId,
    secret: identity.secret,
  });
  if (existing.ok) {
    identity.syncedAt = Date.now();
    return true;
  }
  // notFound 才是「還沒登記」。其他錯誤（連不上、密鑰對不上）不能當成
  // 「雲端是空的」——那會把一份還在的存檔蓋掉。
  if (existing.error !== 'notFound') return false;

  const result = await putSave({
    playerId: identity.playerId,
    secret: identity.secret,
    savedAt: save.savedAt,
    blob: JSON.stringify(save),
  });
  if (!result.ok) return false;
  identity.syncedAt = Date.now();
  return true;
}

/** 伺服器已經認得這個身分了嗎。認得就代表上榜這條路是通的。 */
export function boardReady(save: SaveData): boolean {
  const identity: CloudIdentity | null = save.player.cloud;
  return identity !== null && identity.syncedAt > 0;
}

/**
 * 送出一筆成績。
 *
 * **只在通關時送。** 沒通關的一場上榜沒有意義，而且伺服器也會拒絕——
 * 在這裡先擋掉可以省下一趟完全會失敗的請求。
 *
 * 第一次被回 unauthorized 時會自己登記一次再重送：那個錯誤幾乎一定是
 * 「還沒上傳過雲端存檔」，而要求玩家先去別的頁面按一顆按鈕、
 * 再回來重打一場，只是把一個實作細節丟給他扛。
 */
export async function submitRun(
  save: SaveData,
  stage: number,
  submission: RunSubmission,
): Promise<SubmitOutcome> {
  if (save.player.sectId === null) return { kind: 'skipped' };
  const identity = ensureCloudIdentity(save);

  const send = (): Promise<Awaited<ReturnType<typeof submitScore>>> =>
    submitScore({
      playerId: identity.playerId,
      secret: identity.secret,
      name: save.player.name,
      stage,
      runs: submission.runs,
      steps: submission.steps,
      actions: submission.actions,
      // **用開打那一刻的那一份，不是現在現算的。**
      //
      // 結算頁在送成績之前已經寫過存檔了：recordClear 會把這一派的通關次數
      // 加一，而門派修為每五次升一階、每階 +4% 法寶傷害。跨過階的那一場，
      // 伺服器重播出來的是一個傷害比較高的自己——擊殺順序不同、rng 消耗的
      // 次序就不同，重播從那裡開始飄，最後判成沒通關。
      //
      // 症狀是「正常通關卻說驗不過」，而且只在第 5、10、15、20 次通關發生，
      // 所以看起來像隨機。種子那一半（runs）當初就是為了同一個理由當場記下來的，
      // 配置這一半漏了。
      loadout: submission.loadout,
    });

  let result = await send();

  if (!result.ok && result.error === 'unauthorized') {
    // 自己補登記再重送一次。只重試這一次：登記完還是 unauthorized 的話
    // 成因是另一件事（密鑰對不上），再送幾次也一樣。
    if (await registerForBoard(save)) result = await send();
  }

  if (!result.ok) {
    if (result.error === 'unauthorized') {
      return { kind: 'failed', reason: '這台裝置的身分對不上雲端那一份，先到「存檔」同步一次' };
    }
    if (result.error === 'rejected') {
      return { kind: 'failed', reason: '這一場的紀錄驗不過，沒有上榜' };
    }
    return { kind: 'failed', reason: '連不上伺服器，這一場沒有上榜' };
  }
  return { kind: 'ok', rank: result.rank, best: result.best };
}

/**
 * 更新關卡分布的快取。
 *
 * 拿不到就沿用上次的：百分位晚一天更新沒有人看得出來，
 * 但「這一格突然消失」很明顯。
 */
export async function refreshDistribution(save: SaveData, now: number): Promise<boolean> {
  const result = await fetchDistribution();
  if (!result.ok) return false;
  save.player.distribution = { buckets: result.buckets, total: result.total, fetchedAt: now };
  return true;
}

/**
 * 「你超過了幾成修士」。
 *
 * 樣本太少時回 null——三個人裡排第一寫成「超過 67%」只是誤導，
 * 那個數字要有意義得先有夠多人。
 */
export const MIN_SAMPLES_FOR_PERCENTILE = 20;

export function percentileLine(save: SaveData, stage: number): string | null {
  const cache = save.player.distribution;
  if (cache === null || cache.total < MIN_SAMPLES_FOR_PERCENTILE) return null;
  const share = percentileOf(cache.buckets, stage);
  return `第 ${stage} 關　你已經超過 ${Math.round(share * 100)}% 的修士`;
}
