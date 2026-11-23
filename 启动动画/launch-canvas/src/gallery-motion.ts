import type { GalleryTheme } from './catalog'
import { createWarmScene } from './warm-motion'
import { createColdCinematic } from './cold-cinematics'
export interface GallerySpec { theme: GalleryTheme; mode: 'cold' | 'warm' | 'background'; durationMs: number; imageURL?: string; closedURL?: string; actorURL?: string; stageURL?: string; opacity?: number; fit?: 'cover' | 'contain'; handoff?: GallerySpec }
// 播放器与宿主背景共用同一渲染器，转场前后保持取景和人物尺寸一致。
interface GalleryScene {
  ready: Promise<boolean>; dispose(): void; play(): void; pause(): void; setStrength(value: number): void; seek(time: number): void
  status(): { ready: boolean; active: boolean; paused: boolean; frames: number; seconds: number }
}
export function createGalleryScene(spec: GallerySpec, surface?: HTMLCanvasElement): GalleryScene {
  const canvas = surface || document.createElement('canvas'); canvas.id = 'aemeath-living-wallpaper'
  canvas.style.cssText = `position:fixed;left:var(--player-client-x,0px);top:var(--player-client-y,0px);width:var(--player-client-width,100%);height:var(--player-client-height,100%);pointer-events:none;z-index:0;opacity:${(spec.opacity ?? 100)/100}`
  canvas.setAttribute('aria-hidden','true'); if (!surface) document.body.prepend(canvas)
  const reduced = matchMedia('(prefers-reduced-motion: reduce)')
  let frame=0, seconds=0, last=0, started=!surface&&spec.mode==='background', disposed=false, loaded=false, frames=0
  const smooth = (a:number,b:number,x:number) => { const p=Math.max(0,Math.min(1,(x-a)/(b-a))); return p*p*(3-2*p) }
  let draw: (time:number)=>void = ()=>{}, release = ()=>{}
  const resize = () => { const style=document.documentElement.style,width=parseFloat(style.getPropertyValue('--player-client-width'))||innerWidth,height=parseFloat(style.getPropertyValue('--player-client-height'))||innerHeight;const scale=Math.min(devicePixelRatio||1,1.5,1500/width); canvas.width=Math.max(1,Math.round(width*scale)); canvas.height=Math.max(1,Math.round(height*scale)); if(loaded) draw(seconds) }
  resize()
  const ready = (async () => {
    if (spec.mode === 'warm') {
      const source=document.createElement('canvas'),backdrop=createGalleryScene({...spec,mode:'background',opacity:100,handoff:undefined},source)
      let destination:GalleryScene|undefined,interaction:Awaited<ReturnType<typeof createWarmScene>>|undefined
      release=()=>{interaction?.dispose();destination?.dispose();backdrop.dispose()}
      await backdrop.ready;backdrop.seek(0)
      const target=spec.handoff?document.createElement('canvas'):source
      if(spec.handoff){destination=createGalleryScene({...spec.handoff,mode:'background',opacity:100,handoff:undefined},target);await destination.ready;destination.seek(0)}
      if(disposed){release();return false}
      interaction=await createWarmScene(canvas,source,spec)
      if(disposed){release();return false}
      draw=time=>{const t=reduced.matches?spec.durationMs/1000:time;interaction!.draw(t);if(destination){const p=smooth(.65,1,t*1000/spec.durationMs),ctx=canvas.getContext('2d')!;ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=p;ctx.drawImage(target,0,0,canvas.width,canvas.height);ctx.restore()}}
    } else if (spec.mode === 'cold') {
      const source=document.createElement('canvas'),backdrop=createGalleryScene({...spec,mode:'background',opacity:100,handoff:undefined},source)
      release=()=>backdrop.dispose()
      if(!await backdrop.ready||disposed){backdrop.dispose();return false}
      backdrop.seek(0)
      const cinematic=createColdCinematic(canvas,source,spec)
      draw=time=>cinematic.draw(reduced.matches?spec.durationMs/1000:time)
      release=()=>{cinematic.dispose();backdrop.dispose()}
    } else if (spec.imageURL) {
      const gl=canvas.getContext('webgl',{alpha:false,antialias:false,preserveDrawingBuffer:true,powerPreference:'low-power'})
      if(!gl) throw Error('人物动画需要 WebGL，请启用硬件加速')
      const image=new Image(), closedImage=new Image()
      await Promise.all([[image,spec.imageURL],[closedImage,spec.closedURL||spec.imageURL]].map(([entry,url])=>new Promise<void>((resolve,reject)=>{const picture=entry as HTMLImageElement;picture.onload=()=>resolve();picture.onerror=()=>reject(Error('图库人物素材加载失败'));picture.src=url as string})))
      if(disposed)return false
      const program=gl.createProgram()!, shaders:WebGLShader[]=[]
      const shader=(type:number,source:string)=>{const s=gl.createShader(type)!;gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s)||'着色器失败');gl.attachShader(program,s);shaders.push(s)}
      shader(gl.VERTEX_SHADER,`attribute vec2 position;varying vec2 uv;void main(){uv=vec2((position.x+1.)*.5,(1.-position.y)*.5);gl_Position=vec4(position,0.,1.);}`)
      shader(gl.FRAGMENT_SHADER,`precision mediump float;varying vec2 uv;uniform sampler2D picture,closedPicture;uniform vec2 viewSize,imageSize,eyeSize;uniform vec4 eyes;uniform float time,opening,reveal,contain;
        float mask(vec2 p,vec2 c,vec2 r){return 1.-smoothstep(.6,1.,length((p-c)/r));}
        vec3 eye(vec2 p,vec2 c,vec3 color){vec2 d=p-c;float slope=(eyes.w-eyes.y)/max(.01,eyes.z-eyes.x);d.y-=slope*d.x;float m=1.-smoothstep(.72,1.,length(d/(eyeSize*vec2(1.25,1.6))));
          vec2 q=p;q.y=c.y+slope*d.x+d.y/(.55+.45*opening);vec3 compressed=texture2D(picture,q).rgb;
          vec3 closed=texture2D(closedPicture,p).rgb;return mix(color,mix(closed,compressed,opening),m);
        }
        void main(){float cover=max(viewSize.x/imageSize.x,viewSize.y/imageSize.y);float fit=min(viewSize.x/imageSize.x,viewSize.y/imageSize.y);float s=mix(cover,fit,contain);vec2 p=(uv*viewSize-(viewSize-imageSize*s)*.5)/(imageSize*s);if(p.x<0.||p.y<0.||p.x>1.||p.y>1.){gl_FragColor=vec4(.035,.05,.08,1.);return;}
          vec2 face=vec2((eyes.x+eyes.z)*.5,(eyes.y+eyes.w)*.5);float noFace=1.-mask(p,face,vec2(.11,.13));float hair=mask(p,vec2(face.x,face.y+.22),vec2(.24,.48))*noFace;vec2 q=p;q.x+=hair*sin(time*1.05+p.y*14.)*.0022*smoothstep(0.,1.,time);q.y+=hair*sin(time*.7+p.x*12.)*.0006;
          vec3 color=texture2D(picture,q).rgb;color=eye(p,eyes.xy,color);color=eye(p,eyes.zw,color);
          float glow=0.;for(int i=0;i<24;i++){float f=float(i);vec2 c=vec2(fract(sin(f*78.21)*431.5),fract(f*.317-time*.014));float d=length((uv-c)*vec2(viewSize.x/viewSize.y,1.));glow+=.000018/(d*d+.00004)*(.45+.55*sin(f+time));}
          color+=vec3(.17,.19,.21)*glow;float sweep=exp(-pow((uv.x-reveal*1.6+.3)*9.,2.))*(1.-reveal);color+=sweep*.32;gl_FragColor=vec4(color*(.35+.65*reveal),1.);
        }`)
      gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error('人物动画初始化失败')
      gl.useProgram(program);const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW)
      const position=gl.getAttribLocation(program,'position');gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0)
      const textures=[image,closedImage].map((picture,index)=>{const texture=gl.createTexture();gl.activeTexture(gl.TEXTURE0+index);gl.bindTexture(gl.TEXTURE_2D,texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGB,gl.RGB,gl.UNSIGNED_BYTE,picture);gl.uniform1i(gl.getUniformLocation(program,index?'closedPicture':'picture'),index);return texture})
      const uniform=(name:string)=>gl.getUniformLocation(program,name)
      const uTime=uniform('time'),uOpen=uniform('opening'),uReveal=uniform('reveal'),uView=uniform('viewSize')
      gl.uniform2f(uniform('imageSize'),image.width,image.height);gl.uniform4fv(uniform('eyes'),spec.theme.eyes||[.68,.2,.72,.2]);gl.uniform2fv(uniform('eyeSize'),spec.theme.eyeSize||[.02,.02]);gl.uniform1f(uniform('contain'),spec.fit==='contain'?1:0)
      draw=time=>{gl.viewport(0,0,canvas.width,canvas.height);gl.uniform2f(uView,canvas.width,canvas.height);gl.uniform1f(uTime,time);const progress=time/(spec.durationMs/1000);const phase=time%5.4;const blink=smooth(4.7,4.81,phase)*(1-smooth(4.9,5.08,phase));const opening=spec.mode==='warm'?smooth(.12,.78,progress):1-blink;gl.uniform1f(uOpen,reduced.matches?1:opening);gl.uniform1f(uReveal,1);gl.drawArrays(gl.TRIANGLES,0,6);gl.flush()}
      release=()=>{textures.forEach(texture=>gl.deleteTexture(texture));gl.deleteBuffer(buffer);shaders.forEach(s=>gl.deleteShader(s));gl.deleteProgram(program);gl.getExtension('WEBGL_lose_context')?.loseContext()}
    } else {
      const ctx=canvas.getContext('2d')!;if(!ctx)throw Error('场景画布不可用')
      const [dark,light,accent]=spec.theme.colors, effect=spec.theme.effect
      const dot=(x:number,y:number,r:number,color:string)=>{ctx.fillStyle=color;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill()}
      const mountain=(base:number,height:number,color:string,seed:number)=>{ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(0,720);for(let x=0;x<=1280;x+=8)ctx.lineTo(x,base-Math.sin(x*.004+seed)*height-Math.sin(x*.011+seed)*height*.35);ctx.lineTo(1280,720);ctx.fill()}
      draw=time=>{
        ctx.setTransform(canvas.width/1280,0,0,canvas.height/720,0,0);ctx.globalAlpha=1
        const gradient=ctx.createLinearGradient(0,0,0,720);gradient.addColorStop(0,dark);gradient.addColorStop(1,effect==='ink'?'#f4f0e6':'#172b40');ctx.fillStyle=gradient;ctx.fillRect(0,0,1280,720)
        if(effect!=='ink')for(let i=0;i<90;i++){ctx.globalAlpha=.18+.35*(1+Math.sin(time*.7+i));dot((i*137.37)%1280,(i*73.23)%530,.5+(i%3)*.5,light)}
        ctx.globalAlpha=1
        if(effect==='aurora'){
          for(let band=0;band<3;band++)for(let i=0;i<32;i++){ctx.beginPath();for(let x=0;x<=1280;x+=12){const y=150+band*60+Math.sin(x*.004+time*.18+band)*90+i*3; x?ctx.lineTo(x,y):ctx.moveTo(x,y)}ctx.strokeStyle=band%2?accent:light;ctx.globalAlpha=.015*(1-i/38);ctx.lineWidth=7;ctx.stroke()}
          ctx.globalAlpha=1;mountain(560,100,'#283d55',1);mountain(635,58,'#102330',3)
        } else if(effect==='ocean'){
          dot(860,190,64,accent);for(let i=0;i<65;i++){const y=400+i*5;ctx.strokeStyle=light;ctx.globalAlpha=.1+i*.004;ctx.beginPath();for(let x=0;x<1280;x+=12){const py=y+Math.sin(x*.013-time*.7+i)*(.5+i*.14);x?ctx.lineTo(x,py):ctx.moveTo(x,py)}ctx.stroke()}ctx.globalAlpha=.28;for(let i=0;i<45;i++){const x=860+Math.sin(i*9)*i*3;ctx.fillStyle=accent;ctx.fillRect(x,410+i*6,10+i*.8,1.5)}
        } else if(effect==='city'){
          dot(960,160,80,'#332947');for(let layer=0;layer<3;layer++)for(let i=0;i<22;i++){const x=i*65+layer*16,h=60+(Math.sin(i*13+layer)*.5+.5)*200;ctx.fillStyle=['#14263c','#15213b','#0a1429'][layer];ctx.globalAlpha=1;ctx.fillRect(x,550-h+layer*28,48,h);for(let row=0;row<h/14;row++)for(let col=0;col<3;col++){ctx.globalAlpha=(Math.sin(i+row+time*.2)>-.4)?.7:.15;ctx.fillStyle=i%2?light:accent;ctx.fillRect(x+8+col*12,555-h+layer*28+row*14,3,5)}}
          ctx.strokeStyle=light;ctx.globalAlpha=.24;for(let i=0;i<100;i++){let x=(i*97)%1280,y=(i*43+time*160)%720;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-12,y+34);ctx.stroke()}
        } else if(effect==='orbit'){
          const g=ctx.createRadialGradient(760,330,10,790,350,145);g.addColorStop(0,accent);g.addColorStop(.6,light);g.addColorStop(1,'#252b50');ctx.fillStyle=g;ctx.beginPath();ctx.arc(790,350,145,0,Math.PI*2);ctx.fill();ctx.save();ctx.translate(790,350);ctx.rotate(-.3);for(let i=0;i<5;i++){ctx.strokeStyle=i%2?light:accent;ctx.globalAlpha=.3;ctx.lineWidth=1+i;ctx.beginPath();ctx.ellipse(0,0,240+i*8,70+i*5,0,0,Math.PI*2);ctx.stroke()}ctx.restore();ctx.globalAlpha=.9;dot(790+Math.cos(time*.2)*280,350+Math.sin(time*.2)*120,9,accent)
        } else if(effect==='ink'){
          dot(920,160,46,accent);mountain(390,90,'#a3b3ad',2);mountain(490,110,'#7f9690',4);mountain(600,90,'#526d6b',1);for(let i=0;i<5;i++){ctx.strokeStyle=light;ctx.lineWidth=2;ctx.beginPath();let x=(time*18+i*51)%1500-100,y=160+Math.sin(i)*30;ctx.moveTo(x-9,y);ctx.quadraticCurveTo(x-3,y-6-Math.sin(time*3)*3,x,y);ctx.quadraticCurveTo(x+3,y-6-Math.sin(time*3)*3,x+9,y);ctx.stroke()}
        } else if(effect==='forest'){
          for(let i=0;i<30;i++){const x=i*51,h=190+(i%5)*45;ctx.fillStyle=i%2?'#173e3b':'#0a292d';ctx.beginPath();ctx.moveTo(x,610-h);ctx.lineTo(x-65,650);ctx.lineTo(x+75,650);ctx.fill();ctx.fillStyle='#163435';ctx.fillRect(x-4,500,8,220)}for(let i=0;i<50;i++){ctx.globalAlpha=.3+.7*Math.pow(Math.sin(time+i),2);dot((i*129+Math.sin(time*.3+i)*12)%1280,350+(i*53)%340+Math.sin(time+i)*12,1.5,light)}
        } else if(effect==='sakura'){
          dot(920,170,68,accent);mountain(580,50,'#443449',1);ctx.strokeStyle='#4f3446';ctx.lineCap='round';for(let b=0;b<9;b++){ctx.lineWidth=14-b;ctx.beginPath();ctx.moveTo(1280,600);ctx.quadraticCurveTo(1150-b*20,180+b*25,680+b*65,90+b*18);ctx.stroke();for(let j=0;j<18;j++){dot(760+b*51+Math.sin(j*7)*90,100+b*20+Math.cos(j*3)*45,4+j%4,j%2?light:'#e1c3d4')}}for(let i=0;i<65;i++){ctx.save();ctx.translate((i*97+time*17)%1350,(i*53+time*26)%760);ctx.rotate(time+i);ctx.fillStyle=light;ctx.beginPath();ctx.ellipse(0,0,5,2,0,0,7);ctx.fill();ctx.restore()}
        } else {
          for(let k=0;k<9;k++){ctx.save();ctx.translate(170+k*120,330+Math.sin(k*2+time*.4)*100);ctx.rotate(time*.12+k);const r=50+k%3*20;ctx.beginPath();for(let i=0;i<6;i++){const a=i*Math.PI/3,x=Math.cos(a)*r,y=Math.sin(a)*r;i?ctx.lineTo(x,y):ctx.moveTo(x,y)}ctx.closePath();ctx.fillStyle=k%2?light:accent;ctx.globalAlpha=.1;ctx.fill();ctx.globalAlpha=.65;ctx.lineWidth=1;ctx.strokeStyle=light;ctx.stroke();for(let i=0;i<6;i++){ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(Math.cos(i*Math.PI/3)*r,Math.sin(i*Math.PI/3)*r);ctx.stroke()}ctx.restore()}
        }
        ctx.globalAlpha=1
        if(spec.mode==='warm'){const p=smooth(0,.85,time/(spec.durationMs/1000));ctx.fillStyle=dark;ctx.globalAlpha=(1-p)*.85;ctx.fillRect(0,0,1280,720);ctx.globalAlpha=(1-p)*.65;ctx.strokeStyle=accent;ctx.lineWidth=2;ctx.beginPath();ctx.arc(640,360,30+p*720,0,7);ctx.stroke();ctx.globalAlpha=1}
      }
    }
    loaded=true;draw(0);frames++;resume();return true
  })().catch(error=>{dispose();throw error})
  function tick(now:number){frame=0;if(disposed||!loaded||!started||document.hidden)return;if(!last)last=now;if(spec.mode!=='background'||now-last>=1000/30){seconds+=Math.min(.1,(now-last)/1000);last=now;draw(reduced.matches?spec.durationMs/1000:seconds);frames++;canvas.dataset.seconds=seconds.toFixed(2)}frame=requestAnimationFrame(tick)}
  function resume(){cancelAnimationFrame(frame);last=0;if(!disposed&&loaded&&started&&!document.hidden&&!(reduced.matches&&spec.mode==='background'))frame=requestAnimationFrame(tick)}
  function dispose(){if(disposed)return;disposed=true;cancelAnimationFrame(frame);window.removeEventListener('resize',resize);document.removeEventListener('visibilitychange',resume);reduced.removeEventListener('change',resume);release();canvas.remove()}
  window.addEventListener('resize',resize);document.addEventListener('visibilitychange',resume);reduced.addEventListener('change',resume)
  return { ready, dispose, play(){started=true;seconds=0;resume()}, pause(){started=false;cancelAnimationFrame(frame)}, setStrength(value:number){canvas.style.opacity=String(value/100)}, seek(time:number){seconds=time;if(loaded)draw(time)}, status:()=>({ready:loaded,active:loaded&&!disposed,paused:!started||document.hidden,frames,seconds}) }
}

