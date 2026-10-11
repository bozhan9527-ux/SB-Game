"""原生解析度的小妖（engine.py）。每個函式吃動畫幀 f（0..3），回傳 Sprite。

四足獸側身朝左（往山門走），人形與飛行的正面朝下。
"""
import math

from engine import Sprite, auto_ramp, mix, ramp
from hd import EYE_RED, GOLD, INK, PINK, STEEL, WHITE, gait

BONE = ramp("#6a6050", "#a89c84", "#d8ceb4", "#f0e8d4", "#ffffff")
CLAW = ramp("#6a6050", "#b0a68e", "#e2d8c0", "#f8f2e2", "#ffffff")
RUNE = ramp("#1a5a6a", "#2aa0b0", "#5ae8f0", "#b0fcff", "#ffffff")


def _claws(s, x, y, n=3, d=-1):
    for i in range(n):
        s.px([(x + d * i * 2, y), (x + d * i * 2 + d, y + 1)], "#ece2c8")


# ============================================================= 太古妖熊（側身）
def bear(f=0):
    s = Sprite(64, 52)
    fa, ba, bob = gait(f)
    F = auto_ramp("#6a4a34")
    FD = auto_ramp("#4a3022")
    MUZ = auto_ramp("#c09a70")
    by = 26 + bob
    s.taper([(20, by + 6), (19 + fa * 2, by + 16), (19 + fa * 3, 49)], 9, 7, FD)
    s.taper([(46, by + 6), (47 - ba * 2, by + 16), (47 - ba * 3, 49)], 10, 7, FD)
    # 肩峰隆起的厚重身軀
    s.curve([(10, by - 4), (20, by - 16), (34, by - 14), (50, by - 10), (58, by), (54, by + 12), (30, by + 14), (12, by + 10)], F, roundness=1.3, tex="fur")
    s.taper([(16, by + 4), (15 - fa * 2, by + 16), (15 - fa * 3, 50)], 11, 8, F, tex="fur")
    s.taper([(50, by + 4), (51 + ba * 2, by + 16), (51 + ba * 3, 50)], 12, 8, F, tex="fur")
    _claws(s, 12 - fa * 3, 50)
    _claws(s, 48 + ba * 3, 50)
    # 頭
    hy = by - 6
    s.ellipse(10, hy, 10, 9, F, roundness=1.2, tex="fur")
    s.ellipse(5, hy - 8, 3.5, 3.5, F)
    s.ellipse(15, hy - 9, 3.5, 3.5, FD)
    s.dot(5, hy - 8, "#a07a6a")
    s.ellipse(2, hy + 3, 5.5, 4.5, MUZ, roundness=0.8)
    s.px([(-1 + 1, hy + 1), (0 + 1, hy + 1), (1, hy + 2)], INK)
    s.stroke([(1, hy + 6), (6, hy + 6)], "#3a1a14")
    s.px([(2, hy + 7), (5, hy + 7)], WHITE)
    s.px([(7, hy - 2), (8, hy - 2)], EYE_RED)
    s.stroke([(5, hy - 5), (10, hy - 3)], INK)
    # 背上的舊箭
    s.line(30, by - 14, 34, by - 22, 1.5, auto_ramp("#8a6a40"))
    s.px([(34, by - 23), (35, by - 24), (33, by - 24)], "#e8e0d0")
    return s


# ============================================================= 玄冰雪怪（正面）
def yeti(f=0):
    s = Sprite(52, 58)
    fa, ba, bob = gait(f)
    W = ramp("#5a6a88", "#9aaccc", "#d4e2f4", "#f2f8ff", "#ffffff")
    SK = auto_ramp("#7a8ab0")
    ICE = ramp("#2a6a9a", "#5aaee0", "#9ae0ff", "#d8f8ff", "#ffffff")
    by = 22 + bob
    s.taper([(19, by + 20), (18 - fa * 2, 54)], 9, 9, W, tex="fur")
    s.taper([(33, by + 20), (34 - ba * 2, 54)], 9, 9, W, tex="fur")
    s.ellipse(18 - fa * 2, 55, 5, 2.4, SK, roundness=0.4)
    s.ellipse(34 - ba * 2, 55, 5, 2.4, SK, roundness=0.4)
    # 長臂垂到膝蓋
    s.taper([(12, by + 2), (6, by + 14 + fa * 2), (5, by + 26 + fa * 2)], 10, 7, W, tex="fur")
    s.taper([(40, by + 2), (46, by + 14 + ba * 2), (47, by + 26 + ba * 2)], 10, 7, W, tex="fur")
    s.curve([(10, by), (26, by - 6), (42, by), (44, by + 18), (26, by + 24), (8, by + 18)], W, roundness=1.3, tex="fur")
    _claws(s, 4, by + 30 + fa * 2, d=1)
    _claws(s, 44, by + 30 + ba * 2, d=1)
    # 肩上冰晶
    for x0, d in ((10, -1), (42, 1)):
        s.poly([(x0, by - 1), (x0 + d * 3, by - 10), (x0 + d * 6, by - 1)], ICE, roundness=0.3, tex="metal")
        s.poly([(x0 + d * 3, by), (x0 + d * 8, by - 6), (x0 + d * 8, by + 2)], ICE, roundness=0.3)
    # 頭（埋在肩膀裡）
    s.ellipse(26, by - 4, 9, 8, W, roundness=1.2, tex="fur")
    s.ellipse(26, by - 1, 6, 4.5, SK, roundness=0.8)
    s.px([(22, by - 5), (23, by - 5), (29, by - 5), (30, by - 5)], "#4ae0ff")
    s.stroke([(21, by - 8), (24, by - 6)], INK)
    s.stroke([(31, by - 8), (28, by - 6)], INK)
    s.stroke([(23, by + 1), (29, by + 1)], "#1a2a40")
    s.px([(24, by + 2), (28, by + 2)], WHITE)
    return s


