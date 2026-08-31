/**
 * 開局配置：把「門派 + 金幣升級等級 + 境界」換算成一場防守戰的起始耐久與各項乘區。
 *
 * 對應玩家在洞府買的六條線：
 * 聚眾成軍（山門弟子）／御器訣（出手速度）／淬鍊功法（法寶傷害）／
 * 引靈訣（抽符速度）／聚寶之術（金幣）／陣法擴充（場上格位）。
 *
 * 六條線一律是**百分比乘算**。早期版本用固定加值，實測邊界關卡完全不動——
 * 難度是指數曲線，固定加值在後期會被稀釋到看不見（見 PROGRESS 的 L-05）。
 */
import { BALANCE, SECTS } from '../data';
import type { CardDef, Sect } from '../data/types';
import type { SaveData } from '../save/types';
import { karmaAmountOf } from './karma';
import { masteryBonus, masteryTierFor } from './sects';
import { realmForStage } from './realms';
import { starterTalismans, talismanDefs } from './talismans';
import { amountOf } from './upgrades';

/**
 * 這一場的規則修改，來自玩家自己開的挑戰條件。
 *
 * 做成一個物件掛在 loadout 上，而不是散在各處讀存檔：
 * tickCombat 從頭到尾不認得存檔，平衡模擬也才有辦法單獨掃「開了某條會變多難」。
 */
export interface RunRules {
  /** 不能合成——拿掉這個遊戲唯一的指數成長。 */
  noMerge: boolean;
  /** 漏掉任何一隻立刻失守，不是扣耐久。 */
  suddenDeath: boolean;
  /** 首領時限倍率。 */
  bossTimeMultiplier: number;
}

export const NO_RULES: RunRules = {
  noMerge: false,
  suddenDeath: false,
  bossTimeMultiplier: 1,
};

export interface Loadout {
  sect: Sect;
  stage: number;
  /**
   * 這一關的「威脅度」——妖魔強度、法寶階數上限與金幣都看它，不看 stage。
   *
   * 主線 81 關內兩者相同。飛升境則每轉一世往後推一段：**輪迴之後世界會變硬**。
   * 沒有這個分別的話，仙緣買到的力量全部拿去把舊內容輾平，於是每轉一世
   * 前面那幾百關就更空一次（實測滿級洞府第 82～180 關全部是 100% 勝率）。
   *
   * stage 仍然是真正的關卡數：境界名稱、紀錄、上榜都用它，
   * 因為那是玩家認得的那個數字。
   */
  threat: number;
  /**
   * 原本素面的妖魔長出習性的機率。轉世次數越多越高。
   *
   * 習性帶血量折扣，所以它換的是打法不是總量——這正是它能當後期難度旋鈕的原因：
   * 純粹調高血量會直接卡死輸出最低的那一副牌組。
   */
  traitChance: number;
  /** 山門耐久：妖魔攻進山門就扣，歸零即失守。 */
  disciples: number;
  /** 所有法寶的傷害倍率（門派 × 淬鍊功法）。 */
  damageMultiplier: number;
  /** 出手速度倍率（御器訣）。 */
  fireRateMultiplier: number;
  /** 抽符速度倍率（門派 × 引靈訣）。 */
  drawSpeedMultiplier: number;
  /** 對首領的額外傷害倍率（門派專屬，沒有對應的升級線）。 */
  bossDamageMultiplier: number;
  /** 場上可放的法寶格位（陣法擴充）。 */
  fieldSlots: number;
  /** 金幣倍率（門派 × 聚寶之術）。 */
  goldMultiplier: number;
  /** 境界壓制加成。 */
  realmPowerBonus: number;
  /**
   * 這一場帶的四張符，也就是**整個抽符池**。
   *
   * 抽符只從這四種抽，因此合成、陣法、特效組合全部由這裡決定。
   * 它放在 loadout 而不是全域常數的理由：平衡模擬要能一次跑很多套不同的配置。
   */
  talismans: CardDef[];
  /** 這一場的挑戰條件加上去的規則。沒開任何一條時是 NO_RULES。 */
  rules: RunRules;
  /** 仙緣「宿慧未泯」帶來的階數上限加值。跨世永久生效。 */
  tierBonus: number;
}

export function sectById(id: string | null): Sect | null {
  if (id === null) return null;
  return SECTS.find((sect) => sect.id === id) ?? null;
}

