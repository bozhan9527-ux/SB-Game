/**
 * 手繪繪圖核心：每一筆都是 SVG path，帶抖動、雙描、彩鉛排線、鉛筆顆粒。
 *
 * 座標一律是「遊戲點」（540×960 畫面上的點），輸出時再依解析度放大成貼圖。
 * 亂數是固定種子：同一個產生器重跑，輸出一模一樣（改圖才會有 diff）。
 */

let seed = 1;
export function seedRng(n) {
  seed = (Math.abs(Math.floor(n)) % 2147483646) + 1;
}
/**
 * 在旁支亂數裡跑 fn：主亂數序列不受影響。麥克筆畫風多出來的隨機（錯位、筆觸）都包在這裡，
 * 所以兩種畫風的線稿一筆一筆完全對得上——只換筆，不換圖。
 */
export function aside(fn) {
  const saved = seed;
  seed = ((saved * 48271) % 2147483646) + 1;
  try {
    return fn();
  } finally {
    seed = saved;
  }
}
export const R = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
export const J = (a) => (R() * 2 - 1) * a;

/**
 * 畫風：pencil 彩鉛排線（原本）／marker 麥克筆＋蠟筆（白紙、單筆粗墨線、平塗淡彩略塗出界、沒有鉛筆顆粒）。
 * 預設 marker（2026-10 起）；用環境變數 SKETCH_STYLE=pencil 可算回舊畫風，或在腳本裡 setStyle()。
 */
export let STYLE = process.env.SKETCH_STYLE ?? 'marker';
export function setStyle(s) {
  STYLE = s;
}
const marker = () => STYLE === 'marker';

/** 往白色混：麥克筆的淡彩。 */
export function pastel(hex, k = 0.28) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.round(v + (255 - v) * k));
  return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
}

function luma(hex) {
  const n = parseInt((/^#([0-9a-f]{6})$/i.exec(hex) ?? [0, '888888'])[1], 16);
  return (n >> 16) * 0.3 + ((n >> 8) & 255) * 0.59 + (n & 255) * 0.11;
}
/** 往深色走一階（麥克筆疊第二層）。 */
export function shade(hex, k = 0.8) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.round(v * k));
  return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
}

export const INK = '#2a2622';
export const GRAPH = '#5d5a55';
export const ZHU = '#c8372d'; // 朱砂
export const FU = '#efd27a'; // 符紙黃
export const WOOD = '#6b3a22';
export const PAPER = '#efe6d2';
export const SKIN = '#fbf3e6';
export const HAIR = '#2f2a27';
export const C = {
  terra: '#c8663f', terraL: '#e39a72', pink: '#ee9fb4', blue: '#7fb0dc', blueD: '#2f64a8',
  jade: '#79c09a', jadeD: '#2f8462', gold: '#e8b33c', red: '#d9493a', purple: '#a98fd8', purpleD: '#5e2a6e',
  cream: '#fbf6ea', gray: '#8d96a3', orange: '#f0a050', teal: '#6fd0c0', bone: '#f3ead6', stone: '#a9a294',
};

const f1 = (v) => (Math.round(v * 10) / 10).toString();

