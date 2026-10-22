/**
 * 一境一局：一個境界（九關）是一局。
 *
 * 規則（製作人選的是硬派版，見 ROGUELITE_DESIGN.md）：
 * - 每過一關三選一一張機緣，本局內有效；第五關給稀有三選一。
 * - **山門耐久跨關延續**，過關回三成上限。前面打得好不好，一路影響到境底首領。
 * - 山門被破（或首領逾時、半途收兵）：本局結束，退回本局第一關，機緣清空。
 * - 打完境底首領就是破境：記錄點，下一境重新開局。
 *
 * 為什麼要這樣：原本每關滿血開打，前四十關血量加倍照樣過、山門不掉血——
 * 頭一個小時沒有任何懸念。耐久延續之後，每一隻漏掉的妖魔都會跟著你走。
 *
 * 本檔不 import Phaser，全部是純函式。
 */
import { REALMS } from '../data';
import type { RealmRunState, SaveData } from '../save/types';
import type { OfferContext } from './blessings';
import { offerPool, offerSize, rollOffer, takeBlessing } from './blessings';
import { realmForStage } from './realms';
import { createRng } from './rng';
import { BLESSINGS } from '../data';
import { legacySeeds, legacyWeight, masteryTier } from './sects';
import { talismanDefs } from './talismans';

/** 過關回復的耐久（上限的比例）。 */
export const GATE_RESTORE = 0.3;
/** 每一局免費重抽幾次。 */
export const FREE_REREOLLS = 1;
/** 第幾關（境內第幾層）給稀有三選一。 */
export const RARE_LAYER = 5;
/** 一局幾關。飛升境沒有盡頭，照這個長度切段。 */
export const RUN_LENGTH = 9;

export function freshRealmRun(startStage: number): RealmRunState {
  return { startStage: Math.max(1, Math.floor(startStage)), gate: null, blessings: {}, offer: null, rerolls: 0, checkpoint: null };
}

/**
 * 開一局新的：門派傳承滿階的話，開局就帶著本門專屬機緣（一星）。
 * 破境、失守重來、飛升都走這裡；讀檔修補與存檔轉換不走（那不是「新的一局」）。
 */
export function startRealmRun(save: SaveData, startStage: number): RealmRunState {
  const run = freshRealmRun(startStage);
  const sectId = save.player.sectId;
  if (sectId !== null && legacySeeds(masteryTier(save, sectId))) {
    const own = BLESSINGS.find((def) => def.sect === sectId && !def.rare);
    if (own !== undefined) run.blessings = { [own.id]: 1 };
  }
  return run;
}

/** 主線最後一個有盡頭的境界在哪一關結束（81）。之後是飛升境。 */
export function lastFiniteStage(): number {
  const finite = REALMS.slice(0, -1);
  return finite[finite.length - 1]?.stageTo ?? 81;
}

/** 這一關在本局裡是第幾層（1 起算）。 */
export function layerInRun(stage: number): number {
  const realm = realmForStage(stage);
  const offset = stage - realm.stageFrom;
  return (offset % RUN_LENGTH) + 1;
}

/** 這一關打完是不是破境。 */
export function endsRun(stage: number): boolean {
  const realm = realmForStage(stage);
  if (stage >= realm.stageTo) return true;
  return layerInRun(stage) === RUN_LENGTH;
}

/** 本局這一關開打時的起點（給第一次進入、或舊存檔用）。 */
export function runStartFor(stage: number): number {
  return stage - (layerInRun(stage) - 1);
}

/** 三選一的候選條件，從存檔攤出來。 */
export function offerContextOf(save: SaveData, rare: boolean): OfferContext {
  const pool = talismanDefs(save.player.talismans, save.player.dungeons['library'] ?? 0);
  return {
    owned: save.world.realmRun.blessings,
    unlocked: save.player.karma.unlocks,
    sectId: save.player.sectId ?? '',
    talismans: pool.map((def) => def.id),
    rare,
    sectWeight: save.player.sectId === null ? 1 : legacyWeight(masteryTier(save, save.player.sectId)),
  };
}

/**
 * 這一次三選一的種子：關卡、挑戰次數與重抽次數。
 * 存檔裡存的是抽好的結果，所以離開再回來看到的是同一組——重抽要花次數。
 */
function offerRng(save: SaveData) {
  const seed = (save.world.stage * 92821) ^ (save.world.runs * 6271) ^ (save.world.realmRun.rerolls * 131) ^ 0x5eed;
  return createRng(seed >>> 0);
}

function rollFor(save: SaveData, rare: boolean): { ids: string[]; rare: boolean } | null {
  const run = save.world.realmRun;
  let ctx = offerContextOf(save, rare);
  // 稀有卡池抽完了（全都拿過）就退回一般三選一，不要讓那一關什麼都沒有。
  if (rare && offerPool(ctx).length === 0) ctx = offerContextOf(save, false);
  const ids = rollOffer(ctx, offerRng(save), offerSize(run.blessings));
  return ids.length === 0 ? null : { ids, rare: ctx.rare };
}

export interface ClearOutcome {
  /** 打完的是境底首領：本局結束、下一境重新開局。 */
  brokeThrough: boolean;
  /** 帶進下一關的耐久（破境時為 null，滿血）。 */
  gate: number | null;
}

/**
 * 主線過了一關。要在 recordClear 之後呼叫（world.stage 已經是下一關）。
 *
 * survivors 是這一關結束時的山門耐久，maxDisciples 是上限。
 */
