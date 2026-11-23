import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { runCli } from '../../shopify-capabilities-lab/scripts/store-api.mjs';

const local = (name) => fileURLToPath(new URL(name, import.meta.url));
const sourceStore = '0e80cm-rd.myshopify.com';
const [storeFlag, store] = process.argv.slice(2);
if (storeFlag !== '--store' || !/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(store || '')) {
  throw new Error('请通过 --store 指定 Shopify 店铺的完整 myshopify.com 域名');
}
const storeKey = store.split('.')[0];
const ids = [187, 191, 194];
const articles = await Promise.all(ids.map(async (id) => JSON.parse(await readFile(local(`article-${id}.json`), 'utf8'))));
const articleImagePattern = /<img\b[^>]*\bsrc="([^"]+)"[^>]*>/gi;
const images = new Map();
const escaped = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// 仅转存选中文章内公开的图片。标题用于替代文本，避免把原始文件名展示给访客。
for (const article of articles) {
  for (const src of [...article.coverImage, ...Array.from(article.content.matchAll(articleImagePattern), (match) => match[1])]) {
    const url = new URL(src);
    if (url.protocol !== 'https:' || url.hostname !== 'file.cyd-live.com' || !/\.(jpe?g|png|webp)$/i.test(url.pathname)) {
      throw new Error(`发现未审核的图片地址：${url.hostname}`);
    }
    const key = createHash('sha256').update(src).digest('hex').slice(0, 20);
    const filename = `cyd-news-${key}.${url.pathname.split('.').pop().toLowerCase()}`;
    url.search = 'imageMogr2/thumbnail/1800x1800%3E';
    images.set(src, { filename, originalSource: url.href, contentType: 'IMAGE', alt: article.title, duplicateResolutionMode: 'RAISE_ERROR' });
  }
}

async function query(document, variables = {}, write = false) {
  const queryPath = local(`migration-${storeKey}.graphql`);
  const variablesPath = local(`migration-${storeKey}-variables.json`);
  await writeFile(queryPath, document);
  await writeFile(variablesPath, JSON.stringify(variables));
  const args = ['store', 'execute', '--store', store, '--version', '2026-10', '--query-file', queryPath,
    '--variable-file', variablesPath, '--json', '--no-input'];
  if (write) args.push('--allow-mutations');
  for (let attempt = 0; ; attempt++) {
    let result;
    try { result = await runCli(args); }
    catch (error) {
      if (write || attempt >= 2 || !/ECONNRESET|abort|timed out|ETIMEDOUT|socket/i.test(error.message)) throw error;
      await delay(1500);
      continue;
    }
    if (result.errors?.length) throw new Error(JSON.stringify(result.errors));
    if (!result.data) throw new Error('Shopify 未返回数据');
    for (const payload of Object.values(result.data)) {
      if (payload?.userErrors?.length) throw new Error(JSON.stringify(payload.userErrors));
    }
    return result.data;
  }
}

console.log(`准备迁移 ${articles.length} 篇资讯、${images.size} 张图片。`);
const fileEntries = [...images.values()];
const imageFields = 'id fileStatus ... on MediaImage { image { url width height } }';
const fileMatches = await query(`query {
  ${fileEntries.map(({ filename }, i) => `f${i}: files(first: 1, query: "filename:${filename}") { nodes { ${imageFields} } }`).join('\n')}
}`);
const records = new Map(fileEntries.map(({ filename }, i) => [filename, fileMatches[`f${i}`].nodes[0]]));
const pending = fileEntries.filter(({ filename }) => !records.get(filename));
if (pending.length) {
  const imported = await query(`mutation($files: [FileCreateInput!]!) {
    fileCreate(files: $files) { files { ${imageFields} } userErrors { code field message } }
  }`, { files: pending }, true);
  if (imported.fileCreate.files.length !== pending.length) throw new Error('文件数量与导入清单不一致');
  imported.fileCreate.files.forEach((file, index) => records.set(pending[index].filename, file));
}
console.log(`Shopify 文件记录已就绪，正在确认 ${records.size} 张图片的处理状态。`);

