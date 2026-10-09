/**
 * 像素風背景：遠山、明月、飄浮靈光。全部以程式繪製，不需美術素材。
 */
import Phaser from 'phaser';
import { ART } from '../art';
import { GAME_HEIGHT, GAME_WIDTH } from '../config';
import type { Scenery } from '../data/types';
import { hexToNumber } from './theme';

type G = Phaser.GameObjects.Graphics;

/**
 * 遠景地貌。十個境界不只換色，形狀也不同——只換色的話，
 * 玩家推了幾十關會覺得畫面從頭到尾都一樣。
 */
function drawScenery(g: G, scenery: Scenery, accent: number): void {
  const base = GAME_HEIGHT * 0.52;
  const far = 0x24313c;
  const near = 0x121820;

  const ridge = (y: number, height: number, peaks: number, color: number, alpha: number): void => {
    const points: Phaser.Types.Math.Vector2Like[] = [{ x: -20, y: GAME_HEIGHT }];
    for (let i = 0; i <= peaks; i += 1) {
      const x = (GAME_WIDTH + 40) * (i / peaks) - 20;
      const wobble = Math.sin(i * 2.3 + peaks) * 0.5 + 0.5;
      points.push({ x, y: y - height * (0.35 + wobble * 0.65) });
    }
    points.push({ x: GAME_WIDTH + 20, y: GAME_HEIGHT });
    g.fillStyle(color, alpha);
    g.fillPoints(points, true);
  };

  const band = (y: number, color: number, alpha: number): void => {
    g.fillStyle(color, alpha);
    g.fillRect(-20, y, GAME_WIDTH + 40, GAME_HEIGHT - y);
  };

  switch (scenery) {
    case 'peaks':
      ridge(base - 40, 150, 5, accent, 0.35);
      ridge(base, 190, 6, far, 0.3);
      ridge(base + 60, 240, 7, near, 0.9);
      break;

    case 'forest':
      // 竹林：一排排三角樹冠，越近越大越暗
      band(base + 90, near, 0.9);
      for (let row = 0; row < 3; row += 1) {
        const y = base - 20 + row * 46;
        const size = 30 + row * 16;
        const color = row === 0 ? accent : row === 1 ? far : near;
        g.fillStyle(color, row === 0 ? 0.32 : row === 1 ? 0.5 : 0.9);
        for (let i = -1; i * (size * 0.9) < GAME_WIDTH + size; i += 1) {
          const x = i * size * 0.9 + (row % 2) * size * 0.45;
          g.fillPoints(
            [{ x, y: y - size }, { x: x - size * 0.55, y: y + size * 0.5 }, { x: x + size * 0.55, y: y + size * 0.5 }],
            true,
          );
        }
      }
      break;

    case 'sea':
      // 雲海：層層水平波紋
      for (let row = 0; row < 4; row += 1) {
        const y = base - 30 + row * 42;
        const points: Phaser.Types.Math.Vector2Like[] = [{ x: -20, y: GAME_HEIGHT }];
        for (let i = 0; i <= 16; i += 1) {
          const x = (GAME_WIDTH + 40) * (i / 16) - 20;
          points.push({ x, y: y + Math.sin(i * 0.9 + row * 1.4) * 12 });
        }
        points.push({ x: GAME_WIDTH + 20, y: GAME_HEIGHT });
        g.fillStyle(row < 2 ? accent : near, row === 0 ? 0.22 : row === 1 ? 0.3 : 0.75);
        g.fillPoints(points, true);
      }
      break;

    case 'volcano': {
      // 火山擺在右後方的地平線上，山腳讓近處的山蓋住。
      // 原本是一整條暗色梯形直通到畫面底，正好壓在戰場中央，看起來像一根柱子。
      const vx = GAME_WIDTH * 0.7;
      const top = base - 96;
      g.fillStyle(0x2a1416, 0.95);
      g.fillPoints(
        [
          { x: vx - 150, y: base + 40 },
          { x: vx - 30, y: top },
          { x: vx + 30, y: top },
          { x: vx + 150, y: base + 40 },
        ],
        true,
      );
      // 受光面與岩漿流
      g.fillStyle(0x4a2420, 0.9);
      g.fillPoints([{ x: vx - 30, y: top }, { x: vx - 6, y: top }, { x: vx - 60, y: base + 40 }, { x: vx - 150, y: base + 40 }], true);
      // 一條往左下流的岩漿，一格一格往外偏，像素畫裡的斜線就是這樣走的。
      // 亮度壓低：背景在選單頁會墊在文字後面，太亮的岩漿會搶走字的對比。
      g.fillStyle(0xff6a2a, 0.5);
      for (let i = 0; i < 14; i += 1) {
        g.fillRect(vx - 3 - Math.floor(i / 2) * 3, top + 3 + i * 3, 3, 3);
      }
      g.fillStyle(0xffb04a, 0.55);
      g.fillRect(vx - 27, top - 3, 54, 6);
      g.fillStyle(0xff8a3a, 0.1);
      g.fillCircle(vx, top - 6, 30);
      g.fillStyle(0xff8a3a, 0.5);
      for (let i = 0; i < 9; i += 1) {
        g.fillRect(vx + Math.sin(i * 2.1) * 60, top - 30 - i * 21, 3, 3);
      }
      ridge(base + 46, 110, 5, near, 0.95);
      break;
    }

    case 'voidrock':
      // 浮空島：大小不一的圓角石塊懸在半空
      band(base + 140, near, 0.85);
      for (let i = 0; i < 7; i += 1) {
        const x = ((i * 97) % (GAME_WIDTH + 80)) - 40;
        const y = base - 130 + ((i * 61) % 200);
        const w = 60 + (i % 3) * 40;
        g.fillStyle(i % 2 === 0 ? accent : far, i % 2 === 0 ? 0.28 : 0.55);
        g.fillEllipse(x, y, w, w * 0.34);
        g.fillPoints(
          [{ x: x - w * 0.36, y }, { x: x + w * 0.36, y }, { x: x + w * 0.1, y: y + w * 0.42 }],
          true,
        );
      }
      break;

    case 'storm':
      // 劫雲：厚重雲層加一道雷
      band(base + 120, near, 0.9);
      for (let row = 0; row < 3; row += 1) {
        const y = 210 + row * 66;
        g.fillStyle(row === 0 ? accent : far, row === 0 ? 0.18 : 0.4);
        for (let i = 0; i < 6; i += 1) {
          g.fillEllipse(i * 110 - 30 + row * 40, y, 150, 54);
        }
      }
      g.fillStyle(0xffe066, 0.45);
      g.fillPoints(
        [
          { x: GAME_WIDTH * 0.8, y: 300 },
          { x: GAME_WIDTH * 0.88, y: 300 },
          { x: GAME_WIDTH * 0.82, y: 380 },
          { x: GAME_WIDTH * 0.89, y: 380 },
          { x: GAME_WIDTH * 0.76, y: 500 },
          { x: GAME_WIDTH * 0.81, y: 400 },
          { x: GAME_WIDTH * 0.75, y: 400 },
        ],
        true,
      );
      break;

    case 'palace':
      // 仙宮：層疊的樓閣剪影
      ridge(base + 40, 150, 5, far, 0.28);
      band(base + 150, near, 0.9);
      for (const [cx, scale] of [[GAME_WIDTH * 0.28, 0.8], [GAME_WIDTH * 0.72, 1], [GAME_WIDTH * 0.5, 0.6]] as const) {
        const bottom = base + 150;
        g.fillStyle(near, 0.95);
        for (let tier = 0; tier < 3; tier += 1) {
          const w = (150 - tier * 34) * scale;
          const y = bottom - tier * 54 * scale;
          g.fillRect(cx - w / 2, y - 46 * scale, w, 46 * scale);
          g.fillStyle(accent, 0.55);
          g.fillPoints(
            [
              { x: cx - w * 0.72, y: y - 46 * scale },
              { x: cx + w * 0.72, y: y - 46 * scale },
              { x: cx + w * 0.34, y: y - 66 * scale },
              { x: cx - w * 0.34, y: y - 66 * scale },
            ],
            true,
          );
          g.fillStyle(near, 0.95);
        }
      }
      break;

    case 'celestial':
      // 仙庭：光柱與浮環
      band(base + 160, near, 0.8);
      // 飛升境的境界色是純白，光柱透明度要壓很低，否則整個畫面泛灰、字讀不到。
      for (let i = 0; i < 5; i += 1) {
        const x = 60 + i * 110;
        g.fillStyle(accent, 0.04);
        g.fillPoints(
          [{ x: x - 26, y: 0 }, { x: x + 26, y: 0 }, { x: x + 56, y: base + 160 }, { x: x - 56, y: base + 160 }],
          true,
        );
      }
      for (let i = 0; i < 4; i += 1) {
        g.lineStyle(3, accent, 0.16);
        g.strokeEllipse(GAME_WIDTH * 0.5, 300 + i * 78, 300 - i * 46, 50 - i * 7);
      }
      break;
  }
}

