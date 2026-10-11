"""原生解析度的首領（engine.py）：一隻首領一種造型，100×96 格，遊戲裡放大兩倍。

首領一律正面朝下（面向山門），四幀待機：呼吸起伏與飾物擺動。
"""
import math

from engine import Sprite, auto_ramp, mix, ramp
from hd import GOLD, GUM, INK, PINK, STEEL, WHITE

W, H = 100, 96
BONE = ramp("#6a6050", "#a89c84", "#d8ceb4", "#f0e8d4", "#ffffff")
CLAW = ramp("#8a8070", "#c8bca0", "#ece2c8", "#fff8e8", "#ffffff")
FLAME_RED = ramp("#5a0c10", "#a8201a", "#e8502a", "#ffa040", "#ffe8a0")
FLAME_PURPLE = ramp("#3a0a4a", "#7a1a8a", "#c04ad8", "#f09af8", "#ffe0ff")
FLAME_BLUE = ramp("#0a2a5a", "#1a5aa8", "#3aa0f0", "#9ad8ff", "#f0fbff")
JADE = ramp("#0e4a3a", "#1e7a5a", "#4ab888", "#9aeac0", "#effff6")
GEM_RED = ramp("#5a0810", "#a0101a", "#e82a3a", "#ff7a80", "#ffffff")
GEM_CYAN = ramp("#0a3a4a", "#1a7a8a", "#3ac8d8", "#8af0ff", "#ffffff")
TALISMAN = ramp("#8a6a2a", "#d8b450", "#f6dc8a", "#fff0c0", "#ffffff")


def breathe(f):
    return [0, -1, -2, -1][f]


def sway(f):
    return [0, 1, 0, -1][f]


