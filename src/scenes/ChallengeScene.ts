/**
 * 試煉：玩家自己加上去的限制。
 *
 * 排版刻意把「這條逼你改變什麼」寫在規則下面一整段——一句「不能合成」只說了規則，
 * 沒說為什麼有人會想開它。挑戰模式本來就是給已經打得動的人找事做，
 * 說服他去開才是這一頁真正的工作。
 */
import Phaser from 'phaser';
import { GAME_WIDTH } from '../config';
import { CHALLENGES } from '../data';
import type { ChallengeDef } from '../data/types';
import { persist, state } from '../state';
import {
  availableChallenges,
  challengeGoldMultiplier,
  isChallengeCleared,
  sanitizeChallenges,
} from '../systems/challenges';
import { realmForStage } from '../systems/realms';
import { createButton } from '../ui/button';
import { drawBackdrop } from '../ui/backdrop';
import {
  BG_PANEL,
  BG_PANEL_ALT,
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

interface Row {
  def: ChallengeDef;
  background: Phaser.GameObjects.Rectangle;
  mark: Phaser.GameObjects.Text;
  unlocked: boolean;
}

const ROW_HEIGHT = 132;
const ROW_GAP = 6;
const LIST_TOP = 150;

export class ChallengeScene extends Phaser.Scene {
  private rows: Row[] = [];
  private chosen: string[] = [];
  private summary: Phaser.GameObjects.Text | undefined;

  constructor() {
    super('Challenge');
  }

  create(): void {
    fadeIn(this);
    const save = state();
    const realm = realmForStage(save.world.stage);
    drawBackdrop(this, realm.color, realm.scenery);
    this.rows = [];
    this.chosen = sanitizeChallenges(save.player.challenges, save.world.highestStage);

    const cx = GAME_WIDTH / 2;
    this.add.text(cx, 46, '試　煉', textStyle({ size: 40, color: INK, bold: true })).setOrigin(0.5);
    this.add
      .text(
        cx,
        92,
        '自己加上去的限制。只會讓這一場更難，換來的只有金幣。',
        textStyle({ size: 16, color: INK_DIM }),
      )
      .setOrigin(0.5);
    // 講明它給不了別的東西，是刻意的：一旦挑戰能換到別處拿不到的東西，
    // 它就從「自己找事做」變成「不做就落後」。
    this.add
      .text(cx, 116, '不開也一樣推得完全部關卡。', textStyle({ size: 15, color: INK_DIM }))
      .setOrigin(0.5);

    const available = availableChallenges(save.world.highestStage);
    CHALLENGES.forEach((def, index) => {
      const unlocked = available.some((item) => item.id === def.id);
      this.buildRow(def, cx, LIST_TOP + index * (ROW_HEIGHT + ROW_GAP), unlocked, save.world.highestStage);
    });

    this.summary = this.add.text(cx, 866, '', textStyle({ size: 19, color: GOLD })).setOrigin(0.5);

    createButton(this, cx, 916, {
      width: 340,
      height: 62,
      label: '收妥　返回',
      fontSize: 24,
      strokeColor: 0x6f8b7a,
      onClick: () => {
        save.player.challenges = [...this.chosen];
        persist();
        fadeToScene(this, 'Title');
      },
    });

    this.refresh();
  }

  private buildRow(
    def: ChallengeDef,
    cx: number,
    top: number,
    unlocked: boolean,
    highestStage: number,
  ): void {
    const width = GAME_WIDTH - 44;
    const left = cx - width / 2 + 18;
    const textWidth = width - 76;
    const cy = top + ROW_HEIGHT / 2;

    const background = this.add
      .rectangle(cx, cy, width, ROW_HEIGHT, BG_PANEL, 0.92)
      .setStrokeStyle(2, LINE)
      .setInteractive({ useHandCursor: true });

    this.add.text(left, top + 10, def.name, textStyle({ size: 24, color: INK, bold: true }));
    this.add
      .text(cx + width / 2 - 18, top + 14, `金幣 ×${def.goldMultiplier}`, textStyle({ size: 17, color: GOLD }))
      .setOrigin(1, 0);
    this.add.text(left, top + 44, def.desc, textStyle({ size: 17, color: JADE }));
    this.add
      .text(left, top + 70, wrapText(def.detail, textWidth, 15), textStyle({ size: 15, color: INK_DIM }))
      .setLineSpacing(3);

    // 勾選記號放在最右邊、字級夠大：這一頁唯一要一眼看清的就是「我開了哪幾條」。
    const mark = this.add
      .text(cx + width / 2 - 18, cy + 22, '', textStyle({ size: 22, bold: true }))
      .setOrigin(1, 0.5);

    if (!unlocked) {
      this.add
        .text(
          cx,
          cy,
          `推到第 ${def.minStage} 關才開放（目前 ${highestStage}）`,
          textStyle({ size: 17, color: INK_DIM }),
        )
        .setOrigin(0.5);
    } else {
      background.on('pointerup', () => this.toggle(def.id));
    }

    this.rows.push({ def, background, mark, unlocked });
  }

  private toggle(id: string): void {
    const at = this.chosen.indexOf(id);
    if (at >= 0) this.chosen.splice(at, 1);
    else this.chosen.push(id);
    this.refresh();
  }

  private refresh(): void {
    const save = state();
    for (const row of this.rows) {
      const on = this.chosen.includes(row.def.id);
      row.background
        .setStrokeStyle(on ? 3 : 2, on ? hexToNumber(GOLD) : LINE)
        .setFillStyle(on ? BG_PANEL_ALT : BG_PANEL, row.unlocked ? 0.92 : 0.55);
      const done = isChallengeCleared(save, row.def.id);
      row.mark
        .setText(on ? '已開啟' : done ? '曾達成' : '')
        .setColor(on ? GOLD : JADE);
    }
    // 倍率當場算給玩家看，不是等他打完才知道值不值得。
    const preview = { ...save, player: { ...save.player, challenges: this.chosen } };
    const multiplier = challengeGoldMultiplier(preview);
    this.summary?.setText(
      this.chosen.length === 0
        ? '目前沒有開啟任何試煉'
        : `開啟 ${this.chosen.length} 條　金幣 ×${multiplier.toFixed(2)}`,
    );
  }
}
