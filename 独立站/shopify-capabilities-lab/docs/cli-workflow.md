# CLI 工作流与范围

Shopify CLI 是开发与管理工具，不是一张能绕开平台限制的功能清单。本项目以主题全代码开发为范围，实际执行与备用命令分别列出。

| 工作 | 命令入口 | 本次用途 |
| --- | --- | --- |
| 初始化源码 | `theme init theme --clone-url https://github.com/Shopify/dawn.git` | 已执行，明确使用 Dawn，而非 CLI 默认 Skeleton |
| 账号授权 | 首次主题命令触发官方授权 | 已执行 |
| 列出主题 | `npm run themes` | 已执行，核对现有主题与新主题角色 |
| 开发预览 | `npm run dev` | 可用于后续热更新开发；是否本次实测见验收记录 |
| 主题检查 | `npm run check` | 已执行 |
| 上传主题 | `npm run push` | 已执行，独立未发布主题 |
| 打包主题 | `npm run package` | 交付本地 ZIP |
| 店铺数据授权 | `store auth` | 已执行，权限仅用于演示数据所需资源 |
| GraphQL 查询/变更 | `store execute` | 已执行；脚本变更明确传 `--allow-mutations` |
| 拉取远端主题 | `theme pull --theme <ID> --path <独立目录>` | 备用；不自动覆盖本地代码 |
| 查看或分享预览 | 上传结果中的 previewUrl / editorUrl | 已生成，访问仍遵守店铺密码保护 |
| 发布、删除主题 | `theme publish` / `theme delete` | 不属于本次演示流程，未执行 |
| 应用开发、Functions、Hydrogen | `app` / 对应工具链 | 独立工程范围，本主题没有冒充应用工程 |

建议日常流程：修改代码 → 本地测试与 Theme Check → `theme dev` 预览 → 上传未发布主题 → 验收 → 另行决定是否发布。

本次未发布演示不需要独立网站服务器，前台主题运行在 Shopify 托管环境。需要外部后端的功能应另建相应应用与运行环境。

[官方 Shopify CLI](https://shopify.dev/docs/api/shopify-cli) · [主题命令](https://shopify.dev/docs/api/shopify-cli/theme) · [店铺数据命令](https://shopify.dev/docs/api/shopify-cli/store)
