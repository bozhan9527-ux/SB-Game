/**
 * 把最早一版的像素 SVG（8 月那批 rect 格子圖）描成麥克筆手繪：
 * 每個色塊描成平滑輪廓 → 淡彩平塗（略錯位塗出界）＋ 麥克筆來回筆觸；
 * 外圈的黑色像素描邊改成一筆黑色麥克筆線，內部的黑色（眼睛、腰帶）保留成實心墨塊。
 *
 * 造型、比例、配色都沿用原圖，只換畫法。
 */
import { INK, J, Pic, R, aside, pastel, smooth } from './lib.mjs';

export function parsePixelSvg(src) {
  const vb = /viewBox="0 0 (\d+) (\d+)"/.exec(src);
  const w = Number(vb[1]), h = Number(vb[2]);
  const grid = Array.from({ length: h }, () => new Array(w).fill(null));
  for (const m of src.matchAll(/<rect x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)" fill="(#[0-9a-fA-F]{6})"(?: opacity="([\d.]+)")?/g)) {
    const [x, y, rw, rh] = m.slice(1, 5).map(Number);
    if (m[6] !== undefined && Number(m[6]) < 0.6) continue; // 半透明的光暈像素不描
    for (let j = y; j < y + rh && j < h; j++) for (let i = x; i < x + rw && i < w; i++) grid[j][i] = m[5].toLowerCase();
  }
  return { w, h, grid };
}

const lum = (hex) => { const n = parseInt(hex.slice(1), 16); return (n >> 16) * 0.3 + ((n >> 8) & 255) * 0.59 + (n & 255) * 0.11; };

const rgb = (hex) => { const n = parseInt(hex.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
const dist = (a, b) => { const x = rgb(a), y = rgb(b); return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]); };

/**
 * 像素圖 → 適合描的色塊圖：
 * 1. 原圖每格是 2×2 像素，先縮回一格一點；
 * 2. 同色系的明暗階（陰影、高光）併成一色——麥克筆是平塗，不畫像素陰影；
 * 3. 一兩格的小雜點併進旁邊最多的顏色。
 */
function simplify({ w, h, grid }) {
  const k = grid.every((r, y) => y % 2 === 1 || r.every((v, x) => x % 2 === 1 || (v === r[x + 1] && v === grid[y + 1]?.[x]))) ? 2 : 1;
  w = Math.floor(w / k); h = Math.floor(h / k);
  let g = Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => grid[y * k][x * k]));
  const counts = new Map();
  for (const r of g) for (const c of r) if (c) counts.set(c, (counts.get(c) ?? 0) + 1);
  const order = [...counts.keys()].sort((a, b) => counts.get(b) - counts.get(a));
  const rep = new Map();
  // 描邊色（最常見的深色）自己一組，不跟別的深色併：眼睛、面罩、頭髮要分得出來
  const outline = order.filter((c) => lum(c) < 40)[0];
  for (const c of order) {
    const target = c === outline ? undefined : [...new Set(rep.values())].find((r) => r !== outline && dist(r, c) < 48 && (lum(c) < 40) === (lum(r) < 40));
    rep.set(c, target ?? c);
  }
  g = g.map((r) => r.map((c) => (c ? rep.get(c) : null)));
  // 小雜點
  const seen = g.map((r) => r.map(() => false));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!g[y][x] || seen[y][x]) continue;
    const c = g[y][x], comp = [[x, y]], q = [[x, y]];
    seen[y][x] = true;
    while (q.length) {
      const [cx, cy] = q.pop();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy;
        if (g[ny]?.[nx] === c && !seen[ny][nx]) { seen[ny][nx] = true; comp.push([nx, ny]); q.push([nx, ny]); }
      }
    }
    if (comp.length > 2 || lum(c) < 40) continue; // 黑色小點是眼睛，要留
    const tally = new Map();
    for (const [cx, cy] of comp) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const v = g[cy + dy]?.[cx + dx];
      if (v && v !== c) tally.set(v, (tally.get(v) ?? 0) + 1);
    }
    const best = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    // 跟旁邊差很多的小點是重點色（紅眼、符咒、寶石），留著
    if (best && dist(best, c) > 110) continue;
    if (best) for (const [cx, cy] of comp) g[cy][cx] = best;
  }
  return { w, h, grid: g };
}

