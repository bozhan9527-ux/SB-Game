"""產生全部像素美術到 public/art/。

用法：python3 scripts/pixel-art/build.py
改圖請改這裡或 sprites.py 再重跑，不要手改輸出的 SVG。
"""
import math
import os
import random
import sys

import sprites as gen
from refine import plain, refine, write_png
from sprites import blank, paint, put, outline, to_svg, check, GOLD, OUTLINE

ART = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "public", "art")
os.makedirs(ART, exist_ok=True)


# 雲與斬擊是純白、遊戲裡會染色，不打明暗；其餘角色、圖騰、圖示都精修。
PLAIN = ("cloud.svg", "slash.svg")


def save(name, text):
    grid = plain(text) if name in PLAIN else refine(text)
    write_png(grid, os.path.join(ART, name.replace(".svg", ".png")))


def inner(svg_text):
    return svg_text.split("\n", 1)[1].rsplit("</svg>", 1)[0]


def bottom(rows, w, h=28):
    rows = check(rows, w)
    return ["." * w] * (h - len(rows)) + rows


def sprite(rows, pal, w, vw, vh=56, under_fn=None):
    c = blank(w, len(rows))
    paint(c, rows, pal)
    c = outline(c)
    under = inner(under_fn(c)) if under_fn else None
    return to_svg(c, vw, vh, under=under)


def shadow_fn(w, h, x0, x1, vw):
    def fn(c):
        s = blank(w, h)
        for x in range(x0, x1):
            if c[h - 1][x] is None:
                s[h - 1][x] = "#000000@0.35"
        return to_svg(s, vw, 56)
    return fn


# =============== 妖物（28 列；寬度依原 viewBox） ===============
HUMAN_TOP = gen.HUMAN[:25]
HUMAN_LEGS = [gen.HUMAN[25], gen.HUMAN[26], gen.HUMAN[27]]
HUMAN_LEGS_ALT = check([
    "........PP..PP.........",
    "........PP..PP.........",
    ".......FFF..FFF........",
], 23)


def human_frames(pal, decorate, hop=False):
    out = []
    for f in (0, 1):
        rows = HUMAN_TOP + (HUMAN_LEGS if f == 0 else HUMAN_LEGS_ALT)
        if hop and f == 1:
            rows = rows[1:] + ["." * 23]
        c = blank(23, 28)
        paint(c, rows, pal)
        decorate(c, f, -1 if (hop and f == 1) else 0)
        c = outline(c)
        out.append(to_svg(c, 46, 56))
    return out


SKIN = dict(S="#f6d3a3", s="#d9a877", e="#1d1f2b")


def bandit_frames():
    pal = dict(SKIN, H="#2a2018", A="#d8c4a0", B="#8f6a48", C="#5e4430", D="#3a2a1c", P="#4a3a2a", F="#1e1712")

    def deco(c, f, dy):
        hat, hat_d = "#c9a86a", "#8a6a38"
        put(c, [(x, 4) for x in range(7, 16)], hat)
        put(c, [(x, 5) for x in range(5, 18)], hat)
        put(c, [(x, 6) for x in range(4, 19)], hat_d)
        put(c, [(9, 3), (10, 3), (11, 3), (12, 3), (10, 2), (11, 2)], hat)
        put(c, [(9, 2), (12, 2)], None)
        for y in (11, 12):
            put(c, [(x, y) for x in range(7, 15)], "#5a2a24")
        put(c, [(x, 13) for x in range(8, 14)], "#5a2a24")
        put(c, [(8, 9), (13, 9)], "#e04040")
        lift = -1 if f == 1 else 0
        blade = [(2, 6), (2, 7), (1, 8), (1, 9), (1, 10), (1, 11), (1, 12), (1, 13), (2, 14), (2, 15), (2, 16), (3, 17), (3, 18)]
        put(c, [(x, y + lift) for x, y in blade], "#e4ecf2")
        put(c, [(2, y + lift) for y in range(8, 14)], "#a8b8c6")
        put(c, [(x, 19 + lift) for x in range(2, 6)], "#8a6a38")
        put(c, [(4, 20 + lift), (4, 21 + lift)], "#3a2a1c")
    return human_frames(pal, deco)


def undead_frames():
    pal = dict(S="#a9c2a8", s="#7f9a80", e="#e04040", H="#2a2a30", A="#c0b890", B="#6f6e5a", C="#4a4a3a",
               D="#2e2e26", P="#3a3a30", F="#1a1a16")

    def deco(c, f, dy):
        put(c, [(9, 2 + dy), (10, 2 + dy), (11, 2 + dy), (12, 2 + dy), (9, 3 + dy), (12, 3 + dy)], None)
        put(c, [(10, 2 + dy), (11, 2 + dy)], "#c43a3a")
        put(c, [(x, 3 + dy) for x in range(8, 15)], "#2a2a30")
        put(c, [(x, 4 + dy) for x in range(6, 17)], "#2a2a30")
        put(c, [(x, 5 + dy) for x in range(5, 18)], "#4a4a56")
        for y in range(6, 12):
            put(c, [(10, y + dy), (11, y + dy)], "#f3df8a")
        flap = 1 if f == 1 else 0
        put(c, [(10, 7 + dy), (11, 8 + dy), (10, 9 + dy), (11, 10 + dy)], "#c43a3a")
        if flap:
            put(c, [(10, 12 + dy), (11, 12 + dy)], "#f3df8a")
        put(c, [(4, 21 + dy), (5, 21 + dy), (17, 21 + dy), (18, 21 + dy)], None)
        for x in list(range(0, 4)) + list(range(18, 23)):
            put(c, [(x, 16 + dy), (x, 17 + dy)], "#6f6e5a")
        put(c, [(0, 16 + dy), (0, 17 + dy), (22, 16 + dy), (22, 17 + dy)], "#a9c2a8")
        put(c, [(1, 17 + dy), (21, 17 + dy)], "#4a4a3a")
    return human_frames(pal, deco, hop=True)