def angry_eyes(s, cx, y, gap, w=6, iris="#ff2a2a", white="#ffe25a", brow=True):
    """一對怒目：外眼角上挑、瞳孔赤紅、壓下來的眉。"""
    for d in (-1, 1):
        ex = cx + d * gap
        eye = [(ex + i * -d, y + j) for i in range(-w // 2, w // 2 + 1) for j in range(3)
               if not (j == 0 and i * -d > 0) and not (j == 2 and abs(i) > w // 2 - 1)]
        s.px(eye, white)
        s.px([(ex, y), (ex, y + 1), (ex - d, y + 1)], iris)
        s.dot(ex + d, y, "#fff8d0")
        if brow:
            for i in range(-w // 2 - 1, w // 2 + 2):
                s.dot(ex - d * i, y - 2 - (i + w // 2) * 0.35, INK)


def robe(s, cx, top, bottom, wt, wb, mat, tex="cloth"):
    """下擺外擴的袍子。"""
    s.curve([(cx - wt, top + 1), (cx, top - 2), (cx + wt, top + 1), (cx + wb, bottom), (cx, bottom + 3), (cx - wb, bottom)], mat, roundness=1.0, tex=tex)


# ============================================================= 赤目狼王
def beast(f=0):
    s = Sprite(W, H)
    b, fl = breathe(f), sway(f)
    M1 = ramp("#4a0c14", "#901a24", "#d03a2e", "#f87040", "#ffc070")
    M2 = ramp("#7a1820", "#c43a2c", "#ee6a34", "#ffa050", "#ffe0a0")
    M3 = ramp("#a02a20", "#e05a30", "#ff8c40", "#ffc070", "#fff0c0")
    FUR = auto_ramp("#525a7a")
    FUR_D = auto_ramp("#3a3f5c")
    BELLY = auto_ramp("#c4c8d6")
    cx, cy = 50, 44 + b
    for layer, (mat, ro, ri, ph) in enumerate(((M1, 45, 30, 0.0), (M2, 37, 25, 0.5), (M3, 29, 20, 0.0))):
        pts = []
        n = 16
        for i in range(n * 2):
            a = math.pi * 2 * (i + ph) / (n * 2) - math.pi / 2
            r = (ro if i % 2 == 0 else ri) + (fl * (2 - layer) if i % 4 == 0 else 0)
            pts.append((cx + math.cos(a) * r, cy + 3 + math.sin(a) * r * 0.9))
        s.poly(pts, mat, roundness=0.9)
    for d in (-1, 1):
        x0 = cx + d * 24
        s.curve([(x0 - 7, cy + 24), (x0 + 5, cy + 22), (x0 + 8 * d, cy + 40), (x0 + 3, cy + 47), (x0 - 8, cy + 47), (x0 - 9, cy + 35)], FUR, roundness=1.0, tex="fur")
        for k in range(3):
            c = x0 - 6 + k * 5
            s.poly([(c, cy + 45), (c + 2, cy + 49), (c + 3, cy + 45)], CLAW, roundness=0.2)
    s.curve([(cx - 14, cy + 18), (cx, cy + 14), (cx + 14, cy + 18), (cx + 8, cy + 32), (cx, cy + 37), (cx - 8, cy + 32)], BELLY, roundness=0.8, tex="fur")
    for d in (-1, 1):
        s.poly([(cx + d * 19, cy - 11), (cx + d * 24, cy - 37), (cx + d * 8, cy - 21)], FUR_D, roundness=0.5)
        s.poly([(cx + d * 18, cy - 14), (cx + d * 21, cy - 30), (cx + d * 11, cy - 21)], PINK, flat=True)
    s.curve([(cx - 24, cy), (cx - 19, cy - 18), (cx, cy - 22), (cx + 19, cy - 18), (cx + 24, cy), (cx + 16, cy + 19), (cx, cy + 25), (cx - 16, cy + 19)], FUR, roundness=1.3, tex="fur")
    for d in (-1, 1):
        bx = cx + d * 22
        s.poly([(bx, cy - 2), (bx + d * 7, cy + 5), (bx + d * 2, cy + 6), (bx + d * 8, cy + 11), (bx - d * 2, cy + 11)], FUR, roundness=0.4, tex="fur")
    s.curve([(cx - 6, cy - 21), (cx, cy - 22), (cx + 6, cy - 21), (cx + 2, cy - 8), (cx - 2, cy - 8)], FUR_D, roundness=0.5)
    s.curve([(cx - 11, cy + 9), (cx, cy + 3), (cx + 11, cy + 9), (cx + 9, cy + 20), (cx, cy + 24), (cx - 9, cy + 20)], BELLY, roundness=1.0)
    s.ellipse(cx, cy + 7, 5, 3.4, ramp("#0c0810", "#1a1018", "#2a2030", "#5a5070", "#9a90b0"), roundness=0.8)
    s.poly([(cx - 9, cy + 14), (cx + 9, cy + 14), (cx + 6, cy + 20), (cx - 6, cy + 20)], GUM, flat=True)
    for x in (cx - 7, cx - 4, cx + 4, cx + 7):
        s.px([(x, cy + 14), (x, cy + 15), (x, cy + 16)], WHITE)
    for x in (cx - 5, cx + 5):
        s.px([(x, cy + 20), (x, cy + 19)], WHITE)
    s.poly([(cx - 13, cy - 19), (cx - 11, cy - 30), (cx - 6, cy - 24), (cx, cy - 35), (cx + 6, cy - 24), (cx + 11, cy - 30), (cx + 13, cy - 19)], GOLD, roundness=0.6, tex="metal")
    s.ellipse(cx, cy - 25, 2.5, 2.5, GEM_RED, roundness=1.0)
    angry_eyes(s, cx, cy - 5, 11, w=8)
    for d in (-1, 1):
        s.stroke([(cx + d * 9, cy - 17), (cx + d * 4, cy - 12)], "#d0202a")
    s.stroke([(cx + 8, cy - 11), (cx + 14, cy + 1)], "#c06070")
    return s


# ============================================================= 黑風老魈（巨猿、紅藍花臉、黑風繚繞）
def ape(f=0):
    s = Sprite(W, H)
    b, sw = breathe(f), sway(f)
    FUR = auto_ramp("#2e2a36")
    FURL = auto_ramp("#4a4456")
    FACE = auto_ramp("#d84a3a")
    BLUE = auto_ramp("#3a70d0")
    WIND = ramp("#2a2a3a", "#4a4a5a", "#7a7a8a", "#aaaabc", "#dadaea")
    cx, cy = 50, 42 + b
    # 身後的黑風
    for k in range(3):
        r = 40 + k * 4
        pts = [(cx + math.cos(a / 10) * r, cy + 10 + math.sin(a / 10) * r * 0.55) for a in range(0 + k * 10 + sw * 2, 40 + k * 10 + sw * 2)]
        for (x, y) in pts[::2]:
            s.dot(x, y, WIND[2 - k % 2])
    # 長臂撐地
    for d in (-1, 1):
        s.taper([(cx + d * 22, cy + 6), (cx + d * 34, cy + 22), (cx + d * 36, cy + 40)], 14, 10, FUR, tex="fur")
        s.ellipse(cx + d * 36, cy + 44, 8, 6, FURL, roundness=1.0)
        for k in range(3):
            s.px([(cx + d * (31 + k * 4), cy + 49)], "#d8ccb0")
    # 身體：駝背、厚胸
    s.curve([(cx - 26, cy + 4), (cx - 18, cy - 14), (cx, cy - 18), (cx + 18, cy - 14), (cx + 26, cy + 4), (cx + 18, cy + 34), (cx, cy + 40), (cx - 18, cy + 34)], FUR, roundness=1.3, tex="fur")
    s.curve([(cx - 12, cy + 8), (cx, cy + 4), (cx + 12, cy + 8), (cx + 10, cy + 28), (cx, cy + 32), (cx - 10, cy + 28)], FURL, roundness=0.9)
    # 腿
    for d in (-1, 1):
        s.curve([(cx + d * 8, cy + 30), (cx + d * 20, cy + 30), (cx + d * 22, cy + 48), (cx + d * 6, cy + 48)], FUR, roundness=1.0, tex="fur")
    # 頭：山魈花臉
    hy = cy - 18
    s.ellipse(cx, hy, 15, 14, FUR, roundness=1.2, tex="fur")
    s.curve([(cx - 10, hy - 2), (cx, hy - 8), (cx + 10, hy - 2), (cx + 7, hy + 12), (cx, hy + 15), (cx - 7, hy + 12)], FACE, roundness=1.0)
    for d in (-1, 1):
        s.curve([(cx + d * 3, hy - 4), (cx + d * 9, hy - 2), (cx + d * 8, hy + 10), (cx + d * 3, hy + 12)], BLUE, roundness=0.8)
    s.taper([(cx, hy - 6), (cx, hy + 10)], 4, 6, FACE)
    s.ellipse(cx, hy + 13, 5, 3, auto_ramp("#f0a080"), roundness=0.8)
    s.px([(cx - 2, hy + 12), (cx + 2, hy + 12)], INK)
    s.px([(cx - 3, hy + 15), (cx + 3, hy + 15)], WHITE)
    s.px([(cx - 3, hy + 16), (cx + 3, hy + 16)], WHITE)
    angry_eyes(s, cx, hy - 5, 7, w=5, white="#fff0a0")
    # 頭頂亂鬃
    for i in range(6):
        x = cx - 12 + i * 5
        s.poly([(x, hy - 10), (x + 2, hy - 18 - (i % 2) * 3 + sw), (x + 4, hy - 10)], FUR, roundness=0.3)
    return s


# ============================================================= 三尾妖狐（狐女、三尾、狐火）
def fox(f=0):
    s = Sprite(W, H)
    b, sw = breathe(f), sway(f)
    TAIL = auto_ramp("#e8782a")
    TIP = auto_ramp("#f8f0e4")
    ROBE = auto_ramp("#c02a3a")
    ROBE2 = auto_ramp("#f0e0d0")
    HAIR = auto_ramp("#f0f0f8")
    SKIN = auto_ramp("#f8dcc8")
    FIRE = FLAME_BLUE
    cx, cy = 50, 46 + b
    # 三條大尾巴展開在身後
    # 三條大尾巴：從腰後往兩側外捲，像扇子一樣在身後展開
    for k, d in enumerate((-1, 1, -1)):
        lift = (0, 4, 20)[k]
        pts = [(cx + d * 4, cy + 34), (cx + d * 20, cy + 30 - lift), (cx + d * 34, cy + 18 - lift),
               (cx + d * 42, cy + 2 - lift + sw), (cx + d * 40, cy - 10 - lift + sw)]
        if k == 2:
            pts = [(cx + 4, cy + 34), (cx + 22, cy + 22), (cx + 30, cy + 2), (cx + 28, cy - 14 + sw), (cx + 20, cy - 24 + sw)]
        s.taper(pts, 24, 12, TAIL, tex="fur")
        s.taper(pts[3:], 14, 8, TIP, tex="fur")
        tx, ty = pts[-1]
        s.ellipse(tx, ty - 5, 3, 4, FIRE, roundness=0.8)
    # 跪坐的裙擺
    s.curve([(cx - 26, cy + 44), (cx - 18, cy + 14), (cx, cy + 8), (cx + 18, cy + 14), (cx + 26, cy + 44), (cx, cy + 48)], ROBE, roundness=1.0, tex="cloth")
    s.stroke([(cx - 24, cy + 42), (cx, cy + 46), (cx + 24, cy + 42)], GOLD[2])
    # 上身
    robe(s, cx, cy - 2, cy + 18, 7, 12, ROBE)
    s.poly([(cx - 4, cy - 1), (cx, cy + 8), (cx + 4, cy - 1), (cx + 2, cy - 1), (cx, cy + 4), (cx - 2, cy - 1)], ROBE2, roundness=0.3)
    s.poly([(cx - 10, cy + 10), (cx + 10, cy + 10), (cx + 10, cy + 13), (cx - 10, cy + 13)], GOLD, roundness=0.3)
    # 寬袖：一手托著狐火
    s.curve([(cx - 7, cy), (cx - 18, cy + 8), (cx - 22, cy + 20), (cx - 14, cy + 22), (cx - 6, cy + 12)], ROBE, roundness=0.8, tex="cloth")
    s.curve([(cx + 7, cy), (cx + 16, cy - 2), (cx + 22, cy - 8), (cx + 24, cy - 2), (cx + 14, cy + 10)], ROBE, roundness=0.8, tex="cloth")
    s.ellipse(cx + 24, cy - 8, 2.4, 2.4, SKIN)
    s.ellipse(cx + 25, cy - 15 + sw, 4, 5, FIRE, roundness=0.8)
    s.dot(cx + 25, cy - 15 + sw, "#ffffff")
    # 頭：白長髮、狐耳
    hy = cy - 12
    s.curve([(cx - 12, hy - 2), (cx - 10, hy - 12), (cx, hy - 16), (cx + 10, hy - 12), (cx + 12, hy - 2), (cx + 13, hy + 18), (cx + 8, hy + 22), (cx - 8, hy + 22), (cx - 13, hy + 18)], HAIR, roundness=1.0)
    for d in (-1, 1):
        s.poly([(cx + d * 6, hy - 12), (cx + d * 12, hy - 26), (cx + d * 13, hy - 9)], HAIR, roundness=0.4)
        s.poly([(cx + d * 8, hy - 12), (cx + d * 11, hy - 21), (cx + d * 11, hy - 11)], PINK, flat=True)
    s.ellipse(cx, hy, 8, 9, SKIN, roundness=1.2)
    s.curve([(cx - 9, hy - 3), (cx - 6, hy - 10), (cx, hy - 11), (cx + 6, hy - 10), (cx + 9, hy - 3), (cx + 3, hy - 6), (cx - 3, hy - 6)], HAIR, roundness=0.9)
    # 狐眼：細長上挑、金瞳
    for d in (-1, 1):
        ex = cx + d * 4
        s.px([(ex - 2 * d, hy + 1), (ex - d, hy + 1), (ex, hy + 1), (ex + d, hy), (ex + 2 * d, hy - 1)], INK)
        s.px([(ex - d, hy + 2), (ex, hy + 2)], "#ffcc3a")
        s.dot(ex + 2 * d, hy + 1, "#e04a5a")
    s.stroke([(cx - 1, hy + 6), (cx + 1, hy + 6)], "#d04050")
    s.px([(cx - 5, hy + 4), (cx + 5, hy + 4)], "#f8a0a0")
    s.ellipse(cx, hy - 9, 2, 2, GEM_RED, roundness=1.0)
    return s


# ============================================================= 屍傀將（甲冑殭屍將軍、大刀、鎮屍符）
def corpse(f=0):
    s = Sprite(W, H)
    b, sw = breathe(f), sway(f)
    ARM = auto_ramp("#5a6070")
    RUST = auto_ramp("#8a5a3a")
    SKIN = auto_ramp("#8aa098")
    CLOTH = auto_ramp("#3a2a3a")
    cx, cy = 48, 44 + b
    # 大刀（背後斜插）
    s.taper([(cx + 30, cy + 48), (cx + 32, cy + 10), (cx + 30, cy - 30)], 3, 3, auto_ramp("#4a2a1a"), roundness=0)
    s.curve([(cx + 28, cy - 30), (cx + 40, cy - 44), (cx + 42, cy - 30), (cx + 34, cy - 20), (cx + 30, cy - 22)], STEEL, roundness=0.4, tex="metal")
    s.taper([(cx + 30, cy - 20), (cx + 26, cy - 14)], 3, 1, auto_ramp("#c02a2a"))
    # 腿與戰裙
    for d in (-1, 1):
        s.taper([(cx + d * 8, cy + 26), (cx + d * 10, cy + 48)], 9, 8, ARM, tex="metal")
        s.ellipse(cx + d * 11, cy + 49, 6, 2.5, CLOTH, roundness=0.3)
    s.curve([(cx - 20, cy + 14), (cx + 20, cy + 14), (cx + 22, cy + 34), (cx, cy + 36), (cx - 22, cy + 34)], CLOTH, roundness=0.8, tex="cloth")
    for x in range(cx - 18, cx + 19, 6):
        s.poly([(x, cy + 18), (x + 5, cy + 18), (x + 5, cy + 30), (x, cy + 30)], RUST, roundness=0.5, tex="metal")
    # 胸甲
    s.curve([(cx - 20, cy - 4), (cx, cy - 10), (cx + 20, cy - 4), (cx + 22, cy + 18), (cx, cy + 22), (cx - 22, cy + 18)], ARM, roundness=1.2, tex="metal")
    s.ellipse(cx, cy + 6, 7, 6, RUST, roundness=1.1, tex="metal")
    s.px([(cx - 2, cy + 4), (cx + 2, cy + 4), (cx, cy + 8)], "#1a1010")
    # 肩吞獸頭
    for d in (-1, 1):
        s.ellipse(cx + d * 22, cy - 2, 9, 8, RUST, roundness=1.1, tex="metal")
        s.px([(cx + d * 22 - 2, cy - 3), (cx + d * 22 + 2, cy - 3)], "#ffe24a")
        s.stroke([(cx + d * 18, cy + 2), (cx + d * 26, cy + 2)], "#2a1a10")
    # 平舉的僵直雙臂
    for d in (-1, 1):
        s.taper([(cx + d * 24, cy + 4), (cx + d * 34, cy + 8), (cx + d * 42, cy + 10)], 8, 7, ARM, tex="metal")
        s.ellipse(cx + d * 44, cy + 10, 3.5, 3.5, SKIN)
        for k in range(3):
            s.dot(cx + d * (46 + k), cy + 9 + k, "#3a4a44")
    # 頭：青白死人臉、清官盔、鎮屍符
    hy = cy - 16
    s.ellipse(cx, hy, 10, 11, SKIN, roundness=1.1)
    angry_eyes(s, cx, hy - 1, 5, w=4, iris="#e02a2a", white="#e8f8f0", brow=False)
    s.stroke([(cx - 4, hy + 6), (cx + 4, hy + 6)], "#2a3a34")
    s.px([(cx - 3, hy + 7), (cx + 3, hy + 7)], WHITE)
    s.curve([(cx - 14, hy - 6), (cx - 10, hy - 18), (cx, hy - 22), (cx + 10, hy - 18), (cx + 14, hy - 6), (cx, hy - 9)], ARM, roundness=1.0, tex="metal")
    s.poly([(cx - 2, hy - 22), (cx, hy - 32), (cx + 2, hy - 22)], RUST, roundness=0.3)
    s.taper([(cx, hy - 30), (cx - 4 + sw, hy - 36), (cx - 10 + sw * 2, hy - 38)], 3, 1, auto_ramp("#c02a2a"))
    s.poly([(cx - 4, hy - 9), (cx + 4, hy - 9), (cx + 4, hy + 4), (cx - 4, hy + 4)], TALISMAN, flat=True)
    s.stroke([(cx - 2, hy - 7), (cx + 2, hy - 7)], "#c0302a")
    s.stroke([(cx, hy - 7), (cx, hy + 2)], "#c0302a")
    s.stroke([(cx - 2, hy - 3), (cx + 2, hy - 1)], "#c0302a")
    return s


# ============================================================= 毒霧蟒君（巨蟒昂首、角冠、毒霧）
def python(f=0):
    s = Sprite(W, H)
    b, sw = breathe(f), sway(f)
    SC = auto_ramp("#3a6a3a")
    SCD = auto_ramp("#2a4a2a")
    BEL = auto_ramp("#e0d090")
    HORN = auto_ramp("#d8c880")
    FOG = ramp("#2a3a1a", "#5a7a2a", "#9ac04a", "#c8f07a", "#f0ffc0")
    cx = 50
    # 盤在地上的身體
    s.ellipse(cx, 84, 44, 11, SCD, roundness=1.2, tex="scale")
    s.ellipse(cx - 4, 74, 34, 9, SC, roundness=1.2, tex="scale")
    # 昂起的頸
    s.taper([(cx + 10, 72), (cx + 6 + sw, 52), (cx + sw, 36), (cx + sw, 28 + b)], 22, 18, SC, tex="scale")
    s.taper([(cx + 8, 72), (cx + 4 + sw, 54), (cx + sw, 38)], 9, 8, BEL)
    for y in range(40, 72, 4):
        s.stroke([(cx + sw - 3, y), (cx + sw + 5, y)], BEL[1])
    # 頭（寬扁的蛇首，角冠）
    hx_, hy = cx + sw, 24 + b
    s.curve([(hx_ - 18, hy + 4), (hx_ - 14, hy - 8), (hx_, hy - 12), (hx_ + 14, hy - 8), (hx_ + 18, hy + 4), (hx_ + 10, hy + 14), (hx_, hy + 16), (hx_ - 10, hy + 14)], SC, roundness=1.2, tex="scale")
    for d in (-1, 1):
        s.taper([(hx_ + d * 8, hy - 8), (hx_ + d * 16, hy - 20), (hx_ + d * 14, hy - 28)], 6, 2, HORN)
        s.taper([(hx_ + d * 14, hy - 4), (hx_ + d * 24, hy - 10), (hx_ + d * 26, hy - 16)], 5, 2, HORN)
    s.curve([(hx_ - 8, hy + 6), (hx_, hy + 4), (hx_ + 8, hy + 6), (hx_ + 6, hy + 14), (hx_ - 6, hy + 14)], BEL, roundness=0.6)
    angry_eyes(s, hx_, hy - 2, 8, w=5, iris="#1a1010", white="#d8f040")
    s.px([(hx_ - 3, hy + 5), (hx_ + 3, hy + 5)], INK)
    # 信子
    s.stroke([(hx_, hy + 15), (hx_, hy + 20), (hx_ - 3, hy + 23 + sw)], "#e0303a")
    s.stroke([(hx_, hy + 20), (hx_ + 3, hy + 23 - sw)], "#e0303a")
    # 毒霧
    for i in range(10):
        a = i * 0.7 + f * 0.4
        x = cx + math.cos(a) * (30 + (i % 3) * 6)
        y = 60 + math.sin(a) * 14
        s.px([(x, y), (x + 1, y), (x, y + 1)], FOG[2 + (i % 2)])
    return s


# ============================================================= 鐵背蠻牛（牛魔、鐵甲、鼻環）
def bull(f=0):
    s = Sprite(W, H)
    b, sw = breathe(f), sway(f)
    HIDE = auto_ramp("#6a3a2a")
    IRON = auto_ramp("#5a5a66")
    HORN = ramp("#5a4a30", "#a08a60", "#e0d0a0", "#f8f0d0", "#ffffff")
    SNOUT = auto_ramp("#c88a6a")
    cx, cy = 50, 44 + b
    # 腿
    for d in (-1, 1):
        s.taper([(cx + d * 12, cy + 26), (cx + d * 14, cy + 48)], 12, 11, HIDE, tex="fur")
        s.ellipse(cx + d * 14, cy + 49, 7, 3, auto_ramp("#2a2020"), roundness=0.4)
    # 身體與鐵背甲
    s.curve([(cx - 24, cy - 2), (cx, cy - 10), (cx + 24, cy - 2), (cx + 22, cy + 28), (cx, cy + 32), (cx - 22, cy + 28)], HIDE, roundness=1.3, tex="fur")
    s.curve([(cx - 22, cy - 2), (cx, cy - 8), (cx + 22, cy - 2), (cx + 18, cy + 10), (cx, cy + 12), (cx - 18, cy + 10)], IRON, roundness=1.0, tex="metal")
    for x in (cx - 12, cx, cx + 12):
        s.ellipse(x, cy, 2, 2, GOLD, roundness=1.0)
    s.poly([(cx - 20, cy + 18), (cx + 20, cy + 18), (cx + 20, cy + 22), (cx - 20, cy + 22)], auto_ramp("#3a2a20"), roundness=0.3)
    s.ellipse(cx, cy + 20, 4, 3, GOLD, roundness=1.0, tex="metal")
    # 雙臂與巨錘拳
    for d in (-1, 1):
        s.taper([(cx + d * 24, cy + 2), (cx + d * 32, cy + 14), (cx + d * 34, cy + 26)], 12, 10, HIDE, tex="fur")
        s.ellipse(cx + d * 34, cy + 30, 7, 6, IRON, roundness=1.0, tex="metal")
        s.stroke([(cx + d * 30, cy + 27), (cx + d * 38, cy + 27)], IRON[0])
    # 牛頭
    hy = cy - 16
    s.curve([(cx - 14, hy - 6), (cx, hy - 12), (cx + 14, hy - 6), (cx + 12, hy + 10), (cx, hy + 16), (cx - 12, hy + 10)], HIDE, roundness=1.2, tex="fur")
    for d in (-1, 1):
        s.taper([(cx + d * 12, hy - 8), (cx + d * 24, hy - 12), (cx + d * 30, hy - 24 + sw)], 7, 2, HORN)
        s.poly([(cx + d * 13, hy - 2), (cx + d * 20, hy - 4), (cx + d * 15, hy + 2)], HIDE, roundness=0.4)
    s.ellipse(cx, hy + 9, 9, 6, SNOUT, roundness=1.0)
    s.px([(cx - 4, hy + 8), (cx - 3, hy + 8), (cx + 3, hy + 8), (cx + 4, hy + 8)], INK)
    # 鼻環
    for a in range(0, 360, 30):
        s.dot(cx + math.cos(math.radians(a)) * 3, hy + 15 + math.sin(math.radians(a)) * 2.5, GOLD[2])
    angry_eyes(s, cx, hy - 3, 6, w=5, iris="#e01a1a")
    # 鼻孔噴氣
    for k in range(3):
        s.dot(cx - 10 - k * 2 - sw, hy + 12 + k, "#e8e8f0")
        s.dot(cx + 10 + k * 2 + sw, hy + 12 + k, "#e8e8f0")
    return s


def humanoid(s, cx, cy, robe_mat, skin, sleeves=True, wt=10, wb=22, hem=46, fa=0, ba=0):
    """人形首領的共用軀幹：袍子、寬袖、手。頭與配件各自畫。"""
    robe(s, cx, cy, cy + hem, wt, wb, robe_mat)
    if sleeves:
        s.curve([(cx - wt, cy + 2), (cx - wt - 12, cy + 14 + fa), (cx - wt - 16, cy + 28 + fa), (cx - wt - 6, cy + 30 + fa), (cx - wt + 2, cy + 18)], robe_mat, roundness=0.8, tex="cloth")
        s.curve([(cx + wt, cy + 2), (cx + wt + 12, cy + 14 + ba), (cx + wt + 16, cy + 28 + ba), (cx + wt + 6, cy + 30 + ba), (cx + wt - 2, cy + 18)], robe_mat, roundness=0.8, tex="cloth")
        s.ellipse(cx - wt - 12, cy + 30 + fa, 3, 3, skin)
        s.ellipse(cx + wt + 12, cy + 30 + ba, 3, 3, skin)


# ============================================================= 血煞道人（血袍、骷髏念珠、血珠環繞）
def bloodtao(f=0):
    s = Sprite(W, H)
    b, sw = breathe(f), sway(f)
    ROBE = auto_ramp("#8a1a2a")
    ROBE2 = auto_ramp("#3a1020")
    SKIN = auto_ramp("#d8b0a0")
    BLOOD = ramp("#4a0008", "#8a0a14", "#d0202a", "#ff5a5a", "#ffc0c0")
    cx, cy = 50, 40 + b
    humanoid(s, cx, cy, ROBE, SKIN, fa=sw, ba=-sw)
    s.curve([(cx - 6, cy), (cx, cy + 10), (cx + 6, cy), (cx + 4, cy + 44), (cx - 4, cy + 44)], ROBE2, roundness=0.6)
    # 骷髏念珠
    for i in range(9):
        a = math.pi * (0.15 + 0.7 * i / 8)
        x, y = cx + math.cos(a) * 13, cy + 2 + math.sin(a) * 12
        s.ellipse(x, y, 2.2, 2.2, BONE, roundness=1.0)
        s.dot(x - 1, y, INK)
    # 頭：蒼白臉、披散長髮、血紋
    hy = cy - 12
    s.curve([(cx - 12, hy), (cx - 10, hy - 12), (cx, hy - 15), (cx + 10, hy - 12), (cx + 12, hy), (cx + 13, hy + 18), (cx + 7, hy + 14), (cx - 7, hy + 14), (cx - 13, hy + 18)], auto_ramp("#1a1018"), roundness=0.9)
    s.ellipse(cx, hy, 8, 9, SKIN, roundness=1.2)
    angry_eyes(s, cx, hy - 1, 4, w=4, iris="#e00a1a", white="#ffe0e0")
    s.stroke([(cx - 3, hy + 5), (cx, hy + 6), (cx + 3, hy + 5)], "#6a0a10")
    s.stroke([(cx, hy - 9), (cx, hy - 5)], "#d0202a")
    s.ellipse(cx, hy - 14, 4, 3, ROBE, roundness=0.8)
    s.line(cx - 6, hy - 15, cx + 6, hy - 13, 1.4, GOLD, roundness=0)
    # 環繞的血珠
    for i in range(6):
        a = math.pi * 2 * i / 6 + f * 0.5
        x, y = cx + math.cos(a) * 36, cy + 16 + math.sin(a) * 18
        s.ellipse(x, y, 3.4, 3.4, BLOOD, roundness=1.3)
    return s


# ============================================================= 赤炎魔蠍（正面巨蠍、雙鉗、火尾高舉）
def scorpking(f=0):
    s = Sprite(W, H)
    b, sw = breathe(f), sway(f)
    SH = auto_ramp("#b03a1a")
    SHD = auto_ramp("#6a1a0a")
    cx, cy = 50, 52 + b
    # 腳
    for d in (-1, 1):
        for k in range(3):
            s.taper([(cx + d * (10 + k * 4), cy + 6 + k * 3), (cx + d * (24 + k * 6), cy + 2 + k * 4), (cx + d * (30 + k * 6), cy + 22 + k * 5)], 4, 2, SHD)
    # 高舉的尾巴（從背後繞到頭頂）
    tail = [(cx, cy - 4), (cx + 4, cy - 18), (cx + 2 + sw, cy - 32), (cx - 6 + sw, cy - 42), (cx - 14 + sw, cy - 44)]
    s.taper(tail, 14, 8, SH)
    for (x, y) in tail[1:-1]:
        s.stroke([(x - 5, y), (x + 5, y)], SHD[1])
    s.poly([(cx - 14 + sw, cy - 50), (cx - 26 + sw, cy - 40), (cx - 14 + sw, cy - 38)], FLAME_RED, roundness=0.4, tex="metal")
    s.ellipse(cx - 20 + sw, cy - 46, 4, 5, FLAME_RED, roundness=0.6)
    # 背甲
    s.curve([(cx - 20, cy - 6), (cx, cy - 12), (cx + 20, cy - 6), (cx + 18, cy + 14), (cx, cy + 18), (cx - 18, cy + 14)], SH, roundness=1.3)
    for y in (cy - 4, cy + 2, cy + 8):
        s.stroke([(cx - 16, y), (cx + 16, y)], SHD[1])
    # 雙鉗
    for d in (-1, 1):
        s.taper([(cx + d * 16, cy - 2), (cx + d * 30, cy - 10), (cx + d * 34, cy - 20)], 9, 7, SH)
        s.curve([(cx + d * 26, cy - 22), (cx + d * 38, cy - 34), (cx + d * 46, cy - 26), (cx + d * 42, cy - 16), (cx + d * 32, cy - 14)], SH, roundness=1.1)
        s.taper([(cx + d * 40, cy - 30), (cx + d * 44, cy - 40), (cx + d * 40, cy - 46)], 6, 2, SH)
        s.stroke([(cx + d * 36, cy - 26), (cx + d * 42, cy - 34)], SHD[0])
    # 頭與複眼、口器
    s.ellipse(cx, cy + 12, 12, 8, SH, roundness=1.2)
    for (x, y) in ((cx - 5, cy + 9), (cx + 5, cy + 9), (cx - 2, cy + 7), (cx + 2, cy + 7)):
        s.px([(x, y), (x + 1, y)], "#ffe24a")
    s.taper([(cx - 4, cy + 16), (cx - 6, cy + 22), (cx - 3, cy + 24)], 3, 1, CLAW)
    s.taper([(cx + 4, cy + 16), (cx + 6, cy + 22), (cx + 3, cy + 24)], 3, 1, CLAW)
    # 背上的火紋
    s.px([(cx - 8, cy - 4), (cx - 4, cy - 6), (cx + 4, cy - 6), (cx + 8, cy - 4), (cx, cy - 8)], "#ffb040")
    return s


# ============================================================= 吞金蟾王（三足金蟾、口銜銅錢、坐在錢堆上）
def toad(f=0):
    s = Sprite(W, H)
    b, sw = breathe(f), sway(f)
    T = ramp("#6a4a10", "#a8801c", "#e0b83a", "#fff080", "#fffbe0")
    BEL = auto_ramp("#f0e0a0")
    COIN = GOLD
    cx, cy = 50, 52 + b
    # 錢堆
    for i in range(14):
        x = cx - 34 + (i % 7) * 11 + (i // 7) * 5
        y = 86 - (i // 7) * 6
        s.ellipse(x, y, 6, 3, COIN, roundness=0.6, tex="metal")
        s.ellipse(x, y, 1.6, 1, auto_ramp("#6a4a10"), flat=True)
    # 身體
    s.ellipse(cx, cy + 6, 32, 24, T, roundness=1.3)
    s.ellipse(cx, cy + 14, 20, 14, BEL, roundness=0.9)
    # 背上的金疣與七星
    for (x, y) in ((cx - 22, cy - 4), (cx - 14, cy - 12), (cx + 14, cy - 12), (cx + 22, cy - 4), (cx - 26, cy + 8), (cx + 26, cy + 8)):
        s.ellipse(x, y, 2.6, 2.4, ramp("#7a3a0a", "#c06a1a", "#f0a040", "#ffd080", "#ffffff"), roundness=1.0)
    # 前腳（兩隻）與後腳（一隻、三足）
    for d in (-1, 1):
        s.taper([(cx + d * 18, cy + 18), (cx + d * 22, cy + 30)], 7, 7, T)
        s.px([(cx + d * 19, cy + 31), (cx + d * 22, cy + 32), (cx + d * 25, cy + 31)], T[3])
    s.taper([(cx, cy + 26), (cx, cy + 34)], 8, 8, T)
    # 頭與大嘴
    hy = cy - 14
    s.ellipse(cx, hy, 24, 12, T, roundness=1.2)
    for d in (-1, 1):
        s.ellipse(cx + d * 14, hy - 10, 7, 6.5, T, roundness=1.2)
        s.ellipse(cx + d * 14, hy - 10, 4.5, 4.5, ramp("#5a0a0a", "#a01a1a", "#e8302a", "#ff8a6a", "#ffffff"), roundness=1.0)
        s.px([(cx + d * 14, hy - 12), (cx + d * 14, hy - 11), (cx + d * 14, hy - 10), (cx + d * 14, hy - 9)], INK)
    s.stroke([(cx - 20, hy + 4), (cx - 8, hy + 7), (cx + 8, hy + 7), (cx + 20, hy + 4)], "#4a2a08")
    # 口銜銅錢
    s.ellipse(cx, hy + 9, 6, 5, COIN, roundness=0.9, tex="metal")
    s.poly([(cx - 2, hy + 7), (cx + 2, hy + 7), (cx + 2, hy + 11), (cx - 2, hy + 11)], auto_ramp("#6a4a10"), flat=True)
    # 吐出的霧
    for k in range(5):
        s.dot(cx - 12 - k * 3 + sw, hy + 12 + k, "#f0e8ff")
        s.dot(cx + 12 + k * 3 - sw, hy + 12 + k, "#f0e8ff")
    return s


# ============================================================= 噬魂魔尊（黑紫魔袍、角冠、魂魄環繞）
def soullord(f=0):
    s = Sprite(W, H)
    b, sw = breathe(f), sway(f)
    ROBE = auto_ramp("#3a1a4a")
    ROBE2 = auto_ramp("#6a2a7a")
    SKIN = auto_ramp("#b8a8c8")
    SOUL = ramp("#2a4a6a", "#4a8ab0", "#8ad0f0", "#c8f4ff", "#ffffff")
    cx, cy = 50, 40 + b
    # 身後的魂魄
    for i in range(5):
        a = math.pi * (1.1 + 0.8 * i / 4)
        x, y = cx + math.cos(a) * 40, cy + 6 + math.sin(a) * 30 + (sw if i % 2 else -sw)
        s.curve([(x - 5, y + 4), (x - 4, y - 4), (x, y - 7), (x + 4, y - 4), (x + 5, y + 4), (x + 2, y + 10), (x - 2, y + 8)], SOUL, roundness=1.2)
        s.px([(x - 2, y - 2), (x + 2, y - 2)], "#1a2a3a")
    humanoid(s, cx, cy, ROBE, SKIN, wt=11, wb=24, fa=sw, ba=-sw)
    s.curve([(cx - 8, cy), (cx, cy + 6), (cx + 8, cy), (cx + 10, cy + 46), (cx - 10, cy + 46)], ROBE2, roundness=0.6)
    s.ellipse(cx, cy + 14, 4, 4, GEM_CYAN, roundness=1.1)
    # 尖肩
    for d in (-1, 1):
        s.poly([(cx + d * 8, cy), (cx + d * 26, cy - 8), (cx + d * 18, cy + 6)], auto_ramp("#2a1a34"), roundness=0.5, tex="metal")
    # 頭與角冠
    hy = cy - 12
    s.ellipse(cx, hy, 8, 9, SKIN, roundness=1.2)
    for d in (-1, 1):
        s.taper([(cx + d * 5, hy - 7), (cx + d * 10, hy - 16), (cx + d * 8, hy - 26)], 4, 1, BONE)
        s.taper([(cx + d * 7, hy - 5), (cx + d * 16, hy - 10), (cx + d * 20, hy - 18)], 3, 1, BONE)
    s.curve([(cx - 9, hy - 2), (cx - 7, hy - 10), (cx, hy - 12), (cx + 7, hy - 10), (cx + 9, hy - 2), (cx + 4, hy - 6), (cx - 4, hy - 6)], auto_ramp("#1a1020"), roundness=0.8)
    angry_eyes(s, cx, hy - 1, 4, w=4, iris="#7af0ff", white="#2a1a3a")
    s.stroke([(cx - 3, hy + 6), (cx + 3, hy + 6)], "#2a1020")
    return s


# ============================================================= 萬鬼夜主（高瘦鬼王、提燈、鬼臉長袍）
def ghostking(f=0):
    s = Sprite(W, H)
    b, sw = breathe(f), sway(f)
    ROBE = auto_ramp("#2a3a4a")
    SKIN = auto_ramp("#c8d8e0")
    LAMP = ramp("#5a2a0a", "#a85a1a", "#f0a040", "#ffe080", "#ffffff")
    GHOST = ramp("#3a5a6a", "#6a9ab0", "#a8d8e8", "#e0f8ff", "#ffffff")
    cx, cy = 48, 36 + b
    # 破爛的長袍下擺（一條一條）
    s.curve([(cx - 12, cy), (cx, cy - 4), (cx + 12, cy), (cx + 22, cy + 50), (cx, cy + 54), (cx - 22, cy + 50)], ROBE, roundness=1.0, tex="cloth")
    for i in range(7):
        x = cx - 20 + i * 6.5
        s.poly([(x, cy + 48), (x + 4, cy + 48), (x + 2 + (sw if i % 2 else -sw), cy + 58)], ROBE, roundness=0.3)
    # 袍上的鬼臉
    for (x, y) in ((cx - 8, cy + 20), (cx + 8, cy + 28), (cx - 4, cy + 38)):
        s.ellipse(x, y, 4, 4.5, GHOST, roundness=1.0)
        s.px([(x - 1, y - 1), (x + 1, y - 1), (x, y + 2)], "#1a2a3a")
    # 長臂：一手提燈、一手枯爪
    s.taper([(cx - 12, cy + 4), (cx - 24, cy + 16), (cx - 30, cy + 26)], 7, 5, ROBE, tex="cloth")
    s.taper([(cx - 30, cy + 26), (cx - 34, cy + 30), (cx - 36, cy + 28)], 3, 1, SKIN)
    s.taper([(cx + 12, cy + 4), (cx + 24, cy + 10), (cx + 32, cy + 8)], 7, 5, ROBE, tex="cloth")
    s.line(cx + 34, cy + 8, cx + 34, cy + 18, 1.2, auto_ramp("#2a2020"), roundness=0)
    s.curve([(cx + 28, cy + 18), (cx + 40, cy + 18), (cx + 42, cy + 28), (cx + 34, cy + 34), (cx + 26, cy + 28)], LAMP, roundness=1.2)
    s.stroke([(cx + 26, cy + 24), (cx + 42, cy + 24)], "#6a2a0a")
    s.ellipse(cx + 34, cy + 26, 2.4, 3, ramp("#3a8a3a", "#6ad86a", "#b0ffb0", "#f0fff0", "#ffffff"), roundness=1.0)
    # 頭：長臉高冠
    hy = cy - 12
    s.ellipse(cx, hy, 7, 10, SKIN, roundness=1.2)
    s.poly([(cx - 8, hy - 6), (cx - 6, hy - 22), (cx + 6, hy - 22), (cx + 8, hy - 6)], auto_ramp("#1a1a24"), roundness=0.6)
    s.stroke([(cx - 7, hy - 9), (cx + 7, hy - 9)], GOLD[2])
    s.taper([(cx - 6, hy - 22), (cx - 14 + sw, hy - 24), (cx - 20 + sw, hy - 20)], 3, 1, auto_ramp("#2a3a6a"))
    angry_eyes(s, cx, hy - 1, 4, w=3, iris="#7af07a", white="#1a2a20", brow=False)
    s.stroke([(cx - 2, hy + 6), (cx, hy + 7), (cx + 2, hy + 6)], "#1a2a3a")
    s.taper([(cx, hy + 9), (cx + sw, hy + 16)], 3, 1, auto_ramp("#d8e0e8"))
    return s


# ============================================================= 白骨夫人（白衣美人、半張骷髏臉、骨扇）
def bonelady(f=0):
    s = Sprite(W, H)
    b, sw = breathe(f), sway(f)
    ROBE = ramp("#7a8090", "#b8c0cc", "#e8ecf2", "#f8faff", "#ffffff")
    SASH = auto_ramp("#6a1a3a")
    SKIN = auto_ramp("#f4e0d8")
    HAIR = auto_ramp("#1a1420")
    cx, cy = 50, 38 + b
    # 長髮垂到腰後
    s.curve([(cx - 14, cy - 10), (cx, cy - 26), (cx + 14, cy - 10), (cx + 16, cy + 26), (cx, cy + 22), (cx - 16, cy + 26)], HAIR, roundness=1.0)
    humanoid(s, cx, cy, ROBE, SKIN, wt=9, wb=22, hem=50, fa=sw, ba=-sw)
    s.poly([(cx - 9, cy + 12), (cx + 9, cy + 12), (cx + 9, cy + 16), (cx - 9, cy + 16)], SASH, roundness=0.3)
    s.taper([(cx + 4, cy + 16), (cx + 6 + sw, cy + 30), (cx + 4 + sw, cy + 38)], 3, 1, SASH)
    # 骨扇（右手展開）
    fx, fy = cx + 24, cy + 18 + -sw
    for i in range(7):
        a = math.pi * (1.15 + 0.6 * i / 6)
        s.taper([(fx, fy), (fx + math.cos(a) * 16, fy + math.sin(a) * 16)], 2, 3, BONE, roundness=0.2)
    s.curve([(fx - 15, fy - 6), (fx - 8, fy - 15), (fx + 2, fy - 16), (fx, fy - 4), (fx - 6, fy - 2)], auto_ramp("#d8d0e0"), roundness=0.4)
    # 頭：左半美人、右半骷髏
    hy = cy - 12
    s.ellipse(cx, hy, 8, 9, SKIN, roundness=1.2)
    s.poly([(cx, hy - 9), (cx + 8, hy - 5), (cx + 8, hy + 5), (cx + 3, hy + 9), (cx, hy + 9)], BONE, roundness=0.8)
    s.ellipse(cx + 4, hy - 1, 2.4, 2.6, auto_ramp("#1a1018"), flat=True)
    s.dot(cx + 4, hy - 1, "#ff3a5a")
    s.px([(cx - 5, hy - 1), (cx - 4, hy - 1), (cx - 3, hy - 2)], INK)
    s.dot(cx - 4, hy, "#b04a6a")
    for x in (cx + 1, cx + 3, cx + 5):
        s.stroke([(x, hy + 5), (x, hy + 7)], "#6a6050")
    s.px([(cx - 2, hy + 5), (cx - 1, hy + 5)], "#c02a4a")
    s.curve([(cx - 9, hy - 2), (cx - 7, hy - 10), (cx, hy - 12), (cx + 7, hy - 10), (cx + 9, hy - 2), (cx + 3, hy - 7), (cx - 3, hy - 7)], HAIR, roundness=0.8)
    # 白骨髮簪
    s.line(cx - 10, hy - 12, cx + 6, hy - 18, 1.6, BONE, roundness=0)
    s.ellipse(cx + 7, hy - 18, 2, 2, BONE)
    return s


# ============================================================= 化神老祖（白鬚老者、踏雲、拂塵、金光）
def elder(f=0):
    s = Sprite(W, H)
    b, sw = breathe(f), sway(f)
    ROBE = auto_ramp("#e8e0c8")
    ROBE2 = auto_ramp("#c89a3a")
    SKIN = auto_ramp("#f0c8a8")
    BEARD = ramp("#8a8a98", "#c8c8d4", "#f0f0f8", "#ffffff", "#ffffff")
    CLOUD = ramp("#7a8ab0", "#b0c0e0", "#e0e8ff", "#f8fbff", "#ffffff")
    cx, cy = 50, 36 + b
    # 身後金色光輪
    for a in range(0, 360, 10):
        r = 34
        s.dot(cx + math.cos(math.radians(a)) * r, cy - 6 + math.sin(math.radians(a)) * r, "#f8e090")
    humanoid(s, cx, cy, ROBE, SKIN, wt=10, wb=20, hem=40, fa=sw, ba=-sw)
    s.curve([(cx - 10, cy), (cx, cy + 4), (cx + 10, cy), (cx + 8, cy + 40), (cx - 8, cy + 40)], ROBE2, roundness=0.6)
    s.stroke([(cx - 14, cy + 30), (cx + 14, cy + 30)], GOLD[2])
    # 腳下祥雲
    for (x, y, r) in ((cx - 18, cy + 46, 10), (cx, cy + 50, 13), (cx + 18, cy + 46, 10), (cx - 30, cy + 50, 7), (cx + 30, cy + 50, 7)):
        s.ellipse(x + sw, y, r, r * 0.6, CLOUD, roundness=1.2)
    # 拂塵（左手）
    s.line(cx - 22, cy + 28, cx - 30, cy + 8, 1.6, auto_ramp("#8a5a2a"), roundness=0)
    s.taper([(cx - 30, cy + 8), (cx - 36 + sw, cy + 2), (cx - 42 + sw, cy + 10)], 6, 1, BEARD)
    # 頭：長眉、白長鬚、髮髻
    hy = cy - 12
    s.ellipse(cx, hy, 8, 9, SKIN, roundness=1.2)
    s.taper([(cx, hy + 4), (cx + sw, hy + 16), (cx + sw * 2, hy + 26)], 14, 3, BEARD)
    s.curve([(cx - 9, hy - 3), (cx - 7, hy - 10), (cx, hy - 12), (cx + 7, hy - 10), (cx + 9, hy - 3), (cx + 4, hy - 7), (cx - 4, hy - 7)], BEARD, roundness=0.8)
    s.ellipse(cx, hy - 14, 4, 3.5, BEARD)
    s.line(cx - 6, hy - 14, cx + 6, hy - 14, 1.4, JADE, roundness=0)
    for d in (-1, 1):
        s.taper([(cx + d * 2, hy - 3), (cx + d * 8, hy - 2), (cx + d * 12, hy + 2)], 2, 1, BEARD)
        s.px([(cx + d * 4, hy), (cx + d * 3, hy)], INK)
    s.stroke([(cx - 2, hy + 4), (cx + 2, hy + 4)], "#a85a4a")
    return s


# ============================================================= 無面神念（白面具、無數浮空面具）
def faceless(f=0):
    s = Sprite(W, H)
    b, sw = breathe(f), sway(f)
    ROBE = auto_ramp("#2a2a3a")
    MASK = ramp("#8a8898", "#c8c6d4", "#f0eef8", "#ffffff", "#ffffff")
    VOID = auto_ramp("#1a1428")
    cx, cy = 50, 40 + b
    # 浮空的面具群
    for i in range(6):
        a = math.pi * 2 * i / 6 + f * 0.3
        x, y = cx + math.cos(a) * 40, cy + 6 + math.sin(a) * 26
        s.ellipse(x, y, 5, 6.5, MASK, roundness=1.0)
        expr = i % 3
        s.px([(x - 2, y - 1), (x + 2, y - 1)], INK)
        if expr == 0:
            s.stroke([(x - 2, y + 3), (x, y + 4), (x + 2, y + 3)], INK)
        elif expr == 1:
            s.stroke([(x - 2, y + 4), (x, y + 3), (x + 2, y + 4)], INK)
        else:
            s.ellipse(x, y + 3, 1.4, 1.4, VOID, flat=True)
    # 斗篷身形（沒有手）
    s.curve([(cx - 14, cy - 4), (cx, cy - 10), (cx + 14, cy - 4), (cx + 24, cy + 48), (cx, cy + 52), (cx - 24, cy + 48)], ROBE, roundness=1.1, tex="cloth")
    s.curve([(cx - 10, cy + 4), (cx, cy), (cx + 10, cy + 4), (cx + 14, cy + 46), (cx - 14, cy + 46)], VOID, roundness=0.6)
    # 兜帽與空白面具
    hy = cy - 14
    s.curve([(cx - 15, hy + 10), (cx - 14, hy - 8), (cx, hy - 16), (cx + 14, hy - 8), (cx + 15, hy + 10), (cx, hy + 6)], ROBE, roundness=1.0, tex="cloth")
    s.ellipse(cx, hy + 1, 9, 11, MASK, roundness=1.2)
    s.stroke([(cx - 5, hy - 1), (cx - 2, hy - 1)], "#4a4a5a")
    s.stroke([(cx + 2, hy - 1), (cx + 5, hy - 1)], "#4a4a5a")
    # 面具上的裂痕
    s.stroke([(cx + 2, hy - 9), (cx + 4, hy - 4), (cx + 2, hy + 1), (cx + 5, hy + 6)], "#6a6878")
    return s


# ============================================================= 千絲偃師（操偶師、指尖牽絲、身前一具傀儡）
def puppeteer(f=0):
    s = Sprite(W, H)
    b, sw = breathe(f), sway(f)
    ROBE = auto_ramp("#5a3a6a")
    ROBE2 = auto_ramp("#d8b060")
    SKIN = auto_ramp("#f0d0b8")
    WOOD = auto_ramp("#c89a5a")
    cx, cy = 50, 30 + b
    humanoid(s, cx, cy, ROBE, SKIN, wt=9, wb=18, hem=36, fa=-4 + sw, ba=-4 - sw)
    s.curve([(cx - 8, cy), (cx, cy + 4), (cx + 8, cy), (cx + 6, cy + 36), (cx - 6, cy + 36)], ROBE2, roundness=0.5, tex="cloth")
    # 頭：面紗高帽
    hy = cy - 11
    s.ellipse(cx, hy, 7, 8, SKIN, roundness=1.2)
    s.poly([(cx - 10, hy - 5), (cx - 7, hy - 16), (cx + 7, hy - 16), (cx + 10, hy - 5)], auto_ramp("#2a1a34"), roundness=0.6)
    s.stroke([(cx - 9, hy - 7), (cx + 9, hy - 7)], GOLD[2])
    s.poly([(cx - 7, hy + 1), (cx + 7, hy + 1), (cx + 6, hy + 9), (cx - 6, hy + 9)], auto_ramp("#3a2a4a"), roundness=0.4)
    angry_eyes(s, cx, hy - 2, 3, w=3, iris="#ff4ad0", white="#ffe0f8", brow=False)
    # 身前懸著的傀儡
    px_, py_ = cx + sw * 2, cy + 46
    for x in (cx - 21, cx + 21):
        s.stroke([(x, cy + 26), (px_ + (-8 if x < cx else 8), py_ - 8)], "#e8e0f0")
    s.stroke([(cx, cy + 20), (px_, py_ - 14)], "#e8e0f0")
    s.ellipse(px_, py_ - 10, 4, 4.5, WOOD, roundness=1.1)
    s.px([(px_ - 2, py_ - 11), (px_ + 2, py_ - 11)], "#3a2014")
    s.poly([(px_ - 6, py_ - 5), (px_ + 6, py_ - 5), (px_ + 7, py_ + 8), (px_ - 7, py_ + 8)], auto_ramp("#8a2a3a"), roundness=0.6, tex="cloth")
    for d in (-1, 1):
        s.line(px_ + d * 6, py_ - 4, px_ + d * 9, py_ + 4, 2.4, WOOD, roundness=0.3)
        s.line(px_ + d * 3, py_ + 8, px_ + d * 4, py_ + 16, 2.6, WOOD, roundness=0.3)
    # 指尖的牽絲往上連到天上
    for x in (cx - 23, cx + 23):
        s.stroke([(x, cy + 24), (x + (-6 if x < cx else 6), 0)], "#c8c0e0")
    return s


# ============================================================= 虛空吞天獸（饕餮巨口、星空身軀）
def devourer(f=0):
    s = Sprite(W, H)
    b, sw = breathe(f), sway(f)
    HIDE = auto_ramp("#2a2a5a")
    HIDE2 = auto_ramp("#4a3a7a")
    HORN = ramp("#3a3020", "#7a6a40", "#c8b070", "#f0e0a0", "#ffffff")
    MAW = ramp("#08040e", "#140a20", "#201030", "#3a2050", "#6a4090")
    cx, cy = 50, 44 + b
    # 巨大的頭身一體
    s.curve([(cx - 44, cy + 4), (cx - 36, cy - 26), (cx, cy - 34), (cx + 36, cy - 26), (cx + 44, cy + 4), (cx + 34, cy + 40), (cx, cy + 46), (cx - 34, cy + 40)], HIDE, roundness=1.3, tex="scale")
    # 身上的星點
    for i in range(16):
        x = cx - 34 + (i * 37) % 68
        y = cy - 22 + (i * 23) % 56
        s.dot(x, y, "#e0d8ff" if i % 3 else "#8af0ff")
    # 雙角
    for d in (-1, 1):
        s.taper([(cx + d * 20, cy - 26), (cx + d * 34, cy - 40), (cx + d * 44, cy - 38)], 9, 2, HORN)
        s.taper([(cx + d * 30, cy - 18), (cx + d * 44, cy - 24), (cx + d * 48, cy - 34)], 7, 2, HORN)
    # 額頭紋
    s.curve([(cx - 12, cy - 30), (cx, cy - 34), (cx + 12, cy - 30), (cx + 6, cy - 16), (cx - 6, cy - 16)], HIDE2, roundness=0.6, tex="scale")
    s.ellipse(cx, cy - 24, 3, 3, GEM_CYAN, roundness=1.1)
    # 大眼
    angry_eyes(s, cx, cy - 12, 16, w=9, iris="#b06aff", white="#ffe24a")
    # 張開的巨口，裡面是虛空
    mouth_open = 16 + sw
    s.curve([(cx - 32, cy + 4), (cx, cy + 2), (cx + 32, cy + 4), (cx + 26, cy + 4 + mouth_open), (cx, cy + 8 + mouth_open), (cx - 26, cy + 4 + mouth_open)], MAW, flat=True)
    for i in range(9):
        x = cx - 28 + i * 7
        s.poly([(x, cy + 3), (x + 4, cy + 3), (x + 2, cy + 10)], CLAW, roundness=0.2)
        s.poly([(x + 2, cy + 5 + mouth_open), (x + 6, cy + 5 + mouth_open), (x + 4, cy - 1 + mouth_open)], CLAW, roundness=0.2)
    # 口中的星旋
    for a in range(0, 360, 30):
        r = 5 + (a % 60) / 12
        s.dot(cx + math.cos(math.radians(a + f * 20)) * r, cy + 12 + sw / 2 + math.sin(math.radians(a + f * 20)) * r * 0.6, "#b06aff")
    return s


# ============================================================= 幽冥劍主（斗篷劍客、身後懸浮鬼劍）
def swordlord(f=0):
    s = Sprite(W, H)
    b, sw = breathe(f), sway(f)
    CLOAK = auto_ramp("#1e2a3a")
    CLOAK2 = auto_ramp("#2e4a5a")
    SKIN = auto_ramp("#b8c8d0")
    GHOSTSTEEL = ramp("#1a4a5a", "#3a8a9a", "#7ad8e0", "#c0faff", "#ffffff")
    cx, cy = 50, 40 + b
    # 背後扇形排開的鬼劍
    for i in range(7):
        a = math.pi * (1.1 + 0.8 * i / 6)
        x0, y0 = cx + math.cos(a) * 18, cy + 4 + math.sin(a) * 18
        x1, y1 = cx + math.cos(a) * (42 + (sw if i % 2 else -sw)), cy + 4 + math.sin(a) * (42 + (sw if i % 2 else -sw))
        s.taper([(x0, y0), (x1, y1)], 2, 4, GHOSTSTEEL, roundness=0.2, tex="metal")
        s.poly([(x0 - 3, y0), (x0 + 3, y0), (x0, y0 + 2)], GOLD, roundness=0.2)
    # 斗篷
    s.curve([(cx - 14, cy - 2), (cx, cy - 8), (cx + 14, cy - 2), (cx + 26, cy + 48), (cx, cy + 52), (cx - 26, cy + 48)], CLOAK, roundness=1.1, tex="cloth")
    s.curve([(cx - 6, cy), (cx, cy - 2), (cx + 6, cy), (cx + 8, cy + 48), (cx - 8, cy + 48)], CLOAK2, roundness=0.6)
    # 雙手握劍，劍尖朝下
    s.taper([(cx, cy + 6), (cx, cy + 44)], 4, 2, GHOSTSTEEL, tex="metal", roundness=0.2)
    s.poly([(cx - 7, cy + 4), (cx + 7, cy + 4), (cx + 7, cy + 7), (cx - 7, cy + 7)], GOLD, roundness=0.3, tex="metal")
    s.line(cx, cy - 4, cx, cy + 4, 3, auto_ramp("#2a1a1a"))
    for d in (-1, 1):
        s.ellipse(cx + d * 3, cy + 1, 2.6, 2.6, SKIN)
    # 兜帽與陰影中的雙眼
    hy = cy - 14
    s.curve([(cx - 13, hy + 10), (cx - 12, hy - 6), (cx, hy - 14), (cx + 12, hy - 6), (cx + 13, hy + 10), (cx, hy + 8)], CLOAK, roundness=1.0, tex="cloth")
    s.ellipse(cx, hy + 2, 7, 7, auto_ramp("#0a1018"), flat=True)
    s.px([(cx - 3, hy + 1), (cx - 2, hy + 1), (cx + 2, hy + 1), (cx + 3, hy + 1)], "#7af0ff")
    s.stroke([(cx - 12, hy - 4), (cx, hy - 12), (cx + 12, hy - 4)], CLOAK[3])
    return s


# ============================================================= 噬星蛛后（巨蛛、頭頂星冠、腹背星圖）
def spider(f=0):
    s = Sprite(W, H)
    b, sw = breathe(f), sway(f)
    BODY = auto_ramp("#3a2a5a")
    LEG = auto_ramp("#4a3a6a")
    LEGD = auto_ramp("#2a1e40")
    cx, cy = 50, 52 + b
    # 八腳：膝蓋高聳
    for side, mat in ((1, LEGD), (-1, LEG)):
        for i in range(4):
            k = i - 1.5
            knee = (cx + side * (22 + i * 4), cy - 22 + abs(k) * 6 + (sw if i % 2 else -sw))
            foot = (cx + side * (40 + i * 2), cy + 22 + i * 4)
            s.taper([(cx + side * 10, cy - 2 + k * 4), knee, foot], 6, 2, mat)
    # 腹部（後方、星圖）
    s.ellipse(cx, cy + 10, 24, 20, BODY, roundness=1.3)
    for (x, y) in ((cx - 12, cy + 4), (cx - 4, cy - 2), (cx + 8, cy + 2), (cx + 14, cy + 12), (cx, cy + 16), (cx - 10, cy + 20)):
        s.px([(x, y)], "#f0e0ff")
    s.stroke([(cx - 12, cy + 4), (cx - 4, cy - 2), (cx + 8, cy + 2), (cx + 14, cy + 12)], "#8a6ad0")
    s.px([(cx, cy + 8), (cx - 1, cy + 8), (cx + 1, cy + 8), (cx, cy + 7), (cx, cy + 9)], "#c0a0ff")
    # 頭胸
    s.ellipse(cx, cy - 12, 14, 11, BODY, roundness=1.3)
    for (x, y) in ((cx - 6, cy - 14), (cx + 6, cy - 14), (cx - 3, cy - 17), (cx + 3, cy - 17), (cx - 9, cy - 10), (cx + 9, cy - 10)):
        s.px([(x, y), (x + 1, y)], "#ff3a6a")
    s.taper([(cx - 4, cy - 4), (cx - 6, cy + 4), (cx - 3, cy + 8)], 4, 1, CLAW)
    s.taper([(cx + 4, cy - 4), (cx + 6, cy + 4), (cx + 3, cy + 8)], 4, 1, CLAW)
    # 星冠
    s.poly([(cx - 10, cy - 20), (cx - 8, cy - 30), (cx - 3, cy - 24), (cx, cy - 34), (cx + 3, cy - 24), (cx + 8, cy - 30), (cx + 10, cy - 20)], ramp("#3a2a6a", "#6a4ab0", "#a888f0", "#d8c8ff", "#ffffff"), roundness=0.5, tex="metal")
    s.dot(cx, cy - 28, "#ffffff")
    # 垂下的蛛絲
    s.stroke([(cx + 30, 0), (cx + 30, 20 + sw)], "#e8e0f0")
    return s


# ============================================================= 天魔真身（四臂魔神、火焰背光）
def heavendemon(f=0):
    s = Sprite(W, H)
    b, sw = breathe(f), sway(f)
    SKIN = auto_ramp("#a82a3a")
    ARMOR = auto_ramp("#2a1a24")
    cx, cy = 50, 42 + b
    # 火焰背光
    for i in range(9):
        a = math.pi * (1.0 + i / 8)
        r = 40 + (sw if i % 2 else -sw) * 2
        s.taper([(cx + math.cos(a) * 14, cy + math.sin(a) * 14), (cx + math.cos(a) * r, cy - 4 + math.sin(a) * r)], 10, 1, FLAME_RED, roundness=0.6)
    # 下身
    for d in (-1, 1):
        s.taper([(cx + d * 8, cy + 24), (cx + d * 12, cy + 50)], 10, 8, SKIN, tex="fur")
    s.curve([(cx - 20, cy + 16), (cx + 20, cy + 16), (cx + 22, cy + 34), (cx, cy + 36), (cx - 22, cy + 34)], ARMOR, roundness=0.8, tex="cloth")
    # 軀幹
    s.curve([(cx - 18, cy - 6), (cx, cy - 12), (cx + 18, cy - 6), (cx + 16, cy + 18), (cx, cy + 22), (cx - 16, cy + 18)], SKIN, roundness=1.3)
    s.stroke([(cx, cy - 4), (cx, cy + 16)], SKIN[1])
    for y in (cy + 4, cy + 10):
        s.stroke([(cx - 8, y), (cx - 2, y)], SKIN[1])
        s.stroke([(cx + 2, y), (cx + 8, y)], SKIN[1])
    # 四臂：上兩臂高舉武器，下兩臂叉腰
    for d in (-1, 1):
        s.taper([(cx + d * 16, cy - 4), (cx + d * 28, cy - 14), (cx + d * 30, cy - 28)], 8, 6, SKIN)
        s.ellipse(cx + d * 30, cy - 30, 4, 4, SKIN)
        s.taper([(cx + d * 30, cy - 26), (cx + d * 30, cy - 44)], 3, 3, STEEL, tex="metal", roundness=0.2)
        s.poly([(cx + d * 30 - 5, cy - 44), (cx + d * 30, cy - 52), (cx + d * 30 + 5, cy - 44)], STEEL, roundness=0.3, tex="metal")
        s.taper([(cx + d * 16, cy + 6), (cx + d * 26, cy + 14), (cx + d * 20, cy + 22)], 8, 6, SKIN)
        s.ellipse(cx + d * 19, cy + 22, 4, 4, SKIN)
    # 頭：三眼、獠牙、火角
    hy = cy - 18
    s.ellipse(cx, hy, 10, 10, SKIN, roundness=1.2)
    for d in (-1, 1):
        s.taper([(cx + d * 6, hy - 6), (cx + d * 12, hy - 16), (cx + d * 10, hy - 24)], 5, 1, BONE)
    s.curve([(cx - 10, hy - 4), (cx - 6, hy - 12), (cx, hy - 14), (cx + 6, hy - 12), (cx + 10, hy - 4), (cx + 4, hy - 8), (cx - 4, hy - 8)], auto_ramp("#1a0a10"), roundness=0.8)
    angry_eyes(s, cx, hy - 1, 5, w=4)
    s.ellipse(cx, hy - 7, 1.6, 2.4, ramp("#5a3a0a", "#c08a1a", "#ffe24a", "#fff8b0", "#ffffff"), flat=True)
    s.stroke([(cx - 4, hy + 6), (cx + 4, hy + 6)], "#3a0a10")
    s.px([(cx - 3, hy + 7), (cx + 3, hy + 7), (cx - 3, hy + 8), (cx + 3, hy + 8)], WHITE)
    return s


# ============================================================= 合道妖皇（虎首帝王、龍袍、偃月刀）
def beastemperor(f=0):
    s = Sprite(W, H)
    b, sw = breathe(f), sway(f)
    FUR = auto_ramp("#e0902a")
    STRIPE = auto_ramp("#2a1a10")
    ROBE = auto_ramp("#2a5a3a")
    ROBE2 = auto_ramp("#d8b040")
    BELLY = auto_ramp("#f8f0e0")
    cx, cy = 48, 40 + b
    # 偃月刀
    s.line(cx + 32, cy + 52, cx + 34, cy - 30, 2.4, auto_ramp("#6a2a1a"), roundness=0)
    s.curve([(cx + 34, cy - 30), (cx + 44, cy - 46), (cx + 50, cy - 38), (cx + 44, cy - 22), (cx + 36, cy - 22)], STEEL, roundness=0.4, tex="metal")
    s.taper([(cx + 34, cy - 22), (cx + 28, cy - 18)], 3, 1, auto_ramp("#c02a2a"))
    humanoid(s, cx, cy, ROBE, FUR, wt=12, wb=26, hem=48, fa=sw, ba=-6)
    s.curve([(cx - 10, cy), (cx, cy + 4), (cx + 10, cy), (cx + 10, cy + 48), (cx - 10, cy + 48)], ROBE2, roundness=0.6, tex="cloth")
    # 龍紋
    s.stroke([(cx - 6, cy + 14), (cx - 2, cy + 10), (cx + 2, cy + 14), (cx + 6, cy + 10)], ROBE[1])
    s.stroke([(cx - 6, cy + 26), (cx - 2, cy + 22), (cx + 2, cy + 26), (cx + 6, cy + 22)], ROBE[1])
    # 虎頭
    hy = cy - 12
    s.ellipse(cx, hy, 13, 12, FUR, roundness=1.3, tex="fur")
    for d in (-1, 1):
        s.ellipse(cx + d * 10, hy - 10, 4, 4, FUR)
        s.dot(cx + d * 10, hy - 10, "#a06a6a")
        s.poly([(cx + d * 12, hy + 2), (cx + d * 18, hy + 6), (cx + d * 12, hy + 8)], BELLY, roundness=0.4)
    s.ellipse(cx, hy + 6, 7, 5, BELLY, roundness=0.9)
    s.poly([(cx - 3, hy + 2), (cx + 3, hy + 2), (cx, hy + 5)], auto_ramp("#d0707a"), flat=True)
    for (x0, y0, x1, y1) in ((cx - 2, hy - 10, cx - 1, hy - 5), (cx + 2, hy - 10, cx + 1, hy - 5), (cx, hy - 11, cx, hy - 6),
                             (cx - 12, hy - 2, cx - 7, hy), (cx + 12, hy - 2, cx + 7, hy)):
        s.stroke([(x0, y0), (x1, y1)], STRIPE[2])
    angry_eyes(s, cx, hy - 3, 5, w=4, iris="#1a1010", white="#a8f04a")
    s.stroke([(cx - 3, hy + 9), (cx + 3, hy + 9)], "#3a1a10")
    s.px([(cx - 3, hy + 10), (cx + 3, hy + 10)], WHITE)
    # 帝冠
    s.poly([(cx - 8, hy - 11), (cx - 8, hy - 18), (cx + 8, hy - 18), (cx + 8, hy - 11)], GOLD, roundness=0.5, tex="metal")
    s.line(cx - 12, hy - 19, cx + 12, hy - 19, 2, auto_ramp("#1a1a1a"), roundness=0)
    for x in range(cx - 11, cx + 12, 3):
        s.stroke([(x, hy - 18), (x, hy - 14 + sw)], "#e8c050")
    return s


# ============================================================= 九首相柳（九頭蛇，身後一整排蛇首）
def hydra(f=0):
    s = Sprite(W, H)
    b, sw = breathe(f), sway(f)
    SC = auto_ramp("#3a5a3a")
    SC2 = auto_ramp("#5a7a3a")
    BEL = auto_ramp("#d8c880")
    cx, cy = 50, 70 + b
    # 盤身
    s.ellipse(cx, cy + 12, 40, 12, SC, roundness=1.2, tex="scale")
    s.ellipse(cx, cy + 4, 28, 10, SC2, roundness=1.2, tex="scale")
    # 九條頸，後排先畫
    heads = []
    for i in range(9):
        t = i / 8
        a = math.pi * (1.15 + 0.7 * t)
        ln = 46 + (10 if i in (3, 4, 5) else 0) - abs(i - 4) * 2
        ph = sw * (1 if i % 2 else -1)
        hx_ = cx + math.cos(a) * ln * 0.95 + ph
        hy_ = cy + math.sin(a) * ln * 0.9
        heads.append((i, hx_, hy_, a))
    order = sorted(heads, key=lambda h: abs(h[0] - 4), reverse=True)
    for i, hx_, hy_, a in order:
        mat = SC if i % 2 else SC2
        s.taper([(cx + math.cos(a) * 10, cy), ((cx + hx_) / 2, (cy + hy_) / 2 + 6), (hx_, hy_ + 6)], 8, 6, mat, tex="scale")
        s.curve([(hx_ - 6, hy_ + 2), (hx_ - 4, hy_ - 4), (hx_ + 4, hy_ - 4), (hx_ + 6, hy_ + 2), (hx_, hy_ + 7)], mat, roundness=1.1, tex="scale")
        s.px([(hx_ - 3, hy_ - 1), (hx_ + 3, hy_ - 1)], "#ffe24a")
        s.px([(hx_ - 3, hy_), (hx_ + 3, hy_)], "#e02a2a")
        s.stroke([(hx_ - 2, hy_ + 4), (hx_ + 2, hy_ + 4)], "#1a2a10")
        s.dot(hx_, hy_ + 8, "#e0303a")
    # 中央那顆最大、戴角
    s.taper([(cx - 4, cy - 50), (cx - 8, cy - 58), (cx - 6, cy - 64)], 4, 1, BONE)
    s.taper([(cx + 4, cy - 50), (cx + 8, cy - 58), (cx + 6, cy - 64)], 4, 1, BONE)
    return s


# ============================================================= 大乘魔帝（黑金重甲、披風、魔冠）
def demonemperor(f=0):
    s = Sprite(W, H)
    b, sw = breathe(f), sway(f)
    ARMOR = auto_ramp("#2a2230")
    TRIM = GOLD
    CAPE = auto_ramp("#6a0a1a")
    SKIN = auto_ramp("#c8b8d0")
    cx, cy = 50, 40 + b
    # 披風
    s.curve([(cx - 16, cy - 4), (cx + 16, cy - 4), (cx + 36 + sw, cy + 50), (cx, cy + 54), (cx - 36 - sw, cy + 50)], CAPE, roundness=0.8, tex="cloth")
    # 腿甲
    for d in (-1, 1):
        s.taper([(cx + d * 8, cy + 24), (cx + d * 10, cy + 50)], 10, 9, ARMOR, tex="metal")
        s.stroke([(cx + d * 10 - 4, cy + 36), (cx + d * 10 + 4, cy + 36)], TRIM[2])
    s.curve([(cx - 18, cy + 16), (cx + 18, cy + 16), (cx + 20, cy + 32), (cx, cy + 34), (cx - 20, cy + 32)], ARMOR, roundness=0.8, tex="metal")
    # 胸甲（魔面紋）
    s.curve([(cx - 18, cy - 4), (cx, cy - 10), (cx + 18, cy - 4), (cx + 18, cy + 18), (cx, cy + 22), (cx - 18, cy + 18)], ARMOR, roundness=1.2, tex="metal")
    s.stroke([(cx - 16, cy - 2), (cx, cy + 4), (cx + 16, cy - 2)], TRIM[2])
    s.ellipse(cx, cy + 10, 6, 5, auto_ramp("#4a3a50"), roundness=1.0, tex="metal")
    s.px([(cx - 3, cy + 9), (cx + 3, cy + 9)], "#ff3a3a")
    # 大肩甲
    for d in (-1, 1):
        s.curve([(cx + d * 14, cy - 8), (cx + d * 30, cy - 10), (cx + d * 32, cy + 4), (cx + d * 18, cy + 6)], ARMOR, roundness=1.1, tex="metal")
        s.poly([(cx + d * 24, cy - 10), (cx + d * 30, cy - 22), (cx + d * 30, cy - 9)], TRIM, roundness=0.4)
        s.taper([(cx + d * 26, cy + 4), (cx + d * 30, cy + 18), (cx + d * 28, cy + 28)], 8, 7, ARMOR, tex="metal")
        s.ellipse(cx + d * 28, cy + 30, 4, 4, ARMOR, roundness=1.0)
    # 魔帝冠與臉
    hy = cy - 16
    s.ellipse(cx, hy, 8, 9, SKIN, roundness=1.2)
    s.curve([(cx - 10, hy + 2), (cx - 10, hy - 8), (cx, hy - 12), (cx + 10, hy - 8), (cx + 10, hy + 2), (cx + 6, hy - 4), (cx - 6, hy - 4)], ARMOR, roundness=1.0, tex="metal")
    for k, h in ((-6, 10), (-3, 14), (0, 18), (3, 14), (6, 10)):
        s.poly([(cx + k - 2, hy - 10), (cx + k, hy - 10 - h), (cx + k + 2, hy - 10)], TRIM, roundness=0.3)
    s.ellipse(cx, hy - 9, 2, 2, GEM_RED, roundness=1.0)
    angry_eyes(s, cx, hy, 4, w=4, iris="#ff2a2a", white="#ffe0a0")
    s.stroke([(cx - 3, hy + 6), (cx + 3, hy + 6)], "#2a1a20")
    return s


# ============================================================= 萬劍歸墟（劍仙、身周一圈飛劍）
def swordsea(f=0):
    s = Sprite(W, H)
    b, sw = breathe(f), sway(f)
    ROBE = auto_ramp("#d8e0f0")
    ROBE2 = auto_ramp("#3a5a9a")
    SKIN = auto_ramp("#f2c8a8")
    HAIR = auto_ramp("#e0e4f0")
    cx, cy = 50, 42 + b
    # 一圈飛劍（劍尖朝外），隨幀轉動一格
    n = 14
    for i in range(n):
        a = math.pi * 2 * (i + f * 0.25) / n
        r0, r1 = 30, 46
        p0 = (cx + math.cos(a) * r0, cy + 4 + math.sin(a) * r0 * 0.8)
        p1 = (cx + math.cos(a) * r1, cy + 4 + math.sin(a) * r1 * 0.8)
        if p1[1] > cy - 2 and abs(p1[0] - cx) < 18:
            continue
        s.taper([p0, p1], 3, 1, STEEL, roundness=0.2, tex="metal")
        s.dot(p0[0], p0[1], GOLD[2])
    humanoid(s, cx, cy, ROBE, SKIN, wt=9, wb=20, hem=44, fa=sw, ba=-sw)
    s.curve([(cx - 8, cy), (cx, cy + 4), (cx + 8, cy), (cx + 6, cy + 44), (cx - 6, cy + 44)], ROBE2, roundness=0.6, tex="cloth")
    # 劍指（右手兩指併攏指天）
    s.taper([(cx + 21, cy + 30), (cx + 24, cy + 22)], 3, 2, SKIN)
    # 頭：白髮長披、玉冠
    hy = cy - 12
    s.curve([(cx - 11, hy - 2), (cx, hy - 14), (cx + 11, hy - 2), (cx + 12, hy + 22), (cx, hy + 16), (cx - 12, hy + 22)], HAIR, roundness=1.0)
    s.ellipse(cx, hy, 7.5, 8.5, SKIN, roundness=1.2)
    s.curve([(cx - 8, hy - 3), (cx - 6, hy - 10), (cx, hy - 11), (cx + 6, hy - 10), (cx + 8, hy - 3), (cx + 3, hy - 6), (cx - 3, hy - 6)], HAIR, roundness=0.8)
    s.poly([(cx - 3, hy - 10), (cx - 2, hy - 16), (cx + 2, hy - 16), (cx + 3, hy - 10)], JADE, roundness=0.5)
    angry_eyes(s, cx, hy - 1, 4, w=3, iris="#3a6ad0", white="#f0f8ff")
    s.stroke([(cx - 2, hy + 5), (cx + 2, hy + 5)], "#a85a4a")
    return s


# ============================================================= 墮落羅漢（金身龜裂、黑氣、佛珠）
def arhat(f=0):
    s = Sprite(W, H)
    b, sw = breathe(f), sway(f)
    GOLDSKIN = ramp("#6a3a0a", "#a8701a", "#e0aa3a", "#ffd870", "#fff4c0")
    ROBE = auto_ramp("#8a2a1a")
    DARK = ramp("#0a0410", "#1a0a24", "#2a1438", "#4a2a5a", "#6a4a7a")
    BEAD = auto_ramp("#3a2014")
    cx, cy = 50, 42 + b
    # 黑氣背光
    for i in range(12):
        a = math.pi * 2 * i / 12 + f * 0.2
        s.ellipse(cx + math.cos(a) * 34, cy + math.sin(a) * 28, 6, 6, DARK, roundness=0.8)
    # 盤腿坐姿
    s.ellipse(cx, cy + 38, 30, 10, ROBE, roundness=1.0, tex="cloth")
    # 上身：袒右肩
    s.curve([(cx - 18, cy - 4), (cx, cy - 10), (cx + 18, cy - 4), (cx + 20, cy + 22), (cx, cy + 30), (cx - 20, cy + 22)], GOLDSKIN, roundness=1.3, tex="metal")
    s.poly([(cx - 18, cy - 4), (cx + 4, cy + 30), (cx - 20, cy + 26)], ROBE, roundness=0.7, tex="cloth")
    s.stroke([(cx - 18, cy - 4), (cx + 4, cy + 30)], GOLD[2])
    # 龜裂紋（裂縫透黑氣）
    s.stroke([(cx + 6, cy - 2), (cx + 10, cy + 6), (cx + 6, cy + 12), (cx + 12, cy + 20)], "#2a1438")
    s.stroke([(cx + 10, cy + 6), (cx + 16, cy + 8)], "#2a1438")
    # 雙臂：一手持佛珠、一手掌心向外
    s.taper([(cx - 18, cy), (cx - 26, cy + 14), (cx - 20, cy + 26)], 9, 7, GOLDSKIN, tex="metal")
    s.taper([(cx + 18, cy), (cx + 28, cy + 10), (cx + 30, cy - 4)], 9, 7, GOLDSKIN, tex="metal")
    s.ellipse(cx + 30, cy - 7, 4.5, 5, GOLDSKIN, roundness=1.1)
    for i in range(10):
        a = math.pi * 2 * i / 10
        s.ellipse(cx - 20 + math.cos(a) * 6, cy + 30 + math.sin(a) * 4, 1.8, 1.8, BEAD, roundness=1.0)
    # 光頭與怒目
    hy = cy - 16
    s.ellipse(cx, hy, 10, 11, GOLDSKIN, roundness=1.3, tex="metal")
    for k in range(3):
        for d in (-1, 0, 1):
            s.dot(cx + d * 4, hy - 7 + k * 0, "#3a1a0a") if k == 0 else None
    s.px([(cx - 4, hy - 7), (cx, hy - 8), (cx + 4, hy - 7)], "#5a2a0a")
    angry_eyes(s, cx, hy - 1, 5, w=4, iris="#7a1aff", white="#fff0c0")
    s.stroke([(cx - 4, hy + 6), (cx + 4, hy + 6)], "#5a2a0a")
    for d in (-1, 1):
        s.ellipse(cx + d * 11, hy + 2, 2.4, 5, GOLDSKIN, roundness=0.8)
    s.stroke([(cx - 3, hy - 11), (cx - 1, hy - 4), (cx - 4, hy + 1)], "#2a1438")
    return s


# ============================================================= 九重天劫（劫雲化身、雷眼、閃電雙臂）
def storm(f=0):
    s = Sprite(W, H)
    b, sw = breathe(f), sway(f)
    CLOUD = ramp("#14141e", "#2a2a3e", "#44445e", "#6a6a8a", "#9a9ab8")
    CLOUD2 = ramp("#1e1e2e", "#36364e", "#54547a", "#7a7aa0", "#b0b0d0")
    BOLT = ramp("#8a6a0a", "#e0b020", "#ffe24a", "#fff6b0", "#ffffff")
    cx, cy = 50, 40 + b
    # 閃電雙臂往下劈
    for d in (-1, 1):
        x, y = cx + d * 26, cy + 10
        pts = [(x, y)]
        for k in range(5):
            x += d * (4 if k % 2 == 0 else -2) + (sw if k == 2 else 0)
            y += 8
            pts.append((x, y))
        for (a, c) in zip(pts, pts[1:]):
            s.line(a[0], a[1], c[0], c[1], 3, BOLT, roundness=0)
    # 層層劫雲
    for (x, y, r, m) in ((cx - 26, cy + 4, 16, CLOUD), (cx + 26, cy + 4, 16, CLOUD), (cx, cy + 12, 22, CLOUD2),
                         (cx - 16, cy - 12, 18, CLOUD2), (cx + 16, cy - 12, 18, CLOUD2), (cx, cy - 20, 20, CLOUD)):
        s.ellipse(x, y, r, r * 0.8, m, roundness=1.2)
    # 雷眼
    for d in (-1, 1):
        ex = cx + d * 12
        s.ellipse(ex, cy - 6, 6, 4, BOLT, flat=True)
        s.ellipse(ex, cy - 6, 2, 3, auto_ramp("#1a1a2a"), flat=True)
    s.stroke([(cx - 20, cy - 13), (cx - 6, cy - 10)], "#0a0a14")
    s.stroke([(cx + 20, cy - 13), (cx + 6, cy - 10)], "#0a0a14")
    # 雷口
    s.stroke([(cx - 10, cy + 8), (cx - 5, cy + 12), (cx, cy + 8), (cx + 5, cy + 12), (cx + 10, cy + 8)], "#ffe24a")
    # 頂上的雷珠
    for k in range(5):
        a = math.pi * (1.15 + 0.7 * k / 4)
        s.ellipse(cx + math.cos(a) * 34, cy - 14 + math.sin(a) * 26, 3, 3, BOLT, roundness=1.2)
    return s


# ============================================================= 渡劫魔君（劫火纏身的魔君、火焰長髮）
def tribulord(f=0):
    s = Sprite(W, H)
    b, sw = breathe(f), sway(f)
    SKIN = auto_ramp("#3a2a3a")
    ROBE = auto_ramp("#1a1420")
    cx, cy = 50, 42 + b
    # 身後劫火
    for i in range(11):
        a = math.pi * (0.95 + 1.1 * i / 10)
        h = 34 + ((i + f) % 3) * 6
        s.taper([(cx + math.cos(a) * 12, cy + math.sin(a) * 8), (cx + math.cos(a) * h, cy - 6 + math.sin(a) * h)], 12, 1, FLAME_RED, roundness=0.6)
    humanoid(s, cx, cy, ROBE, SKIN, wt=11, wb=24, hem=46, fa=-8, ba=-8)
    # 袍上的熔岩裂紋
    for (x0, y0, x1, y1) in ((cx - 10, cy + 10, cx - 4, cy + 30), (cx + 8, cy + 6, cx + 12, cy + 26), (cx - 2, cy + 30, cx + 6, cy + 44)):
        s.stroke([(x0, y0), ((x0 + x1) / 2 + 2, (y0 + y1) / 2), (x1, y1)], "#ff7a2a")
    # 雙手捧火球
    s.ellipse(cx, cy + 22, 9, 9, FLAME_RED, roundness=1.0)
    s.ellipse(cx, cy + 22, 4, 4, ramp("#ffb040", "#ffd070", "#fff0b0", "#ffffff", "#ffffff"), flat=True)
    # 頭：火焰長髮往上燒
    hy = cy - 12
    s.taper([(cx, hy - 4), (cx - 4 + sw, hy - 18), (cx + 2 + sw, hy - 30)], 18, 2, FLAME_RED, roundness=0.6)
    s.ellipse(cx, hy, 8, 9, SKIN, roundness=1.2)
    angry_eyes(s, cx, hy - 1, 4, w=4, iris="#ffffff", white="#ff7a2a")
    s.stroke([(cx - 3, hy + 6), (cx + 3, hy + 6)], "#ff7a2a")
    for d in (-1, 1):
        s.taper([(cx + d * 6, hy - 6), (cx + d * 12, hy - 14), (cx + d * 11, hy - 20)], 4, 1, BONE)
    return s


# ============================================================= 九天雷鵬（展翅巨鳥、雷羽）
def thunderbird(f=0):
    s = Sprite(W, H)
    flap = [0, 4, 8, 4][f]
    b = [0, 1, 2, 1][f]
    FEATHER = auto_ramp("#2a4a9a")
    FEATHER2 = auto_ramp("#4a7ad0")
    BELLY = auto_ramp("#e8e0c8")
    BOLT = ramp("#8a6a0a", "#e0b020", "#ffe24a", "#fff6b0", "#ffffff")
    cx, cy = 50, 46 + b
    # 雙翼：一排排羽毛
    for d in (-1, 1):
        for k in range(6):
            x0 = cx + d * (8 + k * 6)
            y0 = cy - 6 - k * 2 + flap * (k / 5)
            x1 = cx + d * (14 + k * 7)
            y1 = cy - 30 + k * 3 + flap * (k / 5) * 1.6
            s.taper([(x0, y0), ((x0 + x1) / 2, (y0 + y1) / 2 - 2), (x1, y1)], 8, 2, FEATHER2 if k % 2 else FEATHER)
            if k % 2 == 0:
                s.stroke([(x1, y1), (x1 + d * 2, y1 - 3), (x1, y1 - 5)], BOLT[2])
    # 尾羽
    for k in (-1, 0, 1):
        s.taper([(cx + k * 3, cy + 18), (cx + k * 8, cy + 36), (cx + k * 10, cy + 44)], 7, 2, FEATHER)
    # 身體
    s.ellipse(cx, cy + 6, 14, 18, FEATHER, roundness=1.3, tex="fur")
    s.ellipse(cx, cy + 10, 8, 12, BELLY, roundness=1.0, tex="fur")
    for y in range(cy + 2, cy + 20, 4):
        s.stroke([(cx - 4, y), (cx, y + 2), (cx + 4, y)], BELLY[1])
    # 爪
    for d in (-1, 1):
        s.taper([(cx + d * 5, cy + 22), (cx + d * 6, cy + 30)], 3, 2, auto_ramp("#d0a020"))
        s.px([(cx + d * 4, cy + 31), (cx + d * 6, cy + 32), (cx + d * 8, cy + 31)], CLAW[2])
    # 頭：雷冠
    hy = cy - 16
    s.ellipse(cx, hy, 9, 8, FEATHER, roundness=1.2, tex="fur")
    for k in range(5):
        s.poly([(cx - 6 + k * 3, hy - 6), (cx - 5 + k * 3, hy - 14 - (k % 2) * 4), (cx - 3 + k * 3, hy - 6)], BOLT, roundness=0.3)
    s.poly([(cx - 3, hy + 2), (cx + 3, hy + 2), (cx, hy + 10)], auto_ramp("#e0b020"), roundness=0.5)
    angry_eyes(s, cx, hy - 2, 5, w=3, iris="#ffffff", white="#ffe24a")
    return s


# ============================================================= 仙庭執法者（白金天將、光環、法劍）
def celestial(f=0):
    s = Sprite(W, H)
    b, sw = breathe(f), sway(f)
    ARM = ramp("#7a6a4a", "#c8b890", "#f0e8d0", "#fffbf0", "#ffffff")
    TRIM = GOLD
    CLOTH = auto_ramp("#3a6ad0")
    SKIN = auto_ramp("#f2c8a8")
    cx, cy = 50, 42 + b
    # 光環
    for a in range(0, 360, 8):
        s.dot(cx + math.cos(math.radians(a)) * 14, cy - 30 + math.sin(math.radians(a)) * 4, "#fff3b0")
    # 法劍（高舉）
    s.taper([(cx + 26, cy + 8), (cx + 30, cy - 20), (cx + 32, cy - 44)], 4, 2, STEEL, tex="metal", roundness=0.2)
    s.poly([(cx + 22, cy + 8), (cx + 32, cy + 6), (cx + 32, cy + 9), (cx + 22, cy + 11)], TRIM, roundness=0.3)
    # 戰裙、鎧甲
    for d in (-1, 1):
        s.taper([(cx + d * 8, cy + 26), (cx + d * 10, cy + 50)], 9, 8, ARM, tex="metal")
    s.curve([(cx - 20, cy + 14), (cx + 20, cy + 14), (cx + 22, cy + 34), (cx, cy + 36), (cx - 22, cy + 34)], CLOTH, roundness=0.8, tex="cloth")
    s.curve([(cx - 18, cy - 4), (cx, cy - 10), (cx + 18, cy - 4), (cx + 18, cy + 18), (cx, cy + 22), (cx - 18, cy + 18)], ARM, roundness=1.2, tex="metal")
    for y in (cy + 2, cy + 8, cy + 14):
        s.stroke([(cx - 14, y), (cx + 14, y)], ARM[1])
    s.ellipse(cx, cy + 4, 4, 4, GEM_CYAN, roundness=1.0)
    for d in (-1, 1):
        s.ellipse(cx + d * 20, cy - 2, 8, 7, ARM, roundness=1.1, tex="metal")
        s.ellipse(cx + d * 20, cy - 3, 2.4, 2.4, TRIM, roundness=1.0)
    s.taper([(cx - 20, cy + 2), (cx - 26, cy + 16), (cx - 24, cy + 26)], 8, 6, CLOTH)
    s.ellipse(cx - 24, cy + 27, 3, 3, SKIN)
    s.taper([(cx + 20, cy + 2), (cx + 26, cy + 4), (cx + 27, cy + 8)], 8, 6, CLOTH)
    s.ellipse(cx + 27, cy + 9, 3, 3, SKIN)
    # 頭盔（鳳翅盔）
    hy = cy - 16
    s.ellipse(cx, hy, 7.5, 8.5, SKIN, roundness=1.2)
    s.curve([(cx - 9, hy - 2), (cx - 9, hy - 10), (cx, hy - 14), (cx + 9, hy - 10), (cx + 9, hy - 2), (cx + 5, hy - 6), (cx - 5, hy - 6)], ARM, roundness=1.0, tex="metal")
    for d in (-1, 1):
        s.taper([(cx + d * 8, hy - 8), (cx + d * 16, hy - 14), (cx + d * 20, hy - 22)], 4, 1, TRIM)
    angry_eyes(s, cx, hy - 1, 4, w=3, iris="#3a6ad0", white="#ffffff")
    s.stroke([(cx - 2, hy + 5), (cx + 2, hy + 5)], "#a85a4a")
    return s


# ============================================================= 墮仙・無咎（一黑一白殘翼、破碎光環）
def fallen(f=0):
    s = Sprite(W, H)
    b, sw = breathe(f), sway(f)
    WHITE_W = ramp("#8a8898", "#c8c6d4", "#f0eef8", "#ffffff", "#ffffff")
    BLACK_W = ramp("#0a0810", "#1a1424", "#2e2640", "#4a3e60", "#6a5a88")
    ROBE = auto_ramp("#e0dcd0")
    ROBE2 = auto_ramp("#3a2a4a")
    SKIN = auto_ramp("#e8d8d0")
    HAIR = auto_ramp("#1a1420")
    cx, cy = 50, 42 + b
    # 殘翼：左白右黑，各缺了幾片
    for d, mat in ((-1, WHITE_W), (1, BLACK_W)):
        for k in range(5):
            if d == 1 and k == 3:
                continue
            x1 = cx + d * (18 + k * 6)
            y1 = cy - 26 + k * 6 + (sw if k % 2 else 0)
            s.taper([(cx + d * 8, cy - 4), (x1, y1)], 10, 3, mat)
    # 破碎光環
    for a in range(0, 360, 8):
        if 60 < a < 110 or 230 < a < 260:
            continue
        s.dot(cx + math.cos(math.radians(a)) * 13, cy - 32 + math.sin(math.radians(a)) * 4, "#c8b060")
    humanoid(s, cx, cy, ROBE, SKIN, wt=9, wb=20, hem=46, fa=sw, ba=-sw)
    s.poly([(cx, cy - 2), (cx + 9, cy + 1), (cx + 20, cy + 46), (cx, cy + 49)], ROBE2, roundness=0.6, tex="cloth")
    s.stroke([(cx, cy - 2), (cx, cy + 48)], GOLD[2])
    # 頭：長黑髮遮住半邊臉
    hy = cy - 12
    s.curve([(cx - 11, hy - 2), (cx, hy - 14), (cx + 11, hy - 2), (cx + 12, hy + 20), (cx, hy + 14), (cx - 12, hy + 20)], HAIR, roundness=1.0)
    s.ellipse(cx, hy, 7.5, 8.5, SKIN, roundness=1.2)
    s.curve([(cx - 8, hy - 3), (cx - 6, hy - 10), (cx, hy - 11), (cx + 6, hy - 10), (cx + 9, hy + 4), (cx + 2, hy), (cx - 3, hy - 6)], HAIR, roundness=0.8)
    s.px([(cx - 4, hy), (cx - 3, hy), (cx - 2, hy - 1)], INK)
    s.dot(cx - 3, hy + 1, "#b03a5a")
    s.stroke([(cx - 2, hy + 5), (cx + 1, hy + 5)], "#6a3a4a")
    # 一道淚痕般的黑紋
    s.stroke([(cx - 3, hy + 2), (cx - 4, hy + 6)], "#2a1a3a")
    return s


# ============================================================= 天機星君（星袍、渾天儀、星辰環繞）
def starlord(f=0):
    s = Sprite(W, H)
    b, sw = breathe(f), sway(f)
    ROBE = auto_ramp("#1a2a5a")
    ROBE2 = auto_ramp("#d8c070")
    SKIN = auto_ramp("#f0d0b0")
    BEARD = ramp("#8a8a98", "#c8c8d4", "#f0f0f8", "#ffffff", "#ffffff")
    cx, cy = 50, 40 + b
    # 星辰環
    for i in range(10):
        a = math.pi * 2 * (i / 10) + f * 0.15
        x, y = cx + math.cos(a) * 42, cy + 4 + math.sin(a) * 30
        s.px([(x, y), (x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)], "#fff6c0" if i % 2 else "#a8d8ff")
    humanoid(s, cx, cy, ROBE, SKIN, wt=10, wb=24, hem=48, fa=-6, ba=sw)
    s.curve([(cx - 8, cy), (cx, cy + 4), (cx + 8, cy), (cx + 6, cy + 48), (cx - 6, cy + 48)], ROBE2, roundness=0.6, tex="cloth")
    # 袍上的星點
    for (x, y) in ((cx - 16, cy + 20), (cx - 12, cy + 34), (cx + 14, cy + 24), (cx + 18, cy + 38), (cx - 18, cy + 42)):
        s.dot(x, y, "#fff6c0")
    # 渾天儀（左手托著）
    ox, oy = cx - 24, cy + 14
    for ang in (0, 60, 120):
        for a in range(0, 360, 12):
            t = math.radians(a)
            x = math.cos(t) * 9
            y = math.sin(t) * 9 * math.cos(math.radians(ang + f * 15))
            s.dot(ox + x, oy + y, GOLD[2] if ang == 0 else GOLD[3])
    s.ellipse(ox, oy, 2.4, 2.4, GEM_CYAN, roundness=1.0)
    # 頭：星冠、長鬚
    hy = cy - 12
    s.ellipse(cx, hy, 8, 9, SKIN, roundness=1.2)
    s.taper([(cx, hy + 4), (cx, hy + 14), (cx + sw, hy + 22)], 10, 2, BEARD)
    s.poly([(cx - 9, hy - 4), (cx - 9, hy - 12), (cx, hy - 16), (cx + 9, hy - 12), (cx + 9, hy - 4)], ROBE, roundness=0.6, tex="cloth")
    for k in (-6, 0, 6):
        s.px([(cx + k, hy - 12), (cx + k - 1, hy - 12), (cx + k + 1, hy - 12), (cx + k, hy - 13), (cx + k, hy - 11)], "#fff6c0")
    s.px([(cx - 4, hy), (cx - 3, hy), (cx + 3, hy), (cx + 4, hy)], INK)
    s.stroke([(cx - 6, hy - 3), (cx - 2, hy - 2)], BEARD[1])
    s.stroke([(cx + 6, hy - 3), (cx + 2, hy - 2)], BEARD[1])
    return s
