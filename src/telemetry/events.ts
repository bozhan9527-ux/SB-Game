/**
 * 遙測事件的定義。
 *
 * **只有五個事件，而且是刻意的。** 每多埋一個事件，日後就多一份要維護的欄位、
 * 多一份可能與程式碼走散的假設。這五個是為了回答四個具體問題挑出來的：
 *
 * - 玩家在第幾關流失 → stageStart / stageEnd
 * - 教學有幾個人看完第一課 → tutorialStep
 * - 4845 種符籙組合實際被用過幾種 → loadoutSet
 * - 有多少人撞到深處那道牆 → stageEnd 的 stage 與 victory
 *
 * 全部不含任何可辨識個人的資料：沒有帳號、沒有 IP 以外的識別、
 * 沒有自由文字。裝置的匿名 id 由 posthog-js 自己產生與保存。
 *
 * 本檔不 import Phaser，也不 import posthog——它只是一份型別。
 */

export interface TelemetryEvents {
  /** 開遊戲。回答「有多少人回來」與「他們停在哪一關」。 */
  app_open: {
    stage: number;
    highest_stage: number;
    clears: number;
    runs: number;
    sect: string | null;
    rebirths: number;
    /** 這台裝置第一次開遊戲（存檔還是全新的）。 */
    is_new: boolean;
  };

  /** 一關開始。與 stage_end 成對，兩者的差就是中離。 */
  stage_start: {
    stage: number;
    realm: string;
    sect: string | null;
    /** 帶進場的四張，排序後以逗號連接——排序過才聚合得起來。 */
    talismans: string;
    challenges: string;
    speed: number;
    field_slots: number;
  };

  /** 一關結束。流失漏斗與難度曲線都靠這一個。 */
  stage_end: {
    stage: number;
    victory: boolean;
    /** breached／timeout／abandon，勝利時為 null。 */
    reason: string | null;
    duration_ms: number;
    leaks: number;
    kills: number;
    peak_tier: number;
    merges: number;
    boss_killed: boolean;
    /** 這一場的平均每秒輸出與陣法加成，用來看「卡關的人是輸出不夠還是排法不對」。 */
    dps: number;
    formation_bonus: number;
  };

  /** 教學走到哪一步。完成率就是 watch 除以 deploy。 */
  tutorial_step: { step: string };

  /** 玩家改了帶進場的四張。回答「二十張裡實際被用到幾種」。 */
  loadout_set: {
    talismans: string;
    sect: string | null;
    highest_stage: number;
  };
}

export type TelemetryEventName = keyof TelemetryEvents;
