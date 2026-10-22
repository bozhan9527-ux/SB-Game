/**
 * 場景素材：境界背景、戰場、山門、符紙、陣位、符紋、介面圖示、主畫面主視覺。
 */
import { C, FU, GRAPH, HAIR, INK, J, PAPER, Pic, R, STYLE, WOOD, aside, ZHU, bolt, crane, eaveRoof, ellipsePts, flame, flySword, hill, jitter, pagoda, peak, pine, ribbon, ruyi, seedRng, smooth, spiral } from './lib.mjs';
import { heroXian } from './chars.mjs';

const GW = 540, GH = 960;

/** 宣紙底：米黃、朱絲欄直行紅線、雙線紅框、大片暈染。 */
export function xuanPaper(p, { lines = true, frame = true, tint = null } = {}) {
  if (STYLE === 'marker') {
    // 白圖畫紙＋咖啡色雙框（粗框一圈、細框一圈，都是手畫的不直線）。
    p.add(`<rect width="${p.w}" height="${p.h}" fill="#fbfaf5"/>`);
    if (tint) p.add(`<rect width="${p.w}" height="${p.h}" fill="${tint}" opacity=".05"/>`);
    if (frame) aside(() => {
      const box = (m) => [[m, m], [p.w - m, m], [p.w - m, p.h - m], [m, p.h - m], [m, m]];
      // 框貼著紙邊畫（6、12 點），而且淡一點：介面元件從 14 點起排，框不能從它們底下穿過去
      p.ink(jitter(box(6), 0.8, 30), { w: 2.6, color: '#7a4e2e', amp: 0.5, op: 0.8 });
      p.ink(jitter(box(11), 0.6, 30), { w: 1, color: '#7a4e2e', amp: 0.4, op: 0.6 });
    });
    return;
  }
  p.add(`<rect width="${p.w}" height="${p.h}" fill="${PAPER}"/>`);
  p.add(`<rect width="${p.w}" height="${p.h}" filter="url(#blotch)"/>`);
  if (tint) p.add(`<rect width="${p.w}" height="${p.h}" fill="${tint}" opacity=".07"/>`);
  if (lines) for (let x = 30; x < p.w; x += 40) p.add(`<line x1="${x + J(0.5)}" y1="18" x2="${x + J(0.8)}" y2="${p.h - 18}" stroke="#c9544a" stroke-width=".9" opacity=".2"/>`);
  if (frame) {
    p.add(`<rect x="12" y="12" width="${p.w - 24}" height="${p.h - 24}" fill="none" stroke="#c9544a" stroke-width="1.6" opacity=".35"/>`);
    p.add(`<rect x="17" y="17" width="${p.w - 34}" height="${p.h - 34}" fill="none" stroke="#c9544a" stroke-width=".8" opacity=".3"/>`);
  }
}

// ---------- 十個境界 ----------

function bamboo(p, x, y0, y1, color = '#5f9a70') {
  p.ink([[x, y1], [x + J(2), y0]], { w: 3.4, color, passes: 1 });
  for (let y = y1 - 30; y > y0; y -= 30 + R() * 10) {
    p.ink([[x - 3, y], [x + 3, y]], { w: 1.6, color: '#2f5a3a', passes: 1 });
    if (R() < 0.6) { const k = R() < 0.5 ? -1 : 1; p.shape([[x, y], [x + k * 18, y - 6], [x + k * 22, y - 2], [x + k * 6, y + 2]], color, { gap: 2.2, ow: 1.4, base: 0.4 }); }
  }
}

function moon(p, x, y, r, fill = '#f6e7b8') {
  p.blob(x, y, r, r, fill, { base: 0.55, op: 0.3, gap: 5, ow: 1.6, n: 26, wob: 0.01 });
}

function volcano(p, x, base, w, h, fire) {
  const pts = [[x - w / 2, base], [x - w * 0.16, base - h], [x - w * 0.08, base - h + 6], [x + w * 0.08, base - h + 6], [x + w * 0.16, base - h], [x + w / 2, base]];
  p.hatch(pts, '#8a7a7a', { gap: 3.4, op: 0.5, base: 0.25, angle: -1.2 });
  p.ink(pts, { w: 2, color: '#47433d', amp: 0.6 });
  flame(p, x, base - h - 20, 1.1, fire, '#e8b33c', 2);
  for (let i = 0; i < 3; i++) p.pencil([[x - 6 + i * 6, base - h + 10], [x - 20 + i * 18 + J(6), base - h * 0.4]], { color: '#c8452e', w: 2, op: 0.7 });
}

function palace(p, x, y, s = 1, roof = '#3e4a52') {
  p.shape([[x - 70 * s, y], [x + 70 * s, y], [x + 70 * s, y - 34 * s], [x - 70 * s, y - 34 * s]], C.bone, { base: 0.9, op: 0.1, ow: 2, sharp: true });
  for (let i = -2; i <= 2; i++) p.shape([[x + i * 26 * s - 4, y], [x + i * 26 * s + 4, y], [x + i * 26 * s + 4, y - 34 * s], [x + i * 26 * s - 4, y - 34 * s]], ZHU, { base: 0.6, ow: 1.4, sharp: true });
  eaveRoof(p, x, y - 34 * s, 170 * s, 24 * s, roof);
  p.shape([[x - 40 * s, y - 56 * s], [x + 40 * s, y - 56 * s], [x + 40 * s, y - 76 * s], [x - 40 * s, y - 76 * s]], C.bone, { base: 0.9, op: 0.1, ow: 2, sharp: true });
  eaveRoof(p, x, y - 76 * s, 110 * s, 20 * s, roof);
}

