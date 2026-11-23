import { escapeHTML as e, icon, toast } from '../ui'
import type { CalibrationView, CalibrationCheck, CalibrationReport, Profile } from '../shared'
const labels:Record<CalibrationCheck,string>={cold:'冷启动',warm:'后台恢复',foreground:'直接置前',background:'内部背景'}
export function calibrationSummary(profile:Profile,report?:CalibrationReport){
  return `<div class="calibration-summary">${Object.entries(labels).map(([key,label])=>{const result=report?.checks[key as CalibrationCheck],unsupported=key==='background'&&profile.adapter.capability!=='supported';return `<span class="verification ${unsupported?'':result?.state||''}">${e(label)} · ${unsupported?'已禁用':result?.state==='passed'?'已验证':result?.state==='failed'?'未通过':'待验证'}</span>`}).join('')}</div>`
}
export function openCalibration(profile:Profile,onChanged:()=>Promise<void>){
  const dialog=document.createElement('dialog');dialog.className='calibration-dialog';dialog.setAttribute('aria-labelledby','calibration-heading')
  let view:CalibrationView|undefined,step=1,busy=false,selected='',title=profile.adapter.title,filter='',closed=false
  const close=async()=>{if(busy||closed)return;try{if(view)await window.studio.calibrationEnd(view.sessionId);closed=true;dialog.close();await onChanged()}catch(error){toast((error as Error).message,true)}}
  async function work(operation:()=>Promise<void>){
    if(busy)return;busy=true;render();let message=''
    try{await operation()}catch(error){message=(error as Error).message.replace(/^Error invoking remote method '[^']+': Error: /,'')}
    finally{busy=false;render();if(message)dialog.querySelector<HTMLElement>('.calibration-message')!.textContent=message}
  }
  function adopt(next:CalibrationView){view=next;if(!next.windows.some(window=>window.handle===selected))selected=next.recommended||''}
  const refresh=()=>work(async()=>adopt(await window.studio.calibrationRefresh(view!.sessionId)))
  function render(){
    const scroll=dialog.querySelector('.calibration-body')?.scrollTop||0,listScroll=dialog.querySelector('.calibration-windows')?.scrollTop||0
    const candidates=view?.windows.filter(window=>(window.title+' '+window.executable).toLowerCase().includes(filter.toLowerCase()))||[]
    dialog.innerHTML=`<div class="dialog-top"><div><span class="eyebrow">WINDOW CALIBRATION</span><h2 id="calibration-heading">窗口校准 · ${e(profile.name)}</h2></div><button class="icon-button" data-close aria-label="关闭窗口校准">${icon('close')}</button></div><div class="calibration-steps"><span class="${step===1?'active':''}">1　确认目标窗口</span><span class="${step===2?'active':''}">2　验证启动行为</span></div><div class="calibration-body">${!view?'<p>正在读取窗口归属…</p>':step===1?`
      <p>请打开目标软件，再从下面选择它的主窗口。推荐结果仍需你确认；窗口标题随聊天或文件变化时，标题规则请留空。</p>
      <div class="calibration-toolbar"><button class="button secondary" id="calibration-launch" ${view.launched?'disabled':''}>${icon('play',16)}启动并查找窗口</button><button class="button secondary" id="calibration-refresh">${icon('search',16)}刷新窗口</button><input id="calibration-search" aria-label="搜索窗口或程序路径" placeholder="搜索窗口或程序路径" value="${e(filter)}"></div>
      <div class="calibration-windows" role="radiogroup" aria-label="选择目标软件窗口">${candidates.map(window=>`<label class="calibration-window ${selected===window.handle?'selected':''}"><input type="radio" name="target-window" value="${e(window.handle)}" ${selected===window.handle?'checked':''}><div><strong>${e(window.title)} ${view!.recommended===window.handle?'<small>推荐</small>':''}</strong><code>${e(window.executable)}</code><span>${e(window.reasons.join('；'))} · ${window.width} × ${window.height}${window.minimized?' · 已最小化':''}</span></div></label>`).join('')||'<div class="scan-empty">没有匹配窗口。请打开软件后刷新；若目标软件以管理员权限运行，启幕需要相同权限才能识别。</div>'}</div>
      <label class="field">窗口标题包含（可选）<input id="calibration-title" maxlength="160" value="${e(title)}" placeholder="仅在同一程序有多个主窗口时填写稳定的标题片段"></label><p class="muted">保存后只更新窗口绑定，保留启动入口、动画素材和桌面快捷方式。校准不会修改目标软件安装文件。</p>
    `:`<div class="calibration-saved"><strong>${icon('check',18)}软件组与窗口绑定已保存</strong><p>无需再保存启幕配置。以下验证可以分次进行，也可以直接点「完成」，以后再来验证。</p></div><div class="calibration-state">当前状态：${view.running?view.visible?'窗口已打开或最小化':'进程在后台，窗口已关闭或隐藏':'主进程未运行'}<button class="text-button" id="calibration-refresh">刷新状态</button></div><p class="calibration-next">${view.visible?'现在可以验证「直接置前」。冷启动需要软件完全退出，后台恢复需要关闭窗口但保留进程。':view.running?'现在可以验证「后台恢复」。若要验证冷启动，请先完整退出目标软件。':'现在可以验证「冷启动」。启幕会重新启动软件并检查窗口。'} 回到向导时会刷新状态，也可点击「刷新状态」。</p><div class="calibration-checks">${(Object.keys(labels) as CalibrationCheck[]).map(key=>{
      const result=view!.report.checks[key],unsupported=key==='background'&&view!.background!=='supported',disabled=key==='background'&&!view!.backgroundEnabled
      const waiting=key==='cold'?view!.running:key==='warm'?!view!.running||view!.visible:key==='foreground'?!view!.visible:false
      const description={cold:view!.running?`请在「${profile.name}」中保存需要保留的文件，再完整退出该软件。这里说的是目标软件中的文件，不是启幕配置。`:'目标软件已退出，可以验证从零启动。启幕不会主动结束目标进程。',warm:view!.visible?'请手动关闭目标窗口并保留后台进程，再回到向导。如果关闭窗口就会退出软件，可跳过此项。':view!.running?'后台进程仍在，可以验证恢复原窗口。':'当前没有后台进程。此项需要关闭窗口后仍在后台运行的软件，可稍后验证或跳过。',foreground:view!.visible?'当前窗口已打开，可以直接验证置前；不会重播启动动画。':'请先打开目标窗口，再回到向导验证置前。',background:unsupported?'当前未获启幕内置适配确认，背景已禁用；仅 Codex 和 WorkBuddy 开放背景。':disabled?'请点击「完成」，到「动画与背景 → 软件背景」启用背景并保存，再回来验证。':'需从启幕冷启动建立接口；验证背景加载，不代表所有页面都适配。'}[key]
      const buttonText=waiting?key==='cold'?'等待软件退出':key==='warm'?'等待后台状态':'等待窗口打开':'验证'+labels[key]
      return `<article class="calibration-check"><div><h3>${labels[key]}<span class="verification ${result?.state||''}">${unsupported?'未支持':result?.state==='passed'?'已验证':result?.state==='failed'?'未通过':'待验证'}</span></h3><p id="calibration-help-${key}">${e(description)}</p>${result?`<p class="check-message">${e(result.message)}<time>${e(new Date(result.at).toLocaleString('zh-CN'))}</time></p>`:''}</div><button class="button secondary" data-test="${key}" aria-describedby="calibration-help-${key}" ${unsupported||disabled||waiting?'disabled':''}>${buttonText}</button></article>`
    }).join('')}</div><p class="muted">记录对应当前配置；修改绑定或媒体设置后需要重新验证。软件更新后建议重新校准。背景加载通过后仍请确认实际视觉效果。</p>`}</div><p class="calibration-message" role="status" aria-live="polite">${busy?'正在处理，请稍候…':''}</p><footer class="dialog-footer">${step===2?'<button class="button secondary" id="calibration-back">重新选择窗口</button>':'<span></span>'}<button class="button subtle" data-close>${step===2?'完成':'暂不校准'}</button>${step===1?`<button class="button primary" id="calibration-bind" ${!selected?'disabled':''}>保存绑定并继续</button>`:''}</footer>`
    dialog.querySelectorAll('[data-close]').forEach(button=>button.addEventListener('click',()=>void close()))
    dialog.querySelector('#calibration-refresh')?.addEventListener('click',()=>void refresh())
    dialog.querySelector('#calibration-back')?.addEventListener('click',()=>{step=1;render()})
    dialog.querySelectorAll<HTMLInputElement>('[name="target-window"]').forEach(input=>input.addEventListener('change',()=>{selected=input.value;render()}))
    dialog.querySelector('#calibration-title')?.addEventListener('input',event=>{title=(event.target as HTMLInputElement).value})
    dialog.querySelector('#calibration-search')?.addEventListener('input',event=>{filter=(event.target as HTMLInputElement).value;const position=(event.target as HTMLInputElement).selectionStart;render();const input=dialog.querySelector<HTMLInputElement>('#calibration-search')!;input.focus();input.setSelectionRange(position,position)})
    dialog.querySelector('#calibration-launch')?.addEventListener('click',()=>void work(async()=>{
      adopt(await window.studio.calibrationLaunch(view!.sessionId))
      for(let index=0;index<8&&!view!.recommended;index++){await new Promise(resolve=>setTimeout(resolve,750));adopt(await window.studio.calibrationRefresh(view!.sessionId))}
    }))
    dialog.querySelector('#calibration-bind')?.addEventListener('click',()=>void work(async()=>{adopt(await window.studio.calibrationBind(view!.sessionId,selected,title));step=2}))
    dialog.querySelectorAll<HTMLElement>('[data-test]').forEach(button=>button.addEventListener('click',()=>void work(async()=>{adopt(await window.studio.calibrationTest(view!.sessionId,button.dataset.test as CalibrationCheck))})))
    if(busy)dialog.querySelectorAll<HTMLButtonElement|HTMLInputElement>('button,input').forEach(control=>control.disabled=true)
    dialog.querySelector('.calibration-body')!.scrollTop=scroll
    const list=dialog.querySelector('.calibration-windows');if(list)list.scrollTop=listScroll
  }
  const onFocus=()=>{if(view&&step===2&&!busy&&!closed)void refresh()}
  window.addEventListener('focus',onFocus)
  dialog.addEventListener('cancel',event=>{event.preventDefault();void close()});dialog.addEventListener('close',()=>{window.removeEventListener('focus',onFocus);dialog.remove()})
  document.body.append(dialog);render();dialog.showModal()
  void work(async()=>{adopt(await window.studio.calibrationBegin(profile.id));if(view!.bound)step=2})
}
