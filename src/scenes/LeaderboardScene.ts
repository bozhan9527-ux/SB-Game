/**
 * 榜單。
 *
 * 這一頁刻意把**百分位放在名次上面**：名次只有前幾名的人在乎，
 * 而百分位人人都有一個。對第 400 名的玩家來說，「你超過了七成修士」
 * 比「你是第 400 名」有意義得多。
 *
 * 榜上的名字是別人打的字。這裡只當它是文字顯示，不解析、不當成任何指令——
 * 過濾在伺服器那端做過一次（控制字元與零寬字元），這裡再用 fitText 夾住寬度，
 * 長名字撐不破版面。
 */
import Phaser from 'phaser';
import { GAME_WIDTH } from '../config';
import { persist, state } from '../state';
import { cloudEnabled, fetchLeaderboard } from '../net/client';
import { MAX_NAME_LENGTH } from '../net/protocol';
import {
  boardReady,
  percentileLine,
  refreshDistribution,
  registerForBoard,
} from '../systems/leaderboard';
import { MIN_PASSWORD_LENGTH, hasAccount, login, register } from '../systems/account';
import { showForm, showNotice } from '../ui/form';
import { realmForStage } from '../systems/realms';
import { createButton } from '../ui/button';
import { drawBackdrop } from '../ui/backdrop';
import { BG_PANEL, DANGER, GOLD, INK, INK_DIM, JADE, LINE, fitText, hexToNumber, textStyle } from '../ui/theme';
import { fadeIn, fadeToScene } from '../ui/transition';

const LIST_TOP = 226;
const ROW_HEIGHT = 34;
const VISIBLE_ROWS = 16;

export class LeaderboardScene extends Phaser.Scene {
  private rows: Phaser.GameObjects.Text[] = [];
  private status!: Phaser.GameObjects.Text;
  private percentile!: Phaser.GameObjects.Text;
  /** 「你在不在榜上」那一行。它回答的是這一頁最常被問的問題。 */
  private mine!: Phaser.GameObjects.Text;

  constructor() {
    super('Leaderboard');
  }

  create(): void {
    fadeIn(this);
    const save = state();
    const realm = realmForStage(save.world.stage);
    drawBackdrop(this, realm.color, realm.scenery);
    this.rows = [];

    const cx = GAME_WIDTH / 2;
    this.add.text(cx, 44, '榜　單', textStyle({ size: 36, color: INK, bold: true })).setOrigin(0.5);

    // 百分位在最上面，而且用最大的字——它是這一頁對多數人唯一有意義的數字。
    this.percentile = this.add
      .text(cx, 100, '', textStyle({ size: 22, color: JADE, bold: true }))
      .setOrigin(0.5);
    this.add
      .text(cx, 128, `你最深到第 ${save.world.highestStage} 關`, textStyle({ size: 17, color: INK_DIM }))
      .setOrigin(0.5);

    // 「我到底有沒有上榜」是這一頁最常被問的問題，而原本這裡完全沒有回答——
    // 玩家只看得到別人的名次，看不出自己缺了什麼、或是根本已經在榜上了。
    this.mine = this.add
      .text(cx, 154, '', textStyle({ size: 15, color: INK_DIM }))
      .setOrigin(0.5);

    // 有帳號就只需要一顆改名鍵；沒帳號的話這裡是整頁最重要的東西——
    // 他上不了榜，而且在此之前沒有任何地方告訴過他為什麼。
    if (hasAccount(save)) {
      createButton(this, cx, 192, {
        width: 220,
        height: 42,
        label: `改名：${save.player.name}`,
        fontSize: 17,
        onClick: () => this.rename(),
      });
    } else {
      createButton(this, cx - 84, 192, {
        width: 156,
        height: 42,
        label: '註冊',
        fontSize: 17,
        strokeColor: hexToNumber(GOLD),
        textColor: GOLD,
        onClick: () => void this.doRegister(),
      });
      createButton(this, cx + 84, 192, {
        width: 156,
        height: 42,
        label: '登入',
        fontSize: 17,
        onClick: () => void this.doLogin(),
      });
    }

    const width = GAME_WIDTH - 44;
    const height = VISIBLE_ROWS * ROW_HEIGHT + 20;
    this.add
      .rectangle(cx, LIST_TOP + height / 2, width, height, BG_PANEL, 0.9)
      .setStrokeStyle(2, LINE);
    for (let i = 0; i < VISIBLE_ROWS; i += 1) {
      this.rows.push(
        this.add
          .text(cx - width / 2 + 20, LIST_TOP + 22 + i * ROW_HEIGHT, '', textStyle({ size: 17, color: INK }))
          .setOrigin(0, 0.5),
      );
    }

    this.status = this.add
      .text(cx, LIST_TOP + height + 30, '', textStyle({ size: 16, color: INK_DIM }))
      .setOrigin(0.5);

    createButton(this, cx, 900, {
      width: 340,
      height: 60,
      label: '返回',
      fontSize: 22,
      onClick: () => fadeToScene(this, 'Title'),
    });

    this.refreshPercentile();
    void this.prepare();
    void this.loadBoard();
  }

