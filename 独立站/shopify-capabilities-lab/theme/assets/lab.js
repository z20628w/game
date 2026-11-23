/**
 * 演示主题的浏览器交互入口，由 layout/theme.liquid 作为 ES 模块加载。
 * LabCatalog 处理能力筛选，LabSaveButton 与 LabSaved 处理本机收藏，LabApi 展示只读请求，LabCartLayouts 切换购物车布局。
 * 存储校验与响应摘要逻辑位于 lab-utils.js。元素上的 data-* 由对应 Liquid 区块提供。
 */
import { storageKey, readSaved, writeSaved, matchesCapability, summarizeResponse } from './lab-utils.js'

// 保留 Shopify 路由前缀，让子目录店面发起同源请求。
const rootPath = () => window.Shopify?.routes?.root || '/'
/* 通过 textContent 生成展示节点，商品名或响应内容会按普通文字显示。 */
const textNode = (tag, content, className) => {
  const node = document.createElement(tag)
  node.textContent = content
  if (className) node.className = className
  return node
}
/* 公开同源 JSON 请求的公共入口，保留当前浏览器会话，HTTP 错误交给组件提示。 */
const fetchJson = async (url, signal) => {
  const response = await fetch(url, { signal, headers: { Accept: 'application/json' }, credentials: 'same-origin' })
  if (!response.ok) throw new Error(`请求失败（HTTP ${response.status}），请检查商品发布状态或稍后重试。`)
  return response.json()
}

