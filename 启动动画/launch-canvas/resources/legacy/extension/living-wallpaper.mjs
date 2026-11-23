// 用闭眼关键帧和局部发丝位移驱动人物；不读取宿主应用内容。
export function createLivingWallpaper(openURL, closedURL) {
  const canvas=document.createElement('canvas');
  canvas.id='aemeath-living-wallpaper';canvas.setAttribute('aria-hidden','true');
  const gl=canvas.getContext('webgl',{alpha:false,antialias:false,powerPreference:'low-power',preserveDrawingBuffer:true});
  if(!gl)return null;
  let disposed=false,frame=0,loaded=false,suspended=false,lastTime=0,clock=0,frames=0,error=null;
  const textures=[],shaders=[];
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const vertex=`attribute vec2 position; varying vec2 uv; void main(){uv=vec2((position.x+1.0)*0.5,(1.0-position.y)*0.5);gl_Position=vec4(position,0.,1.);}`;
  const fragment=`precision mediump float;
  varying vec2 uv; uniform sampler2D portrait; uniform sampler2D blinkPortrait;
  uniform vec2 viewSize; uniform vec2 imageSize; uniform float seconds;
  float ellipse(vec2 p,vec2 center,vec2 radius){return 1.0-smoothstep(0.55,1.0,length((p-center)/radius));}
  void main(){
    float scale=max(viewSize.x/imageSize.x,viewSize.y/imageSize.y);
    vec2 p=(uv*viewSize-(viewSize-imageSize*scale)*0.5)/(imageSize*scale);
    float face=ellipse(p,vec2(.652,.272),vec2(.09,.14));
    float leftHair=ellipse(p,vec2(.48,.64),vec2(.19,.34));
    float rightHair=ellipse(p,vec2(.84,.52),vec2(.13,.32));
    float topHair=ellipse(p,vec2(.603,.19),vec2(.06,.16));
    // 首帧与睁眼素材保持同一姿态，交接后再逐渐开始发丝摆动。
    float hair=max(max(leftHair,rightHair),topHair)*(1.0-face)*smoothstep(0.0,0.8,seconds);
    vec2 moved=p;
    moved.x+=hair*(sin(seconds*1.1+p.y*12.)*.0018+sin(seconds*.63+p.y*23.)*.0006);
    moved.y+=hair*sin(seconds*.92+p.x*13.)*.0008;
    vec4 base=texture2D(portrait,moved);
    float phase=mod(seconds+1.1,5.6);
    float blink=smoothstep(4.7,4.8,phase)*(1.0-smoothstep(4.88,5.02,phase));
    float eyeMask=max(ellipse(p,vec2(.630,.265),vec2(.025,.029)),ellipse(p,vec2(.677,.222),vec2(.026,.029)));
    vec4 closed=texture2D(blinkPortrait,p);
    gl_FragColor=vec4(mix(base.rgb,closed.rgb,blink*eyeMask),1.);
  }`;
  const program=gl.createProgram(),buffer=gl.createBuffer();
  function shader(type,source){
    const value=gl.createShader(type);gl.shaderSource(value,source);gl.compileShader(value);shaders.push(value);
    if(!gl.getShaderParameter(value,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(value));
    gl.attachShader(program,value);
  }
  try{
    shader(gl.VERTEX_SHADER,vertex);shader(gl.FRAGMENT_SHADER,fragment);gl.linkProgram(program);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
  }catch(reason){shaders.forEach(value=>gl.deleteShader(value));gl.deleteProgram(program);gl.deleteBuffer(buffer);return null;}
  gl.useProgram(program);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
  gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
  const position=gl.getAttribLocation(program,'position');gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
  const view=gl.getUniformLocation(program,'viewSize'),dimensions=gl.getUniformLocation(program,'imageSize'),time=gl.getUniformLocation(program,'seconds');
  function resize(){
    const width=innerWidth,height=innerHeight,scale=Math.min(1,1600/width,1000/height);
    canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));
    gl.viewport(0,0,canvas.width,canvas.height);gl.uniform2f(view,width,height);
    if(loaded)draw(clock);
  }
  function draw(seconds){gl.uniform1f(time,seconds);gl.drawArrays(gl.TRIANGLES,0,6);canvas.dataset.seconds=seconds.toFixed(2);frames++;}
  function tick(now){
    frame=0;if(disposed||!loaded||suspended||document.hidden||reduced.matches)return;
    if(!lastTime)lastTime=now;
    if(now-lastTime>=32){clock+=Math.min(.1,(now-lastTime)/1000);lastTime=now;draw(clock);}
    frame=requestAnimationFrame(tick);
  }
  function resume(){cancelAnimationFrame(frame);frame=0;lastTime=0;if(!disposed&&loaded&&!suspended&&!document.hidden&&!reduced.matches)frame=requestAnimationFrame(tick);}
  function dispose(){
    if(disposed)return;disposed=true;cancelAnimationFrame(frame);canvas.remove();
    window.removeEventListener('resize',resize);document.removeEventListener('visibilitychange',resume);reduced.removeEventListener('change',resume);
    textures.forEach(value=>gl.deleteTexture(value));shaders.forEach(value=>gl.deleteShader(value));gl.deleteBuffer(buffer);gl.deleteProgram(program);gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
  const images=[openURL,closedURL].map(url=>{const image=new Image();image.src=url;return image;});
  // 原生窗口转场期间可能被 Chromium 判定为遮挡；decode() 等待绘制机会会与显示保护互相等待。
  // 纹理上传直接使用已完成 load 的图像，并由下面的同步 draw / flush 准备首帧。
  const ready=Promise.all(images.map(image=>new Promise((resolve,reject)=>{
    if(image.complete){image.naturalWidth?resolve():reject(Error('背景图片无法载入'));return;}
    image.onload=()=>resolve();image.onerror=()=>reject(Error('背景图片无法载入'));
  }))).then(()=>{
    if(disposed)return false;
    images.forEach((image,index)=>{
      const texture=gl.createTexture();textures.push(texture);gl.activeTexture(gl.TEXTURE0+index);gl.bindTexture(gl.TEXTURE_2D,texture);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGB,gl.RGB,gl.UNSIGNED_BYTE,image);
      gl.uniform1i(gl.getUniformLocation(program,index?'blinkPortrait':'portrait'),index);
    });
    gl.uniform2f(dimensions,images[0].naturalWidth,images[0].naturalHeight);
    loaded=true;resize();draw(0);gl.flush();document.body.prepend(canvas);resume();return true;
  }).catch(reason=>{error=reason.message;dispose();return false;});
  window.addEventListener('resize',resize);document.addEventListener('visibilitychange',resume);reduced.addEventListener('change',resume);
  canvas.addEventListener('webglcontextlost',()=>{error='图形上下文丢失';dispose();});
  return {ready,dispose,setStrength:value=>{canvas.style.opacity=String(value/100);},pause:value=>{suspended=value;resume();},status:()=>({ready:loaded,active:loaded&&!disposed,paused:suspended||document.hidden||reduced.matches,frames,seconds:clock,error})};
}