/** Catmull-Rom 轉三次貝茲，手繪線條的骨架。 */
export function smooth(pts, closed) {
  const n = pts.length;
  if (n < 2) return '';
  const P = (i) => pts[closed ? (i + n) % n : Math.max(0, Math.min(n - 1, i))];
  let d = `M${f1(P(0)[0])},${f1(P(0)[1])}`;
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${f1(c1[0])},${f1(c1[1])} ${f1(c2[0])},${f1(c2[1])} ${f1(p2[0])},${f1(p2[1])}`;
  }
  return d + (closed ? 'Z' : '');
}

export function spiral(cx, cy, r0, turns = 1.4, dir = 1, a0 = 0) {
  const pts = [];
  for (let t = 0; t <= 1.001; t += 0.06) {
    const a = a0 + dir * t * turns * Math.PI * 2, r = r0 * (1 - t * 0.78);
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return pts;
}

export function ellipsePts(cx, cy, rx, ry, n = 18, amp = 0.05, rot = 0) {
  const pts = [], a0 = R() * 6.28;
  for (let i = 0; i < n; i++) {
    const a = a0 + (i / n) * Math.PI * 2, r = 1 + J(amp);
    const x = Math.cos(a) * rx * r, y = Math.sin(a) * ry * r;
    pts.push([cx + x * Math.cos(rot) - y * Math.sin(rot), cy + x * Math.sin(rot) + y * Math.cos(rot)]);
  }
  return pts;
}

/** 線段細分並加噪聲（直邊也要有手抖）。 */
export function jitter(pts, amp, step = 14) {
  const res = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[i + 1];
    const len = Math.hypot(x2 - x1, y2 - y1), k = Math.max(1, Math.round(len / step));
    for (let j = 0; j < k; j++) {
      const t = j / k;
      res.push([x1 + (x2 - x1) * t + J(amp), y1 + (y2 - y1) * t + J(amp)]);
    }
  }
  const l = pts[pts.length - 1];
  res.push([l[0] + J(amp), l[1] + J(amp)]);
  return res;
}

let uid = 0;

export class Pic {
  constructor(w, h, { lineScale = 1, vivid = false } = {}) {
    this.w = w;
    this.h = h;
    this.defs = [];
    this.out = [];
    /** 線寬倍率：小圖（圖示、遠景小人）線要細一點，不然糊成一團。 */
    this.ls = lineScale;
    /** 角色用：彩鉛底色塗得比較飽，在紙上才不會灰灰髒髒的（場景與紙面維持淡彩）。 */
    this.vivid = vivid;
    this.filters = new Map();
  }
  /** 鉛筆顆粒濾鏡，範圍限定在 (x0,y0)–(x1,y1)。同一個範圍共用一個濾鏡。 */
  grain(x0, y0, x1, y1) {
    if (marker()) return null;
    const r = (v) => Math.round(v);
    x0 = Math.max(0, r(x0) - 2); y0 = Math.max(0, r(y0) - 2);
    x1 = Math.min(this.w, r(x1) + 2); y1 = Math.min(this.h, r(y1) + 2);
    if (x1 - x0 < 1 || y1 - y0 < 1) return null;
    const key = `${x0},${y0},${x1},${y1}`;
    let id = this.filters.get(key);
    if (!id) {
      id = 'g' + uid++;
      this.filters.set(key, id);
      this.defs.push(`<filter id="${id}" filterUnits="userSpaceOnUse" x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="3" result="n"/><feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -2.2 1.75" result="m"/><feComposite in="SourceGraphic" in2="m" operator="in"/></filter>`);
    }
    return id;
  }
  grainOf(pts, pad = 4) {
    const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
    const id = this.grain(Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) + pad, Math.max(...ys) + pad);
    return id ? `filter="url(#${id})"` : '';
  }
  add(s) {
    this.out.push(s);
  }
  open(transform) {
    this.add(`<g transform="${transform}">`);
  }
  close() {
    this.add('</g>');
  }
  /** 手繪粗墨線：兩次描邊，第二筆細一點、略錯位。 */
  ink(pts, { w = 3.2, color = INK, closed = false, amp = 1.2, passes = 2, op = 1 } = {}) {
    w *= this.ls;
    amp *= this.ls;
    // 麥克筆：只留第一筆（線稿位置和彩鉛版一樣，第二筆照樣算亂數但不畫）、略粗。
    const only = marker() ? 1 : passes;
    if (marker()) {
      w *= 1.1;
      if (color === INK) color = '#2b2420';
    }
    for (let p = 0; p < passes; p++) {
      let q = pts.map(([x, y]) => [x + J(amp * 0.8), y + J(amp * 0.8)]);
      if (closed && q.length > 2) { const e = Math.min(1.5 * this.ls, amp * 1.5); q = q.concat([[q[0][0] + J(e), q[0][1] + J(e)], [q[1][0] + J(e), q[1][1] + J(e)]]); }
      if (p >= only) continue;
      this.add(`<path d="${smooth(q, false)}" fill="none" stroke="${color}" stroke-width="${f1(p ? w * 0.62 : w)}" stroke-linecap="round" stroke-linejoin="round" opacity="${(op * (p ? 0.75 : 1)).toFixed(2)}"/>`);
    }
  }
  /** 彩鉛排線填色：剪裁 + 斜線（可交叉）+ 一層淡底 + 鉛筆顆粒。 */
  hatch(pts, color, { angle = -0.9, gap = 3.2, w = 1.6, op = 0.85, base = 0.3, cross = false, closed = true } = {}) {
    const id = 'c' + uid++;
    const d = smooth(pts, closed);
    this.defs.push(`<clipPath id="${id}"><path d="${d}"/></clipPath>`);
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const x0 = Math.min(...xs) - 6, x1 = Math.max(...xs) + 6, y0 = Math.min(...ys) - 6, y1 = Math.max(...ys) + 6;
    const L = Math.hypot(x1 - x0, y1 - y0), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    gap *= this.ls;
    if (this.vivid && base > 0) base = Math.min(0.9, base * 1.3 + 0.06);
    // 角色的底色是平塗（不過顆粒濾鏡），排線才帶顆粒：底色過濾鏡會被打成一片雜點，看起來髒。
    if (this.vivid && base > 0 && !marker()) this.add(`<path d="${d}" fill="${color}" opacity="${base}"/>`);
    let g = `<g clip-path="url(#${id})" ${this.grainOf(pts)}>`;
    if (base > 0 && !this.vivid) g += `<path d="${d}" fill="${color}" opacity="${base}"/>`;
    const lines = (ang, op2) => {
      const ca = Math.cos(ang), sa = Math.sin(ang);
      for (let s = -L / 2; s < L / 2; s += gap * (0.8 + R() * 0.5)) {
        const ox = cx - sa * s, oy = cy + ca * s;
        const a = [ox - (ca * L) / 2 + J(3), oy - (sa * L) / 2 + J(3)], b = [ox + (ca * L) / 2 + J(3), oy + (sa * L) / 2 + J(3)];
        const m = [(a[0] + b[0]) / 2 + J(1.2), (a[1] + b[1]) / 2 + J(1.2)];
        g += `<path d="M${f1(a[0])},${f1(a[1])}Q${f1(m[0])},${f1(m[1])} ${f1(b[0])},${f1(b[1])}" stroke="${color}" stroke-width="${f1(w * this.ls * (0.7 + R() * 0.6))}" opacity="${(op2 * (0.6 + R() * 0.4)).toFixed(2)}" stroke-linecap="round" fill="none"/>`;
      }
    };
    if (op > 0) lines(angle, op);
    if (cross) lines(angle + 1.25, op * 0.55);
    if (marker()) {
      // 排線照算（吃掉一樣多的亂數）但不畫，改成平塗
      this.defs.pop();
      aside(() => this.markerFill(pts, d, color, { base, op, angle, x0, x1, y0, y1 }));
      return;
    }
    this.add(g + '</g>');
  }
  /**
   * 麥克筆平塗：整塊淡彩稍微錯位（塗出線外一點），再用剪裁畫幾道寬筆觸，
   * 筆觸重疊處顏色較深——麥克筆來回塗的痕跡。
   */
  markerFill(pts, d, color, { base, op, angle, x0, x1, y0, y1 }) {
    if (base <= 0 && op < 0.3) return;
    const id = 'c' + uid++;
    this.defs.push(`<clipPath id="${id}"><path d="${d}"/></clipPath>`);
    // 深色（頭髮、墨）不能淡掉，不然變成灰灰的半透明
    const dark = luma(color) < 70;
    const col = dark ? pastel(color, 0.1) : pastel(color, this.vivid ? 0.18 : 0.38);
    const size = Math.min(x1 - x0, y1 - y0);
    const fillOp = dark ? 0.95 : this.vivid ? 0.95 : Math.min(0.85, 0.4 + Math.max(base, 0.2) * 0.5);
    // 塗出界：角色只偏一點點（太多會像套色失準），場景可以多一點
    const off = Math.min(this.vivid ? 1.2 : 3, size * 0.05) * this.ls;
    this.add(`<path d="${d}" fill="${col}" opacity="${fillOp.toFixed(2)}" transform="translate(${f1(J(off))},${f1(J(off))})"/>`);
    if (size < 3) return;
    // 麥克筆疊色的陰影：右下一彎深一階，左上一彎亮面——不畫漸層，邊緣是硬的，像疊第二支筆
    const k = Math.min(this.vivid ? 5 : 9, size * 0.16) * this.ls;
    const crescent = (dx, dy, fill, opc) => {
      const m = 'm' + uid++;
      this.defs.push(`<mask id="${m}" maskUnits="userSpaceOnUse" x="${f1(x0 - 10)}" y="${f1(y0 - 10)}" width="${f1(x1 - x0 + 20)}" height="${f1(y1 - y0 + 20)}"><path d="${d}" fill="#fff"/><path d="${d}" fill="#000" transform="translate(${f1(dx)},${f1(dy)})"/></mask>`);
      this.add(`<path d="${d}" fill="${fill}" opacity="${opc}" mask="url(#${m})"/>`);
    };
    if (!dark) crescent(-k * 0.7, -k, shade(color, this.vivid ? 0.82 : 0.88), this.vivid ? 0.7 : 0.45);
    if (this.vivid && !dark && size > 8) crescent(k * 0.5, k * 0.6, '#ffffff', 0.4);
    // 來回塗的筆觸：少幾道、淡一點，只是讓平塗不要死板
    const L = Math.hypot(x1 - x0, y1 - y0), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const ang = angle * 0.25 + J(0.12), ca = Math.cos(ang), sa = Math.sin(ang);
    const bw = Math.max(4, Math.min(14, size * 0.28)) * this.ls;
    // 整組筆觸都落在形狀外的話不輸出：resvg 碰到「剪裁後是空的群組」會整個崩潰
    let g = `<g clip-path="url(#${id})">`, n = 0;
    for (let t = -L / 2; t < L / 2; t += bw * (1.1 + R() * 0.6)) {
      if (R() < 0.5) continue;
      const ox = cx - sa * t, oy = cy + ca * t;
      if (oy < y0 - bw || oy > y1 + bw || ox < x0 - bw || ox > x1 + bw) continue;
      n += 1;
      g += `<path d="M${f1(ox - (ca * L) / 2)},${f1(oy - (sa * L) / 2)}L${f1(ox + (ca * L) / 2 + J(4))},${f1(oy + (sa * L) / 2 + J(4))}" stroke="${shade(color, 0.9)}" stroke-width="${f1(bw)}" opacity="${(0.06 + R() * 0.07).toFixed(2)}" stroke-linecap="round" fill="none"/>`;
    }
    if (n > 0) this.add(g + '</g>');
  }

  /** 填色 + 外框。sharp：直邊（先細分再抖）而不是圓滑曲線。 */
  shape(pts, fill, opt = {}) {
    if (opt.sharp) pts = jitter(pts.concat([pts[0]]), opt.sharpAmp ?? 0.6, 8).slice(0, -1);
    if (opt.paint) this.add(`<path d="${smooth(pts, true)}" fill="${opt.paint}"/>`);
    if (fill) this.hatch(pts, fill, opt);
    if (opt.ow !== 0) this.ink(pts, { closed: true, w: opt.ow ?? 3, amp: opt.amp ?? 0.8, color: opt.oc ?? INK, passes: opt.passes ?? 2 });
    return pts;
  }
  blob(cx, cy, rx, ry, fill, opt = {}) {
    const pts = ellipsePts(cx, cy, rx, ry, opt.n ?? 16, opt.wob ?? 0.05, opt.rot ?? 0);
    return this.shape(pts, fill, opt);
  }
  /** 不透明實底的團塊（眼白、臉）：先塗滿，排線只是質感。 */
  solid(cx, cy, rx, ry, paint, opt = {}) {
    return this.blob(cx, cy, rx, ry, opt.tint ?? null, { ...opt, paint, base: 0, op: opt.op ?? 0.12 });
  }
  dot(x, y, r, c = INK) {
    this.add(`<ellipse cx="${f1(x)}" cy="${f1(y)}" rx="${f1(r * (1 + J(0.1)))}" ry="${f1(r * (1 + J(0.1)))}" fill="${c}"/>`);
  }
  /** 鉛筆淡線（石墨）。 */
  pencil(pts, { w = 1.2, op = 0.55, color = GRAPH, amp = 0.8 } = {}) {
    const q = jitter(pts, amp, 10);
    this.add(`<path d="${smooth(q, false)}" fill="none" stroke="${color}" stroke-width="${f1(w * this.ls)}" opacity="${op}" stroke-linecap="round" ${this.grainOf(q, w + 2)}/>`);
  }
  /** 淡淡的一抹顏色（光暈、腮紅）。 */
  wash(pts, color, op = 0.3) {
    this.add(`<path d="${smooth(pts, true)}" fill="${color}" opacity="${op}" ${this.grainOf(pts)}/>`);
  }
  text(x, y, s, { size = 28, color = INK, anchor = 'middle', rot = 0, ls = 0, op = 1, font = 'LXGW WenKai TC Medium' } = {}) {
    this.add(`<text x="${f1(x)}" y="${f1(y)}" font-family="${font}" font-size="${size}" fill="${color}" text-anchor="${anchor}" letter-spacing="${ls}" transform="rotate(${rot} ${f1(x)} ${f1(y)})" opacity="${op}" filter="url(#wob)">${s}</text>`);
  }
  /** 彩鉛手寫字：墨線描邊 + 字形內排線。 */
  letter(x, y, s, color, { size = 64, rot = 0, fillOp = 0.55, stroke = 6, font = 'LXGW WenKai TC Medium' } = {}) {
    const id = 'tc' + uid++;
    const tr = `transform="rotate(${rot} ${x} ${y})"`;
    this.defs.push(`<clipPath id="${id}"><text x="${x}" y="${y}" font-family="${font}" font-size="${size}" text-anchor="middle" ${tr}>${s}</text></clipPath>`);
    this.add(`<text x="${x}" y="${y}" font-family="${font}" font-size="${size}" text-anchor="middle" ${tr} fill="none" stroke="${INK}" stroke-width="${stroke}" stroke-linejoin="round" filter="url(#wob)">${s}</text>`);
    let g = `<g clip-path="url(#${id})" ${this.grainOf([[x - size, y - size * 1.1], [x + size, y + size * 0.4]])}><rect x="${x - size}" y="${y - size}" width="${size * 2}" height="${size * 1.4}" fill="${color}" opacity="${fillOp}"/>`;
    if (!marker()) for (let s2 = -size * 2; s2 < size * 2; s2 += 2.6) g += `<line x1="${f1(x - size + s2)}" y1="${f1(y + size * 0.5)}" x2="${f1(x + s2)}" y2="${f1(y - size * 1.1)}" stroke="${color}" stroke-width="${f1(1.4 + R())}" opacity="${(0.6 + R() * 0.4).toFixed(2)}"/>`;
    this.add(g + '</g>');
  }
  /** 粗糙紙片（符紙、便條、按鈕底）。 */
  tile(x, y, w, h, { fill = C.cream, rot = 0, shadow = true, ow = 2.6, grainTint = '#c9bfa8' } = {}) {
    const e = Math.min(2, w / 30, h / 30);
    const pts = [[x + J(e), y + J(e)], [x + w / 2, y + J(e)], [x + w + J(e), y + J(e)], [x + w + J(e), y + h / 2], [x + w + J(e), y + h + J(e)], [x + w / 2, y + h + J(e)], [x + J(e), y + h + J(e)], [x + J(e), y + h / 2]];
    const sharp = jitter(pts.concat([pts[0]]), 0.5, 10).slice(0, -1);
    const cx = x + w / 2, cy = y + h / 2;
    this.open(`rotate(${rot} ${cx} ${cy})`);
    if (shadow) this.add(`<path d="${smooth(sharp.map((p) => [p[0] + 2.5, p[1] + 3]), true)}" fill="#2a2622" opacity=".16"/>`);
    this.add(`<path d="${smooth(sharp, true)}" fill="${fill}"/>`);
    if (grainTint && !marker()) this.hatch(sharp, grainTint, { angle: 0.3, gap: 6, w: 0.8, op: 0.25, base: 0 });
    if (ow) this.ink(sharp.concat([sharp[0]]), { w: ow, amp: 0.6 });
    this.close();
    return sharp;
  }
  svg({ paper = false } = {}) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${this.w}" height="${this.h}" viewBox="0 0 ${this.w} ${this.h}">
