# -*- coding: utf-8 -*-
"""测试 PyMuPDF 绘制中文流程图的能力：找可嵌入的中文字体，画最小样例。"""
import os
from pathlib import Path
import fitz  # PyMuPDF

candidates = [
    r"C:\Windows\Fonts\simhei.ttf",
    r"C:\Windows\Fonts\msyh.ttc",
    r"C:\Windows\Fonts\simsun.ttc",
    r"C:\Windows\Fonts\simfang.ttf",
    r"C:\Windows\Fonts\Deng.ttf",
]

found = []
for c in candidates:
    if os.path.exists(c):
        try:
            font = fitz.Font(fontfile=c)
            found.append((c, font.name, font.is_writable, font.glyph_count))
        except Exception as e:
            found.append((c, "ERR", str(e), 0))

print("found:")
for f in found:
    print(" ", f)

# 用第一个可加载字体画一页测试
if found and found[0][2]:
    doc = fitz.open()
    page = doc.new_page(width=595, height=420)
    ff = found[0][0]
    rc = page.insert_text((72, 72), "三端3D游戏开发全流程测试：立项、资产、前端、后端、上线",
                          fontsize=14, fontname="hei", fontfile=ff)
    print("insert_text rc:", rc)
    out = Path(r"D:\my_code\我的学习\3D游戏\.doubao-book-writer\tmp\doc2\font_test.pdf")
    doc.save(str(out))
    doc.close()
    # 回读验证
    d2 = fitz.open(str(out))
    txt = d2[0].get_text()
    print("readback contains 立项:", "立项" in txt, "| chars:", len(txt.strip()))
    d2.close()
    print("saved:", out)
