/**
 * CYD 自定义交互入口，由 layout/theme.liquid 加载。
 * 前半部分注册 cyd-carousel，配合 cyd-hero.liquid 与 CSS scroll-snap 实现轮播。
 * 后半部分把商品 ID、标题、网址和缩略图写入 localStorage，供当前浏览器收藏弹窗读取。
 * 收藏提示来自 cyd-favorites-dialog.liquid 渲染的 data-*，语言切换后页面重新提供对应文案。
 */
/**
 * 轮播使用原生滚动和 CSS 吸附，按钮与触摸滑动共用当前位置。
 * 不自动播放，避免用户浏览内容时被打断。
 */
class CydCarousel extends HTMLElement {
  /* 轮播元素挂载后查找轨道、幻灯片和指示点。少于两张时无需注册切换事件。 */
  connectedCallback() {
    this.track = this.querySelector('.cyd-hero__track');
    this.slides = Array.from(this.querySelectorAll('.cyd-hero__slide'));
    this.dots = Array.from(this.querySelectorAll('[data-cyd-slide]'));
    if (!this.track || this.slides.length < 2) return;

    /* 主题编辑器可能重新挂载同一组件，AbortController 用于统一清理上一轮监听。 */
    this.events?.abort();
    this.events = new AbortController();
    const { signal } = this.events;
    this.addEventListener('click', (event) => {
      const dot = event.target.closest('[data-cyd-slide]');
      const step = event.target.closest('[data-cyd-step]');
      if (dot) {
        event.preventDefault();
        this.showSlide(Number(dot.dataset.cydSlide));
      } else if (step) {
        this.showSlide((this.currentIndex() + Number(step.dataset.cydStep) + this.slides.length) % this.slides.length);
      }
    }, { signal });
    /* 触摸滑动也会改变当前页。使用 requestAnimationFrame 合并同一帧内的滚动事件，再更新指示点。 */
    this.track.addEventListener('scroll', () => {
      if (this.frame) return;
      this.frame = requestAnimationFrame(() => {
        this.frame = 0;
        const active = this.currentIndex();
        this.dots.forEach((dot, index) => {
          if (active === index) dot.setAttribute('aria-current', 'true');
          else dot.removeAttribute('aria-current');
        });
      });
    }, { passive: true, signal });
    /* 在主题编辑器选中某张轮播时，将它立即移到可见区域，方便编辑该内容块。 */
    this.addEventListener('shopify:block:select', (event) => {
      const index = this.slides.indexOf(event.target.closest('.cyd-hero__slide'));
      if (index >= 0) this.showSlide(index, false);
    }, { signal });
  }

  /* 元素从 DOM 移除时解绑监听并取消待执行帧，避免编辑器重载后重复响应。 */
  disconnectedCallback() {
    this.events?.abort();
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
  }

  /* 每张幻灯片占满轨道宽度，用滚动距离计算索引，并限制在已有图片范围内。 */
  currentIndex() {
    const width = this.track.clientWidth;
    return width ? Math.min(this.slides.length - 1, Math.abs(Math.round(this.track.scrollLeft / width))) : 0;
  }

  /* 根据目标幻灯片与轨道的实际位置计算滚动距离，并尊重系统减少动态效果设置。 */
  showSlide(index, animate = true) {
    const slide = this.slides[index];
    if (!slide) return;
    const left = this.track.scrollLeft + slide.getBoundingClientRect().left - this.track.getBoundingClientRect().left;
    const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.track.scrollTo({ left, behavior: animate && !reduceMotion ? 'smooth' : 'instant' });
  }
}

if (!customElements.get('cyd-carousel')) customElements.define('cyd-carousel', CydCarousel);

