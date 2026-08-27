/**
 * 執行期的存檔單例。
 *
 * 場景之間不傳存檔物件，一律從這裡取；寫入後呼叫 persist() 才會落地。
 * 讀寫底層仍走 src/save/storage.ts 抽象層（TECH_SPEC 第 9.2 節）。
 */
import { loadSave, saveGame } from './save';
import type { SaveData } from './save/types';

let current: SaveData | null = null;

export function initState(): SaveData {
  current = loadSave();
  return current;
}

export function state(): SaveData {
  if (current === null) current = loadSave();
  return current;
}

export function persist(): void {
  saveGame(state());
}
