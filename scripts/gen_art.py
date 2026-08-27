"""產生人物與妖獸的 SVG：全彩、每個角色兩幀走路循環。

以程式產生而非逐檔手寫的理由：
- 兩幀之間必須「只有四肢不同、其餘完全一致」，手寫很難維持
- 門派造型要分三個階（隨境界提升換裝），同一套骨架帶不同配件最省事
- 改配色只要動一個色表
"""
import math
import os

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'public', 'art')
DOC = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">\n  {body}\n</svg>\n'


def write(name, w, h, parts):
    with open(os.path.join(OUT, name), 'w', encoding='utf-8') as f:
        f.write(DOC.format(w=w, h=h, body='\n  '.join(parts)))


def leg(x, y, lift, color, w=5.4, h=14):
    return (f'<path d="M{x - w / 2:.1f} {y:.1f} h{w:.1f} v{h - lift:.1f} '
            f'l-{w / 2:.1f} 2.2 l-{w / 2:.1f} -2.2z" fill="{color}"/>')


def limb(sx, sy, ex, ey, color, width=4.4):
    return (f'<path d="M{sx:.1f} {sy:.1f} L{ex:.1f} {ey:.1f}" stroke="{color}" '
            f'stroke-width="{width}" stroke-linecap="round" fill="none"/>')


def paw(x, y, r, color):
    return f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r:.1f}" fill="{color}"/>'


# ================================================================ 人形骨架

def humanoid(p, frame, *, w=40, robe_top=18, robe_bottom=42, shoulder=9.5,
             head_y=10.5, head_r=6.4, hip=42, face=True):
    s = 1 if frame == 0 else -1
    cx = w / 2
    parts = [
        leg(cx - 4.6 - 1.6 * s, hip, 6.4 if s > 0 else 0, p['legDark']),
        leg(cx + 4.6 + 1.6 * s, hip, 0 if s > 0 else 6.4, p['leg']),
        f'<path d="M{cx:.1f} {robe_top} c-{shoulder:.1f} 0 -{shoulder + 1:.1f} 5 -{shoulder + 2:.1f} 12'
        f' L{cx - shoulder - 3:.1f} {robe_bottom} h{2 * (shoulder + 3):.1f}'
        f' L{cx + shoulder + 2:.1f} {robe_top + 12} c-1-7 -{shoulder - 1:.1f}-12 -{shoulder:.1f}-12z"'
        f' fill="{p["robe"]}"/>',
        f'<rect x="{cx - shoulder - 2.4:.1f}" y="{robe_bottom - 5}" '
        f'width="{2 * (shoulder + 2.4):.1f}" height="4.4" fill="{p["sash"]}"/>',
        f'<path d="M{cx - 4.4:.1f} {robe_top + 1} L{cx:.1f} {robe_top + 7} '
        f'L{cx + 4.4:.1f} {robe_top + 1} L{cx:.1f} {robe_top - 0.6}z" fill="{p["collar"]}"/>',
        limb(cx - shoulder + 1, robe_top + 5, cx - shoulder - 3.4, robe_top + 16 + 5 * s, p['robeDark']),
        limb(cx + shoulder - 1, robe_top + 5, cx + shoulder + 3.4, robe_top + 16 - 5 * s, p['robe']),
        f'<circle cx="{cx:.1f}" cy="{head_y}" r="{head_r}" fill="{p["skin"]}"/>',
    ]
    if face:
        parts.append(f'<path d="M{cx - head_r:.1f} {head_y - 0.8:.1f} a{head_r:.1f} {head_r:.1f} 0 0 1 '
                     f'{2 * head_r:.1f} 0 z" fill="{p["hair"]}"/>')
        parts.append(f'<circle cx="{cx - 2.4:.1f}" cy="{head_y + 1.6:.1f}" r="0.95" fill="#2b2118"/>')
        parts.append(f'<circle cx="{cx + 2.4:.1f}" cy="{head_y + 1.6:.1f}" r="0.95" fill="#2b2118"/>')
    return parts


# ================================================================ 門派

