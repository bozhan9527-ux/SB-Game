import Phaser from 'phaser';
import { audio } from '../audio';
import { ART, DISCIPLE_DISPLAY_HEIGHT, DISCIPLE_SOURCE_HEIGHT, bossTexture } from '../art';
import { GAME_HEIGHT, GAME_WIDTH } from '../config';
import { BALANCE } from '../data';
import { SwipeTracker } from '../input/swipe';
import { state } from '../state';
import { buildLoadout } from '../systems/loadout';
import { realmForStage, realmIndexForStage, realmTitle } from '../systems/realms';
import { createRng } from '../systems/rng';
import type { BossState, Encounter, GateChoice, MobEncounter, RunState } from '../systems/run';
import {
  applyGate,
  bossDps,
  bossHitLoss,
  clearReward,
  createBoss,
  createRunState,
  defeatReward,
  gateSpeedForStage,
  mobLossRatio,
  resolveMob,
} from '../systems/run';
import { drawBackdrop } from '../ui/backdrop';
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
} from '../ui/theme';
import type { RunResultData } from './types';

/** 兩條車道的中心 X。左右滑即在兩者之間切換。 */
const LANE_X = [GAME_WIDTH * 0.27, GAME_WIDTH * 0.73] as const;
/** 隊伍所在的 Y：閘門捲到這條線就結算。 */
const CROWD_Y = 742;
const SPAWN_Y = -150;
const ROAD_TOP = 128;
const GATE_WIDTH = 224;
const GATE_HEIGHT = 116;
/** 畫面上最多畫幾顆人頭，超過只改數字，避免手機爆掉。 */
const MAX_CROWD_DOTS = 48;

interface EncounterView {
  encounter: Encounter;
  container: Phaser.GameObjects.Container;
  resolved: boolean;
}

type Phase = 'intro' | 'running' | 'boss' | 'over';

/**
 * 關卡場景：左右滑選閘門累積人數與武裝，穿過敵陣，最後決戰首領。
 *
 * 數值全部來自 src/systems/run.ts（其數值又來自 data/*.json），本檔只負責呈現與輸入。
 */
export class RunScene extends Phaser.Scene {
  private run!: RunState;
  private phase: Phase = 'intro';
  private speed = 0;
  private lane = 0;
  private views: EncounterView[] = [];
  private spawnIndex = 0;

  private crowd!: Phaser.GameObjects.Container;
  private crowdSprites: Phaser.GameObjects.Image[] = [];
  private crowdCountText!: Phaser.GameObjects.Text;
  private dotOffsets: { x: number; y: number }[] = [];

  private hudDisciples!: Phaser.GameObjects.Text;
  private hudArms!: Phaser.GameObjects.Text;
  private hudGold!: Phaser.GameObjects.Text;
  private hudProgress!: Phaser.GameObjects.Text;

  private tracker!: SwipeTracker;
  private pointerStart: { x: number; y: number; t: number } | null = null;

  private boss: BossState | null = null;
  private bossGroup: Phaser.GameObjects.Container | null = null;
  private bossHpBar: Phaser.GameObjects.Rectangle | null = null;
  private bossHpText: Phaser.GameObjects.Text | null = null;
  private momentum = 0;
  private momentumBar: Phaser.GameObjects.Rectangle | null = null;
  private bossTimeLeft = 0;
  private bossTimerBar: Phaser.GameObjects.Rectangle | null = null;
  private bossAttackAccum = 0;
  private slashAccum = 0;

  constructor() {
    super('Run');
  }

  create(): void {
    const save = state();
    // 保險：沒有門派就沒有起始屬性，退回選門派而不是讓 buildLoadout 丟例外。
    if (save.player.sectId === null) {
      this.scene.start('Sect');
      return;
    }

    const stage = save.world.stage;
    const loadout = buildLoadout(save, stage);
    // 種子帶入挑戰次數：同一關重打會換一批閘門，但單次進行中完全可重現。
    this.run = createRunState(loadout, stage * 7919 + save.world.runs * 104729);

    this.phase = 'intro';
    this.speed = gateSpeedForStage(stage);
    this.lane = 0;
    this.views = [];
    this.spawnIndex = 0;
    this.boss = null;
    this.bossGroup = null;
    this.momentum = 0;
    this.bossAttackAccum = 0;
    this.slashAccum = 0;

    const realm = realmForStage(stage);
    audio.playMusic(realmIndexForStage(stage));
    drawBackdrop(this, realm.color);
    this.drawRoad(realm.color);
    this.buildHud(realm.color);
    this.buildCrowd();
    this.bindInput();
    this.showIntro(realm.color);
  }