function stormCloud(p, x, y, s, fill = '#6a6a7a') {
  ruyi(p, x, y, s, fill, { tail: 0, line: '#3a3a46' });
}

/** 浮島：上緣是長草的緩坡，下緣是垂下來的參差岩根（不是倒三角）。 */
function floatRock(p, x, y, w, color = '#9a94a8') {
  const pts = [[x - w / 2, y], [x - w * 0.32, y - w * 0.1], [x - w * 0.05, y - w * 0.14], [x + w * 0.28, y - w * 0.1], [x + w / 2, y],
    [x + w * 0.4, y + w * 0.12], [x + w * 0.3, y + w * 0.16], [x + w * 0.18, y + w * 0.32], [x + w * 0.06, y + w * 0.26], [x - w * 0.04, y + w * 0.42],
    [x - w * 0.14, y + w * 0.24], [x - w * 0.26, y + w * 0.3], [x - w * 0.34, y + w * 0.14]];
  p.shape(pts, color, { gap: 3, base: 0.3, ow: 2, cross: true });
  p.hatch([[x - w / 2, y], [x - w * 0.32, y - w * 0.1], [x - w * 0.05, y - w * 0.14], [x + w * 0.28, y - w * 0.1], [x + w / 2, y], [x, y + w * 0.05]], '#79c09a', { gap: 2.6, base: 0.45 });
  for (let i = 0; i < 4; i++) p.ink([[x - w * 0.3 + i * w * 0.18, y - w * 0.08], [x - w * 0.31 + i * w * 0.18, y - w * 0.15]], { w: 1.2, color: '#2f8462', passes: 1 });
}

function star(p, x, y, r, color = '#e8b33c') {
  p.ink([[x - r, y], [x + r, y]], { w: 1.4, color, passes: 1 });
  p.ink([[x, y - r], [x, y + r]], { w: 1.4, color, passes: 1 });
}

/** 遠景只畫在上方，下半部留給戰場與面板（越往下越淡）。 */
export function backdrop(realm) {
  const p = new Pic(GW, GH);
  xuanPaper(p, { tint: realm.color });
  const a = realm.color;
  switch (realm.scenery) {
    case 'peaks':
      moon(p, 430, 150, 46);
      hill(p, -20, 300, 330, 90, { op: 0.35 });
      hill(p, 240, 560, 340, 110, { op: 0.35 });
      peak(p, 70, 330, 60, 220, { op: 0.5 }); peak(p, 150, 340, 50, 150, { op: 0.4, pine: false });
      peak(p, 470, 340, 70, 230, { op: 0.5 }); peak(p, 390, 340, 46, 140, { op: 0.4 });
      ruyi(p, 260, 250, 1.2, '#dcebd8'); ruyi(p, 100, 360, 1, '#dcebd8');
      crane(p, 260, 120, 0.6, -1); crane(p, 310, 150, 0.45, -1, 1);
      break;
    case 'forest':
      hill(p, -20, 560, 330, 120, { op: 0.3, fill: '#a8c8b0' });
      for (let i = 0; i < 14; i++) bamboo(p, 30 + i * 38 + J(8), 60 + R() * 120, 360 + R() * 40, i % 3 ? '#6aa880' : '#4f8a62');
      ruyi(p, 140, 310, 1.1, '#d0ece8'); ruyi(p, 420, 280, 1, '#d0ece8');
      break;
    case 'sea':
      p.blob(400, 140, 44, 44, '#f0c860', { base: 0.6, op: 0.4, gap: 4, ow: 1.6, n: 26, wob: 0.01 });
      for (let i = 0; i < 12; i++) { const a2 = (i / 12) * Math.PI * 2; p.pencil([[400 + Math.cos(a2) * 54, 140 + Math.sin(a2) * 54], [400 + Math.cos(a2) * 70, 140 + Math.sin(a2) * 70]], { color: '#d8a030', w: 1.6, op: 0.6 }); }
      floatRock(p, 120, 200, 90); floatRock(p, 300, 150, 60);
      pagoda(p, 120, 196, 0.6);
      for (let row = 0; row < 2; row++) for (let i = -1; i < 7; i++) ruyi(p, i * 110 + (row % 2) * 55, 270 + row * 26, 0.85, '#f2e2b0', { tail: 0, ow: 1.6 });
      break;
    case 'volcano':
      hill(p, -20, 560, 330, 100, { op: 0.35, fill: '#a898a8' });
      volcano(p, 270, 330, 300, 170, '#9b3fa8');
      peak(p, 60, 340, 60, 170, { op: 0.45, pine: false, fill: '#a898a8' }); peak(p, 480, 340, 64, 200, { op: 0.45, pine: false, fill: '#a898a8' });
      for (let i = 0; i < 8; i++) p.dot(150 + R() * 240, 80 + R() * 120, 2, i % 2 ? '#c8452e' : '#9b3fa8');
      break;
    case 'palace':
      ruyi(p, 120, 330, 1.4, '#e4ddf0'); ruyi(p, 400, 320, 1.3, '#e4ddf0');
      palace(p, 270, 290, 1.25, '#4a4a6a');
      palace(p, 90, 180, 0.6, '#4a4a6a'); palace(p, 460, 170, 0.6, '#4a4a6a');
      for (let i = -1; i < 7; i++) ruyi(p, i * 96, 350, 0.9, '#efe8f6', { tail: 0, ow: 1.8 });
      crane(p, 180, 110, 0.55, 1); crane(p, 360, 90, 0.5, -1, 1);
      break;
    case 'voidrock':
      for (let i = 0; i < 26; i++) star(p, 30 + R() * 480, 30 + R() * 300, 2 + R() * 4, i % 3 ? '#79c0c0' : '#e8b33c');
      p.ink(spiral(270, 170, 120, 1.6, 1), { w: 1.4, color: '#6a8aa8', passes: 1, op: 0.5 });
      floatRock(p, 110, 190, 80, '#8a90a8'); floatRock(p, 420, 250, 100, '#8a90a8'); floatRock(p, 280, 320, 60, '#8a90a8');
      break;
    case 'storm':
      for (let i = -1; i < 6; i++) stormCloud(p, i * 110 + 40, 120 + (i % 2) * 30, 1.4, '#7a7a8a');
      bolt(p, 160, 220, 1.6, a, 2.4); bolt(p, 400, 240, 1.3, a, 2.4);
      hill(p, -20, 560, 340, 110, { op: 0.35, fill: '#9a96a0' });
      peak(p, 70, 350, 60, 160, { op: 0.4, pine: false }); peak(p, 470, 350, 60, 150, { op: 0.4, pine: false });
      break;
    case 'celestial':
      for (let i = 0; i < 14; i++) { const a2 = -Math.PI * 0.9 + (i / 13) * Math.PI * 0.8; p.pencil([[270, 260], [270 + Math.cos(a2) * 320, 260 + Math.sin(a2) * 320]], { color: '#e8c060', w: 2, op: 0.4 }); }
      p.wash(ellipsePts(270, 240, 90, 70, 20, 0.03), '#fff3c0', 0.6);
      // 南天門
      for (const x of [200, 340]) p.shape([[x - 9, 320], [x + 9, 320], [x + 9, 214], [x - 9, 214]], ZHU, { gap: 2.4, base: 0.5, sharp: true });
      eaveRoof(p, 270, 214, 200, 30, '#c8a040');
      p.shape([[240, 230], [300, 230], [300, 254], [240, 254]], C.gold, { base: 0.6, gap: 2.4, ow: 2, sharp: true });
      for (let i = -1; i < 7; i++) ruyi(p, i * 96, 336, 1, '#fbf3d8', { tail: 0, ow: 1.8 });
      ruyi(p, 90, 200, 1.1, '#fbf3d8'); ruyi(p, 450, 180, 1.1, '#fbf3d8');
      break;
  }
  return p;
}

