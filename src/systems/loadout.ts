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
import { challengeGoldMultiplier, hasChallenge } from './challenges';
import { masteryBonus, masteryTier } from './sects';
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
}

export function sectById(id: string | null): Sect | null {
  if (id === null) return null;
  return SECTS.find((sect) => sect.id === id) ?? null;
}

export function buildLoadout(save: SaveData, stage: number): Loadout {
  const sect = sectById(save.player.sectId);
  if (sect === null) throw new Error('尚未選擇門派，無法開始挑戰');
  // 帶哪四張符看的是**歷史最高關卡**而不是這一關：重打舊關卡時不該被沒收選擇。
  const all = talismanDefs(save.player.talismans, save.world.highestStage);
  // 獨門一符：抽符池縮成第一張。每一張都合得起來，階數衝得極快，
  // 但陣法只剩同心、特效完全沒有互補。
  const solo = hasChallenge(save, 'soloTalisman');
  const talismans = solo ? all.slice(0, 1) : all;
  const mastery = masteryBonus(masteryTier(save, sect.id));
  const loadout = buildLoadoutFor(sect, save.player.upgrades, stage, talismans, mastery, {
    noMerge: hasChallenge(save, 'noMerge'),
    suddenDeath: hasChallenge(save, 'noLeak'),
    bossTimeMultiplier: hasChallenge(save, 'hasteBoss') ? 0.5 : 1,
  });
  // 孤身守門：容錯幾乎歸零。放在這裡而不是 RunRules 裡，
  // 是因為它改的是一個既有的起始值，不是一條新規則。
  if (hasChallenge(save, 'thinGate')) {
    loadout.disciples = Math.max(1, Math.round(loadout.disciples * 0.3));
  }
  loadout.goldMultiplier *= challengeGoldMultiplier(save);
  return loadout;
}

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
): Loadout {
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
        power.baseDisciples * sect.discipleMultiplier * multiplierOf(upgrades, 'startDisciples'),
      ),
    ),
    damageMultiplier:
      sect.damageMultiplier * multiplierOf(upgrades, 'startAttack') * (1 + Math.max(0, masteryBonusValue)),
    fireRateMultiplier: multiplierOf(upgrades, 'startDefense'),
    drawSpeedMultiplier: sect.drawSpeedMultiplier * multiplierOf(upgrades, 'drawSpeed'),
    bossDamageMultiplier: sect.bossDamageMultiplier,
    fieldSlots: BALANCE.field.fieldSlots + amountOf(upgrades, 'fieldSlots'),
    goldMultiplier: sect.goldMultiplier * multiplierOf(upgrades, 'goldGain'),
    realmPowerBonus: realm.powerBonus,
    talismans: pool,
    rules,
  };
}
