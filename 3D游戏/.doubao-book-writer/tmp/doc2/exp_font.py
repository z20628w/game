# -*- coding: utf-8 -*-
import fitz

OUT1 = r"D:\my_code\我的学习\3D游戏\.doubao-book-writer\tmp\doc2\exp_full.pdf"
OUT2 = r"D:\my_code\我的学习\3D游戏\.doubao-book-writer\tmp\doc2\exp_subset.pdf"

text = "三端 3D 游戏 PC NestJS + Redis ≤4MB"

for out, fontfile in ((OUT1, r"C:\Windows\Fonts\simhei.ttf"),
                      (OUT2, r"D:\my_code\我的学习\3D游戏\.doubao-book-writer\tmp\doc2\flow_subset.ttf")):
    doc = fitz.open()
    page = doc.new_page(width=400, height=200)
    page.insert_font(fontname="hei", fontfile=fontfile)
    page.insert_text(fitz.Point(30, 60), text, fontsize=14, fontname="hei")
    page.insert_text(fitz.Point(30, 120), "纯中文：三端游戏技术开发全流程", fontsize=14, fontname="hei")
    doc.save(out)
    doc.close()
    print("saved", out)

for out in (OUT1, OUT2):
    d = fitz.open(out)
    p = d[0].get_pixmap(matrix=fitz.Matrix(3, 3))
    p.save(out.replace(".pdf", ".png"))
    print(out, "text:", repr(d[0].get_text()))
    d.close()
