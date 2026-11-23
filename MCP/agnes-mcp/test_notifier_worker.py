"""验证 notifier 模块 + 发送真实微信通知"""
import sys
sys.path.insert(0, "D:/my_code/我的学习/MCP/agnes-mcp")

import notifier

# 1. 发送测试微信通知
print("Sending WeChat notification...")
result = notifier._send_wechat_message(
    "[通知测试] Agnes MCP 视频后台轮询已就绪！\n"
    "生成视频后将在 1-3 分钟内自动微信通知结果。"
)
print(f"WeChat send result: {result}")

# 2. 模拟提交一个视频任务（不实际轮询，只测试状态更新）
print("\nSimulating video task submission...")
notifier.submit_video_task("test_video_12345", "A cat playing piano in moonlight")
pending = notifier.get_pending_count()
print(f"Pending tasks: {pending}")
