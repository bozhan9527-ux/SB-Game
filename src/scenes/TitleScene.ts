import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config';
import { persist, state } from '../state';
import { sectById } from '../systems/loadout';
import { realmForStage, realmTitle } from '../systems/realms';
import { createButton } from '../ui/button';
import { drawBackdrop } from '../ui/backdrop';
import { GOLD, INK, INK_DIM, formatNumber, textStyle } from '../ui/theme';

/** 標題畫面：顯示目前境界與金幣，通往挑戰、升級、換門派。 */
export class TitleScene extends Phaser.Scene {
  constructor() {
    super('Title');
  }

  create(): void {
    const save = state();
    const realm = realmForStage(save.world.stage);
    const sect = sectById(save.player.sectId);
    drawBackdrop(this, realm.color);

    const cx = GAME_WIDTH / 2;

    this.add
      .text(cx, 190, '問道飛升', textStyle({ size: 68, color: INK, bold: true }))
      .setOrigin(0.5);
    this.add
      .text(cx, 252, '左右滑動 · 聚眾成軍 · 一路飛升', textStyle({ size: 22, color: INK_DIM }))
      .setOrigin(0.5);

    // 目前進度
    this.add
      .text(cx, 372, realmTitle(save.world.stage), textStyle({ size: 40, color: realm.color, bold: true }))
      .setOrigin(0.5);
    this.add
      .text(cx, 418, `第 ${save.world.stage} 關 · ${realm.subtitle}`, textStyle({ size: 20, color: INK_DIM }))
      .setOrigin(0.5);
    this.add
      .text(
        cx,
        462,
        sect === null ? '尚未拜入門派' : `${sect.name} · ${sect.path}`,
        textStyle({ size: 22, color: sect === null ? INK_DIM : sect.color }),
      )
      .setOrigin(0.5);
    this.add
      .text(cx, 508, `金幣 ${formatNumber(save.player.wallet.gold)}`, textStyle({ size: 24, color: GOLD }))
      .setOrigin(0.5);

    // 按鈕
    const hasSect = sect !== null;
    createButton(this, cx, 640, {
      width: 340,
      height: 76,
      label: hasSect ? '開始挑戰' : '選擇門派',
      fontSize: 30,
      strokeColor: 0x6f8b7a,
      onClick: () => this.scene.start(hasSect ? 'Run' : 'Sect'),
    });

    createButton(this, cx, 736, {
      width: 340,
      height: 66,
      label: '洞府 · 提升屬性',
      fontSize: 26,
      onClick: () => this.scene.start('Upgrade'),
    });

    createButton(this, cx, 820, {
      width: 340,
      height: 60,
      label: hasSect ? '更換門派' : '門派介紹',
      fontSize: 22,
      onClick: () => this.scene.start('Sect'),
    });

    this.add
      .text(
        cx,
        GAME_HEIGHT - 46,
        `最高境界 ${realmTitle(save.world.highestStage)} · 通關 ${save.world.clears} 次`,
        textStyle({ size: 18, color: INK_DIM }),
      )
      .setOrigin(0.5);

    persist();
  }
}