def demon_frames():
    pal = dict(S="#3a1f4a", s="#2a1438", e="#ff5a7a", H="#2a1438", A="#c9a0e8", B="#7a4aa0", C="#4f2f70",
               D="#2a1840", P="#3a2458", F="#1a0f2a")

    def deco(c, f, dy):
        horn = "#e8dcc8"
        put(c, [(5, 2), (5, 3), (4, 1), (4, 0), (6, 4), (17, 2), (17, 3), (18, 1), (18, 0), (16, 4)], horn)
        put(c, [(8, 9), (13, 9)], "#ff5a7a" if f == 0 else "#ffb0c0")
        put(c, [(8, 10), (13, 10)], "#3a1f4a")
        spikes = "#c9a0e8"
        up = 1 if f == 1 else 0
        put(c, [(3, 14 - up), (2, 13 - up), (19, 14 - up), (20, 13 - up), (3, 15), (19, 15)], spikes)
        put(c, [(1, 12 - up), (21, 12 - up)], spikes)
        put(c, [(x, 20) for x in range(7, 16)], "#c43a6a")
        claw = "#e8dcc8"
        put(c, [(4, 22), (17, 22), (5, 22), (18, 22)], claw)
    return human_frames(pal, deco)


def celestial_frames():
    pal = dict(SKIN, H="#e8dcc0", A="#fff6d8", B="#e8ecf4", C="#9aa8c0", D="#f0c95a", P="#7a88a8", F="#4a5470")

    def deco(c, f, dy):
        helm = "#f0c95a"
        for x in range(7, 15):
            put(c, [(x, 3), (x, 4)], helm)
        put(c, [(x, 5) for x in range(6, 16)], "#c8a040")
        put(c, [(x, 6) for x in range(6, 16)], "#e8ecf4")
        put(c, [(10, 2), (11, 2), (10, 1), (11, 1)], "#d0453f")
        wing = "#ffffff"
        w = 1 if f == 1 else 0
        put(c, [(5, 4), (4, 3), (3, 2 - w), (4, 2), (5, 3), (16, 4), (17, 3), (18, 2 - w), (17, 2), (16, 3)], wing)
        put(c, [(x, 15) for x in range(6, 16)], "#f0c95a")
        put(c, [(10, 16), (11, 16), (10, 17), (11, 17)], "#f0c95a")
        lift = -1 if f == 1 else 0
        for y in range(4, 26):
            put(c, [(20, y + lift)], "#c8b080")
        put(c, [(20, 1 + lift), (20, 2 + lift), (20, 3 + lift), (19, 3 + lift), (21, 3 + lift)], "#e8f4ff")
        put(c, [(19, 5 + lift), (21, 5 + lift), (19, 4 + lift), (21, 4 + lift)], "#d0453f")
        put(c, [(18, 21), (19, 21)], "#f6d3a3")
    return human_frames(pal, deco)


def yeti_frames():
    top = [
        "......wwwwwwwwww.......",
        ".....wWWWWWWWWWWw......",
        "....wWWWWWWWWWWWWw.....",
        "....WWWbbbbbbbbWWW.....",
        "....WWbbebbbbebbWW.....",
        "....WWbbebbbbebbWW.....",
        "....WWbbbbbbbbbbWW.....",
        "....WWbbTbMMbTbbWW.....",
        "...wWWWbbbbbbbbWWWw....",
        "..wWWWWWWWWWWWWWWWWw...",
        ".wWWWWWWWWWWWWWWWWWWw..",
        ".WWWwWWWWWWWWWWWWwWWW..",
        "wWWWwWWWWWWWWWWWWwWWWw.",
        "wWWWwWWWWWWWWWWWWwWWWw.",
        "wWWwwWWWWWWWWWWWWwwWWw.",
        "bbbwwWWWWWWWWWWWWwwbbb.",
        "bbb.wWWWWWWWWWWWWw.bbb.",
        "....wWWWWWWWWWWWWw.....",
        "....wWWWWWWWWWWWWw.....",
        "....wwWWWWwwWWWWww.....",
    ]
    legs0 = ["....wWWWW..WWWWw......", "....wWWWW..WWWWw......", "....bbbbb..bbbbb......"]
    legs1 = [".....wWWW..WWWw.......", ".....wWWW..WWWw.......", ".....bbbb..bbbb.......", ]
    pal = dict(w="#a8bccc", W="#eef4fa", b="#7fa8c8", e="#1d2a40", T="#ffffff", M="#2a3a5a")
    out = []
    for f in (0, 1):
        rows = bottom(top + (legs0 if f == 0 else legs1), 23)
        if f == 1:
            rows = rows[1:] + ["." * 23]
            rows = bottom([r for r in top] + legs1, 23)
        out.append(sprite(rows, pal, 23, 46, under_fn=shadow_fn(23, 28, 3, 18, 46)))
    return out


def wolf_frames():
    return [gen.wolf(0), gen.wolf(1)]


def bear_frames():
    body = [
        "..bb..bb...............",
        ".bBBbbBBb..............",
        ".BBBBBBBBb...bbbbbbb...",
        "BBeBBBBBBBbbbBBBBBBBbb.",
        "BBBBBBBBBBBBBBBBBBBBBBb",
        "mMBBBBBBBBBBBBBBBBBBBBb",
        "MMMBBBBBBBBBBBBBBBBBBBb",
        ".MMBBBBBBBBBBBBBBBBBBBb",
        "..BBBBBBLLLLLLLLLBBBBBb",
        "...BBBBLLLLLLLLLLLBBBb.",
        "...bBBBBLLLLLLLLLBBBb..",
    ]
    legs0 = [
        "...bBBb.bbbb....bbbbBBb",
        "...bBBb.bbbb....bbbbBBb",
        "...bBBb.bbbb....bbbbBBb",
        "...bBBb.bbbb....bbbbBBb",
        "...cccc.cccc....ccccccc",
    ]
    legs1 = [
        "....bBBbbbb....bbbbBBb.",
        "....bBBbbbb....bbbbBBb.",
        ".....bBBbb......bbBBb..",
        ".....bBBbb......bbBBb..",
        ".....ccccc......ccccc..",
    ]
    pal = dict(B="#9a6a3c", b="#6a4424", L="#c89a68", M="#d8b48a", m="#1d1410", e="#ffd24a", c="#2a1a10")
    out = []
    for f in (0, 1):
        rows = bottom(body + (legs0 if f == 0 else legs1), 23)
        c = blank(23, 28)
        paint(c, rows, pal)
        put(c, [(0, 18)], "#1d1410")
        c = outline(c)
        out.append(to_svg(c, 46, 56))
    return out


