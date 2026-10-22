import { omenById, omenSummary } from '../systems/omens';
import { tribulationNames, tribulationsForRun } from '../systems/tribulations';
import Phaser from 'phaser';
import { pixelPanel } from '../ui/panel';
import { libraryFloor } from '../systems/dungeons';
import { audio } from '../audio';
import type { IconName } from '../art';
import { ART, discipleTexture, glyphTexture, iconTexture } from '../art';
import { APP_VERSION, GAME_HEIGHT, GAME_WIDTH } from '../config';
import { persist, state } from '../state';
import { storageUnavailable } from '../save/storage';
import type { SaveData } from '../save/types';
import { sectById } from '../systems/loadout';
import { talismanDefs } from '../systems/talismans';
import { canAscend, heavenName, heavenOf, jieCount, mustAscend } from '../systems/karma';
import { layerInRun } from '../systems/realmrun';
import { enterMainline } from './flow';
import type { Feature } from '../systems/unlocks';
import { featureHint, featureOpen } from '../systems/unlocks';
import { dailyDone } from '../systems/daily';
import { detectAchievements, pendingAchievements } from '../systems/achievements';
import { cloudEnabled } from '../net/client';
import { nextRealmName, realmForStage, realmIndexForStage, realmTitle } from '../systems/realms';
import { createButton } from '../ui/button';
import { openMenu } from '../ui/menu';
import { drawBackdrop } from '../ui/backdrop';
import { addLogo, addSeal } from '../ui/logo';
import {
  BG_PANEL_ALT,
  DANGER,
  GOLD,
  JADE,
  INK,
  INK_DIM,
  LINE,
  MIN_TOUCH_SIZE,
  fitText,
  formatNumber,
  hexToNumber,
  textStyle,
} from '../ui/theme';
import { fadeIn, fadeToScene } from '../ui/transition';
import { addTwinklingStars } from '../ui/effects';

/** 標題畫面：顯示目前境界與金幣，通往挑戰、升級、換門派。 */
export class TitleScene extends Phaser.Scene {
  constructor() {
    super('Title');
  }

