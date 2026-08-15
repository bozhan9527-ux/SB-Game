import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config';

/**
 * 階段 0 的佔位場景：只負責證明建置與部署鏈路是通的。
 * 進入階段 1a 後會被 ExploreScene 取代。
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;

    // 畫出基準畫布的邊框，用來在手機上肉眼確認 9:16 縮放是否正確。
    this.add
      .rectangle(cx, cy, GAME_WIDTH - 4, GAME_HEIGHT - 4)
      .setStrokeStyle(2, 0x2f6f5f);

    // 史萊姆佔位圖：程式繪製的幾何圖形（PROGRESS D-08，正式素材未定）
    this.add.circle(cx, cy - 40, 70, 0x4fd1a5).setAlpha(0.9);
    this.add.circle(cx - 26, cy - 60, 10, 0x0d1b1e);
    this.add.circle(cx + 26, cy - 60, 10, 0x0d1b1e);

    this.add
      .text(cx, cy + 90, 'Hello', {
        fontFamily: 'sans-serif',
        fontSize: '48px',
        color: '#e8f5f0',
      })
      .setOrigin(0.5);

    this.add
      .text(cx, cy + 150, `${GAME_WIDTH}×${GAME_HEIGHT}`, {
        fontFamily: 'monospace',
        fontSize: '22px',
        color: '#6f9c92',
      })
      .setOrigin(0.5);
  }
}
