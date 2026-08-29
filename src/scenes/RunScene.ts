import Phaser from 'phaser';
import { audio } from '../audio';
import {
  ENEMY_DISPLAY_HEIGHT,
  ENEMY_SOURCE_HEIGHT,
  DISCIPLE_DISPLAY_HEIGHT,
  DISCIPLE_SOURCE_HEIGHT,
  bossTexture,
  createWalkAnimations,
  discipleTexture,
  discipleTierForRealm,
  discipleWalkKey,
  enemyTexture,
  enemyWalkKey,
} from '../art';
import { GAME_WIDTH } from '../config';
import { BALANCE, CARDS } from '../data';
import { persist, state } from '../state';
import type { Card } from '../systems/deck';
import { cardDef, fieldDps, maxTierForStage } from '../systems/deck';
import type { ActiveEnemy, CardSlot, DefenseState, TickReport } from '../systems/defense';
import {
  LANES,
  cardAt,
  clearReward,
  createDefenseState,
  defeatReward,
  discardHand,
  dropOn,
  tickCombat,
} from '../systems/defense';
import type { FormationLine } from '../systems/formation';
import { activeFormations, formationEffect, formationName } from '../systems/formation';
import { boardBonuses } from '../systems/board';
import { buildLoadout } from '../systems/loadout';
import type { TutorialStep } from '../systems/tutorial';
import {
  HINT_BOSS,
  HINT_FORMATION,
  HINT_GATE_SIEGE,
  HINT_HAND_FULL,
  HINT_TUTORIAL,
  advanceStep,
  markHintSeen,
  shouldRunTutorial,
  tutorialCopy,
  tutorialField,
  tutorialHand,
} from '../systems/tutorial';
import { realmForStage, realmIndexForStage, realmTitle } from '../systems/realms';
import { createRng } from '../systems/rng';
import { drawBackdrop } from '../ui/backdrop';
import { createButton } from '../ui/button';
import { CARD_HEIGHT, CARD_WIDTH, createCardView } from '../ui/card';
import type { CardView } from '../ui/card';
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

/** 妖魔的行進區間。上緣是妖魔出場處，下緣就是山門。 */
const ARENA_TOP = 116;
const GATE_Y = ARENA_TOP + BALANCE.wave.trackPx;
const ARENA_LEFT = 22;
const ARENA_RIGHT = GAME_WIDTH - 22;
const LANE_WIDTH = (ARENA_RIGHT - ARENA_LEFT) / LANES;

/** 場上陣位：三欄，往上疊列。陣法擴充買到的格位會往上長一列。 */
const FIELD_COLUMNS = BALANCE.formation.columns;
const FIELD_COL_X = [GAME_WIDTH / 2 - 100, GAME_WIDTH / 2, GAME_WIDTH / 2 + 100] as const;
const FIELD_BOTTOM_Y = GATE_Y - 48;
const FIELD_ROW_GAP = 96;

/** 手牌：畫面最下方一排。 */
const HAND_Y = 872;
const HAND_STEP = 100;
/**
 * 放開手指時，離格位中心多遠還算落在那一格。
 *
 * 陣位的間距是 100（橫）與 96（縱），所以 62 大約是「到最近的一格為止」，
 * 而不會大到讓對角線的格子也搶得到。
 */
const SNAP_RADIUS = 62;
/** 距離差在這個範圍內時，優先選合得起來的那一格。 */
const MERGE_SLACK = 26;

/** 一幀最多畫幾道靈光。掉幀時寧可少畫幾道，也不要為了補畫而更卡。 */
const MAX_TRACERS_PER_FRAME = 5;

type DragSource = CardSlot;

/**
 * 山門防守戰。
 *
 * 玩法：妖魔由上而下推進，玩家把手牌的法寶符拖到場上的陣位，符會自動朝上出手；
 * 把同種同階的符疊在一起可以合成高一階的符——輸出是指數的，妖魔的血量也是，
 * 所以「這一張要放下去還是留著合」是每隔幾秒就要做一次的決定。
 *
 * 數值全部來自 src/systems/defense.ts（其數值又來自 data/*.json），本檔只負責呈現與輸入。
 * 特別是：**戰鬥推進呼叫的 tickCombat 與平衡模擬是同一支**，畫面上看到的就是模擬過的數字。
 */
export class RunScene extends Phaser.Scene {
  private run!: DefenseState;
  private rng!: ReturnType<typeof createRng>;
  private over = false;

  private enemySprites = new Map<number, Phaser.GameObjects.Container>();
  private handViews: CardView[] = [];
  private fieldViews: CardView[] = [];
  private fieldSlotY: number[] = [];

  private drag: DragSource | null = null;
  private lastDrawWarnAt = -9999;
  private lastSiegeWarnAt = -9999;
  private siegeText!: Phaser.GameObjects.Text;
  private dragView!: CardView;
  private dropLabel?: Phaser.GameObjects.Text;
  private fieldHighlights: Phaser.GameObjects.Rectangle[] = [];
  private handHighlights: Phaser.GameObjects.Rectangle[] = [];

  private hudLives!: Phaser.GameObjects.Text;
  private hudPower!: Phaser.GameObjects.Text;
  private hudGold!: Phaser.GameObjects.Text;
  private hudWave!: Phaser.GameObjects.Text;
  private hudTier!: Phaser.GameObjects.Text;
  private hudFormation!: Phaser.GameObjects.Text;
  /** 每個陣位右上角的倍率標籤，例如「×1.70」。 */
  private fieldBonusLabels: Phaser.GameObjects.Text[] = [];
  private waveBar!: Phaser.GameObjects.Rectangle;
  private gateBar!: Phaser.GameObjects.Rectangle;
  private bossPanel: Phaser.GameObjects.Container | null = null;
  private bossBar: Phaser.GameObjects.Rectangle | null = null;
  private bossText: Phaser.GameObjects.Text | null = null;
  private discardZone!: Phaser.GameObjects.Rectangle;
  private drawWarning!: Phaser.GameObjects.Text;

  /** 'done' 代表沒有教學要跑（老玩家或已教過）。 */
  private step: TutorialStep = 'done';
  private coach: Phaser.GameObjects.Container | null = null;
  private coachTitle: Phaser.GameObjects.Text | null = null;
  private coachBody: Phaser.GameObjects.Text | null = null;
  private coachArrow: Phaser.GameObjects.Text | null = null;

  /** 成陣時連起來的光線。陣法看不見就等於不存在。 */
  private formationLayer!: Phaser.GameObjects.Graphics;
  /** 上一次的成陣狀態，用來判斷「剛剛新成了一陣」。 */
  private formationKeys = new Set<string>();

