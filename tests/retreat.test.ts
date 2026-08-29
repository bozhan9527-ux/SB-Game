/**
 * 閉關（離線收益）。
 *
 * 這一組守的是「它不能變成掃蕩」：速率必須明顯低於實際遊玩，
 * 而且時間只在人不在的時候累積。
 */
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/data';
import { createDefaultSave, recordClear, recordDefeat } from '../src/save';
import type { SaveData } from '../src/save/types';
import { formatDuration, resetRetreat, retreatGoldPerHour, retreatOffer } from '../src/systems/retreat';

const HOUR = 3_600_000;

/** 一份「retreatAt = 0」的存檔：把「現在」當參數傳進去就等於離線了那麼久。 */
function away(stage = 40): SaveData {
  const save = createDefaultSave(0);
  save.player.sectId = 'body';
  save.world.stage = stage;
  save.world.highestStage = stage;
  save.world.retreatAt = 0;
  return save;
}

describe('閉關', () => {
  it('時間不夠就完全不出現', () => {
    // 幾十金的提示只是雜訊，而每次開遊戲都跳一個要按掉的東西會變成障礙物。
    const save = away();
    const short = (BALANCE.retreat.minMinutes - 1) * 60_000;
    expect(retreatOffer(save, short).gold).toBe(0);
    expect(retreatOffer(save, BALANCE.retreat.minMinutes * 60_000).gold).toBeGreaterThan(0);
  });

  it('累積到上限就停住', () => {
    const save = away();
    const { maxHours } = BALANCE.retreat;
    const atCap = retreatOffer(save, maxHours * HOUR);
    const wayOver = retreatOffer(save, maxHours * HOUR * 10);
    expect(wayOver.gold).toBe(atCap.gold);
    expect(wayOver.capped).toBe(true);
    expect(atCap.elapsedMs).toBe(maxHours * HOUR);
  });

  it('收益跟著關卡等比成長，不是固定數字', () => {
    // 給固定數字的話，閉關在第 5 關能買下整間洞府、到第 50 關等於沒有。
    const shallow = retreatGoldPerHour(away(5));
    const deep = retreatGoldPerHour(away(50));
    expect(deep).toBeGreaterThan(shallow * 10);
  });

  it('一小時的閉關明顯少於一小時的實際遊玩', () => {
    // 這條是這個系統與「掃蕩」的分界線：閉關是為了讓你不必回頭刷，
    // 不是為了讓你不必玩。一場 60–105 秒，一小時打得完三十幾場。
    const clearsPerHourWhilePlaying = 34;
    expect(BALANCE.retreat.clearsPerHour).toBeLessThan(clearsPerHourWhilePlaying / 2);
  });

  it('打完一場就重新起算——閉關是不在的時候的收益', () => {
    const save = away();
    recordClear(save, 0);
    expect(retreatOffer(save, Date.now()).gold).toBe(0);

    const lost = away();
    recordDefeat(lost, 0);
    expect(retreatOffer(lost, Date.now()).gold).toBe(0);
  });

  it('領走之後重新起算', () => {
    const save = away();
    const before = retreatOffer(save, 4 * HOUR).gold;
    expect(before).toBeGreaterThan(0);
    resetRetreat(save, 4 * HOUR);
    expect(retreatOffer(save, 4 * HOUR).gold).toBe(0);
  });

  it('時數寫成讀得懂的字', () => {
    expect(formatDuration(25 * 60_000)).toBe('25 分');
    expect(formatDuration(2 * HOUR)).toBe('2 小時');
    expect(formatDuration(3 * HOUR + 20 * 60_000)).toBe('3 小時 20 分');
  });
});