// ---------- 戰場、山門、陣位、符紙 ----------

/** 戰場：五條石階道，遠處淡、近處實；兩側石欄。496×620（遊戲點）。 */
export function arena() {
  const w = 496, h = 620;
  const p = new Pic(w, h);
  const id = 'fade';
  p.defs.push(`<linearGradient id="${id}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".75"/><stop offset=".35" stop-color="#fff" stop-opacity=".92"/><stop offset="1" stop-color="#fff" stop-opacity="1"/></linearGradient><mask id="${id}"><rect width="${w}" height="${h}" fill="url(#${id}g)"/></mask>`);
  p.add(`<g mask="url(#${id})">`);
  // 石板路面
  const road = [[8, 0], [w - 8, 0], [w - 4, h], [4, h]];
  p.add(`<path d="${smooth(road, true)}" fill="#ece3cf" opacity=".85"/>`);
  p.add(`<path d="${smooth(road, true)}" fill="#ddd2ba" opacity=".3"/>`);
  p.hatch(road, '#b8ad98', { gap: 9, op: 0.1, base: 0, angle: -0.5, w: 1.1 });
  // 石階橫紋與石板縫
  for (let y = 40; y < h; y += 38 + R() * 8) {
    p.pencil([[10, y], [w - 10, y + J(2)]], { w: 1.3, op: 0.45 });
    for (let x = 40 + R() * 60; x < w - 30; x += 70 + R() * 50) p.pencil([[x, y], [x + J(3), y + 36]], { w: 1, op: 0.35 });
  }
  // 兩側石欄
  for (const x of [6, w - 6]) {
    p.ink([[x, 0], [x, h]], { w: 2.4, color: '#5a5650', passes: 1 });
    for (let y = 20; y < h; y += 62) p.shape([[x - 6, y], [x + 6, y], [x + 6, y + 16], [x - 6, y + 16]], '#b8b0a0', { base: 0.6, gap: 2.4, ow: 1.8, sharp: true });
  }
  p.add('</g>');
  return p;
}

/**
 * 山門。540×148，GATE_Y 落在畫布第 72 點（朱欄上緣）。
 * 朱欄以上只有兩側角樓——中間是最下排陣位，屋簷壓上去會把符蓋住。
 */
