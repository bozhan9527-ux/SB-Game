import Phaser from 'phaser';
import { audio } from '../audio';
import { GAME_WIDTH } from '../config';
import { addGold, recordClear, recordDefeat } from '../save';
import { claimAchievements } from '../systems/achievements';
import { persist, state } from '../state';
import { realmForStage, realmIndexForStage, realmTitle } from '../systems/realms';
import { createButton } from '../ui/button';
import { drawBackdrop } from '../ui/backdrop';
import { BG_PANEL, DANGER, GOLD, INK, INK_DIM, JADE, LINE, formatNumber, hexToNumber, textStyle, wrapText } from '../ui/theme';
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
    // 先更新長期統計，再推進關卡，最後才結算成就——成就要看得到這一場的成果。
    const stats = save.player.stats;
    stats.maxCrowd = Math.max(stats.maxCrowd, result.peakDisciples);
    stats.maxArms = Math.max(stats.maxArms, result.arms);
    if (result.victory && result.bossMs > 0) {
      stats.fastestBossMs =
        stats.fastestBossMs === 0 ? result.bossMs : Math.min(stats.fastestBossMs, result.bossMs);
    }
    if (result.victory) recordClear(save, result.goldCollected + result.goldReward);
    else recordDefeat(save, result.goldCollected + result.goldReward);

    const unlocked = claimAchievements(save);
    for (const item of unlocked) addGold(save, item.reward);
    persist();
    const afterRealm = realmForStage(save.world.stage);
    const breakthrough = result.victory && afterRealm.id !== beforeRealm.id;

    const cx = GAME_WIDTH / 2;
    audio.playMusic(realmIndexForStage(save.world.stage));
    drawBackdrop(this, afterRealm.color, afterRealm.scenery);

    this.add
      .text(cx, 168, result.victory ? '通　關' : '道　消', textStyle({ size: 64, color: result.victory ? JADE : DANGER, bold: true }))
      .setOrigin(0.5);

    this.add
      .text(cx, 226, wrapText(this.headline(result), GAME_WIDTH - 80, 22), textStyle({ size: 22, color: INK_DIM }))
      .setOrigin(0.5)
      .setAlign('center');

    // 失敗診斷：告訴玩家這場輸在哪、下次該補什麼，而不是只丟一句「道消」。
    if (result.diagnosis !== null) {
      this.add
        .text(cx, 286, wrapText(result.diagnosis, GAME_WIDTH - 90, 19), textStyle({ size: 19, color: GOLD }))
        .setOrigin(0.5)
        .setAlign('center')
        .setLineSpacing(6);
    }

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

    this.buildPanel(cx, breakthrough ? 520 : 480, result, save.player.wallet.gold);

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

    if (unlocked.length > 0) this.showAchievements(unlocked);
  }

  /** 達成成就時蓋一層提示，逐條浮現後淡出。 */
  private showAchievements(unlocked: readonly { name: string; desc: string; reward: number }[]): void {
    const cx = GAME_WIDTH / 2;
    unlocked.forEach((item, index) => {
      const y = 130 + index * 64;
      const panel = this.add
        .rectangle(cx, y, GAME_WIDTH - 80, 56, BG_PANEL, 0.96)
        .setStrokeStyle(2, hexToNumber(GOLD))
        .setDepth(90)
        .setAlpha(0);
      const label = this.add
        .text(cx, y - 10, `成就達成　${item.name}`, textStyle({ size: 21, color: GOLD, bold: true }))
        .setOrigin(0.5)
        .setDepth(91)
        .setAlpha(0);
      const sub = this.add
        .text(cx, y + 14, `${item.desc}　獎勵 ${formatNumber(item.reward)} 金`, textStyle({ size: 16, color: INK_DIM }))
        .setOrigin(0.5)
        .setDepth(91)
        .setAlpha(0);
      this.tweens.add({
        targets: [panel, label, sub],
        alpha: 1,
        duration: 260,
        delay: 200 + index * 240,
        hold: 2200,
        yoyo: true,
      });
    });
  }

  private headline(result: RunResultData): string {
    if (result.victory) return `斬殺 ${result.bossName}，殘部 ${formatNumber(result.survivors)} 人`;
    if (result.defeatReason === 'abandon') return '半途收兵，來日再戰';
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
