/**
 * 按鈕。熱區不小於 44×44 px（TECH_SPEC 第 6 節）。
 */
import Phaser from 'phaser';
import { audio } from '../audio';
import { BG_PANEL_ALT, INK, INK_DIM, LINE, MIN_TOUCH_SIZE, textStyle } from './theme';

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

  const background = scene.add
    .rectangle(0, 0, width, height, options.fillColor ?? BG_PANEL_ALT)
    .setStrokeStyle(2, options.strokeColor ?? LINE);

  const text = scene.add
    .text(0, 0, options.label, textStyle({ size: options.fontSize ?? 26, color: options.textColor ?? INK }))
    .setOrigin(0.5);

  const children: Phaser.GameObjects.GameObject[] = [background, text];

  // 圖示與文字當成**一組**置中，不是圖示靠左、文字置中。
  // 後者在窄按鈕上會讓圖示貼著邊，看起來像沒對齊；而這一組的重心
  // 要落在按鈕中央，眼睛才不會覺得歪。
  if (options.icon !== undefined && scene.textures.exists(options.icon)) {
    const iconSize = options.iconSize ?? Math.round((options.fontSize ?? 26) * 1.15);
    const gap = 10;
    const groupWidth = iconSize + gap + text.width;
    const icon = scene.add
      .image(-groupWidth / 2 + iconSize / 2, 0, options.icon)
      .setDisplaySize(iconSize, iconSize);
    text.setX(groupWidth / 2 - text.width / 2);
    children.push(icon);
  }

  const container = scene.add.container(x, y, children);
  container.setSize(width, height);

  let enabled = true;
  background.setInteractive({ useHandCursor: true });
  background.on('pointerdown', () => {
    if (!enabled) return;
    container.setScale(0.96);
  });
  background.on('pointerout', () => container.setScale(1));
  background.on('pointerup', () => {
    container.setScale(1);
    if (!enabled) return;
    audio.play('ui');
    options.onClick();
  });

  return {
    container,
    setLabel(value: string) {
      text.setText(value);
    },
    setEnabled(value: boolean) {
      enabled = value;
      container.setAlpha(value ? 1 : 0.45);
      text.setColor(value ? (options.textColor ?? INK) : INK_DIM);
    },
    get enabled() {
      return enabled;
    },
  };
}
