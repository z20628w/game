// 后端地址：真机/预览必须用电脑的「局域网 IP」，localhost 在手机上指向手机自己。
// 已填入本机 WLAN 的 IPv4（ipconfig 查到的）：192.168.110.254。若手机连不上，重新 ipconfig 核对此地址。
// 后端监听 0.0.0.0，模拟器里用这个 IP 也能连。
// 需在微信开发者工具 → 详情 → 本地设置 → 勾选「不校验合法域名、web-view、TLS 版本以及 HTTPS 证书」。
const BACKEND_WS = 'ws://192.168.110.254:3000'

Page({
  data: {
    hasResult: false,
    statusText: '初始化中…',
    result: null,
    tagText: '',
    boxStyle: '',
    tagStyle: '',
    infoStyle: '',
    boxCoord: ''          // 框在原始照片上的坐标信息，便于查看/二次使用
  },

  onLoad() {
    const info = (wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync())
    this.screenW = info.windowWidth
    this.screenH = info.windowHeight
    this.wsOpen = false
    this.stopped = false

    this.seedResult()        // 先放一个示例框，保证界面可见
    this.connectBackend()    // 连接真实检测后端
    this.startCamera()       // 开启摄像头 + 抽帧送后端
  },

  onUnload() {
    this.stopped = true
    if (this.socket) this.socket.close()
  },

  // 未连后端时的示例数据，让叠加层先显示出来
  seedResult() {
    this.applyResult({
      name: '示例·演示',
      confidence: 0,
      info: { family: '—', bloom: '—', light: '—' },
      bbox: { x: 0.30, y: 0.40, w: 0.34, h: 0.42 }
    })
    this.setData({ statusText: '演示模式（未连接后端）' })
  },

  connectBackend() {
    console.log('[ws] connecting to', BACKEND_WS)
    const socket = wx.connectSocket({
      url: BACKEND_WS,
      fail: (err) => {
        console.error('[ws] connectSocket fail:', err)
        this.setData({ statusText: '后端连接失败，演示模式' })
      }
    })
    this.socket = socket

    socket.onOpen(() => {
      console.log('[ws] opened')
      this.wsOpen = true
      this.setData({ statusText: '已连接 · 实时识别中' })
    })
    socket.onMessage((res) => {
      try {
        const msg = JSON.parse(res.data)
        if (msg && 'bbox' in msg) {
          this.applyResult(msg)        // bbox=null 时自动隐藏框
        }
      } catch (e) {
        console.warn('[ws] parse error', e, res.data)
      }
    })
    socket.onError((err) => {
      console.error('[ws] error:', err)
      this.wsOpen = false
      this.setData({ statusText: '后端连接失败，演示模式' })
    })
    socket.onClose((res) => {
      console.log('[ws] closed:', res)
      this.wsOpen = false
      this.setData({ statusText: '后端已断开，演示模式' })
    })
  },

  // 用 takePhoto 真取一帧 → 读成 ArrayBuffer → 通过 WebSocket 发给后端做检测
  startCamera() {
    this.cam = wx.createCameraContext()
    this.shootLoop()
  },

  shootLoop() {
    if (this.stopped) return
    if (!this.wsOpen) {
      setTimeout(() => this.shootLoop(), 500)
      return
    }
    this.cam.takePhoto({
      quality: 'low',
      success: (res) => {
        wx.getFileSystemManager().readFile({
          filePath: res.tempImagePath,
          success: (r) => {
            if (this.wsOpen && r.data) {
              this.socket.send({ data: r.data })   // 真实 JPEG 帧（ArrayBuffer）
            }
          }
        })
      },
      complete: () => {
        setTimeout(() => this.shootLoop(), 400)      // 约每 400ms 取一帧
      }
    })
  },

  // 把后端返回的归一化框(0~1)换算成屏幕像素，并生成叠加层样式。
  // 关键：摄像头预览是 object-fit: cover（裁剪填满全屏），而 takePhoto 是原始比例照片，
  // 两者比例不同，必须按 cover 的缩放/裁剪规则把「照片坐标」映射到「屏幕坐标」，框才不漂移。
  applyResult(msg) {
    if (!msg.bbox) {                  // 画面中没检测到物体 → 隐藏框
      this.setData({ hasResult: false, statusText: '未检测到植物' })
      return
    }
    const sw = this.screenW
    const sh = this.screenH
    const b = msg.bbox
    // 原始照片尺寸（后端解码 takePhoto 得到的 JPEG 尺寸）
    const pw = msg.img_w || Math.round(sw * 0.75)   // 未知时按 3:4 兜底
    const ph = msg.img_h || sw
    // cover 变换：先求统一缩放比，再求溢出裁剪偏移（与微信 camera 预览行为一致）
    const scale = Math.max(sw / pw, sh / ph)
    const dw = pw * scale
    const dh = ph * scale
    const offX = (dw - sw) / 2
    const offY = (dh - sh) / 2
    // 照片归一化坐标 → 屏幕像素
    const x = Math.round(b.x * pw * scale - offX)
    const y = Math.round(b.y * ph * scale - offY)
    const w = Math.round(b.w * pw * scale)
    const h = Math.round(b.h * ph * scale)
    const tagY = Math.max(0, y - 24)

    // 信息卡默认放框右侧，超出屏幕则放左侧
    const iw = 170
    let ix = x + w + 8
    if (ix + iw > sw) ix = x - iw - 8
    if (ix < 0) ix = Math.min(sw - iw - 8, x + 8)
    const iy = y

    const tagText = msg.confidence
      ? msg.name + ' ' + msg.confidence + '%'
      : msg.name

    // 框在原始照片上的坐标信息（px 为像素，bbox 为归一化）
    const boxCoord = msg.px
      ? ('原图 ' + pw + '×' + ph + ' | 框 ' + msg.px.join(','))
      : ''

    this.setData({
      hasResult: true,
      result: msg,
      tagText,
      boxCoord,
      boxStyle: 'left:' + x + 'px;top:' + y + 'px;width:' + w + 'px;height:' + h + 'px;',
      tagStyle: 'left:' + x + 'px;top:' + tagY + 'px;',
      infoStyle: 'left:' + ix + 'px;top:' + iy + 'px;width:' + iw + 'px;'
    })
  },

  onCameraError() {
    this.setData({ statusText: '摄像头打开失败，请检查权限' })
  }
})
