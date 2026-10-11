/**
 * 法寶符牌的畫法。手牌與場上共用同一個外觀，玩家才能一眼看出「這兩張是同一張」。
 *
 * 一張符 = 符種色的斜角框 + 黃符紙 + 圖騰 + 底下一塊深色階數牌。
 * 框的顏色就是符種（一眼分辨），階數寫在深色牌子上（符種色的字在黃紙上讀不出來）。
 * 牌面資訊只留三樣：符種圖騰、階數、階數點。多一個字都會讓 84px 寬的牌變得看不懂。
 */
import Phaser from 'phaser';
import { ART, glyphTexture } from '../art';
import { CARDS } from '../data';
import type { Card } from '../systems/deck';
import { EDGE, INK, LINE, hexToNumber, shade, textStyle } from './theme';

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
  // 空位：刻了八卦紋的石板。貼圖沒載到時退回虛框。
  const slot: Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle = scene.textures.exists(ART.slot)
    ? scene.add.image(0, 0, ART.slot).setScale(2)
    : scene.add.rectangle(0, 0, CARD_WIDTH, CARD_HEIGHT, 0x000000, 0.3).setStrokeStyle(3, LINE, 0.9);

  // 升階那一刻外圍閃三下光框：合成上去要感覺「變強了」。
  // 只在升階時閃，不常駐——中後期每張符都是高階，常駐的話滿場都在發光，等於沒有重點。
  const aura = scene.add
    .rectangle(0, 0, CARD_WIDTH + 9, CARD_HEIGHT + 9, 0x000000, 0)
    .setVisible(false);
  let shown: Card | null = null;

  // 牌框：外圈深色描邊，裡面一圈符種色、左上亮右下暗的斜角，看起來是一塊有厚度的牌。
  const frame = scene.add.graphics().setVisible(false);
  const drawFrame = (color: number): void => {
    const hw = CARD_WIDTH / 2;
    const hh = CARD_HEIGHT / 2;
    frame.clear();
    frame.fillStyle(EDGE, 1);
    frame.fillRect(-hw, -hh, CARD_WIDTH, CARD_HEIGHT);
    frame.fillStyle(color, 1);
    frame.fillRect(-hw + 3, -hh + 3, CARD_WIDTH - 6, CARD_HEIGHT - 6);
    frame.fillStyle(shade(color, 0.45), 1);
    frame.fillRect(-hw + 3, -hh + 3, CARD_WIDTH - 6, 2);
    frame.fillRect(-hw + 3, -hh + 3, 2, CARD_HEIGHT - 6);
    frame.fillStyle(shade(color, -0.45), 1);
    frame.fillRect(-hw + 3, hh - 5, CARD_WIDTH - 6, 2);
    frame.fillRect(hw - 5, -hh + 3, 2, CARD_HEIGHT - 6);
    // 符紙外的一圈暗線，紙才像嵌在框裡
    frame.fillStyle(shade(color, -0.6), 1);
    frame.fillRect(-hw + 6, -hh + 6, CARD_WIDTH - 12, CARD_HEIGHT - 12);
  };
  const paper: Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle = scene.textures.exists(ART.cardPaper)
    ? scene.add.image(0, 0, ART.cardPaper).setScale(2).setVisible(false)
    : scene.add.rectangle(0, 0, CARD_WIDTH - 12, CARD_HEIGHT - 12, 0xecd09a, 1).setVisible(false);
  // 為了讓 refresh 的開關寫法不變，body／inner 沿用舊名字。
  const body = frame;
  const inner = paper;

  // 圖騰是 16×20 格，顯示成兩倍。
  const glyph = scene.add.image(0, -5, glyphTexture('sword')).setDisplaySize(32, 40).setVisible(false);
  // 階數牌：深色漆底，字用符種色。
  const plaque = scene.add
    .rectangle(0, 31, 46, 26, 0x1f1218, 1)
    .setStrokeStyle(2, EDGE)
    .setVisible(false);
  const tierText = scene.add
    .text(0, 31, '', textStyle({ size: 24, bold: true }))
    .setOrigin(0.5)
    .setShadow(2, 2, '#000000', 0)
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
        ease: 'Stepped',
        easeParams: [2],
        onComplete: () => aura.setVisible(false),
      });
    }
    shown = { ...card };
    inner.setVisible(true);
    glyph.setVisible(true).setTexture(glyphTexture(card.type));
    plaque.setVisible(true).setStrokeStyle(2, shade(hexToNumber(color), -0.2));
    tierText.setVisible(true).setText(`${card.tier}`).setColor(color);

    // 一到六階在牌緣點上對應數量的階點，六階以上只看數字——點超過六顆就數不清了。
    if (card.tier <= 6) {
      // 階點排在符紙上緣、硃砂印下面一列，置中。
      const step = 10;
      const startX = -((card.tier - 1) * step) / 2;
      for (let i = 0; i < card.tier; i += 1) {
        const dot = scene.add
          .rectangle(startX + i * step, -CARD_HEIGHT / 2 + 19, 6, 6, hexToNumber(color), 1)
          .setStrokeStyle(2, EDGE);
        pips.add(dot);
      }
    }
  };

  refresh(null);
  return { container, refresh };
}
