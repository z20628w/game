const fs = require('node:fs');
const dir = 'tmp/cyd-dev-migration/';
const {data} = JSON.parse(fs.readFileSync(dir + 'translation-inventory.json', 'utf8'));
const blog = data.blogs.nodes.find((item) => item.handle === 'cyd-news-preview');
if (blog.articles.nodes.length !== 3 || blog.articles.nodes.some((a) => a.isPublished)) throw new Error('草稿状态异常');
const enTitles = {
  'cyd-news-187': '2026 Limited Edition: White Crocodile Era',
  'cyd-news-191': 'How a Planter Is Born: Made by One Pair of Hands',
  'cyd-news-194': 'CYD Crocodile Bowl | Channels Between the Scales',
};
const enCopy = {
  '掌中一只碗，外壁浮起层叠的鳞甲。': 'A bowl that fits in your palm, its outer wall rising in layers of scales.',
  '光斜照时鳞下落影，水浇下时沟壑色深；': 'Light at an angle casts shadows beneath the scales. Pour water over them and the channels darken.',
  '沟壑非刻，随光与水而生。': 'The channels are not carved. Light and water bring them into view.',
  '📐 尺寸信息 (cm)': '📐 Dimensions (cm)',
  '小号 · 内径 9×6 · 外径 10.5×6.7': 'Small · Interior 9 × 6 · Exterior 10.5 × 6.7',
  '中号 · 内径 11.1×7 · 外径 12.8×8': 'Medium · Interior 11.1 × 7 · Exterior 12.8 × 8',
  '内径 = 盆口×深度 · 外径 = 盆口×高度': 'Interior = opening diameter × depth · Exterior = rim diameter × total height',
};
const attrs = [];
const operations = [];
const vars = { blogId: blog.id, blog: { title: 'CYD News (Import Preview)' } };
const original = { [blog.id]: { title: blog.title } };
for (const [i, article] of blog.articles.nodes.entries()) {
  const title = enTitles[article.handle];
  if (!title || !article.body || /file\.cyd-live\.com/.test(article.body)) throw new Error('草稿源内容异常');
  let body = article.body.replaceAll(article.title, title);
  if (article.handle === 'cyd-news-194') {
    for (const [zh, en] of Object.entries(enCopy)) {
      if (!body.includes(zh)) throw new Error('源正文中未找到：' + zh);
      body = body.replaceAll(zh, en);
    }
    body = body.replace(/#CYD #CYDdesign[^<]+/, '#CYD #CYDdesign #Planters #PlantPots #CaudexPlants #HandmadeCeramics #Caudex #SucculentPots #CaudexPlanters #ContemporaryPlanters');
  }
  if (/[\u3400-\u9fff]/.test(body)) throw new Error('英文 HTML 仍含中文：' + article.handle);
  original[article.id] = { title: article.title, body_html: article.body };
  vars['id'+i] = article.id;
  vars['article'+i] = { title, body, isPublished: false };
  attrs.push('$id'+i+': ID!', '$article'+i+': ArticleUpdateInput!');
  operations.push('a'+i+': articleUpdate(id: $id'+i+', article: $article'+i+') { article { id handle title isPublished image { url } } userErrors { field message } }');
}
const query = 'mutation($blogId: ID!, $blog: BlogUpdateInput!, ' + attrs.join(', ') + ') {\n'
  + 'blog: blogUpdate(id: $blogId, blog: $blog) { blog { id title handle } userErrors { field message } }\n'
  + operations.join('\n') + '\n}';
fs.writeFileSync(dir + 'cyd-article-english.graphql', query);
fs.writeFileSync(dir + 'cyd-article-english-vars.json', JSON.stringify(vars));
fs.writeFileSync(dir + 'cyd-article-original-zh.json', JSON.stringify(original));
