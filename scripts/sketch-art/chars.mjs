/**
 * 角色：門人、小妖、首領。全部是正面（朝玩家走來），Q 版約三頭身。
 *
 * 每個畫法簽名都是 (p, x, y, f)：x 是中心、y 是腳底、f 是第幾幀（0–3）。
 * 0、1 是 A 步、2、3 是 B 步；奇數幀整隻往上彈一點。每幀換一個亂數種子，
 * 線條會輕微「沸騰」——手繪動畫的那種抖動，比每幀一模一樣更活。
 */
import { C, FU, HAIR, INK, J, R, SKIN, STYLE, WOOD, aside, ZHU, crane as craneBird, ellipsePts, smooth, flame, ribbon, spiral, bolt } from './lib.mjs';

export const step = (f) => (f >= 2 ? 1 : 0);
export const bob = (f) => (f % 2 ? -2 : 0);

/** 兩條小短腿，抬起的那隻離地。 */
export function legs(p, x, y, dx, len, f, { w = 2.6, color = INK, foot = 4 } = {}) {
  const ph = step(f);
  for (const k of [-1, 1]) {
    const lift = (k < 0) === (ph === 0) ? 3 : 0;
    const top = y - len;
    const fx = x + k * dx;
    p.ink([[fx - k * 1, top], [fx, y - lift - 1], [fx + k * foot, y - lift]], { w, color });
  }
}

/** 眼睛。style：dot 圓點、angry 怒眉、glow 發光（有色瞳）、closed 閉眼、hollow 空洞。 */
export function eyes(p, x, y, gap, s = 1, style = 'dot', color = '#c43a2a') {
  for (const k of [-1, 1]) {
    const ex = x + k * gap;
    if (style === 'closed') p.ink([[ex - 3 * s, y], [ex, y + 2 * s], [ex + 3 * s, y]], { w: 1.6, passes: 1 });
    else if (style === 'hollow') {
      p.solid(ex, y, 4.5 * s, 5 * s, INK, { ow: 1.2 });
      p.dot(ex + 1, y - 1, 1.2 * s, color);
    } else if (style === 'glow') {
      p.solid(ex, y, 4 * s, 3.6 * s, '#fff6c8', { ow: 1.6 });
      p.dot(ex, y + 0.3, 2.2 * s, color);
    } else if (STYLE === 'marker') {
      // 亮晶晶的眼睛：黑眼珠 + 兩顆白光點
      p.dot(ex, y, 2.8 * s);
      aside(() => {
        p.dot(ex + 0.9 * s, y - 1 * s, 0.9 * s, '#ffffff');
        p.dot(ex - 0.9 * s, y + 0.9 * s, 0.45 * s, '#ffffff');
      });
    } else p.dot(ex, y, 2.3 * s);
    if (style === 'angry' || style === 'glow') p.ink([[x + k * (gap + 5 * s), y - 6 * s], [x + k * (gap - 3 * s), y - 3.5 * s]], { w: 2, passes: 1 });
  }
}

export function blush(p, x, y, gap, s = 1) {
  for (const k of [-1, 1]) p.add(`<ellipse cx="${x + k * gap}" cy="${y}" rx="${3 * s}" ry="${1.7 * s}" fill="${C.pink}" opacity=".7"/>`);
}

/**
 * Q 版人形。y 是腳底；頭在 y-62*s 附近。
 * o：robe 外袍色、inner 內襯、sash 腰帶、hair、skin、hat（函式）、face 眼睛樣式、
 *    sleeves 寬袖、armor 胸甲色、cape 披風色、weaponR / weaponL（函式，在身前畫）。
 */
