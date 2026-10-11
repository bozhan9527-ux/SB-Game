"""原生解析度角色（engine.py）：妖物、首領、門人。

每個角色是一個函式，參數 f 是動畫幀（0..3），回傳 Sprite。
座標就是像素：畫布多大，遊戲裡就放大兩倍顯示，一格 = 兩點。
"""
import math

from engine import Sprite, auto_ramp, mix, ramp

INK = "#1a1018"
WHITE = "#fff8ec"
EYE_RED = "#ff3a3a"
STEEL = ramp("#2e3648", "#6a7a98", "#b8c6dc", "#e6eefc", "#ffffff")
GOLD = ramp("#6a3e0c", "#b8801c", "#eebc40", "#ffe08a", "#fffbe0")
PINK = ramp("#6a2a3a", "#a04858", "#d07484", "#eea0aa", "#ffd0d0")
GUM = ramp("#3a0810", "#6a1018", "#8a1a26", "#b03040", "#d05060")


def gait(f):
    """四幀走路：對角的兩條腿一起動。回傳（前腿擺幅、後腿擺幅、身體起伏）。"""
    a = [1.0, 0.0, -1.0, 0.0][f]
    return a, -a, [0, -1, 0, -1][f]


# ============================================================= 妖狼
def wolf(f=0, fur="#6f7a90", belly="#c4cad8", back="#3e4560"):
    s = Sprite(64, 48)
    fa, ba, bob = gait(f)
    F = auto_ramp(fur)
    FD = auto_ramp(mix(fur, "#1a1830", 0.4))
    B = auto_ramp(belly)
    K = auto_ramp(back)
    by = 22 + bob
    sw = [0, 1, 0, -1][f]
    # 遠側的腿：暗一階、和近側錯開
    s.taper([(22, by + 6), (21 + fa * 3, by + 15), (20 + fa * 4, 45)], 5, 3, FD)
    s.taper([(46, by + 4), (50 - ba * 2, by + 13), (46 - ba * 4, 45)], 6, 3, FD)
    # 尾巴：粗根、往後上翹
    s.taper([(50, by - 4), (57, by - 9 + sw), (61, by - 15 + sw * 2), (60, by - 19 + sw * 2)], 9, 2, F, tex="fur")
    # 後腿肌肉
    s.ellipse(45, by + 1, 9, 9, F, roundness=1.1, tex="fur")
    # 身軀：胸深、腰收
    s.curve([(10, by - 6), (26, by - 10), (44, by - 9), (52, by - 2), (46, by + 7), (32, by + 5), (20, by + 10), (10, by + 6)], F, roundness=1.1, tex="fur")
    # 胸腔
    s.ellipse(19, by + 1, 10, 9.5, F, roundness=1.2, tex="fur")
    # 背脊深色毛（帶一點毛刺）
    s.curve([(16, by - 9), (30, by - 12), (46, by - 10), (40, by - 6), (24, by - 6)], K, roundness=0.6, tex="fur")
    for i in range(5):
        x0 = 20 + i * 5
        s.poly([(x0, by - 10), (x0 + 2, by - 14), (x0 + 4, by - 10)], K, roundness=0.2)
    # 腹毛
    s.curve([(14, by + 6), (22, by + 5), (30, by + 6), (22, by + 10), (14, by + 10)], B, roundness=0.5)
    # 近側的腿：前腿直、後腿是反折的狗腿
    s.taper([(18, by + 4), (17 - fa * 3, by + 15), (16 - fa * 4, 46)], 9, 4, F)
    s.taper([(46, by + 3), (51 + ba * 2, by + 13), (47 + ba * 4, 46)], 10, 4, F)
    for x0 in (16 - fa * 4, 47 + ba * 4):
        s.px([(x0 - 2, 46), (x0, 46), (x0 + 2, 46)], "#e8e0d0")
    # 頸部毛領
    s.curve([(8, by - 8), (16, by - 12), (22, by - 4), (20, by + 6), (12, by + 6)], F, roundness=0.9, tex="fur")
    # 頭：大而低，往前探
    hy = by - 8
    s.ellipse(11, hy, 9, 8, F, roundness=1.2, tex="fur")
    # 耳朵
    s.poly([(8, hy - 5), (8, hy - 16), (14, hy - 6)], F, roundness=0.4)
    s.poly([(13, hy - 6), (18, hy - 15), (19, hy - 3)], FD, roundness=0.4)
    s.poly([(9.5, hy - 6), (9.5, hy - 12), (12.5, hy - 6)], PINK, flat=True)
    # 吻部：往左下伸
    s.taper([(8, hy + 2), (3, hy + 4), (-1, hy + 5)], 9, 6, B, roundness=0.7)
    s.px([(-1, hy + 2), (0, hy + 2), (-1, hy + 3), (0, hy + 3)], INK)
    s.dot(0, hy + 2, "#9090a8")
    # 嘴線、獠牙、吐舌的喘氣
    s.stroke([(1, hy + 7), (5, hy + 7), (9, hy + 5)], "#3a2030")
    s.px([(2, hy + 8), (6, hy + 8)], WHITE)
    s.px([(3, hy + 8), (4, hy + 8), (4, hy + 9)], "#d05060")
    # 怒眼：金瞳、赤芯，壓低的眉
    s.px([(6, hy - 1), (7, hy - 1), (8, hy - 1), (6, hy), (7, hy), (8, hy)], "#ffd84a")
    s.px([(7, hy - 1), (7, hy)], EYE_RED)
    s.stroke([(4, hy - 4), (9, hy - 2)], INK)
    # 舊傷疤
    s.stroke([(13, hy - 3), (16, hy + 2)], "#8a5a6a")
    return s


