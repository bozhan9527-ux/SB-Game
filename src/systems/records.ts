/**
 * 個人最佳紀錄的更新與呈現。
 *
 * 無限模式的唯一動機是比較——推到 170 關若沒有任何人知道，就沒有理由再推第 171 關。
 * 真正的解法是排行榜，但那需要一個這個專案還沒有的後端。
 * 在有之前，先讓玩家跟自己比：這幾個數字全部來自一場結束時的戰績，不需要伺服器。
 *
 * 本檔不 import Phaser，全部是純函式。
 */
import type { SaveData } from '../save/types';

/** 一場結束時，用來比對紀錄的那幾個數字。 */
export interface RunRecordInput {
  victory: boolean;
  stage: number;
  kills: number;
  /** 這一場的每秒輸出。 */
  dps: number;
  /** 這一場的陣法平均加成。 */
  formationBonus: number;
  /** 這一場打了多久（ms）。 */
  elapsedMs: number;
  /** 這一場開了幾條試煉。 */
  challengeCount: number;
}

export interface BeatenRecord {
  label: string;
  text: string;
}

/**
 * 更新紀錄，回傳這一場破了哪幾項。
 *
 * 「最快通關」只認**通關**的那一場：失敗的一場往往因為早早失守而時間很短，
 * 若也拿來比，最快紀錄會被一次慘敗佔住，而且永遠打不破。
 */
export function updateRecords(save: SaveData, run: RunRecordInput): BeatenRecord[] {
  const records = save.player.records;
  const beaten: BeatenRecord[] = [];

  if (run.dps > records.bestDps) {
    records.bestDps = run.dps;
    beaten.push({ label: '最高每秒輸出', text: Math.round(run.dps).toLocaleString('en-US') });
  }
  if (run.kills > records.bestKills) {
    records.bestKills = run.kills;
    beaten.push({ label: '單場最多斬殺', text: `${run.kills} 隻` });
  }
  if (run.formationBonus > records.bestFormationBonus) {
    records.bestFormationBonus = run.formationBonus;
    beaten.push({ label: '最強陣法', text: `+${Math.round(run.formationBonus * 100)}%` });
  }
  if (run.victory) {
    if (records.fastestClearMs === 0 || run.elapsedMs < records.fastestClearMs) {
      records.fastestClearMs = run.elapsedMs;
      beaten.push({ label: '最快通關', text: `${(run.elapsedMs / 1000).toFixed(1)} 秒` });
    }
    if (run.challengeCount > 0 && run.stage > records.bestChallengeStage) {
      records.bestChallengeStage = run.stage;
      beaten.push({ label: '帶試煉推到最深', text: `第 ${run.stage} 關` });
    }
  }
  return beaten;
}

/** 呈現用的一覽。沒有紀錄的項目一律寫「尚無」，不寫 0——0 看起來像成績。 */
export function recordLines(save: SaveData): { label: string; value: string }[] {
  const records = save.player.records;
  const none = '尚無紀錄';
  return [
    { label: '最深境界', value: `第 ${save.world.highestStage} 關` },
    {
      label: '最高每秒輸出',
      value: records.bestDps > 0 ? Math.round(records.bestDps).toLocaleString('en-US') : none,
    },
    { label: '單場最多斬殺', value: records.bestKills > 0 ? `${records.bestKills} 隻` : none },
    {
      label: '最快通關',
      value: records.fastestClearMs > 0 ? `${(records.fastestClearMs / 1000).toFixed(1)} 秒` : none,
    },
    {
      label: '最強陣法',
      value: records.bestFormationBonus > 0 ? `+${Math.round(records.bestFormationBonus * 100)}%` : none,
    },
    {
      label: '帶試煉推到最深',
      value: records.bestChallengeStage > 0 ? `第 ${records.bestChallengeStage} 關` : none,
    },
  ];
}
