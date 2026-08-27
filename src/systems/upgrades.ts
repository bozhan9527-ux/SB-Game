/**
 * 金幣升級：五條線的花費與效果換算（數值來自 data/upgrades.json）。
 */
import { UPGRADES } from '../data';
import type { UpgradeTrack } from '../data/types';

export type UpgradeId = string;

export function trackById(id: UpgradeId): UpgradeTrack {
  const track = UPGRADES.find((item) => item.id === id);
  if (track === undefined) throw new Error(`未知的升級項目：${id}`);
  return track;
}

/** 目前等級升到下一級的花費。已滿級回傳 null。 */
export function upgradeCost(track: UpgradeTrack, level: number): number | null {
  if (level >= track.maxLevel) return null;
  return Math.round(track.baseCost * Math.pow(track.costGrowth, level));
}

/** 該等級提供的累計數值（0 級為 0）。 */
export function upgradeAmount(track: UpgradeTrack, level: number): number {
  return track.perLevel * Math.max(0, Math.min(level, track.maxLevel));
}

/** 由等級表取出某條線的累計加成。 */
export function amountOf(levels: Readonly<Record<string, number>>, id: UpgradeId): number {
  return upgradeAmount(trackById(id), levels[id] ?? 0);
}
