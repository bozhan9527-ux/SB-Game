/**
 * 藏寶閣：用靈石買時裝、武器外觀、符紙紋樣，以及（在 128 平台裡）買靈石包與月卡。
 *
 * 全部只換外觀，不影響任何數值與排行榜——頁首直接寫出來，買之前就知道。
 * 時裝的預覽用玩家自己的門派與目前的階級：看到的就是穿上之後戰場上的樣子。
 * 武器外觀只換某一種武器，所以預覽用拿那種武器的門派（體修拿拳套、符修拿符……）。
 */
import Phaser from 'phaser';
import { audio } from '../audio';
import { ART, composeDisciples, cardPaperTexture, costumePreview, costumePreviewAnim, discipleTierForRealm, ensureCostumeArt, glyphTexture, setCardPaper } from '../art';
import type { Look } from '../art';
import { GAME_WIDTH } from '../config';
import { SHOP } from '../data';
import type { SectArt } from '../data/types';
import type { SaveData } from '../save/types';
import { platform } from '../platform';
import { cloudEnabled, logPurchase } from '../net/client';
import { persist, state } from '../state';
import { dayOf } from '../systems/daily';
import { sectById } from '../systems/loadout';
import { realmForStage, realmIndexForStage } from '../systems/realms';
import { buyCostume, buyPaper, buyWeaponSkin, cardDaysLeft, creditPurchase, equipCostume, equipPaper, equipWeaponSkin, lookOf, ownsCostume } from '../systems/stones';
import type { BuyResult } from '../systems/stones';
import { track } from '../telemetry';
import { drawBackdrop } from '../ui/backdrop';
import { createButton } from '../ui/button';
import { burstPixels, floatLabel } from '../ui/effects';
import { pixelPanel } from '../ui/panel';
import { roughRect } from '../ui/sketch';
import { DANGER, GOLD, INK, INK_DIM, JADE, LACQUER, fitText, hexToNumber, textStyle, wrapText } from '../ui/theme';
import { fadeIn, fadeToScene } from '../ui/transition';

type Tab = 'costume' | 'weapon' | 'paper';

const TABS: { id: Tab; label: string }[] = [
  { id: 'costume', label: '時裝' },
  { id: 'weapon', label: '武器' },
  { id: 'paper', label: '符紙' },
];

/** 武器種類 → 拿這種武器的門派（預覽用）。 */
const WIELDER: Record<string, SectArt> = { sword: 'sword', fist: 'body', fu: 'talisman', gourd: 'alchemy' };

/** 原本的黃符紙也列在符紙那一頁，才換得回去。 */
const PLAIN_PAPER = 'plain';

/** 一格商品：三種東西共用同一套格子與說明欄。 */
interface Entry {
  id: string;
  name: string;
  desc: string;
  price: number;
  owned: boolean;
  /** 穿著中／配著中／用著中。 */
  on: boolean;
  /** 已經在用、又按一次時的動作名稱；null 表示不能卸（原本的黃符紙）。 */
  offLabel: string | null;
  onLabel: string;
  buy(save: SaveData): BuyResult;
  toggle(save: SaveData): void;
  /** 在 (x, y) 畫預覽；chosen 的那一格會動。 */
  preview(scene: ShopScene, x: number, y: number, w: number, chosen: boolean): void;
}

const GRID_TOP = 176;
const ROW_H = 196;

export class ShopScene extends Phaser.Scene {
  private tab: Tab = 'costume';
  private selected: Partial<Record<Tab, string>> = {};
  private busy = false;

  constructor() {
    super('Shop');
  }

  init(data?: { tab?: Tab; selected?: string | null }): void {
    if (data?.tab !== undefined) this.tab = data.tab;
    if (typeof data?.selected === 'string') this.selected[this.tab] = data.selected;
    this.busy = false;
  }

  /** 時裝部件、武器外觀、符紙都不在開場那一批裡（見 art.ts），進藏寶閣前先確認都到了。 */
  preload(): void {
    ensureCostumeArt(this);
  }

