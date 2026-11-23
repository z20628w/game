import type { GallerySpec } from './gallery-motion'
import { createActorRig, linkedStories, ease, pulse, clamp, mix, bezier, type Vec } from './linked-motion'

const TAU=Math.PI*2,W=1280
const noise=(n:number)=>{const x=Math.sin(n*127.1+311.7)*43758.5453;return x-Math.floor(x)}
async function loadImage(url:string){const image=new Image();await new Promise<void>((resolve,reject)=>{image.onload=()=>resolve();image.onerror=()=>reject(Error('联动分层素材加载失败'));image.src=url});return image}

export async function createLinkedScene(canvas:HTMLCanvasElement,source:HTMLCanvasElement,spec:GallerySpec,renderSource:(time:number)=>void){
  if(!spec.actorURL||!spec.stageURL)throw Error('此主题缺少角色与背景分层素材')
  const [actor,stage]=await Promise.all([loadImage(spec.actorURL),loadImage(spec.stageURL)])
  const ctx=canvas.getContext('2d')!,rig=createActorRig(spec.theme,actor,spec.fit),model=rig.model,story=linkedStories[model],accent=spec.theme.colors[1]
  const dot=(point:Vec,r:number,color=accent,alpha=1)=>{if(r<=0||alpha<=0)return;ctx.save();ctx.globalAlpha=alpha;ctx.fillStyle=color;ctx.beginPath();ctx.arc(point[0],point[1],r,0,TAU);ctx.fill();ctx.restore()}
  const glow=(point:Vec,r:number,color=accent,alpha=1)=>{if(r<=0||alpha<=0)return;ctx.save();ctx.globalAlpha=alpha;const g=ctx.createRadialGradient(point[0],point[1],0,point[0],point[1],r);g.addColorStop(0,'#ffffff');g.addColorStop(.12,color);g.addColorStop(1,color+'00');ctx.fillStyle=g;ctx.fillRect(point[0]-r,point[1]-r,r*2,r*2);ctx.restore()}
  const line=(points:Vec[],color=accent,width=2,alpha=1)=>{if(!points.length)return;ctx.save();ctx.globalAlpha=alpha;ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineCap='round';ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.stroke();ctx.restore()}
  const ring=(point:Vec,r:number,alpha=1,scaleY=.35)=>{ctx.save();ctx.globalAlpha=alpha;ctx.strokeStyle=accent;ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(point[0],point[1],Math.max(.1,r),Math.max(.1,r*scaleY),0,0,TAU);ctx.stroke();ctx.restore()}
  const leaf=(point:Vec,r:number,angle:number,color:string,alpha=1)=>{ctx.save();ctx.translate(...point);ctx.rotate(angle);ctx.globalAlpha=alpha;ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(0,-r);ctx.bezierCurveTo(r,-r*.3,r,r*.5,0,r);ctx.bezierCurveTo(-r,r*.5,-r,-r*.3,0,-r);ctx.fill();ctx.restore()}
  const path=(a:Vec,b:Vec,c:Vec,d:Vec,t:number)=>bezier(a,b,c,d,clamp(t))
  const trail=(fn:(t:number)=>Vec,t:number,color=accent,alpha=1)=>{for(let i=0;i<18;i++){const q=t-i*.007;if(q<0)break;dot(fn(q),2.8*(1-i/18),color,alpha*(1-i/18)*.75)}}
  const bird=(point:Vec,size:number,flap:number,color:string,alpha=1)=>{
    const lift=(.3+Math.sin(flap)*.65)*size
    ctx.save();ctx.translate(...point);ctx.globalAlpha=alpha;ctx.lineWidth=.7;ctx.strokeStyle=color
    for(const side of [-1,1]){ctx.fillStyle=side<0?'#fff6dc':'#e5bc82';ctx.beginPath();ctx.moveTo(0,3);ctx.lineTo(side*size,-lift);ctx.lineTo(side*size*.66,7);ctx.closePath();ctx.fill();ctx.stroke()}
    ctx.fillStyle='#fff9e9';ctx.beginPath();ctx.moveTo(-3,4);ctx.lineTo(2,-7);ctx.lineTo(7,-4);ctx.lineTo(3,0);ctx.lineTo(1,10);ctx.closePath();ctx.fill();ctx.stroke();ctx.restore()
  }
  const plane=(point:Vec,angle:number,alpha=1)=>{ctx.save();ctx.translate(...point);ctx.rotate(angle);ctx.globalAlpha=alpha;ctx.fillStyle='#f0f6ff';ctx.strokeStyle='#7b9fbf';ctx.lineWidth=1.4;ctx.beginPath();ctx.moveTo(24,-8);ctx.lineTo(-24,-5);ctx.lineTo(-4,5);ctx.lineTo(-2,19);ctx.closePath();ctx.fill();ctx.stroke();line([[-4,5],[24,-8]],'#99bad4',1);ctx.restore()}
  const flower=(point:Vec,size:number,alpha=1)=>{for(let i=0;i<6;i++)leaf([point[0]+Math.cos(i*TAU/6)*size*.5,point[1]+Math.sin(i*TAU/6)*size*.5],size*.65,i*TAU/6,'#e6d2ff',alpha);dot(point,size*.25,'#fff1bf',alpha)}
  const drawCover=(image:CanvasImageSource,width:number,height:number,sw:number,sh:number)=>{const scale=(spec.fit==='contain'?Math.min:Math.max)(width/sw,height/sh);ctx.drawImage(image,(width-sw*scale)/2,(height-sh*scale)/2,sw*scale,sh*scale)}
  canvas.dataset.sequence='linked-'+model;canvas.dataset.intro=spec.theme.id;canvas.dataset.fragments='0';canvas.dataset.layered='true'
  return {
    draw(seconds:number){
      const p=clamp(seconds*1000/spec.durationMs),H=Math.round(W*canvas.height/canvas.width),active=ease(.1,.19,p)*(1-ease(.83,.94,p))
      // 只有衔接待机时才绘制原背景，避免全程重复渲染并回读第二张 WebGL 画布。
      if(p>=.9)renderSource(Math.min(seconds*.3,4)*(1-ease(.88,1,p)))
      ctx.setTransform(canvas.width/W,0,0,canvas.height/H,0,0);ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';ctx.clearRect(0,0,W,H)
      if(p>=1){ctx.drawImage(source,0,0,W,H);canvas.dataset.phase='complete';return}
      const pose=rig.draw(p,W,H),hand=rig.point(rig.hand,p),origin=rig.point(rig.hand,.32),target:Vec=[W*.28,H*.76]
      const impact=model==='grok'?pulse(.36,.4,.55,p):0
      ctx.save();ctx.translate(Math.sin(p*220)*impact*4+pose.wind*1.5,Math.cos(p*200)*impact*3);ctx.translate(W/2,H/2);ctx.scale(1.006,1.006);ctx.translate(-W/2,-H/2);drawCover(stage,W,H,stage.width,stage.height);ctx.restore()
      // 场景亮度随事件变化，不按一个统一遮罩露出整幅图。
      ctx.save();ctx.fillStyle='#0c1835';ctx.globalAlpha=(1-ease(0,.2,p))*.12;ctx.fillRect(0,0,W,H);ctx.restore()
      if(model==='chatgpt')for(let i=0;i<30;i++){const t=clamp((p-.025-noise(i)*.05)/.35),r=60+t*320;leaf([W*.7+Math.cos(i*2.4+t*3)*r,H*.83-t*H*.37+Math.sin(i)*20],3+noise(i)*4,i+t*6,'#dec8f4',Math.sin(t*Math.PI)*.75)}
      if(model==='deepseek'){const water=pulse(.28,.54,.85,p);for(let i=0;i<5;i++)line(Array.from({length:90},(_,j)=>[j/89*W,H*.83+Math.sin(j/89*10-seconds*1.6+i*.3)*(12+i*4)*water+i*8] as Vec),accent,1.8,water*.4)}
      if(model==='kimi')for(let i=0;i<3;i++)ring([W*.68,H*.88+pose.y*H],80+i*45,pulse(.2,.48,.85,p)*.45)
      ctx.drawImage(rig.layer,0,0,W,H)
      switch(model){
        case 'chatgpt':{
          const released=ease(.32,.58,p),orb=p<.32?hand:path(origin,[origin[0]-110,origin[1]-180],[target[0]+190,target[1]-200],target,released)
          if(p<.6){trail(t=>path(origin,[origin[0]-110,origin[1]-180],[target[0]+190,target[1]-200],target,t),released,accent,active);glow(orb,18+25*pulse(.14,.3,.6,p),accent,active)}
          const response=ease(.56,.72,p)*(1-ease(.83,.95,p));for(let i=0;i<18;i++){const a=i*2.4,r=35+noise(i)*140;flower([target[0]+Math.cos(a)*r,target[1]+Math.sin(a)*r*.35],(6+noise(i)*7)*ease(.56+i*.004,.74+i*.004,p),response)}glow(target,120,response>.01?accent:'#ffffff',response*.35);break
        }
        case 'claude':{
          const book:Vec=[hand[0]-12,hand[1]+12];if(!rig.anime){ctx.save();ctx.translate(...book);ctx.rotate(pose.prop-.1);ctx.globalAlpha=active;ctx.fillStyle='#fff1d1';ctx.strokeStyle='#ac8050';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(0,8);ctx.lineTo(-36,-2);ctx.lineTo(-36,-35);ctx.lineTo(0,-24);ctx.lineTo(36,-35);ctx.lineTo(36,-2);ctx.closePath();ctx.fill();ctx.stroke();line([[0,-24],[0,8]],'#90663e',2);ctx.restore()}else glow(book,24,'#ffd78e',active*.45)
          for(let i=0;i<9;i++){const birth=.28+i*.018,t=clamp((p-birth)/.5),start=rig.point(rig.hand,birth),end=rig.point(rig.hand,Math.min(.84,p)),a:Vec=[W*(.18+noise(i)*.3),H*(.16+noise(i+8)*.2)],point=t<.55?path(start,[start[0]-140,start[1]-90],[a[0]+80,a[1]-60],a,t/.55):path(a,[a[0]-80,a[1]+100],[end[0]-160,end[1]-50],end,(t-.55)/.45),alpha=Math.sin(t*Math.PI)*active
            if(t<.15){ctx.save();ctx.translate(...point);ctx.rotate(t*15);ctx.globalAlpha=alpha;ctx.fillStyle='#fff5d8';ctx.fillRect(-7,-10,14,20);ctx.restore()}else bird(point,10+noise(i)*8,seconds*8+i,'#a87340',alpha)}break
        }
        case 'gemini':{
          const orbit=ease(.3,.57,p),collision:Vec=[W*.35,H*.37];for(const side of [-1,1]){const color=side<0?'#81ecff':'#ee9bff',a=orbit*TAU*1.5+side*Math.PI,r=(1-orbit)*150;const point=p<.3?[hand[0]+side*24,hand[1]-30] as Vec:[mix(origin[0],collision[0],orbit)+Math.cos(a)*r,mix(origin[1],collision[1],orbit)+Math.sin(a)*r*.55] as Vec;glow(point,20+12*Math.sin(orbit*Math.PI),color,active*(1-ease(.56,.6,p)))}
          const constellation=ease(.56,.7,p)*(1-ease(.84,.94,p)),stars=Array.from({length:11},(_,i)=>[collision[0]+Math.cos(i*2.4)*(45+i*11),collision[1]+Math.sin(i*2.4)*(45+i*8)] as Vec);stars.forEach((point,i)=>{if(i)line([stars[i-1],point],'#d9caff',1.3,constellation*.65);glow(point,8,'#e6edff',constellation)});ring(collision,ease(.56,.72,p)*230,constellation*.5,1);break
        }
        case 'deepseek':{
          const tap=rig.point(rig.hand,.28);for(let i=0;i<4;i++)ring(tap,clamp((p-.27-i*.025)/.25)*140,pulse(.27+i*.025,.34+i*.025,.58+i*.025,p)*.6)
          const travel=clamp((p-.3)/.48),whale=path([W*.08,H*.68],[W*.3,H*.23],[W*.57,H*.19],[W*.61,H*.75],travel),whaleAlpha=Math.sin(travel*Math.PI)*.8;ctx.save();ctx.translate(...whale);ctx.rotate(-.25+travel*.6);ctx.globalAlpha=whaleAlpha;const water=ctx.createLinearGradient(-100,-50,100,45);water.addColorStop(0,'#c3f6ff');water.addColorStop(1,'#328cce');ctx.fillStyle=water;ctx.shadowColor='#92e6ff';ctx.shadowBlur=15;ctx.beginPath();ctx.moveTo(-115,0);ctx.bezierCurveTo(-80,-60,45,-65,100,-8);ctx.lineTo(135,-45);ctx.lineTo(126,-2);ctx.lineTo(150,25);ctx.lineTo(100,12);ctx.bezierCurveTo(20,70,-90,55,-115,0);ctx.fill();ctx.shadowBlur=0;dot([-75,-7],4,'#173e69');ctx.fillStyle='#d4f5fb';ctx.beginPath();ctx.moveTo(-101,12);ctx.bezierCurveTo(-52,45,31,49,83,12);ctx.bezierCurveTo(33,65,-71,65,-101,12);ctx.fill();ctx.fillStyle='#419bc1';ctx.beginPath();ctx.moveTo(-15,22);ctx.quadraticCurveTo(18,74,40,26);ctx.quadraticCurveTo(16,36,-15,22);ctx.fill();line([[-94,9],[-76,15],[-52,16]],'#4c9fb8',1.5,.75);line([[-72,-31],[-40,-41],[-4,-39]],'#e9fcff',2,.65);ctx.restore()
          const splash=pulse(.58,.66,.83,p);for(let i=0;i<25;i++){const a=i/25*Math.PI;dot([W*.55+Math.cos(a)*splash*160,H*.77-Math.sin(a)*splash*100],2+noise(i)*2,'#c4f4ff',splash)}break
        }
        case 'doubao':{
          for(let i=0;i<10;i++){const hit=.3+i*.04,location:Vec=[mix(origin[0],W*.15,i/9),origin[1]+Math.sin(i*.8)*80],before=1-ease(hit-.01,hit+.02,p),arrive=ease(.1+i*.009,.26+i*.009,p);ring(location,(18+noise(i)*16)*arrive,active*before,1);glow([location[0]-7,location[1]-8],5,'#fff9e7',active*before)
            const pop=clamp((p-hit)/.12);if(pop>0&&pop<1)for(let j=0;j<7;j++)leaf([location[0]+Math.cos(j*TAU/7)*pop*60,location[1]+Math.sin(j*TAU/7)*pop*60],4*(1-pop),j,'#ffc8df',1-pop)}break
        }
        case 'qwen':{
          const wind=pose.wind;for(let i=0;i<18;i++){const travel=clamp((p-.24-i*.015)/.4),point=path(rig.point(rig.hand,.24),[origin[0]-160,origin[1]-150],[W*.32,H*.65],[W*.05,H*(.15+noise(i)*.55)],travel);leaf(point,6+noise(i)*5,travel*8+i,'#95c5ba',Math.sin(travel*Math.PI)*active)}
          for(let i=0;i<4;i++)line(Array.from({length:55},(_,j)=>{const t=j/54;return[hand[0]-t*W*.65,hand[1]+Math.sin(t*7+seconds*2+i)*35*wind+i*18] as Vec}),accent,1.3,Math.abs(wind)*.25*active);break
        }
        case 'kimi':{
          const raise=ease(.22,.58,p),moon=path(origin,[origin[0]-120,origin[1]-180],[W*.42,H*.12],[W*.28,H*.25],raise);glow(moon,55,'#c9d4ff',active*.8);dot(moon,22,'#eef2ff',active);for(let i=0;i<3;i++)ring(moon,45+i*22,active*.4,.55+i*.12)
          for(let i=0;i<15;i++){const t=i/14,point:Vec=[mix(hand[0],moon[0],t),mix(hand[1],moon[1],t)+Math.sin(t*Math.PI)*55];glow(point,3+noise(i)*4,'#dce5ff',active*ease(.25,.55,p))}break
        }
        case 'grok':{
          const strike=ease(.3,.4,p),impact=pulse(.37,.44,.72,p),tip=rig.point(rig.anime?[.55,.17]:rig.hand,p),cutEnd:Vec=[W*.23,H*.78]
          if(p>.3&&p<.5){const end:Vec=[mix(tip[0],cutEnd[0],strike),mix(tip[1],cutEnd[1],strike)];line([tip,end],'#ffe5a5',7,1-ease(.4,.5,p));glow(end,36,'#ffc777',1-ease(.4,.5,p))}
          for(let i=0;i<5;i++)ring(cutEnd,clamp((p-.38-i*.012)/.24)*340,impact*(1-i/6),.28)
          for(let i=0;i<38;i++){const t=clamp((p-.38)/.3),a=-Math.PI+noise(i)*Math.PI,r=t*(90+noise(i+7)*210);dot([cutEnd[0]+Math.cos(a)*r,cutEnd[1]+Math.sin(a)*r+t*t*100],1+noise(i)*2,'#ffe1a3',Math.sin(t*Math.PI))}break
        }
        case 'seed':{
          const ground:Vec=[W*.3,H*.82],fall=clamp((p-.3)/.2),seed=p<.3?hand:path(origin,[origin[0]-100,origin[1]-80],[ground[0],ground[1]-170],ground,fall);if(p<.51)glow(seed,14,'#c6f69c',active)
          const growth=ease(.5,.78,p),height=200*growth;line(Array.from({length:50},(_,i)=>[ground[0]+Math.sin(i/49*5)*12*growth,ground[1]-i/49*height] as Vec),'#70ad78',5,1-ease(.88,.97,p))
          for(let i=0;i<7;i++){const leafGrowth=ease(.53+i*.02,.72+i*.02,p),point:Vec=[ground[0]+Math.sin(i)*10,ground[1]-i*26*growth];leaf(point,leafGrowth*22,i%2?.8:-.8,'#a1d694',1-ease(.88,.97,p))}flower([ground[0]+Math.sin(5)*12,ground[1]-height],18*ease(.7,.82,p),1-ease(.88,.97,p));ring(ground,growth*75,pulse(.5,.64,.84,p));break
        }
        case 'copilot':{
          const travel=clamp((p-.29)/.48),route=(t:number)=>path(origin,[W*.52,-H*.03],[W*.06,H*.55],[W*.17,H*.2],t),point=p<.29?hand:route(travel),ahead=route(Math.min(1,travel+.005)),angle=p<.29?-.3:Math.atan2(ahead[1]-point[1],ahead[0]-point[0]);trail(route,travel,'#d8eaff',active);plane(point,angle,active)
          const gate=route(.63);ring(gate,50+ease(.58,.67,p)*20,pulse(.38,.6,.82,p),1);glow(gate,85,'#b3dfff',pulse(.58,.62,.72,p)*.4);break
        }
        case 'perplexity':{
          const stars=Array.from({length:7},(_,i)=>[W*(.14+i*.066),H*(.35+Math.sin(i*1.7)*.14)] as Vec),scan=clamp((p-.26)/.42)*6,index=Math.min(5,Math.floor(scan)),fraction=scan-index,lens:Vec=[mix(stars[index][0],stars[index+1][0],fraction),mix(stars[index][1],stars[index+1][1],fraction)]
          stars.forEach((point,i)=>{const lit=ease(.26+i*.06,.3+i*.06,p)*active;glow(point,6+lit*7,'#9af1e5',.2*active+lit*.8);if(i)line([stars[i-1],point],accent,1.5,lit*.7)})
          if(p>.25&&p<.72){ring(lens,26,active,1);line([[lens[0]+19,lens[1]+19],[lens[0]+39,lens[1]+39]],'#d8d7b8',5,active);line([hand,lens],accent,1,active*.25)}
          const returnT=clamp((p-.69)/.16);if(returnT>0&&returnT<1)glow(path(stars[6],[stars[6][0]+100,stars[6][1]-100],[hand[0]-70,hand[1]-80],hand,returnT),14,accent,active);break
        }
        case 'minimax':{
          for(let i=0;i<9;i++){const birth=.24+i*.045,t=clamp((p-birth)/.22),start=rig.point(rig.hand,birth),end:Vec=[W*(.14+i*.055),H*.8],point=path(start,[start[0]-90,start[1]-150],[end[0]+60,end[1]-180],end,t);if(t>0&&t<1){ctx.save();ctx.globalAlpha=Math.sin(t*Math.PI);ctx.fillStyle=['#f7caad','#a5ddf4','#d8a9e8'][i%3];ctx.font='bold 28px serif';ctx.fillText(i%2?'♫':'♪',...point);ctx.restore()}
            const struck=pulse(birth+.2,birth+.25,birth+.38,p);ctx.save();ctx.globalAlpha=struck*.75;ctx.fillStyle=accent;ctx.fillRect(end[0]-7,end[1]-struck*100,14,struck*100);ctx.restore();ring(end,struck*50,struck*.5)}break
        }
      }
      const finish=ease(.9,1,p);if(finish>0){ctx.save();ctx.globalAlpha=finish;ctx.drawImage(source,0,0,W,H);ctx.restore()}
      canvas.dataset.phase=p<.2?'arrival':p<.4?'gesture':p<.76?'response':p<.94?'settle':'complete'
      canvas.dataset.driver=JSON.stringify({model,hand:hand.map(n=>Math.round(n)),wind:Number(pose.wind.toFixed(3)),beat:story.beats[Math.min(3,Math.floor(p*4))]})
    },
    dispose(){rig.dispose()}
  }
}
