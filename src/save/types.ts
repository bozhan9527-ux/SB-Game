/**
 * 存檔結構（TECH_SPEC 第 4 節）。
 *
 * 硬性要求：
 * - 帶版本號，結構變更必須寫遷移（見 migrations.ts）。
 * - 單一可序列化物件，日後可整包上傳至伺服器（第 9 節）。
 * - 不存衍生值：只存等級，實際加成由公式算出。
 * - 時間一律存 Unix ms 絕對時間戳。
 */

export const SAVE_VERSION = 8;
export const SAVE_KEY = 'xianxia_save_v1';

export interface WalletState {
  /** 權威數值集中於 wallet 之下（TECH_SPEC 第 9.3 節）。 */
  gold: number;
}

/** 成就判定用的長期統計。只存原始事實，不存衍生值。 */
export interface StatsState {
  /** 單場合成出的最高法寶階數。 */
  maxTier: number;
  /** 累計斬殺的妖魔數。 */
  totalKills: number;
  /** 是否曾經零漏怪通關。 */
  perfectClears: number;
  /** 累計獲得的金幣。 */
  totalGoldEarned: number;
  /** 曾用來通關的門派 id。 */
  clearedSects: string[];
}

export interface PlayerState {
  /** 尚未選擇門派時為 null。 */
  sectId: string | null;
  wallet: WalletState;
  /** 升級線 id → 等級。未出現的項目視為 0 級。 */
  upgrades: Record<string, number>;
  /** 已達成的成就 id。 */
  achievements: string[];
  /**
   * 已經看過的教學與提示 id（見 src/systems/tutorial.ts）。
   * 只存「看過什麼」，不存「現在教到第幾步」——教學進度是單場的事，不該進存檔。
   */
  hints: string[];
  /**
   * 帶進場的四張符（見 src/systems/talismans.ts）。
   *
   * 只存 id，不存那四張符的數值——數值全在 cards.json，改了平衡不該要求玩家重選。
   * 存到的 id 可能已經失效（改版、手改存檔），讀取端一律走 sanitizeTalismans 修補。
   */
  talismans: string[];
  /**
   * 各門派各自累積的通關次數，也就是「門派修為」的原始事實。
   *
   * 分派記而不是記一個總數，是這整條設計的關鍵：修為留在門派身上，
   * 換派時不會跟著走，也不會被沒收——回來就還在。門派因此變成一個要投入的身分，
   * 而不是一個隨時可改的修飾選單。存等級是衍生值，所以只存次數。
   */
  sectClears: Record<string, number>;
  stats: StatsState;
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
  /**
   * 遊戲速度倍率（1／2／3）。
   *
   * 記在存檔而不是每場重設：玩家一旦決定用 2×，就是決定了整個遊玩節奏，
   * 每一關都要他重按一次是在懲罰他做過的選擇。
   */
  speed: number;
}

export interface SaveData {
  version: number;
  savedAt: number;
  player: PlayerState;
  world: WorldState;
  settings: SettingsState;
}
