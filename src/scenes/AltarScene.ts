/**
 * 飛升台：每一世開始前，自己勾這一世要背的天劫。
 *
 * 世界永遠是同一個，變的是玩家自己選擇背多少限制——背得越多，飛升時仙緣越多；
 * 劫數就是「重天」，九重天（劫數 18）渡劫就是證道。七種天劫各三重，組合會隨著
 * 解鎖越來越多，而這不需要畫任何新世界（見 ROGUELITE_DESIGN.md）。
 *
 * **只能在一世的開頭改。** 中途能改的話，打到第 80 關把天劫全卸下，最後一關照樣拿高倍率。
 */
import Phaser from 'phaser';
import { audio } from '../audio';
import { glyphTexture } from '../art';
import { GAME_WIDTH } from '../config';
import { REALMS, TRIBULATIONS } from '../data';
import type { TribulationDef } from '../data/types';
import { persist, state } from '../state';
import {
  MAX_TRIB_LEVEL,
  heavenName,
  heavenOf,
  jieCount,
  karmaMultiplier,
  setTribulation,
  tribLevelOpen,
} from '../systems/karma';
import { drawBackdrop } from '../ui/backdrop';
import { createButton } from '../ui/button';
import { pixelPanel } from '../ui/panel';
import { roughRect } from '../ui/sketch';
import { GOLD, INK, INK_DIM, hexToNumber, fitText, textStyle } from '../ui/theme';
import { fadeIn, fadeToScene } from '../ui/transition';

/** 飛升台開著嗎：一世剛開始、還沒過任何一關。 */
export function altarOpen(): boolean {
  const save = state();
  return save.world.stage === 1 && save.world.realmRun.offer === null && Object.keys(save.world.realmRun.blessings).length === 0;
}

const NUMERALS = ['一', '二', '三'] as const;

export class AltarScene extends Phaser.Scene {
  constructor() {
    super('Altar');
  }

  create(): void {
    fadeIn(this);
    const save = state();
    const last = REALMS[REALMS.length - 1];
    if (last !== undefined) drawBackdrop(this, last);
    const cx = GAME_WIDTH / 2;
    const editable = altarOpen();

    this.add.text(cx, 52, '飛 升 台', textStyle({ size: 38, color: INK })).setStroke('#f5eddb', 8).setOrigin(0.5);
    this.add
      .text(
        cx,
        90,
        editable ? `第 ${save.player.karma.rebirths + 1} 世即將開始・勾選這一世要背負的天劫` : '這一世已經開始，天劫要到下一世才能改',
        textStyle({ size: 15, color: INK_DIM }),
      )
      .setStroke('#f5eddb', 5)
      .setOrigin(0.5);

    const jie = jieCount(save.world.tribulations);
    pixelPanel(this, cx, 156, GAME_WIDTH - 48, 92, { accent: hexToNumber(GOLD) });
    const cols: [number, string, string, string][] = [
      [cx - 160, '劫數', String(jie), '#c8372d'],
      [cx, '本世境界', heavenName(heavenOf(jie)), INK],
      [cx + 160, '仙緣倍率', `×${karmaMultiplier(jie).toFixed(2)}`, GOLD],
    ];
    for (const [x, label, value, color] of cols) {
      this.add.text(x, 136, label, textStyle({ size: 15, color: INK_DIM })).setOrigin(0.5);
      this.add.text(x, 172, value, textStyle({ size: 26, color })).setOrigin(0.5);
    }

    TRIBULATIONS.forEach((def, i) => this.buildRow(def, 224 + i * 80, editable));

    this.add
      .text(cx, 798, '「鎖」＝到「仙緣」用點數解鎖下一重；九重天需劫數 18', textStyle({ size: 13, color: INK_DIM }))
      .setOrigin(0.5);

    createButton(this, cx, 846, {
      width: 320,
      height: 56,
      label: editable ? `入世（第 ${save.player.karma.rebirths + 1} 世）` : '回主畫面',
      fontSize: 23,
      ...(editable ? { fillColor: hexToNumber(GOLD) } : {}),
      onClick: () => fadeToScene(this, 'Title'),
    });
    createButton(this, cx, 912, {
      width: 220,
      height: 46,
      label: '仙緣・解鎖',
      fontSize: 18,
      onClick: () => fadeToScene(this, 'Rebirth'),
    });
  }

  private buildRow(def: TribulationDef, y: number, editable: boolean): void {
    const save = state();
    const level = Math.max(0, Math.min(MAX_TRIB_LEVEL, save.world.tribulations[def.id] ?? 0));
    const left = 24;
    const width = GAME_WIDTH - 48;
    const g = this.add.graphics();
    roughRect(g, left, y, width, 72, {
      fill: level > 0 ? 0xf4e6cf : 0xefe8da,
      stroke: 0x2a2622,
      width: 2,
      seed: y,
    });
    if (this.textures.exists(glyphTexture(this.glyphOf(def.id)))) {
      this.add.image(left + 32, y + 36, glyphTexture(this.glyphOf(def.id))).setDisplaySize(40, 50);
    }
    this.add.text(left + 64, y + 22, def.name, textStyle({ size: 20, color: level > 0 ? INK : INK_DIM })).setOrigin(0, 0.5);
    const shown = def.levels[Math.max(0, level - 1)];
    const desc = this.add
      .text(left + 64, y + 50, level > 0 ? shown?.desc ?? def.desc : `未背負（一重：${def.levels[0]?.desc ?? def.desc}）`, textStyle({ size: 13, color: INK_DIM }))
      .setOrigin(0, 0.5);
    fitText(desc, width - 64 - 160);

    for (let k = 1; k <= MAX_TRIB_LEVEL; k += 1) {
      const x = left + width - 150 + (k - 1) * 48 + 18;
      const open = tribLevelOpen(save, def.id, k);
      const on = k <= level;
      const pip = this.add.graphics();
      roughRect(pip, x - 19, y + 17, 38, 38, {
        fill: !open ? 0xd9d2c4 : on ? 0xc8372d : 0xfbf5e8,
        stroke: 0x2a2622,
        width: 1.8,
        seed: x + y,
      });
      this.add
        .text(x, y + 36, open ? NUMERALS[k - 1] ?? '' : '鎖', textStyle({ size: 17, color: !open ? '#8a8070' : on ? '#fbeedd' : INK_DIM }))
        .setOrigin(0.5);
      if (!editable || !open) continue;
      const hit = this.add.rectangle(x, y + 36, 44, 44, 0xffffff, 0).setInteractive({ useHandCursor: true });
      hit.on('pointerup', () => {
        // 點目前那一重就退一重，點別的就設成那一重。
        const want = k === level ? k - 1 : k;
        if (!setTribulation(state(), def.id, want)) return;
        persist();
        audio.play('ui');
        this.scene.restart();
      });
    }
  }

  private glyphOf(id: string): string {
    return tribulationGlyph(id);
  }
}

/** 天劫的圖示：借用意思最近的符紋。 */
export function tribulationGlyph(id: string): string {
  const map: Record<string, string> = {
    thunder: 'bolt',
    heavenfire: 'pyre',
    heartDemon: 'soul',
    gale: 'gale',
    collapse: 'breaker',
    cloud: 'tempest',
    horde: 'myriad',
  };
  return map[id] ?? 'seal';
}
