/**
 * 存檔結構（TECH_SPEC 第 4 節）。
 *
 * 硬性要求：
 * - 帶版本號，結構變更必須寫遷移（見 migrations.ts）。
 * - 單一可序列化物件，日後可整包上傳至伺服器（第 9 節）。
 * - 不存衍生值：只存等級，實際加成由公式算出。
 * - 時間一律存 Unix ms 絕對時間戳。
 */

export const SAVE_VERSION = 2;
export const SAVE_KEY = 'xianxia_save_v1';

export interface WalletState {
  /** 權威數值集中於 wallet 之下（TECH_SPEC 第 9.3 節）。 */
  gold: number;
}

export interface PlayerState {
  /** 尚未選擇門派時為 null。 */
  sectId: string | null;
  wallet: WalletState;
  /** 升級線 id → 等級。未出現的項目視為 0 級。 */
  upgrades: Record<string, number>;
}

export interface WorldState {
  /** 下一關的關卡編號（1 起算）。 */
  stage: number;
  /** 歷史最高抵達的關卡，用於顯示最高境界。 */
  highestStage: number;
  /** 挑戰次數與通關次數，純統計。 */
  runs: number;
  clears: number;
}

/** 玩家偏好。不是權威數值，純本機設定。 */
export interface SettingsState {
  sound: boolean;
}

export interface SaveData {
  version: number;
  savedAt: number;
  player: PlayerState;
  world: WorldState;
  settings: SettingsState;
}
