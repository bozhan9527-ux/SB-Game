/**
 * 按鈕。熱區不小於 44×44 px（TECH_SPEC 第 6 節）。
 */
import Phaser from 'phaser';
import { audio } from '../audio';
import {
  BG_PANEL_ALT,
  EDGE,
  GOLD,
  INK,
  INK_DIM,
  JADE,
  LACQUER,
  MIN_TOUCH_SIZE,
  TALISMAN,
  fitText,
  hexToNumber,
  textStyle,
} from './theme';
import { roughLine, roughRect } from './sketch';
import { burstPixels } from './effects';

export interface ButtonOptions {
  width: number;
  height: number;
  label: string;
  onClick: () => void;
  fontSize?: number;
  fillColor?: number;
  strokeColor?: number;
  textColor?: string;
  /** 文字左邊的圖示（貼圖 key）。圖示與文字會被當成一組置中。 */
  icon?: string;
  iconSize?: number;
}

export interface Button {
  container: Phaser.GameObjects.Container;
  setLabel(text: string): void;
  setEnabled(enabled: boolean): void;
  readonly enabled: boolean;
}

export function createButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  options: ButtonOptions,
): Button {
  const width = Math.max(MIN_TOUCH_SIZE, options.width);
  const height = Math.max(MIN_TOUCH_SIZE, options.height);

  // 材質：主要按鈕是一張黃符（朱框），可以出發的是青玉色紙，一般按鈕是木牌色的紙片。
  // 呼叫端原本用「金底」表示主要按鈕、「玉底」表示可以出發——沿用同一個約定，
  // 字一律是墨色：紙面上淺色字讀不出來。
  const requestedFill = options.fillColor ?? BG_PANEL_ALT;
  const primary = requestedFill === hexToNumber(GOLD);
  const jade = requestedFill === hexToNumber(JADE);
  const fill = primary ? TALISMAN : jade ? 0xbfe3c8 : requestedFill === BG_PANEL_ALT ? 0xe8d6b4 : requestedFill;
  const rim = primary ? LACQUER : jade ? JADE_LINE : options.strokeColor === hexToNumber(GOLD) ? LACQUER : null;
  // 呼叫端傳來的字色是為深底設計的：深色字（#0…#2…）照用，淺色字一律換成墨色。
  const darkText = options.textColor !== undefined && /^#[0-4]/.test(options.textColor);
  const textColor = darkText ? options.textColor! : options.textColor === undefined ? INK : readableOnPaper(options.textColor);

  // 紙片按鈕：投影 + 紙 + 墨框（+ 朱框）。按下時紙片沉到投影上。
  const seed = Math.round(width * 13 + height * 7 + x + y);
  const shadow = scene.add.graphics();
  roughRect(shadow, -width / 2 + 3, -height / 2 + 4, width, height, { fill: EDGE, fillAlpha: 0.22, stroke: null, seed });
  const face = scene.add.graphics();
  roughRect(face, -width / 2, -height / 2, width, height, { fill, stroke: EDGE, width: 2.4, seed });
  if (rim !== null) {
    roughRect(face, -width / 2 + 5, -height / 2 + 5, width - 10, height - 10, { stroke: rim, width: 1.4, strokeAlpha: 0.85, double: false, amp: 0.6, seed: seed + 3 });
  }
  if (primary && width >= 120) {
    // 符頭：左右兩道短朱線
    roughLine(face, -width / 2 + 12, -height / 2 + 10, -width / 2 + 12, height / 2 - 10, { stroke: LACQUER, width: 1.2, seed });
    roughLine(face, width / 2 - 12, -height / 2 + 10, width / 2 - 12, height / 2 - 10, { stroke: LACQUER, width: 1.2, seed: seed + 1 });
  }
  // 互動熱區：看不見的矩形（Graphics 沒有點擊範圍）。
  const background = scene.add.rectangle(0, 0, width, height, 0xffffff, 0.001);

  const text = scene.add
    .text(0, 0, options.label, textStyle({ size: options.fontSize ?? 26, color: textColor }))
    .setOrigin(0.5);

  const children: Phaser.GameObjects.GameObject[] = [shadow, face, background, text];

  const hasIcon = options.icon !== undefined && scene.textures.exists(options.icon);
  const requested = options.iconSize ?? Math.round((options.fontSize ?? 26) * 1.2);
  const iconSize = hasIcon ? requested : 0;
  const gap = 10;

  /**
   * 把標籤夾進按鈕裡。
   *
   * **標籤是動態的，按鈕寬度不是。** 道號最長 16 字、深度升級的金幣數會長到
   * 十幾位——不夾的話那些字會直接畫到隔壁那顆按鈕上，而且畫面上看起來
   * 不像壞掉，只像排版很醜，所以不會有人回報。夾在這裡而不是各個場景各夾一次：
   * 漏掉的那一顆才是會出事的那一顆。
   */
  const fitLabel = (): void => {
    // 先還原縮放再量。不還原的話，換成短標籤時它會一直維持上一次縮小的比例。
    text.setScale(1);
    // **下限一定要夾。** 一顆最小尺寸（44px）又帶圖示的按鈕，扣掉留白與圖示
    // 之後剩下的寬度是負的，而 fitText 會照算——scale 變成負數，字會翻過去
    // 或整個看不見。那種壞法在畫面上不像壞掉，只像「這顆按鈕沒有字」。
    const room = Math.max(16, width - 16 - (hasIcon ? iconSize + gap : 0));
    fitText(text, room);
  };
  fitLabel();

  // 圖示與文字當成**一組**置中，不是圖示靠左、文字置中。
  // 後者在窄按鈕上會讓圖示貼著邊，看起來像沒對齊；而這一組的重心
  // 要落在按鈕中央，眼睛才不會覺得歪。
  let icon: Phaser.GameObjects.Image | null = null;
  const layoutIcon = (): void => {
    if (icon === null) return;
    const groupWidth = iconSize + gap + text.displayWidth;
    icon.setX(-groupWidth / 2 + iconSize / 2);
    text.setX(groupWidth / 2 - text.displayWidth / 2);
  };
  if (options.icon !== undefined && hasIcon) {
    icon = scene.add.image(0, 0, options.icon).setDisplaySize(iconSize, iconSize);
    layoutIcon();
    children.push(icon);
  }

  const container = scene.add.container(x, y, children);
  container.setSize(width, height);

  let enabled = true;
  let pressed = false;
  // 按下是「紙片往投影的方向沉下去」。
  const press = (down: boolean): void => {
    if (pressed === down) return;
    pressed = down;
    const shift = down ? 3 : -3;
    for (const child of [face, text, ...(icon === null ? [] : [icon])]) {
      (child as Phaser.GameObjects.Components.Transform).x += shift;
      (child as Phaser.GameObjects.Components.Transform).y += shift;
    }
    shadow.setVisible(!down);
  };
  background.setInteractive({ useHandCursor: true });
  background.on('pointerdown', () => {
    if (!enabled) return;
    press(true);
  });
  background.on('pointerout', () => press(false));
  background.on('pointerup', () => {
    press(false);
    if (!enabled) return;
    audio.play('ui');
    const bounds = container.getBounds();
    burstPixels(scene, bounds.centerX, bounds.centerY, primary ? '#c8372d' : '#2a2622');
    options.onClick();
  });

  return {
    container,
    setLabel(value: string) {
      text.setText(value);
      fitLabel();
      layoutIcon();
    },
    setEnabled(value: boolean) {
      enabled = value;
      container.setAlpha(value ? 1 : 0.45);
      text.setColor(value ? textColor : INK_DIM);
    },
    get enabled() {
      return enabled;
    },
  };
}

const JADE_LINE = 0x2f7a58;

/**
 * 把為深底設計的淺色字換成紙面上讀得出來的顏色。
 * 呼叫端傳的多半是 GOLD、JADE、DANGER 這幾個主題色（本身已經是深色）；
 * 其他淺色一律回到墨色，比猜一個深一點的同色系可靠。
 */
function readableOnPaper(color: string): string {
  const n = hexToNumber(color);
  const lum = 0.299 * ((n >> 16) & 0xff) + 0.587 * ((n >> 8) & 0xff) + 0.114 * (n & 0xff);
  return lum < 150 ? color : INK;
}
