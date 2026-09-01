import type { RunTelemetry } from "../systems/defense";
import type { ReplayAction } from "../systems/replay";
import type { ScoreLoadout } from "../net/protocol";

/**
 * 上榜要用的原始資料。
 *
 * 教學那一場是 null——教學會改寫起手牌，光有種子重播不出同一場，
 * 所以它不能上榜。這個欄位為 null 就代表「這一場不可驗證」。
 */
export interface RunSubmission {
  runs: number;
  steps: number;
  actions: ReplayAction[];
  /**
   * 開打那一刻的配置。
   *
   * **在這裡存一份，而不是上報時從存檔現算**：結算頁在送出之前已經改過存檔了
   * （通關次數 +1，而門派修為每五次升一階），現算的那一份會比實際打的那一場強，
   * 伺服器重播就走散了。種子的另一半（runs）當初就是為了同一個理由當場記下來的。
   */
  loadout: ScoreLoadout;
}

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
  defeatReason: "breached" | "timeout" | "abandon" | null;
  /** 這一場的戰績原始數字，結算頁的「戰報」用。 */
  telemetry: RunTelemetry;
  /** 這一場實際打了多久（ms），用來把總傷害換算成每秒。 */
  elapsedMs: number;
  /**
   * 無限模式下這一場連下了幾關。不是無限模式時為 null。
   *
   * 無限模式沒有「通關」這個結局，一定是打到守不住為止，所以 victory 永遠是 false。
   * 結算頁要靠這個數字把那一場講成「深入到哪」而不是「又輸了」。
   */
  endlessCleared: number | null;
  /** 上榜用的重播資料；不可驗證的一場為 null。 */
  submission: RunSubmission | null;
  /**
   * 這一場是哪個副本的第幾層。一般關卡是 null。
   *
   * 副本的一場**不推進主線、也不上榜**：它的深度是副本決定的，
   * 把它記進「你推到第幾關」等於用一個比較好打的環境灌進度。
   */
  dungeon: { id: string; floor: number } | null;
}

/** 進入戰鬥時傳給 RunScene 的資料。一般關卡不傳。 */
export interface RunEntryData {
  dungeonId?: string;
  floor?: number;
}