export function human(p, x, y, f, s = 1, o = {}) {
  const ls0 = p.ls;
  p.ls = ls0 * Math.sqrt(s);
  const b = bob(f);
  y += b;
  const S = (a) => a.map(([u, v]) => [x + u * s, y + v * s]);
  const robe = o.robe ?? C.blue;
  if (o.behind) o.behind(p, x, y, s);
  if (o.cape) p.shape(S([[-14, -50], [-26, -10], [-20, -2], [20, -2], [26, -10], [14, -50]]), o.cape, { gap: 2.6, base: 0.45 });
  if (o.longHair) p.shape(S([[-13, -76], [-16, -58], [-14, -40], [0, -36], [14, -40], [16, -58], [13, -76]]), o.hair ?? HAIR, { base: 0.85, gap: 2.4, ow: 2 });
  legs(p, x, y - b, 6 * s, 10 * s, f, { w: 2.6, color: o.legColor ?? INK });
  // 袍身
  const body = S([[-11, -48], [-17, -30], [-19, -12], [-21, -6], [0, -4], [21, -6], [19, -12], [17, -30], [11, -48]]);
  p.shape(body, robe, { gap: 2.6, base: 0.42, paint: o.robePaint ?? null });
  if (o.inner) p.hatch(S([[-5, -47], [5, -47], [3, -6], [-3, -6]]), o.inner, { gap: 2.4, base: 0.5 });
  p.ink(S([[-7, -47], [0, -38], [7, -47]]), { w: 1.6, passes: 1 });
  if (o.armor) {
    p.shape(S([[-13, -46], [13, -46], [14, -30], [0, -26], [-14, -30]]), o.armor, { gap: 2.2, base: 0.55, ow: 2 });
    p.ink(S([[-10, -38], [10, -38]]), { w: 1.2, passes: 1 });
  }
  const sash = o.sash ?? ZHU;
  if (sash) p.shape(S([[-16, -28], [16, -28], [16, -24], [-16, -24]]), sash, { base: 0.6, ow: 1.6, sharp: true });
  // 袖子
  for (const k of [-1, 1]) {
    if (o.sleeves === false) {
      p.shape(S([[k * 10, -46], [k * 18, -40], [k * 20, -26], [k * 15, -24], [k * 12, -36]]), robe, { gap: 2.6, base: 0.42, ow: 2 });
      p.solid(x + k * 18 * s, y - 22 * s, 3.4 * s, 3.4 * s, o.skin ?? SKIN, { ow: 1.4 });
    } else {
      p.shape(S([[k * 10, -46], [k * 21, -38], [k * 26, -22], [k * 23, -15], [k * 16, -18], [k * 13, -32]]), robe, { gap: 2.6, base: 0.44, ow: 2.2 });
      p.ink(S([[k * 16, -18], [k * 20, -20], [k * 23, -15]]), { w: 1.2, passes: 1 });
    }
  }
  if (o.weaponR) o.weaponR(p, x + 22 * s, y - 20 * s, s);
  if (o.weaponL) o.weaponL(p, x - 22 * s, y - 20 * s, s);
  // 頭
  const headY = y - 62 * s;
  // 臉：乾淨的圓（不加抖動），描線也幾乎不抖——五官在這裡面，臉型一歪就整張怪
  const face = ellipsePts(x, headY, 13 * s, 13.2 * s, 28, 0, 0);
  p.add(`<path d="${smooth(face, true)}" fill="${o.skin ?? SKIN}"/>`);
  p.ink(face, { closed: true, w: 2.2, amp: 0.12, passes: 2 });
  if (o.hairStyle !== 'none') {
    // 瀏海：圓弧往兩側垂下，不做中間的尖角
    p.shape(S([[-13.2, -61], [-13, -70], [-8, -76], [0, -77.5], [8, -76], [13, -70], [13.2, -61], [10.5, -67], [5, -70], [0, -70.6], [-5, -70], [-10.5, -67]]), o.hair ?? HAIR, { base: 0.9, gap: 2, ow: 1.8, amp: 0.3 });
    if (STYLE === 'marker') aside(() => {
      // 塗鴉捲髮：沿髮際畫幾個小圈圈
      for (let i = 0; i < 5; i++) {
        const u = -10 + i * 5, v = -74 + Math.abs(u) * 0.1;
        p.ink(spiral(x + u * s, y + v * s, 2.4 * s, 1.1, i % 2 ? 1 : -1, R() * 6), { w: 1.1, passes: 1, amp: 0.2 });
      }
    });
  }
  if (o.hat) o.hat(p, x, headY, s);
  else if (o.hairStyle !== 'none') p.solid(x, headY - 17 * s, 5.5 * s, 4.5 * s, o.hair ?? HAIR, { ow: 1.6 });
  if (o.mask) o.mask(p, x, headY, s);
  else {
    eyes(p, x, headY + 1 * s, 5 * s, s, o.face ?? 'dot', o.eyeColor);
    if (o.face !== 'angry' && o.face !== 'glow' && o.blush !== false) blush(p, x, headY + 6 * s, 8 * s, s);
    if (o.mouth !== false) p.ink([[x - 2.2 * s, headY + 7 * s], [x, headY + 8.6 * s], [x + 2.2 * s, headY + 7 * s]], { w: 1.4, passes: 1, amp: 0.05 });
  }
  if (o.front) o.front(p, x, y, s);
  p.ls = ls0;
}

/** 四足獸正面：圓身、兩隻前腳、尾巴從身後露出。 */
export function beastFront(p, x, y, f, s, o) {
  const ls0 = p.ls;
  p.ls = ls0 * Math.sqrt(s);
  const b = bob(f);
  const body = o.body ?? C.gray;
  if (o.tail) o.tail(p, x, y + b, s);
  // 後腿（短、在身後）
  legs(p, x, y, 15 * s, 8 * s, f + 2, { w: 3 });
  legs(p, x, y, 8 * s, 12 * s, f, { w: 3.2, foot: 3 * s });
  y += b;
  const S = (a) => a.map(([u, v]) => [x + u * s, y + v * s]);
  p.shape(S([[-24, -8], [-26, -26], [-18, -38], [0, -42], [18, -38], [26, -26], [24, -8], [0, -4]]), body, { gap: 2.7, base: 0.42 });
  if (o.belly) p.solid(x, y - 18 * s, 11 * s, 10 * s, o.belly, { ow: 1.6, tint: body, op: 0.15 });
  const hy = y - 46 * s;
  if (o.ears) o.ears(p, x, hy, s);
  if (o.mane) o.mane(p, x, hy, s);
  p.shape(S([[-17, -40], [-19, -52], [-12, -60], [12, -60], [19, -52], [17, -40], [0, -34]]), o.head ?? body, { gap: 2.6, base: 0.45 });
  if (o.muzzle !== false) {
    p.solid(x, hy + 6 * s, 8 * s, 5.5 * s, o.muzzle ?? C.cream, { ow: 1.6 });
    p.dot(x, hy + 3.5 * s, 2 * s);
  }
  eyes(p, x, hy - 3 * s, 6.5 * s, s, o.face ?? 'angry', o.eyeColor ?? '#c43a2a');
  if (o.front) o.front(p, x, y, s);
  p.ls = ls0;
}

const pointyEars = (color, inner = C.pink) => (p, x, hy, s) => {
  for (const k of [-1, 1]) {
    p.shape([[x + k * 8 * s, hy - 10 * s], [x + k * 17 * s, hy - 26 * s], [x + k * 18 * s, hy - 8 * s]], color, { gap: 2.4, base: 0.45, ow: 2.2 });
    p.hatch([[x + k * 11 * s, hy - 11 * s], [x + k * 16 * s, hy - 21 * s], [x + k * 16 * s, hy - 10 * s]], inner, { gap: 2, base: 0.5 });
  }
};
const roundEars = (color) => (p, x, hy, s) => {
  for (const k of [-1, 1]) p.blob(x + k * 15 * s, hy - 12 * s, 6 * s, 6 * s, color, { gap: 2.4, ow: 2 });
};