  // -------------------------------------------------------------- 建構

  private drawRoad(accentHex: string): void {
    const g = this.add.graphics().setDepth(-50);
    g.fillStyle(0x000000, 0.28);
    g.fillRect(40, ROAD_TOP, GAME_WIDTH - 80, GAME_HEIGHT - ROAD_TOP);
    g.lineStyle(2, hexToNumber(accentHex), 0.25);
    g.strokeRect(40, ROAD_TOP, GAME_WIDTH - 80, GAME_HEIGHT - ROAD_TOP);
    // 中線：兩條車道的分隔。
    g.lineStyle(1, hexToNumber(accentHex), 0.18);
    g.lineBetween(GAME_WIDTH / 2, ROAD_TOP, GAME_WIDTH / 2, GAME_HEIGHT);
  }

  private buildHud(accentHex: string): void {
    // HUD 用不透明底色：閘門是從畫面上方生成後往下捲，透明的話會在 HUD 區域露出半截。
    this.add.rectangle(GAME_WIDTH / 2, 61, GAME_WIDTH, 122, BG_PANEL, 1).setDepth(50);
    this.add.rectangle(GAME_WIDTH / 2, 122, GAME_WIDTH, 2, LINE, 0.8).setDepth(50);

    this.add
      .text(24, 22, realmTitle(this.run.stage), textStyle({ size: 26, color: accentHex, bold: true }))
      .setDepth(51);
    this.hudGold = this.add
      .text(GAME_WIDTH - 24, 26, '金幣 0', textStyle({ size: 20, color: GOLD }))
      .setOrigin(1, 0)
      .setDepth(51);

    this.hudDisciples = this.add.text(24, 64, '', textStyle({ size: 24, color: INK })).setDepth(51);
    this.hudArms = this.add.text(196, 64, '', textStyle({ size: 24, color: INK })).setDepth(51);
    this.hudProgress = this.add
      .text(GAME_WIDTH - 24, 66, '', textStyle({ size: 20, color: INK_DIM }))
      .setOrigin(1, 0)
      .setDepth(51);

    this.updateHud();
  }

  private buildCrowd(): void {
    // 站位先算好一組固定偏移，之後只依人數取前 N 個，避免每幀重算。
    // 依 y 排序後依序加入容器，後加入的畫在上面，前排才會正確蓋住後排。
    const rng = createRng(20260827);
    this.dotOffsets = [];
    for (let i = 0; i < MAX_CROWD_DOTS; i += 1) {
      const ring = Math.floor(Math.sqrt(i) * 1.35);
      const angle = i * 2.399963;
      const radius = ring * 11 + rng.next() * 6;
      this.dotOffsets.push({ x: Math.cos(angle) * radius, y: Math.sin(angle) * radius * 0.62 });
    }
    this.dotOffsets.sort((a, b) => a.y - b.y);

    const tint = hexToNumber(this.run.loadout.sect.color);
    const baseScale = DISCIPLE_DISPLAY_HEIGHT / DISCIPLE_SOURCE_HEIGHT;
    this.crowdSprites = this.dotOffsets.map(() =>
      this.add.image(0, 0, ART.disciple).setOrigin(0.5, 0.85).setScale(baseScale).setTint(tint).setVisible(false),
    );

    this.crowdCountText = this.add
      .text(0, -104, '', textStyle({ size: 30, color: INK, bold: true }))
      .setOrigin(0.5)
      .setStroke('#0b0f14', 6);
    this.crowd = this.add
      .container(LANE_X[0], CROWD_Y, [...this.crowdSprites, this.crowdCountText])
      .setDepth(30);
    this.drawCrowd();
  }

  private drawCrowd(): void {
    const count = Math.max(0, this.run.disciples);
    const shown = Math.min(MAX_CROWD_DOTS, count);
    // 人越多，個體與間距一起縮小，整團才不會超出車道寬度。
    const spread = Phaser.Math.Clamp(Math.sqrt(16 / Math.max(1, shown)), 0.55, 1);
    const scale = spread * (DISCIPLE_DISPLAY_HEIGHT / DISCIPLE_SOURCE_HEIGHT);

    this.crowdSprites.forEach((sprite, index) => {
      const offset = this.dotOffsets[index];
      if (offset === undefined || index >= shown) {
        sprite.setVisible(false);
        return;
      }
      sprite.setVisible(true).setPosition(offset.x * spread, offset.y * spread).setScale(scale);
    });

    this.crowdCountText.setText(count > 0 ? `${formatNumber(count)} 人` : '');
    this.crowdCountText.setColor(count <= 3 ? DANGER : INK);
  }

