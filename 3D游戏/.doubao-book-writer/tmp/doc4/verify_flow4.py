# -*- coding: utf-8 -*-
"""渲染 PDF 流程图页面为 PNG 并抽取文本层供核验。"""
import fitz

PDF = r"D:\my_code\我的学习\3D游戏\deliverables\3D游戏开发流程与版本分割流程图.pdf"
OUTDIR = r"D:\my_code\我的学习\3D游戏\.doubao-book-writer\tmp\doc4\flow_render"

import os
os.makedirs(OUTDIR, exist_ok=True)

doc = fitz.open(PDF)
print("pages:", doc.page_count)
for i, page in enumerate(doc):
    pix = page.get_pixmap(dpi=170)
    p = os.path.join(OUTDIR, f"flow4-page-{i + 1}.png")
    pix.save(p)
    print("saved:", p)
    txt = page.get_text("text")
    print(f"--- page {i + 1} text ({len(txt)} chars) ---")
    print(txt[:1200])
doc.close()