  create(): void {
    fadeIn(this);
    const save = state();
    drawBackdrop(this, realmForStage(save.world.stage));
    const cx = GAME_WIDTH / 2;
    const stones = save.player.stones;

    this.add.text(cx, 40, '藏寶閣', textStyle({ size: 36, color: INK })).setStroke('#fdfbf6', 8).setOrigin(0.5);
    this.add
      .text(cx, 76, '只換樣子，不影響任何數值與排行榜', textStyle({ size: 15, color: INK_DIM }))
      .setStroke('#fdfbf6', 5)
      .setOrigin(0.5);
    const day = dayOf(Date.now());
    const card = cardDaysLeft(save, day);
    this.add
      .text(cx, 108, `靈石 ${stones.balance.toLocaleString('en-US')}${card > 0 ? `　月卡還有 ${card} 天` : ''}`, textStyle({ size: 22, color: GOLD }))
      .setStroke('#fdfbf6', 7)
      .setOrigin(0.5);

    TABS.forEach((tab, i) => {
      const active = tab.id === this.tab;
      createButton(this, cx + (i - 1) * 132, 146, {
        width: 120,
        height: 40,
        label: tab.label,
        fontSize: 18,
        ...(active ? { fillColor: hexToNumber(GOLD) } : {}),
        onClick: () => {
          if (active) return;
          this.scene.restart({ tab: tab.id });
        },
      });
    });

    const entries = this.entries(save);
    const chosen = this.selected[this.tab] ?? entries.find((e) => e.on)?.id ?? entries[0]?.id;
    const cols = this.tab === 'weapon' ? 4 : 3;
    const w = this.tab === 'weapon' ? 120 : 160;
    entries.forEach((entry, i) => {
      const x = cx + ((i % cols) - (cols - 1) / 2) * (w + 8);
      const y = GRID_TOP + Math.floor(i / cols) * (ROW_H + 8) + ROW_H / 2;
      this.buildCard(entry, x, y, w, entry.id === chosen);
    });

    this.buildDetail(entries.find((e) => e.id === chosen), cx, 640);
    this.buildPacks(cx, 774);

    createButton(this, cx, 906, {
      width: 200,
      height: 52,
      label: '回主畫面',
      fontSize: 20,
      onClick: () => fadeToScene(this, 'Title'),
    });
  }