// ---------- 小妖 ----------

export const MOBS = {
  wolf: { w: 96, h: 92, draw: (p, x, y, f) => beastFront(p, x, y, f, 1, {
    body: '#7c8696', ears: pointyEars('#7c8696'),
    tail: (p, x, y, s) => p.shape([[x + 18, y - 22], [x + 40, y - 40], [x + 44, y - 28], [x + 24, y - 12]], '#7c8696', { gap: 2.6, ow: 2.4 }),
  }) },
  bear: { w: 104, h: 96, draw: (p, x, y, f) => beastFront(p, x, y, f, 1.12, {
    body: '#7a5a42', ears: roundEars('#7a5a42'), muzzle: '#d8c0a0', belly: '#c8a882', face: 'angry',
  }) },
  yeti: { w: 100, h: 96, draw: (p, x, y, f) => beastFront(p, x, y, f, 1.08, {
    body: '#d7e4ee', head: '#e7eff4', ears: roundEars('#d7e4ee'), muzzle: '#9fb8cc', eyeColor: '#2f64a8', face: 'glow',
    front: (p, x, y, s) => { for (const k of [-1, 1]) p.shape([[x + k * 22 * s, y - 34 * s], [x + k * 34 * s, y - 22 * s], [x + k * 30 * s, y - 12 * s], [x + k * 22 * s, y - 18 * s]], '#d7e4ee', { gap: 2.4, ow: 2.2 }); },
  }) },
  lion: { w: 104, h: 96, draw: (p, x, y, f) => beastFront(p, x, y, f, 1.05, {
    body: '#e2a24a', ears: roundEars('#e2a24a'), muzzle: '#f6e2b8', face: 'glow', eyeColor: '#c43a2a',
    mane: (p, x, hy, s) => { const pts = []; for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2, r = (i % 2 ? 22 : 28) * s; pts.push([x + Math.cos(a) * r, hy - 4 * s + Math.sin(a) * r * 0.9]); } p.shape(pts, '#c8452e', { gap: 2.4, base: 0.5 }); },
    tail: (p, x, y, s) => { p.ink([[x + 20, y - 18], [x + 38, y - 30], [x + 42, y - 44]], { w: 2.6 }); flame(p, x + 42, y - 50, 0.3, '#c8452e', null, 1.8); },
  }) },
  fox: { w: 104, h: 96, draw: (p, x, y, f) => beastFront(p, x, y, f, 0.98, {
    body: C.orange, ears: pointyEars(C.orange), muzzle: C.cream, face: 'angry', eyeColor: '#7a2a10',
    tail: (p, x, y, s) => { const c = [[x + 10, y - 16], [x + 30, y - 26], [x + 40, y - 46], [x + 36, y - 62]]; ribbon(p, c, 9, C.orange, { taper: 0.3 }); p.solid(c[3][0], c[3][1], 6, 6, C.cream, { ow: 1.6 }); },
    front: (p, x, y, s) => p.ink([[x, y - 70 * s], [x - 2, y - 66 * s], [x, y - 63 * s], [x + 2, y - 66 * s], [x, y - 70 * s]], { w: 1.4, color: ZHU, passes: 1 }),
  }) },
  raiju: { w: 104, h: 96, draw: (p, x, y, f) => beastFront(p, x, y, f, 1, {
    body: '#5d6fb8', ears: pointyEars('#5d6fb8', C.gold), muzzle: '#c8d2f0', face: 'glow', eyeColor: '#e8b33c',
    tail: (p, x, y, s) => bolt(p, x + 32, y - 40, 0.55, '#f0c040', 2),
    front: (p, x, y, s) => { for (const k of [-1, 1]) p.ink(spiral(x + k * 30, y - 58, 6, 1.2, k), { w: 1.6, color: '#e8b33c', passes: 1 }); },
  }) },
  toad: { w: 96, h: 80, draw: (p, x, y, f) => {
    const b = bob(f); legs(p, x, y, 16, 8, f, { w: 3.4, foot: 6 });
    const S = (a) => a.map(([u, v]) => [x + u, y + b + v]);
    p.shape(S([[-30, -8], [-32, -24], [-22, -36], [0, -38], [22, -36], [32, -24], [30, -8], [0, -4]]), '#7aa84a', { gap: 2.6, base: 0.45 });
    for (const [dx, dy] of [[-16, -22], [14, -16], [2, -28], [-22, -12], [20, -28]]) p.blob(x + dx, y + b + dy, 3, 2.4, '#4f7a30', { ow: 1.2, base: 0.7 });
    p.solid(x, y + b - 14, 16, 7, '#e2e8b0', { ow: 1.6 });
    for (const k of [-1, 1]) { p.solid(x + k * 13, y + b - 40, 7, 7, '#fff6c8', { ow: 2 }); p.dot(x + k * 13, y + b - 40, 3, INK); }
    p.ink(S([[-14, -26], [0, -22], [14, -26]]), { w: 2, passes: 1 });
  } },
  bat: { w: 108, h: 80, shadow: 0.16, draw: (p, x, y, f) => {
    const up = step(f) ? -8 : 6;
    y -= 14 + bob(f) * 2;
    for (const k of [-1, 1]) p.shape([[x + k * 10, y - 26], [x + k * 30, y - 34 + up], [x + k * 48, y - 26 + up], [x + k * 40, y - 18 + up * 0.5], [x + k * 32, y - 20], [x + k * 24, y - 12], [x + k * 12, y - 14]], '#5a4060', { gap: 2.4, base: 0.5 });
    p.blob(x, y - 20, 13, 14, '#6a4a70', { gap: 2.4, base: 0.5 });
    pointyEars('#6a4a70')(p, x, y - 22, 0.7);
    eyes(p, x, y - 24, 5, 1, 'glow', '#c43a2a');
    p.ink([[x - 4, y - 14], [x - 2, y - 11], [x, y - 14], [x + 2, y - 11], [x + 4, y - 14]], { w: 1.2, passes: 1 });
  } },
  crane: { w: 104, h: 100, draw: (p, x, y, f) => {
    const b = bob(f);
    p.ink([[x - 5, y - 34], [x - 6, y - 8], [x - 10, y - 2]], { w: 2 }); p.ink([[x + 5, y - 34], [x + 6, y - 8 - (step(f) ? 4 : 0)], [x + 10, y - 2 - (step(f) ? 4 : 0)]], { w: 2 });
    for (const k of [-1, 1]) {
      p.shape([[x + k * 8, y + b - 56], [x + k * 30, y + b - 70 + step(f) * 10], [x + k * 46, y + b - 60 + step(f) * 8], [x + k * 30, y + b - 44], [x + k * 12, y + b - 38]], null, { paint: '#fbf7ee', ow: 2.2 });
      p.hatch([[x + k * 46, y + b - 60 + step(f) * 8], [x + k * 34, y + b - 62 + step(f) * 8], [x + k * 30, y + b - 46], [x + k * 38, y + b - 50]], INK, { base: 0.8, gap: 2 });
    }
    p.solid(x, y + b - 46, 13, 15, '#fbf7ee', { ow: 2.4 });
    p.ink([[x, y + b - 58], [x - 3, y + b - 70], [x, y + b - 80]], { w: 3 });
    p.solid(x, y + b - 82, 6, 5.5, '#fbf7ee', { ow: 2 });
    p.dot(x, y + b - 86, 3, ZHU);
    p.shape([[x - 2, y + b - 80], [x + 2, y + b - 80], [x, y + b - 70]], C.gold, { base: 0.8, ow: 1.4 });
    eyes(p, x, y + b - 83, 3, 0.6, 'angry');
  } },
  centipede: { w: 112, h: 80, draw: (p, x, y, f) => {
    const segs = [[-36, -14], [-20, -18], [-4, -20], [12, -18], [28, -14]];
    segs.forEach(([dx, dy], i) => {
      const yy = y + dy + (i % 2 === step(f) ? -2 : 0);
      for (const k of [-1, 1]) p.ink([[x + dx, yy + 6], [x + dx + k * 4, yy + 16]], { w: 2 });
      p.blob(x + dx, yy, 10, 9, i % 2 ? '#8a3a2a' : '#a8482e', { gap: 2.4, base: 0.5 });
    });
    const hx = x + 40, hy = y - 22 + bob(f);
    p.blob(hx, hy, 12, 11, '#6a2a20', { gap: 2.2, base: 0.55 });
    for (const k of [-1, 1]) p.ink([[hx - 2, hy - 8], [hx + 4 + k * 6, hy - 20], [hx + 10 + k * 8, hy - 24]], { w: 1.6, passes: 1 });
    eyes(p, hx, hy - 2, 4, 0.8, 'glow', '#e8b33c');
    p.ink([[hx - 6, hy + 8], [hx - 2, hy + 12]], { w: 2 }); p.ink([[hx + 6, hy + 8], [hx + 2, hy + 12]], { w: 2 });
  } },
  scorpion: { w: 108, h: 92, draw: (p, x, y, f) => {
    const b = bob(f);
    for (const k of [-1, 1]) for (const i of [0, 1, 2]) p.ink([[x + k * 12, y - 14 + i * 4], [x + k * (22 + i * 4), y - 6 + i * 2 - (i % 2 === step(f) ? 3 : 0)], [x + k * (26 + i * 4), y]], { w: 2 });
    ribbon(p, [[x, y - 22], [x + 6, y - 44], [x + 2, y - 62], [x - 10, y - 70]], 6, '#c8452e', { taper: 0.4 });
    p.shape([[x - 10, y - 70], [x - 20, y - 66], [x - 12, y - 60]], '#3a1a10', { base: 0.8, ow: 2 });
    for (const k of [-1, 1]) {
      p.ink([[x + k * 14, y - 22 + b], [x + k * 28, y - 32 + b], [x + k * 32, y - 42 + b]], { w: 3 });
      p.shape([[x + k * 26, y - 42 + b], [x + k * 40, y - 52 + b], [x + k * 42, y - 40 + b], [x + k * 34, y - 46 + b], [x + k * 34, y - 36 + b]], '#c8452e', { gap: 2.2, base: 0.5, ow: 2.2 });
    }
    p.blob(x, y - 18 + b, 18, 12, '#c8452e', { gap: 2.4, base: 0.5 });
    eyes(p, x, y - 22 + b, 5, 0.8, 'glow', '#e8b33c');
  } },
  serpent: { w: 100, h: 100, draw: (p, x, y, f) => {
    const sw = step(f) ? 4 : -4;
    const c = [[x - 30, y - 6], [x - 6 + sw, y - 10], [x + 22, y - 14], [x + 20 - sw, y - 36], [x - 4, y - 46], [x + 2 + sw, y - 66]];
    ribbon(p, c, 10, '#4f8a62', { taper: 0.15 });
    for (let i = 1; i < 5; i++) p.ink([[c[i][0] - 5, c[i][1]], [c[i][0], c[i][1] + 3], [c[i][0] + 5, c[i][1]]], { w: 1.2, color: '#2f5a3a', passes: 1 });
    const hx = c[5][0], hy = c[5][1] - 4 + bob(f);
    p.blob(hx, hy, 15, 11, '#5f9a70', { gap: 2.4, base: 0.5 });
    eyes(p, hx, hy - 2, 6, 0.9, 'glow', '#e8b33c');
    p.ink([[hx, hy + 9], [hx, hy + 16], [hx - 3, hy + 20]], { w: 1.4, color: ZHU, passes: 1 }); p.ink([[hx, hy + 16], [hx + 3, hy + 20]], { w: 1.4, color: ZHU, passes: 1 });
  } },
  spider: { w: 108, h: 84, draw: (p, x, y, f) => {
    const b = bob(f);
    for (const k of [-1, 1]) for (let i = 0; i < 4; i++) {
      const lift = (i % 2 === step(f)) ? -3 : 0;
      p.ink([[x + k * 10, y - 22 + i * 3 + b], [x + k * (26 + i * 3), y - 34 + i * 6 + lift], [x + k * (34 + i * 4), y - 4 + lift]], { w: 2.2 });
    }
    p.blob(x, y - 34 + b, 18, 15, '#4a3a5a', { gap: 2.4, base: 0.55 });
    p.ink([[x, y - 44 + b], [x - 5, y - 36 + b], [x, y - 30 + b], [x + 5, y - 36 + b], [x, y - 44 + b]], { w: 1.6, color: ZHU, passes: 1 });
    p.blob(x, y - 18 + b, 11, 9, '#5a4a6a', { gap: 2.4, base: 0.55 });
    for (const [dx, dy] of [[-5, -20], [5, -20], [-2, -16], [2, -16]]) p.dot(x + dx, y + dy + b, 1.6, '#e8434f');
  } },
  wisp: { w: 84, h: 92, shadow: 0.18, draw: (p, x, y, f) => {
    const b = bob(f) * 2;
    const pts = [[x, y - 8 + b], [x - 18, y - 22 + b], [x - 17, y - 42 + b], [x - 6, y - 52 + b], [x - 8, y - 68 + b], [x + 6, y - 58 + b - step(f) * 4], [x + 12, y - 70 + b], [x + 18, y - 44 + b], [x + 17, y - 22 + b]];
    p.wash(pts.map(([a, c]) => [x + (a - x) * 1.3, y - 36 + b + (c - y + 36 - b) * 1.2]), C.teal, 0.25);
    p.shape(pts, C.teal, { gap: 2.4, base: 0.5 });
    p.shape([[x, y - 14 + b], [x - 8, y - 24 + b], [x - 6, y - 36 + b], [x + 2, y - 30 + b], [x + 8, y - 24 + b]], '#d6fff4', { base: 0.6, ow: 1.4 });
    eyes(p, x, y - 30 + b, 5, 1, 'dot');
    p.solid(x, y - 22 + b, 2.6, 3.2, INK, { ow: 0 });
  } },
  treant: { w: 100, h: 104, draw: (p, x, y, f) => {
    const b = bob(f);
    for (const k of [-1, 1]) p.ink([[x + k * 8, y - 14], [x + k * 14, y - 4 - (k < 0) * step(f) * 3], [x + k * 22, y - (k < 0) * step(f) * 3]], { w: 3.4, color: '#4a3020' });
    const S = (a) => a.map(([u, v]) => [x + u, y + b + v]);
    p.shape(S([[-16, -10], [-18, -50], [-10, -60], [10, -60], [18, -50], [16, -10]]), '#8a6a48', { gap: 2.4, base: 0.5, angle: -1.4, sharp: true });
    for (const k of [-1, 1]) p.ink(S([[k * 16, -44], [k * 30, -52], [k * 38, -46]]), { w: 3.2, color: '#4a3020' });
    for (const [dx, dy, r] of [[-22, -66, 16], [20, -68, 15], [0, -80, 18], [-30, -50, 10], [32, -52, 10]]) p.blob(x + dx, y + b + dy, r, r * 0.8, '#5f9a50', { gap: 2.4, base: 0.5 });
    eyes(p, x, y + b - 40, 6, 1, 'glow', '#e8b33c');
    p.ink(S([[-7, -28], [0, -24], [7, -28]]), { w: 2, passes: 1 });
    p.ink(S([[-12, -18], [-6, -14]]), { w: 1.2, color: '#4a3020', passes: 1 });
  } },
  golem: { w: 100, h: 100, draw: (p, x, y, f) => {
    legs(p, x, y, 10, 12, f, { w: 5, color: '#5a5650', foot: 4 });
    const b = bob(f);
    const S = (a) => a.map(([u, v]) => [x + u, y + b + v]);
    for (const k of [-1, 1]) p.shape(S([[k * 22, -50], [k * 36, -44], [k * 36, -18], [k * 26, -16], [k * 24, -36]]), C.stone, { gap: 2.6, base: 0.5, sharp: true });
    p.shape(S([[-24, -12], [-26, -52], [-14, -60], [14, -60], [26, -52], [24, -12]]), '#b8b0a0', { gap: 2.8, base: 0.5, sharp: true, cross: true });
    p.shape(S([[-12, -60], [-14, -76], [14, -76], [12, -60]]), '#c8c0b0', { gap: 2.4, base: 0.5, sharp: true });
    eyes(p, x, y + b - 68, 6, 1, 'glow', '#4fc0e8');
    p.ink(S([[-8, -44], [0, -36], [8, -44]]), { w: 1.6, color: '#3a8ab0', passes: 1 });
    p.ink(S([[0, -36], [0, -22]]), { w: 1.6, color: '#3a8ab0', passes: 1 });
    p.ink(S([[-18, -26], [-10, -20]]), { w: 1.2, passes: 1 }); p.ink(S([[14, -48], [18, -40]]), { w: 1.2, passes: 1 });
  } },
  // 人形
  bandit: { w: 88, h: 100, draw: (p, x, y, f) => human(p, x, y, f, 1, {
    robe: '#8a7058', inner: '#c8b090', sash: '#5a3a28', face: 'angry', sleeves: false,
    hat: (p, x, hy, s) => { p.shape([[x - 22, hy - 8], [x, hy - 22], [x + 22, hy - 8], [x, hy - 4]], '#c8a860', { gap: 2.4, base: 0.5, ow: 2.2 }); },
    mask: (p, x, hy, s) => { eyes(p, x, hy + 1, 5, 1, 'angry'); p.shape([[x - 12, hy + 4], [x + 12, hy + 4], [x + 10, hy + 12], [x - 10, hy + 12]], '#3a3a40', { base: 0.7, ow: 1.6 }); },
    weaponR: (p, x, y) => { p.shape([[x - 2, y + 2], [x + 2, y + 2], [x + 6, y - 30], [x + 1, y - 34], [x - 1, y - 30]], '#c7d6e0', { gap: 2, ow: 1.8, sharp: true }); p.ink([[x - 6, y + 2], [x + 6, y + 2]], { w: 2.6 }); },
  }) },
  undead: { w: 96, h: 100, draw: (p, x, y, f) => {
    // 殭屍：雙臂平舉、額貼黃符、一跳一跳
    const hop = step(f) ? -5 : 0;
    human(p, x, y + hop, 0, 1, {
      robe: '#4a5578', inner: '#e8b33c', skin: '#b9cbb0', face: 'angry', blush: false, sleeves: false, sash: '#2a2a40',
      hat: (p, x, hy, s) => { p.shape([[x - 16, hy - 6], [x + 16, hy - 6], [x + 13, hy - 12], [x + 8, hy - 20], [x - 8, hy - 20], [x - 13, hy - 12]], HAIR, { base: 0.85, gap: 2, ow: 2, sharp: true }); p.dot(x, hy - 22, 3, ZHU); },
      front: (p, x, y) => {
        for (const k of [-1, 1]) { p.shape([[x + k * 12, y - 44], [x + k * 32, y - 42], [x + k * 32, y - 34], [x + k * 14, y - 34]], '#4a5578', { gap: 2.6, base: 0.45, ow: 2.2, sharp: true }); p.solid(x + k * 35, y - 38, 4, 4, '#b9cbb0', { ow: 1.6 }); }
        p.shape([[x - 4.5, y - 76], [x + 4.5, y - 76], [x + 5.5, y - 56], [x - 5.5, y - 56]], FU, { base: 0.85, gap: 2.4, ow: 1.4, sharp: true });
        p.ink([[x, y - 74], [x - 2, y - 68], [x + 2, y - 64], [x - 1, y - 58]], { w: 1.3, color: ZHU, passes: 1 });
      },
    });
  } },
  demon: { w: 92, h: 104, draw: (p, x, y, f) => human(p, x, y, f, 1, {
    robe: '#5e2a6e', inner: '#2a1a30', sash: ZHU, face: 'glow', eyeColor: '#e8434f', skin: '#e8d8e0',
    behind: (p, x, y) => { const pts = []; for (let i = 0; i < 16; i++) { const a = Math.PI + (i / 15) * Math.PI, r = i % 2 ? 34 : 42; pts.push([x + Math.cos(a) * r, y - 40 + Math.sin(a) * r]); } pts.push([x + 30, y - 10], [x - 30, y - 10]); p.hatch(pts, '#9b3fa8', { gap: 3, base: 0.18, op: 0.5 }); },
    hat: (p, x, hy) => { for (const k of [-1, 1]) p.shape([[x + k * 6, hy - 12], [x + k * 14, hy - 26], [x + k * 12, hy - 10]], '#3a1a30', { base: 0.8, ow: 1.8 }); },
    front: (p, x, y) => p.ink([[x, y - 74], [x - 3, y - 70], [x, y - 67], [x + 3, y - 70], [x, y - 74]], { w: 1.4, color: '#e8434f', passes: 1 }),
  }) },
  celestial: { w: 92, h: 108, draw: (p, x, y, f) => human(p, x, y, f, 1, {
    robe: '#f0e6c8', inner: C.gold, armor: '#d8b850', sash: ZHU, face: 'dot', cape: '#c8372d',
    hat: (p, x, hy) => { p.shape([[x - 13, hy - 8], [x - 10, hy - 20], [x, hy - 26], [x + 10, hy - 20], [x + 13, hy - 8]], C.gold, { gap: 2.2, base: 0.55, ow: 2 }); p.ink([[x, hy - 26], [x, hy - 34]], { w: 1.6, color: ZHU, passes: 1 }); },
    weaponR: (p, x, y) => { p.ink([[x + 2, y + 18], [x + 2, y - 44]], { w: 2.6, color: WOOD }); p.shape([[x - 3, y - 44], [x + 2, y - 58], [x + 7, y - 44]], '#c7d6e0', { ow: 1.8, base: 0.6, sharp: true }); p.ink([[x - 4, y - 42], [x + 8, y - 42]], { w: 1.6, color: ZHU, passes: 1 }); },
  }) },
  skeleton: { w: 92, h: 100, draw: (p, x, y, f) => {
    const b = bob(f);
    legs(p, x, y, 6, 14, f, { w: 2.6, color: '#8a8070' });
    const S = (a) => a.map(([u, v]) => [x + u, y + b + v]);
    p.ink(S([[0, -16], [0, -46]]), { w: 3 });
    for (let i = 0; i < 3; i++) p.ink(S([[-10 + i, -40 + i * 7], [0, -36 + i * 7], [10 - i, -40 + i * 7]]), { w: 2.2 });
    p.shape(S([[-10, -18], [10, -18], [8, -12], [-8, -12]]), C.bone, { paint: C.bone, ow: 2 });
    for (const k of [-1, 1]) p.ink(S([[k * 10, -44], [k * 16, -32], [k * 20, -22]]), { w: 2.2 });
    // 鬼頭刀
    p.shape(S([[18, -20], [22, -20], [26, -56], [34, -62], [26, -64], [20, -58]]), '#c7d6e0', { gap: 2, ow: 2, sharp: true });
    p.ink(S([[14, -20], [26, -20]]), { w: 2.6 });
    p.solid(x, y + b - 60, 13, 13, C.bone, { ow: 2.2, tint: '#c9bfa8' });
    eyes(p, x, y + b - 60, 5, 1, 'hollow', '#e8434f');
    p.ink(S([[-1, -54], [0, -52], [1, -54]]), { w: 1.4, passes: 1 });
    for (const t of [-4, 0, 4]) p.ink(S([[t, -50], [t, -46]]), { w: 1.2, passes: 1 });
  } },
  puppet: { w: 88, h: 104, draw: (p, x, y, f) => {
    for (const dx of [-14, 0, 14]) p.pencil([[x + dx, 0], [x + dx * 0.8, y - 78]], { w: 1, op: 0.6 });
    human(p, x, y, f, 1, {
      robe: '#c87850', inner: '#f0d8a8', sash: '#5a3a28', face: 'hollow', eyeColor: '#2a2622', skin: '#e8c898', blush: false, mouth: false, hairStyle: 'none',
      hat: (p, x, hy) => { p.ink([[x - 13, hy], [x + 13, hy]], { w: 1.2, color: '#8a6a40', passes: 1 }); p.ink([[x, hy - 13], [x, hy + 13]], { w: 1.2, color: '#8a6a40', passes: 1 }); },
      front: (p, x, y) => { p.ink([[x - 6, y - 54], [x + 6, y - 54]], { w: 1.6, passes: 1 }); p.dot(x - 13, y - 56, 2, ZHU); p.dot(x + 13, y - 56, 2, ZHU); },
    });
  } },
  jadeguard: { w: 96, h: 112, draw: (p, x, y, f) => human(p, x, y, f, 1.08, {
    robe: '#4f9a74', inner: '#d8f0e0', armor: '#7fd0a8', sash: C.gold, face: 'glow', eyeColor: '#2f8462', cape: '#2f6a50', sleeves: false,
    hat: (p, x, hy, s) => { p.shape([[x - 14 * s, hy - 4 * s], [x - 14 * s, hy - 16 * s], [x, hy - 22 * s], [x + 14 * s, hy - 16 * s], [x + 14 * s, hy - 4 * s]], '#7fd0a8', { gap: 2.2, base: 0.55, ow: 2.2, sharp: true }); p.dot(x, hy - 14 * s, 2.6, ZHU); },
    weaponL: (p, x, y) => { p.shape([[x - 10, y - 18], [x + 6, y - 18], [x + 6, y + 6], [x - 2, y + 14], [x - 10, y + 6]], '#7fd0a8', { gap: 2.2, base: 0.55, ow: 2.2, sharp: true }); p.ink([[x - 2, y - 12], [x - 2, y + 6]], { w: 1.4, color: C.gold, passes: 1 }); },
  }) },
};

