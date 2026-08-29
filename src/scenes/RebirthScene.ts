/**
 * 輪迴：把已經爬到的深度換成跨世的仙緣，然後從第 1 關重來。
 *
 * 這一頁要回答的是「我為什麼要把八十關的進度砍掉」。所以版面順序是刻意的：
 * 先寫這一次能換到幾點、留下什麼、失去什麼，最後才是按鈕。
 * 一個不可逆的操作，資訊必須全部在按下去之前就攤開。
 */
import Phaser from 'phaser';
import { GAME_WIDTH } from '../config';
import { BALANCE, KARMA } from '../data';
import type { KarmaTrack } from '../data/types';
import { persist, state } from '../state';
import { buyKarma, canRebirth, karmaCost, karmaLevel, pendingKarma, rebirth } from '../systems/karma';
import { realmForStage } from '../systems/realms';
import type { Button } from '../ui/button';
import { createButton } from '../ui/button';
import { drawBackdrop } from '../ui/backdrop';
import {
  BG_PANEL,
  DANGER,
  GOLD,
  INK,
  INK_DIM,
  JADE,
  LINE,
  fitText,
  hexToNumber,
  textStyle,
} from '../ui/theme';
import { fadeIn, fadeToScene } from '../ui/transition';

interface Row {
  track: KarmaTrack;
  level: Phaser.GameObjects.Text;
  effect: Phaser.GameObjects.Text;
  button: Button;
}

export class RebirthScene extends Phaser.Scene {
  private rows: Row[] = [];
  private pointsText!: Phaser.GameObjects.Text;
  private offerText!: Phaser.GameObjects.Text;
  private rebirthButton: Button | undefined;

  constructor() {
    super('Rebirth');
  }

  create(): void {
    fadeIn(this);
    const save = state();
    this.rows = [];
    this.rebirthButton = undefined;
    const realm = realmForStage(save.world.stage);
    drawBackdrop(this, realm.color, realm.scenery);

    const cx = GAME_WIDTH / 2;
    this.add.text(cx, 44, '輪　迴', textStyle({ size: 40, color: INK, bold: true })).setOrigin(0.5);
    this.add
      .text(cx, 84, `第 ${save.player.karma.rebirths + 1} 世`, textStyle({ size: 20, color: JADE }))
      .setOrigin(0.5);
    this.pointsText = this.add.text(cx, 112, '', textStyle({ size: 22, color: GOLD })).setOrigin(0.5);

    const rowHeight = 96;
    const rowGap = 8;
    const top = 146;
    KARMA.forEach((track, index) => {
      this.buildRow(track, cx, top + index * (rowHeight + rowGap) + rowHeight / 2, rowHeight);
    });

    // 轉世區。留下什麼、失去什麼要寫在同一個地方，玩家才不必自己猜。
    const panelTop = top + KARMA.length * (rowHeight + rowGap) + 8;
    this.add
      .rectangle(cx, panelTop + 76, GAME_WIDTH - 40, 152, BG_PANEL, 0.9)
      .setStrokeStyle(2, hexToNumber(GOLD));
    this.offerText = this.add
      .text(cx, panelTop + 40, '', textStyle({ size: 17, color: INK }))
      .setOrigin(0.5)
      .setAlign('center')
      .setLineSpacing(6);

    this.rebirthButton = createButton(this, cx, panelTop + 120, {
      width: 300,
      height: 60,
      label: '轉世重修',
      fontSize: 24,
      textColor: GOLD,
      onClick: () => this.doRebirth(),
    });

    createButton(this, cx, 926, {
      width: 340,
      height: 56,
      label: '回主畫面',
      fontSize: 22,
      onClick: () => fadeToScene(this, 'Title'),
    });

    this.refresh();
  }

  private buildRow(track: KarmaTrack, cx: number, cy: number, height: number): void {
    const width = GAME_WIDTH - 40;
    const left = cx - width / 2 + 20;
    const top = cy - height / 2;
    const textWidth = width - 176;

    this.add.rectangle(cx, cy, width, height, BG_PANEL, 0.9).setStrokeStyle(2, LINE);
    this.add.text(left, top + 8, track.name, textStyle({ size: 25, color: INK, bold: true }));
    const level = this.add.text(left + 140, top + 14, '', textStyle({ size: 17, color: JADE }));
    const desc = this.add.text(left, top + 42, track.desc, textStyle({ size: 15, color: INK_DIM }));
    fitText(desc, textWidth);
    const effect = this.add.text(left, top + 66, '', textStyle({ size: 17, color: INK }));

    const button = createButton(this, cx + width / 2 - 76, cy, {
      width: 128,
      height: 58,
      label: '',
      fontSize: 20,
      onClick: () => this.purchase(track),
    });

    this.rows.push({ track, level, effect, button });
  }

  private purchase(track: KarmaTrack): void {
    const save = state();
    if (buyKarma(save, track.id) !== 'ok') {
      // 點數不夠時閃一下就好，不用彈窗打斷。
      this.pointsText.setColor(DANGER);
      this.time.delayedCall(260, () => this.pointsText.setColor(GOLD));
      return;
    }
    persist();
    this.refresh();
  }

  private doRebirth(): void {
    const save = state();
    if (!canRebirth(save)) return;
    const gained = pendingKarma(save);
    const confirmed = window.confirm(
      `轉世會把關卡進度退回第 1 關、金幣歸零、洞府六條線全部重來。\n` +
        `門派修為、符籙解鎖、成就與仙緣都留著。\n\n` +
        `這一次可換得仙緣 ${gained} 點。要轉世嗎？`,
    );
    if (!confirmed) return;
    rebirth(save);
    persist();
    this.scene.restart();
  }

  private refresh(): void {
    const save = state();
    this.pointsText.setText(`仙緣 ${save.player.karma.points} 點`);

    for (const row of this.rows) {
      const level = karmaLevel(save, row.track.id);
      const cost = karmaCost(row.track, level);
      row.level.setText(`${level} / ${row.track.maxLevel} 級`);
      row.effect.setText(`目前 +${row.track.perLevel * level}${row.track.unit}`);
      if (cost === null) {
        row.button.setLabel('已滿');
        row.button.setEnabled(false);
      } else {
        row.button.setLabel(`${cost} 點`);
        row.button.setEnabled(save.player.karma.points >= cost);
      }
    }

    const gained = pendingKarma(save);
    const { minStage } = BALANCE.rebirth;
    if (gained > 0) {
      this.offerText
        .setText(
          [
            `現在轉世可換得仙緣 ${gained} 點。`,
            '留下：門派與修為、符籙解鎖、成就、紀錄、仙緣。',
            '歸零：關卡進度、金幣、洞府六條線。',
          ].join('\n'),
        )
        .setColor(INK);
      this.rebirthButton?.setEnabled(true);
    } else {
      this.offerText
        .setText(
          [
            `推得比上一次更深才換得到仙緣。`,
            `至少要抵達第 ${minStage} 關（目前最深第 ${save.world.highestStage} 關）。`,
            '同一段進度不會重複換點。',
          ].join('\n'),
        )
        .setColor(INK_DIM);
      this.rebirthButton?.setEnabled(false);
    }
  }
}
