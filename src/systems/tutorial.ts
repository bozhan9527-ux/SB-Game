/**
 * 新手教學與一次性提示。
 *
 * 本檔不 import Phaser，只描述「教什麼、什麼時候教完」，畫面由 RunScene 呈現。
 *
 * 設計取捨：**教學用固定的起手牌**，不用隨機抽到的。
 * 隨機起手有可能三張都合不起來，那第二步「合成」就卡死了；
 * 教學只有一次機會，不能靠運氣。這組固定牌保證第一步放得下、第二步合得起來。
 */
import type { Card } from './deck';
import type { SaveData } from '../save/types';

/** 教學本身也是一個一次性提示，看過就記進存檔。 */
export const HINT_TUTORIAL = 'tutorial';
/** 手牌塞滿、抽到的符流失時提醒一次。 */
export const HINT_HAND_FULL = 'handFull';
/** 首領第一次出場時提醒一次。 */
export const HINT_BOSS = 'boss';
/** 第一次排出陣法時說明一次。 */
export const HINT_FORMATION = 'formation';
/** 首領第一次砸門時說明一次。 */
export const HINT_GATE_SIEGE = 'gateSiege';

export type TutorialStep = 'deploy' | 'merge' | 'watch' | 'done';

export interface TutorialCopy {
  title: string;
  body: string;
}

const COPY: Record<TutorialStep, TutorialCopy> = {
  deploy: {
    title: '把符放上陣位',
    body: '按住下方的一張符，拖到中間的空格放開。\n放上去的符會自動朝上出手。',
  },
  merge: {
    title: '同種同階可以合成',
    body: '把手上剩下的符，拖到剛剛那張符上面。\n兩張合成一張高一階的——傷害翻倍。',
  },
  watch: {
    title: '守住山門',
    body: '妖魔走到最下面的山門就會扣耐久，扣光就失守。\n撐過五波，再斬掉首領就過關。',
  },
  done: { title: '', body: '' },
};

export function tutorialCopy(step: TutorialStep): TutorialCopy {
  return COPY[step];
}

/**
 * 教學用的起手牌：場上全空，手上三張同種同階。
 *
 * 三張一樣是刻意的——不管玩家先放哪一張，剩下的都一定合得起來，第二步不會卡住。
 */
export function tutorialField(slots: number): (Card | null)[] {
  return new Array<Card | null>(Math.max(1, slots)).fill(null);
}

export function tutorialHand(slots: number): (Card | null)[] {
  const hand = new Array<Card | null>(Math.max(3, slots)).fill(null);
  for (let i = 0; i < 3; i += 1) hand[i] = { type: 'flame', tier: 1 };
  return hand.slice(0, Math.max(3, slots));
}

export function hasSeenHint(save: SaveData, id: string): boolean {
  return save.player.hints.includes(id);
}

/** 記下「看過了」。回傳 true 代表這次是第一次看到，呼叫端才需要存檔。 */
export function markHintSeen(save: SaveData, id: string): boolean {
  if (hasSeenHint(save, id)) return false;
  save.player.hints.push(id);
  return true;
}

/** 只有沒看過教學、而且正要打第 1 關的玩家才走教學。 */
export function shouldRunTutorial(save: SaveData): boolean {
  return !hasSeenHint(save, HINT_TUTORIAL) && save.world.stage === 1;
}

/** 完成一步之後的下一步。 */
export function advanceStep(step: TutorialStep): TutorialStep {
  if (step === 'deploy') return 'merge';
  if (step === 'merge') return 'watch';
  return 'done';
}