/** 背景一格像素等於幾個遊戲座標點。540×960 剛好是 180×320 格。 */
const PIXEL = 3;

/** 方格網點：每隔一格填一格。像素畫裡兩個色塊之間用它過渡，不用平滑漸層。 */
function dither(g: G, y: number, rows: number, color: number, alpha: number, phase = 0): void {
  g.fillStyle(color, alpha);
  for (let r = 0; r < rows; r += 1) {
    const yy = y + r * PIXEL;
    for (let x = ((r + phase) % 2) * PIXEL; x < GAME_WIDTH; x += PIXEL * 2) {
      g.fillRect(x, yy, PIXEL, PIXEL);
    }
  }
}

/** 固定種子的亂數：同一個境界每次進來星星都在同一個位置，不會一換場景就跳。 */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

/**
 * 天空：五段色帶，越接近地平線越帶境界色，交界用網點過渡。
 * 上半部再撒星星，少數幾顆是十字亮星。
 */
function drawSky(g: G, accent: number, scenery: Scenery): void {
  const horizon = GAME_HEIGHT * 0.52;
  const bandH = Math.floor(horizon / 5 / PIXEL) * PIXEL;
  g.fillStyle(0x0b0e20, 1);
  g.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
  for (let i = 0; i < 5; i += 1) {
    g.fillStyle(accent, 0.02 + i * 0.025);
    g.fillRect(0, i * bandH, GAME_WIDTH, bandH);
    if (i > 0) dither(g, i * bandH - PIXEL * 2, 2, accent, 0.025, i);
  }
  g.fillStyle(accent, 0.13);
  g.fillRect(0, bandH * 5, GAME_WIDTH, GAME_HEIGHT - bandH * 5);

  const rand = seeded(scenery.length * 7919 + accent);
  for (let i = 0; i < 70; i += 1) {
    const x = Math.floor((rand() * GAME_WIDTH) / PIXEL) * PIXEL;
    const y = Math.floor((rand() * horizon * 0.7) / PIXEL) * PIXEL;
    const bright = rand();
    g.fillStyle(bright > 0.85 ? 0xffffff : bright > 0.5 ? 0xc8d4ff : accent, bright > 0.5 ? 0.9 : 0.5);
    g.fillRect(x, y, PIXEL, PIXEL);
    if (bright > 0.95) {
      g.fillStyle(0xffffff, 0.45);
      g.fillRect(x - PIXEL, y, PIXEL, PIXEL);
      g.fillRect(x + PIXEL, y, PIXEL, PIXEL);
      g.fillRect(x, y - PIXEL, PIXEL, PIXEL);
      g.fillRect(x, y + PIXEL, PIXEL, PIXEL);
    }
  }
}

