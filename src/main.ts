import Phaser from 'phaser';
import { audio, installAudioUnlock } from './audio';
import { GAME_WIDTH, GAME_HEIGHT, BACKGROUND_COLOR } from './config';
import { state } from './state';
import { PIXEL_FONT } from './ui/theme';
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
import { LeaderboardScene } from './scenes/LeaderboardScene';
import { SplashScene } from './scenes/SplashScene';
import { DungeonScene } from './scenes/DungeonScene';
import { TalismanScene } from './scenes/TalismanScene';

// 瀏覽器要求先有使用者手勢才能發聲。解鎖時才讀存檔裡的音效開關
// （走 state() 而非直接碰 localStorage，見 TECH_SPEC 第 9.2 節）。
installAudioUnlock(() => {
  const save = state();
  audio.setEnabled(save.settings.sound);
  // 解鎖前場景呼叫的 playMusic 是空操作，這裡補上一次。
  audio.playMusic(realmIndexForStage(save.world.stage));
});

/**
 * 點陣字型「俐方體 11 號」（SIL OFL，public/fonts/）。
 *
 * 一定要在建立遊戲之前載完：Phaser 的文字是畫成貼圖的，字型還沒到就先畫，
 * 那張貼圖會一直是後備字體，字型晚到也不會自己重畫。
 * 載入失敗或太慢就照樣開遊戲——字醜一點，總比卡在黑畫面好。
 */
async function loadPixelFont(): Promise<void> {
  const face = new FontFace(PIXEL_FONT, `url(${import.meta.env.BASE_URL}fonts/Cubic_11.woff2)`);
  const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('font timeout')), 4000));
  try {
    document.fonts.add(await Promise.race([face.load(), timeout]));
  } catch {
    // 後備字體見 theme.ts 的 FONT。
  }
}

await loadPixelFont();

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  // 像素畫：放大時取最近的點、不做平滑，座標也對齊到整數像素。
  pixelArt: true,
  roundPixels: true,
  // 音效由 src/audio 自己用 WebAudio 合成，不需要 Phaser 的音訊系統再開一個 AudioContext。
  audio: { noAudio: true },
  backgroundColor: BACKGROUND_COLOR,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
  },
  scene: [BootScene, SplashScene, TitleScene, SectScene, RunScene, ResultScene, UpgradeScene, AchievementScene, HelpScene, TalismanScene, DungeonScene, ArchiveScene, RebirthScene, LeaderboardScene],
});
