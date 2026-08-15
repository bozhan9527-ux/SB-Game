import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, PALETTE, hex } from '../config';
import { balance, gates } from '../data/load';
import { project, roadEdgesAt } from '../systems/projection';
import {
  createRun,
  step,
  attackAfterGates,
  type GateRunState,
  type RunGate,
} from '../systems/gateRun';
import { DragTracker } from '../input/drag';

/**
 * 階段 A 原型：2.5D 閘門推進。
 *
 * 本場景只負責「把狀態畫出來」與「把輸入轉成橫向位置」。
 * 推進與判定的規則全在 src/systems/gateRun.ts，見 TECH_SPEC 第 4.6 節。
 */
export class BattleScene extends Phaser.Scene {
  private run!: GateRunState;
  private drag!: DragTracker;
  private gfx!: Phaser.GameObjects.Graphics;
  private gateLabels: Phaser.GameObjects.Text[] = [];
  private hud!: Phaser.GameObjects.Text;
  private banner!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;
  private awaitingRestart = false;

  constructor() {
    super('Battle');
  }

  create(): void {
    const { drag: dragCfg, gateRun } = balance;

    this.drag = new DragTracker(dragCfg, gateRun.playerMaxX);
    this.gfx = this.add.graphics();

    this.hud = this.add
      .text(16, 14, '', {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: hex(PALETTE.text),
        lineSpacing: 4,
      })
      .setDepth(10);

    this.banner = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT * 0.34, '', {
        fontFamily: 'sans-serif',
        fontSize: '40px',
        color: hex(PALETTE.text),
        align: 'center',
      })
      .setOrigin(0.5)
      .setDepth(10);

