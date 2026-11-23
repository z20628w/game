import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { dirname, join } from 'node:path'
import { mkdir, readFile, writeFile, rename, unlink } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { app } from 'electron'
import { Store } from './store'
import { Launcher } from './launcher'
import { scanInstallation, exists, resolveWindowBinding, discoverCodex } from './detection'
import { enforceProfileBackground, configureBackgroundPolicy } from './background-policy'
import { bindingFingerprint, windowBindingFingerprint, rankWindows, recommendedWindow, bindableExecutable } from './calibration-rules'
import type { Profile, WindowCandidate, CalibrationReport, CalibrationView, CalibrationCheck } from './shared'
const run=promisify(execFile)
interface Session { id:string; profileId:string; fingerprint:string; baseline:Set<string>; startedPid?:number; launched:boolean; bound:boolean; busy:boolean; expires:number; offered:WindowCandidate[] }
export class Calibration {
  private sessions=new Map<string,Session>()
  private reports=new Map<string,CalibrationReport>()
  constructor(private store:Store,private launcher:Launcher,private resources:string,private official:string){}
  async load(){for(const profile of this.store.data.profiles){try{const report=JSON.parse(await readFile(this.file(profile.id),'utf8'));if(report.fingerprint&&report.checks)this.reports.set(profile.id,report)}catch{/* 旧安装没有验证记录时显示待验证。 */}}}
  private file(id:string){return join(this.store.directory,'runtime',id+'.calibration.json')}
  report(profile:Profile):CalibrationReport {const fingerprint=bindingFingerprint(profile),bindingKey=windowBindingFingerprint(profile),saved=this.reports.get(profile.id);return saved?.fingerprint===fingerprint?structuredClone(saved):{fingerprint,bindingKey,boundAt:saved?.bindingKey===bindingKey?saved.boundAt:undefined,checks:{}}}
  all(){return Object.fromEntries(this.store.data.profiles.map(profile=>[profile.id,this.report(profile)]))}
  private profile(id:string){const profile=this.store.data.profiles.find(item=>item.id===id);if(!profile)throw Error('软件组已移除，请重新添加');return profile}
  private session(id:string){const session=this.sessions.get(id);if(!session||session.expires<Date.now())throw Error('校准已结束或超时，请重新打开向导');const profile=this.profile(session.profileId);if(bindingFingerprint(profile)!==session.fingerprint)throw Error('配置已发生变化，请重新打开校准向导');session.expires=Date.now()+30*60*1000;return session}
  private async windows():Promise<WindowCandidate[]>{
    const result=await run(join(this.resources,'native/WindowHost.exe'),['list'],{windowsHide:true,timeout:8000,maxBuffer:1024*1024,encoding:'utf8'})
    const windows=JSON.parse(result.stdout.replace(/^\uFEFF/,'')) as WindowCandidate[]
    return windows.filter(window=>bindableExecutable(window.executable,process.execPath))
  }
  private async persist(profile:Profile,report:CalibrationReport){
    report.bindingKey=windowBindingFingerprint(profile)
    await mkdir(join(this.store.directory,'runtime'),{recursive:true});const temporary=this.file(profile.id)+'.'+randomUUID()+'.tmp'
    try{await writeFile(temporary,JSON.stringify(report));await rename(temporary,this.file(profile.id));this.reports.set(profile.id,report)}catch(error){await unlink(temporary).catch(()=>{});throw error}
  }
  private async exclusive<T>(id:string,operation:(session:Session,profile:Profile)=>Promise<T>){const session=this.session(id);if(session.busy||this.launcher.isLaunching(session.profileId))throw Error('当前操作尚未完成，请稍候');session.busy=true;try{return await operation(session,this.profile(session.profileId))}finally{session.busy=false}}
  async begin(id:string){
    const profile=this.profile(id)
    if(this.launcher.isLaunching(id))throw Error('软件正在启动，请等待动画结束')
    for(const [key,session] of this.sessions){if(session.busy)throw Error('另一个校准操作尚未完成');this.sessions.delete(key)}
    const windows=await this.windows(),session:Session={id:randomUUID(),profileId:id,fingerprint:bindingFingerprint(profile),baseline:new Set(windows.map(w=>w.handle+':'+w.pid)),launched:false,bound:!!this.report(profile).boundAt,busy:false,expires:Date.now()+30*60*1000,offered:[]}
    this.sessions.set(session.id,session);return this.refresh(session.id)
  }
  async refresh(id:string):Promise<CalibrationView>{
    const session=this.session(id),profile=this.profile(session.profileId)
    const windows=rankWindows(await this.windows(),profile,session.baseline,session.startedPid)
    // 仅返回可见窗口元数据，不读取界面正文、聊天记录或截图，也不写入日志。
    session.offered=windows
    const state=await this.launcher.inspect(profile)
    return {sessionId:id,windows,recommended:recommendedWindow(windows),launched:session.launched,bound:session.bound,report:this.report(profile),running:state.running,visible:state.visible||state.minimized,background:profile.adapter.capability,backgroundEnabled:profile.background.enabled}
  }
  async launch(id:string){
    return this.exclusive(id,async(session,profile)=>{
      if(session.launched)throw Error('本次已发出启动请求，请等待软件窗口出现后刷新；也可手动打开软件')
      if(!await exists(profile.adapter.executable)||!bindableExecutable(profile.adapter.executable,process.execPath))throw Error('启动入口无效，请重新绑定安装目录')
      const args=[...profile.adapter.args]
      if(profile.adapter.kind==='codex')args.push('--user-data-dir='+join(app.getPath('appData'),'Codex/web/Codex'))
      const child=spawn(profile.adapter.executable,args,{cwd:dirname(profile.adapter.executable),detached:true,stdio:'ignore',windowsHide:false})
      await new Promise<void>((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject)});session.startedPid=child.pid;session.launched=true;child.unref()
      return this.refresh(id)
    })
  }
  async bind(id:string,handle:string,title:string){
    return this.exclusive(id,async(session,original)=>{
      if(typeof title!=='string'||title.length>160||title.includes('\0'))throw Error('窗口标题规则无效')
      title=title.trim()
      const offered=session.offered.find(window=>window.handle===handle),available=await this.windows()
      const current=available.find(window=>window.handle===handle)
      if(!offered||!current||current.pid!==offered.pid||current.executable!==offered.executable||current.windowClass!==offered.windowClass)throw Error('选中的窗口已关闭或变化，请刷新后重新选择')
      if(title&&!current.title.toLowerCase().includes(title.toLowerCase()))throw Error('标题规则不匹配当前窗口，请使用稳定的标题片段或留空')
      if(available.filter(window=>window.executable===current.executable&&window.windowClass===current.windowClass&&(!title||window.title.toLowerCase().includes(title.toLowerCase()))).length>1)throw Error('同一程序有多个匹配窗口，请填写可区分主窗口的稳定标题片段')
      let profile=structuredClone(original)
      const same=(profile.adapter.windowExecutable||profile.adapter.executable).toLowerCase()===current.executable.toLowerCase()
      if(!same){
        this.official=await discoverCodex().catch(()=>this.official)
        if(this.official)configureBackgroundPolicy(this.official)
        const scan=await scanInstallation(current.executable,this.official,join(this.resources,'adapters'))
        profile.adapter={...scan.adapter,executable:original.adapter.executable,args:original.adapter.args}
        // 绑定新程序时不沿用另一软件的背景能力或页面规则。
        if(profile.adapter.capability==='unavailable')profile.background.enabled=false
      }
      profile.adapter.windowExecutable=current.executable;profile.adapter.windowClass=current.windowClass;profile.adapter.title=title.trim()
      profile.adapter=await resolveWindowBinding(profile.adapter)
      profile=await enforceProfileBackground(profile)
      profile.adapter.evidence=[...profile.adapter.evidence.filter(line=>!line.startsWith('窗口校准：')),'窗口校准：用户确认了真实窗口程序，按完整路径与窗口类型识别']
      profile.adapter.files=profile.adapter.files.filter(file=>file.purpose!=='窗口监测程序')
      profile.adapter.files.push({path:current.executable,purpose:'窗口监测程序',action:'通过已打开窗口校准，不改写目标软件'})
      const verified=await this.launcher.inspect(profile)
      if(!verified.found||!verified.mainProcessIds.includes(current.pid))throw Error('无法按新规则稳定识别所选窗口，请检查权限或缩小标题规则')
      await this.store.save(profile);session.fingerprint=bindingFingerprint(profile);session.bound=true
      const previous=this.report(profile)
      await this.persist(profile,{...previous,boundAt:new Date().toISOString()})
      return this.refresh(id)
    })
  }
  async test(id:string,check:CalibrationCheck){
    if(!['cold','warm','foreground','background'].includes(check))throw Error('验证项目无效')
    return this.exclusive(id,async(session,profile)=>{
      if(!session.bound)throw Error('请返回「确认目标窗口」，选择目标窗口后点击「保存绑定并继续」')
      const state=await this.launcher.inspect(profile)
      if(check==='cold'&&state.running)throw Error(`窗口绑定已保存；「${profile.name}」仍在运行。请在该软件内保存需要保留的文件并完整退出，然后重试冷启动验证`)
      if(check==='warm'&&(!state.running||state.visible||state.minimized))throw Error('请先手动关闭窗口并保留后台进程；如果关闭窗口会退出软件，可跳过恢复验证')
      if(check==='foreground'&&!(state.visible||state.minimized))throw Error('请先打开目标窗口，再验证直接置前')
      if(check==='background'&&(profile.adapter.capability==='unavailable'||!profile.background.enabled))throw Error('当前背景未适配或未启用，不能进行背景验证')
      const report=this.report(profile),at=new Date().toISOString()
      try{
        if(check==='background')await this.launcher.verifyBackground(profile)
        else{
          const result=await this.launcher.launch(profile,check)
          if(result.action!==check)throw Error('运行状态发生变化，本次未完成指定的验证')
          if(result.background==='passed'||result.background==='failed')report.checks.background={state:result.background,message:result.background==='passed'?'接口与背景加载通过':'启动成功，但背景未能接入',at}
        }
        report.checks[check]={state:'passed',message:check==='background'?'接口与背景加载通过':check==='foreground'?'窗口已置前，没有重播动画':check==='cold'?'完全退出后成功启动并找到窗口':'后台实例成功恢复窗口',at}
      }catch(error){report.checks[check]={state:'failed',message:(error as Error).message,at}}
      await this.persist(profile,report);return this.refresh(id)
    })
  }
  end(id:string){const session=this.sessions.get(id);if(session?.busy)throw Error('验证仍在进行，请等待完成后关闭');this.sessions.delete(id)}
  busy(id:string){return [...this.sessions.values()].some(session=>session.profileId===id&&session.busy)}
}
