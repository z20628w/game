import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {buildInjection} from '../extension/payload.mjs';
const browser=await chromium.launch({headless:true,executablePath:process.env.GPT_PREVIEW_BROWSER});
try{
  const page=await browser.newPage();
  await page.route('http://gpt-preview.test/**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html data-theme="dark"><body><main id="root">设置验证</main></body></html>'}));
  await page.goto('http://gpt-preview.test/');
  await page.evaluate(await buildInjection(process.cwd(),{deferStart:true}));
  await page.waitForFunction(()=>window.__aemeathExtension?.status().ready);
  await page.evaluate(()=>document.querySelector('iframe').contentWindow.launcherUI.skip());
  await page.waitForFunction(()=>window.__aemeathExtension.status().motion?.active);
  const overlay=page.frameLocator('#aemeath-extension-overlay');
  for(const enabled of [false,true]){
    await page.evaluate(()=>window.__aemeathExtension.openSettings());
    await overlay.locator('#settings-dialog').waitFor({state:'visible'});
    await overlay.locator('#wallpaper-motion').setChecked(enabled);
    await overlay.locator('#preview-images').click();
    await overlay.locator('#settings-dialog').waitFor({state:'hidden'});
    await page.evaluate(()=>document.querySelector('iframe').contentWindow.launcherUI.skip());
    await page.waitForFunction(value=>!!window.__aemeathExtension.status().motion?.active===value,enabled);
    assert.equal(await page.evaluate(()=>window.__aemeathExtension.status().wallpaper),true);
  }
  await page.evaluate(()=>window.__aemeathExtension.dispose());
  assert.equal(await page.locator('#aemeath-living-wallpaper').count(),0);
  console.log('通过：动态背景关闭与启用可保存、静态背景保留、恢复外观清理画布。');
}finally{await browser.close();}
