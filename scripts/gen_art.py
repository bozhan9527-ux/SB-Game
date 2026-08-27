"""產生人物 SVG：每個角色兩幀（走路循環），全彩上色。

以程式產生而非逐檔手寫，是為了讓兩幀之間只有四肢差異、其餘完全一致，
手寫很難維持這種一致性，改配色也只要動一個表。
"""
import os

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'public', 'art')
HEAD_OUT = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">\n{body}\n</svg>\n'


def leg(x, y, lift, color, w=5.4, h=14):
    """一條腿。lift 為抬起高度、shift 為前後位移，兩幀交錯就成了步伐。"""
    return (f'<path d="M{x - w / 2:.1f} {y} h{w:.1f} v{h - lift:.1f} '
            f'l-{w / 2:.1f} 2.2 l-{w / 2:.1f} -2.2z" fill="{color}"/>')


def arm(sx, sy, ex, ey, color, width=4.4):
    return (f'<path d="M{sx:.1f} {sy:.1f} L{ex:.1f} {ey:.1f}" stroke="{color}" '
            f'stroke-width="{width}" stroke-linecap="round" fill="none"/>')


def humanoid(p, frame, *, w=40, h=56, robe_top=18, robe_bottom=42,
             shoulder=9.5, head_y=10.5, head_r=6.4, hip=42):
    """共用的人形：腿 → 袍身 → 手臂 → 頭。兩幀的差別在腿與手臂。"""
    s = 1 if frame == 0 else -1
    cx = w / 2
    parts = []

    # 腿（後畫的在上，先畫後腿）。抬腿幅度要夠大，62px 下才看得出在走。
    parts.append(leg(cx - 4.6 - 1.6 * s, hip, 6.4 if s > 0 else 0, p['legDark']))
    parts.append(leg(cx + 4.6 + 1.6 * s, hip, 0 if s > 0 else 6.4, p['leg']))

    # 袍身
    parts.append(
        f'<path d="M{cx:.1f} {robe_top} c-{shoulder:.1f} 0 -{shoulder + 1:.1f} 5 -{shoulder + 2:.1f} 12'
        f' L{cx - shoulder - 3:.1f} {robe_bottom} h{2 * (shoulder + 3):.1f}'
        f' L{cx + shoulder + 2:.1f} {robe_top + 12} c-1-7 -{shoulder - 1:.1f}-12 -{shoulder:.1f}-12z"'
        f' fill="{p["robe"]}"/>')
    # 腰帶
    parts.append(f'<rect x="{cx - shoulder - 2.4:.1f}" y="{robe_bottom - 5}" '
                 f'width="{2 * (shoulder + 2.4):.1f}" height="4.4" fill="{p["sash"]}"/>')
    # 衣領
    parts.append(f'<path d="M{cx - 4.4:.1f} {robe_top + 1} L{cx:.1f} {robe_top + 7} '
                 f'L{cx + 4.4:.1f} {robe_top + 1} L{cx:.1f} {robe_top - 0.6}z" fill="{p["collar"]}"/>')

    # 手臂：前後擺動，末端露在袍外才看得見
    parts.append(arm(cx - shoulder + 1, robe_top + 5, cx - shoulder - 3.4, robe_top + 16 + 5 * s, p['robeDark']))
    parts.append(arm(cx + shoulder - 1, robe_top + 5, cx + shoulder + 3.4, robe_top + 16 - 5 * s, p['robe']))

    # 頭：膚色圓臉 + 髮蓋 + 兩點眼睛
    parts.append(f'<circle cx="{cx:.1f}" cy="{head_y}" r="{head_r}" fill="{p["skin"]}"/>')
    parts.append(f'<path d="M{cx - head_r:.1f} {head_y - 0.8:.1f} a{head_r:.1f} {head_r:.1f} 0 0 1 '
                 f'{2 * head_r:.1f} 0 z" fill="{p["hair"]}"/>')
    parts.append(f'<circle cx="{cx - 2.4:.1f}" cy="{head_y + 1.6:.1f}" r="0.95" fill="#2b2118"/>')
    parts.append(f'<circle cx="{cx + 2.4:.1f}" cy="{head_y + 1.6:.1f}" r="0.95" fill="#2b2118"/>')
    return parts


