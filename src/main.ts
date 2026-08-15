import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, BACKGROUND_COLOR } from './config';
import { BattleScene } from './scenes/BattleScene';

// 階段 1b 原型：直接進戰鬥場景。
// ExploreScene（階段 1a）完成後，進入點會改為由探索場景啟動。
new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: BACKGROUND_COLOR,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
  },
  scene: [BattleScene],
});
