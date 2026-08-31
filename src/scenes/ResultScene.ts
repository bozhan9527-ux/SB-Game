import Phaser from 'phaser';
import { audio } from '../audio';
import { GAME_HEIGHT, GAME_WIDTH } from '../config';
import { CARDS } from '../data';
import { addGold, recordClear, recordDefeat, recordDungeonRun } from '../save';
import { dungeonById, grantFloor, nextFloor } from '../systems/dungeons';
import { claimAchievements } from '../systems/achievements';
import { track } from '../telemetry';
import { cloudEnabled } from '../net/client';
import { MAX_NAME_LENGTH } from '../net/protocol';
import { percentileLine, refreshDistribution, submitRun } from '../systems/leaderboard';
import { updateRecords } from '../systems/records';
import type { RunTelemetry } from '../systems/defense';
import {
  averageDps,
  averageFormationBonus,
  damageShares,
  dpsCurve,
} from '../systems/telemetry';
import { persist, state } from '../state';
import { realmForStage, realmIndexForStage, realmTitle } from '../systems/realms';
import { createButton } from '../ui/button';
import { drawBackdrop } from '../ui/backdrop';
import { BG_PANEL, DANGER, GOLD, INK, INK_DIM, JADE, LINE, fitText, formatNumber, hexToNumber, textStyle, wrapText } from '../ui/theme';
import type { RunResultData } from './types';
import { fadeIn, fadeToScene } from '../ui/transition';

/** 結算畫面：發金幣、推進關卡、顯示是否突破境界。 */
export class ResultScene extends Phaser.Scene {
  private result!: RunResultData;
  private report: Phaser.GameObjects.Container | null = null;
  private cloudLine: Phaser.GameObjects.Text | undefined;
  /** 這一層發了什麼。空陣列代表不是副本、或是沒過。 */
  private dungeonRewards: string[] = [];

  constructor() {
    super('Result');
  }

  init(data: RunResultData): void {
    this.result = data;
    this.dungeonRewards = [];
    // Phaser 會重用 Scene 實例：上一場的戰報面板已經被銷毀，不清成 null 就會拿到空殼。
    this.report = null;
    this.cloudLine = undefined;
  }

