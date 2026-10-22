/**
 * 三十隻首領。畫布 220×212（遊戲點），腳底在最下緣、置中。
 * 首領只有兩幀（呼吸起伏 + 線條沸騰）：圖大，四幀太吃記憶體，而首領本來就不走路。
 */
import { C, FU, HAIR, INK, J, R, SKIN, WOOD, ZHU, bolt, ellipsePts, flame, ribbon, spiral } from './lib.mjs';
import { MOBS, beastFront, blush, eyes, human, legs } from './chars.mjs';

const W = 220, H = 212;

/** 首領身後的一圈氣焰（顏色各異），讓首領在戰場上一眼就和小妖分開。 */
function aura(p, x, y, r, color, { spikes = 22, op = 0.5 } = {}) {
  const pts = [];
  for (let i = 0; i < spikes; i++) {
    const a = Math.PI + (i / (spikes - 1)) * Math.PI, rr = (i % 2 ? r * 0.8 : r) + J(r * 0.05);
    pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.95]);
  }
  pts.push([x + r * 0.78, y + r * 0.45], [x - r * 0.78, y + r * 0.45]);
  p.hatch(pts, color, { gap: 3.4, base: 0.16, op });
  p.ink(pts.slice(0, spikes), { w: 1.8, color, passes: 1, op: 0.8 });
}

function crown(p, x, y, s = 1, color = C.gold) {
  p.shape([[x - 14 * s, y], [x - 16 * s, y - 14 * s], [x - 8 * s, y - 6 * s], [x, y - 18 * s], [x + 8 * s, y - 6 * s], [x + 16 * s, y - 14 * s], [x + 14 * s, y]], color, { gap: 2.2, base: 0.6, ow: 2.4, sharp: true });
  p.dot(x, y - 6 * s, 2.4 * s, ZHU);
}

function horns(p, x, hy, s, color = C.bone) {
  for (const k of [-1, 1]) p.shape([[x + k * 8 * s, hy - 10 * s], [x + k * 22 * s, hy - 34 * s], [x + k * 30 * s, hy - 36 * s], [x + k * 18 * s, hy - 8 * s]], color, { gap: 2.2, base: 0.55, ow: 2.4 });
}

function swordAt(p, x, y, len, ang, s = 1, blade = '#c7d6e0') {
  const c = Math.cos(ang), sn = Math.sin(ang), nx = -sn * 3 * s, ny = c * 3 * s;
  p.shape([[x + nx, y + ny], [x + c * len + nx * 0.7, y + sn * len + ny * 0.7], [x + c * (len + 8 * s), y + sn * (len + 8 * s)], [x + c * len - nx * 0.7, y + sn * len - ny * 0.7], [x - nx, y - ny]], blade, { gap: 2, ow: 2, sharp: true, sharpAmp: 0.3 });
  p.ink([[x - nx * 3, y - ny * 3], [x + nx * 3, y + ny * 3]], { w: 3 });
  p.ink([[x, y], [x - c * 12 * s, y - sn * 12 * s]], { w: 3.4, color: WOOD });
}

/** 大一號的人形首領。 */
const bigHuman = (s, o) => (p, x, y, f) => human(p, x, y, f, s, o);

