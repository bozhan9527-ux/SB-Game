"""把霞鶩文楷 TC 切成遊戲用的子集（public/fonts/LXGWWenKaiTC-game.woff2）。

用法：python3 scripts/sketch-art/subset-font.py <LXGWWenKaiTC-Medium.ttf 的路徑>
完整字型（約 15MB）不放進版本庫，請到 https://github.com/lxgw/LxgwWenkaiTC 下載。

收字範圍：src/、data/、index.html 裡出現的所有字，加上 ASCII、常用標點與大寫數字。
字表同時寫進 public/fonts/game-chars.txt，tests/font.test.ts 會檢查新加的字有沒有收進來。
玩家自己輸入的道號若用到字表外的字，瀏覽器會用系統字型補上那幾個字。
"""
import os
import subprocess
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
EXTRA = "·•…—–“”‘’「」『』（）【】《》〈〉、，。：；！？～＋－×÷％　①②③④⑤⑥⑦⑧⑨⑩←→↑↓★☆♥♡◆◇○●□■△▲▼零一二三四五六七八九十百千萬億兆京壹貳參肆伍陸柒捌玖拾"


def collect():
    chars = set(chr(c) for c in range(32, 127)) | set(EXTRA)
    for top in ("src", "data"):
        for dp, _, files in os.walk(os.path.join(ROOT, top)):
            for f in files:
                if f.endswith((".ts", ".json")):
                    text = open(os.path.join(dp, f), encoding="utf-8").read()
                    chars |= {c for c in text if ord(c) >= 0x2000}
    text = open(os.path.join(ROOT, "index.html"), encoding="utf-8").read()
    chars |= {c for c in text if ord(c) >= 0x2000}
    return "".join(sorted(chars))


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    chars = collect()
    out_dir = os.path.join(ROOT, "public", "fonts")
    list_file = os.path.join(out_dir, "game-chars.txt")
    with open(list_file, "w", encoding="utf-8") as f:
        f.write(chars)
    subprocess.run(["pyftsubset", sys.argv[1], f"--text-file={list_file}", "--flavor=woff2", "--layout-features=*",
                    f"--output-file={os.path.join(out_dir, 'LXGWWenKaiTC-game.woff2')}"], check=True)
    print(len(chars), "字")


if __name__ == "__main__":
    main()
