import Phaser from 'phaser';
import { audio } from '../audio';
import {
  ART,
  DISCIPLE_DISPLAY_HEIGHT,
  DISCIPLE_SOURCE_HEIGHT,
  ENEMY_DISPLAY_HEIGHT,
  ENEMY_SOURCE_HEIGHT,
  bossTexture,
} from '../art';
import { GAME_HEIGHT, GAME_WIDTH } from '../config';
import { BALANCE } from '../data';
import { addMomentum, approach, clampToTrack } from '../input/follow';
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

/** 路面左右邊界。隊伍可以在這之間任意移動，不再只有兩條車道。 */
const ROAD_LEFT = 40;
const ROAD_RIGHT = GAME_WIDTH - 40;
/** 兩道閘門的中心 X。隊伍中心落在哪一半，就吃哪一側。 */
const LANE_X = [GAME_WIDTH * 0.27, GAME_WIDTH * 0.73] as const;
/** 隊伍所在的 Y：閘門捲到這條線就結算。 */
const CROWD_Y = 742;
const SPAWN_Y = -150;
const ROAD_TOP = 128;
const GATE_WIDTH = 224;
const GATE_HEIGHT = 116;
/** 畫面上最多畫幾名門人，超過只改數字，避免手機爆掉。 */
const MAX_CROWD_DOTS = 48;
/** 敵陣一排幾名兵卒。 */
const MOB_ROW = 7;
const BOSS_Y = 330;

interface EncounterView {
  encounter: Encounter;
  container: Phaser.GameObjects.Container;
  resolved: boolean;
  /** 敵陣才有：用於結算時的擊退演出。 */
  enemies: Phaser.GameObjects.Image[];
  /** 敵陣的說明文字，逼近隊伍時淡出，免得和頭頂的人數字疊在一起。 */
  labels: Phaser.GameObjects.Text[];
}

interface CrowdSlot {
  x: number;
  y: number;
  scale: number;
  /** 起伏動畫的相位，讓每個人的步伐不同步。 */
  phase: number;
}

type Phase = 'intro' | 'running' | 'boss' | 'over';

/**
 * 關卡場景：手指帶著隊伍左右走位挑閘門，穿過敵陣，最後決戰首領。
 *
 * 數值全部來自 src/systems/run.ts（其數值又來自 data/*.json），本檔只負責呈現與輸入。
 */
export class RunScene extends Phaser.Scene {
  private run!: RunState;
  private phase: Phase = 'intro';
  private speed = 0;
  private views: EncounterView[] = [];
  private spawnIndex = 0;

  private crowd!: Phaser.GameObjects.Container;
  private crowdSprites: Phaser.GameObjects.Image[] = [];
  private crowdSlots: CrowdSlot[] = [];
  private crowdCountText!: Phaser.GameObjects.Text;
  private visibleCount = 0;
  private bobTime = 0;

  /** 手指的目標位置；隊伍每幀往它逼近。 */
  private targetX = LANE_X[0];
  private lastCrowdX = LANE_X[0];

  private hudDisciples!: Phaser.GameObjects.Text;
  private hudArms!: Phaser.GameObjects.Text;
  private hudGold!: Phaser.GameObjects.Text;
  private hudProgress!: Phaser.GameObjects.Text;

  private boss: BossState | null = null;
  private bossGroup: Phaser.GameObjects.Container | null = null;
  private bossFigure: Phaser.GameObjects.Container | null = null;
  private bossBody: Phaser.GameObjects.Image | null = null;
  private bossTint = 0xffffff;
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
    this.views = [];
    this.spawnIndex = 0;
    this.boss = null;
    this.bossGroup = null;
    this.bossFigure = null;
    this.bossBody = null;
    this.momentum = 0;
    this.bossAttackAccum = 0;
    this.slashAccum = 0;
    this.bobTime = 0;
    this.targetX = GAME_WIDTH / 2;
    this.lastCrowdX = this.targetX;

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
    g.fillRect(ROAD_LEFT, ROAD_TOP, ROAD_RIGHT - ROAD_LEFT, GAME_HEIGHT - ROAD_TOP);
    g.lineStyle(2, hexToNumber(accentHex), 0.25);
    g.strokeRect(ROAD_LEFT, ROAD_TOP, ROAD_RIGHT - ROAD_LEFT, GAME_HEIGHT - ROAD_TOP);
    g.lineStyle(1, hexToNumber(accentHex), 0.14);
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
    const slots: CrowdSlot[] = [];
    for (let i = 0; i < MAX_CROWD_DOTS; i += 1) {
      const ring = Math.floor(Math.sqrt(i) * 1.35);
      const angle = i * 2.399963;
      const radius = ring * 14 + rng.next() * 7;
      slots.push({
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius * 0.62,
        scale: 1,
        phase: rng.next() * Math.PI * 2,
      });
    }
    slots.sort((a, b) => a.y - b.y);
    this.crowdSlots = slots;