  create(): void {
    fadeIn(this);
    const save = state();
    const realm = realmForStage(save.world.stage);
    const sect = sectById(save.player.sectId);
    audio.applySettings(save.settings);
    audio.playMusic(realmIndexForStage(save.world.stage));
    // 主畫面有自己的一張主視覺（月夜仙山），不跟著境界換——這一頁是遊戲的門面。
    // 貼圖沒載到時退回境界遠景。
    if (this.textures.exists(ART.titleKey)) this.buildKeyArt();
    else drawBackdrop(this, realm);

    addTwinklingStars(this, 10, GOLD);

    const cx = GAME_WIDTH / 2;
    const hasSect = sect !== null;

    // 達成判定要在這裡也跑一次。它原本只在結算畫面與仙途錄裡跑，
    // 結果是「還沒打完下一場的人」看不到入口上的可領取數字——
    // 對他來說改制等於獎勵消失了。判定是純函式，跑一次很便宜。
    if (detectAchievements(save).length > 0) persist();

    this.buildTopBar(save);

    // 招牌：木框紅底的金字匾額（title-logo，含「仙俠」朱印），沒有那張圖時退回手寫字加朱印。
    if (this.textures.exists(ART.titleLogo)) {
      this.add.image(cx, 120, ART.titleLogo).setDisplaySize(450, 150);
    } else {
      addLogo(this, cx, 110, 60);
      addSeal(this, cx + 222, 136);
    }
    // 副標題只留在開場動畫：這裡寫的話會壓到仙宮的塔尖。
    // 中間那一大塊留給主視覺：仙山、明月、御劍的主角。資訊面板壓到下半部。
    const infoBottom = this.buildIdentity(452, save, realm, sect);

    // 主行動只能有一個。改版前「開始挑戰」和另外兩顆長得一模一樣，
    // 只靠位置在上面來表示它比較重要——那不夠，它得是畫面上最重的東西。
    let y = infoBottom + 30 + 36;
    createButton(this, cx, y, {
      width: 356,
      height: 72,
      label: !hasSect ? '選擇門派' : mustAscend(save) ? '渡劫飛升' : '開始挑戰',
      fontSize: 30,
      fillColor: hexToNumber(GOLD),
      strokeColor: hexToNumber(GOLD),
      textColor: '#12181f',
      onClick: () => enterMainline(this),
    });

    // 洞府與符籙譜並排：兩個都是「進場前整備」，同一層級，省下一整排給主視覺。
    y += 36 + 14 + 29;
    const cave = createButton(this, cx - 90, y, {
      width: 172,
      height: 58,
      label: featureOpen(save, 'upgrade') ? '洞府' : featureHint('upgrade'),
      fontSize: featureOpen(save, 'upgrade') ? 23 : 17,
      icon: iconTexture('cave'),
      onClick: () => fadeToScene(this, 'Upgrade'),
    });
    cave.setEnabled(featureOpen(save, 'upgrade'));
    const book = createButton(this, cx + 90, y, {
      width: 172,
      height: 58,
      label: featureOpen(save, 'talisman') ? '符籙譜' : featureHint('talisman'),
      fontSize: featureOpen(save, 'talisman') ? 23 : 17,
      icon: iconTexture('scroll'),
      onClick: () => fadeToScene(this, 'Talisman'),
    });
    book.setEnabled(featureOpen(save, 'talisman'));

    this.buildMenu(y + 29 + 20 + 28, hasSect);

    // **這個瀏覽器存不存得住東西，一定要講出來。**
    //
    // 私密模式與配額用盡的時候，存檔那一行寫入是安靜失敗的——遊戲照跑，
    // 玩家一路推到第三十關，重新整理才發現全沒了，而且不知道為什麼。
    // 吞掉例外是對的（存檔失敗不該把遊戲打斷），但不講就是把後果全推給他。
    if (storageUnavailable()) {
      const warn = this.add
        .text(
          cx,
          GAME_HEIGHT - 56,
          '這個瀏覽器不會保存進度，關掉分頁就沒了\n到「存檔」複製一份存檔碼，或註冊帳號存到雲端',
          textStyle({ size: 15, color: DANGER }),
        )
        .setOrigin(0.5)
        .setAlign('center')
        .setLineSpacing(2);
      fitText(warn, GAME_WIDTH - 32);
    }

    this.add
      .text(
        cx,
        GAME_HEIGHT - 30,
        `最高境界 ${realmTitle(save.world.highestStage)} · 通關 ${save.world.clears} 次 · ${APP_VERSION}`,
        textStyle({ size: 17, color: INK_DIM }),
      )
      .setOrigin(0.5);

    persist();
  }