# ============================================================= 斗笠刀客
def bandit(f=0):
    s = Sprite(48, 60)
    fa, ba, bob = gait(f)
    by = 26 + bob
    TUNIC = auto_ramp("#8a6448")
    VEST = auto_ramp("#4a3a4e")
    WRAP = auto_ramp("#c8b48a")
    SKIN = auto_ramp("#e2aa80")
    HAT = auto_ramp("#d4ac5c")
    MASK = auto_ramp("#2e2836")
    LEATHER = auto_ramp("#6a3a24")
    # 腿：綁腿＋草鞋
    for x0, a in ((18, fa), (26, ba)):
        s.taper([(x0, by + 16), (x0 - a * 2, by + 24), (x0 - a * 3, 56)], 6, 5, VEST)
        s.taper([(x0 - a * 2, by + 23), (x0 - a * 3, 56)], 5, 5, WRAP, tex="cloth")
        s.ellipse(x0 - a * 3, 57, 3.5, 1.6, LEATHER, roundness=0.3)
    # 內衫
    s.curve([(13, by + 1), (22, by - 2), (31, by + 1), (33, by + 18), (22, by + 21), (11, by + 18)], TUNIC, roundness=1.0, tex="cloth")
    # 外背心
    s.poly([(13, by + 1), (19, by - 1), (21, by + 19), (12, by + 18)], VEST, roundness=0.6)
    s.poly([(25, by - 1), (31, by + 1), (32, by + 18), (24, by + 19)], VEST, roundness=0.6)
    # 腰帶與錢袋
    s.poly([(11, by + 12), (33, by + 12), (33, by + 15), (11, by + 15)], LEATHER, roundness=0.2)
    s.ellipse(29, by + 17, 3, 3, auto_ramp("#a07a3a"), roundness=1)
    s.dot(22, by + 13, "#e8c060")
    # 後手
    s.taper([(13, by + 3), (8, by + 10 + fa), (7, by + 16 + fa)], 6, 5, TUNIC, tex="cloth")
    s.ellipse(7, by + 17 + fa, 2.6, 2.6, SKIN)
    # 刀：握在前手，刀身斜舉
    s.taper([(34, by + 9), (38, by - 4), (41, by - 16), (42, by - 20)], 4, 2, STEEL, tex="metal", roundness=0.2)
    s.poly([(31, by + 8), (37, by + 6), (37, by + 9), (31, by + 11)], GOLD, roundness=0.2)
    s.line(31, by + 12, 33, by + 9, 3, LEATHER)
    # 前手（包著布）
    s.taper([(31, by + 3), (34, by + 7), (34, by + 10)], 6, 5, WRAP, tex="cloth")
    s.ellipse(34, by + 10, 2.6, 2.6, SKIN)
    # 頭
    s.ellipse(22, by - 7, 7.5, 8, SKIN, roundness=1.1)
    s.curve([(14, by - 6), (30, by - 6), (30, by + 1), (22, by + 3), (14, by + 1)], MASK, roundness=0.6)
    # 兇眼
    s.px([(18, by - 8), (19, by - 8), (25, by - 8), (26, by - 8)], WHITE)
    s.px([(19, by - 8), (25, by - 8)], INK)
    s.stroke([(16, by - 11), (20, by - 9)], INK)
    s.stroke([(28, by - 11), (24, by - 9)], INK)
    # 斗笠：竹編紋＋帽緣
    s.poly([(1, by - 10), (22, by - 25), (43, by - 10), (22, by - 13)], HAT, roundness=0.7)
    for i in range(5):
        s.stroke([(22, by - 24), (6 + i * 8, by - 11)], "#a8823e")
    s.line(2, by - 10, 42, by - 10, 2, auto_ramp("#8a6a30"), roundness=0)
    s.dot(22, by - 25, "#c0302a")
    return s