/**
 * 遮罩放大 U 倍再做圓角：每個細格看周圍一格內有多少在遮罩裡，過半才算。
 * 方塊的直角會被磨圓，但一格寬的細節（眼睛、腰帶）留得住。
 */
const U = 4;
function rounded(mask, w, h, grow = 2) {
  const big = Array.from({ length: h * U }, (_, y) => Array.from({ length: w * U }, (_, x) => mask[Math.floor(y / U)][Math.floor(x / U)]));
  const r = U - 1, W = w * U, H = h * U;
  const sum = Array.from({ length: H + 1 }, () => new Array(W + 1).fill(0));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) sum[y + 1][x + 1] = sum[y][x + 1] + sum[y + 1][x] - sum[y][x] + (big[y][x] ? 1 : 0);
  return big.map((row, y) => row.map((v, x) => {
    const x0 = Math.max(0, x - r), x1 = Math.min(W, x + r + 1), y0 = Math.max(0, y - r), y1 = Math.min(H, y + r + 1);
    const n = sum[y1][x1] - sum[y0][x1] - sum[y1][x0] + sum[y0][x0];
    return n * grow > (x1 - x0) * (y1 - y0) || (v && n * 2.6 > (x1 - x0) * (y1 - y0));
  }));
}

/** 遮罩的邊界 → 一圈圈頂點（像素角座標）。 */
function loops(mask, w, h) {
  const inside = (x, y) => x >= 0 && y >= 0 && x < w && y < h && mask[y][x];
  const next = new Map();
  const key = (x, y) => x + ',' + y;
  const edge = (x1, y1, x2, y2) => { const k = key(x1, y1); if (!next.has(k)) next.set(k, []); next.get(k).push([x2, y2]); };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!mask[y][x]) continue;
    if (!inside(x, y - 1)) edge(x, y, x + 1, y);
    if (!inside(x + 1, y)) edge(x + 1, y, x + 1, y + 1);
    if (!inside(x, y + 1)) edge(x + 1, y + 1, x, y + 1);
    if (!inside(x - 1, y)) edge(x, y + 1, x, y);
  }
  const out = [];
  for (const [k0] of next) {
    while (next.get(k0)?.length) {
      const loop = [];
      let k = k0;
      while (next.get(k)?.length) {
        const [x, y] = k.split(',').map(Number);
        loop.push([x, y]);
        const [nx, ny] = next.get(k).shift();
        k = key(nx, ny);
      }
      if (loop.length >= 4) out.push(loop);
    }
  }
  return out;
}

/** 階梯 → 平滑：取邊的中點，再 Chaikin 兩次，最後抽稀。 */
function soften(loop, s) {
  let p = loop.map((a, i) => { const b = loop[(i + 1) % loop.length]; return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; });
  // 先做幾輪鄰點平均，把像素階梯磨圓（Chaikin 只會切角，磨不掉階梯）
  for (let it = 0; it < 2; it++) {
    const n = p.length;
    p = p.map((_, i) => {
      let sx = 0, sy = 0;
      for (let d = -2; d <= 2; d++) { const q = p[(i + d + n) % n]; sx += q[0]; sy += q[1]; }
      return [sx / 5, sy / 5];
    });
  }
  for (let it = 0; it < 3; it++) {
    const q = [];
    for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; q.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]); }
    p = q;
  }
  const keep = p.filter((_, i) => i % 6 === 0);
  return keep.map(([x, y]) => [x * s, y * s]);
}

/**
 * 畫一張描過的圖。s：一格像素對幾個遊戲點。ox/oy：左上角位置。
 */
