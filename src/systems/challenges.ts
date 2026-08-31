/**
 * 挑戰條件：玩家自己加上去的限制。
 *
 * **為什麼獎勵只能是金幣倍率。** 挑戰模式的價值在於「我自己給自己找事做」，
 * 而不是「不做就落後」。只要它給的東西無法用一般玩法取得——專屬的符、專屬的升級、
 * 專屬的關卡——它就從一個選項變成一份作業，正好毀掉它存在的理由。
 * 金幣是可以用時間換的，所以開挑戰永遠只是「換一種玩法」而不是「必須這樣玩」。
 *
 * 條件本身一律只讓這一場更難，而且每一條都改變**打法**而不只是數字：
 * 不合之道拿掉指數成長、獨門一符換掉整個抽符池、孤身守門刪掉容錯、
 * 一夫當關把「用耐久換時間」整個否決、速斬把關底的緩衝拿走。
 *
 * 本檔不 import Phaser，全部是純函式。
 */
import { CHALLENGES } from '../data';
import type { ChallengeDef } from '../data/types';
import type { SaveData } from '../save/types';

export function challengeById(id: string): ChallengeDef | null {
  return CHALLENGES.find((item) => item.id === id) ?? null;
}

/** 這個進度看得到哪幾條。太早開放只會讓新玩家用它把自己卡死。 */
export function availableChallenges(highestStage: number): ChallengeDef[] {
  return CHALLENGES.filter((item) => item.minStage <= Math.max(1, highestStage));
}

/**
 * 把存檔裡的選擇修成一份可用的清單。
 *
 * 和符籙那邊同一套態度：吞掉壞資料而不是 throw。存檔可能來自舊版本或被手改過，
 * 開場崩潰的代價遠大於少了一條挑戰。
 */
export function sanitizeChallenges(chosen: readonly string[], highestStage: number): string[] {
  const available = availableChallenges(highestStage);
  const out: string[] = [];
  for (const id of chosen) {
    if (out.includes(id)) continue;
    if (!available.some((item) => item.id === id)) continue;
    out.push(id);
  }
  return out;
}

/**
 * 這一場開啟的條件，由純資料算出。
 *
 * 伺服器重播時沒有存檔，只有玩家上報的清單——而條件會改變戰鬥規則，
 * 少算一條就是重播另一場仗。上報條件不是作弊面：每一條都只讓這一場更難，
 * 而且四條全部人人可開。
 */
export function challengeDefsOf(chosen: readonly string[], highestStage: number): ChallengeDef[] {
  return sanitizeChallenges(chosen, highestStage)
    .map((id) => challengeById(id))
    .filter((item): item is ChallengeDef => item !== null);
}

/** 這一場開啟的條件。 */
export function activeChallenges(save: SaveData): ChallengeDef[] {
  return challengeDefsOf(save.player.challenges, save.world.highestStage);
}

export function hasChallenge(save: SaveData, id: string): boolean {
  return activeChallenges(save).some((item) => item.id === id);
}

/** 多條同時開啟時倍率相乘：同時扛兩個限制本來就該比分開扛兩次值錢。 */
export function challengeGoldMultiplier(save: SaveData): number {
  return activeChallenges(save).reduce((total, item) => total * item.goldMultiplier, 1);
}

/** 這一條是否已經在某一關達成過。 */
export function isChallengeCleared(save: SaveData, id: string): boolean {
  return save.player.challengesDone.includes(id);
}

/** 通關時記下這一場開了哪幾條。回傳新達成的那幾條。 */
export function recordChallengeClears(save: SaveData): ChallengeDef[] {
  const fresh: ChallengeDef[] = [];
  for (const item of activeChallenges(save)) {
    if (isChallengeCleared(save, item.id)) continue;
    save.player.challengesDone.push(item.id);
    fresh.push(item);
  }
  return fresh;
}
