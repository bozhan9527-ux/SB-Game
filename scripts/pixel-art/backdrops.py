"""十個境界的遠景：一張 270×480 的像素畫，遊戲裡放大兩倍鋪滿 540×960。

每個境界一套色票、一種地貌。色票跟著修行進度走：
煉氣的青玉晨光 → 築基竹林的清晨 → 金丹雲海的午後 → 元嬰火山的黃昏 →
化神仙宮的月夜 → 煉虛浮島的極光 → 合體的赤色劫雲 → 大乘的緋色仙宮 →
渡劫的雷暴 → 飛升的天界金光。

天空最上面一段一律壓得夠暗：各頁的標題字直接寫在天空上，亮天會吃掉字。
下半部交給遊戲裡的暗幕處理，這裡只管畫。
"""
import math
import random

from refine import write_png

W, H = 270, 480
HORIZON = 250

BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]


def hx(c):
    c = c.lstrip("#")
    return tuple(int(c[i:i + 2], 16) for i in (0, 2, 4))


def mix(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


class Canvas:
    def __init__(self):
        self.px = [[(0, 0, 0)] * W for _ in range(H)]

    def set(self, x, y, c, a=1.0):
        if 0 <= x < W and 0 <= y < H:
            if isinstance(c, str):
                c = hx(c)
            self.px[y][x] = c if a >= 1 else mix(self.px[y][x], c, a)

    def get(self, x, y):
        return self.px[y][x]

    def rect(self, x, y, w, h, c, a=1.0):
        for j in range(y, y + h):
            for i in range(x, x + w):
                self.set(i, j, c, a)

    def grid(self):
        return [["#%02x%02x%02x" % p for p in row] for row in self.px]


def dith(x, y, k):
    """Bayer 4×4：k（0..1）越大，這一格越可能被點上。"""
    return BAYER[y % 4][x % 4] < k * 16


# ---------------------------------------------------------------- 色票
PALETTES = {
    "qi": dict(
        sky=["#0b1a26", "#123444", "#1f5a64", "#3f8c88", "#86c4ae", "#d6ecd0"],
        mtn=["#3f7f7c", "#2a5c62", "#1a3c46", "#0c1f28"],
        hi=["#7ab8a6", "#4f908a", "#2e5e66", "#1a3640"],
        mist="#eef7ea", sun="#fffbe6", star=0.5,
    ),
    "foundation": dict(
        sky=["#0a1b1e", "#12343a", "#235a56", "#4f8f74", "#a3c98e", "#e4eec4"],
        mtn=["#4f8a6a", "#33684e", "#1f4636", "#0e2420"],
        hi=["#82b88a", "#56906a", "#34664c", "#1c3a2c"],
        mist="#f0f4d8", sun="#fff8d8", star=0.35,
    ),
    "golden": dict(
        sky=["#101a3a", "#1d3264", "#3a5a8c", "#7c8ca4", "#e0b878", "#ffe2a0"],
        mtn=["#7a6a7c", "#564a62", "#3a3048", "#1c1828"],
        hi=["#c8a07a", "#8a7470", "#5a4a5a", "#2e2638"],
        mist="#fff0d0", sun="#fff4c0", star=0.3,
    ),
    "nascent": dict(
        sky=["#1b1030", "#2e1640", "#5a2148", "#a2384a", "#e0714e", "#f3b26a"],
        mtn=["#6d2f4f", "#4a2140", "#2c1430", "#170b1c"],
        hi=["#9c4a5e", "#6e3352", "#43203f", "#28132c"],
        mist="#f6c9a0", sun="#ffe2a0", star=0.6,
    ),
    "spirit": dict(
        sky=["#070b1e", "#0e1634", "#1a2652", "#2c3c74", "#4a5c96", "#7c88b8"],
        mtn=["#34407a", "#252e5e", "#181e42", "#0b0f24"],
        hi=["#5e6cae", "#414e8c", "#2a3462", "#171c3a"],
        mist="#c8d0f0", sun="#f6f0d8", star=1.0,
    ),
    "void": dict(
        sky=["#040c14", "#08202a", "#0e343c", "#16504e", "#2c7468", "#5aa08a"],
        mtn=["#2a5a5a", "#1c4246", "#122c32", "#08181e"],
        hi=["#5aa49a", "#3c7a76", "#24525a", "#143238"],
        mist="#b8f0dc", sun="#e8fff4", star=1.0,
    ),
    "unity": dict(
        sky=["#160a0e", "#2c1016", "#4c1a1c", "#7a2c22", "#b44a2a", "#e88a4a"],
        mtn=["#5a2a28", "#401c1e", "#2a1216", "#14080c"],
        hi=["#9a4a3a", "#6a302a", "#44201e", "#261012"],
        mist="#f4b48a", sun="#ffd0a0", star=0.0,
    ),
    "mahayana": dict(
        sky=["#160c1e", "#2a1434", "#4a1e4a", "#7a3060", "#c05a7a", "#f4a4a4"],
        mtn=["#7a3a62", "#5a2a50", "#3a1a38", "#1c0c1e"],
        hi=["#b4608a", "#844068", "#562848", "#2e1428"],
        mist="#fcd8d8", sun="#fff0e0", star=0.7,
    ),
    "tribulation": dict(
        sky=["#08080e", "#121220", "#1e1c30", "#2e2a40", "#4a4258", "#6c6070"],
        mtn=["#3a3448", "#2a2638", "#1a1826", "#0c0b14"],
        hi=["#5e5670", "#443e56", "#2c283a", "#18161f"],
        mist="#b8b0c8", sun="#ffe680", star=0.0,
    ),
    "ascension": dict(
        sky=["#1a1430", "#3a2c58", "#6a5a8a", "#b0a0b8", "#f0dcb0", "#fff4d8"],
        mtn=["#b8a8c8", "#8a7aa4", "#5a4c7a", "#2a2240"],
        hi=["#f4e8f0", "#c8b8d8", "#8a7aa8", "#4a3c68"],
        mist="#fffaf0", sun="#ffffff", star=0.4,
    ),
}
STOPS = [0, 0.26, 0.46, 0.63, 0.79, 0.92]


# ---------------------------------------------------------------- 基本筆觸
def sky(cv, p, horizon):
    cols = [hx(c) for c in p["sky"]]
    for y in range(H):
        f = min(1.0, y / (horizon + 30))
        k = 0
        while k < len(STOPS) - 2 and f > STOPS[k + 1]:
            k += 1
        seg = max(0.0, min(1.0, (f - STOPS[k]) / (STOPS[k + 1] - STOPS[k])))
        for x in range(W):
            # 色帶之間只用網點過渡：像素畫的質感就在這一格一格裡
            cv.set(x, y, cols[k + 1] if dith(x, y, seg) else cols[k])


def stars(cv, rng, p, until):
    n = int(70 * p["star"])
    for _ in range(n):
        x, y = rng.randrange(W), rng.randrange(until)
        b = rng.random()
        cv.set(x, y, "#ffffff", 0.35 + 0.6 * b)
        if b > 0.93:
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                cv.set(x + dx, y + dy, "#ffffff", 0.35)


def orb(cv, p, cx, cy, r, halo=2.6, craters=True):
    s = hx(p["sun"])
    for y in range(int(cy - r * halo) - 1, int(cy + r * halo) + 2):
        for x in range(int(cx - r * halo) - 1, int(cx + r * halo) + 2):
            d = math.hypot(x - cx, y - cy)
            if d <= r:
                edge = d > r - 1.2 and (x - cx) + (y - cy) > 0
                cv.set(x, y, mix(s, (0, 0, 0), 0.12) if edge else s)
            elif d <= r * halo:
                k = 1 - (d - r) / (r * (halo - 1))
                if dith(x, y, k * k * 0.55):
                    cv.set(x, y, s, 0.45)
    if craters:
        for (dx, dy, rr) in ((r * 0.3, -r * 0.25, r * 0.22), (-r * 0.35, r * 0.3, r * 0.15)):
            for y in range(int(cy + dy - rr), int(cy + dy + rr) + 1):
                for x in range(int(cx + dx - rr), int(cx + dx + rr) + 1):
                    if math.hypot(x - cx - dx, y - cy - dy) <= rr:
                        cv.set(x, y, mix(s, (120, 110, 100), 0.25))


def mist(cv, p, y, height, strength, a=0.5):
    m = hx(p["mist"])
    for j in range(height):
        k = strength * (1 - abs(j - height / 2) / (height / 2))
        for x in range(W):
            if dith(x, y + j, k):
                cv.set(x, y + j, m, a)


def ridge(cv, rng, base, amp, step, col, hi, sharp=1.0, fill_to=H):
    """一道山稜：隨機遊走的峰線，迎光的左坡多一格亮邊。"""
    h = []
    y = float(base)
    target = base - amp * rng.random()
    for x in range(W):
        if x % step == 0:
            target = base - amp * (rng.random() ** sharp)
        y += (target - y) * 0.12 + rng.uniform(-0.6, 0.6)
        h.append(int(y))
    for x in range(W):
        top = h[x]
        for yy in range(max(0, top), fill_to):
            cv.set(x, yy, col)
        slope = h[min(W - 1, x + 1)] - h[max(0, x - 1)]
        cv.set(x, top, hi)
        if slope > 0:
            cv.set(x, top + 1, hi)
            # 受光坡往下再拖一段網點，山才有體積
            for k in range(2, 7):
                if dith(x, top + k, 0.5 - k * 0.07):
                    cv.set(x, top + k, hi)
    return h


def pine(cv, x, y, s, col, hi):
    for j in range(s):
        w = (j * 2) // 3 + 1
        if j % 4 == 3:
            w -= 1
        for i in range(-w, w + 1):
            cv.set(x + i, y - s + j, hi if i == -w else col)
    cv.rect(x, y, 1, 3, col)


def pagoda(cv, x, y, tiers, col, window, roof):
    for k in range(tiers):
        w = 12 - k * 2
        top = y - k * 8
        cv.rect(x - w // 2, top - 5, w, 5, col)
        cv.rect(x - w // 2 - 3, top - 7, w + 6, 2, roof)
        cv.set(x - w // 2 - 4, top - 8, roof)
        cv.set(x + w // 2 + 3, top - 8, roof)
        for i in range(-w // 2 + 2, w // 2 - 1, 3):
            cv.set(x + i, top - 3, window)
    cv.rect(x, y - tiers * 8 - 6, 1, 4, roof)


def hall(cv, cx, base, scale, col, roof, window):
    """仙宮：三層樓閣，飛簷上翹、窗透光。"""
    for tier in range(3):
        w = int((60 - tier * 14) * scale)
        hgt = int(16 * scale)
        y = base - tier * int(20 * scale)
        cv.rect(cx - w // 2, y - hgt, w, hgt, col)
        for i in range(cx - w // 2 + 3, cx + w // 2 - 3, 5):
            cv.rect(i, y - hgt + 4, 2, 3, window)
        rw = w + int(14 * scale)
        cv.rect(cx - rw // 2, y - hgt - 3, rw, 3, roof)
        cv.rect(cx - rw // 2 + 3, y - hgt - 5, rw - 6, 2, roof)
        cv.set(cx - rw // 2 - 1, y - hgt - 4, roof)
        cv.set(cx + rw // 2, y - hgt - 4, roof)
        cv.set(cx - rw // 2 - 2, y - hgt - 5, roof)
        cv.set(cx + rw // 2 + 1, y - hgt - 5, roof)
    cv.rect(cx, base - 3 * int(20 * scale) - 8, 1, 6, roof)


def bamboo(cv, rng, x, top, bottom, col, hi, leaf):
    for y in range(top, bottom):
        cv.set(x, y, col)
        cv.set(x + 1, y, hi)
        if (y - top) % 14 == 0:
            cv.rect(x - 1, y, 4, 1, hi)
            if rng.random() < 0.6:
                d = rng.choice((-1, 1))
                for k in range(6):
                    cv.set(x + d * (2 + k), y - k // 2, leaf)
                    cv.set(x + d * (2 + k), y - k // 2 + 1, leaf)


def cloud_bank(cv, p, rng, y, amp, col, hi, n=6, depth=None):
    """一排積雲：圓頂相接，頂緣受光。"""
    tops = [H] * W
    for _ in range(n):
        cx = rng.randrange(-20, W + 20)
        r = rng.randint(amp // 2, amp)
        for x in range(cx - r, cx + r + 1):
            if 0 <= x < W:
                t = y - int(math.sqrt(max(0, r * r - (x - cx) ** 2)) * 0.6)
                tops[x] = min(tops[x], t)
    for x in range(W):
        if tops[x] >= H:
            tops[x] = y
        bottom = H if depth is None else y + depth
        for yy in range(tops[x], bottom):
            # 有底的雲：底緣往下用網點收掉，不是一刀切
            if depth is None or yy < bottom - 6 or dith(x, yy, (bottom - yy) / 6):
                cv.set(x, yy, col)
        cv.set(x, tops[x], hi)
        if dith(x, tops[x] + 1, 0.6):
            cv.set(x, tops[x] + 1, hi)
    return tops


def bolt(cv, x, y, length, col, glow, branch=True):
    """閃電：兩格寬的亮芯、外圈網點光暈，中途分岔一支。"""
    rng = random.Random(x * 31 + y)
    glow = hx(glow)
    for k in range(length):
        for dx in range(-5, 7):
            if dx in (0, 1):
                continue
            if dith(x + dx, y, 0.55 - abs(dx - 0.5) * 0.09):
                cv.set(x + dx, y, glow, 0.55)
        cv.set(x, y, "#ffffff")
        cv.set(x + 1, y, col)
        y += 1
        if k % 6 == 5:
            x += rng.choice((-4, -3, 3, 4))
        if branch and k == length // 2:
            bolt(cv, x, y, length // 3, col, "#%02x%02x%02x" % glow, branch=False)


# ---------------------------------------------------------------- 地貌
def peaks(cv, p, rng):
    stars(cv, rng, p, 110)
    orb(cv, p, 196, 104, 13)
    mist(cv, p, HORIZON - 44, 18, 0.35)
    ridge(cv, rng, HORIZON - 8, 78, 30, p["mtn"][0], p["hi"][0], sharp=1.5)
    mist(cv, p, HORIZON + 8, 16, 0.5)
    r1 = ridge(cv, rng, HORIZON + 30, 62, 22, p["mtn"][1], p["hi"][1], sharp=1.2)
    pagoda(cv, 64, r1[64] + 2, 3, p["mtn"][2], p["sun"], p["mtn"][3])
    mist(cv, p, HORIZON + 44, 14, 0.55)
    r2 = ridge(cv, rng, HORIZON + 72, 40, 18, p["mtn"][2], p["hi"][2])
    for x in range(4, W, 9):
        if rng.random() < 0.55:
            pine(cv, x, r2[x] + 2, rng.randint(5, 9), p["mtn"][3], p["hi"][2])
    ridge(cv, rng, HORIZON + 120, 26, 14, p["mtn"][3], p["hi"][3])


def forest(cv, p, rng):
    stars(cv, rng, p, 90)
    orb(cv, p, 70, 96, 11, craters=False)
    ridge(cv, rng, HORIZON - 4, 60, 34, p["mtn"][0], p["hi"][0], sharp=1.3)
    mist(cv, p, HORIZON + 6, 20, 0.55)
    ridge(cv, rng, HORIZON + 34, 34, 20, p["mtn"][1], p["hi"][1])
    mist(cv, p, HORIZON + 40, 14, 0.5)
    # 三排竹林，越近越粗越暗
    for row, (top, col, hi, leaf, gap) in enumerate((
        (HORIZON - 10, p["mtn"][1], p["hi"][1], p["hi"][0], 11),
        (HORIZON - 40, p["mtn"][2], p["hi"][2], p["hi"][1], 15),
        (HORIZON - 80, p["mtn"][3], p["hi"][3], p["hi"][2], 23),
    )):
        x = rng.randrange(gap)
        while x < W:
            bamboo(cv, rng, x, top + rng.randint(-20, 20), H, col, hi, leaf)
            x += gap + rng.randint(-3, 3)
        mist(cv, p, HORIZON + 50 + row * 30, 10, 0.3 + row * 0.1)
    cv.rect(0, HORIZON + 140, W, H - HORIZON - 140, p["mtn"][3])


def sea(cv, p, rng):
    stars(cv, rng, p, 80)
    orb(cv, p, 180, 150, 18, halo=3.2, craters=False)
    # 遠山從雲海裡冒出尖頂
    for (cx, w, hgt, k) in ((40, 30, 50, 0), (110, 22, 36, 0), (222, 34, 64, 0), (160, 16, 28, 1)):
        for j in range(hgt):
            half = int(w * j / hgt)
            for i in range(-half, half + 1):
                c = p["hi"][k] if i < -half + 2 else p["mtn"][k]
                cv.set(cx + i, HORIZON - hgt + j, c)
    for row in range(4):
        y = HORIZON - 6 + row * 26
        tops = cloud_bank(cv, p, rng, y, 26 - row * 3,
                          mix(hx(p["mist"]), hx(p["mtn"][min(3, row)]), 0.35 + row * 0.18),
                          hx(p["mist"]) if row < 2 else hx(p["hi"][min(3, row)]), n=7)
        if row == 1:
            pagoda(cv, 200, tops[200] + 3, 2, p["mtn"][2], p["sun"], p["mtn"][3])


def volcano(cv, p, rng):
    stars(cv, rng, p, 100)
    orb(cv, p, 60, 92, 10, craters=False)
    ridge(cv, rng, HORIZON - 4, 40, 30, p["mtn"][0], p["hi"][0])
    vx, top, base = 190, HORIZON - 90, HORIZON + 30
    for j in range(top, base):
        half = int(14 + (j - top) * 0.95)
        for i in range(-half, half + 1):
            lit = i < -half + (j - top) // 6 + 3
            cv.set(vx + i, j, p["hi"][1] if lit else p["mtn"][1])
    # 火口與岩漿
    lava, glow = hx("#ff7a2a"), hx("#ffd06a")
    cv.rect(vx - 14, top, 29, 2, glow)
    x = vx - 4
    for j in range(top + 2, base - 10):
        cv.set(x, j, lava)
        cv.set(x + 1, j, lava, 0.6)
        if j % 4 == 0:
            x -= 1
    for k in range(40):
        a = rng.uniform(-0.6, 0.6)
        d = rng.uniform(4, 40)
        cv.set(int(vx + math.sin(a) * d), int(top - d * 1.2), glow, rng.uniform(0.3, 0.8))
    # 火口上方的煙
    for k in range(10):
        cy = top - 12 - k * 9
        cx = vx + int(math.sin(k * 0.8) * 8) + k * 2
        r = 6 + k
        for y in range(cy - r // 2, cy + r // 2):
            for xx in range(cx - r, cx + r):
                if math.hypot((xx - cx) / r, (y - cy) / (r / 2)) < 1 and dith(xx, y, 0.5 - k * 0.04):
                    cv.set(xx, y, p["mtn"][2])
    mist(cv, p, HORIZON + 20, 16, 0.45)
    r2 = ridge(cv, rng, HORIZON + 60, 44, 20, p["mtn"][2], p["hi"][2])
    for x in range(6, W, 13):
        if rng.random() < 0.4:
            pine(cv, x, r2[x] + 2, rng.randint(5, 8), p["mtn"][3], p["hi"][2])
    ridge(cv, rng, HORIZON + 112, 26, 14, p["mtn"][3], p["hi"][3])


def palace(cv, p, rng):
    stars(cv, rng, p, 130)
    orb(cv, p, 194, 100, 16)
    ridge(cv, rng, HORIZON - 10, 70, 32, p["mtn"][0], p["hi"][0], sharp=1.4)
    mist(cv, p, HORIZON + 4, 18, 0.5)
    r1 = ridge(cv, rng, HORIZON + 40, 50, 26, p["mtn"][1], p["hi"][1])
    window = mix(hx(p["sun"]), hx("#ffb040"), 0.4)
    hall(cv, 70, r1[70] + 4, 0.8, p["mtn"][2], p["mtn"][3], window)
    hall(cv, 200, r1[200] + 6, 1.0, p["mtn"][2], p["mtn"][3], window)
    hall(cv, 140, r1[140] + 2, 0.55, p["mtn"][2], p["mtn"][3], window)
    mist(cv, p, HORIZON + 50, 18, 0.6)
    r2 = ridge(cv, rng, HORIZON + 90, 30, 16, p["mtn"][3], p["hi"][3])
    for x in range(5, W, 11):
        if rng.random() < 0.45:
            pine(cv, x, r2[x] + 2, rng.randint(6, 10), p["mtn"][3], p["hi"][3])


def voidrock(cv, p, rng):
    stars(cv, rng, p, 220)
    # 極光：幾條斜飄的光帶
    aur = hx(p["hi"][0])
    for band in range(3):
        y0 = 40 + band * 26
        for x in range(W):
            yc = y0 + math.sin(x / 30 + band) * 10
            for j in range(-8, 9):
                k = 0.45 * (1 - abs(j) / 8)
                if dith(x, int(yc + j), k):
                    cv.set(x, int(yc + j), aur, 0.55)
    orb(cv, p, 60, 120, 9, craters=False)
    for (cx, cy, w, k) in ((200, 140, 40, 0), (70, 196, 30, 0), (150, 226, 50, 1), (232, 254, 26, 1), (40, 276, 36, 2)):
        depth = w // 2 + 6
        for j in range(depth):
            f = j / depth
            half = int(w / 2 * (1 - f ** 1.3)) + (2 if j < 3 else 0)
            for i in range(-half, half + 1):
                if j < 2:
                    c = p["hi"][max(0, k - 1)]
                elif j < 4:
                    c = p["hi"][k]
                else:
                    # 岩體：左亮右暗，再撒幾道裂紋
                    c = p["hi"][k] if i < -half + 2 else p["mtn"][min(3, k + 1)] if i > half - 3 else p["mtn"][k]
                    if (i * 7 + j * 3) % 11 == 0:
                        c = p["mtn"][min(3, k + 1)]
                cv.set(cx + i, cy + j, c)
        for r in range(4):
            x = cx - w // 3 + rng.randint(0, 2 * w // 3)
            for j in range(rng.randint(4, 14)):
                if dith(x, cy + depth + j, 0.75):
                    cv.set(x, cy + depth - 4 + j, p["mtn"][k])
        pine(cv, cx + rng.randint(-w // 4, w // 4), cy, rng.randint(6, 9), p["mtn"][min(3, k + 1)], p["hi"][k])
    mist(cv, p, HORIZON + 50, 20, 0.5)
    ridge(cv, rng, HORIZON + 110, 30, 16, p["mtn"][3], p["hi"][3])


def storm(cv, p, rng, gold=False):
    # 劫雲：好幾層厚雲，底下透出雷光
    bolt_col = "#fff2a0" if gold else "#ffd8b0"
    for row in range(4):
        y = 60 + row * 30
        cloud_bank(cv, p, rng, y, 30, hx(p["mtn"][min(3, 3 - row)]), hx(p["hi"][min(3, 3 - row)]), n=6, depth=44)
    bolt(cv, 204, 120, 130, bolt_col, p["sun"])
    if gold:
        bolt(cv, 54, 140, 110, bolt_col, p["sun"])
    for k in range(2):
        mist(cv, p, 150 + k * 40, 12, 0.3)
    r = ridge(cv, rng, HORIZON + 60, 50, 22, p["mtn"][2], p["hi"][1])
    pagoda(cv, 220, r[220] + 2, 4, p["mtn"][3], p["sun"], p["mtn"][3])
    ridge(cv, rng, HORIZON + 110, 30, 16, p["mtn"][3], p["hi"][3])


def celestial(cv, p, rng):
    stars(cv, rng, p, 100)
    light = hx(p["sun"])
    # 光柱
    for i in range(5):
        x0 = 20 + i * 58
        for y in range(0, HORIZON + 40):
            half = 8 + y * 0.06
            for x in range(int(x0 - half), int(x0 + half)):
                if dith(x, y, 0.18 * (1 - y / (HORIZON + 60))):
                    cv.set(x, y, light, 0.6)
    orb(cv, p, 135, 92, 14, halo=3.4, craters=False)
    # 浮環
    for k in range(3):
        cy, rx, ry = 92, 34 + k * 14, 8 + k * 3
        for a in range(0, 360, 2):
            x = int(135 + rx * math.cos(math.radians(a)))
            y = int(cy + ry * math.sin(math.radians(a)))
            cv.set(x, y, light, 0.5 - k * 0.12)
    # 遠處天宮
    window = hx("#ffe6a0")
    hall(cv, 135, HORIZON - 10, 1.1, p["mtn"][1], p["hi"][0], window)
    for row in range(4):
        y = HORIZON - 4 + row * 28
        # 越近越暗：天界的雲海若整片亮白，壓在上面的按鈕與字就讀不到了
        cloud_bank(cv, p, rng, y, 24, mix(hx(p["mist"]), hx(p["mtn"][min(3, row)]), 0.3 + row * 0.24),
                   mix(hx(p["mist"]), hx(p["mtn"][min(3, row)]), row * 0.18), n=8)


SCENERY = {
    "peaks": peaks, "forest": forest, "sea": sea, "volcano": volcano, "palace": palace,
    "voidrock": voidrock, "storm": storm, "celestial": celestial,
}

REALMS = [
    ("qi", "peaks"), ("foundation", "forest"), ("golden", "sea"), ("nascent", "volcano"),
    ("spirit", "palace"), ("void", "voidrock"), ("unity", "storm"), ("mahayana", "palace"),
    ("tribulation", "storm"), ("ascension", "celestial"),
]


def lum(c):
    return (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255


def settle(cv, p, start=130, ramp=50, target=0.3):
    """介面安全區：主要的面板與說明字都在畫面中下段，那一段的遠景整體壓暗到平均亮度 target 以下。

    天界的雲海、金丹的午後天光本身很亮，字直接寫在上面就讀不到。
    壓暗是往這張圖最深的山色靠，不是往黑色靠——色相留著，只是沉下去。
    """
    band = [lum(cv.get(x, y)) for y in range(start + ramp, H) for x in range(0, W, 2)]
    mean = sum(band) / len(band)
    strength = max(0.0, 1 - target / mean) if mean > 0 else 0.0
    if strength <= 0:
        return
    deep = hx(p["mtn"][3])
    for y in range(start, H):
        k = strength * min(1.0, (y - start) / ramp)
        for x in range(W):
            cv.set(x, y, mix(cv.get(x, y), deep, k))


def backdrop(realm, scenery, seed):
    p = PALETTES[realm]
    cv = Canvas()
    rng = random.Random(seed)
    sky(cv, p, HORIZON)
    if scenery == "storm":
        storm(cv, p, rng, gold=(realm == "tribulation"))
    else:
        SCENERY[scenery](cv, p, rng)
    settle(cv, p)
    return cv


def build(out_dir):
    import os
    for i, (realm, scenery) in enumerate(REALMS):
        write_png(backdrop(realm, scenery, 11 + i * 7).grid(), os.path.join(out_dir, f"bg-{realm}.png"))
    return len(REALMS)


if __name__ == "__main__":
    import os
    import sys
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "public", "art")
    print("wrote", build(out))