  private bindInput(): void {
    this.tracker = new SwipeTracker(BALANCE.swipe);

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.tracker.begin(pointer.x, pointer.y, this.time.now);
      this.pointerStart = { x: pointer.x, y: pointer.y, t: this.time.now };
    });

    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      const direction = this.tracker.end(pointer.x, pointer.y, this.time.now);
      const start = this.pointerStart;
      this.pointerStart = null;

      if (direction === 'left') return this.onSwipe(0);
      if (direction === 'right') return this.onSwipe(1);
      if (direction !== null) return;

      // 滑動未成立時的點擊後備：短距離、短時間的觸碰也能選邊。
      // 這不是搖桿，仍是單次離散輸入，不違反 TECH_SPEC 第 4.5 節的兩套輸入分離。
      if (start === null) return;
      const moved = Math.hypot(pointer.x - start.x, pointer.y - start.y);
      if (moved < BALANCE.swipe.minDistancePx && this.time.now - start.t < 400) {
        this.onSwipe(pointer.x < GAME_WIDTH / 2 ? 0 : 1);
      }
    });

    // 桌機測試用。手機上不影響。
    this.input.keyboard?.on('keydown-LEFT', () => this.onSwipe(0));
    this.input.keyboard?.on('keydown-RIGHT', () => this.onSwipe(1));
  }

  private onSwipe(lane: number): void {
    if (this.phase === 'boss') {
      audio.play('swipe');
      // 首領戰：滑動累積氣勢，換取傷害加成。
      const { boss } = BALANCE;
      this.momentum = Math.min(boss.momentumMax, this.momentum + boss.momentumPerSwipe);
      this.crowd.setScale(1.08);
      this.tweens.add({ targets: this.crowd, scale: 1, duration: 140 });
      return;
    }
    if (this.phase !== 'running' || lane === this.lane) return;

    audio.play('swipe');
    this.lane = lane;
    this.tweens.add({
      targets: this.crowd,
      x: LANE_X[lane],
      duration: 140,
      ease: 'Quad.easeOut',
    });
  }

  private showIntro(accentHex: string): void {
    const realm = realmForStage(this.run.stage);
    const title = this.add
      .text(GAME_WIDTH / 2, 420, realmTitle(this.run.stage), textStyle({ size: 52, color: accentHex, bold: true }))
      .setOrigin(0.5)
      .setDepth(80);
    const sub = this.add
      .text(GAME_WIDTH / 2, 478, realm.subtitle, textStyle({ size: 22, color: INK_DIM }))
      .setOrigin(0.5)
      .setDepth(80);
    const hint = this.add
      .text(GAME_WIDTH / 2, 540, '左右滑動選擇閘門', textStyle({ size: 22, color: INK }))
      .setOrigin(0.5)
      .setDepth(80);

    this.tweens.add({
      targets: [title, sub, hint],
      alpha: 0,
      delay: 900,
      duration: 500,
      onComplete: () => {
        title.destroy();
        sub.destroy();
        hint.destroy();
        if (this.phase === 'intro') this.phase = 'running';
      },
    });
  }

  // -------------------------------------------------------------- 主迴圈

  override update(_time: number, delta: number): void {
    if (this.phase === 'running') this.updateRunning(delta);
    else if (this.phase === 'boss') this.updateBoss(delta);
  }

  private updateRunning(delta: number): void {
    const step = (this.speed * delta) / 1000;
    const last = this.views[this.views.length - 1];

    if (
      this.spawnIndex < this.run.encounters.length &&
      (last === undefined || last.container.y - SPAWN_Y >= BALANCE.run.encounterSpacingPx)
    ) {
      this.spawnEncounter(this.spawnIndex);
      this.spawnIndex += 1;
    }

    for (const view of this.views) {
      view.container.y += step;
      if (!view.resolved && view.container.y >= CROWD_Y) this.resolveView(view);
    }

    this.views = this.views.filter((view) => {
      if (view.container.y > GAME_HEIGHT + 200) {
        view.container.destroy();
        return false;
      }
      return true;
    });

    if (this.spawnIndex >= this.run.encounters.length && this.views.every((view) => view.resolved)) {
      this.startBoss();
    }
  }

  private spawnEncounter(index: number): void {
    const encounter = this.run.encounters[index];
    if (encounter === undefined) return;
    const container =
      encounter.kind === 'gate'
        ? this.buildGateView(encounter.left, encounter.right)
        : this.buildMobView(encounter);
    container.setY(SPAWN_Y);
    this.views.push({ encounter, container, resolved: false });
  }

  private gateColor(choice: GateChoice): number {
    if (choice.trap) return 0x8c2f3a;
    if (choice.target === 'gold') return 0x7a6428;
    if (choice.target === 'arms') return 0x2b5f80;
    return 0x2f6f4f;
  }

  private buildGateView(left: GateChoice, right: GateChoice): Phaser.GameObjects.Container {
    const container = this.add.container(0, 0).setDepth(20);
    ([left, right] as const).forEach((choice, index) => {
      const x = LANE_X[index] ?? GAME_WIDTH / 2;
      const panel = this.add
        .rectangle(x, 0, GATE_WIDTH, GATE_HEIGHT, this.gateColor(choice), 0.82)
        .setStrokeStyle(3, choice.trap ? hexToNumber(DANGER) : hexToNumber(INK), 0.75);
      const arch = this.add
        .image(x, 0, ART.gateArch)
        .setDisplaySize(GATE_WIDTH, GATE_HEIGHT)
        .setTint(choice.trap ? hexToNumber(DANGER) : hexToNumber(INK))
        .setAlpha(0.9);
      const label = this.add
        .text(x, 16, choice.label, textStyle({ size: 30, color: INK, bold: true }))
        .setOrigin(0.5);
      // 後期關卡的閘門數字會變成四位數，超寬就等比縮小而不是溢出閘門。
      fitText(label, GATE_WIDTH - 68);
      container.add([panel, arch, label]);
    });
    return container;
  }

  private buildMobView(encounter: MobEncounter): Phaser.GameObjects.Container {
    const container = this.add.container(0, 0).setDepth(20);
    const band = this.add
      .rectangle(GAME_WIDTH / 2, 0, GAME_WIDTH - 92, 92, 0x5a1f27, 0.8)
      .setStrokeStyle(3, hexToNumber(DANGER), 0.8);
    const silhouette = this.add
      .image(GAME_WIDTH / 2, 0, ART.mobLine)
      .setDisplaySize(GAME_WIDTH - 92, 92)
      .setTint(0x120608)
      .setAlpha(0.55);
    const label = this.add
      .text(GAME_WIDTH / 2, -14, encounter.name, textStyle({ size: 26, color: INK, bold: true }))
      .setOrigin(0.5);
    // 顯示以目前武裝推估的傷亡比例：讓玩家看得出「武裝閘門有沒有用」。
    const percent = Math.round(mobLossRatio(this.run, encounter) * 100);
    const stat = this.add
      .text(GAME_WIDTH / 2, 20, `預估傷亡 −${percent}%`, textStyle({ size: 20, color: DANGER }))
      .setOrigin(0.5);
    container.add([band, silhouette, label, stat]);
    return container;
  }

  private resolveView(view: EncounterView): void {
    view.resolved = true;

    if (view.encounter.kind === 'gate') {
      const choice = this.lane === 0 ? view.encounter.left : view.encounter.right;
      const result = applyGate(this.run, choice);
      const parts: string[] = [];
      if (result.discipleDelta !== 0) parts.push(`${result.discipleDelta > 0 ? '+' : ''}${result.discipleDelta} 人`);
      if (result.armsDelta !== 0) parts.push(`${result.armsDelta > 0 ? '+' : ''}${result.armsDelta} 武裝`);
      if (result.goldDelta !== 0) parts.push(`+${result.goldDelta} 金幣`);
      const positive = result.discipleDelta + result.armsDelta + result.goldDelta >= 0;
      this.popup(parts.join('　'), positive ? JADE : DANGER);
      audio.play(choice.target === 'gold' ? 'gold' : positive ? 'gateGood' : 'gateTrap');
    } else {
      const loss = resolveMob(this.run, view.encounter);
      this.popup(`-${loss} 人`, DANGER);
      this.cameras.main.shake(160, 0.006);
      audio.play('mob');
    }

    this.tweens.add({ targets: view.container, alpha: 0, duration: 260 });
    this.drawCrowd();
    this.updateHud();

    if (this.run.disciples <= 0) this.finish(false, 'route');
  }

  private popup(text: string, color: string): void {
    if (text.length === 0) return;
    const label = this.add
      .text(this.crowd.x, CROWD_Y - 110, text, textStyle({ size: 30, color, bold: true }))
      .setOrigin(0.5)
      .setDepth(60);
    this.tweens.add({
      targets: label,
      y: label.y - 70,
      alpha: 0,
      duration: 900,
      onComplete: () => label.destroy(),
    });
  }

  private updateHud(): void {
    this.hudDisciples.setText(`弟子 ${formatNumber(this.run.disciples)}`);
    this.hudArms.setText(`武裝 ${formatNumber(this.run.arms)}`);
    this.hudGold.setText(`金幣 ${formatNumber(this.run.goldCollected)}`);
    const total = this.run.encounters.length;
    const done = Math.min(total, this.spawnIndex);
    this.hudProgress.setText(this.phase === 'boss' ? '首領戰' : `路程 ${done}/${total}`);
  }

  // -------------------------------------------------------------- 首領戰

  private startBoss(): void {
    if (this.phase !== 'running') return;
    this.phase = 'boss';

    const rng = createRng(this.run.stage * 31337 + this.run.disciples);
    this.boss = createBoss(this.run.stage, rng);
    this.bossTimeLeft = BALANCE.boss.timeLimitMs;
    this.bossAttackAccum = 0;
    this.updateHud();

    this.tweens.add({ targets: this.crowd, x: GAME_WIDTH / 2, duration: 400, ease: 'Quad.easeOut' });
    this.buildBossView(this.boss);
  }

  private buildBossView(boss: BossState): void {
    const container = this.add.container(0, 0).setDepth(25);
    const cx = GAME_WIDTH / 2;

    const realm = realmForStage(this.run.stage);
    const texture = bossTexture(boss.def.art);
    // 光暈 → 紅色描邊 → 本體，三層疊出「境界色的妖物」而不是單一色塊。
    const aura = this.add.circle(cx, 330, 104, hexToNumber(realm.color), 0.12);
    const glow = this.add
      .image(cx, 330, texture)
      .setDisplaySize(216, 216)
      .setTint(hexToNumber(DANGER))
      .setAlpha(0.38);
    const body = this.add.image(cx, 330, texture).setDisplaySize(200, 200).setTint(hexToNumber(realm.color));
    this.tweens.add({ targets: [body, glow], scale: '*=1.05', duration: 1100, yoyo: true, repeat: -1 });
    this.tweens.add({ targets: aura, alpha: 0.22, duration: 1400, yoyo: true, repeat: -1 });

    const name = this.add
      .text(cx, 200, boss.def.name, textStyle({ size: 40, color: DANGER, bold: true }))
      .setOrigin(0.5);
    const taunt = this.add
      .text(cx, 244, `「${boss.def.taunt}」`, textStyle({ size: 19, color: INK_DIM }))
      .setOrigin(0.5);

    // 血條
    const barWidth = GAME_WIDTH - 120;
    const barBg = this.add.rectangle(cx, 446, barWidth, 26, 0x2a1216, 1).setStrokeStyle(2, LINE);
    this.bossHpBar = this.add.rectangle(cx - barWidth / 2, 446, barWidth, 22, 0xc03a4a, 1).setOrigin(0, 0.5);
    this.bossHpText = this.add
      .text(cx, 446, '', textStyle({ size: 17, color: INK, bold: true }))
      .setOrigin(0.5);

    // 時間條
    const timerBg = this.add.rectangle(cx, 476, barWidth, 8, 0x1b232b, 1);
    this.bossTimerBar = this.add.rectangle(cx - barWidth / 2, 476, barWidth, 8, 0x7a8fa0, 1).setOrigin(0, 0.5);

    // 氣勢條
    const momentumBg = this.add.rectangle(cx, 552, barWidth, 16, 0x1b232b, 1).setStrokeStyle(2, LINE);
    this.momentumBar = this.add.rectangle(cx - barWidth / 2, 552, 0, 12, hexToNumber(GOLD), 1).setOrigin(0, 0.5);
    const momentumLabel = this.add
      .text(cx, 524, '氣勢　連續滑動可提升傷害', textStyle({ size: 18, color: GOLD }))
      .setOrigin(0.5);

    container.add([
      aura,
      glow,
      body,
      name,
      taunt,
      barBg,
      this.bossHpBar,
      this.bossHpText,
      timerBg,
      this.bossTimerBar,
      momentumBg,
      this.momentumBar,
      momentumLabel,
    ]);
    this.bossGroup = container;
    this.refreshBossBars();
  }

  private updateBoss(delta: number): void {
    const boss = this.boss;
    if (boss === null) return;
    const cfg = BALANCE.boss;
    const seconds = delta / 1000;

    // 氣勢自然衰退，不滑就掉。
    this.momentum = Math.max(0, this.momentum - cfg.momentumDecayPerSec * seconds);

    // 我方輸出的視覺回饋：氣勢越高，劍氣越密。
    this.slashAccum += delta * (1 + this.momentum);
    if (this.slashAccum >= 420) {
      this.slashAccum = 0;
      this.spawnSlash();
      audio.play('bossHit');
    }

    // 我方輸出
    boss.hp -= bossDps(this.run, this.momentum) * seconds;
    if (boss.hp <= 0) {
      boss.hp = 0;
      this.refreshBossBars();
      this.finish(true, null);
      return;
    }

    // 首領反擊：以毫秒累積，掉幀時節奏不變（TECH_SPEC 第 4.5 節）。
    this.bossAttackAccum += delta;
    while (this.bossAttackAccum >= cfg.attackIntervalMs) {
      this.bossAttackAccum -= cfg.attackIntervalMs;
      const loss = Math.min(this.run.disciples, bossHitLoss(this.run, boss));
      this.run.disciples -= loss;
      this.popup(`-${loss} 人`, DANGER);
      this.cameras.main.shake(180, 0.008);
      audio.play('bossAttack');
      this.drawCrowd();
      this.updateHud();
      if (this.run.disciples <= 0) {
        this.finish(false, 'wiped');
        return;
      }
    }

    this.bossTimeLeft -= delta;
    if (this.bossTimeLeft <= 0) {
      this.finish(false, 'timeout');
      return;
    }

    this.refreshBossBars();
  }

  /** 首領身上閃現的一道劍氣。 */
  private spawnSlash(): void {
    const slash = this.add
      .image(
        GAME_WIDTH / 2 + Phaser.Math.Between(-52, 52),
        330 + Phaser.Math.Between(-46, 46),
        ART.slash,
      )
      .setDisplaySize(150, 150)
      .setTint(hexToNumber(this.run.loadout.sect.color))
      .setAngle(Phaser.Math.Between(-40, 220))
      .setAlpha(0.85)
      .setDepth(40);
    this.tweens.add({
      targets: slash,
      alpha: 0,
      scale: '*=1.3',
      duration: 260,
      onComplete: () => slash.destroy(),
    });
  }

  private refreshBossBars(): void {
    const boss = this.boss;
    if (boss === null) return;
    const barWidth = GAME_WIDTH - 120;

    this.bossHpBar?.setDisplaySize(Math.max(0, barWidth * (boss.hp / boss.maxHp)), 22);
    this.bossHpText?.setText(`${formatNumber(Math.max(0, boss.hp))} / ${formatNumber(boss.maxHp)}`);
    this.bossTimerBar?.setDisplaySize(
      Math.max(0, barWidth * (this.bossTimeLeft / BALANCE.boss.timeLimitMs)),
      8,
    );
    this.momentumBar?.setDisplaySize(
      Math.max(0, barWidth * (this.momentum / BALANCE.boss.momentumMax)),
      12,
    );
  }

  // -------------------------------------------------------------- 結束

  private finish(victory: boolean, reason: 'route' | 'wiped' | 'timeout' | null): void {
    if (this.phase === 'over') return;
    this.phase = 'over';
    this.bossGroup?.setAlpha(0.6);
    audio.play(victory ? 'victory' : 'defeat');

    const result: RunResultData = {
      victory,
      stage: this.run.stage,
      bossName: this.boss?.def.name ?? '首領',
      survivors: Math.max(0, this.run.disciples),
      arms: this.run.arms,
      goldCollected: this.run.goldCollected,
      goldReward: victory ? clearReward(this.run) : defeatReward(this.run),
      defeatReason: reason,
    };

    this.cameras.main.fadeOut(420, 0, 0, 0);
    this.time.delayedCall(460, () => this.scene.start('Result', result));
  }
}
