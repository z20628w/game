import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';

// 仅在眼周移动纹理和眼睑边界；人物、镜头和背景不发生缩放。
const browser=await chromium.launch({headless:true,executablePath:process.env.GPT_PREVIEW_BROWSER});
await mkdir('preview/eye-motion-frames',{recursive:true});
try{
  const page=await browser.newPage();
  const images=await Promise.all(['artwork.jpg','artwork-blink.jpg'].map(async name=>'data:image/jpeg;base64,'+(await readFile('assets/'+name)).toString('base64')));
  await page.evaluate(async sources=>{
    const images=await Promise.all(sources.map(async src=>{const img=new Image();img.src=src;await img.decode();return img;}));
    const width=images[0].naturalWidth,height=images[0].naturalHeight;
    const source=images.map(image=>{const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);return ctx.getImageData(0,0,width,height).data;});
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
    const ctx=canvas.getContext('2d'),patch=ctx.createImageData(210,150);
    const smooth=n=>{const t=Math.max(0,Math.min(1,n));return t*t*(3-2*t);};
    const eyes=[{x:1052,y:249,w:27,h:24,angle:-.43},{x:1132,y:210,w:27,h:25,angle:-.36}];
    function sample(data,x,y,c){
      x=Math.max(0,Math.min(width-2,x));y=Math.max(0,Math.min(height-2,y));
      const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy,index=(iy*width+ix)*4+c;
      return (data[index]*(1-fx)+data[index+4]*fx)*(1-fy)+(data[index+width*4]*(1-fx)+data[index+width*4+4]*fx)*fy;
    }
    window.renderEyeFrame=(milliseconds)=>{
      const opening=smooth((milliseconds-180)/750);
      for(let y=0;y<150;y++)for(let x=0;x<210;x++){
        const px=x+995,py=y+155,offset=(y*210+x)*4;
        let eye=null,u=0,v=0,mask=0;
        for(const candidate of eyes){
          const dx=px-candidate.x,dy=py-candidate.y,cs=Math.cos(candidate.angle),sn=Math.sin(candidate.angle);
          const tx=dx*cs+dy*sn,ty=-dx*sn+dy*cs;
          const weight=1-smooth((Math.hypot(tx/candidate.w,ty/candidate.h)-.78)/.22);
          if(weight>mask){eye=candidate;u=tx;v=ty;mask=weight;}
        }
        for(let c=0;c<3;c++){
          const base=sample(source[0],px,py,c);
          let value=base;
          if(eye&&opening<1){
            const arch=Math.max(0,1-(u/eye.w)**2),closedLine=6*arch,openLine=-11*arch;
            const lid=closedLine+(openLine-closedLine)*opening;
            const shift=(closedLine-lid)*Math.exp(-(((v-lid)/19)**2));
            const sx=px-Math.sin(eye.angle)*shift,sy=py+Math.cos(eye.angle)*shift;
            const closed=sample(source[1],sx,sy,c);
            const reveal=smooth((v-lid-1)/2)*smooth(opening/.12);
            const moving=closed*(1-reveal)+base*reveal;
            const finish=smooth((opening-.72)/.28);
            value=base*(1-mask)+((1-finish)*moving+finish*base)*mask;
          }
          patch.data[offset+c]=value;
        }
        patch.data[offset+3]=255;
      }
      ctx.drawImage(images[0],0,0);ctx.putImageData(patch,995,155);
      return canvas.toDataURL('image/png');
    };
  },images);
  for(let frame=0;frame<45;frame++){
    const png=await page.evaluate(ms=>window.renderEyeFrame(ms),frame*1000/30);
    await writeFile(`preview/eye-motion-frames/${String(frame).padStart(3,'0')}.png`,Buffer.from(png.split(',')[1],'base64'));
  }
}finally{await browser.close();}
async function encode(args){
  const process=spawn('ffmpeg',['-hide_banner','-loglevel','error','-xerror','-y','-threads','1','-framerate','30','-i','preview/eye-motion-frames/%03d.png',...args],{stdio:'inherit',windowsHide:true});
  await new Promise((resolve,reject)=>{process.once('error',reject);process.once('exit',code=>code===0?resolve():reject(Error('动画编码失败：'+code)));});
}
await encode(['-c:v','libvpx-vp9','-lossless','1','-pix_fmt','yuv444p','-an','assets/eye-open-motion.webm']);
await encode(['-filter_complex','[0:v]scale=1000:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=sierra2_4a','-loop','0','preview/睁眼动画.gif']);
console.log('已生成 45 帧连续眼睑动作、WebM 播放素材和 GIF 预览。');