export function gate() {
  const p = new Pic(540, 148);
  const by = 72;
  // 兩側角樓：柱 + 屋簷
  for (const [x, k] of [[46, 1], [494, -1]]) {
    for (const dx of [-20, 20]) p.shape([[x + dx - 6, by - 40], [x + dx + 6, by - 40], [x + dx + 7, 146], [x + dx - 7, 146]], ZHU, { gap: 2.4, base: 0.55, sharp: true });
    eaveRoof(p, x, by - 40, 78, 26, '#3e4a52');
    p.shape([[x - 30, 132], [x + 30, 132], [x + 30, 146], [x - 30, 146]], '#a8a090', { gap: 2.4, base: 0.6, ow: 2, sharp: true });
  }
  // 朱欄（妖魔撞的那一條）
  p.shape([[4, by], [536, by], [536, by + 14], [4, by + 14]], ZHU, { gap: 2.4, base: 0.6, sharp: true, cross: true });
  for (let x = 70; x < 480; x += 34) p.shape([[x - 3, by + 14], [x + 3, by + 14], [x + 3, by + 34], [x - 3, by + 34]], ZHU, { gap: 2, base: 0.5, ow: 1.6, sharp: true });
  p.shape([[4, by + 34], [536, by + 34], [536, by + 42], [4, by + 42]], ZHU, { gap: 2.4, base: 0.55, ow: 2, sharp: true });
  // 匾額位（字由遊戲寫上）
  p.shape([[226, by - 4], [314, by - 4], [314, by + 22], [226, by + 22]], C.gold, { base: 0.75, gap: 2.4, ow: 2.4, sharp: true });
  return p;
}

export function gateBeam() {
  const p = new Pic(180, 10);
  p.shape([[1, 1], [179, 1], [179, 9], [1, 9]], ZHU, { base: 0.7, ow: 1.4, sharp: true });
  return p;
}
export function gatePost() {
  const p = new Pic(16, 68);
  p.shape([[2, 2], [14, 2], [14, 66], [2, 66]], ZHU, { base: 0.7, ow: 1.6, sharp: true });
  return p;
}

/** 空陣位：鉛筆方框 + 淡朱捲紋。84×100。 */
export function slot() {
  const p = new Pic(84, 100);
  const pts = [[4, 4], [80, 4], [80, 96], [4, 96], [4, 4]];
  for (let i = 0; i < 4; i++) p.pencil([pts[i], pts[i + 1]], { w: 1.6, op: 0.7, color: '#8a5048' });
  p.ink(spiral(42, 50, 14, 1.4, 1), { w: 1.4, color: ZHU, passes: 1, op: 0.45 });
  for (const [x, y] of [[10, 10], [74, 10], [10, 90], [74, 90]]) p.ink([[x - 3, y], [x + 3, y]], { w: 1.2, color: ZHU, passes: 1, op: 0.5 });
  return p;
}

/** 黃符紙（牌面底）。72×88，雙朱框、符頭捲紋。 */
export function cardPaper() {
  const p = new Pic(72, 88);
  p.tile(1, 1, 70, 86, { fill: FU, shadow: false, ow: 2.2, grainTint: '#c89a40' });
  p.hatch([[3, 3], [69, 3], [69, 85], [3, 85]], '#d9a640', { gap: 4, op: 0.3, base: 0, angle: 0.5 });
  const fr = (m, ww) => p.ink([[m, m], [72 - m, m], [72 - m, 88 - m], [m, 88 - m], [m, m]], { w: ww, color: ZHU, amp: 0.4, passes: 1, op: 0.85 });
  fr(5, 1.6); fr(8, 0.8);
  for (const dx of [-11, 0, 11]) p.ink(spiral(36 + dx, 15, 3.6, 1.1, dx >= 0 ? 1 : -1), { w: 1.2, color: ZHU, passes: 1 });
  return p;
}

/** 雲（遊戲會染色）：白底祥雲。120×40。 */
export function cloud() {
  const p = new Pic(120, 44);
  ruyi(p, 54, 30, 1, '#ffffff', { tail: 1, line: '#9a948a', ow: 1.8 });
  return p;
}

/** 斬擊（遊戲會染色）：一筆毛筆弧。80×80。 */
export function slash() {
  const p = new Pic(80, 80);
  const c = [[10, 66], [26, 40], [46, 22], [70, 12]];
  ribbon(p, c, 7, '#ffffff', { taper: 0.9, base: 0.9, ow: 0 });
  p.ink([[14, 70], [32, 40], [58, 20], [74, 14]], { w: 1.2, color: '#d8d8d8', passes: 1 });
  return p;
}

// ---------- 符紋（20 種，畫在黃符紙上，所以用深色墨線 + 彩鉛） ----------