// ---------- 門人 ----------
/** 四派、三階（素袍 → 金邊披肩 → 披風頭冠靈光）。 */
const SECT = {
  sword: { robe: '#7fb0dc', inner: '#e9f0f5', sash: ZHU, weapon: 'sword' },
  body: { robe: '#d8884a', inner: '#f3e0c0', sash: '#5a3a28', weapon: 'fist' },
  talisman: { robe: '#e8c860', inner: '#fbf3d8', sash: ZHU, weapon: 'fu' },
  alchemy: { robe: '#79c09a', inner: '#e8f6ee', sash: '#a98fd8', weapon: 'gourd' },
};

export function disciple(sect, tier) {
  const o = SECT[sect];
  return (p, x, y, f) => {
    const hat = tier >= 2
      ? (p, x, hy, s) => { p.solid(x, hy - 17, 5.5, 4.5, HAIR, { ow: 1.6 }); p.shape([[x - 7, hy - 16], [x - 5, hy - 26], [x, hy - 22], [x + 5, hy - 26], [x + 7, hy - 16]], C.gold, { base: 0.6, gap: 2, ow: 1.6 }); p.ink([[x - 12, hy - 18], [x + 12, hy - 15]], { w: 1.6, color: '#7a5a2a', passes: 1 }); }
      : tier === 1
        ? (p, x, hy) => { p.solid(x, hy - 17, 5.5, 4.5, HAIR, { ow: 1.6 }); p.ink([[x - 10, hy - 18], [x + 10, hy - 15]], { w: 1.6, color: '#7a5a2a', passes: 1 }); }
        : null;
    const weapon = {
      sword: (p, x, y) => { p.shape([[x - 1.5, y + 4], [x + 1.5, y + 4], [x + 1.5, y - 34], [x, y - 39], [x - 1.5, y - 34]], '#c7d6e0', { base: 0.5, gap: 2, ow: 1.6, sharp: true }); p.ink([[x - 6, y + 4], [x + 6, y + 4]], { w: 2.4 }); p.ink([[x, y + 5], [x, y + 13]], { w: 2.6, color: WOOD }); },
      fist: (p, x, y) => { p.solid(x - 2, y + 2, 6, 6, SKIN, { ow: 2 }); p.ink([[x - 6, y - 2], [x + 2, y - 2]], { w: 1.4, color: ZHU, passes: 1 }); },
      fu: (p, x, y) => { p.shape([[x - 6, y - 14], [x + 6, y - 14], [x + 6, y + 10], [x - 6, y + 10]], FU, { base: 0.85, gap: 2.4, ow: 1.6, sharp: true }); p.ink([[x, y - 11], [x - 2, y - 4], [x + 2, y], [x - 1, y + 6]], { w: 1.3, color: ZHU, passes: 1 }); },
      gourd: (p, x, y) => { p.blob(x, y + 4, 7, 7, '#d8a040', { gap: 2, ow: 1.8 }); p.blob(x, y - 6, 4.5, 4.5, '#d8a040', { gap: 2, ow: 1.8 }); p.ink([[x - 3, y - 1], [x + 3, y - 1]], { w: 1.4, color: ZHU, passes: 1 }); },
    }[o.weapon];
    human(p, x, y, f, 1, {
      robe: o.robe, inner: o.inner, sash: o.sash, hat, longHair: tier >= 1,
      cape: tier >= 2 ? '#c8372d' : undefined,
      armor: tier === 1 ? null : null,
      weaponR: weapon,
      behind: tier >= 2 ? (p, x, y) => { p.wash(ellipsePts(x, y - 60, 26, 26, 18, 0.02), '#f6e7a0', 0.5); p.ink(ellipsePts(x, y - 62, 24, 24, 20, 0.02).concat([]), { w: 1.4, color: C.gold, passes: 1, closed: true }); } : undefined,
      front: tier >= 1 ? (p, x, y) => { p.ink([[x - 11, y - 47], [x - 17, y - 30]], { w: 1.8, color: C.gold, passes: 1 }); p.ink([[x + 11, y - 47], [x + 17, y - 30]], { w: 1.8, color: C.gold, passes: 1 }); } : undefined,
    });
  };
}

