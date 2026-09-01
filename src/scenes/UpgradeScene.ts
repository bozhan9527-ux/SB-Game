import Phaser from 'phaser';
import { GAME_WIDTH } from '../config';
import { BALANCE, UPGRADES } from '../data';
import type { SectUpgradeTrack, UpgradeTrack } from '../data/types';
import { buyUpgrade } from '../save';
import { persist, state } from '../state';
import { buildLoadout, sectById } from '../systems/loadout';
import { cardDef, maxTierForStage } from '../systems/deck';
import { upgradeAmount, upgradeCost } from '../systems/upgrades';
import {
  buySectUpgrade,
  sectTrackFor,
  sectUpgradeAmount,
  sectUpgradeCost,
  sectUpgradeLevel,
  sectUpgradeUnlocked,
} from '../systems/sect-upgrades';
import type { Button } from '../ui/button';
import { createButton } from '../ui/button';
import { drawBackdrop } from '../ui/backdrop';
import { BG_PANEL, DANGER, GOLD, INK, INK_DIM, JADE, LINE, fitText, formatNumber, hexToNumber, textStyle } from '../ui/theme';
import { realmForStage } from '../systems/realms';
import { fadeIn, fadeToScene } from '../ui/transition';

interface Row {
  track: UpgradeTrack;
  level: Phaser.GameObjects.Text;
  effect: Phaser.GameObjects.Text;
  button: Button;
}

/** 門派秘傳那一列。沒有門派時整列不畫，所以是 null。 */
interface SectRow {
  track: SectUpgradeTrack;
  level: Phaser.GameObjects.Text;
  effect: Phaser.GameObjects.Text;
  button: Button;
}

/** 洞府：用金幣提升山門耐久 / 出手速度 / 法寶傷害 / 抽符速度 / 金幣收益 / 陣位數。 */
export class UpgradeScene extends Phaser.Scene {
  private rows: Row[] = [];
  private sectRow: SectRow | null = null;
  private goldText!: Phaser.GameObjects.Text;
  private summaryText!: Phaser.GameObjects.Text;

  constructor() {
    super('Upgrade');
  }

