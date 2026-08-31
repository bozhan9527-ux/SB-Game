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
import { challengeDefsOf } from './challenges';
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
  /** 帶哪四張符看的是**歷史最高關卡**而不是這一關：重打舊關卡時不該被沒收選擇。 */
  highestStage: number;
  talismans: readonly string[];
  upgrades: Readonly<Record<string, number>>;
  /** 仙緣各線的等級（不是換算後的數值）。 */
  karma: Readonly<Record<string, number>>;
  /** 這一派累積了幾次通關，決定修為階數。 */
  sectClears: number;
  challenges: readonly string[];
}

/** 把存檔攤平成 LoadoutSpec。上報成績時送的也是這一份。 */
export function loadoutSpecOf(save: SaveData, stage: number): LoadoutSpec {
  return {
    sectId: save.player.sectId ?? '',
    stage,
    highestStage: save.world.highestStage,
    talismans: [...save.player.talismans],
    upgrades: { ...save.player.upgrades },
    karma: { ...save.player.karma.spent },
    sectClears:
      save.player.sectId === null ? 0 : (save.player.sectClears[save.player.sectId] ?? 0),
    challenges: [...save.player.challenges],
  };
}

export function buildLoadoutFromSpec(spec: LoadoutSpec): Loadout {
  const sect = sectById(spec.sectId);
  if (sect === null) throw new Error('尚未選擇門派，無法開始挑戰');
  const challenges = challengeDefsOf(spec.challenges, spec.highestStage);
  const has = (id: string): boolean => challenges.some((item) => item.id === id);

  const all = talismanDefs(spec.talismans, spec.highestStage);
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
  loadout.goldMultiplier *= challenges.reduce((total, item) => total * item.goldMultiplier, 1);
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
    fieldSlots: BALANCE.field.fieldSlots + amountOf(upgrades, 'fieldSlots'),
    goldMultiplier:
      sect.goldMultiplier * multiplierOf(upgrades, 'goldGain') * (1 + Math.max(0, karma.gold)),
    realmPowerBonus: realm.powerBonus,
    talismans: pool,
    rules,
    tierBonus,
  };
}
