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
import { GAME_HEIGHT, GAME_WIDTH } from '../config';
import { persist, state } from '../state';
import { cloudEnabled, fetchLeaderboard } from '../net/client';
import type { BoardKind, LeaderboardEntry } from '../net/protocol';
import { MAX_NAME_LENGTH } from '../net/protocol';
import {
  boardReady,
  registerForBoard,
} from '../systems/leaderboard';
import {
  MIN_PASSWORD_LENGTH,
  hasAccount,
  login,
  questionFor,
  register,
  rename,
  requestRecovery,
  resetByQuestion,
  resetPassword,
  setQuestion,
} from '../systems/account';
import { showForm, showNotice } from '../ui/form';
import {
  REPLAY_CONTRACT_VERSION,
  MAX_SPEED_STAGE,
  speedBoard,
  trackOfBoard,
  MAX_ANSWER_ATTEMPTS,
  MAX_QUESTION_LENGTH,
  MIN_ANSWER_LENGTH,
  cleanAnswer,
  cleanQuestion,
} from '../net/protocol';
import { realmForStage } from '../systems/realms';
import { createButton } from '../ui/button';
import { drawBackdrop } from '../ui/backdrop';
import { BG_PANEL, BG_PANEL_ALT, DANGER, GOLD, INK, INK_DIM, JADE, LINE, fitText, formatTime, hexToNumber, textStyle } from '../ui/theme';
import { fadeIn, fadeToScene } from '../ui/transition';

const LIST_TOP = 240;
const ROW_HEIGHT = 40;
const VISIBLE_ROWS = 12;

/**
 * 前三名的獎牌顏色：金、銀、銅。
 *
 * 第 4～10 名不給顏色，只給一圈框——**顏色要留給真的稀有的東西**。
 * 十個名次十種顏色的話，前三名就不再顯眼了，而那正是最該被獎勵的位置。
 */
const MEDALS = ['#e8c46a', '#cdd6de', '#c98a52'] as const;
/** 給到第幾名為止有牌。再往下就只是一個數字。 */
const MEDAL_RANKS = 10;

