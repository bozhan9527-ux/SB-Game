/**
 * 排行榜的客戶端邏輯。
 *
 * 上榜這件事對玩家來說必須是**背景發生、失敗也不打斷**的：
 * 他剛通關，正在看結算表，此時跳一個「連不上伺服器」的錯誤只是掃興。
 * 所以這裡所有的失敗路徑都只是回傳一個結果，由呼叫端決定要不要顯示。
 *
 * 本檔不 import Phaser。
 */
import { fetchDistribution, submitScore } from '../net/client';
import { percentileOf } from '../net/protocol';
import type { ScoreLoadout } from '../net/protocol';
import type { SaveData } from '../save/types';
import type { RunSubmission } from '../scenes/types';
import { ensureCloudIdentity } from './cloud';
import { loadoutSpecOf } from './loadout';

/**
 * 把存檔裡的配置整理成伺服器重播要用的那一份。
 *
 * 直接沿用 loadoutSpecOf——伺服器收到之後補上關卡就是一份 LoadoutSpec，
 * 和玩家這一場實際用的是同一個組裝函式。這裡若自己挑欄位，
 * 兩邊遲早會走散，而症狀是「合法成績被退回」。
 */
export function loadoutFor(save: SaveData): ScoreLoadout {
  const { stage: _stage, ...rest } = loadoutSpecOf(save, 1);
  return {
    ...rest,
    talismans: [...rest.talismans],
    upgrades: { ...rest.upgrades },
    karma: { ...rest.karma },
    challenges: [...rest.challenges],
  };
}

export type SubmitOutcome =
  | { kind: 'ok'; rank: number; best: boolean }
  | { kind: 'skipped' }
  | { kind: 'failed'; reason: string };

/**
 * 送出一筆成績。
 *
 * **只在通關時送。** 沒通關的一場上榜沒有意義，而且伺服器也會拒絕——
 * 在這裡先擋掉可以省下一趟完全會失敗的請求。
 */
export async function submitRun(
  save: SaveData,
  stage: number,
  submission: RunSubmission,
): Promise<SubmitOutcome> {
  if (save.player.sectId === null) return { kind: 'skipped' };
  const identity = ensureCloudIdentity(save);

  const result = await submitScore({
    playerId: identity.playerId,
    secret: identity.secret,
    name: save.player.name,
    stage,
    runs: submission.runs,
    steps: submission.steps,
    actions: submission.actions,
    loadout: loadoutFor(save),
  });

  if (!result.ok) {
    // 「還沒上傳過雲端存檔」是最常見的一種，要說得具體，玩家才知道下一步做什麼。
    if (result.error === 'unauthorized') {
      return { kind: 'failed', reason: '要先到「存檔」上傳一次雲端存檔才能上榜' };
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