# ============================================================= 鬼火
def ghost(f=0):
    s = Sprite(44, 52, rim=False)
    bob = [0, -1, -2, -1][f]
    wav = [0, 1, 2, 1][f]
    BODY = ramp("#24506e", "#4c92b8", "#86d0ea", "#c4f4ff", "#ffffff")
    CORE = ramp("#7ad8f0", "#a8eeff", "#d8fbff", "#ffffff", "#ffffff")
    y = 8 + bob
    # 水滴形的身體，拖一條往右下捲的尾巴
    s.curve([(8, y + 16), (11, y + 4), (21, y - 1), (31, y + 4), (35, y + 15), (32, y + 25),
             (30 + wav, y + 33), (34 + wav * 2, y + 40), (27 + wav, y + 38), (22, y + 32), (13, y + 27)], BODY, roundness=1.5)
    # 兩隻垂下的袖狀殘影
    s.taper([(10, y + 18), (5, y + 24 + wav), (4, y + 29 + wav)], 5, 1, BODY, roundness=0.6)
    s.taper([(33, y + 18), (38, y + 23 - wav), (40, y + 28 - wav)], 5, 1, BODY, roundness=0.6)
    s.ellipse(19, y + 11, 7, 6, CORE, roundness=1.4)
    # 空洞的眼與嘴
    for ex in (15, 25):
        s.px([(ex + i, y + 12 + j) for i in range(3) for j in range(5) if not (j in (0, 4) and i != 1)], "#0e1e2a")
        s.px([(ex + 1, y + 14)], "#7ff8ff")
    s.px([(19, y + 21), (20, y + 21), (21, y + 21), (19, y + 22), (20, y + 23), (21, y + 22)], "#0e1e2a")
    # 額上的鎮魂符
    TAL = ramp("#8a6a2a", "#d8b450", "#f6dc8a", "#fff0c0", "#ffffff")
    s.poly([(18, y - 6), (25, y - 6), (25, y + 7), (18, y + 7)], TAL, flat=True)
    s.stroke([(19, y - 4), (24, y - 4)], "#c0302a")
    s.stroke([(21, y - 4), (21, y + 5)], "#c0302a")
    s.stroke([(19, y), (23, y + 2)], "#c0302a")
    s.stroke([(19, y + 4), (24, y + 4)], "#c0302a")
    # 周圍飄的小鬼火
    for (ox, oy) in ((3, y + 4 - wav), (41, y + 10 + wav), (39, y - 2)):
        s.px([(ox, oy), (ox, oy - 1), (ox + 1, oy)], "#bff8ff")
    return s


