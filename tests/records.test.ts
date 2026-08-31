/**
 * 個人最佳紀錄。
 *
 * 排行榜的本機替身。最容易寫錯的一條在最下面：
 * 「最快通關」只能認通關的那一場。
 */
import { describe, expect, it } from 'vitest';
import { claimReward, detectAchievements, pendingAchievements } from '../src/systems/achievements';
import { migrate } from '../src/save/migrations';
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

/**
 * 成就改成手動領取之後最容易出的一種錯：**改制順便把獎勵重發一次**。
 * 舊制是達成當下自動入帳，所以那些錢玩家早就拿過了；不標記為已領取的話，
 * 老玩家一進仙途錄就能把十九條全部再領一次。
 */
describe('成就領取', () => {
  it('達成不入帳，領了才入帳，而且只能領一次', () => {
    const save = createDefaultSave(1);
    save.world.highestStage = 200;
    const before = save.player.wallet.gold;
    const found = detectAchievements(save);
    expect(found.length).toBeGreaterThan(0);
    // 判定不會動到錢包——這正是「手動領取」的意思。
    expect(save.player.wallet.gold).toBe(before);

    const first = found[0];
    if (first === undefined) return;
    expect(claimReward(save, first.id)).toBe(first.reward);
    expect(claimReward(save, first.id)).toBe(0);
    expect(pendingAchievements(save).map((item) => item.id)).not.toContain(first.id);
  });

  it('還沒達成的領不到', () => {
    const save = createDefaultSave(1);
    expect(claimReward(save, 'stage_200')).toBe(0);
  });

  it('v17 的存檔升上來時，已達成的一律視為已領取——改制不是一次大放送', () => {
    const old = {
      version: 17,
      player: { achievements: ['first_clear', 'realm_2'] },
    } as unknown as Record<string, unknown>;
    const migrated = migrate(old, 18);
    const player = migrated['player'] as Record<string, unknown>;
    expect(player['achievementsClaimed']).toEqual(['first_clear', 'realm_2']);
  });
});