const G = 40; // 畫布 40×50
const glyphs = {
  sword: (p, x, y) => { p.shape([[x - 3.5, y + 8], [x - 3.5, y - 18], [x, y - 24], [x + 3.5, y - 18], [x + 3.5, y + 8]], '#8ab8d8', { gap: 2, ow: 2 }); p.ink([[x - 11, y + 9], [x + 11, y + 9]], { w: 3 }); p.ink([[x, y + 11], [x, y + 20]], { w: 3.4, color: WOOD }); p.ink([[x, y + 20], [x - 5, y + 26]], { w: 1.6, color: ZHU, passes: 1 }); },
  bolt: (p, x, y) => { p.ink(spiral(x - 11, y - 15, 6, 1.2, 1), { w: 1.6, color: '#6a4fa8', passes: 1 }); p.ink(spiral(x + 11, y + 16, 5, 1.2, -1), { w: 1.6, color: '#6a4fa8', passes: 1 }); bolt(p, x, y, 0.7, '#e8b030', 2); },
  fan: (p, x, y) => { for (const k of [-1, 0, 1]) p.shape([[x + k * 10 - 4, y + 18], [x + k * 13 - 6, y - 4], [x + k * 9, y - 22], [x + k * 13 + 2, y - 4], [x + k * 10 + 2, y + 18]], '#6ac070', { gap: 2, ow: 1.8 }); },
  flame: (p, x, y) => flame(p, x, y, 0.7, '#e8622e', '#e8b33c', 2),
  frost: (p, x, y) => { for (const a of [0, 1.047, 2.094]) { const c = Math.cos(a), s = Math.sin(a), L = 19; p.ink([[x - s * L, y - c * L], [x + s * L, y + c * L]], { w: 2.4, color: '#2f64a8' }); for (const d of [-1, 1]) { const bx = x + s * L * 0.6 * d, by = y + c * L * 0.6 * d, b2 = Math.atan2(-c * d, -s * d); for (const t of [0.7, -0.7]) p.ink([[bx, by], [bx + Math.cos(b2 + t) * 6, by + Math.sin(b2 + t) * 6]], { w: 1.7, color: '#2f64a8', passes: 1 }); } } },
  // 焚天：三足火盆上沖起三道細長火舌、火星四濺——和烈焰符（一團圓胖的火）分開。
  pyre: (p, x, y) => {
    for (const [dx, h, c] of [[-8, 16, '#d8402a'], [8, 14, '#d8402a'], [0, 22, '#f06a2a']]) {
      p.shape([[x + dx - 5, y + 8], [x + dx - 4, y - h * 0.4], [x + dx, y - h], [x + dx + 4, y - h * 0.4], [x + dx + 5, y + 8]], c, { gap: 2, base: 0.6, ow: 1.8 });
    }
    for (const [dx, dy] of [[-15, -6], [15, -9], [-13, -15], [14, -18]]) p.dot(x + dx, y + dy, 1.6, '#e8622e');
    p.shape([[x - 15, y + 6], [x + 15, y + 6], [x + 11, y + 15], [x - 11, y + 15]], '#7a5a3a', { gap: 2, base: 0.7, ow: 2, sharp: true });
    for (const k of [-1, 0, 1]) p.ink([[x + k * 8, y + 15], [x + k * 11, y + 23]], { w: 2.2 });
  },
  pierce: (p, x, y) => { p.ink([[x - 14, y + 18], [x + 12, y - 16]], { w: 2.6, color: WOOD }); p.shape([[x + 8, y - 12], [x + 18, y - 24], [x + 15, y - 10]], '#a8b8ff', { base: 0.6, ow: 1.8 }); for (const k of [-1, 1]) p.ink([[x - 14, y + 18], [x - 16 + k * 4, y + 10 + k * 4]], { w: 1.8, color: ZHU, passes: 1 }); p.ink(ellipsePts(x, y + 2, 12, 5, 12, 0.05), { w: 1.4, color: GRAPH, passes: 1, closed: true }); },
  fortune: (p, x, y) => { p.solid(x, y, 17, 17, '#f0c040', { ow: 2.2, tint: '#d8a020', op: 0.3 }); p.shape([[x - 5, y - 5], [x + 5, y - 5], [x + 5, y + 5], [x - 5, y + 5]], null, { paint: FU, ow: 1.8, sharp: true }); for (const [dx, dy] of [[0, -11], [0, 11], [-11, 0], [11, 0]]) p.dot(x + dx, y + dy, 1.4, '#8a5a10'); },
  // 追魂：被鎖鏈勾住的小鬼魂。圓頭、波浪下擺——輪廓刻意和火焰（尖頂）分開，牌面縮小後一眼不會認錯。
  soul: (p, x, y) => {
    const g = [[x - 11, y + 18], [x - 13, y + 4], [x - 10, y - 7], [x - 2, y - 12], [x + 6, y - 10], [x + 12, y - 2], [x + 12, y + 18], [x + 8, y + 14], [x + 4, y + 20], [x, y + 14], [x - 4, y + 20], [x - 8, y + 14]];
    p.shape(g, '#c8b8e8', { gap: 2, base: 0.55, ow: 2 });
    p.dot(x - 5, y, 2); p.dot(x + 4, y, 2);
    p.ink([[x - 2, y + 7], [x, y + 9], [x + 2, y + 7]], { w: 1.2, passes: 1 });
    // 鎖鏈：三個環從右上斜下來，末端一個鉤子勾住鬼魂頭頂
    for (const [cx, cy] of [[x + 15, y - 20], [x + 11, y - 16.5], [x + 7, y - 13]]) p.ink(ellipsePts(cx, cy, 3, 2, 10, 0.02, 0.75), { w: 1.8, color: '#3a3440', passes: 1, closed: true });
    p.ink([[x + 5, y - 11], [x + 1, y - 9], [x - 3, y - 11], [x - 3, y - 15]], { w: 2.2, color: '#3a3440', passes: 1 });
  },
  breaker: (p, x, y) => { p.ink([[x - 4, y + 22], [x + 4, y - 18]], { w: 3, color: WOOD }); p.shape([[x + 2, y - 10], [x + 18, y - 22], [x + 18, y + 2], [x + 4, y - 2]], '#c7d6e0', { gap: 2, ow: 2, sharp: true }); p.ink([[x - 6, y - 14], [x + 14, y - 2]], { w: 1.6, color: ZHU, passes: 1 }); },
  abyss: (p, x, y) => { p.blob(x, y, 17, 17, '#4a3a8a', { base: 0.6, gap: 2, ow: 2 }); p.ink(spiral(x, y, 14, 1.6, 1), { w: 1.8, color: '#e8e0ff', passes: 1 }); },
  spirit: (p, x, y) => { for (const [dx, dy] of [[0, -18], [0, 18], [-18, 0], [18, 0]]) p.ink([[x + dx * 0.55, y + dy * 0.55], [x + dx, y + dy]], { w: 2, color: '#2f8462', passes: 1 }); for (const k of [-1, 1]) p.shape([[x, y + 8], [x + k * 12, y - 2], [x + k * 4, y - 12], [x, y - 4]], '#9fe8d8', { gap: 2, ow: 1.8 }); p.shape([[x, y + 8], [x - 5, y - 6], [x, y - 16], [x + 5, y - 6]], '#79c0a0', { gap: 2, ow: 1.8 }); },
  gale: (p, x, y) => { p.ink(spiral(x - 2, y - 4, 14, 1.3, 1, Math.PI), { w: 2.2, color: '#2f8462' }); p.ink([[x - 18, y - 4], [x - 19, y + 8], [x - 8, y + 15], [x + 10, y + 14], [x + 19, y + 6]], { w: 2, color: '#2f8462' }); p.ink([[x - 12, y + 22], [x + 4, y + 23], [x + 16, y + 19]], { w: 1.6, color: '#2f8462', passes: 1 }); },
  tempest: (p, x, y) => { ruyi(p, x - 4, y - 12, 0.38, '#d0b0ff', { tail: 0, ow: 1.4 }); bolt(p, x - 6, y + 10, 0.42, '#e8b030', 1.6); bolt(p, x + 9, y + 12, 0.36, '#e8b030', 1.6); },
  bastion: (p, x, y) => { p.shape([[x - 18, y + 8], [x - 8, y - 16], [x - 2, y - 6], [x + 6, y - 20], [x + 18, y + 8]], '#a89870', { gap: 2.2, ow: 2 }); for (let i = 0; i < 2; i++) p.ink([[x - 18, y + 14 + i * 6], [x - 8, y + 11 + i * 6], [x + 4, y + 15 + i * 6], [x + 18, y + 12 + i * 6]], { w: 1.6, color: '#2f64a8', passes: 1 }); },
  taiyi: (p, x, y) => { p.solid(x, y, 17, 17, '#fbf3e6', { ow: 2.2 }); const d = `M${x},${y - 17} A17,17 0 0 1 ${x},${y + 17} A8.5,8.5 0 0 1 ${x},${y} A8.5,8.5 0 0 0 ${x},${y - 17}Z`; p.add(`<path d="${d}" fill="${INK}" opacity=".85" filter="url(#wob)"/>`); p.dot(x, y - 8.5, 2.6, '#fbf3e6'); p.dot(x, y + 8.5, 2.6, INK); },
  slayer: (p, x, y) => { for (const k of [-1, 1]) { p.ink([[x - 16 * k, y + 18], [x + 14 * k, y - 18]], { w: 2.4, color: '#a8b8c8' }); p.ink([[x - 10 * k - 4, y + 8], [x - 10 * k + 4, y + 16]], { w: 2.4 }); } p.dot(x, y, 3, ZHU); },
  myriad: (p, x, y) => { for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + (i - 2) * 0.32; p.ink([[x, y + 18], [x + Math.cos(a) * 26, y + 18 + Math.sin(a) * 30]], { w: 2, color: '#6a98c8', passes: 1 }); p.dot(x + Math.cos(a) * 26, y + 18 + Math.sin(a) * 30, 1.6); } p.ink([[x - 8, y + 18], [x + 8, y + 18]], { w: 2.6 }); },
  grand: (p, x, y) => { p.ink(ellipsePts(x, y, 18, 18, 22, 0.01), { w: 1.8, color: '#8a6ab0', passes: 1, closed: true }); for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; const cx = x + Math.cos(a) * 13, cy = y + Math.sin(a) * 13; p.ink([[cx - Math.sin(a) * 3, cy + Math.cos(a) * 3], [cx + Math.sin(a) * 3, cy - Math.cos(a) * 3]], { w: 1.6, passes: 1 }); } p.dot(x, y, 3, '#8a6ab0'); },
  seal: (p, x, y) => { pagoda(p, x, y + 20, 0.42, [[38, 22], [30, 18], [22, 15]]); },
};
export const GLYPH_NAMES = Object.keys(glyphs);

