# -*- coding: utf-8 -*-
"""提取流程图脚本用到的全部字符，用 fontTools 子集化 SimHei，
生成精简字体供 PDF 嵌入，避免 9MB 整字体。"""
import re
from pathlib import Path

from fontTools import subset

SRC = Path(r"D:\my_code\我的学习\3D游戏\.doubao-book-writer\tmp\doc2\draw_flow_pdf.py")
FONT_SRC = r"C:\Windows\Fonts\simhei.ttf"
FONT_OUT = r"D:\my_code\我的学习\3D游戏\.doubao-book-writer\tmp\doc2\flow_subset.ttf"

text = SRC.read_text(encoding="utf-8")
# 收集脚本字符串字面量中的 CJK 字符（引号内内容）
chars = set()
for m in re.finditer(r"[\u4e00-\u9fff\u3000-\u303f\uff00-\uffefA-Za-z0-9·→≤≥/\.\-_（）]", text):
    chars.add(m.group(0))
# 额外保证含必要的数字与标点（正则已含）
extra = "①②③④⑤⑥⑦⑧⑨⑩"
for c in extra:
    chars.add(c)

# 也把可能用的符号补上
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
opts.hinting = False  # 去掉 hinting 进一步缩小
opts.drop_tables = []
# 保留常用表，去掉无关表
opts.ignore_font_features = True

font = subset.load_font(FONT_SRC, opts)
subsetter = subset.Subsetter(options=opts)
subsetter.populate(text=text_str)
subsetter.subset(font)
subset.save_font(font, str(FONT_OUT), opts)
print("subset saved:", FONT_OUT)

from pathlib import Path as P
print("size:", round(P(FONT_OUT).stat().st_size / 1024), "KB")
