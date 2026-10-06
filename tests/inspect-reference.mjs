import {chromium} from 'playwright-core';
import {writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
const file=resolve(process.argv[2]),out=resolve('../character-v8-checks/reference-video');mkdirSync(out,{recursive:true});
const html=resolve('../character-v8-checks/reference-video.html');
writeFileSync(html,`<!doctype html><html><body style="margin:0;background:#dde5eb"><video preload="auto" style="display:block;width:1200px;max-height:860px;object-fit:contain" src="${'file:///'+file.replaceAll('\\','/')}"></video></body></html>`);
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--allow-file-access-from-files']});
try{
 const page=await browser.newPage({viewport:{width:1200,height:860}});await page.goto('file:///'+html.replaceAll('\\','/'));
 await page.waitForFunction(()=>document.querySelector('video').readyState>=2);
 const info=await page.evaluate(()=>{const v=document.querySelector('video');return {duration:v.duration,width:v.videoWidth,height:v.videoHeight};});console.log(info);
 for(let i=0;i<12;i++){
   const time=info.duration*(i+.2)/12;
   await page.evaluate(async time=>{const v=document.querySelector('video');const seek=new Promise(r=>v.addEventListener('seeked',r,{once:true}));v.currentTime=time;await seek;},time);
   await page.locator('video').screenshot({path:`${out}/${String(i).padStart(2,'0')}.png`});
 }
}finally{await browser.close();}
