/**
 * 存檔碼。
 *
 * 校驗碼不是為了防作弊——存檔在玩家自己的機器上，防不了也沒必要防。
 * 它防的是**貼漏了**：從聊天視窗複製幾千字的碼、少貼最後一行是很常見的事，
 * 而一個被截斷的存檔會安靜地變成一個壞掉的進度。這幾條守的就是這件事。
 */
import { describe, expect, it } from 'vitest';
import { adoptSave, createDefaultSave, loadSave } from '../src/save';
import { exportCode, importCode } from '../src/save/archive';
import { createMemoryStorage } from '../src/save/storage';
import { SAVE_VERSION } from '../src/save/types';

function filled(): ReturnType<typeof createDefaultSave> {
  const save = createDefaultSave(1000);
  save.player.sectId = 'sword';
  save.player.wallet.gold = 123456;
  save.player.sectClears = { sword: 17 };
  save.player.challengesDone = ['noMerge'];
  save.player.records.bestDps = 98765;
  save.world.stage = 77;
  save.world.highestStage = 90;
  return save;
}

describe('存檔碼', () => {
  it('匯出再匯入，內容一字不差', () => {
    const save = filled();
    const result = importCode(exportCode(save));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toEqual(JSON.parse(JSON.stringify(save)));
  });

  it('前後的空白與換行不影響——複製時常常會多帶到', () => {
    const code = exportCode(filled());
    expect(importCode(`  \n${code}\n `).ok).toBe(true);
  });

  it('少貼一段會被抓出來，而不是安靜地載入一個壞掉的進度', () => {
    const code = exportCode(filled());
    const truncated = code.slice(0, code.length - 20);
    const result = importCode(truncated);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain('完整');
  });

  it('不是本遊戲的碼、空字串、亂碼都給得出理由，不會 throw', () => {
    for (const bad of ['', '   ', 'hello', 'XX1.abc', 'XX9.0000000.aaaa']) {
      const result = importCode(bad);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason.length).toBeGreaterThan(0);
    }
  });

  it('舊版本的碼走的是和 loadSave 同一條遷移路徑', () => {
    // 這裡自己做一套修補的話，兩份規則會各自演化，而舊碼遲早會踩到差異。
    const legacy = {
      version: 1,
      savedAt: 1,
      player: { sectId: 'body', wallet: { gold: 320 }, upgrades: { startAttack: 3 } },
      world: { stage: 9, highestStage: 9, runs: 12, clears: 8 },
    };
    const storage = createMemoryStorage();
    const adopted = adoptSave(legacy, storage, 2000);
    expect(adopted.version).toBe(SAVE_VERSION);
    expect(adopted.player.wallet.gold).toBe(320);
    expect(adopted.world.stage).toBe(9);
    // 而且真的寫進了儲存層：匯入完重開遊戲要看得到新進度。
    expect(loadSave(storage).world.stage).toBe(9);
  });
});
