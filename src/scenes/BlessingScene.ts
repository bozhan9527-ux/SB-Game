/**
 * 擇一機緣：每過一關三選一（第五關是稀有三選一）。
 *
 * 版面照示意圖（ROGUELITE_DESIGN.md）：上面是這一關剛打完、山門帶進下一關多少；
 * 中間三張卡（攻朱、守青、運金），點一下選中、再按「取此機緣」；下面列出本局已有的機緣。
 * 選中要兩步，是因為三張卡貼得很近——一點就生效的話，手指滑過去就選錯了。
 *
 * 候選在存檔裡（realmRun.offer），所以離開再回來看到的是同一組；重抽要花次數。
 */
import Phaser from 'phaser';
import { audio } from '../audio';
import { glyphTexture } from '../art';
import { GAME_WIDTH } from '../config';
import type { BlessingDef } from '../data/types';
import { persist, state } from '../state';
import {
  CATEGORY_LABEL,
  MAX_STARS,
  blessingDef,
  blessingText,
  effectiveStars,
} from '../systems/blessings';
import { layerInRun, pickBlessing, rerollOffer, rerollsLeft, RUN_LENGTH } from '../systems/realmrun';
import { realmForStage, realmTitle } from '../systems/realms';
import { track } from '../telemetry';
import { drawBackdrop } from '../ui/backdrop';
import { createButton } from '../ui/button';
import type { Button } from '../ui/button';
import { burstPixels } from '../ui/effects';
import { pixelPanel } from '../ui/panel';
import { drawSeal, roughRect } from '../ui/sketch';
import { GOLD, INK, INK_DIM, JADE, fitText, hexToNumber, textStyle, wrapText } from '../ui/theme';
import { fadeIn, fadeToScene } from '../ui/transition';

/** 三類的紙色與印色。 */
export const CATEGORY_COLORS: Readonly<Record<BlessingDef['category'], { paper: number; seal: number; text: string }>> = {
  attack: { paper: 0xf3d2c4, seal: 0xc8372d, text: '#c8372d' },
  guard: { paper: 0xcfe6d6, seal: 0x2f7a58, text: '#2f7a58' },
  fortune: { paper: 0xf2e2a8, seal: 0xa8741a, text: '#a8741a' },
};

/** 星星：實心是有的，空心是還能升的。 */
export function starLine(stars: number, max = MAX_STARS): string {
  const shown = Math.max(max, stars);
  return '★'.repeat(Math.min(stars, shown)) + '☆'.repeat(Math.max(0, shown - stars));
}

export class BlessingScene extends Phaser.Scene {
  private selected: string | null = null;
  private cards: { id: string; frame: Phaser.GameObjects.Graphics; x: number; y: number; w: number; h: number }[] = [];
  private takeButton: Button | undefined;

  constructor() {
    super('Blessing');
  }

  create(): void {
    fadeIn(this);
    const save = state();
    const run = save.world.realmRun;
    const offer = run.offer;
    if (offer === null) {
      fadeToScene(this, 'Run');
      return;
    }
    this.selected = null;
    this.cards = [];
    drawBackdrop(this, realmForStage(save.world.stage));
    const cx = GAME_WIDTH / 2;

    const cleared = save.world.stage - 1;
    this.add
      .text(cx, 62, `${realmTitle(cleared)}・通過`, textStyle({ size: 18, color: INK_DIM }))
      .setStroke('#f5eddb', 6)
      .setOrigin(0.5);
    this.add
      .text(cx, 104, offer.rare ? '稀 有 機 緣' : '擇 一 機 緣', textStyle({ size: 38, color: offer.rare ? GOLD : INK }))
      .setStroke('#f5eddb', 8)
      .setOrigin(0.5);

    // 山門：帶進下一關的耐久（滿血就不畫，省一行）。
    const gateLine = run.gate === null ? '山門滿血帶進下一關' : `山門 ${run.gate} 帶進下一關（過關回復三成）`;
    this.add.text(cx, 146, gateLine, textStyle({ size: 16, color: JADE })).setStroke('#f5eddb', 6).setOrigin(0.5);

    const count = offer.ids.length;
    const gap = 10;
    const w = count >= 4 ? 120 : 160;
    const h = 330;
    const left = cx - (count * w + (count - 1) * gap) / 2;
    offer.ids.forEach((id, i) => this.buildCard(id, left + i * (w + gap), 174, w, h));

    this.takeButton = createButton(this, cx, 556, {
      width: 300,
      height: 56,
      label: '先點一張機緣',
      fontSize: 22,
      fillColor: hexToNumber(GOLD),
      onClick: () => this.take(),
    });
    this.takeButton.setEnabled(false);

    const left2 = rerollsLeft(save);
    const reroll = createButton(this, cx, 620, {
      width: 300,
      height: 48,
      label: left2 > 0 ? `重抽（本局還有 ${left2} 次）` : '本局重抽已用完',
      fontSize: 18,
      onClick: () => {
        if (!rerollOffer(state())) return;
        persist();
        audio.play('ui');
        track('blessing_reroll', { stage: save.world.stage });
        this.scene.restart();
      },
    });
    reroll.setEnabled(left2 > 0);

    this.buildOwned(cx, 676);
  }