  /**
   * 主視覺：月夜仙山（靜態一張），再疊上會動的東西——
   * 御劍的主角上下浮動、拖一道劍光；仙鶴從月前飛過；兩朵祥雲慢慢橫移。
   * 靜態的一張圖撐不起「入口」，會動的那幾樣才是讓人停下來看的理由。
   */
  private buildKeyArt(): void {
    this.add.image(0, 0, ART.titleKey).setOrigin(0, 0).setDisplaySize(GAME_WIDTH, GAME_HEIGHT).setDepth(-100);

    // 祥雲：半透明，從左往右飄，在仙山前面
    for (const [y, width, alpha, duration] of [[300, 260, 0.45, 52000], [372, 150, 0.55, 38000]] as const) {
      const cloud = this.add.image(-160, y, ART.cloud).setAlpha(alpha).setDepth(-90);
      cloud.setDisplaySize(width, (width * cloud.height) / cloud.width);
      this.tweens.add({ targets: cloud, x: GAME_WIDTH + 160, duration, delay: Phaser.Math.Between(0, 9000), repeat: -1 });
    }

    // 御劍的主角：人站在劍上，一起浮動；劍氣畫在劍的貼圖裡。
    const hero = this.add.container(176, 410).setDepth(-80);
    const sword = this.add.image(0, 0, ART.titleSword).setDisplaySize(220, 60);
    const body = this.add.image(-6, 4, ART.titleHero).setDisplaySize(200, 150).setOrigin(0.5, 132 / 150);
    hero.add([sword, body]);
    this.tweens.add({ targets: hero, y: 398, duration: 1400, ease: 'Sine.easeInOut', yoyo: true, repeat: -1 });

    // 仙鶴：兩幀拍翅，從右往左飛過月前，飛出畫面再從右邊回來
    if (!this.anims.exists('title-crane')) {
      this.anims.create({ key: 'title-crane', frames: [{ key: ART.titleCrane0 }, { key: ART.titleCrane1 }], frameRate: 3, repeat: -1 });
    }
    [[0, 250], [40, 236], [76, 258]].forEach(([dx, y], index) => {
      const crane = this.add.sprite(GAME_WIDTH + 40 + (dx ?? 0), y ?? 240, ART.titleCrane0).setDisplaySize(index === 1 ? 54 : 72, index === 1 ? 36 : 48).setDepth(-85);
      crane.play('title-crane');
      crane.anims.setProgress(index * 0.4);
      this.tweens.add({ targets: crane, x: -60 + (dx ?? 0), duration: 26000, delay: 2000, repeat: -1, repeatDelay: 6000 });
    });
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
    const showRebirth = canAscend(save) || karma.rebirths > 0 || karma.points > 0;
    if (showRebirth) {
      const heaven = heavenOf(jieCount(save.world.tribulations));
      createButton(this, 76, 36, {
        width: 124,
        height: 44,
        label: karma.rebirths > 0 ? `第 ${karma.rebirths + 1} 世 · ${heavenName(heaven)}` : '仙緣',
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
    this.add
      .text(
        showRebirth ? 150 : 24,
        36,
        `金幣 ${formatNumber(save.player.wallet.gold)}`,
        textStyle({ size: 18, color: GOLD }),
      )
      .setStroke('#fdfbf6', 6).setOrigin(0, 0.5);

    // 靈石：點了進藏寶閣。和金幣同一列，但它是個入口，所以做成按鈕。
    // 新玩家第一顆靈石要到第一次破境才拿得到；在那之前掛一顆「靈石 0」只是在推銷，先不出現（選單裡仍進得去）。
    const stones = save.player.stones;
    if (stones.balance > 0 || stones.costumes.length > 0 || save.player.karma.rebirths > 0) createButton(this, GAME_WIDTH - 150, 36, {
      width: 140,
      height: 44,
      label: `靈石 ${formatNumber(save.player.stones.balance)}`,
      fontSize: 16,
      textColor: GOLD,
      onClick: () => fadeToScene(this, 'Shop'),
    });

    const x = GAME_WIDTH - 46;
    const y = 36;
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
      // 有東西可領就標在入口上。不標的話，「達成之後要自己去領」
      // 對玩家來說等於「獎勵消失了」——他根本不知道有東西在等他。
      const pending = pendingAchievements(save).length;
      openMenu(this, [
        { label: '音　樂', icon: 'music' },
        {
          label: '仙途錄',
          icon: 'record',
          scene: 'Achievements',
          ...(pending > 0 ? { badge: `${pending} 可領取` } : {}),
        },
        { label: '藏寶閣', icon: 'scroll', scene: 'Shop' },
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
    const height = 176;
    pixelPanel(this, cx, top + height / 2, GAME_WIDTH - 48, height, { alpha: 1 });

    this.add
      .text(cx, top + 38, realmTitle(save.world.stage), textStyle({ size: 40, color: realm.color, bold: true }))
      .setOrigin(0.5);
    this.add
      .text(cx, top + 76, `第 ${save.world.stage} 關 · ${realm.subtitle}`, textStyle({ size: 18, color: INK_DIM }))
      .setOrigin(0.5);
    // 距離突破還有幾關，是修仙題材最直接的推進動機。
    const toBreak = realm.stageTo - save.world.stage + 1;
    // 帶著奇遇時這一行讓給它：奇遇只管下一場，這時候它比「還差幾關突破」急。
    // 飛升境的天劫也寫在這裡：進場前就知道這一關多了什麼，才有機會換符。
    const tribulations = tribulationsForRun(save.world.stage, save.world.tribulations);
    const run = save.world.realmRun;
    const blessCount = Object.keys(run.blessings).length;
    const pending = save.player.omen;
    const omen =
      pending !== null && pending.stage === save.world.stage && pending.runs === save.world.runs
        ? omenById(pending.id)
        : null;
    const line = this.add
      .text(
        cx,
        top + 102,
        omen !== null && tribulations.length > 0
          ? `奇遇「${omen.name}」・天劫：${tribulationNames(tribulations)}`
          : omen !== null
            ? `奇遇「${omen.name}」　${omenSummary(omen)}`
            : tribulations.length > 0
              ? `本關天劫：${tribulationNames(tribulations)}`
              : blessCount > 0 || run.gate !== null
                ? `本局第 ${layerInRun(save.world.stage)} 關・已得機緣 ${blessCount} 張`
              : toBreak > 900
                ? '已至無盡飛升境'
                : `再過 ${toBreak} 關可突破至 ${nextRealmName(save.world.stage)}`,
        textStyle({ size: 17, color: omen !== null ? JADE : tribulations.length > 0 ? '#9fd8ff' : GOLD }),
      )
      .setOrigin(0.5);
    fitText(line, GAME_WIDTH - 80);

    this.buildIcons(top + 140, save, sect);
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

    const talismans = talismanDefs(save.player.talismans, libraryFloor(save));
    const cell = 50;
    const total = cell + 26 + talismans.length * cell;
    let x = cx - total / 2 + cell / 2;

    this.add
      .rectangle(x, y, cell - 6, cell - 6, BG_PANEL_ALT, 0.9)
      .setStrokeStyle(3, hexToNumber(sect.color));
    // 只裁頭與上半身：格子只有 44 點，整個人縮進去就看不出是誰。
    // 裁切範圍是貼圖像素（門人貼圖 160×224，頭在上方三分之一）。
    this.add
      .image(x, y, discipleTexture(sect.art, 0, 0))
      .setCrop(24, 16, 112, 116)
      .setScale(0.37)
      .setOrigin(0.5, (16 + 58) / 224);
    x += cell / 2 + 13;

    // 一條細線分開「我是誰」和「我帶什麼」——五個等距的方格會讓人以為是同一類東西。
    this.add.rectangle(x, y, 3, cell - 14, LINE).setAlpha(0.8);
    x += 13 + cell / 2;

    talismans.forEach((def) => {
      this.add
        .rectangle(x, y, cell - 8, cell - 8, BG_PANEL_ALT, 0.9)
        .setStrokeStyle(3, hexToNumber(def.color));
      this.add.image(x, y, glyphTexture(def.art)).setDisplaySize(32, 40);
      x += cell;
    });

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
    const save = state();
    const items: [string, string, IconName, Feature | null][] = [
      [hasSect ? '換門派' : '門派', 'Sect', 'sect', hasSect ? 'sect' : null],
      ['副本', 'Dungeon', 'trial', 'dungeon'],
    ];
    if (cloudEnabled()) items.push(['榜單', 'Leaderboard', 'rank', 'leaderboard']);

    const width = Math.floor((GAME_WIDTH - 48 - (items.length - 1) * 12) / items.length);
    items.forEach(([label, target, icon, feature], index) => {
      const x = cx + (index - (items.length - 1) / 2) * (width + 12);
      const open = feature === null || featureOpen(save, feature);
      const button = createButton(this, x, top, {
        width,
        height: 56,
        // 今天還沒打每日挑戰：入口上寫出來，不然沒有人知道有這件事。
        label: !open && feature !== null ? featureHint(feature) : feature === 'dungeon' && !dailyDone(save) ? '副本・今日' : label,
        fontSize: open ? 18 : 14,
        icon: iconTexture(icon),
        iconSize: 22,
        onClick: () => fadeToScene(this, target),
      });
      button.setEnabled(open);
    });
  }

}
