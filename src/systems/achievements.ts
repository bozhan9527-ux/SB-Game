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
    case 'dungeonFloors':
      return totalFloors(save) >= item.value;
    case 'libraryFloors':
      return (save.player.dungeons['library'] ?? 0) >= item.value;
    case 'sectMasteryAll':
      // 四派**全部**到門檻。和 sectMastery 的「任一派」是相反的目標：
      // 前者獎勵專精，這一條獎勵全都練過一輪。
      return SECTS.every((sect) => masteryTier(save, sect.id) >= item.value);
    case 'karmaLevels':
      return karmaLevels(save) >= item.value;
  }
}

/** 五個副本累計通關幾層。 */
function totalFloors(save: SaveData): number {
  return Object.values(save.player.dungeons).reduce((sum, value) => sum + Math.max(0, value), 0);
}

/** 仙緣總共買了幾級。轉世之後唯一會一直長的數字。 */
function karmaLevels(save: SaveData): number {
  return Object.values(save.player.karma.spent).reduce((sum, value) => sum + Math.max(0, value), 0);
}

export function isUnlocked(save: SaveData, id: string): boolean {
  return save.player.achievements.includes(id);
}

/**
 * 依目前存檔算出「剛剛達成」的成就，記進存檔。回傳新達成的清單。
 *
 * **只記達成，不發獎勵。** 獎勵要玩家自己到仙途錄點——達成的當下自動入帳，
 * 那筆金幣會混在結算畫面一堆數字裡，玩家根本不會注意到自己拿了什麼。
 * 分成兩步之後，「有東西可以領」本身變成一個會讓人想點進去的狀態。
 */
export function detectAchievements(save: SaveData): Achievement[] {
  const unlocked: Achievement[] = [];
  for (const item of ACHIEVEMENTS) {
    if (isUnlocked(save, item.id) || !reached(save, item)) continue;
    save.player.achievements.push(item.id);
    unlocked.push(item);
  }
  return unlocked;
}

export function isClaimed(save: SaveData, id: string): boolean {
  return save.player.achievementsClaimed.includes(id);
}

/** 達成了但還沒領的。仙途錄的入口要標這個數字，否則玩家不知道有東西可拿。 */
export function pendingAchievements(save: SaveData): Achievement[] {
  return ACHIEVEMENTS.filter((item) => isUnlocked(save, item.id) && !isClaimed(save, item.id));
}

/** 領走一條的獎勵。回傳實際入帳的金幣（已領過或還沒達成回 0）。 */
export function claimReward(save: SaveData, id: string): number {
  const item = ACHIEVEMENTS.find((entry) => entry.id === id);
  if (item === undefined) return 0;
  if (!isUnlocked(save, id) || isClaimed(save, id)) return 0;
  save.player.achievementsClaimed.push(id);
  return item.reward;
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
    case 'dungeonFloors':
      return `${totalFloors(save)} / ${item.value} 層`;
    case 'libraryFloors':
      return `${save.player.dungeons['library'] ?? 0} / ${item.value} 層`;
    case 'sectMasteryAll': {
      const worst = SECTS.reduce((min, sect) => Math.min(min, masteryTier(save, sect.id)), 99);
      return `最低 ${worst} / ${item.value} 階`;
    }
    case 'karmaLevels':
      return `${karmaLevels(save)} / ${item.value} 級`;
  }
}
