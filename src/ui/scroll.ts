/**
 * 拖曳捲動：內容跟著手指走，一比一。
 *
 * 之前用 pointer.velocity 乘一個係數——velocity 是平滑過的，
 * 拖 600px 內容只走 180px 上下，而且越慢拖越不動，像卡住。
 * 位移直接用這一次和上一次的座標差，再加上滑鼠滾輪給桌機用。
 */
import Phaser from 'phaser';

export function dragScroll(
  scene: Phaser.Scene,
  target: Phaser.GameObjects.Container,
  minY: number,
  maxY: number,
): void {
  if (minY >= maxY) return;
  const move = (dy: number): void => {
    target.y = Phaser.Math.Clamp(target.y + dy, minY, maxY);
  };
  scene.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
    if (!pointer.isDown) return;
    move(pointer.y - pointer.prevPosition.y);
  });
  scene.input.on(
    'wheel',
    (_pointer: Phaser.Input.Pointer, _over: unknown, _dx: number, dy: number) => move(-dy),
  );
}
