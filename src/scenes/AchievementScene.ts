import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config';
import { ACHIEVEMENTS } from '../data';
import { persist, state } from '../state';
import { addGold } from '../save';
import { claimAchievements, isUnlocked, progressOf } from '../systems/achievements';
import { realmForStage } from '../systems/realms';
import { createButton } from '../ui/button';
import { drawBackdrop } from '../ui/backdrop';
import { BG_PANEL, GOLD, INK, INK_DIM, JADE, LINE, formatNumber, hexToNumber, textStyle } from '../ui/theme';
import { fadeIn, fadeToScene } from '../ui/transition';

/** 成就一覽。可上下拖曳捲動，因為條目比一頁多。 */
export class AchievementScene extends Phaser.Scene {
  constructor() {
    super('Achievements');
  }

  create(): void {
    fadeIn(this);
    const save = state();
    // 條件已經滿足卻還沒發放的成就在這裡一併結算。
    // 否則清單會出現「進度 7/6」卻標成未達成，看起來像壞掉。
    const claimed = claimAchievements(save);
    if (claimed.length > 0) {
      for (const item of claimed) addGold(save, item.reward);
      persist();
    }

    const realm = realmForStage(save.world.stage);
    drawBackdrop(this, realm.color, realm.scenery);

    const cx = GAME_WIDTH / 2;
    const done = ACHIEVEMENTS.filter((item) => isUnlocked(save, item.id)).length;
    this.add.text(cx, 46, '仙途錄', textStyle({ size: 40, color: INK, bold: true })).setOrigin(0.5);
    this.add
      .text(cx, 92, `已達成 ${done} / ${ACHIEVEMENTS.length}`, textStyle({ size: 20, color: GOLD }))
      .setOrigin(0.5);

    // 條目放進一個可拖曳的容器，並用遮罩裁掉清單範圍以外的部分。
    const viewTop = 122;
    const viewHeight = GAME_HEIGHT - viewTop - 110;
    const list = this.add.container(0, viewTop);
    const rowHeight = 62;

    ACHIEVEMENTS.forEach((item, index) => {
      const y = index * rowHeight + rowHeight / 2;
      const unlocked = isUnlocked(save, item.id);
      const width = GAME_WIDTH - 40;
      list.add(
        this.add
          .rectangle(cx, y, width, rowHeight - 8, BG_PANEL, unlocked ? 0.95 : 0.7)
          .setStrokeStyle(2, unlocked ? hexToNumber(GOLD) : LINE),
      );
      const left = cx - width / 2 + 18;
      list.add(
        this.add.text(left, y - 20, item.name, textStyle({ size: 22, color: unlocked ? GOLD : INK, bold: true })),
      );
      list.add(this.add.text(left, y + 4, item.desc, textStyle({ size: 15, color: INK_DIM })));
      list.add(
        this.add
          .text(
            cx + width / 2 - 18,
            y - 16,
            unlocked ? '已達成' : progressOf(save, item),
            textStyle({ size: 16, color: unlocked ? JADE : INK_DIM }),
          )
          .setOrigin(1, 0),
      );
      list.add(
        this.add
          .text(cx + width / 2 - 18, y + 6, `${formatNumber(item.reward)} 金`, textStyle({ size: 15, color: GOLD }))
          .setOrigin(1, 0),
      );
    });

    const shape = this.make.graphics({ x: 0, y: 0 });
    shape.fillRect(0, viewTop, GAME_WIDTH, viewHeight);
    list.setMask(shape.createGeometryMask());

    // 拖曳捲動：內容比可視範圍高的那一段才是可捲動距離。
    const contentHeight = ACHIEVEMENTS.length * rowHeight;
    const minY = viewTop + Math.min(0, viewHeight - contentHeight);
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!pointer.isDown) return;
      list.y = Phaser.Math.Clamp(list.y + pointer.velocity.y * 0.28, minY, viewTop);
    });

    createButton(this, cx, GAME_HEIGHT - 56, {
      width: 300,
      height: 62,
      label: '回主畫面',
      fontSize: 24,
      onClick: () => fadeToScene(this, 'Title'),
    });
  }
}
