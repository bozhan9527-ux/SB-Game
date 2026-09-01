import Phaser from "phaser";
import { audio } from "../audio";
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
} from "../art";
import { GAME_HEIGHT, GAME_WIDTH } from "../config";
import { BALANCE, CARDS } from "../data";
import type { MobTrait } from "../data/types";
import { persist, state } from "../state";
import type { ReplayAction, ReplayActionInput } from "../systems/replay";
import {
  MAX_REPLAY_ACTIONS,
  MAX_STEPS_PER_FRAME,
  STEP_MS,
  runSeed,
} from "../systems/replay";
import { track } from "../telemetry";
import type { Card } from "../systems/deck";
import { cardDef, fieldDps, tierCapFor } from "../systems/deck";
import type {
  ActiveEnemy,
  CardSlot,
  DefenseState,
  TickReport,
} from "../systems/defense";
import {
  LANES,
  cardAt,
  clearReward,
  createDefenseState,
  defeatReward,
  discardHand,
  dropOn,
  tickCombat,
} from "../systems/defense";
import type { FormationLine } from "../systems/formation";
import {
  activeFormations,
  formationEffect,
  formationName,
} from "../systems/formation";
import { boardBonuses } from "../systems/board";
import { buildLoadoutFromSpec, loadoutSpecOf } from "../systems/loadout";
import { dungeonById, dungeonSpecOf } from "../systems/dungeons";
import { runIsRankable, scoreLoadoutOf } from "../systems/leaderboard";
import type { TutorialStep } from "../systems/tutorial";
import {
  HINT_BOSS,
  HINT_FORMATION,
  HINT_GATE_SIEGE,
  HINT_HAND_FULL,
  HINT_TUTORIAL,
  lessonForStage,
  markLessonSeen,
  advanceStep,
  markHintSeen,
  shouldRunTutorial,
  tutorialCopy,
  tutorialField,
  tutorialHand,
} from "../systems/tutorial";
import {
  realmForStage,
  realmIndexForStage,
  realmTitle,
} from "../systems/realms";
import { createRng } from "../systems/rng";
import { drawBackdrop } from "../ui/backdrop";
import { createButton } from "../ui/button";
import type { Button } from "../ui/button";
import { CARD_HEIGHT, CARD_WIDTH, createCardView } from "../ui/card";
import type { CardView } from "../ui/card";
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
} from "../ui/theme";
import type { RunEntryData, RunResultData } from "./types";
import type { ScoreLoadout } from "../net/protocol";
import { fadeIn, fadeToScene } from "../ui/transition";

/** 妖魔的行進區間。上緣是妖魔出場處，下緣就是山門。 */
const ARENA_TOP = 116;
const GATE_Y = ARENA_TOP + BALANCE.wave.trackPx;
const ARENA_LEFT = 22;
const ARENA_RIGHT = GAME_WIDTH - 22;
const LANE_WIDTH = (ARENA_RIGHT - ARENA_LEFT) / LANES;

/** 場上陣位：三欄，往上疊列。陣法擴充買到的格位會往上長一列。 */
const FIELD_COLUMNS = BALANCE.formation.columns;
const FIELD_COL_X = [
  GAME_WIDTH / 2 - 100,
  GAME_WIDTH / 2,
  GAME_WIDTH / 2 + 100,
] as const;
const FIELD_BOTTOM_Y = GATE_Y - 48;
const FIELD_ROW_GAP = 96;

/** 手牌：畫面最下方一排。 */
const HAND_Y = 872;
const HAND_STEP = 100;
/**
 * 放開手指時，離格位中心多遠還算落在那一格。
 *
 * **這是磁吸半徑，不是命中框。** 陣位的間距是 100（橫）與 96（縱），
 * 所以格與格之間最遠的那個點（四格正中央）離最近的中心是 69px——
 * 舊值 62 比它小，於是那一圈是死區：手指放在兩格之間，這裡回 null，
 * 符就默默飛回原位，什麼事都沒發生。玩家回報的「還是會不小心放歪」就是它。
 *
 * 110 讓整片盤面連續：盤面之內任何一點都一定屬於「離它最近的那一格」，
 * 而且往外多出約一張符的寬容範圍。真正要取消的動作靠「拖到盤面外」，
 * 不靠「剛好落在縫裡」。
 */
const SNAP_RADIUS = 110;
/** 距離差在這個範圍內時，優先選合得起來的那一格。 */
const MERGE_SLACK = 26;

/**
 * 手牌拖到這條線以下就是棄符。
 *
 * 這一條要**壓過磁吸**：棄符區離手牌只有 74px，在 110 的磁吸半徑之內，
 * 不特別判的話「拖到這裡棄符」那一條提示永遠不會成真——
 * 畫面上寫著一個做不到的操作，比沒有那個操作更糟。
 */
const DISCARD_Y = 930;

/**
 * 手指從按下到放開移動不到這麼多像素，就當作「點一下」而不是「拖曳」。
 *
 * 這個數字要比手指自然的抖動大（實測 8px 上下），又要比一次有意義的拖曳小。
 */
const TAP_SLOP = 14;
/** 可選的遊戲速度。三檔就夠：正常、快、更快；再多只是讓按鈕要按更多次。 */
const SPEED_STEPS = [1, 2, 3] as const;

/** 一幀最多畫幾道靈光。掉幀時寧可少畫幾道，也不要為了補畫而更卡。 */
const MAX_TRACERS_PER_FRAME = 5;
/** 傷害數字累積多久吐一次。太短會變成一片閃爍，太長又跟不上戰況。 */
const DAMAGE_FLUSH_MS = 320;

/**
 * 出手前的預備：冷卻剩下這麼多毫秒時開始往下縮，出手瞬間彈回原位。
 *
 * 動畫的基本功是 anticipation → action。原本符牌完全不動，只有一條靈光飛出去，
 * 看起來像是那條線自己冒出來的，跟這張牌沒有關係。
 */
const CHARGE_MS = 140;
const CHARGE_DIP = 7;

/**
 * 受擊白閃：亮多久、以及最短隔多久才能再閃一次。
 *
 * 後期一隻妖魔可能每一幀都被打到。若每次命中都重新點亮，牠就會從頭到尾是一團白色，
 * 「被打到」這件事反而看不見了——閃光要有暗的時候才叫閃光。
 * 45／160 讓密集開火時大約三成時間是亮的，讀起來是頻閃；單發命中則是一次乾淨的閃。
 */
const FLASH_MS = 45;
const FLASH_GAP_MS = 160;

/** 凍格：首領受擊與斬殺首領時停住幾毫秒。詳見 freeze()。 */
const FREEZE_BOSS_HIT_MS = 28;
const FREEZE_BOSS_HIT_GAP_MS = 500;
const FREEZE_BOSS_KILL_MS = 160;
const FREEZE_MERGE_MS = 24;

type DragSource = CardSlot;

/** 妖魔的身體本體。受擊白閃與倒下都動它，不動外層容器（容器的位置由模擬決定）。 */
type EnemyBody = Phaser.GameObjects.Sprite | Phaser.GameObjects.Image;

/**
 * 習性的標記：一個字加一個顏色。
 *
 * 習性若看不出來，它就只是「這一關比較難」——玩家學不到「該換哪張符」，
 * 而那正是加習性的全部理由。一個字是刻意的：妖魔只有 46px 寬，
 * 多一個字就會蓋住牠自己。
 */
const TRAIT_MARK: Record<
  Exclude<MobTrait, "none">,
  { text: string; color: string }
