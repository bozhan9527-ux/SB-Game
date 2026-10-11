"""產生全部像素美術到 public/art/，並寫出 src/data/art-manifest.json。

用法：python3 scripts/pixel-art/build.py
- 角色（門人、小妖、首領）：hd.py、hd_mobs.py、hd_bosses.py（原生解析度，engine.py 打光）
- 境界遠景：backdrops.py；戰場、山門、符紙、陣位：ui.py
- 符牌圖騰與介面圖示：這個檔案與 sprites.py（格子圖 → refine.py 精修）
改圖請改產生器再重跑，不要手改輸出的 PNG。
"""
import json
import math
import os
import random
import sys

import backdrops
import hd
import hd_bosses
import hd_mobs
import keyart
import ui
from engine import Sprite, to_hex_grid
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


def save_hd(prefix, fn, k=1.0, **kw):
    """原生解析度角色（hd.py）：四幀各算一次。k 是整體縮放（見 engine.Sprite）。"""
    Sprite.default_k = k
    try:
        grids = [to_hex_grid(fn(f, **kw).render()) for f in range(4)]
    finally:
        Sprite.default_k = 1.0
    for i, grid in enumerate(grids):
        write_png(grid, os.path.join(ART, f"{prefix}-{i}.png"))
    return grids


def measure(grids, scale):
    """貼圖尺寸與實際有畫的最上一列（四幀取最高），遊戲用來掛血條、決定顯示倍數。"""
    h, w = len(grids[0]), len(grids[0][0])
    top = min(next((y for y, row in enumerate(g) if any(c is not None for c in row)), h) for g in grids)
    return {"w": w, "h": h, "top": top, "scale": scale}


# 角色全部用原生解析度重畫（hd.py、hd_mobs.py、hd_bosses.py）。
HD_MOBS = {
    "wolf": hd.wolf, "bandit": hd.bandit, "wisp": hd.ghost,
    "bear": hd_mobs.bear, "yeti": hd_mobs.yeti, "centipede": hd_mobs.centipede, "scorpion": hd_mobs.scorpion,
    "serpent": hd_mobs.serpent, "undead": hd_mobs.undead, "demon": hd_mobs.demon, "celestial": hd_mobs.celestial,
    "treant": hd_mobs.treant, "golem": hd_mobs.golem,
    "fox": hd_mobs.fox, "toad": hd_mobs.toad, "bat": hd_mobs.bat, "skeleton": hd_mobs.skeleton, "puppet": hd_mobs.puppet,
    "spider": hd_mobs.spider, "lion": hd_mobs.lion, "crane": hd_mobs.crane, "raiju": hd_mobs.raiju, "jadeguard": hd_mobs.jadeguard,
}
# 小妖用 0.7 倍畫：一條路 99 點寬，原尺寸的狻猊一隻就 128 點，畫面會擠成一團。
MOB_K = 0.7
# 門人站在山門兩側的石階上，那一段只有六十幾點高。
DISCIPLE_K = 0.8
HD_BOSSES = [
    "beast", "ape", "fox", "corpse", "python", "bull", "bloodtao", "scorpking", "toad", "soullord", "ghostking", "bonelady",
    "elder", "faceless", "puppeteer", "devourer", "swordlord", "spider", "heavendemon", "beastemperor", "hydra",
    "demonemperor", "swordsea", "arhat", "storm", "tribulord", "thunderbird", "celestial", "fallen", "starlord",
]
HD_SCALE = 2


def inner(svg_text):
    return svg_text.split("\n", 1)[1].rsplit("</svg>", 1)[0]


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


if __name__ == "__main__":
    n = 0
    manifest = {"enemy": {}, "boss": {}, "disciple": {}}
    for sect in gen.SECTS:
        for tier in (0, 1, 2):
            grids = save_hd(f"disciple-{sect}-t{tier}", lambda f, sect=sect, tier=tier: hd.disciple(sect, tier, f), k=DISCIPLE_K)
            manifest["disciple"][sect] = measure(grids, HD_SCALE)
            n += 4
    for name, fn in HD_MOBS.items():
        manifest["enemy"][name] = measure(save_hd(f"enemy-{name}", fn, k=MOB_K), HD_SCALE)
        n += 4
    for name in HD_BOSSES:
        manifest["boss"][name] = measure(save_hd(f"boss-{name}", getattr(hd_bosses, name)), HD_SCALE)
        n += 4
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
    n += backdrops.build(ART)
    n += ui.build(ART)
    n += keyart.build(ART)
    # 尺寸清單給遊戲讀：顯示倍數、血條位置都從這裡來，重畫角色不必再手改程式裡的數字。
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "src", "data", "art-manifest.json")
    with open(out, "w") as fh:
        json.dump(manifest, fh, ensure_ascii=False, indent=1, sort_keys=True)
        fh.write("\n")
    print("wrote", n + 2, "to", ART)
