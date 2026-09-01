/**
 * 存檔結構（TECH_SPEC 第 4 節）。
 *
 * 硬性要求：
 * - 帶版本號，結構變更必須寫遷移（見 migrations.ts）。
 * - 單一可序列化物件，日後可整包上傳至伺服器（第 9 節）。
 * - 不存衍生值：只存等級，實際加成由公式算出。
 * - 時間一律存 Unix ms 絕對時間戳。
 */

export const SAVE_VERSION = 22;
export const SAVE_KEY = 'xianxia_save_v1';

export interface WalletState {
  /** 權威數值集中於 wallet 之下（TECH_SPEC 第 9.3 節）。 */
  gold: number;
}

/**
 * 雲端存檔的匿名身分。
 *
 * playerId 是「誰」，secret 證明「是他本人」。兩者都在存檔裡，所以
 * **已經做好的存檔碼順便就是雲端身分的救援手段**——換裝置貼碼回來，身分跟著回來。
 *
 * 沒有用過雲端存檔的玩家是 null，不預先產生：產了卻沒用，只是讓每一份存檔碼
 * 都多帶一組沒有意義的亂數。
 */
export interface CloudIdentity {
  playerId: string;
  secret: string;
  /** 最後一次成功同步的時間（Unix ms）。從未同步為 0。 */
  syncedAt: number;
}

/**
 * 輪迴轉世的進度。
 *
 * 只存三個原始事實：轉了幾世、手上還有幾點、已經換過點數的最深關卡。
 * 花掉的點數存等級（spent），實際加成由公式算——和金幣升級同一套規矩。
 */
export interface KarmaState {
  /** 轉世次數。純顯示，也是成就的依據。 */
  rebirths: number;
  /** 尚未花掉的仙緣點。 */
  points: number;
  /** 仙緣線 id → 等級。 */
  spent: Record<string, number>;
  /**
   * 已經換算成點數的最深關卡。
   *
   * 有這一個欄位，同一段進度才不會被反覆轉世刷點——
   * 沒有它，轉世就從一個決定退化成一個必須重複執行的動作。
   */
  claimedStage: number;
}

/**
 * 上次拿到的關卡分布，用來算「你超過幾成修士」。
 *
 * 快取進存檔是為了**離線與伺服器掛掉時還有東西可以顯示**——
 * 百分位晚一天更新沒有人看得出來，但「這一格突然消失」很明顯。
 */
export interface DistributionCache {
  buckets: number[];
  total: number;
  fetchedAt: number;
}

/**
 * 個人最佳紀錄。
 *
 * 無限模式的唯一動機是比較，而這個專案沒有後端、也就沒有排行榜。
 * 在有之前，先讓玩家至少能跟**自己**比：推到多深、打得多快、輸出的頂點在哪。
 * 這幾個數字全部來自一場結束時的戰績，不需要任何伺服器。
 */
export interface RecordsState {
  /** 單場最高每秒輸出。 */
  bestDps: number;
  /** 最快斬掉首領的一場（ms）。沒有紀錄為 0。 */
  fastestClearMs: number;
  /** 單場最高的陣法平均加成（0.42 = +42%）。 */
  bestFormationBonus: number;
  /** 帶著試煉通關過的最深關卡。 */
  bestChallengeStage: number;
  /** 單場最高擊殺數。 */
  bestKills: number;
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
  /**
   * 各門派各自的「門派秘傳」等級（見 src/systems/sect-upgrades.ts）。
   *
   * 和 sectClears 一樣分派記：投入留在那一派身上，換派不會跟著走。
   * 它是用金幣買的，所以和洞府同一個待遇——輪迴時歸零。
   */
  sectDepth: Record<string, number>;
  /**
   * 這一場要開啟的挑戰條件（見 src/systems/challenges.ts）。
   *
   * 存在 player 而不是 world：它是玩家的偏好設定，不是關卡進度的一部分，
   * 通關之後不會被清掉——想連著打十關硬模式的人不該每一關重勾一次。
   */
  challenges: string[];
  /** 曾經帶著這條挑戰通關過的 id。純紀錄，不影響任何數值。 */
  challengesDone: string[];
  records: RecordsState;
  distribution: DistributionCache | null;
  karma: KarmaState;
  cloud: CloudIdentity | null;
  /**
   * 綁定的帳號。沒註冊就是 null——**沒有帳號就不上榜**。
   *
   * **帳號是信箱，name 只是榜上顯示的道號。** 不存密碼：密碼從來沒有
   * 離開過這台裝置，身分那一把密鑰是用它現算出來的（見 src/systems/account.ts）。
   * 鹽留著是為了之後要重算密鑰時不必再問伺服器一次。
   */
  account: { email: string; name: string; salt: string } | null;
  /** 上榜用的名字。沒取過名字是空字串，第一次上榜時才問。 */
  name: string;
  stats: StatsState;
  /**
   * 各副本已通關到第幾層（0 或缺席＝一層都沒過）。
   *
   * 十六張非基礎符只有藏經閣產出，所以這個欄位同時也是**符籙的解鎖來源**——
   * 它不再由「推到第幾關」決定。改制時已解鎖的符一律換算成對應的層數，
   * 沒有人會因為改制少掉任何一張。
   */
  /**
   * 已經**領走獎勵**的成就。
   *
   * 和 achievements（已達成）分開記：達成是事實，領取是動作。
   * 兩者合成一個欄位的話，「有東西可以領」這件事就沒有地方存——
   * 而那正是這次改制要給玩家的東西。
   */
  achievementsClaimed: string[];
  dungeons: Record<string, number>;
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
  /**
   * 是否允許送出匿名的遊玩統計。
   *
   * 預設開啟，但一定要給得起關——遊戲沒有帳號、送的也只有五個不含個資的事件，
   * 可是「有沒有得選」本身就是該給的東西。關掉之後 track() 直接不做事，
   * 不是送出去再由伺服器丟掉。
   */
  telemetry: boolean;
  /**
   * 音效與配樂各自的音量（0～1）。
   *
   * 分成兩條而不是一個總開關：這兩件事的失敗方式完全不同——配樂會膩、音效不會，
   * 而在公車上想關掉的通常是配樂而不是打擊聲。只給一個開關的話，
   * 玩家為了關掉其中一個，會連另一個一起關掉，然後就再也不打開了。
   *
   * sound 保留成總開關（戰鬥中暫停畫面那一顆），和音量是兩層：
   * 實際增益 = 總開關 × 該軌音量。
   */
  sfxVolume: number;
  musicVolume: number;
}

export interface SaveData {
  version: number;
  savedAt: number;
  player: PlayerState;
  world: WorldState;
  settings: SettingsState;
}
