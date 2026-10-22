import Phaser from 'phaser';
import { audio, installAudioUnlock } from './audio';
import { GAME_WIDTH, GAME_HEIGHT, BACKGROUND_COLOR, RENDER_SCALE } from './config';
import { state } from './state';
import { initPlatform } from './platform';
import { GAME_FONT, paperInk } from './ui/theme';
import { realmIndexForStage } from './systems/realms';
import { BootScene } from './scenes/BootScene';
import { TitleScene } from './scenes/TitleScene';
import { SectScene } from './scenes/SectScene';
import { RunScene } from './scenes/RunScene';
import { ResultScene } from './scenes/ResultScene';
import { UpgradeScene } from './scenes/UpgradeScene';
import { AchievementScene } from './scenes/AchievementScene';
import { HelpScene } from './scenes/HelpScene';
import { ArchiveScene } from './scenes/ArchiveScene';
import { RebirthScene } from './scenes/RebirthScene';
import { ShopScene } from './scenes/ShopScene';
import { LeaderboardScene } from './scenes/LeaderboardScene';
import { SplashScene } from './scenes/SplashScene';
import { DungeonScene } from './scenes/DungeonScene';
import { TalismanScene } from './scenes/TalismanScene';
import { BlessingScene } from './scenes/BlessingScene';
import { AscendScene } from './scenes/AscendScene';
import { AltarScene } from './scenes/AltarScene';

// 瀏覽器要求先有使用者手勢才能發聲。解鎖時才讀存檔裡的音效開關
// （走 state() 而非直接碰 localStorage，見 TECH_SPEC 第 9.2 節）。
installAudioUnlock(() => {
  const save = state();
  audio.setEnabled(save.settings.sound);
  // 解鎖前場景呼叫的 playMusic 是空操作，這裡補上一次。
  audio.playMusic(realmIndexForStage(save.world.stage));
});

/**
 * 手寫字型「霞鶩文楷 TC」（SIL OFL，public/fonts/；只收遊戲用到的字，見 scripts/sketch-art/subset-font.py）。
 *
 * 一定要在建立遊戲之前載完：Phaser 的文字是畫成貼圖的，字型還沒到就先畫，
 * 那張貼圖會一直是後備字體，字型晚到也不會自己重畫。
 * 載入失敗或太慢就照樣開遊戲——字醜一點，總比卡在黑畫面好。
 */
async function loadGameFont(): Promise<void> {
  const face = new FontFace(GAME_FONT, `url(${import.meta.env.BASE_URL}fonts/LXGWWenKaiTC-game.woff2)`);
  const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('font timeout')), 4000));
  try {
    document.fonts.add(await Promise.race([face.load(), timeout]));
  } catch {
    // 後備字體見 theme.ts 的 FONT。
  }
}

await loadGameFont();

/**
 * 每個場景的主攝影機放大 RENDER_SCALE 倍、從左上角對齊（見 config.ts）。
 *
 * 掛在攝影機管理器的 start 上，而不是在每個場景的 create 裡各寫一次：
 * 漏寫的那一個場景會只畫在左上四分之一，而且新加的場景一定會有人忘記。
 */
// Phaser 的型別沒有公開 start（它是場景事件的處理函式），這裡自己補上。
type CameraManagerProto = Phaser.Cameras.Scene2D.CameraManager & { start(): void };
const cameraProto = Phaser.Cameras.Scene2D.CameraManager.prototype as CameraManagerProto;
const cameraStart = cameraProto.start;
cameraProto.start = function (this: CameraManagerProto): void {
  cameraStart.call(this);
  this.main.setOrigin(0, 0).setZoom(RENDER_SCALE);
};

/**
 * 文字顏色一律經過 paperInk（見 theme.ts）：場景裡動態換色的地方很多（境界色、符種色、
 * 狀態色），每一處都自己記得轉，總會漏一個——漏掉的那一行字在紙上就看不見。
 */
const setColor = Phaser.GameObjects.Text.prototype.setColor;
Phaser.GameObjects.Text.prototype.setColor = function (this: Phaser.GameObjects.Text, color: string | CanvasGradient | CanvasPattern) {
  return setColor.call(this, typeof color === 'string' ? paperInk(color) : color);
};

// 被 128 合 1 平台嵌著時建立橋接（接關付費、回報結束）；直接開網址時什麼都不做。
initPlatform();

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  // 手繪：貼圖要平滑縮放；座標不對齊整數，慢慢飄的雲才不會一格一格跳。
  pixelArt: false,
  antialias: true,
  // 音效由 src/audio 自己用 WebAudio 合成，不需要 Phaser 的音訊系統再開一個 AudioContext。
  audio: { noAudio: true },
  backgroundColor: BACKGROUND_COLOR,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: GAME_WIDTH * RENDER_SCALE,
    height: GAME_HEIGHT * RENDER_SCALE,
  },
  scene: [BootScene, SplashScene, TitleScene, SectScene, RunScene, ResultScene, UpgradeScene, AchievementScene, HelpScene, TalismanScene, DungeonScene, ArchiveScene, RebirthScene, LeaderboardScene, BlessingScene, AscendScene, AltarScene, ShopScene],
});

// 開發用：讓瀏覽器自動化腳本讀得到遊戲（幀率、目前場景）。正式版不掛。
if (import.meta.env.DEV) (globalThis as { __game?: Phaser.Game }).__game = game;