> = {
  armor: { text: "甲", color: "#b8c4d0" },
  swift: { text: "疾", color: "#7fd8ff" },
  split: { text: "裂", color: "#c79cf0" },
};

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
  /** 落點框：拖曳中跟著磁吸移動，停在符會落下的那一格。 */
  private dropTarget: Phaser.GameObjects.Rectangle | undefined;
  private drawWarning!: Phaser.GameObjects.Text;

  /** 'done' 代表沒有教學要跑（老玩家或已教過）。 */
  private step: TutorialStep = "done";
  private coach: Phaser.GameObjects.Container | null = null;
  private coachTitle: Phaser.GameObjects.Text | null = null;
  private coachBody: Phaser.GameObjects.Text | null = null;
  private coachArrow: Phaser.GameObjects.Text | null = null;

  /** 成陣時連起來的光線。陣法看不見就等於不存在。 */
  private formationLayer!: Phaser.GameObjects.Graphics;
  /** 上一次的成陣狀態，用來判斷「剛剛新成了一陣」。 */
  private formationKeys = new Set<string>();
  /** 暫停中。手機一定會被電話與訊息打斷，沒有暫停就只能按「放棄」。 */
  private paused = false;
  /** 遊戲速度倍率。可選 1／2／3，記在存檔的設定裡，下一場沿用。 */
  private speed = 1;
  /** 剩餘的凍格時間（ms）。重擊時停住幾毫秒，重量感最便宜的來源。 */
  private freezeMs = 0;
  private pauseOverlay: Phaser.GameObjects.Container | undefined;
  private speedButton: Button | undefined;
  /**
   * 點選模式下已經選起來的那一格。
   *
   * 拖曳在手機上有個結構性的問題：手指會擋住自己要放的位置，而且一路拖過去的途中
   * 任何一次抖動都可能改變落點。點兩下沒有這個問題——選起來、看清楚、再點目標。
   * 兩種操作共存，玩家用哪一種都行。
   */
  private selected: DragSource | null = null;
  /** 這次按下的起點，放開時用來判斷剛剛那是拖曳還是點擊。 */
  private dragFrom = { x: 0, y: 0 };
  private gateBase?: Phaser.GameObjects.Rectangle;
  private gateCracks?: Phaser.GameObjects.Graphics;
  private gateLabel?: Phaser.GameObjects.Text;
  private gateStage = -1;
  /** 每隻妖魔累積中的傷害，湊夠一段時間才吐一個數字。 */
  private pendingDamage = new Map<number, { total: number; since: number }>();
  private lastHitSoundAt = 0;
  private lastFreezeAt = -9999;
  /** 固定時步的累積器與已跑格數。見 update() 與 src/systems/replay.ts。 */
  private stepAccum = 0;
  private stepIndex = 0;
  /** 這一場的操作記錄。排行榜要靠它在伺服器上重跑驗證。 */
  private actions: ReplayAction[] = [];
  /** 這一場跑過教學：起手牌被改寫過，重播不出來，因此不能上榜。 */
  private tutorialRun = false;
  /** 這一場的種子用的 runs。上榜時要原封不動送出去，伺服器才重播得出同一場。 */
  private seedRuns = 0;

  /** 這一場是哪個副本的第幾層。一般關卡是 null。 */
  private dungeonRun: { id: string; floor: number } | null = null;
  /** 副本那一行 HUD。無限模式會隨波數改寫，其餘副本寫一次就不動。 */
  private dungeonBanner: Phaser.GameObjects.Text | null = null;
  /** 無限模式的那一行怎麼寫。不是無限模式就是 null。 */
  private endlessBanner: ((waves: number) => string) | null = null;
  /**
   * 這一場**開打時**的配置，上報成績時原封不動送出去。
   *
   * 不能等到結算頁再從存檔現算：那時候 recordClear 已經把這一派的通關次數
   * 加一了，而修為每五次升一階。跨階的那一場，重播出來的是一個比較強的自己。
   */
  private runLoadout: ScoreLoadout | null = null;

  constructor() {
    super("Run");
  }

  /**
   * 副本的一場會帶著「哪個副本、第幾層」進來。一般關卡什麼都不帶。
   *
   * Phaser 重用 Scene 實例，所以這裡一定要清成 null——不清的話，
   * 打完一次副本之後的每一場正常關卡都會被當成副本，那會安靜地
   * 停掉主線進度，而畫面上完全看不出原因。
   */
  init(data?: RunEntryData): void {
    const id = data?.dungeonId;
    const floor = data?.floor;
    this.dungeonRun =
      typeof id === "string" && typeof floor === "number"
        ? { id, floor }
        : null;
    // Phaser 會重用 Scene 實例：上一場的文字物件早就被銷毀，
    // 不清成 null 的話下一場會拿著空殼去 setText。
    this.dungeonBanner = null;
    this.endlessBanner = null;
  }

  create(): void {
    fadeIn(this);
    const save = state();
    if (save.player.sectId === null) {
      this.scene.start("Sect");
      return;
    }

    const entry = this.dungeonRun;
    const dungeon = entry === null ? null : dungeonById(entry.id);
    // 副本走同一個組裝函式，只是規則、倍率與深度由副本填。
    const spec =
      dungeon === null || entry === null
        ? loadoutSpecOf(save, save.world.stage)
        : dungeonSpecOf(save, dungeon, entry.floor);
    const stage = spec.stage;
    const loadout = buildLoadoutFromSpec(spec);
    // **配置在這裡就記下來，和種子同一個理由。**
    //
    // 結算頁在送出成績之前已經改過存檔了（recordClear 把這一派的通關次數 +1，
    // 而修為每五次升一階、每階 +4% 傷害），那時候現算的配置比實際打的這一場強，
    // 伺服器重播出來就是另一場仗。漏掉這一行的後果不是「偶爾驗不過」，
    // 而是 submission 永遠是 null——**一場都不會上榜**，而且畫面上完全沒有跡象。
    this.runLoadout = scoreLoadoutOf(spec);
    // 種子帶入挑戰次數：同一關重打會換一批妖魔與符，但單次進行中完全可重現。
    // 種子的另一半要當場記下來：結算頁會把 runs 加一，之後再去讀就不是這一場的種子了。
    this.seedRuns = save.world.runs;
    this.rng = createRng(runSeed(stage, this.seedRuns));
    this.run = createDefenseState(loadout, this.rng);
    this.over = false;
    this.enemySprites.clear();
    // Phaser 重用 Scene 實例，這幾個單場狀態不清就會帶進下一關。
    this.paused = false;
    this.freezeMs = 0;
    this.selected = null;
    this.pauseOverlay = undefined;
    this.speed = SPEED_STEPS.includes(save.settings.speed as 1 | 2 | 3)
      ? save.settings.speed
      : 1;

    const realm = realmForStage(stage);
    createWalkAnimations(this);
    this.ensureSparkTexture();
    audio.playMusic(realmIndexForStage(stage));
    drawBackdrop(this, realm.color, realm.scenery);

    // 教學要換掉起手牌，必須在建立牌位之前決定，否則陣位數會對不上。
    // 副本裡不跑教學：教學會改寫起手牌，而副本的規則（例如獨門一符）
    // 本來就已經改過一次牌了，兩者疊在一起誰都說不清這一場的牌是怎麼來的。
    this.step =
      this.dungeonRun === null && shouldRunTutorial(save) ? "deploy" : "done";
    this.tutorialRun = this.step !== "done";
    // 起點也要報，否則分母不存在——只有「走到第二步」的人數是算不出完成率的。
    if (this.step === "deploy") track("tutorial_step", { step: "deploy" });
    if (this.step !== "done") {
      this.run.field = tutorialField(this.run.field.length);
      this.run.hand = tutorialHand(
        this.run.hand.length,
        this.run.loadout.talismans[0]?.id ?? "flame",
      );
      this.run.cooldowns = this.run.cooldowns.map(() => 0);
    }

    this.drawArena(realm.color);
    this.buildHud(realm.color);
    this.buildFieldSlots();
    this.buildHand();
    this.buildDragLayer();
    this.formationLayer = this.add.graphics().setDepth(24);
    this.formationKeys = new Set<string>();
    this.pendingDamage = new Map<number, { total: number; since: number }>();
    this.lastHitSoundAt = 0;
    this.gateStage = -1;
    this.lastFreezeAt = -9999;
    this.stepAccum = 0;
    this.stepIndex = 0;
    this.actions = [];
    this.buildPauseOverlay();
    this.buildCoach();
    this.refreshCards();
    this.updateHud();
    if (this.step === "done") this.showIntro(realm.color);
    else this.refreshCoach();

    // 與 stage_end 成對。兩者的差就是中離——沒有它，「第幾關流失」只看得到一半。
    track("stage_start", {
      stage,
      realm: realm.id,
      sect: save.player.sectId,
      // 排序過才聚合得起來：同樣四張符換個順序不該變成兩種組合。
      talismans: [...save.player.talismans].sort().join(","),
      // 這一場是不是在副本裡，以及是哪一個——遙測要分得開，
      // 不然副本的難度會混進主線的流失曲線裡。
      dungeon: this.dungeonRun?.id ?? null,
      dungeon_floor: this.dungeonRun?.floor ?? 0,
      speed: this.speed,
      field_slots: this.run.field.length,
    });
  }

  private ensureSparkTexture(): void {
    if (this.textures.exists("spark")) return;
    const g = this.make.graphics({ x: 0, y: 0 });
    g.fillStyle(0xffffff, 1);
    g.fillCircle(5, 5, 5);
    g.generateTexture("spark", 10, 10);
    g.destroy();
  }

  // -------------------------------------------------------------- 版面

  private drawArena(accentHex: string): void {
    const accent = hexToNumber(accentHex);
    const g = this.add.graphics().setDepth(-50);
    g.fillStyle(0x000000, 0.3);
    g.fillRect(
      ARENA_LEFT,
      ARENA_TOP,
      ARENA_RIGHT - ARENA_LEFT,
      GATE_Y - ARENA_TOP,
    );
    g.lineStyle(2, accent, 0.22);
    g.strokeRect(
      ARENA_LEFT,
      ARENA_TOP,
      ARENA_RIGHT - ARENA_LEFT,
      GATE_Y - ARENA_TOP,
    );
    // 五條縱列的分隔線：妖魔沿著列走，玩家才看得出哪一列擠了。
    g.lineStyle(1, accent, 0.1);
    for (let i = 1; i < LANES; i += 1) {
      const x = ARENA_LEFT + LANE_WIDTH * i;
      g.lineBetween(x, ARENA_TOP, x, GATE_Y);
    }

    // 山門：妖魔碰到這條線就算攻進來。
    this.gateBase = this.add
      .rectangle(GAME_WIDTH / 2, GATE_Y + 6, GAME_WIDTH, 12, accent, 0.5)
      .setDepth(28);
    this.gateBar = this.add
      .rectangle(
        GAME_WIDTH / 2,
        GATE_Y + 6,
        GAME_WIDTH,
        12,
        hexToNumber(DANGER),
        0,
      )
      .setDepth(29);
    // 裂痕：耐久掉到一定程度才畫出來，一段比一段多。
    // 沒有這個的話，山門從滿血到快破在畫面上長得一模一樣，玩家只能盯左上角那個數字。
    // 深度壓在門條之上：裂痕是「把門切開的縫」，用背景色畫上去才看得出來。
    // 第一版用和門條同色去畫，等於在金色上畫金色，什麼都看不到。
    this.gateCracks = this.add.graphics().setDepth(30);
    this.gateLabel = this.add
      .text(
        GAME_WIDTH / 2,
        GATE_Y + 26,
        "山　門",
        textStyle({ size: 17, color: INK_DIM }),
      )
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
    this.add
      .rectangle(GAME_WIDTH / 2, 880, GAME_WIDTH, 160, BG_PANEL, 1)
      .setDepth(40);
    this.add
      .rectangle(GAME_WIDTH / 2, 800, GAME_WIDTH, 2, LINE, 0.8)
      .setDepth(40);
    this.discardZone = this.add
      .rectangle(GAME_WIDTH / 2, 946, GAME_WIDTH, 28, hexToNumber(DANGER), 0.12)
      .setDepth(41)
      .setVisible(false);
    this.add
      .text(
        GAME_WIDTH / 2,
        946,
        "拖到這裡棄符",
        textStyle({ size: 15, color: INK_DIM }),
      )
      .setOrigin(0.5)
      .setDepth(42)
      .setAlpha(0.55);
    this.drawWarning = this.add
      .text(
        GAME_WIDTH / 2,
        812,
        "手牌已滿，符流失了",
        textStyle({ size: 17, color: DANGER, bold: true }),
      )
      .setOrigin(0.5)
      .setDepth(44)
      .setAlpha(0);
    this.siegeText = this.add
      .text(
        GAME_WIDTH / 2,
        GATE_Y - 62,
        "首領正在砸門！",
        textStyle({ size: 26, color: DANGER, bold: true }),
      )
      .setOrigin(0.5)
      .setStroke("#0b0f14", 7)
      .setDepth(46)
      .setAlpha(0);
  }

  /**
   * 頂端資訊列。
   *
   * 排版依「輸了會怎樣」分三級，不是把六個數字平均攤開：
   * 第一級是山門耐久（唯一會讓你輸的東西，最大的字）、
   * 第二級是陣法與金幣（你剛剛做對了什麼、能買什麼）、
   * 第三級是每秒輸出／階數上限／波次（要細看才有用的參考值，一律小字暗色）。
   *
   * 右上角留給「暫停」與「速度」——手機一定會被電話與訊息打斷，
   * 而原本那裡放的是「放棄」：被打斷時唯一能按的鍵是放棄整場，這是設計上的失誤。
   */
  private buildHud(accentHex: string): void {
    this.add
      .rectangle(GAME_WIDTH / 2, 55, GAME_WIDTH, 110, BG_PANEL, 1)
      .setDepth(50);
    this.add
      .rectangle(GAME_WIDTH / 2, 110, GAME_WIDTH, 2, LINE, 0.8)
      .setDepth(50);

    this.add
      .text(
        20,
        14,
        realmTitle(this.run.stage),
        textStyle({ size: 22, color: accentHex, bold: true }),
      )
      .setDepth(51);
    this.hudGold = this.add
      .text(396, 16, "", textStyle({ size: 17, color: GOLD }))
      .setOrigin(1, 0)
      .setDepth(51);

    // 山門耐久是玩家唯一會輸的資源，給它最大的字。
    this.hudLives = this.add
      .text(20, 42, "", textStyle({ size: 34, color: JADE, bold: true }))
      .setDepth(51);
    // 「道行」是修仙的說法，但它其實是每秒輸出——新玩家看不懂這個數字在講什麼，
    // 也就無從判斷自己的排法有沒有變強。名字直接寫成它的意思。
    this.hudPower = this.add
      .text(20, 84, "", textStyle({ size: 17, color: INK_DIM }))
      .setDepth(51);
    this.hudTier = this.add
      .text(220, 84, "", textStyle({ size: 17, color: INK_DIM }))
      .setDepth(51);
    // 陣法是持續生效的狀態，卻只有成立那一瞬間有提示——玩家回報「效果一閃即逝沒看清楚」。
    // 常駐一行，隨時看得到現在有幾條、平均加了多少。
    this.hudFormation = this.add
      .text(200, 52, "", textStyle({ size: 18, color: GOLD, bold: true }))
      .setDepth(51);
    this.hudWave = this.add
      .text(GAME_WIDTH - 20, 84, "", textStyle({ size: 17, color: INK_DIM }))
      .setOrigin(1, 0)
      .setDepth(51);

    // 在副本裡就在 HUD 上常駐一行：規則改過的那一場，玩家必須隨時看得到改了什麼，
    // 否則「怎麼合不起來」會被當成 bug。
    const entry = this.dungeonRun;
    const dungeon = entry === null ? null : dungeonById(entry.id);
    if (dungeon !== null && entry !== null) {
      // 無限副本沒有層數可講，改成即時的波數——那是玩家在裡面唯一的進度感。
      this.dungeonBanner = this.add
        .text(
          20,
          106,
          dungeon.endless
            ? `${dungeon.name} 第 1 波　${dungeon.desc}`
            : `${dungeon.name} 第 ${entry.floor} 層　${dungeon.desc}`,
          textStyle({ size: 15, color: GOLD, bold: true }),
        )
        .setDepth(52);
      this.endlessBanner = dungeon.endless
        ? (waves: number): string => `${dungeon.name} 第 ${waves} 波　${dungeon.desc}`
        : null;
    }

    this.add
      .rectangle(GAME_WIDTH / 2, 108, GAME_WIDTH, 4, LINE, 0.5)
      .setDepth(51);
    this.waveBar = this.add
      .rectangle(0, 108, 0, 4, hexToNumber(accentHex), 1)
      .setOrigin(0, 0.5)
      .setDepth(52);

    this.speedButton = createButton(this, 436, 26, {
      width: 56,
      height: 44,
      label: `${this.speed}×`,
      fontSize: 19,
      onClick: () => this.cycleSpeed(),
    });
    this.speedButton.container.setDepth(52);

    createButton(this, 500, 26, {
      width: 56,
      height: 44,
      label: "‖",
      fontSize: 22,
      onClick: () => this.setPaused(true),
    }).container.setDepth(52);
  }

  /**
   * 速度切換：1× → 2× → 3× → 1×。
   *
   * 只是把餵給 tickCombat 的 delta 乘上去。模擬本來就是 delta 驅動、
   * 而且用 while 迴圈補齊出手間隔，所以乘上去不會漏掉輸出，只是同一段真實時間裡多算幾拍。
   * 選擇記進存檔——玩家決定用 2× 是決定了整個遊玩節奏，不該每關重按一次。
   */
  private cycleSpeed(): void {
    const index = SPEED_STEPS.indexOf(this.speed as 1 | 2 | 3);
    this.speed = SPEED_STEPS[(index + 1) % SPEED_STEPS.length] ?? 1;
    this.speedButton?.setLabel(`${this.speed}×`);
    const save = state();
    save.settings.speed = this.speed;
    persist();
  }

  /**
   * 暫停畫面。
   *
   * 「放棄」搬到這裡面來：它是一場裡最不可逆的一個動作，不該和常用鍵放在同一排，
   * 手指滑一下就按到。要放棄得先暫停，多一步是刻意的。
   */
  private buildPauseOverlay(): void {
    const cx = GAME_WIDTH / 2;
    // 這層要吃掉輸入，否則點在暫停畫面的空白處會穿透到底下的陣位。
    const veil = this.add
      .rectangle(cx, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.72)
      .setInteractive();
    const panel = this.add
      .rectangle(cx, GAME_HEIGHT / 2, GAME_WIDTH - 96, 320, BG_PANEL, 0.98)
      .setStrokeStyle(2, hexToNumber(GOLD));
    const title = this.add
      .text(
        cx,
        GAME_HEIGHT / 2 - 118,
        "暫停",
        textStyle({ size: 30, color: GOLD, bold: true }),
      )
      .setOrigin(0.5);

    const resume = createButton(this, cx, GAME_HEIGHT / 2 - 46, {
      width: 260,
      height: 56,
      label: "繼續",
      onClick: () => this.setPaused(false),
    });

    const save = state();
    const soundLabel = (): string =>
      save.settings.sound ? "音效 開" : "音效 關";
    const sound = createButton(this, cx, GAME_HEIGHT / 2 + 24, {
      width: 260,
      height: 56,
      label: soundLabel(),
      fontSize: 22,
      onClick: () => {
        save.settings.sound = !save.settings.sound;
        audio.setEnabled(save.settings.sound);
        if (save.settings.sound)
          audio.playMusic(realmIndexForStage(this.run.stage));
        persist();
        sound.setLabel(soundLabel());
      },
    });

    const abandon = createButton(this, cx, GAME_HEIGHT / 2 + 100, {
      width: 260,
      height: 56,
      label: "放棄本場",
      fontSize: 22,
      textColor: DANGER,
      onClick: () => this.finish(false, "abandon"),
    });

    this.pauseOverlay = this.add
      .container(0, 0, [
        veil,
        panel,
        title,
        resume.container,
        sound.container,
        abandon.container,
      ])
      .setDepth(95)
      .setVisible(false);
  }

  private setPaused(value: boolean): void {
    if (this.over) return;
    this.paused = value;
    this.pauseOverlay?.setVisible(value);
    if (value) {
      // 暫停時把手上正在拖／選的動作取消掉：恢復之後手指早就不在原處了。
      this.drag = null;
      this.dragView.container.setVisible(false);
      this.clearSelection();
      this.refreshCards();
    }
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
          .text(
            x + 32,
            y - 40,
            "",
            textStyle({ size: 14, color: GOLD, bold: true }),
          )
          .setOrigin(1, 0)
          .setDepth(30)
          .setStroke("#0b0f14", 4)
          .setVisible(false),
      );

      const hit = this.add
        .rectangle(x, y, CARD_WIDTH, CARD_HEIGHT, 0xffffff, 0)
        .setDepth(27)
        .setInteractive({ useHandCursor: true });
      hit.on("pointerdown", () => this.beginDrag({ where: "field", index: i }));

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
      hit.on("pointerdown", () => this.beginDrag({ where: "hand", index: i }));
    }
  }

  /** 拖曳中的那一張牌畫在最上層，跟著手指走。 */
  private buildDragLayer(): void {
    this.dragView = createCardView(this, 0, 0);
    this.dragView.container.setDepth(90).setVisible(false).setScale(1.06);

    // 拖曳中會不會落在哪一格、落上去會發生什麼，都要在放手**之前**看得到。
    // 玩家回報「合成常常變成取代到別的卡片」有一半是這個：他到放開的那一刻才知道結果。
    this.dropLabel = this.add
      .text(0, 0, "", textStyle({ size: 17, color: INK, bold: true }))
      .setOrigin(0.5)
      .setDepth(92)
      .setStroke("#0b0f14", 5)
      .setVisible(false);

    // 落點框畫在最上層：它要蓋過符本身，否則被拖過去的那張符會擋住它。
    this.dropTarget = this.add
      .rectangle(0, 0, CARD_WIDTH + 18, CARD_HEIGHT + 18, 0xffffff, 0)
      .setStrokeStyle(3, hexToNumber(GOLD), 0.9)
      .setDepth(60)
      .setVisible(false);

    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (this.drag === null) return;
      this.dragView.container.setPosition(pointer.x, pointer.y - 44);
      this.showDropPreview(pointer);
    });
    this.input.on("pointerup", (pointer: Phaser.Input.Pointer) =>
      this.endDrag(pointer),
    );
    this.input.on("pointerupoutside", (pointer: Phaser.Input.Pointer) =>
      this.endDrag(pointer),
    );
  }

  // -------------------------------------------------------------- 拖曳

  private cardAt(source: DragSource): Card | null {
    const list = source.where === "hand" ? this.run.hand : this.run.field;
    return list[source.index] ?? null;
  }

  private beginDrag(source: DragSource): void {
    if (this.over || this.paused) return;

    // 已經有選起來的符：這一下是「點目標格」，不是要開始新的拖曳。
    const chosen = this.selected;
    if (chosen !== null) {
      this.clearSelection();
      const sameSlot =
        chosen.where === source.where && chosen.index === source.index;
      if (!sameSlot) this.applyDrop(chosen, source);
      this.refreshCards();
      this.updateHud();
      return;
    }

    const card = this.cardAt(source);
    if (card === null) return;
    this.drag = source;
    this.dragView.refresh(card);
    this.dragView.container.setVisible(true);
    const pointer = this.input.activePointer;
    this.dragFrom = { x: pointer.x, y: pointer.y };
    this.dragView.container.setPosition(pointer.x, pointer.y - 44);
    this.discardZone.setVisible(source.where === "hand");
    this.showMergeHints(card, source);
    this.refreshCards();
  }

  /**
   * 把一格選起來（點選模式的第一段）。
   *
   * 選起來之後合得起來的格位一樣會亮，和拖曳中看到的是同一套提示——
   * 兩種操作學到的東西要能互通，不然等於是兩個遊戲。
   */
  private select(source: DragSource): void {
    const card = this.cardAt(source);
    if (card === null) {
      this.clearSelection();
      return;
    }
    this.selected = source;
    this.discardZone.setVisible(source.where === "hand");
    this.showMergeHints(card, source);
    const glow =
      source.where === "field"
        ? this.fieldHighlights[source.index]
        : this.handHighlights[source.index];
    this.paintGlow(glow, GOLD, 6, 1, 0.22);
    const pos = this.slotPosition(source);
    this.dropLabel
      ?.setVisible(true)
      .setText("再點一格放置")
      .setColor(GOLD)
      .setPosition(pos.x, pos.y - CARD_HEIGHT / 2 - 16);
    this.refreshCards();
  }

  private clearSelection(): void {
    if (this.selected === null) return;
    this.selected = null;
    this.discardZone.setVisible(false);
    this.clearMergeHints();
  }

  /**
   * 拖曳中把「合得起來」的格位框起來，手牌與陣位都框。
   * 合成是這個遊戲的核心決策，不能靠玩家自己記哪張是幾階。
   */
  private showMergeHints(card: Card, source: DragSource): void {
    const cap = tierCapFor(this.run.loadout, this.run.threat);
    const mark = (
      glow: Phaser.GameObjects.Rectangle | undefined,
      target: Card | null,
      self: boolean,
    ): void => {
      if (glow === undefined) return;
      const same =
        !self &&
        target !== null &&
        target.type === card.type &&
        target.tier === card.tier &&
        target.tier < cap;
      const empty = !self && target === null;
      // 這一層是「哪幾格合得起來」的背景提示，只描邊；填色留給真正的目標格，
      // 否則整片盤面都在發光，反而看不出手指現在指著哪一格。
      this.paintGlow(
        glow,
        same ? JADE : GOLD,
        3,
        same ? 0.95 : empty ? 0.45 : 0,
        same ? 0.1 : 0,
      );
    };
    this.fieldHighlights.forEach((glow, index) =>
      mark(
        glow,
        this.run.field[index] ?? null,
        source.where === "field" && source.index === index,
      ),
    );
    this.handHighlights.forEach((glow, index) =>
      mark(
        glow,
        this.run.hand[index] ?? null,
        source.where === "hand" && source.index === index,
      ),
    );
  }

  /**
   * 格位框的樣式。
   *
   * 目標格要**填色**，不能只描邊：戰鬥畫面上同時有妖魔、光效與傷害數字在跑，
   * 一條 3px 的線在那裡面完全看不見。玩家回報的「顯示方框明顯一點」就是這件事。
   * 填一層淡色之後，「符會落在這一格」在餘光裡就讀得到，不必盯著看。
   */
  private paintGlow(
    glow: Phaser.GameObjects.Rectangle | undefined,
    color: string,
    strokeWidth: number,
    strokeAlpha: number,
    fillAlpha: number,
  ): void {
    if (glow === undefined) return;
    glow.setStrokeStyle(strokeWidth, hexToNumber(color), strokeAlpha);
    glow.setFillStyle(hexToNumber(color), fillAlpha);
  }

  private clearMergeHints(): void {
    for (const glow of [...this.fieldHighlights, ...this.handHighlights]) {
      this.paintGlow(glow, JADE, 3, 0, 0);
    }
    this.dropTarget?.setVisible(false);
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
    // 棄符優先，和 endDrag 走同一條規則——預覽說的和放手做的必須是同一件事。
    const discarding = source.where === "hand" && pointer.y > DISCARD_Y;
    const target = discarding
      ? null
      : this.slotAt(pointer.x, pointer.y, card);

    // 先把所有格位還原成一般的合成提示，再單獨標出這一格。
    if (card !== null) this.showMergeHints(card, source);

    if (target === null) {
      label
        .setVisible(discarding)
        .setText(discarding ? "棄符" : "")
        .setColor(DANGER);
      label.setPosition(pointer.x, pointer.y - 108);
      return;
    }

    const glow =
      target.where === "field"
        ? this.fieldHighlights[target.index]
        : this.handHighlights[target.index];
    const existing = cardAt(this.run, target);
    const same = target.where === source.where && target.index === source.index;
    const merges =
      !same &&
      card !== null &&
      existing !== null &&
      existing.type === card.type &&
      existing.tier === card.tier &&
      existing.tier <
        tierCapFor(this.run.loadout, this.run.threat);

    const text = same
      ? ""
      : merges
        ? "合成"
        : existing === null
          ? "放置"
          : "交換";
    const color = merges ? JADE : existing === null ? GOLD : INK_DIM;
    this.paintGlow(glow, color, 6, same ? 0 : 1, same ? 0 : 0.22);

    const pos = this.slotPosition(target);
    // 落點框：一個跟著磁吸走的方框，直接停在符會落下的那一格。
    // 手指在格與格之間時，是這個框在回答「到底會落在哪一格」——
    // 只有顏色深淺的差別讀不出來，一個會移動的框讀得出來。
    this.dropTarget
      ?.setVisible(!same)
      .setPosition(pos.x, pos.y)
      .setStrokeStyle(3, hexToNumber(color), 0.9);
    label
      .setVisible(text.length > 0)
      .setText(text)
      .setColor(color);
    label.setPosition(pos.x, pos.y - CARD_HEIGHT / 2 - 16);
  }

  private endDrag(pointer: Phaser.Input.Pointer): void {
    const source = this.drag;
    this.drag = null;
    this.dragView.container.setVisible(false);

    // 沒有在拖：這一下是點在格位以外的地方。有選取中的符時當成「棄符」或「取消」。
    if (source === null) {
      if (this.selected === null) return;
      const chosen = this.selected;
      this.clearSelection();
      if (chosen.where === "hand" && pointer.y > DISCARD_Y && !this.over) {
        if (discardHand(this.run, chosen.index)) {
          this.record({ kind: "discard", index: chosen.index });
          audio.play("gateTrap");
        }
      }
      this.refreshCards();
      this.updateHud();
      return;
    }

    // 手指幾乎沒動＝這是一次點擊，不是拖曳。改走兩段式，讓玩家看清楚再決定落點。
    const moved = Math.hypot(
      pointer.x - this.dragFrom.x,
      pointer.y - this.dragFrom.y,
    );
    if (moved < TAP_SLOP && !this.over) {
      this.select(source);
      return;
    }

    this.discardZone.setVisible(false);
    this.dropTarget?.setVisible(false);
    this.clearMergeHints();
    if (this.over) return;

    // 棄符先判：棄符區在磁吸半徑之內，先問磁吸的話它永遠吸回手牌那一格。
    if (source.where === "hand" && pointer.y > DISCARD_Y) {
      if (discardHand(this.run, source.index)) {
        this.record({ kind: "discard", index: source.index });
        audio.play("gateTrap");
      }
    } else {
      const target = this.slotAt(pointer.x, pointer.y, this.cardAt(source));
      if (target !== null) this.applyDrop(source, target);
    }

    this.refreshCards();
    this.updateHud();
  }

  private applyDrop(source: CardSlot, target: CardSlot): void {
    const card = cardAt(this.run, source);
    const result = dropOn(this.run, source, target, this.rng);
    // 連 'none' 也要記：它同樣消耗過 rng 的判定路徑，漏記會讓重播從這裡開始飄。
    this.record({ kind: "drop", from: source, to: target });
    if (result === "none" || card === null) return;

    const pos = this.slotPosition(target);
    if (result === "merged") this.advanceTutorial("merge");
    else if (
      result === "moved" &&
      source.where === "hand" &&
      target.where === "field"
    ) {
      this.advanceTutorial("deploy");
    }
    if (result === "merged") {
      const merged = cardAt(this.run, target);
      audio.play("gold");
      this.playMerge(source, target, card);
      this.floatText(
        pos.x,
        pos.y - 46,
        `${cardDef(card.type).name} ${merged?.tier ?? ""} 階`,
        GOLD,
        24,
      );
    } else {
      audio.play("gateGood");
      if (target.where === "field") this.pulseSlot(target, JADE);
    }
  }

  /**
   * 合成的過程。
   *
   * 合成是這個遊戲最爽的一刻——輸出乘上 1.35 倍就發生在這一下——
   * 但原本畫面上只有數字瞬間變大加一次縮放，等於把高潮剪掉了。
   *
   * 補的是三拍：來源那張飛過去（它在模擬裡已經被吃掉，所以飛的是一個分身）、
   * 撞上時爆一圈光、目標那張彈起來。凍格幾毫秒讓這一下站得住。
   */
  private playMerge(source: CardSlot, target: CardSlot, card: Card): void {
    const from = this.slotPosition(source);
    const to = this.slotPosition(target);
    const ghost = createCardView(this, from.x, from.y);
    ghost.refresh(card);
    ghost.container.setDepth(80).setScale(source.where === "hand" ? 1 : 0.82);
    this.tweens.add({
      targets: ghost.container,
      x: to.x,
      y: to.y,
      scale: 0.45,
      duration: 170,
      ease: "Back.easeIn",
      onComplete: () => {
        ghost.container.destroy();
        this.mergeRing(to.x, to.y);
        this.pulseSlot(target, GOLD);
        this.freeze(FREEZE_MERGE_MS);
      },
    });
  }

  /** 合成撞擊點的一圈金光。只是一個會擴散淡出的圓環，沒有貼圖成本。 */
  private mergeRing(x: number, y: number): void {
    const ring = this.add
      .circle(x, y, 14)
      .setStrokeStyle(4, hexToNumber(GOLD), 0.95)
      .setDepth(79);
    this.tweens.add({
      targets: ring,
      scale: 3.4,
      alpha: 0,
      duration: 320,
      ease: "Quad.easeOut",
      onComplete: () => ring.destroy(),
    });
  }

  private slotPosition(slot: CardSlot): { x: number; y: number } {
    if (slot.where === "hand") {
      const view = this.handViews[slot.index];
      return { x: view?.container.x ?? GAME_WIDTH / 2, y: HAND_Y };
    }
    const view = this.fieldViews[slot.index];
    return {
      x: view?.container.x ?? GAME_WIDTH / 2,
      y: this.fieldSlotY[slot.index] ?? 0,
    };
  }

  /**
   * 手指放開的位置落在哪個格位上。手牌與陣位共用一套判定，拖曳才只有一種手勢。
   *
   * **取最近的一格，不是取第一個命中的。** 舊版用「軸向容差 + 依索引先到先得」，
   * 而陣位的列距是 96px、縱向容差卻是 ±60px——相鄰兩列的判定區重疊 24px，
   * 放在兩列之間會靜默落到上面那一列。玩家回報的「合成常常變成取代到別的卡片」就是這個。
   *
   * **而且是磁吸，不是命中框。** SNAP_RADIUS 大到讓整片盤面連續，
   * 所以手指落在任何一點都一定屬於離它最近的那一格，格與格之間沒有死區——
   * 舊值 62 比「四格正中央到最近中心」的 69px 還小，那一圈放手是什麼都不會發生，
   * 而畫面上完全看不出為什麼。回報的「還是會不小心放歪」就是那個縫。
   *
   * 另外在**距離相當**時優先選合得起來的那一格（MERGE_SLACK 之內）。
   * 合成是這個遊戲的核心動作，手指差幾個像素不該把它變成一次交換——
   * 交換可以再拖回來，合成錯過的那一張已經被覆蓋掉了。
   */
  private slotAt(
    x: number,
    y: number,
    dragged: Card | null = null,
  ): CardSlot | null {
    const cap = tierCapFor(this.run.loadout, this.run.threat);
    const candidates: { slot: CardSlot; distance: number; merges: boolean }[] =
      [];

    const consider = (
      slot: CardSlot,
      cx: number,
      cy: number,
      target: Card | null,
    ): void => {
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
      consider(
        { where: "field", index: i },
        view.container.x,
        this.fieldSlotY[i] ?? 0,
        this.run.field[i] ?? null,
      );
    }
    for (let i = 0; i < this.handViews.length; i += 1) {
      const view = this.handViews[i];
      if (view === undefined) continue;
      consider(
        { where: "hand", index: i },
        view.container.x,
        HAND_Y,
        this.run.hand[i] ?? null,
      );
    }
    if (candidates.length === 0) return null;

    candidates.sort((a, b) => a.distance - b.distance);
    const nearest = candidates[0];
    if (nearest === undefined) return null;
    const merging = candidates.find(
      (c) => c.merges && c.distance <= nearest.distance + MERGE_SLACK,
    );
    return (merging ?? nearest).slot;
  }

  /**
   * 山門的破損程度。分四階：完好／有裂痕／裂開／快破。
   *
   * 只在跨階的那一刻重畫，不是每幀都畫——耐久每掉一點就重畫一次 Graphics
   * 是白工，而且裂痕的位置會一直跳。
   */
  private refreshGateDamage(): void {
    const ratio = this.run.disciples / Math.max(1, this.run.maxDisciples);
    const stage = ratio > 0.75 ? 0 : ratio > 0.45 ? 1 : ratio > 0.2 ? 2 : 3;
    if (stage === this.gateStage) return;
    this.gateStage = stage;

    const cracks = this.gateCracks;
    if (cracks === undefined) return;
    cracks.clear();

    // 顏色隨破損加深，門楣的字也跟著變。
    const tint =
      [hexToNumber(JADE), 0xc9a227, hexToNumber(DANGER), hexToNumber(DANGER)][
        stage
      ] ?? 0xffffff;
    this.gateBase?.setFillStyle(tint, [0.5, 0.55, 0.6, 0.75][stage] ?? 0.5);
    this.gateLabel?.setColor(
      [INK_DIM, INK_DIM, DANGER, DANGER][stage] ?? INK_DIM,
    );
    if (stage >= 2) {
      this.tweens.killTweensOf(this.gateLabel as Phaser.GameObjects.Text);
      this.gateLabel?.setAlpha(1);
      this.tweens.add({
        targets: this.gateLabel,
        alpha: 0.45,
        duration: stage === 3 ? 380 : 720,
        yoyo: true,
        repeat: -1,
      });
    }
    if (stage === 0) return;

    // 裂痕：用背景色把門條切開。階段越高越多、越寬。
    // 位置由序號算出來、不用亂數——每次重畫要長得一樣，會跳動的裂痕看起來像雜訊。
    const count = [0, 4, 8, 13][stage] ?? 0;
    const top = GATE_Y;
    const bottom = GATE_Y + 12;
    for (let i = 0; i < count; i += 1) {
      const x = ((i + 0.5) / count) * GAME_WIDTH + (((i * 37) % 23) - 11);
      const lean = i % 2 === 0 ? 4 : -4;
      cracks.lineStyle(stage === 3 ? 4 : 3, 0x0b0f14, 1);
      cracks.beginPath();
      cracks.moveTo(x, top - 1);
      cracks.lineTo(x + lean, (top + bottom) / 2);
      cracks.lineTo(x - lean * 0.5, bottom + 1);
      cracks.strokePath();
      // 快破的時候再往戰場裡崩一小段，看得出「門要撐不住了」。
      if (stage === 3) {
        cracks.lineStyle(2, hexToNumber(DANGER), 0.75);
        cracks.beginPath();
        cracks.moveTo(x, top - 1);
        cracks.lineTo(x + lean * 1.6, top - 9 - ((i * 11) % 7));
        cracks.strokePath();
      }
    }
  }

  private pulseSlot(slot: CardSlot, color: string): void {
    const view =
      slot.where === "hand"
        ? this.handViews[slot.index]
        : this.fieldViews[slot.index];
    if (view === undefined) return;
    const base = slot.where === "hand" ? 1 : 0.82;
    this.tweens.killTweensOf(view.container);
    view.container.setScale(base * 1.25);
    this.tweens.add({
      targets: view.container,
      scale: base,
      duration: 260,
      ease: "Back.easeOut",
    });
    this.burst(view.container.x, view.container.y, color, 12);
  }

  /**
   * 把成立中的陣法連成光線。
   *
   * 沒有這條線的話，陣法就是一個只會反映在「每秒輸出」數字上的隱形加成——
   * 玩家不會知道自己剛剛做對了什麼，也就學不會下次要怎麼排。
   */
  private refreshFormations(): void {
    const lines = activeFormations(this.run.field);
    this.formationLayer.clear();

    for (const line of lines) {
      // 兩種陣式給的量不同，所以看起來也要不同——同一個樣子會讓玩家以為只有一種規則。
      // 玩家回報「只知道湊不同的圖案成一條線會有 buff」，正是因為同色那條路看起來一樣。
      //
      // **差別不能只靠顏色。** 金與綠對紅綠色盲來說是同一個灰，
      // 那等於把這條規則從約 8% 的男性玩家眼前整個拿掉。所以再加一層形狀：
      // 五行（全不同種）＝實線＋圓點，同心（全同種）＝虛線＋方點。
      const distinct = line.pattern === "distinct";
      const color = hexToNumber(distinct ? JADE : GOLD);
      const points = line.slots.map((slot) =>
        this.slotPosition({ where: "field", index: slot }),
      );
      const first = points[0];
      const last = points[points.length - 1];
      if (first === undefined || last === undefined) continue;
      // 外粗內細兩道：外面那道是光暈，裡面那道才是線本身。
      this.formationLayer.lineStyle(10, color, 0.18);
      this.strokeFormationLine(first, last, distinct);
      this.formationLayer.lineStyle(3, color, 0.85);
      this.strokeFormationLine(first, last, distinct);
      for (const point of points) {
        this.formationLayer.fillStyle(color, 0.9);
        if (distinct) this.formationLayer.fillCircle(point.x, point.y, 5);
        else this.formationLayer.fillRect(point.x - 5, point.y - 5, 10, 10);
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
      label.setVisible(show).setText(show ? `×${total.toFixed(2)}` : "");
    }

    // 常駐的總覽：幾條、哪一種、全場平均加成。
    if (lines.length === 0) {
      this.hudFormation.setText("");
    } else {
      const distinct = lines.filter(
        (line) => line.pattern === "distinct",
      ).length;
      const filled = bonuses.filter((_bonus, i) => this.run.field[i] != null);
      const average =
        filled.length === 0
          ? 1
          : filled.reduce((sum, b) => sum + b.damage * b.fireRate, 0) /
            filled.length;
      // 只在全部同一種時標種類；混著成的時候標了反而更難讀，線的顏色已經說了。
      const kinds =
        distinct === lines.length ? "五行 " : distinct === 0 ? "同心 " : "";
      this.hudFormation
        .setText(
          `陣法 ${kinds}${lines.length} 條　+${Math.round((average - 1) * 100)}%`,
        )
        .setColor(distinct === 0 ? GOLD : JADE);
      fitText(this.hudFormation, 316);
    }

    // 剛成立的那些才報，已經成立的不重複報。
    // 鍵含 pattern：同一條線從同心變五行是不同的陣，要重報一次。
    const keys = new Set(
      lines.map(
        (line) => `${line.kind}:${line.pattern}:${line.slots.join(",")}`,
      ),
    );
    const fresh = lines.filter(
      (line) =>
        !this.formationKeys.has(
          `${line.kind}:${line.pattern}:${line.slots.join(",")}`,
        ),
    );
    this.formationKeys = keys;
    if (fresh.length > 0) this.announceFormations(fresh);
  }

  /**
   * 陣線本身。實線代表五行、虛線代表同心。
   *
   * 虛線 Phaser 的 Graphics 沒有內建，所以自己沿著方向切段畫——
   * 這幾行的存在理由是可及性，不是好看：色盲玩家要能只看形狀就分辨兩種陣。
   */
  private strokeFormationLine(
    from: { x: number; y: number },
    to: { x: number; y: number },
    solid: boolean,
  ): void {
    if (solid) {
      this.formationLayer.lineBetween(from.x, from.y, to.x, to.y);
      return;
    }
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.hypot(dx, dy);
    if (length < 1) return;
    const step = 16;
    const drawn = 10;
    for (let at = 0; at < length; at += step) {
      const end = Math.min(at + drawn, length);
      this.formationLayer.lineBetween(
        from.x + (dx * at) / length,
        from.y + (dy * at) / length,
        from.x + (dx * end) / length,
        from.y + (dy * end) / length,
      );
    }
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
    const pos = this.slotPosition({ where: "field", index: slot });
    const color = first.pattern === "distinct" ? JADE : GOLD;
    const text =
      fresh.length === 1
        ? `${formationName(first)}成　${formationEffect(first)}`
        : `一口氣成 ${fresh.length} 條陣`;
    // 停住 1.1 秒再淡出，中文讀得完。
    this.floatText(pos.x, pos.y - 58, text, color, 22, 1100);
    audio.play("gold");
    this.showHintOnce(
      HINT_FORMATION,
      "一整條線全同種（金色虛線）或全不同種（綠色實線）都會成陣：橫排加傷害、直排加出手速度",
      260,
    );
  }

  private refreshCards(): void {
    this.handViews.forEach((view, index) => {
      const card = this.run.hand[index] ?? null;
      const dragging = this.drag?.where === "hand" && this.drag.index === index;
      view.refresh(dragging ? null : card);
    });
    this.fieldViews.forEach((view, index) => {
      const card = this.run.field[index] ?? null;
      const dragging =
        this.drag?.where === "field" && this.drag.index === index;
      view.refresh(dragging ? null : card);
    });
    this.refreshFormations();
  }

  // -------------------------------------------------------------- 主迴圈

  /**
   * 主迴圈。**固定時步**：真實時間累積成一格一格的 STEP_MS，模擬只看格數。
   *
   * 舊版把瀏覽器的畫格時間直接餵給 tickCombat，於是同一組操作在 60fps 與 30fps 的
   * 機器上會跑出不同的結果——掉幀等於變難，而且一場戰鬥無法被重播驗證。
   * 改成固定時步同時解掉這兩件事：畫格率不再影響數值，而排行榜也才有辦法
   * 用「種子＋操作記錄」在伺服器上重跑（見 src/systems/replay.ts）。
   *
   * 加速是「一幀補幾格」，不是「一格變長」——後者會讓 3× 跑出和 1× 不同的結果。
   */
  override update(_time: number, delta: number): void {
    if (this.over) return;
    // 教學的前兩步把戰鬥停住：新手還在找哪裡可以拖的時候，妖魔不該已經走到山門。
    if (this.step === "deploy" || this.step === "merge") return;
    if (this.paused) return;
    // 命中的凍格（hitstop）：這幾毫秒不進累積器，畫面停住、模擬也跟著停。
    if (this.freezeMs > 0) {
      this.freezeMs -= delta;
      return;
    }

    this.stepAccum += delta * this.speed;
    let ran = 0;
    while (this.stepAccum >= STEP_MS && ran < MAX_STEPS_PER_FRAME) {
      this.stepAccum -= STEP_MS;
      ran += 1;
      const report = tickCombat(this.run, STEP_MS, this.rng);
      this.stepIndex += 1;
      this.applyReport(report);
      if (this.run.outcome !== "running") break;
    }
    // 補不完就丟掉：分頁切回前景時 delta 可能是好幾秒，硬補會讓妖魔瞬間衝到山門。
    if (ran >= MAX_STEPS_PER_FRAME) this.stepAccum = 0;

    this.syncEnemies();
    this.animateCharge();
    this.updateHud();

    if (this.run.outcome === "cleared") this.finish(true, null);
    else if (this.run.outcome === "defeated") this.finish(false, "breached");
    else if (this.run.outcome === "timeout") this.finish(false, "timeout");
  }

  /**
   * 把一個操作記進紀錄。
   *
   * 記的是**格數**而不是毫秒：重播時就是「跑到第幾格就套用它」。
   * Phaser 的輸入事件永遠落在兩幀之間，不可能插進上面那個 while 迴圈中間，
   * 所以每個操作都精準對齊在格的邊界上——這是重播能對得起來的關鍵。
   *
   * **教學那一場照記。** 它會改寫起手牌，但那件事是確定性的，而且伺服器
   * 走同一個 applyTutorialOpening——所以它一樣重播得出來。不記的話，
   * 新玩家的第一場（也就是他打贏的第一關）永遠不會上榜。
   */
  private record(action: ReplayActionInput): void {
    if (this.actions.length >= MAX_REPLAY_ACTIONS) return;
    this.actions.push({ ...action, step: this.stepIndex });
  }

  /**
   * 出手前的預備動作：冷卻快走完時把符牌往下縮，出手那一瞬間彈回原位。
   *
   * 直接依冷卻進度算位移，不開 tween——每一格每秒可能出手好幾次，
   * 開 tween 等於每秒生出幾十個物件，而這裡要的只是一個位置。
   * 冷卻在出手時被重設成一整個間隔，所以「彈回去」是免費的：t 直接回到 0。
   */
  private animateCharge(): void {
    for (let i = 0; i < this.fieldViews.length; i += 1) {
      const view = this.fieldViews[i];
      const baseY = this.fieldSlotY[i];
      if (view === undefined || baseY === undefined) continue;
      const dragging = this.drag?.where === "field" && this.drag.index === i;
      if (this.run.field[i] == null || dragging) {
        view.container.y = baseY;
        continue;
      }
      const cooling = this.run.cooldowns[i] ?? 0;
      const t = cooling >= CHARGE_MS ? 0 : 1 - cooling / CHARGE_MS;
      view.container.y = baseY + CHARGE_DIP * t;
    }
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
        // 打在首領身上的每一下都是這一場的重點，給它重量。
        if (
          view.getData("boss") === true &&
          this.time.now - this.lastFreezeAt > FREEZE_BOSS_HIT_GAP_MS
        ) {
          this.lastFreezeAt = this.time.now;
          this.freeze(FREEZE_BOSS_HIT_MS);
        }
      }
      this.accrueDamage(shot.enemyId, shot.damage);
      if (drawn >= MAX_TRACERS_PER_FRAME) continue;
      this.tracer(
        slot.container.x,
        slot.container.y - 40,
        view.x,
        view.y,
        shot.slot,
      );
      drawn += 1;
    }
    // 命中音一秒可能響幾十次，節流成最多每 90ms 一次，而且只在真的有打到時才響。
    if (hitThisFrame.size > 0 && this.time.now - this.lastHitSoundAt > 90) {
      this.lastHitSoundAt = this.time.now;
      audio.play("hit");
    }
    this.flushDamageNumbers();

    for (const kill of report.kills) {
      const view = this.enemySprites.get(kill.enemyId);
      if (view !== undefined) {
        this.burst(
          view.x,
          view.y,
          kill.boss ? GOLD : DANGER,
          kill.boss ? 40 : 10,
        );
        this.floatText(
          view.x,
          view.y - 20,
          `+${Math.max(1, Math.round(kill.gold))}`,
          GOLD,
          20,
        );
        this.enemySprites.delete(kill.enemyId);
        this.killEnemyView(view, kill.boss);
      }
      if (kill.boss) {
        this.bossPanel?.destroy();
        this.bossPanel = null;
        // 斬殺首領是一整關的句點，凍格拉長，再補一次鏡頭震動。
        this.freeze(FREEZE_BOSS_KILL_MS);
        this.cameras.main.shake(260, 0.012);
        audio.play("victory");
      } else {
        audio.play("mob");
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
      audio.play("bossAttack");
      this.gateBar.setAlpha(1);
      this.tweens.add({ targets: this.gateBar, alpha: 0, duration: 420 });
      this.floatText(
        x,
        GATE_Y - 24,
        leak.immune ? "銅皮鐵骨" : `-${leak.loss}`,
        leak.immune ? JADE : DANGER,
        leak.immune ? 22 : leak.boss ? 40 : 34,
      );
      if (leak.boss) this.warnGateSiege();
    }

    if (report.bossSpawned) {
      this.buildBossPanel();
      this.showHintOnce(
        HINT_BOSS,
        "首領血厚，別讓它走到山門——它一撞就是六倍耐久",
        300,
      );
    }
    if (report.drawnSlot !== null) {
      this.refreshCards();
      this.pulseHand(report.drawnSlot);
    }
    // 手牌滿的時候幾乎每次抽符都會觸發，不節流的話整片畫面都是這一行字。
    // 也不讓它往上飄——飄起來會蓋到山門那一排，而它要提醒的事就在手牌區。
    if (report.drawLost && this.time.now - this.lastDrawWarnAt > 3500) {
      this.lastDrawWarnAt = this.time.now;
      this.showHintOnce(
        HINT_HAND_FULL,
        "手牌滿了會抽不到新符。用不到的符往畫面最下緣拖可以棄掉",
        706,
      );
      this.tweens.killTweensOf(this.drawWarning);
      this.drawWarning.setAlpha(1);
      this.tweens.add({
        targets: this.drawWarning,
        alpha: 0,
        delay: 1200,
        duration: 500,
      });
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
    this.tweens.add({
      targets: this.siegeText,
      alpha: 0,
      delay: 700,
      duration: 500,
    });
    this.showHintOnce(
      HINT_GATE_SIEGE,
      "首領不會自己離開——不斬掉牠，山門會一直掉耐久",
      300,
    );
  }

  private pulseHand(index: number): void {
    const view = this.handViews[index];
    if (view === undefined) return;
    this.tweens.killTweensOf(view.container);
    view.container.setScale(0.6);
    this.tweens.add({
      targets: view.container,
      scale: 1,
      duration: 220,
      ease: "Back.easeOut",
    });
  }

  private spawnEnemyView(enemy: ActiveEnemy): void {
    const x = ARENA_LEFT + LANE_WIDTH * (enemy.lane + 0.5);
    const container = this.add
      .container(x, ARENA_TOP)
      .setDepth(enemy.boss ? 24 : 20);

    if (enemy.boss && enemy.bossArt !== null) {
      const aura = this.add.circle(0, 0, 62, hexToNumber(DANGER), 0.16);
      const body = this.add
        .image(0, 0, bossTexture(enemy.bossArt))
        .setDisplaySize(140, 140);
      container.add([aura, body]);
      container.setData("body", body);
      container.setData("boss", true);
      this.tweens.add({
        targets: aura,
        alpha: 0.3,
        duration: 900,
        yoyo: true,
        repeat: -1,
      });
    } else {
      const scale = ENEMY_DISPLAY_HEIGHT / ENEMY_SOURCE_HEIGHT;
      const sprite = this.add
        .sprite(0, 0, enemyTexture(enemy.art, 0))
        .setOrigin(0.5, 0.6)
        .setScale(scale);
      sprite.play(enemyWalkKey(enemy.art));
      sprite.anims.setProgress(this.rng.next());
      container.add(sprite);
      container.setData("body", sprite);
    }

    // 一般妖魔各有一條小血條：沒有它就看不出「打不動」和「快死了」的差別。
    // 首領不畫，它的血量已經在畫面頂端有一條大的，畫兩條只是干擾。
    if (!enemy.boss) {
      const barBg = this.add.rectangle(0, -46, 46, 5, 0x000000, 0.6);
      const bar = this.add
        .rectangle(-23, -46, 46, 5, 0xd8434f, 1)
        .setOrigin(0, 0.5);
      container.add([barBg, bar]);
      container.setData("bar", bar);
    }

    if (enemy.trait !== "none") {
      const mark = TRAIT_MARK[enemy.trait];
      // 貼在血條右端，不是頭頂上：頭頂在剛出場時會落在 HUD 底下被蓋掉，
      // 而妖魔剛出場正是玩家最需要知道「這一波是什麼」的時候。
      container.add(
        this.add
          .text(
            26,
            -46,
            mark.text,
            textStyle({ size: 15, color: mark.color, bold: true }),
          )
          .setOrigin(0, 0.5)
          .setStroke("#0b0f14", 5),
      );
    }

    // 減速與灼燒的標記。特效若看不見，玩家就沒有理由相信寒冰符真的有用——
    // 一個沒有回饋的機制等於不存在。
    const frost = this.add.circle(0, -6, 30, 0x7fe0e8, 0.22).setVisible(false);
    const ember = this.add.circle(0, -6, 24, 0xf06a4a, 0.26).setVisible(false);
    container.add([frost, ember]);
    container.setData("frost", frost);
    container.setData("ember", ember);

    this.enemySprites.set(enemy.id, container);
  }

  private syncEnemies(): void {
    for (const enemy of this.run.enemies) {
      const view = this.enemySprites.get(enemy.id);
      if (view === undefined) continue;
      view.y = ARENA_TOP + enemy.y;
      const bar = view.getData("bar") as
        | Phaser.GameObjects.Rectangle
        | undefined;
      bar?.setDisplaySize(Math.max(0, 46 * (enemy.hp / enemy.maxHp)), 5);
      const frost = view.getData("frost") as Phaser.GameObjects.Arc | undefined;
      const ember = view.getData("ember") as Phaser.GameObjects.Arc | undefined;
      frost?.setVisible(enemy.slowUntilMs > this.run.elapsedMs);
      ember?.setVisible(enemy.burnRemaining > 0);
      const tintUntil = view.getData("tintUntil") as number | undefined;
      if (tintUntil !== undefined && this.time.now >= tintUntil) {
        view.setData("tintUntil", undefined);
        (view.getData("body") as EnemyBody | undefined)?.clearTint();
      }
      if (enemy.boss) this.refreshBossPanel(enemy);
    }
  }

  // -------------------------------------------------------------- 首領

  private buildBossPanel(): void {
    const boss = this.run.bossDef;
    const cx = GAME_WIDTH / 2;
    const width = GAME_WIDTH - 80;
    const name = this.add
      .text(
        cx,
        128,
        boss.name,
        textStyle({ size: 26, color: DANGER, bold: true }),
      )
      .setOrigin(0.5)
      .setStroke("#0b0f14", 6);
    const bg = this.add
      .rectangle(cx, 160, width, 22, 0x2a1216, 1)
      .setStrokeStyle(2, LINE);
    this.bossBar = this.add
      .rectangle(cx - width / 2, 160, width, 18, 0xc03a4a, 1)
      .setOrigin(0, 0.5);
    this.bossText = this.add
      .text(cx, 160, "", textStyle({ size: 15, color: INK, bold: true }))
      .setOrigin(0.5);
    this.bossPanel = this.add
      .container(0, 0, [name, bg, this.bossBar, this.bossText])
      .setDepth(48);

    // 登場演出。原本只有一行台詞加一聲鑼，關底最該有份量的那一刻反而最平——
    // 面板一出現就直接進入戰鬥，玩家常常沒發現首領已經來了。
    this.bossPanel.setAlpha(0);
    this.tweens.add({
      targets: this.bossPanel,
      alpha: 1,
      duration: 420,
      delay: 520,
    });

    // 一道紅光壓過整個戰場。
    const flash = this.add
      .rectangle(
        cx,
        (ARENA_TOP + GATE_Y) / 2,
        GAME_WIDTH,
        GATE_Y - ARENA_TOP,
        hexToNumber(DANGER),
        0,
      )
      .setDepth(46);
    this.tweens.add({
      targets: flash,
      alpha: { from: 0, to: 0.34 },
      duration: 170,
      yoyo: true,
      repeat: 1,
      onComplete: () => flash.destroy(),
    });

    // 上下兩道黑帶收進來又打開，做出「鏡頭讓位」的感覺。
    const bandHeight = 74;
    const bands = [-1, 1].map((side) =>
      this.add
        .rectangle(
          cx,
          (ARENA_TOP + GATE_Y) / 2 + side * 150,
          GAME_WIDTH,
          0,
          0x0b0f14,
          0.86,
        )
        .setDepth(47),
    );
    this.tweens.add({
      targets: bands,
      displayHeight: bandHeight,
      duration: 220,
      yoyo: true,
      hold: 900,
      ease: "Quad.easeOut",
      onComplete: () => bands.forEach((band) => band.destroy()),
    });

    const title = this.add
      .text(
        cx,
        (ARENA_TOP + GATE_Y) / 2 - 26,
        boss.name,
        textStyle({ size: 44, color: DANGER, bold: true }),
      )
      .setOrigin(0.5)
      .setStroke("#0b0f14", 8)
      .setDepth(48)
      .setScale(1.6)
      .setAlpha(0);
    this.tweens.add({
      targets: title,
      alpha: 1,
      scale: 1,
      duration: 260,
      ease: "Back.easeOut",
    });
    this.tweens.add({
      targets: title,
      alpha: 0,
      delay: 1100,
      duration: 320,
      onComplete: () => title.destroy(),
    });

    this.floatText(
      cx,
      (ARENA_TOP + GATE_Y) / 2 + 30,
      `「${boss.taunt}」`,
      INK,
      22,
      900,
    );
    this.cameras.main.shake(420, 0.011);
    audio.play("bossRoar");
  }

  private refreshBossPanel(enemy: ActiveEnemy): void {
    const width = GAME_WIDTH - 80;
    this.bossBar?.setDisplaySize(
      Math.max(0, width * (enemy.hp / enemy.maxHp)),
      18,
    );
    this.bossText?.setText(
      `${formatNumber(Math.max(0, enemy.hp))} / ${formatNumber(enemy.maxHp)}`,
    );
  }

  // -------------------------------------------------------------- 演出

  private tracer(
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    slot: number,
  ): void {
    const card = this.run.field[slot];
    const color =
      card === null || card === undefined
        ? INK
        : (CARDS.find((c) => c.id === card.type)?.color ?? INK);
    const bolt = this.add
      .image(fromX, fromY, "spark")
      .setDisplaySize(8, 26)
      .setTint(hexToNumber(color))
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(30);
    bolt.setRotation(Math.atan2(toY - fromY, toX - fromX) + Math.PI / 2);
    this.tweens.add({
      targets: bolt,
      x: toX,
      y: toY,
      duration: Phaser.Math.Clamp(
        Phaser.Math.Distance.Between(fromX, fromY, toX, toY) * 0.5,
        90,
        260,
      ),
      ease: "Quad.easeIn",
      onComplete: () => bolt.destroy(),
    });
  }

  /**
   * 命中反饋：整隻往後一縮再彈回，同時亮一下。
   *
   * 用 scale 的縮放而不是位移，是因為位移會和推進的座標打架（每一拍都在寫 y）。
   */
  /**
   * 受擊反應：彈一下、白閃一格、往後退一點。
   *
   * 三件事缺一不可。只放大會像在呼吸；只白閃看不出方向；
   * 而「被打退」是唯一能讓玩家感覺到「這一下有力量」的位移。
   *
   * 位移做在身體上、不做在容器上：容器的 y 每一幀都會被 syncEnemies 依模擬位置覆寫，
   * 動在那裡等於沒動。
   */
  private flashEnemy(
    view: Phaser.GameObjects.Container,
    killed: boolean,
  ): void {
    if (killed) return; // 死亡有自己的倒下動作，不必再閃一次
    const now = this.time.now;
    const nextAt = view.getData("flashAt") as number | undefined;
    if (nextAt !== undefined && now < nextAt) return;
    view.setData("flashAt", now + FLASH_GAP_MS);

    this.tweens.killTweensOf(view);
    view.setScale(1.14);
    this.tweens.add({
      targets: view,
      scale: 1,
      duration: 130,
      ease: "Quad.easeOut",
    });

    const body = view.getData("body") as EnemyBody | undefined;
    if (body === undefined) return;
    body.setTintFill(0xffffff);
    // 熄燈交給 syncEnemies 按時間關，不綁在位移的 tween 上：
    // 位移要 150ms 才走完，白閃只該亮 45ms，綁在一起就變成一團白。
    view.setData("tintUntil", now + FLASH_MS);
    this.tweens.killTweensOf(body);
    // 妖魔是由上往下走的，所以「往後」＝往上。
    body.y = -7;
    this.tweens.add({
      targets: body,
      y: 0,
      duration: 150,
      ease: "Quad.easeOut",
    });
  }

  /**
   * 倒下。
   *
   * 原本是 destroy() 加一次粒子爆散——畫面上只看得到「東西不見了」，
   * 看不到「它死了」。壓扁、轉倒、淡出，兩百多毫秒就把這兩件事分開。
   * 屍體只是演出：它已經從 enemySprites 移除，模擬那邊早就沒有這隻了。
   */
  private killEnemyView(
    view: Phaser.GameObjects.Container,
    boss: boolean,
  ): void {
    this.tweens.killTweensOf(view);
    const body = view.getData("body") as EnemyBody | undefined;
    if (body !== undefined) {
      this.tweens.killTweensOf(body);
      body.setTintFill(0xffffff);
    }
    this.tweens.add({
      targets: view,
      scaleX: boss ? 1.6 : 1.35,
      scaleY: 0.16,
      angle: boss ? 0 : 20,
      alpha: 0,
      duration: boss ? 460 : 230,
      ease: "Quad.easeIn",
      onComplete: () => view.destroy(),
    });
  }

  /**
   * 凍格（hitstop）。
   *
   * **它是真的把那幾毫秒從模擬裡拿掉**，不是只停畫面：整個世界一起停，
   * 妖魔不會前進、冷卻不會走、首領的計時也不會動，所以不會有「畫面停了但我被偷打」。
   * 代價是那段真實時間裡遊戲進度為零，因此只給最重的兩件事——首領受擊與斬殺首領——
   * 而且受擊那一種上了節流；每隻雜兵都凍格會讓整場變成卡頓。
   */
  private freeze(ms: number): void {
    this.freezeMs = Math.max(this.freezeMs, ms);
  }

  /**
   * 累積傷害數字，不是每一發都跳一個。
   *
   * 後期一秒有幾十次命中，逐發跳數字會變成一片閃爍的噪音，反而看不出打了多少。
   * 每隻累積 DAMAGE_FLUSH_MS 再吐一個總數，數字就大得起來也讀得到。
   */
  private accrueDamage(enemyId: number, damage: number): void {
    const entry = this.pendingDamage.get(enemyId);
    if (entry === undefined) {
      this.pendingDamage.set(enemyId, { total: damage, since: this.time.now });
      return;
    }
    entry.total += damage;
  }

  private flushDamageNumbers(): void {
    for (const [enemyId, entry] of this.pendingDamage) {
      if (this.time.now - entry.since < DAMAGE_FLUSH_MS) continue;
      this.pendingDamage.delete(enemyId);
      const view = this.enemySprites.get(enemyId);
      if (view === undefined || entry.total <= 0) continue;
      // 數字大小隨傷害佔比走：一發打掉大半血的那種，字要明顯比刮痧大。
      const enemy = this.run.enemies.find((item) => item.id === enemyId);
      const share =
        enemy === undefined ? 0.2 : entry.total / Math.max(1, enemy.maxHp);
      const heavy = share > 0.25;
      this.floatText(
        view.x + Phaser.Math.Between(-14, 14),
        view.y - 34,
        formatNumber(Math.round(entry.total)),
        heavy ? GOLD : INK,
        heavy ? 24 : 18,
      );
    }
  }

  private burst(x: number, y: number, color: string, count: number): void {
    const emitter = this.add.particles(x, y, "spark", {
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
      .setStroke("#0b0f14", 6)
      .setDepth(70);
    this.tweens.add({
      targets: label,
      y: y - 46,
      alpha: 0,
      delay: holdMs,
      duration: 700,
      ease: "Quad.easeOut",
      onComplete: () => label.destroy(),
    });
  }

  // -------------------------------------------------------------- 新手教學

  /** 教學面板。壓在畫面中段偏上，不擋住手牌與陣位——那正是玩家要動手的地方。 */
  private buildCoach(): void {
    if (this.step === "done") return;
    const cx = GAME_WIDTH / 2;
    const panel = this.add
      .rectangle(cx, 0, GAME_WIDTH - 56, 128, BG_PANEL, 0.97)
      .setStrokeStyle(2, hexToNumber(GOLD));
    this.coachTitle = this.add
      .text(cx, -36, "", textStyle({ size: 24, color: GOLD, bold: true }))
      .setOrigin(0.5);
    this.coachBody = this.add
      .text(cx, 6, "", textStyle({ size: 17, color: INK }))
      .setOrigin(0.5)
      .setAlign("center")
      .setLineSpacing(6);
    this.coach = this.add
      .container(0, 300, [panel, this.coachTitle, this.coachBody])
      .setDepth(95);

    // 往下指的箭頭：文字說「拖到下面」，還是要有東西指著才不用猜是哪裡。
    this.coachArrow = this.add
      .text(cx, 392, "▼", textStyle({ size: 30, color: GOLD, bold: true }))
      .setOrigin(0.5)
      .setDepth(95);
    this.tweens.add({
      targets: this.coachArrow,
      y: 408,
      duration: 620,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  private refreshCoach(): void {
    const copy = tutorialCopy(this.step);
    this.coachTitle?.setText(copy.title);
    this.coachBody?.setText(copy.body);
    const visible = this.step !== "done";
    this.coach?.setVisible(visible);
    this.coachArrow?.setVisible(visible);
  }

  /**
   * 玩家做到了這一步要求的動作就往下走。
   *
   * 只在「真的做到」時前進，不用計時器——新手花多久摸索都可以，
   * 而做完之後不必再等一段動畫才恢復操作。
   */
  private advanceTutorial(done: "deploy" | "merge"): void {
    if (this.step !== done) return;
    this.step = advanceStep(this.step);
    this.refreshCoach();
    // 每走一步報一次。完成率就是 watch 的人數除以 deploy 的人數——
    // 教學做完之後沒有人知道有幾個人看完第一課，這一行就是為了答那一題。
    track("tutorial_step", { step: this.step });

    if (this.step === "watch") {
      // 最後一段只是說明，不需要玩家做什麼：讀完就開打。
      this.coachArrow?.setVisible(false);
      this.time.delayedCall(3800, () => {
        this.step = "done";
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
    if (this.step !== "done") return;
    const save = state();
    if (!markHintSeen(save, id)) return;
    persist();
    const label = this.add
      .text(
        GAME_WIDTH / 2,
        y,
        text,
        textStyle({ size: 19, color: GOLD, bold: true }),
      )
      .setOrigin(0.5)
      .setStroke("#0b0f14", 6)
      .setDepth(92);
    fitText(label, GAME_WIDTH - 40);
    this.tweens.add({
      targets: label,
      alpha: 0,
      delay: 2600,
      duration: 600,
      onComplete: () => label.destroy(),
    });
  }

  private showIntro(accentHex: string): void {
    const realm = realmForStage(this.run.stage);
    const title = this.add
      .text(
        GAME_WIDTH / 2,
        380,
        realmTitle(this.run.stage),
        textStyle({ size: 48, color: accentHex, bold: true }),
      )
      .setOrigin(0.5)
      .setDepth(80);
    const sub = this.add
      .text(
        GAME_WIDTH / 2,
        434,
        realm.subtitle,
        textStyle({ size: 20, color: INK_DIM }),
      )
      .setOrigin(0.5)
      .setDepth(80);
    // 開場這一格本來就會停一下讓玩家看境界名，把「這一關該學的那一條」掛在同一個位置：
    // 規則在它第一次派上用場的當下講，比塞在一頁說明裡有效得多。
    const lesson =
      this.step === "done" ? lessonForStage(state(), this.run.stage) : null;
    const parts: Phaser.GameObjects.GameObject[] = [title, sub];
    let hold = 1100;

    if (lesson === null) {
      parts.push(
        this.add
          .text(
            GAME_WIDTH / 2,
            492,
            "把符拖到陣位；同種同階疊起來可以合成",
            textStyle({ size: 20, color: INK }),
          )
          .setOrigin(0.5)
          .setDepth(80),
      );
    } else {
      const panel = this.add
        .rectangle(GAME_WIDTH / 2, 528, GAME_WIDTH - 60, 132, BG_PANEL, 0.95)
        .setStrokeStyle(2, hexToNumber(GOLD))
        .setDepth(80);
      const heading = this.add
        .text(
          GAME_WIDTH / 2,
          486,
          lesson.title,
          textStyle({ size: 24, color: GOLD, bold: true }),
        )
        .setOrigin(0.5)
        .setDepth(81);
      const body = this.add
        .text(
          GAME_WIDTH / 2,
          546,
          lesson.body,
          textStyle({ size: 18, color: INK }),
        )
        .setOrigin(0.5)
        .setLineSpacing(8)
        .setAlign("center")
        .setDepth(81);
      parts.push(panel, heading, body);
      // 一課只上一次，開場就記起來——玩家中途退出也不該再被教一遍。
      const save = state();
      if (markLessonSeen(save, lesson)) persist();
      // 兩行字要讀得完，停久一點。境界名那一段本來只停 1.1 秒，對一句話來說太短。
      hold = 3400;
      audio.play("ui");
    }

    this.tweens.add({
      targets: parts,
      alpha: 0,
      delay: hold,
      duration: 600,
      onComplete: () => {
        for (const part of parts) part.destroy();
      },
    });
  }

  private updateHud(): void {
    const run = this.run;
    this.hudLives.setText(`山門 ${run.disciples}`);
    this.hudLives.setColor(
      run.disciples <= run.maxDisciples * 0.3 ? DANGER : JADE,
    );
    this.refreshGateDamage();
    this.hudPower.setText(
      `每秒輸出 ${formatNumber(fieldDps(run.field, run.loadout))}`,
    );
    fitText(this.hudPower, 190);
    // 競技場沒有上限，寫一個「40」只會讓人以為那是個目標。
    this.hudTier.setText(
      run.loadout.arena
        ? "階數無上限"
        : `階數上限 ${tierCapFor(run.loadout, run.threat)}`,
    );
    this.hudGold.setText(`金幣 ${formatNumber(run.gold)}`);
    fitText(this.hudGold, 150);

    // 波次與進度條算的是「這一波打到哪」，不是「這一場打到哪」——
    // 無限模式一場會連著打好幾波，用整場的時間算的話第二波開始就永遠是滿的。
    const inStageMs = Math.max(0, run.elapsedMs - run.stageStartMs);
    const total = BALANCE.wave.wavesPerStage * BALANCE.wave.waveIntervalMs;
    const progress = Phaser.Math.Clamp(inStageMs / total, 0, 1);
    const wave = Math.min(
      BALANCE.wave.wavesPerStage,
      Math.floor(inStageMs / BALANCE.wave.waveIntervalMs) + 1,
    );
    if (this.endlessBanner !== null && this.dungeonBanner !== null) {
      this.dungeonBanner.setText(this.endlessBanner(run.clearedStages + 1));
    }
    this.hudWave.setText(
      run.bossSpawnedAtMs === null
        ? `第 ${wave} / ${BALANCE.wave.wavesPerStage} 波`
        : "首領",
    );
    this.waveBar.setDisplaySize(GAME_WIDTH * progress, 4);
  }

  // -------------------------------------------------------------- 結束

  /**
   * 失敗診斷：從這場的實際數字挑出最該補的一項。
   * 只說「失守」玩家學不到東西，會一直用同一套打法重撞。
   */
  private diagnose(reason: "breached" | "timeout" | "abandon" | null): string {
    if (reason === "abandon") return "中途退出，未計入通關";
    const cap = tierCapFor(this.run.loadout, this.run.threat);
    if (reason === "timeout") {
      return "首領血太厚而輸出不夠——把符合到更高階，或提升淬鍊功法與御器訣";
    }
    if (!this.run.bossKilled && this.run.bossSpawnedAtMs !== null) {
      return "首領撐到了山門前，砸門的傷害比你的輸出快——關底需要更高階的符，別把符鋪散了";
    }
    if (this.run.peakTier < cap - 1) {
      return `法寶只合到 ${this.run.peakTier} 階（上限 ${cap}）——與其鋪滿低階符，不如集中合成同一種`;
    }
    if (this.run.merges < 6) {
      return "合成次數太少，輸出全靠低階符堆——提升引靈訣可以多抽幾張來合";
    }
    return "妖魔清得不夠快，被前幾隻拖住後面就崩了——把符往同一種集中合成，或提升聚眾成軍多撐幾次";
  }

  private finish(
    victory: boolean,
    reason: "breached" | "timeout" | "abandon" | null,
  ): void {
    if (this.over) return;
    this.over = true;
    audio.play(victory ? "victory" : "defeat");

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
      telemetry: this.run.telemetry,
      elapsedMs: this.run.elapsedMs,
      endlessCleared: this.run.loadout.endless ? this.run.clearedStages : null,
      // 哪一場算數的規則在 runIsRankable 裡，不在這一行三元運算裡——
      // 它錯掉的症狀是玩家永遠不會上榜，而畫面上完全看不出來。
      submission:
        this.runLoadout === null ||
        !runIsRankable({
          abandoned: reason === "abandon",
          dungeonRules:
            this.dungeonRun === null
              ? null
              : (dungeonById(this.dungeonRun.id)?.rules ?? []),
        })
          ? null
          : {
              // 開打那一關，不是結算頁顯示的那一關——見 RunSubmission.stage。
              stage: this.run.loadout.stage,
              runs: this.seedRuns,
              steps: this.stepIndex,
              actions: this.actions,
              loadout: this.runLoadout,
              arena: this.run.loadout.arena,
              tutorial: this.tutorialRun,
            },
      dungeon: this.dungeonRun,
    };

    fadeToScene(this, "Result", result);
  }
}
