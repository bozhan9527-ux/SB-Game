/**
 * 水墨風背景：遠山、明月、飄浮靈光。全部以程式繪製，不需美術素材。
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

    case 'volcano':
      ridge(base + 40, 180, 4, near, 0.85);
      g.fillStyle(0x1a0f10, 0.95);
      g.fillPoints(
        [
          { x: GAME_WIDTH * 0.5 - 190, y: GAME_HEIGHT },
          { x: GAME_WIDTH * 0.5 - 52, y: base - 120 },
          { x: GAME_WIDTH * 0.5 + 52, y: base - 120 },
          { x: GAME_WIDTH * 0.5 + 190, y: GAME_HEIGHT },
        ],
        true,
      );
      g.fillStyle(0xff8a3a, 0.65);
      g.fillEllipse(GAME_WIDTH * 0.5, base - 120, 104, 22);
      g.fillStyle(0xff5a2a, 0.35);
      for (let i = 0; i < 9; i += 1) {
        g.fillCircle(GAME_WIDTH * 0.5 + Math.sin(i * 2.1) * 120, base - 160 - i * 26, 3 + (i % 3));
      }
      break;

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

/** 依境界色調畫一層背景。回傳的容器已置於最底層。 */
/**
 * 明月的貼圖：一張放射漸層。
 *
 * 產生一次就快取在 Phaser 的貼圖管理員裡，之後每個場景共用同一張。
 * 取不到 2D context 時回 null，呼叫端就不畫月亮——少一顆月亮不影響任何玩法，
 * 但為了它讓開場崩掉就太蠢了。
 */
function moonTexture(scene: Phaser.Scene): string | null {
  const key = 'backdrop-moon';
  if (scene.textures.exists(key)) return key;

  const size = 256;
  const canvas = scene.textures.createCanvas(key, size, size);
  if (canvas === null || canvas === undefined) return null;
  const ctx = canvas.getContext();
  if (ctx === null || ctx === undefined) return null;

  const half = size / 2;
  const gradient = ctx.createRadialGradient(half, half, 0, half, half, half);
  gradient.addColorStop(0, 'rgba(250, 246, 235, 0.95)');
  gradient.addColorStop(0.36, 'rgba(246, 241, 228, 0.88)');
  // 這一段是月盤的邊緣：從 0.88 掉到 0.2 只花 4% 的半徑，所以看得出是一顆球，
  // 而不是一團霧。之後那一段才是光暈。
  gradient.addColorStop(0.4, 'rgba(238, 232, 214, 0.2)');
  gradient.addColorStop(0.62, 'rgba(226, 220, 202, 0.06)');
  gradient.addColorStop(1, 'rgba(226, 220, 202, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  canvas.refresh();
  return key;
}

export function drawBackdrop(
  scene: Phaser.Scene,
  accentHex: string,
  scenery: Scenery = 'peaks',
): Phaser.GameObjects.Container {
  const accent = hexToNumber(accentHex);
  const layer = scene.add.container(0, 0);
  const g = scene.add.graphics();

  // 天空：由上而下疊三段色塊，避免使用漸層貼圖。
  g.fillStyle(0x0b0f14, 1);
  g.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
  g.fillStyle(accent, 0.06);
  g.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT * 0.55);
  g.fillStyle(accent, 0.04);
  g.fillRect(0, GAME_HEIGHT * 0.55, GAME_WIDTH, GAME_HEIGHT * 0.45);

  drawScenery(g, scenery, accent);

  // 由下而上的暗幕。
  //
  // 沒有它的話，遠山會一路頂到按鈕底下，而按鈕是半透明的——結果按鈕看起來像
  // 浮在山上，而不是一層介面。壓暗下半部之後，UI 自然就「浮」起來了。
  // 用二十段矩形疊出漸層，不需要漸層貼圖。
  const scrimTop = GAME_HEIGHT * 0.42;
  const bands = 20;
  for (let i = 0; i < bands; i += 1) {
    const t = (i + 1) / bands;
    g.fillStyle(0x070a0e, 0.5 * t * t);
    g.fillRect(
      0,
      scrimTop + ((GAME_HEIGHT - scrimTop) * i) / bands,
      GAME_WIDTH,
      (GAME_HEIGHT - scrimTop) / bands + 1,
    );
  }

  layer.add(g);

  // 明月。
  //
  // 位置與畫法都重來過兩次。原本落在 (0.74, 0.16)、亮度 0.5，正好壓在標題的
  // 筆畫上；移開之後改用幾圈遞減透明度的實心圓堆柔邊，結果在深色背景上看得到
  // 一圈一圈的階梯——**堆疊的圓做不出柔邊，只會做出年輪**。
  //
  // 現在畫成一張放射漸層貼圖，一次產生、全遊戲共用。位置放在頂列與資訊面板之間
  // 那一段空白裡：那裡本來就沒有東西，而月亮不該和任何一個要點的東西搶地方。
  const moon = moonTexture(scene);
  if (moon !== null) {
    layer.add(
      scene.add
        .image(GAME_WIDTH * 0.71, GAME_HEIGHT * 0.215, moon)
        .setDisplaySize(224, 224)
        .setAlpha(0.9),
    );
  }

  // 祥雲：三層緩慢橫移，讓遠景不是一張死圖。
  const clouds: { y: number; scale: number; alpha: number; duration: number }[] = [
    { y: GAME_HEIGHT * 0.13, scale: 1.1, alpha: 0.12, duration: 46000 },
    { y: GAME_HEIGHT * 0.24, scale: 0.8, alpha: 0.09, duration: 62000 },
    { y: GAME_HEIGHT * 0.34, scale: 1.4, alpha: 0.07, duration: 78000 },
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

  // 飄浮靈光：緩慢上升的小點，讓靜態畫面有呼吸感。
  for (let i = 0; i < 18; i += 1) {
    const mote = scene.add.circle(
      Phaser.Math.Between(20, GAME_WIDTH - 20),
      Phaser.Math.Between(80, GAME_HEIGHT - 80),
      Phaser.Math.Between(1, 3),
      accent,
      Phaser.Math.FloatBetween(0.25, 0.6),
    );
    layer.add(mote);
    scene.tweens.add({
      targets: mote,
      y: mote.y - Phaser.Math.Between(60, 160),
      alpha: 0,
      duration: Phaser.Math.Between(4000, 9000),
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