  private buildCard(id: string, x: number, y: number, w: number, h: number): void {
    const def = blessingDef(id);
    if (def === null) return;
    const save = state();
    const owned = save.world.realmRun.blessings[id] ?? 0;
    const nextStars = def.rare ? 1 : Math.min(MAX_STARS, owned + 1);
    const colors = CATEGORY_COLORS[def.category];
    const cx = x + w / 2;

    const frame = this.add.graphics();
    const g = this.add.graphics();
    roughRect(g, x + 3, y + 4, w, h, { fill: 0x2a2622, fillAlpha: 0.16, stroke: null, seed: x + 7 });
    roughRect(g, x, y, w, h, { fill: colors.paper, stroke: 0x2a2622, width: 2.4, seed: x + y });
    roughRect(g, x + 6, y + 6, w - 12, h - 12, { stroke: colors.seal, width: 1.2, strokeAlpha: 0.6, double: false, seed: x + 3 });
    drawSeal(g, x + 22, y + 24, 26, 26, colors.seal);
    this.add.text(x + 22, y + 24, CATEGORY_LABEL[def.category], textStyle({ size: 15, color: '#fbeedd' })).setOrigin(0.5);
    const tag = def.rare ? '稀有' : owned > 0 ? '升星' : '新';
    const tagW = tag.length * 14 + 12;
    drawSeal(g, x + w - 8 - tagW / 2, y + 22, tagW, 22, 0xc8372d);
    this.add.text(x + w - 8 - tagW / 2, y + 22, tag, textStyle({ size: 13, color: '#fbeedd' })).setOrigin(0.5);

    // 圖：符紋放在一張小黃符上。
    const icon = Math.min(68, w - 40);
    roughRect(g, cx - icon / 2, y + 46, icon, icon + 10, { fill: 0xf6e3a2, stroke: 0x2a2622, width: 2, seed: x + 11 });
    if (def.glyph2 !== null) {
      this.add.image(cx - 10, y + 46 + (icon + 10) / 2 - 8, glyphTexture(def.glyph)).setDisplaySize(icon * 0.55, icon * 0.69);
      this.add.image(cx + 12, y + 46 + (icon + 10) / 2 + 10, glyphTexture(def.glyph2)).setDisplaySize(icon * 0.55, icon * 0.69);
    } else {
      this.add.image(cx, y + 46 + (icon + 10) / 2, glyphTexture(def.glyph)).setDisplaySize(icon * 0.7, icon * 0.875);
    }

    const name = this.add.text(cx, y + 150, def.name, textStyle({ size: 21, color: INK })).setOrigin(0.5);
    fitText(name, w - 16);
    if (!def.rare) {
      this.add.text(cx, y + 178, starLine(nextStars), textStyle({ size: 18, color: '#c98a12' })).setOrigin(0.5);
    }
    this.add
      .text(cx, y + 200, wrapText(blessingText(def, nextStars), w - 22, 14), textStyle({ size: 14, color: '#4a4036' }))
      .setOrigin(0.5, 0)
      .setAlign('center')
      .setLineSpacing(4);
    if (owned > 0 && !def.rare) {
      this.add.text(cx, y + h - 18, `已有・${owned} 星 → ${nextStars} 星`, textStyle({ size: 12, color: INK_DIM })).setOrigin(0.5);
    } else if (def.requires.length > 0) {
      this.add.text(cx, y + h - 18, '綁定本局帶的符', textStyle({ size: 12, color: INK_DIM })).setOrigin(0.5);
    }

    const hit = this.add.rectangle(cx, y + h / 2, w, h, 0xffffff, 0).setInteractive({ useHandCursor: true });
    hit.on('pointerup', () => this.select(id));
    this.cards.push({ id, frame, x, y, w, h });
  }

