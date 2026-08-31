/**
 * 副本選單。
 *
 * 取代了原本的「試煉」設定頁。差別不只是換個名字：舊頁面讓玩家勾幾條限制，
 * 然後把限制帶進他自己挑的關卡；新頁面讓玩家挑一個副本，**關卡由副本決定**。
 * 這一句就是整個改制的重點——難度是相對於現在的實力的，只要關卡還在玩家手上，
 * 他就會把限制疊在早就打爛的關卡上，領走倍率卻沒付出任何難度。
 *
 * 五個副本各有各的產出，所以這一頁的每一列都要先回答「打它有什麼」，
 * 再回答「它有多難」。順序不能反：玩家是為了東西才進去的。
 */
import Phaser from 'phaser';
import { iconTexture } from '../art';
import type { IconName } from '../art';
import { GAME_HEIGHT, GAME_WIDTH } from '../config';
import { DUNGEONS } from '../data';
import type { DungeonDef } from '../data/types';
import { state } from '../state';
import {
  clearedFloors,
  dungeonAvailable,
  floorAt,
  floorStage,
  nextFloor,
} from '../systems/dungeons';
import { realmForStage, realmTitle } from '../systems/realms';
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
  fitText,
  hexToNumber,
  textStyle,
} from '../ui/theme';
import { fadeIn, fadeToScene } from '../ui/transition';

const LIST_TOP = 108;
const CARD_HEIGHT = 132;
const CARD_GAP = 8;

export class DungeonScene extends Phaser.Scene {
  constructor() {
    super('Dungeon');
  }

  create(): void {
    fadeIn(this);
    const save = state();
    const realm = realmForStage(save.world.stage);
    drawBackdrop(this, realm.color, realm.scenery);

    const cx = GAME_WIDTH / 2;
    this.add.text(cx, 44, '副　本', textStyle({ size: 36, color: INK, bold: true })).setOrigin(0.5);
    this.add
      .text(cx, 80, '關卡由副本決定，不能挑', textStyle({ size: 16, color: INK_DIM }))
      .setOrigin(0.5);

    DUNGEONS.forEach((dungeon, index) => {
      this.buildCard(dungeon, LIST_TOP + index * (CARD_HEIGHT + CARD_GAP));
    });

    createButton(this, cx, GAME_HEIGHT - 52, {
      width: 340,
      height: 60,
      label: '返回',
      fontSize: 22,
      onClick: () => fadeToScene(this, 'Title'),
    });
  }

  private buildCard(dungeon: DungeonDef, top: number): void {
    const save = state();
    const cx = GAME_WIDTH / 2;
    const width = GAME_WIDTH - 32;
    const left = cx - width / 2;
    const available = dungeonAvailable(save, dungeon);
    const upcoming = nextFloor(save, dungeon);
    const cleared = clearedFloors(save, dungeon.id);

    this.add
      .rectangle(cx, top + CARD_HEIGHT / 2, width, CARD_HEIGHT, BG_PANEL, available ? 0.92 : 0.6)
      .setStrokeStyle(available ? 2 : 1, available ? hexToNumber(GOLD) : LINE);

    this.add
      .image(left + 42, top + 46, iconTexture(dungeon.icon as IconName))
      .setDisplaySize(38, 38)
      .setAlpha(available ? 1 : 0.4);

    const name = this.add
      .text(left + 76, top + 30, dungeon.name, textStyle({ size: 24, color: available ? INK : INK_DIM, bold: true }))
      .setOrigin(0, 0.5);
    // 產出寫在名字旁邊，而且用玉色：玩家是為了它才進來的，它不能是最小的字。
    // 位置用量出來的寬度，不用字數乘字級猜——中英數混排時那個估算一定會錯。
    this.add
      .text(name.x + name.width + 12, top + 30, dungeon.reward, textStyle({ size: 17, color: JADE }))
      .setOrigin(0, 0.5);

    // 說明與進度都對齊名字，不對齊卡片左緣——圖示佔了左邊 56px，
    // 從卡片左緣起排的話文字會從圖示底下鑽出來。
    const desc = this.add
      .text(left + 76, top + 64, dungeon.desc, textStyle({ size: 16, color: INK_DIM }))
      .setOrigin(0, 0.5);
    fitText(desc, width - 76 - 150);

    const progress = dungeon.repeatable
      ? '可重複挑戰'
      : upcoming === null
        ? `已全部通過（${dungeon.floors.length} 層）`
        : `已通 ${cleared} / ${dungeon.floors.length} 層`;
    this.add
      .text(left + 76, top + 98, progress, textStyle({ size: 15, color: upcoming === null ? JADE : INK_DIM }))
      .setOrigin(0, 0.5);

    // 右邊那顆按鈕要先講深度再講層數：玩家要判斷的是「我現在打不打得動」。
    const floor = upcoming === null ? null : floorAt(dungeon, upcoming);
    const stage = floor === null ? 0 : floorStage(floor, save.world.highestStage);
    const first = dungeon.floors[0];
    const requirement = first === undefined ? 1 : floorStage(first, save.world.highestStage);

    if (!available) {
      this.add
        .text(
          cx + width / 2 - 20,
          top + CARD_HEIGHT / 2,
          `推到第 ${requirement} 關\n才開放`,
          textStyle({ size: 15, color: INK_DIM }),
        )
        .setOrigin(1, 0.5)
        .setAlign('right')
        .setLineSpacing(4);
      return;
    }

    if (upcoming === null || floor === null) {
      this.add
        .text(cx + width / 2 - 20, top + CARD_HEIGHT / 2, '已通關', textStyle({ size: 18, color: JADE }))
        .setOrigin(1, 0.5);
      return;
    }

    this.add
      .text(cx + width / 2 - 20, top + 34, `第 ${stage} 關 · ${realmTitle(stage)}`, textStyle({ size: 14, color: INK_DIM }))
      .setOrigin(1, 0.5);
    const button = createButton(this, cx + width / 2 - 76, top + 82, {
      width: 128,
      height: 52,
      label: dungeon.repeatable ? '進入' : `第 ${upcoming} 層`,
      fontSize: 19,
      fillColor: BG_PANEL_ALT,
      strokeColor: hexToNumber(GOLD),
      textColor: GOLD,
      onClick: () => fadeToScene(this, 'Run', { dungeonId: dungeon.id, floor: upcoming }),
    });
    void button;
  }
}
