import Phaser from 'phaser';
import { audio } from '../audio';
import {
  ART,
  DISCIPLE_DISPLAY_HEIGHT,
  DISCIPLE_SOURCE_HEIGHT,
  ENEMY_DISPLAY_HEIGHT,
  ENEMY_SOURCE_HEIGHT,
  bossTexture,
  createWalkAnimations,
  discipleTexture,
  discipleTierForRealm,
  discipleWalkKey,
  enemyTexture,
  enemyWalkKey,
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
  clampWeaken,
  clearReward,
  comboBossMomentum,
  comboMultiplier,
  createBoss,
  createRunState,
  defeatReward,
  gateSpeedForStage,
  mobLoss,
  mobLossRatio,
  resolveMob,
  teamPower,
} from '../systems/run';
import { drawBackdrop } from '../ui/backdrop';
import { createButton } from '../ui/button';
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
const MAX_CROWD_DOTS = 30;
/** 敵陣一排幾名兵卒。 */
const MOB_ROW = 6;
/** 首領往下移，把畫面頂端讓給血條，中段留給隊伍的攻勢演出。 */
const BOSS_Y = 372;

interface EncounterView {
  encounter: Encounter;
  container: Phaser.GameObjects.Container;
  resolved: boolean;
  /** 敵陣才有：用於結算時的擊退演出。 */
  enemies: Phaser.GameObjects.Sprite[];
  /** 敵陣中還沒被靈光鎖定的兵卒。 */
  alive: Phaser.GameObjects.Sprite[];
  /** 已鎖定但靈光還在飛的數量，計入上限判定，避免同一幀連發超打。 */
  pending: number;
  /** 已被齊射削掉的威脅比例（0–1），結算時計入。 */
  weaken: number;
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

  /** 路面往下捲的紋路。隊伍在跑但畫面靜止時完全沒有速度感，這是最便宜的解法。 */
  private groundLines: Phaser.GameObjects.Rectangle[] = [];
  private crowd!: Phaser.GameObjects.Container;
  private crowdSprites: Phaser.GameObjects.Sprite[] = [];
  private crowdSlots: CrowdSlot[] = [];
  private visibleCount = 0;
  private bobTime = 0;

  /** 手指的目標位置；隊伍每幀往它逼近。 */
  private targetX = LANE_X[0];
  private lastCrowdX = LANE_X[0];

  private hudPower!: Phaser.GameObjects.Text;
  private hudDisciples!: Phaser.GameObjects.Text;
  private hudArms!: Phaser.GameObjects.Text;
  private hudGold!: Phaser.GameObjects.Text;
  private hudProgress!: Phaser.GameObjects.Text;
  private hudProgressBar!: Phaser.GameObjects.Rectangle;
  /** 左上角的連擊層數，仿影片那疊會越疊越高的倍率牌。 */
  private comboPlate!: Phaser.GameObjects.Rectangle;
  private comboBig!: Phaser.GameObjects.Text;
  private comboSub!: Phaser.GameObjects.Text;

  /** 陣前齊射的計時器。 */
  private volleyAccum = 0;

  private boss: BossState | null = null;
  private bossGroup: Phaser.GameObjects.Container | null = null;
  private bossFigure: Phaser.GameObjects.Container | null = null;
  private bossBody: Phaser.GameObjects.Image | null = null;
  private bossTint = 0xffffff;
  private bossHpBar: Phaser.GameObjects.Rectangle | null = null;
  private bossHpText: Phaser.GameObjects.Text | null = null;
  private momentum = 0;
  private momentumBar: Phaser.GameObjects.Rectangle | null = null;
  /** 首領戰的氣勢倍率讀數（×1.8 這種大字），比長條好讀得多。 */
  private momentumText: Phaser.GameObjects.Text | null = null;
  /** 上一次劍氣之後累積的傷害，用來跳傷害數字。 */
  private slashDamage = 0;
  private bossTimeLeft = 0;
  private bossTimerBar: Phaser.GameObjects.Rectangle | null = null;
  private bossAttackAccum = 0;
  private slashAccum = 0;
  /** 手指靜止多久了。超過門檻就進入守勢。 */
  private idleMs = 0;
  /** 本場最高人數與首領戰耗時，供成就統計使用。 */
  private peakDisciples = 0;
  private bossElapsed = 0;
  private guarding = false;
  private stanceText: Phaser.GameObjects.Text | null = null;

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
    this.momentumText = null;
    this.bossAttackAccum = 0;
    this.slashAccum = 0;
    this.slashDamage = 0;
    this.volleyAccum = 0;
    this.idleMs = 0;
    this.peakDisciples = 0;
    this.bossElapsed = 0;
    this.guarding = false;
    this.stanceText = null;
    this.bobTime = 0;
    this.targetX = GAME_WIDTH / 2;
    this.lastCrowdX = this.targetX;

