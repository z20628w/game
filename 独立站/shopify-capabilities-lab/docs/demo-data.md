# 演示数据与自定义结构

所有数据创建于用户授权的开发店铺 `0e80cm-rd.myshopify.com`，商品带 `演示` 与 `shopify-capabilities-lab-v1` 标签，handle 使用 `lab-demo-` 前缀。脚本不删除现有数据，不修改普通商品。

## 数据列表

| 类型 | 内容 |
| --- | --- |
| 商品 | 弧线陶瓷杯、日常帆布包、阅读台灯、售罄笔记本，共 8 个变体 |
| 集合 | `lab-demo-collection`，包含上述 4 个商品 |
| 商品元字段 | `lab_demo.material` 文本、`lab_demo.features` 文本列表、`lab_demo.guide` 元对象引用 |
| 元对象定义 | `lab_demo_guide`：title、body、material |
| 元对象条目 | `lab-demo-care`，公开读取，Active 状态 |
| 页面 | `lab-demo-contact` 联系页、`lab-demo-about` 内容页 |
| 媒体 | 4 张随项目生成的原创 PNG 商品示意图 |

商品和集合已发布到在线商店渠道；因此数据也可能在当前正式主题的全商品列表中出现。主题本身仍为未发布状态。店铺级商品数据不按主题隔离。

## 重新准备数据

先申请官方 CLI 的店铺数据权限：

```powershell
npx shopify store auth --store 0e80cm-rd.myshopify.com --scopes read_products,write_products,read_publications,write_publications,read_metaobjects,write_metaobjects,read_metaobject_definitions,write_metaobject_definitions,read_content,write_content
npm run seed
node scripts/upload-demo-media.mjs
```

写权限通常包含对应读权限，CLI 回显可能只列写权限。授权保存于官方 CLI，项目不保存 Admin token。API 版本固定在 `config/project.json` 的 `2026-10`。

数据脚本按 handle 查找并复用演示商品，校验专属标签后才更新该商品的首个变体价格/库存策略、补齐缺失规格并发布到在线商店。定义与条目只在不存在时创建，已存在的文案不会重新覆盖。网络中断后可重新运行；同名商品没有本项目标签时停止。集合/页面的专属 handle 应保留给本项目，勿重用作正式内容。媒体通过专属 alt 查重。

脚本将创建结果写入 `reports/demo-data.json`。它不是完整导出备份；不要把它作为删除店铺数据的授权清单。需要清理时在后台核对“演示”资源逐项处理。

## Metafields 示例

在后台“设置 → 自定义数据 → 商品”查看定义，在商品页面填写值。主题读取：

```liquid
{{ product.metafields.lab_demo.material.value | escape }}
{% for feature in product.metafields.lab_demo.features.value %}
  <li>{{ feature | escape }}</li>
{% endfor %}
```

## Metaobjects 示例

在后台内容中的元对象维护条目。商品上的 `lab_demo.guide` 是引用字段，定义的验证规则限制它引用 `lab_demo_guide` 类型。

```liquid
{% assign guide = product.metafields.lab_demo.guide.value %}
{% if guide != blank %}
  <h2>{{ guide.title.value | escape }}</h2>
  <p>{{ guide.body.value | escape | newline_to_br }}</p>
{% endif %}
```

按类型与 handle 全局读取：

```liquid
{% assign guide = shop.metaobjects.lab_demo_guide['lab-demo-care'] %}
{{ guide.title.value | escape }}
```

访问不到时检查定义的店面读取权限、条目状态、type/handle 和商品引用。元对象 type/handle 与元字段 namespace/key 不是同一组概念。本例没有启用独立网页能力；若需要每条元对象有自己的 URL，还要配置网页能力与相应模板。

[官方 Metafields 文档](https://shopify.dev/docs/storefronts/themes/architecture/metafields) · [官方 Metaobjects 文档](https://shopify.dev/docs/storefronts/themes/architecture/metaobjects)
