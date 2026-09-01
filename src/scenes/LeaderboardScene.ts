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
import type { BoardKind, LeaderboardEntry } from '../net/protocol';
import { SPEED_STAGE } from '../net/protocol';
import { MAX_NAME_LENGTH } from '../net/protocol';
import {
  boardReady,
  registerForBoard,
} from '../systems/leaderboard';
import {
  MIN_PASSWORD_LENGTH,
  hasAccount,
  login,
  register,
  rename,
  requestRecovery,
  resetPassword,
} from '../systems/account';
import { showForm, showNotice } from '../ui/form';
import { realmForStage } from '../systems/realms';
import { createButton } from '../ui/button';
import { drawBackdrop } from '../ui/backdrop';
import { BG_PANEL, DANGER, GOLD, INK, INK_DIM, JADE, LINE, fitText, formatTime, hexToNumber, textStyle } from '../ui/theme';
import { fadeIn, fadeToScene } from '../ui/transition';

const LIST_TOP = 240;
const ROW_HEIGHT = 34;
const VISIBLE_ROWS = 14;

export class LeaderboardScene extends Phaser.Scene {
  private rows: Phaser.GameObjects.Text[] = [];
  private status!: Phaser.GameObjects.Text;
  /** 「你在不在榜上」那一行。它回答的是這一頁最常被問的問題。 */
  private mine!: Phaser.GameObjects.Text;
  /** 現在看的是哪一個榜。 */
  private board: BoardKind = 'depth';
  /** 「你自己那一列」。前 N 名之外的人靠它才看得到自己。 */
  private selfRow!: Phaser.GameObjects.Text;

  constructor() {
    super('Leaderboard');
  }

  /** 換分頁是 restart 這個場景，所以要把「現在在哪一個榜」帶過去。 */
  init(data?: { board?: BoardKind }): void {
    this.board = data?.board ?? 'depth';
  }

