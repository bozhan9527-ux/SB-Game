import Phaser from 'phaser';
import { audio } from '../audio';
import { GAME_HEIGHT, GAME_WIDTH } from '../config';
import { ACHIEVEMENTS } from '../data';
import { persist, state } from '../state';
import { addGold } from '../save';
import {
  claimReward,
  detectAchievements,
  isClaimed,
  isUnlocked,
  pendingAchievements,
  progressOf,
} from '../systems/achievements';
import { realmForStage } from '../systems/realms';
import type { Button } from '../ui/button';
import { createButton } from '../ui/button';
import { drawBackdrop } from '../ui/backdrop';
import { BG_PANEL, GOLD, INK, INK_DIM, JADE, LINE, formatNumber, hexToNumber, textStyle } from '../ui/theme';
import { fadeIn, fadeToScene } from '../ui/transition';

/** 成就一覽。可上下拖曳捲動，因為條目比一頁多。 */
export class AchievementScene extends Phaser.Scene {
  constructor() {
    super('Achievements');
  }

  /** 每一列的可變部分，領取之後要就地更新——重建整頁會把捲動位置一起洗掉。 */
  private rows: {
    id: string;
    status: Phaser.GameObjects.Text;
    reward: Phaser.GameObjects.Text;
    button: Button;
    frame: Phaser.GameObjects.Rectangle;
  }[] = [];
  private header!: Phaser.GameObjects.Text;
  private claimAll: Button | undefined;

  create(): void {
    fadeIn(this);
    const save = state();
    // Phaser 重用 Scene 實例，上一次的物件已被銷毀，不重設就會拿到一堆空殼。
    this.rows = [];
    this.claimAll = undefined;
    // 條件已經滿足卻還沒記錄的成就在這裡一併判定。
    // 否則清單會出現「進度 7/6」卻標成未達成，看起來像壞掉。
    if (detectAchievements(save).length > 0) persist();

    const realm = realmForStage(save.world.stage);
    drawBackdrop(this, realm.color, realm.scenery);

    const cx = GAME_WIDTH / 2;
    this.add.text(cx, 46, '仙途錄', textStyle({ size: 40, color: INK, bold: true })).setOrigin(0.5);
    this.header = this.add.text(cx, 92, '', textStyle({ size: 20, color: GOLD })).setOrigin(0.5);

    // 條目放進一個可拖曳的容器，並用遮罩裁掉清單範圍以外的部分。
    const viewTop = 122;
    const viewHeight = GAME_HEIGHT - viewTop - 176;
    const list = this.add.container(0, viewTop);
    const rowHeight = 76;

    ACHIEVEMENTS.forEach((item, index) => {
      const y = index * rowHeight + rowHeight / 2;
      const width = GAME_WIDTH - 40;
      const frame = this.add
        .rectangle(cx, y, width, rowHeight - 8, BG_PANEL, 0.9)
        .setStrokeStyle(2, LINE);
      list.add(frame);
      const left = cx - width / 2 + 18;
      list.add(
        this.add.text(left, y - 26, item.name, textStyle({ size: 21, color: INK, bold: true })),
      );
      list.add(this.add.text(left, y - 2, item.desc, textStyle({ size: 14, color: INK_DIM })));
      const status = this.add.text(left, y + 18, '', textStyle({ size: 14, color: INK_DIM }));
      list.add(status);

      const reward = this.add
        .text(cx + width / 2 - 118, y - 12, `${formatNumber(item.reward)} 金`, textStyle({ size: 15, color: GOLD }))
        .setOrigin(1, 0.5);
      list.add(reward);

      // 領取鍵常駐，只是會變成停用——按鈕忽隱忽現的清單，眼睛每次都要重新找一次。
      const button = createButton(this, cx + width / 2 - 58, y, {
        width: 96,
        height: 46,
        label: '領取',
        fontSize: 18,
        textColor: GOLD,
        strokeColor: hexToNumber(GOLD),
        onClick: () => {
          const gold = claimReward(save, item.id);
          if (gold <= 0) return;
          addGold(save, gold);
          persist();
          audio.play('gold');
          this.refresh();
        },
      });
      list.add(button.container);
      this.rows.push({ id: item.id, status, reward, button, frame });
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

    // 一次領完。十九條散在一個要捲動的清單裡，逐條點是在浪費玩家的時間——
    // 「有東西可領」該給的是期待感，不是勞動。
    this.claimAll = createButton(this, cx, GAME_HEIGHT - 128, {
      width: 300,
      height: 56,
      label: '',
      fontSize: 21,
      fillColor: hexToNumber(GOLD),
      strokeColor: hexToNumber(GOLD),
      textColor: '#12181f',
      onClick: () => {
        let total = 0;
        for (const item of pendingAchievements(save)) total += claimReward(save, item.id);
        if (total <= 0) return;
        addGold(save, total);
        persist();
        audio.play('gold');
        this.refresh();
      },
    });

    createButton(this, cx, GAME_HEIGHT - 56, {
      width: 300,
      height: 58,
      label: '回主畫面',
      fontSize: 24,
      onClick: () => fadeToScene(this, 'Title'),
    });

    this.refresh();
  }

  /** 把每一列與頁首更新成目前的狀態。領取之後只跑這個，不重建整頁。 */
  private refresh(): void {
    const save = state();
    const done = ACHIEVEMENTS.filter((item) => isUnlocked(save, item.id)).length;
    const pending = pendingAchievements(save);
    this.header
      .setText(
        pending.length > 0
          ? `已達成 ${done} / ${ACHIEVEMENTS.length}　可領取 ${pending.length}`
          : `已達成 ${done} / ${ACHIEVEMENTS.length}`,
      )
      .setColor(pending.length > 0 ? GOLD : INK_DIM);

    const total = pending.reduce((sum, item) => sum + item.reward, 0);
    this.claimAll?.setLabel(total > 0 ? `全部領取 ${formatNumber(total)} 金` : '沒有可領取的');
    this.claimAll?.setEnabled(total > 0);

    for (const row of this.rows) {
      const item = ACHIEVEMENTS.find((entry) => entry.id === row.id);
      if (item === undefined) continue;
      const unlocked = isUnlocked(save, item.id);
      const claimed = isClaimed(save, item.id);
      row.frame.setStrokeStyle(2, unlocked && !claimed ? hexToNumber(GOLD) : LINE);
      row.status
        .setText(claimed ? '已領取' : unlocked ? '可領取' : progressOf(save, item))
        .setColor(claimed ? INK_DIM : unlocked ? JADE : INK_DIM);
      row.reward.setAlpha(claimed ? 0.4 : 1);
      row.button.setEnabled(unlocked && !claimed);
    }
  }
}