def centipede_frames():
    W = 29
    out = []
    for f in (0, 1):
        c = blank(W, 28)
        seg_x = list(range(3, 27, 4))
        for i, sx in enumerate(seg_x):
            wob = 1 if (i + f) % 2 else 0
            cy = 21 - wob
            for dx in range(-2, 3):
                for dy in range(-2, 3):
                    if abs(dx) + abs(dy) <= 3:
                        c[cy + dy][sx + dx] = "#6fae4a" if dy < 1 else "#4a8a34"
            c[cy - 2][sx] = "#a8e07a"
            leg = "#c8a040"
            k = (i + f) % 2
            put(c, [(sx - 1 + k, cy + 3), (sx - 2 + k, cy + 4), (sx + 1 - k, cy + 3), (sx + 2 - k, cy + 4)], leg)
            put(c, [(sx - 2 + k, cy + 5), (sx + 2 - k, cy + 5)], leg)
        hx, hy = 2, 20
        for dx in range(-2, 3):
            for dy in range(-3, 3):
                if abs(dx) + abs(dy) <= 3:
                    c[hy + dy][hx + dx] = "#c0453a"
        put(c, [(1, 19), (3, 19)], "#ffd24a")
        put(c, [(0, 22), (1, 23), (3, 23), (4, 22)], "#f3eee2")
        put(c, [(1, 16), (0, 15), (0, 14), (3, 16), (4, 15), (5, 14 - f)], "#c8a040")
        c = outline(c)
        out.append(to_svg(c, 58, 56))
    return out


def scorpion_frames():
    W = 25
    body = [
        "....................ttt..",
        "...................tTTTt.",
        "..................tTsTt..",
        "..................tTt....",
        "..................tRt....",
        ".................tRRt....",
        "................tRRt.....",
        "...............tRRRt.....",
        "..............tRRRt......",
        "cc...........tRRRt.......",
        "cCc.......rrrrRRrr.......",
        "cCCcc..rrRRRRRRRRRr......",
        ".cCCCrrRRRRRRRRRRRRr.....",
        "..ccRRReRRRRRRRRRRRr.....",
        "cc..rRRRRRRRRRRRRRr......",
        "cCcccRRRrrrrrrrrrr.......",
        "cCCCcrrr.................",
        ".cc......................",
    ]
    legs0 = [
        "......l.l..l.l..l.l......",
        ".....l..l.l..l.l..l......",
        ".....l...l...l....l......",
    ]
    legs1 = [
        ".......l.l..l..l.l.......",
        "......l...l..l.l...l.....",
        "......l...l..l.....l.....",
    ]
    pal = dict(R="#d0503a", r="#8a2a20", C="#e07050", c="#a83a28", t="#8a2a20", T="#d0503a", s="#ffd24a",
               e="#ffd24a", l="#6a2018")
    out = []
    for f in (0, 1):
        b = list(body)
        if f == 1:
            b[0] = "...................ttt..."
            b[1] = "..................tTTTt.."
            b[2] = ".................tTsTt..."
            b[3] = ".................tTt....."
            b[4] = "..................tRt...."
        rows = bottom(b + (legs0 if f == 0 else legs1), W)
        c = blank(W, 28)
        paint(c, rows, pal)
        c = outline(c)
        out.append(to_svg(c, 50, 56))
    return out


def serpent_frames():
    out = []
    pal = dict(G="#4fae8a", g="#2f7a5e", Y="#d8e8a0", e="#ffd24a", r="#d0453f", k="#1d2a20")
    heads = [
        [
            "...gGGg................",
            "..gGGGGg...............",
            ".gGeGGGGg..............",
            "rgGGGGGGg..............",
            ".kGGGGGg...............",
            "..gGGGg................",
        ],
        [
            "....gGGg...............",
            "...gGGGGg..............",
            "..gGeGGGGg.............",
            "rrgGGGGGGg.............",
            "..kGGGGGg..............",
            "...gGGGg...............",
        ],
    ]
    for f in (0, 1):
        c = blank(23, 28)
        paint(c, bottom(heads[f], 23, 13), pal)
        # S 形身體：一串圓，隨幀位移
        pts = []
        for i in range(60):
            t = i / 59
            x = 6 + t * 13 + 4 * math.sin(t * 6.3 + f * 0.8) * (1 - t * 0.3)
            y = 12 + t * 13
            pts.append((x, y))
        for i, (x, y) in enumerate(pts):
            r = 2.6 - i / 59 * 1.2
            for yy in range(int(y - r), int(y + r) + 1):
                for xx in range(int(x - r), int(x + r) + 1):
                    if 0 <= xx < 23 and 0 <= yy < 28 and (xx - x) ** 2 + (yy - y) ** 2 <= r * r:
                        c[yy][xx] = "#4fae8a" if xx < x + 0.5 else "#2f7a5e"
        for i, (x, y) in enumerate(pts[::6]):
            xi, yi = int(x - 1), int(y)
            if 0 <= xi < 23 and 0 <= yi < 28 and c[yi][xi]:
                c[yi][xi] = "#d8e8a0"
        c = outline(c)
        out.append(to_svg(c, 46, 56))
    return out


# =============== BOSS（50×50，viewBox 200×200） ===============
def inside(poly, x, y):
    return gen.inside(poly, x, y)


def flames(c, centers, palette, seed):
    rnd = random.Random(seed)
    fl = blank(50, 50)
    for y in range(50):
        for x in range(50):
            if c[y][x] is not None:
                continue
            for (fx, fy, r) in centers:
                d = math.hypot(x - fx, (y - fy) * 0.7)
                if d < r and rnd.random() > 0.2:
                    fl[y][x] = palette[0] if d < r * 0.5 else palette[1]
    return inner(to_svg(fl, 200, 200))