# ============================================================= 噬魂蜈蚣（側身）
def centipede(f=0):
    s = Sprite(66, 40)
    wave = [0, 1, 0, -1][f]
    SEG = auto_ramp("#6a3a7a")
    SEG2 = auto_ramp("#8a4a5a")
    LEG = auto_ramp("#d0a040")
    HEAD = auto_ramp("#a02a3a")
    base = 26
    segs = []
    for i in range(8):
        x = 12 + i * 6.5
        y = base + math.sin(i * 0.9 + f * 1.6) * 2.2
        segs.append((x, y))
    # 腳：每節一對，交錯擺動
    for i, (x, y) in enumerate(segs):
        ph = 1 if (i + f) % 2 == 0 else -1
        s.line(x, y + 2, x - 2 + ph * 2, 37, 1.6, LEG, roundness=0)
    for i, (x, y) in reversed(list(enumerate(segs))):
        s.ellipse(x, y, 5, 5.5, SEG if i % 2 == 0 else SEG2, roundness=1.1)
        s.stroke([(x - 2, y - 4), (x + 1, y - 4)], "#e0a0e0")
    # 尾鉗
    tx, ty = segs[-1]
    s.taper([(tx + 4, ty), (tx + 10, ty - 4 + wave), (tx + 14, ty - 8 + wave)], 3, 1, HEAD)
    # 頭與毒顎
    s.ellipse(7, base - 1, 6.5, 6, HEAD, roundness=1.2)
    s.taper([(4, base + 3), (0, base + 5), (1, base + 9)], 2.5, 1, CLAW)
    s.taper([(8, base + 4), (5, base + 7), (6, base + 10)], 2.5, 1, CLAW)
    s.taper([(6, base - 6), (2, base - 13 + wave), (-1, base - 16 + wave)], 1.6, 1, LEG)
    s.taper([(9, base - 6), (8, base - 14 - wave), (6, base - 18 - wave)], 1.6, 1, LEG)
    s.px([(4, base - 2), (5, base - 2), (8, base - 2)], "#ffe24a")
    return s


# ============================================================= 赤炎火蠍（側身）
def scorpion(f=0):
    s = Sprite(62, 48)
    fa, ba, bob = gait(f)
    sway = [0, 1, 0, -1][f]
    SH = auto_ramp("#b8401e")
    SHD = auto_ramp("#7a2414")
    EMB = ramp("#a02a0a", "#e0601a", "#ffa030", "#ffe070", "#ffffff")
    by = 32 + bob
    for i in range(4):
        x = 24 + i * 6
        ph = 1 if (i + f) % 2 == 0 else -1
        s.taper([(x, by + 2), (x - 3 + ph, by + 8), (x - 4 + ph * 2, 46)], 2.6, 1.6, SHD)
    # 尾巴：連續的一條，往背上捲，尖端是毒針
    pts = [(44, by - 1), (51, by - 5), (55, by - 12), (55, by - 20 + sway), (50, by - 25 + sway), (44, by - 26 + sway)]
    s.taper(pts, 8, 5, SH, roundness=1.0)
    for (x, y) in pts[1:-1]:
        s.stroke([(x - 2, y - 2), (x + 2, y + 2)], SHD[1])
    s.poly([(44, by - 29 + sway), (36, by - 24 + sway), (44, by - 22 + sway)], EMB, roundness=0.4, tex="metal")
    # 身甲
    s.curve([(18, by - 4), (30, by - 8), (46, by - 6), (48, by + 3), (30, by + 5), (16, by + 3)], SH, roundness=1.2)
    for i in range(4):
        s.stroke([(24 + i * 6, by - 7), (25 + i * 6, by + 3)], SHD[1])
    # 鉗子：手臂＋上下兩爪
    for yy in (-5, 3):
        s.taper([(17, by + yy), (11, by + yy - 2), (7, by + yy - 2)], 4, 3, SH)
        s.curve([(1, by + yy - 6), (7, by + yy - 6), (9, by + yy - 2), (6, by + yy + 1), (2, by + yy - 2)], SH, roundness=1.0)
        s.taper([(3, by + yy - 3), (-1, by + yy - 4), (-2, by + yy - 7)], 3, 1, SH)
        s.stroke([(1, by + yy - 2), (5, by + yy - 2)], SHD[0])
    # 頭與複眼
    s.ellipse(17, by - 2, 5, 4.5, SH, roundness=1.2)
    s.px([(14, by - 4), (16, by - 5), (15, by - 4)], "#ffe24a")
    # 背上火紋
    s.px([(32, by - 6), (36, by - 7), (40, by - 6), (34, by - 5)], "#ffb040")
    return s


# ============================================================= 虛空蟒蛟（盤身昂首）
def serpent(f=0):
    s = Sprite(56, 56)
    sway = [0, 1, 0, -1][f]
    SC = auto_ramp("#2a7a6a")
    BEL = auto_ramp("#d8d0a0")
    HORN = auto_ramp("#d8c880")
    # 盤成兩圈的身體
    s.ellipse(30, 47, 22, 7, SC, roundness=1.2, tex="scale")
    s.ellipse(28, 40, 16, 6, SC, roundness=1.2, tex="scale")
    s.curve([(14, 41), (18, 34), (20, 44), (16, 46)], BEL, roundness=0.6)
    # 昂起的脖子
    s.taper([(36, 38), (34 + sway, 26), (28 + sway, 16), (22 + sway, 10)], 10, 7, SC, tex="scale")
    s.taper([(33, 38), (31 + sway, 26), (26 + sway, 17)], 4, 3, BEL)
    # 頭
    hx_, hy = 18 + sway, 9
    s.curve([(hx_ - 10, hy + 2), (hx_ - 4, hy - 5), (hx_ + 6, hy - 4), (hx_ + 8, hy + 3), (hx_, hy + 7)], SC, roundness=1.1, tex="scale")
    s.poly([(hx_ + 1, hy - 4), (hx_ + 6, hy - 11), (hx_ + 5, hy - 3)], HORN, roundness=0.4)
    s.poly([(hx_ + 4, hy - 3), (hx_ + 11, hy - 8), (hx_ + 8, hy - 1)], HORN, roundness=0.4)
    s.px([(hx_ - 3, hy - 1), (hx_ - 2, hy - 1)], "#ffe24a")
    s.dot(hx_ - 2, hy - 1, INK)
    s.stroke([(hx_ - 9, hy + 3), (hx_ - 2, hy + 4)], "#0e2a24")
    # 信子
    s.stroke([(hx_ - 10, hy + 3), (hx_ - 14, hy + 4 + sway), (hx_ - 16, hy + 3 + sway)], "#e0303a")
    s.dot(hx_ - 16, hy + 5 + sway, "#e0303a")
    # 尾尖
    s.taper([(52, 46), (56, 41 - sway), (55, 36 - sway)], 4, 1, SC)
    return s