/**
 * 一場戰鬥的完整輸入，攤平成純資料。
 *
 * **這個型別存在的理由是「同一份配置不准被組兩次」。** 玩家的機器打完一場，
 * 伺服器要用同一份 tickCombat 重跑一遍來驗證成績——兩邊若各自從各自手上的東西
 * （一邊是存檔、一邊是上報的欄位）拼出 Loadout，只要漏掉一個乘區，
 * 重播的就是另一場仗，而症狀是「合法的成績被當成造假退回」，
 * 錯誤訊息還完全指不到原因。
 *
 * 所以組裝只有一份實作：buildLoadoutFromSpec。存檔那條路徑只是把存檔攤成這個型別。
 */
export interface LoadoutSpec {
  sectId: string;
  stage: number;
  /** 藏經閣通關層數。它決定抽符池——符籙的解鎖不再看關卡進度。 */
  libraryFloor: number;
  talismans: readonly string[];
  upgrades: Readonly<Record<string, number>>;
  /** 仙緣各線的等級（不是換算後的數值）。 */
  karma: Readonly<Record<string, number>>;
  /** 這一派累積了幾次通關，決定修為階數。 */
  sectClears: number;
  /**
   * 這一場的規則，由副本帶進來（一般關卡是空的）。
   *
   * 沿用原本試煉條件的 id：規則本身沒有改，改的是「誰決定要套用它」——
   * 以前是玩家自己挑關卡疊上去，現在是副本自己帶著。
   */
  rules: readonly string[];
  /** 這一場的金幣倍率，同樣由副本帶進來。 */
  goldMultiplier: number;
  /**
   * 上一次轉世時**已經走到的深度**。飛升境的世界依它按比例變硬。
   *
   * 用「已經走過多深」而不是「轉過幾世」：世界該對你的成就作出反應，
   * 而不是對你按了幾次按鈕。而且比例小於 1，所以每一世的淨進度必然為正。
   *
   * 上報時它是**客戶端權威**的：少報會讓伺服器重播出一個比較好打的世界。
   * 這是和升級等級同一類的結構性限制，寫在 server/README。
   */
  bankedStage: number;
  /** 轉世次數。決定妖魔長出習性的機率。 */
  rebirths: number;
}

/**
 * 這一關實際的威脅度。
 *
 * 主線不動，飛升境每轉一世往後推一段——仙緣買到的力量要拿去抵銷它，
 * 而不是把舊內容輾平。
 */
export function threatStage(stage: number, bankedStage: number): number {
  const { minStage, ascendThreatRatio } = BALANCE.rebirth;
  if (stage < minStage) return stage;
  const banked = Math.max(0, Math.floor(bankedStage) - minStage);
  return stage + Math.round(banked * ascendThreatRatio);
}

/** 把存檔攤平成一般關卡的 LoadoutSpec。上報成績時送的也是這一份。 */
export function loadoutSpecOf(save: SaveData, stage: number): LoadoutSpec {
  return {
    sectId: save.player.sectId ?? '',
    stage,
    libraryFloor: save.player.dungeons['library'] ?? 0,
    talismans: [...save.player.talismans],
    upgrades: { ...save.player.upgrades },
    karma: { ...save.player.karma.spent },
    sectClears:
      save.player.sectId === null ? 0 : (save.player.sectClears[save.player.sectId] ?? 0),
    rules: [],
    goldMultiplier: 1,
    bankedStage: save.player.karma.claimedStage,
    rebirths: save.player.karma.rebirths,
  };
}