    const tint = hexToNumber(this.run.loadout.sect.color);
    this.crowdSprites = slots.map(() =>
      this.add
        .image(0, 0, ART.disciple)
        .setOrigin(0.5, 0.85)
        .setTint(tint)
        .setVisible(false),
    );

    this.crowdCountText = this.add
      .text(0, -132, '', textStyle({ size: 30, color: INK, bold: true }))
      .setOrigin(0.5)
      .setStroke('#0b0f14', 6);
    this.crowd = this.add
      .container(this.targetX, CROWD_Y, [...this.crowdSprites, this.crowdCountText])
      .setDepth(30);
    this.layoutCrowd();
  }

  /** 人數變動時重排站位。每幀的起伏動畫另外在 animateCrowd 處理。 */
  private layoutCrowd(): void {
    const count = Math.max(0, this.run.disciples);
    this.visibleCount = Math.min(MAX_CROWD_DOTS, count);
    // 人越多，個體與間距一起縮小，整團才不會超出路面。
    const spread = Phaser.Math.Clamp(Math.sqrt(16 / Math.max(1, this.visibleCount)), 0.62, 1);
    const scale = spread * (DISCIPLE_DISPLAY_HEIGHT / DISCIPLE_SOURCE_HEIGHT);

    this.crowdSprites.forEach((sprite, index) => {
      const slot = this.crowdSlots[index];
      if (slot === undefined || index >= this.visibleCount) {
        sprite.setVisible(false);
        return;
      }
      slot.scale = scale;
      sprite.setVisible(true).setPosition(slot.x * spread, slot.y * spread).setScale(scale);
    });

    this.crowdCountText.setText(count > 0 ? `${formatNumber(count)} 人` : '');
    this.crowdCountText.setColor(count <= 3 ? DANGER : INK);
  }

  /** 門人的跑動：上下起伏加輕微擠壓，每個人相位不同，整團看起來像在趕路。 */
  private animateCrowd(delta: number): void {
    this.bobTime += delta;
    for (let i = 0; i < this.visibleCount; i += 1) {
      const sprite = this.crowdSprites[i];
      const slot = this.crowdSlots[i];
      if (sprite === undefined || slot === undefined) continue;
      const wave = Math.sin(this.bobTime * 0.013 + slot.phase);
      sprite.y = slot.y * (slot.scale / (DISCIPLE_DISPLAY_HEIGHT / DISCIPLE_SOURCE_HEIGHT)) - Math.abs(wave) * 4;
      sprite.setScale(slot.scale, slot.scale * (1 - Math.abs(wave) * 0.06));
    }
  }

  private bindInput(): void {
    const follow = (pointer: Phaser.Input.Pointer): void => {
      if (this.phase === 'over') return;
      this.targetX = clampToTrack(pointer.x, ROAD_LEFT, ROAD_RIGHT, BALANCE.input.trackMarginPx);
    };

    this.input.on('pointerdown', follow);
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (pointer.isDown) follow(pointer);
    });

    // 桌機測試用，手機上不影響。
    this.input.keyboard?.on('keydown-LEFT', () => this.nudge(-70));
    this.input.keyboard?.on('keydown-RIGHT', () => this.nudge(70));
  }

  private nudge(offset: number): void {
    this.targetX = clampToTrack(
      this.targetX + offset,
      ROAD_LEFT,
      ROAD_RIGHT,
      BALANCE.input.trackMarginPx,
    );
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
      .text(GAME_WIDTH / 2, 540, '手指按住畫面，帶著門人左右走位', textStyle({ size: 22, color: INK }))
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
    if (this.phase === 'over') return;

    // 隊伍以指數逼近追手指，與畫格率解耦。
    this.crowd.x = approach(this.crowd.x, this.targetX, delta, BALANCE.input.followSpeed);
    const moved = this.crowd.x - this.lastCrowdX;
    this.lastCrowdX = this.crowd.x;
    this.animateCrowd(delta);

    if (this.phase === 'running') this.updateRunning(delta);
    else if (this.phase === 'boss') this.updateBoss(delta, moved);
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
      // 敵陣的字在逼近隊伍時淡出，避免和頭頂的人數字重疊。
      if (!view.resolved && view.labels.length > 0) {
        const alpha = Phaser.Math.Clamp((CROWD_Y - view.container.y) / 220, 0, 1);
        for (const label of view.labels) label.setAlpha(alpha);
      }
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
    const view =
      encounter.kind === 'gate'
        ? this.buildGateView(encounter.left, encounter.right)
        : this.buildMobView(encounter);
    view.container.setY(SPAWN_Y);
    this.views.push({ encounter, ...view, resolved: false });
  }

  /** 閘門的顏色只用在線條與文字上，不鋪底色。 */
  private gateAccent(choice: GateChoice): string {
    if (choice.trap) return DANGER;
    if (choice.target === 'gold') return GOLD;
    if (choice.target === 'arms') return '#7fd8ff';
    return JADE;
  }

  private buildGateView(left: GateChoice, right: GateChoice): Omit<EncounterView, 'encounter' | 'resolved'> {
    const container = this.add.container(0, 0).setDepth(20);

    ([left, right] as const).forEach((choice, index) => {
      const x = LANE_X[index] ?? GAME_WIDTH / 2;
      const accent = this.gateAccent(choice);
      const arch = this.add
        .image(x, 0, ART.gateArch)
        .setDisplaySize(GATE_WIDTH, GATE_HEIGHT)
        .setTint(hexToNumber(accent))
        .setAlpha(0.95);
      const label = this.add
        .text(x, 16, choice.label, textStyle({ size: 32, color: accent, bold: true }))
        .setOrigin(0.5)
        // 沒有底色，改用描邊讓文字在任何背景上都讀得到。
        .setStroke('#0b0f14', 7);
      // 後期關卡的閘門數字會變成四位數，超寬就等比縮小而不是溢出閘門。
      fitText(label, GATE_WIDTH - 60);
      container.add([arch, label]);
    });

    return { container, enemies: [], labels: [] };
  }

  private buildMobView(encounter: MobEncounter): Omit<EncounterView, 'encounter' | 'resolved'> {
    const container = this.add.container(0, 0).setDepth(20);
    const enemies: Phaser.GameObjects.Image[] = [];
    const scale = ENEMY_DISPLAY_HEIGHT / ENEMY_SOURCE_HEIGHT;
    const span = ROAD_RIGHT - ROAD_LEFT - 40;

    for (let i = 0; i < MOB_ROW; i += 1) {
      const x = ROAD_LEFT + 20 + (span * i) / (MOB_ROW - 1);
      const enemy = this.add
        .image(x, i % 2 === 0 ? 0 : 6, ART.enemy)
        .setOrigin(0.5, 0.9)
        .setScale(scale)
        .setTint(0xc2404e);
      enemies.push(enemy);
      // 每名兵卒相位不同，整排看起來是在原地踏步逼近，而不是一張貼圖。
      this.tweens.add({
        targets: enemy,
        y: enemy.y - 7,
        duration: 380,
        delay: i * 70,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }

    const label = this.add
      .text(GAME_WIDTH / 2, -86, encounter.name, textStyle({ size: 26, color: DANGER, bold: true }))
      .setOrigin(0.5)
      .setStroke('#0b0f14', 7);
    // 顯示以目前武裝推估的傷亡比例：讓玩家看得出「武裝閘門有沒有用」。
    const percent = Math.round(mobLossRatio(this.run, encounter) * 100);
    const stat = this.add
      .text(GAME_WIDTH / 2, -58, `預估傷亡 −${percent}%`, textStyle({ size: 20, color: INK }))
      .setOrigin(0.5)
      .setStroke('#0b0f14', 6);

    container.add([...enemies, label, stat]);
    return { container, enemies, labels: [label, stat] };
  }

  private resolveView(view: EncounterView): void {
    view.resolved = true;

    if (view.encounter.kind === 'gate') {
      // 隊伍中心落在哪一半，就吃哪一側的閘門。
      const choice = this.crowd.x < GAME_WIDTH / 2 ? view.encounter.left : view.encounter.right;
      const result = applyGate(this.run, choice);
      const parts: string[] = [];
      if (result.discipleDelta !== 0) parts.push(`${result.discipleDelta > 0 ? '+' : ''}${result.discipleDelta} 人`);
      if (result.armsDelta !== 0) parts.push(`${result.armsDelta > 0 ? '+' : ''}${result.armsDelta} 武裝`);
      if (result.goldDelta !== 0) parts.push(`+${result.goldDelta} 金幣`);
      const positive = result.discipleDelta + result.armsDelta + result.goldDelta >= 0;
      this.popup(parts.join('　'), positive ? JADE : DANGER);
      audio.play(choice.target === 'gold' ? 'gold' : positive ? 'gateGood' : 'gateTrap');
      this.tweens.add({ targets: view.container, alpha: 0, duration: 260 });
    } else {
      const loss = resolveMob(this.run, view.encounter);
      this.popup(`-${loss} 人`, DANGER);
      this.cameras.main.shake(160, 0.006);
      audio.play('mob');
      this.knockBack(view.enemies);
    }

    this.layoutCrowd();
    this.updateHud();

    if (this.run.disciples <= 0) this.finish(false, 'route');
  }

  /** 敵陣被衝散：閃白、向外彈開、淡出。 */
  private knockBack(enemies: readonly Phaser.GameObjects.Image[]): void {
    enemies.forEach((enemy, index) => {
      this.tweens.killTweensOf(enemy);
      enemy.setTint(0xffffff);
      this.tweens.add({
        targets: enemy,
        x: enemy.x + (index % 2 === 0 ? -46 : 46),
        y: enemy.y - 34,
        angle: index % 2 === 0 ? -55 : 55,
        alpha: 0,
        duration: 340,
        ease: 'Quad.easeOut',
      });
    });
  }

  private popup(text: string, color: string): void {
    if (text.length === 0) return;
    const label = this.add
      .text(this.crowd.x, CROWD_Y - 172, text, textStyle({ size: 30, color, bold: true }))
      .setOrigin(0.5)
      .setStroke('#0b0f14', 6)
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

    this.targetX = GAME_WIDTH / 2;
    this.buildBossView(this.boss);
  }

  private buildBossView(boss: BossState): void {
    const container = this.add.container(0, 0).setDepth(25);
    const cx = GAME_WIDTH / 2;
    const realm = realmForStage(this.run.stage);
    const texture = bossTexture(boss.def.art);
    this.bossTint = hexToNumber(realm.color);

    // 光暈 → 紅色描邊 → 本體，三層疊出「境界色的妖物」而不是單一色塊。
    const aura = this.add.circle(0, 0, 104, this.bossTint, 0.12);
    const glow = this.add
      .image(0, 0, texture)
      .setDisplaySize(216, 216)
      .setTint(hexToNumber(DANGER))
      .setAlpha(0.38);
    const body = this.add.image(0, 0, texture).setDisplaySize(200, 200).setTint(this.bossTint);
    this.bossBody = body;

    const figure = this.add.container(cx, BOSS_Y, [aura, glow, body]);
    this.bossFigure = figure;
    // 擺動掛在容器上，光暈／描邊／本體才會一起動而不會彼此錯開。
    // 待機：緩慢起伏加左右微擺，讓首領在等待時也是活的。
    this.tweens.add({ targets: figure, y: BOSS_Y + 14, duration: 1300, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.tweens.add({ targets: figure, angle: 2.5, duration: 1900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.tweens.add({ targets: aura, alpha: 0.24, duration: 1400, yoyo: true, repeat: -1 });

    const name = this.add
      .text(cx, 200, boss.def.name, textStyle({ size: 40, color: DANGER, bold: true }))
      .setOrigin(0.5)
      .setStroke('#0b0f14', 6);
    const taunt = this.add
      .text(cx, 244, `「${boss.def.taunt}」`, textStyle({ size: 19, color: INK_DIM }))
      .setOrigin(0.5);

    const barWidth = GAME_WIDTH - 120;
    const barBg = this.add.rectangle(cx, 446, barWidth, 26, 0x2a1216, 1).setStrokeStyle(2, LINE);
    this.bossHpBar = this.add.rectangle(cx - barWidth / 2, 446, barWidth, 22, 0xc03a4a, 1).setOrigin(0, 0.5);
    this.bossHpText = this.add
      .text(cx, 446, '', textStyle({ size: 17, color: INK, bold: true }))
      .setOrigin(0.5);

    const timerBg = this.add.rectangle(cx, 472, barWidth, 8, 0x1b232b, 1);
    this.bossTimerBar = this.add.rectangle(cx - barWidth / 2, 472, barWidth, 8, 0x7a8fa0, 1).setOrigin(0, 0.5);

    const momentumBg = this.add.rectangle(cx, 524, barWidth, 16, 0x1b232b, 1).setStrokeStyle(2, LINE);
    this.momentumBar = this.add.rectangle(cx - barWidth / 2, 524, 0, 12, hexToNumber(GOLD), 1).setOrigin(0, 0.5);
    const momentumLabel = this.add
      .text(cx, 498, '氣勢　左右晃動可提升傷害', textStyle({ size: 18, color: GOLD }))
      .setOrigin(0.5);

    container.add([
      figure,
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

  /** 首領出手：先蓄力後撲下，再彈回原位。 */
  private bossAttackAnimation(): void {
    const figure = this.bossFigure;
    if (figure === null) return;
    audio.play('swipe');
    this.tweens.add({
      targets: figure,
      scale: 1.14,
      duration: 170,
      yoyo: false,
      onComplete: () => {
        this.tweens.add({
          targets: figure,
          y: BOSS_Y + 86,
          scale: 1,
          duration: 130,
          ease: 'Quad.easeIn',
          onComplete: () => {
            this.tweens.add({ targets: figure, y: BOSS_Y, duration: 320, ease: 'Back.easeOut' });
          },
        });
      },
    });
  }

  /** 我方命中：首領閃白並被打得縮一下。 */
  private bossHitAnimation(): void {
    const body = this.bossBody;
    if (body === null) return;
    body.setTint(0xffffff);
    this.time.delayedCall(55, () => body.setTint(this.bossTint));
    this.tweens.add({ targets: body, scaleX: body.scaleX * 0.94, duration: 60, yoyo: true });
  }

  private updateBoss(delta: number, movedPx: number): void {
    const boss = this.boss;
    if (boss === null) return;
    const cfg = BALANCE.boss;
    const seconds = delta / 1000;

    // 氣勢：隊伍橫向移動的距離累積，不動就自然衰退。
    this.momentum = addMomentum(this.momentum, movedPx, BALANCE.input.momentumPerPixel, cfg.momentumMax);
    this.momentum = Math.max(0, this.momentum - cfg.momentumDecayPerSec * seconds);

    // 我方輸出的視覺回饋：氣勢越高，劍氣越密。
    this.slashAccum += delta * (1 + this.momentum);
    if (this.slashAccum >= 420) {
      this.slashAccum = 0;
      this.spawnSlash();
      this.bossHitAnimation();
      audio.play('bossHit');
    }

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
      this.bossAttackAnimation();
      audio.play('bossAttack');
      this.layoutCrowd();
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
        BOSS_Y + Phaser.Math.Between(-46, 46),
        ART.slash,
      )
      .setDisplaySize(118, 118)
      .setTint(hexToNumber(this.run.loadout.sect.color))
      .setAngle(Phaser.Math.Between(-40, 220))
      .setAlpha(0.7)
      // 加亮混色：劍氣看起來是發光的能量，而不是糊在首領臉上的一塊色板。
      .setBlendMode(Phaser.BlendModes.ADD)
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
