/**
 * 觸控跟隨（TECH_SPEC 第 4.5 節）。
 *
 * 隊伍不是在兩條固定車道之間跳，而是連續跟著手指走：手指在哪，隊伍就往哪去。
 * 這裡只放純運算，場景負責把指標事件轉成目標座標。
 */

/** 把目標座標夾在路面範圍內，避免整團跑出賽道。 */
export function clampToTrack(x: number, trackLeft: number, trackRight: number, margin: number): number {
  const min = trackLeft + margin;
  const max = trackRight - margin;
  if (max <= min) return (trackLeft + trackRight) / 2;
  return Math.min(max, Math.max(min, x));
}

/**
 * 以指數逼近往目標移動，並與畫格率解耦。
 *
 * 直接寫 `current += (target - current) * 0.2` 會讓高畫格率的手機跟得比較快，
 * 手感隨裝置浮動。這裡用 1 - e^(-k·t)，同樣的時間得到同樣的位移。
 */
export function approach(current: number, target: number, deltaMs: number, speedPerSecond: number): number {
  if (deltaMs <= 0 || speedPerSecond <= 0) return current;
  const ratio = 1 - Math.exp((-speedPerSecond * deltaMs) / 1000);
  return current + (target - current) * ratio;
}

/** 首領戰的氣勢：依這一幀橫向移動的距離累積，並夾在上限內。 */
export function addMomentum(current: number, movedPx: number, perPixel: number, max: number): number {
  return Math.min(max, current + Math.abs(movedPx) * perPixel);
}
