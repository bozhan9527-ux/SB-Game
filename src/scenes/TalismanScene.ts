import Phaser from 'phaser';
import { libraryFloor } from '../systems/dungeons';
import { glyphTexture } from '../art';
import { CARDS } from '../data';
import { GAME_WIDTH } from '../config';
import type { CardDef } from '../data/types';
import { persist, state } from '../state';
import type { Loadout } from '../systems/loadout';
import { buildLoadout, sectById } from '../systems/loadout';
import { cardDps } from '../systems/deck';
import { realmForStage } from '../systems/realms';
import { track } from '../telemetry';
import type { TalismanCategory, TalismanSort } from '../systems/talismans';
import {
  TALISMAN_CATEGORIES,
  TALISMAN_SLOTS,
  TALISMAN_SORTS,
  isUnlocked,
  matchesCategory,
  sortTalismans,
  effectLines,
  isCompleteLoadout,
  nextUnlock,
  sanitizeTalismans,
  statLine,
} from '../systems/talismans';
import type { Button } from '../ui/button';
import { createButton } from '../ui/button';
import { drawBackdrop } from '../ui/backdrop';
import {
  BG_PANEL,
  BG_PANEL_ALT,
  DANGER,
  GOLD,
  INK,
  INK_DIM,
  JADE,
  LINE,
  hexToNumber,
  textStyle,
  wrapText,
} from '../ui/theme';
import { fadeIn, fadeToScene } from '../ui/transition';

interface Tile {
  def: CardDef;
  unlocked: boolean;
  background: Phaser.GameObjects.Rectangle;
  glyph: Phaser.GameObjects.Image;
  name: Phaser.GameObjects.Text;
  note: Phaser.GameObjects.Text;
  /** 門派專精的「專」字，只有一張符有。 */
  mark: Phaser.GameObjects.Text | null;
}

// 540×960 之下的版面。四張已選、一排工具列、二十張符（4 欄 × 5 列）、一塊說明、一排按鈕，
// 每一段的高度都是算出來的——資料筆數變了就得重算，這是 PROGRESS 的 L-08。
const CHOSEN_Y = 134;
const CHOSEN_H = 64;
const TOOLBAR_Y = 196;
const GRID_TOP = 226;
const TILE_W = 120;
const TILE_H = 74;
const TILE_GAP = 4;
/** 上排四格與下面四欄同寬同距——對不齊的話看起來就像沒置中。 */
const CHOSEN_STEP = TILE_W + TILE_GAP;
const GRID_COLUMNS = 4;
const DETAIL_TOP = 620;
/** 最多同時比較幾張。三欄是 540px 寬放得下又還讀得清楚的上限。 */
const COMPARE_MAX = 3;

/**
 * 符籙譜：二十張裡挑四張帶進場。
 *
 * 為什麼只能帶四張、為什麼用關卡解鎖，寫在 src/systems/talismans.ts 的檔頭。
 * 這裡只負責把那些規則變成看得懂的畫面。
 *
 * 畫面上刻意**不排名**（不標「強度」也不排序戰力）：這些符沒有強弱之分，
 * 只有適不適合。標上分數等於替玩家做完決定，選擇就沒了。
 */
export class TalismanScene extends Phaser.Scene {
  /**
   * 帶入場的四張，**固定四格**。
   *
   * 原本是一個會 splice 的陣列：卸下第二張時第三、四張會往左遞延，
   * 於是「換掉中間那一張」變成了「後面全部往前移一格」。
   * 現在一格對應一格，null 代表那一格是空的。
   */
  private chosen: (string | null)[] = [];
  /** 現在要換哪一格。點上排選格，再點下面的符換進去。 */
  private activeSlot = 0;
  private tiles: Tile[] = [];
  private slots: Phaser.GameObjects.Container[] = [];
  private detail: Phaser.GameObjects.Text | null = null;
  private detailTitle: Phaser.GameObjects.Text | null = null;
  private hint: Phaser.GameObjects.Text | null = null;
  private confirm: { setEnabled(enabled: boolean): void } | null = null;
  private focused: CardDef | null = null;
  private sectLine: Phaser.GameObjects.Text | undefined;
  private columns: Phaser.GameObjects.Text[] = [];
  private sortMode: TalismanSort = 'unlock';
  private category: TalismanCategory = 'all';
  /**
   * 比較模式下選起來的那幾張。
   *
   * 和「帶進場的四張」是完全分開的兩份清單：玩家在比較時本來就會點一堆他不打算帶的符，
   * 若兩者共用，看一眼就會把配置改掉——「看」與「換」必須是兩件事，
   * 這條規則在 tap() 那邊已經立過一次了。
   */
  private compare: string[] = [];
  private compareMode = false;
  private sortButton: Button | undefined;
  private categoryButton: Button | undefined;
  private compareButton: Button | undefined;
  /** 排序後的順序，決定每一格畫在哪裡。不動 CARDS 本身——那份順序同時是解鎖順序。 */
  private order: CardDef[] = [];
  /** buildLoadout 每次呼叫都會重算一整套乘區，排序時會被叫二十次，存起來。 */
  private cachedLoadout: Loadout | null | undefined = undefined;

