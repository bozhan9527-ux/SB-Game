/**
 * 存檔遷移（TECH_SPEC 第 4.2 節）。
 *
 * 規則：存檔結構一有變更就把 SAVE_VERSION +1，並在此陣列尾端追加一支遷移函式，
 * 索引 i 的函式負責 v(i+1) → v(i+2)。禁止改結構而不寫遷移。
 */
import { CARDS } from '../data';

export type Migration = (data: Record<string, unknown>) => Record<string, unknown>;

/** v1 → v2：加入音效開關。舊存檔沒有這個欄位，預設開啟。 */
const addSettings: Migration = (data) => ({
  ...data,
  settings: { sound: true },
});

/** v2 → v3：加入成就與長期統計。舊存檔沒有這些欄位，一律從零開始累計。 */
const addAchievements: Migration = (data) => {
  const player = (data['player'] ?? {}) as Record<string, unknown>;
  return {
    ...data,
    player: {
      ...player,
      achievements: [],
      stats: { maxCrowd: 0, maxArms: 0, fastestBossMs: 0, totalGoldEarned: 0, clearedSects: [] },
    },
  };
};

/**
 * v3 → v4：玩法由閘門跑酷改為山門防守，長期統計換成新玩法的原始事實。
 * 金幣、關卡進度、升級等級與已達成的成就一律保留；只有統計欄位重新開始累計
 * （舊的「單場人數／武裝值」在新玩法裡沒有對應的量）。
 */
const toDefenseStats: Migration = (data) => {
  const player = (data['player'] ?? {}) as Record<string, unknown>;
  const old = (player['stats'] ?? {}) as Record<string, unknown>;
  return {
    ...data,
    player: {
      ...player,
      stats: {
        maxTier: 0,
        totalKills: 0,
        perfectClears: 0,
        totalGoldEarned: typeof old['totalGoldEarned'] === 'number' ? old['totalGoldEarned'] : 0,
        clearedSects: Array.isArray(old['clearedSects']) ? old['clearedSects'] : [],
      },
    },
  };
};

/**
 * v4 → v5：加入新手教學與一次性提示的紀錄。
 * 舊玩家（存檔已存在）視為已經會玩，不再被教學打斷；新玩家才會走教學。
 */
const addHints: Migration = (data) => {
  const player = (data['player'] ?? {}) as Record<string, unknown>;
  const world = (data['world'] ?? {}) as Record<string, unknown>;
  const played = typeof world['runs'] === 'number' && world['runs'] > 0;
  return {
    ...data,
    player: { ...player, hints: played ? ['tutorial'] : [] },
  };
};

/**
 * v5 → v6：加入符籙配置（二十張裡帶四張）。
 *
 * 舊存檔一律給開局那四張——那正是舊版本唯一存在的抽符池，
 * 所以老玩家的下一場會和他上一場玩到的完全一樣，不會因為改版突然變成另一個遊戲。
 * 這裡刻意寫死 id 而不是呼叫 starterTalismans()：遷移是對「歷史上的那一版存檔」
 * 做的一次性轉換，它的正確性不該隨著日後 cards.json 怎麼改而改變。
 */
const addTalismans: Migration = (data) => {
  const player = (data['player'] ?? {}) as Record<string, unknown>;
  return {
    ...data,
    player: { ...player, talismans: ['sword', 'bolt', 'fan', 'flame'] },
  };
};

/** v6 → v7：加入遊戲速度偏好。舊存檔一律是 1×，也就是他們原本玩到的速度。 */
const addSpeed: Migration = (data) => {
  const settings = (data['settings'] ?? {}) as Record<string, unknown>;
  return { ...data, settings: { ...settings, speed: 1 } };
};

/**
 * v7 → v8：加入門派修為（各門派各自累積的通關次數）。
 *
 * 舊存檔沒有逐派的紀錄，只有「曾用哪些門派通關過」這份名單。
 * 一律以每派 1 次補上：這是名單唯一保證為真的下界，寧可少算也不憑空給修為——
 * 修為會直接換成傷害加成，浮報等於偷偷把舊玩家的難度調低。
 */
const addSectClears: Migration = (data) => {
  const player = (data['player'] ?? {}) as Record<string, unknown>;
  const stats = (player['stats'] ?? {}) as Record<string, unknown>;
  const cleared = Array.isArray(stats['clearedSects']) ? stats['clearedSects'] : [];
  const sectClears: Record<string, number> = {};
  for (const id of cleared) if (typeof id === 'string') sectClears[id] = 1;
  return { ...data, player: { ...player, sectClears } };
};

