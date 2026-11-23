import fs from 'node:fs/promises';
import * as prettier from 'prettier';
import liquid from '@shopify/prettier-plugin-liquid';
import { toLiquidHtmlAST } from '@shopify/liquid-html-parser';
const file='shopify-cyd-store/theme/sections/cyd-hero.liquid';
const original=await fs.readFile(file,'utf8');
const source=original.replace(/({%[-\s]*schema\s*[-]?%})([\s\S]*?)({%[-\s]*endschema\s*[-]?%})/g,(_,open,body,close)=>open+'\n'+JSON.stringify(JSON.parse(body),null,2)+'\n'+close);
const formatted=await prettier.format(source,{parser:'liquid-html',plugins:[liquid],printWidth:100,tabWidth:2,liquidSingleQuote:true,embeddedSingleQuote:true,htmlWhitespaceSensitivity:'ignore',endOfLine:'lf'});
await fs.writeFile('tmp/liquid-format-tools/hero-preview.liquid',formatted);
const ast=toLiquidHtmlAST(original);
console.log('根节点字段',Object.keys(ast));
console.log('节点示例',JSON.stringify(ast.children.slice(0,2),null,2).slice(0,1500));
console.log(formatted.split('\n').slice(20,68).join('\n'));