export function buildLoadoutFromSpec(spec: LoadoutSpec): Loadout {
  const sect = sectById(spec.sectId);
  if (sect === null) throw new Error('尚未選擇門派，無法開始挑戰');
  const has = (id: string): boolean => spec.rules.includes(id);

  const all = talismanDefs(spec.talismans, spec.libraryFloor);
  // 獨門一符：抽符池縮成第一張。每一張都合得起來，階數衝得極快，
  // 但陣法只剩同心、特效完全沒有互補。
  const talismans = has('soloTalisman') ? all.slice(0, 1) : all;

  const loadout = buildLoadoutFor(
    sect,
    spec.upgrades,
    spec.stage,
    talismans,
    masteryBonus(masteryTierFor(spec.sectClears)),
    {
      noMerge: has('noMerge'),
      suddenDeath: has('noLeak'),
      bossTimeMultiplier: has('hasteBoss') ? 0.5 : 1,
    },
    {
      damage: karmaAmountOf(spec.karma, 'karmaPower') / 100,
      gold: karmaAmountOf(spec.karma, 'karmaGold') / 100,
      disciples: karmaAmountOf(spec.karma, 'karmaGate') / 100,
      tierBonus: karmaAmountOf(spec.karma, 'karmaTier'),
    },
  );
  // 孤身守門：容錯幾乎歸零。放在這裡而不是 RunRules 裡，
  // 是因為它改的是一個既有的起始值，不是一條新規則。
  if (has('thinGate')) {
    loadout.disciples = Math.max(1, Math.round(loadout.disciples * 0.3));
  }
  loadout.threat = threatStage(spec.stage, spec.bankedStage);
  const { traitChancePerLife, traitChanceMax } = BALANCE.rebirth;
  loadout.traitChance = Math.min(
    traitChanceMax,
    Math.max(0, Math.floor(spec.rebirths)) * traitChancePerLife,
  );
  loadout.goldMultiplier *= Math.max(1, spec.goldMultiplier);
  return loadout;
}

export function buildLoadout(save: SaveData, stage: number): Loadout {
  return buildLoadoutFromSpec(loadoutSpecOf(save, stage));
}


/**
 * 仙緣帶來的跨世乘區。
 *
 * 和 masteryBonus 同一個理由做成參數而不是從存檔撈：平衡模擬沒有存檔，
 * 而「幾世之後有多強」正是要能單獨掃的一個維度。
 */
export interface KarmaBonuses {
  damage: number;
  gold: number;
  disciples: number;
  tierBonus: number;
}

export const NO_KARMA: KarmaBonuses = { damage: 0, gold: 0, disciples: 0, tierBonus: 0 };

/** 百分比升級換算成倍率。 */
function multiplierOf(upgrades: Readonly<Record<string, number>>, id: string): number {
  return 1 + amountOf(upgrades, id) / 100;
}

/**
 * masteryBonus 是**門派修為**換來的法寶傷害加成（0.12 = +12%）。
 *
 * 它獨立成一個參數而不是從存檔裡撈：平衡模擬沒有存檔，
 * 而「同一個門派在不同修為下有多強」正是要能單獨掃的一個維度。
 */
export function buildLoadoutFor(
  sect: Sect,
  upgrades: Readonly<Record<string, number>>,
  stage: number,
  talismans?: readonly CardDef[],
  masteryBonusValue = 0,
  rules: RunRules = NO_RULES,
  karma: KarmaBonuses = NO_KARMA,
): Loadout {
  const tierBonus = Math.max(0, Math.floor(karma.tierBonus));
  const { power } = BALANCE;
  const realm = realmForStage(stage);
  // 沒指定就用開局那四張。測試與平衡模擬大多跑預設配置，指定的才是在驗特效。
  const pool = talismans === undefined ? talismanDefs(starterTalismans(), 1) : [...talismans];
  if (pool.length === 0) throw new Error('符籙配置不得為空');

  return {
    sect,
    stage,
    // 沒有轉世資訊時威脅度就是關卡本身、妖魔也不額外長習性。
    // 平衡模擬與測試大多走這條路。
    threat: stage,
    traitChance: 0,
    disciples: Math.max(
      1,
      Math.round(
        power.baseDisciples *
          sect.discipleMultiplier *
          multiplierOf(upgrades, 'startDisciples') *
          (1 + Math.max(0, karma.disciples)),
      ),
    ),
    damageMultiplier:
      sect.damageMultiplier *
      multiplierOf(upgrades, 'startAttack') *
      (1 + Math.max(0, masteryBonusValue)) *
      (1 + Math.max(0, karma.damage)),
    fireRateMultiplier: multiplierOf(upgrades, 'startDefense'),
    drawSpeedMultiplier: sect.drawSpeedMultiplier * multiplierOf(upgrades, 'drawSpeed'),
    bossDamageMultiplier: sect.bossDamageMultiplier,
    // 場上格位不再用金幣買：整條「陣法擴充」從洞府移到試劍台。
    // 多一列是打出來的，不是買出來的。
    fieldSlots: BALANCE.field.fieldSlots,
    goldMultiplier:
      sect.goldMultiplier * multiplierOf(upgrades, 'goldGain') * (1 + Math.max(0, karma.gold)),
    realmPowerBonus: realm.powerBonus,
    talismans: pool,
    rules,
    tierBonus,
  };
}
