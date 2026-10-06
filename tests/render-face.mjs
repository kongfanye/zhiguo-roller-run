import {chromium} from 'playwright-core';
import {createServer} from 'node:http';
import {readFileSync,existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const root=resolve('docs'),out=resolve('../character-v9-checks');mkdirSync(out,{recursive:true});
const server=createServer((req,res)=>{const p=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!p.startsWith(root)||!existsSync(p)){res.writeHead(404);res.end();return;}res.setHeader('Content-Type','text/html; charset=utf-8');res.end(readFileSync(p));});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1024}});
 await page.goto(`http://127.0.0.1:${server.address().port}/character.html`);await page.waitForFunction(()=>window.__characterPreview?.character.state.ready);await page.waitForTimeout(300);
 await page.evaluate(()=>{const p=window.__characterPreview;p.state.paused=true;const coast={...p.ctx,speed:0,pedal:0};for(let i=0;i<300;i++)p.character.update(1/60,coast);});
 const bounds={};
 for(const i of [0,1,2,3,4,5,6,7]){
   await page.evaluate(i=>window.__characterPreview.view(i,'face',true),i);await page.waitForTimeout(70);await page.locator('#stage').screenshot({path:`${out}/face-${i}.png`});
   bounds[i]=await page.evaluate(()=>{
     const p=window.__characterPreview,m=p.character.upper.skull,a=m.geometry.attributes.position,v=m.position.clone(),width=p.renderer.domElement.clientWidth,height=p.renderer.domElement.clientHeight;
     let left=width,top=height,right=0,bottom=0;
     for(let n=0;n<a.count;n++){if(a.getY(n)<-.10)continue;v.fromBufferAttribute(a,n).applyMatrix4(m.matrixWorld).project(p.camera);const x=(v.x+1)*width/2,y=(1-v.y)*height/2;left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
     return [Math.max(0,Math.floor(left-22)),Math.max(0,Math.floor(top-18)),Math.min(width,Math.ceil(right+22)),Math.min(height,Math.ceil(bottom+22))];
   });
 }
 writeFileSync(out+'/face-bounds.json',JSON.stringify(bounds));
 for(let i=0;i<8;i++){await page.evaluate(i=>window.__characterPreview.view(i,'upper',true),i);await page.waitForTimeout(70);await page.locator('#stage').screenshot({path:`${out}/upper-${i}.png`});}
 await page.evaluate(()=>window.__characterPreview.view(0,'upper',true));await page.waitForTimeout(70);await page.locator('#stage').screenshot({path:`${out}/upper.png`});
}finally{await browser.close();await new Promise(r=>server.close(r));}
