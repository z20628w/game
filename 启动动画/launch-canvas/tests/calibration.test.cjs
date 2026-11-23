const test=require('node:test'),assert=require('node:assert/strict')
const {rankWindows,recommendedWindow,bindingFingerprint,bindableExecutable}=require('../dist/calibration-rules')
const {parseManifest}=require('../dist/domain')
const p={adapter:{kind:'native',executable:'D:\\Apps\\Launch.exe',args:[],title:'',pagePrefix:'',selectors:['#root'],capability:'unavailable'},cold:{enabled:true},warm:{enabled:true},background:{enabled:false}}
const window=(handle,executable,ancestors=[])=>({handle,pid:10+Number(handle),executable,ancestors,title:'测试窗口',windowClass:'Fixture',width:800,height:600})
test('窗口推荐区分精确路径、进程链、安装目录和不相关新窗口',()=>{
  const ranked=rankWindows([window('1','D:\\Elsewhere\\Launch.exe'),window('2','D:\\Apps\\nested\\Main.exe',[55]),window('3','D:\\Apps\\Unrelated.exe')],p,new Set(),55)
  assert.equal(ranked[0].handle,'2');assert.equal(recommendedWindow(ranked),'2');assert.equal(ranked.find(w=>w.handle==='1').score,5)
  assert.equal(recommendedWindow(rankWindows([window('1','D:\\Apps\\Launch.exe'),window('2','D:\\Apps\\Launch.exe')],p,new Set())),undefined)
  assert.equal(recommendedWindow(rankWindows([window('1','D:\\Apps\\Main.exe')],p,new Set())),undefined)
})
test('配置指纹忽略组名但随绑定、动画和背景变更失效',()=>{
  const same=structuredClone(p);same.name='重命名';assert.equal(bindingFingerprint(same),bindingFingerprint(p))
  for(const change of [q=>q.adapter.windowClass='Other',q=>q.adapter.windowExecutable='D:\\Other.exe',q=>q.warm.enabled=false,q=>q.background.enabled=true]){const q=structuredClone(p);change(q);assert.notEqual(bindingFingerprint(q),bindingFingerprint(p))}
})
test('校准规则导入导出支持窗口类型，排除启幕自己与系统桌面宿主',()=>{
  assert.equal(parseManifest({version:1,name:'示例',executable:'App.exe',windowClass:'MainWindow'},'D:\\Apps\\adapter.json').adapter.windowClass,'MainWindow')
  assert.throws(()=>parseManifest({version:1,name:'示例',executable:'App.exe',windowClass:5},'D:\\Apps\\adapter.json'))
  assert.equal(bindableExecutable('C:\\Windows\\explorer.exe','D:\\LaunchCanvas.exe'),false)
  assert.equal(bindableExecutable('D:\\LAUNCHCANVAS.EXE','D:\\LaunchCanvas.exe'),false)
  assert.equal(bindableExecutable('D:\\Apps\\App.exe','D:\\LaunchCanvas.exe'),true)
})
