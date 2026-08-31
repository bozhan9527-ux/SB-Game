/**
 * 存檔與紀錄。
 *
 * 一頁回答同一個問題：「我的進度在哪裡？」——本機紀錄、可以帶著走的存檔碼、
 * 以及雲端同步。
 *
 * **存檔碼沒有因為有了雲端就退場。** 它不需要網路、不需要伺服器活著，
 * 而且它同時是雲端身分的救援手段（身分就存在存檔裡）。雲端是方便，
 * 存檔碼是保險，兩者解決的不是同一種失敗。
 */
import Phaser from 'phaser';
import { GAME_WIDTH } from '../config';
import { exportCode, importCode } from '../save/archive';
import { adoptSave } from '../save';
import { persist, replaceState, state } from '../state';
import { cloudEnabled, getSave, putSave } from '../net/client';
import { adoptCloudBlob, compare, ensureCloudIdentity } from '../systems/cloud';
import { realmForStage } from '../systems/realms';
import { setTelemetryEnabled } from '../telemetry';
import { recordLines } from '../systems/records';
import { createButton } from '../ui/button';
import { drawBackdrop } from '../ui/backdrop';
import { BG_PANEL, DANGER, GOLD, INK, INK_DIM, JADE, LINE, textStyle, wrapText } from '../ui/theme';
import { fadeIn, fadeToScene } from '../ui/transition';

/** 版面。每一段的高度都是算過的，加東西就要重算——這是 PROGRESS 的 L-08。 */
const RECORDS_TOP = 92;
const RECORDS_ROW = 34;
const CODE_TOP = 378;
const CLOUD_TOP = 560;
const PRIVACY_Y = 758;

export class ArchiveScene extends Phaser.Scene {
  private status: Phaser.GameObjects.Text | undefined;
  private cloudStatus: Phaser.GameObjects.Text | undefined;

  constructor() {
    super('Archive');
  }

  create(): void {
    fadeIn(this);
    const save = state();
    const realm = realmForStage(save.world.stage);
    drawBackdrop(this, realm.color, realm.scenery);
    this.status = undefined;
    this.cloudStatus = undefined;

    const cx = GAME_WIDTH / 2;
    this.add.text(cx, 40, '存　檔', textStyle({ size: 36, color: INK, bold: true })).setOrigin(0.5);

    this.buildRecords(cx, RECORDS_TOP);
    this.buildArchive(cx, CODE_TOP);
    if (cloudEnabled()) this.buildCloud(cx, CLOUD_TOP);
    this.buildPrivacy(cx, PRIVACY_Y);

    createButton(this, cx, 880, {
      width: 340,
      height: 62,
      label: '返回',
      fontSize: 24,
      onClick: () => fadeToScene(this, 'Title'),
    });
  }

  /** 個人紀錄。 */
  private buildRecords(cx: number, top: number): void {
    const lines = recordLines(state());
    const width = GAME_WIDTH - 44;
    const height = lines.length * RECORDS_ROW + 56;

    this.add.rectangle(cx, top + height / 2, width, height, BG_PANEL, 0.9).setStrokeStyle(2, LINE);
    this.add
      .text(cx, top + 20, '個人紀錄', textStyle({ size: 22, color: GOLD, bold: true }))
      .setOrigin(0.5);
    this.add
      .text(cx, top + 44, '這幾個數字只存在這台裝置上', textStyle({ size: 13, color: INK_DIM }))
      .setOrigin(0.5);

    lines.forEach((line, index) => {
      const y = top + 76 + index * RECORDS_ROW;
      this.add
        .text(cx - width / 2 + 22, y, line.label, textStyle({ size: 17, color: INK_DIM }))
        .setOrigin(0, 0.5);
      this.add
        .text(cx + width / 2 - 22, y, line.value, textStyle({ size: 19, color: INK, bold: true }))
        .setOrigin(1, 0.5);
    });
  }

