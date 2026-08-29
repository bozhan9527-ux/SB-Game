import Phaser from 'phaser';
import { audio } from '../audio';
import { GAME_HEIGHT, GAME_WIDTH } from '../config';
import { persist, state } from '../state';
import { sectById } from '../systems/loadout';
import { TALISMAN_SLOTS, talismanDefs } from '../systems/talismans';
import { nextRealmName, realmForStage, realmIndexForStage, realmTitle } from '../systems/realms';
import { createButton } from '../ui/button';
import { drawBackdrop } from '../ui/backdrop';
import { GOLD, INK, INK_DIM, formatNumber, textStyle } from '../ui/theme';
import { fadeIn, fadeToScene } from '../ui/transition';

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
        sect === null ? '尚未拜入門派' : `${sect.name} · ${sect.path}`,
        textStyle({ size: 22, color: sect === null ? INK_DIM : sect.color }),
      )
      .setOrigin(0.5);
    this.add
      .text(cx, 526, `金幣 ${formatNumber(save.player.wallet.gold)}`, textStyle({ size: 24, color: GOLD }))
      .setOrigin(0.5);

    // 按鈕
    // 帶哪四張符是每一場都值得改的決定，所以它和洞府一樣是主按鈕，不是塞在小按鈕列裡。
    const talismans = talismanDefs(save.player.talismans, save.world.highestStage);
    this.add
      .text(
        cx,
        568,
        `符籙 ${talismans.map((def) => def.name).join('・')}`,
        textStyle({ size: 17, color: INK_DIM }),
      )
      .setOrigin(0.5);

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

    // 三顆並排：540 寬放得下 3×112 加間距，比擠成兩排省一列高度。
    createButton(this, cx - 118, 850, {
      width: 112,
      height: 56,
      label: '玩法說明',
      fontSize: 20,
      onClick: () => fadeToScene(this, 'Help'),
    });
    createButton(this, cx, 850, {
      width: 112,
      height: 56,
      label: '仙途錄',
      fontSize: 20,
      onClick: () => fadeToScene(this, 'Achievements'),
    });
    createButton(this, cx + 118, 850, {
      width: 112,
      height: 56,
      label: hasSect ? '換門派' : '門派',
      fontSize: 20,
      onClick: () => fadeToScene(this, 'Sect'),
    });

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
}
