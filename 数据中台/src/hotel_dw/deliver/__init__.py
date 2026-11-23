"""交付层：企业微信「微盘归档 + 会话提醒」。

对应简报 P3 的「04 企业微信交付」：
    * 微盘 · 标准报表归档 —— 报表落进归档目录，再由企微微盘同步
    * 会话 · 待复核项提醒 —— 只推例外项，不推整份数据

本层有一个硬前提：必须先通过人工复核（review.require_approval）。
脚本可以在没人盯着的时候跑完计算，但发到财务手上这一步，必须有人签字。
"""

from __future__ import annotations

from .wecom import build_messages, deliver, push_wecom

__all__ = ["deliver", "build_messages", "push_wecom"]