  constructor() {
    super('Run');
  }

  create(): void {
    const save = state();
    if (save.player.sectId === null) {
      this.scene.start('Sect');
      return;
    }

    const stage = save.world.stage;
    const loadout = buildLoadout(save, stage);
    // 種子帶入挑戰次數：同一關重打會換一批妖魔與符，但單次進行中完全可重現。
    this.rng = createRng(stage * 7919 + save.world.runs * 104729);
    this.run = createDefenseState(loadout, this.rng);
    this.over = false;
    this.enemySprites.clear();

    const realm = realmForStage(stage);
    createWalkAnimations(this);
    this.ensureSparkTexture();
    audio.playMusic(realmIndexForStage(stage));
    drawBackdrop(this, realm.color, realm.scenery);

    // 教學要換掉起手牌，必須在建立牌位之前決定，否則陣位數會對不上。
    this.step = shouldRunTutorial(save) ? 'deploy' : 'done';
    if (this.step !== 'done') {
      this.run.field = tutorialField(this.run.field.length);
      this.run.hand = tutorialHand(this.run.hand.length, this.run.loadout.talismans[0]?.id ?? 'flame');
      this.run.cooldowns = this.run.cooldowns.map(() => 0);
    }

    this.drawArena(realm.color);
    this.buildHud(realm.color);
    this.buildFieldSlots();
    this.buildHand();
    this.buildDragLayer();
    this.formationLayer = this.add.graphics().setDepth(24);
    this.formationKeys = new Set<string>();
    this.buildCoach();
    this.refreshCards();
    this.updateHud();
    if (this.step === 'done') this.showIntro(realm.color);
    else this.refreshCoach();
  }

  private ensureSparkTexture(): void {
    if (this.textures.exists('spark')) return;
    const g = this.make.graphics({ x: 0, y: 0 });
    g.fillStyle(0xffffff, 1);
    g.fillCircle(5, 5, 5);
    g.generateTexture('spark', 10, 10);
    g.destroy();
  }

  // -------------------------------------------------------------- 版面

  private drawArena(accentHex: string): void {
    const accent = hexToNumber(accentHex);
    const g = this.add.graphics().setDepth(-50);
    g.fillStyle(0x000000, 0.3);
    g.fillRect(ARENA_LEFT, ARENA_TOP, ARENA_RIGHT - ARENA_LEFT, GATE_Y - ARENA_TOP);
    g.lineStyle(2, accent, 0.22);
    g.strokeRect(ARENA_LEFT, ARENA_TOP, ARENA_RIGHT - ARENA_LEFT, GATE_Y - ARENA_TOP);
    // 五條縱列的分隔線：妖魔沿著列走，玩家才看得出哪一列擠了。
    g.lineStyle(1, accent, 0.1);
    for (let i = 1; i < LANES; i += 1) {
      const x = ARENA_LEFT + LANE_WIDTH * i;
      g.lineBetween(x, ARENA_TOP, x, GATE_Y);
    }

    // 山門：妖魔碰到這條線就算攻進來。
    this.add.rectangle(GAME_WIDTH / 2, GATE_Y + 6, GAME_WIDTH, 12, accent, 0.5).setDepth(28);
    this.gateBar = this.add
      .rectangle(GAME_WIDTH / 2, GATE_Y + 6, GAME_WIDTH, 12, hexToNumber(DANGER), 0)
      .setDepth(29);
    this.add
      .text(GAME_WIDTH / 2, GATE_Y + 26, '山　門', textStyle({ size: 17, color: INK_DIM }))
      .setOrigin(0.5)
      .setDepth(29);

    // 守門的門人：門派造型，隨境界換裝。
    const art = this.run.loadout.sect.art;
    const tier = discipleTierForRealm(realmIndexForStage(this.run.stage));
    const guard = this.add
      .sprite(GAME_WIDTH / 2 - 150, GATE_Y + 34, discipleTexture(art, tier, 0))
      .setOrigin(0.5, 0.5)
      .setScale((DISCIPLE_DISPLAY_HEIGHT * 0.8) / DISCIPLE_SOURCE_HEIGHT)
      .setDepth(29);
    guard.play(discipleWalkKey(art, tier));
    const guard2 = this.add
      .sprite(GAME_WIDTH / 2 + 150, GATE_Y + 34, discipleTexture(art, tier, 0))
      .setOrigin(0.5, 0.5)
      .setScale((DISCIPLE_DISPLAY_HEIGHT * 0.8) / DISCIPLE_SOURCE_HEIGHT)
      .setDepth(29);
    guard2.play(discipleWalkKey(art, tier));
    guard2.anims.setProgress(0.5);

    // 手牌區的底板，和戰場明確分開。
    this.add.rectangle(GAME_WIDTH / 2, 880, GAME_WIDTH, 160, BG_PANEL, 1).setDepth(40);
    this.add.rectangle(GAME_WIDTH / 2, 800, GAME_WIDTH, 2, LINE, 0.8).setDepth(40);
    this.discardZone = this.add
      .rectangle(GAME_WIDTH / 2, 946, GAME_WIDTH, 28, hexToNumber(DANGER), 0.12)
      .setDepth(41)
      .setVisible(false);
    this.add
      .text(GAME_WIDTH / 2, 946, '拖到這裡棄符', textStyle({ size: 15, color: INK_DIM }))
      .setOrigin(0.5)
      .setDepth(42)
      .setAlpha(0.55);
    this.drawWarning = this.add
      .text(GAME_WIDTH / 2, 812, '手牌已滿，符流失了', textStyle({ size: 17, color: DANGER, bold: true }))
      .setOrigin(0.5)
      .setDepth(44)
      .setAlpha(0);
    this.siegeText = this.add
      .text(GAME_WIDTH / 2, GATE_Y - 62, '首領正在砸門！', textStyle({ size: 26, color: DANGER, bold: true }))
      .setOrigin(0.5)
      .setStroke('#0b0f14', 7)
      .setDepth(46)
      .setAlpha(0);
  }

