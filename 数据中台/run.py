#!/usr/bin/env python
"""项目入口。

为什么要有这个文件？因为 src/ 是源码根，直接 `python -m hotel_dw` 需要先装包
或者设 PYTHONPATH。这个脚本替你把 sys.path 补好，所以：

    python run.py pipeline --regenerate

就能跑，不需要 pip install。生产环境仍然建议 `pip install -e .` 后用
`hotel-dw` 命令（见 pyproject.toml）。
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from hotel_dw.__main__ import main  # noqa: E402  （必须在补 sys.path 之后导入）

if __name__ == "__main__":
    raise SystemExit(main())
