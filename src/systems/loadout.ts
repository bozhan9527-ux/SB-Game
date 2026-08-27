/**
 * 開局配置：把「門派 + 金幣升級等級 + 境界」換算成一場挑戰的起始屬性與各項乘區。
 *
 * 對應玩家在洞府買的五條線：聚眾成軍 / 護體罡氣 / 淬鍊功法 / 聚寶之術 / 斬妖訣。
 *
 * 五條線一律是**百分比乘算**。早期版本用固定加值（起始人數 +1、起始攻擊 +1…），
 * 實測邊界關卡完全不動——閘門的加算值隨關卡等比放大，固定加值在後期會被稀釋到看不見，
 * 唯一有效的是原本就採乘算的「對首領傷害」。詳見 PROGRESS 的 L-05。
 */
import { BALANCE, SECTS } from '../data';
import type { Sect } from '../data/types';
import type { SaveData } from '../save/types';
import { realmForStage } from './realms';
import { amountOf } from './upgrades';

export interface Loadout {
  sect: Sect;
  stage: number;
  /** 起始人數（已套用聚眾成軍）。 */
  disciples: number;
  /** 每名門人的基礎攻擊。 */
  attack: number;
  /** 防禦，用於減傷。 */
  defense: number;
  /** 起始武裝值。 */
  arms: number;
  /** 武裝值閘門的效果倍率（符修加成）。 */
  armsMultiplier: number;
  /** 人數收益倍率：起始人數與所有人數閘門都乘上它。 */
  discipleMultiplier: number;
  /** 單兵戰力倍率（淬鍊功法）。 */
  attackMultiplier: number;
  /** 減傷倍率（護體罡氣）。 */
  mitigationMultiplier: number;
  /** 對首領傷害倍率＝門派 × (1 + 升級%)。 */
  bossDamageMultiplier: number;
  /** 金幣倍率＝門派 × (1 + 升級%)。 */
  goldMultiplier: number;
  /** 敵陣傷亡倍率。 */
  mobLossMultiplier: number;
  /** 境界壓制加成。 */
  realmPowerBonus: number;
}

export function sectById(id: string | null): Sect | null {
  if (id === null) return null;
  return SECTS.find((sect) => sect.id === id) ?? null;
}

export function buildLoadout(save: SaveData, stage: number): Loadout {
  const sect = sectById(save.player.sectId);
  if (sect === null) throw new Error('尚未選擇門派，無法開始挑戰');
  return buildLoadoutFor(sect, save.player.upgrades, stage);
}

/** 百分比升級換算成倍率。 */
function multiplierOf(upgrades: Readonly<Record<string, number>>, id: string): number {
  return 1 + amountOf(upgrades, id) / 100;
}

export function buildLoadoutFor(
  sect: Sect,
  upgrades: Readonly<Record<string, number>>,
  stage: number,
): Loadout {
  const { power } = BALANCE;
  const realm = realmForStage(stage);
  const discipleMultiplier = multiplierOf(upgrades, 'startDisciples');

  return {
    sect,
    stage,
    disciples: Math.max(
      1,
      Math.round((power.baseDisciples + sect.discipleBonus) * discipleMultiplier),
    ),
    attack: Math.max(1, power.baseAttack + sect.attackBonus),
    defense: Math.max(0, power.baseDefense + sect.defenseBonus),
    arms: power.baseArms,
    armsMultiplier: sect.armsMultiplier,
    discipleMultiplier,
    attackMultiplier: multiplierOf(upgrades, 'startAttack'),
    mitigationMultiplier: multiplierOf(upgrades, 'startDefense'),
    bossDamageMultiplier: sect.bossDamageMultiplier * multiplierOf(upgrades, 'bossDamage'),
    goldMultiplier: sect.goldMultiplier * multiplierOf(upgrades, 'goldGain'),
    mobLossMultiplier: sect.mobLossMultiplier,
    realmPowerBonus: realm.powerBonus,
  };
}
