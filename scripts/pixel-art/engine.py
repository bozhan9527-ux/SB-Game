"""原生解析度的像素角色引擎。

舊流程是 23×28 的格子圖經 EPX 放大兩倍——斜邊變圓了，但每一格其實是半格，細節上不去。
這裡改成直接在目標解析度上畫：角色由幾何形狀（橢圓、多邊形、粗線、曲線）組成，
每個形狀指定材質（五階色），引擎負責像素畫師會手動做的那幾件事：

- **體積光**：形狀內部的距離場當作高度，配合左上光源算出明暗，再疊一層整塊的形體光
- **交界網點**：只在兩個色階交界的那一窄條用棋盤格過渡，色塊內部保持乾淨
- **環境光遮蔽**：前面的部位在後面的部位上投下一格陰影（光從左上來，影子落在右下）
- **輪廓光**：背光那一側的外緣打一道冷色邊光，角色才會從背景裡「站出來」
- **選擇性描邊**：外框取鄰格材質的最暗色；朝光那面淡一點、背光那面深一點，不用死黑
- **材質紋理**：毛皮的毛束、布料的皺褶、鱗片、石紋、金屬高光

改造型只要改形狀參數，不必一格一格重點。只用 Python 標準函式庫。
"""
import math

OUTLINE = (24, 14, 22)
RIM = (150, 200, 255)

_L = (-0.55, -0.75, 0.9)
_LN = math.sqrt(sum(c * c for c in _L))
LIGHT = tuple(c / _LN for c in _L)


def hx(c):
    if isinstance(c, tuple):
        return c
    c = c.lstrip("#")
    return tuple(int(c[i:i + 2], 16) for i in (0, 2, 4))


def mix(a, b, t):
    a, b = hx(a), hx(b)
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def ramp(*colors):
    """五階材質：最暗、暗、本色、亮、高光。"""
    assert len(colors) == 5
    return [hx(c) for c in colors]


def auto_ramp(base, warm_light=True):
    """從一個本色推出五階：暗面偏冷偏紫、亮面偏暖偏黃——像素畫的老規矩，比單純加減亮度好看。"""
    r, g, b = hx(base)

    def shift(f):
        if f < 0:
            t, (tr, tg, tb) = -f, (36, 26, 64)
        else:
            t, (tr, tg, tb) = f, ((255, 244, 196) if warm_light else (228, 248, 255))
        return (round(r + (tr - r) * t), round(g + (tg - g) * t), round(b + (tb - b) * t))

    return [shift(-0.66), shift(-0.36), (r, g, b), shift(0.2), shift(0.46)]


