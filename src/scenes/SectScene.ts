import Phaser from 'phaser';
import { GAME_WIDTH } from '../config';
import { CARDS, SECTS } from '../data';
import type { Sect } from '../data/types';
import { persist, state } from '../state';
import { realmForStage } from '../systems/realms';
import { masteryLine, switchCost } from '../systems/sects';
import { sanitizeTalismans } from '../systems/talismans';
import { createButton } from '../ui/button';
import { drawBackdrop } from '../ui/backdrop';
import {
  BG_PANEL,
  BG_PANEL_ALT,
  DANGER,
  GOLD,
  INK,
  INK_DIM,
  JADE,
  LINE,
  hexToNumber,
  textStyle,
  wrapText,
} from '../ui/theme';
import { fadeIn, fadeToScene } from '../ui/transition';

interface SectCard {
  sect: Sect;
  background: Phaser.GameObjects.Rectangle;
}

/** 門派選擇：體修 / 劍修 / 符修 / 丹修，決定起始屬性與各項乘區。 */
export class SectScene extends Phaser.Scene {
  private selected: Sect | null = null;
  private cards: SectCard[] = [];
  /** 這一場帶的四張符。門派的專精符在不在裡面，要當場說出來。 */
  private brought: string[] = [];
  private costLabel: Phaser.GameObjects.Text | undefined;
  private confirm: { setEnabled(enabled: boolean): void } | undefined;

  constructor() {
    super('Sect');
  }

