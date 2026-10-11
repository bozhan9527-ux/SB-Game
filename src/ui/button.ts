/**
 * 按鈕。熱區不小於 44×44 px（TECH_SPEC 第 6 節）。
 */
import Phaser from 'phaser';
import { audio } from '../audio';
import {
  BG_PANEL_ALT,
  EDGE,
  GOLD,
  GOLD_LO,
  INK,
  INK_DIM,
  JADE,
  LACQUER,
  MIN_TOUCH_SIZE,
  WOOD,
  fitText,
  hexToNumber,
  shade,
  textStyle,
} from './theme';
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

  // 材質：主要按鈕是朱漆配亮金邊，一般按鈕是漆木配暗金邊。
  // 呼叫端原本用「金底深字」表示主要按鈕、「玉底深字」表示可以出發——
  // 在新材質下金底改成朱漆、玉底改成青玉漆，字一律淺色，對比才夠。
  const requestedFill = options.fillColor ?? BG_PANEL_ALT;
  const primary = requestedFill === hexToNumber(GOLD);
  const jade = requestedFill === hexToNumber(JADE);
  const fill = primary ? LACQUER : jade ? 0x2f8a6a : requestedFill === BG_PANEL_ALT ? WOOD : requestedFill;
  const rim = primary || options.strokeColor === hexToNumber(GOLD) ? hexToNumber(GOLD) : jade ? 0x9cf0c0 : GOLD_LO;
  const darkText = options.textColor !== undefined && /^#[0-2]/.test(options.textColor);
  const textColor = darkText ? (primary ? '#fff6e0' : '#f2fff6') : (options.textColor ?? INK);

  // 像素按鈕：實心投影＋深色描邊＋金邊＋上亮下暗的斜角，看起來是「凸出來可以按」的。
  const shadow = scene.add.rectangle(4, 4, width, height, 0x000000, 0.45);
  const background = scene.add.rectangle(0, 0, width, height, fill).setStrokeStyle(3, EDGE);
  const rimLine = scene.add.rectangle(0, 0, width - 6, height - 6, 0x000000, 0).setStrokeStyle(2, rim);
  const bevelLight = scene.add
    .rectangle(-width / 2 + 5, -height / 2 + 5, width - 10, 3, shade(fill, 0.28), 1)
    .setOrigin(0, 0);
  const bevelDark = scene.add
    .rectangle(-width / 2 + 5, height / 2 - 8, width - 10, 3, shade(fill, -0.4), 1)
    .setOrigin(0, 0);

  const text = scene.add
    .text(0, 0, options.label, textStyle({ size: options.fontSize ?? 26, color: textColor }))
    .setOrigin(0.5)
    // 一格硬投影：字壓在有斜角的漆面上也讀得清楚
    .setShadow(2, 2, 'rgba(0,0,0,0.55)', 0);

  const children: Phaser.GameObjects.GameObject[] = [shadow, background, rimLine, bevelLight, bevelDark, text];

  const hasIcon = options.icon !== undefined && scene.textures.exists(options.icon);
  // 圖示是 32 點見方的像素畫，顯示尺寸往上取到 16 的倍數：縮成 22 點的話，
  // 最近點取樣會整排整排地丟格子，圖示看起來會缺角。
  const requested = options.iconSize ?? Math.round((options.fontSize ?? 26) * 1.15);
  const iconSize = hasIcon ? Math.max(16, Math.ceil(requested / 16) * 16) : 0;
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
  // 按下是「往投影的方向沉兩點」，不是縮小：縮放會讓像素格變得一格大一格小。
  const press = (down: boolean): void => {
    if (pressed === down) return;
    pressed = down;
    const shift = down ? 3 : -3;
    for (const child of [background, rimLine, bevelLight, bevelDark, text, ...(icon === null ? [] : [icon])]) {
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
    burstPixels(scene, bounds.centerX, bounds.centerY, GOLD);
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
