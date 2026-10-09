/**
 * 法寶符牌的畫法。手牌與場上共用同一個外觀，玩家才能一眼看出「這兩張是同一張」。
 *
 * 牌面資訊只留三樣：符種圖騰、階數、階數點。多一個字都會讓 88px 寬的牌變得看不懂。
 */
import Phaser from 'phaser';
import { glyphTexture } from '../art';
import { CARDS } from '../data';
import type { Card } from '../systems/deck';
import { EDGE, INK, LINE, hexToNumber, textStyle } from './theme';

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
    .rectangle(0, 0, CARD_WIDTH, CARD_HEIGHT, 0x000000, 0.3)
    .setStrokeStyle(3, LINE, 0.9);

  // 升階那一刻外圍閃三下光框：合成上去要感覺「變強了」。
  // 只在升階時閃，不常駐——中後期每張符都是高階，常駐的話滿場都在發光，等於沒有重點。
  const aura = scene.add
    .rectangle(0, 0, CARD_WIDTH + 9, CARD_HEIGHT + 9, 0x000000, 0)
    .setVisible(false);
  let shown: Card | null = null;

  // 像素牌框：外圈深色描邊、符種色的厚框、內側再一圈暗線，三層都是硬邊。
  const body = scene.add
    .rectangle(0, 0, CARD_WIDTH, CARD_HEIGHT, 0xffffff, 1)
    .setStrokeStyle(3, EDGE)
    .setVisible(false);
  const inner = scene.add
    .rectangle(0, 0, CARD_WIDTH - 12, CARD_HEIGHT - 12, 0x141830, 1)
    .setStrokeStyle(3, 0x0b0d1a)
    .setVisible(false);

  // 圖騰是 16×20 格，顯示成兩倍。
  const glyph = scene.add.image(0, -18, glyphTexture('sword')).setDisplaySize(32, 40).setVisible(false);
  const tierText = scene.add
    .text(0, 26, '', textStyle({ size: 30, bold: true }))
    .setOrigin(0.5)
    .setVisible(false);
  const pips = scene.add.container(0, 0);

  const container = scene.add.container(x, y, [aura, slot, body, inner, glyph, tierText, pips]);

  const refresh = (card: Card | null): void => {
    pips.removeAll(true);
    if (card === null) {
      slot.setVisible(true);
      shown = null;
      body.setVisible(false);
      inner.setVisible(false);
      glyph.setVisible(false);
      tierText.setVisible(false);
      return;
    }
    const color = cardColor(card.type);
    slot.setVisible(false);
    body.setVisible(true).setFillStyle(hexToNumber(color), 1);
    if (shown !== null && shown.type === card.type && card.tier > shown.tier) {
      scene.tweens.killTweensOf(aura);
      aura.setVisible(true).setAlpha(1).setStrokeStyle(4, hexToNumber(color), 1);
      scene.tweens.add({
        targets: aura,
        alpha: 0,
        duration: 180,
        yoyo: true,
        repeat: 2,
        ease: 'Stepped',
        easeParams: [2],
        onComplete: () => aura.setVisible(false),
      });
    }
    shown = { ...card };
    inner.setVisible(true);
    glyph.setVisible(true).setTexture(glyphTexture(card.type));
    tierText.setVisible(true).setText(`${card.tier}`).setColor(color);

    // 一到六階在牌緣點上對應數量的階點，六階以上只看數字——點超過六顆就數不清了。
    if (card.tier <= 6) {
      for (let i = 0; i < card.tier; i += 1) {
        const dot = scene.add.rectangle(
          -CARD_WIDTH / 2 + 13 + i * 11,
          CARD_HEIGHT / 2 - 13,
          6,
          6,
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
