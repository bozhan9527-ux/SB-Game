/**
 * 拉條。
 *
 * 觸控的拉條有一個和滑鼠完全不同的問題：**手指會擋住自己要調的東西**。
 * 所以這裡把數值顯示在拉條的右邊而不是把手上，拖動時手指壓著把手，
 * 眼睛看的是旁邊那個數字。
 *
 * 熱區高度固定 44px（TECH_SPEC 第 6 節），即使軌道畫得比較細——
 * 一條 4px 的線在手機上是點不到的。
 */
import Phaser from 'phaser';
import { BG_PANEL_ALT, GOLD, INK, INK_DIM, LINE, MIN_TOUCH_SIZE, hexToNumber, textStyle } from './theme';

export interface SliderOptions {
  width: number;
  /** 0～1。 */
  value: number;
  label: string;
  /** 拖動途中會連續呼叫，放開時再呼叫一次。存檔請在 onCommit 做。 */
  onChange: (value: number) => void;
  onCommit?: (value: number) => void;
}

export interface Slider {
  container: Phaser.GameObjects.Container;
  setValue(value: number): void;
}

export function createSlider(
  scene: Phaser.Scene,
  x: number,
  y: number,
  options: SliderOptions,
): Slider {
  const width = options.width;
  const trackWidth = width - 96;
  const left = -width / 2 + 4;
  const trackLeft = left;
  let value = clamp01(options.value);

  const label = scene.add
    .text(left, -14, options.label, textStyle({ size: 17, color: INK }))
    .setOrigin(0, 0.5);
  const readout = scene.add
    .text(width / 2 - 4, -14, '', textStyle({ size: 16, color: INK_DIM }))
    .setOrigin(1, 0.5);

  const track = scene.add
    .rectangle(trackLeft, 14, trackWidth, 4, LINE)
    .setOrigin(0, 0.5);
  const fill = scene.add
    .rectangle(trackLeft, 14, trackWidth * value, 4, hexToNumber(GOLD))
    .setOrigin(0, 0.5);
  const knob = scene.add
    .circle(trackLeft + trackWidth * value, 14, 11, hexToNumber(GOLD))
    .setStrokeStyle(2, BG_PANEL_ALT);

  // 熱區蓋住整條，包含把手走得到的兩端——只讓把手可拖的話，
  // 玩家點軌道上的某一點不會有反應，而那是最自然的操作。
  const hit = scene.add
    .rectangle(0, 8, width, MIN_TOUCH_SIZE, 0x000000, 0)
    .setInteractive({ useHandCursor: true });

  const container = scene.add.container(x, y, [label, readout, track, fill, knob, hit]);

  const render = (): void => {
    fill.width = trackWidth * value;
    knob.x = trackLeft + trackWidth * value;
    readout.setText(`${Math.round(value * 100)}%`);
    readout.setColor(value <= 0 ? INK_DIM : GOLD);
  };

  const pick = (pointer: Phaser.Input.Pointer): void => {
    const localX = pointer.x - container.x - trackLeft;
    value = clamp01(localX / trackWidth);
    render();
    options.onChange(value);
  };

  let dragging = false;
  hit.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
    dragging = true;
    pick(pointer);
  });
  hit.on('pointermove', (pointer: Phaser.Input.Pointer) => {
    if (dragging) pick(pointer);
  });
  const release = (): void => {
    if (!dragging) return;
    dragging = false;
    options.onCommit?.(value);
  };
  hit.on('pointerup', release);
  // 手指滑出熱區才放開也算放開，否則設定不會被寫進存檔。
  hit.on('pointerout', release);

  render();

  return {
    container,
    setValue(next: number) {
      value = clamp01(next);
      render();
    },
  };
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