  private buildHud(accentHex: string): void {
    this.add.rectangle(GAME_WIDTH / 2, 55, GAME_WIDTH, 110, BG_PANEL, 1).setDepth(50);
    this.add.rectangle(GAME_WIDTH / 2, 110, GAME_WIDTH, 2, LINE, 0.8).setDepth(50);

    this.add
      .text(20, 14, realmTitle(this.run.stage), textStyle({ size: 22, color: accentHex, bold: true }))
      .setDepth(51);
    this.hudGold = this.add
      .text(GAME_WIDTH - 110, 16, '', textStyle({ size: 17, color: GOLD }))
      .setOrigin(1, 0)
      .setDepth(51);

    // 山門耐久是玩家唯一會輸的資源，給它最大的字。
    this.hudLives = this.add
      .text(20, 42, '', textStyle({ size: 34, color: JADE, bold: true }))
      .setDepth(51);
    this.hudPower = this.add.text(20, 84, '', textStyle({ size: 17, color: INK_DIM })).setDepth(51);
    this.hudTier = this.add.text(190, 84, '', textStyle({ size: 17, color: INK_DIM })).setDepth(51);
    // 陣法是持續生效的狀態，卻只有成立那一瞬間有提示——玩家回報「效果一閃即逝沒看清楚」。
    // 常駐一行，隨時看得到現在有幾條、平均加了多少。
    // 放在「山門」那一列的右側：第二列（道行／階數上限／波次）已經排滿，
    // 硬塞進去三段字會互相壓到。
    this.hudFormation = this.add
      .text(GAME_WIDTH - 20, 52, '', textStyle({ size: 18, color: GOLD, bold: true }))
      .setOrigin(1, 0)
      .setDepth(51);
    this.hudWave = this.add
      .text(GAME_WIDTH - 20, 84, '', textStyle({ size: 17, color: INK_DIM }))
      .setOrigin(1, 0)
      .setDepth(51);

    this.add.rectangle(GAME_WIDTH / 2, 108, GAME_WIDTH, 4, LINE, 0.5).setDepth(51);
    this.waveBar = this.add
      .rectangle(0, 108, 0, 4, hexToNumber(accentHex), 1)
      .setOrigin(0, 0.5)
      .setDepth(52);

    createButton(this, GAME_WIDTH - 56, 30, {
      width: 80,
      height: 40,
      label: '放棄',
      fontSize: 17,
      onClick: () => this.finish(false, 'abandon'),
    }).container.setDepth(52);
  }

  private buildFieldSlots(): void {
    const count = this.run.field.length;
    // Phaser 會重用同一個 Scene 實例，上一關的物件在 shutdown 時已經被銷毀，
    // 但陣列若不清空，這些空殼會留下來——下一關繪製時就會炸在 glTexture 上，畫面直接卡死。
    // 凡是在 build* 裡 push 的陣列，都必須在同一個地方清空。
    this.fieldViews = [];
    this.fieldSlotY = [];
    this.fieldBonusLabels = [];
    this.fieldHighlights = [];
    for (let i = 0; i < count; i += 1) {
      const row = Math.floor(i / FIELD_COLUMNS);
      const col = i % FIELD_COLUMNS;
      const x = FIELD_COL_X[col] ?? GAME_WIDTH / 2;
      const y = FIELD_BOTTOM_Y - row * FIELD_ROW_GAP;
      const view = createCardView(this, x, y);
      view.container.setDepth(26).setScale(0.82);
      this.fieldSlotY.push(y);
      this.fieldViews.push(view);

      // 每一格自己吃到多少，寫在那一格上。陣法的加成是逐格不同的
      // （四角與正中吃三條線、邊中點只吃兩條），只報「成陣了」看不出這件事。
      this.fieldBonusLabels.push(
        this.add
          .text(x + 32, y - 40, '', textStyle({ size: 14, color: GOLD, bold: true }))
          .setOrigin(1, 0)
          .setDepth(30)
          .setStroke('#0b0f14', 4)
          .setVisible(false),
      );

      const hit = this.add
        .rectangle(x, y, CARD_WIDTH, CARD_HEIGHT, 0xffffff, 0)
        .setDepth(27)
        .setInteractive({ useHandCursor: true });
      hit.on('pointerdown', () => this.beginDrag({ where: 'field', index: i }));

      const glow = this.add
        .rectangle(x, y, CARD_WIDTH + 8, CARD_HEIGHT + 8, 0xffffff, 0)
        .setStrokeStyle(3, hexToNumber(JADE), 0)
        .setDepth(25);
      this.fieldHighlights.push(glow);
    }
  }

  private buildHand(): void {
    const count = this.run.hand.length;
    const startX = GAME_WIDTH / 2 - ((count - 1) * HAND_STEP) / 2;
    this.handViews = [];
    this.handHighlights = [];
    for (let i = 0; i < count; i += 1) {
      const x = startX + i * HAND_STEP;
      const view = createCardView(this, x, HAND_Y);
      view.container.setDepth(42);
      this.handViews.push(view);

      const glow = this.add
        .rectangle(x, HAND_Y, CARD_WIDTH + 8, CARD_HEIGHT + 8, 0xffffff, 0)
        .setStrokeStyle(3, hexToNumber(JADE), 0)
        .setDepth(41);
      this.handHighlights.push(glow);

      const hit = this.add
        .rectangle(x, HAND_Y, CARD_WIDTH, CARD_HEIGHT, 0xffffff, 0)
        .setDepth(43)
        .setInteractive({ useHandCursor: true });
      hit.on('pointerdown', () => this.beginDrag({ where: 'hand', index: i }));
    }
  }

