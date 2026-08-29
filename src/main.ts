import Phaser from 'phaser';
import { audio, installAudioUnlock } from './audio';
import { GAME_WIDTH, GAME_HEIGHT, BACKGROUND_COLOR } from './config';
import { state } from './state';
import { realmIndexForStage } from './systems/realms';
import { BootScene } from './scenes/BootScene';
import { TitleScene } from './scenes/TitleScene';
import { SectScene } from './scenes/SectScene';
import { RunScene } from './scenes/RunScene';
import { ResultScene } from './scenes/ResultScene';
import { UpgradeScene } from './scenes/UpgradeScene';
import { AchievementScene } from './scenes/AchievementScene';
import { HelpScene } from './scenes/HelpScene';
import { ChallengeScene } from './scenes/ChallengeScene';
import { ArchiveScene } from './scenes/ArchiveScene';
import { TalismanScene } from './scenes/TalismanScene';

// 瀏覽器要求先有使用者手勢才能發聲。解鎖時才讀存檔裡的音效開關
// （走 state() 而非直接碰 localStorage，見 TECH_SPEC 第 9.2 節）。
installAudioUnlock(() => {
  const save = state();
  audio.setEnabled(save.settings.sound);
  // 解鎖前場景呼叫的 playMusic 是空操作，這裡補上一次。
  audio.playMusic(realmIndexForStage(save.world.stage));
});

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  // 音效由 src/audio 自己用 WebAudio 合成，不需要 Phaser 的音訊系統再開一個 AudioContext。
  audio: { noAudio: true },
  backgroundColor: BACKGROUND_COLOR,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
  },
  scene: [BootScene, TitleScene, SectScene, RunScene, ResultScene, UpgradeScene, AchievementScene, HelpScene, TalismanScene, ChallengeScene, ArchiveScene],
});
