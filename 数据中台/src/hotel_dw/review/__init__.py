"""复核层：人工闸门。

对应简报 P4 落地原则「异常必须复核」和「不替财务拍板」。
本层的存在本身就是一条设计决定：程序可以算出异常，但**不能自己决定放行**。

流程：
    check   → 落盘校验结果 + 生成「待复核清单」Markdown（给人看）
    review  → 展示清单，等人工逐条确认
    approve → 财务复核岗签字，把「批准了哪几个文件、指纹是多少」写死进凭证
    deliver → 交付前比对指纹，不一致就拒绝发送

指纹比对是这里的关键：审批之后报表被重新生成过（哪怕只差一个数），
凭证就对不上了，必须重新审批。否则「审批」只是个装饰。
"""

from __future__ import annotations

from .gate import (
    NotApproved,
    approval_path,
    approve,
    load_approval,
    require_approval,
    review_list_path,
    validation_path,
    write_review_package,
)

__all__ = [
    "write_review_package", "approve", "load_approval", "require_approval",
    "NotApproved", "validation_path", "review_list_path", "approval_path",
]
