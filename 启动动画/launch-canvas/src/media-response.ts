import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { Readable } from 'node:stream'

export function parseByteRange(header: string | null, size: number): { start: number; end: number } | null | 'invalid' {
  if (!header) return null
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!match || (!match[1] && !match[2]) || size <= 0) return 'invalid'
  const first = match[1] ? Number(match[1]) : 0, last = match[2] ? Number(match[2]) : size - 1
  if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last)) return 'invalid'
  const start = match[1] ? first : Math.max(0, size - last), end = match[1] ? Math.min(last, size - 1) : size - 1
  return start >= size || end < start || (!match[1] && last === 0) ? 'invalid' : { start, end }
}

/** Chromium 的 file: fetch 不保留 Range 响应，自定义媒体协议需明确返回字节区间。 */
export async function localMediaResponse(file: string, request: Request, contentType: string): Promise<Response> {
  const info = await stat(file)
  if (!info.isFile()) return new Response('Not found', { status: 404 })
  const headers = new Headers({ 'Content-Type': contentType, 'Accept-Ranges': 'bytes' })
  const range = parseByteRange(request.headers.get('range'), info.size)
  if (range === 'invalid') { headers.set('Content-Range', `bytes */${info.size}`); return new Response(null, { status: 416, headers }) }
  const size = range ? range.end - range.start + 1 : info.size
  headers.set('Content-Length', String(size))
  if (range) headers.set('Content-Range', `bytes ${range.start}-${range.end}/${info.size}`)
  const response = { status: range ? 206 : 200, headers }
  if (request.method === 'HEAD' || !size) return new Response(null, response)
  const stream = createReadStream(file, range || undefined)
  const abort = () => stream.destroy()
  request.signal.addEventListener('abort', abort, { once: true })
  stream.once('close', () => request.signal.removeEventListener('abort', abort))
  if (request.signal.aborted) abort()
  return new Response(Readable.toWeb(stream) as ReadableStream<Uint8Array>, response)
}
