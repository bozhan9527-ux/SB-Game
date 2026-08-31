/**
 * 場景轉換的淡入淡出。
 *
 * 原本九個場景之間全是 scene.start() 直接跳。瞬切的問題不只是「不好看」：
 * 上一個畫面與下一個畫面在同一幀之內互換，眼睛沒有任何線索知道剛剛發生了什麼——
 * 是我按錯了？還是它自己跳的？兩百多毫秒的黑場就足以把兩個畫面分成兩件事。
 *
 * 只做黑場，不做花俏的推移：這是每一次操作都會看到的東西，越安靜越好。
 */
import Phaser from 'phaser';

/** 一次轉場的長度。再長就開始擋路了——這是玩家一場會看幾十次的東西。 */
export const FADE_MS = 220;

/** 進場的淡入。每個 create() 開頭呼叫一次。 */
export function fadeIn(scene: Phaser.Scene): void {
  scene.cameras.main.fadeIn(FADE_MS, 0, 0, 0);
}

/**
 * 淡出後再切場景。
 *
 * 淡出途中重複呼叫會被擋掉：轉場的兩百毫秒裡按鈕還是活的，
 * 連點兩下「回主畫面」不該排隊切兩次場景。
 */
export function fadeToScene(scene: Phaser.Scene, key: string, data?: object): void {
  const camera = scene.cameras.main;
  if (camera.fadeEffect.isRunning) return;
  camera.fadeOut(FADE_MS, 0, 0, 0);
  camera.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
    // **一定要傳一個物件，即使是空的。**
    //
    // Phaser 的 scene.start(key) 在沒有 data 時不會清掉 settings.data，
    // 而是把上一次啟動時傳的那一份原封不動再交給 init()。於是「這一次沒有帶資料」
    // 和「這一次帶了和上次一樣的資料」在 init() 裡完全分不出來。
    //
    // 這個陷阱真的咬過一次：打完副本之後，每一場正常關卡的 init() 都還收到
    // 那份舊的 { dungeonId, floor }，於是每通一關就再發一次副本獎勵。
    scene.scene.start(key, data ?? {});
  });
}
