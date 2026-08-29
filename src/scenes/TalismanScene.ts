import Phaser from 'phaser';
import { glyphTexture } from '../art';
import { CARDS } from '../data';
import { GAME_WIDTH } from '../config';
import type { CardDef } from '../data/types';
import { persist, state } from '../state';
import { sectById } from '../systems/loadout';
import { realmForStage } from '../systems/realms';
import {
  TALISMAN_SLOTS,
  effectLines,
  isCompleteLoadout,
  nextUnlock,
  sanitizeTalismans,
  statLine,
} from '../systems/talismans';
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

interface Tile {
  def: CardDef;
  unlocked: boolean;
  background: Phaser.GameObjects.Rectangle;
  glyph: Phaser.GameObjects.Image;
  name: Phaser.GameObjects.Text;
  note: Phaser.GameObjects.Text;
}

// 540×960 之下的版面。四張已選、二十張符（4 欄 × 5 列）、一塊說明、一排按鈕，
// 每一段的高度都是算出來的——資料筆數變了就得重算，這是 PROGRESS 的 L-08。
const CHOSEN_Y = 180;
const CHOSEN_STEP = 96;
const GRID_TOP = 222;
const TILE_W = 120;
const TILE_H = 80;
const TILE_GAP = 5;
const GRID_COLUMNS = 4;
const DETAIL_TOP = 648;

/**
 * 符籙譜：二十張裡挑四張帶進場。
 *
 * 為什麼只能帶四張、為什麼用關卡解鎖，寫在 src/systems/talismans.ts 的檔頭。
 * 這裡只負責把那些規則變成看得懂的畫面。
 *
 * 畫面上刻意**不排名**（不標「強度」也不排序戰力）：這些符沒有強弱之分，
 * 只有適不適合。標上分數等於替玩家做完決定，選擇就沒了。
 */
export class TalismanScene extends Phaser.Scene {
  private chosen: string[] = [];
  private tiles: Tile[] = [];
  private slots: Phaser.GameObjects.Container[] = [];
  private detail: Phaser.GameObjects.Text | null = null;
  private detailTitle: Phaser.GameObjects.Text | null = null;
  private hint: Phaser.GameObjects.Text | null = null;
  private confirm: { setEnabled(enabled: boolean): void } | null = null;
  private focused: CardDef | null = null;
  private sectLine: Phaser.GameObjects.Text | undefined;

  constructor() {
    super('Talisman');
  }

  create(): void {
    fadeIn(this);
    const save = state();
    const highest = save.world.highestStage;
    const realm = realmForStage(save.world.stage);
    drawBackdrop(this, realm.color, realm.scenery);
    this.tiles = [];
    this.slots = [];
    this.chosen = sanitizeTalismans(save.player.talismans, highest);

    const cx = GAME_WIDTH / 2;
    this.add.text(cx, 46, '符籙譜', textStyle({ size: 38, color: INK, bold: true })).setOrigin(0.5);
    const upcoming = nextUnlock(highest);
    this.add
      .text(
        cx,
        80,
        upcoming === null
          ? `二十張已全數參悟，每次帶 ${TALISMAN_SLOTS} 張入場`
          : `每次帶 ${TALISMAN_SLOTS} 張入場　推到第 ${upcoming.unlockStage} 關可得「${upcoming.name}」`,
        textStyle({ size: 16, color: INK_DIM }),
      )
      .setOrigin(0.5);

    this.buildSectLine(cx);
    this.buildChosenSlots(cx);
    this.buildGrid(highest);
    this.buildDetail(cx);

    this.confirm = createButton(this, cx + 84, 880, {
      width: 208,
      height: 64,
      label: '收妥　返回',
      fontSize: 24,
      strokeColor: 0x6f8b7a,
      onClick: () => {
        save.player.talismans = [...this.chosen];
        persist();
        fadeToScene(this, 'Title');
      },
    });

    createButton(this, cx - 130, 880, {
      width: 116,
      height: 64,
      label: '取消',
      fontSize: 22,
      onClick: () => fadeToScene(this, 'Title'),
    });

    this.focus(this.chosen[0] ?? null);
    this.refresh();
  }

