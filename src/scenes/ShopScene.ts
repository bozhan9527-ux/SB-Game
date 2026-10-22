/**
 * 藏寶閣：用靈石買時裝、換穿，以及（在 128 平台裡）買靈石包與月卡。
 *
 * 時裝只換外觀，不影響任何數值與排行榜——頁首直接寫出來，買之前就知道。
 * 預覽用的是玩家自己的門派與目前的階級：看到的就是穿上之後戰場上的樣子。
 */
import Phaser from 'phaser';
import { audio } from '../audio';
import { composeDisciples, costumePreview, discipleTierForRealm } from '../art';
import { GAME_WIDTH } from '../config';
import { SHOP } from '../data';
import type { SectArt } from '../data/types';
import { platform } from '../platform';
import { cloudEnabled, logPurchase } from '../net/client';
import { persist, state } from '../state';
import { dayOf } from '../systems/daily';
import { sectById } from '../systems/loadout';
import { realmForStage, realmIndexForStage } from '../systems/realms';
import { buyCostume, cardDaysLeft, costumeById, creditPurchase, equipCostume, ownsCostume } from '../systems/stones';
import { track } from '../telemetry';
import { drawBackdrop } from '../ui/backdrop';
import { createButton } from '../ui/button';
import { burstPixels, floatLabel } from '../ui/effects';
import { pixelPanel } from '../ui/panel';
import { roughRect } from '../ui/sketch';
import { DANGER, GOLD, INK, INK_DIM, JADE, LACQUER, fitText, hexToNumber, textStyle, wrapText } from '../ui/theme';
import { fadeIn, fadeToScene } from '../ui/transition';

const CARD_W = 160;
const CARD_H = 196;

export class ShopScene extends Phaser.Scene {
  private selected: string | null = null;
  private busy = false;

  constructor() {
    super('Shop');
  }

  init(data?: { selected?: string | null }): void {
    this.selected = data?.selected ?? this.selected ?? null;
    this.busy = false;
  }

  create(): void {
    fadeIn(this);
    const save = state();
    drawBackdrop(this, realmForStage(save.world.stage));
    const cx = GAME_WIDTH / 2;
    const stones = save.player.stones;
    const art: SectArt = sectById(save.player.sectId)?.art ?? 'sword';
    const tier = discipleTierForRealm(realmIndexForStage(save.world.stage));
    this.selected ??= stones.equipped ?? SHOP.costumes[0]?.id ?? null;

    this.add.text(cx, 40, '藏寶閣', textStyle({ size: 36, color: INK })).setStroke('#fdfbf6', 8).setOrigin(0.5);
    this.add
      .text(cx, 76, '時裝只換樣子，不影響任何數值與排行榜', textStyle({ size: 15, color: INK_DIM }))
      .setStroke('#fdfbf6', 5)
      .setOrigin(0.5);
    const day = dayOf(Date.now());
    const card = cardDaysLeft(save, day);
    this.add
      .text(cx, 108, `靈石 ${stones.balance.toLocaleString('en-US')}${card > 0 ? `　月卡還有 ${card} 天` : ''}`, textStyle({ size: 22, color: GOLD }))
      .setStroke('#fdfbf6', 7)
      .setOrigin(0.5);

    // 時裝：三欄兩列
    SHOP.costumes.forEach((costume, i) => {
      const x = cx + ((i % 3) - 1) * (CARD_W + 10);
      const y = 140 + Math.floor(i / 3) * (CARD_H + 10) + CARD_H / 2;
      this.buildCard(costume.id, x, y, art, tier);
    });

    this.buildDetail(cx, 616, art);
    this.buildPacks(cx, 760);

    createButton(this, cx, 902, {
      width: 200,
      height: 52,
      label: '回主畫面',
      fontSize: 20,
      onClick: () => fadeToScene(this, 'Title'),
    });
  }

  private buildCard(id: string, x: number, y: number, art: SectArt, tier: number): void {
    const save = state();
    const costume = costumeById(id)!;
    const chosen = this.selected === id;
    const worn = save.player.stones.equipped === id;
    const g = this.add.graphics();
    roughRect(g, x - CARD_W / 2, y - CARD_H / 2, CARD_W, CARD_H, {
      fill: 0xfdfbf6,
      stroke: chosen ? hexToNumber(GOLD) : 0x7a4e2e,
      width: chosen ? 3.4 : 2,
      seed: id.length * 17 + (chosen ? 1 : 0),
    });
    this.add.image(x, y - 22, costumePreview(this, id, art, tier)).setDisplaySize(96, 134);
    this.add.text(x, y + 60, costume.name, textStyle({ size: 18, color: INK })).setOrigin(0.5);
    const status = worn ? '穿著中' : ownsCostume(save, id) ? '已擁有' : `${costume.price.toLocaleString('en-US')} 靈石`;
    this.add.text(x, y + 84, status, textStyle({ size: 15, color: worn ? JADE : ownsCostume(save, id) ? INK_DIM : GOLD })).setOrigin(0.5);
    const hit = this.add.rectangle(x, y, CARD_W, CARD_H, 0x000000, 0).setInteractive({ useHandCursor: true });
    hit.on('pointerup', () => {
      audio.play('ui');
      this.scene.restart({ selected: id });
    });
  }