export class LeaderboardScene extends Phaser.Scene {
  private rows: {
    medal: Phaser.GameObjects.Arc;
    rank: Phaser.GameObjects.Text;
    name: Phaser.GameObjects.Text;
    score: Phaser.GameObjects.Text;
  }[] = [];
  /** 榜的版面。速通分頁多一列賽道，所以這兩個是算出來的，不是常數。 */
  private listTop = LIST_TOP;
  private visibleRows = VISIBLE_ROWS;
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
    const track = trackOfBoard(this.board);
    const tabs: [BoardKind, string][] = [
      ['depth', '推得最深'],
      // 進速通分頁時預設落在他最深的那一關——那裡最可能有他自己的紀錄。
      // 預設停在第 1 關的話，推很遠的人每次進來都要點一長串才找得到自己。
      [speedBoard(track ?? Math.max(1, save.world.highestStage)), '速通'],
      ['arena', '競技場'],
    ];
    tabs.forEach(([kind, label], index) => {
      const active = kind === this.board || (index === 1 && track !== null);
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

    // 速通分頁多一列關卡選擇。**一關就是一個獨立的榜**：同一個榜上大家打的
    // 必然是同一關，秒數才真的可以比。混成一個榜的話，第 1 關 40 秒會贏過
    // 第 81 關 3 分鐘，它就退化成「誰最快打完最簡單的一關」。
    //
    // 用左右鍵而不是把每一關列出來：關卡有好幾百個，列不完。大跳十關那兩顆
    // 是必要的——一關一關點過去，推到第 152 關的人要點一百多下。
    // 賽道那一列多佔一行，所以底下整塊往下推，榜少放一列——
    // 不推的話它會直接壓在「你最深到第幾關」上面。
    const shift = track === null ? 0 : 40;
    this.listTop = LIST_TOP + shift;
    this.visibleRows = VISIBLE_ROWS - (track === null ? 0 : 1);

    if (track !== null) {
      const go = (stage: number): void => {
        const target = Math.max(1, Math.min(MAX_SPEED_STAGE, stage));
        if (target !== track) this.scene.restart({ board: speedBoard(target) });
      };
      const steps: [number, string][] = [
        [-10, '«'],
        [-1, '‹'],
        [1, '›'],
        [10, '»'],
      ];
      // x 直接寫死，不用等距換算——中間那一格要留給「第 9999 關」，
      // 而算出來的間距一縮，「›」就會被關卡數字整個蓋掉：按鈕還在、
      // 點得到，只是看不見。這種壞法沒有人查得出來。
      const xs = [-166, -104, 104, 166];
      steps.forEach(([delta, label], index) => {
        createButton(this, cx + (xs[index] ?? 0), 122, {
          width: 52,
          height: 32,
          label,
          fontSize: 18,
          onClick: () => go(track + delta),
        });
      });
      this.add
        .text(cx, 122, `第 ${track} 關`, textStyle({ size: 17, color: JADE, bold: true }))
        .setOrigin(0.5);
    }

    // **最上面那一行寫自己的進度，不寫百分位。**
    //
    // 百分位要榜上先有夠多人才算得出來，在那之前它固定顯示「樣本還不夠多」——
    // 一行永遠不會變的字，佔著整頁最大的字級。進度則是他每推一關就會動的數字，
    // 而且不必連線、不必等別人上榜就有。
    this.add
      .text(
        cx,
        136 + shift,
        `你最深到第 ${save.world.highestStage} 關`,
        textStyle({ size: 22, color: GOLD, bold: true }),
      )
      .setOrigin(0.5);

    // 「我到底有沒有上榜」是這一頁最常被問的問題，而原本這裡完全沒有回答——
    // 玩家只看得到別人的名次，看不出自己缺了什麼、或是根本已經在榜上了。
    this.mine = this.add
      .text(cx, 174 + shift, '', textStyle({ size: 15, color: INK_DIM }))
      .setOrigin(0.5);


    // 有帳號就只需要一顆改名鍵；沒帳號的話這裡是整頁最重要的東西——
    // 他上不了榜，而且在此之前沒有任何地方告訴過他為什麼。
    if (hasAccount(save)) {
      createButton(this, cx - 58, 208 + shift, {
        width: 160,
        height: 42,
        label: `改名：${save.player.name}`,
        fontSize: 15,
        onClick: () => void this.rename(),
      });
      // 註冊之前就存在的帳號沒有救援問題，這顆是他們補上的地方。
      createButton(this, cx + 84, 208 + shift, {
        width: 116,
        height: 42,
        label: '救援問題',
        fontSize: 15,
        onClick: () => void this.doSetQuestion(),
      });
    } else {
      createButton(this, cx - 110, 208 + shift, {
        width: 104,
        height: 42,
        label: '註冊',
        fontSize: 17,
        strokeColor: hexToNumber(GOLD),
        textColor: GOLD,
        onClick: () => void this.doRegister(),
      });
      createButton(this, cx, 208 + shift, {
        width: 104,
        height: 42,
        label: '登入',
        fontSize: 17,
        onClick: () => void this.doLogin(),
      });
      createButton(this, cx + 110, 208 + shift, {
        width: 104,
        height: 42,
        label: '忘記密碼',
        fontSize: 15,
        onClick: () => void this.doRecover(),
      });
    }

    const width = GAME_WIDTH - 44;
    const height = this.visibleRows * ROW_HEIGHT + 20;
    this.add
      .rectangle(cx, this.listTop + height / 2, width, height, BG_PANEL, 0.9)
      .setStrokeStyle(2, LINE);
    // 一列拆成三塊：獎牌、名字、成績。
    //
    // 原本是一整條字串，於是名字只能和名次、成績共用同一個字級——而**名字
    // 才是這一頁在看的東西**（「我朋友在不在上面」是這一頁最常被問的問題）。
    // 拆開之後名字放大到 21，成績退到 15 並靠右對齊，名次則變成一枚牌。
    const left = cx - width / 2;
    for (let i = 0; i < this.visibleRows; i += 1) {
      const y = this.listTop + 24 + i * ROW_HEIGHT;
      this.rows.push({
        medal: this.add.circle(left + 32, y, 15).setStrokeStyle(2, LINE).setVisible(false),
        rank: this.add
          .text(left + 32, y, '', textStyle({ size: 15, color: INK_DIM, bold: true }))
          .setOrigin(0.5),
        name: this.add
          .text(left + 60, y, '', textStyle({ size: 21, color: INK, bold: true }))
          .setOrigin(0, 0.5),
        score: this.add
          .text(left + width - 18, y, '', textStyle({ size: 15, color: INK_DIM }))
          .setOrigin(1, 0.5),
      });
    }

    // 你自己那一列，釘在名單底下。
    //
    // **前 N 名之外的人也要看得到自己。** 沒有這一行的話，第 400 名的玩家
    // 在這一頁永遠找不到自己——而他才是絕大多數。
    this.selfRow = this.add
      .text(cx, this.listTop + height + 20, '', textStyle({ size: 17, color: GOLD, bold: true }))
      .setOrigin(0.5);

    // **看得到自己跑的是哪一版。**
    //
    // 瀏覽器快取住舊的那包 JS 時，成績會被伺服器退回，而「我到底是不是
    // 舊版本」在畫面上完全沒有答案——今天為了這件事來回猜了三次。
    // 一個數字就解決：和伺服器對不上時，它就是那句話的證據。
    this.add
      .text(cx, GAME_HEIGHT - 24, `版本 ${REPLAY_CONTRACT_VERSION}`, textStyle({ size: 13, color: INK_DIM }))
      .setOrigin(0.5)
      .setAlpha(0.7);

    this.status = this.add
      .text(cx, this.listTop + height + 48, '', textStyle({ size: 16, color: INK_DIM }))
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
  /**
   * 寫那一行狀態。
   *
   * **一定要夾寬度。** 這一行的內容長度完全不受控：一般狀態很短，但失敗的
   * 理由（伺服器回的那一句）和「榜上叫你無名修士」都長得多，不夾就從兩邊
   * 溢出畫面——而它是玩家唯一的線索，看不完等於沒寫。
   */
  private say(text: string, color: string): void {
    this.mine.setText(text).setColor(color);
    fitText(this.mine, GAME_WIDTH - 32);
  }

  private async prepare(): Promise<void> {
    if (!cloudEnabled()) return;
    const save = state();
    // 沒註冊也上得了榜，只是榜上是一個系統給的名字。這一行要說清楚
    // 「你已經在榜上了」和「註冊能拿到什麼」——講成「你不會出現在榜上」
    // 是錯的，而且那正是這一頁原本說的話。
    const ready = hasAccount(save)
      ? '上榜已開通，通關就會自動送出'
      : '上榜已開通　榜上叫你無名修士，註冊可換道號';
    if (boardReady(save)) {
      this.say(ready, INK_DIM);
      return;
    }
    this.say('開通上榜中…', INK_DIM);
    if (await registerForBoard(save)) {
      persist();
      this.say(ready, JADE);
    } else {
      this.say('開通失敗，通關時會再試一次', DANGER);
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
        '註冊之後榜上就是你的道號，換裝置也能把進度接回來。\n' +
        `密碼至少 ${MIN_PASSWORD_LENGTH} 個字。\n` +
        '救援問題是忘記密碼時的救命繩，答對就能重設一組新的。\n' +
        '注意：問題本身任何人查得到，別把答案寫進問題裡。',
      fields: [
        { key: 'email', label: '電子信箱（就是帳號）', email: true, maxLength: 254 },
        { key: 'name', label: '道號（榜上顯示的名字）', maxLength: MAX_NAME_LENGTH },
        { key: 'password', label: '密碼', password: true, maxLength: 64 },
        { key: 'again', label: '再輸入一次密碼', password: true, maxLength: 64 },
        {
          key: 'question',
          label: '救援問題（忘記密碼時問你這個）',
          placeholder: '例：我國中養的狗叫什麼',
          maxLength: MAX_QUESTION_LENGTH,
        },
        { key: 'answer', label: '答案', maxLength: 40 },
      ],
      // 在表單上擋，不送出去再回一句錯誤：他打的東西不該因為一個錯字全沒。
      validate: (v) => {
        if ((v['password'] ?? '').length < MIN_PASSWORD_LENGTH) {
          return `密碼至少要 ${MIN_PASSWORD_LENGTH} 個字`;
        }
        if (v['password'] !== v['again']) return '兩次輸入的密碼不一樣';
        if (cleanQuestion(v['question']) === null) return '救援問題不能空白';
        if (cleanAnswer(v['answer']) === null) {
          return `答案至少要 ${MIN_ANSWER_LENGTH} 個字`;
        }
        return null;
      },
      submit: '註冊',
    });
    if (values === null) return;

    this.say('註冊中…', INK_DIM);
    const outcome = await register(
      state(),
      values['email'] ?? '',
      values['name'] ?? '',
      values['password'] ?? '',
    );
    if (outcome.kind === 'failed') {
      this.say(outcome.reason, DANGER);
      return;
    }
    persist();

    // 問題要等註冊完才設得了：它要用剛拿到的身分密鑰證明是本人。
    // 失敗不擋著他——帳號已經開好了，問題可以之後再補。
    const saved = await setQuestion(state(), values['question'] ?? '', values['answer'] ?? '');
    persist();
    await showNotice(
      '註冊完成',
      saved.kind === 'ok'
        ? `道號：${outcome.name}\n之後通關就會自動上榜。`
        : `道號：${outcome.name}\n之後通關就會自動上榜。\n（救援問題沒設成功，可以到「救援問題」再設一次）`,
    );
    this.scene.restart({ board: this.board });
  }

  /**
   * 設定或更換救援問題。
   *
   * 給的是「已經進得去的人替未來的自己留一條路」——所以它要先登入。
   * 註冊前就存在的帳號沒有問題可用，這顆按鈕是他們補上的地方。
   */
  private async doSetQuestion(): Promise<void> {
    const values = await showForm({
      title: '救援問題',
      note:
        '忘記密碼時會問你這一題，答對就能設一組新密碼。\n' +
        '挑一個只有你答得出來、而且半年後還記得的。\n' +
        '不要把答案寫進問題裡——問題本身任何人查得到。',
      fields: [
        {
          key: 'question',
          label: '問題',
          placeholder: '例：我國中養的狗叫什麼',
          maxLength: MAX_QUESTION_LENGTH,
        },
        { key: 'answer', label: '答案', maxLength: 40 },
      ],
      validate: (v) => {
        if (cleanQuestion(v['question']) === null) return '問題不能空白';
        if (cleanAnswer(v['answer']) === null) return `答案至少要 ${MIN_ANSWER_LENGTH} 個字`;
        return null;
      },
      submit: '設定',
    });
    if (values === null) return;

    this.say('設定中…', INK_DIM);
    const outcome = await setQuestion(state(), values['question'] ?? '', values['answer'] ?? '');
    if (outcome.kind === 'failed') {
      this.say(outcome.reason, DANGER);
      return;
    }
    await showNotice('設定完成', '忘記密碼時就會問這一題。\n答案的空白與大小寫不影響對錯。');
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

    this.say('登入中…', INK_DIM);
    const outcome = await login(state(), values['email'] ?? '', values['password'] ?? '');
    if (outcome.kind === 'failed') {
      // 登入失敗最常見的原因是忘記密碼，所以順手把那條路指出來。
      this.say(`${outcome.reason}（可用「忘記密碼」重設）`, DANGER);
      return;
    }
    persist();
    await showNotice('登入完成', `道號：${outcome.name}\n要接回雲端進度的話，到「存檔」按下載。`);
    this.scene.restart({ board: this.board });
  }

  /**
   * 忘記密碼。
   *
   * **兩條路，自己挑得起來的那一條。** 先問信箱，再看那個帳號有沒有設救援問題：
   * 有就當場問問題（不必等信，也不需要寄件網域），沒有才走驗證碼那條。
   *
   * 分兩步都是因為中間隔著一個「還拿不到的東西」——一封信、或一個還沒看到的
   * 問題。硬塞在同一張表上，玩家會對著一個答不了的欄位發呆。
   */
  private async doRecover(): Promise<void> {
    const asked = await showForm({
      title: '忘記密碼',
      note: '輸入註冊時留的信箱。',
      fields: [{ key: 'email', label: '電子信箱', email: true, maxLength: 254 }],
      submit: '下一步',
    });
    if (asked === null) return;
    const email = asked['email'] ?? '';

    this.say('查詢中…', INK_DIM);
    const question = await questionFor(email);
    if (question !== null) {
      await this.recoverByQuestion(email, question);
      return;
    }

    this.say('寄送中…', INK_DIM);
    const sent = await requestRecovery(email);
    if (sent.kind === 'failed') {
      this.say(sent.reason, DANGER);
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

    this.say('重設中…', INK_DIM);
    const outcome = await resetPassword(
      state(),
      email,
      values['code'] ?? '',
      values['password'] ?? '',
    );
    if (outcome.kind === 'failed') {
      this.say(outcome.reason, DANGER);
      return;
    }
    persist();
    await showNotice('密碼已重設', `道號：${outcome.name}\n進度沒有任何變動。要接回雲端那份的話，到「存檔」按下載。`);
    this.scene.restart({ board: this.board });
  }

  /**
   * 答對救援問題，設一組新密碼。
   *
   * **答對拿到的是「設一組新的」，不是「看到舊的」。** 舊密碼在這整套系統裡
   * 從來沒有存在過——伺服器存的只有它推導出來的密鑰的雜湊，而雜湊不可逆。
   * 要能顯示密碼就得另外存一份還原得回來的，那等於資料庫外洩就是所有人的
   * 密碼外流；而玩家會重複用密碼，傷害會跑到這個遊戲以外的地方去。
   */
  private async recoverByQuestion(email: string, question: string): Promise<void> {
    const values = await showForm({
      title: '回答救援問題',
      note: `${question}\n\n答案的空白與大小寫不影響對錯。\n答錯 ${MAX_ANSWER_ATTEMPTS} 次會先鎖一段時間。`,
      fields: [
        { key: 'answer', label: '答案', maxLength: 40 },
        { key: 'password', label: '新密碼', password: true, maxLength: 64 },
        { key: 'again', label: '再輸入一次新密碼', password: true, maxLength: 64 },
      ],
      validate: (v) => {
        if (cleanAnswer(v['answer']) === null) return `答案至少要 ${MIN_ANSWER_LENGTH} 個字`;
        if ((v['password'] ?? '').length < MIN_PASSWORD_LENGTH) {
          return `密碼至少要 ${MIN_PASSWORD_LENGTH} 個字`;
        }
        if (v['password'] !== v['again']) return '兩次輸入的密碼不一樣';
        return null;
      },
      submit: '設定新密碼',
    });
    if (values === null) return;

    this.say('確認中…', INK_DIM);
    const outcome = await resetByQuestion(
      state(),
      email,
      values['answer'] ?? '',
      values['password'] ?? '',
    );
    if (outcome.kind === 'failed') {
      this.say(outcome.reason, DANGER);
      return;
    }
    persist();
    await showNotice(
      '密碼已重設',
      `道號：${outcome.name}\n進度沒有任何變動。要接回雲端那份的話，到「存檔」按下載。`,
    );
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
      this.say(outcome.reason, DANGER);
      return;
    }
    persist();
    this.scene.restart({ board: this.board });
  }


  /** 一列在這個榜上怎麼讀。每個榜的分數是不同的東西，只有這裡知道差別。 */
  private describe(entry: LeaderboardEntry): string {
    const time = formatTime(entry.elapsedMs);
    // 速通榜上整條賽道都是同一關，關卡再寫一次是廢話——秒數才是分數。
    if (trackOfBoard(this.board) !== null) return time;
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
      const empty = trackOfBoard(this.board);
      this.status.setText(
        empty === null
          ? '榜上還沒有人。第一個上榜的就是第一名。'
          : `還沒有人上這一條。打通第 ${empty} 關就會自動送出。`,
      );
    } else {
      this.status.setText(`共 ${result.total} 人上榜`);
    }

    const mineId = save.player.cloud?.playerId ?? null;
    const width = GAME_WIDTH - 44;
    result.entries.slice(0, this.visibleRows).forEach((entry, index) => {
      const row = this.rows[index];
      if (row === undefined) return;
      const medal = MEDALS[entry.rank - 1];
      const isMine = mineId !== null && result.mine !== null && result.mine.rank === entry.rank;

      // 前三名是實心的牌，第 4～10 名只有一圈框，再往下什麼都沒有——
      // 一眼要分得出「頒獎台上那三個」和「榜上前段」是兩件事。
      if (medal !== undefined) {
        row.medal
          .setVisible(true)
          .setFillStyle(hexToNumber(medal))
          .setStrokeStyle(2, hexToNumber(medal));
        row.rank.setColor('#1a1408');
      } else if (entry.rank <= MEDAL_RANKS) {
        row.medal.setVisible(true).setFillStyle(BG_PANEL_ALT).setStrokeStyle(2, LINE);
        row.rank.setColor(INK_DIM);
      } else {
        row.medal.setVisible(false);
        row.rank.setColor(INK_DIM);
      }
      row.rank.setText(String(entry.rank));

      row.name.setText(entry.name).setColor(isMine ? JADE : INK);
      // 名字是別人打的字，長度不受這裡控制——夾住寬度，撐不破成績那一欄。
      fitText(row.name, width - 160);
      row.score.setText(this.describe(entry)).setColor(isMine ? JADE : INK_DIM);
    });

    this.selfRow.setText(
      result.mine === null
        ? ''
        : `你　第 ${result.mine.rank} / ${result.total} 名　${this.describe(result.mine)}`,
    );
    fitText(this.selfRow, GAME_WIDTH - 40);
  }

}