export const SECTS = Object.keys(SECT);

// 給主畫面用：御劍修士（較大、有披帛）
export function heroXian(p, x, y, s = 1, robe = '#7fb0dc') {
  const S = (a) => a.map(([u, v]) => [x + u * s, y + v * s]);
  ribbon(p, S([[-16, -52], [-32, -46], [-42, -30], [-54, -22], [-70, -24]]), 5 * s, '#f2a5b5', { ow: 1.2, passes: 1, base: 0.6, taper: 0.4 });
  ribbon(p, S([[16, -52], [30, -40], [34, -22], [46, -10], [60, -8]]), 5 * s, '#f2a5b5', { ow: 1.2, passes: 1, base: 0.6, taper: 0.4 });
  p.shape(S([[-13, -92], [-17, -72], [-15, -46], [-6, -40], [6, -40], [15, -46], [17, -72], [13, -92]]), HAIR, { base: 0.85, gap: 2.4, ow: 2 });
  p.shape(S([[-11, -58], [-20, -36], [-23, -8], [-26, 0], [-12, 2], [0, -1], [12, 2], [26, 0], [23, -8], [20, -36], [11, -58]]), '#e9f0f5', { base: 0.9, op: 0.12, gap: 5 });
  p.hatch(S([[-11, -58], [-20, -36], [-23, -8], [-26, 0], [-12, 2], [-6, -30], [-2, -54]]), robe, { gap: 2.6, base: 0.35 });
  p.hatch(S([[11, -58], [20, -36], [23, -8], [26, 0], [12, 2], [6, -30], [2, -54]]), robe, { gap: 2.6, base: 0.35 });
  p.ink(S([[-2, -56], [-6, -30], [-12, 2]]), { w: 1.8, passes: 1 });
  p.ink(S([[2, -56], [6, -30], [12, 2]]), { w: 1.8, passes: 1 });
  p.ink(S([[-8, -57], [0, -46], [8, -57]]), { w: 1.8 });
  p.shape(S([[-15, -40], [15, -40], [15, -35], [-15, -35]]), ZHU, { base: 0.6, ow: 1.8, sharp: true });
  for (const k of [-1, 1]) {
    p.shape(S([[k * 11, -56], [k * 24, -46], [k * 31, -26], [k * 28, -16], [k * 20, -18], [k * 16, -30], [k * 13, -44]]), robe, { gap: 2.6, base: 0.38 });
  }
  p.solid(x, y - 74 * s, 13 * s, 14 * s, SKIN, { ow: 2.2 });
  p.shape(S([[-13, -76], [-12, -86], [-4, -89], [6, -89], [13, -84], [13, -76], [8, -82], [0, -80], [-6, -83]]), HAIR, { base: 0.9, gap: 2, ow: 1.8 });
  p.solid(x, y - 93 * s, 6 * s, 5 * s, HAIR, { ow: 1.6 });
  p.shape(S([[-6, -94], [-4, -102], [0, -98], [4, -102], [6, -94]]), C.gold, { base: 0.6, gap: 2, ow: 1.6 });
  p.ink(S([[-12, -95], [12, -92]]), { w: 1.8, color: '#7a5a2a', passes: 1 });
  p.ink(S([[-8, -76], [-3, -75]]), { w: 1.2, passes: 1 });
  p.ink(S([[3, -75], [8, -76]]), { w: 1.2, passes: 1 });
  p.ink(S([[-8, -71], [-5, -69], [-2, -71]]), { w: 1.6, passes: 1 });
  p.ink(S([[2, -71], [5, -69], [8, -71]]), { w: 1.6, passes: 1 });
  blush(p, x, y - 66 * s, 8 * s, s);
  p.dot(x, y - 82 * s, 1.4 * s, ZHU);
}

export { craneBird };