export function drawTraced(p, px, ox, oy, s) {
  let { w, h, grid } = simplify(px);
  s *= px.w / w;
  const counts = new Map();
  for (const row of grid) for (const c of row) if (c) counts.set(c, (counts.get(c) ?? 0) + 1);
  // 描邊色：最暗、而且數量夠多的那個
  const outline = [...counts.keys()].filter((c) => lum(c) < 40).sort((a, b) => counts.get(b) - counts.get(a))[0];
  const empty = (x, y) => x < 0 || y < 0 || x >= w || y >= h || !grid[y][x];
  // 外圈描邊像素改成旁邊的顏色（輪廓線會由麥克筆線畫），內部的黑保留
  const g = grid.map((r) => r.slice());
  for (let pass = 0; pass < 1; pass++) {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (g[y][x] !== outline) continue;
      const nearEdge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => empty(x + dx, y + dy)) || pass === 1 && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => grid[y + dy]?.[x + dx] === outline && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([ex, ey]) => empty(x + dx + ex, y + dy + ey)));
      if (!nearEdge) continue;
      const nb = [[1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [-2, 0], [0, 2], [0, -2]].map(([dx, dy]) => g[y + dy]?.[x + dx]).find((c) => c && c !== outline && c !== 'edge');
      g[y][x] = nb ?? 'edge';
    }
  }
  // 內部剩下的黑：小塊（眼睛、嘴、紐扣）留著；大塊多半是第二層描邊或分隔線，併進旁邊的顏色
  const seen = g.map((r) => r.map(() => false));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (g[y][x] !== outline || seen[y][x]) continue;
    const comp = [[x, y]], q = [[x, y]];
    seen[y][x] = true;
    while (q.length) {
      const [cx, cy] = q.pop();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy;
        if (g[ny]?.[nx] === outline && !seen[ny][nx]) { seen[ny][nx] = true; comp.push([nx, ny]); q.push([nx, ny]); }
      }
    }
    const touchesEdge = comp.some(([cx, cy]) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => g[cy + dy]?.[cx + dx] === 'edge' || empty(cx + dx, cy + dy)));
    if (comp.length <= 6 && !touchesEdge) continue;
    for (let it = 0; it < 4; it++) for (const [cx, cy] of comp) {
      if (g[cy][cx] !== outline) continue;
      const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => g[cy + dy]?.[cx + dx]).find((c) => c && c !== outline && c !== 'edge');
      if (nb) g[cy][cx] = nb;
    }
    for (const [cx, cy] of comp) if (g[cy][cx] === outline) g[cy][cx] = 'edge';
  }
  const T = (pts) => pts.map(([x, y]) => [ox + x, oy + y]);
  // 大的淡色先畫、深色（眼睛、腰帶、頭髮）最後畫，才不會被淡彩蓋掉
  const colors = [...new Set(g.flat().filter((c) => c && c !== 'edge'))].sort((a, b) => (lum(a) < 45) - (lum(b) < 45) || countOf(b) - countOf(a));
  function countOf(c) { let n = 0; for (const r of g) for (const v of r) if (v === c) n++; return n; }
  // 色塊：大的先畫
  for (const c of colors) {
    const mask = g.map((r) => r.map((v) => v === c));
    const ls = loops(rounded(mask, w, h, lum(c) < 45 ? 2 : 3.2), w * U, h * U).map((l) => T(soften(l, s / U)));
    if (!ls.length) continue;
    const d = ls.map((l) => smooth(l, true)).join(' ');
    if (c === outline || lum(c) < 45) {
      p.add(`<path d="${d}" fill="#2b2420" fill-rule="evenodd"/>`);
      continue;
    }
    aside(() => {
      const off = Math.min(3, 0.6 * s);
      p.add(`<path d="${d}" fill="${pastel(c, 0.22)}" fill-rule="evenodd" opacity=".9" transform="translate(${(J(off)).toFixed(1)},${(J(off)).toFixed(1)})"/>`);
      const id = 'tr' + Math.floor(R() * 1e9);
      p.defs.push(`<clipPath id="${id}"><path d="${d}" clip-rule="evenodd"/></clipPath>`);
      let st = `<g clip-path="url(#${id})">`;
      for (let y = oy; y < oy + h * s; y += 3.2 * s * (0.8 + R() * 0.6)) {
        if (R() < 0.4) continue;
        st += `<path d="M${ox - 4},${(y + J(2)).toFixed(1)}L${ox + w * s + 4},${(y + J(3 * s)).toFixed(1)}" stroke="${c}" stroke-width="${(2.6 * s).toFixed(1)}" opacity="${(0.12 + R() * 0.12).toFixed(2)}" stroke-linecap="round"/>`;
      }
      p.add(st + '</g>');
    });
    // 大色塊之間加細線（衣服、臉、頭髮的分界）
    if (countOf(c) >= 6) for (const l of ls) p.ink(l, { closed: true, w: 1.3, amp: 0.4, passes: 1, color: '#3a302a', op: 0.85 });
  }
  // 整體外輪廓：一筆黑色麥克筆
  const sil = grid.map((r) => r.map((v) => !!v));
  for (const l of loops(rounded(sil, w, h), w * U, h * U)) p.ink(T(soften(l, s / U)), { closed: true, w: 3, amp: 0.6, passes: 1, color: INK });
}
