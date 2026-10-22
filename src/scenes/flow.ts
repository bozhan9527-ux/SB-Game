/**
 * 「進主線」的唯一入口。
 *
 * 主畫面、洞府、結算頁都有一顆「開始／繼續挑戰」，而進主線之前可能還有兩件事要先做：
 * - 打完第 81 關還沒證道：先**飛升**（強制）；
 * - 上一關過了還沒選機緣：先**三選一**。
 * 三處各自判斷的話，遲早有一處漏掉——於是玩家會從洞府繞過三選一、或繞過飛升。
 */
import type Phaser from 'phaser';
import { state } from '../state';
import { mustAscend } from '../systems/karma';
import { fadeToScene } from '../ui/transition';

/** 現在按下「挑戰」應該去哪一頁。 */
export function mainlineTarget(): 'Sect' | 'Ascend' | 'Blessing' | 'Run' {
  const save = state();
  if (save.player.sectId === null) return 'Sect';
  if (mustAscend(save)) return 'Ascend';
  if (save.world.realmRun.offer !== null) return 'Blessing';
  return 'Run';
}

export function enterMainline(scene: Phaser.Scene): void {
  fadeToScene(scene, mainlineTarget());
}
