/**
 * 成就：長期目標。
 *
 * 條件只看存檔裡的原始事實（最高關卡、累計通關、單場最高人數…），
 * 不存衍生值，日後要調門檻只要改 data/achievements.json。
 */
import { ACHIEVEMENTS, SECTS } from '../data';
import type { Achievement } from '../data/types';
import type { SaveData } from '../save/types';
import { masteryTier } from './sects';

function reached(save: SaveData, item: Achievement): boolean {
  const { stats } = save.player;
  switch (item.kind) {
    case 'stage':
      return save.world.highestStage >= item.value;
    case 'maxTier':
      return stats.maxTier >= item.value;
    case 'kills':
      return stats.totalKills >= item.value;
    case 'perfect':
      return stats.perfectClears >= item.value;
    case 'clears':
      return save.world.clears >= item.value;
    case 'gold':
      return stats.totalGoldEarned >= item.value;
    case 'sects':
      return stats.clearedSects.length >= item.value;
    case 'sectMastery':
      // 任何一派到達門檻即可。這是「專精一道」的獎勵，不是「四道都練滿」。
      return SECTS.some((sect) => masteryTier(save, sect.id) >= item.value);
    case 'rebirths':
      return save.player.karma.rebirths >= item.value;
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
    case 'maxTier':
      return `最高 ${stats.maxTier} / ${item.value} 階`;
    case 'kills':
      return `${stats.totalKills} / ${item.value} 隻`;
    case 'perfect':
      return stats.perfectClears >= item.value ? '已達成' : '尚未達成';
    case 'clears':
      return `${save.world.clears} / ${item.value} 次`;
    case 'gold':
      return `${stats.totalGoldEarned} / ${item.value}`;
    case 'sects':
      return `${stats.clearedSects.length} / ${item.value} 派`;
    case 'sectMastery': {
      const best = SECTS.reduce((max, sect) => Math.max(max, masteryTier(save, sect.id)), 0);
      return `最高 ${best} / ${item.value} 階`;
    }
    case 'rebirths':
      return `${save.player.karma.rebirths} / ${item.value} 世`;
  }
}
