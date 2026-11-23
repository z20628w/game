import { createHash } from 'node:crypto'
import { dirname, relative, isAbsolute, basename } from 'node:path'
import type { Profile, WindowCandidate } from './shared'

export function bindingFingerprint(profile:Profile){
  const a=profile.adapter
  return createHash('sha256').update(JSON.stringify([a.kind,a.executable,a.windowExecutable||a.executable,a.windowClass||'',a.processModel||'',a.args,a.title,a.pagePrefix,a.selectors,a.capability,profile.cold,profile.warm,profile.background])).digest('hex')
}
export function windowBindingFingerprint(profile:Profile){
  return bindingFingerprint({...profile,cold:null,warm:null,background:null} as unknown as Profile)
}
export function rankWindows(windows:WindowCandidate[],profile:Profile,baseline:Set<string>,startedPid?:number){
  const target=(profile.adapter.windowExecutable||profile.adapter.executable).toLowerCase(),folder=dirname(profile.adapter.executable)
  return windows.map(window=>{
    const reasons:string[]=[];let score=0
    const rel=relative(folder,window.executable)
    if(window.executable.toLowerCase()===target){score=100;reasons.push('与当前窗口程序一致')}
    if(startedPid&&(window.pid===startedPid||window.ancestors.includes(startedPid))){score=Math.max(score,90);reasons.push('属于本次启动的进程链')}
    if(rel&&!rel.startsWith('..')&&!isAbsolute(rel)){score=Math.max(score,60);reasons.push('位于所选安装目录内')}
    if(!baseline.has(window.handle+':'+window.pid)){score+=5;reasons.push('校准期间出现的窗口')}
    return {...window,score,reasons:reasons.length?reasons:['其他已打开窗口，请核对软件名称和路径']}
  }).sort((a,b)=>b.score-a.score||a.title.localeCompare(b.title))
}
export function recommendedWindow(windows:WindowCandidate[]){
  const strong=windows.filter(window=>window.score>=90)
  return strong.length===1?strong[0].handle:undefined
}
export function bindableExecutable(file:string,self:string){
  return file.toLowerCase()!==self.toLowerCase()&&!/^(?:explorer|applicationframehost|shellexperiencehost|startmenuexperiencehost|searchhost|taskmgr)\.exe$/i.test(basename(file))&&!/^(?:unins|uninstall|repair|update|crashpad_handler|setup)/i.test(basename(file))
}