    const realm = realmForStage(stage);
    createWalkAnimations(this);
    this.ensureSparkTexture();
    audio.playMusic(realmIndexForStage(stage));
    drawBackdrop(this, realm.color, realm.scenery);
    this.drawRoad(realm.color);
    this.buildHud(realm.color);
    this.buildCrowd();
    this.bindInput();
    this.showIntro(realm.color);
  }

  /** 粒子用的小圓點貼圖，程式產生，不需要素材檔。 */
  private ensureSparkTexture(): void {
    if (this.textures.exists('spark')) return;
    const g = this.make.graphics({ x: 0, y: 0 });
    g.fillStyle(0xffffff, 1);
    g.fillCircle(5, 5, 5);
    g.generateTexture('spark', 10, 10);
    g.destroy();
  }

  /** 在指定位置炸開一小撮光點。通過閘門、衝散敵陣時給的即時回饋。 */
  private burst(x: number, y: number, color: string, count: number): void {
    const emitter = this.add.particles(x, y, 'spark', {
      speed: { min: 70, max: 220 },
      angle: { min: 200, max: 340 },
      lifespan: { min: 260, max: 560 },
      scale: { start: 0.8, end: 0 },
      alpha: { start: 0.9, end: 0 },
      tint: hexToNumber(color),
      blendMode: Phaser.BlendModes.ADD,
      emitting: false,
    });
    emitter.setDepth(45);
    emitter.explode(count);
    this.time.delayedCall(700, () => emitter.destroy());
  }

  /**
   * 命中處跳出來的傷害數字。
   *
   * 固定在頭頂的一行字看不出「打到誰、打了幾下」；數字長在被打中的座標上，
   * 連續命中時整片畫面都在跳數字，出手的節奏才讀得出來。
   */
  private floatNumber(x: number, y: number, text: string, color: string, size = 28, rise = 64): void {
    const label = this.add
      .text(x + Phaser.Math.Between(-16, 16), y, text, textStyle({ size, color, bold: true }))
      .setOrigin(0.5)
      .setStroke('#0b0f14', 6)
      .setDepth(70);
    this.tweens.add({
      targets: label,
      y: y - rise - Phaser.Math.Between(-10, 10),
      x: label.x + Phaser.Math.Between(-22, 22),
      alpha: 0,
      scale: 1.18,
      duration: 720,
      ease: 'Quad.easeOut',
      onComplete: () => label.destroy(),
    });
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

    // 路面紋路：等距的橫向細線，跟著關卡速度往下捲，隊伍才像真的在前進。
    const span = GAME_HEIGHT - ROAD_TOP;
    const gap = span / 9;
    this.groundLines = [];
    for (let i = 0; i < 10; i += 1) {
      this.groundLines.push(
        this.add
          .rectangle(GAME_WIDTH / 2, ROAD_TOP + i * gap, ROAD_RIGHT - ROAD_LEFT - 24, 3, hexToNumber(accentHex), 0.1)
          .setDepth(-49),
      );
    }
  }

  private buildHud(accentHex: string): void {
    // HUD 用不透明底色：閘門是從畫面上方生成後往下捲，透明的話會在 HUD 區域露出半截。
    this.add.rectangle(GAME_WIDTH / 2, 61, GAME_WIDTH, 122, BG_PANEL, 1).setDepth(50);
    this.add.rectangle(GAME_WIDTH / 2, 122, GAME_WIDTH, 2, LINE, 0.8).setDepth(50);

    this.add
      .text(24, 22, realmTitle(this.run.stage), textStyle({ size: 26, color: accentHex, bold: true }))
      .setDepth(51);
    this.hudGold = this.add
      .text(GAME_WIDTH - 118, 26, '金幣 0', textStyle({ size: 19, color: GOLD }))
      .setOrigin(1, 0)
      .setDepth(51);

    // 戰力是玩家唯一需要盯的綜合數字，給它最大的字級與最亮的顏色。
    this.hudPower = this.add
      .text(24, 56, '', textStyle({ size: 34, color: GOLD, bold: true }))
      .setDepth(51);
    this.hudDisciples = this.add.text(24, 96, '', textStyle({ size: 19, color: INK_DIM })).setDepth(51);
    this.hudArms = this.add.text(140, 96, '', textStyle({ size: 19, color: INK_DIM })).setDepth(51);
    this.hudProgress = this.add
      .text(GAME_WIDTH - 24, 96, '', textStyle({ size: 18, color: INK_DIM }))
      .setOrigin(1, 0)
      .setDepth(51);

    // 路程進度條：貼在 HUD 底緣，比純文字更快讀出「還有多遠到首領」。
    this.add.rectangle(GAME_WIDTH / 2, 120, GAME_WIDTH, 4, LINE, 0.5).setDepth(51);
    this.hudProgressBar = this.add
      .rectangle(0, 120, 0, 4, hexToNumber(accentHex), 1)
      .setOrigin(0, 0.5)
      .setDepth(52);

    // 連擊讀數：仿影片左上角那疊倍率牌，越連越大，踩陷阱就整個掉下來。
    // 底板是必要的：閘門會從這一區捲過去，沒有底板時數字會和閘門的字糊在一起。
    this.comboPlate = this.add
      .rectangle(22, 126, 168, 78, BG_PANEL, 0.82)
      .setOrigin(0, 0)
      .setDepth(50)
      .setVisible(false);
    this.comboBig = this.add
      .text(30, 132, '', textStyle({ size: 44, color: GOLD, bold: true }))
      .setStroke('#0b0f14', 7)
      .setDepth(51);
    this.comboSub = this.add
      .text(32, 180, '', textStyle({ size: 16, color: GOLD }))
      .setStroke('#0b0f14', 5)
      .setDepth(51);

    createButton(this, GAME_WIDTH - 62, 34, {
      width: 84,
      height: 44,
      label: '放棄',
      fontSize: 18,
      onClick: () => this.finish(false, 'abandon'),
    }).container.setDepth(52);

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
      const radius = ring * 17 + rng.next() * 8;
      slots.push({
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius * 0.62,
        scale: 1,
        phase: rng.next() * Math.PI * 2,
      });
    }
    slots.sort((a, b) => a.y - b.y);
    this.crowdSlots = slots;

    // 門人已是全彩貼圖，不再用 setTint 上色；門派差異來自造型本身。
    // 造型階級隨境界提升，越後面的境界穿得越好。
    const art = this.run.loadout.sect.art;
    const tier = discipleTierForRealm(realmIndexForStage(this.run.stage));
    this.crowdSprites = slots.map((slot) => {
      const sprite = this.add
        .sprite(0, 0, discipleTexture(art, tier, 0))
        .setOrigin(0.5, 0.85)
        .setVisible(false);
      sprite.play(discipleWalkKey(art, tier));
      // 每個人的步伐錯開，整團才不會像同一個人複製了三十份。
      sprite.anims.setProgress((slot.phase / (Math.PI * 2)) % 1);
      return sprite;
    });

    this.crowd = this.add.container(this.targetX, CROWD_Y, [...this.crowdSprites]).setDepth(30);
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
    this.scrollGround(step);
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

    this.updateVolley(delta);

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

  /** 路面紋路往下捲，超出畫面就繞回頂端。 */
  private scrollGround(step: number): void {
    const span = GAME_HEIGHT - ROAD_TOP;
    for (const line of this.groundLines) {
      line.y += step;
      if (line.y > GAME_HEIGHT) line.y -= span;
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
    this.views.push({
      encounter,
      ...view,
      alive: [...view.enemies],
      pending: 0,
      weaken: 0,
      resolved: false,
    });
  }

  /** 閘門的顏色只用在線條與文字上，不鋪底色。 */
  private gateAccent(choice: GateChoice): string {
    if (choice.trap) return DANGER;
    if (choice.target === 'gold') return GOLD;
    if (choice.target === 'arms') return '#7fd8ff';
    return JADE;
  }

  private buildGateView(
    left: GateChoice,
    right: GateChoice,
  ): Omit<EncounterView, 'encounter' | 'resolved' | 'alive' | 'pending' | 'weaken'> {
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

  private buildMobView(
    encounter: MobEncounter,
  ): Omit<EncounterView, 'encounter' | 'resolved' | 'alive' | 'pending' | 'weaken'> {
    const container = this.add.container(0, 0).setDepth(20);
    const enemies: Phaser.GameObjects.Sprite[] = [];
    const scale = ENEMY_DISPLAY_HEIGHT / ENEMY_SOURCE_HEIGHT;
    const span = ROAD_RIGHT - ROAD_LEFT - 40;

    for (let i = 0; i < MOB_ROW; i += 1) {
      const x = ROAD_LEFT + 20 + (span * i) / (MOB_ROW - 1);
      const enemy = this.add
        .sprite(x, i % 2 === 0 ? 0 : 6, enemyTexture(encounter.art, 0))
        .setOrigin(0.5, 0.9)
        .setScale(scale);
      enemy.play(enemyWalkKey(encounter.art));
      enemy.anims.setProgress((i / MOB_ROW) % 1);
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

  /**
   * 陣前齊射。
   *
   * 敵陣進入射程後，門人會朝正前方的敵人放出靈光；被打掉的兵卒不只是消失，
   * 而是實際削掉這一排的威脅（上限見 balance.json 的 volleyMaxWeaken）。
   * 射界有寬度限制，所以「敵陣還遠的時候就走到人多的那一側」是有回報的操作，
   * 讓走位在選閘門之外多了一層用途。
   */
  private updateVolley(delta: number): void {
    const target = this.views.find(
      (view) =>
        !view.resolved &&
        view.encounter.kind === 'mob' &&
        view.alive.length > 0 &&
        // 在途的靈光也算進上限，否則同一幀連發會打掉超過上限的兵卒。
        view.weaken + view.pending / MOB_ROW < BALANCE.run.volleyMaxWeaken &&
        CROWD_Y - view.container.y <= BALANCE.run.volleyRangePx &&
        view.container.y > ROAD_TOP - 40,
    );
    if (target === undefined) {
      this.volleyAccum = 0;
      return;
    }

    this.volleyAccum += delta;
    while (this.volleyAccum >= BALANCE.run.volleyIntervalMs) {
      this.volleyAccum -= BALANCE.run.volleyIntervalMs;
      this.fireVolley(target);
    }
  }

  private fireVolley(view: EncounterView): void {
    if (view.encounter.kind !== 'mob') return;
    const cone = BALANCE.run.volleyConeHalfPx;
    const inCone = view.alive.filter((enemy) => Math.abs(enemy.x - this.crowd.x) <= cone);
    if (inCone.length === 0) return;

    // 射界內挑最近的一個，讓玩家覺得靈光是自己「瞄」出去的。
    let enemy = inCone[0];
    if (enemy === undefined) return;
    for (const candidate of inCone) {
      if (Math.abs(candidate.x - this.crowd.x) < Math.abs(enemy.x - this.crowd.x)) enemy = candidate;
    }
    const chosen = enemy;
    // 鎖定當下就從待打名單移除，兩道靈光才不會撲同一個人。
    view.alive.splice(view.alive.indexOf(chosen), 1);
    view.pending += 1;

    const fromX = this.crowd.x;
    const fromY = CROWD_Y - 46;
    const toX = chosen.x;
    const toY = view.container.y + chosen.y - 30;
    const bolt = this.add
      .image(fromX, fromY, 'spark')
      .setDisplaySize(9, 30)
      .setTint(hexToNumber(this.run.loadout.sect.color))
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(35);
    bolt.setRotation(Math.atan2(toY - fromY, toX - fromX) + Math.PI / 2);
    audio.play('swipe');

    this.tweens.add({
      targets: bolt,
      x: toX,
      y: toY,
      duration: Phaser.Math.Clamp(Phaser.Math.Distance.Between(fromX, fromY, toX, toY) * 0.55, 110, 320),
      ease: 'Quad.easeIn',
      onComplete: () => {
        bolt.destroy();
        this.landVolley(view, chosen);
      },
    });
  }

  /** 靈光命中：削掉這一排的威脅，並把「少死幾個人」直接寫在畫面上。 */
  private landVolley(view: EncounterView, enemy: Phaser.GameObjects.Sprite): void {
    view.pending -= 1;
    if (view.resolved || view.encounter.kind !== 'mob') return;

    const before = mobLoss(this.run, view.encounter, view.weaken);
    view.weaken = clampWeaken(view.weaken + 1 / MOB_ROW);
    const saved = before - mobLoss(this.run, view.encounter, view.weaken);

    const worldY = view.container.y + enemy.y;
    this.burst(enemy.x, worldY - 30, this.run.loadout.sect.color, 8);
    if (saved > 0) this.floatNumber(enemy.x, worldY - 54, `+${saved}`, JADE, 26);

    this.tweens.killTweensOf(enemy);
    enemy.anims.stop();
    enemy.setTintFill(0xffffff);
    this.tweens.add({
      targets: enemy,
      y: enemy.y - 26,
      alpha: 0,
      angle: Phaser.Math.Between(-70, 70),
      duration: 260,
      ease: 'Quad.easeOut',
    });
  }

  private resolveView(view: EncounterView): void {
    view.resolved = true;

    if (view.encounter.kind === 'gate') {
      // 隊伍中心落在哪一半，就吃哪一側的閘門。
      const choice = this.crowd.x < GAME_WIDTH / 2 ? view.encounter.left : view.encounter.right;
      const result = applyGate(this.run, choice);
      const positive = result.discipleDelta + result.armsDelta + result.goldDelta >= 0;

      // 收益直接跳在隊伍身上，一項一個數字：不用先讀完一整行字才知道剛剛拿到什麼。
      if (result.discipleDelta !== 0) {
        this.floatNumber(
          this.crowd.x,
          CROWD_Y - 96,
          `${result.discipleDelta > 0 ? '+' : ''}${formatNumber(result.discipleDelta)} 人`,
          result.discipleDelta > 0 ? JADE : DANGER,
          34,
        );
      }
      if (result.armsDelta !== 0) {
        this.floatNumber(
          this.crowd.x - 74,
          CROWD_Y - 134,
          `${result.armsDelta > 0 ? '+' : ''}${formatNumber(result.armsDelta)} 武裝`,
          result.armsDelta > 0 ? '#7fd8ff' : DANGER,
          28,
        );
      }
      if (result.goldDelta !== 0) {
        this.floatNumber(this.crowd.x + 74, CROWD_Y - 134, `+${formatNumber(result.goldDelta)} 金`, GOLD, 28);
      }
      // 文字只留給「數字說不清楚」的被動效果。
      if (result.passiveNote !== null) this.popup(result.passiveNote, JADE);
      this.refreshCombo(result.comboBroken);
      audio.play(choice.target === 'gold' ? 'gold' : positive ? 'gateGood' : 'gateTrap');
      this.burst(this.crowd.x, CROWD_Y - 30, this.gateAccent(choice), positive ? 16 : 10);
      this.tweens.add({ targets: view.container, alpha: 0, duration: 260 });
    } else {
      const loss = resolveMob(this.run, view.encounter, view.weaken);
      if (loss === 0) this.popup('銅皮鐵骨　免傷', JADE);
      else this.floatNumber(this.crowd.x, CROWD_Y - 96, `-${formatNumber(loss)} 人`, DANGER, 36);
      if (view.weaken > 0) {
        this.floatNumber(
          this.crowd.x,
          CROWD_Y - 150,
          `齊射削弱 ${Math.round(view.weaken * 100)}%`,
          '#7fd8ff',
          22,
        );
      }
      this.cameras.main.shake(160, 0.006);
      audio.play('mob');
      this.burst(this.crowd.x, CROWD_Y - 40, DANGER, 20);
      // 已被靈光打掉的不再演出擊退，剩下的才被隊伍衝散。
      this.knockBack(view.enemies.filter((enemy) => enemy.alpha > 0.1));
    }

    this.layoutCrowd();
    this.updateHud();

    if (this.run.disciples <= 0) this.finish(false, 'route');
  }

  /** 敵陣被衝散：閃白、向外彈開、淡出。 */
  private knockBack(enemies: readonly Phaser.GameObjects.Sprite[]): void {
    enemies.forEach((enemy, index) => {
      this.tweens.killTweensOf(enemy);
      enemy.anims.stop();
      // 全彩貼圖用 setTintFill 才會整片閃白；setTint(0xffffff) 等於沒上色。
      enemy.setTintFill(0xffffff);
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

  /**
   * 連擊讀數的更新與演出。
   *
   * 連擊只放大金幣與首領戰的開場氣勢，不放大當場戰力——所以它是「這一場走得多乾淨」的
   * 計分板，而不是又一條讓本關變簡單的捷徑。
   */
  private refreshCombo(broken = false): void {
    const combo = this.run.combo;
    if (broken || combo < 2) {
      if (broken) this.floatNumber(this.crowd.x, CROWD_Y - 210, '連擊中斷', DANGER, 26);
      this.hideCombo();
      return;
    }

    const bonus = Math.round((comboMultiplier(combo) - 1) * 100);
    this.comboPlate.setVisible(true);
    this.comboBig.setText(`×${combo}`);
    this.comboSub.setText(`連擊　金幣 +${bonus}%`);
    // 每疊一層彈一下，疊到上限就改成常亮的翠色，讓玩家知道再連也不會更多。
    const capped = combo >= BALANCE.run.comboMaxStack;
    this.comboBig.setColor(capped ? JADE : GOLD);
    this.comboSub.setColor(capped ? JADE : GOLD);
    this.tweens.killTweensOf(this.comboBig);
    this.comboBig.setScale(1.35);
    this.tweens.add({ targets: this.comboBig, scale: 1, duration: 220, ease: 'Back.easeOut' });
  }

  private hideCombo(): void {
    this.comboPlate.setVisible(false);
    this.comboBig.setText('');
    this.comboSub.setText('');
  }

  private updateHud(): void {
    this.peakDisciples = Math.max(this.peakDisciples, this.run.disciples);
    this.hudPower.setText(`戰力 ${formatNumber(teamPower(this.run))}`);
    this.hudDisciples.setText(`弟子 ${formatNumber(this.run.disciples)}`);
    this.hudArms.setText(`武裝 ${formatNumber(this.run.arms)}`);
    this.hudGold.setText(`金幣 ${formatNumber(this.run.goldCollected)}`);
    const total = this.run.encounters.length;
    const done = Math.min(total, this.spawnIndex);
    const boss = this.phase === 'boss';
    this.hudProgress.setText(boss ? '首領戰' : `路程 ${done}/${total}`);
    this.hudProgressBar.setDisplaySize(boss ? GAME_WIDTH : GAME_WIDTH * (done / Math.max(1, total)), 4);
  }

  // -------------------------------------------------------------- 首領戰

  private startBoss(): void {
    if (this.phase !== 'running') return;
    this.phase = 'boss';

    const rng = createRng(this.run.stage * 31337 + this.run.disciples);
    this.boss = createBoss(this.run.stage, rng);
    this.bossTimeLeft = BALANCE.boss.timeLimitMs;
    this.bossAttackAccum = 0;
    // 劍修：開場氣勢全滿，換來的是衰退加倍——前段爆發型的打法。
    // 沿路累積的連擊也換成開場氣勢：走得乾淨的人，決戰第一秒就領先。
    const carried = comboBossMomentum(this.run.combo);
    this.momentum = Math.min(
      BALANCE.boss.momentumMax,
      BALANCE.boss.momentumMax * this.run.loadout.sect.bossStartMomentum + carried,
    );
    if (carried > 0) {
      this.floatNumber(GAME_WIDTH / 2, CROWD_Y - 240, `連擊 ×${this.run.combo} → 開場氣勢`, GOLD, 26);
    }
    this.hideCombo();
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
      .setTintFill(hexToNumber(DANGER))
      .setAlpha(0.34);
    // 首領貼圖本身已上色，只留光暈帶境界色，本體不再整隻染成一個色調。
    const body = this.add.image(0, 0, texture).setDisplaySize(200, 200);
    this.bossBody = body;

    const figure = this.add.container(cx, BOSS_Y, [aura, glow, body]);
    this.bossFigure = figure;
    // 擺動掛在容器上，光暈／描邊／本體才會一起動而不會彼此錯開。
    // 待機：緩慢起伏加左右微擺，讓首領在等待時也是活的。
    this.tweens.add({ targets: figure, y: BOSS_Y + 14, duration: 1300, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.tweens.add({ targets: figure, angle: 2.5, duration: 1900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.tweens.add({ targets: aura, alpha: 0.24, duration: 1400, yoyo: true, repeat: -1 });

    // 血條移到畫面最上緣：戰鬥發生在中段，玩家的視線不必在血條與首領之間來回跳。
    const name = this.add
      .text(cx, 150, boss.def.name, textStyle({ size: 34, color: DANGER, bold: true }))
      .setOrigin(0.5)
      .setStroke('#0b0f14', 6);
    const taunt = this.add
      .text(cx, 182, `「${boss.def.taunt}」`, textStyle({ size: 17, color: INK_DIM }))
      .setOrigin(0.5);

    const barWidth = GAME_WIDTH - 120;
    const barBg = this.add.rectangle(cx, 212, barWidth, 26, 0x2a1216, 1).setStrokeStyle(2, LINE);
    this.bossHpBar = this.add.rectangle(cx - barWidth / 2, 212, barWidth, 22, 0xc03a4a, 1).setOrigin(0, 0.5);
    this.bossHpText = this.add
      .text(cx, 212, '', textStyle({ size: 17, color: INK, bold: true }))
      .setOrigin(0.5);

    const timerBg = this.add.rectangle(cx, 234, barWidth, 8, 0x1b232b, 1);
    this.bossTimerBar = this.add.rectangle(cx - barWidth / 2, 234, barWidth, 8, 0x7a8fa0, 1).setOrigin(0, 0.5);

    // 氣勢改成大字倍率讀數：長條只看得出「多還是少」，×1.8 才看得出「值不值得再晃」。
    this.momentumText = this.add
      .text(cx, 512, '', textStyle({ size: 52, color: GOLD, bold: true }))
      .setOrigin(0.5)
      .setStroke('#0b0f14', 8);
    const momentumLabel = this.add
      .text(cx, 550, '氣勢　左右晃動可提升傷害', textStyle({ size: 17, color: GOLD }))
      .setOrigin(0.5);
    const momentumBg = this.add.rectangle(cx, 574, barWidth, 14, 0x1b232b, 1).setStrokeStyle(2, LINE);
    this.momentumBar = this.add.rectangle(cx - barWidth / 2, 574, 0, 10, hexToNumber(GOLD), 1).setOrigin(0, 0.5);
    this.stanceText = this.add
      .text(cx, 604, '', textStyle({ size: 20, color: INK, bold: true }))
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
      this.momentumText,
      momentumBg,
      this.momentumBar,
      momentumLabel,
      this.stanceText,
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
    body.setTintFill(0xffffff);
    this.time.delayedCall(55, () => body.clearTint());
    this.tweens.add({ targets: body, scaleX: body.scaleX * 0.94, duration: 60, yoyo: true });
  }

  private updateBoss(delta: number, movedPx: number): void {
    const boss = this.boss;
    if (boss === null) return;
    const cfg = BALANCE.boss;
    const seconds = delta / 1000;

    // 氣勢：隊伍橫向移動的距離累積，不動就自然衰退（劍修衰退加倍）。
    this.momentum = addMomentum(this.momentum, movedPx, BALANCE.input.momentumPerPixel, cfg.momentumMax);
    this.momentum = Math.max(
      0,
      this.momentum - cfg.momentumDecayPerSec * this.run.loadout.sect.momentumDecayMultiplier * seconds,
    );

    // 守勢：手指停住不動就轉為防禦——輸出砍半，但挨打也砍半。
    // 隊伍快被磨光時停手保命，血量健康時猛攻速殺，首領戰因此有了取捨。
    this.idleMs = Math.abs(movedPx) < 0.6 ? this.idleMs + delta : 0;
    this.guarding = this.idleMs >= cfg.guardIdleMs;
    this.stanceText?.setText(this.guarding ? '守勢　減傷但輸出減半' : '猛攻');
    this.stanceText?.setColor(this.guarding ? '#7fd8ff' : DANGER);
    const dpsScale = this.guarding ? cfg.guardDpsMultiplier : 1;

    const damage = bossDps(this.run, this.momentum) * dpsScale * seconds;
    boss.hp -= damage;
    this.slashDamage += damage;

    // 我方輸出的視覺回饋：氣勢越高，劍氣越密，並在首領身上跳出這一擊的傷害。
    this.slashAccum += delta * (1 + this.momentum) * dpsScale;
    if (this.slashAccum >= 420) {
      this.slashAccum = 0;
      this.spawnSlash();
      this.bossHitAnimation();
      this.floatNumber(
        GAME_WIDTH / 2 + Phaser.Math.Between(-70, 70),
        BOSS_Y + Phaser.Math.Between(-40, 30),
        `-${formatNumber(this.slashDamage)}`,
        this.momentum > BALANCE.boss.momentumMax * 0.6 ? GOLD : INK,
        this.momentum > BALANCE.boss.momentumMax * 0.6 ? 34 : 28,
      );
      this.slashDamage = 0;
      audio.play('bossHit');
    }

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
      const raw = bossHitLoss(this.run, boss);
      const loss = Math.min(
        this.run.disciples,
        Math.max(1, Math.round(raw * (this.guarding ? cfg.guardDamageMultiplier : 1))),
      );
      this.run.disciples -= loss;
      this.floatNumber(this.crowd.x, CROWD_Y - 92, `-${formatNumber(loss)}`, DANGER, 36, 32);
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

    this.bossElapsed += delta;
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
      10,
    );
    this.momentumText?.setText(`×${(1 + this.momentum).toFixed(2)}`);
    this.momentumText?.setColor(this.momentum > BALANCE.boss.momentumMax * 0.6 ? GOLD : INK_DIM);
  }

  // -------------------------------------------------------------- 結束

  /**
   * 失敗診斷：從這場的實際數字挑出最該補的一項。
   * 只說「道消」玩家學不到東西，會一直用同一套打法重撞。
   */
  private diagnose(reason: 'route' | 'wiped' | 'timeout' | 'abandon' | null): string {
    if (reason === 'abandon') return '中途退出，未計入通關';
    const perUnit = this.run.loadout.attack + this.run.arms;
    const armsShare = this.run.arms / Math.max(1, perUnit);
    if (reason === 'route') {
      return armsShare < 0.5
        ? '武裝值太低，敵陣的比例傷亡吃掉了整支隊伍——多走武裝閘門，或提升護體罡氣'
        : '人數不足以撐過沿路消耗——多走人數閘門，或提升聚眾成軍';
    }
    if (reason === 'timeout') {
      return '輸出不足，時限內打不動首領——人數與武裝要一起長，或提升斬妖訣';
    }
    return armsShare < 0.5
      ? '首領的攻勢太猛而減傷太薄——武裝值同時是減傷來源，或提升護體罡氣'
      : '人數在首領戰中被磨光——需要更大的隊伍，或提升聚眾成軍';
  }

  private finish(victory: boolean, reason: 'route' | 'wiped' | 'timeout' | 'abandon' | null): void {
    if (this.phase === 'over') return;
    this.phase = 'over';
    this.bossGroup?.setAlpha(0.6);
    audio.play(victory ? 'victory' : 'defeat');

    const result: RunResultData = {
      victory,
      diagnosis: victory ? null : this.diagnose(reason),
      stage: this.run.stage,
      bossName: this.boss?.def.name ?? '首領',
      survivors: Math.max(0, this.run.disciples),
      peakDisciples: Math.max(this.peakDisciples, this.run.disciples),
      arms: this.run.arms,
      bossMs: Math.round(this.bossElapsed),
      goldCollected: this.run.goldCollected,
      goldReward: victory ? clearReward(this.run) : defeatReward(this.run),
      defeatReason: reason,
    };

    this.cameras.main.fadeOut(420, 0, 0, 0);
    this.time.delayedCall(460, () => this.scene.start('Result', result));
  }
}
