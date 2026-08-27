import Phaser from 'phaser';
import { audio } from '../audio';
import { GAME_WIDTH } from '../config';
import { recordClear, recordDefeat } from '../save';
import { persist, state } from '../state';
import { realmForStage, realmIndexForStage, realmTitle } from '../systems/realms';
import { createButton } from '../ui/button';
import { drawBackdrop } from '../ui/backdrop';
import { BG_PANEL, DANGER, GOLD, INK, INK_DIM, JADE, LINE, formatNumber, textStyle, wrapText } from '../ui/theme';
import type { RunResultData } from './types';

/** 結算畫面：發金幣、推進關卡、顯示是否突破境界。 */
export class ResultScene extends Phaser.Scene {
  private result!: RunResultData;

  constructor() {
    super('Result');
  }

  init(data: RunResultData): void {
    this.result = data;
  }

  create(): void {
    const save = state();
    const result = this.result;

    // 存檔變更集中在此：通關才推進關卡，失敗只給安慰獎。
    const beforeRealm = realmForStage(save.world.stage);
    if (result.victory) recordClear(save, result.goldCollected + result.goldReward);
    else recordDefeat(save, result.goldCollected + result.goldReward);
    persist();
    const afterRealm = realmForStage(save.world.stage);
    const breakthrough = result.victory && afterRealm.id !== beforeRealm.id;

    const cx = GAME_WIDTH / 2;
    audio.playMusic(realmIndexForStage(save.world.stage));
    drawBackdrop(this, afterRealm.color);

    this.add
      .text(cx, 168, result.victory ? '通　關' : '道　消', textStyle({ size: 64, color: result.victory ? JADE : DANGER, bold: true }))
      .setOrigin(0.5);

    this.add
      .text(cx, 226, wrapText(this.headline(result), GAME_WIDTH - 80, 22), textStyle({ size: 22, color: INK_DIM }))
      .setOrigin(0.5)
      .setAlign('center');

    if (breakthrough) {
      audio.play('breakthrough');
      const banner = this.add
        .text(cx, 292, `突破！晉入 ${afterRealm.name}`, textStyle({ size: 34, color: afterRealm.color, bold: true }))
        .setOrigin(0.5);
      this.tweens.add({ targets: banner, scale: 1.08, duration: 700, yoyo: true, repeat: -1 });
      this.add
        .text(cx, 332, afterRealm.subtitle, textStyle({ size: 19, color: INK_DIM }))
        .setOrigin(0.5);
    }

    this.buildPanel(cx, breakthrough ? 500 : 452, result, save.player.wallet.gold);

    const nextStage = save.world.stage;
    this.add
      .text(cx, 690, `下一關：第 ${nextStage} 關 · ${realmTitle(nextStage)}`, textStyle({ size: 22, color: INK }))
      .setOrigin(0.5);

    createButton(this, cx, 770, {
      width: 340,
      height: 72,
      label: result.victory ? '繼續挑戰' : '再戰一次',
      fontSize: 28,
      strokeColor: 0x6f8b7a,
      onClick: () => this.scene.start('Run'),
    });
    createButton(this, cx, 856, {
      width: 340,
      height: 62,
      label: '洞府 · 提升屬性',
      fontSize: 24,
      onClick: () => this.scene.start('Upgrade'),
    });
    createButton(this, cx, 926, {
      width: 340,
      height: 52,
      label: '回主畫面',
      fontSize: 20,
      onClick: () => this.scene.start('Title'),
    });
  }

  private headline(result: RunResultData): string {
    if (result.victory) return `斬殺 ${result.bossName}，殘部 ${formatNumber(result.survivors)} 人`;
    if (result.defeatReason === 'route') return '尚未見到首領，門人已在半途折損殆盡';
    if (result.defeatReason === 'timeout') return `久攻不下，${result.bossName} 遁走，門人潰散`;
    return `門人盡歿於 ${result.bossName} 之手`;
  }

  private buildPanel(cx: number, cy: number, result: RunResultData, totalGold: number): void {
    const width = GAME_WIDTH - 64;
    const rows: [string, string, string][] = [
      ['剩餘弟子', formatNumber(result.survivors), INK],
      ['武裝值', formatNumber(result.arms), INK],
      ['途中拾取', `${formatNumber(result.goldCollected)} 金`, GOLD],
      [result.victory ? '通關獎勵' : '殘存所得', `${formatNumber(result.goldReward)} 金`, GOLD],
      ['金幣總計', formatNumber(totalGold), GOLD],
    ];
    const height = rows.length * 40 + 24;

    this.add.rectangle(cx, cy, width, height, BG_PANEL, 0.9).setStrokeStyle(2, LINE);
    rows.forEach((row, index) => {
      const y = cy - height / 2 + 32 + index * 40;
      this.add.text(cx - width / 2 + 24, y, row[0], textStyle({ size: 22, color: INK_DIM })).setOrigin(0, 0.5);
      this.add
        .text(cx + width / 2 - 24, y, row[1], textStyle({ size: 24, color: row[2], bold: true }))
        .setOrigin(1, 0.5);
    });
  }
}
