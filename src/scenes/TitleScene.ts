import Phaser from 'phaser';
import { audio } from '../audio';
import type { IconName } from '../art';
import { DISCIPLE_DISPLAY_HEIGHT, discipleTexture, glyphTexture, iconTexture } from '../art';
import { GAME_HEIGHT, GAME_WIDTH } from '../config';
import { addGold } from '../save';
import { persist, state } from '../state';
import type { SaveData } from '../save/types';
import { sectById } from '../systems/loadout';
import { talismanDefs } from '../systems/talismans';
import { activeChallenges, challengeGoldMultiplier } from '../systems/challenges';
import { canRebirth } from '../systems/karma';
import { cloudEnabled } from '../net/client';
import { formatDuration, resetRetreat, retreatOffer } from '../systems/retreat';
import { nextRealmName, realmForStage, realmIndexForStage, realmTitle } from '../systems/realms';
import { createButton } from '../ui/button';
import { openMenu } from '../ui/menu';
import { drawBackdrop } from '../ui/backdrop';
import {
  BG_PANEL,
  BG_PANEL_ALT,
  GOLD,
  INK,
  INK_DIM,
  LINE,
  MIN_TOUCH_SIZE,
  formatNumber,
  hexToNumber,
  textStyle,
} from '../ui/theme';
import { fadeIn, fadeToScene } from '../ui/transition';

/** 標題畫面：顯示目前境界與金幣，通往挑戰、升級、換門派。 */
export class TitleScene extends Phaser.Scene {
  /** 金幣那一行。領走閉關所得之後要當場更新，否則玩家會以為沒領到。 */
  private goldLine: Phaser.GameObjects.Text | undefined;

  constructor() {
    super('Title');
  }

  create(): void {
    fadeIn(this);
    // Phaser 會重用 Scene 實例，上一次的 Text 已經被銷毀，不清成 undefined 會拿到空殼。
    this.goldLine = undefined;
    const save = state();
    const realm = realmForStage(save.world.stage);
    const sect = sectById(save.player.sectId);
    audio.applySettings(save.settings);
    audio.playMusic(realmIndexForStage(save.world.stage));
    drawBackdrop(this, realm.color, realm.scenery);

    const cx = GAME_WIDTH / 2;
    const hasSect = sect !== null;

    this.buildTopBar(save);

    // 標題不再寫在這裡——開場動畫已經講過一次「問道飛升」了。
    // 一個畫面把自己的名字寫在最顯眼的位置，是在對已經進來的人重複他知道的事，
    // 而那塊地方讓給遠山與明月更值得。
    const infoBottom = this.buildIdentity(350, save, realm, sect);

    // 主行動只能有一個。改版前「開始挑戰」和另外兩顆長得一模一樣，
    // 只靠位置在上面來表示它比較重要——那不夠，它得是畫面上最重的東西。
    let y = infoBottom + 30 + 36;
    createButton(this, cx, y, {
      width: 356,
      height: 72,
      label: hasSect ? '開始挑戰' : '選擇門派',
      fontSize: 30,
      fillColor: hexToNumber(GOLD),
      strokeColor: hexToNumber(GOLD),
      textColor: '#12181f',
      onClick: () => fadeToScene(this, hasSect ? 'Run' : 'Sect'),
    });

    y += 36 + 14 + 29;
    createButton(this, cx, y, {
      width: 356,
      height: 58,
      label: '洞府',
      fontSize: 24,
      icon: iconTexture('cave'),
      onClick: () => fadeToScene(this, 'Upgrade'),
    });

    y += 66;
    createButton(this, cx, y, {
      width: 356,
      height: 58,
      label: '符籙譜',
      fontSize: 24,
      icon: iconTexture('scroll'),
      onClick: () => fadeToScene(this, 'Talisman'),
    });

    this.buildMenu(y + 29 + 20 + 28, hasSect);

    this.showRetreat();

    this.add
      .text(
        cx,
        GAME_HEIGHT - 26,
        `最高境界 ${realmTitle(save.world.highestStage)} · 通關 ${save.world.clears} 次`,
        textStyle({ size: 17, color: INK_DIM }),
      )
      .setOrigin(0.5);

    persist();
  }

