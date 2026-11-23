import type { GalleryTheme } from './catalog'

export const linkedStories: Record<string, { name: string; beats: string[] }> = {
  chatgpt: { name: '振翼引光', beats: ['振翼落地', '掌心聚光', '引光入园', '花园回应'] },
  claude: { name: '书页飞鸟', beats: ['轻启书卷', '文字离页', '纸鸟巡游', '归巢合书'] },
  gemini: { name: '双星共舞', beats: ['拨动双星', '双星追逐', '交汇共鸣', '星图展开'] },
  deepseek: { name: '鲸游潮生', beats: ['指尖点水', '鲸影游近', '跃鲸起浪', '潮汐回落'] },
  doubao: { name: '气泡接力', beats: ['招手迎泡', '指尖轻触', '气泡接力', '花雨回应'] },
  qwen: { name: '挥扇生风', beats: ['提腕展扇', '挥扇引风', '竹叶回旋', '收扇风息'] },
  kimi: { name: '月光牵引', beats: ['托起月光', '星环牵引', '轻浮巡星', '伴月落定'] },
  grok: { name: '战斧回响', beats: ['蓄势提斧', '挥斧破空', '冲击回响', '裂光收束'] },
  seed: { name: '一粒新生', beats: ['掌心育种', '投种入土', '藤蔓开花', '俯身相望'] },
  copilot: { name: '纸翼穿云', beats: ['掌心托翼', '送翼起飞', '穿环引云', '目送归航'] },
  perplexity: { name: '透镜寻星', beats: ['举镜寻光', '追踪星点', '连线成图', '光讯归来'] },
  minimax: { name: '音符共振', beats: ['提腕起拍', '指挥音符', '落音生波', '余韵回落'] }
}
export type Vec = [number, number]
export const clamp = (n: number) => Math.max(0, Math.min(1, n))
export const ease = (a: number, b: number, value: number) => { const p = clamp((value - a) / (b - a)); return p * p * (3 - 2 * p) }
export const pulse = (start: number, peak: number, end: number, p: number) => ease(start, peak, p) * (1 - ease(peak, end, p))
export const mix = (a: number, b: number, t: number) => a + (b - a) * t
export const bezier = (a: Vec, b: Vec, c: Vec, d: Vec, t: number): Vec => { const s = 1 - t; return [s*s*s*a[0]+3*s*s*t*b[0]+3*s*t*t*c[0]+t*t*t*d[0], s*s*s*a[1]+3*s*s*t*b[1]+3*s*t*t*c[1]+t*t*t*d[1]] }
const hands: Record<string, [Vec, Vec]> = {
  chatgpt: [[.82,.28],[.79,.46]], claude: [[.65,.28],[.75,.47]], gemini: [[.83,.31],[.82,.58]],
  deepseek: [[.82,.28],[.84,.58]], doubao: [[.63,.58],[.74,.57]], qwen: [[.60,.30],[.78,.58]],
  kimi: [[.66,.25],[.72,.56]], grok: [[.60,.40],[.78,.67]], seed: [[.70,.29],[.81,.60]],
  copilot: [[.81,.33],[.78,.57]], perplexity: [[.60,.32],[.77,.60]], minimax: [[.58,.32],[.81,.57]]
}
export interface ActorPose { x: number; y: number; lean: number; head: number; handX: number; handY: number; prop: number; wing: number; wind: number }
export function poseAt(model: string, p: number, anime: boolean): ActorPose {
  const ready = ease(0,.16,p), gesture = pulse(.13,.34,.85,p), action = pulse(.28,.49,.81,p), settle = 1-ease(.82,1,p), amplitude=anime?1:.55
  const pose: ActorPose = { x: (1-ready)*.018, y:(1-ready)*.018, lean:Math.sin(p*9)*.012*settle, head:-.055*gesture, handX:-.013*gesture, handY:-.025*gesture, prop:0, wing:0, wind:0 }
  switch(model){
    case 'chatgpt': pose.y=anime?-.065*(1-ready)+Math.sin(p*38)*.003*(1-ready):pose.y;pose.wing=Math.sin(p*48)*.05*(1-ready)+Math.sin(p*13)*.008*settle;pose.wind=pulse(.01,.12,.3,p)*.8;pose.handY=-.04*gesture;pose.head=-.08*action;break
    case 'claude':pose.lean=-.022*gesture;pose.head=.07*gesture-.1*action;pose.handY=-.02*gesture;pose.handX=-.01*Math.sin(p*25)*action;break
    case 'gemini':pose.handX=Math.sin(p*28)*.022*gesture;pose.handY=Math.cos(p*28)*.012*gesture-.02*gesture;pose.head=Math.sin(p*17)*.055*action;pose.wind=.4*action;break
    case 'deepseek':pose.handY=.025*pulse(.15,.28,.4,p);pose.y=-.018*Math.sin(p*15)*action;pose.head=-.06*action;pose.wind=Math.sin(p*18)*action;break
    case 'doubao':pose.handX=Math.sin(p*42)*.022*gesture;pose.handY=-.035*gesture;pose.head=Math.sin(p*23)*.03*gesture;pose.lean=Math.sin(p*19)*.018*action;break
    case 'qwen':pose.prop=Math.sin(p*24)*.2*gesture;pose.handX=Math.sin(p*24)*.032*gesture;pose.handY=-.015*gesture;pose.wind=Math.cos(p*24)*1.3*gesture;pose.head=-.04*gesture;break
    case 'kimi':pose.handY=-.06*gesture;pose.y=-.045*action;pose.head=-.08*gesture;pose.wing=Math.sin(p*15)*.008*action;break
    case 'grok':pose.prop=-.12*pulse(.1,.27,.39,p)+.15*pulse(.27,.38,.53,p);pose.handX=-.02*pulse(.1,.27,.39,p)+.03*pulse(.27,.38,.53,p);pose.lean=-.045*pulse(.1,.27,.39,p)+.035*pulse(.27,.38,.55,p);pose.wind=1.5*pulse(.35,.4,.6,p);break
    case 'seed':pose.handY=-.028*gesture;pose.handX=-.035*pulse(.2,.35,.5,p);pose.lean=-.025*action;pose.head=.13*pulse(.43,.64,.85,p);break
    case 'copilot':pose.handX=-.045*pulse(.18,.33,.46,p);pose.handY=-.03*gesture;pose.head=-.08*action;pose.wind=.7*action;break
    case 'perplexity':pose.handX=Math.sin(p*19)*.02*gesture;pose.handY=-.03*gesture+Math.cos(p*19)*.012*gesture;pose.head=Math.sin(p*15)*.06*action;break
    case 'minimax':pose.handX=Math.sin(p*45)*.02*gesture;pose.handY=(-.035+Math.cos(p*45)*.024)*gesture;pose.prop=Math.sin(p*45)*.15*gesture;pose.head=Math.sin(p*45)*.025*gesture;pose.wind=Math.sin(p*45)*.35*gesture;break
  }
  for(const key of Object.keys(pose) as (keyof ActorPose)[])pose[key]*=amplitude
  return pose
}