/** 地平線的霧帶與下方地面的顆粒，讓下半部不是一整片平塗。 */
function drawGround(g: G, accent: number): void {
  const horizon = GAME_HEIGHT * 0.52;
  dither(g, horizon + 30, 4, accent, 0.06);
  g.fillStyle(accent, 0.04);
  g.fillRect(0, horizon + 42, GAME_WIDTH, 15);
  dither(g, horizon + 57, 3, accent, 0.04, 1);
  const rand = seeded(accent + 17);
  for (let i = 0; i < 90; i += 1) {
    const x = Math.floor((rand() * GAME_WIDTH) / PIXEL) * PIXEL;
    const y = Math.floor((horizon + 80 + rand() * (GAME_HEIGHT - horizon - 80)) / PIXEL) * PIXEL;
    g.fillStyle(rand() > 0.5 ? 0x000000 : accent, rand() > 0.5 ? 0.18 : 0.08);
    g.fillRect(x, y, PIXEL * (rand() > 0.7 ? 2 : 1), PIXEL);
  }
}

/** 明月：實心月盤加兩圈淡光，畫在低解析度那一層，邊緣自然是一格一格的。 */
function drawMoon(g: G): void {
  const x = GAME_WIDTH * 0.71;
  const y = GAME_HEIGHT * 0.215;
  g.fillStyle(0xe2dcca, 0.06);
  g.fillCircle(x, y, 78);
  g.fillStyle(0xe2dcca, 0.08);
  g.fillCircle(x, y, 60);
  g.fillStyle(0xf3ecd2, 0.92);
  g.fillCircle(x, y, 42);
  g.fillStyle(0xd8d0b4, 0.9);
  g.fillCircle(x + 14, y - 9, 9);
  g.fillCircle(x - 12, y + 12, 6);
}

