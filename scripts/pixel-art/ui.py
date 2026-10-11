"""戰鬥畫面的材質：石板戰場、山門（朱欄＋角樓＋石階）、符紙、空陣位。

全部是半解析（一格 = 遊戲裡 2 點），遊戲裡放大兩倍。
石頭用中性偏暖的灰：十個境界的遠景換色，戰場不跟著換，才不會有哪一關的石板和妖物撞色。
"""
import math
import os

from backdrops import BAYER, dith, hx, mix
from refine import write_png

EDGE = "#0e0606"
STONE = ["#2a2226", "#3a3034", "#4a3e40", "#5c4e4e", "#74645e"]
LACQUER = ["#6e1a18", "#b3302a", "#d8483a", "#f07a5a"]
WOOD = ["#24100c", "#4a2218", "#7a3a24"]
GOLD = ["#a7742a", "#f0c75e", "#fff1b0"]
PAPER = ["#c99a5e", "#dcb47a", "#ecd09a", "#f6e4b8"]
INK = "#3a1c14"
CINNABAR = "#b3302a"


def hexc(c):
    return "#%02x%02x%02x" % c


class Grid:
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.px = [[None] * w for _ in range(h)]

    def set(self, x, y, c, a=1.0):
        if not (0 <= x < self.w and 0 <= y < self.h):
            return
        if isinstance(c, tuple):
            c = hexc(c)
        self.px[y][x] = c if a >= 1 else f"{c}@{a:.3f}"

    def rect(self, x, y, w, h, c, a=1.0):
        for j in range(y, y + h):
            for i in range(x, x + w):
                self.set(i, j, c, a)