  constructor() {
    super('Talisman');
  }

  create(): void {
    fadeIn(this);
    const save = state();
    // 符籙的解鎖看的是藏經閣打到第幾層，不是推到第幾關。
    const highest = libraryFloor(save);
    // Phaser 會重用 Scene 實例，這幾個都要清乾淨。
    this.columns = [];
    this.compare = [];
    this.compareMode = false;
    this.sortMode = 'unlock';
    this.category = 'all';
    this.order = [];
    this.cachedLoadout = undefined;
    const realm = realmForStage(save.world.stage);
    drawBackdrop(this, realm.color, realm.scenery);
    this.tiles = [];
    this.slots = [];
    const kept = sanitizeTalismans(save.player.talismans, highest);
    this.chosen = Array.from({ length: TALISMAN_SLOTS }, (_, i) => kept[i] ?? null);
    this.activeSlot = 0;

    const cx = GAME_WIDTH / 2;
    this.add.text(cx, 40, '符籙譜', textStyle({ size: 34, color: INK, bold: true })).setOrigin(0.5);
    const upcoming = nextUnlock(highest);
    this.add
      .text(
        cx,
        70,
        upcoming === null
          ? `二十張已全數參悟，每次帶 ${TALISMAN_SLOTS} 張入場`
          // 下一張要去哪裡拿——現在的答案是藏經閣，不是「再推幾關」。
          : `每次帶 ${TALISMAN_SLOTS} 張入場　藏經閣第 ${highest + 1} 層可得「${upcoming.name}」`,
        textStyle({ size: 16, color: INK_DIM }),
      )
      .setOrigin(0.5);

    this.buildSectLine(cx);
    this.buildChosenSlots(cx);
    this.buildToolbar(cx);
    this.buildGrid(highest);
    this.buildDetail(cx);
    this.layoutGrid();

    this.confirm = createButton(this, cx + 84, 878, {
      width: 208,
      height: 62,
      label: '收妥',
      fontSize: 24,
      strokeColor: 0x6f8b7a,
      onClick: () => {
        save.player.talismans = this.chosen.filter((id): id is string => id !== null);
        persist();
        // 排序過才聚合得起來：同樣四張換個順序不該被算成兩種組合。
        track('loadout_set', {
          talismans: this.chosen.filter((id): id is string => id !== null).sort().join(','),
          sect: save.player.sectId,
          highest_stage: save.world.highestStage,
        });
        fadeToScene(this, 'Title');
      },
    });

    createButton(this, cx - 130, 878, {
      width: 116,
      height: 62,
      label: '取消',
      fontSize: 22,
      onClick: () => fadeToScene(this, 'Title'),
    });

    this.focus(this.chosen[0] ?? null);
    // 原本這句是一行常駐的標籤，佔掉了工具列要用的一整列。
    // 它只需要在玩家還沒動手時說一次，之後有更該說的話（例如「已經帶滿四張」）。
    this.say('上排點一下選格，再點下面的符換進去');
    this.refresh();
  }

  /**
   * 門派專精那一行。
   *
   * 這兩個畫面原本互不知情：符籙譜從頭到尾沒提過門派，選門派也沒提過符。
   * 於是劍修帶著不含劍陣符的牌組，被動整場歸零，畫面上一個字都沒有——
   * **已經存在的取捨被藏起來，比沒有取捨還糟**，玩家連自己選錯了都不知道。
   */
  private buildSectLine(cx: number): void {
    const save = state();
    const sect = sectById(save.player.sectId);
    if (sect === null) return;
    const favored = CARDS.find((card) => card.id === sect.favoredCard);
    if (favored === undefined) return;
    const has = this.chosen.includes(sect.favoredCard);
    const gain = Math.round((sect.favoredDamageMultiplier - 1) * 100);
    this.sectLine = this.add
      .text(cx, 92, '', textStyle({ size: 15, bold: true }))
      .setOrigin(0.5)
      .setData('sect', sect.name)
      .setData('favored', favored.name)
      .setData('gain', gain);
    this.refreshSectLine(has);
  }