def boss_demon_frames():
    out = []
    for f in (0, 1):
        c = blank(50, 50)
        lift = f
        hood = [(25, 2 + lift), (32, 4 + lift), (36, 10 + lift), (37, 17 + lift), (35, 23), (41, 30), (45, 40), (46, 49), (4, 49), (5, 40), (9, 30), (15, 23), (13, 17 + lift), (14, 10 + lift), (18, 4 + lift)]
        for y in range(50):
            for x in range(50):
                if inside(hood, x + 0.5, y + 0.5):
                    c[y][x] = "#6a4488"
                    if x > 29 + (y - 10) * 0.25:
                        c[y][x] = "#4a2f63"
                    if x < 20 - (y - 20) * 0.2 and y > 20:
                        c[y][x] = "#8a62a8"
        for y in range(28, 49):
            for x in (18 - (y - 28) // 3, 25, 32 + (y - 28) // 3):
                if c[y][x] is not None:
                    c[y][x] = "#3a2450"
        for y in range(50):
            for x in range(50):
                if ((x - 25) / 7.5) ** 2 + ((y - 15 - lift) / 8.5) ** 2 < 1:
                    c[y][x] = "#160c22"
        eye = "#ff5a7a" if f == 0 else "#ff8aa0"
        for x, y in [(21, 15), (22, 15), (23, 16), (27, 16), (28, 15), (29, 15)]:
            c[y + lift][x] = eye
        for x, y in [(22, 16), (28, 16)]:
            c[y + lift][x] = "#ffffff" if f else "#ffd0da"
        for x in range(14, 37):
            y = 27 + int(2 * math.sin((x - 14) / 22 * math.pi))
            if c[y][x] is not None:
                c[y][x] = GOLD
        for x, y in [(25, 29), (24, 30), (25, 30), (26, 30), (25, 31)]:
            c[y][x] = "#c43a3a"
        for (bx, by) in ((8, 36 - f), (40, 36 - f)):
            for dx in range(-2, 3):
                for dy in range(-1, 2):
                    c[by + dy][bx + dx] = "#a8c0a8"
            for k in (-2, 0, 2):
                c[by - 2][bx + k] = "#d8e8d0"
                c[by - 3][bx + k] = "#d8e8d0"
        c = outline(c)
        under = flames(c, ((5, 42, 6 + f), (45, 42, 6 + f), (25, 3, 4), (10, 26, 3 + f), (40, 26, 3 + f)), ("#b06aff@0.55", "#7a3ad0@0.35"), 11 + f)
        out.append(to_svg(c, 200, 200, under=under))
    return out


def boss_beast_frames():
    out = []
    for f in (0, 1):
        c = blank(50, 50)
        for y in range(50):
            for x in range(50):
                dx, dy = (x - 25) / 16, (y - 25) / 16
                if dx * dx + dy * dy < 1 and y < 42:
                    c[y][x] = "#b8483a" if x < 30 else "#8a3028"
                if y >= 30 and abs(x - 25) < 12 - (y - 30) * 0.9 and y < 44:
                    c[y][x] = "#b8483a" if x < 28 else "#8a3028"
        # 角
        for i in range(14):
            for side in (-1, 1):
                x = 25 + side * (12 + i)
                y = 14 - int(i * 0.9) + (i * i) // 22
                for t in range(0, 3 - i // 6):
                    yy = y + t
                    if 0 <= x < 50 and 0 <= yy < 50:
                        c[yy][x] = "#f0e6cc" if t == 0 else "#c8b890"
        # 眉骨與眼
        for x in range(13, 37):
            c[18][x] = "#5a1a14"
        glow = "#ffe066" if f == 0 else "#ffffff"
        for (ex) in (18, 30):
            for dx in range(0, 3):
                c[21][ex + dx] = glow
                c[20][ex + dx] = "#ffb030"
        # 嘴
        open_ = 2 + f * 2
        for y in range(30, 31 + open_):
            for x in range(17, 34):
                c[y][x] = "#3a0c0a"
        for x in (18, 22, 28, 32):
            c[30][x] = "#f3eee2"
            c[31][x] = "#f3eee2"
        for x in (20, 30):
            c[30 + open_][x] = "#f3eee2"
            c[29 + open_][x] = "#f3eee2"
        # 鼻
        put(c, [(23, 25), (27, 25), (24, 26), (26, 26)], "#3a0c0a")
        # 鬃毛
        for y in range(8, 40):
            for side in (-1, 1):
                x = 25 + side * (17 + int(2 * math.sin(y * 0.8 + f)))
                if 0 <= x < 50:
                    c[y][x] = "#e07a2a" if y % 3 else "#f0c95a"
        c = outline(c)
        under = flames(c, ((25, 27, 24 + f),), ("#ff8a3a@0.22", "#ff5a2a@0.14"), 21 + f)
        out.append(to_svg(c, 200, 200, under=under))
    return out


def boss_storm_frames():
    out = []
    for f in (0, 1):
        c = blank(50, 50)
        blobs = [(15, 20, 9), (25, 15, 11), (36, 20, 9), (20, 24, 9), (31, 24, 9)]
        for y in range(50):
            for x in range(50):
                for (bx, by, r) in blobs:
                    if math.hypot(x - bx, (y - by - f * 0.6) * 1.1) < r:
                        c[y][x] = "#4a5a78" if y > 20 + f else "#6a7a98"
                        if y < 10 + f:
                            c[y][x] = "#8a9ab8"
        for x in range(8, 43):
            if c[30][x]:
                c[30][x] = "#36405a"
        eye = "#ffe066"
        for x in range(18, 23):
            c[21 + f][x] = eye
        for x in range(28, 33):
            c[21 + f][x] = eye
        put(c, [(17, 20 + f), (33, 20 + f)], "#ffe066")
        bolt = [(26, 31), (25, 32), (24, 33), (23, 34), (22, 35), (23, 36), (24, 36), (25, 36), (24, 37), (23, 38), (22, 39), (21, 40), (20, 41), (19, 42)]
        bolt2 = [(15, 31), (14, 33), (13, 35), (14, 36), (13, 38), (12, 40)]
        bolt3 = [(36, 31), (37, 33), (38, 35), (37, 36), (38, 38), (39, 40)]
        bolts = bolt + (bolt3 if f == 0 else bolt2)
        for x, y in bolts:
            put(c, [(x, y), (x + 1, y)], "#fff07a")
        for x, y in bolts[::3]:
            put(c, [(x + 2, y)], "#ffffff")
        c = outline(c)
        rain = blank(50, 50)
        rnd = random.Random(31 + f)
        for _ in range(40):
            x, y = rnd.randrange(4, 46), rnd.randrange(30, 50)
            if c[y][x] is None:
                rain[y][x] = "#9fc8ff@0.55"
                if y + 1 < 50 and c[y + 1][x] is None:
                    rain[y + 1][x] = "#9fc8ff@0.3"
        under = inner(to_svg(rain, 200, 200)) + flames(c, ((25, 20, 22),), ("#8a9aff@0.18", "#6a7ad0@0.1"), 41)
        out.append(to_svg(c, 200, 200, under=under))
    return out


def boss_celestial_frames():
    out = []
    for f in (0, 1):
        c = blank(50, 50)
        # 身軀：白金甲
        body = [(25, 26), (36, 30), (40, 40), (42, 49), (8, 49), (10, 40), (14, 30)]
        for y in range(50):
            for x in range(50):
                if inside(body, x + 0.5, y + 0.5):
                    c[y][x] = "#e8ecf4" if x < 28 else "#b8c4d8"
        for y in range(32, 49):
            c[y][25] = "#f0c95a"
        for x in range(13, 38):
            if c[34][x]:
                c[34][x] = "#f0c95a"
        put(c, [(24, 36), (25, 36), (26, 36), (25, 37), (25, 35)], "#7fdba0")
        # 肩甲
        for (sx, d) in ((14, -1), (36, 1)):
            for dx in range(0, 6):
                for dy in range(0, 3):
                    c[29 + dy][sx + d * dx] = "#f0c95a" if dy == 0 else "#c8a040"
        # 頭盔與面具
        for y in range(8, 27):
            for x in range(50):
                if ((x - 25) / 7) ** 2 + ((y - 18) / 9) ** 2 < 1:
                    c[y][x] = "#d8dce8" if x < 27 else "#a8b0c4"
        for y in range(15, 23):
            for x in range(20, 31):
                if ((x - 25) / 5) ** 2 + ((y - 19) / 4.5) ** 2 < 1:
                    c[y][x] = "#2a3048"
        eye = "#9fe8ff" if f == 0 else "#ffffff"
        put(c, [(22, 19), (23, 19), (27, 19), (28, 19)], eye)
        for i in range(5):
            put(c, [(25 - i // 2, 8 - i), (25 + i // 2, 8 - i)], "#f0c95a")
        put(c, [(25, 4), (25, 3)], "#d0453f")
        for i in range(6):
            put(c, [(17 - i, 12 - i // 2 - (f if i > 3 else 0)), (33 + i, 12 - i // 2 - (f if i > 3 else 0))], "#ffffff")
        # 長槍
        for y in range(2, 50):
            put(c, [(45, y)], "#c8b080")
        tip = [(45, 0), (44, 1), (45, 1), (46, 1), (44, 2), (45, 2), (46, 2), (45, 3)]
        put(c, tip, "#e8f4ff")
        put(c, [(44, 5), (46, 5), (44, 6), (46, 6)], "#d0453f")
        put(c, [(42, 38), (43, 38), (44, 38), (42, 39), (43, 39)], "#f6d3a3")
        c = outline(c)
        halo = blank(50, 50)
        for y in range(50):
            for x in range(50):
                d = math.hypot(x - 25, y - 17)
                if c[y][x] is None:
                    if 13.2 < d < 14.8:
                        halo[y][x] = "#f0c95a" if (int(math.degrees(math.atan2(y - 17, x - 25))) // 15 + f) % 2 else "#fff2bf"
                    elif d < 13 and (x + y + f) % 2 == 0:
                        halo[y][x] = "#fff2bf@0.18"
        out.append(to_svg(c, 200, 200, under=inner(to_svg(halo, 200, 200))))
    return out


# =============== 符牌圖騰（16×20） ===============
G = {}
G["sword"] = (gen.GLYPH_SWORD, dict(W="#f4fbff", g="#8fb8d8", Y=GOLD, J="#7fdba0", N="#6a4228", n="#3e2716", R="#d0453f"), "#7fd8ff")
G["flame"] = (gen.GLYPH_FLAME, dict(R="#d0453f", O="#f08a3a", Y="#ffd24a", W="#fff6d8"), "#e08a5a")
G["bolt"] = ([
    "..........PPPP..",
    ".........PWWP...",
    "........PWWP....",
    ".......PWWP.....",
    "......PWWP......",
    ".....PWWP.......",
    "....PWWWPPPPP...",
    "...PWWWWWWWWP...",
    "...PPPPPWWWP....",
    ".......PWWP.....",
    "......PWWP......",
    ".....PWWP.......",
    "....PWWP........",
    "...PWWP.........",
    "...PWP..........",
    "..PWP...........",
    "..PP............",
    "................",
    "................",
    "................",
], dict(P="#c79cf0", W="#fff6a8"), "#c79cf0")
G["fan"] = ([
    "................",
    "..........GGG...",
    "........GGWW....",
    "......GGWW......",
    ".....GWW........",
    "....GW..........",
    "................",
    "..........GGG...",
    "........GGWW....",
    "......GGWW......",
    ".....GWW........",
    "....GW..........",
    "................",
    "..........GGG...",
    "........GGWW....",
    "......GGWW......",
    ".....GWW........",
    "....GW..........",
    "................",
    "................",
], dict(G="#8fe08a", W="#e8ffe0"), "#8fe08a")
G["frost"] = ([
    "................",
    ".......WW.......",
    "....W..WW..W....",
    ".....W.WW.W.....",
    "..W...WCCW...W..",
    "...WW.WCCW.WW...",
    ".....WCCCCW.....",
    ".WWWWCCWWCCWWWW.",
    ".WWWWCCWWCCWWWW.",
    ".....WCCCCW.....",
    "...WW.WCCW.WW...",
    "..W...WCCW...W..",
    ".....W.WW.W.....",
    "....W..WW..W....",
    ".......WW.......",
    "................",
    "................",
    "................",
    "................",
    "................",
], dict(W="#e8fcff", C="#7fe0e8"), "#7fe0e8")
G["pyre"] = ([
    "......R.........",
    "......RR....R...",
    ".R...RRR...RR...",
    ".RR..RORR..RRR..",
    ".RRR.ROORR.RORR.",
    ".RORRROOORRROOR.",
    "RROORROYOORROOR.",
    "RROOOROYYOOROOOR",
    "RROOOOYYYYOOOOOR",
    "RROOOYYYYYYOOOOR",
    "RROOYYYWWYYYOOOR",
    "RROOYYWWWWYYOOOR",
    "RROOYYWWWWWYYOOR",
    ".RROYYWWWWWYYORR",
    ".RROOYYWWWYYOORR",
    "..RROOYYYYYOORR.",
    "...RROOOOOOORR..",
    "....RRRRRRRRR...",
    "...kkkkkkkkkkk..",
    "..kkKKkkKKkkKkk.",
], dict(R="#e0402a", O="#f06a4a", Y="#ffc04a", W="#fff6d8", k="#3a2418", K="#6a4228"), "#f06a4a")
G["pierce"] = ([
    "................",
    "....CCCC........",
    "..CCWWWWCC......",
    ".CWWWWWWWWC.CCC.",
    "CWWWWWWWWWWCWWWC",
    "CCCCCCCCCCCCCCCC",
    "................",
    "..A.............",
    "..AA............",
    "AAAAAAAAAAAAAA..",
    "AAAAAAAAAAAAAAA.",
    "AAAAAAAAAAAAAAAA",
    "AAAAAAAAAAAAAAA.",
    "AAAAAAAAAAAAAA..",
    "..AA............",
    "..A.............",
    "................",
    "....CCCCCCCC....",
    "..CCWWWWWWWWCC..",
    "CCCCCCCCCCCCCCCC",
], dict(C="#a8b8ff", W="#e8ecff", A="#f4f8ff"), "#a8b8ff")
G["breaker"] = ([
    "................",
    "..OOOOOOOOOOOO..",
    "..OYYYYYkYYYYO..",
    "..OYOOOOkOOOYO..",
    "..OYOOOkkOOOYO..",
    "..OYOOOkOOOOYO..",
    "..OYOOkkOOOOYO..",
    "..OYOOOkkOOOYO..",
    "..OYOOOOkOOOYO..",
    "...OYOOkkOOYO...",
    "...OYOOkOOOYO...",
    "....OYOkOOYO....",
    "....OYkkOOYO....",
    ".....OYkOYO.....",
    "......OkYO......",
    ".......OO.......",
    "................",
    "................",
    "................",
    "................",
], dict(O="#e8a06a", Y="#ffd6a8", k="#3a2418"), "#e8a06a")
G["fortune"] = (None, None, "#f0c65a")
G["soul"] = ([
    "................",
    ".....MMMMMM.....",
    "...MMMMMMMMMM...",
    "..MMMMMMMMMMMM..",
    "..MMMMMMMMMMMM..",
    ".MMkkkMMMMkkkMM.",
    ".MMkWkMMMMkWkMM.",
    ".MMkkkMMMMkkkMM.",
    ".MMMMMMMMMMMMMM.",
    "..MMMMMkkMMMMM..",
    "..MMMMMMMMMMMM..",
    "...MMkMkMkMkM...",
    "...MMMMMMMMMM...",
    "....MMMMMMMM....",
    ".....MM..MM.....",
    "....MM....MM....",
    "...MM......MM...",
    "................",
    "................",
    "................",
], dict(M="#c86ab0", k="#2a1028", W="#ffd0f0"), "#c86ab0")
G["abyss"] = (None, None, "#8a7ad0")
G["spirit"] = (None, None, "#9fe8d8")
G["gale"] = ([
    "................",
    "..GGGGGGGGG.....",
    ".........GGG....",
    "..........GG....",
    ".....GGGGGG.....",
    "................",
    "GGGGGGGGGGGGGG..",
    "..............G.",
    "...........GG.GG",
    "............GGG.",
    "................",
    "...GGGGGGGGGG...",
    "............GG..",
    "........GG..GG..",
    ".........GGGG...",
    "................",
    ".GGGGGGG........",
    "................",
    "................",
    "................",
], dict(G="#a8f0c0"), "#a8f0c0")
G["tempest"] = (None, None, "#d0b0ff")
G["bastion"] = ([
    "................",
    "................",
    "......B.........",
    ".....BBB........",
    "....BBWBB...B...",
    "...BBWWBBB.BBB..",
    "..BBBBBBBBBBWBB.",
    ".BBBBBBBBBBBBBBB",
    "BBBBBBBBBBBBBBBB",
    "SSSSSSSSSSSSSSSS",
    "S.S.S.S.S.S.S.S.",
    "SSSSSSSSSSSSSSSS",
    "SSkkSSSSSSSSkkSS",
    "SSkkSSSSSSSSkkSS",
    "SSSSSSkkkkSSSSSS",
    "SSSSSSkkkkSSSSSS",
    "SSSSSSkkkkSSSSSS",
    "................",
    "................",
    "................",
], dict(B="#8a9a7a", W="#f0f4e8", S="#c8b48a", k="#3a2a18"), "#c8b48a")
G["taiyi"] = (None, None, "#f0e0a8")
G["slayer"] = ([
    "........W.......",
    ".......WWR......",
    ".......WWR......",
    ".......WWR......",
    ".......WWR......",
    ".......WWR......",
    ".......WWR......",
    ".......WWR......",
    ".......WWR......",
    ".......WWR......",
    ".......WWR......",
    "...R...WWR...R..",
    "...RR..WWR..RR..",
    "...RRRRRRRRRRR..",
    "....RRRYYRRRR...",
    ".......NNN......",
    ".......NnN......",
    ".......NNN......",
    "......RRRRR.....",
    ".......RRR......",
], dict(W="#fff0f0", R="#ff6a6a", Y=GOLD, N="#5a2020", n="#2a0c0c"), "#ff8f8f")
G["myriad"] = ([
    "................",
    "W......W......W.",
    ".W.....W.....W..",
    "..W....W....W...",
    "...W...W...W....",
    "....W..W..W.....",
    ".....W.W.W......",
    "W.....WWW.....W.",
    ".WWWWWWWWWWWWW..",
    "......WWW.......",
    ".....YYYYY......",
    "......NNN.......",
    "......NNN.......",
    "......NNN.......",
    ".....YYYYY......",
    "................",
    "................",
    "................",
    "................",
    "................",
], dict(W="#d8ecff", Y=GOLD, N="#4a5a7a"), "#9fd0ff")
G["grand"] = (None, None, "#e8d0ff")
G["seal"] = ([
    "...YYYYYYYYYY...",
    "...YPPPPPPPPY...",
    "...YPPPPPPPPY...",
    "...YPPRRRRPPY...",
    "...YPPPRRPPPY...",
    "...YPRRRRRRPY...",
    "...YPPPRRPPPY...",
    "...YPPRRRRPPY...",
    "...YPPRPPRPPY...",
    "...YPPRRRRPPY...",
    "...YPPPRRPPPY...",
    "...YPRRRRRRPY...",
    "...YPPPRRPPPY...",
    "...YPPPRRPPPY...",
    "...YPPRRRRPPY...",
    "...YPPPPPPPPY...",
    "...YYYYYYYYYY...",
    "......L..L......",
    ".....L....L.....",
    "................",
], dict(Y="#b08ad0", P="#f3df8a", R="#c43a3a", L="#b08ad0"), "#b08ad0")


def disc(c, cx, cy, r, color):
    for y in range(len(c)):
        for x in range(len(c[0])):
            if (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r:
                c[y][x] = color


def procedural_glyph(name):
    c = blank(16, 20)
    if name == "fortune":
        disc(c, 8, 9, 7.2, "#b8862a")
        disc(c, 8, 9, 6.2, "#f0c65a")
        disc(c, 8, 9, 4.6, "#ffe08a")
        for y in range(7, 11):
            for x in range(6, 10):
                c[y][x] = "#7a5418"
        put(c, [(4, 6), (5, 5)], "#fff6d8")
    elif name == "abyss":
        disc(c, 8, 9, 7.4, "#8a7ad0")
        disc(c, 8, 9, 6, "#4a3a8a")
        disc(c, 8, 9, 4.2, "#22184a")
        disc(c, 8, 9, 2.2, "#0a0618")
        put(c, [(3, 5), (12, 13), (13, 4)], "#c8b8ff")
    elif name == "spirit":
        for (dx, dy) in ((0, -4.5), (0, 4.5), (-4.5, 0), (4.5, 0)):
            disc(c, 8 + dx, 9 + dy, 2.6, "#9fe8d8")
        for (dx, dy) in ((-3.2, -3.2), (3.2, 3.2), (-3.2, 3.2), (3.2, -3.2)):
            disc(c, 8 + dx, 9 + dy, 1.6, "#5fbfa8")
        disc(c, 8, 9, 2.4, "#ffffff")
    elif name == "taiyi":
        disc(c, 8, 9, 7.2, "#f0e0a8")
        for y in range(20):
            for x in range(16):
                if c[y][x] and x + 0.5 > 8:
                    c[y][x] = "#3a2a48"
        disc(c, 8, 5.4, 3.6, "#f0e0a8")
        disc(c, 8, 12.6, 3.6, "#3a2a48")
        disc(c, 8, 5.4, 1.2, "#3a2a48")
        disc(c, 8, 12.6, 1.2, "#f0e0a8")
    elif name == "tempest":
        disc(c, 8, 9, 7.4, "#d0b0ff")
        disc(c, 8, 9, 6.2, "#4a2a7a")
        bolt = [(9, 3), (8, 4), (8, 5), (7, 6), (7, 7), (6, 8), (7, 9), (8, 9), (9, 9), (9, 10), (8, 11), (8, 12), (7, 13), (7, 14)]
        for x, y in bolt:
            put(c, [(x, y), (x + 1, y)], "#fff6a8")
    elif name == "grand":
        for gy in range(3):
            for gx in range(3):
                x0, y0 = 2 + gx * 4, 3 + gy * 4
                col = "#ffffff" if (gx, gy) == (1, 1) else "#e8d0ff"
                for y in range(y0, y0 + 3):
                    for x in range(x0, x0 + 3):
                        c[y][x] = col
                if (gx, gy) != (1, 1):
                    c[y0 + 2][x0 + 2] = "#a888d0"
    return c


def glyph_svg(name):
    rows, pal, glow = G[name]
    if rows is None:
        c = procedural_glyph(name)
    else:
        c = blank(16, 20)
        paint(c, check(rows, 16), pal)
    c = outline(c)
    g = blank(16, 20)
    for y in range(20):
        for x in range(16):
            if c[y][x] is None and ((x - 7.5) / 8) ** 2 + ((y - 9) / 10) ** 2 < 1 and (x + y) % 2 == 0:
                g[y][x] = glow + "@0.16"
    return to_svg(c, 32, 40, under=inner(to_svg(g, 32, 40)))


# =============== 介面圖示（16×16） ===============
ICONS = {
    "scroll": (gen.ICON_SCROLL, gen.ICON_PAL),
    "cave": (gen.ICON_CAVE, gen.ICON_PAL),
    "help": ([
        "................",
        ".....PPPPPP.....",
        "....PPkkkkPP....",
        "...PPkPPPPkPP...",
        "...PPPPPPPkPP...",
        "...PPPPPPkPPP...",
        "....PPPPkPPP....",
        ".....PPPkPP.....",
        "......PkPP......",
        "......PPPP......",
        "......PkPP......",
        "......PPPP......",
        ".....YYYYYY.....",
        "................",
        "................",
        "................",
    ], dict(P="#f2e6c4", k="#2a1e14", Y=GOLD)),
    "music": ([
        ".......YY.......",
        "......YYYY......",
        "....YYYYYYYY....",
        "...YyyyyyyyyY...",
        "...YyYYYYYYyY...",
        "...YyYYYYYYyY...",
        "...YyYYYYYYyY...",
        "..YYyYYYYYYyYY..",
        "..YyyyyyyyyyyY..",
        ".YYYYYYYYYYYYYY.",
        ".YYYYYYYYYYYYYY.",
        "......YkkY......",
        ".......YY.......",
        "w..............w",
        ".w............w.",
        "................",
    ], dict(Y=GOLD, y="#b8862a", k="#5a3e10", w="#9fe8d8")),
    "rank": ([
        "................",
        ".......YY.......",
        "......YWWY......",
        ".......YY.......",
        "......GGGG......",
        "......GWGG......",
        "......GGGG......",
        "..SSSSGGGG......",
        "..SWSSGGGG......",
        "..SSSSGGGGBBBB..",
        "..SSSSGGGGBWBB..",
        "..SSSSGGGGBBBB..",
        "..SSSSGGGGBBBB..",
        ".kkkkkkkkkkkkkk.",
        "................",
        "................",
    ], dict(Y=GOLD, W="#ffffff", G=GOLD, S="#c8d0dc", B="#d08a4a", k="#5a3e10")),
    "record": ([
        "................",
        ".bbbbbbb.bbbbbbb",
        ".bPPPPPPbPPPPPPb",
        ".bPPPPPPbPPYPPPb",
        ".bPkkkkPbPYYYPPb",
        ".bPPPPPPbYYYYYPb",
        ".bPkkkPPbPYYYPPb",
        ".bPPPPPPbPYPYPPb",
        ".bPkkkkPbPPPPPPb",
        ".bPPPPPPbPkkkkPb",
        ".bPkkPPPbPPPPPPb",
        ".bPPPPPPbPkkkPPb",
        ".bbbbbbbbbbbbbbb",
        "..rrrrrrrrrrrrr.",
        "................",
        "................",
    ], dict(b="#7a4a28", P="#f2e6c4", k="#8a7a5a", Y=GOLD, r="#c43a3a")),
    "save": ([
        "................",
        ".....WWWW.......",
        "...WWWWWWWW.WW..",
        "..WWWWWWWWWWWWW.",
        ".WWWWWWWWWWWWWW.",
        ".CCCCCCCCCCCCCC.",
        "................",
        ".......GG.......",
        ".......GG.......",
        ".......GG.......",
        ".....GGGGGG.....",
        "......GGGG......",
        ".......GG.......",
        "..YYYYYYYYYYYY..",
        "..YyyyyyyyyyyY..",
        "................",
    ], dict(W="#eef4fa", C="#a8bccc", G="#7fdba0", Y=GOLD, y="#b8862a")),
    "sect": ([
        "......YYYY......",
        "....TTTTTTTT....",
        "..TTTTTTTTTTTT..",
        "TTTTTTTTTTTTTTTT",
        "..RRRRRRRRRRRR..",
        "..YYYYkkkkYYYY..",
        "..RR..YYYY..RR..",
        "..RR........RR..",
        "..RR..kkkk..RR..",
        "..RR..kkkk..RR..",
        "..RR..kkkk..RR..",
        "..RR..kkkk..RR..",
        "SSSSSSSSSSSSSSSS",
        "SSSSSSSSSSSSSSSS",
        "................",
        "................",
    ], dict(Y=GOLD, T="#2f6a62", R="#b8322f", k="#2a1a14", S="#8a8070")),
    "trial": ([
        ".....R....R.....",
        "....RO...RO.....",
        "....RO....RO....",
        ".....R....R.....",
        "................",
        ".BBBBBBBBBBBBBB.",
        "..bBBBBBBBBBBb..",
        "..BBBkkBBkkBBB..",
        "..BBBBBBBBBBBB..",
        "..BBBkBkkBkBBB..",
        "...BBBBBBBBBB...",
        "...bBBBBBBBBb...",
        "....bBBBBBBb....",
        "....B......B....",
        "...BB......BB...",
        "................",
    ], dict(R="#d0453f", O="#f08a3a", B="#c89a5a", b="#8a6230", k="#5a3e20")),
}


def icon_svg(name):
    rows, pal = ICONS[name]
    c = blank(16, 16)
    paint(c, check(rows, 16), pal)
    c = outline(c)
    return to_svg(c, 32, 32)


# =============== 特效：祥雲與斬擊（白色，遊戲內會染色） ===============
def cloud_svg():
    c = blank(60, 20)
    for (cx, cy, r) in ((14, 11, 6), (24, 8, 7.5), (35, 9, 6.5), (44, 12, 5)):
        disc(c, cx, cy, r, "#ffffff")
    for y in range(12, 17):
        for x in range(8, 50):
            c[y][x] = "#ffffff"
    for x, y in [(50, 15), (52, 15), (53, 14), (54, 13), (54, 12), (53, 11), (52, 11), (51, 12), (5, 15), (4, 15), (3, 14), (2, 13), (2, 12), (3, 11), (4, 11)]:
        c[y][x] = "#ffffff"
    for y in range(20):
        for x in range(60):
            if c[y][x] and y >= 15 and (x + y) % 2:
                c[y][x] = "#ffffff@0.7"
    return to_svg(c, 240, 80)


def slash_svg():
    c = blank(40, 40)
    for i in range(400):
        t = i / 399
        ang = math.radians(200 + t * 110)
        r = 30 - 4 * abs(t - 0.5) * 2
        w = 3.4 * math.sin(t * math.pi) + 0.4
        for k in range(int(w * 2) + 1):
            rr = r - k * 0.5
            x = 34 + rr * math.cos(ang)
            y = 36 + rr * math.sin(ang)
            xi, yi = int(x), int(y)
            if 0 <= xi < 40 and 0 <= yi < 40:
                c[yi][xi] = "#ffffff" if k < w else "#ffffff@0.55"
    return to_svg(c, 160, 160)


# =============== 山門牌坊（一格三點，橫跨整個畫面寬） ===============
def gate_beam():
    W, H = 180, 10
    teal, teal_l, teal_d = "#2f6a62", "#4a8f84", "#1a3f3a"
    red, red_l, red_d = "#b8322f", "#d8504a", "#6e1a1a"
    gold, gold_d = "#f0c95a", "#a8782a"
    c = [[None] * W for _ in range(H)]
    for x in range(W):
        c[0][x] = teal_l if x % 4 == 0 else teal
        c[1][x] = teal if x % 4 else teal_d
        c[2][x] = teal_d
        c[3][x] = OUTLINE
        for y in (4, 5, 6):
            c[y][x] = red_l if y == 4 else red
        c[7][x] = red_d
        c[8][x] = OUTLINE
        if x % 12 == 6:
            c[5][x] = gold
            c[6][x] = gold_d
    # 中央匾額：深底金框，「山門」兩個字由遊戲疊上去
    for y in range(1, 10):
        for x in range(74, 106):
            edge = y in (1, 9) or x in (74, 105)
            c[y][x] = gold if edge else "#1a1410"
    for x in (75, 104):
        c[2][x] = gold_d
    return c


def gate_post():
    W, H = 8, 34
    c = [[None] * W for _ in range(H)]
    for y in range(H):
        for x in range(W):
            if y < 3:
                c[y][x] = "#f0c95a" if y == 1 else "#a8782a"
            elif x in (0, 7):
                c[y][x] = OUTLINE
            else:
                c[y][x] = "#d8504a" if x == 2 else "#6e1a1a" if x == 6 else "#b8322f"
        if y % 9 == 5:
            for x in range(1, 7):
                c[y][x] = "#f0c95a"
    for x in range(W):
        c[H - 1][x] = OUTLINE
        c[0][x] = OUTLINE
    return c


MOBS = {
    "wolf": wolf_frames, "bear": bear_frames, "yeti": yeti_frames, "centipede": centipede_frames,
    "scorpion": scorpion_frames, "serpent": serpent_frames, "bandit": bandit_frames, "undead": undead_frames,
    "demon": demon_frames, "celestial": celestial_frames,
}
BOSSES = {"beast": boss_beast_frames, "demon": boss_demon_frames, "storm": boss_storm_frames, "celestial": boss_celestial_frames}

if __name__ == "__main__":
    n = 0
    for sect in gen.SECTS:
        for tier in (0, 1, 2):
            for frame in (0, 1):
                save(f"disciple-{sect}-t{tier}-{frame}.svg", gen.disciple(sect, tier, frame))
                n += 1
    for name, fn in MOBS.items():
        for f, svg in enumerate(fn()):
            save(f"enemy-{name}-{f}.svg", svg)
            n += 1
    for name, fn in BOSSES.items():
        for f, svg in enumerate(fn()):
            save(f"boss-{name}-{f}.svg", svg)
            n += 1
    for name in G:
        save(f"glyph-{name}.svg", glyph_svg(name))
        n += 1
    for name in ICONS:
        save(f"icon-{name}.svg", icon_svg(name))
        n += 1
    write_png(gate_beam(), os.path.join(ART, "gate-beam.png"))
    write_png(gate_post(), os.path.join(ART, "gate-post.png"))
    save("cloud.svg", cloud_svg())
    save("slash.svg", slash_svg())
    print("wrote", n + 2, "to", ART)