<defs>
<filter id="wob" filterUnits="userSpaceOnUse" x="0" y="0" width="${this.w}" height="${this.h}"><feTurbulence type="fractalNoise" baseFrequency=".04" numOctaves="2" seed="5" result="t"/><feDisplacementMap in="SourceGraphic" in2="t" scale="3"/></filter>
<filter id="paperN" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".75" numOctaves="3" seed="9"/><feColorMatrix type="matrix" values="0 0 0 0 .35  0 0 0 0 .3  0 0 0 0 .22  0 0 0 .22 0"/></filter>
<filter id="blotch" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".008" numOctaves="2" seed="2"/><feColorMatrix type="matrix" values="0 0 0 0 .55  0 0 0 0 .45  0 0 0 0 .3  0 0 0 .35 -.08"/></filter>
${this.defs.join('\n')}
</defs>
${this.out.join('\n')}
${paper ? `<rect width="100%" height="100%" filter="url(#paperN)" opacity="${marker() ? '.25' : '.55'}"/>` : ''}
</svg>`;
  }
}

// ---------- 常用部件 ----------

/** 沿中線畫成飄帶（披帛、尾巴、劍穗）。 */
/** 腳下的影子：一抹淡墨橢圓，角色才是站在地上而不是貼在紙上。 */
export function groundShadow(p, x, y, rx, ry = 5) {
  p.wash(ellipsePts(x, y, rx, ry, 16, 0.04), '#5a4a3a', 0.22);
}

export function ribbon(p, center, w, color, opt = {}) {
  const L = [], Rr = [];
  center.forEach(([x, y], i) => {
    const n = center[Math.min(i + 1, center.length - 1)], q = center[Math.max(i - 1, 0)];
    const dx = n[0] - q[0], dy = n[1] - q[1], d = Math.hypot(dx, dy) || 1;
    const ww = w * (1 - (i / center.length) * (opt.taper ?? 0.55));
    L.push([x - (dy / d) * ww, y + (dx / d) * ww]);
    Rr.unshift([x + (dy / d) * ww, y - (dx / d) * ww]);
  });
  const poly = L.concat(Rr);
  p.hatch(poly, color, { gap: 2.6, base: opt.base ?? 0.4, op: 0.8 });
  if ((opt.ow ?? 1.8) > 0) p.ink(poly.concat([poly[0]]), { w: opt.ow ?? 1.8, amp: 0.3, passes: opt.passes ?? 2 });
  return poly;
}

/** 祥雲：鼓包 + 捲紋 + 拖尾。 */
export function ruyi(p, x, y, s = 1, fill = '#d6e4f0', { tail = 1, line = '#4a4640', ow = 2.2 } = {}) {
  const bumps = [[-30, 13], [-8, 18], [16, 14]];
  const pts = [[x - 46 * s, y]];
  for (const [bx, r] of bumps) for (let a = Math.PI * 1.05; a <= Math.PI * 1.95 + 0.01; a += Math.PI * 0.15) pts.push([x + (bx + Math.cos(a) * r) * s, y - 2 * s + Math.sin(a) * r * s]);
  pts.push([x + 34 * s, y]);
  const body = pts.concat([[x + 10 * s, y + 7 * s], [x - 24 * s, y + 7 * s]]);
  if (fill) p.hatch(body, fill, { gap: 3.5, op: 0.55, base: 0.35, angle: -0.4 });
  p.ink(body.concat([body[0]]), { w: ow, amp: 0.4, color: line });
  for (const [bx, r] of bumps) p.ink(spiral(x + bx * s, y - 4 * s, r * 0.55 * s, 1.1, -1, Math.PI * 0.9), { w: ow * 0.72, amp: 0.3, passes: 1, color: line });
  if (tail) p.ink([[x + 34 * s, y], [x + 56 * s, y + 3 * s], [x + 74 * s, y - 4 * s], [x + 70 * s, y - 12 * s], [x + 62 * s, y - 8 * s]], { w: ow * 0.8, amp: 0.4, passes: 1, color: line });
}

/** 柱狀石峰 + 鉛筆皴法 + 頂上松。 */
export function peak(p, x, base, w, h, { op = 0.7, pine = true, fill = '#b9b3a6', line = '#47433d' } = {}) {
  const pts = [[x - w / 2, base], [x - w * 0.46, base - h * 0.3], [x - w * 0.52, base - h * 0.55], [x - w * 0.4, base - h * 0.8], [x - w * 0.3, base - h * 0.97], [x, base - h - 4], [x + w * 0.32, base - h * 0.95], [x + w * 0.44, base - h * 0.75], [x + w * 0.38, base - h * 0.45], [x + w * 0.5, base - h * 0.2], [x + w * 0.48, base]];
  p.hatch(pts, fill, { gap: 4, op: op * 0.5, base: op * 0.25, angle: -1.3 });
  p.ink(pts, { w: 2, color: line, amp: 0.7, op });
  for (let i = 0; i < w / 6; i++) {
    const xx = x - w * 0.4 + i * 6 + J(2), y0 = base - h * (0.15 + R() * 0.7);
    p.pencil([[xx, y0], [xx + J(2), y0 + 10 + R() * 18]], { w: 1.1, op: op * 0.7 });
  }
  if (pine) {
    const tx = x + J(w * 0.15), ty = base - h - 2;
    p.ink([[tx, ty + 2], [tx + 2, ty - 16]], { w: 2.2, color: '#4a3020', passes: 1 });
    for (const [dx, dy, r] of [[-8, -10, 9], [8, -14, 8], [0, -22, 7]]) p.blob(tx + dx, ty + dy, r * 1.3, r * 0.6, '#4f8a62', { gap: 2.4, ow: 1.8, base: 0.4 });
  }
}

/** 遠山（一筆稜線 + 淡排線），比石峰矮胖。 */
export function hill(p, x0, x1, base, h, { op = 0.5, fill = '#b9b3a6', line = '#47433d' } = {}) {
  const pts = [[x0, base]];
  const n = 7;
  for (let i = 1; i < n; i++) {
    const t = i / n;
    pts.push([x0 + (x1 - x0) * t, base - h * Math.sin(t * Math.PI) * (0.7 + R() * 0.45)]);
  }
  pts.push([x1, base]);
  p.hatch(pts, fill, { gap: 4, op: op * 0.5, base: op * 0.2, angle: -1.2, closed: true });
  p.ink(pts, { w: 1.8, color: line, amp: 0.6, op, passes: 1 });
}

export function pine(p, x, y, s = 1, { leaf = '#4f8a62' } = {}) {
  p.ink([[x, y], [x + 3 * s, y - 34 * s]], { w: 3 * s, color: '#4a3020', passes: 1 });
  for (const [dx, dy, r] of [[-12, -22, 13], [12, -30, 12], [-2, -42, 11], [6, -16, 9]]) p.blob(x + dx * s, y + dy * s, r * 1.3 * s, r * 0.55 * s, leaf, { gap: 2.4, ow: 1.8, base: 0.45 });
}

export function eaveRoof(p, x, y, w, h, color = '#3e4a52', opt = {}) {
  const pts = [[x - w * 0.64, y - h * 0.38], [x - w * 0.5, y], [x + w * 0.5, y], [x + w * 0.64, y - h * 0.38], [x + w * 0.42, y - h * 0.3], [x + w * 0.16, y - h], [x - w * 0.16, y - h], [x - w * 0.42, y - h * 0.3]];
  return p.shape(pts, color, { gap: 2.4, base: 0.55, ow: 2.4, angle: 1.2, sharp: true, ...opt });
}

export function pagoda(p, x, y, s = 1, tiers = [[38, 22], [30, 18], [22, 15]]) {
  let yy = y;
  tiers.forEach(([w, h]) => {
    p.shape([[x - (w / 2) * s, yy], [x + (w / 2) * s, yy], [x + (w / 2) * s, yy - h * s], [x - (w / 2) * s, yy - h * s]], C.bone, { base: 0.9, op: 0.1, ow: 2, sharp: true });
    p.shape([[x - 4 * s, yy], [x + 4 * s, yy], [x + 4 * s, yy - h * 0.6 * s], [x - 4 * s, yy - h * 0.6 * s]], ZHU, { base: 0.6, ow: 1.6, sharp: true });
    eaveRoof(p, x, yy - h * s, (w + 22) * s, 14 * s);
    yy -= (h + 12) * s;
  });
  p.ink([[x, yy + 2], [x, yy - 14 * s]], { w: 2.2 });
  p.dot(x, yy - 15 * s, 3 * s, C.gold);
}

export function crane(p, x, y, s = 1, f = 1, wing = 0) {
  const S = (a) => a.map(([u, v]) => [x + u * s * f, y + v * s]);
  const up = wing ? -1 : 1;
  p.shape(S([[0, 0], [-14, -24 * up], [-34, -30 * up], [-24, -14 * up], [-10, 2]]), null, { paint: '#fbf7ee', ow: 2 });
  p.hatch(S([[-34, -30 * up], [-24, -25 * up], [-22, -15 * up], [-26, -16 * up]]), INK, { base: 0.8, gap: 2 });
  p.shape(S([[2, 0], [18, -20 * up], [38, -22 * up], [28, -8 * up], [10, 4]]), null, { paint: '#fbf7ee', ow: 2 });
  p.hatch(S([[38, -22 * up], [30, -19 * up], [28, -9 * up], [32, -12 * up]]), INK, { base: 0.8, gap: 2 });
  p.solid(x, y + 2 * s, 12 * s, 6 * s, '#fbf7ee', { ow: 2, rot: f * 0.2 });
  p.ink(S([[-10, 4], [-22, 10], [-32, 12]]), { w: 2.2, passes: 1 });
  p.dot(x - 33 * s * f, y + 12 * s, 2.6 * s, ZHU);
  p.ink(S([[-35, 13], [-42, 15]]), { w: 1.4, passes: 1 });
  p.ink(S([[10, 4], [28, 12]]), { w: 1.4, passes: 1 });
  p.ink(S([[9, 6], [27, 15]]), { w: 1.4, passes: 1 });
}

/** 飛劍（帶劍氣、劍穗）。 */
export function flySword(p, x1, y1, x2, y2, s = 1, { qi = '#9cc6e8', blade = '#c7d6e0', tassel = ZHU } = {}) {
  const a = Math.atan2(y2 - y1, x2 - x1), c = Math.cos(a), sn = Math.sin(a), nx = -sn, ny = c;
  if (qi) for (const o of [-7, 0, 7]) p.pencil([[x1 - c * 40 + nx * o, y1 - sn * 40 + ny * o], [x1 - c * 90 + nx * o * 1.6, y1 - sn * 90 + ny * o * 1.6]], { w: 2, op: 0.7, color: qi });
  const bl = [[x1 + nx * 4.5 * s, y1 + ny * 4.5 * s], [x2 - c * 14 + nx * 4 * s, y2 - sn * 14 + ny * 4 * s], [x2, y2], [x2 - c * 14 - nx * 4 * s, y2 - sn * 14 - ny * 4 * s], [x1 - nx * 4.5 * s, y1 - ny * 4.5 * s]];
  p.shape(bl, blade, { gap: 2.4, ow: 2.4, sharp: true });
  p.ink([[x1 + nx * 12 * s, y1 + ny * 12 * s], [x1 - nx * 12 * s, y1 - ny * 12 * s]], { w: 4 * s });
  p.ink([[x1, y1], [x1 - c * 16 * s, y1 - sn * 16 * s]], { w: 4.4 * s, color: WOOD });
  if (tassel) ribbon(p, [[x1 - c * 16 * s, y1 - sn * 16 * s], [x1 - c * 26 * s, y1 - sn * 26 * s + 6 * s], [x1 - c * 38 * s, y1 - sn * 38 * s + 4 * s], [x1 - c * 48 * s, y1 - sn * 48 * s + 10 * s]], 2 * s, tassel);
}

/** 一團火焰（狐火、魔焰、爐火）。 */
export function flame(p, x, y, s = 1, outer = '#e8622e', inner = '#e8b33c', ow = 2.4) {
  const S = (pts) => pts.map(([a, b]) => [x + a * s, y + b * s]);
  p.shape(S([[0, 28], [-17, 18], [-20, -2], [-10, -14], [-8, -4], [-2, -22], [4, -34], [8, -16], [14, -24], [20, -2], [17, 18]]), outer, { gap: 2.2, base: 0.5, ow });
  if (inner) p.shape(S([[0, 24], [-8, 16], [-8, 4], [-2, -6], [2, 4], [6, -2], [9, 12], [7, 20]]), inner, { gap: 2, base: 0.6, ow: ow * 0.7 });
}

export function bolt(p, x, y, s = 1, color = '#f0c040', ow = 2.4) {
  return p.shape([[4, -34], [-14, 2], [-2, 2], [-8, 32], [16, -8], [3, -8], [12, -34]].map(([a, b]) => [x + a * s, y + b * s]), color, { gap: 2, base: 0.6, ow, sharp: true, sharpAmp: 0.3 });
}