  create(): void {
    fadeIn(this);
    const save = state();
    this.rows = [];
    this.sectRow = null;
    const realm = realmForStage(save.world.stage);
    drawBackdrop(this, realm.color, realm.scenery);

    const cx = GAME_WIDTH / 2;
    this.add.text(cx, 56, '洞府', textStyle({ size: 42, color: INK, bold: true })).setOrigin(0.5);
    this.goldText = this.add.text(cx, 104, '', textStyle({ size: 26, color: GOLD })).setOrigin(0.5);

    // 六條線 + 摘要 + 兩顆按鈕要塞進 960，因此列高與間距是算過的：
    // 140 起、每列 96 高、間距 8，最後一列底緣落在 756，剛好把 770 以下讓給摘要與按鈕。
    const rowHeight = 96;
    const rowGap = 8;
    const top = 140;
    UPGRADES.forEach((track, index) => {
      this.buildRow(track, cx, top + index * (rowHeight + rowGap) + rowHeight / 2, rowHeight);
    });

    // 門派秘傳排在五條線**下面**，而且只有一列：它是另一個層級的東西——
    // 上面五條有終點，這一條沒有；上面五條人人一樣，這一條看你拜在哪一派。
    this.buildSectRow(cx, top + UPGRADES.length * (rowHeight + rowGap) + 46, 92);

    this.summaryText = this.add
      .text(cx, 816, '', textStyle({ size: 16, color: INK_DIM }))
      .setOrigin(0.5)
      .setAlign('center')
      .setLineSpacing(6);

    createButton(this, cx - 92, 900, {
      width: 168,
      height: 66,
      label: '回主畫面',
      fontSize: 24,
      onClick: () => fadeToScene(this, 'Title'),
    });
    createButton(this, cx + 92, 900, {
      width: 168,
      height: 66,
      label: '開始挑戰',
      fontSize: 24,
      strokeColor: 0x6f8b7a,
      onClick: () => fadeToScene(this, save.player.sectId === null ? 'Sect' : 'Run'),
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
    this.add.text(left, top + 8, track.name, textStyle({ size: 25, color: INK, bold: true }));
    const level = this.add.text(left + 140, top + 14, '', textStyle({ size: 17, color: JADE }));
    // 說明固定一行：列高只有 96，換行會把下面的效果數字擠出面板。
    // 資料裡的說明都寫得夠短，這裡再用 fitText 當保險。
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

  /**
   * 門派秘傳那一列。
   *
   * 用門派色描邊，不用和上面五條一樣的灰線：它要一眼看出是不同的東西。
   * 沒拜門派、或還沒推到飛升境時仍然畫出來——看得到但買不動，
   * 才知道後面還有東西等著；整列藏起來的話玩家根本不知道它存在。
   */
  private buildSectRow(cx: number, cy: number, height: number): void {
    const save = state();
    const sect = sectById(save.player.sectId);
    const track = sectTrackFor(save.player.sectId);
    const width = GAME_WIDTH - 40;
    const left = cx - width / 2 + 20;
    const top = cy - height / 2;
    const accent = sect === null ? INK_DIM : sect.color;

    this.add
      .rectangle(cx, cy, width, height, BG_PANEL, 0.9)
      .setStrokeStyle(2, hexToNumber(accent));

    if (sect === null || track === null) {
      this.add
        .text(cx, cy, '門派秘傳　拜入門派之後開啟', textStyle({ size: 20, color: INK_DIM }))
        .setOrigin(0.5);
      return;
    }

    this.add.text(left, top + 6, track.name, textStyle({ size: 25, color: accent, bold: true }));
    this.add
      .text(left + 140, top + 12, `${sect.name} 秘傳`, textStyle({ size: 15, color: INK_DIM }));
    const level = this.add.text(left + 260, top + 12, '', textStyle({ size: 17, color: JADE }));
    const desc = this.add.text(left, top + 40, track.desc, textStyle({ size: 15, color: INK_DIM }));
    fitText(desc, width - 176);
    const effect = this.add.text(left, top + 64, '', textStyle({ size: 17, color: INK }));

    const button = createButton(this, cx + width / 2 - 76, cy, {
      width: 128,
      height: 58,
      label: '',
      fontSize: 20,
      strokeColor: hexToNumber(accent),
      textColor: accent,
      onClick: () => this.purchaseSect(),
    });

    this.sectRow = { track, level, effect, button };
  }

  private purchaseSect(): void {
    const save = state();
    if (!buySectUpgrade(save).ok) {
      this.goldText.setColor(DANGER);
      this.time.delayedCall(260, () => this.goldText.setColor(GOLD));
      return;
    }
    persist();
    this.refresh();
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
      // 後期等級的百分比會變成四位數，超寬就等比縮小而不是壓到按鈕上。
      row.effect.setScale(1);
      fitText(row.effect, GAME_WIDTH - 40 - 176);

      if (cost === null) {
        row.button.setLabel('已滿級');
        row.button.setEnabled(false);
      } else {
        row.button.setLabel(`${formatNumber(cost)} 金`);
        row.button.setEnabled(gold >= cost);
      }
    }

    const sectRow = this.sectRow;
    if (sectRow !== null) {
      const level = sectUpgradeLevel(save);
      const cost = sectUpgradeCost(sectRow.track, level);
      const current = sectUpgradeAmount(sectRow.track, level);
      const next = sectUpgradeAmount(sectRow.track, level + 1);
      const open = sectUpgradeUnlocked(save);

      // 沒有上限，所以不寫 /maxLevel——寫出來反而像是還有一個終點。
      sectRow.level.setText(`Lv.${level}`);
      sectRow.effect.setScale(1);
      sectRow.effect.setText(
        open
          ? `目前 +${current}${sectRow.track.unit} → +${next}${sectRow.track.unit}（無上限）`
          : `推到第 ${BALANCE.rebirth.minStage} 關（飛升境）之後開啟`,
      );
      fitText(sectRow.effect, GAME_WIDTH - 40 - 176);
      sectRow.button.setLabel(open ? `${formatNumber(cost)} 金` : '未開啟');
      sectRow.button.setEnabled(open && gold >= cost);
    }

    this.summaryText.setScale(1);
    this.summaryText.setText(this.summary());
    fitText(this.summaryText, GAME_WIDTH - 32);
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
      `金幣 ${x(l.goldMultiplier)}　法寶階數上限 ${maxTierForStage(save.world.stage, l.tierBonus)} 階`,
      // 秘傳加的東西有兩種在上面三行看不到（首領傷害、專精符），所以只要買過就補一行。
      ...(sectUpgradeLevel(save) > 0
        ? [
            `秘傳　首領傷害 ${x(l.bossDamageMultiplier)}　${cardDef(sect.favoredCard).name} ${x(
              sect.favoredDamageMultiplier + l.favoredDamageBonus,
            )}`,
          ]
        : []),
    ].join('\n');
  }
}
