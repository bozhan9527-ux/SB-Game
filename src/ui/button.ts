/**
 * 按鈕。熱區不小於 44×44 px（TECH_SPEC 第 6 節）。
 */
import Phaser from 'phaser';
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

  const container = scene.add.container(x, y, [background, text]);
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
    if (enabled) options.onClick();
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