  /** 選中那一套的說明與動作：買、穿、脫。 */
  private buildDetail(cx: number, y: number, art: SectArt): void {
    const save = state();
    const id = this.selected;
    const costume = id === null ? undefined : costumeById(id);
    pixelPanel(this, cx, y, GAME_WIDTH - 40, 104);
    if (costume === undefined || id === null) return;
    const name = this.add.text(48, y - 38, costume.name, textStyle({ size: 20, color: INK })).setOrigin(0, 0);
    fitText(name, 220);
    const desc = this.add.text(48, y - 10, wrapText(costume.desc, 300, 15), textStyle({ size: 15, color: INK_DIM })).setOrigin(0, 0);
    desc.setLineSpacing(2);

    const owned = ownsCostume(save, id);
    const worn = save.player.stones.equipped === id;
    const label = worn ? '脫下' : owned ? '穿上' : `購買 ${costume.price.toLocaleString('en-US')}`;
    createButton(this, GAME_WIDTH - 110, y, {
      width: 150,
      height: 56,
      label,
      fontSize: 18,
      ...(owned ? {} : { fillColor: hexToNumber(GOLD) }),
      onClick: () => {
        if (worn) equipCostume(save, null);
        else if (owned) equipCostume(save, id);
        else {
          const result = buyCostume(save, id);
          if (result === 'short') {
            floatLabel(this, GAME_WIDTH - 110, y - 46, '靈石不足', DANGER, 20);
            return;
          }
          if (result !== 'ok') return;
          track('costume_buy', { id, price: costume.price });
          audio.play('gold');
          burstPixels(this, GAME_WIDTH - 110, y, GOLD, 12);
        }
        persist();
        // 換裝：場上與主畫面的門人貼圖重疊一次
        composeDisciples(this, save.player.stones.equipped);
        this.time.delayedCall(owned ? 0 : 400, () => this.scene.restart({ selected: id }));
      },
    });
    void art;
  }

  /** 儲值：在 128 平台裡才能買；不在平台裡照樣列出來，但按鈕停用並說明。 */
  private buildPacks(cx: number, y: number): void {
    const save = state();
    const can = platform.available();
    this.add.text(cx, y - 52, '儲值靈石', textStyle({ size: 18, color: INK })).setStroke('#fdfbf6', 6).setOrigin(0.5);
    const items = [
      ...SHOP.packs.map((p) => ({ id: p.id, label: `${p.stones.toLocaleString('en-US')} 靈石\nNT$${p.price}` })),
      { id: SHOP.monthCard.id, label: `月卡 NT$${SHOP.monthCard.price}\n${SHOP.monthCard.stones}＋每日 ${SHOP.monthCard.daily}` },
    ];
    const note = this.add
      .text(cx, y + 50, can ? `月卡：${SHOP.monthCard.days} 天內每天打完每日挑戰再領 ${SHOP.monthCard.daily} 靈石` : '在 128 平台開啟遊戲才能儲值', textStyle({ size: 14, color: INK_DIM }))
      .setStroke('#fdfbf6', 5)
      .setOrigin(0.5);
    items.forEach((item, i) => {
      const button = createButton(this, cx + (i - 1) * 168, y, {
        width: 156,
        height: 62,
        label: item.label,
        fontSize: 15,
        strokeColor: LACQUER,
        onClick: () => {
          if (this.busy) return;
          this.busy = true;
          note.setText('等待平台付款…');
          void platform.purchase(item.id).then((result) => {
            this.busy = false;
            if (!result.ok) {
              note.setText(result.reason === 'cancelled' || result.reason === 'cancel' ? '已取消' : '付款沒有完成，靈石沒有扣也沒有入帳');
              return;
            }
            const now = Date.now();
            const got = creditPurchase(save, item.id, dayOf(now), now);
            persist();
            track('stones_purchase', { item: item.id, stones: got });
            // 伺服器留一份對帳用的紀錄；送不出去不影響入帳（存檔的流水裡也有）。
            const cloud = save.player.cloud;
            if (cloud !== null && cloudEnabled()) void logPurchase({ playerId: cloud.playerId, secret: cloud.secret, item: item.id, stones: got, at: now }).catch(() => undefined);
            audio.play('gold');
            burstPixels(this, cx, y - 40, GOLD, 16);
            this.time.delayedCall(500, () => this.scene.restart({ selected: this.selected }));
          });
        },
      });
      button.setEnabled(can);
    });
  }
}
