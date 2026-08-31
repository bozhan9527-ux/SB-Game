/**
 * 門派修為與換派代價。
 *
 * **為什麼門派需要重量。** 原本門派是遊戲裡唯一的 build 身分，卻不需要任何承諾：
 * 換派完全免費、沒有任何門派專屬的長期進度，而成就「四道皆通」還獎勵金幣鼓勵你切換。
 * 結果門派不是身分，是一個隨時可改的修飾選單——選錯沒有代價，選對也沒有回報。
 *
 * 這裡加的兩件事互為表裡：
 * - **修為**只在該門派身上累積（存檔的 player.sectClears 分派記），換派帶不走；
 * - **換派要付錢**，價碼正比於你在現任門派累積了多少。
 *
 * 關鍵是修為**不會被沒收**：離開時留在原地，回來就還在。
 * 若換派會把修為清掉，那就不是「承諾」而是「懲罰」——玩家會因為怕虧而永遠不敢嘗試，
 * 四個門派等於只剩第一次選的那個。留著才有得比較：換派的代價是「這段時間你走得比較慢」，
 * 而不是「你之前的三十場白打了」。
 *
 * 本檔不 import Phaser，全部是純函式。
 */
import { BALANCE } from '../data';
import type { SaveData } from '../save/types';

/** 這一派累積了幾次通關。 */
export function sectClears(save: SaveData, sectId: string): number {
  return Math.max(0, save.player.sectClears[sectId] ?? 0);
}

/**
 * 修為階數。到頂就不再長——它是一條有終點的曲線，不是無限疊加的雪球。
 *
 * 吃的是次數而不是存檔：伺服器重播一場成績時沒有存檔，只有玩家上報的次數，
 * 而它必須算出和玩家當時**完全相同**的階數，否則重播的是另一場仗。
 */
export function masteryTierFor(clears: number): number {
  const { clearsPerMastery, maxMasteryTier } = BALANCE.sect;
  if (clearsPerMastery <= 0) return 0;
  return Math.min(maxMasteryTier, Math.floor(Math.max(0, clears) / clearsPerMastery));
}

export function masteryTier(save: SaveData, sectId: string): number {
  return masteryTierFor(sectClears(save, sectId));
}

/** 這一階修為給的法寶傷害加成（0.12 = +12%）。 */
export function masteryBonus(tier: number): number {
  return Math.max(0, tier) * BALANCE.sect.masteryDamagePerTier;
}

/** 距離下一階還差幾次通關；已經滿階回 null。 */
export function clearsToNextMastery(save: SaveData, sectId: string): number | null {
  const { clearsPerMastery, maxMasteryTier } = BALANCE.sect;
  const tier = masteryTier(save, sectId);
  if (tier >= maxMasteryTier) return null;
  return clearsPerMastery * (tier + 1) - sectClears(save, sectId);
}

/**
 * 換到別派要花多少金幣。
 *
 * 價碼看的是**現任門派**累積了多少，不是目標門派——離開一個投入很深的門派才貴。
 * 還沒有現任門派（第一次入門）或現任門派毫無累積時是免費的：
 * 新玩家不該為了一個他還看不懂的選擇付錢。
 */
export function switchCost(save: SaveData, targetSectId: string): number {
  const current = save.player.sectId;
  if (current === null || current === targetSectId) return 0;
  return sectClears(save, current) * BALANCE.sect.switchCostPerClear;
}

/** 修為的一行說明，選門派與符籙譜兩個畫面共用。 */
export function masteryLine(save: SaveData, sectId: string): string {
  const tier = masteryTier(save, sectId);
  const bonus = Math.round(masteryBonus(tier) * 100);
  const remain = clearsToNextMastery(save, sectId);
  const head = `修為 ${tier} / ${BALANCE.sect.maxMasteryTier} 階（法寶傷害 +${bonus}%）`;
  if (remain === null) return `${head}・已至頂`;
  return `${head}・再通關 ${remain} 次升階`;
}
