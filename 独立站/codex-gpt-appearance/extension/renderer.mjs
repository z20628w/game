// Runtime-only appearance layer. No writes to the installed application.
export function installRenderer(payload, mount, createLivingWallpaper) {
  if(window.top!==window)return {installed:false,reason:'child-frame'};
  if(window.__aemeathExtension)return {installed:true,alreadyActive:true};
  let frame=null,watchdog=0,observer=null,priorFocus=null,disposed=false;
  let ready=false,completed=false,phase='loading',wallpaperURL=null,lastImage=null,metrics=null;
  let living=null,backgroundPrepared=Promise.resolve(),preparationTimer=0,backgroundState='pending';
  const root=document.documentElement;
  const before=new Map(['--aemeath-wallpaper','--aemeath-wash'].map(key=>[key,[root.style.getPropertyValue(key),root.style.getPropertyPriority(key)]]));
  const originalAttribute=root.getAttribute('data-aemeath-skin');
  const style=document.createElement('style');style.id='aemeath-extension-style';style.textContent=payload.skin;
  function removeOverlay(){
    clearTimeout(watchdog);clearTimeout(preparationTimer);observer?.disconnect();observer=null;
    frame?.remove();frame=null;
    living?.pause(false);
    if(priorFocus?.isConnected)priorFocus.focus();priorFocus=null;
  }
  function dispose(){
    if(disposed)return;disposed=true;removeOverlay();style.remove();living?.dispose();living=null;
    if(wallpaperURL)URL.revokeObjectURL(wallpaperURL);wallpaperURL=null;lastImage=null;
    originalAttribute===null?root.removeAttribute('data-aemeath-skin'):root.setAttribute('data-aemeath-skin',originalAttribute);
    for(const [key,[value,priority]] of before)value?root.style.setProperty(key,value,priority):root.style.removeProperty(key);
    window.removeEventListener('message',message);window.removeEventListener('keydown',keyboard,true);
    delete window.__aemeathExtension;
  }
  function background(data){
    if(typeof data.image!=='string'||!/^data:image\/(png|jpeg|webp);base64,/.test(data.image))return;
    if(!style.isConnected)document.head.appendChild(style);
    const strength=Number.isFinite(data.strength)?Math.max(0,Math.min(75,data.strength)):42;
    // Large data URLs exceed CSS custom-property token limits in Chromium.
    // A short local Blob URL also avoids copying megabytes into each style value.
    if(strength>0&&data.image!==lastImage){
      const comma=data.image.indexOf(','),mime=data.image.slice(5,data.image.indexOf(';'));
      const binary=atob(data.image.slice(comma+1)),bytes=new Uint8Array(binary.length);
      for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
      const previous=wallpaperURL;wallpaperURL=URL.createObjectURL(new Blob([bytes],{type:mime}));lastImage=data.image;
      root.style.setProperty('--aemeath-wallpaper',`url(${JSON.stringify(wallpaperURL)})`);
      if(previous)URL.revokeObjectURL(previous);
    }
    if(strength===0){root.style.removeProperty('--aemeath-wallpaper');if(wallpaperURL)URL.revokeObjectURL(wallpaperURL);wallpaperURL=null;lastImage=null;}
    root.style.setProperty('--aemeath-wash',String(1-strength/100));
    root.toggleAttribute('data-aemeath-skin',strength>0);
    const animate=strength>0&&data.motion!==false&&data.image===payload.assets.artwork;
    if(animate){
      if(!living)living=createLivingWallpaper(payload.assets.artwork,payload.assets.blink);
      living?.setStrength(strength);living?.pause(!!frame);
    }else{living?.dispose();living=null;}
    // 静态回退也先解码；动态 ready 在纹理上传和首帧绘制完成后才返回。
    const still=new Image();
    const staticReady=wallpaperURL?(still.src=wallpaperURL,still.decode().then(()=>true,()=>false)):Promise.resolve(true);
    const candidate=living;
    backgroundPrepared=Promise.all([staticReady,candidate?.ready??Promise.resolve(false)]).then(([staticOK,motionOK])=>{
      if(candidate&&candidate===living&&!motionOK){candidate.dispose();living=null;}
      return motionOK?'motion-ready':strength===0?'disabled':staticOK?'static-ready':'unavailable';
    });
  }
  async function prepared(current){
    const result=await Promise.race([backgroundPrepared,new Promise(resolve=>{preparationTimer=setTimeout(()=>resolve('static-fallback'),2000);})]);
    clearTimeout(preparationTimer);
    if(disposed||frame!==current)return;
    // 慢解码不能无限阻塞恢复窗口，超时后保留已经准备的静态背景。
    if(result==='static-fallback'){living?.dispose();living=null;}
    backgroundState=result;ready=true;phase='prepared';
  }
  function show(settings=false){
    if(disposed||frame)return;
    priorFocus=document.activeElement;ready=false;completed=false;phase=settings?'settings':'loading';living?.pause(true);
    frame=document.createElement('iframe');frame.id='aemeath-extension-overlay';frame.title='启动动画';
    Object.assign(frame.style,{position:'fixed',inset:'0',width:'100%',height:'100%',border:'0',zIndex:'2147483646',background:'#08060d',colorScheme:'dark'});
    frame.style.visibility=payload.deferStart&&!settings?'hidden':'visible';
    const current=frame;
    current.addEventListener('load',()=>{
      if(frame!==current||disposed)return;
      try{
        const win=current.contentWindow,doc=win.document;
        // No inline script, eval, network server, or CSP change is needed.
        doc.documentElement.innerHTML=payload.html;
        const css=doc.createElement('style');css.textContent=payload.css;doc.head.appendChild(css);
        win.AEMEATH_EXTERNAL=true;win.AEMEATH_ASSETS=payload.assets;win.AEMEATH_OPEN_SETTINGS=settings;
        win.AEMEATH_PREWARM=payload.deferStart&&!settings;
        win.AEMEATH_TRANSITION=settings?'startup':payload.transition;
        // The function is compiled in the parent realm. A closure-bound bridge
        // preserves frame identity without weakening postMessage source checks.
        win.AEMEATH_SEND=data=>message({source:win,data});
        mount(win);current.focus();
      }catch(error){phase='failed';console.error('Aemeath extension:',error.message);removeOverlay();}
    },{once:true});
    current.src='about:blank';document.body.appendChild(current);
    watchdog=setTimeout(()=>{phase='timeout';removeOverlay();},payload.deferStart&&!settings?60000:25000);
  }
  function message(event){
    if(!frame||event.source!==frame.contentWindow||event.data?.type!=='aemeath-boot')return;
    const data=event.data;
    if(data.action==='reopen-blend'&&payload.transition==='reopen'&&phase!=='settings'&&Number.isFinite(data.opacity)){
      frame.style.opacity=String(Math.max(0,Math.min(1,data.opacity)));
    }
    if(data.action==='background')background(data);
    if(data.action==='ready'){
      if(payload.deferStart&&payload.transition==='reopen'&&phase!=='settings'){
        phase='preparing-background';void prepared(frame);
      }else{ready=true;phase=payload.deferStart&&phase!=='settings'?'prepared':'playing';}
    }
    if(data.action==='complete'){metrics=data.metrics||null;completed=true;phase='complete';removeOverlay();}
    if(data.action==='assetError'){phase='failed';removeOverlay();}
    if(data.action==='settings-open'){phase='settings';clearTimeout(watchdog);}
    if(data.action==='settings-close'){phase='playing';watchdog=setTimeout(removeOverlay,25000);}
    if(data.action==='restore')dispose();
  }
  function keyboard(event){
    if((event.metaKey||event.ctrlKey)&&event.altKey&&event.code==='KeyB'){event.preventDefault();show(true);}
  }
  window.addEventListener('message',message);window.addEventListener('keydown',keyboard,true);
  function settled(){return ready&&document.readyState==='complete';}
  function prepareToShow(){
    if(!ready||!frame||phase!=='prepared')return false;
    frame.style.visibility='visible';
    return true;
  }
  function start(){
    if(!ready||!frame||phase!=='prepared')return false;
    if(document.visibilityState!=='visible')return false;
    frame.style.visibility='visible';
    const begun=frame.contentWindow.launcherUI.beginLaunch(false);
    if(!begun)return false;
    completed=false;phase='playing';frame.style.visibility='visible';frame.focus();
    clearTimeout(watchdog);watchdog=setTimeout(removeOverlay,25000);
    return true;
  }
  async function startWhenSmooth(){
    return start();
  }
  window.__aemeathExtension={version:2,dispose,prepareToShow,start,startWhenSmooth,openSettings:()=>show(true),status:()=>({ready,completed,phase,backgroundState,settled:settled(),metrics,overlay:!!frame,visibility:document.visibilityState,wallpaper:root.hasAttribute('data-aemeath-skin'),motion:living?.status()||null,imageBytes:root.style.getPropertyValue('--aemeath-wallpaper').length})};
  if(document.body)show();
  else{observer=new MutationObserver(()=>{if(document.body){observer.disconnect();observer=null;show();}});observer.observe(document,{childList:true,subtree:true});}
  return {installed:true};
}
