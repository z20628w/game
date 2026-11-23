# -*- coding: utf-8 -*-
import re
from pathlib import Path

from fontTools.ttLib import TTFont

font = TTFont(r"D:\my_code\我的学习\3D游戏\.doubao-book-writer\tmp\doc4\flow_subset4.ttf")
cmap = font.getBestCmap()

src = Path(r"D:\my_code\我的学习\3D游戏\.doubao-book-writer\tmp\doc4\draw_flow_pdf4.py").read_text(encoding="utf-8")
strs = re.findall(r'"([^"]*)"', src)
used = set()
for s in strs:
    for ch in s:
        if ch != " ":
            used.add(ch)
missing = sorted(ch for ch in used if ord(ch) not in cmap)
print("used unique:", len(used))
print("MISSING:", missing)
print("missing repr:", [repr(c) for c in missing])