# ============================================================= 修士（四門派共用骨架）
def cultivator(f=0, robe="#3f7fc0", inner="#eae4d6", trim="#f0d890", hair="#201c34", sash="#c0392b", weapon="sword"):
    s = Sprite(44, 60)
    fa, ba, bob = gait(f)
    by = 24 + bob
    R = auto_ramp(robe)
    RD = auto_ramp(mix(robe, "#14122a", 0.4))
    IN = auto_ramp(inner)
    T = auto_ramp(trim)
    SK = auto_ramp("#f2c6a0")
    H = auto_ramp(hair)
    SA = auto_ramp(sash)
    flutter = [0, 1, 2, 1][f]
    # 髮帶（在頭後面飄）
    s.taper([(25, by - 20), (31, by - 19 + flutter), (37, by - 17 + flutter), (41, by - 18 + flutter * 2)], 3, 1, SA, roundness=0.3)
    # 背劍
    if weapon == "sword":
        s.taper([(9, by + 20), (20, by + 2), (31, by - 15)], 3, 2, STEEL, tex="metal", roundness=0.2)
        s.poly([(27, by - 11), (33, by - 7), (34, by - 9), (28, by - 13)], GOLD, roundness=0.3)
        s.line(31, by - 14, 34, by - 18, 2.5, auto_ramp("#5a2a1a"))
    elif weapon == "gourd":
        s.ellipse(33, by + 14, 4, 4.5, auto_ramp("#c89a40"))
        s.ellipse(33, by + 8, 2.8, 3, auto_ramp("#c89a40"))
        s.line(33, by + 4, 33, by + 6, 1.5, SA)
    # 腳
    s.taper([(18, by + 26), (18 - fa * 2, 56)], 4, 4, RD)
    s.taper([(26, by + 26), (26 - ba * 2, 56)], 4, 4, RD)
    s.ellipse(17 - fa * 2, 57, 3, 1.6, auto_ramp("#2a2230"), roundness=0.3)
    s.ellipse(27 - ba * 2, 57, 3, 1.6, auto_ramp("#2a2230"), roundness=0.3)
    # 外袍：下擺外擴、有布紋
    s.curve([(15, by + 1), (22, by - 1), (29, by + 1), (34, by + 30), (22, by + 33), (10, by + 30)], R, roundness=1.0, tex="cloth")
    # 交領內衫
    s.poly([(18, by + 1), (22, by + 9), (26, by + 1), (24, by + 1), (22, by + 5), (20, by + 1)], IN, roundness=0.3)
    # 衣緣滾邊
    s.stroke([(20, by + 1), (22, by + 9), (22, by + 32)], T[3])
    s.stroke([(24, by + 1), (22, by + 9)], T[2])
    s.stroke([(10, by + 30), (22, by + 33), (34, by + 30)], T[2])
    # 腰帶與流蘇
    s.poly([(14, by + 12), (30, by + 12), (30, by + 15), (14, by + 15)], SA, roundness=0.2)
    s.taper([(27, by + 15), (28 + flutter * 0.5, by + 21), (28 + flutter, by + 25)], 2, 1, SA, roundness=0.2)
    s.dot(22, by + 13, T[3])
    # 寬袖：一前一後擺
    s.curve([(15, by + 3), (8, by + 12 + fa), (6, by + 20 + fa), (12, by + 21 + fa), (17, by + 14)], R, roundness=0.8, tex="cloth")
    s.curve([(29, by + 3), (36, by + 12 + ba), (38, by + 20 + ba), (32, by + 21 + ba), (27, by + 14)], R, roundness=0.8, tex="cloth")
    s.stroke([(6, by + 20 + fa), (12, by + 21 + fa)], T[2])
    s.stroke([(32, by + 21 + ba), (38, by + 20 + ba)], T[2])
    s.ellipse(9, by + 21 + fa, 2, 2, SK)
    s.ellipse(35, by + 21 + ba, 2, 2, SK)
    # 頭
    s.ellipse(22, by - 8, 7.5, 8, SK, roundness=1.2)
    # 頭髮：瀏海與兩側垂髮
    s.curve([(14, by - 6), (14, by - 14), (22, by - 18), (30, by - 14), (30, by - 6), (26, by - 11), (18, by - 11)], H, roundness=0.9)
    s.taper([(14, by - 9), (13, by - 2), (14, by + 3)], 3, 1, H)
    s.taper([(30, by - 9), (31, by - 2), (30, by + 3)], 3, 1, H)
    s.stroke([(17, by - 15), (21, by - 17)], H[4])
    # 髮髻與玉簪
    s.ellipse(22, by - 20, 4, 3.2, H)
    s.line(16, by - 21, 29, by - 19, 1.6, auto_ramp("#7ad8b0"), roundness=0)
    # 五官
    s.px([(18, by - 8), (18, by - 7), (26, by - 8), (26, by - 7)], INK)
    s.px([(18, by - 8), (26, by - 8)], "#4a6aa0")
    s.stroke([(17, by - 10), (19, by - 10)], H[1])
    s.stroke([(25, by - 10), (27, by - 10)], H[1])
    s.px([(16, by - 5), (28, by - 5)], "#f2a090")
    s.stroke([(21, by - 4), (23, by - 4)], "#a85a4a")
    return s


