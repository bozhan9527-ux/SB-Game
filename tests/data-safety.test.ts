/**
 * 榜單與帳號的資料不准被程式碼刪掉。
 *
 * **這不是假想的風險，是這個專案已經發生過一次的事。** server/schema.sql
 * 每一次部署 API 都會整份重跑，而它裡面曾經留著一行
 * `DROP TABLE IF EXISTS accounts`——那一行當初是為了替帳號表補上 email 欄位
 * 而加的一次性遷移，任務完成後忘了拿掉。留著的話每一次部署都會把所有帳號
 * 清光，而那種錯**不會有任何人發現**，直到有人抱怨登不進去。
 *
 * 製作人的長期規則：榜單的資料不要移除。規則要靠人記得就等於沒有規則，
 * 所以釘成一條測試。和 replay.test.ts 裡掃 this.rng 那一條同一個做法——
 * 純函式的測試抓不到這一類問題（它不在任何一個函式的回傳值裡），
 * 守衛只能架在原始碼上。
 */
import { describe, expect, it } from 'vitest';
// ?raw 讓 Vite 直接把檔案內容當字串給進來。
import schemaSql from '../server/schema.sql?raw';
import accountsSource from '../server/src/accounts.ts?raw';
import savesSource from '../server/src/saves.ts?raw';
import scoresSource from '../server/src/scores.ts?raw';
import limitsSource from '../server/src/limits.ts?raw';
import indexSource from '../server/src/index.ts?raw';

/** 這幾張表裡是玩家的東西：成績、進度、帳號。一列都不准被程式碼刪掉。 */
const PROTECTED = ['board_runs', 'saves', 'accounts', 'account_recovery'];

/**
 * 唯一允許被刪的表。
 *
 * rate_limits 存的是「這個 IP 這五分鐘打了幾次」，本來就該過期就丟——
 * 不丟的話一個換 IP 的攻擊者可以用垃圾列把資料庫塞滿，那是把速率限制
 * 本身變成攻擊面。它裡面沒有任何玩家的東西。
 */
const DISPOSABLE = ['rate_limits'];

/** 註解裡談這條規則本身是正常的，所以只看程式碼。 */
function code(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !/^\s*(--|\/\/|\*)/.test(line))
    .join('\n');
}

const SOURCES: [string, string][] = [
  ['server/schema.sql', schemaSql],
  ['server/src/accounts.ts', accountsSource],
  ['server/src/saves.ts', savesSource],
  ['server/src/scores.ts', scoresSource],
  ['server/src/limits.ts', limitsSource],
  ['server/src/index.ts', indexSource],
];

describe('玩家的資料不准被程式碼刪掉', () => {
  it('沒有任何 DROP TABLE／DROP INDEX', () => {
    // **schema.sql 是最危險的那一個**：它每次部署都整份重跑，所以一行
    // DROP 的代價不是「一次意外」，是「每一次部署都再清一次」。
    for (const [name, text] of SOURCES) {
      const found = code(text).match(/\bDROP\s+(TABLE|INDEX|VIEW)\b[^\n;]*/gi) ?? [];
      expect(found, `${name} 出現了 DROP`).toEqual([]);
    }
  });

  it('沒有任何 DELETE／TRUNCATE 打在放玩家資料的表上', () => {
    for (const [name, text] of SOURCES) {
      const statements = code(text).match(/\b(DELETE\s+FROM|TRUNCATE(?:\s+TABLE)?)\s+([A-Za-z_][A-Za-z0-9_]*)/gi) ?? [];
      for (const statement of statements) {
        const table = statement.split(/\s+/).pop()?.toLowerCase() ?? '';
        expect(
          PROTECTED.includes(table),
          `${name} 想刪 ${table}——那張表裡是玩家的成績或帳號`,
        ).toBe(false);
        // 白名單之外的表也要擋：新加一張表卻忘了想清楚它能不能刪，
        // 預設應該是不能，而不是「測試沒說話所以可以」。
        expect(
          DISPOSABLE.includes(table),
          `${name} 想刪 ${table}，但它不在可丟棄的名單裡——確認它沒有玩家的東西之後再加進 DISPOSABLE`,
        ).toBe(true);
      }
    }
  });

  it('改名只換 name 那一欄，不會動到成績本身', () => {
    // 註冊與改名都會把榜上那幾列的名字換掉（不換的話他會在榜上看到一個
    // 認不出來的無名修士）。那是**唯一**允許碰 board_runs 既有列的寫入，
    // 而它只准動 name——順手多改一個欄位就是在竄改別人的成績。
    const writes = code(accountsSource).match(/UPDATE\s+board_runs\s+SET[^']*/gi) ?? [];
    expect(writes.length).toBeGreaterThan(0);
    for (const write of writes) {
      expect(write.replace(/\s+/g, ' ').trim()).toBe('UPDATE board_runs SET name = ? WHERE player_id = ?');
    }
  });
});
