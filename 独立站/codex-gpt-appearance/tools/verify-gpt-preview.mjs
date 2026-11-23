import {mkdir, writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {buildInjection} from '../extension/payload.mjs';

const browser = await chromium.launch({headless: true, executablePath: process.env.GPT_PREVIEW_BROWSER});
try {
  await mkdir('preview', {recursive: true});
  const page = await browser.newPage({viewport: {width: 1440, height: 900}});
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setContent('<!doctype html><html data-theme="dark"><head><title>本地动画验证</title></head><body><main id="root">本地动画验证</main></body></html>');
  await page.evaluate(await buildInjection(process.cwd(), {deferStart: true}));
  await page.waitForFunction(() => window.__aemeathExtension?.status().ready);
  assert.equal(await page.evaluate(() => window.__aemeathExtension.status().phase), 'prepared');
  assert.equal(await page.evaluate(() => document.querySelector('iframe').style.visibility), 'hidden');
  assert.equal(await page.evaluate(() => window.__aemeathExtension.prepareToShow()), true);
  await page.waitForTimeout(400);
  assert.equal(await page.evaluate(() => document.querySelector('iframe').contentDocument.querySelector('.window').dataset.elapsed), '0.00');
  assert.equal(await page.evaluate(() => window.__aemeathExtension.start()), true);
  const overlay = page.frameLocator('#aemeath-extension-overlay');
  await overlay.locator('.window').evaluate(async element => {
    while (Number(element.dataset.elapsed) < 2.5) await new Promise(resolve => requestAnimationFrame(resolve));
  });
  await page.screenshot({path: 'preview/01-avatar.png'});
  await overlay.locator('.window').evaluate(async element => {
    while (Number(element.dataset.elapsed) < 9) await new Promise(resolve => requestAnimationFrame(resolve));
  });
  await page.screenshot({path: 'preview/02-wallpaper.png'});
  await page.waitForFunction(() => window.__aemeathExtension.status().completed);
  const status = await page.evaluate(() => window.__aemeathExtension.status());
  assert.equal(status.overlay, false);
  assert.equal(status.wallpaper, true);
  assert.equal(await page.evaluate(() => document.documentElement.style.getPropertyValue('--aemeath-wash')), '0.7');
  await page.evaluate(() => window.__aemeathExtension.openSettings());
  await overlay.locator('#settings-dialog').waitFor({state: 'visible'});
  assert.equal(await overlay.locator('#intro-title').inputValue(), '欢迎回来');
  await overlay.locator('#restore-appearance').click();
  assert.equal(await page.evaluate(() => document.documentElement.hasAttribute('data-aemeath-skin')), false);
  await page.evaluate(await buildInjection(process.cwd()));
  await page.waitForFunction(() => window.__aemeathExtension?.status().ready);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__aemeathExtension.status().completed);
  assert.equal(await page.locator('#aemeath-extension-overlay').count(), 0);
  assert.deepEqual(errors, []);
  await writeFile('preview/verification.json', JSON.stringify({passed: true, checks: ['预热', '完整播放', '背景保留', '30% 默认强度', '自定义文字', '恢复原外观', 'Esc 跳过'], status}, null, 2));
  console.log('通过：预热、完整播放、背景保留、设置、恢复、Esc 跳过；页面错误 0。');
} finally {
  await browser.close();
}