  private refreshSectLine(has: boolean): void {
    const label = this.sectLine;
    if (label === undefined) return;
    const sectName = label.getData('sect') as string;
    const favored = label.getData('favored') as string;
    const gain = label.getData('gain') as number;
    label
      .setText(
        has
          ? `${sectName}專精 ${favored}：已帶入場，傷害 +${gain}%`
          : `${sectName}專精 ${favored}：沒帶就吃不到那 +${gain}%`,
      )
      .setColor(has ? JADE : DANGER);
  }

  /**
   * 上方四格：目前帶的四張。
   *
   * 寬度與間距刻意和下面的格線完全一致——原本上排比較窄，四格和四欄對不齊，
   * 看起來就像沒有置中。它們講的是同一件事（哪四張），對齊之後
   * 「上面這一格對應下面哪一欄」也才讀得出來。
   */
  private buildChosenSlots(cx: number): void {
    for (let i = 0; i < TALISMAN_SLOTS; i += 1) {
      const x = cx + (i - (TALISMAN_SLOTS - 1) / 2) * CHOSEN_STEP;
      const background = this.add
        .rectangle(0, 0, TILE_W, CHOSEN_H, BG_PANEL, 0.92)
        .setStrokeStyle(2, LINE)
        .setInteractive({ useHandCursor: true });
      const glyph = this.add.image(0, -10, glyphTexture('sword')).setDisplaySize(28, 34);
      const name = this.add.text(0, 20, '', textStyle({ size: 13, color: INK })).setOrigin(0.5);
      const container = this.add.container(x, CHOSEN_Y, [background, glyph, name]);
      container.setData('glyph', glyph);
      container.setData('name', name);
      container.setData('background', background);
      background.on('pointerup', () => {
        // 點上排是**選格**，不是卸下。卸下改成「再點一次同一格」——
        // 這樣「換掉第三張」就真的只換第三張，不會把第四張往前推。
        if (this.activeSlot === i && this.chosen[i] !== null) {
          this.chosen[i] = null;
          this.say('');
        } else {
          this.activeSlot = i;
          const id = this.chosen[i];
          if (id !== null && id !== undefined) this.focus(id);
        }
        this.refresh();
      });
      this.slots.push(container);
    }
  }

  private buildGrid(highest: number): void {
    const gridWidth = GRID_COLUMNS * TILE_W + (GRID_COLUMNS - 1) * TILE_GAP;
    const left = (GAME_WIDTH - gridWidth) / 2 + TILE_W / 2;
    const favoredId = sectById(state().player.sectId)?.favoredCard ?? null;

    CARDS.forEach((def, index) => {
      const col = index % GRID_COLUMNS;
      const row = Math.floor(index / GRID_COLUMNS);
      const x = left + col * (TILE_W + TILE_GAP);
      const y = GRID_TOP + TILE_H / 2 + row * (TILE_H + TILE_GAP);
      // 解鎖看的是藏經閣的層數，不是關卡進度（v17 起）。
      const unlocked = isUnlocked(def.id, highest);

      const background = this.add
        .rectangle(x, y, TILE_W, TILE_H, BG_PANEL, 0.92)
        .setStrokeStyle(2, LINE)
        .setInteractive({ useHandCursor: true });
      // 圖騰放大成格子的主體。二十張符靠名字分辨要一個一個讀，
      // 靠形狀是掃過去就認得——而這一頁的工作正是「比較」。
      // 每張符的顏色也上到圖騰上，讓同一系的符在視覺上先聚成一群。
      const glyph = this.add
        .image(x, y - 12, glyphTexture(def.art))
        .setDisplaySize(38, 46)
        .setAlpha(unlocked ? 1 : 0.22);
      if (unlocked) glyph.setTint(hexToNumber(def.color));
      const name = this.add
        .text(x, y + 22, def.name, textStyle({ size: 14, color: unlocked ? def.color : INK_DIM }))
        .setOrigin(0.5);
      // 原本這裡還有一行「N 道 / 第 N 關」。拿掉是為了把空間讓給圖騰——
      // 那一行的資訊在下面的說明面板裡本來就有，而格子的工作是「認出是哪一張」，
      // 不是「說完它的規格」。是否解鎖靠圖騰的明暗與名字的顏色就分得出來。
      const note = this.add.text(x, y + 23, '', textStyle({ size: 12, color: INK_DIM })).setVisible(false);
      // 門派專精的那一張在格子上直接掛個記號，不必回選門派畫面對照。
      const mark =
        def.id === favoredId
          ? this.add
              .text(x + TILE_W / 2 - 7, y - TILE_H / 2 + 5, '專', textStyle({ size: 13, color: GOLD, bold: true }))
              .setOrigin(1, 0)
          : null;

      background.on('pointerup', () => this.tap(def, unlocked));
      this.tiles.push({ def, unlocked, background, glyph, name, note, mark });
    });
  }

