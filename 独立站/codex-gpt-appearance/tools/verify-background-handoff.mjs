import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {installRenderer} from '../extension/renderer.mjs';
import {createLivingWallpaper} from '../extension/living-wallpaper.mjs';

const browser=await chromium.launch({headless:true,executablePath:process.env.GPT_PREVIEW_BROWSER});
const assets={artwork:'data:image/jpeg;base64,'+(await readFile('assets/artwork.jpg')).toString('base64'),blink:'data:image/jpeg;base64,'+(await readFile('assets/artwork-blink.jpg')).toString('base64')};
try{
  const page=await browser.newPage();
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  async function setup(){
    await page.goto('about:blank');
    const payload={assets,deferStart:true,transition:'reopen',html:'<head></head><body></body>',css:'',skin:''};
    await page.evaluate(`(() => {
      const create=${createLivingWallpaper.toString()};
      const delayed=(open,closed)=>{
        const motion=create(open,closed);
        const released=new Promise(resolve=>{window.releaseBackground=resolve;});
        motion.ready=Promise.all([motion.ready,released]).then(([ok])=>ok);
        return motion;
      };
      const payload=${JSON.stringify(payload)};
      (${installRenderer.toString()})(payload,win=>{
        win.AEMEATH_SEND({type:'aemeath-boot',action:'background',image:payload.assets.artwork,strength:30,motion:true});
        win.AEMEATH_SEND({type:'aemeath-boot',action:'ready'});
      },delayed);
    })()`);
    await page.waitForFunction(()=>window.__aemeathExtension.status().phase==='preparing-background');
  }
  await setup();
  assert.equal(await page.evaluate(()=>window.__aemeathExtension.prepareToShow()),false);
  assert.equal(await page.evaluate(()=>window.__aemeathExtension.start()),false);
  await page.evaluate(()=>window.releaseBackground());
  await page.waitForFunction(()=>window.__aemeathExtension.status().ready);
  assert.equal(await page.evaluate(()=>window.__aemeathExtension.status().backgroundState),'motion-ready');
  await page.evaluate(()=>window.__aemeathExtension.dispose());

  await setup();
  await page.waitForFunction(()=>window.__aemeathExtension.status().ready);
  assert.equal(await page.evaluate(()=>window.__aemeathExtension.status().backgroundState),'static-fallback');
  assert.equal(await page.locator('#aemeath-living-wallpaper').count(),0);
  await page.evaluate(()=>window.releaseBackground());
  await page.waitForTimeout(100);
  assert.equal(await page.evaluate(()=>window.__aemeathExtension.status().backgroundState),'static-fallback');
  await page.evaluate(()=>window.__aemeathExtension.dispose());

  await setup();
  await page.evaluate(()=>{window.__aemeathExtension.dispose();window.releaseBackground();});
  await page.waitForTimeout(100);
  assert.equal(await page.locator('#aemeath-living-wallpaper,#aemeath-extension-overlay').count(),0);
  assert.equal(await page.evaluate(()=>Boolean(window.__aemeathExtension)),false);
  assert.deepEqual(errors,[]);
  const checks=['背景未就绪时不显示或播放','首帧完成后允许交接','超时静态回退','迟到响应不覆盖回退状态','取消后不复活资源'];
  await writeFile('preview/background-handoff-verification.json',JSON.stringify({passed:true,checks},null,2));
  console.log(JSON.stringify({passed:true,checks}));
}finally{await browser.close();}