  create(): void {
    fadeIn(this);
    const save = state();
    const realm = realmForStage(save.world.stage);
    drawBackdrop(this, realm.color, realm.scenery);
    this.cards = [];
    this.selected = SECTS.find((sect) => sect.id === save.player.sectId) ?? null;

    const cx = GAME_WIDTH / 2;
    this.add.text(cx, 74, '拜入師門', textStyle({ size: 42, color: INK, bold: true })).setOrigin(0.5);
    // 門派修為與換派費用要先講清楚，玩家才會知道這個選擇是有份量的。
    this.add
      .text(cx, 118, '門派修為只長在自己身上——換派要付錢，但舊修為留著', textStyle({ size: 17, color: INK_DIM }))
      .setOrigin(0.5);
    this.brought = sanitizeTalismans(save.player.talismans, save.world.highestStage);

    // 四張卡 + 底部兩顆按鈕要塞進 960：140 起、每張 168 高、間距 6，
    // 最後一張底緣落在 830，把 855 以下留給按鈕。卡片內容的行數是算過的（見 buildCard）。
    const cardHeight = 168;
    const gap = 4;
    const top = 138;

    SECTS.forEach((sect, index) => {
      const y = top + index * (cardHeight + gap) + cardHeight / 2;
      this.buildCard(sect, cx, y, cardHeight);
    });

    const confirm = createButton(this, cx, 896, {
      width: 340,
      height: 66,
      label: '確定入門',
      fontSize: 26,
      strokeColor: 0x6f8b7a,
      onClick: () => {
        const target = this.selected;
        if (target === null) return;
        const cost = switchCost(save, target.id);
        if (cost > save.player.wallet.gold) return;
        save.player.wallet.gold -= cost;
        save.player.sectId = target.id;
        persist();
        fadeToScene(this, 'Title');
      },
    });
    this.confirm = confirm;

    createButton(this, 74, 896, {
      width: 96,
      height: 70,
      label: '返回',
      fontSize: 22,
      onClick: () => fadeToScene(this, 'Title'),
    });

    this.costLabel = this.add
      .text(cx, 848, '', textStyle({ size: 18, color: GOLD }))
      .setOrigin(0.5);

    this.refresh();
    this.cards.forEach((card) => {
      card.background.on('pointerup', () => {
        this.selected = card.sect;
        this.refresh();
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

    // 版面依「說明兩行、被動兩行、數值一行、修為與專精一行」排。
    // 四張卡要塞進 138～826，每張只有 168 高——sects.json 的說明長度因此是資料約束，
    // 不是隨意欄位：寫長了就會擠出卡片。
    this.add.text(left, top + 6, sect.name, textStyle({ size: 25, color: sect.color, bold: true }));
    this.add.text(left + 122, top + 12, sect.path, textStyle({ size: 17, color: INK }));
    this.add
      .text(cx + width / 2 - 20, top + 13, `「${sect.motto}」`, textStyle({ size: 14, color: INK_DIM }))
      .setOrigin(1, 0);
    this.add
      .text(left, top + 34, wrapText(sect.desc, textWidth, 15), textStyle({ size: 15, color: INK }))
      .setLineSpacing(2);
    this.add
      .text(
        left,
        top + 78,
        wrapText(`【被動】${sect.passive}`, textWidth, 14),
        textStyle({ size: 14, color: GOLD }),
      )
      .setLineSpacing(2);
    this.add
      .text(left, top + 118, wrapText(this.statLine(sect), textWidth, 13), textStyle({ size: 13, color: INK_DIM }))
      .setLineSpacing(2);

    // 修為：這一派已經累積了多少、下一階還差幾場。沒有這一行，「換派要付錢」就只是懲罰。
    this.add.text(left, top + 146, masteryLine(state(), sect.id), textStyle({ size: 13, color: JADE }));

    // 專精符在不在你這次帶的四張裡。
    //
    // 這是整個 build 系統裡最容易被藏起來的一條：劍修的被動是「劍陣符 +35%」，
    // 而最優牌組裡可能根本沒有劍陣符——被動整個歸零，畫面上卻一個字都沒有。
    // 已經存在的取捨被藏起來，比沒有取捨還糟。
    const favored = CARDS.find((card) => card.id === sect.favoredCard);
    if (favored !== undefined) {
      const has = this.brought.includes(sect.favoredCard);
      this.add
        .text(
          cx + width / 2 - 20,
          top + 146,
          has ? `專精 ${favored.name}・已帶` : `專精 ${favored.name}・沒帶`,
          textStyle({ size: 13, color: has ? JADE : DANGER, bold: true }),
        )
        .setOrigin(1, 0);
    }

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
    if (sect.leakImmunityCount > 0) parts.push(`免傷 ${sect.leakImmunityCount} 次`);
    // 符修的乘區全是 1，沒有這一行的話它的卡片會空一塊，看起來像沒寫完。
    if (sect.mergeRefundChance > 0) {
      parts.push(`合成保留 ${Math.round(sect.mergeRefundChance * 100)}%`);
    }
    return parts.join('　');
  }

  /**
   * 換派的價碼要在按下去之前就看得到，而且要說清楚它為什麼是這個價。
   *
   * 只把按鈕變灰而不說原因，玩家會以為是壞掉了。
   */
  private refresh(): void {
    for (const card of this.cards) {
      const chosen = this.selected !== null && card.sect.id === this.selected.id;
      card.background.setStrokeStyle(chosen ? 3 : 2, chosen ? hexToNumber(card.sect.color) : LINE);
      card.background.setFillStyle(chosen ? BG_PANEL_ALT : BG_PANEL, chosen ? 1 : 0.92);
    }
    const save = state();
    const target = this.selected;
    if (target === null) {
      this.costLabel?.setText('選一個門派');
      this.confirm?.setEnabled(false);
      return;
    }
    const cost = switchCost(save, target.id);
    const affordable = cost <= save.player.wallet.gold;
    if (cost === 0) {
      this.costLabel?.setText(save.player.sectId === target.id ? '目前的門派' : '免費入門').setColor(INK_DIM);
    } else {
      this.costLabel
        ?.setText(`換派費 ${cost} 金幣（現有 ${Math.floor(save.player.wallet.gold)}）`)
        .setColor(affordable ? GOLD : DANGER);
    }
    this.confirm?.setEnabled(affordable);
  }
}
