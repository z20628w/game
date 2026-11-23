import type { PlayerData, PlayerViewport } from './shared'
import { createLivingWallpaper } from '../resources/legacy/extension/living-wallpaper.mjs'
import { createGalleryScene } from './gallery-motion'

const scene = document.querySelector<HTMLElement>('#scene')!, status = document.querySelector<HTMLElement>('#status')!
let media: HTMLVideoElement | HTMLImageElement | HTMLIFrameElement | null = null, data: PlayerData
let timer = 0, resumeTimer = 0, stallTimer = 0, finished = false, completing = false, failed = '', disposed = false
let galleryMotion: ReturnType<typeof createGalleryScene> | undefined
let loopVideo: HTMLVideoElement | undefined
const frameTimes = new WeakMap<HTMLVideoElement, number>()
const frameCallbacks = new Map<HTMLVideoElement, number>()

function applyViewport(viewport?: PlayerViewport) {
  if (!viewport) return
  for (const key of ['x', 'y', 'width', 'height'] as const) document.documentElement.style.setProperty('--player-client-' + key, viewport[key] + 'px')
  window.dispatchEvent(new Event('resize'))
  if (galleryMotion) galleryMotion.seek(galleryMotion.status().seconds)
}

function fail(error: unknown) {
  if (disposed || failed) return
  failed = error instanceof Error ? error.message : String(error)
  clearTimeout(timer); clearTimeout(stallTimer)
  status.textContent = '播放失败：' + failed
  window.player.failed(failed)
}

function waitVideo(video: HTMLVideoElement, event: 'loadeddata' | 'seeked') {
  if (event === 'loadeddata' && video.readyState >= 2) return Promise.resolve()
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => { clearTimeout(timeout); video.removeEventListener(event, done); video.removeEventListener('error', error) }
    const done = () => { cleanup(); resolve() }
    const error = () => { cleanup(); reject(Error('无法解码视频，请尝试 MP4（H.264）或 WebM')) }
    const timeout = window.setTimeout(() => { cleanup(); reject(Error('视频首帧解码超时')) }, 8000)
    video.addEventListener(event, done, { once: true }); video.addEventListener('error', error, { once: true })
  })
}

async function seekVideo(video: HTMLVideoElement, seconds: number) {
  const target = Math.min(Math.max(0, seconds), Math.max(0, video.duration - .001))
  if (Math.abs(video.currentTime - target) > .001) {
    const sought = waitVideo(video, 'seeked')
    video.currentTime = target
    await sought
  }
  await waitVideo(video, 'loadeddata')
  frameTimes.set(video, target)
}

function observeFrames(video: HTMLVideoElement) {
  if (!video.requestVideoFrameCallback || frameCallbacks.has(video)) return
  const decoded = (_now: number, frame: VideoFrameCallbackMetadata) => {
    frameTimes.set(video, frame.mediaTime)
    if (disposed) return
    frameCallbacks.set(video, video.requestVideoFrameCallback(decoded))
    // 自定义长视频允许按用户时长裁切；内置成片始终原速播放到真实结束。
    if (video === media && !data.videoTimeline && data.slot !== 'background' && frame.mediaTime * 1000 >= data.durationMs) void finish()
  }
  frameCallbacks.set(video, video.requestVideoFrameCallback(decoded))
}

async function createVideo(url: string, fit: string, hidden = false) {
  const video = document.createElement('video')
  video.muted = true; video.playsInline = true; video.preload = 'auto'; video.style.objectFit = fit
  if (hidden) video.style.visibility = 'hidden'
  const ready = waitVideo(video, 'loadeddata')
  video.src = url; scene.append(video)
  await ready
  video.addEventListener('error', () => fail(Error('视频播放中断，请检查素材是否完整')))
  const watchProgress = () => {
    clearTimeout(stallTimer)
    if (video === media && !finished && !video.paused) stallTimer = window.setTimeout(() => fail(Error('视频播放停滞，请检查素材或跳过动画')), 15000)
  }
  video.addEventListener('playing', watchProgress); video.addEventListener('timeupdate', watchProgress)
  observeFrames(video)
  return video
}

async function finish() {
  if (finished || completing || disposed) return
  completing = true; clearTimeout(timer); clearTimeout(stallTimer)
  try {
    if (galleryMotion && data.gallery?.mode === 'warm') { galleryMotion.pause(); galleryMotion.seek(data.durationMs / 1000) }
    if (media instanceof HTMLVideoElement) media.pause()
    if (loopVideo && data.videoTimeline) {
      // 动作片尾已经包含背景片头；从共享段之后继续，避免重播这半秒。
      await seekVideo(loopVideo, data.videoTimeline.loopEntrySeconds)
      loopVideo.loop = true
      loopVideo.style.visibility = 'visible'
      if (!data.videoTimeline.matched) {
        loopVideo.style.opacity = '0'
        loopVideo.getBoundingClientRect()
        loopVideo.style.transition = 'opacity 350ms ease'
        loopVideo.style.opacity = '1'
      } else if (media instanceof HTMLVideoElement) media.style.visibility = 'hidden'
      await loopVideo.play()
      if (!data.videoTimeline.matched) {
        await new Promise(resolve => window.setTimeout(resolve, 350))
        if (media instanceof HTMLVideoElement) media.style.visibility = 'hidden'
      }
    }
    finished = true
    status.textContent = data.preview ? '预览结束' : '正在显示软件…'
    window.player.finished()
  } catch (error) { fail(error) }
  finally { completing = false }
}

