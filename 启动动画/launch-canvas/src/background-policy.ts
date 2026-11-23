import { access, stat } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { pathToFileURL } from 'node:url'
import type { Adapter, Profile } from './shared'
import { rebindCodexAdapter } from './codex-binding'
const run=promisify(execFile)
const physicalAccess:typeof access=process.versions.electron?require('original-fs').promises.access:access
const exists=async(file:string)=>physicalAccess(file).then(()=>true,()=>false)
let officialCodex=''
const identities=new Map<string,{stamp:string;workbuddy:boolean}>()
export const backgroundPolicyMessage='内部背景仅向启幕已确认适配的 Codex 和 WorkBuddy 开放；其他软件统一禁用，窗口校准和导入配置不会开启此能力'
// 只有主进程发现的官方安装记录可以设定 Codex 身份，导入 JSON 不提供此入口。
export function configureBackgroundPolicy(codex:string){officialCodex=codex}
export async function enforceBackgroundPolicy(adapter:Adapter,codex=officialCodex):Promise<Adapter>{
  const copy=rebindCodexAdapter(adapter,codex),target=copy.windowExecutable||copy.executable
  copy.capability='unavailable'
  copy.evidence=(copy.evidence||[]).filter(line=>!line.startsWith('背景策略：'))
  const same=!!target&&resolve(target).toLowerCase()===resolve(copy.executable).toLowerCase()
  if(same&&codex&&resolve(target).toLowerCase()===resolve(codex).toLowerCase()&&await exists(target)){
    copy.kind='codex';copy.capability='supported';copy.pagePrefix='app://-/index.html';copy.selectors=['#root']
  }else if(same&&basename(target).toLowerCase()==='workbuddy.exe'){
    const root=dirname(target)
    if(await exists(join(root,'resources','app.asar'))&&(await exists(join(root,'icudtl.dat'))||await exists(join(root,'resources.pak')))){
      try{
        const info=await stat(target),stamp=info.size+':'+info.mtimeMs,key=resolve(target).toLowerCase()
        let identity=identities.get(key)
        if(identity?.stamp!==stamp){
          const literal="'"+target.replace(/'/g,"''")+"'",script=`[Console]::OutputEncoding=[Text.Encoding]::UTF8;$v=[Diagnostics.FileVersionInfo]::GetVersionInfo(${literal});@{Product=$v.ProductName;Company=$v.CompanyName}|ConvertTo-Json -Compress`
          const result=await run('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true,timeout:4000})
          const metadata=JSON.parse(result.stdout.replace(/^\uFEFF/,''))
          identity={stamp,workbuddy:metadata.Product==='WorkBuddy'&&metadata.Company==='Tencent Technology (Shenzhen) Company Limited'};identities.set(key,identity)
        }
        if(identity.workbuddy){
          copy.kind='electron';copy.capability='supported';copy.pagePrefix=pathToFileURL(join(root,'resources/app.asar/renderer/index.html')).href
          // 已确认的页面规则随启幕构建发布，不从任意导入配置或新增预设授权背景。
          copy.selectors=['#root','.teams-container','.teams-grid-scroll-content','[class^="_gridView_"]','[class^="_gridViewItem_"]','.conversation-shell','.wb-home-route']
        }
      }catch{/* 无法确认程序身份时禁用背景，启动动画继续可用。 */}
    }
  }
  copy.evidence.push(copy.capability==='supported'?'背景策略：已匹配启幕内置确认适配，运行时仍核验页面连接':'背景策略：'+backgroundPolicyMessage)
  return copy
}
export async function enforceProfileBackground(profile:Profile){
  const copy=structuredClone(profile);copy.adapter=await enforceBackgroundPolicy(copy.adapter)
  if(copy.adapter.capability!=='supported')copy.background.enabled=false
  return copy
}