/* 收藏独立于 Shopify 账户，按店铺所在域名保存在浏览器；禁用存储时本次页面仍可操作。 */
const favoritesDialog = document.getElementById('CydFavorites');
if (favoritesDialog && typeof favoritesDialog.showModal === 'function') {
  // Liquid 先选定当前语言，脚本只填入运行时的商品标题。
  const messages = favoritesDialog.dataset;
  const withProduct = (message, title) => message.replace('__CYD_PRODUCT__', () => title);
  const storageKey = 'cyd-favorites-v1';
  const favoriteSelector = '[data-cyd-favorite]';
  const status = document.querySelector('[data-cyd-favorites-status]');
  const list = favoritesDialog.querySelector('[data-cyd-favorites-list]');
  const empty = favoritesDialog.querySelector('[data-cyd-favorites-empty]');
  let favorites = new Map();

  /* 读取并校验旧收藏。Map 按 productId 去重，仅接受店内相对链接，避免损坏数据生成错误导航。 */
  try {
    const entries = JSON.parse(localStorage.getItem(storageKey) || '[]');
    if (Array.isArray(entries)) {
      favorites = new Map(entries.filter((item) => item && /^\d+$/.test(item.productId)
        && typeof item.title === 'string' && typeof item.url === 'string'
        && /^\/(?!\/)[^\\]*$/.test(item.url)).map((item) => [item.productId, item]));
    }
  } catch {
    // 浏览器隐私设置、无效旧值或超额均不应影响商城使用。
  }

  /* 同一商品可能同时出现在首页、列表和推荐区，同步所有收藏按钮的选中状态与可访问名称。 */
  function syncButtons() {
    document.querySelectorAll(favoriteSelector).forEach((button) => {
      const active = favorites.has(button.dataset.productId);
      button.hidden = false;
      button.setAttribute('aria-pressed', String(active));
      button.setAttribute('aria-label', withProduct(active ? messages.removeProduct : messages.addProduct, button.dataset.title));
      const label = button.querySelector('span');
      if (label) label.textContent = active ? messages.saved : messages.add;
    });
    document.querySelectorAll('[data-cyd-open-favorites]').forEach((button) => { button.hidden = false; });
  }

  /* 根据收藏快照重建弹窗列表。标题使用 textContent，图片仅接受 HTTPS 或协议相对地址。 */
  function renderFavorites() {
    const rows = Array.from(favorites.values(), (item) => {
      const row = document.createElement('li');
      const link = document.createElement('a');
      link.href = item.url;
      if (typeof item.image === 'string' && /^(https:\/\/|\/\/)[^\\]+/.test(item.image)) {
        const image = document.createElement('img');
        image.src = item.image;
        image.alt = '';
        image.width = 48;
        image.height = 48;
        link.append(image);
      }
      const title = document.createElement('span');
      title.textContent = item.title;
      link.append(title);
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.dataset.cydRemoveFavorite = item.productId;
      remove.textContent = messages.remove;
      remove.setAttribute('aria-label', withProduct(messages.removeItem, item.title));
      row.append(link, remove);
      return row;
    });
    list.replaceChildren(...rows);
    empty.hidden = rows.length > 0;
  }

  /* 每次增删先尝试持久化，再刷新按钮和已打开的弹窗。写入失败时保留本次页面内的操作并提示。 */
  function commit(message) {
    try {
      localStorage.setItem(storageKey, JSON.stringify([...favorites.values()]));
    } catch {
      message += ` ${messages.storageError}`;
    }
    syncButtons();
    if (favoritesDialog.open) renderFavorites();
    status.textContent = message;
  }

  /* 使用事件委托处理新增卡片上的按钮，区分收藏切换、打开弹窗与移除条目三种操作。 */
  document.addEventListener('click', (event) => {
    const favorite = event.target.closest(favoriteSelector);
    const open = event.target.closest('[data-cyd-open-favorites]');
    const remove = event.target.closest('[data-cyd-remove-favorite]');
    if (favorite) {
      const { productId, title, url, image } = favorite.dataset;
      if (favorites.delete(productId)) {
        commit(withProduct(messages.unsaved, title));
      } else {
        favorites.set(productId, { productId, title, url, image });
        commit(withProduct(messages.added, title));
      }
    } else if (open) {
      renderFavorites();
      favoritesDialog.showModal();
    } else if (remove) {
      favorites.delete(remove.dataset.cydRemoveFavorite);
      commit(messages.removed);
      (list.querySelector('button') || favoritesDialog.querySelector('button')).focus();
    }
  });

  // 筛选、搜索和主题编辑器会替换区域 HTML，需要同步新商品卡的收藏状态。
  /* 筛选、推荐结果和主题编辑器可能替换 DOM，观察新增的收藏入口并补齐状态。 */
  const selector = `${favoriteSelector}, [data-cyd-open-favorites]`;
  new MutationObserver((records) => {
    if (records.some(({ addedNodes }) => Array.from(addedNodes).some((node) =>
      node.nodeType === Node.ELEMENT_NODE && (node.matches(selector) || node.querySelector(selector))
    ))) syncButtons();
  }).observe(document.body, { childList: true, subtree: true });
  syncButtons();
}
