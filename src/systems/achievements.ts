/**
 * 成就：長期目標。
 *
 * 條件只看存檔裡的原始事實（最高關卡、累計通關、單場最高人數…），
 * 不存衍生值，日後要調門檻只要改 data/achievements.json。
 */
import { ACHIEVEMENTS } from '../data';
import type { Achievement } from '../data/types';
import type { SaveData } from '../save/types';

function reached(save: SaveData, item: Achievement): boolean {
  const { stats } = save.player;
  switch (item.kind) {
    case 'stage':
      return save.world.highestStage >= item.value;
    case 'crowd':
      return stats.maxCrowd >= item.value;
    case 'arms':
      return stats.maxArms >= item.value;
    case 'fastBoss':
      // 唯一的「越小越好」條件，0 代表還沒通關過。
      return stats.fastestBossMs > 0 && stats.fastestBossMs <= item.value;
    case 'clears':
      return save.world.clears >= item.value;
    case 'gold':
      return stats.totalGoldEarned >= item.value;
    case 'sects':
      return stats.clearedSects.length >= item.value;
  }
}

export function isUnlocked(save: SaveData, id: string): boolean {
  return save.player.achievements.includes(id);
}

/** 依目前存檔算出「剛剛達成」的成就，並把它們記進存檔。回傳新達成的清單。 */
export function claimAchievements(save: SaveData): Achievement[] {
  const unlocked: Achievement[] = [];
  for (const item of ACHIEVEMENTS) {
    if (isUnlocked(save, item.id) || !reached(save, item)) continue;
    save.player.achievements.push(item.id);
    unlocked.push(item);
  }
  return unlocked;
}

/** 進度文字，用於成就列表。 */
export function progressOf(save: SaveData, item: Achievement): string {
  const { stats } = save.player;
  switch (item.kind) {
    case 'stage':
      return `${save.world.highestStage} / ${item.value} 關`;
    case 'crowd':
      return `${stats.maxCrowd} / ${item.value} 人`;
    case 'arms':
      return `${stats.maxArms} / ${item.value}`;
    case 'fastBoss':
      return stats.fastestBossMs > 0 ? `最快 ${(stats.fastestBossMs / 1000).toFixed(1)} 秒` : '尚未通關';
    case 'clears':
      return `${save.world.clears} / ${item.value} 次`;
    case 'gold':
      return `${stats.totalGoldEarned} / ${item.value}`;
    case 'sects':
      return `${stats.clearedSects.length} / ${item.value} 派`;
  }
}
