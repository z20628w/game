"""配置加载。

把 config/ 目录下的 4 份 YAML 读进内存，并提供两样东西：
  * cfg.path(key)   —— 把配置里的相对路径拼成绝对路径，顺带建目录
  * cfg.ref(spec)   —— 解析 "config/settings.yaml#run.deviation_pct" 这种跨文件引用

为什么要做 ref？因为同一条阈值（比如金额容差 0.01）只应该写一遍。
让校验规则去引用 settings.yaml 里的唯一来源，改一处就全局生效。
"""

from __future__ import annotations

import os
import re
from pathlib import Path
from typing import Any

import yaml

ENV_ROOT = "HOTEL_DW_ROOT"


def find_project_root(start: Path | None = None) -> Path:
    """从起始目录向上找，直到看见 config/settings.yaml。"""
    if os.environ.get(ENV_ROOT):
        return Path(os.environ[ENV_ROOT]).resolve()
    here = (start or Path.cwd()).resolve()
    for candidate in [here, *here.parents]:
        if (candidate / "config" / "settings.yaml").is_file():
            return candidate
    # 兜底：按本文件位置推算（src/hotel_dw/config.py → 上两级就是项目根）
    return Path(__file__).resolve().parents[2]


def _read_yaml(path: Path) -> dict:
    if not path.is_file():
        raise FileNotFoundError(f"缺少配置文件：{path}")
    with path.open("r", encoding="utf-8") as fh:
        return yaml.safe_load(fh) or {}


_TOKEN = re.compile(r"\.?([A-Za-z_][A-Za-z0-9_]*)|\[([^\]]+)\]")


def _index(spec: str, node: Any, idx: str) -> Any:
    """解析 [...]. 下标。

    - 节点是 list：优先按条目里的 key 字段匹配（sources[ota]），
      匹配不到再退回数字下标（sources[0]）。
    - 节点是 dict：直接当作字典键（无 key 字段时可用 d[foo] 取键 foo）。
    """
    if isinstance(node, list):
        for item in node:
            if isinstance(item, dict) and item.get("key") == idx:
                return item
        if idx.isdigit() and int(idx) < len(node):
            return node[int(idx)]
        raise KeyError(f"引用 {spec} 时找不到 key={idx} 的条目")
    if isinstance(node, dict):
        if idx in node:
            return node[idx]
        # 兜底：字典里某个值是列表，去那个列表里按 key 找
        for value in node.values():
            if isinstance(value, list):
                for item in value:
                    if isinstance(item, dict) and item.get("key") == idx:
                        return item
        raise KeyError(f"引用 {spec} 时找不到 key={idx} 的条目")
    raise KeyError(f"引用 {spec} 时无法按 [{idx}] 取值")


class Config:
    def __init__(self, root: Path | None = None):
        self.root = find_project_root(root)
        self.config_dir = self.root / "config"

        self.settings = _read_yaml(self.config_dir / "settings.yaml")
        self.sources = _read_yaml(self.config_dir / "data_sources.yaml")
        self.rules = _read_yaml(self.config_dir / "report_rules.yaml")
        self.delivery = _read_yaml(self.config_dir / "delivery.yaml")

        # 本地覆盖：真实 webhook 之类的敏感值放这里，不进版本库
        local = self.config_dir / "delivery.local.yaml"
        if local.is_file():
            _deep_merge(self.delivery, _read_yaml(local))

        if os.environ.get("WECOM_WEBHOOK"):
            self.delivery.setdefault("wecom", {})["webhook_url"] = os.environ["WECOM_WEBHOOK"]

    # ---------- 路径 ----------
    def path(self, key: str, make: bool = True) -> Path:
        """按 settings.yaml → paths.<key> 取路径；默认顺带创建目录。"""
        rel = self.settings.get("paths", {}).get(key)
        if rel is None:
            raise KeyError(f"settings.yaml 里没有 paths.{key}")
        p = (self.root / rel).resolve()
        if make:
            p.mkdir(parents=True, exist_ok=True)
        return p

    def file(self, key: str) -> Path:
        """同上，但用于文件（不建目录，建父目录）。"""
        rel = self.settings.get("paths", {}).get(key)
        if rel is None:
            raise KeyError(f"settings.yaml 里没有 paths.{key}")
        p = (self.root / rel).resolve()
        p.parent.mkdir(parents=True, exist_ok=True)
        return p

    # ---------- 跨文件引用 ----------
    def ref(self, spec: str) -> Any:
        """解析 'config/settings.yaml#run.deviation_pct' 或
        'config/data_sources.yaml#sources[ota].expected_accounts'。

        支持 sources[ota] 这种「按 key 取值」的写法，比记数组下标安全。
        """
        if "#" not in spec:
            raise ValueError(f"引用格式应为 文件#路径，收到：{spec}")
        file_part, expr = spec.split("#", 1)
        data = _read_yaml((self.root / file_part).resolve())

        node: Any = data
        pos = 0
        while pos < len(expr):
            m = _TOKEN.match(expr, pos)
            if not m:
                raise ValueError(f"无法解析引用表达式：{expr}（位置 {pos}）")
            pos = m.end()
            if m.group(1):
                key = m.group(1)
                if not isinstance(node, dict) or key not in node:
                    raise KeyError(f"引用 {spec} 时找不到键 {key}")
                node = node[key]
            else:
                idx = m.group(2)
                node = _index(spec, node, idx)
        return node

    # ---------- 便捷访问 ----------
    @property
    def hotel(self) -> str:
        return self.settings["project"]["hotel"]

    @property
    def tolerance(self) -> float:
        return float(self.settings["run"]["amount_tolerance"])

    @property
    def deviation_pct(self) -> float:
        return float(self.settings["run"]["deviation_pct"])

    @property
    def read_only_raw(self) -> bool:
        return bool(self.settings["run"].get("read_only_raw", True))

    def source(self, key: str) -> dict:
        for item in self.sources.get("sources", []):
            if item.get("key") == key:
                return item
        raise KeyError(f"data_sources.yaml 里没有 key={key} 的数据源")

    def role_commands(self, role: str) -> list[str]:
        roles = self.delivery.get("roles", {})
        if role not in roles:
            raise KeyError(f"delivery.yaml 里没有角色 {role}")
        return list(roles[role])

    @property
    def default_role(self) -> str:
        return self.delivery.get("default_role", "admin")


def _deep_merge(base: dict, extra: dict) -> dict:
    for k, v in extra.items():
        if isinstance(v, dict) and isinstance(base.get(k), dict):
            _deep_merge(base[k], v)
        else:
            base[k] = v
    return base


_cached: Config | None = None


def get_config(reload: bool = False) -> Config:
    global _cached
    if _cached is None or reload:
        _cached = Config()
    return _cached
