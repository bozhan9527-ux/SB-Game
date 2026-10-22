import Phaser from 'phaser';
import { composeDisciples, preloadArt, setCardPaper } from '../art';
import { lookOf } from '../systems/stones';
import { GAME_HEIGHT, GAME_WIDTH } from '../config';
import { hasSave } from '../save';
import { state } from '../state';
import { realmForStage } from '../systems/realms';
import { initState } from '../state';
import { initTelemetry, setTelemetryEnabled, track } from '../telemetry';
import { DANGER, EDGE, INK, LACQUER, TALISMAN, textStyle, wrapText } from '../ui/theme';
import { roughRect } from '../ui/sketch';

/** 山門的貼圖：先載這兩張（很小），載入畫面本身就是一座關著的山門。 */
const DOOR = 'boot-door';
const LINTEL = 'boot-lintel';
/** 門扇的上緣（遊戲點）：門楣壓在門扇上方。 */
const DOOR_TOP = 140;
const DOOR_W = GAME_WIDTH / 2;
const DOOR_H = GAME_HEIGHT - DOOR_TOP;
/** 封條在門縫上的高度。 */
const SEAL_Y = 450;
const BAR_W = 196;

/**
 * 啟動場景：一座關著的山門。門縫貼著一道封條，上面寫「正在開啟山門…」與載入進度；
 * 美術載完之後封條撕開、兩扇門往裡推開，門後就是開場動畫。
 *
 * 載入畫面是每次開遊戲都會看到的東西，與其放一條進度列，不如讓它就是「進山門」這件事本身——
 * 進度走完的那一刻，玩家看到的是門開了，而不是一個畫面換成另一個畫面。
 *
 * 資料格式錯誤會在這裡被擋下並顯示在畫面上，而不是讓遊戲跑到一半才崩。
 */
export class BootScene extends Phaser.Scene {
  private opened = false;

  constructor() {
    super('Boot');
  }

  preload(): void {
    // 只先載山門本身。其餘美術在 create 裡接著載，門才能先出現。
    const base = import.meta.env.BASE_URL;
    this.load.image(DOOR, `${base}art/${DOOR}.webp`);
    this.load.image(LINTEL, `${base}art/${LINTEL}.webp`);
  }

  create(): void {
    try {
      // 是不是全新的一台裝置，要在 initState() 之前問——它會建立一份預設存檔。
      const fresh = !hasSave();
      const save = initState();
      setTelemetryEnabled(save.settings.telemetry);
      // 不 await：遙測載入失敗或很慢都不該擋住開場。
      void initTelemetry().then(() => {
        track('app_open', {
          stage: save.world.stage,
          highest_stage: save.world.highestStage,
          clears: save.world.clears,
          runs: save.world.runs,
          sect: save.player.sectId,
          rebirths: save.player.karma.rebirths,
          is_new: fresh,
        });
      });
    } catch (error) {
      this.showError(error);
      return;
    }

    const paper = this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0xfbfaf5).setOrigin(0, 0);
    const doors = this.buildDoors();
    const seal = this.buildSeal();