  create(): void {
    fadeIn(this);
    const save = state();
    const realm = realmForStage(save.world.stage);
    drawBackdrop(this, realm.color, realm.scenery);
    this.rows = [];

    const cx = GAME_WIDTH / 2;
    this.add.text(cx, 44, '榜　單', textStyle({ size: 36, color: INK, bold: true })).setOrigin(0.5);

    // 三個分頁。同一頁塞三種排序會讓人看不出現在在看什麼，
    // 而三個榜回答的是三個不同的問題：走得多深、多快、撐得多久。
    const tabs: [BoardKind, string][] = [
      ['depth', '推得最深'],
      ['speed', '速通'],
      ['arena', '競技場'],
    ];
    tabs.forEach(([kind, label], index) => {
      const active = kind === this.board;
      createButton(this, cx + (index - 1) * 116, 86, {
        width: 110,
        height: 36,
        label,
        fontSize: 16,
        fillColor: active ? hexToNumber(GOLD) : BG_PANEL,
        strokeColor: active ? hexToNumber(GOLD) : LINE,
        textColor: active ? '#1a1408' : INK_DIM,
        onClick: () => {
          if (!active) this.scene.restart({ board: kind });
        },
      });
    });

    // **最上面那一行寫自己的進度，不寫百分位。**
    //
    // 百分位要榜上先有夠多人才算得出來，在那之前它固定顯示「樣本還不夠多」——
    // 一行永遠不會變的字，佔著整頁最大的字級。進度則是他每推一關就會動的數字，
    // 而且不必連線、不必等別人上榜就有。
    this.add
      .text(
        cx,
        136,
        `你最深到第 ${save.world.highestStage} 關`,
        textStyle({ size: 22, color: GOLD, bold: true }),
      )
      .setOrigin(0.5);

    // 「我到底有沒有上榜」是這一頁最常被問的問題，而原本這裡完全沒有回答——
    // 玩家只看得到別人的名次，看不出自己缺了什麼、或是根本已經在榜上了。
    this.mine = this.add
      .text(cx, 174, '', textStyle({ size: 15, color: INK_DIM }))
      .setOrigin(0.5);

    // 有帳號就只需要一顆改名鍵；沒帳號的話這裡是整頁最重要的東西——
    // 他上不了榜，而且在此之前沒有任何地方告訴過他為什麼。
    if (hasAccount(save)) {
      createButton(this, cx, 208, {
        width: 220,
        height: 42,
        label: `改名：${save.player.name}`,
        fontSize: 17,
        onClick: () => void this.rename(),
      });
    } else {
      createButton(this, cx - 110, 208, {
        width: 104,
        height: 42,
        label: '註冊',
        fontSize: 17,
        strokeColor: hexToNumber(GOLD),
        textColor: GOLD,
        onClick: () => void this.doRegister(),
      });
      createButton(this, cx, 208, {
        width: 104,
        height: 42,
        label: '登入',
        fontSize: 17,
        onClick: () => void this.doLogin(),
      });
      createButton(this, cx + 110, 208, {
        width: 104,
        height: 42,
        label: '忘記密碼',
        fontSize: 15,
        onClick: () => void this.doRecover(),
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

    // 你自己那一列，釘在名單底下。
    //
    // **前 N 名之外的人也要看得到自己。** 沒有這一行的話，第 400 名的玩家
    // 在這一頁永遠找不到自己——而他才是絕大多數。
    this.selfRow = this.add
      .text(cx, LIST_TOP + height + 20, '', textStyle({ size: 17, color: GOLD, bold: true }))
      .setOrigin(0.5);

    this.status = this.add
      .text(cx, LIST_TOP + height + 48, '', textStyle({ size: 16, color: INK_DIM }))
      .setOrigin(0.5);

    createButton(this, cx, 900, {
      width: 340,
      height: 60,
      label: '返回',
      fontSize: 22,
      onClick: () => fadeToScene(this, 'Title'),
    });

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
   * **帳號是信箱，道號只是榜上顯示的名字。** 密碼要打兩次——這一組密碼
   * 同時是身分密鑰，打錯一個字不會當場報錯，只會在下次登入時變成
   * 「密碼不對」，而那時候他已經想不起來自己打了什麼。
   */
  private async doRegister(): Promise<void> {
    const values = await showForm({
      title: '註冊',
      note:
        '註冊之後才能上榜，換裝置也能把進度接回來。\n' +
        `密碼至少 ${MIN_PASSWORD_LENGTH} 個字。\n` +
        '信箱只用來在你忘記密碼時寄驗證碼，不做別的事。',
      fields: [
        { key: 'email', label: '電子信箱（就是帳號）', email: true, maxLength: 254 },
        { key: 'name', label: '道號（榜上顯示的名字）', maxLength: MAX_NAME_LENGTH },
        { key: 'password', label: '密碼', password: true, maxLength: 64 },
        { key: 'again', label: '再輸入一次密碼', password: true, maxLength: 64 },
      ],
      // 在表單上擋，不送出去再回一句錯誤：他打的東西不該因為一個錯字全沒。
      validate: (v) => {
        if ((v['password'] ?? '').length < MIN_PASSWORD_LENGTH) {
          return `密碼至少要 ${MIN_PASSWORD_LENGTH} 個字`;
        }
        if (v['password'] !== v['again']) return '兩次輸入的密碼不一樣';
        return null;
      },
      submit: '註冊',
    });
    if (values === null) return;

    this.mine.setText('註冊中…').setColor(INK_DIM);
    const outcome = await register(
      state(),
      values['email'] ?? '',
      values['name'] ?? '',
      values['password'] ?? '',
    );
    if (outcome.kind === 'failed') {
      this.mine.setText(outcome.reason).setColor(DANGER);
      return;
    }
    persist();
    await showNotice('註冊完成', `道號：${outcome.name}\n之後通關就會自動上榜。`);
    this.scene.restart({ board: this.board });
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
        { key: 'email', label: '電子信箱', email: true, maxLength: 254 },
        { key: 'password', label: '密碼', password: true, maxLength: 64 },
      ],
      submit: '登入',
    });
    if (values === null) return;

    this.mine.setText('登入中…').setColor(INK_DIM);
    const outcome = await login(state(), values['email'] ?? '', values['password'] ?? '');
    if (outcome.kind === 'failed') {
      // 登入失敗最常見的原因是忘記密碼，所以順手把那條路指出來。
      this.mine.setText(`${outcome.reason}（可用「忘記密碼」重設）`).setColor(DANGER);
      return;
    }
    persist();
    await showNotice('登入完成', `道號：${outcome.name}\n要接回雲端進度的話，到「存檔」按下載。`);
    this.scene.restart({ board: this.board });
  }

  /**
   * 忘記密碼。
   *
   * 兩張表單：先要信箱，再收驗證碼與新密碼。分兩步是因為中間隔著一封信——
   * 硬塞在同一張表上，玩家會對著一個還拿不到答案的欄位發呆。
   */
  private async doRecover(): Promise<void> {
    const asked = await showForm({
      title: '忘記密碼',
      note: '輸入註冊時留的信箱，我們寄一組六位數驗證碼過去。',
      fields: [{ key: 'email', label: '電子信箱', email: true, maxLength: 254 }],
      submit: '寄驗證碼',
    });
    if (asked === null) return;
    const email = asked['email'] ?? '';

    this.mine.setText('寄送中…').setColor(INK_DIM);
    const sent = await requestRecovery(email);
    if (sent.kind === 'failed') {
      this.mine.setText(sent.reason).setColor(DANGER);
      return;
    }

    const values = await showForm({
      title: '重設密碼',
      // **不說「已寄出」。** 伺服器對「這個信箱沒註冊過」和「寄出了」回同一句話，
      // 那是刻意的（不然這裡就變成查詢工具），所以這裡也不能講得比它確定。
      note: `如果 ${email} 有註冊過，驗證碼已經在路上了。\n三十分鐘內有效。收不到的話看一下垃圾信匣。`,
      fields: [
        { key: 'code', label: '驗證碼', numeric: true, maxLength: 8 },
        { key: 'password', label: '新密碼', password: true, maxLength: 64 },
        { key: 'again', label: '再輸入一次新密碼', password: true, maxLength: 64 },
      ],
      validate: (v) => {
        if ((v['password'] ?? '').length < MIN_PASSWORD_LENGTH) {
          return `密碼至少要 ${MIN_PASSWORD_LENGTH} 個字`;
        }
        if (v['password'] !== v['again']) return '兩次輸入的密碼不一樣';
        return null;
      },
      submit: '設定新密碼',
    });
    if (values === null) return;

    this.mine.setText('重設中…').setColor(INK_DIM);
    const outcome = await resetPassword(
      state(),
      email,
      values['code'] ?? '',
      values['password'] ?? '',
    );
    if (outcome.kind === 'failed') {
      this.mine.setText(outcome.reason).setColor(DANGER);
      return;
    }
    persist();
    await showNotice('密碼已重設', `道號：${outcome.name}\n進度沒有任何變動。要接回雲端那份的話，到「存檔」按下載。`);
    this.scene.restart({ board: this.board });
  }

  /**
   * 改道號。
   *
   * 帳號是信箱，所以改名只換榜上顯示的那個名字——身分與進度都不動，
   * 而且伺服器會把榜上那幾列一起改掉，不必再破一次自己的紀錄。
   */
  private async rename(): Promise<void> {
    const save = state();
    const values = await showForm({
      title: '改道號',
      note: '只換榜上顯示的名字，帳號（信箱）與進度都不動。',
      fields: [{ key: 'name', label: '新的道號', maxLength: MAX_NAME_LENGTH }],
      submit: '改名',
    });
    if (values === null) return;
    const outcome = await rename(save, values['name'] ?? '');
    if (outcome.kind === 'failed') {
      this.mine.setText(outcome.reason).setColor(DANGER);
      return;
    }
    persist();
    this.scene.restart({ board: this.board });
  }


  /** 一列在這個榜上怎麼讀。三個榜的分數是三種東西，只有這裡知道差別。 */
  private describe(entry: LeaderboardEntry): string {
    const time = formatTime(entry.elapsedMs);
    if (this.board === 'speed') return `第 ${entry.stage} 關　${time}`;
    if (this.board === 'arena') return `${entry.score} 波　${time}`;
    return `第 ${entry.score} 關　${time}`;
  }

  private async loadBoard(): Promise<void> {
    if (!cloudEnabled()) {
      this.status.setText('這個版本沒有連線功能。');
      return;
    }
    this.status.setText('載入中…');

    const save = state();
    const result = await fetchLeaderboard(this.board, save.player.cloud?.playerId ?? null);
    if (!result.ok) {
      this.status.setText('連不上伺服器，稍後再試。');
      return;
    }
    if (result.entries.length === 0) {
      this.status.setText(
        this.board === 'speed'
          ? `還沒有人打完第 ${SPEED_STAGE} 關。`
          : '榜上還沒有人。第一個上榜的就是第一名。',
      );
    } else {
      this.status.setText(`共 ${result.total} 人上榜`);
    }

    const mineId = save.player.cloud?.playerId ?? null;
    result.entries.slice(0, VISIBLE_ROWS).forEach((entry, index) => {
      const row = this.rows[index];
      if (row === undefined) return;
      row.setText(`${String(entry.rank).padStart(2, ' ')}　${entry.name}　${this.describe(entry)}`);
      // 名字是別人打的字，長度不受這裡控制——夾住寬度，撐不破版面。
      fitText(row, GAME_WIDTH - 80);
      // 自己那一列標成金色，前三名也是——兩者同時成立時自己優先。
      const isMine = mineId !== null && result.mine !== null && result.mine.rank === entry.rank;
      if (isMine) row.setColor(JADE);
      else if (entry.rank <= 3) row.setColor(GOLD);
    });

    this.selfRow.setText(
      result.mine === null
        ? ''
        : `你　第 ${result.mine.rank} / ${result.total} 名　${this.describe(result.mine)}`,
    );
    fitText(this.selfRow, GAME_WIDTH - 40);
  }

}
