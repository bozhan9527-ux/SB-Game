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
import { realmForStage } from './realms';
import { starterTalismans, talismanDefs } from './talismans';
import { amountOf } from './upgrades';

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
}

export function sectById(id: string | null): Sect | null {
  if (id === null) return null;
  return SECTS.find((sect) => sect.id === id) ?? null;
}

export function buildLoadout(save: SaveData, stage: number): Loadout {
  const sect = sectById(save.player.sectId);
  if (sect === null) throw new Error('尚未選擇門派，無法開始挑戰');
  // 帶哪四張符看的是**歷史最高關卡**而不是這一關：重打舊關卡時不該被沒收選擇。
  const talismans = talismanDefs(save.player.talismans, save.world.highestStage);
  return buildLoadoutFor(sect, save.player.upgrades, stage, talismans);
}

/** 百分比升級換算成倍率。 */
function multiplierOf(upgrades: Readonly<Record<string, number>>, id: string): number {
  return 1 + amountOf(upgrades, id) / 100;
}

export function buildLoadoutFor(
  sect: Sect,
  upgrades: Readonly<Record<string, number>>,
  stage: number,
  talismans?: readonly CardDef[],
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
    damageMultiplier: sect.damageMultiplier * multiplierOf(upgrades, 'startAttack'),
    fireRateMultiplier: multiplierOf(upgrades, 'startDefense'),
    drawSpeedMultiplier: sect.drawSpeedMultiplier * multiplierOf(upgrades, 'drawSpeed'),
    bossDamageMultiplier: sect.bossDamageMultiplier,
    fieldSlots: BALANCE.field.fieldSlots + amountOf(upgrades, 'fieldSlots'),
    goldMultiplier: sect.goldMultiplier * multiplierOf(upgrades, 'goldGain'),
    realmPowerBonus: realm.powerBonus,
    talismans: pool,
  };
}
