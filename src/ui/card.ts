/**
 * 法寶符牌的畫法。手牌與場上共用同一個外觀，玩家才能一眼看出「這兩張是同一張」。
 *
 * 一張符 = 符種色的彩鉛框 + 黃符紙 + 手繪符紋 + 底下一枚朱印寫階數。
 * 框的顏色就是符種（一眼分辨），階數寫在朱印上（阿拉伯數字，到幾十階也放得下）。
 * 牌面資訊只留三樣：符種圖騰、階數、階數點。多一個字都會讓 84px 寬的牌變得看不懂。
 */
import Phaser from 'phaser';
import { ART, glyphTexture } from '../art';
import { CARDS } from '../data';
import type { Card } from '../systems/deck';
import { EDGE, INK, LACQUER, LINE, hexToNumber, shade, textStyle } from './theme';
import { drawSeal, hatchRect, roughRect } from './sketch';

export const CARD_WIDTH = 84;
export const CARD_HEIGHT = 100;

export interface CardView {
  container: Phaser.GameObjects.Container;
  refresh(card: Card | null): void;
}

function cardColor(type: string): string {
  return CARDS.find((def) => def.id === type)?.color ?? INK;
}

/**
 * 一個牌位。空著時只畫虛位，有牌時畫牌。
 *
 * 之所以做成「就地換內容」而不是每次重建物件：拖曳中每一幀都可能更新，
 * 重建 Container 會讓正在跑的 tween 與 hit area 一起失效。
 */
export function createCardView(scene: Phaser.Scene, x: number, y: number): CardView {
  // 空位：鉛筆畫的方框加一道淡朱捲紋。貼圖沒載到時退回虛框。
  const slot: Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle = scene.textures.exists(ART.slot)
    // 線條本來就淡，首領走到陣位區時也看得到牠。
    ? scene.add.image(0, 0, ART.slot).setDisplaySize(CARD_WIDTH, CARD_HEIGHT).setAlpha(0.85)
    : scene.add.rectangle(0, 0, CARD_WIDTH, CARD_HEIGHT, 0x000000, 0.3).setStrokeStyle(3, LINE, 0.9);

  // 升階那一刻外圍閃三下光框：合成上去要感覺「變強了」。
  // 只在升階時閃，不常駐——中後期每張符都是高階，常駐的話滿場都在發光，等於沒有重點。
  const aura = scene.add
    .rectangle(0, 0, CARD_WIDTH + 9, CARD_HEIGHT + 9, 0x000000, 0)
    .setVisible(false);
  let shown: Card | null = null;

  // 牌框：符種色的彩鉛塗框 + 墨線，一眼看出是哪一種符。
  const frame = scene.add.graphics().setVisible(false);
  const drawFrame = (color: number): void => {
    const hw = CARD_WIDTH / 2;
    const hh = CARD_HEIGHT / 2;
    frame.clear();
    roughRect(frame, -hw + 3, -hh + 4, CARD_WIDTH, CARD_HEIGHT, { fill: EDGE, fillAlpha: 0.2, stroke: null, seed: 5 });
    roughRect(frame, -hw, -hh, CARD_WIDTH, CARD_HEIGHT, { fill: color, stroke: null, seed: 3 });
    hatchRect(frame, -hw, -hh, CARD_WIDTH, CARD_HEIGHT, shade(color, -0.3), { gap: 3.6, alpha: 0.3, width: 1.1, seed: 2 });
    roughRect(frame, -hw, -hh, CARD_WIDTH, CARD_HEIGHT, { stroke: EDGE, width: 2.4, seed: 3 });
  };
  const paper: Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle = scene.textures.exists(ART.cardPaper)
    ? scene.add.image(0, 0, ART.cardPaper).setDisplaySize(CARD_WIDTH - 12, CARD_HEIGHT - 12).setVisible(false)
    : scene.add.rectangle(0, 0, CARD_WIDTH - 12, CARD_HEIGHT - 12, 0xecd09a, 1).setVisible(false);
  // 為了讓 refresh 的開關寫法不變，body／inner 沿用舊名字。
  const body = frame;
  const inner = paper;

  // 符紋（40×50 點）。
  const glyph = scene.add.image(0, -6, glyphTexture('sword')).setDisplaySize(40, 50).setVisible(false);
  // 階數朱印：寬度跟著位數走，兩位數也放得下。
  const plaque = scene.add.graphics().setVisible(false);
  const tierText = scene.add
    .text(0, 31, '', textStyle({ size: 20, color: '#fbeedd' }))
    .setOrigin(0.5)
    .setVisible(false);
  const pips = scene.add.container(0, 0);

  const container = scene.add.container(x, y, [aura, slot, body, inner, glyph, plaque, tierText, pips]);

  const refresh = (card: Card | null): void => {
    pips.removeAll(true);
    if (card === null) {
      slot.setVisible(true);
      shown = null;
      body.setVisible(false);
      inner.setVisible(false);
      glyph.setVisible(false);
      plaque.setVisible(false);
      tierText.setVisible(false);
      return;
    }
    const color = cardColor(card.type);
    slot.setVisible(false);
    body.setVisible(true);
    drawFrame(hexToNumber(color));
    if (shown !== null && shown.type === card.type && card.tier > shown.tier) {
      scene.tweens.killTweensOf(aura);
      aura.setVisible(true).setAlpha(1).setStrokeStyle(4, hexToNumber(color), 1);
      scene.tweens.add({
        targets: aura,
        alpha: 0,
        duration: 180,
        yoyo: true,
        repeat: 2,
        onComplete: () => aura.setVisible(false),
      });
    }
    shown = { ...card };
    inner.setVisible(true);
    glyph.setVisible(true).setTexture(glyphTexture(card.type));
    const digits = String(card.tier).length;
    plaque.clear();
    drawSeal(plaque, 0, 31, 20 + digits * 10, 24, LACQUER);
    plaque.setVisible(true);
    tierText.setVisible(true).setText(`${card.tier}`);

    // 一到六階在牌緣點上對應數量的階點，六階以上只看數字——點超過六顆就數不清了。
    if (card.tier <= 6) {
      // 階點排在上緣的彩鉛框上，置中。
      const step = 10;
      const startX = -((card.tier - 1) * step) / 2;
      for (let i = 0; i < card.tier; i += 1) {
        const dot = scene.add
          .circle(startX + i * step, -CARD_HEIGHT / 2 + 3, 3, LACQUER, 1)
          .setStrokeStyle(1.4, EDGE);
        pips.add(dot);
      }
    }
  };

  refresh(null);
  return { container, refresh };
}
