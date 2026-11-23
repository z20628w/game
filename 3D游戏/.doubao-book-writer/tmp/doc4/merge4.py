# -*- coding: utf-8 -*-
"""合并 doc4/manuscript/ch01..ch07.md 为交付用 md（UTF-8 无 BOM）。"""
from pathlib import Path

base = Path(r"D:\my_code\我的学习\3D游戏\.doubao-book-writer\tmp\doc4\manuscript")
out = Path(r"D:\my_code\我的学习\3D游戏\deliverables\3D游戏开发资源需求与技术规划书.md")

parts = []
for i in range(1, 8):
    f = base / f"ch{i:02d}.md"
    text = f.read_text(encoding="utf-8-sig").replace("\ufeff", "")
    parts.append(text.strip() + "\n\n\n")

merged = "".join(parts).rstrip() + "\n"
out.write_text(merged, encoding="utf-8")

chars = sum(1 for c in merged if not c.isspace())
print("saved:", out)
print("non_whitespace_chars:", chars)
print("lines:", merged.count("\n") + 1)
