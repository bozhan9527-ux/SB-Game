import Phaser from 'phaser';
import { preloadArt } from '../art';
import { GAME_HEIGHT, GAME_WIDTH } from '../config';
import { initState } from '../state';
import { BG_PANEL, DANGER, INK, INK_DIM, JADE, hexToNumber, textStyle, wrapText } from '../ui/theme';

/**
 * 啟動場景：載入美術資源、驗證遊戲資料、讀取存檔，然後進標題。
 * 資料格式錯誤會在這裡被擋下並顯示在畫面上，而不是讓遊戲跑到一半才崩。
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;

    this.add.text(cx, cy - 60, '問道飛升', textStyle({ size: 48, color: INK, bold: true })).setOrigin(0.5);
    this.add.text(cx, cy - 12, '正在開啟山門…', textStyle({ size: 18, color: INK_DIM })).setOrigin(0.5);

    const barWidth = 280;
    this.add.rectangle(cx, cy + 30, barWidth, 8, BG_PANEL, 1);
    const bar = this.add.rectangle(cx - barWidth / 2, cy + 30, 0, 8, hexToNumber(JADE), 1).setOrigin(0, 0.5);
    this.load.on('progress', (value: number) => bar.setDisplaySize(barWidth * value, 8));

    preloadArt(this);
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