# ---------------------------------------------------------------- 戰場
def arena():
    """妖魔走的石板道：遠處淡、近處實，板縫錯開；兩側石欄。"""
    w, h = 248, 310
    g = Grid(w, h)
    row_y = [0]
    # 越近越高的石板列：有一點透視，不是死板的方格
    while row_y[-1] < h:
        row_y.append(row_y[-1] + 9 + len(row_y) // 3)
    for r in range(len(row_y) - 1):
        y0, y1 = row_y[r], min(h, row_y[r + 1])
        width = 26 + r
        offset = (r % 2) * (width // 2)
        for y in range(y0, y1):
            f = y / h
            alpha = 0.22 + 0.6 * f
            for x in range(3, w - 3):
                k = (x + offset) // width
                tone = 1 + ((k * 7 + r * 3) % 3 == 0)
                c = STONE[tone]
                if y == y0:
                    c = STONE[0]  # 橫縫
                elif (x + offset) % width == 0:
                    c = STONE[0]  # 豎縫
                elif y == y0 + 1:
                    c = STONE[tone + 1]  # 板緣受光
                elif ((x * 13 + y * 7) % 23 == 0):
                    c = STONE[0]  # 坑洞
                g.set(x, y, c, alpha)
    # 兩側石欄
    for side in (0, w - 3):
        for y in range(h):
            for i, c in enumerate((STONE[4], STONE[3], STONE[1]) if side == 0 else (STONE[1], STONE[3], STONE[4])):
                g.set(side + i, y, c)
        for y in range(4, h, 22):
            for i in range(-1, 4):
                g.set(side + i, y, STONE[4])
                g.set(side + i, y + 1, STONE[3])
                g.set(side + i, y + 2, STONE[1])
    return g.px


# ---------------------------------------------------------------- 山門
GATE_W, GATE_H = 270, 74
RAIL_TOP = 36  # 朱欄上緣（半解析列）；遊戲裡圖的頂端放在 GATE_Y - 72


def gate():
    g = Grid(GATE_W, GATE_H)
    # 石階：朱欄底下到手牌托盤之間
    for y in range(42, GATE_H):
        step = (y - 42) // 8
        for x in range(GATE_W):
            c = STONE[3] if (y - 42) % 8 == 0 else STONE[2 - (step % 2)]
            if (x + step * 9) % 30 == 0 and (y - 42) % 8:
                c = STONE[0]
            g.set(x, y, c)
    for x in range(GATE_W):
        g.set(x, 42, STONE[0])
        g.set(x, 43, STONE[4])
    # 朱欄：一條橫木＋立柱
    y = RAIL_TOP
    g.rect(0, y - 1, GATE_W, 1, GOLD[1])
    g.rect(0, y, GATE_W, 6, LACQUER[1])
    g.rect(0, y, GATE_W, 1, LACQUER[3])
    g.rect(0, y + 1, GATE_W, 1, LACQUER[2])
    g.rect(0, y + 5, GATE_W, 1, LACQUER[0])
    g.rect(0, y + 6, GATE_W, 1, EDGE)
    for x in range(6, GATE_W - 4, 12):
        g.rect(x, y + 1, 2, 4, LACQUER[0])
        g.set(x, y + 1, LACQUER[2])
    # 匾額
    cx = GATE_W // 2
    g.rect(cx - 23, 32, 46, 13, EDGE)
    g.rect(cx - 22, 33, 44, 11, GOLD[0])
    g.rect(cx - 22, 33, 44, 1, GOLD[2])
    g.rect(cx - 21, 34, 42, 9, GOLD[1])
    g.rect(cx - 20, 35, 40, 7, WOOD[1])
    g.rect(cx - 20, 35, 40, 1, WOOD[0])
    # 兩座角樓：站在戰場外側那一條窄邊上，不擋妖魔的路
    for tx in (6, GATE_W - 7):
        g.rect(tx - 5, 8, 11, 34, EDGE)
        g.rect(tx - 4, 9, 9, 33, LACQUER[1])
        g.rect(tx - 4, 9, 2, 33, LACQUER[2])
        g.rect(tx + 3, 9, 2, 33, LACQUER[0])
        g.rect(tx - 2, 18, 5, 7, "#ffcf6a")
        g.rect(tx - 2, 18, 5, 1, GOLD[2])
        g.rect(tx, 18, 1, 7, LACQUER[0])
        for (ry, half) in ((6, 8), (0, 6)):
            g.rect(tx - half, ry, half * 2 + 1, 4, WOOD[1])
            g.rect(tx - half, ry, half * 2 + 1, 1, WOOD[2])
            g.rect(tx - half, ry + 4, half * 2 + 1, 1, GOLD[1])
            g.set(tx - half - 1, ry - 1, WOOD[2])
            g.set(tx + half + 1, ry - 1, WOOD[2])
        g.rect(tx - 4, 41, 9, 2, STONE[4])
    return g.px


# ---------------------------------------------------------------- 符紙與陣位
def paper():
    """符紙：上淺下深的黃紙，四周一圈烤過的焦邊，上緣一道硃砂印。"""
    w, h = 36, 44
    g = Grid(w, h)
    for y in range(h):
        f = y / (h - 1)
        for x in range(w):
            k = f * 2.2
            tone = 3 - int(k) - (1 if dith(x, y, k - int(k)) else 0)
            g.set(x, y, PAPER[max(0, min(3, tone))])
    for x in range(w):
        for y in (0, h - 1):
            g.set(x, y, PAPER[0])
    for y in range(h):
        for x in (0, w - 1):
            g.set(x, y, PAPER[0])
    # 硃砂符頭
    g.rect(w // 2 - 7, 2, 14, 2, CINNABAR)
    g.rect(w // 2 - 5, 4, 10, 1, CINNABAR)
    g.set(w // 2, 5, CINNABAR)
    # 淡淡的符文筆畫，壓在圖騰後面
    for y in range(8, h - 6, 5):
        for x in range(4, w - 4):
            if (x * 3 + y) % 9 < 2 and dith(x, y, 0.5):
                g.set(x, y, PAPER[1])
    return g.px


def slot():
    """空陣位：石板上刻一圈八卦紋，虛線框。看得出「這裡可以放」，又不搶戲。"""
    w, h = 42, 50
    g = Grid(w, h)
    for y in range(h):
        for x in range(w):
            g.set(x, y, STONE[0], 0.78)
    cx, cy = w / 2 - 0.5, h / 2 - 0.5
    line = "#8a6a4e"
    for x in range(1, w - 1):
        if x % 4 < 2:
            g.set(x, 1, line)
            g.set(x, h - 2, line)
    for y in range(1, h - 1):
        if y % 4 < 2:
            g.set(1, y, line)
            g.set(w - 2, y, line)
    for a in range(0, 360, 6):
        g.set(round(cx + 9 * math.cos(math.radians(a))), round(cy + 9 * math.sin(math.radians(a))), line)
    for k in range(8):
        a = math.radians(k * 45 + 22.5)
        for d in (12, 13, 14):
            if (k + d) % 2 == 0 or d == 13:
                g.set(round(cx + d * math.cos(a)), round(cy + d * math.sin(a)), line)
    # 中心太極的一點
    g.rect(round(cx) - 1, round(cy) - 1, 2, 2, line)
    return g.px


def build(out_dir):
    write_png(arena(), os.path.join(out_dir, "arena.png"))
    write_png(gate(), os.path.join(out_dir, "gate.png"))
    write_png(paper(), os.path.join(out_dir, "card-paper.png"))
    write_png(slot(), os.path.join(out_dir, "slot.png"))
    return 4


if __name__ == "__main__":
    import sys
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "public", "art")
    print("wrote", build(out))