# 三個階級的配色：越高階越亮、金飾越多。
SECTS = {
    'body': [
        dict(robe='#d97a3e', robeDark='#b05f2c', leg='#7a4a2a', legDark='#5f3a20', sash='#8c3f2a',
             collar='#f6c48a', skin='#f2d3a6', hair='#3a2a1e', accent='#f0d060', trim='#c9932f'),
        dict(robe='#ec9245', robeDark='#c2702c', leg='#8a532c', legDark='#6a4022', sash='#a8482c',
             collar='#ffd9a6', skin='#f2d3a6', hair='#3a2a1e', accent='#ffe07a', trim='#f0c040'),
        dict(robe='#ffab52', robeDark='#d98431', leg='#9b5f2e', legDark='#7a4a24', sash='#c85632',
             collar='#ffe6c0', skin='#f2d3a6', hair='#3a2a1e', accent='#fff0a0', trim='#ffd24a'),
    ],
    'sword': [
        dict(robe='#bfe4ff', robeDark='#8dc4ea', leg='#3f5a70', legDark='#2e4658', sash='#3c6d92',
             collar='#eaf6ff', skin='#f2d3a6', hair='#2b2f38', accent='#e6eef4', trim='#8fb8d8'),
        dict(robe='#d6efff', robeDark='#9fd2f2', leg='#46647c', legDark='#345066', sash='#3f83b4',
             collar='#f4fbff', skin='#f2d3a6', hair='#2b2f38', accent='#f0f8ff', trim='#bcd8ec'),
        dict(robe='#eaf8ff', robeDark='#b6e0fa', leg='#4e7089', legDark='#3a5a72', sash='#4a9ad0',
             collar='#ffffff', skin='#f2d3a6', hair='#2b2f38', accent='#ffffff', trim='#ffd24a'),
    ],
    'talisman': [
        dict(robe='#a487da', robeDark='#7f63b4', leg='#4a3a68', legDark='#3a2c52', sash='#5f4a8c',
             collar='#cbb8ee', skin='#f2d3a6', hair='#241c38', accent='#f0d26a', trim='#8f74c4'),
        dict(robe='#b799ec', robeDark='#8f72c8', leg='#544072', legDark='#42305c', sash='#6f56a4',
             collar='#ddccff', skin='#f2d3a6', hair='#241c38', accent='#ffde86', trim='#c0a4ec'),
        dict(robe='#cbb0ff', robeDark='#a184dc', leg='#5e487e', legDark='#4a3768', sash='#8062bc',
             collar='#efe4ff', skin='#f2d3a6', hair='#241c38', accent='#ffe9a0', trim='#ffd24a'),
    ],
    'alchemy': [
        dict(robe='#8fdc8a', robeDark='#67b566', leg='#3f6a44', legDark='#2f5234', sash='#3f7a4a',
             collar='#d6f4d2', skin='#f2d3a6', hair='#33301f', accent='#d9954a', trim='#6cae64'),
        dict(robe='#a4ea9c', robeDark='#76c674', leg='#477a4c', legDark='#365e3c', sash='#48925a',
             collar='#e4fbe0', skin='#f2d3a6', hair='#33301f', accent='#eaa254', trim='#9ad692'),
        dict(robe='#bcf6b2', robeDark='#87d884', leg='#508a56', legDark='#3e6c44', sash='#54a866',
             collar='#f2fff0', skin='#f2d3a6', hair='#33301f', accent='#ffb763', trim='#ffd24a'),
    ],
}


def tier_extras(p, tier, frame):
    """階級共通的升級件：披肩 → 加上金邊與長披風、頭冠、靈光。"""
    s = 1 if frame == 0 else -1
    e = []
    if tier >= 1:
        # 披肩
        e.append(f'<path d="M20 19c-7 0-11 2-13 5l2 4c3-2.4 6.6-3.4 11-3.4s8 1 11 3.4l2-4c-2-3-6-5-13-5z" fill="{p["trim"]}"/>')
        # 下擺金邊
        e.append(f'<rect x="7.6" y="40" width="24.8" height="2.4" fill="{p["trim"]}"/>')
    if tier >= 2:
        # 披風（在身後，先畫）。下緣止於腰帶上方，否則會蓋住腿、走路動畫就看不見了。
        e.insert(0, f'<path d="M20 19c-10 0-15 6-15 17l-.8 5h31.6l-.8-5c0-11-5-17-15-17z" fill="{p["robeDark"]}" opacity="0.9"/>')
        # 頭冠
        e.append(f'<path d="M13.4 6.2h13.2l-1.6-4.6-2.4 2.2L20 1l-2.6 2.8-2.4-2.2z" fill="{p["trim"]}"/>')
        # 靈光
        e.insert(0, f'<circle cx="20" cy="28" r="19" fill="{p["accent"]}" opacity="0.13"/>')
        e.append(f'<circle cx="{6 + 2 * s:.1f}" cy="{16 - 2 * s:.1f}" r="1.8" fill="{p["accent"]}" opacity="0.8"/>')
        e.append(f'<circle cx="{34 - 2 * s:.1f}" cy="{22 + 2 * s:.1f}" r="1.4" fill="{p["accent"]}" opacity="0.7"/>')
    return e


