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
import { realmForStage } from '../systems/realms';
import { createButton } from '../ui/button';
import { drawBackdrop } from '../ui/backdrop';
import { BG_PANEL, DANGER, GOLD, INK, INK_DIM, JADE, LINE, fitText, textStyle } from '../ui/theme';
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

    createButton(this, cx, 192, {
      width: 220,
      height: 42,
      label: save.player.name.length > 0 ? `改名：${save.player.name}` : '取一個上榜的名字',
      fontSize: 17,
      onClick: () => this.rename(),
    });

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