export function glyph(name) {
  const p = new Pic(G, 50);
  glyphs[name](p, 20, 26);
  return p;
}

// ---------- 介面圖示（40×40） ----------
const icons = {
  cave: (p) => { p.shape([[2, 36], [10, 14], [20, 6], [30, 12], [38, 36]], '#a89870', { gap: 2.2, ow: 2 }); p.shape([[13, 36], [14, 24], [20, 19], [26, 24], [27, 36]], null, { paint: '#3a2a24', ow: 1.8 }); p.dot(20, 30, 2, '#e8b33c'); },
  help: (p) => { p.shape([[6, 6], [34, 6], [34, 34], [6, 34]], FU, { base: 0.8, gap: 2.4, ow: 2, sharp: true }); p.text(20, 29, '？', { size: 22, color: ZHU }); },
  music: (p) => { p.shape([[4, 26], [36, 14], [37, 20], [5, 32]], '#a8744a', { gap: 2.2, ow: 2, sharp: true }); for (let i = 0; i < 4; i++) p.ink([[6, 27 + i * 1.2 - 2], [35, 15 + i * 1.2]], { w: 0.8, color: '#3a2a24', passes: 1 }); p.ink([[24, 6], [24, 14], [30, 12]], { w: 1.6, color: ZHU, passes: 1 }); },
  rank: (p) => { p.shape([[10, 4], [30, 4], [30, 30], [20, 36], [10, 30]], '#79c09a', { gap: 2.2, ow: 2, sharp: true }); p.ink([[15, 14], [25, 14]], { w: 1.6, passes: 1 }); p.ink([[15, 20], [25, 20]], { w: 1.6, passes: 1 }); p.dot(20, 9, 2, ZHU); },
  record: (p) => { p.shape([[6, 6], [34, 6], [34, 34], [6, 34]], '#5a7aa8', { gap: 2.2, ow: 2, sharp: true }); p.ink([[11, 6], [11, 34]], { w: 1.4, passes: 1 }); p.shape([[18, 10], [30, 10], [30, 24], [18, 24]], null, { paint: '#f3ead6', ow: 1.4, sharp: true }); },
  save: (p) => { for (let i = 0; i < 4; i++) p.shape([[7 + i * 7, 6], [12 + i * 7, 6], [12 + i * 7, 34], [7 + i * 7, 34]], '#7fd0a8', { gap: 2, ow: 1.6, sharp: true }); p.ink([[4, 14], [36, 14]], { w: 1.2, color: ZHU, passes: 1 }); p.ink([[4, 26], [36, 26]], { w: 1.2, color: ZHU, passes: 1 }); },
  scroll: (p) => { p.shape([[8, 8], [32, 8], [32, 32], [8, 32]], '#f3ead6', { base: 0.6, gap: 3, ow: 1.8, sharp: true }); for (const x of [6, 34]) p.shape([[x - 3, 4], [x + 3, 4], [x + 3, 36], [x - 3, 36]], WOOD, { base: 0.7, ow: 1.6, sharp: true }); for (let i = 0; i < 3; i++) p.ink([[13, 14 + i * 6], [27, 14 + i * 6]], { w: 1.2, color: ZHU, passes: 1 }); },
  sect: (p) => { for (const x of [9, 31]) p.shape([[x - 3, 36], [x + 3, 36], [x + 3, 16], [x - 3, 16]], ZHU, { base: 0.6, ow: 1.6, sharp: true }); eaveRoof(p, 20, 16, 30, 12, '#3e4a52', { ow: 1.8 }); p.shape([[14, 18], [26, 18], [26, 24], [14, 24]], C.gold, { base: 0.7, ow: 1.4, sharp: true }); },
  trial: (p) => { for (const k of [-1, 1]) { p.ink([[20 - 14 * k, 34], [20 + 12 * k, 6]], { w: 2.4, color: '#8aa8c0' }); p.ink([[20 - 11 * k - 4, 26], [20 - 11 * k + 4, 30]], { w: 2.2 }); } p.dot(20, 20, 2.4, ZHU); },
};
export const ICON_LIST = Object.keys(icons);
export function icon(name) {
  const p = new Pic(40, 40);
  icons[name](p);
  return p;
}

