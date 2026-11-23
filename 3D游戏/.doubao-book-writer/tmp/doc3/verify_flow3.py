# -*- coding: utf-8 -*-
"""渲染 PDF 两页为 PNG，并回读文本层验证。"""
import fitz

pdf = r"D:\my_code\我的学习\3D游戏\deliverables\手机与PC浏览器3D游戏技术开发全流程流程图.pdf"
doc = fitz.open(pdf)
print("pages:", doc.page_count)
for i, page in enumerate(doc):
    pix = page.get_pixmap(dpi=150)
    out = rf"D:\my_code\我的学习\3D游戏\.doubao-book-writer\tmp\doc3\flow_p{i + 1}.png"
    pix.save(out)
    print("rendered:", out)
    txt = page.get_text()
    print(f"--- page {i + 1} text ---")
    print(txt[:1500])
    print("...")