export function createActorRig(theme: GalleryTheme, texture: HTMLImageElement, fit: 'cover'|'contain' = 'cover', poseProvider = poseAt) {
  const layer=document.createElement('canvas'), gl=layer.getContext('webgl',{alpha:true,antialias:true,premultipliedAlpha:true,preserveDrawingBuffer:true})
  if(!gl)throw Error('角色联动需要 WebGL')
  const model=theme.id.replace(/-(art|anime)$/,''), anime=theme.id.endsWith('-anime'), eyes=theme.eyes!, face:Vec=[(eyes[0]+eyes[2])*.5,(eyes[1]+eyes[3])*.5]
  const hand:Vec=hands[model][anime?0:1], neck:Vec=[face[0],face[1]+(anime?.09:.18)], hip:Vec=[face[0],anime?.68:.9]
  const gaussian=(u:number,v:number,x:number,y:number,rx:number,ry:number)=>Math.exp(-(((u-x)/rx)**2+((v-y)/ry)**2)*2)
  function weights(u:number,v:number){
    // 扇面与战斧分别绑定持握点，挥动道具时不牵连整张角色贴图。
    const propWeight=!anime?0:model==='grok'?gaussian(u,v,.55,.45,.22,.9):model==='qwen'?gaussian(u,v,.61,.26,.1,.12):0
    return [gaussian(u,v,face[0],face[1],anime?.1:.18,anime?.14:.27),gaussian(u,v,hand[0],hand[1],anime?.12:.16,anime?.14:.22),gaussian(u,v,face[0]-.12,.47,.14,.2),gaussian(u,v,face[0]+.15,.48,.14,.2),propWeight]
  }
  function deform(u:number,v:number,pose:ActorPose,w=weights(u,v)):Vec{
    let x=u,y=v
    const head=pose.head*w[0], hx=x-neck[0],hy=y-neck[1];x=neck[0]+hx*Math.cos(head)-hy*Math.sin(head);y=neck[1]+hx*Math.sin(head)+hy*Math.cos(head)
    x+=pose.handX*w[1];y+=pose.handY*w[1]
    const prop=pose.prop*w[4],px=x-hand[0],py=y-hand[1];x=hand[0]+px*Math.cos(prop)-py*Math.sin(prop);y=hand[1]+px*Math.sin(prop)+py*Math.cos(prop)
    if(model==='chatgpt'&&anime){y+=pose.wing*(w[2]-w[3]*.7);x+=pose.wing*(w[2]*-.3+w[3]*.3)}
    const hair=(1-w[0])*(w[2]+w[3]);x+=pose.wind*.007*hair
    const a=pose.lean,dx=x-hip[0],dy=y-hip[1];return[hip[0]+dx*Math.cos(a)-dy*Math.sin(a)+pose.x,hip[1]+dx*Math.sin(a)+dy*Math.cos(a)+pose.y]
  }
  const program=gl.createProgram()!, shaders:WebGLShader[]=[]
  for(const [type,code] of [[gl.VERTEX_SHADER,'attribute vec2 position,uv;varying vec2 tex;void main(){tex=uv;gl_Position=vec4(position,0.,1.);}'],[gl.FRAGMENT_SHADER,'precision mediump float;varying vec2 tex;uniform sampler2D picture;void main(){vec4 c=texture2D(picture,tex);gl_FragColor=vec4(c.rgb*c.a,c.a);}']] as [number,string][]){const shader=gl.createShader(type)!;gl.shaderSource(shader,code);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(shader)||'角色着色器错误');gl.attachShader(program,shader);shaders.push(shader)}
  gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error('角色网格初始化失败');gl.useProgram(program)
  const columns=64,rows=48,rest:Vec[]=[],skin:number[][]=[],uv:number[]=[],indices:number[]=[]
  for(let y=0;y<=rows;y++)for(let x=0;x<=columns;x++){const u=x/columns,v=y/rows;rest.push([u,v]);skin.push(weights(u,v));uv.push(u,v)}
  for(let y=0;y<rows;y++)for(let x=0;x<columns;x++){const a=y*(columns+1)+x,b=a+1,c=a+columns+1,d=c+1;indices.push(a,b,c,b,d,c)}
  const positions=new Float32Array(rest.length*2), positionBuffer=gl.createBuffer()!,uvBuffer=gl.createBuffer()!,indexBuffer=gl.createBuffer()!,image=gl.createTexture()!
  const positionLocation=gl.getAttribLocation(program,'position'),uvLocation=gl.getAttribLocation(program,'uv')
  gl.bindBuffer(gl.ARRAY_BUFFER,uvBuffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(uv),gl.STATIC_DRAW);gl.enableVertexAttribArray(uvLocation);gl.vertexAttribPointer(uvLocation,2,gl.FLOAT,false,0,0)
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,indexBuffer);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(indices),gl.STATIC_DRAW)
  gl.bindTexture(gl.TEXTURE_2D,image);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,texture)
  let width=1280,height=720
  const project=([u,v]:Vec):Vec=>{const scale=(fit==='contain'?Math.min:Math.max)(width/texture.width,height/texture.height);return[(width-texture.width*scale)/2+u*texture.width*scale,(height-texture.height*scale)/2+v*texture.height*scale]}
  return {
    layer,hand,model,anime,
    draw(p:number,w:number,h:number){width=w;height=h;if(layer.width!==w||layer.height!==h){layer.width=w;layer.height=h}const pose=poseProvider(model,p,anime)
      rest.forEach(([u,v],i)=>{const [x,y]=project(deform(u,v,pose,skin[i]));positions[i*2]=x/w*2-1;positions[i*2+1]=1-y/h*2})
      gl.viewport(0,0,w,h);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.bindBuffer(gl.ARRAY_BUFFER,positionBuffer);gl.bufferData(gl.ARRAY_BUFFER,positions,gl.DYNAMIC_DRAW);gl.enableVertexAttribArray(positionLocation);gl.vertexAttribPointer(positionLocation,2,gl.FLOAT,false,0,0);gl.drawElements(gl.TRIANGLES,indices.length,gl.UNSIGNED_SHORT,0);gl.flush();return pose
    },
    point(point:Vec,p:number){return project(deform(point[0],point[1],poseProvider(model,p,anime)))},
    dispose(){gl.deleteTexture(image);gl.deleteBuffer(positionBuffer);gl.deleteBuffer(uvBuffer);gl.deleteBuffer(indexBuffer);shaders.forEach(s=>gl.deleteShader(s));gl.deleteProgram(program);gl.getExtension('WEBGL_lose_context')?.loseContext();layer.width=layer.height=0}
  }
}