  create(): void {
    fadeIn(this);
    const save = state();
    const result = this.result;

    // 存檔變更集中在此：通關才推進關卡，失敗只給安慰獎。
    const beforeRealm = realmForStage(save.world.stage);
    // 先更新長期統計，再推進關卡，最後才結算成就——成就要看得到這一場的成果。
    const stats = save.player.stats;
    stats.maxTier = Math.max(stats.maxTier, result.peakTier);
    stats.totalKills += result.kills;
    if (result.victory && result.leaks === 0) stats.perfectClears += 1;
    const gold = result.goldCollected + result.goldReward;
    const dungeon = result.dungeon === null ? null : dungeonById(result.dungeon.id);
    // 副本的一場走另一條記帳：給錢、算次數，但不動主線進度。
    if (result.dungeon !== null) recordDungeonRun(save, gold);
    else if (result.victory) recordClear(save, gold);
    else recordDefeat(save, gold);

    // 副本的回報在通關時才發，而且發放與顯示走同一份資料——
    // 兩邊各算一次的話，遲早會出現「畫面說給了、存檔裡沒有」。
    this.dungeonRewards =
      result.victory && dungeon !== null && result.dungeon !== null
        ? grantFloor(save, dungeon, result.dungeon.floor).lines
        : [];


    const beaten = updateRecords(save, {
      victory: result.victory,
      stage: result.stage,
      kills: result.kills,
      dps: averageDps(result.telemetry, result.elapsedMs),
      formationBonus: averageFormationBonus(result.telemetry),
      elapsedMs: result.elapsedMs,
      challengeCount: result.dungeon === null ? 0 : 1,
    });
    // 流失漏斗與難度曲線都靠這一個事件。stage 報的是剛剛打的那一關，
    // 不是存檔已經推進到的下一關。
    track('stage_end', {
      stage: result.stage,
      victory: result.victory,
      reason: result.defeatReason,
      duration_ms: Math.round(result.elapsedMs),
      leaks: result.leaks,
      kills: result.kills,
      peak_tier: result.peakTier,
      merges: result.merges,
      boss_killed: result.bossKilled,
      dps: Math.round(averageDps(result.telemetry, result.elapsedMs)),
      formation_bonus: Number(averageFormationBonus(result.telemetry).toFixed(3)),
    });

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
        .text(cx, 286, wrapText(result.diagnosis, GAME_WIDTH - 52, 19), textStyle({ size: 19, color: GOLD }))
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

    const panelBottom = this.buildPanel(cx, breakthrough ? 520 : 480, result, save.player.wallet.gold);

    // 破紀錄與試煉達成合成一行，寫在結算表**下面**。
    //
    // 它們不是統計，是「這一場最值得說嘴的地方」，所以不進表格；
    // 但也不能各佔一行——突破境界那一場表格會往下長四十像素，
    // 兩行就會直接撞上「下一關」。合成一行再用 fitText 縮，任何組合都放得下。
    const highlights = [
      // 副本的回報排在最前面：那是玩家進來的理由，而破紀錄只是順帶。
      ...this.dungeonRewards,
      ...beaten.map((item) => `${item.label} ${item.text}`),
    ];
    if (highlights.length > 0) {
      const line = this.add
        .text(cx, panelBottom + 18, highlights.join('　'), textStyle({ size: 16, color: JADE, bold: true }))
        .setOrigin(0.5);
      fitText(line, GAME_WIDTH - 40);
    }

    // 副本的一場不推進主線，所以這裡要講的是「這個副本接下來是第幾層」，
    // 而不是「下一關是第幾關」——後者在副本裡是一個和剛剛那一場無關的數字。
    const upcoming = dungeon === null ? null : nextFloor(save, dungeon);
    this.add
      .text(
        cx,
        724,
        dungeon === null
          ? `下一關：第 ${save.world.stage} 關 · ${realmTitle(save.world.stage)}`
          : upcoming === null
            ? `${dungeon.name} 已全部通過`
            : `${dungeon.name} 第 ${upcoming} 層`,
        textStyle({ size: 20, color: INK }),
      )
      .setOrigin(0.5);

    createButton(this, cx, 784, {
      width: 340,
      height: 66,
      label:
        dungeon === null
          ? (result.victory ? '繼續挑戰' : '再戰一次')
          : upcoming === null
            ? '回副本'
            : `進第 ${upcoming} 層`,
      fontSize: 28,
      strokeColor: 0x6f8b7a,
      onClick: () => {
        if (dungeon === null) {
          fadeToScene(this, 'Run');
          return;
        }
        if (upcoming === null) {
          fadeToScene(this, 'Dungeon');
          return;
        }
        fadeToScene(this, 'Run', { dungeonId: dungeon.id, floor: upcoming });
      },
    });
    createButton(this, cx, 856, {
      width: 340,
      height: 62,
      label: '洞府 · 提升屬性',
      fontSize: 24,
      onClick: () => fadeToScene(this, 'Upgrade'),
    });
    createButton(this, cx - 92, 926, {
      width: 156,
      height: 52,
      label: '回主畫面',
      fontSize: 20,
      onClick: () => fadeToScene(this, 'Title'),
    });
    // 戰報放在一層蓋上去的面板裡，不是塞進結算表。
    // 結算表要在兩秒內讀完（守下來沒、拿多少錢、下一關是誰），戰報是給想深究的人看的，
    // 兩者混在同一頁只會讓前者變慢。
    createButton(this, cx + 92, 926, {
      width: 156,
      height: 52,
      label: '戰報',
      fontSize: 20,
      onClick: () => this.showReport(),
    });

    // 上榜與百分位都在背景做：玩家剛通關，正在看結算表，
    // 此時跳一個「連不上伺服器」只是掃興。成功才寫一行上去。
    this.cloudLine = this.add
      .text(cx, panelBottom + 42, '', textStyle({ size: 16, color: INK_DIM }))
      .setOrigin(0.5);
    void this.syncLeaderboard(result);

    if (unlocked.length > 0) this.showAchievements(unlocked);
  }