# ============================================================= 殭屍（清官帽、額貼符、平舉雙臂，用跳的）
def undead(f=0):
    s = Sprite(40, 58)
    hop = [0, -3, -5, -3][f]
    ROBE = auto_ramp("#3a4a6a")
    TRIM = auto_ramp("#c8a040")
    SKIN = auto_ramp("#98b0a8")
    HAT = auto_ramp("#2a2a38")
    by = 24 + hop
    s.taper([(16, by + 24), (16, 54 + hop)], 6, 6, ROBE)
    s.taper([(24, by + 24), (24, 54 + hop)], 6, 6, ROBE)
    s.ellipse(16, 55 + hop, 4, 2, HAT, roundness=0.3)
    s.ellipse(24, 55 + hop, 4, 2, HAT, roundness=0.3)
    s.curve([(10, by + 2), (20, by - 1), (30, by + 2), (31, by + 28), (20, by + 30), (9, by + 28)], ROBE, roundness=1.0, tex="cloth")
    # 補子（胸前方塊紋）
    s.poly([(15, by + 8), (25, by + 8), (25, by + 17), (15, by + 17)], TRIM, roundness=0.3)
    s.stroke([(17, by + 12), (23, by + 12)], ROBE[1])
    s.stroke([(20, by + 9), (20, by + 15)], ROBE[1])
    # 平舉的雙臂
    s.taper([(11, by + 4), (8, by + 6), (3, by + 7)], 6, 5, ROBE, tex="cloth")
    s.taper([(29, by + 4), (32, by + 6), (37, by + 7)], 6, 5, ROBE, tex="cloth")
    for x in (1, 37):
        s.ellipse(x + 1, by + 7, 2.5, 2.2, SKIN)
        s.px([(x - 1, by + 7), (x - 1, by + 8)], "#4a6058")
    # 臉
    s.ellipse(20, by - 6, 7, 7.5, SKIN, roundness=1.1)
    s.px([(16, by - 6), (17, by - 6), (23, by - 6), (24, by - 6)], "#e8f8f0")
    s.px([(17, by - 6), (23, by - 6)], "#a02a2a")
    s.stroke([(18, by - 1), (22, by - 1)], "#3a4a44")
    s.px([(18, by), (22, by)], WHITE)
    # 清官帽
    s.ellipse(20, by - 13, 9, 3, HAT, roundness=0.6)
    s.curve([(14, by - 13), (16, by - 19), (24, by - 19), (26, by - 13)], HAT, roundness=0.8)
    s.ellipse(20, by - 20, 2, 2, ramp("#5a0810", "#a01020", "#e02a3a", "#ff7a80", "#ffffff"), roundness=1)
    # 黃符
    TAL = ramp("#8a6a2a", "#d8b450", "#f6dc8a", "#fff0c0", "#ffffff")
    s.poly([(17, by - 12), (23, by - 12), (23, by), (17, by)], TAL, flat=True)
    s.stroke([(18, by - 10), (22, by - 10)], "#c0302a")
    s.stroke([(20, by - 10), (20, by - 2)], "#c0302a")
    s.stroke([(18, by - 6), (22, by - 4)], "#c0302a")
    return s


# ============================================================= 魔修（紅膚雙角、黑袍、魔焰）
def demon(f=0):
    s = Sprite(46, 60)
    fa, ba, bob = gait(f)
    flick = [0, 1, 0, -1][f]
    ROBE = auto_ramp("#2e2238")
    TRIM = auto_ramp("#b02a2a")
    SKIN = auto_ramp("#c84a3a")
    HORN = ramp("#3a3028", "#7a6a50", "#c8b890", "#ece0c0", "#ffffff")
    FLAME = ramp("#5a0a3a", "#a01a6a", "#e03aa0", "#ff8ad0", "#ffe0f4")
    by = 24 + bob
    # 背後魔焰
    for i, x in enumerate((10, 16, 30, 36)):
        h = 10 + (i % 2) * 4 + flick * (1 if i % 2 else -1)
        s.taper([(x, by + 8), (x - 1, by - 2), (x + 1, by - h)], 5, 1, FLAME, roundness=0.6)
    s.taper([(19, by + 26), (18 - fa * 2, 56)], 5, 5, ROBE)
    s.taper([(27, by + 26), (28 - ba * 2, 56)], 5, 5, ROBE)
    s.curve([(13, by + 1), (23, by - 2), (33, by + 1), (37, by + 30), (23, by + 33), (9, by + 30)], ROBE, roundness=1.0, tex="cloth")
    s.stroke([(23, by + 2), (23, by + 32)], TRIM[2])
    s.poly([(15, by + 13), (31, by + 13), (31, by + 16), (15, by + 16)], TRIM, roundness=0.2)
    # 肩刺
    for x0, d in ((13, -1), (33, 1)):
        s.ellipse(x0, by + 2, 5, 4, auto_ramp("#4a3a50"), roundness=1.0, tex="metal")
        s.poly([(x0, by - 1), (x0 + d * 6, by - 6), (x0 + d * 3, by + 2)], HORN, roundness=0.3)
    # 手：一手捏訣冒紫火
    s.taper([(12, by + 4), (8, by + 14 + fa), (8, by + 20 + fa)], 6, 5, ROBE, tex="cloth")
    s.taper([(34, by + 4), (38, by + 12 + ba), (39, by + 18 + ba)], 6, 5, ROBE, tex="cloth")
    s.ellipse(8, by + 21 + fa, 2.4, 2.4, SKIN)
    s.ellipse(39, by + 19 + ba, 2.4, 2.4, SKIN)
    s.px([(39, by + 15 + ba), (40, by + 14 + ba), (38, by + 13 + ba), (39, by + 12 + ba)], "#ff8ad0")
    # 頭與雙角
    s.ellipse(23, by - 7, 7.5, 8, SKIN, roundness=1.2)
    s.taper([(17, by - 12), (13, by - 18), (14, by - 23)], 3.5, 1, HORN)
    s.taper([(29, by - 12), (33, by - 18), (32, by - 23)], 3.5, 1, HORN)
    s.curve([(15, by - 9), (23, by - 16), (31, by - 9), (27, by - 12), (19, by - 12)], auto_ramp("#1a1420"), roundness=0.8)
    s.px([(19, by - 7), (20, by - 7), (26, by - 7), (27, by - 7)], "#ffe24a")
    s.stroke([(18, by - 10), (21, by - 8)], INK)
    s.stroke([(28, by - 10), (25, by - 8)], INK)
    s.stroke([(20, by - 2), (26, by - 2)], "#4a0a10")
    s.px([(21, by - 1), (25, by - 1)], WHITE)
    return s


