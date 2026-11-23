import fs from 'node:fs/promises';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import * as prettier from 'prettier';
import liquid from '@shopify/prettier-plugin-liquid';
import { toLiquidHtmlAST } from '@shopify/liquid-html-parser';

const roots = ['shopify-cyd-store/theme', 'shopify-capabilities-lab/theme'];
const files = [];
for (const root of roots) {
  const prefix = root.includes('cyd-store') ? 'cyd-' : 'lab-';
  for (const dir of ['sections', 'snippets', 'blocks']) {
    for (const name of await fs.readdir(path.join(root, dir))) {
      if (!name.startsWith(prefix) || !name.endsWith('.liquid')) continue;
      if (['lab-capability-cards.liquid', 'lab-market-rules.liquid'].includes(name)) continue;
      files.push(path.join(root, dir, name));
    }
  }
  files.push(path.join(root, 'assets', root.includes('cyd-store') ? 'cyd-store.css' : 'lab.css'));
}
const options = {
  plugins: [liquid], printWidth: 100, tabWidth: 2, useTabs: false,
  liquidSingleQuote: true, embeddedSingleQuote: true,
  htmlWhitespaceSensitivity: 'ignore', endOfLine: 'lf',
};
function signature(value) {
  if (Array.isArray(value)) return value.map(signature).filter(item=>item!==undefined);
  if (value === null || typeof value !== 'object') return value;
  if (value.type === 'TextNode' && !value.value.trim()) return undefined;
  if (value.type === 'LiquidRawTag') {
    const body = value.name === 'schema' ? JSON.parse(value.body.value) :
      ['comment', 'doc'].includes(value.name) ? value.body.value.replace(/\s+/g,' ').trim() : value.body.value;
    return {type:value.type,name:value.name,body};
  }
  return Object.fromEntries(Object.entries(value)
    .filter(([key])=> !/position|source/i.test(key))
    .map(([key,item])=>[key,value.type === 'TextNode' && key === 'value' ? item.replace(/\s+/g,' ').trim() : signature(item)])
    .filter(([,item])=>item!==undefined));
}
function difference(a,b,at='root') {
  if(isDeepStrictEqual(a,b)) return undefined;
  if(typeof a!=='object'||typeof b!=='object'||a===null||b===null) return {at,before:a,after:b};
  for(const key of new Set([...Object.keys(a),...Object.keys(b)])) {
    const found=difference(a[key],b[key],at+'.'+key);
    if(found) return found;
  }
}
const results=[];
for (const file of files) {
  const before=await fs.readFile(file,'utf8');
  let source=before;
  const css=file.endsWith('.css');
  if(!css) source=source.replace(/({%[-\s]*schema\s*[-]?%})([\s\S]*?)({%[-\s]*endschema\s*[-]?%})/g,
    (_,open,body,close)=>open+'\n'+JSON.stringify(JSON.parse(body),null,2)+'\n'+close);
  const after=await prettier.format(source,{...options,parser:css?'css':'liquid-html'});
  if(!css) {
    const oldSignature=signature(toLiquidHtmlAST(before));
    const newSignature=signature(toLiquidHtmlAST(after));
    const diff=difference(oldSignature,newSignature);
    if(diff) {
      console.log(file,JSON.stringify(diff).slice(0,2200));
      process.exitCode=1;
      continue;
    }
  }
  if(await prettier.format(after,{...options,parser:css?'css':'liquid-html'})!==after) throw new Error('排版不稳定 '+file);
  results.push({file,before,after});
}
if(process.exitCode) {
  console.log('语法树对比未通过，尚未写入任何主题文件');
} else {
  for(const {file,before,after} of results) {
    const backup=path.join('tmp/liquid-format-tools/before',file);
    await fs.mkdir(path.dirname(backup),{recursive:true});
    await fs.writeFile(backup,before);
    await fs.writeFile(file,after);
  }
  await fs.writeFile('tmp/liquid-format-tools/formatted-files.json',JSON.stringify(results.map(({file})=>file),null,2));
  console.log('已整理 '+results.length+' 个手写 Liquid/CSS 文件，Liquid 语法树及 schema 数据对比通过');
}
