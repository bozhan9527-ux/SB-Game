"""把現有的像素圖升級成兩倍解析度、多階明暗。

1. 讀回現有 SVG 的方格 → 色格（去掉自動描邊，半透明的光暈另存）
2. EPX（scale2x）放大：斜邊變圓，但不產生新顏色
3. 每一塊同色區域依「離左上／右下邊緣多遠」打亮面、暗面，暗面偏冷、亮面偏暖
4. 重新描一圈較細的邊：上、左用壓暗的本色，下、右用最深色
"""
import colorsys
import re
from collections import deque

OUTLINE = "#12141c"


def read_svg(text):
    vb = re.search(r'viewBox="0 0 ([\d.]+) ([\d.]+)"', text)
    vw, vh = float(vb.group(1)), float(vb.group(2))
    rects = re.findall(r'<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)" fill="(#[0-9a-f]{6})"( fill-opacity="([\d.]+)")?', text)
    cell = min(float(r[3]) for r in rects)
    gw, gh = round(vw / cell), round(vh / cell)
    grid = [[None] * gw for _ in range(gh)]
    glow = [[None] * gw for _ in range(gh)]
    for x, y, w, h, fill, _, op in rects:
        x0, y0, n = round(float(x) / cell), round(float(y) / cell), round(float(w) / cell)
        for i in range(n):
            if op:
                glow[y0][x0 + i] = (fill, float(op))
            elif fill != OUTLINE:
                grid[y0][x0 + i] = fill
            else:
                grid[y0][x0 + i] = "OUT"
    return grid, glow, vw, vh


def epx(grid):
    h, w = len(grid), len(grid[0])
    out = [[None] * (w * 2) for _ in range(h * 2)]
    g = lambda y, x: grid[y][x] if 0 <= y < h and 0 <= x < w else None
    for y in range(h):
        for x in range(w):
            p = grid[y][x]
            a, b, c, d = g(y - 1, x), g(y, x + 1), g(y, x - 1), g(y + 1, x)
            o1 = o2 = o3 = o4 = p
            if c == a and c != d and a != b:
                o1 = a
            if a == b and a != c and b != d:
                o2 = b
            if d == c and d != b and c != a:
                o3 = c
            if b == d and b != a and d != c:
                o4 = d
            out[2 * y][2 * x], out[2 * y][2 * x + 1] = o1, o2
            out[2 * y + 1][2 * x], out[2 * y + 1][2 * x + 1] = o3, o4
    return out


def hx(c):
    return tuple(int(c[i:i + 2], 16) / 255 for i in (1, 3, 5))


def tohex(rgb):
    return "#%02x%02x%02x" % tuple(max(0, min(255, round(v * 255))) for v in rgb)


def shift(c, dl, hue_to, dh, ds=0.0):
    h, l, s = colorsys.rgb_to_hls(*hx(c))
    if s > 0.08:
        diff = ((hue_to - h + 0.5) % 1) - 0.5
        h = (h + max(-dh, min(dh, diff))) % 1
    l = max(0.0, min(1.0, l + dl))
    s = max(0.0, min(1.0, s + ds))
    return tohex(colorsys.hls_to_rgb(h, l, s))


def ramp(c):
    return {
        "hi": shift(c, +0.10, 1 / 6, 0.025, 0.0),
        "base": c,
        "sh": shift(c, -0.11, 2 / 3, 0.03, 0.03),
        "deep": shift(c, -0.21, 2 / 3, 0.05, 0.02),
    }


def steps(grid, y, x, dy, dx, color, limit=4):
    h, w = len(grid), len(grid[0])
    for k in range(1, limit + 1):
        yy, xx = y + dy * k, x + dx * k
        if not (0 <= yy < h and 0 <= xx < w) or grid[yy][xx] != color:
            return k
    return limit + 1


def regions(grid):
    h, w = len(grid), len(grid[0])
    seen = [[False] * w for _ in range(h)]
    size = [[0] * w for _ in range(h)]
    for y in range(h):
        for x in range(w):
            if seen[y][x] or grid[y][x] is None:
                continue
            c, q, comp = grid[y][x], deque([(y, x)]), []
            seen[y][x] = True
            while q:
                cy, cx = q.popleft()
                comp.append((cy, cx))
                for yy, xx in ((cy - 1, cx), (cy + 1, cx), (cy, cx - 1), (cy, cx + 1)):
                    if 0 <= yy < h and 0 <= xx < w and not seen[yy][xx] and grid[yy][xx] == c:
                        seen[yy][xx] = True
                        q.append((yy, xx))
            for cy, cx in comp:
                size[cy][cx] = len(comp)
    return size