def sect_extras(sect, p, tier, frame):
    s = 1 if frame == 0 else -1
    e = []
    if sect == 'body':
        e.append(f'<rect x="13.2" y="7" width="13.6" height="3.4" fill="{p["accent"]}"/>')
        e.append(f'<path d="M26.4 8.2l9-2.6-1 4.2-8 1.6z" fill="{p["accent"]}"/>')
        e.append(paw(5.2, 35 + 3 * s, 3.8, p['skin']))
        e.append(paw(34.8, 35 - 3 * s, 3.8, p['skin']))
        if tier >= 1:
            e.append(f'<path d="M4 {33 + 3 * s:.1f}a4.6 4.6 0 0 0 2.4 4.6 4.6 4.6 0 0 0 2.4-4.6z" fill="{p["trim"]}"/>')
    elif sect == 'sword':
        e.append(f'<path d="M20 3.4c2.5 0 3.9 1.7 3.9 3.1 0 1.3-1.7 2.1-3.9 2.1s-3.9-.8-3.9-2.1c0-1.4 1.4-3.1 3.9-3.1z" fill="{p["hair"]}"/>')
        e.append(f'<path d="M15.6 4.6l9.4-2.2-.5 2.1-8.9 1.6z" fill="{p["accent"]}"/>')
        by = 6 + (0 if frame == 0 else 1.5)
        e.append(f'<path d="M33.2 {by}l1.7 4.2v25.6h-3.4V{by + 4.2:.1f}z" fill="#dfe8ef"/>')
        e.append(f'<rect x="29.4" y="{by + 29.8:.1f}" width="8.2" height="2.6" fill="{p["trim"]}"/>')
        e.append(f'<rect x="32.4" y="{by + 32.4:.1f}" width="2.6" height="7" fill="#5a4632"/>')
        if tier >= 2:
            # 御劍：頭頂再浮一柄小劍
            e.append(f'<path d="M6.4 {8 - s:.1f}l1.2 3v14H5.2V{11 - s:.1f}z" fill="#eef6ff"/>')
            e.append(f'<rect x="3.6" y="{25 - s:.1f}" width="5.8" height="2" fill="{p["trim"]}"/>')
    elif sect == 'talisman':
        e.append(f'<path d="M20 2.6c6 0 9.8 4.6 9.8 10.4 0 3-1 5.6-2.8 7.4H13c-1.8-1.8-2.8-4.4-2.8-7.4C10.2 7.2 14 2.6 20 2.6z" fill="{p["robeDark"]}"/>')
        e.append(f'<path d="M20 7.4c3.8 0 6.2 3.2 6.2 7 0 3.6-2.8 6.6-6.2 6.6s-6.2-3-6.2-6.6c0-3.8 2.4-7 6.2-7z" fill="#241c38"/>')
        e.append(f'<path d="M16.9 14c1.9-1 3.5-1 4.6.4-1.5 1.1-3.1 1.3-4.6.8z" fill="#ffe9a8"/>')
        e.append(f'<path d="M23.1 14c-1.9-1-3.5-1-4.6.4 1.5 1.1 3.1 1.3 4.6.8z" fill="#ffe9a8"/>')
        count = 1 if tier == 0 else (2 if tier == 1 else 3)
        for i in range(count):
            ty = 19 + i * 5 + (0 if frame == 0 else 2)
            tx = 28.6 + i * 1.4
            e.append(f'<g transform="rotate({-10 - i * 6} {tx + 4.5} {ty + 6})">'
                     f'<rect x="{tx:.1f}" y="{ty:.1f}" width="8.4" height="12" fill="{p["accent"]}"/>'
                     f'<g fill="#b03a3a"><rect x="{tx + 1.5:.1f}" y="{ty + 2.4:.1f}" width="5.4" height="1.4"/>'
                     f'<rect x="{tx + 1.5:.1f}" y="{ty + 5.4:.1f}" width="5.4" height="1.4"/>'
                     f'<rect x="{tx + 1.5:.1f}" y="{ty + 8.4:.1f}" width="5.4" height="1.4"/></g></g>')
    elif sect == 'alchemy':
        e.append(f'<path d="M20 3c2.1 0 3.4 1.4 3.4 2.7 0 1.3-1.6 2-3.4 2s-3.4-.7-3.4-2C16.6 4.4 17.9 3 20 3z" fill="{p["hair"]}"/>')
        gy = 39 + (0 if frame == 0 else 1.5)
        e.append(f'<ellipse cx="33" cy="{gy}" rx="6" ry="6.6" fill="{p["accent"]}"/>')
        e.append(f'<ellipse cx="33" cy="{gy - 8.2:.1f}" rx="3.5" ry="3.7" fill="{p["accent"]}"/>')
        e.append(f'<rect x="31.6" y="{gy - 13.4:.1f}" width="2.8" height="3.4" fill="#6a4a2a"/>')
        hy = 14 + (0 if frame == 0 else -2)
        e.append(f'<path d="M6.4 {hy + 8}L4.2 {hy - 1} l3-.8 2.6 8.8z" fill="#6fbf62"/>')
        e.append(f'<path d="M4.6 {hy + 1}C1.8 {hy - .2} .4 {hy - 2.4} .2 {hy - 5.8} 3.4 {hy - 5.2} 5.6 {hy - 3.4} 6.6 {hy - .4}z" fill="#6fbf62"/>')
        e.append(f'<path d="M6.4 {hy - 1}C7.6 {hy - 4} 9.8 {hy - 5.8} 13 {hy - 6.4} 12.8 {hy - 3} 11.2 {hy - .8} 8.4 {hy}z" fill="#8fe08a"/>')
        e.append(f'<path d="M11.4 20.4l16.8 9.6-1.9 3.3-16.8-9.6z" fill="#7a5a3a"/>')
        if tier >= 1:
            # 環繞的丹丸
            for i in range(2 + tier):
                a = i * 2.4 + (0.5 if frame else 0)
                e.append(f'<circle cx="{20 + 16 * math.cos(a):.1f}" cy="{26 + 9 * math.sin(a):.1f}" r="2" fill="{p["accent"]}"/>')
    return e


