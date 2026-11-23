# 连续视频主题接入

## 当前制作状态（2026-11-05，1.8.0 分批发布）

33 套导演方案、99 段动作提示词和 8 套精绘场景底图已准备完成。17 条原视频已下载，其中银白龙娘经典原版、ChatGPT 两种画风、Claude 插画和极光雪境共 5 套已完成三段编排、视觉验收及 SHA256 记录。Claude 二次元的冷启动与恢复两段已通过原片检查，背景尚未下载。用户已明确要求先打包完成部分，因此 1.8.0 仅升级这 5 套，另 28 套保留原有效果；不能宣称全部主题已完成视频重制。

当前独立 CodeBuddy CLI 的视频服务返回 HTTP 429、服务码 `14018`（额度已用尽）；已用一次受限恢复查询确认，查询已有任务也被同一额度错误拒绝。2026-11-05 用户确认 WorkBuddy 桌面端也无法生成；桌面端的具体错误及两个入口是否共用额度尚未确认。没有继续尝试生成或查询，也未购买额度、切换账号或重复生成已提交任务。本地检查确认生成和恢复脚本均未运行。

任务记录：17 条已下载，6 条已提交但查询失败，48 条创建请求被额度拒绝，28 条未提交。6 个已有任务 ID 保存在 `preview/video-reboot/recovered-submitted-ids.json`。恢复脚本只允许查询白名单中的原任务，内存中禁用创建端点，不修改全局安装文件或读取、导出凭据。不要将这 6 条当作从未提交而再次生成。

制作资料与预览位于 `preview/video-reboot/`：`theme-directions.json`、`generated/<主题>/visual-review.json`、`assembly-qa.json`、`release-video-inventory.json` 和 `review.html`。`resume-plan.json` 保存逐项续做清单，区分 6 条已有任务与 76 条尚需创建的素材。队列的 `generation-cooldown.json` 已设为阻止新请求；只有确认可用额度后才能人工恢复，并优先找回已有任务。`publish-manifest.cjs` 默认要求全套齐备；`--partial` 用于开发预览或本次已明确授权的分批发布，仍逐项校验完整三段、技术验收、视觉验收与文件哈希。

验证包括类型检查、构建、24 项单元测试、独立 Electron 的真实视频播放和交接测试，以及打包版的图库、配置保留和实际视频解码检查。测试使用临时独立配置，不强制关闭用户真实 Codex／WorkBuddy 会话。安装程序按项目约定输出至 `release/1.8.0/`，供用户手动安装。

主题角色和已有素材标识保持不变。`src/video-catalog.ts` 在构建时读取 `resources/gallery/video-manifest.json`；未列入清单的主题保留原有演出，只有经过验收的完整三段素材才启用视频。

```json
{
  "version": 1,
  "themes": {
    "chatgpt-anime": {
      "verified": true,
      "cold": { "file": "gallery/video/chatgpt-anime/cold.mp4", "durationMs": 8000 },
      "warm": { "file": "gallery/video/chatgpt-anime/warm.mp4", "durationMs": 3000 },
      "background": { "file": "gallery/video/chatgpt-anime/background.mp4", "durationMs": 6000 },
      "handoffSeconds": 0.5,
      "coldLabel": "星环回旋",
      "warmLabel": "抬手迎接"
    }
  }
}
```

`file` 相对 `resources`，必须与上面的主题目录和槽位文件名一致。冷启动小于 10 秒，恢复为 2.5–3.5 秒，背景为 1–60 秒。`handoffSeconds` 是片尾已播放的背景片头长度，必须大于 0 且小于三段素材各自时长；播放器随后从此时间继续播放循环背景。

写入 `verified: true` 前需完成实际解码、角色一致性、自然动作、三段衔接和循环边界检查。该标志表示人工及素材流程已经验收；构建中的路径、时长、文件和 MP4 容器检查不能代替视觉验收。未完成素材不要写入正式清单。

`resolveVideoSource(source)` 同时识别 `gallery:<id>:<slot>` 和原版 `builtin:cold`、`builtin:eye`、`builtin:background`。配置迁移只更新内置视频时长，不更改原 ID、软件绑定、背景显现程度、适配方式、开关或导入素材。内置视频按原速完整播放，界面不再提供拉长或加速时长设置。

图库卡片和编辑器使用静态缩略图，点击预览才解码视频。`lc-media://asset` 支持流式字节区间响应，供播放器按需预加载与跳转。已接入的视频如果缺失或解码失败会报错，不会用旧图像演出伪装成成功。

```powershell
npm run typecheck
npm run build
npm test
node tests/video-gallery.cjs
node tests/video-handoff.cjs
```

`video-gallery.cjs` 使用独立临时配置，验证 33 套静态缩略图、选择保存、媒体 Range 响应，并对清单中前两套视频实际预览三槽。报告在 `preview/video-gallery/ui-report.json`；当清单为空时，`previews` 也为空，不能据此宣称视频验收完成。