/** 依境界色調畫一層背景。回傳的容器已置於最底層。 */
export function drawBackdrop(
  scene: Phaser.Scene,
  accentHex: string,
  scenery: Scenery = 'peaks',
): Phaser.GameObjects.Container {
  const accent = hexToNumber(accentHex);
  const layer = scene.add.container(0, 0);
  const g = scene.add.graphics();

  drawSky(g, accent, scenery);

  // 明月放在頂列與資訊面板之間那一段空白裡：那裡本來就沒有東西，
  // 而月亮不該和任何一個要點的東西搶地方。雷劫的天空滿是劫雲，不該有月亮。
  if (scenery !== 'storm') drawMoon(g);
  drawScenery(g, scenery, accent);
  drawGround(g, accent);

  // 由下而上的暗幕。
  //
  // 沒有它的話，遠山會一路頂到按鈕底下，而按鈕是半透明的——結果按鈕看起來像
  // 浮在山上，而不是一層介面。壓暗下半部之後，UI 自然就「浮」起來了。
  const scrimTop = GAME_HEIGHT * 0.42;
  const bands = 10;
  for (let i = 0; i < bands; i += 1) {
    const t = (i + 1) / bands;
    g.fillStyle(0x070a14, 0.5 * t * t);
    g.fillRect(
      0,
      scrimTop + ((GAME_HEIGHT - scrimTop) * i) / bands,
      GAME_WIDTH,
      (GAME_HEIGHT - scrimTop) / bands + 1,
    );
  }

  // 像素化：整張先畫進三分之一大小的貼圖，再放大三倍。
  // 地貌的程式完全不用改，斜邊與圓弧自然變成一格一格的階梯。
  g.setScale(1 / PIXEL);
  const sky = scene.add
    .renderTexture(0, 0, GAME_WIDTH / PIXEL, GAME_HEIGHT / PIXEL)
    .setOrigin(0, 0)
    .setScale(PIXEL);
  sky.draw(g);
  g.destroy();
  layer.add(sky);

  // 祥雲：三層緩慢橫移，讓遠景不是一張死圖。雲的貼圖一格一點，
  // 縮放取 3 與 6，雲上的一格才會剛好是背景的一格或兩格。
  const clouds: { y: number; scale: number; alpha: number; duration: number }[] = [
    { y: GAME_HEIGHT * 0.13, scale: 6, alpha: 0.12, duration: 46000 },
    { y: GAME_HEIGHT * 0.24, scale: 3, alpha: 0.1, duration: 62000 },
    { y: GAME_HEIGHT * 0.34, scale: 6, alpha: 0.07, duration: 78000 },
  ];
  for (const spec of clouds) {
    if (!scene.textures.exists(ART.cloud)) break;
    const cloud = scene.add
      .image(-140, spec.y, ART.cloud)
      .setScale(spec.scale)
      .setAlpha(spec.alpha)
      .setTint(accent);
    layer.add(cloud);
    scene.tweens.add({
      targets: cloud,
      x: GAME_WIDTH + 200,
      duration: spec.duration,
      delay: Phaser.Math.Between(0, 12000),
      repeat: -1,
    });
  }

  // 飄浮靈光：緩慢上升的小方塊，讓靜態畫面有呼吸感。
  for (let i = 0; i < 18; i += 1) {
    const size = PIXEL * Phaser.Math.Between(1, 2);
    const mote = scene.add.rectangle(
      Phaser.Math.Between(20, GAME_WIDTH - 20),
      Phaser.Math.Between(80, GAME_HEIGHT - 80),
      size,
      size,
      accent,
      Phaser.Math.FloatBetween(0.25, 0.6),
    );
    layer.add(mote);
    scene.tweens.add({
      targets: mote,
      y: mote.y - Phaser.Math.Between(60, 160),
      alpha: 0,
      duration: Phaser.Math.Between(4000, 9000),
      ease: 'Stepped',
      easeParams: [12],
      delay: Phaser.Math.Between(0, 4000),
      repeat: -1,
      onRepeat: () => {
        mote.setPosition(Phaser.Math.Between(20, GAME_WIDTH - 20), Phaser.Math.Between(200, GAME_HEIGHT));
        mote.setAlpha(Phaser.Math.FloatBetween(0.25, 0.6));
      },
    });
  }

  layer.setDepth(-100);
  return layer;
}