    const boot = state();
    preloadArt(this, realmForStage(boot.world.stage).id, lookOf(boot), boot.player.stones.paper);
    this.load.on('progress', (value: number) => seal.progress(value));
    this.load.once('complete', () => {
      // 穿著時裝的話，門人一開始就疊時裝的部件（換裝時藏寶閣會再疊一次）
      composeDisciples(this, lookOf(state()));
      setCardPaper(state().player.stones.paper);
      seal.progress(1);
      // 進度走滿之後停一下：一閃就開門，玩家看不到「載完了」這件事。
      this.time.delayedCall(260, () => this.openGate(paper, doors, seal.container));
    });
    this.load.start();
  }

  private buildDoors(): { left: Phaser.GameObjects.Image | null; right: Phaser.GameObjects.Image | null; lintel: Phaser.GameObjects.Image | null } {
    if (!this.textures.exists(DOOR)) return { left: null, right: null, lintel: null };
    const left = this.add.image(0, DOOR_TOP, DOOR).setOrigin(0, 0).setDisplaySize(DOOR_W, DOOR_H);
    const right = this.add
      .image(GAME_WIDTH, DOOR_TOP, DOOR)
      .setOrigin(0, 0)
      .setDisplaySize(DOOR_W, DOOR_H)
      .setFlipX(true);
    // 翻轉的那一扇以右緣為軸：原點設在右上角。
    right.setOrigin(1, 0);
    const lintel = this.textures.exists(LINTEL)
      ? this.add.image(GAME_WIDTH / 2, 0, LINTEL).setOrigin(0.5, 0).setDisplaySize(GAME_WIDTH, 220)
      : null;
    return { left, right, lintel };
  }

  /** 封條：一道黃紙橫貼在門縫上，朱框、寫字、下面一條墨線進度。 */
  private buildSeal(): { container: Phaser.GameObjects.Container; progress: (value: number) => void } {
    const g = this.add.graphics();
    roughRect(g, -150 + 3, -44 + 4, 300, 88, { fill: EDGE, fillAlpha: 0.2, stroke: null, seed: 7 });
    roughRect(g, -150, -44, 300, 88, { fill: TALISMAN, stroke: EDGE, width: 2.4, seed: 7 });
    roughRect(g, -142, -36, 284, 72, { stroke: LACQUER, width: 1.4, double: false, amp: 0.6, seed: 8 });
    const label = this.add.text(0, -12, '正在開啟山門…', textStyle({ size: 22, color: INK })).setOrigin(0.5);
    const track = this.add.graphics();
    roughRect(track, -BAR_W / 2, 12, BAR_W, 10, { stroke: EDGE, width: 1.6, double: false, amp: 0.5, seed: 9 });
    const fill = this.add.rectangle(-BAR_W / 2 + 2, 17, 0, 6, LACQUER, 0.9).setOrigin(0, 0.5);
    const container = this.add.container(GAME_WIDTH / 2, SEAL_Y, [g, label, track, fill]).setAngle(-2);
    return {
      container,
      progress: (value: number) => fill.setDisplaySize(Math.max(0.01, (BAR_W - 4) * value), 6),
    };
  }

  /**
   * 開門：封條撕下飄落 → 兩扇門往裡推開（以外緣為軸收窄、轉暗）→ 門楣淡出。
   * 開場動畫在門後同時開始跑，門開到一半就看得到它。
   */
  private openGate(
    paper: Phaser.GameObjects.Rectangle,
    doors: { left: Phaser.GameObjects.Image | null; right: Phaser.GameObjects.Image | null; lintel: Phaser.GameObjects.Image | null },
    seal: Phaser.GameObjects.Container,
  ): void {
    if (this.opened) return;
    this.opened = true;

    // 開場動畫在底下開始；山門這一層蓋在最上面。開場被點掉（直接進主畫面）時，山門跟著收掉。
    this.scene.launch('Splash', { gateMs: 1200 });
    this.scene.bringToTop();
    this.scene.get('Splash').events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scene.stop());

    this.tweens.add({ targets: seal, y: SEAL_Y + 90, angle: 14, alpha: 0, duration: 420, ease: 'Quad.easeIn' });
    this.tweens.add({ targets: paper, alpha: 0, duration: 300, delay: 200 });

    const swing = [doors.left, doors.right].filter((door): door is Phaser.GameObjects.Image => door !== null);
    if (swing.length === 0) {
      this.time.delayedCall(450, () => this.scene.stop());
      return;
    }
    const shade = { t: 0 };
    this.tweens.add({
      targets: shade,
      t: 1,
      delay: 220,
      duration: 950,
      ease: 'Cubic.easeIn',
      onUpdate: () => {
        // 門往裡轉：看得到的寬度變窄、受光變暗。
        const width = DOOR_W * (1 - shade.t * 0.9);
        const tone = Phaser.Display.Color.Interpolate.ColorWithColor(
          Phaser.Display.Color.ValueToColor(0xffffff),
          Phaser.Display.Color.ValueToColor(0x6a4a3a),
          100,
          shade.t * 100,
        );
        const tint = Phaser.Display.Color.GetColor(tone.r, tone.g, tone.b);
        for (const door of swing) door.setDisplaySize(width, DOOR_H).setTint(tint);
      },
      onComplete: () => {
        for (const door of swing) this.tweens.add({ targets: door, alpha: 0, duration: 220 });
        if (doors.lintel !== null) {
          this.tweens.add({ targets: doors.lintel, y: -60, alpha: 0, duration: 380, ease: 'Quad.easeIn' });
        }
        this.time.delayedCall(420, () => this.scene.stop());
      },
    });
  }

  private showError(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 40, '啟動失敗', textStyle({ size: 34, color: DANGER, bold: true }))
      .setOrigin(0.5);
    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 20, wrapText(message, GAME_WIDTH - 60, 18), textStyle({ size: 18, color: INK }))
      .setOrigin(0.5)
      .setAlign('center');
  }
}