for sect, tiers in SECTS.items():
    for tier, palette in enumerate(tiers):
        for frame in (0, 1):
            parts = tier_extras(palette, tier, frame)
            body = humanoid(palette, frame)
            extras = sect_extras(sect, palette, tier, frame)
            # 靈光與披風要墊在最底層
            under = [x for x in parts if 'opacity="0.13"' in x or 'opacity="0.85"' in x]
            over = [x for x in parts if x not in under]
            write(f'disciple-{sect}-t{tier}-{frame}.svg', 40, 56, under + body + over + extras)

print('disciples ok', len(SECTS) * 3 * 2)


# ================================================================ 人形敵陣

MOBS = {
    'bandit': dict(robe='#7d6850', robeDark='#5e4d3b', leg='#4a3d2e', legDark='#3a2f24',
                   sash='#96603a', collar='#8f7a5e', skin='#d8b48a', hair='#2e241a',
                   accent='#dfe8ef'),
    'undead': dict(robe='#6f6e5a', robeDark='#565543', leg='#41402f', legDark='#333224',
                   sash='#8a8770', collar='#8b8a72', skin='#9db29e', hair='#3c4038',
                   accent='#f0dd92'),
    'demon': dict(robe='#5f3d75', robeDark='#472c58', leg='#38264a', legDark='#2a1c38',
                  sash='#7a4f96', collar='#8a63a6', skin='#c8a8d8', hair='#241432',
                  accent='#ff6f6f'),
    'celestial': dict(robe='#dfe6ee', robeDark='#b9c4d0', leg='#7f8b98', legDark='#5f6b78',
                      sash='#e8c46a', collar='#f4f8fc', skin='#f2d3a6', hair='#3a3f4a',
                      accent='#8fb8ff'),
}