  /** 存檔碼：不需要網路的那條路。 */
  private buildArchive(cx: number, top: number): void {
    const width = GAME_WIDTH - 44;
    this.add.text(cx, top, '存檔碼', textStyle({ size: 22, color: GOLD, bold: true })).setOrigin(0.5);
    this.add
      .text(
        cx,
        top + 26,
        wrapText('複製起來收好。換裝置、清過快取，貼回來就接得上，不需要網路。', width - 40, 14),
        textStyle({ size: 14, color: INK_DIM }),
      )
      .setOrigin(0.5)
      .setAlign('center')
      .setLineSpacing(3);

    createButton(this, cx - 92, top + 92, {
      width: 168,
      height: 56,
      label: '匯出　複製',
      fontSize: 20,
      strokeColor: 0x6f8b7a,
      onClick: () => void this.doExport(),
    });
    createButton(this, cx + 92, top + 92, {
      width: 168,
      height: 56,
      label: '匯入　貼上',
      fontSize: 20,
      onClick: () => this.doImport(),
    });

    this.status = this.add
      .text(cx, top + 134, '', textStyle({ size: 15, color: JADE }))
      .setOrigin(0.5)
      .setAlign('center');
  }

  /**
   * 雲端同步。
   *
   * 刻意做成**兩顆手動的按鈕**而不是自動同步：自動同步要處理「兩邊都改過」
   * 這件事，而在沒有帳號、沒有衝突解決介面的情況下，那只會變成靜靜地
   * 覆蓋掉某一邊。手動的話，玩家至少看得到兩份的時間再決定。
   */
  private buildCloud(cx: number, top: number): void {
    const width = GAME_WIDTH - 44;
    this.add.text(cx, top, '雲端存檔', textStyle({ size: 22, color: GOLD, bold: true })).setOrigin(0.5);
    this.add
      .text(
        cx,
        top + 26,
        wrapText('上傳一份到伺服器，換裝置時下載回來。身分就在存檔碼裡。', width - 40, 14),
        textStyle({ size: 14, color: INK_DIM }),
      )
      .setOrigin(0.5)
      .setAlign('center')
      .setLineSpacing(3);

    createButton(this, cx - 92, top + 88, {
      width: 168,
      height: 56,
      label: '上傳',
      fontSize: 20,
      strokeColor: 0x6f8b7a,
      onClick: () => void this.doUpload(),
    });
    createButton(this, cx + 92, top + 88, {
      width: 168,
      height: 56,
      label: '下載',
      fontSize: 20,
      onClick: () => void this.doDownload(),
    });

    const save = state();
    const synced = save.player.cloud?.syncedAt ?? 0;
    this.cloudStatus = this.add
      .text(
        cx,
        top + 130,
        synced > 0 ? `上次同步：${new Date(synced).toLocaleString()}` : '尚未同步過',
        textStyle({ size: 15, color: INK_DIM }),
      )
      .setOrigin(0.5)
      .setAlign('center');
  }

  private async doUpload(): Promise<void> {
    const save = state();
    const identity = ensureCloudIdentity(save);
    this.sayCloud('上傳中…', INK_DIM);

    // 先看雲端那份，才有辦法在覆蓋之前告訴玩家他要蓋掉的是什麼。
    const existing = await getSave({ playerId: identity.playerId, secret: identity.secret });
    if (existing.ok && compare(save.savedAt, existing.savedAt) === 'cloudNewer') {
      const confirmed = window.confirm(
        `雲端那一份比較新（${new Date(existing.savedAt).toLocaleString()}），\n` +
          `本機這一份是 ${new Date(save.savedAt).toLocaleString()}。\n\n上傳會蓋掉雲端那一份，確定嗎？`,
      );
      if (!confirmed) {
        this.sayCloud('已取消，雲端那一份沒有動。', INK_DIM);
        return;
      }
    }

    const result = await putSave({
      playerId: identity.playerId,
      secret: identity.secret,
      savedAt: save.savedAt,
      blob: JSON.stringify(save),
    });
    if (!result.ok) {
      this.sayCloud(this.explain(result.error), DANGER);
      return;
    }
    identity.syncedAt = Date.now();
    persist();
    this.sayCloud('已上傳。', JADE);
  }