  /**
   * 頂列：左邊輪迴，右邊選單。
   *
   * 右上角原本是「音效 開／關」那顆按鈕，而它正好和明月搶同一個角落。
   * 換成三條線之後那裡只剩一個 40px 見方的記號，月亮才有地方待——
   * 而且音效從「一個開關」升級成「兩條可調的音量」，本來就該收進選單裡。
   */
  private buildTopBar(save: SaveData): void {
    const karma = save.player.karma;
    // 輪迴只在「推得夠深」或「已經轉過世」之後才出現在畫面上。
    // 提前露出只會讓還在第 5 關的新玩家困惑——他離那件事還有八十關。
    const showRebirth = canRebirth(save) || karma.rebirths > 0;
    if (showRebirth) {
      createButton(this, 84, 54, {
        width: 140,
        height: 48,
        label: karma.rebirths > 0 ? `輪迴 · 第 ${karma.rebirths + 1} 世` : '輪迴',
        fontSize: 16,
        textColor: GOLD,
        onClick: () => fadeToScene(this, 'Rebirth'),
      });
    }

    // 金幣搬到頂列。
    //
    // 它原本在中央區佔一整行，但它不是「我到哪了」也不是「我帶什麼」——
    // 它是一個隨時在變的計數器，和輪迴、音量同一類：需要看得到，不需要被強調。
    // 搬上來之後中央區少一行，而且它就在「洞府」要花它的地方附近。
    this.goldLine = this.add
      .text(
        showRebirth ? 168 : 24,
        54,
        `金幣 ${formatNumber(save.player.wallet.gold)}`,
        textStyle({ size: 18, color: GOLD }),
      )
      .setOrigin(0, 0.5);

    const x = GAME_WIDTH - 46;
    const y = 54;
    // 三條線自己畫，不做成一張圖：它就是三條線，而多一個要預載的貼圖
    // 就多一個開場會失敗的地方。
    for (let i = 0; i < 3; i += 1) {
      this.add.rectangle(x, y - 8 + i * 8, 22, 2, hexToNumber(INK)).setAlpha(0.85);
    }
    const hit = this.add
      .rectangle(x, y, MIN_TOUCH_SIZE + 8, MIN_TOUCH_SIZE + 8, 0x000000, 0)
      .setInteractive({ useHandCursor: true });
    hit.on('pointerup', () => {
      audio.play('ui');
      openMenu(this, [
        { label: '音　樂', icon: 'music' },
        { label: '仙途錄', icon: 'record', scene: 'Achievements' },
        { label: '存　檔', icon: 'save', scene: 'Archive' },
        { label: '玩法說明', icon: 'help', scene: 'Help' },
      ]);
    });
  }

  /**
   * 中央資訊面板：我到哪了、我是誰、我帶什麼。
   *
   * 原本是七行置中的字，後來拆成兩塊面板，現在收成一塊——
   * 因為金幣搬上了頂列、門派與符籙都改成圖示，剩下的文字只有三行。
   * **圖示不是為了好看，是為了讓這一塊讀得比文字快**：門派和四張符
   * 用文字寫要二十幾個字，用圖示是一眼。
   */
  private buildIdentity(
    top: number,
    save: SaveData,
    realm: ReturnType<typeof realmForStage>,
    sect: ReturnType<typeof sectById>,
  ): number {
    const cx = GAME_WIDTH / 2;
    const height = 210;
    this.add
      .rectangle(cx, top + height / 2, GAME_WIDTH - 48, height, BG_PANEL, 0.72)
      .setStrokeStyle(1, LINE);

    this.add
      .text(cx, top + 44, realmTitle(save.world.stage), textStyle({ size: 44, color: realm.color, bold: true }))
      .setOrigin(0.5);
    this.add
      .text(cx, top + 86, `第 ${save.world.stage} 關 · ${realm.subtitle}`, textStyle({ size: 18, color: INK_DIM }))
      .setOrigin(0.5);
    // 距離突破還有幾關，是修仙題材最直接的推進動機。
    const toBreak = realm.stageTo - save.world.stage + 1;
    this.add
      .text(
        cx,
        top + 116,
        toBreak > 900 ? '已至無盡飛升境' : `再過 ${toBreak} 關可突破至 ${nextRealmName(save.world.stage)}`,
        textStyle({ size: 17, color: GOLD }),
      )
      .setOrigin(0.5);

    this.buildIcons(top + 166, save, sect);
    return top + height;
  }

  /** 門派一個、符籙四個，排成一列。門派用門人造型，符籙用符牌上的圖騰。 */
  private buildIcons(y: number, save: SaveData, sect: ReturnType<typeof sectById>): void {
    const cx = GAME_WIDTH / 2;
    if (sect === null) {
      this.add
        .text(cx, y, '尚未拜入門派', textStyle({ size: 20, color: INK_DIM }))
        .setOrigin(0.5);
      return;
    }

    const talismans = talismanDefs(save.player.talismans, save.world.highestStage);
    const cell = 50;
    const total = cell + 26 + talismans.length * cell;
    let x = cx - total / 2 + cell / 2;

    this.add
      .rectangle(x, y, cell - 6, cell - 6, BG_PANEL_ALT, 0.9)
      .setStrokeStyle(2, hexToNumber(sect.color));
    this.add
      .image(x, y, discipleTexture(sect.art, 0, 0))
      .setDisplaySize(DISCIPLE_DISPLAY_HEIGHT * 0.52, DISCIPLE_DISPLAY_HEIGHT * 0.62);
    x += cell / 2 + 13;

    // 一條細線分開「我是誰」和「我帶什麼」——五個等距的方格會讓人以為是同一類東西。
    this.add.rectangle(x, y, 1, cell - 14, LINE).setAlpha(0.8);
    x += 13 + cell / 2;

    talismans.forEach((def) => {
      this.add
        .rectangle(x, y, cell - 8, cell - 8, BG_PANEL_ALT, 0.9)
        .setStrokeStyle(1, hexToNumber(def.color));
      this.add.image(x, y, glyphTexture(def.art)).setDisplaySize(23, 29);
      x += cell;
    });

    // 挑戰是跨關留著的設定，忘記自己開了什麼又一直打不過，
    // 是最容易讓人以為遊戲壞掉的情況——所以它常駐在這裡。
    const active = activeChallenges(save);
    if (active.length > 0) {
      this.add
        .text(
          cx,
          y + 34,
          `試煉 ${active.map((item) => item.name).join('・')}　金幣 ×${challengeGoldMultiplier(save).toFixed(2)}`,
          textStyle({ size: 15, color: GOLD }),
        )
        .setOrigin(0.5);
    }
  }

