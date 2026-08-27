import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config';
import { initState } from '../state';
import { INK, DANGER, textStyle, wrapText } from '../ui/theme';

/**
 * 啟動場景：載入並驗證資料、讀取存檔，然後進標題。
 * 資料格式錯誤會在這裡被擋下並顯示在畫面上，而不是讓遊戲跑到一半才崩。
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    try {
      initState();
      this.scene.start('Title');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.add
        .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 40, '啟動失敗', textStyle({ size: 34, color: DANGER, bold: true }))
        .setOrigin(0.5);
      this.add
        .text(
          GAME_WIDTH / 2,
          GAME_HEIGHT / 2 + 20,
          wrapText(message, GAME_WIDTH - 60, 18),
          textStyle({ size: 18, color: INK }),
        )
        .setOrigin(0.5)
        .setAlign('center');
    }
  }
}
