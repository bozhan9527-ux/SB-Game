import Phaser from 'phaser';
import { GAME_WIDTH } from '../config';
import { UPGRADES } from '../data';
import type { UpgradeTrack } from '../data/types';
import { buyUpgrade } from '../save';
import { persist, state } from '../state';
import { buildLoadout, sectById } from '../systems/loadout';
import { maxTierForStage } from '../systems/deck';
import { upgradeAmount, upgradeCost } from '../systems/upgrades';
import type { Button } from '../ui/button';
import { createButton } from '../ui/button';
import { drawBackdrop } from '../ui/backdrop';
import { BG_PANEL, DANGER, GOLD, INK, INK_DIM, JADE, LINE, formatNumber, textStyle, wrapText } from '../ui/theme';
import { realmForStage } from '../systems/realms';

interface Row {
  track: UpgradeTrack;
  level: Phaser.GameObjects.Text;
  effect: Phaser.GameObjects.Text;
  button: Button;
}

/** 洞府：用金幣提升山門耐久 / 出手速度 / 法寶傷害 / 抽符速度 / 金幣收益 / 陣位數。 */
export class UpgradeScene extends Phaser.Scene {
  private rows: Row[] = [];
  private goldText!: Phaser.GameObjects.Text;
  private summaryText!: Phaser.GameObjects.Text;

  constructor() {
    super('Upgrade');
  }

  create(): void {
    const save = state();
    this.rows = [];
    const realm = realmForStage(save.world.stage);
    drawBackdrop(this, realm.color, realm.scenery);

    const cx = GAME_WIDTH / 2;
    this.add.text(cx, 56, '洞府', textStyle({ size: 42, color: INK, bold: true })).setOrigin(0.5);
    this.goldText = this.add.text(cx, 104, '', textStyle({ size: 26, color: GOLD })).setOrigin(0.5);

    const rowHeight = 122;
    const top = 146;
    UPGRADES.forEach((track, index) => {
      this.buildRow(track, cx, top + index * (rowHeight + 10) + rowHeight / 2, rowHeight);
    });

    this.summaryText = this.add
      .text(cx, 832, '', textStyle({ size: 17, color: INK_DIM }))
      .setOrigin(0.5)
      .setAlign('center')
      .setLineSpacing(6);

    createButton(this, cx - 92, 900, {
      width: 168,
      height: 66,
      label: '回主畫面',
      fontSize: 24,
      onClick: () => this.scene.start('Title'),
    });
    createButton(this, cx + 92, 900, {
      width: 168,
      height: 66,
      label: '開始挑戰',
      fontSize: 24,
      strokeColor: 0x6f8b7a,
      onClick: () => this.scene.start(save.player.sectId === null ? 'Sect' : 'Run'),
    });

    this.refresh();
  }

  private buildRow(track: UpgradeTrack, cx: number, cy: number, height: number): void {
    const width = GAME_WIDTH - 40;
    const left = cx - width / 2 + 20;
    const top = cy - height / 2;
    // 右側留給購買按鈕，文字寬度要扣掉。
    const textWidth = width - 176;

    this.add.rectangle(cx, cy, width, height, BG_PANEL, 0.9).setStrokeStyle(2, LINE);
    this.add.text(left, top + 10, track.name, textStyle({ size: 26, color: INK, bold: true }));
    const level = this.add.text(left + 146, top + 16, '', textStyle({ size: 19, color: JADE }));
    this.add
      .text(left, top + 48, wrapText(track.desc, textWidth, 16), textStyle({ size: 16, color: INK_DIM }))
      .setLineSpacing(3);
    const effect = this.add.text(left, top + 92, '', textStyle({ size: 18, color: INK }));

    const button = createButton(this, cx + width / 2 - 76, cy, {
      width: 128,
      height: 62,
      label: '',
      fontSize: 20,
      onClick: () => this.purchase(track),
    });

    this.rows.push({ track, level, effect, button });
  }

  private purchase(track: UpgradeTrack): void {
    const save = state();
    const result = buyUpgrade(save, track.id);
    if (!result.ok) {
      // 金幣不足時給一次紅色閃爍，不用彈窗打斷。
      this.goldText.setColor(DANGER);
      this.time.delayedCall(260, () => this.goldText.setColor(GOLD));
      return;
    }
    persist();
    this.refresh();
  }

  private refresh(): void {
    const save = state();
    const gold = save.player.wallet.gold;
    this.goldText.setText(`金幣 ${formatNumber(gold)}`);

    for (const row of this.rows) {
      const levelValue = save.player.upgrades[row.track.id] ?? 0;
      const cost = upgradeCost(row.track, levelValue);
      const current = upgradeAmount(row.track, levelValue);
      const next = upgradeAmount(row.track, levelValue + 1);

      row.level.setText(`Lv.${levelValue}/${row.track.maxLevel}`);
      row.effect.setText(
        cost === null
          ? `目前 +${current}${row.track.unit}（已滿級）`
          : `目前 +${current}${row.track.unit} → +${next}${row.track.unit}`,
      );

      if (cost === null) {
        row.button.setLabel('已滿級');
        row.button.setEnabled(false);
      } else {
        row.button.setLabel(`${formatNumber(cost)} 金`);
        row.button.setEnabled(gold >= cost);
      }
    }

    this.summaryText.setText(this.summary());
  }

  /** 讓玩家看得到升級實際反映在下一關的乘區上。 */
  private summary(): string {
    const save = state();
    const sect = sectById(save.player.sectId);
    if (sect === null) return '尚未拜入門派，先選門派再來提升屬性';
    const l = buildLoadout(save, save.world.stage);
    const x = (value: number): string => `×${value.toFixed(2)}`;
    return [
      `${sect.name}　下一關山門 ${l.disciples}　陣位 ${l.fieldSlots} 格`,
      `法寶傷害 ${x(l.damageMultiplier)}　出手 ${x(l.fireRateMultiplier)}　抽符 ${x(l.drawSpeedMultiplier)}`,
      `金幣 ${x(l.goldMultiplier)}　法寶階數上限 ${maxTierForStage(save.world.stage)} 階`,
    ].join('\n');
  }
}