# ============================================================= 天兵（羽盔、金甲、長戟）
def celestial(f=0):
    s = Sprite(50, 62)
    fa, ba, bob = gait(f)
    ARM = ramp("#6a4a10", "#b88a2a", "#eec860", "#fff0a8", "#ffffff")
    CLOTH = auto_ramp("#e8e4f0")
    RED = auto_ramp("#c0302a")
    SKIN = auto_ramp("#f2c6a0")
    by = 26 + bob
    # 長戟
    s.line(40, 60, 42, by - 22, 2, auto_ramp("#7a4a2a"), roundness=0)
    s.poly([(42, by - 34), (45, by - 24), (42, by - 20), (39, by - 24)], STEEL, roundness=0.3, tex="metal")
    s.taper([(43, by - 24), (48, by - 22), (49, by - 18)], 3, 1, STEEL)
    s.taper([(40, by - 19), (40, by - 15), (42, by - 13)], 2, 1, RED)
    s.taper([(20, by + 24), (19 - fa * 2, 58)], 6, 5, CLOTH)
    s.taper([(28, by + 24), (29 - ba * 2, 58)], 6, 5, CLOTH)
    s.ellipse(19 - fa * 2, 59, 3.5, 1.8, ARM, roundness=0.3)
    s.ellipse(29 - ba * 2, 59, 3.5, 1.8, ARM, roundness=0.3)
    # 戰裙與鎧甲
    s.curve([(14, by + 14), (34, by + 14), (36, by + 28), (24, by + 30), (12, by + 28)], RED, roundness=0.8, tex="cloth")
    s.curve([(14, by + 1), (24, by - 2), (34, by + 1), (35, by + 18), (24, by + 20), (13, by + 18)], ARM, roundness=1.2, tex="metal")
    for y in (by + 6, by + 10, by + 14):
        s.stroke([(16, y), (32, y)], ARM[1])
    s.ellipse(24, by + 7, 3.5, 3.5, ramp("#0a3a4a", "#1a7a8a", "#3ac8d8", "#8af0ff", "#ffffff"), roundness=1.0)
    # 護肩
    for x0 in (13, 35):
        s.ellipse(x0, by + 3, 5.5, 4.5, ARM, roundness=1.1, tex="metal")
    s.taper([(12, by + 6), (9, by + 16 + fa), (10, by + 20 + fa)], 5, 4, CLOTH)
    s.taper([(36, by + 6), (40, by + 12), (41, by + 16)], 5, 4, CLOTH)
    s.ellipse(10, by + 21 + fa, 2.3, 2.3, SKIN)
    s.ellipse(41, by + 17, 2.3, 2.3, SKIN)
    # 頭盔與羽飾
    s.ellipse(24, by - 7, 7, 7.5, SKIN, roundness=1.1)
    s.curve([(16, by - 6), (17, by - 14), (24, by - 17), (31, by - 14), (32, by - 6), (28, by - 9), (20, by - 9)], ARM, roundness=1.0, tex="metal")
    s.taper([(24, by - 17), (20, by - 24), (14, by - 28)], 4, 1, RED)
    s.taper([(24, by - 17), (28, by - 25), (33, by - 29)], 4, 1, RED)
    s.px([(20, by - 7), (21, by - 7), (27, by - 7), (28, by - 7)], "#1a1018")
    s.stroke([(19, by - 9), (22, by - 8)], INK)
    s.stroke([(29, by - 9), (26, by - 8)], INK)
    s.stroke([(22, by - 2), (26, by - 2)], "#8a4a3a")
    return s


# ============================================================= 樹妖
def treant(f=0):
    s = Sprite(56, 60)
    fa, ba, bob = gait(f)
    sway = [0, 1, 0, -1][f]
    BARK = auto_ramp("#6a4a2e")
    BARKD = auto_ramp("#4a321e")
    LEAF = auto_ramp("#4a9a3a")
    LEAF2 = auto_ramp("#6abc4a")
    by = 28 + bob
    # 根腳
    for x0, a in ((18, fa), (36, ba)):
        s.taper([(x0, by + 18), (x0 - a * 2, by + 26), (x0 - a * 3 - 3, 58)], 8, 3, BARKD)
        s.taper([(x0, by + 20), (x0 + 3 - a * 2, 58)], 4, 2, BARKD)
    # 樹冠（在後）
    for (cx, cy, r, m) in ((14, by - 18, 10, LEAF), (42, by - 18, 10, LEAF), (28, by - 24, 13, LEAF2), (20, by - 10, 8, LEAF2), (37, by - 10, 8, LEAF)):
        s.ellipse(cx + sway, cy, r, r * 0.85, m, roundness=1.1)
    # 樹幹身體
    s.curve([(14, by - 8), (28, by - 12), (42, by - 8), (44, by + 14), (36, by + 22), (20, by + 22), (12, by + 14)], BARK, roundness=1.1, tex="stone")
    for x in (18, 25, 33, 39):
        s.stroke([(x, by - 6), (x - 1, by + 4), (x + 1, by + 18)], BARK[1])
    # 枝手
    s.taper([(14, by), (7, by + 6 + sway), (3, by + 2 + sway)], 6, 2, BARK)
    s.taper([(7, by + 6 + sway), (2, by + 12 + sway)], 3, 1, BARK)
    s.taper([(42, by), (49, by + 6 - sway), (53, by + 2 - sway)], 6, 2, BARK)
    s.taper([(49, by + 6 - sway), (54, by + 12 - sway)], 3, 1, BARK)
    # 臉：樹洞眼、裂口
    for ex in (21, 34):
        s.ellipse(ex, by + 2, 3, 3.5, auto_ramp("#1a120c"), flat=True)
        s.px([(ex, by + 2)], "#f8e060")
    s.curve([(21, by + 10), (28, by + 8), (35, by + 10), (33, by + 14), (23, by + 14)], auto_ramp("#1a120c"), flat=True)
    s.px([(24, by + 10), (27, by + 11), (31, by + 10)], "#d8c8a0")
    # 小花
    for (x, y) in ((16, by - 22), (40, by - 20), (30, by - 30)):
        s.px([(x + sway, y), (x + 1 + sway, y), (x + sway, y + 1)], "#f8a0c0")
    return s


# ============================================================= 石傀（符文發光）
def golem(f=0):
    s = Sprite(56, 60)
    fa, ba, bob = gait(f)
    glow = [2, 3, 4, 3][f]
    ST = auto_ramp("#7a7a84")
    STD = auto_ramp("#55555e")
    MOSS = auto_ramp("#5a8a3a")
    by = 26 + bob
    s.taper([(19, by + 20), (18 - fa * 2, 57)], 10, 10, STD, tex="stone")
    s.taper([(37, by + 20), (38 - ba * 2, 57)], 10, 10, STD, tex="stone")
    # 巨臂
    s.curve([(4, by + 2), (12, by - 2), (14, by + 16), (12, by + 28 + fa), (2, by + 28 + fa), (0, by + 14)], ST, roundness=1.1, tex="stone")
    s.curve([(52, by + 2), (44, by - 2), (42, by + 16), (44, by + 28 + ba), (54, by + 28 + ba), (56, by + 14)], ST, roundness=1.1, tex="stone")
    # 身軀
    s.curve([(10, by - 4), (28, by - 10), (46, by - 4), (44, by + 20), (28, by + 24), (12, by + 20)], ST, roundness=1.2, tex="stone")
    s.curve([(14, by - 6), (24, by - 10), (30, by - 6), (22, by - 3)], MOSS, roundness=0.6)
    # 胸口符文
    rune = RUNE[min(4, glow)]
    s.stroke([(28, by + 2), (28, by + 14)], rune)
    s.stroke([(23, by + 6), (33, by + 6)], rune)
    s.stroke([(24, by + 12), (28, by + 9), (32, by + 12)], rune)
    s.px([(6, by + 12), (7, by + 14), (49, by + 12), (48, by + 14)], rune)
    # 小頭與獨眼
    s.ellipse(28, by - 10, 6, 5, ST, roundness=1.2, tex="stone")
    s.px([(26, by - 10), (27, by - 10), (28, by - 10), (29, by - 10), (30, by - 10)], rune)
    s.px([(28, by - 11), (28, by - 9)], rune)
    return s


