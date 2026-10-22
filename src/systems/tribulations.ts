/**
 * 飛升境的天劫：第 82 關起，每一關由關卡編號決定一到三條天劫。
 *
 * **只看關卡編號，不擲骰、不讓玩家選。** 所以伺服器重播時自己算得出同一組，
 * 不必相信客戶端報的任何東西；同一關重打也是同一組，玩家可以針對它換符。
 *
 * 本檔不 import Phaser。
 */
import { BALANCE, TRIBULATIONS } from '../data';
import type { TribulationDef } from '../data/types';
import { createRng } from './rng';

/** 天劫從哪一關開始：飛升境的第一關，也就是轉世的門檻。 */
export function tribulationStart(): number {
  return BALANCE.rebirth.minStage;
}

/** 最多疊幾條。四條以上就不是「有自己條件的一關」，是一團看不清的懲罰。 */
export const MAX_TRIBULATIONS = 3;

/** 每深幾關多一條。 */
export const TRIBULATION_STEP = 10;

export function tribulationsFor(stage: number): TribulationDef[] {
  const start = tribulationStart();
  if (stage < start) return [];
  const count = Math.min(MAX_TRIBULATIONS, 1 + Math.floor((stage - start) / TRIBULATION_STEP));
  // 和戰鬥、奇遇的種子都錯開：天劫不該和那一關的妖魔編成綁在一起。
  const rng = createRng((stage * 7703) ^ 0x7a1b5);
  const pool = [...TRIBULATIONS];
  const picked: TribulationDef[] = [];
  while (picked.length < count && pool.length > 0) {
    const [item] = pool.splice(rng.int(0, pool.length - 1), 1);
    if (item !== undefined) picked.push(item);
  }
  return picked;
}

/**
 * 飛升台上選的天劫（v23）：天劫 id → 第幾重，換算成實際生效的那一份。
 *
 * 金幣倍率一律拿掉：自己背的天劫，獎勵是飛升時的仙緣倍率，不是這一關多賺。
 * 少了這一條，背滿七劫的人每一關金幣會乘上 1.3 的七次方。
 */
export function chosenTribulations(levels: Readonly<Record<string, number>>): TribulationDef[] {
  const out: TribulationDef[] = [];
  for (const def of TRIBULATIONS) {
    const level = Math.max(0, Math.min(3, Math.floor(levels[def.id] ?? 0)));
    if (level <= 0) continue;
    const at = def.levels[level - 1];
    if (at === undefined) continue;
    out.push({ ...def, ...at, gold: 1 });
  }
  return out;
}

/**
 * 一關實際生效的天劫：自己背的，加上第 82 關以後依關卡降下的。
 * 同一種天劫兩邊都有時取自己背的那一份（通常比較重）。
 */
export function tribulationsForRun(stage: number, levels: Readonly<Record<string, number>>): TribulationDef[] {
  const chosen = chosenTribulations(levels);
  const extra = tribulationsFor(stage).filter((item) => !chosen.some((c) => c.id === item.id));
  return [...chosen, ...extra];
}

/** 「雷劫・心魔劫」。 */
export function tribulationNames(list: readonly TribulationDef[]): string {
  return list.map((item) => item.name).join('・');
}

/**
 * 上報或存檔讀進來的天劫表：不認得的 id 丟掉、重數夾在 1–3。
 * 天劫只會讓一場更難，所以伺服器不必擔心有人多報——要擋的是格式錯誤。
 */
export function sanitizeTribulationLevels(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return out;
  for (const def of TRIBULATIONS) {
    const value = (raw as Record<string, unknown>)[def.id];
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    const level = Math.max(0, Math.min(3, Math.floor(value)));
    if (level > 0) out[def.id] = level;
  }
  return out;
}

// ---------------------------------------------------------------- 每週天劫塔（v24）

/** 週一 00:00（台北時間）為一週的開始。2024-01-01 是星期一。 */
const WEEK_EPOCH = Date.UTC(2023, 11, 31, 16);
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** 現在是第幾週。 */
export function weekOf(now: number): number {
  return Math.max(0, Math.floor((now - WEEK_EPOCH) / WEEK_MS));
}

/**
 * 這一週鎮妖塔的天劫：三種，第一種是第二重。只看週數，所以全服同一組，
 * 伺服器重播也算得出同一組。
 */
export function weeklyTribulationLevels(week: number): Record<string, number> {
  const rng = createRng(((week * 7919) ^ 0x7e3c5) >>> 0);
  const pool = TRIBULATIONS.map((def) => def.id);
  const out: Record<string, number> = {};
  for (let i = 0; i < 3 && pool.length > 0; i += 1) {
    const [id] = pool.splice(rng.int(0, pool.length - 1), 1);
    if (id !== undefined) out[id] = i === 0 ? 2 : 1;
  }
  return out;
}

/** 副本規則裡的週數（`week:123`）；沒有就是 null。 */
export function weekRule(rules: readonly string[]): number | null {
  for (const rule of rules) {
    const match = /^week:(\d+)$/.exec(rule);
    if (match !== null) return Number(match[1]);
  }
  return null;
}

/** 「雷劫二重・心魔劫・罡風劫」。 */
export function tribulationLevelNames(levels: Readonly<Record<string, number>>): string {
  return chosenTribulations(levels)
    .map((item) => `${item.name}${(levels[item.id] ?? 1) > 1 ? `${['', '', '二', '三'][levels[item.id] ?? 1] ?? ''}重` : ''}`)
    .join('・');
}
