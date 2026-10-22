/**
 * 畫面基準解析度。
 *
 * GAME_DESIGN 第 0 節：直向 9:16 為基準，探索與戰鬥兩種模式共用。
 * 這裡是「邏輯座標系」，實際畫布由 Phaser 的 Scale.FIT 縮放至裝置螢幕，
 * 因此所有遊戲內座標都可以寫死在這個尺寸下，不需處理裝置差異。
 *
 * 注意：此處不 import Phaser，讓數值能在 node 測試環境下直接驗證。
 */
export const GAME_WIDTH = 540;
export const GAME_HEIGHT = 960;

/**
 * 算圖倍率：畫布實際是 1080×1920，每個場景的主攝影機放大兩倍看 540×960 的邏輯座標。
 *
 * 手繪線條與手寫字在手機上會被放大二到三倍；畫布只有 540 寬的話，
 * 瀏覽器把它拉大時線和字都會糊掉。像素畫時代用最近點放大不怕糊，手繪不行。
 * 邏輯座標一律不變（GAME_WIDTH、GAME_HEIGHT），只有指標位置要用 worldX/worldY。
 */
export const RENDER_SCALE = devRenderScale() ?? 2;

/** 開發用：`?renderScale=1` 以一倍算圖（無 GPU 的自動化截圖環境用軟體算圖，兩倍太慢）。 */
function devRenderScale(): number | null {
  if (!import.meta.env?.DEV) return null;
  const value = Number(new URLSearchParams(globalThis.location?.search ?? '').get('renderScale'));
  return value === 1 || value === 2 ? value : null;
}

/** 背景色，與 index.html 的 body 背景一致，避免 letterbox 邊條看起來像破圖。 */
export const BACKGROUND_COLOR = '#d9ccb0';

/** TECH_SPEC 第 6 節：目標裝置最小支援 360×640 CSS px。 */
export const MIN_SUPPORTED_WIDTH = 360;
export const MIN_SUPPORTED_HEIGHT = 640;

/** 回傳 width/height 的長寬比。 */
export function aspectRatio(width: number, height: number): number {
  return width / height;
}

/**
 * 版本標示。測試期間寫在主畫面最下面：玩家回報問題時要說得出是哪一版，
 * 而截圖是他們最常給的東西。
 */
export const APP_VERSION = '測試版 0.9.7';