class Sprite:
    def __init__(self, w, h, rim=True, k=None):
        """k：整體縮放。造型照原本的座標寫，畫布與所有座標乘上 k——
        同一套造型可以出不同大小，每一格仍是一點，不必重畫。不給就用 Sprite.default_k。"""
        self.k = Sprite.default_k if k is None else k
        w, h = int(math.ceil(w * self.k)), int(math.ceil(h * self.k))
        self.w, self.h = w, h
        self.rim = rim
        self.shape = [[-1] * w for _ in range(h)]
        self.mats, self.flat, self.round, self.lines, self.tex = [], [], [], [], []
        self.detail = {}

    # ---------------------------------------------------------- 形狀
    def _new(self, mat, flat=False, roundness=1.0, line=False, tex=None):
        self.mats.append(mat)
        self.flat.append(flat)
        self.round.append(roundness)
        self.lines.append(line)
        self.tex.append(tex)
        return len(self.mats) - 1

    def _plot(self, sid, pts):
        for x, y in pts:
            if 0 <= x < self.w and 0 <= y < self.h:
                self.shape[y][x] = sid

    def _t(self, pts):
        k = self.k
        return [(x * k, y * k) for x, y in pts]

    def ellipse(self, cx, cy, rx, ry, mat, **kw):
        k = self.k
        cx, cy, rx, ry = cx * k, cy * k, max(0.6, rx * k), max(0.6, ry * k)
        sid = self._new(mat, **kw)
        pts = []
        for y in range(int(cy - ry - 1), int(cy + ry + 2)):
            for x in range(int(cx - rx - 1), int(cx + rx + 2)):
                if ((x + 0.5 - cx) / max(rx, 0.01)) ** 2 + ((y + 0.5 - cy) / max(ry, 0.01)) ** 2 <= 1:
                    pts.append((x, y))
        self._plot(sid, pts)
        return sid

    def poly(self, points, mat, **kw):
        sid = self._new(mat, **kw)
        self._plot(sid, _fill_poly(self._t(points)))
        return sid

    def _poly_raw(self, points, mat, **kw):
        sid = self._new(mat, **kw)
        self._plot(sid, _fill_poly(points))
        return sid

    def curve(self, points, mat, steps=10, **kw):
        """平滑封閉曲線：點與點之間用 Catmull-Rom 補成圓滑的邊。"""
        return self._poly_raw(_catmull(self._t(points), steps), mat, **kw)

    def line(self, x0, y0, x1, y1, width, mat, **kw):
        k = self.k
        x0, y0, x1, y1, width = x0 * k, y0 * k, x1 * k, y1 * k, max(1.0, width * k)
        dx, dy = x1 - x0, y1 - y0
        n = math.hypot(dx, dy) or 1
        ox, oy = -dy / n * width / 2, dx / n * width / 2
        return self._poly_raw([(x0 + ox, y0 + oy), (x1 + ox, y1 + oy), (x1 - ox, y1 - oy), (x0 - ox, y0 - oy)], mat, **kw)

    def taper(self, pts, w0, w1, mat, **kw):
        """一條由粗到細的筆觸（尾巴、觸手、髮帶、刀光）：沿折線前進，寬度線性收窄。"""
        k = self.k
        pts = self._t(pts)
        w0, w1 = max(1.0, w0 * k), max(1.0, w1 * k)
        left, right = [], []
        n = len(pts)
        for i, (x, y) in enumerate(pts):
            a = pts[max(0, i - 1)]
            b = pts[min(n - 1, i + 1)]
            dx, dy = b[0] - a[0], b[1] - a[1]
            ln = math.hypot(dx, dy) or 1
            wd = (w0 + (w1 - w0) * i / max(1, n - 1)) / 2
            left.append((x - dy / ln * wd, y + dx / ln * wd))
            right.append((x + dy / ln * wd, y - dx / ln * wd))
        return self._poly_raw(left + right[::-1], mat, **kw)

    def dot(self, x, y, color):
        k = self.k
        self.detail[(int(round(x * k)), int(round(y * k)))] = hx(color)

    def _dot_raw(self, x, y, color):
        self.detail[(int(round(x)), int(round(y)))] = hx(color)

    def px(self, pts, color):
        for x, y in pts:
            self.dot(x, y, color)

    def stroke(self, pts, color):
        """一像素寬的折線（Bresenham），畫眉毛、皺褶、符文用。"""
        for (x0, y0), (x1, y1) in zip(self._t(pts), self._t(pts)[1:]):
            x0, y0, x1, y1 = int(round(x0)), int(round(y0)), int(round(x1)), int(round(y1))
            dx, dy = abs(x1 - x0), -abs(y1 - y0)
            sx, sy = (1 if x0 < x1 else -1), (1 if y0 < y1 else -1)
            err = dx + dy
            while True:
                self._dot_raw(x0, y0, color)
                if x0 == x1 and y0 == y1:
                    break
                e2 = 2 * err
                if e2 >= dy:
                    err += dy
                    x0 += sx
                if e2 <= dx:
                    err += dx
                    y0 += sy

    # ---------------------------------------------------------- 算圖
    def render(self, outline=OUTLINE, rim_color=RIM):
        w, h = self.w, self.h
        out = [[None] * w for _ in range(h)]
        level = [[-1] * w for _ in range(h)]
        n = len(self.mats)
        dist = [_distance(self.shape, sid, w, h) for sid in range(n)]
        boxes = {}
        for y in range(h):
            for x in range(w):
                sid = self.shape[y][x]
                if sid >= 0:
                    b = boxes.setdefault(sid, [x, y, x, y])
                    b[0] = min(b[0], x); b[1] = min(b[1], y); b[2] = max(b[2], x); b[3] = max(b[3], y)

        def sid_at(xx, yy):
            return self.shape[yy][xx] if 0 <= xx < w and 0 <= yy < h else -1

        for y in range(h):
            for x in range(w):
                sid = self.shape[y][x]
                if sid < 0:
                    continue
                mat = self.mats[sid]
                if self.flat[sid]:
                    out[y][x] = mat[2]
                    continue
                dome = _shade(dist[sid], x, y, w, h, self.round[sid])
                bx0, by0, bx1, by1 = boxes[sid]
                u = (x - bx0) / max(1, bx1 - bx0)
                v = (y - by0) / max(1, by1 - by0)
                lin = 1 - (0.4 * u + 0.6 * v)
                inten = 0.08 + 0.5 * lin + 0.55 * dome
                if sid_at(x - 1, y) != sid or sid_at(x, y - 1) != sid:
                    inten += 0.14
                if sid_at(x + 1, y) != sid or sid_at(x, y + 1) != sid:
                    inten -= 0.2
                # 環境光遮蔽：左上方是「更前面」的形狀，這一格就落在它的影子裡
                for ddx, ddy in ((-1, -1), (-1, 0), (0, -1), (-2, -2), (-2, -1), (-1, -2)):
                    o = sid_at(x + ddx, y + ddy)
                    if o > sid and not self.flat[o]:
                        # 同材質的前後部位（毛疊毛）只壓淡淡一層，否則身體會像一節一節的盔甲
                        same = self.mats[o] is mat
                        inten -= (0.07 if same else 0.22) if abs(ddx) + abs(ddy) <= 2 else (0.0 if same else 0.12)
                        break
                inten += _texture(self.tex[sid], x, y, dist[sid]["grid"][y][x])
                k = inten * 4.0
                frac = k - math.floor(k)
                idx = int(math.floor(k))
                if 0.42 < frac < 0.58 and (x + y) % 2 == 0:
                    idx += 1
                elif frac >= 0.58:
                    idx += 1
                idx = max(0, min(4, idx))
                if idx == 4 and inten < 0.97 and self.tex[sid] != "metal":
                    idx = 3
                out[y][x] = mat[idx]
                level[y][x] = idx
                if self.lines[sid]:
                    for ddx, ddy in ((1, 0), (0, 1), (-1, 0), (0, -1)):
                        o = sid_at(x + ddx, y + ddy)
                        if o not in (sid, -1) and o < sid:
                            out[y][x] = mat[0]
                            break

        # 輪廓光：外緣右側接觸空白的暗面格子，混一點冷色邊光
        if self.rim:
            for y in range(h):
                for x in range(w):
                    sid = self.shape[y][x]
                    if sid < 0 or self.flat[sid] or level[y][x] > 2:
                        continue
                    if sid_at(x + 1, y) == -1 or (sid_at(x + 1, y + 1) == -1 and sid_at(x, y + 1) == -1):
                        out[y][x] = mix(out[y][x], rim_color, 0.38)

        for (x, y), c in self.detail.items():
            if 0 <= x < w and 0 <= y < h:
                out[y][x] = c

        # 選擇性描邊：外框在形狀左上方（朝光面）淡一點、右下方（背光面）壓到最深
        framed = [row[:] for row in out]
        for y in range(h):
            for x in range(w):
                if out[y][x] is not None:
                    continue
                best = None
                for ddx, ddy, lit in ((1, 0, True), (0, 1, True), (-1, 0, False), (0, -1, False)):
                    xx, yy = x + ddx, y + ddy
                    if 0 <= xx < w and 0 <= yy < h and out[yy][xx] is not None:
                        sid = self.shape[yy][xx]
                        base = self.mats[sid][0] if sid >= 0 else outline
                        c = mix(base, outline, 0.35 if lit else 0.7)
                        if best is None or not lit:
                            best = c
                if best is not None:
                    framed[y][x] = best
        return framed


