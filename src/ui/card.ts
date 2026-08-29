/**
 * 法寶符牌的畫法。手牌與場上共用同一個外觀，玩家才能一眼看出「這兩張是同一張」。
 *
 * 牌面資訊只留三樣：符種圖騰、階數、階數點。多一個字都會讓 88px 寬的牌變得看不懂。
 */
import Phaser from 'phaser';
import { glyphTexture } from '../art';
import { CARDS } from '../data';
import type { Card } from '../systems/deck';
import { INK, LINE, hexToNumber, textStyle } from './theme';

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
  const slot = scene.add
    .rectangle(0, 0, CARD_WIDTH, CARD_HEIGHT, 0x000000, 0.25)
    .setStrokeStyle(2, LINE, 0.9);
  const body = scene.add.rectangle(0, 0, CARD_WIDTH, CARD_HEIGHT, 0xffffff, 1).setVisible(false);
  const inner = scene.add
    .rectangle(0, 0, CARD_WIDTH - 10, CARD_HEIGHT - 10, 0x11161c, 0.92)
    .setVisible(false);
  const glyph = scene.add.image(0, -22, glyphTexture('sword')).setDisplaySize(34, 42).setVisible(false);
  const tierText = scene.add
    .text(0, 26, '', textStyle({ size: 30, bold: true }))
    .setOrigin(0.5)
    .setVisible(false);
  const pips = scene.add.container(0, 0);

  const container = scene.add.container(x, y, [slot, body, inner, glyph, tierText, pips]);

  const refresh = (card: Card | null): void => {
    pips.removeAll(true);
    if (card === null) {
      slot.setVisible(true);
      body.setVisible(false);
      inner.setVisible(false);
      glyph.setVisible(false);
      tierText.setVisible(false);
      return;
    }
    const color = cardColor(card.type);
    slot.setVisible(false);
    body.setVisible(true).setFillStyle(hexToNumber(color), 1);
    inner.setVisible(true);
    glyph.setVisible(true).setTexture(glyphTexture(card.type));
    tierText.setVisible(true).setText(`${card.tier}`).setColor(color);

    // 一到六階在牌緣點上對應數量的階點，六階以上只看數字——點超過六顆就數不清了。
    if (card.tier <= 6) {
      for (let i = 0; i < card.tier; i += 1) {
        const dot = scene.add.circle(
          -CARD_WIDTH / 2 + 12 + i * 12,
          CARD_HEIGHT / 2 - 12,
          3.6,
          hexToNumber(color),
          1,
        );
        pips.add(dot);
      }
    }
  };

  refresh(null);
  return { container, refresh };
}
