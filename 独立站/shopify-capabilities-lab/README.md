# Shopify 主题能力实验室

面向 UI、产品与开发的真实主题演示项目。以官方 Dawn 16.1.1 源码为基础，提供 46 项能力对照、自定义数据展示、接口实验、本机收藏与对比、商品定制文字、主题块示例和实现边界说明。

目标店铺：`0e80cm-rd.myshopify.com`。主题上传为独立未发布主题，当前线上主题保持原样。

## 预览入口

- [演示主题预览](https://0e80cm-rd.myshopify.com/?preview_theme_id=189084696894)
- [主题编辑器](https://admin.shopify.com/store/0e80cm-rd/themes/189084696894/editor)
- 店铺启用访问密码时，预览仍需要店铺密码或通过已登录后台打开。预览链接不会关闭密码保护。

## 开发环境与命令

Node.js ≥ 22.12、npm、Git。项目固定使用 Shopify CLI 5.0.0，不依赖全局安装。安装依赖后运行：

```powershell
npm ci
npm run dev
```

CLI 首次连接会打开官方账号授权页面。验证码由 Shopify 认证服务产生，认证信息由 CLI 管理，不应粘贴到主题或提交到代码仓库。

| 命令 | 用途 |
| --- | --- |
| `npm run dev` | 启动连接开发店铺的主题预览与热更新 |
| `npm run guide` | 从 `config/capabilities.mjs`、`config/decision-guide.mjs` 与 `config/market-rules.mjs` 生成能力对照、海外市场要求和能力文档 |
| `npm run check` | Shopify Theme Check，遇到错误失败 |
| `npm test` | 本机收藏安全处理、筛选、接口脱敏和模板引用测试 |
| `npm run push` | 首次创建未发布主题；之后只更新记录中的未发布主题 |
| `npm run package` | 用 Shopify CLI 打包主题 ZIP |
| `npm run themes` | 查看目标店铺主题列表 |
| `npm run inspect` | 只读检查店铺与演示数据，需要数据 API 授权 |
| `npm run seed` | 创建或补齐本项目专属演示数据，需要数据 API 授权 |
| `node scripts/upload-demo-media.mjs` | 上传随项目提供的原创演示商品示意图 |

日常修改 `theme/`。不要重复运行 `scripts/configure-theme.mjs`：它是初次初始化脚本，会重设演示首页、替代模板和默认设置。上传前先运行 `npm run guide`（仅清单有变更时）、`npm test`、`npm run check`。

`store.local.json` 保存本机绑定的远端主题 ID，不包含密钥。推送脚本会核对目标主题仍为 `unpublished`，拒绝向正式主题上传。删除该文件后再次推送会新建主题。若在主题编辑器修改了内容，先决定以远端还是本地设置为准，必要时用 `theme pull` 拉到单独目录对比，避免覆盖编辑器改动。

## 目录

```text
theme/                 完整 Shopify 主题（可直接 CLI 开发、上传、打包）
  assets/lab.*         新增实验室样式和浏览器交互
  sections/lab-*      能力地图、数据、接口、收藏、组件与边界区块
  snippets/lab-*      导航、能力对照、商品扩展
  blocks/lab-note     可复用主题块
  templates/index.*  各实验入口的首页替代模板
config/                目标店铺、固定 API 版本、能力清单单一来源
scripts/               数据准备、上传、文档生成和检查工具
demo-media/            原创演示商品 PNG，不含外部素材授权依赖
tests/                 Node 内置测试
docs/                  能力清单、体验路线、数据说明、CLI 流程与验收记录
reports/               本机执行结果（忽略提交）
```

项目以独立本地目录保存。复制或备份时，请保留整个项目目录，以便同时保留主题、脚本与文档。Dawn 官方许可证位于 `theme/LICENSE.md`，初始化来源为 `https://github.com/Shopify/dawn.git`，基线提交为 `3e9ee2281dc40e1eda9d5fd3ca64719d0a36b47d`。

## 功能与验收

- [UI 与产品体验路线](docs/walkthrough.md)
- [46 项能力清单与官方依据](docs/capabilities.md)
- [海外市场要求预览](https://0e80cm-rd.myshopify.com/?preview_theme_id=189084696894&view=lab-markets)
- [演示数据与 Metaobjects 用法](docs/demo-data.md)
- [CLI 使用范围](docs/cli-workflow.md)
- [本次验证与待配置项目](docs/verification.md)

本项目不把“主题不能独立完成”写成“Shopify 全平台不能完成”。订阅、积分、评论、跨设备收藏、ERP、部分结账扩展需要额外应用、服务或套餐。真实支付、配送、税费和营销规则由店铺后台决定。没有把这些条件未满足的能力做成假成功界面。
