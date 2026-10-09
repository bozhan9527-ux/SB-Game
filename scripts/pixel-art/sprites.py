"""像素畫的共用工具與門人、狼妖等基本造型：格子圖 → 自動描邊 → 合併成 SVG rect。"""
import math

OUTLINE = "#12141c"


def blank(w, h):
    return [[None] * w for _ in range(h)]


def paint(canvas, rows, pal, ox=0, oy=0):
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch == "." or ch == " ":
                continue
            cx, cy = ox + x, oy + y
            if 0 <= cy < len(canvas) and 0 <= cx < len(canvas[0]):
                canvas[cy][cx] = pal[ch]


def put(canvas, pts, color):
    for x, y in pts:
        if 0 <= y < len(canvas) and 0 <= x < len(canvas[0]):
            canvas[y][x] = color


def outline(canvas, color=OUTLINE):
    h, w = len(canvas), len(canvas[0])
    out = [row[:] for row in canvas]
    for y in range(h):
        for x in range(w):
            if canvas[y][x] is not None:
                continue
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < w and 0 <= ny < h and canvas[ny][nx] is not None and not str(canvas[ny][nx]).startswith("~"):
                    out[y][x] = color
                    break
    return out


def to_svg(canvas, vw, vh, under=None, over=None):
    h, w = len(canvas), len(canvas[0])
    px = vw / w
    parts = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {vw} {vh}" width="{vw}" height="{vh}" shape-rendering="crispEdges">']
    if under:
        parts.append(under)
    for y in range(h):
        x = 0
        while x < w:
            c = canvas[y][x]
            if c is None:
                x += 1
                continue
            run = 1
            while x + run < w and canvas[y][x + run] == c:
                run += 1
            fill = c.lstrip("~")
            op = ""
            if "@" in fill:
                fill, a = fill.split("@")
                op = f' fill-opacity="{a}"'
            parts.append(f'<rect x="{x * px:g}" y="{y * px:g}" width="{run * px:g}" height="{px:g}" fill="{fill}"{op}/>')
            x += run
    if over:
        parts.append(over)
    parts.append("</svg>")
    return "\n".join(parts) + "\n"


def check(rows, w):
    rows = [r[:w] + r[w:].rstrip(".") for r in rows]
    for i, r in enumerate(rows):
        assert len(r) <= w, (i, len(r), r)
    return [r.ljust(w, ".") for r in rows]


# ---------------- 門人（20×28 格，每格 2，viewBox 40×56） ----------------
BASE = check([
    "....................",
    ".......HHHH.........",
    ".......HHHH.........",
    ".....HHHHHHHH.......",
    "....HHHHHHHHHH......",
    "....HHHHHHHHHH......",
    "....HHSSSSSSHH......",
    "....HSSSSSSSSH......",
    "....HSeSSSSeSH......",
    "....HSeSSSSeSH......",
    ".....SrSSSSrS.......",
    ".....sSSSSSSs.......",
    "......ssssss........",
    "....CBBAAAABBC......",
    "...CBBBBAABBBBC.....",
    "..CBBBBBBABBBBBC....",
    "..BBCBBBBABBBCBB....",
    "..BBCBBBBBABBCBB....",
    "..BBCBBBBBBABCBB....",
    "..BBCDDDDDDDDCBB....",
    "..CBCDDDGDDDDCBC....",
    "..SSCBBBDBBBBCSS....",
    "...CBBBBDBBBBBC.....",
    "...CBBBBBDBBBBC.....",
    "..CBBBBBBBBBBBBC....",
    "..CCCCCCCCCCCCCC....",
    ".....PP....PP.......",
    "....FFF....FFF......",
], 20)

LEGS_ALT = check([
    "......PP..PP........",
    ".....FFF..FFF.......",
], 20)

SKIN = {"S": "#f6d3a3", "s": "#d9a877", "e": "#1d1f2b", "r": "#f0a08a"}

