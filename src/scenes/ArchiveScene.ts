/**
 * 存檔與紀錄。
 *
 * 兩件事放在同一頁，因為它們回答的是同一個問題：「我的進度在哪裡？」
 *
 * 存檔目前只在 localStorage——清快取或換一支手機就全沒了，而這裡的進度是以幾十個
 * 小時為單位的。真正的解法是雲端存檔，但那需要一個這個專案還沒有的後端；
 * 在有之前，一串可以自己貼到記事本、傳給自己的碼就足以擋掉最貴的那個失敗。
 * 同理，個人紀錄是排行榜的本機替身：先讓玩家跟自己比。
 */
import Phaser from 'phaser';
import { GAME_WIDTH } from '../config';
import { adoptSave } from '../save';
import { exportCode, importCode } from '../save/archive';
import { persist, replaceState, state } from '../state';
import { realmForStage } from '../systems/realms';
import { recordLines } from '../systems/records';
import { createButton } from '../ui/button';
import { drawBackdrop } from '../ui/backdrop';
import { BG_PANEL, DANGER, GOLD, INK, INK_DIM, JADE, LINE, textStyle, wrapText } from '../ui/theme';
import { fadeIn, fadeToScene } from '../ui/transition';

export class ArchiveScene extends Phaser.Scene {
  private status: Phaser.GameObjects.Text | undefined;
  private codeBox: Phaser.GameObjects.Text | undefined;

  constructor() {
    super('Archive');
  }

  create(): void {
    fadeIn(this);
    const save = state();
    const realm = realmForStage(save.world.stage);
    drawBackdrop(this, realm.color, realm.scenery);
    this.status = undefined;
    this.codeBox = undefined;

    const cx = GAME_WIDTH / 2;
    this.add.text(cx, 46, '存　檔', textStyle({ size: 40, color: INK, bold: true })).setOrigin(0.5);

    this.buildRecords(cx, 96);
    this.buildArchive(cx, 452);

    createButton(this, cx, 916, {
      width: 340,
      height: 62,
      label: '返回',
      fontSize: 24,
      onClick: () => fadeToScene(this, 'Title'),
    });
  }

  /** 個人紀錄。排行榜的本機替身，說清楚它只在這台裝置上。 */
  private buildRecords(cx: number, top: number): void {
    const lines = recordLines(state());
    const width = GAME_WIDTH - 44;
    const height = lines.length * 40 + 60;

    this.add.rectangle(cx, top + height / 2, width, height, BG_PANEL, 0.9).setStrokeStyle(2, LINE);
    this.add
      .text(cx, top + 22, '個人紀錄', textStyle({ size: 24, color: GOLD, bold: true }))
      .setOrigin(0.5);
    this.add
      .text(cx, top + 48, '只存在這台裝置上——換裝置請用下面的存檔碼帶走', textStyle({ size: 14, color: INK_DIM }))
      .setOrigin(0.5);

    lines.forEach((line, index) => {
      const y = top + 84 + index * 40;
      this.add
        .text(cx - width / 2 + 24, y, line.label, textStyle({ size: 19, color: INK_DIM }))
        .setOrigin(0, 0.5);
      this.add
        .text(cx + width / 2 - 24, y, line.value, textStyle({ size: 21, color: INK, bold: true }))
        .setOrigin(1, 0.5);
    });
  }

  private buildArchive(cx: number, top: number): void {
    const width = GAME_WIDTH - 44;

    this.add
      .text(cx, top, '存檔碼', textStyle({ size: 24, color: GOLD, bold: true }))
      .setOrigin(0.5);
    this.add
      .text(
        cx,
        top + 30,
        wrapText('把整串碼複製起來收好。換裝置、清過快取，貼回來就能接著玩。', width - 40, 15),
        textStyle({ size: 15, color: INK_DIM }),
      )
      .setOrigin(0.5)
      .setAlign('center');

    createButton(this, cx - 92, top + 90, {
      width: 168,
      height: 60,
      label: '匯出　複製',
      fontSize: 21,
      strokeColor: 0x6f8b7a,
      onClick: () => void this.doExport(),
    });
    createButton(this, cx + 92, top + 90, {
      width: 168,
      height: 60,
      label: '匯入　貼上',
      fontSize: 21,
      onClick: () => this.doImport(),
    });

    this.status = this.add
      .text(cx, top + 138, '', textStyle({ size: 17, color: JADE }))
      .setOrigin(0.5)
      .setAlign('center');

    // 碼很長，畫面上只顯示頭尾當作「有東西」的憑據；真正要帶走的是剪貼簿裡那一份。
    this.codeBox = this.add
      .text(cx, top + 186, '', textStyle({ size: 13, color: INK_DIM }))
      .setOrigin(0.5)
      .setAlign('center');
  }

  private async doExport(): Promise<void> {
    const code = exportCode(state());
    const head = code.slice(0, 24);
    const tail = code.slice(-12);
    this.codeBox?.setText(`${head} … ${tail}　共 ${code.length} 字`);
    try {
      await navigator.clipboard.writeText(code);
      this.say('已複製到剪貼簿。貼到記事本或傳給自己收好。', JADE);
    } catch {
      // 沒有剪貼簿權限（多半是非 https 或使用者拒絕）時退到 prompt：
      // 那個對話框裡的文字是選得起來的，玩家仍然帶得走。
      window.prompt('複製這一串存檔碼：', code);
      this.say('剪貼簿不可用，已改用對話框顯示。', GOLD);
    }
  }

  private doImport(): void {
    const raw = window.prompt('貼上存檔碼：', '');
    if (raw === null) return;
    const result = importCode(raw);
    if (!result.ok) {
      this.say(result.reason, DANGER);
      return;
    }
    // 匯入會蓋掉目前的進度，所以要問一次。這是這個遊戲裡最不可逆的操作。
    const current = state();
    const confirmed = window.confirm(
      `匯入會覆蓋目前的進度（第 ${current.world.stage} 關、金幣 ${Math.floor(current.player.wallet.gold)}）。要繼續嗎？`,
    );
    if (!confirmed) {
      this.say('已取消，目前的進度沒有動。', INK_DIM);
      return;
    }
    const next = adoptSave(result.data);
    replaceState(next);
    persist();
    this.say(`匯入成功：第 ${next.world.stage} 關。`, JADE);
    // 重建整個畫面，讓紀錄與後續每個場景都拿到新的存檔。
    this.time.delayedCall(700, () => fadeToScene(this, 'Title'));
  }

  private say(text: string, color: string): void {
    this.status?.setText(wrapText(text, GAME_WIDTH - 80, 17)).setColor(color);
  }
}