# ============================================================= 首領：赤目狼王
def wolf_king(f=0):
    s = Sprite(128, 120)
    breathe = [0, -1, -2, -1][f]
    flick = [0, 1, 0, -1][f]
    M1 = ramp("#4a0c14", "#901a24", "#d03a2e", "#f87040", "#ffc070")
    M2 = ramp("#7a1820", "#c43a2c", "#ee6a34", "#ffa050", "#ffe0a0")
    M3 = ramp("#a02a20", "#e05a30", "#ff8c40", "#ffc070", "#fff0c0")
    FUR = auto_ramp("#525a7a")
    FUR_D = auto_ramp("#3a3f5c")
    BELLY = auto_ramp("#c4c8d6")
    cx, cy = 64, 58 + breathe
    # 三層鬃毛：外層暗、內層亮，尖端隨幀擺動
    for layer, (mat, ro, ri, ph) in enumerate(((M1, 56, 38, 0.0), (M2, 46, 32, 0.5), (M3, 36, 26, 0.0))):
        pts = []
        n = 18
        for i in range(n * 2):
            a = math.pi * 2 * (i + ph) / (n * 2) - math.pi / 2
            r = (ro if i % 2 == 0 else ri) + (flick * (2 - layer) if i % 4 == 0 else 0)
            pts.append((cx + math.cos(a) * r, cy + 4 + math.sin(a) * r * 0.9))
        s.poly(pts, mat, roundness=0.9)
    # 前肢與爪
    for d in (-1, 1):
        x0 = cx + d * 30
        s.curve([(x0 - 9, cy + 30), (x0 + 6, cy + 28), (x0 + 9 * d + d, cy + 50), (x0 + 4, cy + 58), (x0 - 10, cy + 58), (x0 - 12, cy + 44)], FUR, roundness=1.0, tex="fur")
        for k in range(3):
            cxk = x0 - 7 + k * 6
            s.poly([(cxk, cy + 56), (cxk + 2, cy + 61), (cxk + 4, cy + 56)], ramp("#8a8070", "#c8bca0", "#ece2c8", "#fff8e8", "#ffffff"), roundness=0.2)
    # 胸前白毛
    s.curve([(cx - 18, cy + 22), (cx, cy + 18), (cx + 18, cy + 22), (cx + 10, cy + 40), (cx, cy + 46), (cx - 10, cy + 40)], BELLY, roundness=0.8, tex="fur")
    # 耳
    for d in (-1, 1):
        s.poly([(cx + d * 24, cy - 14), (cx + d * 30, cy - 46), (cx + d * 10, cy - 26)], FUR_D, roundness=0.5)
        s.poly([(cx + d * 22, cy - 18), (cx + d * 26, cy - 38), (cx + d * 14, cy - 26)], PINK, flat=True)
    # 頭
    s.curve([(cx - 30, cy), (cx - 24, cy - 22), (cx, cy - 28), (cx + 24, cy - 22), (cx + 30, cy), (cx + 20, cy + 24), (cx, cy + 32), (cx - 20, cy + 24)], FUR, roundness=1.3, tex="fur")
    # 臉頰毛束
    for d in (-1, 1):
        bx = cx + d * 28
        s.poly([(bx, cy - 2), (bx + d * 9, cy + 6), (bx + d * 3, cy + 7), (bx + d * 10, cy + 14), (bx - d * 2, cy + 14)], FUR, roundness=0.4, tex="fur")
    # 額頭深色紋
    s.curve([(cx - 8, cy - 26), (cx, cy - 28), (cx + 8, cy - 26), (cx + 3, cy - 10), (cx - 3, cy - 10)], FUR_D, roundness=0.5)
    # 吻部
    s.curve([(cx - 14, cy + 12), (cx, cy + 4), (cx + 14, cy + 12), (cx + 12, cy + 26), (cx, cy + 31), (cx - 12, cy + 26)], BELLY, roundness=1.0)
    s.ellipse(cx, cy + 9, 6, 4, ramp("#0c0810", "#1a1018", "#2a2030", "#5a5070", "#9a90b0"), roundness=0.8)
    s.px([(cx - 2, cy + 7), (cx - 1, cy + 7)], "#c0bcd0")
    # 張口：上下獠牙
    s.poly([(cx - 11, cy + 18), (cx + 11, cy + 18), (cx + 7, cy + 26), (cx - 7, cy + 26)], GUM, flat=True)
    s.poly([(cx - 6, cy + 23), (cx + 6, cy + 23), (cx + 4, cy + 26), (cx - 4, cy + 26)], ramp("#a03040", "#c04050", "#e06070", "#f08090", "#ffb0b8"), flat=True)
    for x in (cx - 9, cx - 5, cx + 5, cx + 9):
        s.px([(x, cy + 18), (x, cy + 19), (x, cy + 20)], WHITE)
    for x in (cx - 7, cx + 7):
        s.px([(x, cy + 26), (x, cy + 25), (x, cy + 24)], WHITE)
    # 金冠
    s.poly([(cx - 16, cy - 24), (cx - 14, cy - 38), (cx - 8, cy - 30), (cx, cy - 44), (cx + 8, cy - 30), (cx + 14, cy - 38), (cx + 16, cy - 24)], GOLD, roundness=0.6, tex="metal")
    s.ellipse(cx, cy - 31, 3, 3, ramp("#5a0810", "#a0101a", "#e82a3a", "#ff7a80", "#ffffff"), roundness=1.0)
    s.dot(cx - 1, cy - 32, "#ffffff")
    for d in (-1, 1):
        s.ellipse(cx + d * 10, cy - 27, 1.6, 1.6, ramp("#0a3a4a", "#1a7a8a", "#3ac8d8", "#8af0ff", "#ffffff"), roundness=1.0)
    # 赤目
    for d in (-1, 1):
        ex = cx + d * 14
        eye = [(ex + i * -d, cy - 6 + j) for i in range(-5, 6) for j in range(5)
               if not (j == 0 and abs(i) > 2) and not (j == 4 and abs(i) > 3) and not (j == 0 and i * -d > 0)]
        s.px(eye, "#ffe25a")
        s.px([(ex + i, cy - 5 + j) for i in (-1, 0, 1) for j in (0, 1, 2, 3)], "#ff2020")
        s.px([(ex, cy - 4), (ex, cy - 3)], "#3a0000")
        s.dot(ex - 1, cy - 5, "#fff8d0")
        # 怒眉：兩格粗、往鼻樑壓
        for i in range(-7, 9):
            yy = cy - 12 + (i + 7) * 0.45
            s.px([(ex - d * i, int(yy)), (ex - d * i, int(yy) + 1)], INK)
        # 額上赤紋
        s.stroke([(ex - d * 2, cy - 22), (ex - d * 8, cy - 15)], "#d0202a")
    # 舊疤：右眼一道
    s.stroke([(cx + 10, cy - 14), (cx + 18, cy + 2)], "#c06070")
    return s


