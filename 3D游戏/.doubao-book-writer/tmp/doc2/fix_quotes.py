# -*- coding: utf-8 -*-
"""把 md 中文语境中的 ASCII 双引号成对替换为中文引号（“ ”）。逐行处理，行内成对。"""
from pathlib import Path

path = Path(r"D:\my_code\我的学习\3D游戏\deliverables\三端3D游戏技术开发全流程与公司资产交付指南.md")
text = path.read_text(encoding="utf-8-sig")

lines = text.split("\n")
fixed_lines = []
total_pairs = 0
warn = []

for idx, line in enumerate(lines, 1):
    # 跳过代码块：本文件无 ``` 代码块，保险起见仍处理
    n = line.count('"')
    if n == 0:
        fixed_lines.append(line)
        continue
    if n % 2 != 0:
        warn.append((idx, n, line[:60]))
        fixed_lines.append(line)
        continue
    out = []
    open_q = True
    for ch in line:
        if ch == '"':
            out.append("“" if open_q else "”")
            open_q = not open_q
        else:
            out.append(ch)
    total_pairs += n // 2
    fixed_lines.append("".join(out))

new_text = "\n".join(fixed_lines)
path.write_text(new_text, encoding="utf-8")
print("pairs_fixed:", total_pairs)
print("warnings:", warn)
