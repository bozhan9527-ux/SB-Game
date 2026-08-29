/**
 * 個人最佳紀錄。
 *
 * 排行榜的本機替身。最容易寫錯的一條在最下面：
 * 「最快通關」只能認通關的那一場。
 */
import { describe, expect, it } from 'vitest';
import { createDefaultSave } from '../src/save';
import type { SaveData } from '../src/save/types';
import { recordLines, updateRecords } from '../src/systems/records';
import type { RunRecordInput } from '../src/systems/records';

function run(over: Partial<RunRecordInput> = {}): RunRecordInput {
  return {
    victory: true,
    stage: 40,
    kills: 60,
    dps: 5000,
    formationBonus: 0.3,
    elapsedMs: 70_000,
    challengeCount: 0,
    ...over,
  };
}

function save(): SaveData {
  const data = createDefaultSave(1);
  data.player.sectId = 'body';
  return data;
}

describe('個人紀錄', () => {
  it('第一場全部都是新紀錄，第二場打不贏自己就一項都不算', () => {
    const data = save();
    expect(updateRecords(data, run()).length).toBeGreaterThan(0);
    expect(updateRecords(data, run())).toEqual([]);
  });

  it('只有真的更好才更新', () => {
    const data = save();
    updateRecords(data, run());
    const beaten = updateRecords(data, run({ dps: 9000, kills: 10, formationBonus: 0.1 }));
    expect(beaten.map((item) => item.label)).toEqual(['最高每秒輸出']);
    expect(data.player.records.bestKills).toBe(60);
  });

  it('最快通關只認通關的那一場', () => {
    // 失敗的一場往往因為早早失守而時間很短。若也拿來比，
    // 最快紀錄會被一次慘敗佔住，而且永遠打不破。
    const data = save();
    updateRecords(data, run({ victory: false, elapsedMs: 3000 }));
    expect(data.player.records.fastestClearMs).toBe(0);
    updateRecords(data, run({ victory: true, elapsedMs: 50_000 }));
    expect(data.player.records.fastestClearMs).toBe(50_000);
  });

  it('帶試煉的最深關卡只在有開試煉時才記', () => {
    const data = save();
    updateRecords(data, run({ stage: 80, challengeCount: 0 }));
    expect(data.player.records.bestChallengeStage).toBe(0);
    updateRecords(data, run({ stage: 55, challengeCount: 2 }));
    expect(data.player.records.bestChallengeStage).toBe(55);
  });

  it('沒有紀錄的項目寫「尚無紀錄」，不寫 0', () => {
    // 0 看起來像一個成績，會讓玩家以為自己打出過那個數字。
    const lines = recordLines(save());
    expect(lines.filter((line) => line.value === '尚無紀錄').length).toBeGreaterThan(0);
    expect(lines.some((line) => line.value === '0')).toBe(false);
  });
});
