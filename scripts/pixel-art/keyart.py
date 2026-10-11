"""主畫面主視覺：月夜仙山。270×480，遊戲裡放大兩倍。

只有主畫面用這一張（其他頁面照舊用各境界的遠景）。內容是修仙題材最典型的幾樣東西：
明月、浮空仙山與山頂仙宮、從山上落進雲海的飛瀑、雲海、遠山。
水墨只用在「遠山」：靛青墨色分五階往下淡，背光坡加幾道皴筆——像素為底、水墨點綴。

會動的東西不畫在這張裡：御劍的主角（title-hero.png）、仙鶴（title-crane-*.png）、
祥雲與靈光由遊戲疊上去，才有空氣感。
"""
import math
import os
import random

from backdrops import BAYER, Canvas, H, W, dith, hx, mix, orb
from engine import Sprite, auto_ramp, ramp
from refine import write_png
from engine import to_hex_grid
import hd

SKY = [hx(c) for c in ("#070a1c", "#0e1430", "#1a2248", "#2c3466", "#4a4c80", "#7a6a96")]
STOPS = [0, 0.2, 0.38, 0.52, 0.64, 0.74]
# 遠山的靛青墨色：濃 → 淡
INDIGO = [hx(c) for c in ("#0a0e22", "#141a3a", "#222a52", "#34406c", "#4e5a88", "#6e7aa4")]
MOON = {"sun": "#fff4d6"}


def sky(cv):
    for y in range(H):
        f = min(1.0, y / 330)
        k = 0
        while k < len(STOPS) - 2 and f > STOPS[k + 1]:
            k += 1
        seg = max(0.0, min(1.0, (f - STOPS[k]) / (STOPS[k + 1] - STOPS[k])))
        for x in range(W):
            cv.set(x, y, SKY[k + 1] if dith(x, y, seg) else SKY[k])


def stars(cv, rng):
    for _ in range(90):
        x, y = rng.randrange(W), rng.randrange(200)
        b = rng.random()
        cv.set(x, y, "#ffffff", 0.3 + 0.6 * b)
        if b > 0.94:
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                cv.set(x + dx, y + dy, "#cfe0ff", 0.4)


