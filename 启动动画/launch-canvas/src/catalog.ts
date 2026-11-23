import type { Slot } from './shared'
import { warmStories } from './warm-motion'
import { coldStories } from './cold-stories'
import { getVideoTheme } from './video-catalog'
export interface GalleryTheme {
  id: string; name: string; group: 'AI 拟人' | '场景'; style: string; description: string
  effect: string; colors: [string, string, string]; image?: string; introLabel?: string
  eyes?: [number, number, number, number]; eyeSize?: [number, number]
  preset?: Record<Slot,string>
}
const models: [string, string, string, string, [number, number, number, number]][] = [
  ['chatgpt', 'ChatGPT', '翡翠花园', '#83e2ba', [.678,.278,.758,.262]],
  ['claude', 'Claude', '暖阳书阁', '#efb179', [.699,.233,.769,.218]],
  ['gemini', 'Gemini', '双星幻境', '#aa94f9', [.709,.240,.777,.225]],
  ['deepseek', 'DeepSeek', '深海回响', '#72cbf8', [.732,.258,.811,.249]],
  ['doubao', '豆包', '午后花语', '#f3b5a1', [.664,.246,.731,.219]],
  ['qwen', '通义千问', '紫竹月庭', '#c8a4f0', [.713,.295,.785,.280]],
  ['kimi', 'Kimi', '月海星航', '#9bbcf5', [.702,.285,.778,.269]],
  ['grok', 'Grok', '黑洞漫游', '#c5c9da', [.706,.248,.786,.232]],
  ['seed', 'Seed 2.0', '万物萌芽', '#b9df8f', [.686,.278,.768,.259]],
  ['copilot', 'Copilot', '云端领航', '#96c5ff', [.692,.230,.767,.217]],
  ['perplexity', 'Perplexity', '青蓝求知', '#83d8d7', [.693,.270,.769,.255]],
  ['minimax', 'MiniMax', '珊瑚乐章', '#f4a290', [.693,.250,.769,.232]]
]
const animeNames = ['银白龙娘','秋日书卷','星幻猫娘','蓝鲸女仆','轻巧伙伴','星扇书生','月光女仆','黑金战姬','青芽精灵','虹翼领航','星图侦探','海螺音姬']
const animeEyes: [number,number,number,number][] = [
  [.676,.189,.713,.176],[.691,.144,.726,.132],[.692,.190,.734,.172],[.706,.199,.749,.180],
  [.673,.172,.729,.170],[.688,.181,.729,.165],[.690,.170,.730,.151],[.723,.214,.761,.196],
  [.684,.192,.726,.182],[.682,.163,.719,.149],[.674,.175,.717,.170],[.675,.188,.717,.177]
]
export const galleryThemes: GalleryTheme[] = models.flatMap(([id, name, scene, color, eyes], index) => [
  { id: id + '-art', name: name + ' · ' + scene, group: 'AI 拟人' as const, style: '插画风', introLabel: '经典完整开场', description: '经典完整开场' + ' / 睁眼恢复 / 眨眼与发丝', effect: 'portrait', colors: ['#0b1826',color,'#faf5eb'] as [string,string,string], image: id + '-art.png', eyes, eyeSize: [.027,.023] as [number,number] },
  { id: id + '-anime', name: name + ' · ' + animeNames[index], group: 'AI 拟人' as const, style: id === 'doubao' ? '3D 卡通' : '二次元', introLabel: '经典完整开场', description: '经典完整开场' + ' / 睁眼恢复 / 人物动态', effect: 'portrait', colors: ['#101c2d',color,'#fff6f0'] as [string,string,string], image: id + '-anime.png', eyes: animeEyes[index], eyeSize: (id === 'doubao' ? [.019,.025] : [.015,.018]) as [number,number] }
])
galleryThemes.push(
  { id:'aurora',name:'极光雪境',group:'场景',style:'自然',description:'极光铺展 / 流光唤醒 / 雪山与极光循环',effect:'aurora',colors:['#071324','#66e6ce','#9979f5'] },
  { id:'sakura',name:'樱花月庭',group:'场景',style:'自然',description:'花瓣聚拢 / 花间苏醒 / 樱花飘落',effect:'sakura',colors:['#231b36','#f1a7c7','#fff1df'] },
  { id:'city',name:'霓虹雨城',group:'场景',style:'科幻',description:'都市点亮 / 霓虹唤醒 / 雨线与倒影',effect:'city',colors:['#080f23','#49d6f0','#e173d6'] },
  { id:'ocean',name:'月下潮汐',group:'场景',style:'自然',description:'潮光展开 / 波纹唤醒 / 月海涟漪',effect:'ocean',colors:['#061b31','#70cee4','#e9d8ad'] },
  { id:'orbit',name:'星环远航',group:'场景',style:'科幻',description:'星门开启 / 星环流光 / 行星轨道',effect:'orbit',colors:['#080d25','#a9a5ff','#f6c48c'] },
  { id:'ink',name:'水墨远山',group:'场景',style:'国风',description:'山水入画 / 墨韵舒展 / 雾山与飞鸟',effect:'ink',colors:['#d8ded4','#526d6b','#b96352'] },
  { id:'forest',name:'萤火森林',group:'场景',style:'自然',description:'林间点灯 / 萤光唤醒 / 林影与萤火',effect:'forest',colors:['#081f23','#97dba1','#d2b96b'] },
  { id:'crystal',name:'晶体梦境',group:'场景',style:'抽象',description:'棱镜聚合 / 晶光唤醒 / 旋转晶体',effect:'crystal',colors:['#15152f','#a9b5ff','#f2a4d2'] }
)
for (const theme of galleryThemes) {
  theme.introLabel = coldStories[theme.id].name
  theme.description = theme.introLabel + ' / ' + warmStories[theme.id.replace(/-(art|anime)$/,'')] + ' / ' + theme.description.split(' / ').slice(2).join(' / ')
}
// 保留原版素材标识，升级视频后已保存的软件组仍指向同一主题。
galleryThemes.unshift({id:'silver-dragon-classic',name:'银白龙娘 · 经典原版',group:'AI 拟人',style:'经典原版',description:'最初版本的完整开场 / 连续睁眼恢复 / 原版眨眼与发丝动态背景',effect:'legacy',colors:['#081411','#a6dec9','#eee7ff'],introLabel:'原版完整开场',preset:{cold:'builtin:cold',warm:'builtin:eye',background:'builtin:background'}})
export function gallerySource(id: string, slot: Slot) { return galleryThemes.find(theme=>theme.id===id)?.preset?.[slot] ?? `gallery:${id}:${slot}` }
for (const theme of galleryThemes) {
  const video = getVideoTheme(theme.id)
  if (video) {
    theme.introLabel = video.coldLabel || '连续视频开场'
    theme.description = [theme.introLabel, video.warmLabel || '连续视频恢复', '循环视频背景'].join(' / ')
  }
}
export function galleryDuration(id:string,slot:Slot){return slot==='background'?0:getVideoTheme(id)?.[slot].durationMs??(slot==='cold'?12000:galleryThemes.find(theme=>theme.id===id)?.preset?1500:1800)}
export function parseGallerySource(source: string) {
  const match = /^gallery:([a-z0-9-]+):(cold|warm|background)$/.exec(source)
  const theme = match && galleryThemes.find(theme => theme.id === match[1]&&!theme.preset)
  return theme && match ? { theme, slot: match[2] as Slot } : null
}
export function galleryThumbnail(theme: GalleryTheme) {
  if (theme.preset) return 'lc-media://legacy/assets/artwork.jpg'
  if (theme.group === '场景' && getVideoTheme(theme.id)) return `lc-media://gallery/video-reference/${theme.id}.png`
  return `lc-media://gallery/${theme.image || theme.id + '-thumb.png'}`
}

