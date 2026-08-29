/**
 * 閉關：離線收益。
 *
 * **這是刻意用來取代「掃蕩」的東西。** 掃蕩在塔防／放置類是標配，但這個遊戲不能有：
 * 一場的勝負來自即時排陣，不是來自 build——實測模擬 AI 在第 140 關勝率 100%，
 * 同一組數值下 1500ms 操作速度的真人只有 25%。掃蕩若是「跑模擬拿結果」，
 * 那它不是省時間，是比親手打更強，整個陣法與合成層會立刻變成可選的。
 *
 * 真正該消掉的體力活是「回頭重刷已經通關的關卡換金幣」。
 * 閉關給的是「你不在的時候的收益」，不是「替你打」。
 *
 * 本檔不 import Phaser，全部是純函式；時間一律由呼叫端傳入，測試才能決定「現在」。
 */
import { BALANCE } from '../data';
import type { SaveData } from '../save/types';

export interface RetreatOffer {
  /** 這次閉關累積了多少毫秒（已套上上限）。 */
  elapsedMs: number;
  /** 可領的金幣，已四捨五入。 */
  gold: number;
  /** 是否已經達到最長時數——達到了就該提醒玩家「再放也不會更多」。 */
  capped: boolean;
}

/** 折算收益時用的關卡：目前正在打的前一關，也就是最後真正通過的那一關。 */
function clearedStage(save: SaveData): number {
  return Math.max(1, save.world.stage - 1);
}

/**
 * 一小時的閉關值多少金幣。
 *
 * 折算成「幾次通關獎勵」而不是給一個固定數字：通關獎勵本身是等比成長的，
 * 給固定數字的話，閉關在第 5 關能買下整間洞府、到第 50 關等於沒有。
 *
 * 金幣倍率刻意**不含**門派與升級線：那些是「你在場上做的事」的回報，
 * 閉關不該跟著一起長，否則堆滿聚寶之術的人會發現掛機比玩划算。
 */
export function retreatGoldPerHour(save: SaveData): number {
  const { gold, retreat } = BALANCE;
  const perClear = gold.clearBase * Math.pow(gold.clearGrowth, clearedStage(save) - 1);
  return perClear * retreat.clearsPerHour;
}

/** 現在能領到什麼。時間不足時 gold 為 0。 */
export function retreatOffer(save: SaveData, now: number): RetreatOffer {
  const { retreat } = BALANCE;
  const capMs = retreat.maxHours * 3_600_000;
  const raw = Math.max(0, now - save.world.retreatAt);
  const elapsedMs = Math.min(capMs, raw);
  if (elapsedMs < retreat.minMinutes * 60_000) {
    return { elapsedMs, gold: 0, capped: raw >= capMs };
  }
  const gold = Math.round((retreatGoldPerHour(save) * elapsedMs) / 3_600_000);
  return { elapsedMs, gold, capped: raw >= capMs };
}

/** 把閉關的時間重新起算。領走之後、以及打完一場都要呼叫。 */
export function resetRetreat(save: SaveData, now: number): void {
  save.world.retreatAt = now;
}

/** 「3 小時 20 分」這種好讀的寫法。 */
export function formatDuration(ms: number): string {
  const totalMinutes = Math.floor(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes} 分`;
  if (minutes <= 0) return `${hours} 小時`;
  return `${hours} 小時 ${minutes} 分`;
}