  /**
   * 把上榜這條路先接通，玩家不必知道它存在。
   *
   * 伺服器要求上榜的身分先被登記過（＝上傳過一次雲端存檔），理由是
   * 「被檢舉時查得到是誰」。那個理由成立，但那一步對玩家沒有意義——
   * 他要的是上榜。所以進到這一頁就順手補掉，並且**只在還沒登記時做**，
   * 因此不可能蓋掉雲端已經有的任何東西。
   */
  private async prepare(): Promise<void> {
    if (!cloudEnabled()) return;
    const save = state();
    if (!hasAccount(save)) {
      this.mine.setText('還沒註冊，你不會出現在榜上').setColor(DANGER);
      return;
    }
    if (boardReady(save)) {
      this.mine.setText('上榜已開通，通關就會自動送出').setColor(INK_DIM);
      return;
    }
    this.mine.setText('開通上榜中…').setColor(INK_DIM);
    if (await registerForBoard(save)) {
      persist();
      this.mine.setText('上榜已開通，通關就會自動送出').setColor(JADE);
    } else {
      this.mine.setText('開通失敗，通關時會再試一次').setColor(DANGER);
    }
  }

  /**
   * 註冊。
   *
   * 兩件事一定要在按下去之前講清楚：**沒有 email 就沒有重設密碼**，
   * 以及救援手段是既有的存檔碼。忘記密碼在這套設計裡是真的救不回來的，
   * 事後才說等於騙人。
   */
  private async doRegister(): Promise<void> {
    const values = await showForm({
      title: '註冊',
      note:
        '註冊之後才能上榜，而且換裝置能把進度接回來。\n' +
        `密碼至少 ${MIN_PASSWORD_LENGTH} 個字。\n\n` +
        '⚠ 沒有 email，所以忘記密碼救不回來。\n記得到「存檔」複製一份存檔碼收好，那是唯一的備援。',
      fields: [
        { key: 'name', label: '道號（榜上顯示的名字）', maxLength: MAX_NAME_LENGTH },
        { key: 'password', label: '密碼', password: true, maxLength: 64 },
      ],
      submit: '註冊',
    });
    if (values === null) return;

    this.mine.setText('註冊中…').setColor(INK_DIM);
    const outcome = await register(state(), values['name'] ?? '', values['password'] ?? '');
    if (outcome.kind === 'failed') {
      this.mine.setText(outcome.reason).setColor(DANGER);
      return;
    }
    persist();
    await showNotice('註冊完成', `道號：${outcome.name}\n之後通關就會自動上榜。`);
    this.scene.restart();
  }

  /**
   * 登入。
   *
   * **只換身分，不動進度。** 把雲端那份拉下來是「存檔」頁那個明確的動作——
   * 蓋掉本機進度這種事不該藏在「登入」兩個字底下。
   */
  private async doLogin(): Promise<void> {
    const values = await showForm({
      title: '登入',
      note: '登入只會換回你的身分，不會動到這台裝置上的進度。\n要把雲端那份拉下來，到「存檔」按下載。',
      fields: [
        { key: 'name', label: '道號', maxLength: MAX_NAME_LENGTH },
        { key: 'password', label: '密碼', password: true, maxLength: 64 },
      ],
      submit: '登入',
    });
    if (values === null) return;

    this.mine.setText('登入中…').setColor(INK_DIM);
    const outcome = await login(state(), values['name'] ?? '', values['password'] ?? '');
    if (outcome.kind === 'failed') {
      this.mine.setText(outcome.reason).setColor(DANGER);
      return;
    }
    persist();
    await showNotice('登入完成', `道號：${outcome.name}\n要接回雲端進度的話，到「存檔」按下載。`);
    this.scene.restart();
  }

  private rename(): void {
    const save = state();
    const typed = window.prompt('上榜要用什麼名字？', save.player.name || '無名修士');
    if (typed === null) return;
    save.player.name = typed.slice(0, MAX_NAME_LENGTH);
    persist();
    // 名字要下一次上榜才會生效：伺服器上那一筆是連同成績一起寫進去的。
    this.status.setText('已改名。下次通關上榜時生效。').setColor(JADE);
  }

  private refreshPercentile(): void {
    const save = state();
    const line = percentileLine(save, save.world.highestStage);
    this.percentile
      .setText(line ?? '樣本還不夠多，百分位先不算')
      .setColor(line === null ? INK_DIM : JADE);
    fitText(this.percentile, GAME_WIDTH - 40);
  }

  private async loadBoard(): Promise<void> {
    if (!cloudEnabled()) {
      this.status.setText('這個版本沒有連線功能。');
      return;
    }
    this.status.setText('載入中…');

    if (await refreshDistribution(state(), Date.now())) {
      persist();
      this.refreshPercentile();
    }

    const result = await fetchLeaderboard();
    if (!result.ok) {
      this.status.setText('連不上伺服器，稍後再試。');
      return;
    }
    if (result.entries.length === 0) {
      this.status.setText('榜上還沒有人。通關一次就是第一名。');
      return;
    }

    result.entries.slice(0, VISIBLE_ROWS).forEach((entry, index) => {
      const row = this.rows[index];
      if (row === undefined) return;
      row.setText(`${String(entry.rank).padStart(2, ' ')}　${entry.name}　第 ${entry.stage} 關`);
      // 名字是別人打的字，長度不受這裡控制——夾住寬度，撐不破版面。
      fitText(row, GAME_WIDTH - 80);
      if (entry.rank <= 3) row.setColor(GOLD);
    });
    this.status.setText(`共 ${result.total} 人上榜`);
  }
}