def ink_mountains(cv, rng, base, amp, peaks, depth, fade, texture=True):
    """水墨遠山：峰頂濃、往下五階淡進天色；背光坡加皴筆。depth 0..5 決定這一層最濃到哪一階。"""
    h = []
    y = float(base)
    target = base - amp * rng.random()
    for x in range(W):
        if x % 26 == 0:
            target = base - amp * rng.random() ** 1.3
        y += (target - y) * 0.13 + rng.uniform(-0.7, 0.7)
        h.append(y)
    for (px_, ph, pw) in peaks:
        for x in range(max(0, px_ - pw), min(W, px_ + pw)):
            d = abs(x - px_) / pw
            h[x] = min(h[x], base - ph * (1 - d ** 1.5))
    for x in range(W):
        top = int(h[x])
        slope = h[min(W - 1, x + 2)] - h[max(0, x - 2)]
        for yy in range(top, H):
            t = (yy - top) / fade
            lv = depth - t * depth
            if slope < 0:
                lv -= 0.6
            idx = int(lv)
            if lv - idx > 0.5 and (x + yy) % 2 == 0:
                idx += 1
            idx = max(0, min(depth, idx))
            if t >= 1:
                idx = 0
            # 越下面越接近「霧」：不是透明，是淡到最淺那一階
            cv.set(x, yy, INDIGO[len(INDIGO) - 1 - idx] if idx > 0 else INDIGO[-1])
        cv.set(x, top, INDIGO[0])
    if texture:
        for _ in range(W // 2):
            x = rng.randrange(W)
            slope = h[min(W - 1, x + 2)] - h[max(0, x - 2)]
            if slope <= 0.5:
                continue
            y0 = int(h[x]) + rng.randint(3, 16)
            for j in range(rng.randint(3, 8)):
                cv.set(x + j // 4, y0 + j, INDIGO[1])
    return h


def sea_of_clouds(cv, rng, y0):
    """月光下的雲海：一團團的積雲疊成好幾排，每團左上受光、右下沉進陰影，排與排之間有縫。"""
    rows = [
        (y0, ("#5a64a0", "#8a94cc", "#c8d0f4", "#f2f4ff")),
        (y0 + 20, ("#3e4680", "#646eaa", "#9aa4d8", "#d0d8f8")),
        (y0 + 42, ("#262c5a", "#3e4680", "#646eaa", "#9aa4d8")),
        (y0 + 68, ("#141834", "#222a52", "#3a4274", "#5a64a0")),
    ]
    for (y, tones) in rows:
        tones = [hx(c) for c in tones]
        x = rng.randint(-30, 0)
        while x < W + 30:
            r = rng.randint(12, 24)
            cy = y - rng.randint(0, 6)
            for yy in range(int(cy - r * 0.7), H):
                for xx in range(x - r, x + r + 1):
                    if not (0 <= xx < W and 0 <= yy < H):
                        continue
                    dx, dy = (xx - x) / r, (yy - cy) / (r * 0.7)
                    if dy < 0 and dx * dx + dy * dy > 1:
                        continue
                    # 受光：左上最亮
                    light = -dx * 0.5 - dy * 0.8
                    lv = 1 + light * 1.6 + (0.4 if dy < -0.6 else 0)
                    if yy > cy + r * 0.5:
                        lv = 0
                    idx = int(lv)
                    if lv - idx > 0.5 and (xx + yy) % 2 == 0:
                        idx += 1
                    cv.set(xx, yy, tones[max(0, min(3, idx))])
            x += int(r * 1.3)


def floating_isle(cv, rng, cx, top, w, depth, glow_falls=True, temple=False, pines=3):
    """浮空仙山：上面一座陡峭的山峰，下面倒錐岩根，垂藤，飛瀑往下落。"""
    ROCK = [hx(c) for c in ("#0c1028", "#181e40", "#262e5a", "#3a4478", "#56609a")]
    GRASS = [hx(c) for c in ("#1a3a3a", "#2a5a4a", "#3e7a5a")]
    peak_h = int(w * 0.9)
    # 山峰
    for j in range(peak_h):
        f = j / peak_h
        half = int(w / 2 * (0.25 + 0.75 * f ** 0.7))
        for i in range(-half, half + 1):
            lit = i < -half * 0.2
            c = ROCK[3] if lit else ROCK[2]
            if i == -half or i == half:
                c = ROCK[0]
            if (i * 3 + j * 7) % 13 == 0 and not lit:
                c = ROCK[1]
            cv.set(cx + i, top + j, c)
        if j % 6 == 0:
            cv.set(cx - half + 1, top + j, GRASS[2])
    base = top + peak_h
    # 平台的草
    for i in range(-w // 2, w // 2 + 1):
        cv.set(cx + i, base, GRASS[2] if i < 0 else GRASS[1])
        cv.set(cx + i, base + 1, GRASS[1])
    # 倒錐岩根
    for j in range(depth):
        f = j / depth
        half = int(w / 2 * (1 - f ** 1.1))
        for i in range(-half, half + 1):
            c = ROCK[2] if i < 0 else ROCK[1]
            if i == half or j == depth - 1:
                c = ROCK[0]
            cv.set(cx + i, base + 2 + j, c)
    # 垂藤
    for _ in range(w // 4):
        x = cx + rng.randint(-w // 3, w // 3)
        for j in range(rng.randint(4, 12)):
            if dith(x, base + depth + j, 0.8):
                cv.set(x, base + 2 + depth // 2 + j, GRASS[1])
    # 松
    for k in range(pines):
        x = cx - w // 2 + 3 + k * (w - 6) // max(1, pines - 1)
        for j in range(7):
            for i in range(-(j // 2), j // 2 + 1):
                cv.set(x + i, base - 7 + j, GRASS[0] if i > 0 else GRASS[1])
    # 飛瀑：從平台邊緣落下，越往下越散成霧
    if glow_falls:
        fx = cx - w // 5
        for j in range(140):
            for i in (-1, 0, 1):
                k = 1 - j / 150
                if dith(fx + i, base + j, k * (1 if i == 0 else 0.6)):
                    cv.set(fx + i, base + j, "#e8f4ff" if i == 0 else "#a8c4f0")
    if temple:
        _temple(cv, cx + 2, top + 2)
    return base


def _temple(cv, cx, y):
    """山頂仙宮：三層飛簷，金頂，窗透暖光。"""
    ROOF = hx("#2a1a38")
    ROOF_HI = hx("#f0c75e")
    WALL = hx("#7a3a3a")
    GLOW = hx("#ffd27a")
    GOLD = hx("#f0c75e")
    for tier in range(3):
        ww = 22 - tier * 6
        ty = y - tier * 9
        for i in range(-ww // 2, ww // 2 + 1):
            for j in range(5):
                cv.set(cx + i, ty - j, WALL)
        for i in range(-ww // 2 + 2, ww // 2 - 1, 3):
            cv.set(cx + i, ty - 2, GLOW)
            cv.set(cx + i, ty - 3, GLOW)
        rw = ww + 8
        for i in range(-rw // 2, rw // 2 + 1):
            cv.set(cx + i, ty - 6, ROOF_HI)
            cv.set(cx + i, ty - 7, ROOF)
        for i in range(-rw // 2 + 2, rw // 2 - 1):
            cv.set(cx + i, ty - 8, ROOF)
        for d in (-1, 1):
            cv.set(cx + d * (rw // 2 + 1), ty - 7, ROOF)
            cv.set(cx + d * (rw // 2 + 2), ty - 8, ROOF_HI)
            cv.set(cx + d * (rw // 2 + 2), ty - 9, GOLD)
    cv.set(cx, y - 35, GOLD)
    cv.set(cx, y - 34, GOLD)
    cv.set(cx, y - 33, GOLD)
    # 宮殿的光暈
    for yy in range(y - 40, y + 6):
        for xx in range(cx - 20, cx + 21):
            d = math.hypot((xx - cx) / 20, (yy - y + 14) / 22)
            if d < 1 and dith(xx, yy, (1 - d) * 0.18):
                cv.set(xx, yy, GLOW, 0.35)


def far_ink(cv, rng, base, amp, peaks, strength, fade):
    """帶天色的水墨遠山：峰線最濃，往下淡回天色（像墨在濕紙上暈開），背光坡加皴筆。"""
    h = []
    y = float(base)
    target = base - amp * rng.random()
    for x in range(W):
        if x % 22 == 0:
            target = base - amp * rng.random() ** 1.4
        y += (target - y) * 0.13 + rng.uniform(-0.7, 0.7)
        h.append(y)
    for (px_, ph, pw) in peaks:
        for x in range(max(0, px_ - pw), min(W, px_ + pw)):
            d = abs(x - px_) / pw
            h[x] = min(h[x], base - ph * (1 - d ** 1.4))
    ink = hx("#05071a")
    for x in range(W):
        top = int(h[x])
        slope = h[min(W - 1, x + 2)] - h[max(0, x - 2)]
        for yy in range(top, H):
            t = (yy - top) / fade
            k = strength * max(0.0, 1 - t) ** 0.7
            if slope < -0.4:
                k *= 0.7  # 受光坡留白
            # 四階量化，交界一格網點
            q = k * 4
            qi = int(q)
            if q - qi > 0.5 and (x + yy) % 2 == 0:
                qi += 1
            if qi <= 0:
                continue
            base_c = cv.get(x, yy)
            cv.set(x, yy, mix(base_c, ink, qi / 4 * 0.92))
        cv.set(x, top, mix(cv.get(x, top), ink, strength))
    for _ in range(W // 2):
        x = rng.randrange(2, W - 2)
        slope = h[min(W - 1, x + 2)] - h[max(0, x - 2)]
        if slope <= 0.4:
            continue
        y0 = int(h[x]) + rng.randint(4, 18)
        for j in range(rng.randint(3, 8)):
            cv.set(x + j // 4, y0 + j, mix(cv.get(x + j // 4, y0 + j), ink, strength * 0.9))
    return h


def mist_band(cv, y, hgt, k, color="#8a90c0"):
    c = hx(color)
    for x in range(W):
        off = math.sin(x / 19.0 + y) * 3 + math.sin(x / 6.7) * 1.2
        for j in range(hgt):
            yy = int(y + off + j)
            kk = k * (1 - abs(j - hgt / 2) / (hgt / 2))
            if dith(x, yy, kk):
                cv.set(x, yy, c, 0.55)


def great_isle(cv, rng, cx, top):
    """主峰：一座帶好幾個尖的浮空仙山，山頂仙宮，山腰飛瀑。"""
    ROCK = [hx(c) for c in ("#080a1e", "#121634", "#1e2450", "#2e386e", "#46528e", "#6672aa")]
    MOSS = [hx(c) for c in ("#123028", "#1e4a3a", "#2e6a4e", "#4a8a62")]
    w = 84
    # 輪廓：一叢高低錯落的石柱（張家界式），中央最高那根托著仙宮
    needles = [(-34, 30, 7), (-24, 46, 8), (-12, 38, 7), (2, 70, 10), (16, 50, 8), (27, 36, 7), (36, 24, 6)]
    prof = []
    for i in range(w):
        x = i - w / 2
        best = 10.0
        for (nx, nh, nw) in needles:
            d = abs(x - nx) / nw
            if d < 1:
                best = max(best, nh * (1 - d ** 3))
        prof.append(best + rng.uniform(-0.6, 0.6))
    plat = top + 70
    for i in range(w):
        x = cx - w // 2 + i
        ht = int(prof[i])
        for yy in range(plat - ht, plat):
            j = yy - (plat - ht)
            # 左亮右暗，越往下越暗，靠邊一格最暗
            lit = (i < w * 0.45)
            lv = 4 if lit else 3
            lv -= int((yy - (plat - ht)) / max(8, ht) * 2)
            if (i * 5 + yy * 3) % 17 == 0 or (i % 9 == 0 and (yy // 5) % 3 != 0):
                lv -= 1
            c = ROCK[max(1, min(5, lv))]
            cv.set(x, yy, c)
        cv.set(x, plat - ht, ROCK[5] if i < w * 0.45 else ROCK[3])
        # 峰頂的雪／苔
        if ht > 30 and rng.random() < 0.6:
            cv.set(x, plat - ht + 1, MOSS[3])
    # 山上的苔帶
    for k in range(6):
        y = plat - 10 - k * 8
        for i in range(w):
            if prof[i] > plat - y - top and rng.random() < 0.5:
                cv.set(cx - w // 2 + i, y - int(prof[i] * 0.0), MOSS[1])
    # 下方岩根：倒錐
    depth = 46
    for j in range(depth):
        f = j / depth
        half = int(w / 2 * (1 - f ** 1.05) * 0.95)
        for i in range(-half, half + 1):
            c = ROCK[2] if i < -half * 0.2 else ROCK[1]
            if abs(i) >= half - 1 or (i * 7 + j * 3) % 19 == 0:
                c = ROCK[0]
            cv.set(cx + i, plat + j, c)
    for i in range(-w // 2, w // 2):
        cv.set(cx + i, plat, MOSS[2])
        cv.set(cx + i, plat + 1, MOSS[1])
    # 垂藤
    for _ in range(18):
        x = cx + rng.randint(-w // 3, w // 3)
        for j in range(rng.randint(6, 18)):
            cv.set(x, plat + 3 + j, MOSS[1] if j % 3 else MOSS[2])
    # 松樹
    for x in (cx - 34, cx - 28, cx + 24, cx + 31):
        h0 = plat - int(prof[x - (cx - w // 2)]) if 0 <= x - (cx - w // 2) < w else plat
        for j in range(9):
            for i in range(-(j // 2), j // 2 + 1):
                cv.set(x + i, h0 - 9 + j, MOSS[0] if i > 0 else MOSS[2])
    # 山腰飛瀑：從主峰右肩冒出，落到雲海
    fx = cx + 14
    for j in range(170):
        y = plat - 26 + j
        k = 1 - j / 190
        for i in (-1, 0, 1, 2):
            if dith(fx + i, y, k * (1.0 if i in (0, 1) else 0.5)):
                cv.set(fx + i, y, "#f4faff" if i in (0, 1) else "#9ab8f0")
    # 飛瀑底的水霧
    for _ in range(40):
        x = fx + rng.randint(-10, 10)
        y = plat - 26 + 170 + rng.randint(-6, 4)
        cv.set(x, y, "#dfe8ff", 0.7)
    for j in range(4):
        for i in range(-7 + j, 8 - j):
            cv.set(cx + 2 + i, plat - 70 + 1 + j, ROCK[2] if i < 0 else ROCK[1])
    _temple(cv, cx + 2, plat - 70)
    return plat


def logo_stroke(cv, cy):
    """招牌後面的一筆墨痕：兩頭收尖、邊緣乾筆，深墨帶一點朱。"""
    rng = random.Random(5)
    ink = hx("#0a0610")
    x0, x1 = 22, 248
    for x in range(x0, x1):
        t = (x - x0) / (x1 - x0)
        taper = min(1.0, t * 5, (1 - t) * 3.5)
        hh = 18 * (0.45 + 0.55 * taper)
        y0 = cy - hh / 2 + math.sin(t * 3.1) * 2
        for j in range(int(hh)):
            if (j < 1 or j > hh - 2) and rng.random() < 0.4:
                continue
            if rng.random() < 0.03:
                continue
            cv.set(x, int(y0 + j), ink, 0.82)
    for _ in range(60):
        x = rng.randint(x0, x1)
        y = int(cy + rng.choice((-1, 1)) * rng.randint(6, 10))
        cv.set(x, y, ink, 0.6)


def keyart(seed=21):
    """主畫面上半部（0～215 列）是主視覺，下半部是介面，雲海一路墊到底、往下壓暗。"""
    rng = random.Random(seed)
    cv = Canvas()
    sky(cv)
    stars(cv, rng)
    orb(cv, MOON, 196, 116, 24, halo=2.4)
    far_ink(cv, rng, 176, 56, [(24, 90, 24), (150, 44, 18), (252, 100, 22)], 0.35, 100)
    far_ink(cv, rng, 206, 50, [(8, 110, 20), (214, 70, 20), (264, 120, 22)], 0.6, 120)
    great_isle(cv, rng, 82, 112)
    floating_isle(cv, rng, 236, 150, 26, 16, pines=3)
    floating_isle(cv, rng, 150, 178, 14, 9, glow_falls=False, pines=1)
    sea_of_clouds(cv, rng, 214)
    for y in range(250, H):
        k = min(0.88, (y - 250) / 120 * 0.88)
        for x in range(W):
            cv.set(x, y, "#070a1c", k)
    return cv


def logo(out_path):
    """招牌字：霞鶩文楷（只取這六個字的子集，見 fonts/）點陣化，金字、墨色粗邊、往下的實心影。

    這是整套美術裡唯一需要 Pillow 的地方（要把字型點陣化）。沒有 Pillow 就沿用 repo 裡的那張圖。
    """
    try:
        from PIL import Image, ImageDraw, ImageFont
    except ImportError:
        return 0
    font = ImageFont.truetype(os.path.join(os.path.dirname(os.path.abspath(__file__)), "fonts", "LXGWWenKaiTC-logo.ttf"), 40)
    w, h = 200, 58
    mask = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(mask)
    d.fontmode = "1"
    d.text((w // 2, h // 2 - 2), "問道飛升", fill=255, font=font, anchor="mm")
    m = mask.load()
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    o = out.load()
    ink, shadow = (16, 10, 20, 255), (60, 18, 20, 255)
    inside = lambda x, y: 0 <= x < w and 0 <= y < h and m[x, y] > 0
    for y in range(h):
        for x in range(w):
            if inside(x, y):
                continue
            # 往下兩格的實心影
            if inside(x, y - 2) or inside(x - 1, y - 2):
                o[x, y] = shadow
            # 墨色粗邊（兩格），像筆鋒外暈
            if any(inside(x + dx, y + dy) for dx in (-2, -1, 0, 1, 2) for dy in (-2, -1, 0, 1, 2) if abs(dx) + abs(dy) <= 3):
                o[x, y] = ink
    rows = [y for y in range(h) for x in range(w) if inside(x, y)]
    top, bot = min(rows), max(rows)
    for y in range(h):
        for x in range(w):
            if inside(x, y):
                t = (y - top) / max(1, bot - top)
                c = (255, 246, 200) if t < 0.35 else (240, 199, 94) if t < 0.7 else (196, 134, 46)
                o[x, y] = c + (255,)
    out.save(out_path)
    return 1


def hero_on_sword(f=0):
    """御劍的主角：門人站在一柄放大的飛劍上，腳下劍身往後拖。"""
    s = Sprite(70, 66)
    sw = [0, 1, 0, -1][f]
    STEEL = ramp("#2e3648", "#6a7a98", "#c0d0ec", "#eef4ff", "#ffffff")
    s.taper([(4, 58), (30, 57), (64, 56)], 3, 4, STEEL, tex="metal", roundness=0.2)
    s.poly([(52, 52), (55, 52), (55, 61), (52, 61)], ramp("#6a3e0c", "#b8801c", "#eebc40", "#ffe08a", "#fffbe0"), roundness=0.3)
    s.taper([(64, 56), (68, 60 + sw), (69, 64 + sw)], 2, 1, auto_ramp("#c0392b"))
    return s


def build(out_dir):
    write_png(keyart().grid(), os.path.join(out_dir, "title-key.png"))
    logo(os.path.join(out_dir, "title-logo.png"))
    # 御劍的主角：飛劍一張、人一張，遊戲裡疊在一起各自浮動
    write_png(to_hex_grid(hero_on_sword(0).render()), os.path.join(out_dir, "title-sword.png"))
    write_png(to_hex_grid(hd.disciple("sword", 2, 0).render()), os.path.join(out_dir, "title-hero.png"))
    for i, flap in enumerate((0, 1)):
        write_png(_crane(flap), os.path.join(out_dir, f"title-crane-{i}.png"))
    return 5


def _crane(flap):
    """遠處的仙鶴剪影：白身、黑翅尖、丹頂。12×8。"""
    g = [[None] * 12 for _ in range(8)]
    WHITE, BLACK, RED = "#f4f6ff", "#1a1a2a", "#e0302a"
    for (x, y) in ((4, 4), (5, 4), (6, 4), (7, 4), (3, 3), (2, 3), (8, 5)):
        g[y][x] = WHITE
    g[3][1] = RED
    g[3][0] = BLACK
    g[5][9] = BLACK
    g[6][10] = BLACK
    wing = [(5, 3), (6, 2), (7, 1), (8, 0)] if flap == 0 else [(5, 5), (6, 6), (7, 7)]
    for i, (x, y) in enumerate(wing):
        g[y][x] = BLACK if i >= 2 else WHITE
        g[y][x - 1] = WHITE
    return g
