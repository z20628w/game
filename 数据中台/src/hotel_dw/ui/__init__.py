"""可视化控制台。

    from hotel_dw.ui import serve
    serve(cfg)            # 起一个 127.0.0.1 上的本地控制台

命令行入口：python run.py ui --port 8777
"""

from .server import STAGES, build_snapshot, make_server, serve

__all__ = ["serve", "make_server", "build_snapshot", "STAGES"]
