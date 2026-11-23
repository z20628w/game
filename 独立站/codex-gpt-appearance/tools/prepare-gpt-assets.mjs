import {readFile, writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';

// 使用项目自身的描线算法，使启动线稿与实际壁纸保持一致。
const browser = await chromium.launch({headless: true, executablePath: process.env.GPT_PREVIEW_BROWSER});
try {
  const page = await browser.newPage();
  await page.setContent('<html><body></body></html>');
  await page.addScriptTag({content: await readFile('image-settings.js', 'utf8')});
  const data = 'data:image/jpeg;base64,' + (await readFile('assets/artwork.jpg')).toString('base64');
  const contours = await page.evaluate(async dataURL => {
    const response = await fetch(dataURL);
    const image = new File([await response.blob()], 'artwork.jpg', {type: 'image/jpeg'});
    return (await window.imageSettings.importImage(image, 'artwork')).contours;
  }, data);
  if (!contours.length) throw new Error('背景未产生有效轮廓');
  await writeFile('assets/contours.js', 'window.CONTOUR_PATHS=' + JSON.stringify(contours) + ';\n');
  console.log('已生成轮廓：' + contours.length);
} finally {
  await browser.close();
}
