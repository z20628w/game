// 模拟后端：用 WebSocket 周期性返回"检测到的植物"数据
// 真实场景应在此接收小程序发来的帧数据，跑检测/分类模型后返回 bbox + 物种信息
const WebSocket = require('ws')

// 监听 0.0.0.0，使同一局域网下的真机/预览都能连进来（仅 localhost 则手机连不到）
const wss = new WebSocket.Server({ host: '0.0.0.0', port: 3000 })

// 假数据：真实项目替换为植物识别/检测 API 的结果
const PLANTS = [
  { name: '月季', confidence: 96, info: { family: '蔷薇科蔷薇属', bloom: '5–9 月', light: '喜阳' } },
  { name: '绿萝', confidence: 92, info: { family: '天南星科麒麟叶属', bloom: '少见花', light: '耐阴' } },
  { name: '玉露(多肉)', confidence: 88, info: { family: '阿福花科十二卷属', bloom: '夏季', light: '散射光' } },
  { name: '薄荷', confidence: 90, info: { family: '唇形科薄荷属', bloom: '7–9 月', light: '喜阳' } }
]

wss.on('connection', (ws) => {
  let idx = 0
  // 每 600ms 推一帧"检测结果"，并让框带轻微抖动，看起来像在实时跟踪
  const timer = setInterval(() => {
    if (ws.readyState !== WebSocket.OPEN) return
    const p = PLANTS[idx % PLANTS.length]
    idx++
    const jx = (Math.random() - 0.5) * 0.04
    const jy = (Math.random() - 0.5) * 0.04
    ws.send(JSON.stringify({
      name: p.name,
      confidence: p.confidence,
      info: p.info,
      bbox: { x: 0.30 + jx, y: 0.40 + jy, w: 0.34, h: 0.42 } // 归一化坐标 0~1
    }))
  }, 600)

  ws.on('message', () => {
    // 真实场景：在这里接收并推理帧数据
  })
  ws.on('close', () => clearInterval(timer))
})

console.log('mock plant backend listening on ws://0.0.0.0:3000 (手机用电脑局域网IP访问)')