  private select(id: string): void {
    audio.play('ui');
    this.selected = id;
    for (const card of this.cards) {
      card.frame.clear();
      if (card.id !== id) continue;
      roughRect(card.frame, card.x - 7, card.y - 7, card.w + 14, card.h + 14, {
        stroke: 0xe3b54a,
        width: 5,
        seed: card.x + 99,
      });
    }
    const def = blessingDef(id);
    this.takeButton?.setLabel(def === null ? '取此機緣' : `取「${def.name}」`);
    this.takeButton?.setEnabled(true);
  }

  private take(): void {
    const id = this.selected;
    if (id === null) return;
    const save = state();
    const offer = save.world.realmRun.offer;
    if (!pickBlessing(save, id)) return;
    persist();
    audio.play('gold');
    const card = this.cards.find((item) => item.id === id);
    if (card !== undefined) burstPixels(this, card.x + card.w / 2, card.y + card.h / 2, GOLD, 12);
    track('blessing_pick', {
      stage: save.world.stage,
      id,
      stars: save.world.realmRun.blessings[id] ?? 1,
      rare: offer?.rare ?? false,
      offered: (offer?.ids ?? []).join(','),
    });
    this.time.delayedCall(260, () => fadeToScene(this, 'Run'));
  }

  /** 本局已有的機緣。 */
  private buildOwned(cx: number, top: number): void {
    const save = state();
    const owned = Object.entries(save.world.realmRun.blessings);
    const h = 940 - top;
    pixelPanel(this, cx, top + h / 2, GAME_WIDTH - 44, h);
    this.add
      .text(cx, top + 26, `本局機緣（第 ${layerInRun(save.world.stage)} / ${RUN_LENGTH} 關）`, textStyle({ size: 18, color: INK }))
      .setOrigin(0.5);
    if (owned.length === 0) {
      this.add
        .text(cx, top + h / 2 + 10, '還沒有機緣。破境或山門被破時清空。', textStyle({ size: 15, color: INK_DIM }))
        .setOrigin(0.5);
      return;
    }
    const perRow = 4;
    const cellW = (GAME_WIDTH - 80) / perRow;
    owned.forEach(([id], i) => {
      const def = blessingDef(id);
      if (def === null) return;
      const col = i % perRow;
      const row = Math.floor(i / perRow);
      const x = 40 + cellW * col + cellW / 2;
      const y = top + 74 + row * 92;
      if (y > top + h - 30) return;
      const g = this.add.graphics();
      roughRect(g, x - cellW / 2 + 6, y - 30, cellW - 12, 84, {
        fill: CATEGORY_COLORS[def.category].paper,
        stroke: 0x2a2622,
        width: 1.8,
        seed: x + y,
      });
      this.add.image(x, y - 2, glyphTexture(def.glyph)).setDisplaySize(32, 40);
      const label = this.add.text(x, y + 30, def.name, textStyle({ size: 14, color: INK })).setOrigin(0.5);
      fitText(label, cellW - 16);
      if (!def.rare) {
        this.add.text(x, y + 46, starLine(effectiveStars(save.world.realmRun.blessings, id)), textStyle({ size: 12, color: '#c98a12' })).setOrigin(0.5);
      }
    });
  }
}
