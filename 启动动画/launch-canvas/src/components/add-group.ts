import { escapeHTML as e, icon, toast } from '../ui'
import { newProfile, type ScanResult, type Profile } from '../shared'
export function openAddGroup(onCreate: (profile: Profile) => Promise<void>, options: { title?: string; submit?: string; path?: string; name?: string } = {}) {
  const dialog = document.createElement('dialog'); dialog.className = 'add-dialog'
  dialog.innerHTML = `<div class="dialog-top"><div><span class="eyebrow">NEW APPLICATION</span><h2>添加一个软件</h2></div><button class="icon-button" data-close aria-label="关闭">${icon('close')}</button></div><p class="muted">选择安装目录，启幕会识别主程序和可配置能力。</p><div class="path-row"><input id="install-path" placeholder="粘贴安装目录，例如 D:\\Apps\\Codex" aria-label="软件安装目录"><button class="button secondary" id="scan-path">检测</button></div><div class="import-options"><button class="button" id="pick-folder">${icon('folder')}选择安装目录</button><button class="button subtle" id="pick-exe">选择 EXE</button><button class="button subtle" id="pick-manifest">导入适配配置</button></div><div id="scan-result"><div class="scan-empty">${icon('search', 32)}<strong>先找到软件，再配置它的开场</strong><span>检测只读取文件，不修改软件安装目录。</span></div></div><footer class="dialog-footer"><button class="button subtle" data-close>取消</button><button class="button primary" id="create-group" disabled>创建软件组 ${icon('arrow', 16)}</button></footer>`
  document.body.append(dialog); dialog.showModal()
  let result: ScanResult | null = null, busy = false
  const output = dialog.querySelector<HTMLElement>('#scan-result')!, create = dialog.querySelector<HTMLButtonElement>('#create-group')!
  if (options.title) dialog.querySelector('h2')!.textContent = options.title
  if (options.submit) create.textContent = options.submit
  if (options.path) dialog.querySelector<HTMLInputElement>('#install-path')!.value = options.path
  const close = () => { if (!busy) dialog.close() }
  dialog.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', close))
  dialog.addEventListener('cancel', event => { if (busy) event.preventDefault() })
  dialog.addEventListener('close', () => dialog.remove())
  async function scan(action: () => Promise<ScanResult | null>) {
    if (busy) return
    busy = true; output.innerHTML = '<div class="scan-empty"><span class="spinner"></span><strong>正在识别软件与框架…</strong><span>只读取安装目录，不运行软件。</span></div>'; create.disabled = true
    try {
      result = await action()
      if (!result) { output.innerHTML = '<div class="scan-empty">已取消选择，可以重新选择目录。</div>'; return }
      const supported = result.adapter.capability === 'supported', candidate = result.adapter.capability === 'candidate'
      output.innerHTML = `<div class="scan-found"><div class="scan-status">${icon('check')} 已找到主程序 <span>${e(result.adapter.kind === 'native' ? 'Windows 应用' : 'Electron')}</span></div><label class="field">软件组名称<input id="group-name" value="${e(result.suggestedName)}" maxlength="64"></label><label class="field">主程序<select id="candidate-exe">${result.candidates.map(path => `<option value="${e(path)}">${e(path)}</option>`).join('')}</select></label><div class="capability-grid"><div>${icon('check')}启动动画<strong>待校准验证</strong></div><div>${icon(supported ? 'check' : 'info')}内部背景<strong>${supported ? '已确认适配' : '已禁用'}</strong></div></div><ul class="evidence">${result.adapter.evidence.map(line => `<li>${e(line)}</li>`).join('')}</ul><details><summary>查看文件检测与绑定方式</summary><div class="file-list">${result.adapter.files.map(file => `<div><b>${e(file.purpose)}</b><code>${e(file.path)}</code><span>${e(file.action)}</span></div>`).join('')}</div></details></div>`
      dialog.querySelector('#candidate-exe')!.addEventListener('change', event => { const path = (event.target as HTMLSelectElement).value; void scan(() => window.studio.scan(path)) })
      create.disabled = false
      if (options.name) dialog.querySelector<HTMLInputElement>('#group-name')!.value = options.name
    } catch (error) { result = null; output.innerHTML = `<div class="scan-error">${icon('info')}<p>${e((error as Error).message)}</p></div>` } finally { busy = false }
  }
  dialog.querySelector('#scan-path')!.addEventListener('click', () => { const path = dialog.querySelector<HTMLInputElement>('#install-path')!.value.trim(); if (!path) { toast('请填写安装目录'); return } void scan(() => window.studio.scan(path)) })
  dialog.querySelector('#pick-folder')!.addEventListener('click', () => void scan(() => window.studio.scan()))
  dialog.querySelector('#pick-exe')!.addEventListener('click', () => void scan(() => window.studio.chooseExecutable()))
  dialog.querySelector('#pick-manifest')!.addEventListener('click', () => void scan(() => window.studio.importAdapter()))
  create.addEventListener('click', async () => { if (!result || busy) return; busy = true; create.disabled = true; try { const name = dialog.querySelector<HTMLInputElement>('#group-name')!.value; await onCreate(newProfile(result.adapter, name)); dialog.close() } catch (error) { toast((error as Error).message, true) } finally { busy = false; create.disabled = false } })
}