Sprite.default_k = 1.0


def _texture(kind, x, y, d):
    if kind is None or d < 2:
        return 0.0
    if kind == "fur":
        # 毛束：斜向短筆，錯位排列
        return -0.16 if ((x + 2 * y) % 7 == 0 and (x // 3 + y // 4) % 2 == 0) else 0.0
    if kind == "cloth":
        # 布料：縱向皺褶，偶爾斷開
        return -0.14 if (x % 6 == 0 and (y // 3) % 3 != 0) else 0.0
    if kind == "scale":
        cx, cy = (x + (y // 4 % 2) * 2) % 4, y % 4
        return -0.18 if (cy == 3 and cx != 0) or (cy == 2 and cx == 0) else 0.0
    if kind == "stone":
        return -0.15 if ((x * 7 + y * 13) % 17 == 0 or (x * 3 + y * 5) % 23 == 0) else 0.0
    if kind == "metal":
        # 金屬：靠近邊緣的那一圈才有斜向反光，大面積的甲片中間保持乾淨
        return 0.35 if (x + y) % 9 in (0, 1) and d <= 3 else 0.0
    return 0.0


def _shade(d, x, y, w, h, roundness):
    if roundness <= 0:
        return 0.55
    dm = d["max"] or 1
    g = d["grid"]

    def hgt(xx, yy):
        if 0 <= xx < w and 0 <= yy < h and g[yy][xx] > 0:
            return math.sqrt(g[yy][xx] / dm)
        return 0.0

    gx = (hgt(x + 1, y) - hgt(x - 1, y)) / 2
    gy = (hgt(x, y + 1) - hgt(x, y - 1)) / 2
    nz = 1.0 / (roundness * dm ** 0.5 * 0.9 + 0.2)
    nx, ny = -gx, -gy
    ln = math.sqrt(nx * nx + ny * ny + nz * nz) or 1
    lam = (nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]) / ln
    return max(0.0, min(1.0, lam))


def _distance(shape, sid, w, h):
    INF = 10 ** 6
    g = [[INF if shape[y][x] == sid else 0 for x in range(w)] for y in range(h)]
    for y in range(h):
        for x in range(w):
            if g[y][x]:
                up = g[y - 1][x] if y > 0 else 0
                lf = g[y][x - 1] if x > 0 else 0
                g[y][x] = min(g[y][x], up + 1, lf + 1)
    mx = 0
    for y in range(h - 1, -1, -1):
        for x in range(w - 1, -1, -1):
            if g[y][x]:
                dn = g[y + 1][x] if y < h - 1 else 0
                rt = g[y][x + 1] if x < w - 1 else 0
                g[y][x] = min(g[y][x], dn + 1, rt + 1)
                mx = max(mx, g[y][x])
    return {"grid": g, "max": mx}


def _fill_poly(points):
    ys = [p[1] for p in points]
    out = []
    for y in range(int(math.floor(min(ys))), int(math.ceil(max(ys))) + 1):
        yc = y + 0.5
        xs = []
        n = len(points)
        for i in range(n):
            x0, y0 = points[i]
            x1, y1 = points[(i + 1) % n]
            if (y0 <= yc < y1) or (y1 <= yc < y0):
                xs.append(x0 + (yc - y0) * (x1 - x0) / (y1 - y0))
        xs.sort()
        for i in range(0, len(xs) - 1, 2):
            for x in range(int(math.ceil(xs[i] - 0.5)), int(math.floor(xs[i + 1] - 0.5)) + 1):
                out.append((x, y))
    return out


def _catmull(points, steps):
    out = []
    n = len(points)
    for i in range(n):
        p0, p1, p2, p3 = points[i - 1], points[i], points[(i + 1) % n], points[(i + 2) % n]
        for s in range(steps):
            t = s / steps
            t2, t3 = t * t, t * t * t
            out.append(tuple(
                0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3)
                for k in (0, 1)))
    return out


def to_hex_grid(grid):
    return [[None if c is None else "#%02x%02x%02x" % c for c in row] for row in grid]