def mob_extras(kind, p, frame):
    s = 1 if frame == 0 else -1
    cx = 23
    e = []
    if kind == 'bandit':
        e.append(f'<rect x="{cx - 6.6:.1f}" y="9.4" width="13.2" height="4.6" fill="#35291f"/>')
        e.append(f'<path d="M{cx - 7:.1f} 6.4h14l-1 -3h-12z" fill="#8f6a44"/>')
        by = 2 + (0 if frame == 0 else 2)
        e.append(f'<path d="M{cx + 13:.1f} {by + 19}c4-8 3.4-14-1.6-19.4 0 6-1 11-4.4 16z" fill="{p["accent"]}"/>')
        e.append(f'<rect x="{cx + 6.4:.1f}" y="{by + 18.6:.1f}" width="8" height="2.6" fill="#5a4632"/>')
        e.append(f'<path d="M{cx - 12:.1f} 52l4-5 4 5 4-5 4 5 4-5 3.4 5z" fill="{p["robeDark"]}"/>')
    elif kind == 'undead':
        # 僵直前伸的雙臂蓋過擺動的手，符紙貼在額頭
        ay = 26 + (0 if frame == 0 else -1.6)
        e.append(f'<rect x="{cx - 22:.1f}" y="{ay:.1f}" width="13" height="5" fill="{p["robeDark"]}"/>')
        e.append(f'<rect x="{cx + 9:.1f}" y="{ay:.1f}" width="13" height="5" fill="{p["robe"]}"/>')
        e.append(f'<rect x="{cx - 24:.1f}" y="{ay - 0.6:.1f}" width="4" height="6.2" fill="{p["skin"]}"/>')
        e.append(f'<rect x="{cx + 20:.1f}" y="{ay - 0.6:.1f}" width="4" height="6.2" fill="{p["skin"]}"/>')
        e.append(f'<rect x="{cx - 3.6:.1f}" y="1.6" width="7.2" height="13" fill="{p["accent"]}"/>')
        e.append(f'<g fill="#b03a3a"><rect x="{cx - 2.2:.1f}" y="4" width="4.4" height="1.3"/>'
                 f'<rect x="{cx - 2.2:.1f}" y="6.8" width="4.4" height="1.3"/>'
                 f'<rect x="{cx - 2.2:.1f}" y="9.6" width="4.4" height="1.3"/></g>')
        e.append(f'<path d="M{cx - 12:.1f} 50l4-6 4 6 4-6 4 6 4-6 3.4 6z" fill="{p["robeDark"]}"/>')
    elif kind == 'demon':
        e.append(f'<path d="M{cx - 6:.1f} 7L{cx - 13:.1f} 0l1.8 10z" fill="{p["hair"]}"/>')
        e.append(f'<path d="M{cx + 6:.1f} 7L{cx + 13:.1f} 0l-1.8 10z" fill="{p["hair"]}"/>')
        e.append(f'<circle cx="{cx:.1f}" cy="10.5" r="6.4" fill="#3a2450"/>')
        e.append(f'<path d="M{cx - 3.4:.1f} 10.4c2-1 3.6-.8 4.6.6-1.6 1-3.2 1.2-4.6.4z" fill="{p["accent"]}"/>')
        e.append(f'<path d="M{cx + 3.4:.1f} 10.4c-2-1-3.6-.8-4.6.6 1.6 1 3.2 1.2 4.6.4z" fill="{p["accent"]}"/>')
        e.append(f'<path d="M{cx - 11:.1f} 22l-8-2 2 6 6 1z" fill="{p["sash"]}"/>')
        e.append(f'<path d="M{cx + 11:.1f} 22l8-2-2 6-6 1z" fill="{p["sash"]}"/>')
        cy2 = 34 + 3 * s
        e.append(f'<path d="M{cx - 15:.1f} {cy2:.1f}l-4 6 2 1.4 3.4-4z" fill="{p["skin"]}"/>')
        e.append(f'<path d="M{cx + 15:.1f} {cy2 - 6 * s:.1f}l4 6-2 1.4-3.4-4z" fill="{p["skin"]}"/>')
        e.append(f'<path d="M{cx - 12:.1f} 50l4-6 3.6 6 3.4-6 3.4 6 3.6-6 4 6z" fill="{p["robeDark"]}"/>')
    elif kind == 'celestial':
        e.append(f'<path d="M{cx - 7:.1f} 8L{cx - 15:.1f} 2l3 9z" fill="{p["sash"]}"/>')
        e.append(f'<path d="M{cx + 7:.1f} 8L{cx + 15:.1f} 2l-3 9z" fill="{p["sash"]}"/>')
        e.append(f'<path d="M{cx - 6.6:.1f} 8.6a6.6 6.6 0 0 1 13.2 0z" fill="{p["sash"]}"/>')
        e.append(f'<path d="M{cx:.1f} 23l7 4-7 12-7-12z" fill="{p["sash"]}"/>')
        py = 10 + (0 if frame == 0 else 1.6)
        e.append(f'<rect x="{cx + 15.6:.1f}" y="{py:.1f}" width="2.8" height="{46 - py:.1f}" fill="#b98a4a"/>')
        e.append(f'<path d="M{cx + 17:.1f} {py - 10:.1f}l4.6 6.4-4.6 5.6-4.6-5.6z" fill="{p["robe"]}"/>')
    return e



