/**
 * 背景：每個境界一張手繪遠景（public/art/bg-*.webp，宣紙上畫山、竹、雲海、宮闕……），
 * 上面再疊緩慢橫移的祥雲與飄浮的金箔點。
 *
 * 遠景貼圖沒載到時（例如單元測試、或某張圖 404），退回一張素色宣紙，畫面不會變成一片空白。
 */
import Phaser from 'phaser';
import { ART, backdropTexture } from '../art';
import { GAME_HEIGHT, GAME_WIDTH } from '../config';
import type { Scenery } from '../data/types';
import { hexToNumber } from './theme';

/** 背景需要知道的境界資料：哪張遠景、什麼色調。 */
export interface BackdropRealm {
  id: string;
  color: string;
  scenery: Scenery;
}

const PAPER = 0xefe6d2;

/**
 * 由上而下的紙色淡幕：遠景只在上半部，往下漸漸淡成素紙，
 * 面板與按鈕壓在上面才不會和山水搶。
 */
function drawFade(g: Phaser.GameObjects.Graphics, strength: number): void {
  const top = GAME_HEIGHT * 0.38;
  const bands = 12;
  for (let i = 0; i < bands; i += 1) {
    const t = (i + 1) / bands;
    g.fillStyle(PAPER, strength * t);
    g.fillRect(0, top + ((GAME_HEIGHT - top) * i) / bands, GAME_WIDTH, (GAME_HEIGHT - top) / bands + 1);
  }
}

/** 依境界畫一層背景。回傳的容器已置於最底層。 */
export function drawBackdrop(scene: Phaser.Scene, realm: BackdropRealm): Phaser.GameObjects.Container {
  const accent = hexToNumber(realm.color);
  const layer = scene.add.container(0, 0);
  const painted = backdropTexture(realm.id);

  if (scene.textures.exists(painted)) {
    layer.add(scene.add.image(0, 0, painted).setOrigin(0, 0).setDisplaySize(GAME_WIDTH, GAME_HEIGHT));
  } else {
    layer.add(scene.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, PAPER).setOrigin(0, 0));
  }
  const fade = scene.add.graphics();
  drawFade(fade, 0.5);
  layer.add(fade);

  // 祥雲：三層緩慢橫移，讓遠景不是一張死圖。
  const clouds: { y: number; width: number; alpha: number; duration: number }[] = [
    { y: GAME_HEIGHT * 0.13, width: 260, alpha: 0.35, duration: 46000 },
    { y: GAME_HEIGHT * 0.24, width: 160, alpha: 0.4, duration: 62000 },
    { y: GAME_HEIGHT * 0.36, width: 240, alpha: 0.28, duration: 78000 },
  ];
  for (const spec of clouds) {
    if (!scene.textures.exists(ART.cloud)) break;
    const cloud = scene.add.image(-160, spec.y, ART.cloud).setAlpha(spec.alpha);
    cloud.setDisplaySize(spec.width, (spec.width * cloud.height) / cloud.width);
    layer.add(cloud);
    scene.tweens.add({
      targets: cloud,
      x: GAME_WIDTH + 200,
      duration: spec.duration,
      delay: Phaser.Math.Between(0, 12000),
      repeat: -1,
    });
  }

  // 飄浮的金箔點：緩慢上升、淡出，讓靜態畫面有呼吸感。顏色帶一點境界色。
  const dust = Phaser.Display.Color.Interpolate.ColorWithColor(
    Phaser.Display.Color.ValueToColor(0xc89a3a),
    Phaser.Display.Color.ValueToColor(accent),
    100,
    35,
  );
  const dustColor = Phaser.Display.Color.GetColor(dust.r, dust.g, dust.b);
  for (let i = 0; i < 14; i += 1) {
    const mote = scene.add.circle(
      Phaser.Math.Between(20, GAME_WIDTH - 20),
      Phaser.Math.Between(80, GAME_HEIGHT - 80),
      Phaser.Math.FloatBetween(1, 2),
      dustColor,
      Phaser.Math.FloatBetween(0.3, 0.6),
    );
    layer.add(mote);
    scene.tweens.add({
      targets: mote,
      y: mote.y - Phaser.Math.Between(60, 160),
      alpha: 0,
      duration: Phaser.Math.Between(4000, 9000),
      ease: 'Sine.easeInOut',
      delay: Phaser.Math.Between(0, 4000),
      repeat: -1,
      onRepeat: () => {
        mote.setPosition(Phaser.Math.Between(20, GAME_WIDTH - 20), Phaser.Math.Between(200, GAME_HEIGHT));
        mote.setAlpha(Phaser.Math.FloatBetween(0.3, 0.6));
      },
    });
  }

  layer.setDepth(-100);
  return layer;
}
