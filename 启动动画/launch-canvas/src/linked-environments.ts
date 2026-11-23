import type { GallerySpec } from './gallery-motion'
import { ease, pulse, clamp, bezier, type Vec } from './linked-motion'

export const environmentStories: Record<string,string> = { aurora:'流星落雪 · 极光回应', sakura:'风过月庭 · 樱瓣回旋', city:'电光接力 · 城市苏醒', ocean:'星坠海面 · 月潮共鸣', orbit:'探针掠星 · 引力远航', ink:'飞鸟落笔 · 山水回声', forest:'一萤引路 · 万点相随', crystal:'光束入镜 · 折射共振' }
export function createEnvironmentIntro(canvas:HTMLCanvasElement,source:HTMLCanvasElement,spec:GallerySpec,renderSource:(time:number)=>void){
  const ctx=canvas.getContext('2d')!,id=spec.theme.id,color=spec.theme.colors[1],W=1280,H=720
  const line=(points:Vec[],alpha=1,width=2)=>{ctx.save();ctx.globalAlpha=alpha;ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.stroke();ctx.restore()}
  const glow=(point:Vec,r:number,alpha=1)=>{if(r<=0)return;ctx.save();ctx.globalAlpha=alpha;const g=ctx.createRadialGradient(...point,0,...point,r);g.addColorStop(0,'#fff');g.addColorStop(.2,color);g.addColorStop(1,color+'00');ctx.fillStyle=g;ctx.fillRect(point[0]-r,point[1]-r,r*2,r*2);ctx.restore()}
  canvas.dataset.sequence='environment-'+id;canvas.dataset.fragments='0';canvas.dataset.intro=id
  return{draw(time:number){const p=clamp(time*1000/spec.durationMs),active=ease(.08,.18,p)*(1-ease(.8,.96,p)),impact=pulse(.4,.52,.86,p)
    renderSource(time);ctx.setTransform(canvas.width/W,0,0,canvas.height/H,0,0);ctx.globalAlpha=1;ctx.drawImage(source,0,0,W,H)
    switch(id){
      case 'aurora':case 'ocean':{
        const t=ease(.12,.45,p),target:Vec=id==='aurora'?[760,470]:[700,480],star:Vec=[140+(target[0]-140)*t,30+(target[1]-30)*t]
        if(p<.46){line([[star[0]-90*(1-t),star[1]-60*(1-t)],star],active,3);glow(star,18,active)}
        for(let i=0;i<5;i++){const r=clamp((p-.43-i*.025)/.35)*400;line(Array.from({length:120},(_,j)=>[target[0]+Math.cos(j/119*Math.PI*2)*r,target[1]+Math.sin(j/119*Math.PI*2)*r*.2] as Vec),impact*(1-i/6))}
        if(id==='aurora')for(let i=0;i<6;i++)line(Array.from({length:120},(_,j)=>[j/119*W,160+i*17+Math.sin(j*.05+time*.3+i*.1)*80] as Vec),impact*.45,9);break
      }
      case 'sakura':{
        for(let i=0;i<45;i++){const t=clamp((p-.14-i*.004)/.57),point=bezier([1180,180],[760,-40],[290,570],[100,400+i*3],t);ctx.save();ctx.globalAlpha=Math.sin(t*Math.PI)*active;ctx.fillStyle=i%2?'#f2adca':'#ffe0ef';ctx.translate(...point);ctx.rotate(i+t*9);ctx.beginPath();ctx.ellipse(0,0,6+i%3,3,0,0,Math.PI*2);ctx.fill();ctx.restore()}break
      }
      case 'city':{
        const strike=pulse(.12,.17,.22,p);line([[830,0],[730,110],[795,108],[650,275]],strike,6);glow([650,275],120,strike*.5)
        for(let i=0;i<18;i++){const t=clamp((p-.2-i*.018)/.35),point:Vec=[70+i*67,520-t*(130+i%4*30)];line([[point[0],550],point],Math.sin(t*Math.PI)*active,3);glow(point,16,Math.sin(t*Math.PI)*active)}break
      }
      case 'orbit':{
        const t=ease(.13,.84,p),a=t*Math.PI*2.3,point:Vec=[790+Math.cos(a)*(240-80*Math.sin(t*Math.PI)),350+Math.sin(a)*140];for(let i=0;i<25;i++){const q=t-i*.004,angle=q*Math.PI*2.3;glow([790+Math.cos(angle)*(240-80*Math.sin(q*Math.PI)),350+Math.sin(angle)*140],4,active*(1-i/25)*.5)}glow(point,18,active);break
      }
      case 'ink':{
        for(let i=0;i<7;i++){const t=clamp((p-.1-i*.02)/.66),point:Vec=[-80+t*1450,190+Math.sin(t*5+i*.1)*80];line([[point[0]-14,point[1]-Math.sin(time*5+i)*10],point,[point[0]+14,point[1]-Math.sin(time*5+i)*10]],active,2)}
        for(let i=0;i<3;i++)line(Array.from({length:90},(_,j)=>[j/89*W,530+i*30+Math.sin(j*.06+time*.3)*20] as Vec),impact*.3,1);break
      }
      case 'forest':{
        const leader=bezier([110,620],[310,200],[800,500],[1100,260],ease(.08,.87,p));glow(leader,17,active)
        for(let i=0;i<45;i++){const follow=ease(.18+i*.008,.6+i*.008,p),point:Vec=[mix(90+(i*127)%1110,leader[0]-i*10,follow),mix(520+(i*37)%160,leader[1]+Math.sin(i)*30,follow)];glow(point,5,active*ease(.1+i*.01,.24+i*.01,p))}break
      }
      case 'crystal':{
        const nodes:Vec[]=[[60,120],[320,370],[540,210],[790,450],[1090,230]],reach=ease(.08,.7,p)*4
        for(let i=0;i<4;i++){const t=clamp(reach-i);line([nodes[i],[mix(nodes[i][0],nodes[i+1][0],t),mix(nodes[i][1],nodes[i+1][1],t)]],active,3);if(t===1)glow(nodes[i+1],30+impact*30,active*.8)}break
      }
    }
    canvas.dataset.phase=p<.2?'arrival':p<.4?'gesture':p<.76?'response':p<.94?'settle':'complete'
  },dispose(){}}
}
function mix(a:number,b:number,t:number){return a+(b-a)*t}
