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

/** 背景色，與 index.html 的 body 背景一致，避免 letterbox 邊條看起來像破圖。 */
export const BACKGROUND_COLOR = '#0d1b1e';

/** TECH_SPEC 第 6 節：目標裝置最小支援 360×640 CSS px。 */
export const MIN_SUPPORTED_WIDTH = 360;
export const MIN_SUPPORTED_HEIGHT = 640;

/** 回傳 width/height 的長寬比。 */
export function aspectRatio(width: number, height: number): number {
  return width / height;
}
