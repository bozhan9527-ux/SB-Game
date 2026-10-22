/**
 * 手機震動。只有支援 Vibration API 的裝置會震（多數 Android 瀏覽器；iOS Safari 不支援，呼叫了也沒事）。
 *
 * 一波妖怪同時撞門會在同一幀報好幾筆，每一筆都震的話手機會連成一長串嗡嗡聲，
 * 所以兩次之間至少隔一小段；首領砸門用比較重的節奏，蓋過一般的。
 */
import { state } from './state';

let lastAt = 0;

export function vibrate(pattern: number | number[], minGapMs = 180): void {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  if (!state().settings.vibrate) return;
  const now = Date.now();
  if (now - lastAt < minGapMs) return;
  lastAt = now;
  try {
    navigator.vibrate(pattern);
  } catch {
    // 有些瀏覽器在沒有使用者手勢時會丟例外，震不了就算了
  }
}