  /**
   * 門派專精那一行。
   *
   * 這兩個畫面原本互不知情：符籙譜從頭到尾沒提過門派，選門派也沒提過符。
   * 於是劍修帶著不含劍陣符的牌組，被動整場歸零，畫面上一個字都沒有——
   * **已經存在的取捨被藏起來，比沒有取捨還糟**，玩家連自己選錯了都不知道。
   */
  private buildSectLine(cx: number): void {
    const save = state();
    const sect = sectById(save.player.sectId);
    if (sect === null) return;
    const favored = CARDS.find((card) => card.id === sect.favoredCard);
    if (favored === undefined) return;
    const has = this.chosen.includes(sect.favoredCard);
    const gain = Math.round((sect.favoredDamageMultiplier - 1) * 100);
    this.sectLine = this.add
      .text(cx, 104, '', textStyle({ size: 15, bold: true }))
      .setOrigin(0.5)
      .setData('sect', sect.name)
      .setData('favored', favored.name)
      .setData('gain', gain);
    this.refreshSectLine(has);
  }

  private refreshSectLine(has: boolean): void {
    const label = this.sectLine;
    if (label === undefined) return;
    const sectName = label.getData('sect') as string;
    const favored = label.getData('favored') as string;
    const gain = label.getData('gain') as number;
    label
      .setText(
        has
          ? `${sectName}專精 ${favored}：已帶入場，傷害 +${gain}%`
          : `${sectName}專精 ${favored}：沒帶就吃不到那 +${gain}%`,
      )
      .setColor(has ? JADE : DANGER);
  }

  /** 上方四格：目前帶的四張。點一下就卸下，這是最短的「換掉一張」路徑。 */
  private buildChosenSlots(cx: number): void {
    this.add
      .text(cx, 128, '入場的四張（點一下卸下）', textStyle({ size: 15, color: GOLD }))
      .setOrigin(0.5);

    for (let i = 0; i < TALISMAN_SLOTS; i += 1) {
      const x = cx + (i - (TALISMAN_SLOTS - 1) / 2) * CHOSEN_STEP;
      const background = this.add
        .rectangle(0, 0, 84, 76, BG_PANEL, 0.92)
        .setStrokeStyle(2, LINE)
        .setInteractive({ useHandCursor: true });
      const glyph = this.add.image(0, -14, glyphTexture('sword')).setDisplaySize(26, 32);
      const name = this.add.text(0, 22, '', textStyle({ size: 14, color: INK })).setOrigin(0.5);
      const container = this.add.container(x, CHOSEN_Y, [background, glyph, name]);
      container.setData('glyph', glyph);
      container.setData('name', name);
      container.setData('background', background);
      background.on('pointerup', () => {
        const id = this.chosen[i];
        if (id === undefined) return;
        this.focus(id);
        this.chosen.splice(i, 1);
        this.refresh();
      });
      this.slots.push(container);
    }
  }

  private buildGrid(highest: number): void {
    const gridWidth = GRID_COLUMNS * TILE_W + (GRID_COLUMNS - 1) * TILE_GAP;
    const left = (GAME_WIDTH - gridWidth) / 2 + TILE_W / 2;
    const favoredId = sectById(state().player.sectId)?.favoredCard ?? null;

    CARDS.forEach((def, index) => {
      const col = index % GRID_COLUMNS;
      const row = Math.floor(index / GRID_COLUMNS);
      const x = left + col * (TILE_W + TILE_GAP);
      const y = GRID_TOP + TILE_H / 2 + row * (TILE_H + TILE_GAP);
      const unlocked = def.unlockStage <= Math.max(1, highest);

      const background = this.add
        .rectangle(x, y, TILE_W, TILE_H, BG_PANEL, 0.92)
        .setStrokeStyle(2, LINE)
        .setInteractive({ useHandCursor: true });
      const glyph = this.add
        .image(x, y - 18, glyphTexture(def.art))
        .setDisplaySize(24, 30)
        .setAlpha(unlocked ? 1 : 0.3);
      const name = this.add
        .text(x, y + 10, def.name, textStyle({ size: 15, color: unlocked ? def.color : INK_DIM }))
        .setOrigin(0.5);
      const note = this.add
        .text(
          x,
          y + 29,
          unlocked ? `${def.targets} 道` : `第 ${def.unlockStage} 關`,
          textStyle({ size: 12, color: INK_DIM }),
        )
        .setOrigin(0.5);
      // 門派專精的那一張在格子上直接掛個記號，不必回選門派畫面對照。
      if (def.id === favoredId) {
        this.add
          .text(x + TILE_W / 2 - 4, y - TILE_H / 2 + 3, '專', textStyle({ size: 13, color: GOLD, bold: true }))
          .setOrigin(1, 0);
      }

      background.on('pointerup', () => this.tap(def, unlocked));
      this.tiles.push({ def, unlocked, background, glyph, name, note });
    });
  }

