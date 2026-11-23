import manifest from '../resources/gallery/video-manifest.json'
import type { Profile, Slot } from './shared'

export interface VideoClip { file: string; durationMs: number }
export interface VideoTheme {
  verified: true
  cold: VideoClip
  warm: VideoClip
  background: VideoClip
  handoffSeconds: number
  coldLabel?: string
  warmLabel?: string
}
export interface VideoSource extends VideoClip {
  themeId: string
  slot: Slot
  handoffSeconds: number
  background: VideoClip
}

function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value) }
const aliases: Record<string, Slot> = { 'builtin:cold': 'cold', 'builtin:eye': 'warm', 'builtin:background': 'background' }
const slots: Slot[] = ['cold', 'warm', 'background']

/** 只接入已验收的完整三段，半套素材或不安全路径继续使用原主题。 */
export function parseVideoManifest(raw: unknown): Record<string, VideoTheme> {
  const result: Record<string, VideoTheme> = {}
  if (!record(raw) || raw.version !== 1 || !record(raw.themes)) return result
  for (const [id, value] of Object.entries(raw.themes)) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) || !record(value) || value.verified !== true) continue
    if (!slots.every(slot => {
      const clip = value[slot]
      if (!record(clip) || clip.file !== `gallery/video/${id}/${slot}.mp4` || typeof clip.durationMs !== 'number' || !Number.isFinite(clip.durationMs)) return false
      return slot === 'cold' ? clip.durationMs >= 500 && clip.durationMs < 10000 : slot === 'warm' ? clip.durationMs >= 2500 && clip.durationMs <= 3500 : clip.durationMs >= 1000 && clip.durationMs <= 60000
    })) continue
    const { cold, warm, background } = value as unknown as VideoTheme
    if (typeof value.handoffSeconds !== 'number' || !Number.isFinite(value.handoffSeconds) || value.handoffSeconds <= 0 || value.handoffSeconds * 1000 >= Math.min(cold.durationMs, warm.durationMs, background.durationMs)) continue
    result[id] = {
      verified: true, cold: { ...cold }, warm: { ...warm }, background: { ...background }, handoffSeconds: value.handoffSeconds,
      ...(typeof value.coldLabel === 'string' ? { coldLabel: value.coldLabel.slice(0, 80) } : {}),
      ...(typeof value.warmLabel === 'string' ? { warmLabel: value.warmLabel.slice(0, 80) } : {})
    }
  }
  return result
}

export const videoThemes = parseVideoManifest(manifest)
export function getVideoTheme(id: string) { return Object.hasOwn(videoThemes, id) ? videoThemes[id] : null }

export function resolveVideoSource(source: string, themes = videoThemes): VideoSource | null {
  const alias = Object.hasOwn(aliases, source) ? aliases[source] : undefined, match = /^gallery:([a-z0-9-]+):(cold|warm|background)$/.exec(source)
  const themeId = alias ? 'silver-dragon-classic' : match?.[1], slot = alias ?? match?.[2] as Slot | undefined
  const theme = themeId && Object.hasOwn(themes, themeId) && themes[themeId]
  return theme && slot ? { ...theme[slot], themeId: themeId!, slot, handoffSeconds: theme.handoffSeconds, background: { ...theme.background } } : null
}

/** 视频使用自身时长，保留原主题标识、绑定、显现程度及用户导入素材。 */
export function synchronizeVideoDurations(profile: Profile, themes = videoThemes) {
  let changed = false
  for (const slot of ['cold', 'warm'] as const) {
    const media = profile[slot], video = media && resolveVideoSource(media.source, themes)
    if (video && media.durationMs !== video.durationMs) { media.durationMs = video.durationMs; changed = true }
  }
  return changed
}
