/** 場景之間傳遞的資料結構。 */
export interface RunResultData {
  victory: boolean;
  stage: number;
  bossName: string;
  /** 結束時剩餘門人數。 */
  survivors: number;
  arms: number;
  /** 關卡途中拾取的金幣。 */
  goldCollected: number;
  /** 通關／失敗獎勵金幣。 */
  goldReward: number;
  /**
   * 失敗原因，勝利時為 null。
   * route：還沒走到首領就全滅；wiped：死在首領手上；timeout：時限內沒打死首領。
   */
  defeatReason: 'route' | 'wiped' | 'timeout' | null;
}
