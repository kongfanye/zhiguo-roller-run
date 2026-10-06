import {chromium} from 'playwright-core';
import {createServer} from 'node:http';
import {readFileSync,existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';

const root=resolve('docs'),output=resolve('../character-v9-checks');mkdirSync(output,{recursive:true});
const server=createServer((req,res)=>{
  if(req.url==='/favicon.ico'){res.writeHead(204);res.end();return;}
  const path=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
  if(!path.startsWith(root)||!existsSync(path)){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type',extname(path)==='.html'?'text/html; charset=utf-8':extname(path)==='.webp'?'image/webp':'application/octet-stream');res.end(readFileSync(path));
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({executablePath:process.env.EDGE_PATH??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
try{
  const page=await browser.newPage({viewport:{width:1440,height:1024},deviceScaleFactor:1});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(url+'/character.html');await page.waitForFunction(()=>window.__characterPreview?.character.state.ready);await page.waitForTimeout(900);
  assert.deepEqual(await page.evaluate(()=>{const p=window.__characterPreview,t=p.character.upper.skull.material.userData.identityUniforms.uIdentity.value;return [p.character.upper.state.faceSource,t.image.naturalWidth,t.image.naturalHeight];}),['original-user-photograph',1440,960],'Use the original identity photo in the actual 3D face material');
  await page.waitForFunction(()=>document.querySelector('#referenceImage').naturalWidth===1440);
  await page.evaluate(()=>{const p=window.__characterPreview;p.state.paused=true;});
  await page.screenshot({path:output+'/studio.png'});
  const frozenMatrices=await page.evaluate(()=>{const p=window.__characterPreview;p.character.root.updateMatrixWorld(true);return p.character.upper.head.matrixWorld.toArray();});
  for(let i=0;i<8;i++){
    await page.evaluate(i=>window.__characterPreview.view(i,'full',true),i);await page.waitForTimeout(100);
    await page.locator('#stage').screenshot({path:`${output}/view-${i}.png`});
  }
  assert.deepEqual(await page.evaluate(()=>window.__characterPreview.character.upper.head.matrixWorld.toArray()),frozenMatrices,'Rotating the camera must not rotate or flatten the body');
  await page.evaluate(()=>window.__characterPreview.view(0,'full',true));
  const thumbnail=await page.evaluate(()=>{const p=window.__characterPreview;p.renderer.render(p.scene,p.camera);return p.renderer.domElement.toDataURL('image/png').split(',')[1];});
  writeFileSync(output+'/front-thumbnail.png',Buffer.from(thumbnail,'base64'));
  for(const frame of ['face','upper','top']){
    await page.evaluate(frame=>window.__characterPreview.view(frame==='top'?1:0,frame,true),frame);await page.waitForTimeout(100);
    await page.locator('#stage').screenshot({path:`${output}/${frame}.png`});
  }
  await page.evaluate(()=>{const p=window.__characterPreview;p.view(1,'full',true);p.state.paused=false;});
  await page.getByRole('button',{name:'平衡',exact:true}).click();await page.waitForTimeout(2500);
  assert.equal(await page.evaluate(()=>window.__characterPreview.character.state.gait.mode),'balance');
  await page.getByRole('button',{name:'轮滑',exact:true}).click();await page.waitForTimeout(1600);
  assert.equal(await page.evaluate(()=>window.__characterPreview.character.state.gait.mode),'stride');
  await page.getByRole('button',{name:'滑行',exact:true}).click();await page.waitForTimeout(2300);
  assert.equal(await page.evaluate(()=>window.__characterPreview.character.state.gait.mode),'coast');
  await page.getByRole('button',{name:'跳跃',exact:true}).click();await page.waitForFunction(()=>window.__characterPreview.ctx.airborne);
  assert.equal(await page.evaluate(()=>window.__characterPreview.character.state.gait.mode),'jump');
  await page.waitForFunction(()=>window.__characterPreview.ctx.airHeight>.25);
  await page.getByRole('button',{name:'平衡',exact:true}).click();
  assert(await page.evaluate(()=>window.__characterPreview.ctx.airborne),'Changing motion mid-jump must preserve the current jump');
  await page.waitForFunction(()=>!window.__characterPreview.ctx.airborne);
  await page.getByRole('button',{name:'轮滑',exact:true}).click();await page.waitForTimeout(800);
  const renderStats=await page.evaluate(()=>{const p=window.__characterPreview;return {triangles:p.renderer.info.render.triangles,calls:p.renderer.info.render.calls,width:p.renderer.domElement.width,height:p.renderer.domElement.height,loadError:p.character.state.error};});
  if(process.argv.includes('--animation')){
    mkdirSync(output+'/frames',{recursive:true});
    await page.evaluate(()=>{const p=window.__characterPreview;p.state.paused=true;p.view(1,'full',true);Object.assign(p.ctx,{speed:7.5,pedal:1,trick:0,airborne:false,airHeight:0});p.character.root.position.y=0;for(let i=0;i<600;i++)p.character.update(1/60,p.ctx);});
    for(let i=0;i<48;i++){
      await page.evaluate(async()=>{const p=window.__characterPreview;p.character.update(1/(.6625*48),p.ctx);await new Promise(requestAnimationFrame);});
      await page.locator('#stage').screenshot({path:`${output}/frames/${String(i).padStart(3,'0')}.png`});
    }
    await page.evaluate(()=>window.__characterPreview.state.paused=false);
  }
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(400);await page.screenshot({path:output+'/studio-mobile.png'});
  await page.setViewportSize({width:1440,height:900});
  await page.goto(url+'/index.html?cam=orbit&time=13&freeze=1');await page.waitForFunction(()=>window.__zhiguo?.zhiguo.state.ready);
  await page.evaluate(()=>{const g=window.__zhiguo;g.start(false);g.view(2.8,.35,2.8,35,0,-.10,0);});await page.waitForTimeout(1800);
  await page.screenshot({path:output+'/game.png'});
  await page.evaluate(()=>window.__zhiguo.jump());await page.waitForFunction(()=>window.__zhiguo.S.airborne);
  await page.waitForFunction(()=>!window.__zhiguo.S.airborne);await page.evaluate(()=>window.__zhiguo.trick());await page.waitForTimeout(1800);
  assert.equal(await page.evaluate(()=>window.__zhiguo.zhiguo.state.gait.mode),'balance');
  await page.screenshot({path:output+'/game-balance.png'});
  await page.evaluate(()=>{const g=window.__zhiguo;g.settings.hour=1;});await page.waitForTimeout(400);await page.screenshot({path:output+'/game-night.png'});
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>window.__zhiguo.settings.hour=13);await page.waitForTimeout(400);await page.screenshot({path:output+'/game-mobile.png'});
  await page.goto('file:///'+root.replaceAll('\\','/')+'/character.html');await page.waitForFunction(()=>window.__characterPreview?.character.state.ready);
  assert.equal(await page.evaluate(()=>window.__characterPreview.character.state.error),null,'Self-contained HTML must load the face when opened directly from disk');
  writeFileSync(output+'/render-report.json',JSON.stringify({renderStats,errors},null,2));
  assert.deepEqual(errors,[],'Browser runtime and shader compilation must be error-free');
  console.log('PASS: 8 directions, face/upper/top framing, stride/coast/balance/jump controls, desktop/mobile game, and no browser/shader errors.');console.log(renderStats);
}finally{await browser.close();await new Promise(r=>server.close(r));}