  private buildDetail(cx: number): void {
    this.add
      .rectangle(cx, DETAIL_TOP + 84, GAME_WIDTH - 36, 168, BG_PANEL, 0.9)
      .setStrokeStyle(2, LINE);
    this.detailTitle = this.add.text(30, DETAIL_TOP + 12, '', textStyle({ size: 21, bold: true }));
    this.detail = this.add
      .text(30, DETAIL_TOP + 44, '', textStyle({ size: 15, color: INK }))
      .setLineSpacing(4);
    this.hint = this.add.text(cx, 838, '', textStyle({ size: 14, color: GOLD })).setOrigin(0.5);
  }

  /**
   * 點一張符：先給說明，再處理選取。
   *
   * 已滿四張時**不自動替換**，而是要求先卸下一張。自動替換會在玩家只是想看說明時
   * 悄悄動掉配置——「看」與「換」必須是兩件事。
   */
  private tap(def: CardDef, unlocked: boolean): void {
    this.focus(def.id);
    if (!unlocked) {
      this.say(`推到第 ${def.unlockStage} 關才會參悟「${def.name}」`);
      this.refresh();
      return;
    }
    const at = this.chosen.indexOf(def.id);
    if (at >= 0) {
      this.chosen.splice(at, 1);
      this.say('');
    } else if (this.chosen.length >= TALISMAN_SLOTS) {
      this.say('已經帶滿四張，先點掉一張再換');
    } else {
      this.chosen.push(def.id);
      this.say('');
    }
    this.refresh();
  }

  private say(text: string): void {
    this.hint?.setText(text);
  }

  private focus(id: string | null): void {
    this.focused = id === null ? null : CARDS.find((card) => card.id === id) ?? null;
    const def = this.focused;
    if (def === null) {
      this.detailTitle?.setText('');
      this.detail?.setText('點一張符看它的路數');
      return;
    }
    this.detailTitle?.setText(def.name).setColor(def.color);
    const width = GAME_WIDTH - 60;
    const lines = [
      statLine(def),
      wrapText(def.desc, width, 15),
      ...effectLines(def).map((line) => wrapText(`◆ ${line}`, width, 15)),
    ];
    this.detail?.setText(lines.join('\n'));
  }

  private refresh(): void {
    for (let i = 0; i < this.slots.length; i += 1) {
      const container = this.slots[i];
      if (container === undefined) continue;
      const id = this.chosen[i];
      const def = id === undefined ? null : CARDS.find((card) => card.id === id) ?? null;
      const glyph = container.getData('glyph') as Phaser.GameObjects.Image;
      const name = container.getData('name') as Phaser.GameObjects.Text;
      const background = container.getData('background') as Phaser.GameObjects.Rectangle;
      if (def === null) {
        glyph.setVisible(false);
        name.setText('空');
        name.setColor(INK_DIM);
        background.setStrokeStyle(2, LINE).setFillStyle(BG_PANEL, 0.6);
      } else {
        glyph.setVisible(true).setTexture(glyphTexture(def.art));
        name.setText(def.name).setColor(def.color);
        background.setStrokeStyle(3, hexToNumber(def.color)).setFillStyle(BG_PANEL_ALT, 1);
      }
    }

    this.refreshSectLine(
      this.sectLine === undefined ? false : this.chosen.includes(sectById(state().player.sectId)?.favoredCard ?? ''),
    );

    for (const tile of this.tiles) {
      const picked = this.chosen.includes(tile.def.id);
      const focusedHere = this.focused !== null && this.focused.id === tile.def.id;
      tile.background
        .setStrokeStyle(
          picked || focusedHere ? 3 : 2,
          picked ? hexToNumber(tile.def.color) : focusedHere ? 0x8fa0b0 : LINE,
        )
        .setFillStyle(picked ? BG_PANEL_ALT : BG_PANEL, tile.unlocked ? 0.92 : 0.55);
    }

    this.confirm?.setEnabled(isCompleteLoadout(this.chosen, state().world.highestStage));
  }
}