  /** 拖曳中的那一張牌畫在最上層，跟著手指走。 */
  private buildDragLayer(): void {
    this.dragView = createCardView(this, 0, 0);
    this.dragView.container.setDepth(90).setVisible(false).setScale(1.06);

    // 拖曳中會不會落在哪一格、落上去會發生什麼，都要在放手**之前**看得到。
    // 玩家回報「合成常常變成取代到別的卡片」有一半是這個：他到放開的那一刻才知道結果。
    this.dropLabel = this.add
      .text(0, 0, '', textStyle({ size: 17, color: INK, bold: true }))
      .setOrigin(0.5)
      .setDepth(92)
      .setStroke('#0b0f14', 5)
      .setVisible(false);

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (this.drag === null) return;
      this.dragView.container.setPosition(pointer.x, pointer.y - 44);
      this.showDropPreview(pointer);
    });
    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => this.endDrag(pointer));
    this.input.on('pointerupoutside', (pointer: Phaser.Input.Pointer) => this.endDrag(pointer));
  }

  // -------------------------------------------------------------- 拖曳

  private cardAt(source: DragSource): Card | null {
    const list = source.where === 'hand' ? this.run.hand : this.run.field;
    return list[source.index] ?? null;
  }

  private beginDrag(source: DragSource): void {
    if (this.over) return;
    const card = this.cardAt(source);
    if (card === null) return;
    this.drag = source;
    this.dragView.refresh(card);
    this.dragView.container.setVisible(true);
    const pointer = this.input.activePointer;
    this.dragView.container.setPosition(pointer.x, pointer.y - 44);
    this.discardZone.setVisible(source.where === 'hand');
    this.showMergeHints(card, source);
    this.refreshCards();
  }

  /**
   * 拖曳中把「合得起來」的格位框起來，手牌與陣位都框。
   * 合成是這個遊戲的核心決策，不能靠玩家自己記哪張是幾階。
   */
  private showMergeHints(card: Card, source: DragSource): void {
    const cap = maxTierForStage(this.run.stage);
    const mark = (glow: Phaser.GameObjects.Rectangle | undefined, target: Card | null, self: boolean): void => {
      if (glow === undefined) return;
      const same =
        !self && target !== null && target.type === card.type && target.tier === card.tier && target.tier < cap;
      const empty = !self && target === null;
      glow.setStrokeStyle(3, hexToNumber(same ? JADE : GOLD), same ? 0.95 : empty ? 0.45 : 0);
    };
    this.fieldHighlights.forEach((glow, index) =>
      mark(glow, this.run.field[index] ?? null, source.where === 'field' && source.index === index),
    );
    this.handHighlights.forEach((glow, index) =>
      mark(glow, this.run.hand[index] ?? null, source.where === 'hand' && source.index === index),
    );
  }

  private clearMergeHints(): void {
    for (const glow of [...this.fieldHighlights, ...this.handHighlights]) {
      glow.setStrokeStyle(3, hexToNumber(JADE), 0);
    }
    this.dropLabel?.setVisible(false);
  }

  /**
   * 拖曳中即時顯示「現在放手會發生什麼」：合成／交換／放置。
   *
   * 這三件事在規則上是同一個手勢（dropOn 一條路徑判定），但對玩家來說結果差很多——
   * 合成不可逆，交換可以再拖回來。差別必須在放手之前就看得到。
   */
  private showDropPreview(pointer: Phaser.Input.Pointer): void {
    const source = this.drag;
    const label = this.dropLabel;
    if (source === null || label === undefined) return;
    const card = this.cardAt(source);
    const target = this.slotAt(pointer.x, pointer.y, card);

    // 先把所有格位還原成一般的合成提示，再單獨標出這一格。
    if (card !== null) this.showMergeHints(card, source);

    if (target === null) {
      const discarding = source.where === 'hand' && pointer.y > 930;
      label.setVisible(discarding).setText(discarding ? '棄符' : '').setColor(DANGER);
      label.setPosition(pointer.x, pointer.y - 108);
      return;
    }

    const glow =
      target.where === 'field' ? this.fieldHighlights[target.index] : this.handHighlights[target.index];
    const existing = cardAt(this.run, target);
    const same = target.where === source.where && target.index === source.index;
    const merges =
      !same &&
      card !== null &&
      existing !== null &&
      existing.type === card.type &&
      existing.tier === card.tier &&
      existing.tier < maxTierForStage(this.run.stage);

    const text = same ? '' : merges ? '合成' : existing === null ? '放置' : '交換';
    const color = merges ? JADE : existing === null ? GOLD : INK_DIM;
    glow?.setStrokeStyle(4, hexToNumber(color), same ? 0 : 1);

    const pos = this.slotPosition(target);
    label.setVisible(text.length > 0).setText(text).setColor(color);
    label.setPosition(pos.x, pos.y - CARD_HEIGHT / 2 - 16);
  }

  private endDrag(pointer: Phaser.Input.Pointer): void {
    const source = this.drag;
    this.drag = null;
    this.dragView.container.setVisible(false);
    this.discardZone.setVisible(false);
    this.clearMergeHints();
    if (source === null || this.over) return;

    const target = this.slotAt(pointer.x, pointer.y, this.cardAt(source));
    if (target !== null) {
      this.applyDrop(source, target);
    } else if (source.where === 'hand' && pointer.y > 930) {
      if (discardHand(this.run, source.index)) audio.play('gateTrap');
    }

    this.refreshCards();
    this.updateHud();
  }

  private applyDrop(source: CardSlot, target: CardSlot): void {
    const card = cardAt(this.run, source);
    const result = dropOn(this.run, source, target, this.rng);
    if (result === 'none' || card === null) return;

    const pos = this.slotPosition(target);
    if (result === 'merged') this.advanceTutorial('merge');
    else if (result === 'moved' && source.where === 'hand' && target.where === 'field') {
      this.advanceTutorial('deploy');
    }
    if (result === 'merged') {
      const merged = cardAt(this.run, target);
      audio.play('gold');
      this.pulseSlot(target, GOLD);
      this.floatText(pos.x, pos.y - 46, `${cardDef(card.type).name} ${merged?.tier ?? ''} 階`, GOLD, 24);
    } else {
      audio.play('gateGood');
      if (target.where === 'field') this.pulseSlot(target, JADE);
    }
  }

  private slotPosition(slot: CardSlot): { x: number; y: number } {
    if (slot.where === 'hand') {
      const view = this.handViews[slot.index];
      return { x: view?.container.x ?? GAME_WIDTH / 2, y: HAND_Y };
    }
    const view = this.fieldViews[slot.index];
    return { x: view?.container.x ?? GAME_WIDTH / 2, y: this.fieldSlotY[slot.index] ?? 0 };
  }

  /**
   * 手指放開的位置落在哪個格位上。手牌與陣位共用一套判定，拖曳才只有一種手勢。
   *
   * **取最近的一格，不是取第一個命中的。** 舊版用「軸向容差 + 依索引先到先得」，
   * 而陣位的列距是 96px、縱向容差卻是 ±60px——相鄰兩列的判定區重疊 24px，
   * 放在兩列之間會靜默落到上面那一列。玩家回報的「合成常常變成取代到別的卡片」就是這個。
   *
   * 另外在**距離相當**時優先選合得起來的那一格（MERGE_SLACK 之內）。
   * 合成是這個遊戲的核心動作，手指差幾個像素不該把它變成一次交換——
   * 交換可以再拖回來，合成錯過的那一張已經被覆蓋掉了。
   */
  private slotAt(x: number, y: number, dragged: Card | null = null): CardSlot | null {
    const cap = maxTierForStage(this.run.stage);
    const candidates: { slot: CardSlot; distance: number; merges: boolean }[] = [];

    const consider = (slot: CardSlot, cx: number, cy: number, target: Card | null): void => {
      const distance = Math.hypot(x - cx, y - cy);
      if (distance > SNAP_RADIUS) return;
      const merges =
        dragged !== null &&
        target !== null &&
        target.type === dragged.type &&
        target.tier === dragged.tier &&
        target.tier < cap;
      candidates.push({ slot, distance, merges });
    };

    for (let i = 0; i < this.fieldViews.length; i += 1) {
      const view = this.fieldViews[i];
      if (view === undefined) continue;
      consider({ where: 'field', index: i }, view.container.x, this.fieldSlotY[i] ?? 0, this.run.field[i] ?? null);
    }
    for (let i = 0; i < this.handViews.length; i += 1) {
      const view = this.handViews[i];
      if (view === undefined) continue;
      consider({ where: 'hand', index: i }, view.container.x, HAND_Y, this.run.hand[i] ?? null);
    }
    if (candidates.length === 0) return null;

    candidates.sort((a, b) => a.distance - b.distance);
    const nearest = candidates[0];
    if (nearest === undefined) return null;
    const merging = candidates.find((c) => c.merges && c.distance <= nearest.distance + MERGE_SLACK);
    return (merging ?? nearest).slot;
  }

  private pulseSlot(slot: CardSlot, color: string): void {
    const view = slot.where === 'hand' ? this.handViews[slot.index] : this.fieldViews[slot.index];
    if (view === undefined) return;
    const base = slot.where === 'hand' ? 1 : 0.82;
    this.tweens.killTweensOf(view.container);
    view.container.setScale(base * 1.25);
    this.tweens.add({ targets: view.container, scale: base, duration: 260, ease: 'Back.easeOut' });
    this.burst(view.container.x, view.container.y, color, 12);
  }

  /**
   * 把成立中的陣法連成光線。
   *
   * 沒有這條線的話，陣法就是一個只會反映在「道行」數字上的隱形加成——
   * 玩家不會知道自己剛剛做對了什麼，也就學不會下次要怎麼排。
   */
  private refreshFormations(): void {
    const lines = activeFormations(this.run.field);
    this.formationLayer.clear();

    for (const line of lines) {
      // 兩種陣式給的量不同，所以顏色也要不同——同一個金色會讓玩家以為只有一種規則。
      // 玩家回報「只知道湊不同的圖案成一條線會有 buff」，正是因為同色那條路看起來一樣。
      const color = hexToNumber(line.pattern === 'distinct' ? JADE : GOLD);
      const points = line.slots.map((slot) => this.slotPosition({ where: 'field', index: slot }));
      const first = points[0];
      const last = points[points.length - 1];
      if (first === undefined || last === undefined) continue;
      // 外粗內細兩道：外面那道是光暈，裡面那道才是線本身。
      this.formationLayer.lineStyle(10, color, 0.18);
      this.formationLayer.lineBetween(first.x, first.y, last.x, last.y);
      this.formationLayer.lineStyle(3, color, 0.85);
      this.formationLayer.lineBetween(first.x, first.y, last.x, last.y);
      for (const point of points) {
        this.formationLayer.fillStyle(color, 0.9);
        this.formationLayer.fillCircle(point.x, point.y, 5);
      }
    }

    // 每一格吃到的總倍率，常駐寫在該格右上角。
    const bonuses = boardBonuses(this.run.field);
    for (let i = 0; i < this.fieldBonusLabels.length; i += 1) {
      const label = this.fieldBonusLabels[i];
      const bonus = bonuses[i];
      if (label === undefined) continue;
      const total = bonus === undefined ? 1 : bonus.damage * bonus.fireRate;
      const show = this.run.field[i] != null && total > 1.005;
      label.setVisible(show).setText(show ? `×${total.toFixed(2)}` : '');
    }

    // 常駐的總覽：幾條、哪一種、全場平均加成。
    if (lines.length === 0) {
      this.hudFormation.setText('');
    } else {
      const distinct = lines.filter((line) => line.pattern === 'distinct').length;
      const filled = bonuses.filter((_bonus, i) => this.run.field[i] != null);
      const average =
        filled.length === 0
          ? 1
          : filled.reduce((sum, b) => sum + b.damage * b.fireRate, 0) / filled.length;
      // 只在全部同一種時標種類；混著成的時候標了反而更難讀，線的顏色已經說了。
      const kinds = distinct === lines.length ? '五行 ' : distinct === 0 ? '同心 ' : '';
      this.hudFormation
        .setText(`陣法 ${kinds}${lines.length} 條　+${Math.round((average - 1) * 100)}%`)
        .setColor(distinct === 0 ? GOLD : JADE);
    }

    // 剛成立的那些才報，已經成立的不重複報。
    // 鍵含 pattern：同一條線從同心變五行是不同的陣，要重報一次。
    const keys = new Set(lines.map((line) => `${line.kind}:${line.pattern}:${line.slots.join(',')}`));
    const fresh = lines.filter(
      (line) => !this.formationKeys.has(`${line.kind}:${line.pattern}:${line.slots.join(',')}`),
    );
    this.formationKeys = keys;
    if (fresh.length > 0) this.announceFormations(fresh);
  }

  /**
   * 報新成立的陣。
   *
   * 一次成好幾條時只報一則總結，不是每條各飄一行——同時三行字疊在一起等於都沒看到。
   */
  private announceFormations(fresh: FormationLine[]): void {
    const first = fresh[0];
    if (first === undefined) return;
    const slot = first.slots[Math.floor(first.slots.length / 2)] ?? 0;
    const pos = this.slotPosition({ where: 'field', index: slot });
    const color = first.pattern === 'distinct' ? JADE : GOLD;
    const text =
      fresh.length === 1
        ? `${formationName(first)}成　${formationEffect(first)}`
        : `一口氣成 ${fresh.length} 條陣`;
    // 停住 1.1 秒再淡出，中文讀得完。
    this.floatText(pos.x, pos.y - 58, text, color, 22, 1100);
    audio.play('gold');
    this.showHintOnce(
      HINT_FORMATION,
      '一整條線全同種（金線）或全不同種（綠線）都會成陣：橫排加傷害、直排加出手速度',
      260,
    );
  }

  private refreshCards(): void {
    this.handViews.forEach((view, index) => {
      const card = this.run.hand[index] ?? null;
      const dragging = this.drag?.where === 'hand' && this.drag.index === index;
      view.refresh(dragging ? null : card);
    });
    this.fieldViews.forEach((view, index) => {
      const card = this.run.field[index] ?? null;
      const dragging = this.drag?.where === 'field' && this.drag.index === index;
      view.refresh(dragging ? null : card);
    });
    this.refreshFormations();
  }

  // -------------------------------------------------------------- 主迴圈

  override update(_time: number, delta: number): void {
    if (this.over) return;
    // 教學的前兩步把戰鬥停住：新手還在找哪裡可以拖的時候，妖魔不該已經走到山門。
    if (this.step === 'deploy' || this.step === 'merge') return;
    const report = tickCombat(this.run, delta, this.rng);
    this.applyReport(report);
    this.syncEnemies();
    this.updateHud();

    if (this.run.outcome === 'cleared') this.finish(true, null);
    else if (this.run.outcome === 'defeated') this.finish(false, 'breached');
    else if (this.run.outcome === 'timeout') this.finish(false, 'timeout');
  }

  private applyReport(report: TickReport): void {
    for (const enemy of report.spawned) this.spawnEnemyView(enemy);

    // 靈光只是演出：傷害在 tickCombat 已經結算完，這裡畫的是「剛剛打到誰」。
    let drawn = 0;
    const hitThisFrame = new Set<number>();
    for (const shot of report.shots) {
      const view = this.enemySprites.get(shot.enemyId);
      const slot = this.fieldViews[shot.slot];
      if (view === undefined || slot === undefined) continue;
      // 命中要有反應。原本只畫一條彈道，妖魔身上什麼都沒發生——
      // 玩家看不出「有沒有打到」，打擊感就是這樣掉的。
      // 一幀之內同一隻只閃一次，密集開火時才不會抖成一團。
      if (!hitThisFrame.has(shot.enemyId)) {
        hitThisFrame.add(shot.enemyId);
        this.flashEnemy(view, shot.killed);
      }
      if (drawn >= MAX_TRACERS_PER_FRAME) continue;
      this.tracer(slot.container.x, slot.container.y - 40, view.x, view.y, shot.slot);
      drawn += 1;
    }

    for (const kill of report.kills) {
      const view = this.enemySprites.get(kill.enemyId);
      if (view !== undefined) {
        this.burst(view.x, view.y, kill.boss ? GOLD : DANGER, kill.boss ? 40 : 10);
        this.floatText(view.x, view.y - 20, `+${Math.max(1, Math.round(kill.gold))}`, GOLD, 20);
        view.destroy();
        this.enemySprites.delete(kill.enemyId);
      }
      if (kill.boss) {
        this.bossPanel?.destroy();
        this.bossPanel = null;
        audio.play('victory');
      } else {
        audio.play('mob');
      }
    }

    for (const leak of report.leaks) {
      const view = this.enemySprites.get(leak.enemyId);
      const x = view?.x ?? GAME_WIDTH / 2;
      // 首領砸門時牠還在場上，不能把牠的圖清掉——牠會一直砸到死或山門破。
      if (!leak.boss) {
        view?.destroy();
        this.enemySprites.delete(leak.enemyId);
      }
      this.cameras.main.shake(leak.boss ? 320 : 200, leak.boss ? 0.016 : 0.01);
      audio.play('bossAttack');
      this.gateBar.setAlpha(1);
      this.tweens.add({ targets: this.gateBar, alpha: 0, duration: 420 });
      this.floatText(
        x,
        GATE_Y - 24,
        leak.immune ? '銅皮鐵骨' : `-${leak.loss}`,
        leak.immune ? JADE : DANGER,
        leak.immune ? 22 : leak.boss ? 40 : 34,
      );
      if (leak.boss) this.warnGateSiege();
    }

    if (report.bossSpawned) {
      this.buildBossPanel();
      this.showHintOnce(HINT_BOSS, '首領血厚，別讓它走到山門——它一撞就是六倍耐久', 300);
    }
    if (report.drawnSlot !== null) {
      this.refreshCards();
      this.pulseHand(report.drawnSlot);
    }
    // 手牌滿的時候幾乎每次抽符都會觸發，不節流的話整片畫面都是這一行字。
    // 也不讓它往上飄——飄起來會蓋到山門那一排，而它要提醒的事就在手牌區。
    if (report.drawLost && this.time.now - this.lastDrawWarnAt > 3500) {
      this.lastDrawWarnAt = this.time.now;
      this.showHintOnce(HINT_HAND_FULL, '手牌滿了會抽不到新符。用不到的符往畫面最下緣拖可以棄掉', 706);
      this.tweens.killTweensOf(this.drawWarning);
      this.drawWarning.setAlpha(1);
      this.tweens.add({ targets: this.drawWarning, alpha: 0, delay: 1200, duration: 500 });
    }
  }

  /**
   * 首領砸門的警告。
   *
   * 首領走到山門不會消失，牠會停在那裡一直砸——這一段是關底真正的張力所在，
   * 必須讓玩家清楚知道「現在是在扣耐久，而且不打死牠不會停」。
   */
  private warnGateSiege(): void {
    if (this.time.now - this.lastSiegeWarnAt < 1200) return;
    this.lastSiegeWarnAt = this.time.now;
    this.siegeText.setAlpha(1);
    this.tweens.killTweensOf(this.siegeText);
    this.tweens.add({ targets: this.siegeText, alpha: 0, delay: 700, duration: 500 });
    this.showHintOnce(HINT_GATE_SIEGE, '首領不會自己離開——不斬掉牠，山門會一直掉耐久', 300);
  }

  private pulseHand(index: number): void {
    const view = this.handViews[index];
    if (view === undefined) return;
    this.tweens.killTweensOf(view.container);
    view.container.setScale(0.6);
    this.tweens.add({ targets: view.container, scale: 1, duration: 220, ease: 'Back.easeOut' });
  }

  private spawnEnemyView(enemy: ActiveEnemy): void {
    const x = ARENA_LEFT + LANE_WIDTH * (enemy.lane + 0.5);
    const container = this.add.container(x, ARENA_TOP).setDepth(enemy.boss ? 24 : 20);

    if (enemy.boss && enemy.bossArt !== null) {
      const aura = this.add.circle(0, 0, 62, hexToNumber(DANGER), 0.16);
      const body = this.add.image(0, 0, bossTexture(enemy.bossArt)).setDisplaySize(140, 140);
      container.add([aura, body]);
      this.tweens.add({ targets: aura, alpha: 0.3, duration: 900, yoyo: true, repeat: -1 });
    } else {
      const scale = ENEMY_DISPLAY_HEIGHT / ENEMY_SOURCE_HEIGHT;
      const sprite = this.add.sprite(0, 0, enemyTexture(enemy.art, 0)).setOrigin(0.5, 0.6).setScale(scale);
      sprite.play(enemyWalkKey(enemy.art));
      sprite.anims.setProgress(this.rng.next());
      container.add(sprite);
    }

    // 一般妖魔各有一條小血條：沒有它就看不出「打不動」和「快死了」的差別。
    // 首領不畫，它的血量已經在畫面頂端有一條大的，畫兩條只是干擾。
    if (!enemy.boss) {
      const barBg = this.add.rectangle(0, -46, 46, 5, 0x000000, 0.6);
      const bar = this.add.rectangle(-23, -46, 46, 5, 0xd8434f, 1).setOrigin(0, 0.5);
      container.add([barBg, bar]);
      container.setData('bar', bar);
    }

    // 減速與灼燒的標記。特效若看不見，玩家就沒有理由相信寒冰符真的有用——
    // 一個沒有回饋的機制等於不存在。
    const frost = this.add.circle(0, -6, 30, 0x7fe0e8, 0.22).setVisible(false);
    const ember = this.add.circle(0, -6, 24, 0xf06a4a, 0.26).setVisible(false);
    container.add([frost, ember]);
    container.setData('frost', frost);
    container.setData('ember', ember);

    this.enemySprites.set(enemy.id, container);
  }

  private syncEnemies(): void {
    for (const enemy of this.run.enemies) {
      const view = this.enemySprites.get(enemy.id);
      if (view === undefined) continue;
      view.y = ARENA_TOP + enemy.y;
      const bar = view.getData('bar') as Phaser.GameObjects.Rectangle | undefined;
      bar?.setDisplaySize(Math.max(0, 46 * (enemy.hp / enemy.maxHp)), 5);
      const frost = view.getData('frost') as Phaser.GameObjects.Arc | undefined;
      const ember = view.getData('ember') as Phaser.GameObjects.Arc | undefined;
      frost?.setVisible(enemy.slowUntilMs > this.run.elapsedMs);
      ember?.setVisible(enemy.burnRemaining > 0);
      if (enemy.boss) this.refreshBossPanel(enemy);
    }
  }

  // -------------------------------------------------------------- 首領

  private buildBossPanel(): void {
    const boss = this.run.bossDef;
    const cx = GAME_WIDTH / 2;
    const width = GAME_WIDTH - 80;
    const name = this.add
      .text(cx, 128, boss.name, textStyle({ size: 26, color: DANGER, bold: true }))
      .setOrigin(0.5)
      .setStroke('#0b0f14', 6);
    const bg = this.add.rectangle(cx, 160, width, 22, 0x2a1216, 1).setStrokeStyle(2, LINE);
    this.bossBar = this.add
      .rectangle(cx - width / 2, 160, width, 18, 0xc03a4a, 1)
      .setOrigin(0, 0.5);
    this.bossText = this.add.text(cx, 160, '', textStyle({ size: 15, color: INK, bold: true })).setOrigin(0.5);
    this.bossPanel = this.add.container(0, 0, [name, bg, this.bossBar, this.bossText]).setDepth(48);

    this.floatText(cx, 300, `「${boss.taunt}」`, INK, 22);
    audio.play('defeat');
  }

  private refreshBossPanel(enemy: ActiveEnemy): void {
    const width = GAME_WIDTH - 80;
    this.bossBar?.setDisplaySize(Math.max(0, width * (enemy.hp / enemy.maxHp)), 18);
    this.bossText?.setText(`${formatNumber(Math.max(0, enemy.hp))} / ${formatNumber(enemy.maxHp)}`);
  }

  // -------------------------------------------------------------- 演出

  private tracer(fromX: number, fromY: number, toX: number, toY: number, slot: number): void {
    const card = this.run.field[slot];
    const color = card === null || card === undefined ? INK : (CARDS.find((c) => c.id === card.type)?.color ?? INK);
    const bolt = this.add
      .image(fromX, fromY, 'spark')
      .setDisplaySize(8, 26)
      .setTint(hexToNumber(color))
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(30);
    bolt.setRotation(Math.atan2(toY - fromY, toX - fromX) + Math.PI / 2);
    this.tweens.add({
      targets: bolt,
      x: toX,
      y: toY,
      duration: Phaser.Math.Clamp(Phaser.Math.Distance.Between(fromX, fromY, toX, toY) * 0.5, 90, 260),
      ease: 'Quad.easeIn',
      onComplete: () => bolt.destroy(),
    });
  }

  /**
   * 命中反饋：整隻往後一縮再彈回，同時亮一下。
   *
   * 用 scale 的縮放而不是位移，是因為位移會和推進的座標打架（每一拍都在寫 y）。
   */
  private flashEnemy(view: Phaser.GameObjects.Container, killed: boolean): void {
    if (killed) return; // 死亡有自己的爆散，不必再閃一次
    this.tweens.killTweensOf(view);
    view.setScale(1.14);
    this.tweens.add({ targets: view, scale: 1, duration: 130, ease: 'Quad.easeOut' });
  }

  private burst(x: number, y: number, color: string, count: number): void {
    const emitter = this.add.particles(x, y, 'spark', {
      speed: { min: 60, max: 200 },
      lifespan: { min: 220, max: 520 },
      scale: { start: 0.7, end: 0 },
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
   * 飄字。holdMs 是「先停住讓人讀完」的時間，之後才開始上飄淡出。
   *
   * 傷害與金幣那種一眼就懂的可以不停（預設 0），但帶文字說明的必須停——
   * 700ms 的淡出對一句十來個字的中文根本讀不完，那正是玩家說的「一閃即逝」。
   */
  private floatText(
    x: number,
    y: number,
    text: string,
    color: string,
    size: number,
    holdMs = 0,
  ): void {
    const label = this.add
      .text(x, y, text, textStyle({ size, color, bold: true }))
      .setOrigin(0.5)
      .setStroke('#0b0f14', 6)
      .setDepth(70);
    this.tweens.add({
      targets: label,
      y: y - 46,
      alpha: 0,
      delay: holdMs,
      duration: 700,
      ease: 'Quad.easeOut',
      onComplete: () => label.destroy(),
    });
  }

  // -------------------------------------------------------------- 新手教學

  /** 教學面板。壓在畫面中段偏上，不擋住手牌與陣位——那正是玩家要動手的地方。 */
  private buildCoach(): void {
    if (this.step === 'done') return;
    const cx = GAME_WIDTH / 2;
    const panel = this.add
      .rectangle(cx, 0, GAME_WIDTH - 56, 128, BG_PANEL, 0.97)
      .setStrokeStyle(2, hexToNumber(GOLD));
    this.coachTitle = this.add
      .text(cx, -36, '', textStyle({ size: 24, color: GOLD, bold: true }))
      .setOrigin(0.5);
    this.coachBody = this.add
      .text(cx, 6, '', textStyle({ size: 17, color: INK }))
      .setOrigin(0.5)
      .setAlign('center')
      .setLineSpacing(6);
    this.coach = this.add.container(0, 300, [panel, this.coachTitle, this.coachBody]).setDepth(95);

    // 往下指的箭頭：文字說「拖到下面」，還是要有東西指著才不用猜是哪裡。
    this.coachArrow = this.add
      .text(cx, 392, '▼', textStyle({ size: 30, color: GOLD, bold: true }))
      .setOrigin(0.5)
      .setDepth(95);
    this.tweens.add({
      targets: this.coachArrow,
      y: 408,
      duration: 620,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  private refreshCoach(): void {
    const copy = tutorialCopy(this.step);
    this.coachTitle?.setText(copy.title);
    this.coachBody?.setText(copy.body);
    const visible = this.step !== 'done';
    this.coach?.setVisible(visible);
    this.coachArrow?.setVisible(visible);
  }

  /**
   * 玩家做到了這一步要求的動作就往下走。
   *
   * 只在「真的做到」時前進，不用計時器——新手花多久摸索都可以，
   * 而做完之後不必再等一段動畫才恢復操作。
   */
  private advanceTutorial(done: 'deploy' | 'merge'): void {
    if (this.step !== done) return;
    this.step = advanceStep(this.step);
    this.refreshCoach();

    if (this.step === 'watch') {
      // 最後一段只是說明，不需要玩家做什麼：讀完就開打。
      this.coachArrow?.setVisible(false);
      this.time.delayedCall(3800, () => {
        this.step = 'done';
        this.refreshCoach();
        this.finishTutorial();
      });
    }
  }

  private finishTutorial(): void {
    const save = state();
    if (markHintSeen(save, HINT_TUTORIAL)) persist();
  }

  /** 一次性提示：看過就不再出現，免得老玩家每一關都被同一句話打斷。 */
  private showHintOnce(id: string, text: string, y: number): void {
    // 教學進行中不插話：兩段說明疊在一起，新手一段都讀不進去。
    // 這裡直接跳過而不是記成看過，之後再遇到同樣情況還是會提示。
    if (this.step !== 'done') return;
    const save = state();
    if (!markHintSeen(save, id)) return;
    persist();
    const label = this.add
      .text(GAME_WIDTH / 2, y, text, textStyle({ size: 19, color: GOLD, bold: true }))
      .setOrigin(0.5)
      .setStroke('#0b0f14', 6)
      .setDepth(92);
    fitText(label, GAME_WIDTH - 40);
    this.tweens.add({ targets: label, alpha: 0, delay: 2600, duration: 600, onComplete: () => label.destroy() });
  }

  private showIntro(accentHex: string): void {
    const realm = realmForStage(this.run.stage);
    const title = this.add
      .text(GAME_WIDTH / 2, 380, realmTitle(this.run.stage), textStyle({ size: 48, color: accentHex, bold: true }))
      .setOrigin(0.5)
      .setDepth(80);
    const sub = this.add
      .text(GAME_WIDTH / 2, 434, realm.subtitle, textStyle({ size: 20, color: INK_DIM }))
      .setOrigin(0.5)
      .setDepth(80);
    const hint = this.add
      .text(GAME_WIDTH / 2, 492, '把符拖到陣位；同種同階疊起來可以合成', textStyle({ size: 20, color: INK }))
      .setOrigin(0.5)
      .setDepth(80);
    this.tweens.add({
      targets: [title, sub, hint],
      alpha: 0,
      delay: 1100,
      duration: 600,
      onComplete: () => {
        title.destroy();
        sub.destroy();
        hint.destroy();
      },
    });
  }

  private updateHud(): void {
    const run = this.run;
    this.hudLives.setText(`山門 ${run.disciples}`);
    this.hudLives.setColor(run.disciples <= run.maxDisciples * 0.3 ? DANGER : JADE);
    this.hudPower.setText(`道行 ${formatNumber(fieldDps(run.field, run.loadout))}`);
    this.hudTier.setText(`階數上限 ${maxTierForStage(run.stage)}`);
    this.hudGold.setText(`金幣 ${formatNumber(run.gold)}`);
    fitText(this.hudGold, 150);

    const total = BALANCE.wave.wavesPerStage * BALANCE.wave.waveIntervalMs;
    const progress = Phaser.Math.Clamp(run.elapsedMs / total, 0, 1);
    const wave = Math.min(BALANCE.wave.wavesPerStage, Math.floor(run.elapsedMs / BALANCE.wave.waveIntervalMs) + 1);
    this.hudWave.setText(run.bossSpawnedAtMs === null ? `第 ${wave} / ${BALANCE.wave.wavesPerStage} 波` : '首領');
    this.waveBar.setDisplaySize(GAME_WIDTH * progress, 4);
  }

  // -------------------------------------------------------------- 結束

  /**
   * 失敗診斷：從這場的實際數字挑出最該補的一項。
   * 只說「失守」玩家學不到東西，會一直用同一套打法重撞。
   */
  private diagnose(reason: 'breached' | 'timeout' | 'abandon' | null): string {
    if (reason === 'abandon') return '中途退出，未計入通關';
    const cap = maxTierForStage(this.run.stage);
    if (reason === 'timeout') {
      return '首領血太厚而輸出不夠——把符合到更高階，或提升淬鍊功法與御器訣';
    }
    if (!this.run.bossKilled && this.run.bossSpawnedAtMs !== null) {
      return '首領撐到了山門前，砸門的傷害比你的輸出快——關底需要更高階的符，別把符鋪散了';
    }
    if (this.run.peakTier < cap - 1) {
      return `法寶只合到 ${this.run.peakTier} 階（上限 ${cap}）——與其鋪滿低階符，不如集中合成同一種`;
    }
    if (this.run.merges < 6) {
      return '合成次數太少，輸出全靠低階符堆——提升引靈訣可以多抽幾張來合';
    }
    return '妖魔清得不夠快，被前幾隻拖住後面就崩了——多買陣法擴充，或提升聚眾成軍多撐幾次';
  }

  private finish(victory: boolean, reason: 'breached' | 'timeout' | 'abandon' | null): void {
    if (this.over) return;
    this.over = true;
    audio.play(victory ? 'victory' : 'defeat');

    const result: RunResultData = {
      victory,
      diagnosis: victory ? null : this.diagnose(reason),
      stage: this.run.stage,
      bossName: this.run.bossDef.name,
      survivors: Math.max(0, this.run.disciples),
      maxDisciples: this.run.maxDisciples,
      leaks: this.run.leaks,
      kills: this.run.kills,
      peakTier: this.run.peakTier,
      merges: this.run.merges,
      bossKilled: this.run.bossKilled,
      bossFought: this.run.bossSpawnedAtMs !== null,
      goldCollected: Math.round(this.run.gold),
      goldReward: victory ? clearReward(this.run) : defeatReward(this.run),
      defeatReason: reason,
    };

    this.cameras.main.fadeOut(420, 0, 0, 0);
    this.time.delayedCall(460, () => this.scene.start('Result', result));
  }
}
