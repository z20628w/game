import type { GallerySpec } from './gallery-motion'
import { createActorRig, ease, pulse, type ActorPose, type Vec } from './linked-motion'

export const warmStories: Record<string,string> = {
  chatgpt:'点头引光',claude:'书页轻扬',gemini:'双星轻拨',deepseek:'指尖涟漪',doubao:'挥手迎泡',qwen:'轻扇送风',
  kimi:'托月归环',grok:'提斧致意',seed:'轻触萌芽',copilot:'纸翼回旋',perplexity:'星点确认',minimax:'轻拍余音',
  aurora:'极光应星',ocean:'月影回波',sakura:'风过花枝',city:'灯火接力',orbit:'卫星归轨',ink:'飞鸟归山',forest:'萤火相迎',crystal:'折光共鸣'
}
function warmPose(model:string,p:number,anime:boolean):ActorPose {
  const a=pulse(0,.3,.88,p),b=pulse(.18,.48,.94,p),pose:ActorPose={x:0,y:0,lean:0,head:0,handX:0,handY:0,prop:0,wing:0,wind:0}
  switch(model){
    case 'chatgpt':pose.head=.045*a;pose.handY=-.012*b;pose.wing=.008*a;break
    case 'claude':pose.head=.035*a;pose.handY=-.014*a;pose.wind=.25*b;break
    case 'gemini':pose.handX=Math.sin(p*7)*.014*a;pose.head=-.025*b;break
    case 'deepseek':pose.handY=.016*a;pose.head=.03*b;pose.wind=.2*b;break
    case 'doubao':pose.handX=Math.sin(p*16)*.012*a;pose.handY=-.018*a;pose.head=-.03*b;break
    case 'qwen':pose.prop=.1*Math.sin(p*8)*a;pose.handX=-.018*a;pose.wind=.65*b;break
    case 'kimi':pose.handY=-.024*a;pose.head=-.035*b;break
    case 'grok':pose.prop=-.055*a;pose.handY=-.009*a;pose.head=.035*b;break
    case 'seed':pose.handY=.01*a;pose.head=.055*b;break
    case 'copilot':pose.handX=-.018*a;pose.head=-.03*b;pose.wind=.2*b;break
    case 'perplexity':pose.handX=-.008*a;pose.head=.025*b;break
    case 'minimax':pose.handY=-.016*Math.sin(p*10)*a;pose.head=.02*Math.sin(p*10)*a;break
  }
  if(!anime)for(const key of Object.keys(pose) as (keyof ActorPose)[])pose[key]*=.55
  return pose
}
async function load(url:string){const image=new Image();image.src=url;await image.decode();return image}

