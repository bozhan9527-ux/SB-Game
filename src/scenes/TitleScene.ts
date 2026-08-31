import Phaser from 'phaser';
import { audio } from '../audio';
import { GAME_HEIGHT, GAME_WIDTH } from '../config';
import { addGold } from '../save';
import { persist, state } from '../state';
import type { SaveData } from '../save/types';
import { sectById } from '../systems/loadout';
import { TALISMAN_SLOTS, talismanDefs } from '../systems/talismans';
import { activeChallenges, challengeGoldMultiplier } from '../systems/challenges';
import { canRebirth } from '../systems/karma';
import { cloudEnabled } from '../net/client';
import { formatDuration, resetRetreat, retreatOffer } from '../systems/retreat';
import { nextRealmName, realmForStage, realmIndexForStage, realmTitle } from '../systems/realms';
import { createButton } from '../ui/button';
import { drawBackdrop } from '../ui/backdrop';
import { BG_PANEL, GOLD, INK, INK_DIM, formatNumber, hexToNumber, textStyle } from '../ui/theme';
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
    audio.playMusic(realmIndexForStage(save.world.stage));
    drawBackdrop(this, realm.color, realm.scenery);

    const cx = GAME_WIDTH / 2;

    this.add
      .text(cx, 190, '問道飛升', textStyle({ size: 68, color: INK, bold: true }))
      .setOrigin(0.5);
    this.add
      .text(cx, 252, '拖符布陣 · 合成升階 · 鎮守山門', textStyle({ size: 22, color: INK_DIM }))
      .setOrigin(0.5);

    // 目前進度
    this.add
      .text(cx, 372, realmTitle(save.world.stage), textStyle({ size: 40, color: realm.color, bold: true }))
      .setOrigin(0.5);
    this.add
      .text(cx, 414, `第 ${save.world.stage} 關 · ${realm.subtitle}`, textStyle({ size: 20, color: INK_DIM }))
      .setOrigin(0.5);
    // 距離突破還有幾關，是修仙題材最直接的推進動機。
    const toBreak = realm.stageTo - save.world.stage + 1;
    this.add
      .text(
        cx,
        444,
        toBreak > 900 ? '已至無盡飛升境' : `再過 ${toBreak} 關可突破至 ${nextRealmName(save.world.stage)}`,
        textStyle({ size: 19, color: GOLD }),
      )
      .setOrigin(0.5);
    this.add
      .text(
        cx,
        486,
        // 轉世次數接在門派後面，不另開一行：這一區已經排滿，而它們講的是同一件事
        // ——「我現在是誰」。
        sect === null
          ? '尚未拜入門派'
          : `${sect.name} · ${sect.path}${karmaLine(save)}`,
        textStyle({ size: 22, color: sect === null ? INK_DIM : sect.color }),
      )
      .setOrigin(0.5);
    this.goldLine = this.add
      .text(cx, 526, `金幣 ${formatNumber(save.player.wallet.gold)}`, textStyle({ size: 24, color: GOLD }))
      .setOrigin(0.5);


    // 按鈕
    // 帶哪四張符是每一場都值得改的決定，所以它和洞府一樣是主按鈕，不是塞在小按鈕列裡。
    const talismans = talismanDefs(save.player.talismans, save.world.highestStage);
    this.add
      .text(
        cx,
        556,
        `符籙 ${talismans.map((def) => def.name).join('・')}`,
        textStyle({ size: 17, color: INK_DIM }),
      )
      .setOrigin(0.5);

    // 開了試煉就跟在「符籙」下面：這一區講的就是「我這一場的配置」，試煉屬於同一件事。
    // 挑戰是跨關留著的設定，忘記自己開了什麼又一直打不過，是最容易讓人以為遊戲壞掉的情況。
    const active = activeChallenges(save);
    if (active.length > 0) {
      this.add
        .text(
          cx,
          580,
          `試煉 ${active.map((item) => item.name).join('・')}　金幣 ×${challengeGoldMultiplier(save).toFixed(2)}`,
          textStyle({ size: 16, color: GOLD }),
        )
        .setOrigin(0.5);
    }

    const hasSect = sect !== null;
    createButton(this, cx, 628, {
      width: 340,
      height: 74,
      label: hasSect ? '開始挑戰' : '選擇門派',
      fontSize: 30,
      strokeColor: 0x6f8b7a,
      onClick: () => fadeToScene(this, hasSect ? 'Run' : 'Sect'),
    });

    createButton(this, cx, 710, {
      width: 340,
      height: 62,
      label: '洞府 · 提升屬性',
      fontSize: 25,
      onClick: () => fadeToScene(this, 'Upgrade'),
    });

    createButton(this, cx, 780, {
      width: 340,
      height: 62,
      label: `符籙譜 · 帶 ${TALISMAN_SLOTS} 張入場`,
      fontSize: 25,
      onClick: () => fadeToScene(this, 'Talisman'),
    });

    // 這一排的顆數會隨功能開關變動，所以位置用算的，不寫死。
    // 榜單只在有設定後端時才出現——一個按了會說「這個版本沒有連線功能」的按鈕，
    // 比沒有那顆按鈕更糟。
    const minor: [string, string][] = [
      ['玩法說明', 'Help'],
      ['仙途錄', 'Achievements'],
      [hasSect ? '換門派' : '門派', 'Sect'],
      ['試煉', 'Challenge'],
      ['存檔', 'Archive'],
    ];
    if (cloudEnabled()) minor.push(['榜單', 'Leaderboard']);
    const step = Math.floor((GAME_WIDTH - 16) / minor.length);
    minor.forEach(([label, target], index) => {
      createButton(this, cx + (index - (minor.length - 1) / 2) * step, 850, {
        width: step - 6,
        height: 56,
        label,
        fontSize: minor.length > 5 ? 15 : 17,
        onClick: () => fadeToScene(this, target),
      });
    });

    // 輪迴只在「推得夠深」或「已經轉過世」之後才出現在畫面上。
    // 提前露出只會讓還在第 5 關的新玩家困惑——他離那件事還有八十關。
    const karma = save.player.karma;
    if (canRebirth(save) || karma.rebirths > 0) {
      createButton(this, 82, 60, {
        width: 132,
        height: 56,
        label: karma.rebirths > 0 ? `輪迴 · 第 ${karma.rebirths + 1} 世` : '輪迴',
        fontSize: 17,
        textColor: GOLD,
        onClick: () => fadeToScene(this, 'Rebirth'),
      });
    }

    this.showRetreat();

    // 音效開關。放在標題頁右上角，切換後立刻生效並寫進存檔。
    const soundButton = createButton(this, GAME_WIDTH - 82, 60, {
      width: 132,
      height: 52,
      label: '',
      fontSize: 20,
      onClick: () => {
        save.settings.sound = !save.settings.sound;
        audio.setEnabled(save.settings.sound);
        if (save.settings.sound) audio.playMusic(realmIndexForStage(save.world.stage));
        persist();
        soundButton.setLabel(save.settings.sound ? '音效 開' : '音效 關');
      },
    });
    soundButton.setLabel(save.settings.sound ? '音效 開' : '音效 關');

    this.add
      .text(
        cx,
        GAME_HEIGHT - 30,
        `最高境界 ${realmTitle(save.world.highestStage)} · 通關 ${save.world.clears} 次`,
        textStyle({ size: 18, color: INK_DIM }),
      )
      .setOrigin(0.5);

    persist();
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

/** 轉過世才顯示，沒轉過就不佔任何空間。 */
function karmaLine(save: SaveData): string {
  const { rebirths, points } = save.player.karma;
  if (rebirths <= 0) return '';
  return ` · 第 ${rebirths + 1} 世（仙緣 ${points}）`;
}