  /**
   * 次要入口。
   *
   * 改版前是六顆擠在一排、字級被壓到 15px。它們是六個平級的選項，
   * 排成一排只是因為那裡剛好有一條空間——改成每排三顆之後，
   * 字級回到 17px，觸控區也回到 44px 以上（TECH_SPEC 第 6 節）。
   */
  /**
   * 次要入口。
   *
   * 改版前這裡有六顆，字級被壓到 15px。玩法說明、仙途錄、存檔都收進右上角的
   * 選單之後只剩三顆——留在畫面上的標準是「每一場都可能會用到」：
   * 換門派、試煉、榜單是玩法決定，其餘三個是設定與查閱。
   */
  private buildMenu(top: number, hasSect: boolean): void {
    const cx = GAME_WIDTH / 2;
    // 榜單只在有設定後端時才出現——一個按了會說「這個版本沒有連線功能」的按鈕，
    // 比沒有那顆按鈕更糟。
    const items: [string, string, IconName][] = [
      [hasSect ? '換門派' : '門派', 'Sect', 'sect'],
      ['試煉', 'Challenge', 'trial'],
    ];
    if (cloudEnabled()) items.push(['榜單', 'Leaderboard', 'rank']);

    const width = Math.floor((GAME_WIDTH - 48 - (items.length - 1) * 12) / items.length);
    items.forEach(([label, target, icon], index) => {
      const x = cx + (index - (items.length - 1) / 2) * (width + 12);
      createButton(this, x, top, {
        width,
        height: 56,
        label,
        fontSize: 18,
        icon: iconTexture(icon),
        iconSize: 22,
        onClick: () => fadeToScene(this, target),
      });
    });
  }

  /**
   * 閉關所得。
   *
   * 做成一層蓋上去的面板而不是常駐的一行：標題頁的版面已經排滿，
   * 而這件事一場只會發生一次——它需要的是「被看見一次」，不是一直佔著位置。
   *
   * 沒有累積到足夠時間就完全不出現。幾十金的提示只是雜訊，
   * 而每次開遊戲都跳一個要按掉的東西，很快就會變成玩家眼中的障礙物。
   */
  private showRetreat(): void {
    const save = state();
    const offer = retreatOffer(save, Date.now());
    if (offer.gold <= 0) return;

    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    const veil = this.add
      .rectangle(cx, cy, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.82)
      .setInteractive();
    const panel = this.add
      .rectangle(cx, cy, GAME_WIDTH - 96, 300, BG_PANEL, 0.98)
      .setStrokeStyle(2, hexToNumber(GOLD));
    const title = this.add
      .text(cx, cy - 108, '閉　關', textStyle({ size: 34, color: GOLD, bold: true }))
      .setOrigin(0.5);
    const body = this.add
      .text(
        cx,
        cy - 46,
        [
          `閉關 ${formatDuration(offer.elapsedMs)}`,
          offer.capped ? '（已達上限，再放也不會更多）' : '',
        ]
          .filter((line) => line.length > 0)
          .join('\n'),
        textStyle({ size: 19, color: INK_DIM }),
      )
      .setOrigin(0.5)
      .setAlign('center')
      .setLineSpacing(6);
    const amount = this.add
      .text(cx, cy + 16, `${formatNumber(offer.gold)} 金`, textStyle({ size: 40, color: GOLD, bold: true }))
      .setOrigin(0.5);

    const claim = createButton(this, cx, cy + 96, {
      width: 260,
      height: 60,
      label: '收下',
      fontSize: 24,
      strokeColor: 0x6f8b7a,
      onClick: () => {
        addGold(save, offer.gold);
        resetRetreat(save, Date.now());
        persist();
        overlay.destroy();
        // 金幣那一行要當場更新，否則玩家會以為沒領到。
        this.goldLine?.setText(`金幣 ${formatNumber(save.player.wallet.gold)}`);
      },
    });

    const overlay = this.add
      .container(0, 0, [veil, panel, title, body, amount, claim.container])
      .setDepth(100);
  }
}
