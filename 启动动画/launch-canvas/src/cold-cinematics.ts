import type { GallerySpec } from './gallery-motion'
import { coldStories } from './cold-stories'

type Point = [number,number]
const tau=Math.PI*2
const clamp=(x:number)=>Math.max(0,Math.min(1,x))
const ease=(a:number,b:number,x:number)=>{const p=clamp((x-a)/(b-a));return p*p*(3-2*p)}
const mix=(a:number,b:number,p:number)=>a+(b-a)*p

// 独立物体和镜头分镜；人物原图始终按完整画幅绘制，不使用人物网格或局部形变。
export function createColdCinematic(canvas:HTMLCanvasElement,background:HTMLCanvasElement,spec:GallerySpec){
  const ctx=canvas.getContext('2d')!,story=coldStories[spec.theme.id]
  if(!story)throw Error('缺少主题冷启动分镜：'+spec.theme.id)
  const [,light,accent]=spec.theme.colors
  let time=0,p=0
  const path=(points:Point[],color=light,width=2,alpha=1,close=false,fill?:string|CanvasGradient)=>{
    if(points.length<2)return
    ctx.save();ctx.globalAlpha*=clamp(alpha);ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));if(close)ctx.closePath()
    if(fill){ctx.fillStyle=fill;ctx.fill()}ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineCap='round';ctx.lineJoin='round';ctx.stroke();ctx.restore()
  }
  const curve=(fn:(t:number)=>Point,color=light,width=2,alpha=1,start=0,end=1)=>{const points:Point[]=[];for(let i=0;i<=100;i++)points.push(fn(mix(start,end,i/100)));path(points,color,width,alpha)}
  const orb=(x:number,y:number,r:number,color=light,alpha=1)=>{
    if(r<=0)return;ctx.save();ctx.globalAlpha*=clamp(alpha);const glow=ctx.createRadialGradient(x-r*.25,y-r*.3,0,x,y,r);glow.addColorStop(0,'#fff8ee');glow.addColorStop(.25,color);glow.addColorStop(1,color+'00');ctx.fillStyle=glow;ctx.beginPath();ctx.arc(x,y,r,0,tau);ctx.fill();ctx.restore()
  }
  const ring=(x:number,y:number,rx:number,ry=rx,angle=0,alpha=1,color=light,width=1.6)=>curve(t=>[x+Math.cos(t*tau+angle)*rx,y+Math.sin(t*tau+angle)*ry],color,width,alpha)
  const text=(value:string,x:number,y:number,size=16,color=accent,alpha=1,align:CanvasTextAlign='center')=>{ctx.save();ctx.globalAlpha*=clamp(alpha);ctx.fillStyle=color;ctx.font=`500 ${size}px "Microsoft YaHei UI",sans-serif`;ctx.textAlign=align;ctx.fillText(value,x,y);ctx.restore()}
  const strokeText=(value:string,x:number,y:number,size:number,color=light)=>{ctx.save();ctx.font=`700 ${size}px "Segoe UI",sans-serif`;ctx.textAlign='center';ctx.lineWidth=1.1;ctx.strokeStyle=color;ctx.strokeText(value,x,y);ctx.restore()}
  const transform=(x:number,y:number,angle:number,draw:()=>void)=>{ctx.save();ctx.translate(x,y);ctx.rotate(angle);draw();ctx.restore()}
  const progress=(a=0,b=.8)=>ease(a,b,p)
  const project=(x:number,y:number,z:number,ry=0,rx=0):Point=>{
    const a=x*Math.cos(ry)+z*Math.sin(ry),b=z*Math.cos(ry)-x*Math.sin(ry),c=y*Math.cos(rx)-b*Math.sin(rx),depth=y*Math.sin(rx)+b*Math.cos(rx),s=700/(700+depth)
    return [340+a*s,325+c*s]
  }
  const leaf=(x:number,y:number,size:number,angle:number,color=light)=>transform(x,y,angle,()=>{ctx.beginPath();ctx.moveTo(0,0);ctx.quadraticCurveTo(size*.1,-size*.65,size,0);ctx.quadraticCurveTo(size*.1,size*.65,0,0);ctx.fillStyle=color;ctx.globalAlpha*=.7;ctx.fill();path([[0,0],[size,0]],accent,1,.6)})
  const stamp=(label:string,x=490,y=438)=>{const v=progress(.58,.7);ctx.save();ctx.globalAlpha*=v;ctx.translate(x,y);ctx.rotate(-.09);ctx.strokeStyle='#d96755';ctx.lineWidth=2;ctx.strokeRect(-23,-23,46,46);text(label,0,7,20,'#ec8c79');ctx.restore()}

  const scenes:Record<string,()=>void>={
    'chatgpt-art':()=>{
      const travel=progress(.02,.66),rotation=1.1*(1-travel)+time*.06
      for(let k=0;k<6;k++){
        const a=k*tau/6
        curve(t=>{const u=t*tau,rad=116+32*Math.cos(3*u+a);return project(Math.cos(u+a)*rad,Math.sin(u+a)*rad,48*Math.sin(3*u+a),rotation,.45)},k%2?accent:light,5,.35+.6*travel,0,Math.max(.015,ease(k*.035,.5+k*.035,p)))
        const u=(time*.17+k/6)%1*tau,rad=116+32*Math.cos(3*u+a),q=project(Math.cos(u+a)*rad,Math.sin(u+a)*rad,48*Math.sin(3*u+a),rotation,.45);orb(...q,9)
      }
      orb(340,325,45,light,progress(.42,.7));text('连接 · 推演 · 创造',340,520,17,accent,progress(.55,.7))
    },
    'chatgpt-anime':()=>{
      for(let k=0;k<3;k++){
        const turn=(1-progress(.08+k*.06,.58+k*.05))*(k+1)*2.1
        curve(t=>project(Math.cos(t*tau)*145,Math.sin(t*tau)*145,0,turn+k*1.05,.5+k*.45),k%2?accent:light,2.6,.85)
        for(let i=0;i<24;i++){const a=i*tau/24;const q=project(Math.cos(a)*145,Math.sin(a)*145,0,turn+k*1.05,.5+k*.45);orb(...q,2.5,accent,.7)}
      }
      orb(340,325,15+28*progress(.45,.68));ring(340,325,185,185,0,.2);text('星仪 · 校准完成',340,530,17,accent,progress(.65,.75))
    },
    'claude-art':()=>{
      const open=progress(.02,.23),w=190*open+8
      path([[340-w,234],[340,250],[340+w,234],[340+w,449],[340,465],[340-w,449]],'#b68153',3,1,true,'#36261f')
      for(let side=-1;side<=1;side+=2){const paper=ctx.createLinearGradient(340,0,340+side*w,0);paper.addColorStop(0,'#a88a61');paper.addColorStop(.15,'#d9be92');paper.addColorStop(1,'#f3e3c5');path([[340,257],[340+side*w*.95,243],[340+side*w*.95,435],[340,454]],'#eacb9c',1,1,true,paper)}
      for(let row=0;row<9;row++){path([[365,275+row*16],[490-(row%3)*15,266+row*16]],'#795e43',1.3,.65*open);path([[190,265+row*16],[315,275+row*16]],'#795e43',1.3,.65*open)}
      for(let i=2;i>=0;i--){const turn=progress(.24+i*.095,.43+i*.095),a=turn*Math.PI,x=340+Math.cos(a)*w*.93,lift=Math.sin(a)*64
        if(turn>0&&turn<1){const paper=ctx.createLinearGradient(340,0,x||341,0);paper.addColorStop(0,'#9f805a');paper.addColorStop(.24,turn<.5?'#e8cca3':'#c7a778');paper.addColorStop(1,'#fff0d3');path([[340,254],[x,240-lift],[x,436-lift],[340,453]],'#ad926a',1,1,true,paper)}}
      text('CHAPTER 01',245,325,15,'#6a4934',progress(.55,.64));text('新的篇章',245,360,20,'#6a4934',progress(.58,.68));orb(340,451,22,light,.5*progress(.65,.72))
    },
    'claude-anime':()=>{
      const h=210*progress(.04,.3)+12;ctx.fillStyle='#f1dec4';ctx.fillRect(212,300-h/2,260,h)
      for(const y of [300-h/2,300+h/2]){path([[202,y],[482,y]],'#af855e',12);path([[209,y-3],[474,y-3]],'#f8e4bf',3)}
      const lines=['致每一次好奇，','让问题成为起点，','让想象慢慢生长。'];lines.forEach((v,i)=>text(v.slice(0,Math.ceil(v.length*progress(.28+i*.11,.45+i*.11))),240,260+i*43,20,'#684c3b',1,'left'))
      const pen=progress(.28,.68);path([[210+pen*260,410],[230+pen*260,375]],light,3,1-progress(.68,.75));stamp('启',440,465)
    },
    'gemini-art':()=>{
      const a=progress(.06,.6),distance=130*(1-a)+42
      ctx.save();ctx.globalCompositeOperation='screen'
      for(let k=0;k<2;k++){
        const x=340+(k?1:-1)*distance,y=325+Math.sin(time*1.4+k*Math.PI)*30*(1-a)
        const color=k?'#ef9ae7':'#78baff';orb(x,y,100,color,.75)
        for(let j=0;j<5;j++)curve(t=>{const u=t*tau,r=70+j*8+8*Math.sin(u*4+time*1.4+k);return [x+Math.cos(u)*r,y+Math.sin(u)*r]},color,1.2,.25)
      }
      ctx.restore();const r=92*progress(.42,.7);curve(t=>{const a=t*tau,s=Math.pow(Math.abs(Math.sin(2*a)),.65);return [340+Math.cos(a)*(18+r*s),325+Math.sin(a)*(18+r*s)]},accent,2,progress(.4,.6));text('灵感，在交汇处发生',340,520,17,accent,progress(.6,.73))
    },
    'gemini-anime':()=>{
      const a=-.15+.3*progress(.06,.55);transform(340,330,a,()=>{path([[-62,90],[0,-105],[70,90]],light,2,1,true,'#819bd51c');path([[-62,90],[0,20],[70,90],[0,-105],[0,20]],accent,1,.6)})
      path([[95,325],[mix(95,330,progress(.02,.27)),325]],'#fff5dc',5,.9)
      const colors=['#ef99ae','#ffc192','#f0de9c','#b9e5b2','#85cdeb','#9fa8ef','#d9b0ed'];colors.forEach((color,i)=>{const q=progress(.25+i*.018,.58+i*.02);path([[345,328],[345+q*225,328+(i-3)*q*37]],color,3,.85);orb(345+q*225,328+(i-3)*q*37,7,color,q)})
      ring(340,330,180,180,0,.15);text('一道光，七种可能',340,545,18,accent,progress(.65,.75))
    },
    'deepseek-art':()=>{
      const turn=time*.67
      for(let r=45;r<=180;r+=45)ring(340,325,r,r,0,.28)
      path([[150,325],[530,325]],light,1,.18);path([[340,135],[340,515]],light,1,.18)
      for(let i=0;i<28;i++)path([[340,325],[340+Math.cos(turn-i*.018)*180,325+Math.sin(turn-i*.018)*180]],light,2,(1-i/28)*.13)
      const targets:Point[]=[[240,245],[440,390],[390,225]];targets.forEach(([x,y],i)=>{const hit=progress(.17+i*.13,.23+i*.13);orb(x,y,8,accent,hit);ring(x,y,12+16*((time*.5+i*.31)%1),12+16*((time*.5+i*.31)%1),0,hit*.5);if(i)path([targets[i-1],[x,y]],light,1,progress(.55,.7))})
      text('发现回声 · 连接深处',340,550,17,accent,progress(.58,.72))
    },
    'deepseek-anime':()=>{
      const q=progress(.02,.8),x=mix(130,565,q),y=335-70*Math.sin(q*Math.PI)
      for(let i=0;i<3;i++)ring(250+i*115,325,28+12*i,90+i*12,0,.3,light)
      transform(x,y,Math.sin(q*tau)*.14,()=>{
        const whale:Point[]=[];for(let i=0;i<=70;i++){const a=i*tau/70;whale.push([Math.cos(a)*86,Math.sin(a)*(a<Math.PI?31:39)])}path(whale,light,1,1,true,'#5b99bc');path([[-72,0],[-112,-40],[-101,0],[-118,30],[-72,12]],light,1,1,true,'#76b7d6');path([[-2,20],[-28,61],[31,29]],light,1,1,true,'#92cada');orb(51,-11,3,accent)
      })
      for(let i=0;i<14;i++){const u=clamp(q-i*.025);orb(mix(130,565,u)-65,335-70*Math.sin(u*Math.PI)+Math.sin(i)*15,2,light,.4*(1-i/14))}
      text('循着回响，游向远方',340,530,18,accent,progress(.58,.72))
    },
    'doubao-art':()=>{
      const bubbles=[{x:170,y:230,w:240,t:'你好，今天想聊什么？',a:.02},{x:285,y:330,w:220,t:'一个小小的灵感。',a:.23},{x:185,y:430,w:255,t:'好呀，我们一起试试。',a:.46}]
      bubbles.forEach((b,i)=>{const q=progress(b.a,b.a+.17),offset=24*(1-q);ctx.save();ctx.globalAlpha*=q;ctx.fillStyle=i%2?'#f2d4c2':'#3f4553';ctx.beginPath();ctx.roundRect(b.x,b.y+offset,b.w,62,20);ctx.fill();text(b.t,b.x+18,b.y+38+offset,17,i%2?'#594332':'#f5ded0',1,'left');ctx.restore();if(i)path([[b.x+40,b.y-32],[b.x+40,b.y-7]],light,2,q*.6)})
    },
    'doubao-anime':()=>{
      for(let i=0;i<5;i++){
        const q=clamp((p-.06-i*.075)/.19),bounce=q===0?150:Math.abs(Math.cos(q*Math.PI*2.5))*100*Math.pow(1-q,2),x=175+i*82,y=392-bounce
        curve(t=>[x-22+44*t,430+Math.sin(t*Math.PI*10)*(8+Math.max(0,35-bounce)*.2)],light,1.5,.7)
        orb(x,y,26,i%2?accent:light,progress(i*.04,.1+i*.04));path([[x-26,412],[x+26,412]],accent,3,.6)
      }
      text('一点快乐，传给下一位',340,530,20,accent,progress(.57,.72))
    },
    'qwen-art':()=>{
      const spread=progress(.02,.3),left=340-205*spread,right=340+205*spread
      ctx.fillStyle='#e5dbc3';ctx.fillRect(left,210,right-left,250)
      for(const x of [left,right]){path([[x,195],[x,475]],'#8e7661',15);path([[x-3,202],[x-3,469]],'#d8c9ae',4)}
      for(let k=0;k<3;k++)curve(t=>[left+25+t*Math.max(0,right-left-50),395-k*22-40*Math.sin(t*8+k)-30*Math.sin(t*17+k)],'#687c73',2+k*2,.5*spread,0,progress(.3+k*.065,.51+k*.065))
      text('山 海 有 问',340,272,26,'#53665e',progress(.45,.62));stamp('答',490,420)
    },
    'qwen-anime':()=>{
      const spread=progress(.03,.44)*2.3+.04
      for(let k=0;k<18;k++){
        const a=-Math.PI/2-spread/2+k*spread/17,b=a+spread/17
        path([[340,465],[340+Math.cos(a)*240,465+Math.sin(a)*240],[340+Math.cos(b)*240,465+Math.sin(b)*240]],light,.8,.8,true,k%2?'#cec5e3':'#b7aecb')
      }
      for(let i=0;i<10;i++){const a=-2.3+i*.15;leaf(340+Math.cos(a)*170,465+Math.sin(a)*170,18+8*Math.sin(i),a+time*.04,'#526b6a')}
      curve(t=>[100+t*470,200+Math.sin(t*8-time)*15],light,1.5,progress(.4,.55)*.5);text('风过竹影，万象可问',340,545,17,accent,progress(.55,.7))
    },
    'kimi-art':()=>{
      const moon=progress(.1,.68);ctx.fillStyle='#b5c6e2';ctx.beginPath();ctx.arc(340,315,88,0,tau);ctx.fill();ctx.save();ctx.beginPath();ctx.arc(340,315,88,0,tau);ctx.clip();ctx.fillStyle='#172437';ctx.beginPath();ctx.ellipse(340+moon*188,315,88,92,0,0,tau);ctx.fill();ctx.restore()
      ring(340,330,190,72,-.2,.5);const a=time*.56,x=340+Math.cos(a)*190,y=330+Math.sin(a)*72;orb(x,y,13);for(let i=0;i<8;i++)orb(160+i*49,495,3+3*Math.sin(i*Math.PI/7),accent,progress(i*.05,.15+i*.05))
      text('从新月，走到满月',340,548,18,accent,progress(.6,.74))
    },
    'kimi-anime':()=>{
      ring(340,310,140,140,0,.8);ring(340,310,154,154,0,.3)
      for(let i=0;i<12;i++){const a=i*tau/12;path([[340+Math.sin(a)*124,310-Math.cos(a)*124],[340+Math.sin(a)*139,310-Math.cos(a)*139]],accent,2,.85)}
      const q=progress(.08,.68),a=(1-q)*tau*2;path([[340,310],[340+Math.sin(a)*105,310-Math.cos(a)*105]],light,3);path([[340,310],[340+Math.sin(a*.2+.8)*65,310-Math.cos(a*.2+.8)*65]],accent,5);orb(340,310,8)
      const swing=Math.sin(time*2.4)*.45*(1-progress(.5,.75));path([[340,440],[340+Math.sin(swing)*125,440+Math.cos(swing)*100]],accent,2);orb(340+Math.sin(swing)*125,440+Math.cos(swing)*100,13)
    },
    'grok-art':()=>{
      const q=progress(.03,.7);ctx.fillStyle='#070a12';ctx.beginPath();ctx.arc(340,315,65+16*q,0,tau);ctx.fill()
      for(let k=0;k<20;k++){const r=90+k*4;curve(t=>{const a=t*tau+time*(.25+k*.015);return [340+Math.cos(a)*r,315+Math.sin(a)*r*.3+Math.sin(a*2)*20]},k%3?light:accent,1.5,(.15+.4*q)*(1-k/28))}
      for(let j=0;j<5;j++)curve(t=>{const x=100+t*480,d=(x-340)/90;return [x,205+j*47+Math.exp(-d*d)*(j-2)*32*q]},accent,1,.3)
      ring(340,315,82,82,0,.8);text('穿过未知的引力',340,540,20,accent,progress(.6,.72))
    },
    'grok-anime':()=>{
      const q=progress(.08,.6),gap=mix(144,89,q),word='GROK'
      for(let i=0;i<4;i++){const x=340+(i-1.5)*gap,y=365+(i%2?1:-1)*85*(1-q);strokeText(word[i],x,y,120,'#d4b67e');if(q>.55)text(word[i],x,y,120,'#e9d7b0',ease(.55,1,q)*.85)}
      const x=mix(120,560,progress(.4,.72));path([[x-35,198],[x+20,420]],accent,3,.6*Math.sin(progress(.35,.78)*Math.PI));path([[150,435],[530,435]],'#ad8b57',1,progress(.5,.65));text('好奇，不设边界',340,498,19,accent,progress(.62,.75))
    },
    'seed-art':()=>{
      path([[150,470],[540,470]],light,1,.4);const fall=progress(.01,.16);orb(340,mix(210,468,fall),9,accent,1-progress(.18,.25))
      curve(t=>[340+Math.sin(t*7)*12,470-t*245],light,4,1,0,progress(.16,.66))
      for(let i=0;i<9;i++){const q=progress(.24+i*.035,.4+i*.035),side=i%2?-1:1,x=340+Math.sin(i)*9,y=440-i*24;curve(t=>[x+side*t*80*q,y-t*45*q],light,2,.8);leaf(x+side*72*q,y-40*q,35*q,side<0?-2.6:-.55)}
      for(let i=0;i<5;i++)curve(t=>[340+(i-2)*35*t,470+Math.sin(t)*50],light,1.3,.4,0,progress(.18,.4));text('从一粒种子开始',340,570,19,accent,progress(.65,.78))
    },
    'seed-anime':()=>{
      const q=progress(.05,.63),fold=Math.cos((1-q)*Math.PI*.48),r=125
      transform(340,330,-.25,()=>{path([[0,-r],[r*fold,0],[0,r],[-r*fold,0]],light,2,1,true,'#84a475');path([[0,-r],[0,r]],accent,2,.9);for(let i=1;i<6;i++){const y=-r+i*40,x=(r-Math.abs(y))*.8*fold;path([[0,y+12],[x,y-17]],accent,1,.65);path([[0,y+12],[-x,y-17]],accent,1,.65)}})
      for(let i=0;i<3;i++)leaf(305+i*28,463,26*progress(.5+i*.04,.67+i*.04),-1.1-i*.4);text('折起一片新绿',340,540,19,accent,progress(.62,.75))
    },
    'copilot-art':()=>{
      const speed=progress(.02,.4),vanish:Point=[340,225]
      for(let i=-4;i<=4;i++)path([vanish,[340+i*100,545]],light,1,.24)
      for(let i=0;i<12;i++){const z=((i/12+time*.11*speed)%1),y=225+z*z*320;path([[340-z*330,y],[340+z*330,y]],light,2,z*.5)}
      for(let i=0;i<6;i++){const z=(i/6+time*.07)%1;ctx.save();ctx.globalAlpha*=Math.sin(z*Math.PI)*.6;const y=230+z*z*280;path([[340-z*220,y],[340-z*220,y-z*155],[340+z*220,y-z*155],[340+z*220,y]],accent,2);ctx.restore()}
      path([[315,365],[340,333],[365,365],[340,352]],accent,2,1,true,'#a8cef0');text('航线已就绪',340,585,18,accent,progress(.58,.73))
    },
    'copilot-anime':()=>{
      const fold=progress(.02,.28),flight=progress(.3,.78),a=flight*tau*.82,x=340+Math.sin(a)*180*flight,y=330-Math.sin(a*.5)*125
      transform(x,y,-.32-flight*.8,()=>{path([[-100,60],[85,-40],[-20,75],[-32,13]],light,2,1,true,'#ccdce7');path([[-100,60],[-32,13],[85,-40],[mix(-100,-20,fold),mix(60,75,fold)]],accent,1.5,1,true,'#91b3cc');path([[-32,13],[-20,75]],'#516b82',1.5)})
      curve(t=>{const a=t*tau*.82;return [340+Math.sin(a)*180*t,330-Math.sin(a*.5)*125]},light,1,.55,0,flight);ring(340,275,145,70,0,.25);text('把灵感送向远方',340,540,18,accent,progress(.62,.76))
    },
    'perplexity-art':()=>{
      const nodes:Point[]=[[155,340],[265,230],[270,440],[400,200],[420,340],[435,470],[555,310]],edges=[[0,1],[0,2],[1,3],[1,4],[2,4],[2,5],[3,6],[4,6],[5,6]]
      edges.forEach(([a,b],i)=>{const q=progress(.1+i*.035,.25+i*.035),from=nodes[a],to=nodes[b];path([from,[mix(from[0],to[0],q),mix(from[1],to[1],q)]],light,1.6,.65);const flow=(time*.35+i*.1)%1;if(q===1)orb(mix(from[0],to[0],flow),mix(from[1],to[1],flow),5,accent,.75)})
      nodes.forEach(([x,y],i)=>{const q=progress(i*.035,.1+i*.035);ring(x,y,i===0||i===6?23:13,undefined,0,q);orb(x,y,7,light,q)});text('?',155,347,20);text('✓',555,317,20,accent,progress(.55,.68));text('让问题找到路径',340,565,18,accent,progress(.6,.75))
    },
    'perplexity-anime':()=>{
      const focus=progress(.05,.67)
      for(let i=0;i<14;i++){const x=170+(i*97)%345,y=200+(i*61)%240;orb(x,y,mix(15,3,focus),i%2?light:accent,.45)}
      for(let k=0;k<2;k++){const x=mix(k?470:210,340,focus);ring(x,325,104+k*20,104+k*20,0,.8);ring(x,325,98+k*20,98+k*20,0,.3);path([[x+75,407],[x+117,450]],accent,5,.7)}
      path([[322,325],[358,325]],accent,1.5);path([[340,307],[340,343]],accent,1.5);orb(340,325,7,accent,focus);text('对焦完成 · 发现答案',340,545,18,accent,progress(.64,.75))
    },
    'minimax-art':()=>{
      const rotation=time*progress(.1,.3)*1.3;ctx.fillStyle='#152330';ctx.beginPath();ctx.arc(320,325,140,0,tau);ctx.fill();for(let r=40;r<140;r+=7)ring(320,325,r,r,0,.22)
      transform(320,325,rotation,()=>{path([[0,-132],[20,-39]],light,18,.08);orb(0,0,35,light,.85);text('M',0,8,24,'#24363d')})
      const needle=progress(.02,.23);path([[530,190],[mix(520,461,needle),315],[mix(510,425,needle),349]],accent,7,.9);orb(530,190,12,accent)
      for(let i=0;i<3;i++){const u=(time*.25+i/3)%1;ring(320,325,145+u*65,145+u*65,0,(1-u)*.25*progress(.22,.35))}text('把此刻，调成喜欢的频率',340,555,17,accent,progress(.6,.75))
    },
    'minimax-anime':()=>{
      const pluck=progress(.18,.6),decay=1-progress(.68,.85),opened=progress(.01,.18)
      for(let k=0;k<7;k++){
        const y=220+k*32;curve(t=>[345+(t-.5)*390*opened,y+Math.sin(t*Math.PI)*Math.sin(t*20-time*5+k)*18*Math.sin(pluck*Math.PI)*decay],k%2?accent:light,1.6,.8);orb(345-195*opened,y,4,light);orb(345+195*opened,y,4,light)
      }
      const x=mix(145,545,pluck);path([[x,195],[x+12,443]],accent,1.3,Math.sin(pluck*Math.PI));orb(x,315,18,light,Math.sin(pluck*Math.PI));text('每一道回响，都有回应',340,545,18,accent,progress(.64,.76))
    },
    aurora:()=>{
      for(let k=0;k<65;k++){const x=125+k*7.2,y=240+Math.sin(k*.065+time*.28)*55;const h=(100+70*Math.sin(k*.08+time*.2))*progress(.02,.55);const g=ctx.createLinearGradient(x,y,x,y+h);g.addColorStop(0,light+'00');g.addColorStop(.6,k%3?light+'70':accent+'70');g.addColorStop(1,light+'00');ctx.fillStyle=g;ctx.fillRect(x,y,4,h)}
      path([[100,485],[190,390],[268,452],[370,370],[460,457],[580,406],[600,510]],'#a8c1cd',1,.7,true,'#1f3648');text('极夜之上，光正在流动',340,555,18,accent,progress(.6,.76))
    },
    sakura:()=>{
      curve(t=>[125+t*430,460-220*t+45*Math.sin(t*4)],'#ac8b9f',5,.9)
      for(let i=0;i<10;i++){const q=progress(.05+i*.045,.2+i*.045),x=165+i*38,y=440-i*19+Math.sin(i*2)*25;path([[x-24,y+35],[x,y]],'#ac8b9f',2,.8);for(let k=0;k<5;k++)transform(x,y,k*tau/5+time*.015,()=>{ctx.fillStyle=k%2?light:accent;ctx.beginPath();ctx.ellipse(0,-12*q,7*q,13*q,0,0,tau);ctx.fill()});orb(x,y,4,accent,q)}
      const drift=progress(.56,.85);for(let k=0;k<5;k++)leaf(240+k*53+drift*85,300+k*16+drift*130,9*drift,k+time*.2,light)
    },
    city:()=>{
      const heights=[100,170,135,220,190,145,110]
      heights.forEach((h,i)=>{const x=120+i*66;ctx.fillStyle='#152d3d';ctx.fillRect(x,465-h,50,h);path([[x,465],[x,465-h],[x+50,465-h],[x+50,465]],light,1,.35);for(let row=0;row<h/18-1;row++)for(let col=0;col<3;col++){ctx.save();ctx.globalAlpha*=progress(.08+i*.055+row*.012,.13+i*.055+row*.012);ctx.fillStyle=(col+row+i)%3?light:accent;ctx.fillRect(x+8+col*12,475-h+row*18,5,8);ctx.restore()}})
      const q=progress(.05,.68);path([[95,485],[95+q*515,485]],accent,3);orb(95+q*515,485,11,accent);text('整座城市，与你连接',340,555,18,accent,progress(.61,.75))
    },
    ocean:()=>{
      const fall=progress(.01,.24),hit=progress(.24,.78);orb(340,mix(170,385,fall),12,accent,1-progress(.24,.29))
      for(let i=0;i<7;i++){const r=Math.max(0,hit*260-i*24);if(r)ring(340,385,r,r*.27,0,(1-hit)*.65+Math.sin(hit*Math.PI)*.2,i%2?light:accent)}
      if(p>.24)for(let i=0;i<12;i++){const a=i*tau/12,h=progress(.24,.49);orb(340+Math.cos(a)*h*120,385+Math.sin(a)*h*30-Math.sin(h*Math.PI)*80,3,light,1-h)}
      path([[115,390],[565,390]],light,1,.16);text('一滴灵感，推开万顷涟漪',340,550,17,accent,progress(.58,.74))
    },
    orbit:()=>{
      orb(340,325,85,accent,.8)
      for(let k=0;k<4;k++){const align=progress(.08+k*.04,.65+k*.02),tilt=mix(k*.7-.8,.32,align),r=120+k*26;curve(t=>project(Math.cos(t*tau)*r,Math.sin(t*tau)*r,0,k*.2,tilt),light,1.4,.6);const a=time*(.45-k*.06)+k;const pos=project(Math.cos(a)*r,Math.sin(a)*r,0,k*.2,tilt);orb(...pos,9-k,accent)}
      text('相隔万里，终将会合',340,555,18,accent,progress(.62,.76))
    },
    ink:()=>{
      ctx.save();ctx.globalAlpha*=.94;ctx.fillStyle='#ede8d9';ctx.fillRect(100,180,490,330);ctx.restore()
      for(let k=0;k<5;k++){const points:Point[]=[];const q=progress(.03+k*.085,.27+k*.085);for(let j=0;j<=80*q;j++){const t=j/80;points.push([125+t*440,420-k*26-50*Math.sin(t*5+k*.7)-35*Math.sin(t*13+k)])}path(points,'#526c67',6-k,.7)}
      for(let i=0;i<3;i++){const q=progress(.57,.78),x=220+i*70+q*80,y=245+i*18;path([[x-10,y],[x,y-5],[x+10,y]],'#506963',1.5,q)}stamp('山',535,452)
    },
    forest:()=>{
      for(let i=0;i<9;i++){const x=130+i*53,h=110+i%3*35;path([[x,480-h],[x-30,480],[x+30,480]],light,1,.18,true,'#153b39')}
      const q=progress(.03,.8);curve(t=>[125+t*450,465-t*180+30*Math.sin(t*9)],light,1.5,.35,0,q)
      for(let i=0;i<20;i++){const u=i/20,x=125+u*450,y=465-u*180+30*Math.sin(u*9),lit=progress(u*.6,.1+u*.6);orb(x,y+Math.sin(time+i)*4,7,light,lit*.65)}
      orb(125+q*450,465-q*180+30*Math.sin(q*9),15,accent);text('跟着微光，找到归途',340,555,18,accent,progress(.65,.78))
    },
    crystal:()=>{
      const rotation=time*.25,vertices: [number,number,number][]=[[0,-155,0],[0,155,0],[-120,0,0],[120,0,0],[0,0,-110],[0,0,110]]
      const faces=[[0,2,4],[0,4,3],[0,3,5],[0,5,2],[1,2,4],[1,4,3],[1,3,5],[1,5,2]]
      faces.forEach((face,i)=>{const q=progress(.02+i*.04,.22+i*.04);path(face.map(v=>project(...vertices[v],rotation,.3)),i%2?light:accent,1.5,q,true,(i%2?light:accent)+'18')})
      const beam=progress(.38,.7);path([[95,325],[340,325],[340+beam*240,325-beam*120]],accent,2,beam);path([[340,325],[340+beam*240,325+beam*100]],light,2,beam);orb(340,325,25,accent,beam)
    }
  }
  const drawScene=scenes[spec.theme.id]
  if(!drawScene)throw Error('主题演出未实现：'+spec.theme.id)
  canvas.dataset.intro=spec.theme.id;canvas.dataset.sequence=spec.theme.id;canvas.dataset.deformation='none'
  function draw(seconds:number){
    p=clamp(seconds*1000/spec.durationMs);time=p*12
    ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(background,0,0,canvas.width,canvas.height)
    canvas.dataset.phase=p<.25?'opening':p<.57?'interaction':p<story.exit?'resolution':p<1?'handoff':'complete'
    if(p>=1)return
    const exit=1-ease(story.exit,1,p)
    // 以左侧留白容纳演出，整张人物图从首帧就在场；收尾回到原背景，无揭图遮罩。
    ctx.save();ctx.scale(canvas.width/1280,canvas.height/720);ctx.globalAlpha=exit
    const shade=ctx.createLinearGradient(0,0,1060,0);shade.addColorStop(0,'#050b14ee');shade.addColorStop(.48,'#050b14e0');shade.addColorStop(1,'#050b1400');ctx.fillStyle=shade;ctx.fillRect(0,0,1280,720)
    const ambient=ctx.createRadialGradient(340,320,30,340,320,350);ambient.addColorStop(0,light+'15');ambient.addColorStop(1,light+'00');ctx.fillStyle=ambient;ctx.fillRect(0,0,750,720)
    drawScene()
    text(spec.theme.name,90,86,26,accent,.9, 'left');text(story.name,92,120,15,light,.7,'left')
    const beat=p<.25?0:p<.57?1:2;text(story.beats[beat],92,632,18,accent,.8,'left')
    ctx.restore()
  }
  return {draw,dispose(){}}
}

