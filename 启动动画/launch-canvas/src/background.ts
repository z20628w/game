import { readFile, stat } from 'node:fs/promises'
import { join, extname } from 'node:path'
import type { Profile } from './shared'
import type { Store } from './store'
import type { CDP } from './cdp'
import { parseGallerySource } from './catalog'
import { resolveVideoSource } from './video-catalog'
import { enforceProfileBackground, backgroundPolicyMessage } from './background-policy'
import packageInfo from '../package.json'
export const mimeTypes: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif', '.mp4': 'video/mp4', '.webm': 'video/webm' }
export function sourcePath(source: string, resources: string, store: Store): string {
  const video = resolveVideoSource(source)
  if (video) return join(resources, video.file)
  const gallery = parseGallerySource(source)
  if (gallery) return join(resources, 'gallery', gallery.theme.image || gallery.theme.id + '-thumb.png')
  const builtins: Record<string, string> = { 'builtin:eye': 'eye-open-motion.webm', 'builtin:background': 'artwork.jpg', 'builtin:cold': 'artwork.jpg' }
  if (builtins[source]) return join(resources, 'legacy/assets', builtins[source])
  if (source.startsWith('asset:')) return store.assetPath(source.slice(6))
  throw Error('素材标识无效')
}
export async function applyBackground(client: CDP, profile: Profile, resources: string, store: Store, holdForHandoff = false) {
  profile=await enforceProfileBackground(profile)
  if(profile.adapter.capability!=='supported')throw Error(backgroundPolicyMessage)
  const media = profile.background
  if (!media.enabled) { await client.call('Runtime.evaluate', { expression: 'window.__launchCanvasBackground?.dispose()' }); return }
  const file = sourcePath(media.source, resources, store), info = await stat(file)
  const signature = JSON.stringify([packageInfo.version, media.source, media.fit, media.opacity, file, info.size, info.mtimeMs, profile.adapter.kind, profile.adapter.selectors])
  // 窗口已打开时只置前；相同配置直接保留正在播放的背景，避免每次点击都重载并从零播放。
  if (!holdForHandoff) {
    const existing = await client.call('Runtime.evaluate', { returnByValue: true, expression: `(()=>{const api=window.__launchCanvasBackground,state=api?.status();if(state?.ready&&!state.error&&state.signature===${JSON.stringify(signature)}){api.resume();return true;}return false;})()` })
    if (existing.result?.value === true) return
  }
  const image = 'data:' + mimeTypes[extname(file)] + ';base64,' + (await readFile(file)).toString('base64')
  const videoTheme = resolveVideoSource(media.source)
  const gallery = videoTheme ? null : parseGallerySource(media.source)
  const galleryCode = gallery ? await readFile(join(resources, 'gallery/engine.js'), 'utf8') : ''
  const galleryClosed = gallery?.theme.image ? 'data:image/png;base64,' + (await readFile(join(resources, 'gallery', gallery.theme.id + '-closed.png'))).toString('base64') : undefined
  // 仅提升最外层容器，内部透明区域保留原来的定位和层级，避免破坏网格/绝对定位布局。
  const skin = profile.adapter.kind === 'codex' ? await readFile(join(resources, 'legacy/extension/wallpaper.css'), 'utf8') : `html[data-aemeath-skin],html[data-aemeath-skin] body{background:#0a1313!important}html[data-aemeath-skin] :is(${profile.adapter.selectors.join(',') || '#root'}){background:transparent!important}html[data-aemeath-skin] :is(${profile.adapter.selectors[0] || '#root'}){position:relative;z-index:1}#aemeath-living-wallpaper{position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:0}`
  const defaultMotion = !videoTheme && media.source === 'builtin:background'
  const living = defaultMotion ? (await readFile(join(resources, 'legacy/extension/living-wallpaper.mjs'), 'utf8')).replace('export function', 'function') : ''
  const blink = defaultMotion ? 'data:image/jpeg;base64,' + (await readFile(join(resources, 'legacy/assets/artwork-blink.jpg'))).toString('base64') : ''
  const settings = { image, skin, blink, defaultMotion, signature, source: videoTheme ? 'gallery:' + videoTheme.themeId + ':background' : media.source, gallery: gallery ? { theme: gallery.theme, mode: 'background', durationMs: 6000, imageURL: gallery.theme.image ? image : undefined, closedURL: galleryClosed, opacity: media.opacity, fit: media.fit } : null, video: /^video\//.test(mimeTypes[extname(file)]), opacity: media.opacity / 100, fit: media.fit, selectors: profile.adapter.selectors, codex: profile.adapter.kind === 'codex' }
  const result = await client.call('Runtime.evaluate', { awaitPromise: true, returnByValue: true, expression: `(async()=>{
    const spec=${JSON.stringify(settings)};
    if(!spec.codex&&!spec.selectors.some(selector=>document.querySelector(selector)))throw Error('没有找到配置的背景区域，请调整 selectors');
    window.__launchCanvasBackground?.dispose();window.__aemeathExtension?.dispose();
    ${living}
    ${galleryCode}
    const root=document.documentElement,previous=root.getAttribute('data-aemeath-skin'),oldWash=root.style.getPropertyValue('--aemeath-wash');
    const style=document.createElement('style');style.textContent=spec.skin;document.head.append(style);root.setAttribute('data-aemeath-skin','');root.style.setProperty('--aemeath-wash','1');
    let motion=null,node=null,disposed=false,ready=false,held=${holdForHandoff},resumeTimer=0,playError='';
    const dispose=()=>{if(disposed)return;disposed=true;clearTimeout(resumeTimer);motion?.dispose();if(node?.tagName==='VIDEO'){node.pause();node.removeAttribute('src');node.load();}node?.remove();style.remove();document.removeEventListener('visibilitychange',visibility);previous===null?root.removeAttribute('data-aemeath-skin'):root.setAttribute('data-aemeath-skin',previous);oldWash?root.style.setProperty('--aemeath-wash',oldWash):root.style.removeProperty('--aemeath-wash');if(window.__aemeathExtension===api)delete window.__aemeathExtension;if(window.__launchCanvasBackground===api)delete window.__launchCanvasBackground;};
    const visibility=()=>{if(node?.tagName==='VIDEO'){if(document.hidden||held||disposed)node.pause();else node.play().catch(error=>{playError=error.message;});}};
    const resume=(epochMs=Date.now())=>{if(disposed)return;clearTimeout(resumeTimer);const start=()=>{if(disposed)return;held=false;if(spec.defaultMotion)motion?.pause(false);else motion?.play?.();visibility();};if(epochMs>Date.now())resumeTimer=setTimeout(start,epochMs-Date.now());else if(held)start();};
    const waitVideo=(event)=>new Promise((resolve,reject)=>{if(event==='loadeddata'&&node.readyState>=2){resolve();return;}const cleanup=()=>{clearTimeout(timer);node.removeEventListener(event,done);node.removeEventListener('error',fail);};const done=()=>{cleanup();resolve();};const fail=()=>{cleanup();reject(Error('背景视频格式无法播放'));};const timer=setTimeout(()=>{cleanup();reject(Error('背景视频解码超时'));},6000);node.addEventListener(event,done,{once:true});node.addEventListener('error',fail,{once:true});});
    const prepareHandoff=async(frame)=>{const backdrop=getComputedStyle(document.body).backgroundColor;if(!ready||disposed||!spec.video||!frame.video||frame.source!==spec.source)return {matched:false,backdrop};clearTimeout(resumeTimer);held=true;node.pause();const seconds=Math.min(Math.max(0,frame.seconds),Math.max(0,node.duration-.001));if(Math.abs(node.currentTime-seconds)>.001){const seek=waitVideo('seeked');node.currentTime=seconds;await seek;}await waitVideo('loadeddata');return {matched:true,source:spec.source,seconds:node.currentTime,backdrop};};
    const status=()=>{const motionState=motion?.status()??(spec.video?{seconds:node?.currentTime??0,paused:node?.paused,duration:node?.duration}:undefined),error=playError||motionState?.error||'',active=ready&&!disposed&&!error&&motionState?.active!==false;return {ready:active,completed:active,phase:error?'error':active?'complete':'loading',wallpaper:true,held,error,signature:spec.signature,source:spec.source,video:spec.video,motion:motionState};};
    const api={dispose,resume,prepareHandoff,status};
    window.__launchCanvasBackground=api;window.__aemeathExtension=api;
    try{
      if(spec.gallery){motion=LaunchCanvasGallery.createGalleryScene(spec.gallery);if(!await motion.ready)throw Error('图库背景首帧准备失败');if(held){motion.pause();motion.seek(0);}}
      else if(spec.defaultMotion){motion=createLivingWallpaper(spec.image,spec.blink);motion?.setStrength(spec.opacity*100);if(!motion||!await motion.ready)throw Error('动态背景首帧准备失败');if(held)motion.pause(true);}
      else {node=document.createElement(spec.video?'video':'img');node.id='aemeath-living-wallpaper';node.style.cssText='position:fixed;inset:0;width:100vw;height:100vh;z-index:0;pointer-events:none;object-fit:'+spec.fit+';opacity:'+spec.opacity;if(spec.video){node.muted=true;node.loop=true;node.playsInline=true;const decoded=waitVideo('loadeddata');node.src=spec.image;document.body.prepend(node);await decoded;}else{node.src=spec.image;await node.decode();document.body.prepend(node);}visibility();document.addEventListener('visibilitychange',visibility);}
      if(spec.video)node.addEventListener('error',()=>{if(!disposed){ready=false;playError='背景视频播放中断';}});
      ready=true;
      return {applied:true};
    }catch(error){dispose();throw error;}
  })()` }, 9000)
  if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description ?? '背景未能接入')
}
