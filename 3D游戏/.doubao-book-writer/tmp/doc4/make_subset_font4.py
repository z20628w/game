# -*- coding: utf-8 -*-
"""提取 doc4 流程图脚本用到的全部字符，用 fontTools 子集化 SimHei，
生成精简字体供 PDF 嵌入。"""
import re
from pathlib import Path

from fontTools import subset

SRC = Path(r"D:\my_code\我的学习\3D游戏\.doubao-book-writer\tmp\doc4\draw_flow_pdf4.py")
FONT_SRC = r"C:\Windows\Fonts\simhei.ttf"
FONT_OUT = r"D:\my_code\我的学习\3D游戏\.doubao-book-writer\tmp\doc4\flow_subset4.ttf"

text = SRC.read_text(encoding="utf-8")
chars = set()
for m in re.finditer(r"[\u4e00-\u9fff\u3000-\u303f\uff00-\uffefA-Za-z0-9·→≤≥/\.\-_（）]", text):
    chars.add(m.group(0))

for c in "①②③④⑤⑥⑦⑧⑨⑩⑪⑫→←↑↓≤≥±×÷—…“”‘’·+–—":
    chars.add(c)

text_str = "".join(sorted(chars))
print("unique chars:", len(text_str))

opts = subset.Options()
opts.flavor = None
opts.layout_features = ["*"]
opts.name_IDs = ["*"]
opts.name_legacy = True
opts.name_languages = ["*"]
opts.notdef_outline = True
opts.recalc_bounds = True
opts.recalc_timestamp = True
opts.canonical_order = True
opts.hinting = False
opts.drop_tables = []
opts.ignore_font_features = True

font = subset.load_font(FONT_SRC, opts)
subsetter = subset.Subsetter(options=opts)
subsetter.populate(text=text_str)
subsetter.subset(font)
subset.save_font(font, str(FONT_OUT), opts)
print("subset saved:", FONT_OUT)
print("size:", round(Path(FONT_OUT).stat().st_size / 1024), "KB")