// ---------- 載入畫面：山門 ----------

/**
 * 一扇大門（左扇；右扇是鏡射）。270×820：朱漆木板、門框、九排門釘、鋪首銅環。
 * x 從外緣（0）到門縫（270），銅環靠門縫那一側。
 */
export function door() {
  const w = 270, h = 820;
  const p = new Pic(w, h, { vivid: true });
  // 門板
  p.shape([[4, 0], [w, 0], [w, h], [4, h]], '#b8382c', { gap: 3.2, base: 0.62, sharp: true, ow: 3.4, angle: -1.35 });
  // 木紋
  for (let x = 40; x < w; x += 46) p.pencil([[x + J(2), 6], [x + J(3), h - 6]], { w: 1.4, op: 0.45, color: '#5a1a14' });
  // 內框（上下兩塊裙板）
  for (const [y0, y1] of [[40, 470], [520, 780]]) {
    p.shape([[30, y0], [w - 26, y0], [w - 26, y1], [30, y1]], null, { sharp: true, ow: 2, oc: '#5a1a14', passes: 1 });
  }
  // 門釘：九排五列
  for (let r = 0; r < 9; r++) for (let c = 0; c < 5; c++) {
    const x = 56 + c * 42, y = 70 + r * 46;
    p.solid(x, y, 7, 7, '#e8b33c', { ow: 1.6 });
    p.dot(x - 2, y - 2, 1.6, '#fff3c0');
  }
  // 鋪首銅環（靠門縫）
  const kx = w - 56, ky = 470;
  p.solid(kx, ky, 34, 32, '#d8a030', { ow: 2.6 });
  for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; p.ink([[kx + Math.cos(a) * 26, ky + Math.sin(a) * 25], [kx + Math.cos(a) * 33, ky + Math.sin(a) * 31]], { w: 1.4, color: '#8a6420', passes: 1 }); }
  eyes(p, kx, ky - 6, 10, 1.3, 'angry');
  p.ink([[kx - 9, ky + 10], [kx, ky + 16], [kx + 9, ky + 10]], { w: 2, passes: 1 });
  p.ink(ellipsePts(kx, ky + 42, 24, 24, 24, 0.02), { w: 5, color: '#8a6420', closed: true });
  p.ink(ellipsePts(kx, ky + 42, 24, 24, 24, 0.02), { w: 1.6, color: '#f0d070', passes: 1, closed: true });
  // 門縫那一側的立邊
  p.shape([[w - 10, 0], [w, 0], [w, h], [w - 10, h]], '#7a2018', { base: 0.7, gap: 2.4, ow: 2, sharp: true });
  return p;
}

