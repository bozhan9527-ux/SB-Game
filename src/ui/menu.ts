/**
 * 右上角的三條線選單。
 *
 * **為什麼要有它。** 主畫面原本把六個次要入口攤成一排按鈕，字級被壓到 15px，
 * 而它們的共同點只是「都不是主要動作」。把其中四個收進選單之後，
 * 留在畫面上的就只剩真的每一場都會用到的東西。
 *
 * 選單自己有兩層（主層與音樂層），但**不換場景**：換場景會把主畫面整個重畫，
 * 而玩家只是想調個音量。兩層之間切換只是換掉面板裡的內容。
 */
import Phaser from 'phaser';
import type { IconName } from '../art';
import { iconTexture } from '../art';
import { audio } from '../audio';
import { GAME_HEIGHT, GAME_WIDTH } from '../config';
import { persist, state } from '../state';
import { createButton } from './button';
import { createSlider } from './slider';
import { BG_PANEL, GOLD, INK, INK_DIM, LINE, hexToNumber, textStyle } from './theme';
import { fadeToScene } from './transition';
import { realmIndexForStage } from '../systems/realms';

export interface MenuEntry {
  label: string;
  /** 圖示名稱。文字左邊會畫上它。 */
  icon?: IconName;
  /** 要去的場景。省略代表它是選單自己處理的項目。 */
  scene?: string;
  /** 右側的小標記，例如「3 可領取」。沒有就不畫。 */
  badge?: string;
}

/**
 * 開啟選單。回傳的 container 被關閉時會自己銷毀，呼叫端不必保留它。
 *
 * entries 由呼叫端決定，因為「有哪些入口」是各畫面的事——
 * 例如榜單只在有設定後端時才存在。
 */
export function openMenu(scene: Phaser.Scene, entries: readonly MenuEntry[]): void {
  const cx = GAME_WIDTH / 2;
  const cy = GAME_HEIGHT / 2;
  const width = GAME_WIDTH - 80;

  const veil = scene.add
    .rectangle(cx, cy, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.78)
    .setInteractive();
  const root = scene.add.container(0, 0, [veil]).setDepth(200);
  // 點空白處關閉是手機上最自然的退出方式，但關閉鍵仍然要有——
  // 「點外面」是慣例不是提示，第一次用的人不會知道。
  veil.on('pointerup', () => root.destroy());

  const body = scene.add.container(0, 0);
  root.add(body);

  const show = (build: (panelTop: number) => number): void => {
    body.removeAll(true);
    // 面板高度由內容決定，位置再依高度回推——寫死高度的話，
    // 兩層內容不一樣多就會有一層留一大塊空白（PROGRESS 的 L-08）。
    const height = build(0);
    body.setY(cy - height / 2);
  };

  const buildRoot = (top: number): number => {
    const rowHeight = 66;
    const height = 96 + entries.length * rowHeight + 78;
    // 面板要吃掉點擊。不設 interactive 的話，點在面板的空白處會穿透到遮罩，
    // 整個選單就關掉了——手指偏一點就前功盡棄，而「點外面關閉」的外面
    // 指的是面板以外，不是面板上沒有按鈕的地方。
    const panel = scene.add
      .rectangle(cx, top + height / 2, width, height, BG_PANEL, 0.98)
      .setStrokeStyle(2, LINE)
      .setInteractive();
    const title = scene.add
      .text(cx, top + 46, '選　單', textStyle({ size: 28, color: INK, bold: true }))
      .setOrigin(0.5);
    body.add([panel, title]);

    entries.forEach((entry, index) => {
      const y = top + 96 + index * rowHeight + 26;
      const button = createButton(scene, cx, y, {
        width: width - 56,
        height: 54,
        label: entry.badge === undefined ? entry.label : `${entry.label}　${entry.badge}`,
        fontSize: 21,
        ...(entry.icon === undefined ? {} : { icon: iconTexture(entry.icon), iconSize: 24 }),
        textColor: entry.badge === undefined ? INK : GOLD,
        onClick: () => {
          if (entry.scene === undefined) {
            show(buildAudio);
            return;
          }
          root.destroy();
          fadeToScene(scene, entry.scene);
        },
      });
      body.add(button.container);
    });

    const close = createButton(scene, cx, top + height - 40, {
      width: width - 56,
      height: 52,
      label: '關閉',
      fontSize: 20,
      onClick: () => root.destroy(),
    });
    body.add(close.container);
    return height;
  };

  const buildAudio = (top: number): number => {
    const save = state();
    const height = 300;
    const panel = scene.add
      .rectangle(cx, top + height / 2, width, height, BG_PANEL, 0.98)
      .setStrokeStyle(2, hexToNumber(GOLD))
      .setInteractive();
    const title = scene.add
      .text(cx, top + 44, '音　樂', textStyle({ size: 28, color: GOLD, bold: true }))
      .setOrigin(0.5);
    const hint = scene.add
      .text(cx, top + 76, '歸零就是關掉', textStyle({ size: 15, color: INK_DIM }))
      .setOrigin(0.5);
    body.add([panel, title, hint]);

    const sfx = createSlider(scene, cx, top + 122, {
      width: width - 56,
      value: save.settings.sfxVolume,
      label: '音效',
      onChange: (value) => {
        save.settings.sfxVolume = value;
        audio.setSfxVolume(value);
      },
      onCommit: () => {
        // 放開才存檔：拖動途中會連續觸發，每一格都寫一次存檔是白費力氣。
        persist();
        audio.play('ui');
      },
    });
    const music = createSlider(scene, cx, top + 190, {
      width: width - 56,
      value: save.settings.musicVolume,
      label: '背景音樂',
      onChange: (value) => {
        save.settings.musicVolume = value;
        audio.setMusicVolume(value);
      },
      onCommit: (value) => {
        persist();
        // 從零拉回來時要把配樂重新排上，否則玩家會以為拉條沒有用。
        if (value > 0) audio.playMusic(realmIndexForStage(state().world.stage));
      },
    });
    body.add([sfx.container, music.container]);

    const back = createButton(scene, cx, top + height - 40, {
      width: width - 56,
      height: 52,
      label: '返回',
      fontSize: 20,
      onClick: () => show(buildRoot),
    });
    body.add(back.container);
    return height;
  };

  show(buildRoot);
}