SECTS = {
    "sword": dict(H="#2a2f3d", A="#f4fbff", B="#a9d4f2", C="#5f93bd", D="#2c4a66", G="#7fdba0", P="#2f4d66", F="#1e2a36"),
    "body": dict(H="#3a2a1e", A="#ffe0b0", B="#e8904a", C="#a85a28", D="#5a3418", G="#f0d060", P="#6b4024", F="#2e1d12"),
    "talisman": dict(H="#6b52a8", A="#d9cbf5", B="#9a7fd0", C="#5f4a8f", D="#3a2c5c", G="#f0d26a", P="#3a2c5c", F="#1d1630"),
    "alchemy": dict(H="#2b3a24", A="#e4f7d8", B="#8fd27a", C="#4f9a45", D="#7a5530", G="#f0d060", P="#3e6b3a", F="#2a2016"),
}

GOLD = "#f0c95a"
GOLD_D = "#b8862a"
WHITE = "#f8fbff"


def disciple(sect, tier, frame):
    pal = dict(SKIN)
    pal.update(SECTS[sect])
    rows = list(BASE)
    if frame == 1:
        rows = rows[:26] + LEGS_ALT
    c = blank(20, 28)

    # 巔峰：身後披風（畫在本體之前）
    if tier == 2:
        cape = "#1f2f52" if sect != "body" else "#5a1f1a"
        if sect == "talisman":
            cape = "#2a1d48"
        if sect == "alchemy":
            cape = "#1f3a2a"
        for y in range(14, 26):
            spread = (y - 14) // 3
            put(c, [(1 - spread // 2 if 1 - spread // 2 >= 0 else 0, y), (16 + spread // 2, y)], cape)
            put(c, [(1, y), (16, y)], cape)
        put(c, [(0, 24), (0, 25), (17, 24), (17, 25)], cape)
        put(c, [(0, 25), (17, 25), (1, 25), (16, 25)], GOLD)

    paint(c, rows, pal)

    # 門派特徵
    if sect == "sword":
        put(c, [(7, 1), (10, 1)], "#7fdba0")  # 玉簪
        blade = [(16, y) for y in range(4, 19)]
        edge = [(17, y) for y in range(4, 19)]
        put(c, blade, WHITE)
        put(c, edge, "#9fc0d8")
        put(c, [(16, 3)], WHITE)
        put(c, [(15, 19), (16, 19), (17, 19), (18, 19)], GOLD)
        put(c, [(16, 20), (16, 21)], "#5a3a22")
        put(c, [(17, 20), (17, 21)], "#3e2716")
        put(c, [(16, 22)], GOLD)
        put(c, [(17, 23), (17, 24), (16, 25)], "#d0453f")
    elif sect == "body":
        # 短髮＋頭帶與飄帶，拳頭加大
        put(c, [(7, 1), (8, 1), (9, 1), (10, 1), (7, 2), (10, 2)], None)
        put(c, [(8, 2), (9, 2)], pal["H"])
        put(c, [(x, 5) for x in range(4, 14)], "#f0d060")
        put(c, [(14, 4), (15, 3), (16, 3), (15, 5), (16, 6), (17, 6)], "#f0d060")
        put(c, [(1, 21), (2, 22), (3, 22), (16, 21), (15, 22), (14, 22)], pal["S"])
        put(c, [(2, 21), (3, 21), (14, 21), (15, 21)], pal["S"])
        put(c, [(2, 22), (15, 22)], pal["s"])
    elif sect == "talisman":
        # 兜帽罩住頭，臉在陰影裡只剩眼光；右手持黃符
        hood = pal["H"]
        for y in range(1, 13):
            for x in range(3, 15):
                pass
        put(c, [(6, 1), (11, 1), (5, 2), (6, 2), (11, 2), (12, 2)], hood)
        put(c, [(3, 6), (3, 7), (3, 8), (3, 9), (3, 10), (14, 6), (14, 7), (14, 8), (14, 9), (14, 10)], hood)
        put(c, [(4, 10), (4, 11), (13, 10), (13, 11), (4, 12), (5, 12), (12, 12), (13, 12)], hood)
        shade, eye = "#2a2140", "#ffe9a8"
        for y in range(6, 13):
            for x in range(5, 13):
                if c[y][x] in (pal["S"], pal["s"], pal["r"], pal["e"]):
                    c[y][x] = shade
        put(c, [(6, 8), (7, 8), (10, 8), (11, 8)], eye)
        put(c, [(6, 9), (11, 9)], shade)
        put(c, [(x, 6) for x in range(5, 13)], "#4a3a78")
        paper = "#f3df8a"
        for y in range(14, 21):
            put(c, [(16, y), (17, y), (18, y)], paper)
        put(c, [(17, 15), (17, 16), (16, 17), (18, 17), (17, 18), (17, 19)], "#c43a3a")
        put(c, [(15, 21)], pal["S"])
    elif sect == "alchemy":
        # 背後靈草，右側葫蘆，斜背帶
        leaf = "#5fbf55"
        put(c, [(2, 9), (3, 10), (1, 8), (2, 8), (0, 7), (1, 7), (3, 11), (3, 12), (4, 9)], leaf)
        put(c, [(2, 10), (4, 10)], "#3e8f3a")
        for i, (x, y) in enumerate([(12, 13), (11, 14), (10, 15), (9, 16), (8, 17), (7, 18)]):
            put(c, [(x, y)], pal["D"])
        gourd = "#e0a050"
        put(c, [(16, 17), (17, 17)], "#7a5530")
        put(c, [(16, 18), (17, 18), (15, 19), (16, 19), (17, 19), (18, 19)], gourd)
        for y in range(20, 25):
            put(c, [(15, y), (16, y), (17, y), (18, y)], gourd)
        put(c, [(16, 20), (17, 20)], "#c0392b")
        put(c, [(18, 20), (18, 21), (18, 22), (18, 23), (17, 24), (18, 24)], "#b07030")
        put(c, [(15, 21), (15, 22)], "#ffd08a")

    # 境界階級
    if tier >= 1:
        put(c, [(x, 13) for x in range(4, 14)], GOLD)
        put(c, [(3, 14), (14, 14)], GOLD)
        put(c, [(x, 25) for x in range(3, 15)], GOLD)
        put(c, [(8, 20)], "#7fdba0")
    if tier == 2:
        crown = [(7, 0), (9, 0), (11, 0) if sect != "talisman" else (10, 0), (7, 1), (8, 1), (9, 1), (10, 1), (11, 1)]
        if sect == "talisman":
            crown = [(6, 0), (8, 0), (9, 0), (11, 0), (7, 1), (10, 1)]
        if sect == "body":
            crown = [(6, 0), (8, 0), (9, 0), (11, 0), (7, 1), (8, 1), (9, 1), (10, 1)]
        put(c, crown, GOLD)
        put(c, [(8, 1) if sect == "sword" else (9, 1)], "#7fdba0")

    c = outline(c)

    under = None
    if tier == 2:
        aura_color = {"sword": "#9fdcff", "body": "#ffc070", "talisman": "#c9a0ff", "alchemy": "#9fffb0"}[sect]
        a = blank(20, 28)
        for y in range(28):
            for x in range(20):
                d = ((x - 8.5) / 10) ** 2 + ((y - 14) / 14) ** 2
                if d < 1 and c[y][x] is None:
                    a[y][x] = aura_color + ("@0.42" if d < 0.55 else "@0.2")
        for x, y in [(1, 4), (18, 9), (0, 18), (19, 22), (17, 1)]:
            if c[y][x] is None:
                a[y][x] = "#ffffff"
        under = to_svg(a, 40, 56).split("\n", 1)[1].rsplit("</svg>", 1)[0]
    return to_svg(c, 40, 56, under=under)


# ---------------- 敵人（23×28 格，viewBox 46×56） ----------------
WOLF = check([
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "...d...d...............",
    "...dd.ddd..............",
    "...dpdddd...........dd.",
    "...dFFFFd..m.m.m...dFd.",
    "..FFFFFFFdmmmmmmm.dFFd.",
    "..FFxEFFFFdddddddFFFd..",
    ".FFFEEFFFFFFFFFFFFFF...",
    "LLLFFFFFFFFFFFFFFFFFF..",
    "LLLLFFFFFFFFFFFFFFFFFd.",
    "nLLLFFFFFxFFFFxFFFFFFd.",
    ".MMMLFFFFFxFFFFxFFFFFd.",
    ".TMTLLFFFFFFFFFFFFFFFd.",
    "....LLLLLLLLLLLLLLLFdd.",
    ".....dFFLLLLLLLLLFFd....",
    ".....dd.dd....dd.dd.....",
    ".....dd.dd....dd.dd.....",
    ".....dd.dd....dd.dd.....",
    ".....dd.dd....dd.dd.....",
    ".....TT.TT....TT.TT.....",
], 23)
WOLF_PAL = dict(F="#7a8291", d="#454b58", L="#c2c8d2", E="#ffd24a", x="#d0404a", M="#5a1418", T="#f3eee2",
                n="#12141c", p="#8a2a34", m="#2e323c")

HUMAN = check([
    "",
    "",
    ".........HHHH..........",
    ".........HHHH..........",
    ".......HHHHHHHH........",
    "......HHHHHHHHHH.......",
    "......HHHHHHHHHH.......",
    "......HHSSSSSSHH.......",
    "......HSSSSSSSSH.......",
    "......HSeSSSSeSH.......",
    "......HSeSSSSeSH.......",
    ".......SSSSSSSS........",
    ".......sSSSSSSs........",
    "........ssssss.........",
    "......CBBAAAABBC.......",
    ".....CBBBBAABBBBC......",
    "....CBBBBBBABBBBBC.....",
    "....BBCBBBBABBBCBB.....",
    "....BBCBBBBBABBCBB.....",
    "....BBCDDDDDDDDCBB.....",
    "....CBCDDDDDDDDCBC.....",
    "....SSCBBBBBBBBCSS.....",
    ".....CBBBBBBBBBBC......",
    ".....CBBBBBBBBBBC......",
    "....CCCCCCCCCCCCCC.....",
    ".......PP....PP........",
    ".......PP....PP........",
    "......FFF....FFF.......",
], 23)


def wolf(frame):
    rows = list(WOLF)
    if frame == 1:
        rows = rows[:22] + check([
            "....dd...dd..dd...dd....",
            "...dd....dd..dd....dd...",
            "...dd....dd..dd....dd...",
            "..dd.....dd..dd.....dd..",
            "..TT.....TT..TT.....TT..",
        ], 24)
        rows = [r[:23] for r in rows]
    c = blank(23, 28)
    paint(c, rows, WOLF_PAL)
    c = outline(c)
    mist = blank(23, 28)
    for x in range(1, 22):
        for y in (26, 27):
            if c[y][x] is None and (x + y) % 2 == 0:
                mist[y][x] = "#9a6ad8@0.35"
    under = to_svg(mist, 46, 56).split("\n", 1)[1].rsplit("</svg>", 1)[0]
    return to_svg(c, 46, 56, under=under)


def bandit():
    pal = dict(SKIN)
    pal.update(H="#2a2018", A="#d8c4a0", B="#8f6a48", C="#5e4430", D="#3a2a1c", P="#4a3a2a", F="#1e1712")
    c = blank(23, 28)
    paint(c, HUMAN, pal)
    hat = "#c9a86a"
    hat_d = "#8a6a38"
    put(c, [(x, 4) for x in range(7, 16)], hat)
    put(c, [(x, 5) for x in range(5, 18)], hat)
    put(c, [(x, 6) for x in range(4, 19)], hat_d)
    put(c, [(9, 3), (10, 3), (11, 3), (12, 3), (10, 2), (11, 2)], hat)
    put(c, [(9, 2), (12, 2)], None)
    put(c, [(x, 11) for x in range(7, 15)], "#5a2a24")
    put(c, [(x, 12) for x in range(7, 15)], "#5a2a24")
    put(c, [(x, 13) for x in range(8, 14)], "#5a2a24")
    put(c, [(8, 9), (13, 9)], "#e04040")
    put(c, [(8, 10), (13, 10)], pal["S"])
    blade = "#e4ecf2"
    for i, (x, y) in enumerate([(2, 6), (2, 7), (1, 8), (1, 9), (1, 10), (1, 11), (1, 12), (1, 13), (2, 14), (2, 15), (2, 16), (3, 17), (3, 18)]):
        put(c, [(x, y)], blade)
    put(c, [(2, 8), (2, 9), (2, 10), (2, 11), (2, 12), (2, 13)], "#a8b8c6")
    put(c, [(2, 19), (3, 19), (4, 19), (5, 19)], "#8a6a38")
    put(c, [(4, 20), (4, 21)], "#3a2a1c")
    c = outline(c)
    return to_svg(c, 46, 56)


def undead():
    pal = dict(S="#a9c2a8", s="#7f9a80", e="#e04040", r="#a9c2a8")
    pal.update(H="#2a2a30", A="#c0b890", B="#6f6e5a", C="#4a4a3a", D="#2e2e26", P="#3a3a30", F="#1a1a16")
    rows = [r for r in HUMAN]
    c = blank(23, 28)
    paint(c, rows, pal)
    # 清朝官帽
    put(c, [(9, 2), (10, 2), (11, 2), (12, 2), (9, 3), (12, 3)], None)
    put(c, [(10, 2), (11, 2)], "#c43a3a")
    put(c, [(x, 3) for x in range(8, 15)], "#2a2a30")
    put(c, [(x, 4) for x in range(6, 17)], "#2a2a30")
    put(c, [(x, 5) for x in range(5, 18)], "#4a4a56")
    # 額前黃符
    for y in range(6, 12):
        put(c, [(10, y), (11, y)], "#f3df8a")
    put(c, [(10, 7), (11, 8), (10, 9), (11, 10)], "#c43a3a")
    # 雙臂平舉：袖子往兩側伸
    put(c, [(4, 21), (5, 21), (17, 21), (18, 21)], None)
    for x in list(range(0, 4)) + list(range(18, 23)):
        put(c, [(x, 16), (x, 17)], pal["B"])
    put(c, [(0, 16), (0, 17), (22, 16), (22, 17)], pal["S"])
    put(c, [(1, 17), (21, 17)], pal["C"])
    c = outline(c)
    return to_svg(c, 46, 56)


# ---------------- BOSS（50×50 格，viewBox 200×200） ----------------
def inside(poly, x, y):
    n, j, hit = len(poly), len(poly) - 1, False
    for i in range(n):
        xi, yi = poly[i]
        xj, yj = poly[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            hit = not hit
        j = i
    return hit


def boss_demon():
    W = H = 50
    c = blank(W, H)
    hood = [(25, 2), (32, 4), (36, 10), (37, 17), (35, 23), (41, 30), (45, 40), (46, 49), (4, 49), (5, 40), (9, 30), (15, 23), (13, 17), (14, 10), (18, 4)]
    for y in range(H):
        for x in range(W):
            if inside(hood, x + 0.5, y + 0.5):
                c[y][x] = "#6a4488"
    # 明暗：右側陰影、左側受光
    for y in range(H):
        for x in range(W):
            if c[y][x] is None:
                continue
            if x > 29 + (y - 10) * 0.25:
                c[y][x] = "#4a2f63"
            if x < 20 - (y - 20) * 0.2 and y > 20:
                c[y][x] = "#8a62a8"
    # 衣褶
    for y in range(28, 49):
        for x in (18 - (y - 28) // 3, 25, 32 + (y - 28) // 3):
            if c[y][x] is not None:
                c[y][x] = "#3a2450"
    # 面門：空洞
    for y in range(H):
        for x in range(W):
            if ((x - 25) / 7.5) ** 2 + ((y - 15) / 8.5) ** 2 < 1:
                c[y][x] = "#160c22"
    for x, y in [(21, 15), (22, 15), (23, 16), (27, 16), (28, 15), (29, 15)]:
        c[y][x] = "#ff5a7a"
    for x, y in [(22, 16), (28, 16)]:
        c[y][x] = "#ffd0da"
    # 金色護符與法鍊
    for x in range(14, 37):
        y = 27 + int(2 * math.sin((x - 14) / 22 * math.pi))
        if c[y][x] is not None:
            c[y][x] = GOLD
    for x, y in [(25, 29), (24, 30), (25, 30), (26, 30), (25, 31)]:
        c[y][x] = "#c43a3a"
    # 鬼爪
    for (bx, by) in ((8, 36), (40, 36)):
        for dx in range(-2, 3):
            for dy in range(-1, 2):
                c[by + dy][bx + dx] = "#a8c0a8"
        for k in (-2, 0, 2):
            c[by - 2][bx + k] = "#d8e8d0"
            c[by - 3][bx + k] = "#d8e8d0"
    c = outline(c)
    # 魔焰
    fl = blank(W, H)
    for y in range(H):
        for x in range(W):
            if c[y][x] is not None:
                continue
            for (fx, fy, r) in ((5, 42, 6), (45, 42, 6), (25, 3, 4), (10, 26, 3), (40, 26, 3)):
                d = math.hypot(x - fx, (y - fy) * 0.7)
                if d < r and (x * 7 + y * 3) % 5 != 0:
                    fl[y][x] = "#b06aff@0.55" if d < r * 0.5 else "#7a3ad0@0.35"
    under = to_svg(fl, 200, 200).split("\n", 1)[1].rsplit("</svg>", 1)[0]
    return to_svg(c, 200, 200, under=under)


# ---------------- 符牌圖騰（16×20 格，viewBox 32×40） ----------------
GLYPH_SWORD = check([
    "........W.......",
    ".......WWg......",
    ".......WWg......",
    ".......WWg......",
    ".......WWg......",
    ".......WWg......",
    ".......WWg......",
    ".......WWg......",
    ".......WWg......",
    ".......WWg......",
    ".......WWg......",
    ".......WWg......",
    ".......WWg......",
    "..YY...WWg...YY.",
    "..YYYYYYYYYYYYY.",
    "....YYYJJYYYY...",
    ".......NNN......",
    ".......NnN......",
    ".......NNN......",
    "......RYYY......",
], 16)
GLYPH_FLAME = check([
    "........R.......",
    ".......RR.......",
    ".......RRR......",
    "......RROR...R..",
    "...R..ROOR..RR..",
    "...RR.ROOOR.RR..",
    "..RRR.ROOOORRR..",
    "..RRRRROYOORRR..",
    "..RROORRYYOOORR.",
    ".RROOOORYYOOOOR.",
    ".RROOOYYYYYOOOR.",
    ".RROOYYYWWYYOOR.",
    ".RROOYYWWWWYOOR.",
    ".RROOYYWWWWYOOR.",
    "..RROYYWWWYYOR..",
    "..RROOYYYYYOOR..",
    "...RROOOOOOORR..",
    "....RRRRRRRRR...",
    "......RRRRR.....",
    "................",
], 16)
GLYPH_PAL = dict(W="#f4fbff", g="#8fb8d8", Y=GOLD, J="#7fdba0", N="#6a4228", n="#3e2716", R="#d0453f",
                 O="#f08a3a")


def glyph(rows, glow):
    c = blank(16, 20)
    paint(c, rows, GLYPH_PAL)
    c = outline(c)
    g = blank(16, 20)
    for y in range(20):
        for x in range(16):
            if c[y][x] is None and ((x - 7.5) / 8) ** 2 + ((y - 9) / 10) ** 2 < 1 and (x + y) % 2 == 0:
                g[y][x] = glow + "@0.16"
    under = to_svg(g, 32, 40).split("\n", 1)[1].rsplit("</svg>", 1)[0]
    return to_svg(c, 32, 40, under=under)


# ---------------- 圖示（16×16 格，viewBox 32×32） ----------------
ICON_SCROLL = check([
    "................",
    "YwwwwwwwwwwwwwwY",
    "YwwwwwwwwwwwwwwY",
    ".pPPPPPPPPPPPPp.",
    ".pPPPPkPPkPPkPp.",
    ".pPPPPkPPkPPkPp.",
    ".pPPPPkPPkPPkPp.",
    ".pPPPPkPPPPPkPp.",
    ".pPPPPkPPPPPPPp.",
    ".pPrrPPPPPPPPPp.",
    ".pPrrPPPPPPPPPp.",
    ".pPPPPPPPPPPPPp.",
    "YwwwwwwwwwwwwwwY",
    "YwwwwwwwwwwwwwwY",
    "................",
    "................",
], 16)
ICON_CAVE = check([
    "................",
    "......mmmm......",
    "....mmMMMMmm....",
    "...mMMMMMMMMm...",
    "..mMMMMMMMMMMm..",
    ".mMMMMddddMMMMm.",
    ".mMMMdddddddMMm.",
    "mMMMddRRRRdddMMm",
    "mMMMdRRRRRRddMMm",
    "mMMddRRYYRRRdMMm",
    "mMMddRYYYYRRdMMm",
    "mMMddRYYYYRRdMMm",
    "mMMddRRRRRRRdMMm",
    "gggggggggggggggg",
    "GGGGGGGGGGGGGGGG",
    "................",
], 16)
ICON_PAL = dict(Y=GOLD, w="#7a4a28", P="#f2e6c4", p="#d6c497", k="#2a1e14", r="#c43a3a",
                m="#5a6270", M="#8a94a2", d="#2a2f3a", R="#d0453f", G="#3e8f3a", g="#6fbf62")


def icon(rows):
    c = blank(16, 16)
    paint(c, rows, ICON_PAL)
    c = outline(c)
    return to_svg(c, 32, 32)