    this.hint = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 60, '← 按住拖曳選門 →', {
        fontFamily: 'sans-serif',
        fontSize: '24px',
        color: hex(PALETTE.textDim),
      })
      .setOrigin(0.5)
      .setDepth(10);

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.awaitingRestart) {
        this.startRun();
        return;
      }
      this.drag.onPointerDown(p.x);
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (p.isDown) this.drag.onPointerMove(p.x);
    });
    this.input.on('pointerup', () => this.drag.onPointerUp());

    this.startRun();
  }

  private startRun(): void {
    const { gateRun, battleStart, encounters } = balance;
    const minion = encounters['minion'];
    // encounters 由 zod 驗證，但 key 的存在與否無法在型別層保證。
    const min = minion?.minGates ?? 3;
    const max = minion?.maxGates ?? 5;
    const gateCount = min + Math.floor(Math.random() * (max - min + 1));

    this.run = createRun(gates, gateRun, {
      gateCount,
      startGel: battleStart.gel,
      gelMax: battleStart.gelMax,
      startShield: battleStart.shield,
      random: Math.random,
    });

    this.drag.reset();
    this.awaitingRestart = false;
    this.banner.setText('');
    this.hint.setText('← 按住拖曳選門 →');
    this.syncGateLabels();
  }

  /** 每道閘門左右各一個標籤，數量隨場次變動時重建。 */
  private syncGateLabels(): void {
    const needed = this.run.gates.length * 2;
    while (this.gateLabels.length < needed) {
      this.gateLabels.push(
        this.add
          .text(0, 0, '', {
            fontFamily: 'sans-serif',
            fontSize: '28px',
            color: hex(PALETTE.text),
            align: 'center',
          })
          .setOrigin(0.5)
          .setDepth(5),
      );
    }
    for (const t of this.gateLabels) t.setVisible(false);
  }

  update(_time: number, delta: number): void {
    if (!this.awaitingRestart) {
      const result = step(
        this.run,
        delta,
        this.drag.x,
        gates,
        balance.gateRun,
        balance.battleStart.gelMax,
      );
      this.run = result.state;

      for (const e of result.events) {
        if (e.type === 'gate' && e.choice === 'wall') {
          this.cameras.main.shake(180, 0.008);
        }
        if (e.type === 'finished') {
          this.awaitingRestart = true;
          const dmg = attackAfterGates(balance.battleStart.baseAttack, this.run.stats);
          this.banner.setText(`推進結束\n反擊傷害 ${Math.round(dmg)}`);
          this.hint.setText('點擊畫面再跑一次');
        }
      }
    }

    this.draw();
  }

  private draw(): void {
    const g = this.gfx;
    const { projection: proj } = balance;
    g.clear();

    this.drawSkyAndGround(g);
    this.drawRoad(g);

    // 由遠至近繪製，否則近處的閘門會被遠處的蓋住（TECH_SPEC 第 4.6 節）。
    const ordered = this.run.gates
      .map((gate, index) => ({ gate, index }))
      .filter(({ gate }) => !gate.resolved && gate.z <= proj.farZ && gate.z > 0)
      .sort((a, b) => b.gate.z - a.gate.z);

    for (const t of this.gateLabels) t.setVisible(false);
    for (const { gate, index } of ordered) this.drawGate(g, gate, index);

    this.drawPlayer(g, balance.render.playerZ);
    this.updateHud();
  }

  private drawSkyAndGround(g: Phaser.GameObjects.Graphics): void {
    const horizon = balance.projection.horizonY;
    g.fillGradientStyle(
      PALETTE.skyTop,
      PALETTE.skyTop,
      PALETTE.skyBottom,
      PALETTE.skyBottom,
      1,
    );
    g.fillRect(0, 0, GAME_WIDTH, horizon);
    g.fillStyle(PALETTE.ground, 1);
    g.fillRect(0, horizon, GAME_WIDTH, GAME_HEIGHT - horizon);
  }

  private drawRoad(g: Phaser.GameObjects.Graphics): void {
    const { projection: proj, render } = balance;
    const segments = render.roadSampleCount;

    // 由遠至近逐段畫出路面，條紋依已推進距離交替，產生速度感。
    for (let i = 0; i < segments; i++) {
      const zFar = proj.farZ - (i * (proj.farZ - proj.nearZ)) / segments;
      const zNear = proj.farZ - ((i + 1) * (proj.farZ - proj.nearZ)) / segments;

      const far = roadEdgesAt(zFar, proj, GAME_WIDTH);
      const near = roadEdgesAt(zNear, proj, GAME_WIDTH);

      const band = Math.floor((zFar + this.run.travelled) / render.stripeLengthZ);
      g.fillStyle(band % 2 === 0 ? PALETTE.road : PALETTE.roadStripe, 1);
      g.fillPoints(
        [
          new Phaser.Geom.Point(far.left, far.y),
          new Phaser.Geom.Point(far.right, far.y),
          new Phaser.Geom.Point(near.right, near.y),
          new Phaser.Geom.Point(near.left, near.y),
        ],
        true,
      );
    }

    // 路緣與中線
    const nearEdge = roadEdgesAt(proj.nearZ, proj, GAME_WIDTH);
    const farEdge = roadEdgesAt(proj.farZ, proj, GAME_WIDTH);
    g.lineStyle(3, PALETTE.roadEdge, 0.7);
    g.lineBetween(farEdge.left, farEdge.y, nearEdge.left, nearEdge.y);
    g.lineBetween(farEdge.right, farEdge.y, nearEdge.right, nearEdge.y);

    // 死區：停在這條帶子裡通過閘門等於撞牆，畫出來讓玩家看得見代價。
    const dz = balance.gateRun.deadZoneX;
    const dzNearL = project(-dz, proj.nearZ, proj, GAME_WIDTH);
    const dzNearR = project(dz, proj.nearZ, proj, GAME_WIDTH);
    const dzFarL = project(-dz, proj.farZ, proj, GAME_WIDTH);
    const dzFarR = project(dz, proj.farZ, proj, GAME_WIDTH);
    g.fillStyle(PALETTE.deadZone, 0.22);
    g.fillPoints(
      [
        new Phaser.Geom.Point(dzFarL.x, dzFarL.y),
        new Phaser.Geom.Point(dzFarR.x, dzFarR.y),
        new Phaser.Geom.Point(dzNearR.x, dzNearR.y),
        new Phaser.Geom.Point(dzNearL.x, dzNearL.y),
      ],
      true,
    );
  }

  private drawGate(
    g: Phaser.GameObjects.Graphics,
    gate: RunGate,
    index: number,
  ): void {
    const { projection: proj, render } = balance;
    const half = proj.roadHalfWidth;

    const sides = [
      { id: gate.left, from: -half, to: 0, labelAt: -half / 2, slot: index * 2 },
      { id: gate.right, from: 0, to: half, labelAt: half / 2, slot: index * 2 + 1 },
    ];

    for (const side of sides) {
      const type = gates.types[side.id];
      if (type === undefined) continue;

      const a = project(side.from, gate.z, proj, GAME_WIDTH);
      const b = project(side.to, gate.z, proj, GAME_WIDTH);
      const topOffset = render.gateHeightWorld * a.scale;

      // 帶負面效果的閘門用警示色，讓取捨在畫面上就看得出來。
      const harmful = type.effects.some((e) =>
        e.op === 'mul' ? e.value < 1 : e.value < 0,
      );
      const color = harmful ? PALETTE.gateBad : PALETTE.gateGood;

      g.fillStyle(color, 0.18);
      g.fillPoints(
        [
          new Phaser.Geom.Point(a.x, a.y),
          new Phaser.Geom.Point(b.x, b.y),
          new Phaser.Geom.Point(b.x, b.y - topOffset),
          new Phaser.Geom.Point(a.x, a.y - topOffset),
        ],
        true,
      );
      g.lineStyle(2, color, 0.9);
      g.strokeRect(a.x, a.y - topOffset, b.x - a.x, topOffset);

      // 太遠的閘門只畫面板不畫字：遠處閘門在畫面上彼此很近，
      // 全部標字會疊成一團，反而看不出這是一組取捨。
      const label = this.gateLabels[side.slot];
      if (label !== undefined && a.scale >= render.labelMinScale) {
        const c = project(side.labelAt, gate.z, proj, GAME_WIDTH);
        label
          .setText(type.label)
          .setPosition(c.x, c.y - topOffset / 2)
          .setScale(Phaser.Math.Clamp(c.scale / 120, 0.4, 1.4))
          .setColor(hex(color))
          .setVisible(true);
      }
    }
  }

  private drawPlayer(g: Phaser.GameObjects.Graphics, z: number): void {
    const { projection: proj, render } = balance;
    const p = project(this.drag.x, z, proj, GAME_WIDTH);
    const r = render.playerRadiusWorld * p.scale;

    // 畫成略扁的橢圓：既像史萊姆，也壓低垂直高度——
    // 圓的上緣在透視上對應更遠的距離，那裡路面更窄，過高會凸出路面外。
    const bodyH = r * 1.55;
    const cy = p.y - bodyH / 2;

    g.fillStyle(0x000000, 0.25);
    g.fillEllipse(p.x, p.y, r * 2.1, r * 0.55);
    g.fillStyle(PALETTE.slime, 1);
    g.fillEllipse(p.x, cy, r * 2, bodyH);
    g.fillStyle(PALETTE.slimeEye, 1);
    g.fillCircle(p.x - r * 0.32, cy - bodyH * 0.12, r * 0.14);
    g.fillCircle(p.x + r * 0.32, cy - bodyH * 0.12, r * 0.14);
  }

  private updateHud(): void {
    const s = this.run.stats;
    const passed = this.run.gates.filter((g) => g.resolved).length;
    const dmg = attackAfterGates(balance.battleStart.baseAttack, s);
    this.hud.setText(
      [
        `閘門 ${passed}/${this.run.gates.length}`,
        `凝膠 ${Math.round(s.gel)}   護盾 ${s.shield}`,
        `反擊 ${Math.round(dmg)}`,
      ].join('\n'),
    );
  }
}
