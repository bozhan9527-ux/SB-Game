import Phaser from 'phaser';
import { GAME_WIDTH } from '../config';
import { CARDS, SECTS } from '../data';
import type { Sect } from '../data/types';
import { persist, state } from '../state';
import { realmForStage } from '../systems/realms';
import { createButton } from '../ui/button';
import { drawBackdrop } from '../ui/backdrop';
import { BG_PANEL, BG_PANEL_ALT, INK, INK_DIM, LINE, hexToNumber, textStyle, wrapText } from '../ui/theme';

interface SectCard {
  sect: Sect;
  background: Phaser.GameObjects.Rectangle;
}

/** 門派選擇：體修 / 劍修 / 符修 / 丹修，決定起始屬性與各項乘區。 */
export class SectScene extends Phaser.Scene {
  private selected: Sect | null = null;
  private cards: SectCard[] = [];

  constructor() {
    super('Sect');
  }

  create(): void {
    const save = state();
    const realm = realmForStage(save.world.stage);
    drawBackdrop(this, realm.color, realm.scenery);
    this.cards = [];
    this.selected = SECTS.find((sect) => sect.id === save.player.sectId) ?? null;

    const cx = GAME_WIDTH / 2;
    this.add.text(cx, 74, '拜入師門', textStyle({ size: 42, color: INK, bold: true })).setOrigin(0.5);
    this.add
      .text(cx, 118, '門派決定你的起手牌，隨時可回來更換', textStyle({ size: 19, color: INK_DIM }))
      .setOrigin(0.5);

    const cardHeight = 178;
    const gap = 6;
    const top = 146;

    SECTS.forEach((sect, index) => {
      const y = top + index * (cardHeight + gap) + cardHeight / 2;
      this.buildCard(sect, cx, y, cardHeight);
    });

    const confirm = createButton(this, cx, 900, {
      width: 340,
      height: 70,
      label: '確定入門',
      fontSize: 28,
      strokeColor: 0x6f8b7a,
      onClick: () => {
        if (this.selected === null) return;
        save.player.sectId = this.selected.id;
        persist();
        this.scene.start('Title');
      },
    });
    confirm.setEnabled(this.selected !== null);

    createButton(this, 74, 900, {
      width: 96,
      height: 70,
      label: '返回',
      fontSize: 22,
      onClick: () => this.scene.start('Title'),
    });

    this.refresh(confirm.setEnabled.bind(confirm));
    this.cards.forEach((card) => {
      card.background.on('pointerup', () => {
        this.selected = card.sect;
        this.refresh(confirm.setEnabled.bind(confirm));
      });
    });
  }

  private buildCard(sect: Sect, cx: number, cy: number, height: number): void {
    const width = GAME_WIDTH - 48;
    const color = hexToNumber(sect.color);
    const top = cy - height / 2;
    const left = cx - width / 2 + 20;
    const textWidth = width - 40;

    const background = this.add
      .rectangle(cx, cy, width, height, BG_PANEL, 0.92)
      .setStrokeStyle(2, LINE)
      .setInteractive({ useHandCursor: true });

    this.add.text(left, top + 12, sect.name, textStyle({ size: 28, color: sect.color, bold: true }));
    this.add.text(left + 132, top + 19, sect.path, textStyle({ size: 19, color: INK }));
    this.add
      .text(cx + width / 2 - 20, top + 20, `「${sect.motto}」`, textStyle({ size: 16, color: INK_DIM }))
      .setOrigin(1, 0);
    this.add
      .text(left, top + 52, wrapText(sect.desc, textWidth, 18), textStyle({ size: 18, color: INK }))
      .setLineSpacing(4);
    this.add
      .text(left, top + 96, wrapText(`【被動】${sect.passive}`, textWidth, 16), textStyle({ size: 16, color: '#e8c46a' }))
      .setLineSpacing(4);
    this.add
      .text(left, top + 128, wrapText(this.statLine(sect), textWidth, 15), textStyle({ size: 15, color: INK_DIM }))
      .setLineSpacing(4);

    // 左側色條，讓門派在視覺上一眼可辨。
    this.add.rectangle(cx - width / 2 + 3, cy, 6, height - 4, color, 0.9);

    this.cards.push({ sect, background });
  }

  /** 把門派的數值差異攤開，避免玩家只能看敘述猜。 */
  private statLine(sect: Sect): string {
    const parts: string[] = [];
    const mul = (label: string, value: number): void => {
      if (value !== 1) parts.push(`${label}×${value}`);
    };
    mul('山門', sect.discipleMultiplier);
    mul('法寶傷害', sect.damageMultiplier);
    mul('抽符', sect.drawSpeedMultiplier);
    mul('首領傷害', sect.bossDamageMultiplier);
    mul('金幣', sect.goldMultiplier);
    const favored = CARDS.find((card) => card.id === sect.favoredCard);
    if (favored !== undefined && sect.favoredDamageMultiplier !== 1) {
      parts.push(`${favored.name}×${sect.favoredDamageMultiplier}`);
    }
    return parts.join(' ');
  }

  private refresh(setConfirmEnabled: (enabled: boolean) => void): void {
    for (const card of this.cards) {
      const chosen = this.selected !== null && card.sect.id === this.selected.id;
      card.background.setStrokeStyle(chosen ? 3 : 2, chosen ? hexToNumber(card.sect.color) : LINE);
      card.background.setFillStyle(chosen ? BG_PANEL_ALT : BG_PANEL, chosen ? 1 : 0.92);
    }
    setConfirmEnabled(this.selected !== null);
  }
}