def shade(grid):
    h, w = len(grid), len(grid[0])
    size = regions(grid)
    out = [row[:] for row in grid]
    for y in range(h):
        for x in range(w):
            c = grid[y][x]
            if c is None or size[y][x] < 10:
                continue
            r = ramp(c)
            up, left = steps(grid, y, x, -1, 0, c), steps(grid, y, x, 0, -1, c)
            down, right = steps(grid, y, x, 1, 0, c), steps(grid, y, x, 0, 1, c)
            if down == 1 and right == 1:
                out[y][x] = r["deep"]
            elif down == 1 or right == 1:
                out[y][x] = r["sh"]
            elif size[y][x] >= 60 and (down == 2 and right <= 3):
                out[y][x] = r["sh"]
            elif size[y][x] >= 16 and (up == 1 or left == 1):
                out[y][x] = r["hi"]
    return out


def reoutline(grid):
    h, w = len(grid), len(grid[0])
    out = [row[:] for row in grid]
    for y in range(h):
        for x in range(w):
            if grid[y][x] is not None:
                continue
            below = grid[y - 1][x] if y > 0 else None
            right = grid[y][x - 1] if x > 0 else None
            above = grid[y + 1][x] if y + 1 < h else None
            left = grid[y][x + 1] if x + 1 < w else None
            if below or right:
                out[y][x] = OUTLINE
            elif above or left:
                src = above or left
                out[y][x] = shift(src, -0.32, 2 / 3, 0.06, -0.05)
    return out


def upgrade(text):
    grid, glow, vw, vh = read_svg(text)
    # 自動描邊之外的內部深色線（"OUT" 落在色塊之間）保留為深色細節
    base = [[c if c != "OUT" else None for c in row] for row in grid]
    inner = [[c == "OUT" and any(
        0 <= y + dy < len(grid) and 0 <= x + dx < len(grid[0]) and grid[y + dy][x + dx] not in (None, "OUT")
        for dy, dx in ((0, 1), (0, -1)) ) and any(
        0 <= y + dy < len(grid) and 0 <= x + dx < len(grid[0]) and grid[y + dy][x + dx] not in (None, "OUT")
        for dy, dx in ((1, 0), (-1, 0))) for x, c in enumerate(row)] for y, row in enumerate(grid)]
    for y, row in enumerate(inner):
        for x, v in enumerate(row):
            if v:
                base[y][x] = "#1d1f2b"
    big = epx(base)
    big = shade(big)
    big = reoutline(big)
    gl = epx([[f"{g[0]}@{g[1]}" if g else None for g in row] for row in glow])
    return big, gl, vw, vh


def to_svg(grid, glow, vw, vh):
    gh, gw = len(grid), len(grid[0])
    px = vw / gw
    parts = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {vw:g} {vh:g}" width="{vw:g}" height="{vh:g}" shape-rendering="crispEdges">']
    for layer in (glow, grid):
        for y in range(gh):
            x = 0
            while x < gw:
                c = layer[y][x]
                if c is None or (layer is glow and grid[y][x] is not None):
                    x += 1
                    continue
                run = 1
                while x + run < gw and layer[y][x + run] == c and not (layer is glow and grid[y][x + run] is not None):
                    run += 1
                fill, op = (c.split("@") + [None])[:2]
                extra = f' fill-opacity="{op}"' if op else ""
                parts.append(f'<rect x="{x * px:g}" y="{y * px:g}" width="{run * px:g}" height="{px:g}" fill="{fill}"{extra}/>')
                x += run
    parts.append("</svg>")
    return "\n".join(parts) + "\n"


def refine(text):
    """基本像素圖（SVG 文字）→ 兩倍解析度、多階明暗的色格（每格 "#rrggbb" 或 "#rrggbb@不透明度"）。"""
    g, gl, _, _ = upgrade(text)
    return [[c if c is not None else gl[y][x] for x, c in enumerate(row)] for y, row in enumerate(g)]


def plain(text):
    """不精修，只把 SVG 方格讀回色格（雲、斬擊這類純白、遊戲裡會染色的圖）。"""
    grid, glow, _, _ = read_svg(text)
    return [[c if c not in (None, "OUT") else (f"{glow[y][x][0]}@{glow[y][x][1]}" if glow[y][x] else (OUTLINE if c == "OUT" else None))
             for x, c in enumerate(row)] for y, row in enumerate(grid)]


def write_png(grid, path):
    """色格 → PNG（RGBA，不壓縮色盤）。只用標準函式庫，美術產生器不必另裝套件。"""
    import struct
    import zlib
    h, w = len(grid), len(grid[0])
    raw = bytearray()
    for row in grid:
        raw.append(0)
        for c in row:
            if c is None:
                raw += b"\0\0\0\0"
                continue
            col, _, op = c.partition("@")
            a = round(float(op) * 255) if op else 255
            raw += bytes(int(col[i:i + 2], 16) for i in (1, 3, 5)) + bytes([a])

    def chunk(tag, data):
        body = tag + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)

    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(bytes(raw), 9)) + chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)