def write(name, w, h, parts):
    with open(os.path.join(OUT, name), 'w', encoding='utf-8') as f:
        f.write(HEAD_OUT.format(w=w, h=h, body='\n  '.join(parts)))


# ---------------------------------------------------------------- 門派

SECTS = {
    'body': dict(robe='#e08a4a', robeDark='#b96a34', leg='#7a4a2a', legDark='#5f3a20',
                 sash='#8c3f2a', collar='#f6c48a', skin='#f2d3a6', hair='#3a2a1e',
                 accent='#f0d060'),
    'sword': dict(robe='#bfe4ff', robeDark='#8dc4ea', leg='#3f5a70', legDark='#2e4658',
                  sash='#3c6d92', collar='#eaf6ff', skin='#f2d3a6', hair='#2b2f38',
                  accent='#e6eef4'),
    'talisman': dict(robe='#a487da', robeDark='#7f63b4', leg='#4a3a68', legDark='#3a2c52',
                     sash='#5f4a8c', collar='#cbb8ee', skin='#f2d3a6', hair='#241c38',
                     accent='#f0d26a'),
    'alchemy': dict(robe='#8fdc8a', robeDark='#67b566', leg='#3f6a44', legDark='#2f5234',
                    sash='#3f7a4a', collar='#d6f4d2', skin='#f2d3a6', hair='#33301f',
                    accent='#d9954a'),
}


def sect_extras(sect, p, frame):
    """各門派的頭飾與持物。"""
    e = []
    if sect == 'body':
        e.append(f'<rect x="13.2" y="7" width="13.6" height="3.4" fill="{p["accent"]}"/>')
        e.append(f'<path d="M26.4 8.2l9-2.6-1 4.2-8 1.6z" fill="{p["accent"]}"/>')
        e.append(f'<circle cx="5.2" cy="{35 + (3 if frame == 0 else -3)}" r="3.8" fill="{p["skin"]}"/>')
        e.append(f'<circle cx="34.8" cy="{35 - (3 if frame == 0 else -3)}" r="3.8" fill="{p["skin"]}"/>')
    elif sect == 'sword':
        e.append(f'<path d="M20 3.4c2.5 0 3.9 1.7 3.9 3.1 0 1.3-1.7 2.1-3.9 2.1s-3.9-.8-3.9-2.1c0-1.4 1.4-3.1 3.9-3.1z" fill="{p["hair"]}"/>')
        e.append(f'<path d="M15.6 4.6l9.4-2.2-.5 2.1-8.9 1.6z" fill="{p["accent"]}"/>')
        blade_y = 6 + (0 if frame == 0 else 1.5)
        e.append(f'<path d="M33.2 {blade_y}l1.7 4.2v25.6h-3.4V{blade_y + 4.2:.1f}z" fill="#dfe8ef"/>')
        e.append(f'<rect x="29.4" y="{blade_y + 29.8:.1f}" width="8.2" height="2.6" fill="{p["accent"]}"/>')
        e.append(f'<rect x="32.4" y="{blade_y + 32.4:.1f}" width="2.6" height="7" fill="#5a4632"/>')
    elif sect == 'talisman':
        e.append(f'<path d="M20 2.6c6 0 9.8 4.6 9.8 10.4 0 3-1 5.6-2.8 7.4H13c-1.8-1.8-2.8-4.4-2.8-7.4C10.2 7.2 14 2.6 20 2.6z" fill="{p["robeDark"]}"/>')
        e.append(f'<path d="M20 7.4c3.8 0 6.2 3.2 6.2 7 0 3.6-2.8 6.6-6.2 6.6s-6.2-3-6.2-6.6c0-3.8 2.4-7 6.2-7z" fill="#241c38"/>')
        e.append(f'<path d="M16.9 14c1.9-1 3.5-1 4.6.4-1.5 1.1-3.1 1.3-4.6.8z" fill="#ffe9a8"/>')
        e.append(f'<path d="M23.1 14c-1.9-1-3.5-1-4.6.4 1.5 1.1 3.1 1.3 4.6.8z" fill="#ffe9a8"/>')
        ty = 20 + (0 if frame == 0 else 2)
        e.append(f'<g transform="rotate(-10 33 {ty + 6})"><rect x="28.6" y="{ty}" width="9" height="13" fill="{p["accent"]}"/>'
                 f'<g fill="#b03a3a"><rect x="30.2" y="{ty + 2.6:.1f}" width="5.8" height="1.5"/>'
                 f'<rect x="30.2" y="{ty + 5.8:.1f}" width="5.8" height="1.5"/>'
                 f'<rect x="30.2" y="{ty + 9:.1f}" width="5.8" height="1.5"/></g></g>')
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
    return e