/** 簡化版的眼睛（鋪首用），避免從 chars 循環匯入。 */
function eyes(p, x, y, gap, s, style) {
  for (const k of [-1, 1]) {
    p.dot(x + k * gap, y, 2.6 * s);
    if (style === 'angry') p.ink([[x + k * (gap + 6), y - 6], [x + k * (gap - 3), y - 3]], { w: 1.8, passes: 1 });
  }
}

/** 門楣：屋簷、橫樑、「山門」金字匾額。540×220。 */
export function gateLintel() {
  const p = new Pic(540, 220, { vivid: true });
  p.shape([[0, 150], [540, 150], [540, 196], [0, 196]], '#8a2a20', { gap: 2.6, base: 0.6, sharp: true, ow: 3 });
  for (let x = 30; x < 540; x += 60) p.shape([[x - 12, 156], [x + 12, 156], [x + 12, 190], [x - 12, 190]], '#3e6a5a', { base: 0.55, gap: 2.4, ow: 1.6, sharp: true });
  eaveRoof(p, 270, 150, 470, 74, '#3e4a52');
  p.shape([[190, 112], [350, 112], [350, 206], [190, 206]], WOOD, { base: 0.75, gap: 2.6, ow: 3, sharp: true });
  p.shape([[200, 122], [340, 122], [340, 196], [200, 196]], '#7a2a22', { base: 0.8, gap: 2.6, ow: 1.8, sharp: true });
  p.letter(237, 178, '山', '#f3c84a', { size: 50, fillOp: 0.95, stroke: 4 });
  p.letter(303, 178, '門', '#f3c84a', { size: 50, fillOp: 0.95, stroke: 4 });
  return p;
}

// ---------- 主畫面主視覺 ----------

/** 主畫面遠景：宣紙 + 月 + 柱峰 + 主峰寶塔 + 瀑布 + 雲海。540×960。 */
export function titleKey() {
  const p = new Pic(GW, GH);
  xuanPaper(p);
  moon(p, 420, 330, 58);
  peak(p, 70, 560, 70, 230, { op: 0.4, pine: false }); peak(p, 140, 580, 56, 170, { op: 0.35, pine: false });
  peak(p, 470, 570, 80, 250, { op: 0.4, pine: false }); peak(p, 400, 590, 50, 150, { op: 0.35, pine: false });
  peak(p, 300, 620, 120, 250, { op: 0.75, pine: false, fill: '#a9a294' });
  pagoda(p, 300, 372, 1.0);
  for (let i = 0; i < 4; i++) p.pencil([[352 + i * 3, 400], [354 + i * 3, 500 + i * 6]], { color: '#7fa6c8', op: 0.7, w: 1.4 });
  peak(p, 205, 600, 70, 190, { op: 0.65 });
  ruyi(p, 90, 470, 1.1); ruyi(p, 420, 430, 0.9, '#e8dcef'); ruyi(p, 300, 560, 1.4); ruyi(p, 110, 590, 1.2, '#e8dcef', { tail: 0 }); ruyi(p, 440, 600, 1.1, undefined, { tail: 0 });
  return p;
}

/** 匾額標題：木框紅底金字 + 仙俠朱印。440×140。 */
export function titleLogo() {
  const p = new Pic(450, 150);
  p.shape([[10, 16], [430, 16], [436, 136], [4, 136]], WOOD, { base: 0.6, gap: 3, ow: 3.4, sharp: true });
  p.shape([[26, 30], [414, 30], [418, 122], [22, 122]], '#7a2a22', { base: 0.75, gap: 3, ow: 2, sharp: true });
  ['問', '道', '飛', '升'].forEach((ch, i) => p.letter(76 + i * 96, 104, ch, '#f3c84a', { size: 74, fillOp: 0.9 }));
  p.add(`<rect x="404" y="106" width="40" height="40" fill="${ZHU}" filter="url(#wob)" opacity=".92"/>`);
  p.text(424, 124, '仙', { size: 16, color: '#fbeedd' });
  p.text(424, 141, '俠', { size: 16, color: '#fbeedd' });
  return p;
}

export function titleHero() {
  const p = new Pic(200, 150);
  heroXian(p, 100, 132, 1.05, '#7fb0dc');
  return p;
}

export function titleSword() {
  const p = new Pic(220, 60);
  flySword(p, 70, 30, 190, 40, 1);
  return p;
}

export function titleCrane(frame) {
  const p = new Pic(90, 60);
  crane(p, 45, 36, 0.9, -1, frame);
  return p;
}

export { seedRng };