export function onStageCleared(save: SaveData, clearedStage: number, survivors: number, maxDisciples: number): ClearOutcome {
  if (endsRun(clearedStage)) {
    save.world.realmRun = startRealmRun(save, save.world.stage);
    return { brokeThrough: true, gate: null };
  }
  const run = save.world.realmRun;
  const restored = Math.min(maxDisciples, Math.max(1, Math.round(survivors)) + Math.ceil(maxDisciples * GATE_RESTORE));
  run.gate = restored >= maxDisciples ? null : restored;
  run.offer = rollFor(save, layerInRun(clearedStage) === RARE_LAYER);
  // 稀有機緣那一關過了、而且這次沒有三選一可選：直接在下一關記歇腳點（有得選的話選完才記）
  if (layerInRun(clearedStage) === RARE_LAYER && run.offer === null) markCheckpoint(save);
  return { brokeThrough: false, gate: run.gate };
}

/**
 * 主線這一關沒過（山門被破、首領逾時、半途收兵）：本局結束，退回本局第一關。
 * 回傳退回的關卡。
 */
/** 在現在這一關（第六關）記歇腳點：之後失守從這裡重來，機緣回到此刻這一組。 */
function markCheckpoint(save: SaveData): void {
  const run = save.world.realmRun;
  if (run.checkpoint !== null) return;
  run.checkpoint = { stage: save.world.stage, blessings: { ...run.blessings } };
}

/** 失守之後會退回哪一關（結算頁先講，存檔再照做）。 */
export function retreatStage(save: SaveData): number {
  if (newbieShield(save)) return save.world.stage;
  const cp = save.world.realmRun.checkpoint;
  if (cp !== null && save.world.stage >= cp.stage) return cp.stage;
  return Math.min(save.world.realmRun.startStage, save.world.stage);
}

export function onStageFailed(save: SaveData): number {
  // 中途歇腳：過了第五關之後失守，從第六關重來，機緣回到進第六關時那一組。
  const cp = save.world.realmRun.checkpoint;
  if (!newbieShield(save) && cp !== null && save.world.stage >= cp.stage) {
    const run = save.world.realmRun;
    save.world.stage = cp.stage;
    save.world.realmRun = { ...run, gate: null, blessings: { ...cp.blessings }, offer: null };
    return cp.stage;
  }
  if (newbieShield(save)) {
    // 新手護體：只重打這一關，機緣留著，山門回滿。
    save.world.realmRun.gate = null;
    return save.world.stage;
  }
  const start = Math.min(save.world.realmRun.startStage, save.world.stage);
  save.world.stage = start;
  save.world.realmRun = startRealmRun(save, start);
  return start;
}

/**
 * 新手護體：第一世的第一個境界（煉氣期）失守不會退回本局第一關。
 *
 * 剛學會拖符的人在第 4 關倒下、被丟回第 1 關，學到的只有「這遊戲很不公平」。
 * 硬派的一境一局從築基期起才生效——那時他已經知道機緣與耐久是怎麼回事。
 */
/**
 * 屢敗屢戰：主線連續失守時，失守那一場的金幣多給。每多輸一次 +40%，最多 +120%。
 *
 * 卡關的人只能靠刷金幣升級，而失守只給通關的三成五——連輸三次還在原地的人最需要這份。
 * 只加金幣、不加戰力：戰鬥本身不變，排行榜的重播驗證不受影響。過一關就歸零。
 */
export function gritBonus(failStreak: number): number {
  return Math.min(3, Math.max(0, failStreak)) * 0.4;
}

export function newbieShield(save: SaveData): boolean {
  const first = REALMS[0];
  return save.player.karma.rebirths === 0 && first !== undefined && save.world.stage <= first.stageTo;
}

/** 選一張。不在這次候選裡的 id 一律不收。 */
export function pickBlessing(save: SaveData, id: string): boolean {
  const run = save.world.realmRun;
  if (run.offer === null || !run.offer.ids.includes(id)) return false;
  run.blessings = takeBlessing(run.blessings, id);
  run.offer = null;
  if (layerInRun(save.world.stage) === RARE_LAYER + 1) markCheckpoint(save);
  // 舊的「關間奇遇」成就沿用這個計數：機緣取代了奇遇，選機緣就是那件事。
  save.player.stats.omensTaken += 1;
  return true;
}

export function rerollsLeft(save: SaveData): number {
  return Math.max(0, FREE_REREOLLS - save.world.realmRun.rerolls);
}

/** 重抽這一次的候選。免費次數用完就不行（之後可以接激勵廣告）。 */
export function rerollOffer(save: SaveData): boolean {
  const run = save.world.realmRun;
  if (run.offer === null || rerollsLeft(save) <= 0) return false;
  run.rerolls += 1;
  run.offer = rollFor(save, run.offer.rare);
  return true;
}

/** 九轉還魂在這一關用掉了：從本局的機緣表拿掉。 */
export function consumeRevive(save: SaveData): void {
  const { revive: _used, ...rest } = save.world.realmRun.blessings;
  save.world.realmRun.blessings = rest;
}

/** 讀檔時修補：起點不能在目前關卡之後、也不能跨到別的境界。 */
export function sanitizeRealmRun(run: RealmRunState, stage: number): RealmRunState {
  const floor = runStartFor(stage);
  if (run.startStage > stage || run.startStage < floor) return { ...run, startStage: stage };
  return run;
}