  private entries(save: SaveData): Entry[] {
    const stones = save.player.stones;
    const art: SectArt = sectById(save.player.sectId)?.art ?? 'sword';
    const tier = discipleTierForRealm(realmIndexForStage(save.world.stage));
    const figure = (scene: ShopScene, look: Look, sect: SectArt, x: number, y: number, w: number, chosen: boolean): void => {
      const width = Math.min(96, w - 24);
      const sprite = scene.add.sprite(x, y - 22, costumePreview(scene, look, sect, tier)).setDisplaySize(width, width * 1.4);
      // 選中的那一件走起來；其他的靜止，一頁八隻一起走會很吵
      if (chosen) sprite.play(costumePreviewAnim(scene, look, sect, tier));
    };
    if (this.tab === 'costume') {
      return SHOP.costumes.map((c) => ({
        ...c,
        owned: ownsCostume(save, c.id),
        on: stones.equipped === c.id,
        offLabel: '脫下',
        onLabel: '穿上',
        buy: (s) => buyCostume(s, c.id),
        toggle: (s) => equipCostume(s, s.player.stones.equipped === c.id ? null : c.id),
        preview: (scene, x, y, w, chosen) => figure(scene, { ...lookOf(save), costume: c.id }, art, x, y, w, chosen),
      }));
    }
    if (this.tab === 'weapon') {
      return SHOP.weapons.map((wp) => ({
        ...wp,
        owned: stones.weapons.includes(wp.id),
        on: stones.weaponOn[wp.weapon] === wp.id,
        offLabel: '卸下',
        onLabel: '配上',
        buy: (s) => buyWeaponSkin(s, wp.id),
        toggle: (s) => void equipWeaponSkin(s, wp.id, s.player.stones.weaponOn[wp.weapon] !== wp.id),
        preview: (scene, x, y, w, chosen) => {
          const look = lookOf(save);
          figure(scene, { ...look, weapons: { ...look.weapons, [wp.weapon]: wp.id } }, WIELDER[wp.weapon] ?? art, x, y, w, chosen);
        },
      }));
    }
    const paperPreview = (key: string) => (scene: ShopScene, x: number, y: number, _w: number, chosen: boolean): void => {
      scene.add.image(x, y - 22, key).setDisplaySize(96, 117);
      const glyph = scene.add.image(x, y - 26, glyphTexture('sword')).setDisplaySize(44, 55);
      if (chosen) scene.tweens.add({ targets: glyph, y: y - 30, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    };
    return [
      {
        id: PLAIN_PAPER,
        name: '黃符紙',
        desc: '原本的符紙。',
        price: 0,
        owned: true,
        on: stones.paper === null,
        offLabel: null,
        onLabel: '換回',
        buy: () => 'owned',
        toggle: (s) => void equipPaper(s, null),
        preview: paperPreview(ART.cardPaper),
      },
      ...SHOP.papers.map((pp) => ({
        ...pp,
        owned: stones.papers.includes(pp.id),
        on: stones.paper === pp.id,
        offLabel: '換回黃符紙',
        onLabel: '換上',
        buy: (s: SaveData) => buyPaper(s, pp.id),
        toggle: (s: SaveData) => void equipPaper(s, s.player.stones.paper === pp.id ? null : pp.id),
        preview: paperPreview(cardPaperTexture(pp.id)),
      })),
    ];
  }

  private buildCard(entry: Entry, x: number, y: number, w: number, chosen: boolean): void {
    const g = this.add.graphics();
    roughRect(g, x - w / 2, y - ROW_H / 2, w, ROW_H, {
      fill: 0xfdfbf6,
      stroke: chosen ? hexToNumber(GOLD) : 0x7a4e2e,
      width: chosen ? 3.4 : 2,
      seed: entry.id.length * 17 + (chosen ? 1 : 0),
    });
    entry.preview(this, x, y, w, chosen);
    const name = this.add.text(x, y + 60, entry.name, textStyle({ size: 18, color: INK })).setOrigin(0.5);
    fitText(name, w - 12);
    const status = entry.on ? '使用中' : entry.owned ? '已擁有' : `${entry.price.toLocaleString('en-US')} 靈石`;
    this.add.text(x, y + 84, status, textStyle({ size: 15, color: entry.on ? JADE : entry.owned ? INK_DIM : GOLD })).setOrigin(0.5);
    const hit = this.add.rectangle(x, y, w, ROW_H, 0x000000, 0).setInteractive({ useHandCursor: true });
    hit.on('pointerup', () => {
      audio.play('ui');
      this.scene.restart({ tab: this.tab, selected: entry.id });
    });
  }

  /** 選中那一件的說明與動作：買、用、卸。 */
  private buildDetail(entry: Entry | undefined, cx: number, y: number): void {
    const save = state();
    pixelPanel(this, cx, y, GAME_WIDTH - 40, 104);
    if (entry === undefined) return;
    const name = this.add.text(48, y - 38, entry.name, textStyle({ size: 20, color: INK })).setOrigin(0, 0);
    fitText(name, 300);
    const desc = this.add.text(48, y - 10, wrapText(entry.desc, 300, 15), textStyle({ size: 15, color: INK_DIM })).setOrigin(0, 0);
    desc.setLineSpacing(2);

    const label = entry.on ? (entry.offLabel ?? '使用中') : entry.owned ? entry.onLabel : `購買 ${entry.price.toLocaleString('en-US')}`;
    const button = createButton(this, GAME_WIDTH - 110, y, {
      width: 150,
      height: 56,
      label,
      fontSize: label.length > 4 ? 16 : 18,
      ...(entry.owned ? {} : { fillColor: hexToNumber(GOLD) }),
      onClick: () => {
        if (entry.owned) entry.toggle(save);
        else {
          const result = entry.buy(save);
          if (result === 'short') {
            floatLabel(this, GAME_WIDTH - 110, y - 46, '靈石不足', DANGER, 20);
            return;
          }
          if (result !== 'ok') return;
          track('costume_buy', { id: entry.id, price: entry.price, kind: this.tab });
          audio.play('gold');
          burstPixels(this, GAME_WIDTH - 110, y, GOLD, 12);
        }
        persist();
        // 換裝：場上與主畫面的門人貼圖重疊一次；符紙換掉之後新建的符牌就用新的
        composeDisciples(this, lookOf(save));
        setCardPaper(save.player.stones.paper);
        this.time.delayedCall(entry.owned ? 0 : 400, () => this.scene.restart({ tab: this.tab, selected: entry.id }));
      },
    });
    if (entry.on && entry.offLabel === null) button.setEnabled(false);
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