/** v8 → v9：加入挑戰條件。舊存檔一律沒開任何一條，也沒有達成紀錄。 */
const addChallenges: Migration = (data) => {
  const player = (data['player'] ?? {}) as Record<string, unknown>;
  return { ...data, player: { ...player, challenges: [], challengesDone: [] } };
};

/**
 * v9 → v10：加入個人最佳紀錄。
 *
 * 一律從零開始：這幾個數字要靠一場結束時的戰績才算得出來，而戰績是這一版才開始收的。
 * 舊存檔沒有任何依據可以回推，硬填一個數字只會讓第一筆「新紀錄」永遠打不破。
 */
const addRecords: Migration = (data) => {
  const player = (data['player'] ?? {}) as Record<string, unknown>;
  return {
    ...data,
    player: {
      ...player,
      records: {
        bestDps: 0,
        fastestClearMs: 0,
        bestFormationBonus: 0,
        bestChallengeStage: 0,
        bestKills: 0,
      },
    },
  };
};

/**
 * v10 → v11：加入輪迴轉世。
 *
 * claimedStage 補 0 而不是補目前的 highestStage：已經推到飛升境的老玩家
 * 應該能立刻用那段進度換到第一次的仙緣點，那是他已經打出來的東西。
 */
const addKarma: Migration = (data) => {
  const player = (data['player'] ?? {}) as Record<string, unknown>;
  return { ...data, player: { ...player, karma: { rebirths: 0, points: 0, spent: {}, claimedStage: 0 } } };
};

/**
 * v11 → v12：加入閉關的起算時間。
 *
 * 沿用該存檔的 savedAt 當起點，而不是「現在」：舊玩家上次關掉遊戲的那一刻
 * 本來就是他開始閉關的時刻，這樣他一回來就領得到，不必再等八小時。
 */
const addRetreat: Migration = (data) => {
  const world = (data['world'] ?? {}) as Record<string, unknown>;
  const savedAt = typeof data['savedAt'] === 'number' ? data['savedAt'] : 0;
  return { ...data, world: { ...world, retreatAt: savedAt } };
};

/** v12 → v13：加入匿名遊玩統計的開關。舊存檔預設開啟，和新檔一致。 */
const addTelemetrySetting: Migration = (data) => {
  const settings = (data['settings'] ?? {}) as Record<string, unknown>;
  return { ...data, settings: { ...settings, telemetry: true } };
};

/**
 * v13 → v14：加入雲端存檔的身分欄位。
 *
 * 補 null 而不是當場產一組：遷移是純函式，不該去碰 crypto，
 * 而且沒用過雲端的人不需要那組亂數。第一次同步時才產生。
 */
const addCloudIdentity: Migration = (data) => {
  const player = (data['player'] ?? {}) as Record<string, unknown>;
  return { ...data, player: { ...player, cloud: null } };
};

/** v14 → v15：加入上榜名稱與關卡分布的快取。名字留空，第一次上榜時才問。 */
const addLeaderboardFields: Migration = (data) => {
  const player = (data['player'] ?? {}) as Record<string, unknown>;
  return { ...data, player: { ...player, name: '', distribution: null } };
};

/**
 * v15 → v16：音效與配樂拆成兩條音量。
 *
 * 舊存檔一律給滿——他們原本聽到的就是滿音量，把任何人的音量調小都是
 * 「改制順便動了玩家已經有的東西」。原本的 sound 保留成總開關，語意不變。
 */
const addVolumes: Migration = (data) => {
  const settings = (data['settings'] ?? {}) as Record<string, unknown>;
  return { ...data, settings: { ...settings, sfxVolume: 1, musicVolume: 1 } };
};

/**
 * v16 → v17：試煉改成副本，符籙的解鎖來源跟著換人。
 *
 * 這是整條遷移鏈裡最需要小心的一支：**符籙原本由「推到第幾關」解鎖，
 * 現在由「藏經閣打到第幾層」解鎖**。什麼都不做的話，一個推到第 139 關、
 * 手上有二十張符的老玩家，改版之後會只剩四張——那是把他打出來的東西沒收掉。
 *
 * 所以這裡把已解鎖的張數直接換算成層數：第 N 張非基礎符對應藏經閣第 N 層。
 * 兩邊的順序都是 cards.json 的順序，所以這個對應是一對一的。
 *
 * 換算刻意用「已解鎖」而不是「已帶在身上」：帶在身上的只有四張，
 * 而他解鎖的是全部——沒收的標準要看他曾經取得什麼，不是他現在用什麼。
 */