  private async doDownload(): Promise<void> {
    const save = state();
    const identity = ensureCloudIdentity(save);
    this.sayCloud('下載中…', INK_DIM);

    const result = await getSave({ playerId: identity.playerId, secret: identity.secret });
    if (!result.ok) {
      this.sayCloud(
        result.error === 'notFound' ? '雲端還沒有這個身分的存檔，先上傳一次。' : this.explain(result.error),
        result.error === 'notFound' ? INK_DIM : DANGER,
      );
      return;
    }

    // 下載會蓋掉本機，所以一定要問——這是這個畫面上最不可逆的一個動作。
    const freshness = compare(save.savedAt, result.savedAt);
    const warning =
      freshness === 'localNewer'
        ? '⚠ 本機這一份比雲端的新，下載會把較新的那份蓋掉。\n\n'
        : '';
    const confirmed = window.confirm(
      `${warning}雲端：${new Date(result.savedAt).toLocaleString()}\n` +
        `本機：${new Date(save.savedAt).toLocaleString()}\n\n下載會覆蓋本機進度，確定嗎？`,
    );
    if (!confirmed) {
      this.sayCloud('已取消，本機進度沒有動。', INK_DIM);
      return;
    }

    const next = adoptCloudBlob(result.blob, identity, Date.now());
    if (next === null) {
      this.sayCloud('雲端那份存檔讀不出來。', DANGER);
      return;
    }
    replaceState(next);
    persist();
    this.sayCloud(`已下載：第 ${next.world.stage} 關。`, JADE);
    this.time.delayedCall(700, () => fadeToScene(this, 'Title'));
  }

  private explain(error: string): string {
    if (error === 'unauthorized') return '身分對不上。這台裝置的存檔碼和雲端那份不是同一組。';
    if (error === 'tooLarge') return '存檔太大，傳不上去。';
    return '連不上伺服器，稍後再試。';
  }

  private sayCloud(text: string, color: string): void {
    this.cloudStatus?.setText(wrapText(text, GAME_WIDTH - 60, 15)).setColor(color);
  }

  /**
   * 匿名統計的開關。
   *
   * 送出去的只有五個事件、不含任何可辨識個人的資料，可是「有沒有得選」
   * 本身就是該給的東西，而且要給在玩家找得到的地方。
   */
  private buildPrivacy(cx: number, top: number): void {
    const save = state();
    const label = (): string => (save.settings.telemetry ? '匿名統計 開' : '匿名統計 關');
    const button = createButton(this, cx + 92, top, {
      width: 168,
      height: 52,
      label: label(),
      fontSize: 18,
      onClick: () => {
        save.settings.telemetry = !save.settings.telemetry;
        setTelemetryEnabled(save.settings.telemetry);
        persist();
        button.setLabel(label());
      },
    });
    this.add
      .text(
        cx - 92,
        top,
        wrapText('送出關卡進度等匿名統計，幫助調整難度。不含個人資料。', 168, 13),
        textStyle({ size: 13, color: INK_DIM }),
      )
      .setOrigin(0.5)
      .setAlign('center')
      .setLineSpacing(3);
  }

  private async doExport(): Promise<void> {
    const code = exportCode(state());
    try {
      await navigator.clipboard.writeText(code);
      this.say(`已複製（${code.length} 字）。貼到記事本或傳給自己收好。`, JADE);
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
    this.time.delayedCall(700, () => fadeToScene(this, 'Title'));
  }

  private say(text: string, color: string): void {
    this.status?.setText(wrapText(text, GAME_WIDTH - 80, 15)).setColor(color);
  }
}
