const os = require('os')
const WebSocket = require('ws')

const PORT = 3000

function getLanIps() {
  const list = []
  const interfaces = os.networkInterfaces()
  for (const name in interfaces) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        list.push({ name, address: iface.address, cidr: iface.cidr })
      }
    }
  }
  return list
}

function testWs(url, label) {
  return new Promise((resolve) => {
    process.stdout.write(`  test ${label}: ${url} ... `)
    const ws = new WebSocket(url)
    const timer = setTimeout(() => {
      console.log('TIMEOUT')
      try { ws.terminate() } catch (e) {}
      resolve(false)
    }, 4000)

    ws.on('open', () => {
      clearTimeout(timer)
      console.log('OK')
      try { ws.close() } catch (e) {}
      resolve(true)
    })
    ws.on('error', (err) => {
      clearTimeout(timer)
      console.log('FAIL (' + err.message + ')')
      resolve(false)
    })
    ws.on('close', () => {
      clearTimeout(timer)
    })
  })
}

async function main() {
  console.log('--- WebSocket 连通性诊断 ---')
  console.log('')

  const ips = getLanIps()
  console.log('本机所有 IPv4 网卡：')
  ips.forEach((ip) => {
    console.log(`  ${ip.name}: ${ip.address} (${ip.cidr})`)
  })
  if (ips.length === 0) {
    console.log('  未找到任何非内网 IPv4 网卡，请检查网络连接。')
    return
  }

  console.log('')
  console.log(`检测端口 ${PORT} 是否被监听：`)
  try {
    const netstat = require('child_process').execSync(
      `netstat -ano | findstr ":${PORT}"`,
      { encoding: 'utf8', windowsHide: true }
    )
    console.log(netstat.split('\n').filter(Boolean).map((s) => '  ' + s.trim()).join('\n'))
  } catch (e) {
    console.log('  无法执行 netstat（可能没有任何进程监听该端口）')
  }

  console.log('')
  console.log('测试能否从本机连到后端：')
  let anyOk = false
  anyOk = (await testWs(`ws://127.0.0.1:${PORT}`, 'localhost')) || anyOk
  anyOk = (await testWs(`ws://localhost:${PORT}`, 'localhost(alias)')) || anyOk
  for (const ip of ips) {
    anyOk = (await testWs(`ws://${ip.address}:${PORT}`, `LAN-${ip.name}`)) || anyOk
  }

  console.log('')
  if (!anyOk) {
    console.log('结论：本机完全连不上 ws://...:3000，说明后端根本没运行，')
    console.log('      或后端没有监听 0.0.0.0:3000。')
    console.log('解决：先 cd server  &&  npm start   （或 cd server-py  &&  python detect_server.py）')
  } else {
    console.log('结论：本机可以连通。若真机仍失败，大概率是以下之一：')
    console.log('  1. 手机和电脑不在同一 Wi-Fi / 不同子网')
    console.log('  2. Windows 防火墙拦截了 3000 端口的入站连接')
    console.log('  3. 代码里填写的 IP 不是手机能到达的网段')
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