for kind, palette in MOBS.items():
    for frame in (0, 1):
        parts = humanoid(palette, frame, w=46, robe_top=19, robe_bottom=43, hip=43, head_y=10.5,
                         face=(kind != 'demon'))
        parts += mob_extras(kind, palette, frame)
        write(f'enemy-{kind}-{frame}.svg', 46, 56, parts)

print('humanoid mobs ok', len(MOBS) * 2)


# ================================================================ 妖獸

def quadruped(p, frame, *, w=46, body_cx=24, body_cy=31, rx=15, ry=9.5,
              head_cx=9, head_cy=24, head_rx=8, head_ry=6.8, snout=True, tail='bushy'):
    """四足獸的共用骨架：四條腿交錯 → 尾 → 身軀 → 頭。"""
    s = 1 if frame == 0 else -1
    parts = []
    for x, lift, col in ((body_cx - 12, 5 if s > 0 else 0, p['dark']),
                         (body_cx - 6, 0 if s > 0 else 5, p['fur']),
                         (body_cx + 6, 0 if s > 0 else 5, p['dark']),
                         (body_cx + 12, 5 if s > 0 else 0, p['fur'])):
        parts.append(f'<path d="M{x - 2.7:.1f} {body_cy + 6:.1f} h5.4 v{15 - lift:.1f} '
                     f'l-2.7 2 l-2.7 -2z" fill="{col}"/>')
    tx = body_cx + rx
    if tail == 'bushy':
        parts.append(f'<ellipse cx="{tx + 5:.1f}" cy="{body_cy - 6 - 2 * s:.1f}" rx="6" ry="4.4" '
                     f'transform="rotate({-30 - 8 * s} {tx + 5:.1f} {body_cy - 6:.1f})" fill="{p["fur"]}"/>')
    elif tail == 'stub':
        parts.append(f'<circle cx="{tx + 1:.1f}" cy="{body_cy - 4:.1f}" r="3.2" fill="{p["dark"]}"/>')
    parts.append(f'<ellipse cx="{body_cx}" cy="{body_cy}" rx="{rx}" ry="{ry}" fill="{p["fur"]}"/>')
    parts.append(f'<ellipse cx="{body_cx}" cy="{body_cy + 4:.1f}" rx="{rx - 4}" ry="{ry - 4:.1f}" fill="{p["belly"]}"/>')
    hy = head_cy + (0 if frame == 0 else -1.4)
    parts.append(f'<ellipse cx="{head_cx}" cy="{hy:.1f}" rx="{head_rx}" ry="{head_ry}" fill="{p["fur"]}"/>')
    if snout:
        parts.append(f'<path d="M{head_cx - head_rx:.1f} {hy:.1f}l-4 4.6 6 2 3-4.6z" fill="{p["belly"]}"/>')
        parts.append(f'<circle cx="{head_cx - head_rx - 3:.1f}" cy="{hy + 3.4:.1f}" r="1.3" fill="#2b2118"/>')
    parts.append(f'<circle cx="{head_cx - 1:.1f}" cy="{hy - 0.6:.1f}" r="1.5" fill="{p["eye"]}"/>')
    return parts


def wolf(p, frame):
    parts = quadruped(p, frame)
    # 尖耳
    parts.append(f'<path d="M5 18l-1.6-9 6 5z" fill="{p["fur"]}"/>')
    parts.append(f'<path d="M12 17l3-8.4 2.6 7z" fill="{p["fur"]}"/>')
    return parts


