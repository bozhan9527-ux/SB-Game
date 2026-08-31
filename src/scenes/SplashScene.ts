import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config';
import { state } from '../state';
import { realmForStage } from '../systems/realms';
import { drawBackdrop } from '../ui/backdrop';
import { GOLD, INK, INK_DIM, hexToNumber, textStyle } from '../ui/theme';
import { fadeToScene } from '../ui/transition';

/**
 * 開場動畫。
 *
 * **它存在的理由是主畫面不再寫標題了。** 一個遊戲總得說一次自己叫什麼，
 * 但那件事只需要說一次——說在進門的時候，而不是每次回到主畫面都再說一遍。
 *
 * 三條規矩：
 * - **一秒九出頭就結束。** 開場動畫的成本由玩家承擔，而且是每一次開遊戲都付。
 *   再好看的東西，第五十次看到都只是擋路。
 * - **點畫面任何地方都能跳過。** 而且是真的跳過，不是加速播完。
 * - **不擋載入。** 資源在 Boot 就載完了，這裡純粹是演出；
 *   把載入藏在動畫底下是常見做法，但那會讓「動畫多久」變成「載入多久」，
 *   慢的裝置反而看得更久。
 */
const CHARS = ['問', '道', '飛', '升'] as const;
const CHAR_SIZE = 76;
const CHAR_GAP = 10;
const CHAR_STEP = 150;
const HOLD_MS = 1950;

export class SplashScene extends Phaser.Scene {
  private done = false;

  constructor() {
    super('Splash');
  }

  create(): void {
    const save = state();
    const realm = realmForStage(save.world.stage);
    drawBackdrop(this, realm.color, realm.scenery);

    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT * 0.42;

    const total = CHARS.length * CHAR_SIZE + (CHARS.length - 1) * CHAR_GAP;
    CHARS.forEach((char, index) => {
      const x = cx - total / 2 + CHAR_SIZE / 2 + index * (CHAR_SIZE + CHAR_GAP);
      const text = this.add
        .text(x, cy + 26, char, textStyle({ size: CHAR_SIZE, color: INK, bold: true }))
        .setOrigin(0.5)
        .setAlpha(0)
        .setScale(1.14);
      // 一個字一個字浮上來。四個字同時淡入只是「一張圖出現」，
      // 逐字才有人在寫的感覺——而這款遊戲整個題材就是寫符。
      this.tweens.add({
        targets: text,
        y: cy,
        alpha: 1,
        scale: 1,
        duration: 460,
        ease: 'Cubic.easeOut',
        delay: index * CHAR_STEP,
      });
    });

    // 金線由中央向兩側展開，收住整組字。
    //
    // 用 scaleX 而不是補間 width：Phaser 的 Rectangle 改 width 是往右長的，
    // 補出來的線會從中央一路長到畫面右緣，看起來像跑掉了而不是像展開。
    const rule = this.add
      .rectangle(cx, cy + 62, total + 20, 2, hexToNumber(GOLD))
      .setAlpha(0)
      .setScale(0, 1);
    this.tweens.add({
      targets: rule,
      scaleX: 1,
      alpha: 0.9,
      duration: 460,
      ease: 'Cubic.easeOut',
      delay: CHARS.length * CHAR_STEP,
    });

    const subtitle = this.add
      .text(cx, cy + 100, '拖符布陣 · 合成升階 · 鎮守山門', textStyle({ size: 21, color: INK_DIM }))
      .setOrigin(0.5)
      .setAlpha(0);
    this.tweens.add({
      targets: subtitle,
      alpha: 1,
      duration: 420,
      delay: CHARS.length * CHAR_STEP + 220,
    });

    const skip = this.add
      .text(cx, GAME_HEIGHT - 70, '點一下繼續', textStyle({ size: 16, color: INK_DIM }))
      .setOrigin(0.5)
      .setAlpha(0);
    this.tweens.add({ targets: skip, alpha: 0.75, duration: 400, delay: 900 });

    // 整個畫面都是跳過鍵。這裡沒有任何別的可按，做成一顆按鈕反而是多一步。
    this.add
      .rectangle(cx, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0)
      .setInteractive()
      .on('pointerdown', () => this.enter());

    this.time.delayedCall(HOLD_MS, () => this.enter());
  }

  /** 進主畫面。點擊與計時器都會呼叫，所以要擋住第二次。 */
  private enter(): void {
    if (this.done) return;
    this.done = true;
    fadeToScene(this, 'Title');
  }
}