  /**
   * 工具列：排序、篩選、比較。
   *
   * 二十張符原本只能一張一張點開看說明，記不住上一張寫什麼就等於沒得比——
   * 而「帶哪四張」是這個遊戲裡唯一的 build 決策。這三顆鍵要做的是同一件事：
   * 讓那個決策有辦法被推理，而不是靠記憶力。
   */
  private buildToolbar(cx: number): void {
    this.sortButton = createButton(this, cx - 150, TOOLBAR_Y, {
      width: 140,
      height: 44,
      label: '',
      fontSize: 16,
      onClick: () => {
        const at = TALISMAN_SORTS.findIndex((item) => item.id === this.sortMode);
        this.sortMode = TALISMAN_SORTS[(at + 1) % TALISMAN_SORTS.length]?.id ?? 'unlock';
        this.layoutGrid();
        this.refresh();
      },
    });
    this.categoryButton = createButton(this, cx, TOOLBAR_Y, {
      width: 140,
      height: 44,
      label: '',
      fontSize: 16,
      onClick: () => {
        const at = TALISMAN_CATEGORIES.findIndex((item) => item.id === this.category);
        this.category = TALISMAN_CATEGORIES[(at + 1) % TALISMAN_CATEGORIES.length]?.id ?? 'all';
        this.refresh();
      },
    });
    this.compareButton = createButton(this, cx + 150, TOOLBAR_Y, {
      width: 140,
      height: 44,
      label: '',
      fontSize: 16,
      onClick: () => {
        this.compareMode = !this.compareMode;
        // 離開比較模式就把暫存清掉：留著只會讓下次進來時看到一堆不記得為什麼選的符。
        if (!this.compareMode) this.compare = [];
        this.say(
          this.compareMode ? `點符加入比較，最多 ${COMPARE_MAX} 張（不會動到配置）` : '',
        );
        this.refresh();
      },
    });
  }

  /** 依目前的排序把二十格重新擺位。格子物件不重建，只搬位置。 */
  private layoutGrid(): void {
    const dps = this.dpsOf.bind(this);
    this.order = sortTalismans(CARDS, this.sortMode, dps);
    const gridWidth = GRID_COLUMNS * TILE_W + (GRID_COLUMNS - 1) * TILE_GAP;
    const left = (GAME_WIDTH - gridWidth) / 2 + TILE_W / 2;
    this.order.forEach((def, index) => {
      const tile = this.tiles.find((item) => item.def.id === def.id);
      if (tile === undefined) return;
      const col = index % GRID_COLUMNS;
      const row = Math.floor(index / GRID_COLUMNS);
      const x = left + col * (TILE_W + TILE_GAP);
      const y = GRID_TOP + TILE_H / 2 + row * (TILE_H + TILE_GAP);
      tile.background.setPosition(x, y);
      tile.glyph.setPosition(x, y - 16);
      tile.name.setPosition(x, y + 8);
      tile.note.setPosition(x, y + 26);
      tile.mark?.setPosition(x + TILE_W / 2 - 4, y - TILE_H / 2 + 2);
    });
  }

  /**
   * 這張符在第 1 階的每秒輸出。
   *
   * 用第 1 階比較是因為階數成長對每一張符都是同一個倍率，任何固定階數排出來的名次
   * 都一樣，而第 1 階的數字最好懂。門派專精會算進去——那正是玩家要看到的差別。
   */
  private dpsOf(def: CardDef): number {
    const loadout = this.loadout();
    return loadout === null ? 0 : cardDps({ type: def.id, tier: 1 }, loadout);
  }

  private loadout(): Loadout | null {
    if (this.cachedLoadout !== undefined) return this.cachedLoadout;
    const save = state();
    // 還沒拜入門派時算不出來（buildLoadout 會 throw）；那時候排序退回解鎖順序就好。
    this.cachedLoadout = save.player.sectId === null ? null : buildLoadout(save, save.world.stage);
    return this.cachedLoadout;
  }

