/**
 * 仙緣：用飛升換來的點數解鎖新東西（v23 起取代舊的「輪迴」頁）。
 *
 * 舊制的仙緣加的是四條乘區，實測輪迴一次就把 1–81 關輾平（見 ROGUELITE_DESIGN.md）。
 * 新制拿來**解鎖**：機緣卡（之後在三選一裡才抽得到）、天劫的第二三重（飛升台上才選得到），
 * 只留一條很小的傷害線。解鎖的是「選項」，不是力量——下一世才有新的打法可以試。
 *
 * 三個分頁：機緣、天劫、道基。清單長，所以分頁加翻頁，不做拖曳捲動
 * （拖曳捲動在手機上和點擊打架，玩家會誤觸解鎖）。
 */
import Phaser from 'phaser';
import { audio } from '../audio';
import { glyphTexture } from '../art';
import { GAME_WIDTH } from '../config';
import { BLESSINGS, KARMA, TRIBULATIONS } from '../data';
import { persist, state } from '../state';
import { blessingText, CATEGORY_LABEL } from '../systems/blessings';
import {
  buyKarma,
  canAscend,
  heavenName,
  isUnlocked,
  karmaCost,
  karmaLevel,
  tribKey,
  unlock,
  unlockCost,
} from '../systems/karma';
import { realmForStage } from '../systems/realms';
import { drawBackdrop } from '../ui/backdrop';
import { createButton } from '../ui/button';
import { burstPixels } from '../ui/effects';
import { roughRect } from '../ui/sketch';
import { DANGER, GOLD, INK, INK_DIM, JADE, fitText, hexToNumber, textStyle } from '../ui/theme';
import { fadeIn, fadeToScene } from '../ui/transition';
import { CATEGORY_COLORS } from './BlessingScene';
import { altarOpen, tribulationGlyph } from './AltarScene';

type Tab = 'blessing' | 'tribulation' | 'power';

interface Entry {
  key: string;
  name: string;
  desc: string;
  glyph: string;
  cost: number | null;
  done: boolean;
  /** 還不能買的原因（例如第三重要先開第二重）。 */
  blocked: string | null;
  paper: number;
  tag: string;
}

const PER_PAGE = 8;

export class RebirthScene extends Phaser.Scene {
  private tab: Tab = 'blessing';
  private page = 0;

  constructor() {
    super('Rebirth');
  }

  init(data?: { tab?: Tab; page?: number }): void {
    this.tab = data?.tab ?? this.tab;
    this.page = data?.page ?? 0;
  }

  create(): void {
    fadeIn(this);
    const save = state();
    drawBackdrop(this, realmForStage(save.world.stage));
    const cx = GAME_WIDTH / 2;
    const karma = save.player.karma;

    this.add.text(cx, 44, '仙　緣', textStyle({ size: 38, color: INK })).setStroke('#fdfbf6', 8).setOrigin(0.5);
    this.add
      .text(cx, 82, `第 ${karma.rebirths + 1} 世・最高證得${heavenName(karma.bestHeaven)}${karma.dao ? '・已證道' : ''}`, textStyle({ size: 16, color: JADE }))
      .setStroke('#fdfbf6', 6)
      .setOrigin(0.5);
    const points = this.add
      .text(cx, 110, `仙緣 ${karma.points} 點`, textStyle({ size: 22, color: GOLD }))
      .setStroke('#fdfbf6', 7)
      .setOrigin(0.5);

    const tabs: [Tab, string][] = [['blessing', '機緣'], ['tribulation', '天劫'], ['power', '道基']];
    tabs.forEach(([id, label], i) => {
      createButton(this, cx + (i - 1) * 150, 152, {
        width: 136,
        height: 42,
        label,
        fontSize: 18,
        ...(id === this.tab ? { fillColor: hexToNumber(GOLD) } : {}),
        onClick: () => this.scene.restart({ tab: id, page: 0 }),
      });
    });

    const entries = this.entries();
    const pages = Math.max(1, Math.ceil(entries.length / PER_PAGE));
    const page = Math.min(this.page, pages - 1);
    entries.slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE).forEach((entry, i) => {
      this.buildRow(entry, 186 + i * 74, () => {
        points.setColor(DANGER);
        this.time.delayedCall(260, () => points.setColor(GOLD));
      });
    });
    if (pages > 1) {
      this.add.text(cx, 790, `${page + 1} / ${pages}`, textStyle({ size: 16, color: INK_DIM })).setOrigin(0.5);
      const prev = createButton(this, cx - 120, 790, { width: 90, height: 40, label: '上一頁', fontSize: 16, onClick: () => this.scene.restart({ tab: this.tab, page: page - 1 }) });
      prev.setEnabled(page > 0);
      const next = createButton(this, cx + 120, 790, { width: 90, height: 40, label: '下一頁', fontSize: 16, onClick: () => this.scene.restart({ tab: this.tab, page: page + 1 }) });
      next.setEnabled(page < pages - 1);
    }

