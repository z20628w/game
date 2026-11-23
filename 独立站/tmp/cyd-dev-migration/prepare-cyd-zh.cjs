const fs = require('node:fs');
const dir = 'tmp/cyd-dev-migration/';
const read = (name) => JSON.parse(fs.readFileSync(dir + name, 'utf8'));
const {data} = read('cyd-bilingual-fields.json');
const originals = read('cyd-article-original-zh.json');
const themeCopy = Object.fromEntries(Object.entries(read('cyd-theme-copy.json')).map(([zh, en]) => [en, zh]));
const shared = read('cyd-site-copy-zh.json');
const groups = {
  theme: [...data.theme.templates.nodes, ...data.theme.groups.nodes],
  menus: data.menus.nodes,
  pages: data.pages.nodes,
  blogs: data.blogs.nodes,
  articles: data.articles.nodes,
  collections: data.collections.nodes,
};
const attrs = [];
const calls = [];
const vars = {};
const expected = {};
const unchanged = new Set(['CYD DESIGN', '{{ product.vendor }}']);
for (const [group, nodes] of Object.entries(groups)) {
  for (const node of nodes) {
    const values = [];
    for (const field of node.translatableContent) {
      if (field.key === 'handle' || unchanged.has(field.value)) continue;
      const existing = node.translations.find((item) => item.key === field.key && !item.outdated);
      if (existing) continue;
      const value = originals[node.resourceId]?.[field.key] ?? (group === 'theme' ? themeCopy[field.value] : undefined) ?? shared[field.value];
      if (!value) throw new Error('未找到译文：' + group + ' ' + node.resourceId + ' ' + field.key + ' ' + field.value.slice(0, 90));
      values.push({ key: field.key, locale: 'zh-CN', value, translatableContentDigest: field.digest });
    }
    if (values.length) {
      const i = calls.length;
      attrs.push('$id'+i+': ID!', '$values'+i+': [TranslationInput!]!');
      calls.push('r'+i+': translationsRegister(resourceId: $id'+i+', translations: $values'+i+') { translations { key locale outdated } userErrors { field message } }');
      vars['id'+i] = node.resourceId;
      vars['values'+i] = values;
      expected['r'+i] = { group, id: node.resourceId, count: values.length };
    }
  }
}
fs.writeFileSync(dir + 'cyd-register-zh.graphql', 'mutation(' + attrs.join(', ') + ') {\n' + calls.join('\n') + '\n}');
fs.writeFileSync(dir + 'cyd-register-zh-vars.json', JSON.stringify(vars));
fs.writeFileSync(dir + 'cyd-register-expected.json', JSON.stringify(expected));
console.log(Object.values(expected).reduce((totals,{group,count}) => ({...totals,[group]:(totals[group]??0)+count}),{}));
