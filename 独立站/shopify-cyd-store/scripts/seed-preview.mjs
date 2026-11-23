import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, rmdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const storeIndex = process.argv.indexOf('--store');
const store = storeIndex === -1 ? '0e80cm-rd.myshopify.com' : process.argv[storeIndex + 1];
if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(store || '')) {
  throw new Error('--store 需要完整的 myshopify.com 店铺域名');
}
const tag = 'cyd-theme-preview-v1';
const originals = JSON.parse(await readFile(join(root, 'catalog/cyd-preview-products.json'), 'utf8'));
const copy = JSON.parse(await readFile(join(root, 'catalog/cyd-preview-copy.json'), 'utf8'));
const translations = new Map(Object.entries(copy).map(([zh, en]) => [en, zh]));
// 英语是目标店铺的默认语言。只翻译展示字段，SKU、链接及演示标记保持原值。
const english = (value) => copy[value] || value;
const products = originals.map((product) => {
  const descriptionHtml = product.descriptionHtml.replace(/>([^<>]+)</g, (_, text) => `>${english(text)}<`);
  translations.set(descriptionHtml, product.descriptionHtml);
  return {
    ...product,
    title: english(product.title),
    productType: english(product.productType),
    descriptionHtml,
    files: product.files.map((file) => ({ ...file, alt: english(file.alt) })),
    productOptions: product.productOptions.map((option) => ({
      ...option, name: english(option.name),
      values: option.values.map((value) => ({ ...value, name: english(value.name) }))
    })),
    variants: product.variants.map((variant) => ({
      ...variant,
      optionValues: variant.optionValues.map((value) => ({
        ...value, optionName: english(value.optionName), name: english(value.name)
      }))
    }))
  };
});
const cli = join(root, 'node_modules/@shopify/cli/bin/run.js');

/**
 * 默认仅生成并校验导入数据；只有明确传入 --apply，才对指定开发店铺写入。
 * 样本金额为美元测试价；不复制小程序的正式库存、顾客或订单。
 */
if (!process.argv.includes('--apply')) {
  console.table(products.map(({ handle, title, variants }) => ({ handle, title, variants: variants.length })));
  process.exit(0);
}

const temporary = await mkdtemp(join(tmpdir(), 'cyd-shopify-'));
async function graphql(query, variables = {}, mutation = false) {
  const queryFile = join(temporary, 'query.graphql');
  const variableFile = join(temporary, 'variables.json');
  await writeFile(queryFile, query);
  await writeFile(variableFile, JSON.stringify(variables));
  const args = ['store', 'execute', '--store', store, '--version', '2026-10', '--query-file', queryFile,
    '--variable-file', variableFile, '--json', '--no-input'];
  if (mutation) args.push('--allow-mutations');

  const execute = () => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, ...args], { cwd: root, windowsHide: true });
    let output = '', error = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { error += chunk; });
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve(output) : reject(new Error(output || error)));
  });
  let raw;
  // 读取遇到网络中断可安全重试。写入失败由下一次运行按标识核对后续传。
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      raw = await execute();
      break;
    } catch (error) {
      if (mutation || attempt === 2 || !/ECONNRESET|aborted|timed out|ETIMEDOUT|socket/i.test(error.message)) throw error;
      console.log('读取超时，正在重试…');
    }
  }
  const result = JSON.parse(raw);
  if (result.errors?.length) throw new Error(JSON.stringify(result.errors));
  if (!result.data) throw new Error('Shopify 未返回数据');
  for (const payload of Object.values(result.data)) {
    if (payload?.userErrors?.length) throw new Error(JSON.stringify(payload.userErrors));
  }
  return result.data;
}