const addDungeons: Migration = (data) => {
  const player = (data['player'] ?? {}) as Record<string, unknown>;
  const world = (data['world'] ?? {}) as Record<string, unknown>;
  const highest = typeof world['highestStage'] === 'number' ? world['highestStage'] : 1;
  // 非基礎符 = unlockStage 大於 1 的那些，順序即解鎖順序。
  const earned = CARDS.filter((card) => card.unlockStage > 1 && card.unlockStage <= Math.max(1, highest));
  const dungeons: Record<string, number> = {};
  if (earned.length > 0) dungeons['library'] = earned.length;
  return { ...data, player: { ...player, dungeons, dungeonFieldSlots: 0 } };
};

/**
 * v17 → v18：成就改成手動領取。
 *
 * **已經達成的一律標記為已領取。** 舊制是達成當下自動入帳，所以那些獎勵
 * 玩家早就拿過了；不標記的話，改版之後他一進仙途錄就能把十九條全部再領一次。
 * 這條遷移是為了不讓改制變成一次大放送。
 */
const addAchievementClaims: Migration = (data) => {
  const player = (data['player'] ?? {}) as Record<string, unknown>;
  const earned = Array.isArray(player['achievements'])
    ? player['achievements'].filter((id): id is string => typeof id === 'string')
    : [];
  return { ...data, player: { ...player, achievementsClaimed: earned } };
};

/**
 * v18 → v19：取消閉關（離線收益）。
 *
 * 只是把不再有意義的欄位拿掉。之所以還是要寫一支遷移而不是靜靜忽略它：
 * 版本號與遷移鏈是一一對應的，缺一格之後每一支後續遷移都會對到錯的版本，
 * 而那種錯不會當場爆炸，只會讓某個版本的存檔被套上別人的遷移。
 */
const dropRetreat: Migration = (data) => {
  const world = (data['world'] ?? {}) as Record<string, unknown>;
  const { retreatAt: _retreatAt, ...rest } = world;
  return { ...data, world: rest };
};

/**
 * v19 → v20：陣法格位固定成 3×3，額外格位的欄位整條拿掉。
 *
 * 這支遷移同時修一個真實的災情：試劍台曾經因為兩個 bug（場景資料沿用、
 * 以及已通過的層重複發獎）不斷累加格位，製作人的存檔一度長到十八格。
 * 欄位拿掉之後那些多出來的格位自然消失。
 */
const dropFieldSlots: Migration = (data) => {
  const player = (data['player'] ?? {}) as Record<string, unknown>;
  const { dungeonFieldSlots: _slots, ...rest } = player;
  return { ...data, player: rest };
};

/**
 * v20 → v21：加上門派秘傳的等級表。
 *
 * 舊存檔一律從 0 級開始——這條線是新的，沒有可以換算的舊資料。
 */
const addSectDepth: Migration = (data) => {
  const player = (data['player'] ?? {}) as Record<string, unknown>;
  return { ...data, player: { ...player, sectDepth: {} } };
};

/** 索引 i 的函式負責 v(i+1) → v(i+2)。新增時往後 push，不得插隊或修改既有項目。 */
export const MIGRATIONS: readonly Migration[] = [
  addSettings,
  addAchievements,
  toDefenseStats,
  addHints,
  addTalismans,
  addSpeed,
  addSectClears,
  addChallenges,
  addRecords,
  addKarma,
  addRetreat,
  addTelemetrySetting,
  addCloudIdentity,
  addLeaderboardFields,
  addVolumes,
  addDungeons,
  addAchievementClaims,
  dropRetreat,
  dropFieldSlots,
  addSectDepth,
];

/**
 * 把任意版本的存檔套用至最新版。
 * 版本高於目前程式（玩家降版）時原樣回傳，交由上層決定是否放棄該存檔。
 */
export function migrate(data: Record<string, unknown>, targetVersion: number): Record<string, unknown> {
  let current = data;
  let version = typeof current['version'] === 'number' ? (current['version'] as number) : 1;

  while (version < targetVersion) {
    const migration = MIGRATIONS[version - 1];
    if (migration === undefined) break;
    current = migration(current);
    version += 1;
    current['version'] = version;
  }
  return current;
}
