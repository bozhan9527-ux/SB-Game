/** 場景之間傳遞的資料結構。 */
export interface RunResultData {
  victory: boolean;
  stage: number;
  bossName: string;
  /** 結束時剩餘門人數。 */
  survivors: number;
  /** 本場最高門人數，用於成就統計。 */
  peakDisciples: number;
  arms: number;
  /** 首領戰耗時（ms），沒打到首領為 0。 */
  bossMs: number;
  /** 關卡途中拾取的金幣。 */
  goldCollected: number;
  /** 通關／失敗獎勵金幣。 */
  goldReward: number;
  /** 失敗時給玩家的具體診斷，勝利時為 null。 */
  diagnosis: string | null;
  /**
   * 失敗原因，勝利時為 null。
   * route：還沒走到首領就全滅；wiped：死在首領手上；
   * timeout：時限內沒打死首領；abandon：玩家中途放棄。
   */
  defeatReason: 'route' | 'wiped' | 'timeout' | 'abandon' | null;
}
