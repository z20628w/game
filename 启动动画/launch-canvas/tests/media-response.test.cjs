const test = require('node:test')
const assert = require('node:assert/strict')
const { mkdtemp, writeFile, unlink, rmdir } = require('node:fs/promises')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { parseByteRange, localMediaResponse } = require('../dist/media-response.js')

test('媒体Range支持完整、开放尾部与后缀请求，拒绝越界与无效区间', () => {
  assert.equal(parseByteRange(null, 100), null)
  assert.deepEqual(parseByteRange('bytes=10-19', 100), { start: 10, end: 19 })
  assert.deepEqual(parseByteRange('bytes=90-', 100), { start: 90, end: 99 })
  assert.deepEqual(parseByteRange('bytes=-10', 100), { start: 90, end: 99 })
  assert.deepEqual(parseByteRange('bytes=90-500', 100), { start: 90, end: 99 })
  assert.deepEqual(parseByteRange('bytes=-500', 100), { start: 0, end: 99 })
  for (const header of ['bytes=100-', 'bytes=50-40', 'bytes=-0', 'bytes=-', 'bytes=0-1,4-5', 'other=0-1', 'bytes=999999999999999999999-']) assert.equal(parseByteRange(header, 100), 'invalid')
})

test('实际媒体流只返回请求字节，HEAD不读取正文，越界响应416', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'lc-range-')), file = join(folder, 'sample.mp4')
  await writeFile(file, Buffer.from(Array.from({ length: 100 }, (_, index) => index)))
  try {
    const response = await localMediaResponse(file, new Request('http://local/media', { headers: { Range: 'bytes=10-19' } }), 'video/mp4')
    assert.equal(response.status, 206); assert.equal(response.headers.get('content-range'), 'bytes 10-19/100')
    assert.equal(response.headers.get('content-length'), '10'); assert.equal(response.headers.get('content-type'), 'video/mp4')
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), Buffer.from([10, 11, 12, 13, 14, 15, 16, 17, 18, 19]))
    const head = await localMediaResponse(file, new Request('http://local/media', { method: 'HEAD' }), 'video/mp4')
    assert.equal(head.status, 200); assert.equal(head.headers.get('content-length'), '100'); assert.equal(await head.text(), '')
    const bad = await localMediaResponse(file, new Request('http://local/media', { headers: { Range: 'bytes=100-101' } }), 'video/mp4')
    assert.equal(bad.status, 416); assert.equal(bad.headers.get('content-range'), 'bytes */100')
  } finally { await unlink(file); await rmdir(folder) }
})