try {
  const collections = [
    { handle: 'cyd-preview-catalog', title: english('CYD 全部商品'), includes: products },
    { handle: 'cyd-preview-vessels', title: english('器物有灵'), includes: products.filter((item) => item.productType === 'Planters') },
    { handle: 'cyd-preview-selected', title: english('收藏精选'), includes: products.filter((item) => item.productType === 'Collectibles') }
  ];
  console.log('核对店铺及已有样本…');
  const context = await graphql(`query {
    shop { myshopifyDomain currencyCode }
    shopLocales { locale primary published }
    publications(first: 20) { nodes { id name } }
    ${products.map(({ handle }, index) => `p${index}: productByIdentifier(identifier: {handle: "${handle}"}) { id handle tags }`).join('\n')}
    ${collections.map(({ handle }, index) => `c${index}: collectionByIdentifier(identifier: {handle: "${handle}"}) { id handle description }`).join('\n')}
  }`);
  if (context.shop.myshopifyDomain !== store || context.shop.currencyCode !== 'USD') {
    throw new Error('目标店铺或币种与测试配置不匹配，未写入商品。');
  }
  if (!context.shopLocales.some((locale) => locale.locale === 'en' && locale.primary)
    || !context.shopLocales.some((locale) => locale.locale === 'zh-CN' && locale.published)) {
    throw new Error('导入双语样本需要店铺默认语言为英语，并已发布简体中文。');
  }
  const publication = context.publications.nodes.find((item) => ['Online Store', '在线商店'].includes(item.name));
  if (!publication) throw new Error('未找到在线商店发布渠道');
  const records = new Map();
  for (const [index, product] of products.entries()) {
    const existing = context[`p${index}`];
    if (existing && !existing.tags.includes(tag)) throw new Error(`发现同名非演示商品：${product.handle}`);
    if (existing) records.set(product.handle, existing.id);
  }
  for (const [index, collection] of collections.entries()) {
    const existing = context[`c${index}`];
    if (existing && !['CYD 商城开发店铺演示系列', 'CYD development-store demo collection'].some((marker) => existing.description.includes(marker))) {
      throw new Error(`发现同名非演示系列：${collection.handle}`);
    }
  }

  // 只创建尚不存在的记录，重复执行不覆盖主题编辑器或后台已调整的数据。
  const pending = products.filter((item) => !records.has(item.handle));
  for (let start = 0; start < pending.length; start += 2) {
    const batch = pending.slice(start, start + 2);
    console.log('创建商品：' + batch.map(({ title }) => title).join('、'));
    const result = await graphql(`mutation(${batch.map((_, index) => `$i${index}: ProductSetInput!`).join(',')}) {
      ${batch.map((_, index) => `p${index}: productSet(input: $i${index}, synchronous: true) {
        product { id handle } userErrors { field message }
      }`).join('\n')}
    }`, Object.fromEntries(batch.map((item, index) => [`i${index}`, item])), true);
    for (const { product } of Object.values(result)) records.set(product.handle, product.id);
  }

  const pendingCollections = collections.filter((_, index) => !context[`c${index}`]);
  const collectionIds = collections.map((_, index) => context[`c${index}`]?.id).filter(Boolean);
  if (pendingCollections.length) {
    console.log('创建演示系列…');
    const result = await graphql(`mutation(${pendingCollections.map((_, index) => `$i${index}: CollectionInput!`).join(',')}) {
      ${pendingCollections.map((_, index) => `c${index}: collectionCreate(input: $i${index}) {
        collection { id handle } userErrors { field message }
      }`).join('\n')}
    }`, Object.fromEntries(pendingCollections.map(({ handle, title, includes }, index) => [`i${index}`, {
      handle, title, descriptionHtml: english('<p>CYD 商城开发店铺演示系列。</p>'),
      products: includes.map((item) => records.get(item.handle))
    }])), true);
    for (const { collection } of Object.values(result)) collectionIds.push(collection.id);
  }

  // 集合关联可在失败后补齐，重复执行不会复制商品。
  for (const collection of collections) {
    const data = await graphql('query($handle: String!) { collectionByIdentifier(identifier: {handle: $handle}) { id products(first: 50) { nodes { id } } } }', { handle: collection.handle });
    const current = data.collectionByIdentifier;
    const known = new Set(current.products.nodes.map((product) => product.id));
    const missing = collection.includes.map((product) => records.get(product.handle)).filter((id) => !known.has(id));
    if (missing.length) {
      await graphql('mutation($id: ID!, $products: [ID!]!) { collectionAddProducts(id: $id, productIds: $products) { userErrors { field message } } }',
        { id: current.id, products: missing }, true);
    }
  }

  console.log('保存商品、规格、图片及系列的中文译文…');
  const ids = [...records.values(), ...collectionIds];
  const resources = await graphql(`query($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on Product {
        id options { id optionValues { id } }
        media(first: 20) { nodes { id } }
      }
    }
  }`, { ids: [...records.values()] });
  const nestedIds = resources.nodes.filter(Boolean).flatMap((product) => [
    ...product.options.flatMap((option) => [option.id, ...option.optionValues.map((value) => value.id)]),
    ...product.media.nodes.map((media) => media.id)
  ]);
  // Shopify 分别存储商品正文、选项名、选项值和图片替代文字的翻译。
  for (let start = 0; start < ids.length + nestedIds.length; start += 50) {
    console.log(`核对第 ${start / 50 + 1} 批翻译资源…`);
    const result = await graphql(`query($ids: [ID!]!) {
      translatableResourcesByIds(first: 50, resourceIds: $ids) {
        nodes { resourceId translatableContent { key value digest }
          translations(locale: "zh-CN") { key value outdated }
        }
      }
    }`, { ids: [...ids, ...nestedIds].slice(start, start + 50) });
    const pendingTranslations = [];
    for (const resource of result.translatableResourcesByIds.nodes) {
      const inputs = resource.translatableContent.flatMap((field) => {
        // Shopify 会规范化正文 HTML 的空白，正文按商品 ID 对照，避免漏掉含规格表的商品。
        const source = originals.find((product) => records.get(product.handle) === resource.resourceId);
        const value = field.key === 'body_html' && source ? source.descriptionHtml : translations.get(field.value);
        if (!value) return [];
        if (resource.translations.some((entry) => entry.key === field.key && entry.value === value && !entry.outdated)) return [];
        return [{ key: field.key, locale: 'zh-CN', value, translatableContentDigest: field.digest }];
      });
      if (inputs.length) {
        pendingTranslations.push({ id: resource.resourceId, inputs });
      }
    }
    if (pendingTranslations.length) {
      console.log(`保存 ${pendingTranslations.length} 个资源的中文译文…`);
      await graphql(`mutation(${pendingTranslations.map((_, index) => `$id${index}: ID!, $t${index}: [TranslationInput!]!`).join(',')}) {
        ${pendingTranslations.map((_, index) => `t${index}: translationsRegister(resourceId: $id${index}, translations: $t${index}) {
          userErrors { field message }
        }`).join('\n')}
      }`, Object.fromEntries(pendingTranslations.flatMap((resource, index) => [
        [`id${index}`, resource.id], [`t${index}`, resource.inputs]
      ])), true);
    }
  }

  console.log('启用在线商店渠道…');
  const publishIds = [...records.values(), ...collectionIds];
  await graphql(`mutation($publication: ID!, ${publishIds.map((_, index) => `$i${index}: ID!`).join(',')}) {
    ${publishIds.map((_, index) => `p${index}: publishablePublish(id: $i${index}, input: [{publicationId: $publication}]) {
      userErrors { field message }
    }`).join('\n')}
  }`, { publication: publication.id, ...Object.fromEntries(publishIds.map((id, index) => [`i${index}`, id])) }, true);
  console.log(`已将 ${records.size} 件带演示标记的商品和 ${collectionIds.length} 个演示系列发布到开发店铺的在线商店渠道。`);
} finally {
  // 仅清理由 mkdtemp 在系统临时目录创建的本次查询文件。
  const expected = join(tmpdir(), 'cyd-shopify-');
  if (temporary.startsWith(expected)) {
    for (const file of ['query.graphql', 'variables.json']) await rm(join(temporary, file), { force: true });
    await rmdir(temporary).catch(() => {});
  }
}