  private buildDetail(cx: number): void {
    this.add
      .rectangle(cx, DETAIL_TOP + 95, GAME_WIDTH - 36, 190, BG_PANEL, 0.9)
      .setStrokeStyle(2, LINE);
    this.detailTitle = this.add.text(30, DETAIL_TOP + 10, '', textStyle({ size: 21, bold: true }));
    this.detail = this.add
      .text(30, DETAIL_TOP + 40, '', textStyle({ size: 15, color: INK }))
      .setLineSpacing(4);
    // 比較模式用的三欄，和單張說明共用同一塊面板——同時顯示兩種東西只會互相打架。
    this.columns = [];
    for (let i = 0; i < COMPARE_MAX; i += 1) {
      const x = 30 + i * ((GAME_WIDTH - 60) / COMPARE_MAX);
      this.columns.push(
        this.add
          .text(x, DETAIL_TOP + 10, '', textStyle({ size: 13, color: INK }))
          .setLineSpacing(4)
          .setVisible(false),
      );
    }
    this.hint = this.add.text(cx, 830, '', textStyle({ size: 14, color: GOLD })).setOrigin(0.5);
  }

  /**
   * 點一張符：先給說明，再處理選取。
   *
   * 已滿四張時**不自動替換**，而是要求先卸下一張。自動替換會在玩家只是想看說明時
   * 悄悄動掉配置——「看」與「換」必須是兩件事。
   */
  private tap(def: CardDef, unlocked: boolean): void {
    this.focus(def.id);

    // 比較模式下點符只進比較欄，不動配置。
    if (this.compareMode) {
      const at = this.compare.indexOf(def.id);
      if (at >= 0) this.compare.splice(at, 1);
      else if (this.compare.length >= COMPARE_MAX) {
        this.say(`最多同時比較 ${COMPARE_MAX} 張，先點掉一張`);
      } else this.compare.push(def.id);
      this.refresh();
      return;
    }

    if (!unlocked) {
      this.say(`推到第 ${def.unlockStage} 關才會參悟「${def.name}」`);
      this.refresh();
      return;
    }
    const at = this.chosen.indexOf(def.id);
    if (at >= 0) {
      // 已經帶著的：就地卸下那一格，其他格不動。
      this.chosen[at] = null;
      this.activeSlot = at;
      this.say('');
    } else {
      // 換進目前選中的那一格，然後自動跳到下一格——
      // 連換四張時不必每換一張就回上排點一次。
      this.chosen[this.activeSlot] = def.id;
      const empty = this.chosen.findIndex((id) => id === null);
      this.activeSlot = empty >= 0 ? empty : (this.activeSlot + 1) % TALISMAN_SLOTS;
      this.say('');
    }
    this.refresh();
  }

  private say(text: string): void {
    this.hint?.setText(text);
  }

  private focus(id: string | null): void {
    this.focused = id === null ? null : CARDS.find((card) => card.id === id) ?? null;
    const def = this.focused;
    if (def === null) {
      this.detailTitle?.setText('');
      this.detail?.setText('點一張符看它的路數');
      return;
    }
    this.detailTitle?.setText(def.name).setColor(def.color);
    const width = GAME_WIDTH - 60;
    const lines = [
      statLine(def),
      wrapText(def.desc, width, 15),
      ...effectLines(def).map((line) => wrapText(`◆ ${line}`, width, 15)),
    ];
    this.detail?.setText(lines.join('\n'));
  }