// 恢复是一段往返动作，首尾都落到背景的同一静止帧，随后交由背景继续运动。
export async function createWarmScene(canvas:HTMLCanvasElement,source:HTMLCanvasElement,spec:GallerySpec){
  const model=spec.theme.id.replace(/-(art|anime)$/,''),ctx=canvas.getContext('2d')!,color=spec.theme.colors[1]
  const layers=spec.theme.image&&spec.actorURL&&spec.stageURL?await Promise.all([load(spec.actorURL),load(spec.stageURL)]):null
  const rig=layers?createActorRig(spec.theme,layers[0],spec.fit,warmPose):null
  const line=(points:Vec[],alpha=1,width=2,tint=color)=>{ctx.save();ctx.globalAlpha*=alpha;ctx.strokeStyle=tint;ctx.lineWidth=width;ctx.lineCap='round';ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.stroke();ctx.restore()}
  const dot=([x,y]:Vec,r:number,alpha=1)=>{ctx.save();ctx.globalAlpha*=alpha;ctx.fillStyle=color;ctx.shadowColor=color;ctx.shadowBlur=10;ctx.beginPath();ctx.arc(x,y,Math.max(.01,r),0,Math.PI*2);ctx.fill();ctx.restore()}
  const ring=([x,y]:Vec,r:number,alpha=1,aspect=.4)=>{ctx.save();ctx.globalAlpha*=alpha;ctx.strokeStyle=color;ctx.lineWidth=1.8;ctx.beginPath();ctx.ellipse(x,y,Math.max(.01,r),Math.max(.01,r*aspect),0,0,Math.PI*2);ctx.stroke();ctx.restore()}
  canvas.dataset.sequence='warm-'+model
  return {
    draw(seconds:number){
      const p=Math.max(0,Math.min(1,seconds*1000/spec.durationMs)),w=canvas.width,h=canvas.height,W=1280,H=W*h/w
      ctx.setTransform(w/W,0,0,h/H,0,0);ctx.globalAlpha=1;ctx.clearRect(0,0,W,H);ctx.drawImage(source,0,0,W,H)
      canvas.dataset.phase=p>=1?'rest':p<.3?'greeting':p<.7?'interaction':'settle'
      if(p<=0||p>=1)return
      const strength=ease(0,.16,p)*(1-ease(.64,1,p)),gesture=pulse(0,.35,.96,p)
      let hand:Vec=[W*.67,H*.44]
      if(rig&&layers){
        ctx.save();ctx.globalAlpha=strength
        const stage=layers[1],scale=(spec.fit==='contain'?Math.min:Math.max)(W/stage.width,H/stage.height)
        ctx.drawImage(stage,(W-stage.width*scale)/2,(H-stage.height*scale)/2,stage.width*scale,stage.height*scale)
        rig.draw(p,W,H);ctx.drawImage(rig.layer,0,0,W,H);ctx.restore();hand=rig.point(rig.hand,p)
      }
      ctx.save();ctx.globalAlpha=strength
      const [x,y]=hand,t=ease(.15,.82,p)
      switch(model){
        case 'chatgpt':{const orb:Vec=[x-110*t,y-60*Math.sin(t*Math.PI)];dot(orb,4+gesture*2);ring(orb,8+gesture*12,.4,1);for(let i=0;i<7;i++)dot([orb[0]+Math.cos(i*2.4)*25,orb[1]+Math.sin(i*2.4)*18],1.2);break}
        case 'claude':for(let i=0;i<3;i++){const k=pulse(.06+i*.05,.3+i*.04,.9,p);ctx.save();ctx.translate(x-18-i*19*k,y-35*k-i*12);ctx.rotate(-.2-k*.6);ctx.fillStyle='#fff4da';ctx.strokeStyle='#ba8b55';ctx.lineWidth=.8;ctx.beginPath();ctx.moveTo(0,0);ctx.quadraticCurveTo(8,-12*k,22,-5*k);ctx.lineTo(22,19);ctx.quadraticCurveTo(7,15,0,21);ctx.closePath();ctx.fill();ctx.stroke();ctx.restore()}break
        case 'gemini':for(const side of [-1,1]){const angle=p*6+side*Math.PI;const point:Vec=[x+Math.cos(angle)*32*gesture,y-25+Math.sin(angle)*16*gesture];dot(point,4);line([hand,point],.35)}break
        case 'deepseek':for(let i=0;i<3;i++)ring([x,y+18],(8+55*ease(.12+i*.06,.8,p)),pulse(.1+i*.06,.4,.94,p));break
        case 'doubao':for(let i=0;i<3;i++){const q=pulse(.04+i*.04,.4,.95,p);ring([x-15-i*25*q,y-20-i*18*q],6+i*2,.8,1);dot([x-18-i*25*q,y-23-i*18*q],1.2)}break
        case 'qwen':for(let i=0;i<7;i++){const k=(i+1)/7;const pos:Vec=[x-150*t*k,y+Math.sin(k*6+p*5)*18*gesture];ctx.save();ctx.translate(...pos);ctx.rotate(p*5+i);ctx.fillStyle='#8bb99d';ctx.beginPath();ctx.ellipse(0,0,6,2.5,0,0,7);ctx.fill();ctx.restore()}break
        case 'kimi':{const moon:Vec=[x-20*gesture,y-45*gesture];ring(moon,15,.85,1);ring(moon,30*gesture,.5,.4);dot([moon[0]+Math.cos(p*7)*30*gesture,moon[1]+Math.sin(p*7)*12*gesture],2.5);break}
        case 'grok':{const tip=rig?.point(rig.anime?[.55,.17]:rig.hand,p)||hand;line([[tip[0]-12,tip[1]],[tip[0]+12,tip[1]]],gesture,2,'#ffe4a7');line([[tip[0],tip[1]-18],[tip[0],tip[1]+18]],gesture,2,'#ffe4a7');ring(tip,24*gesture,.4,1);break}
        case 'seed':{const stem:Vec=[x-20,y+10];line([stem,[stem[0],stem[1]-24*gesture]],1,2,'#91bc73');for(const side of [-1,1]){ctx.save();ctx.translate(stem[0]+side*7*gesture,stem[1]-18*gesture);ctx.rotate(side*.7);ctx.fillStyle='#b6d785';ctx.beginPath();ctx.ellipse(0,0,5*gesture,11*gesture,0,0,7);ctx.fill();ctx.restore()}break}
        case 'copilot':{const point:Vec=[x-105*Math.sin(t*Math.PI),y-40*Math.sin(t*Math.PI*2)];ctx.save();ctx.translate(...point);ctx.rotate(-.5+t*2);ctx.fillStyle='#eefaff';ctx.strokeStyle='#91bdd6';ctx.beginPath();ctx.moveTo(14,-4);ctx.lineTo(-12,-6);ctx.lineTo(-3,4);ctx.lineTo(-2,11);ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();break}
        case 'perplexity':{const stars:Vec[]=[[x-90,y-12],[x-58,y-39],[x-24,y-20]];stars.forEach((point,i)=>{dot(point,3,ease(i*.12,.3+i*.12,p));if(i)line([stars[i-1],point],ease(.18,.6,p))});dot([x-24*(1-t),y-20*(1-t)],3);break}
        case 'minimax':for(let i=0;i<3;i++){const k=pulse(.08+i*.1,.3+i*.1,.94,p);ctx.fillStyle=color;ctx.font='22px serif';ctx.fillText(i%2?'♫':'♪',x-30-i*30*k,y-40*k);ring([x-30-i*30,y+24],25*k,k)}break
        case 'aurora':for(let i=0;i<3;i++)line(Array.from({length:40},(_,j)=>[j/39*W,H*.3+Math.sin(j*.14+p*2+i)*30*gesture+i*16] as Vec),gesture*.35,4);break
        case 'ocean':for(let i=0;i<3;i++)ring([W*.67,H*.67],20+130*ease(i*.06,.9,p),gesture*.7);break
        case 'sakura':for(let i=0;i<10;i++){ctx.save();ctx.translate(W*(.55+i*.035)-80*t,H*.3+Math.sin(i+p*5)*30*gesture);ctx.rotate(p*4+i);ctx.fillStyle='#f0c0d5';ctx.beginPath();ctx.ellipse(0,0,5,2,0,0,7);ctx.fill();ctx.restore()}break
        case 'city':for(let i=0;i<9;i++){const k=pulse(i*.035,.3+i*.035,.98,p);line([[W*(.2+i*.06),H*.6],[W*(.2+i*.06),H*(.6-k*.16)]],k,3)}break
        case 'orbit':{const a=p*Math.PI*2;ring([W*.62,H*.48],90,.5,.4);dot([W*.62+Math.cos(a)*90,H*.48+Math.sin(a)*36],4);break}
        case 'ink':for(let i=0;i<4;i++){const a=W*(.35+i*.035)+90*t,b=H*.3+Math.sin(p*9+i)*4;line([[a-8,b-5],[a,b],[a+8,b-5]],.75,1.5,'#506c66')}break
        case 'forest':for(let i=0;i<12;i++)dot([W*(.25+i*.045)+Math.sin(p*6+i)*15,H*.65+Math.sin(i*2+p*4)*30],2.2,pulse(i*.025,.3+i*.025,.98,p));break
        case 'crystal':{const points:Vec[]=[[W*.28,H*.5],[W*.42,H*.35],[W*.56,H*.55],[W*.7,H*.38]];points.forEach((point,i)=>{dot(point,4);if(i)line([points[i-1],point],gesture,2)});break}
      }
      ctx.restore();canvas.dataset.interaction=warmStories[model];canvas.dataset.hand=JSON.stringify(hand)
    },
    dispose(){rig?.dispose()}
  }
}
