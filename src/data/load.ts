import balanceJson from '../../data/balance.json';
import gatesJson from '../../data/gates.json';
import { BalanceSchema, GatesSchema, type Balance, type Gates } from './types';

/**
 * 載入並驗證遊戲資料。
 *
 * JSON 於建置時打包進 bundle，但仍在此做 runtime 驗證：
 * 型別標註只保證程式碼這一側，不保證 JSON 檔的實際內容。
 * TECH_SPEC 第 3 節要求格式錯誤必須在載入階段就報錯。
 */
function parseOrThrow<T>(
  schema: { safeParse: (v: unknown) => { success: boolean; data?: T; error?: unknown } },
  raw: unknown,
  fileName: string,
): T {
  const result = schema.safeParse(raw);
  if (!result.success || result.data === undefined) {
    throw new Error(`資料驗證失敗：${fileName}\n${JSON.stringify(result.error, null, 2)}`);
  }
  return result.data;
}

export const balance: Balance = parseOrThrow(BalanceSchema, balanceJson, 'data/balance.json');
export const gates: Gates = parseOrThrow(GatesSchema, gatesJson, 'data/gates.json');