  /**
   * 送出成績並更新百分位。
   *
   * 順序是「先送分、再抓分布」：剛通關的這一筆要先進到母體裡，
   * 算出來的百分位才包含自己，不然玩家會看到一個比實際低的數字。
   */
  private async syncLeaderboard(result: RunResultData): Promise<void> {
    if (!cloudEnabled()) return;
    const save = state();

    if (result.victory && result.submission !== null) {
      // 第一次上榜才問名字。每次都問很煩，而且他多半只想看結算表。
      if (save.player.name.length === 0) {
        const typed = window.prompt('上榜要用什麼名字？（之後可以在「存檔」改）', '無名修士');
        if (typed !== null) {
          save.player.name = typed.slice(0, MAX_NAME_LENGTH);
          persist();
        }
      }
      const outcome = await submitRun(save, result.stage, result.submission);
      if (outcome.kind === 'ok') {
        persist();
        this.cloudLine?.setText(`榜上第 ${outcome.rank} 名${outcome.best ? '（新猷）' : ''}`).setColor(GOLD);
      } else if (outcome.kind === 'failed') {
        this.cloudLine?.setText(outcome.reason).setColor(INK_DIM);
      }
    }

    if (await refreshDistribution(save, Date.now())) persist();
    const line = percentileLine(save, result.stage);
    // 百分位比名次更值得佔那一行：名次只有前幾名的人在乎，百分位人人都有。
    if (line !== null && result.victory) this.cloudLine?.setText(line).setColor(JADE);
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

  /** 回傳面板底緣的 y，讓上層知道下一行可以從哪裡開始寫。 */
  private buildPanel(cx: number, cy: number, result: RunResultData, totalGold: number): number {
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
    return cy + height / 2;
  }

  /**
   * 戰報：這一場「為什麼」是這個結果。
   *
   * 三件事，都是重度玩家實際會拿來做決定的：
   * 哪張符真的在輸出（決定下次帶哪四張）、陣法整場平均加了多少
   * （決定值不值得花時間排）、以及輸出曲線（看得出是前期就崩還是關底才卡）。
   * 這些數字 tickCombat 本來就算過，只是以前沒有人收。
   */
  private showReport(): void {
    if (this.report !== null) {
      this.report.setVisible(true);
      return;
    }
    const cx = GAME_WIDTH / 2;
    const result = this.result;
    const telemetry = result.telemetry;
    const parts: Phaser.GameObjects.GameObject[] = [];

    parts.push(
      // 幾乎不透明：戰報是一張要逐行讀的表，底下的結算數字透上來會直接讓它讀不動。
      // setInteractive 用來吃掉輸入，否則會點到底下的按鈕。
      this.add.rectangle(cx, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x0b0f14, 0.985).setInteractive(),
    );
    parts.push(
      this.add.text(cx, 70, '戰　報', textStyle({ size: 38, color: GOLD, bold: true })).setOrigin(0.5),
    );
    parts.push(
      this.add
        .text(
          cx,
          112,
          `第 ${result.stage} 關　共 ${(result.elapsedMs / 1000).toFixed(0)} 秒　` +
            `平均每秒 ${formatNumber(averageDps(telemetry, result.elapsedMs))}`,
          textStyle({ size: 17, color: INK_DIM }),
        )
        .setOrigin(0.5),
    );

    parts.push(...this.buildDamageBars(cx, 150, telemetry));
    parts.push(...this.buildFormationLine(cx, 470, telemetry));
    parts.push(...this.buildCurve(cx, 540, telemetry));

    const close = createButton(this, cx, 880, {
      width: 300,
      height: 64,
      label: '關閉',
      fontSize: 24,
      onClick: () => this.report?.setVisible(false),
    });
    parts.push(close.container);

    // 要壓過成就浮窗（depth 90／91），否則跨境界那一場的戰報會被蓋掉一角。
    this.report = this.add.container(0, 0, parts).setDepth(200);
  }

  /** 各符種的傷害貢獻，由多到少的橫條。 */
  private buildDamageBars(
    cx: number,
    top: number,
    telemetry: RunTelemetry,
  ): Phaser.GameObjects.GameObject[] {
    const parts: Phaser.GameObjects.GameObject[] = [];
    const width = GAME_WIDTH - 72;
    const left = cx - width / 2;
    const shares = damageShares(telemetry);

    parts.push(
      this.add.text(left, top, '符籙貢獻', textStyle({ size: 20, color: INK, bold: true })),
    );
    if (shares.length === 0) {
      parts.push(
        this.add.text(left, top + 34, '這一場一發都沒打出去', textStyle({ size: 17, color: INK_DIM })),
      );
      return parts;
    }

    const best = shares[0]?.damage ?? 1;
    shares.forEach((entry, index) => {
      const y = top + 40 + index * 54;
      const def = CARDS.find((card) => card.id === entry.type);
      const color = def?.color ?? INK;
      parts.push(
        this.add.text(left, y, def?.name ?? entry.type, textStyle({ size: 18, color, bold: true })),
      );
      parts.push(
        this.add
          .text(
            left + width,
            y,
            `${formatNumber(entry.damage)}　${Math.round(entry.share * 100)}%`,
            textStyle({ size: 17, color: INK_DIM }),
          )
          .setOrigin(1, 0),
      );
      // 條長按「相對第一名」而不是「佔總量」：後者在四張符平均出力時全部擠成一團短棒，
      // 前者一眼就看得出第二名差第一名多少——那才是換牌時要判斷的事。
      parts.push(this.add.rectangle(left, y + 30, width, 10, LINE, 0.35).setOrigin(0, 0.5));
      parts.push(
        this.add
          .rectangle(left, y + 30, Math.max(2, width * (entry.damage / best)), 10, hexToNumber(color), 0.95)
          .setOrigin(0, 0.5),
      );
    });
    return parts;
  }

  private buildFormationLine(
    cx: number,
    top: number,
    telemetry: RunTelemetry,
  ): Phaser.GameObjects.GameObject[] {
    const width = GAME_WIDTH - 72;
    const left = cx - width / 2;
    const bonus = averageFormationBonus(telemetry);
    return [
      this.add.text(left, top, '陣法', textStyle({ size: 20, color: INK, bold: true })),
      this.add.text(
        left,
        top + 30,
        `整場平均 +${Math.round(bonus * 100)}%　最多同時 ${telemetry.peakFormationLines} 條`,
        textStyle({ size: 18, color: bonus > 0 ? JADE : INK_DIM }),
      ),
    ];
  }

  /** 輸出曲線。看得出是一開始就打不動，還是撐到關底才卡住。 */
  private buildCurve(
    cx: number,
    top: number,
    telemetry: RunTelemetry,
  ): Phaser.GameObjects.GameObject[] {
    const width = GAME_WIDTH - 72;
    const height = 190;
    const left = cx - width / 2;
    const parts: Phaser.GameObjects.GameObject[] = [
      this.add.text(left, top, '輸出曲線', textStyle({ size: 20, color: INK, bold: true })),
    ];

    const curve = dpsCurve(telemetry);
    const peak = curve.reduce((max, value) => Math.max(max, value), 0);
    const chartTop = top + 34;
    parts.push(
      this.add.rectangle(cx, chartTop + height / 2, width, height, BG_PANEL, 0.7).setStrokeStyle(2, LINE),
    );
    if (curve.length < 2 || peak <= 0) {
      parts.push(
        this.add
          .text(cx, chartTop + height / 2, '資料不足', textStyle({ size: 17, color: INK_DIM }))
          .setOrigin(0.5),
      );
      return parts;
    }

    const g = this.add.graphics();
    const xAt = (i: number): number => left + (width * i) / (curve.length - 1);
    const yAt = (v: number): number => chartTop + height - (height - 16) * (v / peak) - 8;
    g.fillStyle(hexToNumber(GOLD), 0.16);
    g.beginPath();
    g.moveTo(left, chartTop + height);
    for (let i = 0; i < curve.length; i += 1) g.lineTo(xAt(i), yAt(curve[i] ?? 0));
    g.lineTo(left + width, chartTop + height);
    g.closePath();
    g.fillPath();
    g.lineStyle(2, hexToNumber(GOLD), 0.95);
    g.beginPath();
    g.moveTo(xAt(0), yAt(curve[0] ?? 0));
    for (let i = 1; i < curve.length; i += 1) g.lineTo(xAt(i), yAt(curve[i] ?? 0));
    g.strokePath();
    parts.push(g);

    parts.push(
      this.add
        .text(left + 8, chartTop + 6, `峰值 ${formatNumber(peak)} / 秒`, textStyle({ size: 15, color: GOLD }))
        .setOrigin(0, 0),
    );
    parts.push(
      this.add
        .text(left + width - 8, chartTop + height - 6, '關底', textStyle({ size: 14, color: INK_DIM }))
        .setOrigin(1, 1),
    );
    parts.push(
      this.add.text(left + 8, chartTop + height - 6, '開場', textStyle({ size: 14, color: INK_DIM })).setOrigin(0, 1),
    );
    return parts;
  }
}
