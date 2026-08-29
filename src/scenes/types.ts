import type { RunTelemetry } from '../systems/defense';

/** 場景之間傳遞的資料結構。 */
export interface RunResultData {
  victory: boolean;
  stage: number;
  bossName: string;
  /** 結束時剩餘的山門耐久。 */
  survivors: number;
  /** 起始耐久，用於顯示「守下了幾成」。 */
  maxDisciples: number;
  /** 本場漏進山門的妖魔數。 */
  leaks: number;
  /** 本場斬殺的妖魔數。 */
  kills: number;
  /** 本場合成出的最高法寶階數。 */
  peakTier: number;
  /** 本場合成次數。 */
  merges: number;
  /** 關底首領是否被斬殺。沒斬掉就不算通關。 */
  bossKilled: boolean;
  /** 是否已經打到首領（首領出過場）。 */
  bossFought: boolean;
  /** 關卡途中拾取的金幣。 */
  goldCollected: number;
  /** 通關／失敗獎勵金幣。 */
  goldReward: number;
  /** 失敗時給玩家的具體診斷，勝利時為 null。 */
  diagnosis: string | null;
  /**
   * 失敗原因，勝利時為 null。
   * breached：山門被攻破；timeout：時限內沒斬掉首領；abandon：玩家中途放棄。
   */
  defeatReason: 'breached' | 'timeout' | 'abandon' | null;
  /** 這一場的戰績原始數字，結算頁的「戰報」用。 */
  telemetry: RunTelemetry;
  /** 這一場實際打了多久（ms），用來把總傷害換算成每秒。 */
  elapsedMs: number;
}
