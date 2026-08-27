/**
 * 開局配置：把「門派 + 金幣升級等級 + 境界」換算成一場挑戰的起始屬性。
 *
 * 對應玩家在升級畫面買的五條線：起始人數 / 起始防禦 / 起始攻擊 / 金幣蒐集量 / 對首領傷害。
 */
import { BALANCE, SECTS } from '../data';
import type { Sect } from '../data/types';
import type { SaveData } from '../save/types';
import { realmForStage } from './realms';
import { amountOf } from './upgrades';

export interface Loadout {
  sect: Sect;
  stage: number;
  /** 起始人數。 */
  disciples: number;
  /** 每名門人的攻擊。 */
  attack: number;
  /** 防禦，用於減傷。 */
  defense: number;
  /** 起始武裝值。 */
  arms: number;
  /** 武裝值閘門的效果倍率（符修加成）。 */
  armsMultiplier: number;
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

export function buildLoadoutFor(
  sect: Sect,
  upgrades: Readonly<Record<string, number>>,
  stage: number,
): Loadout {
  const { power } = BALANCE;
  const realm = realmForStage(stage);

  return {
    sect,
    stage,
    disciples: Math.max(
      1,
      Math.round(power.baseDisciples + sect.discipleBonus + amountOf(upgrades, 'startDisciples')),
    ),
    attack: Math.max(1, power.baseAttack + sect.attackBonus + amountOf(upgrades, 'startAttack')),
    defense: Math.max(0, power.baseDefense + sect.defenseBonus + amountOf(upgrades, 'startDefense')),
    arms: power.baseArms,
    armsMultiplier: sect.armsMultiplier,
    bossDamageMultiplier: sect.bossDamageMultiplier * (1 + amountOf(upgrades, 'bossDamage') / 100),
    goldMultiplier: sect.goldMultiplier * (1 + amountOf(upgrades, 'goldGain') / 100),
    mobLossMultiplier: sect.mobLossMultiplier,
    realmPowerBonus: realm.powerBonus,
  };
}