for sect, palette in SECTS.items():
    for frame in (0, 1):
        parts = humanoid(palette, frame)
        parts += sect_extras(sect, palette, frame)
        write(f'disciple-{sect}-{frame}.svg', 40, 56, parts)

print('disciples ok')


# ---------------------------------------------------------------- 敵陣

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


def beast(p, frame):
    s = 1 if frame == 0 else -1
    parts = []
    # 四足：前後腳交錯
    for x, lift, col in ((10, 5 if s > 0 else 0, p['legDark']), (17, 0 if s > 0 else 5, p['leg']),
                         (28, 0 if s > 0 else 5, p['legDark']), (35, 5 if s > 0 else 0, p['leg'])):
        parts.append(f'<path d="M{x - 2.6:.1f} 38 h5.2 v{15 - lift:.1f} l-2.6 2 l-2.6 -2z" fill="{col}"/>')
    # 身軀與尾
    parts.append(f'<path d="M40 32c4 3 6 7 6.5 12-4-1-7-3.4-9-6.6z" fill="{p["robeDark"]}"/>')
    parts.append(f'<ellipse cx="24" cy="31" rx="17" ry="10" fill="{p["robe"]}"/>')
    parts.append(f'<ellipse cx="24" cy="35" rx="13" ry="5.6" fill="{p["collar"]}"/>')
    # 頭
    hy = 22 + (0 if frame == 0 else -1.4)
    parts.append(f'<ellipse cx="10" cy="{hy + 2:.1f}" rx="9" ry="7.6" fill="{p["robe"]}"/>')
    parts.append(f'<path d="M1 {hy + 2:.1f}l-1 5 6 1.6 2-4z" fill="{p["collar"]}"/>')
    parts.append(f'<path d="M9 {hy - 5:.1f}L3 {hy - 15:.1f}c-.6 6 .6 9 3.6 12z" fill="{p["accent"]}"/>')
    parts.append(f'<path d="M15 {hy - 5:.1f}l3-10c-4 2-6.4 5.6-7 10.4z" fill="{p["accent"]}"/>')
    parts.append(f'<circle cx="7" cy="{hy + 1:.1f}" r="1.5" fill="{p["eye"]}"/>')
    parts.append(f'<path d="M2 {hy + 6:.1f}l3.4 1.4-3.4 1.4z" fill="#ffffff"/>')
    return parts


BEAST = dict(robe='#a0503c', robeDark='#7d3b2c', leg='#7a3a2a', legDark='#5f2d20',
             collar='#c8785c', accent='#efe2c4', eye='#ffd24a')

for kind, palette in MOBS.items():
    for frame in (0, 1):
        parts = humanoid(palette, frame, w=46, robe_top=19, robe_bottom=43, hip=43, head_y=10.5)
        parts += mob_extras(kind, palette, frame)
        write(f'enemy-{kind}-{frame}.svg', 46, 56, parts)

for frame in (0, 1):
    write(f'enemy-beast-{frame}.svg', 46, 56, beast(BEAST, frame))

print('mobs ok')
