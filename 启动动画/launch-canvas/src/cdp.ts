export interface Target { id: string; type: string; url: string; webSocketDebuggerUrl: string }
export interface CDP { call(method: string, params?: Record<string, unknown>, timeout?: number): Promise<any>; close(): void }
export async function connect(url: string): Promise<CDP> {
  const parsed = new URL(url)
  if (parsed.protocol !== 'ws:' || parsed.hostname !== '127.0.0.1') throw Error('拒绝非本机调试地址')
  const socket = new WebSocket(url), pending = new Map<number, { resolve: (value: any) => void; reject: (reason: Error) => void; timer: ReturnType<typeof setTimeout> }>()
  let serial = 0
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => { socket.close(); reject(Error('页面连接超时')) }, 4000)
    socket.addEventListener('open', () => { clearTimeout(timer); resolve() }, { once: true })
    socket.addEventListener('error', () => { clearTimeout(timer); reject(Error('页面连接失败')) }, { once: true })
  })
  socket.addEventListener('message', event => {
    const message = JSON.parse(String(event.data)), entry = pending.get(message.id)
    if (!entry) return
    pending.delete(message.id); clearTimeout(entry.timer)
    if (message.error) entry.reject(Error(message.error.message)); else entry.resolve(message.result)
  })
  socket.addEventListener('close', () => { for (const entry of pending.values()) { clearTimeout(entry.timer); entry.reject(Error('页面连接关闭')) } pending.clear() })
  return { call(method, params = {}, timeout = 6000) { return new Promise((resolve, reject) => { const id = ++serial; const timer = setTimeout(() => { pending.delete(id); reject(Error(method + ' 超时')) }, timeout); pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params })) }) }, close() { socket.close() } }
}
export function selectPage(targets: Target[], prefix: string): Target | undefined {
  const candidates = targets.filter(target => {
    if (target.type !== 'page' || !/^(app|file):\/\//.test(target.url)) return false
    const url = new URL(target.url), route = url.searchParams.get('initialRoute') ?? ''
    return (!prefix || target.url.startsWith(prefix)) && !/avatar|spotlight|quick.chat|detached|popover|notification/i.test(route)
  })
  if (candidates.length > 1) throw Error('找到多个应用页面，请在适配配置中填写更精确的 pagePrefix')
  return candidates[0]
}
