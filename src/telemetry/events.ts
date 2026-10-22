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
  /** 關間奇遇選了哪一個（skip 為不理會）。回答「哪幾個奇遇沒人要」。 */
  omen_pick: {
    omen: string;
    stage: number;
  };

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
    /** 這一場是哪個副本（一般關卡為 null），以及第幾層。 */
    dungeon: string | null;
    dungeon_floor: number;
    /**
     * 這一場是不是重挑一個已經過掉的關卡。
     *
     * 一定要分得開：重挑是一個已經過關的人帶著現在的養成回頭打，
     * 難度和第一次完全不是同一回事，混進去會把主線的難度曲線洗平。
     */
    replay: boolean;
    speed: number;
    field_slots: number;
  };

  /** 一關結束。流失漏斗與難度曲線都靠這一個。 */
  stage_end: {
    stage: number;
    /** 和 stage_start 同一個理由：重挑的一場不能混進主線的難度曲線裡。 */
    replay: boolean;
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

  /**
   * 機緣三選一選了哪一張（v23）。回答「哪幾張沒人要」與「哪幾張選了之後勝率特別高」。
   * offered 是這一次的候選（逗號連接），沒被選的那兩張才看得出偏好。
   */
  blessing_pick: {
    stage: number;
    id: string;
    stars: number;
    rare: boolean;
    offered: string;
  };

  /** 重抽了一次機緣。 */
  blessing_reroll: { stage: number };

  /**
   * 一局（一境）結束：破境或山門被破。回答「硬派的一境一局會不會太挫折」——
   * 在哪一境、第幾層、帶著幾張機緣倒下。
   */
  realm_run_end: {
    stage: number;
    start_stage: number;
    broke_through: boolean;
    blessings: number;
  };

  /** 飛升。回答「大家敢背多少劫」。 */
  ascend: {
    lives: number;
    jie: number;
    heaven: number;
    gained: number;
  };

  /** 用靈石買外觀（時裝、武器外觀、符紙）。回答「哪一件賣得動」。 */
  costume_buy: {
    id: string;
    price: number;
    /** costume／weapon／paper（v0.10.3 起才有）。 */
    kind?: string;
  };

  /** 平台付款成功、靈石入帳。 */
  stones_purchase: {
    item: string;
    stones: number;
  };
}

export type TelemetryEventName = keyof TelemetryEvents;