# ============================================================= 赤尾妖狐（側身、雙尾）
def fox(f=0):
    s = Sprite(60, 46)
    fa, ba, bob = gait(f)
    sway = [0, 1, 0, -1][f]
    F = auto_ramp("#e0702a")
    FD = auto_ramp("#a84a1a")
    W = auto_ramp("#f4ead8")
    by = 24 + bob
    s.taper([(36, by + 4), (38 - ba * 3, by + 12), (37 - ba * 4, 43)], 4, 2.5, FD)
    s.taper([(16, by + 4), (14 + fa * 3, by + 12), (15 + fa * 4, 43)], 4, 2.5, FD)
    # 兩條大尾巴，尾尖白
    for k, (dx, dy) in enumerate(((0, 0), (3, 5))):
        pts = [(42, by - 2 + dy), (50 + dx, by - 8 + dy + sway), (56 + dx, by - 16 + dy + sway * 2), (54 + dx, by - 22 + dy + sway * 2)]
        s.taper(pts, 10 - k, 3, F, tex="fur")
        s.taper(pts[2:], 6, 2, W)
    s.curve([(10, by - 4), (24, by - 7), (40, by - 6), (44, by + 2), (36, by + 8), (16, by + 8), (9, by + 3)], F, roundness=1.1, tex="fur")
    s.curve([(14, by + 3), (24, by + 2), (34, by + 4), (24, by + 8), (14, by + 7)], W, roundness=0.5)
    s.taper([(38, by + 3), (40 + ba * 3, by + 12), (39 + ba * 4, 44)], 5, 3, F)
    s.taper([(13, by + 3), (12 - fa * 3, by + 12), (13 - fa * 4, 44)], 5, 3, F)
    for x0 in (39 + ba * 4, 13 - fa * 4):
        s.px([(x0 - 1, 44), (x0 + 1, 44)], "#2a1a14")
    # 頭：尖吻大耳
    hy = by - 7
    s.ellipse(10, hy, 7.5, 6.5, F, roundness=1.2, tex="fur")
    s.poly([(6, hy - 4), (5, hy - 15), (11, hy - 6)], F, roundness=0.4)
    s.poly([(11, hy - 6), (15, hy - 15), (16, hy - 3)], FD, roundness=0.4)
    s.poly([(7, hy - 5), (6.5, hy - 11), (9.5, hy - 6)], PINK, flat=True)
    s.taper([(6, hy + 2), (1, hy + 3), (-2, hy + 4)], 6, 3, W)
    s.px([(-2, hy + 3), (-1, hy + 3)], INK)
    s.curve([(9, hy + 1), (14, hy - 1), (16, hy + 4), (11, hy + 6)], W, roundness=0.5)
    # 狐眼：細長、金色
    s.px([(6, hy - 1), (7, hy - 1), (8, hy - 2), (6, hy)], "#ffd84a")
    s.dot(7, hy - 1, INK)
    # 尾尖的狐火
    s.px([(56 + sway * 2, by - 25), (57 + sway * 2, by - 26), (56 + sway * 2, by - 27)], "#7ad8ff")
    return s


