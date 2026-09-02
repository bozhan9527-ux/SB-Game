import Phaser from "phaser";
import { audio } from "../audio";
import { GAME_HEIGHT, GAME_WIDTH } from "../config";
import { CARDS } from "../data";
import { recordClear, recordDefeat, recordDungeonRun } from "../save";
import { dungeonById, grantFloor, nextOpenFloor } from "../systems/dungeons";
import { detectAchievements } from "../systems/achievements";
import { track } from "../telemetry";
import { cloudEnabled } from "../net/client";
import { submitRun } from "../systems/leaderboard";
import { updateRecords } from "../systems/records";
import type { RunTelemetry } from "../systems/defense";
import {
  averageDps,
  averageFormationBonus,
  damageShares,
  dpsCurve,
} from "../systems/telemetry";
import { persist, state } from "../state";
import {
  realmForStage,
  realmIndexForStage,
  realmTitle,
} from "../systems/realms";
import { createButton } from "../ui/button";
import { drawBackdrop } from "../ui/backdrop";
import {
  BG_PANEL,
  DANGER,
  GOLD,
  INK,
  INK_DIM,
  JADE,
  LINE,
  fitText,
  formatNumber,
  hexToNumber,
  textStyle,
  wrapText,
} from "../ui/theme";
import type { RunResultData } from "./types";
import { fadeIn, fadeToScene } from "../ui/transition";

/** 結算畫面：發金幣、推進關卡、顯示是否突破境界。 */
export class ResultScene extends Phaser.Scene {
  private result!: RunResultData;
  private report: Phaser.GameObjects.Container | null = null;
  private cloudLine: Phaser.GameObjects.Text | undefined;
  /** 這一層發了什麼。空陣列代表不是副本、或是沒過。 */
  private dungeonRewards: string[] = [];

  constructor() {
    super("Result");
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
    const dungeon =
      result.dungeon === null ? null : dungeonById(result.dungeon.id);
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
    track("stage_end", {
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
      formation_bonus: Number(
        averageFormationBonus(result.telemetry).toFixed(3),
      ),
    });

    // 只判定達成，不入帳——獎勵要玩家自己到仙途錄領。
    const unlocked = detectAchievements(save);
    persist();
    const afterRealm = realmForStage(save.world.stage);
    const breakthrough = result.victory && afterRealm.id !== beforeRealm.id;

    const cx = GAME_WIDTH / 2;
    audio.playMusic(realmIndexForStage(save.world.stage));
    drawBackdrop(this, afterRealm.color, afterRealm.scenery);

    // 無限模式一定是打到守不住為止，victory 永遠是 false——
    // 但那不是失敗，那就是這個模式的結局。寫「道消」會把玩家最好的一場罵成輸，
    // 所以改寫深度，顏色也跟著換成金而不是血色。
    const endless = result.endlessCleared;
    const title =
      endless !== null ? "力　盡" : result.victory ? "通　關" : "道　消";
    const titleColor = endless !== null ? GOLD : result.victory ? JADE : DANGER;
    this.add
      .text(
        cx,
        168,
        title,
        textStyle({ size: 64, color: titleColor, bold: true }),
      )
      .setOrigin(0.5);

    this.add
      .text(
        cx,
        226,
        wrapText(this.headline(result), GAME_WIDTH - 80, 22),
        textStyle({ size: 22, color: INK_DIM }),
      )
      .setOrigin(0.5)
      .setAlign("center");

    // 失敗診斷：告訴玩家這場輸在哪、下次該補什麼，而不是只丟一句「道消」。
    if (result.diagnosis !== null) {
      this.add
        .text(
          cx,
          286,
          wrapText(result.diagnosis, GAME_WIDTH - 52, 19),
          textStyle({ size: 19, color: GOLD }),
        )
        .setOrigin(0.5)
        .setAlign("center")
        .setLineSpacing(6);
    }

    if (breakthrough) {
      audio.play("breakthrough");
      const banner = this.add
        .text(
          cx,
          292,
          `突破！晉入 ${afterRealm.name}`,
          textStyle({ size: 34, color: afterRealm.color, bold: true }),
        )
        .setOrigin(0.5);
      this.tweens.add({
        targets: banner,
        scale: 1.08,
        duration: 700,
        yoyo: true,
        repeat: -1,
      });
      this.add
        .text(
          cx,
          332,
          afterRealm.subtitle,
          textStyle({ size: 19, color: INK_DIM }),
        )
        .setOrigin(0.5);
    }

    const panelBottom = this.buildPanel(
      cx,
      breakthrough ? 520 : 480,
      result,
      save.player.wallet.gold,
    );

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
        .text(
          cx,
          panelBottom + 18,
          highlights.join("　"),
          textStyle({ size: 16, color: JADE, bold: true }),
        )
        .setOrigin(0.5);
      fitText(line, GAME_WIDTH - 40);
    }