def bear(p, frame):
    parts = quadruped(p, frame, rx=17, ry=11, head_cx=10, head_cy=23, head_rx=8.6, head_ry=8,
                      tail='stub')
    parts.append(f'<circle cx="4.6" cy="17" r="3.6" fill="{p["fur"]}"/>')
    parts.append(f'<circle cx="15.4" cy="16.4" r="3.6" fill="{p["fur"]}"/>')
    return parts


def yeti(p, frame):
    s = 1 if frame == 0 else -1
    return [
        leg(17 - 1.4 * s, 42, 5 if s > 0 else 0, p['dark'], w=7, h=14),
        leg(29 + 1.4 * s, 42, 0 if s > 0 else 5, p['fur'], w=7, h=14),
        f'<path d="M23 14c-11 0-16 7-16 17v13h32V31c0-10-5-17-16-17z" fill="{p["fur"]}"/>',
        limb(9, 22, 5, 38 + 4 * s, p['dark'], width=7),
        limb(37, 22, 41, 38 - 4 * s, p['fur'], width=7),
        paw(5, 39 + 4 * s, 4, p['dark']),
        paw(41, 39 - 4 * s, 4, p['fur']),
        f'<circle cx="23" cy="13" r="7.6" fill="{p["fur"]}"/>',
        f'<ellipse cx="23" cy="14.6" rx="5" ry="4" fill="{p["face"]}"/>',
        f'<path d="M17 6l-2-6 6 4z" fill="{p["horn"]}"/>',
        f'<path d="M29 6l2-6-6 4z" fill="{p["horn"]}"/>',
        f'<circle cx="20.6" cy="13.6" r="1.4" fill="{p["eye"]}"/>',
        f'<circle cx="25.4" cy="13.6" r="1.4" fill="{p["eye"]}"/>',
        f'<path d="M20 18h6l-1.4 2.6h-3.2z" fill="{p["horn"]}"/>',
    ]


def centipede(p, frame):
    s = 1 if frame == 0 else -1
    parts = []
    # 多節身軀，沿一條起伏的線排列
    for i in range(7):
        x = 50 - i * 7.2
        y = 30 + math.sin(i * 0.9 + (0 if frame == 0 else 1.2)) * 4
        parts.append(f'<path d="M{x - 1:.1f} {y:.1f} l-4 {9 + 3 * ((i + (0 if s > 0 else 1)) % 2):.1f}" '
                     f'stroke="{p["leg"]}" stroke-width="2.2" stroke-linecap="round"/>')
        parts.append(f'<path d="M{x + 1:.1f} {y:.1f} l4 {9 + 3 * ((i + (1 if s > 0 else 0)) % 2):.1f}" '
                     f'stroke="{p["leg"]}" stroke-width="2.2" stroke-linecap="round"/>')
        parts.append(f'<ellipse cx="{x:.1f}" cy="{y:.1f}" rx="4.6" ry="4" fill="{p["fur"] if i % 2 else p["dark"]}"/>')
    hx, hy = 6, 30 + math.sin(-0.9 + (0 if frame == 0 else 1.2)) * 4
    parts.append(f'<path d="M{hx - 2:.1f} {hy - 4:.1f}l-5-6 1.6 7z" fill="{p["dark"]}"/>')
    parts.append(f'<path d="M{hx + 2:.1f} {hy - 4:.1f}l-2-7 3.4 6z" fill="{p["dark"]}"/>')
    parts.append(f'<ellipse cx="{hx:.1f}" cy="{hy:.1f}" rx="6" ry="5.2" fill="{p["fur"]}"/>')
    parts.append(f'<path d="M{hx - 5:.1f} {hy + 2:.1f}l-5 3 5 1.6z" fill="{p["dark"]}"/>')
    parts.append(f'<circle cx="{hx - 1:.1f}" cy="{hy - 0.6:.1f}" r="1.6" fill="{p["eye"]}"/>')
    return parts


