import { writeFile, mkdir } from 'node:fs/promises'
import { capabilities, levels } from '../config/capabilities.mjs'
import { decisions, paths } from '../config/decision-guide.mjs'
import { markets, reviewedOn } from '../config/market-rules.mjs'

const escape = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
// 生成 Liquid 路由表达式，店面渲染时再补当前语言的路径前缀。
const href = url => `{{ routes.root_url }}${escape(url.slice(1))}`
const groups = Object.entries(decisions).map(([id, decision]) => ({
  id, ...decision, items: capabilities.filter(item => decision.levels.includes(item.level))
}))
const ids = groups.flatMap(group => group.items.map(item => item.id))
// 生成前检查分类和实现路径，避免首屏统计与详情表不一致。
if (ids.length !== capabilities.length || new Set(ids).size !== ids.length) throw new Error('每项能力应属于且仅属于一个评审结论')
for (const group of groups) {
  if (group.examples.some(([id]) => !group.items.some(item => item.id === id))) throw new Error(`首屏示例与分类不一致：${group.title}`)
}
for (const item of capabilities) {
  if (!paths[item.id]) throw new Error(`能力缺少实现路径：${item.id}`)
}
const overview = groups.map(group => `<section class="lab-decision lab-decision--${group.id}">
  <h2>${escape(group.title)}</h2>
  <p>${escape(group.description)}</p>
  <ul role="list">${group.examples.map(([, text]) => `<li>${escape(text)}</li>`).join('')}</ul>
  <a href="#lab-results" data-filter-decision="${group.id}">查看 ${group.items.length} 项<span aria-hidden="true"> →</span></a>
</section>`).join('\n')
const row = (item, groupId) => `<article class="lab-capability-row" data-capability data-level="${item.level}" data-decision="${groupId}" data-category="${escape(item.category)}">
  <div class="lab-capability-name"><h4>${escape(item.title)}</h4><span class="lab-muted">${escape(item.category)}</span></div>
  <div class="lab-capability-path"><span class="lab-badge lab-badge--${item.level}">${escape(levels[item.level])}</span><p>${escape(paths[item.id])}</p></div>
  <div class="lab-capability-actions">
    <a href="${href(item.url)}" aria-label="${escape(item.title)} · 体验或说明">${item.level === 'boundary' || item.level === 'app' ? '查看说明' : '查看示例'} <span aria-hidden="true">↗</span></a>
  </div>
  <details class="lab-capability-detail"><summary>体验步骤与技术说明<span class="visually-hidden"> · ${escape(item.title)}</span></summary>
    <p>${escape(item.description)}</p><p>${escape(item.steps)}</p><p class="lab-code">${escape(item.implementation)}</p><a href="${escape(item.source)}" target="_blank" rel="noopener">官方依据 ↗</a>
  </details>
</article>`
const matrix = groups.map(group => `<section class="lab-capability-group lab-decision--${group.id}" data-decision-group>
  <h3>${escape(group.title)} <span data-group-count>${group.items.length} 项</span></h3>
  <div class="lab-capability-columns" aria-hidden="true"><span>功能</span><span>实现方式或条件</span><span>入口</span></div>
  ${group.items.map(item => row(item, group.id)).join('\n')}
</section>`).join('\n')
await writeFile('theme/snippets/lab-capability-cards.liquid', `{% comment %}由 scripts/build-guide.mjs 生成，请修改 config/ 下的能力定义。{% endcomment %}
{% if mode == 'overview' %}
${overview}
{% else %}
${matrix}
{% endif %}
`)
await mkdir('docs', { recursive: true })
// 市场要求是独立参考资料，其法律适用条件不参与主题能力分类。
const marketNav = markets.map(market => `<a href="#market-${market.id}">${escape(market.title)}</a>`).join('\n')
const marketRows = markets.map(market => `<section class="lab-market-group" id="market-${market.id}">
  <h2>${escape(market.title)}</h2>
  ${market.rules.map(rule => `<article class="lab-market-rule">
    <div class="lab-market-conclusion">
      <span class="lab-badge lab-badge--${rule.type === 'required' ? 'config' : 'boundary'}">${rule.type === 'required' ? '适用时必须提供' : '做法受限'}</span>
      <h3>${escape(rule.title)}</h3>
      <p class="lab-muted">${escape(rule.scope)}</p>
    </div>
    <dl class="lab-market-details">
      <dt>规则要求</dt><dd>${escape(rule.requirement)}</dd>
      <dt>Shopify 实现思路</dt><dd>${escape(rule.implementation)}</dd>
    </dl>
    <a class="lab-market-source" href="${escape(rule.source[1])}" target="_blank" rel="noopener">${escape(rule.source[0])} <span aria-hidden="true">↗</span></a>
  </article>`).join('\n')}
</section>`).join('\n')
await writeFile('theme/snippets/lab-market-rules.liquid', `{% comment %}由 scripts/build-guide.mjs 生成，内容维护于 config/market-rules.mjs。{% endcomment %}
<p class="lab-muted">官方资料核对日期 <time datetime="${reviewedOn}">${reviewedOn}</time> · ${markets.reduce((sum, market) => sum + market.rules.length, 0)} 项要求</p>
<nav class="lab-market-jumps" aria-label="按市场跳转">${marketNav}</nav>
${marketRows}
`)
await writeFile('docs/capabilities.md', `# Shopify 主题能力清单\n\n共 ${capabilities.length} 项；“主题可实现”表示实现方式，不等于所有店铺条件和交互已经验收。远端实测请看 verification.md。\n\n${capabilities.map(item => `## ${item.title}\n\n- 分类：${item.category} / ${levels[item.level]}\n- 能力：${item.description}\n- 体验：${item.steps}\n- 路径：\`${item.url}\`\n- 实现：\`${item.implementation}\`\n- [官方依据](${item.source})\n`).join('\n')}`)
console.log(`已生成 ${capabilities.length} 项能力导览与文档`)
await import('./build-ui-previews.mjs')