    // 副本的一場不推進主線，所以這裡要講的是「這個副本接下來是第幾層」，
    // 而不是「下一關是第幾關」——後者在副本裡是一個和剛剛那一場無關的數字。
    // **下一層開了沒也要看。**
    //
    // 副本列表那一頁擋著（「推到第 45 關才開第 2 層」），但結算頁這一顆
    // 原本沒擋——於是打完問心崖第 1 層（第 8 關，門檻第 28 關）之後，
    // 按鈕會直接把還在第 40 關的人丟進門檻第 45 關的第 2 層。
    // 兩頁對同一件事給了兩種答案，而玩家會信在他手邊的那一顆。
    //
    // 沒開就當作「這個副本這一輪到此為止」：按鈕變成回副本列表，
    // 而那一頁會把「還差幾關」講清楚。
    const upcoming = dungeon === null ? null : nextOpenFloor(save, dungeon);
    this.add
      .text(
        cx,
        724,
        dungeon === null
          ? `下一關：第 ${save.world.stage} 關 · ${realmTitle(save.world.stage)}`
          : dungeon.endless
            ? `${dungeon.name} · 無限波次`
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
          ? result.victory
            ? "繼續挑戰"
            : "再戰一次"
          : dungeon.endless
            ? `再入${dungeon.name}`
            : upcoming === null
              ? "回副本"
              : `進第 ${upcoming} 層`,
      fontSize: 28,
      strokeColor: 0x6f8b7a,
      onClick: () => {
        if (dungeon === null) {
          fadeToScene(this, "Run");
          return;
        }
        if (upcoming === null) {
          fadeToScene(this, "Dungeon");
          return;
        }
        fadeToScene(this, "Run", { dungeonId: dungeon.id, floor: upcoming });
      },
    });
    createButton(this, cx, 856, {
      width: 340,
      height: 62,
      label: "洞府 · 提升屬性",
      fontSize: 24,
      onClick: () => fadeToScene(this, "Upgrade"),
    });
    createButton(this, cx - 92, 926, {
      width: 156,
      height: 52,
      label: "回主畫面",
      fontSize: 20,
      onClick: () => fadeToScene(this, "Title"),
    });
    // 戰報放在一層蓋上去的面板裡，不是塞進結算表。
    // 結算表要在兩秒內讀完（守下來沒、拿多少錢、下一關是誰），戰報是給想深究的人看的，
    // 兩者混在同一頁只會讓前者變慢。
    createButton(this, cx + 92, 926, {
      width: 156,
      height: 52,
      label: "戰報",
      fontSize: 20,
      onClick: () => this.showReport(),
    });

    // 上榜與百分位都在背景做：玩家剛通關，正在看結算表，
    // 此時跳一個「連不上伺服器」只是掃興。成功才寫一行上去。
    this.cloudLine = this.add
      .text(cx, panelBottom + 42, "", textStyle({ size: 16, color: INK_DIM }))
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

    // 上榜的結果與百分位**合成同一行**，不是先後蓋掉對方。
    //
    // 原本是「先寫榜上第 N 名，再用百分位覆蓋它」——於是上榜成功這件事
    // 只在畫面上閃過幾百毫秒，玩家的感受是「送出去了嗎？不知道」。
    // 兩者又都值得那一行：名次回答「成功了沒」，百分位回答「這個成績有多好」。
    let board: string | null = null;
    let ok = false;

    // **不要求 victory。** 競技場（和所有無限模式）一定是打到守不住為止，
    // victory 永遠是 false——用它當條件的話，那個榜一筆都收不到。
    // 該不該送已經在 RunScene 判完了（runIsRankable），這裡只看有沒有那一份。
    if (result.submission !== null) {
      // 送出要跑一趟網路，慢的時候有兩三秒。那段時間留白會被讀成「沒有這個功能」。
      this.cloudLine?.setText("上榜中…").setColor(INK_DIM);
      const outcome = await submitRun(save, result.submission);
      // 不論成敗都存一次：送出的過程可能順手把身分登記上去了（syncedAt），
      // 那一筆不存下來的話，下一場又會再登記一次。
      persist();
      if (outcome.kind === "ok") {
        ok = true;
        // 沒註冊的人現在也上得了榜，只是掛著一個系統給的名字。**提醒放在
        // 這裡而不是別的地方**：他剛看到自己的名次，那是他這一整局裡最想
        // 要一個名字的一刻。灰字寫在榜單頁的角落沒有人會看。
        const anon = save.player.account === null ? "　註冊可換成你的道號" : "";
        board = `已上榜 · 第 ${outcome.rank} 名${outcome.best ? "（新猷）" : ""}${anon}`;
      } else if (outcome.kind === "failed") {
        // **失敗一律說出來，不分關卡。**
        //
        // 這裡原本前五關安靜，理由是「那幾筆成績在榜上沒有意義」。
        // 速通改成一關一個榜之後那個理由就不成立了——第 1 關也有自己的榜。
        // 而它擋住的正好是新玩家最需要的那一句（「你的遊戲是舊版本」）：
        // 實測有人玩到第四關，每一場都被退回，畫面上一個字都沒有。
        //
        // 當初怕的是「一行看不懂的紅字讀起來像遊戲壞了」，那個顧慮的答案是
        // 把訊息寫成他做得到的一步，不是把訊息藏起來。
        board = outcome.reason;
      }
    }

    // 這裡原本還接一行百分位。拿掉的理由是它幾乎永遠算不出來：
    // 要榜上有二十個人才有意義，在那之前它只是一行不會變的字。
    if (board === null) {
      this.cloudLine?.setText("");
      return;
    }
    this.cloudLine
      ?.setText(board)
      // 上榜成功用金色。失敗不用紅色（那讀起來像遊戲壞了），但也不能用
      // 最暗的灰——那一行是他唯一的線索，被略過就等於沒寫。
      .setColor(ok ? GOLD : INK);
    if (this.cloudLine !== undefined) fitText(this.cloudLine, GAME_WIDTH - 40);
  }

  /**
   * 達成成就時蓋一層提示。
   *
   * **一次只顯示一條、逐條輪播**，不是同時往下疊。一口氣解鎖五、六條在跨境界時很常見，
   * 疊起來會把整張結算表蓋掉——這正是玩家最想看清楚的畫面。
   * 位置固定在標題上方的空白帶，任何數量都不會蓋到下面的內容。
   */
  private showAchievements(
    unlocked: readonly { name: string; desc: string; reward: number }[],
  ): void {
    const cx = GAME_WIDTH / 2;
    const y = 66;
    const panel = this.add
      .rectangle(cx, y, GAME_WIDTH - 60, 58, BG_PANEL, 0.96)
      .setStrokeStyle(2, hexToNumber(GOLD))
      .setDepth(90)
      .setAlpha(0);
    const label = this.add
      .text(cx, y - 11, "", textStyle({ size: 21, color: GOLD, bold: true }))
      .setOrigin(0.5)
      .setDepth(91)
      .setAlpha(0);
    const sub = this.add
      .text(cx, y + 14, "", textStyle({ size: 15, color: INK_DIM }))
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
      const counter =
        unlocked.length > 1 ? `（${index + 1}/${unlocked.length}）` : "";
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
    if (result.endlessCleared !== null) {
      return result.endlessCleared === 0
        ? `第 ${result.stage} 關就沒能守住，這一趟連一關都沒過`
        : `連下 ${result.endlessCleared} 關，止步於第 ${result.stage} 關`;
    }
    if (result.victory) {
      return result.leaks === 0
        ? `${result.bossName} 伏誅，一隻妖魔都沒能踏進山門`
        : `斬殺 ${result.bossName}，山門尚存 ${formatNumber(result.survivors)}`;
    }
    if (result.defeatReason === "abandon") return "半途收兵，來日再戰";
    if (result.defeatReason === "timeout")
      return `久攻不下，${result.bossName} 始終未死`;
    if (!result.bossKilled && result.bossFought)
      return `${result.bossName} 砸開了山門`;
    return `妖魔攻破山門，${formatNumber(result.leaks)} 隻踏了進來`;
  }

  /** 回傳面板底緣的 y，讓上層知道下一行可以從哪裡開始寫。 */
  private buildPanel(
    cx: number,
    cy: number,
    result: RunResultData,
    totalGold: number,
  ): number {
    const width = GAME_WIDTH - 64;
    const rows: [string, string, string][] = [
      [
        "山門殘存",
        `${formatNumber(result.survivors)} / ${formatNumber(result.maxDisciples)}`,
        INK,
      ],
      [
        "斬殺妖魔",
        `${formatNumber(result.kills)} 隻（漏 ${formatNumber(result.leaks)}）`,
        INK,
      ],
      [
        "關底首領",
        result.bossKilled ? "已斬" : result.bossFought ? "未斬" : "未見",
        result.bossKilled ? JADE : DANGER,
      ],
      ["最高法寶", `${result.peakTier} 階（合成 ${result.merges} 次）`, INK],
      ["途中拾取", `${formatNumber(result.goldCollected)} 金`, GOLD],
      [
        result.victory ? "通關獎勵" : "殘存所得",
        `${formatNumber(result.goldReward)} 金`,
        GOLD,
      ],
    ];
    // 無限模式的重點是深度，所以把它插在最上面——第一行就是這一趟的成績。
    if (result.endlessCleared !== null) {
      rows.unshift([
        "連下關數",
        `${formatNumber(result.endlessCleared)} 關`,
        JADE,
      ]);
    }
    rows.push(
      ...([["金幣總計", formatNumber(totalGold), GOLD]] as [
        string,
        string,
        string,
      ][]),
    );
    const height = rows.length * 40 + 24;

    this.add
      .rectangle(cx, cy, width, height, BG_PANEL, 0.9)
      .setStrokeStyle(2, LINE);
    rows.forEach((row, index) => {
      const y = cy - height / 2 + 32 + index * 40;
      this.add
        .text(
          cx - width / 2 + 24,
          y,
          row[0],
          textStyle({ size: 22, color: INK_DIM }),
        )
        .setOrigin(0, 0.5);
      this.add
        .text(
          cx + width / 2 - 24,
          y,
          row[1],
          textStyle({ size: 24, color: row[2], bold: true }),
        )
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
      this.add
        .rectangle(
          cx,
          GAME_HEIGHT / 2,
          GAME_WIDTH,
          GAME_HEIGHT,
          0x0b0f14,
          0.985,
        )
        .setInteractive(),
    );
    parts.push(
      this.add
        .text(
          cx,
          70,
          "戰　報",
          textStyle({ size: 38, color: GOLD, bold: true }),
        )
        .setOrigin(0.5),
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
      label: "關閉",
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
      this.add.text(
        left,
        top,
        "符籙貢獻",
        textStyle({ size: 20, color: INK, bold: true }),
      ),
    );
    if (shares.length === 0) {
      parts.push(
        this.add.text(
          left,
          top + 34,
          "這一場一發都沒打出去",
          textStyle({ size: 17, color: INK_DIM }),
        ),
      );
      return parts;
    }

    const best = shares[0]?.damage ?? 1;
    shares.forEach((entry, index) => {
      const y = top + 40 + index * 54;
      const def = CARDS.find((card) => card.id === entry.type);
      const color = def?.color ?? INK;
      parts.push(
        this.add.text(
          left,
          y,
          def?.name ?? entry.type,
          textStyle({ size: 18, color, bold: true }),
        ),
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
      parts.push(
        this.add
          .rectangle(left, y + 30, width, 10, LINE, 0.35)
          .setOrigin(0, 0.5),
      );
      parts.push(
        this.add
          .rectangle(
            left,
            y + 30,
            Math.max(2, width * (entry.damage / best)),
            10,
            hexToNumber(color),
            0.95,
          )
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
      this.add.text(
        left,
        top,
        "陣法",
        textStyle({ size: 20, color: INK, bold: true }),
      ),
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
      this.add.text(
        left,
        top,
        "輸出曲線",
        textStyle({ size: 20, color: INK, bold: true }),
      ),
    ];

    const curve = dpsCurve(telemetry);
    const peak = curve.reduce((max, value) => Math.max(max, value), 0);
    const chartTop = top + 34;
    parts.push(
      this.add
        .rectangle(cx, chartTop + height / 2, width, height, BG_PANEL, 0.7)
        .setStrokeStyle(2, LINE),
    );
    if (curve.length < 2 || peak <= 0) {
      parts.push(
        this.add
          .text(
            cx,
            chartTop + height / 2,
            "資料不足",
            textStyle({ size: 17, color: INK_DIM }),
          )
          .setOrigin(0.5),
      );
      return parts;
    }

    const g = this.add.graphics();
    const xAt = (i: number): number => left + (width * i) / (curve.length - 1);
    const yAt = (v: number): number =>
      chartTop + height - (height - 16) * (v / peak) - 8;
    g.fillStyle(hexToNumber(GOLD), 0.16);
    g.beginPath();
    g.moveTo(left, chartTop + height);
    for (let i = 0; i < curve.length; i += 1)
      g.lineTo(xAt(i), yAt(curve[i] ?? 0));
    g.lineTo(left + width, chartTop + height);
    g.closePath();
    g.fillPath();
    g.lineStyle(2, hexToNumber(GOLD), 0.95);
    g.beginPath();
    g.moveTo(xAt(0), yAt(curve[0] ?? 0));
    for (let i = 1; i < curve.length; i += 1)
      g.lineTo(xAt(i), yAt(curve[i] ?? 0));
    g.strokePath();
    parts.push(g);

    parts.push(
      this.add
        .text(
          left + 8,
          chartTop + 6,
          `峰值 ${formatNumber(peak)} / 秒`,
          textStyle({ size: 15, color: GOLD }),
        )
        .setOrigin(0, 0),
    );
    parts.push(
      this.add
        .text(
          left + width - 8,
          chartTop + height - 6,
          "關底",
          textStyle({ size: 14, color: INK_DIM }),
        )
        .setOrigin(1, 1),
    );
    parts.push(
      this.add
        .text(
          left + 8,
          chartTop + height - 6,
          "開場",
          textStyle({ size: 14, color: INK_DIM }),
        )
        .setOrigin(0, 1),
    );
    return parts;
  }
}