export const BOSSES = {
  beast: { draw: (p, x, y, f) => {
    aura(p, x, y - 100, 96, '#c8372d');
    beastFront(p, x, y, f, 2.3, {
      body: '#5d6676', ears: (p, x, hy, s) => { for (const k of [-1, 1]) p.shape([[x + k * 8 * s, hy - 10 * s], [x + k * 17 * s, hy - 26 * s], [x + k * 18 * s, hy - 8 * s]], '#5d6676', { gap: 2.6, base: 0.5 }); },
      face: 'glow', eyeColor: '#e8434f',
      mane: (p, x, hy, s) => { const pts = []; for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2, r = (i % 2 ? 21 : 27) * s; pts.push([x + Math.cos(a) * r, hy + 4 * s + Math.sin(a) * r * 0.9]); } p.shape(pts, '#3e4450', { gap: 2.6, base: 0.55 }); },
      tail: (p, x, y) => p.shape([[x + 40, y - 50], [x + 90, y - 110], [x + 100, y - 80], [x + 56, y - 30]], '#5d6676', { gap: 2.8 }),
      front: (p, x, y, s) => { crown(p, x, y - 132, 1.6); p.ink([[x - 26, y - 118], [x - 14, y - 92]], { w: 2.4, color: '#e8434f', passes: 1 }); },
    });
  } },
  ape: { draw: (p, x, y, f) => {
    const b = f ? -3 : 0;
    for (const k of [-1, 1]) p.ink(spiral(x + k * 78, y - 150, 16, 1.3, k), { w: 2.2, color: '#6a7a8a', passes: 1 });
    legs(p, x, y, 26, 26, f * 2, { w: 6, foot: 8 });
    y += b;
    p.shape([[x - 38, y - 110], [x - 68, y - 108], [x - 84, y - 70], [x - 76, y - 40], [x - 60, y - 44], [x - 56, y - 76]], '#3e3430', { gap: 2.8, base: 0.5 });
    p.shape([[x + 38, y - 110], [x + 68, y - 108], [x + 84, y - 70], [x + 76, y - 40], [x + 60, y - 44], [x + 56, y - 76]], '#3e3430', { gap: 2.8, base: 0.5 });
    p.blob(x - 72, y - 38, 13, 11, '#c8a890', { gap: 2.4 }); p.blob(x + 72, y - 38, 13, 11, '#c8a890', { gap: 2.4 });
    p.blob(x, y - 80, 58, 56, '#4a3a34', { gap: 2.6, base: 0.5, cross: true, n: 20 });
    p.solid(x, y - 70, 30, 28, '#c8a890', { ow: 2.4 });
    p.blob(x, y - 138, 36, 32, '#4a3a34', { gap: 2.6, base: 0.5 });
    p.solid(x, y - 130, 24, 20, '#d8b8a0', { ow: 2.4 });
    eyes(p, x, y - 142, 11, 2, 'glow', '#e8434f');
    p.shape([[x - 12, y - 122], [x, y - 116], [x + 12, y - 122], [x + 8, y - 114], [x - 8, y - 114]], '#6a1d1d', { base: 0.8, ow: 2 });
    for (const k of [-1, 1]) p.shape([[x + k * 6, y - 121], [x + k * 4, y - 112], [x + k * 2, y - 120]], '#fff', { paint: '#fff', ow: 1.4 });
  } },
  fox: { draw: (p, x, y, f) => {
    // 三條大尾巴，尾尖各點一簇狐火
    for (const k of [-1, 0, 1]) {
      const a = -Math.PI / 2 + k * 0.62, c = Math.cos(a), sn = Math.sin(a), nx = -sn, ny = c;
      const ctr = [[x + c * 8, y - 70 + sn * 8], [x + c * 50 + nx * 14, y - 70 + sn * 50 + ny * 14], [x + c * 90 + nx * 10, y - 70 + sn * 90 + ny * 10], [x + c * 112 - nx * 8, y - 70 + sn * 112 - ny * 8]];
      ribbon(p, ctr, 20, '#f0a050', { taper: 0.3 });
      p.solid(ctr[3][0], ctr[3][1], 13, 13, C.cream, { ow: 2 });
      flame(p, ctr[3][0], ctr[3][1] - 22, 0.45, '#6fd0c0', '#e8fff8', 1.6);
    }
    beastFront(p, x, y, f * 2, 2.1, {
      body: '#f0a050', muzzle: C.cream, face: 'glow', eyeColor: '#c43a2a',
      ears: (p, x, hy, s) => { for (const k of [-1, 1]) p.shape([[x + k * 8 * s, hy - 10 * s], [x + k * 17 * s, hy - 26 * s], [x + k * 18 * s, hy - 8 * s]], '#f0a050', { gap: 2.6 }); },
      front: (p, x, y) => p.ink([[x, y - 146], [x - 4, y - 138], [x, y - 132], [x + 4, y - 138], [x, y - 146]], { w: 2, color: ZHU, passes: 1 }),
    });
  } },
  corpse: { draw: (p, x, y, f) => {
    aura(p, x, y - 96, 90, '#4f7a6a');
    const hop = f ? -4 : 0;
    human(p, x, y + hop, 0, 2.15, {
      robe: '#3a4568', inner: '#e8b33c', armor: '#6a7088', skin: '#a8c0a0', face: 'glow', eyeColor: '#e8434f', sleeves: false, sash: '#2a2a40', cape: '#5a2a2a',
      hat: (p, x, hy, s) => { p.shape([[x - 16 * s, hy - 6 * s], [x + 16 * s, hy - 6 * s], [x + 13 * s, hy - 12 * s], [x + 8 * s, hy - 20 * s], [x - 8 * s, hy - 20 * s], [x - 13 * s, hy - 12 * s]], HAIR, { base: 0.85, gap: 2.4, sharp: true }); p.dot(x, hy - 22 * s, 5, ZHU); },
      front: (p, x, y, s) => {
        for (const k of [-1, 1]) { p.shape([[x + k * 26, y - 96], [x + k * 72, y - 92], [x + k * 72, y - 74], [x + k * 30, y - 74]], '#3a4568', { gap: 2.8, base: 0.45, sharp: true }); p.solid(x + k * 78, y - 83, 9, 9, '#a8c0a0', { ow: 2 }); }
        p.shape([[x - 9, y - 166], [x + 9, y - 166], [x + 11, y - 124], [x - 11, y - 124]], FU, { base: 0.85, gap: 2.4, ow: 2, sharp: true });
        p.ink([[x, y - 162], [x - 4, y - 150], [x + 4, y - 140], [x - 2, y - 128]], { w: 2.2, color: ZHU, passes: 1 });
        for (let i = 0; i < 5; i++) p.ink([[x - 40 + i * 20, y - 40], [x - 36 + i * 20, y - 30]], { w: 2, color: '#6a6a70', passes: 1 });
      },
    });
  } },
  python: { draw: (p, x, y, f) => {
    for (let i = 0; i < 5; i++) p.wash(ellipsePts(x - 70 + i * 35, y - 36 - (i % 2) * 20, 26, 16, 12, 0.15), '#9fd060', 0.28);
    const sw = f ? 4 : -4;
    const c = [[x - 76, y - 24], [x - 30, y - 26], [x + 40, y - 24], [x + 70, y - 54], [x + 30, y - 84], [x - 30, y - 94], [x - 20, y - 132 + sw]];
    ribbon(p, c, 22, '#4f7a40', { taper: 0.2 });
    for (let i = 1; i < 6; i++) p.ink([[c[i][0] - 10, c[i][1]], [c[i][0], c[i][1] + 6], [c[i][0] + 10, c[i][1]]], { w: 1.8, color: '#2f4a2a', passes: 1 });
    const hx = c[6][0], hy = c[6][1] - 20;
    horns(p, hx, hy + 6, 1.1, '#e8d8a0');
    p.blob(hx, hy, 34, 26, '#5f8a50', { gap: 2.6, base: 0.5 });
    eyes(p, hx, hy - 4, 13, 2, 'glow', '#e8b33c');
    p.ink([[hx, hy + 22], [hx, hy + 36], [hx - 6, hy + 44]], { w: 2.6, color: ZHU, passes: 1 }); p.ink([[hx, hy + 36], [hx + 6, hy + 44]], { w: 2.6, color: ZHU, passes: 1 });
    crown(p, hx, hy - 24, 1.2);
  } },
  bull: { draw: (p, x, y, f) => beastFront(p, x, y, f * 2, 2.35, {
    body: '#6a5048', muzzle: '#c8a090', face: 'glow', eyeColor: '#e8434f',
    ears: (p, x, hy, s) => { for (const k of [-1, 1]) { p.shape([[x + k * 14 * s, hy - 8 * s], [x + k * 34 * s, hy - 14 * s], [x + k * 40 * s, hy - 30 * s], [x + k * 30 * s, hy - 20 * s], [x + k * 12 * s, hy - 16 * s]], C.bone, { gap: 2.4, base: 0.6 }); } },
    front: (p, x, y, s) => {
      p.ink(ellipsePts(x, y - 98, 8, 7, 14, 0.02), { w: 3, color: C.gold, passes: 1, closed: true });
      for (const k of [-1, 1]) p.shape([[x + k * 30, y - 80], [x + k * 58, y - 74], [x + k * 56, y - 40], [x + k * 34, y - 44]], '#8a9098', { gap: 2.4, base: 0.6, sharp: true });
      for (const k of [-1, 1]) p.dot(x + k * 44, y - 62, 3, INK);
    },
  }) },
  bloodtao: { draw: (p, x, y, f) => {
    aura(p, x, y - 100, 96, '#c8372d', { op: 0.6 });
    human(p, x, y, f * 2, 2.15, {
      robe: '#a83030', inner: '#2a1a1a', sash: '#2a1a1a', face: 'glow', eyeColor: '#e8434f', longHair: true, hair: '#3a2a2a',
      hat: (p, x, hy, s) => { p.solid(x, hy - 17 * s, 5.5 * s, 4.5 * s, '#3a2a2a', { ow: 2 }); p.ink([[x - 12 * s, hy - 18 * s], [x + 12 * s, hy - 15 * s]], { w: 2, color: '#7a5a2a', passes: 1 }); },
      weaponR: (p, x, y, s) => { swordAt(p, x + 4, y + 20, 70, -Math.PI / 2 + 0.15, 1.6, '#e8a0a0'); for (let i = 0; i < 3; i++) p.dot(x + 14 + J(4), y - 30 + i * 18, 3, ZHU); },
      front: (p, x, y, s) => { for (let i = 0; i < 7; i++) { const a = Math.PI * 0.15 + (i / 6) * Math.PI * 0.7; p.solid(x + Math.cos(a) * 22, y - 106 + Math.sin(a) * 16, 4.5, 4.5, C.bone, { ow: 1.6 }); } },
    });
  } },
  scorpking: { draw: (p, x, y, f) => {
    flame(p, x - 70, y - 150, 0.9); flame(p, x + 76, y - 140, 0.7);
    p.open(`translate(${x} ${y}) scale(2.25) translate(${-x} ${-y})`);
    const ls = p.ls; p.ls = 0.72;
    MOBS.scorpion.draw(p, x, y, f * 2);
    crown(p, x, y - 34, 0.6);
    p.ls = ls; p.close();
  } },
  toad: { draw: (p, x, y, f) => {
    p.open(`translate(${x} ${y - 14}) scale(2.05) translate(${-x} ${-y})`);
    const ls = p.ls; p.ls = 0.72;
    MOBS.toad.draw(p, x, y, f * 2);
    crown(p, x, y - 46, 0.55);
    for (const [dx, dy] of [[-30, -4], [28, -2], [-12, -2]]) { p.solid(x + dx, y + dy, 6, 6, '#e8c040', { ow: 1.6 }); p.ink([[x + dx - 2, y + dy], [x + dx + 2, y + dy]], { w: 1.4, passes: 1 }); }
    p.solid(x, y - 16, 6, 6, '#e8c040', { ow: 1.6 });
    p.ls = ls; p.close();
  } },
  soullord: { draw: (p, x, y, f) => {
    aura(p, x, y - 100, 96, '#5e2a6e', { op: 0.55 });
    for (let i = 0; i < 4; i++) { const a = i * 1.6 + f * 0.4, sx = x + Math.cos(a) * 80, sy = y - 110 + Math.sin(a) * 40; p.shape([[sx, sy + 14], [sx - 9, sy], [sx - 6, sy - 10], [sx + 2, sy - 16], [sx + 9, sy - 2]], C.teal, { gap: 2.2, base: 0.4, ow: 1.8 }); p.dot(sx - 3, sy - 3, 1.6); p.dot(sx + 3, sy - 3, 1.6); }
    human(p, x, y, f * 2, 2.15, {
      robe: '#3a2a4a', inner: '#6a3a8a', sash: '#9b3fa8', face: 'glow', eyeColor: '#c8a0ff', skin: '#d8d0e0',
      hat: (p, x, hy, s) => { p.shape([[x - 20 * s, hy + 10 * s], [x - 18 * s, hy - 12 * s], [x, hy - 26 * s], [x + 18 * s, hy - 12 * s], [x + 20 * s, hy + 10 * s], [x + 13 * s, hy - 4 * s], [x - 13 * s, hy - 4 * s]], '#2a1a3a', { gap: 2.4, base: 0.75 }); },
      weaponR: (p, x, y) => { p.ink([[x + 4, y + 40], [x + 4, y - 80]], { w: 4, color: '#3a2a2a' }); p.solid(x + 4, y - 88, 11, 11, '#c8a0ff', { ow: 2.4 }); p.dot(x + 4, y - 88, 4, '#5e2a6e'); },
    });
  } },
  ghostking: { draw: (p, x, y, f) => {
    const b = f ? -4 : 0;
    for (let i = 0; i < 6; i++) { const gx = x - 90 + i * 36, gy = y - 30 - (i % 2) * 24 + b; p.shape([[gx, gy - 14], [gx - 10, gy], [gx - 8, gy + 12], [gx - 2, gy + 6], [gx + 4, gy + 12], [gx + 10, gy]], '#cfe0e8', { gap: 2.2, base: 0.45, ow: 1.6 }); p.dot(gx - 3, gy - 2, 1.5); p.dot(gx + 3, gy - 2, 1.5); }
    const S = (a) => a.map(([u, v]) => [x + u, y + b + v]);
    p.shape(S([[-40, -140], [-62, -90], [-70, -40], [-56, -50], [-46, -24], [-30, -40], [-14, -18], [0, -36], [14, -18], [30, -40], [46, -24], [56, -50], [70, -40], [62, -90], [40, -140]]), '#3a4a5a', { gap: 2.6, base: 0.5 });
    for (const k of [-1, 1]) p.shape(S([[k * 36, -136], [k * 74, -118], [k * 92, -86], [k * 78, -78], [k * 56, -100]]), '#3a4a5a', { gap: 2.6, base: 0.5 });
    p.solid(x, y + b - 152, 28, 28, '#c8d8e0', { ow: 2.6 });
    eyes(p, x, y + b - 152, 10, 2, 'hollow', '#6fd0c0');
    p.shape(S([[-10, -134], [10, -134], [6, -128], [-6, -128]]), INK, { base: 0.9, ow: 1.6 });
    crown(p, x, y + b - 178, 1.5, '#8aa0b0');
  } },
  bonelady: { draw: (p, x, y, f) => {
    aura(p, x, y - 100, 92, '#c8d0e0', { op: 0.45 });
    human(p, x, y, f * 2, 2.15, {
      robe: '#e8e4f0', inner: '#c8a0c0', sash: '#6a3a6a', face: 'hollow', eyeColor: '#e8434f', skin: C.bone, longHair: true, blush: false,
      hat: (p, x, hy, s) => { p.solid(x, hy - 17 * s, 6 * s, 4.5 * s, HAIR, { ow: 2 }); for (const k of [-1, 1]) p.ink([[x + k * 4 * s, hy - 20 * s], [x + k * 14 * s, hy - 26 * s]], { w: 2, color: C.bone, passes: 1 }); p.dot(x - 14 * s, hy - 26 * s, 3, ZHU); },
      weaponR: (p, x, y) => { for (let i = 0; i < 6; i++) { const a = -Math.PI / 2 - 0.7 + i * 0.28; p.ink([[x, y + 4], [x + Math.cos(a) * 40, y + 4 + Math.sin(a) * 40]], { w: 2, color: '#a89880', passes: 1 }); } p.shape([[x, y + 4], ...[0, 1, 2, 3, 4, 5].map((i) => { const a = -Math.PI / 2 - 0.7 + i * 0.28; return [x + Math.cos(a) * 40, y + 4 + Math.sin(a) * 40]; })], '#f3ead6', { base: 0.6, gap: 3, ow: 2 }); },
      front: (p, x, y) => { for (let i = 0; i < 3; i++) p.ink([[x - 14, y - 96 + i * 8], [x, y - 92 + i * 8], [x + 14, y - 96 + i * 8]], { w: 1.8, color: '#a89880', passes: 1 }); },
    });
  } },
  elder: { draw: (p, x, y, f) => {
    p.wash(ellipsePts(x, y - 140, 50, 50, 22, 0.02), '#f6e7a0', 0.55);
    p.ink(ellipsePts(x, y - 142, 46, 46, 24, 0.02), { w: 2, color: C.gold, passes: 1, closed: true });
    human(p, x, y, f * 2, 2.15, {
      robe: '#d8d0b8', inner: '#7a6a8a', sash: '#7a6a8a', face: 'closed', hair: '#e8e4e0', longHair: true,
      hat: (p, x, hy, s) => { p.solid(x, hy - 17 * s, 6 * s, 5 * s, '#e8e4e0', { ow: 2 }); p.shape([[x - 7 * s, hy - 16 * s], [x - 5 * s, hy - 26 * s], [x, hy - 22 * s], [x + 5 * s, hy - 26 * s], [x + 7 * s, hy - 16 * s]], C.gold, { base: 0.6 }); },
      weaponR: (p, x, y) => { p.ink([[x + 6, y + 40], [x + 2, y - 60], [x + 10, y - 76]], { w: 4.4, color: '#7a5a3a' }); p.solid(x + 12, y - 80, 7, 7, '#e8b33c', { ow: 2 }); ribbon(p, [[x + 4, y - 64], [x + 18, y - 56], [x + 24, y - 40]], 3, ZHU); },
      front: (p, x, y) => { p.shape([[x - 12, y - 120], [x + 12, y - 120], [x + 8, y - 96], [x, y - 82], [x - 8, y - 96]], '#f3f0ea', { paint: '#f3f0ea', gap: 3, ow: 2 }); for (const k of [-1, 1]) p.ink([[x + k * 4, y - 130], [x + k * 16, y - 128]], { w: 2.4, color: '#e8e4e0', passes: 1 }); },
    });
  } },
  faceless: { draw: (p, x, y, f) => {
    aura(p, x, y - 100, 92, '#8a8aa8', { op: 0.45 });
    for (let i = 0; i < 5; i++) { const a = -Math.PI * 0.9 + i * 0.45 + f * 0.1, ex = x + Math.cos(a) * 82, ey = y - 110 + Math.sin(a) * 70; p.solid(ex, ey, 9, 6, '#fbf7ee', { ow: 2 }); p.dot(ex, ey, 3.4, '#5e2a6e'); }
    human(p, x, y, f * 2, 2.15, {
      robe: '#5a5a78', inner: '#2a2a3a', sash: '#c8c8e0', longHair: true, hair: '#4a4a60',
      mask: (p, x, hy, s) => { p.solid(x, hy + 1 * s, 11 * s, 12 * s, '#f3f0ea', { ow: 2.2 }); p.ink([[x - 6 * s, hy + 2 * s], [x - 2 * s, hy + 2 * s]], { w: 1.2, color: '#a8a8b8', passes: 1 }); p.ink([[x + 2 * s, hy + 2 * s], [x + 6 * s, hy + 2 * s]], { w: 1.2, color: '#a8a8b8', passes: 1 }); },
    });
  } },
  puppeteer: { draw: (p, x, y, f) => {
    for (const k of [-1, 1]) {
      const px = x + k * 74, py = y - 2 + (f && k > 0 ? -4 : 0);
      for (const dx of [-6, 6]) p.pencil([[x + k * 48, y - 110], [px + dx, py - 56]], { w: 1.2, op: 0.7, color: '#8a6a40' });
      p.open(`translate(${px} ${py}) scale(0.7) translate(${-px} ${-py})`);
      MOBS.puppet.draw(p, px, py, f * 2 + (k > 0 ? 2 : 0));
      p.close();
    }
    human(p, x, y, f * 2, 2, {
      robe: '#7a4a6a', inner: '#e8c8a0', sash: C.gold, face: 'closed', longHair: true, sleeves: false,
      hat: (p, x, hy, s) => { p.solid(x, hy - 17 * s, 5.5 * s, 4.5 * s, HAIR, { ow: 2 }); p.ink([[x - 12 * s, hy - 18 * s], [x + 12 * s, hy - 15 * s]], { w: 2, color: ZHU, passes: 1 }); },
      front: (p, x, y) => { for (const k of [-1, 1]) for (let i = 0; i < 3; i++) p.pencil([[x + k * 38, y - 46], [x + k * (44 + i * 6), y - 110 + i * 4]], { w: 1, op: 0.6, color: '#8a6a40' }); },
    });
  } },
  devourer: { draw: (p, x, y, f) => {
    const open = f ? 6 : 0;
    legs(p, x, y, 40, 22, f * 2, { w: 6, foot: 10 });
    p.blob(x, y - 92, 86, 76, '#4a3a6a', { gap: 2.8, base: 0.5, cross: true, n: 22 });
    for (const k of [-1, 1]) horns(p, x + k * 30, y - 150, 1.2, '#8a7aa8');
    const mouth = ellipsePts(x, y - 76, 58, 30 + open, 24, 0.03);
    p.shape(mouth, null, { paint: '#140c20', ow: 3 });
    for (let i = 0; i < 9; i++) { const sx = x - 44 + i * 11, sy = y - 76 + J(16); p.dot(sx, sy, 1.6, i % 3 ? '#f6e7a0' : '#c8a0ff'); }
    for (let i = 0; i < 8; i++) { const tx = x - 48 + i * 13.7; p.shape([[tx - 5, y - 104 - open], [tx + 5, y - 104 - open], [tx, y - 92 - open]], C.bone, { paint: C.bone, ow: 1.6 }); p.shape([[tx - 5, y - 48 + open], [tx + 5, y - 48 + open], [tx, y - 60 + open]], C.bone, { paint: C.bone, ow: 1.6 }); }
    eyes(p, x, y - 134, 26, 2.2, 'glow', '#e8434f');
  } },
  swordlord: { draw: (p, x, y, f) => {
    for (let i = 0; i < 6; i++) { const a = -Math.PI + 0.25 + i * 0.52; swordAt(p, x + Math.cos(a) * 90, y - 100 + Math.sin(a) * 76, 40, a + Math.PI / 2 + (f ? 0.06 : 0), 1, '#9cb0c8'); }
    human(p, x, y, f * 2, 2.15, {
      robe: '#2a3040', inner: '#4a5a7a', armor: '#5a6478', sash: '#6fd0c0', face: 'glow', eyeColor: '#6fd0c0', longHair: true, cape: '#1a2030',
      hat: (p, x, hy, s) => { p.solid(x, hy - 17 * s, 5.5 * s, 4.5 * s, HAIR, { ow: 2 }); p.ink([[x - 12 * s, hy - 18 * s], [x + 12 * s, hy - 15 * s]], { w: 2, color: '#6fd0c0', passes: 1 }); },
      weaponR: (p, x, y) => swordAt(p, x + 4, y + 22, 84, -Math.PI / 2 + 0.1, 1.7, '#9cd8e0'),
    });
  } },
  spider: { draw: (p, x, y, f) => {
    for (let i = 0; i < 3; i++) p.ink(ellipsePts(x, y - 104, 60 + i * 26, 50 + i * 22, 22, 0.02), { w: 1, color: '#9a9aa8', passes: 1, closed: true, op: 0.5 });
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; p.pencil([[x, y - 104], [x + Math.cos(a) * 112, y - 104 + Math.sin(a) * 96]], { w: 1, op: 0.4 }); }
    p.open(`translate(${x} ${y}) scale(2.2) translate(${-x} ${-y})`);
    const ls = p.ls; p.ls = 0.7;
    MOBS.spider.draw(p, x, y, f * 2);
    crown(p, x, y - 50, 0.6, '#c8a0ff');
    for (const [dx, dy] of [[-10, -34], [8, -30], [0, -40]]) p.dot(x + dx, y + dy, 1.4, '#f6e7a0');
    p.ls = ls; p.close();
  } },
  heavendemon: { draw: (p, x, y, f) => {
    aura(p, x, y - 104, 100, '#9b3fa8', { op: 0.6 });
    for (const [k, dy] of [[-1, -10], [1, -10]]) p.shape([[x + k * 28, y - 112 + dy], [x + k * 64, y - 140 + dy], [x + k * 86, y - 152 + dy + (f ? 4 : 0)], [x + k * 78, y - 130 + dy], [x + k * 40, y - 100 + dy]], '#8a3a4a', { gap: 2.6, base: 0.5 });
    for (const k of [-1, 1]) p.solid(x + k * 86, y - 156 + (f ? 4 : 0), 8, 8, '#d89080', { ow: 2 });
    human(p, x, y, f * 2, 2.2, {
      robe: '#8a3a4a', inner: '#2a1a1a', armor: '#3a2a2a', sash: C.gold, face: 'glow', eyeColor: '#e8b33c', skin: '#d89080', sleeves: false, longHair: true, hair: '#2a1a1a',
      hat: (p, x, hy, s) => horns(p, x, hy - 2 * s, s * 0.8, '#3a2a2a'),
      front: (p, x, y) => { const hy = y - 62 * 2.2; p.solid(x, hy - 12, 4, 6, '#fff6c8', { ow: 1.8 }); p.dot(x, hy - 12, 2.2, '#e8434f'); },
    });
  } },
  beastemperor: { draw: (p, x, y, f) => {
    human(p, x, y, f * 2, 2.15, {
      robe: '#c89030', inner: '#7a2a1a', sash: '#7a2a1a', armor: '#e8c060', cape: '#7a2a1a', skin: '#e2a24a', hairStyle: 'none',
      mask: (p, x, hy, s) => {
        const pts = []; for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2, r = (i % 2 ? 17 : 22) * s; pts.push([x + Math.cos(a) * r, hy + Math.sin(a) * r * 0.9]); }
        p.shape(pts, '#a8452e', { gap: 2.4, base: 0.5 });
        p.solid(x, hy, 12 * s, 11 * s, '#e2a24a', { ow: 2.2 });
        p.solid(x, hy + 5 * s, 6 * s, 4 * s, '#f6e2b8', { ow: 1.6 });
        p.dot(x, hy + 3 * s, 1.8 * s);
        eyes(p, x, hy - 3 * s, 5 * s, s, 'glow', '#e8434f');
      },
      hat: (p, x, hy, s) => crown(p, x, hy - 18 * s, 1.5),
    });
  } },
  hydra: { draw: (p, x, y, f) => {
    // 九首相柳：九個頭。後排四個小一點、高一點、顏色深一階（在遠處），前排五個。
    const head = (a, reach, lift, size, body, skin, i) => {
      const sw = (f ? 1 : -1) * (i % 2 ? 4 : -4);
      const hx = x + Math.cos(a) * reach + sw, hy = y - 60 - lift + Math.sin(a) * 120;
      ribbon(p, [[x + Math.cos(a) * 30, y - 50], [x + Math.cos(a) * reach * 0.65 + sw, y - 70 - lift * 0.6 + Math.sin(a) * 60], [hx, hy + 14 * size]], 10 * size, body, { taper: 0.3 });
      p.blob(hx, hy, 17 * size, 13 * size, skin, { gap: 2.4, base: 0.5 });
      eyes(p, hx, hy - 2 * size, 6 * size, 1.1 * size, 'glow', '#e8b33c');
      p.ink([[hx, hy + 11 * size], [hx, hy + 18 * size]], { w: 1.6, color: ZHU, passes: 1 });
    };
    for (let i = 0; i < 4; i++) {
      const t = i / 3, a = -Math.PI * 0.82 + t * Math.PI * 0.64;
      head(a, 70, 22, 0.8, '#3f7a62', '#4f8a70', i + 1);
    }
    p.blob(x, y - 40, 70, 36, '#3a6a5a', { gap: 2.8, base: 0.5 });
    for (let i = 0; i < 5; i++) {
      const t = i / 4, a = -Math.PI * 0.92 + t * Math.PI * 0.84;
      head(a, 92, 0, 1, '#4f8a70', '#5f9a80', i);
    }
  } },
  demonemperor: { draw: (p, x, y, f) => {
    flame(p, x - 72, y - 96, 1.1, '#9b3fa8', '#e8434f'); flame(p, x + 72, y - 96, 1.1, '#9b3fa8', '#e8434f');
    human(p, x, y, f * 2, 2.25, {
      robe: '#2a1a2a', inner: '#a83030', sash: C.gold, armor: '#4a2a3a', cape: '#7a1a2a', face: 'glow', eyeColor: '#e8434f', skin: '#d8c8d0', longHair: true,
      hat: (p, x, hy, s) => { p.shape([[x - 14 * s, hy - 6 * s], [x - 12 * s, hy - 30 * s], [x - 4 * s, hy - 22 * s], [x, hy - 36 * s], [x + 4 * s, hy - 22 * s], [x + 12 * s, hy - 30 * s], [x + 14 * s, hy - 6 * s]], '#2a1a2a', { gap: 2.4, base: 0.7, sharp: true }); p.dot(x, hy - 18 * s, 4, '#e8434f'); },
    });
  } },
  swordsea: { draw: (p, x, y, f) => {
    const cy = y - 100;
    for (let ring = 0; ring < 3; ring++) for (let i = 0; i < 8 + ring * 3; i++) {
      const a = (i / (8 + ring * 3)) * Math.PI * 2 + ring * 0.3 + f * 0.12, r = 34 + ring * 26;
      const sx = x + Math.cos(a) * r, sy = cy + Math.sin(a) * r * 0.85;
      swordAt(p, sx, sy, 22 + ring * 4, a + Math.PI / 2, 0.7, ring === 1 ? '#a8c8e0' : '#c7d6e0');
    }
    p.wash(ellipsePts(x, cy, 28, 28, 16, 0.05), '#9cc6e8', 0.6);
    p.solid(x, cy, 16, 16, '#e8f4ff', { ow: 2.6 });
    eyes(p, x, cy, 0.01, 2.2, 'glow', '#2f64a8');
    p.ink(spiral(x, cy, 70, 1.2, 1), { w: 1.4, color: '#7fa6c8', passes: 1, op: 0.6 });
  } },
  arhat: { draw: (p, x, y, f) => {
    aura(p, x, y - 100, 94, '#5e2a6e', { op: 0.5 });
    p.ink(ellipsePts(x, y - 150, 34, 34, 20, 0.02), { w: 3, color: '#8a6a2a', passes: 1, closed: true });
    human(p, x, y, f * 2, 2.2, {
      robe: '#b8742a', inner: '#e8c060', sash: '#7a2a1a', face: 'glow', eyeColor: '#9b3fa8', skin: '#d8b878', hairStyle: 'none', sleeves: false,
      hat: (p, x, hy, s) => { for (let i = 0; i < 6; i++) p.dot(x - 8 * s + i * 3.2 * s, hy - 9 * s - Math.sin((i / 5) * Math.PI) * 3 * s, 1.6 * s, '#8a6a2a'); },
      front: (p, x, y) => {
        for (let i = 0; i < 11; i++) { const a = Math.PI * 0.1 + (i / 10) * Math.PI * 0.8; p.solid(x + Math.cos(a) * 30, y - 104 + Math.sin(a) * 26, 4.5, 4.5, '#5a3a2a', { ow: 1.4 }); }
        p.ink([[x - 6, y - 160], [x + 2, y - 150], [x - 4, y - 140]], { w: 2, color: '#5e2a6e', passes: 1 });
      },
    });
  } },
  storm: { draw: (p, x, y, f) => {
    bolt(p, x - 50, y - 40, 1.3, '#f0c040', 2.6); bolt(p, x + 56, y - 30, 1.1, '#c8a0ff', 2.6); bolt(p, x + 6, y - 20, 1.4, '#f0c040', 2.6);
    const pts = []; const bumps = [[-70, 34], [-30, 46], [16, 50], [60, 38], [86, 26]];
    pts.push([x - 100, y - 100]);
    for (const [bx, r] of bumps) for (let a = Math.PI * 1.05; a <= Math.PI * 1.95 + 0.01; a += Math.PI * 0.12) pts.push([x + bx + Math.cos(a) * r, y - 104 + Math.sin(a) * r]);
    pts.push([x + 108, y - 92], [x + 60, y - 66], [x - 60, y - 66]);
    p.shape(pts, '#4a4a5a', { gap: 2.8, base: 0.6, cross: true });
    for (const [bx, r] of bumps) p.ink(spiral(x + bx, y - 110, r * 0.5, 1.1, -1, Math.PI), { w: 1.8, color: '#2a2a36', passes: 1 });
    eyes(p, x, y - 128 + (f ? -2 : 0), 24, 2.4, 'glow', '#f0c040');
    p.shape([[x - 24, y - 92], [x - 8, y - 100], [x + 8, y - 92], [x + 24, y - 100], [x + 16, y - 84], [x - 16, y - 84]], '#1a1a24', { base: 0.9, ow: 2 });
  } },
  tribulord: { draw: (p, x, y, f) => {
    bolt(p, x - 76, y - 150, 0.9, '#c8a0ff'); bolt(p, x + 80, y - 140, 0.8, '#f0c040');
    human(p, x, y, f * 2, 2.2, {
      robe: '#3a3060', inner: '#c8a0ff', armor: '#5a5088', sash: '#f0c040', cape: '#2a2048', face: 'glow', eyeColor: '#f0c040', skin: '#c8c0d8', longHair: true, hair: '#d8d8f0',
      hat: (p, x, hy, s) => { horns(p, x, hy, s * 0.7, '#3a3060'); for (const k of [-1, 0, 1]) bolt(p, x + k * 12 * s, hy - 24 * s, 0.3, '#f0c040', 1.6); },
      weaponR: (p, x, y) => { p.ink([[x + 4, y + 40], [x + 4, y - 74]], { w: 4, color: '#3a2a2a' }); p.shape([[x + 4, y - 74], [x - 10, y - 92], [x + 4, y - 112], [x + 18, y - 92]], '#c8a0ff', { gap: 2, base: 0.6, sharp: true }); },
    });
  } },
  thunderbird: { draw: (p, x, y, f) => {
    const up = f ? -10 : 0;
    for (const k of [-1, 1]) {
      p.shape([[x + k * 16, y - 120], [x + k * 60, y - 160 + up], [x + k * 104, y - 150 + up], [x + k * 96, y - 128 + up * 0.6], [x + k * 106, y - 112 + up * 0.5], [x + k * 80, y - 104], [x + k * 90, y - 86], [x + k * 50, y - 90], [x + k * 20, y - 84]], '#3a5aa8', { gap: 2.6, base: 0.5 });
      for (let i = 0; i < 3; i++) p.ink([[x + k * (40 + i * 18), y - 120 + up * 0.5], [x + k * (54 + i * 18), y - 104]], { w: 1.4, color: '#f0c040', passes: 1 });
    }
    p.ink([[x - 10, y - 56], [x - 12, y - 16], [x - 20, y - 4]], { w: 4 }); p.ink([[x + 10, y - 56], [x + 12, y - 16], [x + 20, y - 4]], { w: 4 });
    p.shape([[x - 28, y - 130], [x - 30, y - 80], [x - 14, y - 50], [x, y - 44], [x + 14, y - 50], [x + 30, y - 80], [x + 28, y - 130]], '#4a6ac0', { gap: 2.6, base: 0.5 });
    p.solid(x, y - 86, 14, 22, '#e8eef8', { ow: 2, tint: '#9cb0e0', op: 0.2 });
    p.blob(x, y - 146, 24, 22, '#4a6ac0', { gap: 2.4, base: 0.5 });
    for (const k of [-1, 0, 1]) p.shape([[x + k * 10 - 4, y - 164], [x + k * 14, y - 186], [x + k * 10 + 4, y - 164]], '#f0c040', { gap: 2, base: 0.6, ow: 1.8 });
    p.shape([[x - 8, y - 140], [x + 8, y - 140], [x, y - 122]], C.gold, { base: 0.7, ow: 2 });
    eyes(p, x, y - 150, 9, 1.6, 'glow', '#f0c040');
  } },
  celestial: { draw: (p, x, y, f) => {
    p.wash(ellipsePts(x, y - 150, 40, 40, 20, 0.02), '#f6e7a0', 0.6);
    human(p, x, y, f * 2, 2.2, {
      robe: '#f0e6c8', inner: C.gold, armor: '#e8c050', sash: ZHU, face: 'angry', cape: '#c8372d', sleeves: false,
      hat: (p, x, hy, s) => { p.shape([[x - 13 * s, hy - 8 * s], [x - 10 * s, hy - 20 * s], [x, hy - 26 * s], [x + 10 * s, hy - 20 * s], [x + 13 * s, hy - 8 * s]], C.gold, { gap: 2.2, base: 0.55 }); for (const k of [-1, 1]) ribbon(p, [[x + k * 12 * s, hy - 14 * s], [x + k * 26 * s, hy - 22 * s], [x + k * 34 * s, hy - 16 * s]], 3, ZHU); },
      weaponR: (p, x, y) => { p.ink([[x + 4, y + 44], [x + 4, y - 96]], { w: 4, color: WOOD }); p.shape([[x - 14, y - 96], [x + 4, y - 128], [x + 22, y - 96], [x + 4, y - 104]], '#c7d6e0', { gap: 2, base: 0.6, sharp: true }); p.shape([[x - 16, y - 96], [x - 26, y - 84], [x - 12, y - 88]], '#c7d6e0', { base: 0.6, ow: 2 }); },
      front: (p, x, y) => { p.ink([[x - 6, y - 160], [x, y - 166], [x + 6, y - 160]], { w: 2, color: C.gold, passes: 1 }); },
    });
  } },
  fallen: { draw: (p, x, y, f) => {
    // 斷掉的光環 + 殘破的羽翼
    p.ink(ellipsePts(x, y - 166, 30, 10, 14, 0.02).slice(0, 9), { w: 3, color: '#a89878', passes: 1 });
    for (const k of [-1, 1]) {
      p.shape([[x + k * 20, y - 120], [x + k * 60, y - 150 + (f ? 4 : 0)], [x + k * 92, y - 136], [x + k * 76, y - 120], [x + k * 88, y - 104], [x + k * 60, y - 100], [x + k * 66, y - 84], [x + k * 30, y - 92]], '#8a8478', { gap: 2.6, base: 0.45 });
      for (let i = 0; i < 3; i++) p.ink([[x + k * (44 + i * 14), y - 128], [x + k * (52 + i * 14), y - 108]], { w: 1.4, color: '#4a4440', passes: 1 });
    }
    human(p, x, y, f * 2, 2.15, {
      robe: '#d8d4cc', inner: '#4a3a4a', sash: '#4a3a4a', face: 'glow', eyeColor: '#9b3fa8', longHair: true, hair: '#d8d8e0',
      behind: (p, x, y) => { ribbon(p, [[x - 30, y - 110], [x - 70, y - 80], [x - 84, y - 40], [x - 100, y - 20]], 5, '#5e2a6e'); ribbon(p, [[x + 30, y - 110], [x + 64, y - 70], [x + 90, y - 50], [x + 100, y - 24]], 5, '#5e2a6e'); },
      front: (p, x, y) => { for (const [dx, dy] of [[-14, -60], [10, -40], [-6, -24]]) p.ink([[x + dx, y + dy], [x + dx + 6, y + dy + 8], [x + dx + 2, y + dy + 14]], { w: 1.6, passes: 1 }); },
    });
  } },
  starlord: { draw: (p, x, y, f) => {
    // 星盤
    p.ink(ellipsePts(x, y - 120, 96, 96, 30, 0.01), { w: 1.6, color: '#c8a050', passes: 1, closed: true });
    p.ink(ellipsePts(x, y - 120, 80, 80, 30, 0.01), { w: 1, color: '#c8a050', passes: 1, closed: true, op: 0.7 });
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2 + f * 0.05; p.ink([[x + Math.cos(a) * 80, y - 120 + Math.sin(a) * 80], [x + Math.cos(a) * 96, y - 120 + Math.sin(a) * 96]], { w: 1.4, color: '#c8a050', passes: 1 }); }
    for (const [dx, dy] of [[-60, -170], [70, -150], [-84, -90], [80, -80], [40, -200]]) { p.ink([[x + dx - 6, y + dy], [x + dx + 6, y + dy]], { w: 1.6, color: '#e8b33c', passes: 1 }); p.ink([[x + dx, y + dy - 6], [x + dx, y + dy + 6]], { w: 1.6, color: '#e8b33c', passes: 1 }); }
    human(p, x, y, f * 2, 2.15, {
      robe: '#2a3a6a', inner: '#e8c060', sash: '#e8c060', face: 'closed', longHair: true, hair: '#e8e4f0',
      hat: (p, x, hy, s) => { p.solid(x, hy - 17 * s, 6 * s, 5 * s, '#e8e4f0', { ow: 2 }); p.shape([[x - 10 * s, hy - 14 * s], [x - 12 * s, hy - 24 * s], [x + 12 * s, hy - 24 * s], [x + 10 * s, hy - 14 * s]], '#2a3a6a', { gap: 2.2, base: 0.6, sharp: true }); p.dot(x, hy - 20 * s, 3, '#e8b33c'); },
      front: (p, x, y) => { for (const [dx, dy] of [[-10, -60], [8, -44], [-4, -30], [12, -74]]) p.dot(x + dx, y + dy, 2, '#f6e7a0'); },
      weaponR: (p, x, y) => { p.solid(x + 6, y - 6, 14, 14, '#e8c060', { ow: 2.2 }); p.ink(spiral(x + 6, y - 6, 10, 1.2, 1), { w: 1.4, color: '#7a5a2a', passes: 1 }); },
    });
  } },
};

for (const v of Object.values(BOSSES)) {
  v.w = W;
  v.h = H;
}
// 浮在空中的首領沒有腳下的影子。
for (const art of ['storm', 'swordsea', 'ghostking']) BOSSES[art].float = true;