def scorpion(p, frame):
    s = 1 if frame == 0 else -1
    parts = []
    for i, x in enumerate((16, 23, 30)):
        lift = 4 if (i + (0 if s > 0 else 1)) % 2 else 0
        parts.append(f'<path d="M{x:.1f} 34 l-8 {8 - lift:.1f}" stroke="{p["dark"]}" stroke-width="2.6" stroke-linecap="round"/>')
        parts.append(f'<path d="M{x + 4:.1f} 34 l8 {8 - (4 - lift):.1f}" stroke="{p["dark"]}" stroke-width="2.6" stroke-linecap="round"/>')
    # 尾：從身後翹起，末端毒針
    ty = 6 + (0 if frame == 0 else 2)
    parts.append(f'<path d="M36 30 C46 28 44 14 34 {ty + 4:.1f}" stroke="{p["fur"]}" stroke-width="6" '
                 f'fill="none" stroke-linecap="round"/>')
    parts.append(f'<path d="M34 {ty + 6:.1f}l-4-6 8 1z" fill="{p["claw"]}"/>')
    parts.append(f'<ellipse cx="24" cy="31" rx="13" ry="7.6" fill="{p["fur"]}"/>')
    parts.append(f'<ellipse cx="24" cy="32.6" rx="9" ry="4" fill="{p["dark"]}"/>')
    parts.append(f'<ellipse cx="10" cy="29" rx="7" ry="5.6" fill="{p["fur"]}"/>')
    for dy in (-6, 6):
        parts.append(f'<path d="M6 {29 + dy * 0.7:.1f} l-8 {dy * 0.5:.1f}" stroke="{p["fur"]}" stroke-width="4" stroke-linecap="round"/>')
        parts.append(f'<path d="M-2 {29 + dy * 1.05:.1f}l6-3 2 5-6 2z" fill="{p["claw"]}"/>')
    parts.append(f'<circle cx="9" cy="27" r="1.5" fill="{p["eye"]}"/>')
    return parts


def serpent(p, frame):
    s = 1 if frame == 0 else -1
    parts = []
    # 蛇身：由下而上的 S 形環節
    for i in range(6):
        t = i / 5
        x = 24 + math.sin(t * 5 + (0 if frame == 0 else 0.8)) * 12
        y = 52 - i * 7
        r = 8 - i * 0.6
        parts.append(f'<ellipse cx="{x:.1f}" cy="{y:.1f}" rx="{r:.1f}" ry="{r * 0.8:.1f}" '
                     f'fill="{p["fur"] if i % 2 else p["dark"]}"/>')
    hx = 24 + math.sin(6 + (0 if frame == 0 else 0.8)) * 12
    hy = 10
    parts.append(f'<ellipse cx="{hx:.1f}" cy="{hy:.1f}" rx="8" ry="6.4" fill="{p["fur"]}"/>')
    parts.append(f'<path d="M{hx - 8:.1f} {hy + 1:.1f}l-6 2.6 6 2z" fill="{p["belly"]}"/>')
    parts.append(f'<path d="M{hx - 13:.1f} {hy + 3.6:.1f}l-6 {-2 - 2 * s:.1f}m6 2l-6 {4 + 2 * s:.1f}" '
                 f'stroke="#e0503c" stroke-width="1.6" fill="none"/>')
    parts.append(f'<path d="M{hx - 3:.1f} {hy - 6:.1f}l-2-6 5 4z" fill="{p["dark"]}"/>')
    parts.append(f'<path d="M{hx + 3:.1f} {hy - 6:.1f}l2-6-5 4z" fill="{p["dark"]}"/>')
    parts.append(f'<circle cx="{hx - 2:.1f}" cy="{hy - 0.6:.1f}" r="1.6" fill="{p["eye"]}"/>')
    return parts


BEASTS = {
    'wolf': (wolf, 46, dict(fur='#8a8f9a', dark='#5e636e', belly='#c2c8d2', eye='#ffd24a')),
    'bear': (bear, 46, dict(fur='#7d5738', belly='#c49a70', dark='#563a20', eye='#ffd24a')),
    'yeti': (yeti, 46, dict(fur='#dceaf5', dark='#a9c4d8', leg='#a9c4d8', legDark='#8fb0c8',
                            face='#38495c', horn='#efe2c4', eye='#7fd8ff')),
    'centipede': (centipede, 58, dict(fur='#74b34e', dark='#4a7d30', leg='#3c6624', eye='#ff6a4a')),
    'scorpion': (scorpion, 50, dict(fur='#c0442e', dark='#8f2e1e', claw='#e0704a', eye='#ffd24a')),
    'serpent': (serpent, 46, dict(fur='#4aa08a', dark='#2f7060', belly='#cfe6d8', eye='#ffd24a')),
}

for kind, (fn, width, palette) in BEASTS.items():
    for frame in (0, 1):
        write(f'enemy-{kind}-{frame}.svg', width, 56, fn(palette, frame))

print('beasts ok', len(BEASTS) * 2)
