import Phaser from 'phaser';
import { audio } from '../audio';
import { GAME_WIDTH } from '../config';
import { addGold, recordClear, recordDefeat } from '../save';
import { claimAchievements } from '../systems/achievements';
import { persist, state } from '../state';
import { realmForStage, realmIndexForStage, realmTitle } from '../systems/realms';
import { createButton } from '../ui/button';
import { drawBackdrop } from '../ui/backdrop';
import { BG_PANEL, DANGER, GOLD, INK, INK_DIM, JADE, LINE, fitText, formatNumber, hexToNumber, textStyle, wrapText } from '../ui/theme';
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
    stats.maxTier = Math.max(stats.maxTier, result.peakTier);
    stats.totalKills += result.kills;
    if (result.victory && result.leaks === 0) stats.perfectClears += 1;
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

  /**
   * 達成成就時蓋一層提示。
   *
   * **一次只顯示一條、逐條輪播**，不是同時往下疊。一口氣解鎖五、六條在跨境界時很常見，
   * 疊起來會把整張結算表蓋掉——這正是玩家最想看清楚的畫面。
   * 位置固定在標題上方的空白帶，任何數量都不會蓋到下面的內容。
   */
  private showAchievements(unlocked: readonly { name: string; desc: string; reward: number }[]): void {
    const cx = GAME_WIDTH / 2;
    const y = 66;
    const panel = this.add
      .rectangle(cx, y, GAME_WIDTH - 60, 58, BG_PANEL, 0.96)
      .setStrokeStyle(2, hexToNumber(GOLD))
      .setDepth(90)
      .setAlpha(0);
    const label = this.add
      .text(cx, y - 11, '', textStyle({ size: 21, color: GOLD, bold: true }))
      .setOrigin(0.5)
      .setDepth(91)
      .setAlpha(0);
    const sub = this.add
      .text(cx, y + 14, '', textStyle({ size: 15, color: INK_DIM }))
      .setOrigin(0.5)
      .setDepth(91)
      .setAlpha(0);

    const showNext = (index: number): void => {
      const item = unlocked[index];
      if (item === undefined) {
        panel.destroy();
        label.destroy();
        sub.destroy();
        return;
      }
      // 多條時標上序號，玩家才知道還有幾條在後面，而不是以為只有最後那一條。
      const counter = unlocked.length > 1 ? `（${index + 1}/${unlocked.length}）` : '';
      label.setText(`成就達成　${item.name}${counter}`);
      sub.setText(`${item.desc}　獎勵 ${formatNumber(item.reward)} 金`);
      fitText(label, GAME_WIDTH - 80);
      fitText(sub, GAME_WIDTH - 80);
      this.tweens.add({
        targets: [panel, label, sub],
        alpha: 1,
        duration: 220,
        hold: unlocked.length > 3 ? 900 : 1500,
        yoyo: true,
        onComplete: () => {
          label.setScale(1);
          sub.setScale(1);
          showNext(index + 1);
        },
      });
    };

    this.time.delayedCall(300, () => showNext(0));
  }

  private headline(result: RunResultData): string {
    if (result.victory) {
      return result.leaks === 0
        ? `${result.bossName} 伏誅，一隻妖魔都沒能踏進山門`
        : `斬殺 ${result.bossName}，山門尚存 ${formatNumber(result.survivors)}`;
    }
    if (result.defeatReason === 'abandon') return '半途收兵，來日再戰';
    if (result.defeatReason === 'timeout') return `久攻不下，${result.bossName} 始終未死`;
    if (!result.bossKilled && result.bossFought) return `${result.bossName} 砸開了山門`;
    return `妖魔攻破山門，${formatNumber(result.leaks)} 隻踏了進來`;
  }

  private buildPanel(cx: number, cy: number, result: RunResultData, totalGold: number): void {
    const width = GAME_WIDTH - 64;
    const rows: [string, string, string][] = [
      ['山門殘存', `${formatNumber(result.survivors)} / ${formatNumber(result.maxDisciples)}`, INK],
      ['斬殺妖魔', `${formatNumber(result.kills)} 隻（漏 ${formatNumber(result.leaks)}）`, INK],
      ['關底首領', result.bossKilled ? '已斬' : result.bossFought ? '未斬' : '未見', result.bossKilled ? JADE : DANGER],
      ['最高法寶', `${result.peakTier} 階（合成 ${result.merges} 次）`, INK],
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
