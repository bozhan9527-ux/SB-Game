/**
 * 輪迴轉世與仙緣。
 *
 * **為什麼需要這一層。** 通關 81 關之後只剩無限模式：沒有轉生、沒有傳承、沒有新周目，
 * 也就沒有任何理由再開一輪。轉世把「已經爬到多深」換成跨世永久生效的仙緣點——
 * 進度歸零，但下一世爬得快得多，而且爬的過程本身變成一個可以優化的東西。
 *
 * 三條規矩，缺一條這個系統就會壞掉：
 *
 * 1. **只有比上一次更深才給點數。**（claimedStage）沒有這條，同一段進度可以反覆轉世
 *    刷點，轉世就從一個決定退化成一個必須重複執行的動作。
 * 2. **符籙與試煉的解鎖不跟著歸零。**它們看的是 highestStage，而轉世不動它——
 *    收回玩家已經打出來的選擇，只會讓人不敢轉世。
 * 3. **仙緣只給乘區，不給別處拿不到的東西。**它加速重爬，不解鎖新內容；
 *    否則不轉世的人會落後在「內容」而不只是「速度」上。
 *
 * 本檔不 import Phaser，全部是純函式。
 */
import { BALANCE, KARMA, UPGRADES } from '../data';
import type { KarmaTrack } from '../data/types';
import type { SaveData } from '../save/types';

export function karmaTrackById(id: string): KarmaTrack {
  const track = KARMA.find((item) => item.id === id);
  if (track === undefined) throw new Error(`未知的仙緣項目：${id}`);
  return track;
}

/** 抵達某一關總共值多少仙緣點。門檻之前一律 0。 */
export function karmaPointsFor(stage: number): number {
  const { minStage, stagesPerPoint } = BALANCE.rebirth;
  if (stage < minStage) return 0;
  return Math.floor((stage - minStage) / stagesPerPoint) + 1;
}

/** 現在轉世能拿到幾點。只算「比上次換過的更深」的那一段。 */
export function pendingKarma(save: SaveData): number {
  return Math.max(0, karmaPointsFor(save.world.highestStage) - karmaPointsFor(save.player.karma.claimedStage));
}

export function canRebirth(save: SaveData): boolean {
  return pendingKarma(save) > 0;
}

/** 升到下一級要幾點。已滿級回 null。 */
export function karmaCost(track: KarmaTrack, level: number): number | null {
  if (level >= track.maxLevel) return null;
  return Math.round(track.cost * Math.pow(track.costGrowth, level));
}

export function karmaLevel(save: SaveData, id: string): number {
  return Math.max(0, save.player.karma.spent[id] ?? 0);
}

/**
 * 該線目前的累計數值（0 級為 0）。
 *
 * 和修為同一個理由吃純資料：伺服器重播時只有玩家上報的等級表，沒有存檔。
 */
export function karmaAmountOf(spent: Readonly<Record<string, number>>, id: string): number {
  return karmaTrackById(id).perLevel * Math.max(0, spent[id] ?? 0);
}

export function karmaAmount(save: SaveData, id: string): number {
  return karmaAmountOf(save.player.karma.spent, id);
}

export type KarmaPurchase = 'ok' | 'maxed' | 'poor';

export function buyKarma(save: SaveData, id: string): KarmaPurchase {
  const track = karmaTrackById(id);
  const level = karmaLevel(save, id);
  const cost = karmaCost(track, level);
  if (cost === null) return 'maxed';
  if (save.player.karma.points < cost) return 'poor';
  save.player.karma.points -= cost;
  save.player.karma.spent[id] = level + 1;
  return 'ok';
}

/**
 * 轉世。
 *
 * 歸零的是**這一世的東西**：關卡進度、金幣、金幣買的升級。
 * 留下的是跨世的東西：門派與修為、符籙解鎖、成就、提示、紀錄、試煉紀錄、仙緣。
 * 這條界線就是「玩家已經打出來的選擇」與「玩家這一輪的資源」的界線。
 */
export function rebirth(save: SaveData): boolean {
  const gained = pendingKarma(save);
  if (gained <= 0) return false;

  save.player.karma.points += gained;
  save.player.karma.rebirths += 1;
  save.player.karma.claimedStage = save.world.highestStage;

  save.world.stage = 1;
  save.player.wallet.gold = 0;
  for (const track of UPGRADES) save.player.upgrades[track.id] = 0;
  return true;
}