# ============================================================= 毒沼蟾蜍
def toad(f=0):
    s = Sprite(50, 42)
    hop = [0, -2, -4, -2][f]
    T = auto_ramp("#5a7a3a")
    BEL = auto_ramp("#d8c880")
    WART = auto_ramp("#8a4a9a")
    by = 26 + hop
    # 後腿
    for d in (-1, 1):
        x0 = 25 + d * 16
        s.curve([(x0 - 6, by + 4), (x0 + 6, by + 2), (x0 + d * 6, by + 12), (x0 - d * 4, by + 13)], T, roundness=1.0)
        s.px([(x0 + d * 7, by + 13), (x0 + d * 9, by + 13), (x0 + d * 5, by + 13)], T[3])
    s.ellipse(25, by + 2, 18, 12, T, roundness=1.3)
    s.ellipse(25, by + 7, 12, 7, BEL, roundness=0.9)
    # 毒疣
    for (x, y) in ((14, by - 4), (20, by - 7), (31, by - 6), (36, by - 2), (17, by + 2), (34, by + 3)):
        s.ellipse(x, y, 1.8, 1.6, WART, roundness=1.0)
    # 前腳
    for x0 in (16, 34):
        s.taper([(x0, by + 8), (x0, 40 + min(0, hop // 2))], 4, 4, T)
    # 大眼
    for ex in (16, 34):
        s.ellipse(ex, by - 9, 5, 4.5, T, roundness=1.2)
        s.ellipse(ex, by - 9, 3, 3, ramp("#8a6a0a", "#d0a020", "#ffe24a", "#fff3a0", "#ffffff"), roundness=1.0)
        s.px([(ex, by - 10), (ex, by - 9), (ex, by - 8)], INK)
    s.stroke([(15, by + 1), (25, by + 3), (35, by + 1)], "#2a3a1a")
    # 毒泡
    s.px([(44, by - 8 - hop), (45, by - 9 - hop), (46, by - 12 - hop)], "#b07ae0")
    return s


# ============================================================= 嗜血蝠（正面振翅）
def bat(f=0):
    s = Sprite(60, 42, rim=True)
    flap = [0, 6, 10, 6][f]
    bob = [0, 1, 2, 1][f]
    WING = auto_ramp("#5a2a4a")
    BODY = auto_ramp("#3a2034")
    MEM = auto_ramp("#8a3a5a")
    cy = 18 + bob
    for d in (-1, 1):
        tip = (30 + d * 29, cy - 10 + flap)
        mid = (30 + d * 18, cy - 12 + flap * 0.5)
        pts = [(30 + d * 4, cy - 4), mid, tip, (30 + d * 24, cy + 2 + flap * 0.6), (30 + d * 18, cy + 4 + flap * 0.3), (30 + d * 12, cy + 8), (30 + d * 5, cy + 6)]
        s.poly(pts, MEM, roundness=0.6)
        s.stroke([(30 + d * 4, cy - 4), mid, tip], WING[3])
        s.stroke([mid, (30 + d * 18, cy + 4 + flap * 0.3)], WING[1])
    s.ellipse(30, cy + 2, 7, 9, BODY, roundness=1.3, tex="fur")
    s.poly([(25, cy - 5), (24, cy - 14), (29, cy - 6)], BODY, roundness=0.3)
    s.poly([(31, cy - 6), (36, cy - 14), (35, cy - 5)], BODY, roundness=0.3)
    s.px([(27, cy - 2), (28, cy - 2), (32, cy - 2), (33, cy - 2)], "#ff3a4a")
    s.px([(28, cy + 3), (32, cy + 3)], WHITE)
    s.px([(28, cy + 4), (32, cy + 4)], WHITE)
    s.stroke([(27, cy + 2), (33, cy + 2)], "#1a0a14")
    s.px([(28, cy + 11), (32, cy + 11)], "#d8c8b0")
    return s


# ============================================================= 白骨刀兵
def skeleton(f=0):
    s = Sprite(44, 60)
    fa, ba, bob = gait(f)
    RUST = auto_ramp("#8a5a3a")
    CLOTH = auto_ramp("#4a3a5a")
    by = 24 + bob
    # 腿骨
    for x0, a in ((17, fa), (25, ba)):
        s.line(x0, by + 20, x0 - a * 2, 55, 2.4, BONE, roundness=0)
        s.ellipse(x0 - a, by + 27, 2, 1.8, BONE)
        s.ellipse(x0 - a * 2 - 1, 56, 3, 1.6, BONE, roundness=0.3)
    # 破布腰圍
    s.poly([(12, by + 14), (30, by + 14), (31, by + 22), (27, by + 20), (24, by + 24), (20, by + 20), (16, by + 23), (12, by + 20)], CLOTH, roundness=0.4, tex="cloth")
    # 肋骨與脊椎
    s.line(21, by, 21, by + 15, 2, BONE, roundness=0)
    for i in range(4):
        y = by + 2 + i * 3
        s.taper([(21, y), (16, y + 1), (14, y + 3)], 2, 1, BONE, roundness=0.2)
        s.taper([(21, y), (26, y + 1), (28, y + 3)], 2, 1, BONE, roundness=0.2)
    # 殘破肩甲
    s.ellipse(13, by + 1, 5, 3.5, RUST, roundness=1.0, tex="metal")
    # 手臂與刀
    s.line(13, by + 3, 9, by + 12 + fa, 2, BONE, roundness=0)
    s.line(9, by + 12 + fa, 8, by + 18 + fa, 2, BONE, roundness=0)
    s.line(29, by + 3, 33, by + 10, 2, BONE, roundness=0)
    s.line(33, by + 10, 35, by + 6, 2, BONE, roundness=0)
    s.taper([(35, by + 6), (38, by - 6), (40, by - 18), (39, by - 22)], 4, 2, ramp("#3a3020", "#7a6a50", "#b0a080", "#d8ccb0", "#ffffff"), tex="metal", roundness=0.2)
    s.stroke([(36, by - 2), (38, by - 12)], "#5a4a30")
    s.poly([(32, by + 6), (38, by + 5), (38, by + 7), (32, by + 8)], RUST, roundness=0.2)
    # 骷髏頭
    s.ellipse(21, by - 7, 7, 7.5, BONE, roundness=1.2)
    s.poly([(16, by - 2), (26, by - 2), (25, by + 3), (17, by + 3)], BONE, roundness=0.6)
    for ex in (18, 24):
        s.ellipse(ex, by - 7, 2.2, 2.4, auto_ramp("#1a1018"), flat=True)
        s.dot(ex, by - 7, "#7af0ff")
    s.px([(21, by - 4), (20, by - 3), (22, by - 3)], "#3a3020")
    for x in (18, 20, 22, 24):
        s.stroke([(x, by), (x, by + 2)], "#4a4030")
    # 頭盔殘片
    s.curve([(14, by - 9), (18, by - 15), (25, by - 15), (28, by - 9), (24, by - 12), (17, by - 12)], RUST, roundness=0.8, tex="metal")
    return s


# ============================================================= 偃師傀儡（木偶、關節、牽絲）
def puppet(f=0):
    s = Sprite(44, 62)
    jerk = [0, 2, 0, -2][f]
    bob = [0, -1, 0, -1][f]
    WOOD = auto_ramp("#c89a5a")
    WOODD = auto_ramp("#9a6a3a")
    CLOTH = auto_ramp("#8a2a3a")
    JOINT = auto_ramp("#5a3a24")
    by = 28 + bob
    # 牽絲（從上方垂下來）
    for x in (8, 22, 36):
        s.stroke([(x, 0), (x, by - 14 if x == 22 else by + 6)], "#e8e0f0")
    # 腿（木條＋球關節）
    for x0, d in ((17, 1), (27, -1)):
        s.line(x0, by + 16, x0 + d * jerk * 0.5, by + 24, 4, WOOD, roundness=0.4)
        s.ellipse(x0 + d * jerk * 0.5, by + 24, 2.4, 2.4, JOINT)
        s.line(x0 + d * jerk * 0.5, by + 24, x0 + d * jerk, 58, 3.6, WOOD, roundness=0.4)
        s.ellipse(x0 + d * jerk, 59, 3, 1.6, WOODD, roundness=0.3)
    # 身體：木頭軀幹外罩紅衣
    s.curve([(14, by), (22, by - 3), (30, by), (31, by + 16), (22, by + 18), (13, by + 16)], CLOTH, roundness=1.0, tex="cloth")
    s.stroke([(22, by - 2), (22, by + 17)], "#e8c060")
    # 手臂：被線吊著，一高一低
    s.line(13, by + 2, 8, by + 6 - jerk, 3.4, WOOD, roundness=0.4)
    s.ellipse(8, by + 6 - jerk, 2.2, 2.2, JOINT)
    s.line(8, by + 6 - jerk, 8, by - 0 - jerk, 3, WOOD, roundness=0.4)
    s.line(31, by + 2, 36, by + 6 + jerk, 3.4, WOOD, roundness=0.4)
    s.ellipse(36, by + 6 + jerk, 2.2, 2.2, JOINT)
    s.line(36, by + 6 + jerk, 36, by + 12 + jerk, 3, WOOD, roundness=0.4)
    # 頭：木雕臉，畫上去的五官
    s.ellipse(22, by - 9, 7, 8, WOOD, roundness=1.2, tex="stone")
    s.stroke([(16, by - 11), (19, by - 10)], "#3a2014")
    s.stroke([(25, by - 10), (28, by - 11)], "#3a2014")
    s.px([(18, by - 8), (26, by - 8)], "#c0302a")
    s.px([(17, by - 5), (27, by - 5)], "#f09080")
    s.stroke([(20, by - 4), (22, by - 3), (24, by - 4)], "#3a2014")
    s.ellipse(22, by - 16, 4, 2.4, JOINT)
    # 下顎的機關縫
    s.stroke([(18, by - 3), (18, by)], "#5a3a24")
    s.stroke([(26, by - 3), (26, by)], "#5a3a24")
    return s


# ============================================================= 噬星幼蛛（側身、八腳、星點）
def spider(f=0):
    s = Sprite(56, 42)
    step = [1, 0, -1, 0][f]
    BODY = auto_ramp("#3a2a5a")
    LEG = auto_ramp("#4a3a6a")
    by = 24
    LEGD = auto_ramp("#2a1e40")
    # 遠側四隻腳（暗）：膝蓋高過身體、腳尖往外撐
    for i in range(4):
        x0 = 16 + i * 3
        ph = step if i % 2 == 0 else -step
        s.taper([(x0, by), (x0 - 8 + i * 6, by - 12 + ph), (x0 - 16 + i * 10, by + 14 + ph)], 3, 1.2, LEGD)
    # 腹部（星點）
    s.ellipse(38, by - 2, 13, 11, BODY, roundness=1.3)
    for (x, y) in ((34, by - 6), (40, by - 9), (44, by - 3), (37, by + 1), (42, by + 4)):
        s.px([(x, y)], "#f0e0ff")
    s.px([(40, by - 4), (39, by - 4), (41, by - 4), (40, by - 5), (40, by - 3)], "#b08aff")
    # 頭胸
    s.ellipse(18, by + 1, 8, 7, BODY, roundness=1.2)
    # 近側四隻腳（亮）
    for i in range(4):
        x0 = 18 + i * 3
        ph = -step if i % 2 == 0 else step
        s.taper([(x0, by + 3), (x0 - 10 + i * 7, by - 9 + ph), (x0 - 18 + i * 11, by + 16 + ph)], 3.4, 1.4, LEG)
    for ex in (12, 14, 16):
        s.dot(ex, by - 2 + (ex % 2), "#ff4a6a")
    s.taper([(11, by + 4), (8, by + 7), (9, by + 10)], 2.5, 1, CLAW)
    s.taper([(14, by + 5), (12, by + 8), (13, by + 11)], 2.5, 1, CLAW)
    # 吐的絲
    s.stroke([(50, by + 6), (54, by + 14), (55, by + 18)], "#e8e0f0")
    return s


# ============================================================= 火鬃狻猊（側身、火焰鬃）
def lion(f=0):
    s = Sprite(64, 50)
    fa, ba, bob = gait(f)
    flick = [0, 1, 0, -1][f]
    B = auto_ramp("#c8901a")
    BD = auto_ramp("#946414")
    MANE = ramp("#7a1a0a", "#c8381a", "#f0702a", "#ffb04a", "#ffe8a0")
    by = 26 + bob
    s.taper([(40, by + 5), (42 - ba * 3, by + 14), (41 - ba * 4, 47)], 5, 4, BD)
    s.taper([(20, by + 5), (18 + fa * 3, by + 14), (19 + fa * 4, 47)], 5, 4, BD)
    # 捲尾
    s.taper([(48, by - 2), (56, by - 6 + flick), (60, by - 14 + flick), (56, by - 18 + flick)], 5, 2, B)
    s.ellipse(56, by - 18 + flick, 4, 3.5, MANE, roundness=0.8)
    s.curve([(14, by - 6), (30, by - 8), (46, by - 6), (50, by + 2), (44, by + 10), (20, by + 10), (12, by + 4)], B, roundness=1.2, tex="fur")
    s.taper([(44, by + 4), (46 + ba * 3, by + 14), (45 + ba * 4, 48)], 7, 5, B)
    s.taper([(18, by + 4), (17 - fa * 3, by + 14), (18 - fa * 4, 48)], 7, 5, B)
    _claws(s, 16 - fa * 4, 48)
    _claws(s, 43 + ba * 4, 48)
    # 火焰鬃毛
    pts = []
    for i in range(14):
        a = math.pi * 2 * i / 14
        r = 13 if i % 2 == 0 else 9
        pts.append((15 + math.cos(a) * r, by - 6 + math.sin(a) * r + (flick if i % 4 == 0 else 0)))
    s.poly(pts, MANE, roundness=0.9)
    # 頭
    hy = by - 6
    s.ellipse(12, hy, 7, 6.5, B, roundness=1.2)
    s.ellipse(7, hy + 3, 4.5, 3.5, auto_ramp("#e8d0a0"), roundness=0.8)
    s.px([(4, hy + 1), (5, hy + 1)], INK)
    s.px([(9, hy - 2), (10, hy - 2)], "#ffe24a")
    s.dot(9, hy - 2, INK)
    s.stroke([(7, hy - 4), (11, hy - 3)], INK)
    s.stroke([(4, hy + 5), (9, hy + 5)], "#3a1a0a")
    s.px([(5, hy + 6), (8, hy + 6)], WHITE)
    s.ellipse(6, hy - 9, 2, 2, GOLD, roundness=1.0)
    return s


# ============================================================= 白羽鶴妖（站姿、丹頂）
def crane(f=0):
    s = Sprite(48, 64)
    step = [1, 0, -1, 0][f]
    flap = [0, 1, 2, 1][f]
    W = ramp("#7a8a9a", "#b8c4d0", "#e8eef4", "#f8fbff", "#ffffff")
    BLK = auto_ramp("#2a2a34")
    LEG = auto_ramp("#3a3030")
    by = 30
    # 細長的腿
    s.line(20, by + 12, 19 + step, 60, 1.6, LEG, roundness=0)
    s.line(27, by + 12, 28 - step, 60, 1.6, LEG, roundness=0)
    s.px([(17 + step, 61), (19 + step, 61), (21 + step, 61), (26 - step, 61), (28 - step, 61), (30 - step, 61)], "#3a3030")
    # 身體與翅膀
    s.curve([(14, by), (24, by - 6), (36, by - 2), (40, by + 8), (30, by + 14), (16, by + 12)], W, roundness=1.2, tex="fur")
    s.curve([(26, by - 2 - flap), (40, by - 4 - flap), (46, by + 4), (38, by + 10), (28, by + 8)], W, roundness=0.9)
    s.poly([(38, by + 4), (47, by + 6), (44, by + 12), (36, by + 10)], BLK, roundness=0.5)
    for x in (30, 34, 38):
        s.stroke([(x, by - 1 - flap), (x + 2, by + 6)], W[1])
    # 長頸與頭
    s.taper([(18, by - 2), (14, by - 10), (14, by - 18), (16, by - 24)], 5, 4, W)
    s.stroke([(14, by - 12), (14, by - 18)], BLK[2])
    s.ellipse(16, by - 26, 4, 3.5, W, roundness=1.1)
    s.ellipse(17, by - 29, 2, 1.6, auto_ramp("#e0202a"), roundness=1.0)
    s.taper([(13, by - 26), (6, by - 25), (2, by - 24)], 2.6, 1, auto_ramp("#d8c070"))
    s.dot(15, by - 27, INK)
    s.dot(15, by - 28, "#ff6a5a")
    return s


# ============================================================= 奔雷獸（側身、電光鬃）
def raiju(f=0):
    s = Sprite(62, 48)
    fa, ba, bob = gait(f)
    zap = f % 2
    F = auto_ramp("#3a4a8a")
    FD = auto_ramp("#2a3060")
    BOLT = ramp("#8a6a0a", "#e0b020", "#ffe24a", "#fff6b0", "#ffffff")
    by = 24 + bob
    s.taper([(40, by + 5), (42 - ba * 3, by + 13), (41 - ba * 4, 45)], 5, 3, FD)
    s.taper([(18, by + 5), (16 + fa * 3, by + 13), (17 + fa * 4, 45)], 5, 3, FD)
    # 閃電尾
    s.poly([(46, by - 2), (54, by - 8), (51, by - 9), (60, by - 18), (52, by - 12), (55, by - 11), (47, by + 2)], BOLT, roundness=0.3)
    s.curve([(12, by - 5), (26, by - 9), (42, by - 8), (48, by), (42, by + 8), (18, by + 9), (11, by + 3)], F, roundness=1.2, tex="fur")
    # 背上的電光鬃
    for i in range(5):
        x = 18 + i * 6
        h = 6 + ((i + zap) % 2) * 3
        s.poly([(x, by - 7), (x + 2, by - 7 - h), (x + 3, by - 9), (x + 5, by - 7)], BOLT, roundness=0.2)
    s.taper([(42, by + 4), (44 + ba * 3, by + 13), (43 + ba * 4, 46)], 6, 4, F)
    s.taper([(15, by + 4), (14 - fa * 3, by + 13), (15 - fa * 4, 46)], 6, 4, F)
    for x0 in (15 - fa * 4, 43 + ba * 4):
        s.px([(x0 - 1, 46), (x0 + 1, 46)], "#ffe24a")
    hy = by - 7
    s.ellipse(11, hy, 8, 7, F, roundness=1.2, tex="fur")
    s.poly([(7, hy - 4), (5, hy - 14), (11, hy - 6)], F, roundness=0.4)
    s.poly([(12, hy - 6), (17, hy - 13), (17, hy - 3)], FD, roundness=0.4)
    s.taper([(6, hy + 2), (1, hy + 3), (-2, hy + 4)], 7, 4, F)
    s.px([(-2, hy + 2), (-1, hy + 2)], INK)
    s.px([(7, hy - 1), (8, hy - 1), (9, hy - 1)], "#ffe24a")
    s.dot(8, hy - 1, "#ffffff")
    # 噼啪的電弧
    if zap:
        s.stroke([(24, by - 18), (27, by - 14), (25, by - 12), (29, by - 8)], "#fff6b0")
    else:
        s.stroke([(36, by - 18), (33, by - 14), (36, by - 12), (34, by - 9)], "#fff6b0")
    return s


# ============================================================= 玉甲神將（正面、玉甲、金鐧）
def jadeguard(f=0):
    s = Sprite(52, 64)
    fa, ba, bob = gait(f)
    JADE = ramp("#1a5a4a", "#2a8a6a", "#5ac898", "#a8f0cc", "#f0fff8")
    CLOTH = auto_ramp("#e8e0c8")
    SKIN = auto_ramp("#f2c6a0")
    by = 28 + bob
    s.taper([(21, by + 22), (20 - fa * 2, 60)], 7, 6, JADE, tex="metal")
    s.taper([(31, by + 22), (32 - ba * 2, 60)], 7, 6, JADE, tex="metal")
    s.curve([(14, by + 12), (38, by + 12), (40, by + 28), (26, by + 30), (12, by + 28)], CLOTH, roundness=0.8, tex="cloth")
    s.curve([(13, by), (26, by - 3), (39, by), (40, by + 18), (26, by + 21), (12, by + 18)], JADE, roundness=1.2, tex="metal")
    for y in (by + 5, by + 10, by + 15):
        s.stroke([(15, y), (37, y)], JADE[1])
    s.ellipse(26, by + 6, 3.5, 3.5, GOLD, roundness=1.0, tex="metal")
    for x0 in (12, 40):
        s.ellipse(x0, by + 2, 6, 5, JADE, roundness=1.1, tex="metal")
        s.ellipse(x0, by + 1, 2, 2, GOLD, roundness=1.0)
    # 金鐧
    s.taper([(42, by + 8), (45, by - 4), (47, by - 18)], 4, 3, GOLD, tex="metal", roundness=0.4)
    for y in (by - 2, by - 8, by - 14):
        s.stroke([(44, y), (48, y - 1)], GOLD[1])
    s.taper([(11, by + 5), (8, by + 14 + fa), (9, by + 20 + fa)], 5, 4, CLOTH)
    s.ellipse(9, by + 21 + fa, 2.4, 2.4, SKIN)
    s.ellipse(43, by + 9, 2.6, 2.6, SKIN)
    # 頭盔（玉冠＋護面）
    s.ellipse(26, by - 8, 7, 7.5, SKIN, roundness=1.1)
    s.curve([(18, by - 6), (18, by - 15), (26, by - 19), (34, by - 15), (34, by - 6), (30, by - 10), (22, by - 10)], JADE, roundness=1.0, tex="metal")
    s.poly([(24, by - 19), (26, by - 27), (28, by - 19)], GOLD, roundness=0.4)
    s.px([(22, by - 8), (23, by - 8), (29, by - 8), (30, by - 8)], "#1a1018")
    s.stroke([(21, by - 10), (24, by - 9)], INK)
    s.stroke([(31, by - 10), (28, by - 9)], INK)
    s.stroke([(24, by - 3), (28, by - 3)], "#8a4a3a")
    return s
