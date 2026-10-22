/**
 * 每日挑戰（第三階段）。
 *
 * 全服同一組：門派、四張符、兩張機緣（二星）、一種天劫，都由「今天是第幾天」決定。
 * 規則照試劍台——加成全歸零、從第 1 關打到守不住為止——所以榜上比的只有排陣與合成，
 * 而且每天換一組，昨天的最佳解今天不一定管用。
 *
 * 閉關（離線收益）在 2026-08 被拿掉過，理由是「獎勵應該來自打，不是來自等」。
 * 每日挑戰是同一個需求（每天回來一次的理由）的另一個答案：要打才有。
 *
 * 本檔不 import Phaser，全部是純函式；伺服器重播時用同一份算出同一組配置。
 */
import { BLESSINGS, CARDS, SECTS, TRIBULATIONS } from '../data';
import type { SaveData } from '../save/types';
import { createRng } from './rng';

/** 台北時間午夜換日。 */
const DAY_EPOCH = Date.UTC(2023, 11, 31, 16);
const DAY_MS = 24 * 60 * 60 * 1000;

export function dayOf(now: number): number {
  return Math.max(0, Math.floor((now - DAY_EPOCH) / DAY_MS));
}

/** 規則字串：資料裡寫 `daily`，開打時換成 `daily:天數`。 */
export const DAILY_RULE = 'daily';
export const DAILY_ID = 'daily';

export function dailyRule(rules: readonly string[]): number | null {
  for (const rule of rules) {
    const match = /^daily:(\d+)$/.exec(rule);
    if (match !== null) return Number(match[1]);
  }
  return null;
}

export interface DailyConfig {
  day: number;
  sectId: string;
  talismans: string[];
  blessings: Record<string, number>;
  tribulations: Record<string, number>;
}

/**
 * 這一天的配置。只看天數，所以全服同一組、伺服器重播也算得出同一組。
 *
 * 四張符一定含一張起手符（劍陣、天雷、風刃、烈焰）：全是冷門特效符的話，
 * 合成會卡、而且那一天的榜只有少數人看得懂。機緣只從「不綁門派、不是稀有」
 * 而且綁定的符都在這四張裡的那些挑。
 */
export function dailyConfig(day: number): DailyConfig {
  const rng = createRng(((day * 104729) ^ 0xda11) >>> 0);
  const pick = <T>(list: T[]): T => list.splice(rng.int(0, list.length - 1), 1)[0] as T;

  const sect = SECTS[rng.int(0, SECTS.length - 1)] ?? SECTS[0];
  const starters = CARDS.filter((card) => card.unlockStage <= 1).map((card) => card.id);
  const others = CARDS.filter((card) => card.unlockStage > 1).map((card) => card.id);
  const talismans = [pick([...starters])];
  const rest = [...starters, ...others].filter((id) => !talismans.includes(id));
  while (talismans.length < 4 && rest.length > 0) talismans.push(pick(rest));

  const eligible = BLESSINGS.filter(
    (def) =>
      !def.rare &&
      def.sect === null &&
      def.requires.every((group) => group.some((id) => talismans.includes(id))),
  ).map((def) => def.id);
  const blessings: Record<string, number> = {};
  for (let i = 0; i < 2 && eligible.length > 0; i += 1) blessings[pick(eligible)] = 2;

  const tribs = TRIBULATIONS.map((def) => def.id);
  const tribulations: Record<string, number> = { [pick(tribs)]: 1 };

  return { day, sectId: sect?.id ?? 'sword', talismans, blessings, tribulations };
}

/**
 * 每天第一次打到這個波數給仙緣：3 波 1 點、10 波再 1 點。
 * 波數門檻很低是刻意的——它要的是「每天來打一場」，不是「每天打贏一場」。
 */
export const DAILY_REWARDS: readonly [number, number][] = [
  [3, 1],
  [10, 1],
];

/**
 * 結算每日獎勵：回傳這一次新拿到的仙緣點（已經寫進存檔）。
 * dailyBest 記的是「今天已經領到哪一檔」，換日就重來。
 */
export function claimDaily(save: SaveData, day: number, waves: number): number {
  if (save.player.daily.day !== day) save.player.daily = { day, best: 0 };
  let gained = 0;
  for (const [need, points] of DAILY_REWARDS) {
    if (waves >= need && save.player.daily.best < need) gained += points;
  }
  save.player.daily.best = Math.max(save.player.daily.best, waves);
  save.player.karma.points += gained;
  return gained;
}

/** 今天打過了沒（主畫面提示用）。 */
export function dailyDone(save: SaveData, now: number = Date.now()): boolean {
  return save.player.daily.day === dayOf(now) && save.player.daily.best > 0;
}
