/**
 * 主畫面功能的開放節奏（v23 測試版）。
 *
 * 改版前第一次進主畫面就攤開洞府、符籙譜、門派、副本、榜單五顆——新手不知道先點哪一個，
 * 而後面也就沒有任何「新東西」可期待。改成跟著進度一顆一顆開，大約每幾分鐘一個
 * （見 ROGUELITE_DESIGN.md 的功能解鎖時間表）。飛升過的人全部直接開。
 *
 * 看的是歷史最高關卡，不是這一世的進度：開過的東西不會因為重來而又鎖起來。
 */
import type { SaveData } from '../save/types';

export type Feature = 'upgrade' | 'talisman' | 'leaderboard' | 'sect' | 'dungeon';

export const FEATURE_STAGE: Readonly<Record<Feature, number>> = {
  upgrade: 2,
  talisman: 4,
  leaderboard: 5,
  sect: 6,
  dungeon: 10,
};

export function featureOpen(save: SaveData, feature: Feature): boolean {
  if (save.player.karma.rebirths > 0) return true;
  return save.world.highestStage >= FEATURE_STAGE[feature];
}

/** 還沒開的按鈕上寫的字。 */
export function featureHint(feature: Feature): string {
  return `第 ${FEATURE_STAGE[feature]} 關開放`;
}