  private refresh(): void {
    for (let i = 0; i < this.slots.length; i += 1) {
      const container = this.slots[i];
      if (container === undefined) continue;
      const id = this.chosen[i];
      const def = id === undefined ? null : CARDS.find((card) => card.id === id) ?? null;
      const glyph = container.getData('glyph') as Phaser.GameObjects.Image;
      const name = container.getData('name') as Phaser.GameObjects.Text;
      const background = container.getData('background') as Phaser.GameObjects.Rectangle;
      // 選中的那一格要看得出來——不然「點上排選格」這個操作沒有回饋。
      const active = i === this.activeSlot;
      if (def === null) {
        glyph.setVisible(false);
        name.setText(active ? '換這格' : '空');
        name.setColor(active ? GOLD : INK_DIM);
        background
          .setStrokeStyle(active ? 3 : 2, active ? hexToNumber(GOLD) : LINE)
          .setFillStyle(BG_PANEL, active ? 0.95 : 0.6);
      } else {
        glyph.setVisible(true).setTexture(glyphTexture(def.art));
        name.setText(def.name).setColor(def.color);
        background
          .setStrokeStyle(active ? 4 : 3, hexToNumber(active ? GOLD : def.color))
          .setFillStyle(BG_PANEL_ALT, 1);
      }
    }

    this.refreshSectLine(
      this.sectLine === undefined ? false : this.chosen.includes(sectById(state().player.sectId)?.favoredCard ?? ''),
    );

    for (const tile of this.tiles) {
      const picked = this.compareMode
        ? this.compare.includes(tile.def.id)
        : this.chosen.includes(tile.def.id);
      const focusedHere = this.focused !== null && this.focused.id === tile.def.id;
      // 篩掉的格子只是變暗，不是消失也不是不能點。
      // 藏起來的話玩家會以為那幾張不見了，而且切回去才發現要重找——
      // 篩選要回答的是「哪幾張是同一類」，不是「把其他的拿走」。
      const matched = matchesCategory(tile.def, this.category);
      const alpha = tile.unlocked ? (matched ? 0.92 : 0.28) : 0.55;
      tile.background
        .setStrokeStyle(
          picked || focusedHere ? 3 : 2,
          picked
            ? hexToNumber(this.compareMode ? GOLD : tile.def.color)
            : focusedHere
              ? 0x8fa0b0
              : LINE,
        )
        .setFillStyle(picked ? BG_PANEL_ALT : BG_PANEL, alpha);
      const dim = matched ? 1 : 0.35;
      tile.glyph.setAlpha(tile.unlocked ? dim : 0.3);
      tile.name.setAlpha(dim);
      tile.note.setAlpha(dim);
      tile.mark?.setAlpha(dim);
      // 排序若是依某個數字，那個數字就要寫在格子上——否則玩家只看得到順序，
      // 看不到差多少，也就無從判斷「值不值得為它換一張」。
      tile.note.setText(this.noteFor(tile));
    }

    this.sortButton?.setLabel(
      `排序 ${TALISMAN_SORTS.find((item) => item.id === this.sortMode)?.name ?? ''}`,
    );
    this.categoryButton?.setLabel(
      `${TALISMAN_CATEGORIES.find((item) => item.id === this.category)?.name ?? ''}`,
    );
    this.compareButton?.setLabel(this.compareMode ? '比較中' : '比較');
    this.refreshCompare();

    // 四格都填滿才能收妥。null 代表空格，過濾掉之後長度不足就是還沒填滿。
    const filled = this.chosen.filter((id): id is string => id !== null);
    this.confirm?.setEnabled(isCompleteLoadout(filled, libraryFloor(state())));
  }

  private noteFor(tile: Tile): string {
    if (!tile.unlocked) return `第 ${tile.def.unlockStage} 關`;
    if (this.sortMode === 'dps') return `每秒 ${Math.round(this.dpsOf(tile.def))}`;
    if (this.sortMode === 'rate') return `${(tile.def.intervalMs / 1000).toFixed(2)} 秒`;
    return `${tile.def.targets} 道`;
  }

  /**
   * 比較欄。
   *
   * 三張並排看的是同一組欄位、對齊同一個順序——比較的價值全在「同一個位置放同一件事」，
   * 只要有一欄的行數不同，眼睛就得重新找一次，那就跟一張一張點沒兩樣。
   */
  private refreshCompare(): void {
    const on = this.compareMode && this.compare.length > 0;
    this.detailTitle?.setVisible(!on);
    this.detail?.setVisible(!on);
    for (const column of this.columns) column.setVisible(on);
    if (!on) return;

    this.columns.forEach((column, index) => {
      const id = this.compare[index];
      const def = id === undefined ? null : CARDS.find((card) => card.id === id) ?? null;
      if (def === null) {
        column.setText('').setColor(INK_DIM);
        return;
      }
      const width = (GAME_WIDTH - 60) / COMPARE_MAX - 12;
      const effects = effectLines(def);
      const lines = [
        def.name,
        `每秒 ${Math.round(this.dpsOf(def))}`,
        `${def.targets} 道　${(def.intervalMs / 1000).toFixed(2)} 秒`,
        '',
        ...(effects.length === 0
          ? ['（無特效）']
          : effects.map((line) => wrapText(`· ${line}`, width, 12))),
      ];
      column.setText(lines.join('\n')).setColor(def.color);
    });
  }
}