window.__launchCanvasPlayerHandoff = {
  async prepare() {
    if (failed) throw Error(failed)
    const video = loopVideo ?? (media instanceof HTMLVideoElement ? media : undefined)
    if (video) {
      video.pause()
      const seconds = frameTimes.get(video) ?? video.currentTime
      await seekVideo(video, seconds)
      return { source: data.videoTimeline?.backgroundSource ?? data.source, seconds, video: true }
    }
    return { source: data.source, seconds: 0, video: false }
  },
  resumeAt(epochMs) {
    clearTimeout(resumeTimer)
    resumeTimer = window.setTimeout(() => { if (!disposed && loopVideo) void loopVideo.play().catch(fail) }, Math.max(0, epochMs - Date.now()))
  },
  reveal(durationMs, backdrop) {
    // 减淡画面到目标背景的实际强度，同时由原生窗口透明度逐帧露出应用控件。
    document.querySelectorAll<HTMLElement>('footer,.shade').forEach(node => { node.style.transition = 'opacity ' + durationMs + 'ms ease'; node.style.opacity = '0' })
    if (backdrop) for (const node of [document.documentElement, document.body, scene]) { node.style.transition = 'background-color ' + durationMs + 'ms ease'; node.style.backgroundColor = backdrop }
    if (loopVideo && data.videoTimeline) { loopVideo.style.transition = 'opacity ' + durationMs + 'ms ease'; loopVideo.style.opacity = String(data.videoTimeline.opacity / 100) }
  }
}

window.player.onViewport(applyViewport)
window.player.onStatus(message => { status.textContent = message })
window.player.onPlay(() => {
  status.textContent = data.preview ? '动画预览' : data.name
  galleryMotion?.play()
  if (media instanceof HTMLIFrameElement) media.contentWindow?.postMessage({ type: 'launchcanvas:play' }, 'lc-media://legacy')
  if (media instanceof HTMLVideoElement) {
    media.playbackRate = 1
    media.loop = data.slot === 'background'
    void media.play().catch(fail)
    if (data.slot === 'background') timer = window.setTimeout(() => void finish(), data.durationMs)
  } else timer = window.setTimeout(() => void finish(), data.durationMs)
})
document.querySelector('#skip')!.addEventListener('click', () => void finish())
window.addEventListener('keydown', event => { if (event.key === 'Escape') void finish() })
window.addEventListener('message', event => {
  if (!(media instanceof HTMLIFrameElement) || event.source !== media.contentWindow || event.data?.type !== 'aemeath-boot') return
  if (event.data.action === 'ready') { status.textContent = '画面已就绪'; window.player.ready() }
  if (event.data.action === 'complete') void finish()
  if (event.data.action === 'assetError') window.player.ready('开场动画素材加载失败')
})
window.addEventListener('beforeunload', () => {
  disposed = true; clearTimeout(timer); clearTimeout(resumeTimer); clearTimeout(stallTimer)
  for (const [video, id] of frameCallbacks) { video.cancelVideoFrameCallback(id); video.pause(); video.removeAttribute('src'); video.load() }
  galleryMotion?.dispose()
  delete window.__launchCanvasPlayerHandoff
}, { once: true })

async function load() {
  data = await window.player.data()
  applyViewport(data.viewport)
  if (data.kind === 'gallery' && data.gallery) {
    galleryMotion = createGalleryScene(data.gallery)
    if (!await galleryMotion.ready) throw Error('图库动画准备失败')
    window.player.ready(); return
  }
  if (data.kind === 'living') {
    const motion = createLivingWallpaper(data.url, data.blinkURL!)
    if (!motion || !await motion.ready) throw Error('动态背景初始化失败')
    motion.setStrength(data.opacity)
    window.addEventListener('beforeunload', () => motion.dispose(), { once: true })
    window.player.ready(); return
  }
  if (data.kind === 'legacy') { const frame = document.createElement('iframe'); frame.title = '经典完整开场'; frame.src = data.source.startsWith('gallery:') ? data.url : 'lc-media://legacy/index.html?embedded&duration=' + data.durationMs; media = frame; scene.append(frame); return }
  if (data.kind === 'video') {
    const video = await createVideo(data.url, data.fit); media = video
    video.addEventListener('ended', () => void finish())
    if (data.videoTimeline) { loopVideo = await createVideo(data.videoTimeline.backgroundURL, data.videoTimeline.fit, true); await seekVideo(loopVideo, data.videoTimeline.loopEntrySeconds) }
  } else { const image = document.createElement('img'); image.alt = data.name; image.style.objectFit = data.fit; image.src = data.url; media = image; scene.append(image); await image.decode() }
  if (media instanceof HTMLImageElement || media instanceof HTMLVideoElement) media.style.opacity = String(data.opacity / 100)
  status.textContent = '画面已就绪'; window.player.ready()
}
load().catch(error => window.player.ready(String(error.message ?? error)))

