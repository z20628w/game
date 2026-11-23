import type { GalleryTheme } from './catalog'

// 图库冷启动与经典原版共用时间线、描线和收束动画，只替换主题素材与文案。
export function classicStartupHTML(html: string, theme?: GalleryTheme) {
  let configuration = ''
  if (theme) {
    const base = `gallery/${theme.id}/`
    const [dark, light, accent] = theme.colors
    configuration = `window.STARTUP_GALLERY=${JSON.stringify({id:theme.id,lineColor:light})};window.AEMEATH_ASSETS=${JSON.stringify({artwork:base+'artwork.jpg',avatar:base+'avatar.jpg'})};window.STARTUP_TEXT=${JSON.stringify({introTitle:theme.name.split(' · ')[0],introCaption:theme.name+' / '+theme.style,artworkSubtitle:theme.name})};`
    html = html.replace('assets/contours.js', base + 'contours.js').replace('<script src="assets/config.js" defer></script>', '')
      .replaceAll('assets/artwork.jpg',base+'artwork.jpg').replaceAll('assets/avatar.jpg',base+'avatar.jpg')
      .replace('</head>', `<style>.scene{background:${dark}}.intro,.dial,.wave{color:${light};stroke:${light}}.pulse i{border-color:${light}80}.pulse b,.sync-fill{background:${light}}.avatar-frame,.corner{border-color:${light}}.boot-title{color:${accent};text-shadow:none}.boot-caption{color:${light};letter-spacing:2px}.dial .dashed,.dial .crosshair,.reticle{stroke:${light};border-color:${light}}.avatar-frame:before,.avatar-frame:after{border-color:${light}}</style></head>`)
  }
  const bridge = `<script>${configuration}window.AEMEATH_EXTERNAL=true;window.AEMEATH_PREWARM=true;window.AEMEATH_SEND=data=>parent.postMessage(data,'*');addEventListener('message',event=>{if(event.source===parent&&event.data?.type==='launchcanvas:play')window.launcherUI?.beginLaunch(false)});</script>`
  return html.replace('<head>', '<head>' + bridge)
}
