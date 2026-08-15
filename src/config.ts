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

/**
 * 配色。
 *
 * 刻意不放進 `data/balance.json`：TECH_SPEC 第 3 節要求資料驅動的對象是
 * 「遊戲數值」（敵人屬性、閘門數值、經驗曲線等），配色屬美術風格，
 * 調整時機與調數值完全不同，混在一起只會讓 balance.json 變成雜物櫃。
 */
export const PALETTE = {
  skyTop: 0x1a1033,
  skyBottom: 0x4a2a5e,
  ground: 0x241a33,
  road: 0x3a2b4d,
  roadStripe: 0x463455,
  roadEdge: 0xffc46b,
  centerLine: 0x6b5a80,
  deadZone: 0x7a3b52,
  gateGood: 0x4fd1a5,
  gateBad: 0xe86a8a,
  slime: 0x4fd1a5,
  slimeEye: 0x0d1b1e,
  text: 0xe8f5f0,
  textDim: 0x9aa8b5,
} as const;

/** 供 Phaser Text 使用的十六進位字串。 */
export function hex(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}
