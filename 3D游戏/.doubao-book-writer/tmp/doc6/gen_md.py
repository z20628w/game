# -*- coding: utf-8 -*-
"""从托管 rev24 全文 XML 重新生成 manuscript/ch01..ch07.md 与合并 md。"""
import re
import xml.etree.ElementTree as ET
from pathlib import Path

SRC = Path(r"D:\my_code\我的学习\3D游戏\.doubao-book-writer\tmp\doc6\final2.xml")
MS = Path(r"D:\my_code\我的学习\3D游戏\.doubao-book-writer\tmp\doc4\manuscript")
MERGED = Path(r"D:\my_code\我的学习\3D游戏\deliverables\3D游戏开发资源需求与技术规划书.md")
TITLE = "<!-- title: 3D游戏开发资源需求与技术规划书（手机与PC浏览器） -->"

xml = SRC.read_text(encoding="utf-8")
root = ET.fromstring("<root>" + xml + "</root>")


def inline(node):
    """递归取行内文本：<del> 包 ~~，<b> 包 **，其余取文本。"""
    parts = []
    tag = node.tag
    if tag == "del":
        inner = "".join(inline(c) for c in node)
        if node.text:
            inner = node.text + inner
        parts.append("~~" + inner + "~~")
        if node.tail:
            parts.append(node.tail)
        return "".join(parts)
    if tag == "b":
        inner = (node.text or "") + "".join(inline(c) for c in node)
        parts.append("**" + inner + "**")
        if node.tail:
            parts.append(node.tail)
        return "".join(parts)
    if node.text:
        parts.append(node.text)
    for c in node:
        parts.append(inline(c))
    if node.tail:
        parts.append(node.tail)
    return "".join(parts)


def para_text(p):
    return "".join(inline(c) for c in p) if list(p) else (p.text or "")


def table_md(t):
    lines = []
    rows = []
    for tr in t.find("tbody"):
        cells = []
        for td in tr:
            txt = " ".join(para_text(p) for p in td if p.tag == "p")
            cells.append(txt.strip().replace("\n", " "))
        rows.append(cells)
    if not rows:
        return []
    ncol = max(len(r) for r in rows)
    header = rows[0] + [""] * (ncol - len(rows[0]))
    lines.append("| " + " | ".join(header) + " |")
    lines.append("| " + " | ".join(["---"] * ncol) + " |")
    for r in rows[1:]:
        r = r + [""] * (ncol - len(r))
        lines.append("| " + " | ".join(r) + " |")
    return lines


chapters = []
cur = None
for el in root:
    if el.tag == "h1":
        cur = {"title": para_text(el), "lines": []}
        chapters.append(cur)
        cur["lines"].append("# " + para_text(el))
        continue
    if cur is None:
        # 章前元素（文档标题段）由 title 注释承载，跳过
        continue
    if el.tag == "h2":
        cur["lines"].append("")
        cur["lines"].append("## " + para_text(el))
    elif el.tag == "p":
        cur["lines"].append("")
        cur["lines"].append(para_text(el))
    elif el.tag == "table":
        cur["lines"].append("")
        cur["lines"].extend(table_md(el))

assert len(chapters) == 7, len(chapters)

parts = []
for i, ch in enumerate(chapters, 1):
    body = "\n".join(ch["lines"]).strip() + "\n"
    if i == 1:
        body = TITLE + "\n\n" + body
    fp = MS / f"ch{i:02d}.md"
    fp.write_text(body, encoding="utf-8")
    parts.append(body.strip() + "\n\n\n")

merged = "".join(parts).rstrip() + "\n"
MERGED.write_text(merged, encoding="utf-8")
print("chapters:", [c["title"] for c in chapters])
print("merged chars:", len(merged))