// 能力清单由 Liquid 直接输出，组件只负责筛选和更新结果计数。
/* 能力数据已由 Liquid 生成到页面，组件只改变行与分组的可见状态，并更新计数。 */
class LabCatalog extends HTMLElement {
  connectedCallback() {
    // 主题编辑器重新挂载区块时，先解绑前一轮的事件。
    this.controller?.abort()
    this.controller = new AbortController()
    const query = this.querySelector('[data-query]')
    const decision = this.querySelector('[data-level-filter]')
    const category = this.querySelector('[data-category-filter]')
    const update = () => {
      let count = 0
      this.querySelectorAll('[data-decision-group]').forEach(group => {
        let visibleRows = 0
        group.querySelectorAll('[data-capability]').forEach(row => {
          const visible = matchesCapability({
            text: row.textContent, category: row.dataset.category, level: row.dataset.decision
          }, query.value, decision.value, category.value)
          row.hidden = !visible
          if (visible) visibleRows++
        })
        group.hidden = visibleRows === 0
        group.querySelector('[data-group-count]').textContent = `${visibleRows} 项`
        count += visibleRows
      })
      this.querySelector('[data-result-count]').textContent = count ? `当前展示 ${count} 项能力。` : '没有匹配结果，请调整关键词或筛选条件。'
    }
    this.addEventListener('input', update, { signal: this.controller.signal })
    this.addEventListener('click', event => {
      const shortcut = event.target.closest('[data-filter-decision]')
      if (!shortcut || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
      // 分类快捷入口从该分类的全部结果开始，链接仍按原生锚点跳转。
      query.value = ''
      category.value = ''
      decision.value = shortcut.dataset.filterDecision
      update()
    }, { signal: this.controller.signal })
    update()
  }
  disconnectedCallback() { this.controller?.abort() }
}

// 商品收藏只存当前浏览器，以商品 handle 识别同一商品。
/* 保存当前商品 handle，最多六件。自定义事件同步同页组件，storage 事件同步其他标签页。 */
class LabSaveButton extends HTMLElement {
  connectedCallback() {
    this.controller?.abort()
    this.controller = new AbortController()
    this.button = this.querySelector('[data-save]')
    this.status = this.querySelector('[data-save-status]')
    this.button.addEventListener('click', () => {
      try {
        let handles = readSaved(localStorage)
        if (handles.includes(this.dataset.handle)) {
          handles = handles.filter(handle => handle !== this.dataset.handle)
          this.status.textContent = '已移除'
        } else {
          if (handles.length >= 6) { this.status.textContent = '最多收藏 6 件，请先在收藏页移除一件。'; return }
          handles.push(this.dataset.handle)
          this.status.textContent = '已保存到本机'
        }
        writeSaved(localStorage, handles)
        window.dispatchEvent(new Event('lab:saved'))
      } catch { this.status.textContent = '浏览器禁止本地存储，无法保存。' }
    }, { signal: this.controller.signal })
    // storage 事件由其他标签页触发，同页组件用自定义事件同步。
    window.addEventListener('lab:saved', () => this.refresh(), { signal: this.controller.signal })
    window.addEventListener('storage', event => { if (event.key === storageKey || event.key === null) this.refresh() }, { signal: this.controller.signal })
    this.refresh()
  }
  refresh() {
    try {
      const saved = readSaved(localStorage).includes(this.dataset.handle)
      this.button.textContent = saved ? '移出本机收藏' : '加入本机收藏'
      this.button.setAttribute('aria-pressed', String(saved))
    } catch { this.status.textContent = '浏览器禁止本地存储，无法保存。' }
  }
  disconnectedCallback() { this.controller?.abort() }
}

/* 收藏页按 handle 重新读取公开商品数据。一次请求失败时仍显示其他商品，并保留移除入口。 */
class LabSaved extends HTMLElement {
  connectedCallback() {
    this.controller?.abort()
    this.controller = new AbortController()
    this.querySelector('[data-clear]').addEventListener('click', () => {
      try { writeSaved(localStorage, []); window.dispatchEvent(new Event('lab:saved')) }
      catch { this.querySelector('[data-saved-status]').textContent = '浏览器禁止本地存储，无法清空。' }
    }, { signal: this.controller.signal })
    window.addEventListener('lab:saved', () => this.render(), { signal: this.controller.signal })
    window.addEventListener('storage', event => { if (event.key === storageKey || event.key === null) this.render() }, { signal: this.controller.signal })
    this.render()
  }
  async render() {
    // 用户连续增删收藏时，取消旧请求，防止旧结果覆盖最新清单。
    this.requests?.abort()
    const controller = new AbortController()
    this.requests = controller
    const status = this.querySelector('[data-saved-status]')
    const items = this.querySelector('[data-saved-items]')
    items.replaceChildren()
    let handles
    try { handles = readSaved(localStorage) } catch { status.textContent = '浏览器禁止本地存储，无法读取收藏。'; return }
    if (!handles.length) { status.textContent = '还没有收藏。先打开演示商品，加入本机收藏后再来比较。'; return }
    status.textContent = '正在读取最新商品信息……'
    // 单件商品下架或请求失败时，仍可展示其他收藏和移除入口。
    const results = await Promise.allSettled(handles.map(handle => fetchJson(`${this.dataset.root}products/${encodeURIComponent(handle)}.js`, controller.signal)))
    if (controller.signal.aborted) return
    results.forEach((result, index) => {
      const handle = handles[index]
      const card = textNode('article', '', 'lab-panel')
      if (result.status === 'fulfilled') {
        const product = result.value
        const link = textNode('a', product.title)
        link.href = `${this.dataset.root}products/${encodeURIComponent(handle)}`
        const title = document.createElement('h2')
        title.append(link)
        card.append(title)
        // 商品名称通过 textContent 显示。Ajax 金额换算后按店面当前币种格式化。
        card.append(textNode('p', product.available ? '状态：有可售规格' : '状态：当前不可售'))
        card.append(textNode('p', `规格数量：${product.variants.length}`))
        const price = product.price / 100
        const currency = window.Shopify?.currency?.active
        card.append(textNode('p', currency ? `起价：${new Intl.NumberFormat(document.documentElement.lang || 'zh-CN', { style: 'currency', currency }).format(price)}` : `价格请进入商品页查看`))
        const list = document.createElement('ul')
        product.options.forEach(option => list.append(textNode('li', `${option.name}：${option.values.join(' / ')}`)))
        card.append(list)
      } else {
        card.append(textNode('h2', handle), textNode('p', '商品读取失败，可能已下架或网络异常。刷新页面可重试。'))
      }
      const remove = textNode('button', '移除收藏', 'lab-save')
      remove.type = 'button'
      remove.addEventListener('click', () => {
        try { writeSaved(localStorage, readSaved(localStorage).filter(value => value !== handle)); window.dispatchEvent(new Event('lab:saved')) }
        catch { status.textContent = '保存失败，请检查浏览器存储权限。' }
      }, { signal: controller.signal })
      card.append(remove)
      items.append(card)
    })
    status.textContent = `当前收藏 ${handles.length} 件；价格与库存以商品页及结账时为准。`
  }
  disconnectedCallback() { this.controller?.abort(); this.requests?.abort() }
}

/* 读取所选公开端点并展示摘要，十五秒后取消未完成请求，按钮状态在 finally 中恢复。 */
class LabApi extends HTMLElement {
  connectedCallback() {
    this.controller?.abort()
    this.controller = new AbortController()
    this.querySelector('[data-run]').addEventListener('click', () => this.run(), { signal: this.controller.signal })
  }
  async run() {
    const button = this.querySelector('[data-run]')
    if (button.disabled) return
    const kind = this.querySelector('[data-endpoint]').value
    const base = this.dataset.root || rootPath()
    // 保留当前模板的 view 参数，让 Shopify 在正确页面渲染所请求的区块。
    const sectionUrl = new URL(window.location.href)
    sectionUrl.searchParams.set('sections', this.dataset.sectionId)
    const endpoints = { cart: `${base}cart.js`, product: `${base}products/lab-demo-cup.js`, search: `${base}search/suggest.json?q=${encodeURIComponent('演示')}&resources[type]=product&resources[limit]=4`, sections: `${sectionUrl.pathname}${sectionUrl.search}` }
    const status = this.querySelector('[data-api-status]')
    const output = this.querySelector('[data-response]')
    button.disabled = true
    status.textContent = '请求中……'
    const start = performance.now()
    this.request = new AbortController()
    const timer = setTimeout(() => this.request.abort(), 15000)
    try {
      const data = await fetchJson(endpoints[kind], this.request.signal)
      // 区块渲染请求可能返回 HTTP 200，但单个区块仍可能为 null。
      if (kind === 'sections' && Object.values(data).some(value => value === null)) throw new Error('区块返回 null，当前模板中没有找到目标区块。')
      output.textContent = JSON.stringify(summarizeResponse(kind, data), null, 2)
      status.textContent = `请求成功 · ${Math.round(performance.now() - start)} ms · ${endpoints[kind]}`
    } catch (error) {
      status.textContent = error.name === 'AbortError' ? '请求已取消或超时，可以重试。' : error.message
      output.textContent = '未获得有效响应。'
    } finally { clearTimeout(timer); button.disabled = false }
  }
  disconnectedCallback() { this.controller?.abort(); this.request?.abort() }
}

// 同一真实购物车共用 Dawn 的数据、操作和焦点管理，只切换演示布局。
/* 复用已有 cart-drawer，仅通过 data-lab-layout 配合 lab.css 改变形态，商品行仍使用同一个购物车。 */
class LabCartLayouts extends HTMLElement {
  async connectedCallback() {
    const drawer = document.querySelector('cart-drawer')
    if (!drawer) return
    this.controller?.abort()
    const controller = new AbortController()
    this.controller = controller
    // Dawn 的抽屉脚本独立加载，等 open 方法就绪后再开放体验按钮。
    await customElements.whenDefined('cart-drawer')
    if (controller.signal.aborted) return

    this.drawer = drawer
    for (const button of this.querySelectorAll('button[data-cart-layout]')) {
      button.disabled = false
      button.addEventListener('click', () => {
        drawer.dataset.labLayout = button.dataset.cartLayout
        drawer.open(button)
      }, { signal: controller.signal })
    }
  }

  disconnectedCallback() {
    this.controller?.abort()
    // 编辑器移除演示区块时，购物车恢复主题设置的布局。
    if (this.drawer) delete this.drawer.dataset.labLayout
  }
}

/* 自定义元素名称必须与 Liquid 标签一致。主题编辑器重复加载脚本时，先检查已注册的名称。 */
for (const [name, constructor] of Object.entries({
  'lab-catalog': LabCatalog, 'lab-save-button': LabSaveButton, 'lab-saved': LabSaved,
  'lab-api': LabApi, 'lab-cart-layouts': LabCartLayouts
})) {
  if (!customElements.get(name)) customElements.define(name, constructor)
}