    // 底列：飛升台（一世剛開始時）、飛升（證道之後在飛升境裡隨時可以）、回主畫面。
    const actions: { label: string; go: () => void; gold?: boolean }[] = [];
    if (canAscend(save)) actions.push({ label: '飛升', go: () => fadeToScene(this, 'Ascend'), gold: true });
    if (altarOpen() && karma.rebirths > 0) actions.push({ label: '飛升台', go: () => fadeToScene(this, 'Altar') });
    actions.push({ label: '回主畫面', go: () => fadeToScene(this, 'Title') });
    const w = actions.length === 1 ? 300 : 160;
    actions.forEach((action, i) => {
      createButton(this, cx + (i - (actions.length - 1) / 2) * (w + 14), 880, {
        width: w,
        height: 56,
        label: action.label,
        fontSize: 21,
        ...(action.gold === true ? { fillColor: hexToNumber(GOLD) } : {}),
        onClick: action.go,
      });
    });
  }

  private entries(): Entry[] {
    const save = state();
    if (this.tab === 'blessing') {
      return BLESSINGS.filter((def) => def.unlock === 'karma').map((def) => ({
        key: def.id,
        name: def.rare ? `${def.name}（稀有）` : def.name,
        desc: blessingText(def, 1),
        glyph: def.glyph,
        cost: def.cost,
        done: isUnlocked(save, def.id),
        blocked: null,
        paper: CATEGORY_COLORS[def.category].paper,
        tag: CATEGORY_LABEL[def.category],
      }));
    }
    if (this.tab === 'tribulation') {
      const out: Entry[] = [];
      for (const def of TRIBULATIONS) {
        for (const level of [2, 3]) {
          const key = tribKey(def.id, level);
          out.push({
            key,
            name: `${def.name}・第${level === 2 ? '二' : '三'}重`,
            desc: def.levels[level - 1]?.desc ?? def.desc,
            glyph: tribulationGlyph(def.id),
            cost: unlockCost(key),
            done: isUnlocked(save, key),
            blocked: level === 3 && !isUnlocked(save, tribKey(def.id, 2)) ? '先開第二重' : null,
            paper: 0xf4e6cf,
            tag: '劫',
          });
        }
      }
      return out;
    }
    return KARMA.map((track) => {
      const level = karmaLevel(save, track.id);
      const cost = karmaCost(track, level);
      return {
        key: `power:${track.id}`,
        name: `${track.name}（${level} / ${track.maxLevel}）`,
        desc: `${track.desc} 目前 +${track.perLevel * level}${track.unit}`,
        glyph: 'grand',
        cost,
        done: cost === null,
        blocked: null,
        paper: 0xf3d2c4,
        tag: '道',
      };
    });
  }

  private buildRow(entry: Entry, y: number, poor: () => void): void {
    const save = state();
    const left = 24;
    const width = GAME_WIDTH - 48;
    const g = this.add.graphics();
    roughRect(g, left, y, width, 66, { fill: entry.done ? 0xdcead8 : entry.paper, stroke: 0x2a2622, width: 1.8, seed: y + entry.key.length });
    if (this.textures.exists(glyphTexture(entry.glyph))) {
      this.add.image(left + 28, y + 33, glyphTexture(entry.glyph)).setDisplaySize(34, 42);
    }
    const name = this.add.text(left + 56, y + 18, entry.name, textStyle({ size: 18, color: INK })).setOrigin(0, 0.5);
    fitText(name, width - 56 - 140);
    const desc = this.add.text(left + 56, y + 46, entry.desc, textStyle({ size: 13, color: INK_DIM })).setOrigin(0, 0.5);
    fitText(desc, width - 56 - 140);

    const bx = left + width - 66;
    const label = entry.done ? '已解鎖' : entry.blocked ?? (entry.cost === null ? '—' : `${entry.cost} 點`);
    const button = createButton(this, bx, y + 33, {
      width: 112,
      height: 46,
      label,
      fontSize: 16,
      onClick: () => {
        const result = entry.key.startsWith('power:')
          ? buyKarma(state(), entry.key.slice('power:'.length))
          : unlock(state(), entry.key);
        if (result !== 'ok') {
          poor();
          return;
        }
        persist();
        audio.play('gold');
        burstPixels(this, bx, y + 33, JADE, 10);
        this.time.delayedCall(180, () => this.scene.restart({ tab: this.tab, page: this.page }));
      },
    });
    button.setEnabled(!entry.done && entry.blocked === null && entry.cost !== null && save.player.karma.points >= entry.cost);
  }
}
