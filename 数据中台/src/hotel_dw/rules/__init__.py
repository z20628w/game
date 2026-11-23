"""校验层：把口径变成可执行的检查。

对应简报 P4「不替财务拍板，它把规则变成可执行流程」。
每一类规则在这里都有唯一的实现，规则本身是数据（report_rules.yaml），
所以加一条新校验不需要改程序，只需要加一段 YAML。
"""

from __future__ import annotations

from .engine import (
    CHECKS,
    Finding,
    rule_coverage,
    run_validation,
    summarize,
)

__all__ = ["Finding", "run_validation", "summarize", "CHECKS", "rule_coverage"]