# ============================================================= 門人：四門派 × 三階
SECT_LOOK = {
    # 劍修：青袍、髮髻玉簪、背劍
    "sword": dict(robe="#3f7fc0", inner="#eae4d6", trim="#f0d890", hair="#201c34", sash="#c0392b"),
    # 體修：橘色短打、頭帶、纏手、短髮
    "body": dict(robe="#d0702a", inner="#f4d8a8", trim="#f0d060", hair="#3a2418", sash="#5a2a14"),
    # 符修：紫袍兜帽、手持黃符
    "talisman": dict(robe="#6a4aa8", inner="#e0d4f4", trim="#f0d26a", hair="#2a1e48", sash="#f0d26a"),
    # 丹修：綠袍、葫蘆、靈草
    "alchemy": dict(robe="#3f8a4a", inner="#e8f4d8", trim="#f0d060", hair="#1e2a1a", sash="#8a5a2a"),
}
CAPE = {"sword": "#1f2f52", "body": "#5a1f1a", "talisman": "#2a1d48", "alchemy": "#1f3a2a"}


def disciple(sect, tier, f=0):
    """門人。tier 0 素袍、1 加金邊披肩、2 再加披風、頭冠、靈光與門派專屬配件。"""
    L = SECT_LOOK[sect]
    s = Sprite(40, 54)
    fa, ba, bob = gait(f)
    by = 22 + bob
    R = auto_ramp(L["robe"])
    RD = auto_ramp(mix(L["robe"], "#14122a", 0.4))
    IN = auto_ramp(L["inner"])
    T = auto_ramp(L["trim"])
    SK = auto_ramp("#f2c6a0")
    H = auto_ramp(L["hair"])
    SA = auto_ramp(L["sash"])
    flutter = [0, 1, 2, 1][f]
    cx = 20
    # 巔峰：身後披風
    if tier == 2:
        s.curve([(cx - 7, by), (cx + 7, by), (cx + 12 + flutter, by + 26), (cx, by + 29), (cx - 12, by + 26)], auto_ramp(CAPE[sect]), roundness=0.7, tex="cloth")
    # 門派配件（在身後的）
    if sect == "sword":
        s.taper([(cx - 11, by + 18), (cx, by + 2), (cx + 10, by - 14)], 3, 2, STEEL, tex="metal", roundness=0.2)
        s.poly([(cx + 6, by - 10), (cx + 12, by - 6), (cx + 13, by - 8), (cx + 7, by - 12)], GOLD, roundness=0.3)
        s.line(cx + 10, by - 13, cx + 13, by - 17, 2.2, auto_ramp("#5a2a1a"))
    elif sect == "alchemy":
        for k, (x, y) in enumerate(((cx - 12, by + 4), (cx - 14, by - 2), (cx - 10, by - 4))):
            s.ellipse(x, y, 2.6, 1.6, auto_ramp("#5fbf55"), roundness=0.6)
        s.line(cx - 11, by + 12, cx - 12, by - 2, 1, auto_ramp("#3a7a2a"), roundness=0)
    if sect != "talisman":
        s.taper([(cx + 3, by - 18), (cx + 9, by - 17 + flutter), (cx + 15, by - 15 + flutter), (cx + 18, by - 16 + flutter * 2)], 2.6, 1, SA if sect != "body" else auto_ramp("#f0d060"), roundness=0.3)
    # 腳
    s.taper([(cx - 4, by + 22), (cx - 4 - fa * 2, 50)], 4, 4, RD)
    s.taper([(cx + 4, by + 22), (cx + 4 - ba * 2, 50)], 4, 4, RD)
    s.ellipse(cx - 5 - fa * 2, 51, 3, 1.5, auto_ramp("#2a2230"), roundness=0.3)
    s.ellipse(cx + 5 - ba * 2, 51, 3, 1.5, auto_ramp("#2a2230"), roundness=0.3)
    # 袍子（體修是短打）
    hem = 22 if sect == "body" else 27
    s.curve([(cx - 6, by + 1), (cx, by - 1), (cx + 6, by + 1), (cx + 11, by + hem), (cx, by + hem + 3), (cx - 11, by + hem)], R, roundness=1.0, tex="cloth")
    s.poly([(cx - 3, by + 1), (cx, by + 7), (cx + 3, by + 1), (cx + 2, by + 1), (cx, by + 4), (cx - 2, by + 1)], IN, roundness=0.3)
    s.stroke([(cx - 2, by + 1), (cx, by + 7), (cx, by + hem + 2)], T[3] if tier else T[1])
    s.stroke([(cx - 11, by + hem), (cx, by + hem + 3), (cx + 11, by + hem)], T[2] if tier else R[1])
    s.poly([(cx - 8, by + 10), (cx + 8, by + 10), (cx + 8, by + 13), (cx - 8, by + 13)], SA, roundness=0.2)
    s.dot(cx, by + 11, T[3])
    # 披肩（中階起）
    if tier >= 1:
        s.curve([(cx - 9, by + 1), (cx, by - 1), (cx + 9, by + 1), (cx + 10, by + 6), (cx, by + 8), (cx - 10, by + 6)], auto_ramp(mix(L["robe"], "#ffffff", 0.15)), roundness=0.8)
        s.stroke([(cx - 10, by + 6), (cx, by + 8), (cx + 10, by + 6)], GOLD[2])
    # 手臂
    if sect == "body":
        # 纏手的大拳頭
        for x0, d, a in ((cx - 7, -1, fa), (cx + 7, 1, ba)):
            s.taper([(x0, by + 3), (x0 + d * 4, by + 10 + a), (x0 + d * 4, by + 15 + a)], 5, 4, SK)
            s.ellipse(x0 + d * 4, by + 16 + a, 3.4, 3, auto_ramp("#e8dcc0"), roundness=1.0, tex="cloth")
            if tier == 2:
                s.poly([(x0 + d * 2, by + 9 + a), (x0 + d * 6, by + 9 + a), (x0 + d * 6, by + 12 + a), (x0 + d * 2, by + 12 + a)], GOLD, roundness=0.3, tex="metal")
    else:
        s.curve([(cx - 6, by + 2), (cx - 12, by + 10 + fa), (cx - 14, by + 18 + fa), (cx - 9, by + 19 + fa), (cx - 4, by + 12)], R, roundness=0.8, tex="cloth")
        s.curve([(cx + 6, by + 2), (cx + 12, by + 10 + ba), (cx + 14, by + 18 + ba), (cx + 9, by + 19 + ba), (cx + 4, by + 12)], R, roundness=0.8, tex="cloth")
        s.ellipse(cx - 12, by + 19 + fa, 1.8, 1.8, SK)
        s.ellipse(cx + 12, by + 19 + ba, 1.8, 1.8, SK)
    # 頭
    s.ellipse(cx, by - 8, 7, 7.5, SK, roundness=1.2)
    if sect == "talisman":
        # 兜帽：臉藏在陰影裡，只剩兩點眼光
        s.curve([(cx - 9, by - 2), (cx - 9, by - 12), (cx, by - 18), (cx + 9, by - 12), (cx + 9, by - 2), (cx + 5, by - 6), (cx - 5, by - 6)], R, roundness=1.0, tex="cloth")
        s.ellipse(cx, by - 6, 5, 4, auto_ramp("#2a2140"), flat=True)
        s.px([(cx - 2, by - 6), (cx + 2, by - 6)], "#ffe9a8")
        s.stroke([(cx - 8, by - 10), (cx, by - 14), (cx + 8, by - 10)], T[2] if tier else R[3])
    else:
        if sect == "body":
            s.curve([(cx - 7, by - 8), (cx - 6, by - 14), (cx, by - 16), (cx + 6, by - 14), (cx + 7, by - 8), (cx + 3, by - 12), (cx - 3, by - 12)], H, roundness=0.9)
            s.stroke([(cx - 7, by - 11), (cx + 7, by - 11)], "#f0d060")
        else:
            s.curve([(cx - 8, by - 6), (cx - 8, by - 13), (cx, by - 17), (cx + 8, by - 13), (cx + 8, by - 6), (cx + 4, by - 10), (cx - 4, by - 10)], H, roundness=0.9)
            s.taper([(cx - 8, by - 8), (cx - 9, by - 1), (cx - 8, by + 3)], 3, 1, H)
            s.taper([(cx + 8, by - 8), (cx + 9, by - 1), (cx + 8, by + 3)], 3, 1, H)
            s.ellipse(cx, by - 19, 3.6, 2.8, H)
            s.line(cx - 6, by - 20, cx + 6, by - 18, 1.4, auto_ramp("#7ad8b0" if sect == "sword" else "#e0c060"), roundness=0)
        s.stroke([(cx - 5, by - 14), (cx - 1, by - 16)], H[4])
        s.px([(cx - 3, by - 8), (cx - 3, by - 7), (cx + 3, by - 8), (cx + 3, by - 7)], INK)
        s.px([(cx - 3, by - 8), (cx + 3, by - 8)], "#4a6aa0")
        s.px([(cx - 5, by - 5), (cx + 5, by - 5)], "#f2a090")
        s.stroke([(cx - 1, by - 4), (cx + 1, by - 4)], "#a85a4a")
    # 頭冠（巔峰）
    if tier == 2:
        cy0 = by - 21 if sect in ("sword", "alchemy") else by - 16
        s.poly([(cx - 4, cy0), (cx - 3, cy0 - 4), (cx, cy0 - 2), (cx + 3, cy0 - 4), (cx + 4, cy0)], GOLD, roundness=0.4, tex="metal")
    # 門派配件（在身前的）
    TAL = ramp("#8a6a2a", "#d8b450", "#f6dc8a", "#fff0c0", "#ffffff")
    if sect == "talisman":
        n = 3 if tier == 2 else 1
        for k in range(n):
            x0 = cx + 13 - k * 4 if n > 1 else cx + 13
            y0 = by + 8 - k * 5 - (flutter if k else 0)
            s.poly([(x0, y0), (x0 + 4, y0), (x0 + 4, y0 + 8), (x0, y0 + 8)], TAL, flat=True)
            s.stroke([(x0 + 2, y0 + 1), (x0 + 2, y0 + 7)], "#c0302a")
            s.dot(x0 + 1, y0 + 4, "#c0302a")
    elif sect == "alchemy":
        s.ellipse(cx + 9, by + 16, 3.4, 3.8, auto_ramp("#c89a40"), roundness=1.1)
        s.ellipse(cx + 9, by + 11, 2.2, 2.4, auto_ramp("#c89a40"), roundness=1.1)
        s.dot(cx + 9, by + 8, SA[2])
        if tier == 2:
            for k, (x, y) in enumerate(((cx - 14, by - 6), (cx + 15, by - 10), (cx - 15, by + 6))):
                s.ellipse(x, y + (flutter if k % 2 else -flutter), 1.8, 1.8, auto_ramp("#ff9a3a"), roundness=1.2)
    elif sect == "sword" and tier == 2:
        # 御劍：身旁懸著第二柄劍
        s.taper([(cx + 15, by + 18 - flutter), (cx + 15, by + 4 - flutter), (cx + 15, by - 2 - flutter)], 2.6, 1, STEEL, tex="metal", roundness=0.2)
        s.stroke([(cx + 13, by + 16 - flutter), (cx + 17, by + 16 - flutter)], GOLD[2])
    # 靈光（巔峰）
    if tier == 2:
        for (x, y) in ((cx - 15, by - 14), (cx + 16, by + 24), (cx - 13, by + 28)):
            s.px([(x, y - flutter), (x, y - 1 - flutter)], "#fff3b0")
    return s
