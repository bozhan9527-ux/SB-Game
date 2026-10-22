/**
 * 飛升：打完第 81 關渡劫首領之後的結算。
 *
 * 強制飛升（v23）把輪迴從「要不要」變成遊戲本身的章節：這一頁要讓它像一場慶祝，
 * 而不是一個「你的進度要被砍了」的確認框。所以順序是：先演、再列這一世的成果、
 * 最後才寫清楚會拿到什麼、留下什麼。按下去之後到飛升台選下一世的天劫。
 */
import Phaser from 'phaser';
import { audio } from '../audio';
import { ART } from '../art';
import { GAME_WIDTH } from '../config';
import { REALMS } from '../data';
import { persist, state } from '../state';
import {
  ascend,
  ascensionGain,
  canAscend,
  heavenName,
  heavenOf,
  jieCount,
  karmaMultiplier,
} from '../systems/karma';
import { track } from '../telemetry';
import { drawBackdrop } from '../ui/backdrop';
import { createButton } from '../ui/button';
import { burstPixels } from '../ui/effects';
import { pixelPanel } from '../ui/panel';
import { GOLD, INK, INK_DIM, JADE, hexToNumber, textStyle, wrapText } from '../ui/theme';
import { fadeIn, fadeToScene } from '../ui/transition';

export class AscendScene extends Phaser.Scene {
  constructor() {
    super('Ascend');
  }

  create(): void {
    fadeIn(this);
    const save = state();
    if (!canAscend(save)) {
      fadeToScene(this, 'Title');
      return;
    }
    const last = REALMS[REALMS.length - 1];
    if (last !== undefined) drawBackdrop(this, last);
    audio.play('breakthrough');
    const cx = GAME_WIDTH / 2;

    // 主角御劍升天：從下面飄上來，後面一圈金光。
    const glow = this.add.circle(cx, 250, 120, hexToNumber('#f6e7b8'), 0.55);
    this.tweens.add({ targets: glow, scale: 1.12, alpha: 0.35, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    const rays = this.add.graphics();
    rays.lineStyle(4, hexToNumber('#e3b54a'), 0.8);
    for (let i = 0; i < 9; i += 1) {
      const a = -Math.PI / 2 + (i - 4) * 0.28;
      rays.lineBetween(cx + Math.cos(a) * 140, 250 + Math.sin(a) * 140, cx + Math.cos(a) * 186, 250 + Math.sin(a) * 186);
    }
    const hero = this.add.container(cx, 420);
    if (this.textures.exists(ART.titleSword)) hero.add(this.add.image(0, 40, ART.titleSword).setDisplaySize(220, 60));
    if (this.textures.exists(ART.titleHero)) hero.add(this.add.image(-4, -40, ART.titleHero).setDisplaySize(200, 150));
    this.tweens.add({ targets: hero, y: 270, duration: 1600, ease: 'Sine.out' });
    this.tweens.add({ targets: hero, y: '+=8', duration: 1500, yoyo: true, repeat: -1, ease: 'Sine.inOut', delay: 1600 });

    const karma = save.player.karma;
    const jie = jieCount(save.world.tribulations);
    const heaven = heavenOf(jie);
    const gained = ascensionGain(save);
    const dao = heaven >= 9 && !karma.dao;

    this.add.text(cx, 470, '飛　升', textStyle({ size: 64, color: '#b8861c' })).setStroke('#fdfbf6', 10).setOrigin(0.5);
    this.add
      .text(cx, 516, `第 ${karma.rebirths + 1} 世・渡劫圓滿・證得${heavenName(heaven)}`, textStyle({ size: 19, color: INK }))
      .setStroke('#fdfbf6', 6)
      .setOrigin(0.5);

    const top = 546;
    const h = 236;
    pixelPanel(this, cx, top + h / 2, GAME_WIDTH - 72, h, { accent: hexToNumber(GOLD) });
    const rows: [string, string][] = [
      ['抵達', `第 ${save.world.highestStage - 1} 關`],
      ['背負天劫', jie === 0 ? '劫數 0（凡世）' : `劫數 ${jie}（${heavenName(heaven)}）`],
      ['仙緣倍率', `×${karmaMultiplier(jie).toFixed(2)}`],
      ['飛升次數', `${karma.rebirths} → ${karma.rebirths + 1}`],
    ];
    rows.forEach(([a, b], i) => {
      this.add.text(72, top + 36 + i * 36, a, textStyle({ size: 18, color: INK_DIM })).setOrigin(0, 0.5);
      this.add.text(GAME_WIDTH - 72, top + 36 + i * 36, b, textStyle({ size: 18, color: INK })).setOrigin(1, 0.5);
    });
    this.add.text(72, top + h - 34, '獲得仙緣', textStyle({ size: 20, color: INK })).setOrigin(0, 0.5);
    this.add.text(GAME_WIDTH - 72, top + h - 34, `+${gained}`, textStyle({ size: 32, color: GOLD })).setOrigin(1, 0.5);

    const note = dao
      ? '九重天渡劫——證道！第 82 關以後的飛升境從此開放。'
      : '歸零：關卡、金幣、洞府。留下：門派修為、副本與符籙、成就、仙緣與解鎖。';
    this.add
      .text(cx, 820, wrapText(note, GAME_WIDTH - 70, 16), textStyle({ size: 16, color: dao ? JADE : INK_DIM }))
      .setOrigin(0.5)
      .setAlign('center')
      .setLineSpacing(4);

    createButton(this, cx, 896, {
      width: 320,
      height: 62,
      label: '飛升 · 前往飛升台',
      fontSize: 24,
      fillColor: hexToNumber(GOLD),
      onClick: () => {
        const lives = save.player.karma.rebirths + 1;
        const got = ascend(save);
        persist();
        track('ascend', { lives, jie, heaven, gained: got });
        burstPixels(this, cx, 270, GOLD, 16);
        this.time.delayedCall(300, () => fadeToScene(this, 'Altar'));
      },
    });
  }
}
