/**
 * 把一場的原始戰績換算成看得懂的數字。
 *
 * 原始事實留在 DefenseState.telemetry（純累加），衍生值一律在這裡算——
 * 存衍生值會在改平衡時整批失真，而且沒有人記得去重算。
 *
 * 本檔不 import Phaser，全部是純函式。
 */
import type { RunTelemetry } from './defense';

export interface DamageShare {
  type: string;
  damage: number;
  /** 佔全場總傷害的比例，0～1。全場零傷害時為 0。 */
  share: number;
}

export function totalDamage(telemetry: RunTelemetry): number {
  let sum = 0;
  for (const value of Object.values(telemetry.damageByType)) sum += value;
  return sum;
}

/** 各符種的貢獻，由多到少。 */
export function damageShares(telemetry: RunTelemetry): DamageShare[] {
  const total = totalDamage(telemetry);
  return Object.entries(telemetry.damageByType)
    .map(([type, damage]) => ({ type, damage, share: total > 0 ? damage / total : 0 }))
    .sort((a, b) => b.damage - a.damage);
}

/**
 * 整場的平均陣法加成（0.42 = 平均 +42%）。
 *
 * 時間加權，而且分母只算「場上有符」的時間：開場那幾秒空盤不該把平均拉低。
 */
export function averageFormationBonus(telemetry: RunTelemetry): number {
  if (telemetry.formationActiveMs <= 0) return 0;
  return telemetry.formationBonusMs / telemetry.formationActiveMs;
}

/** 整場的平均每秒輸出。 */
export function averageDps(telemetry: RunTelemetry, elapsedMs: number): number {
  if (elapsedMs <= 0) return 0;
  return (totalDamage(telemetry) * 1000) / elapsedMs;
}

/**
 * 輸出曲線，壓成最多 buckets 個點。
 *
 * 一場可能有一百多秒，畫成一百多個點在 540px 寬的畫面上只會糊成一片；
 * 每個點取區間內的平均，形狀保得住而且讀得出來。
 */
export function dpsCurve(telemetry: RunTelemetry, buckets = 30): number[] {
  const source = telemetry.damagePerSecond;
  if (source.length === 0) return [];
  if (source.length <= buckets) return [...source];
  const out: number[] = [];
  const size = source.length / buckets;
  for (let i = 0; i < buckets; i += 1) {
    const from = Math.floor(i * size);
    const to = Math.max(from + 1, Math.floor((i + 1) * size));
    let sum = 0;
    for (let j = from; j < to && j < source.length; j += 1) sum += source[j] ?? 0;
    out.push(sum / (to - from));
  }
  return out;
}