for (let attempt = 0; ; attempt++) {
  const pendingFiles = [...records].filter(([, file]) => file.fileStatus !== 'READY' || !file.image?.url);
  if (!pendingFiles.length) break;
  if (pendingFiles.some(([, file]) => file.fileStatus === 'FAILED') || attempt >= 5) {
    throw new Error('图片未能全部完成处理：' + pendingFiles.map(([name, file]) => name + ' ' + file.fileStatus).join('、'));
  }
  await delay(2000);
  const state = await query(`query($ids: [ID!]!) { nodes(ids: $ids) { ... on MediaImage { ${imageFields} } } }`, { ids: pendingFiles.map(([, file]) => file.id) });
  state.nodes.forEach((file, index) => records.set(pendingFiles[index][0], file));
}

function hosted(src) {
  const image = records.get(images.get(src).filename).image;
  if (new URL(image.url).hostname !== 'cdn.shopify.com') throw new Error('未取得 Shopify 图片 CDN 地址');
  return image;
}

function imageTag(src, title) {
  const image = hosted(src);
  return `<img src="${escaped(image.url)}" alt="${escaped(title)}" width="${image.width}" height="${image.height}" loading="lazy" style="max-width:100%;height:auto;">`;
}

const blogHandle = 'cyd-news-preview';
let { blogs } = await query(`query { blogs(first: 20) { nodes { id title handle articles(first: 30) { nodes { id title handle isPublished } } } } }`);
let blog = blogs.nodes.find((item) => item.handle === blogHandle);
if (!blog) {
  const data = await query(`mutation($blog: BlogCreateInput!) {
    blogCreate(blog: $blog) { blog { id title handle } userErrors { field message } }
  }`, { blog: { title: 'CYD 资讯（导入预览）', handle: blogHandle } }, true);
  blog = { ...data.blogCreate.blog, articles: { nodes: [] } };
}

const marker = 'cyd-news-import-preview';
const input = articles.map((article) => {
  const rawBody = article.content.replace(articleImagePattern, (_, src) => imageTag(src, article.title));
  // 本批原文只含段落、换行、行内文本和图片，重新生成图片标签并移除来源富文本的额外属性。
  const body = rawBody.replace(/<(p|span|br)\b[^>]*>/gi, '<$1>');
  if (/https?:\/\/file\.cyd-live\.com\//i.test(body)) throw new Error('正文仍含腾讯云源图片地址');
  const gallery = article.coverImage.slice(1).map((src) => `<p>${imageTag(src, article.title)}</p>`).join('');
  const subtitle = article.subtitle ? `<p>${escaped(article.subtitle)}</p>` : '';
  const description = article.description ? `<p>${escaped(article.description)}</p>` : '';
  return {
    blogId: blog.id,
    title: article.title,
    handle: `cyd-news-${article.id}`,
    author: { name: article.author || 'CYD DESIGN' },
    body: subtitle + body + description + gallery,
    isPublished: false,
    tags: [marker, article.typeId === 1 ? '艺术展览' : '资讯'],
    image: { url: hosted(article.coverImage[0]).url, altText: article.title },
    metafields: [{ namespace: 'cyd_migration', key: 'source_id', type: 'single_line_text_field', value: String(article.id) }]
  };
});
const known = new Map(blog.articles.nodes.map((item) => [item.handle, item]));
const missing = input.filter((article) => !known.has(article.handle));
if (missing.length) {
  const result = await query(`mutation(${missing.map((_, i) => `$a${i}: ArticleCreateInput!`).join(',')}) {
    ${missing.map((_, i) => `a${i}: articleCreate(article: $a${i}) { article { id title handle isPublished } userErrors { code field message } }`).join('\n')}
  }`, Object.fromEntries(missing.map((article, i) => [`a${i}`, article])), true);
  for (const { article } of Object.values(result)) known.set(article.handle, article);
}
const data = await query(`query($ids: [ID!]!) {
  nodes(ids: $ids) { ... on Article { id title handle isPublished body image { url } } }
}`, { ids: input.map(({ handle }) => known.get(handle).id) });
const result = data.nodes.map((article) => ({
  id: article.id.split('/').at(-1),
  title: article.title,
  handle: article.handle,
  published: article.isPublished,
  coverOnShopify: article.image?.url?.includes('cdn.shopify.com'),
  bodyImages: [...article.body.matchAll(/<img\b/gi)].length,
  cosLinks: /file\.cyd-live\.com/i.test(article.body)
}));
const resultFile = store === sourceStore ? 'result.json' : `result-${storeKey}.json`;
await writeFile(local(resultFile), JSON.stringify({ store, blog: blog.handle, files: records.size, articles: result }, null, 2));
console.log(JSON.stringify({ blog: blog.handle, files: records.size, articles: result }, null, 2));
