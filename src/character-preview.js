import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {createZhiguo} from './zhiguo.js';

const stage=document.querySelector('#stage');
const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(Math.max(devicePixelRatio,1.5),2));
renderer.setClearColor(0xe8eff3,0);renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;stage.append(renderer.domElement);
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(34,1,.025,30);
scene.add(new THREE.HemisphereLight(0xffffff,0x8c9faa,2.1));
const key=new THREE.DirectionalLight(0xfff6e7,2.2);key.position.set(3,5,3);key.castShadow=true;key.shadow.mapSize.set(2048,2048);
Object.assign(key.shadow.camera,{left:-1.4,right:1.4,top:2.1,bottom:-.5,near:.1,far:12});key.shadow.bias=-.00015;key.shadow.normalBias=.01;scene.add(key);
const rim=new THREE.DirectionalLight(0xe4f2ff,1.3);rim.position.set(-3,3,-2);scene.add(rim);
const ground=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.ShadowMaterial({opacity:.16}));ground.rotation.x=-Math.PI/2;ground.position.y=.028;ground.receiveShadow=true;scene.add(ground);
const character=createZhiguo();scene.add(character.root);
const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.1;controls.enablePan=false;controls.minDistance=.35;controls.maxDistance=7;controls.maxPolarAngle=Math.PI*.49;
const state={paused:false,rate:1,mode:'stride',frame:'full',view:1,time:0,autoRotate:false,jumpElapsed:-1,jumpCooldown:.35};
const labels=['正面','右前方','右侧面','右后方','背面','左后方','左侧面','左前方'];
const ctx={speed:7.5,pedal:1,rhythm:2,lean:0,trick:0,airborne:false,airHeight:0,night:0};
const targetPosition=new THREE.Vector3(),targetFocus=new THREE.Vector3();let blending=false;
function view(index=state.view,frame=state.frame,instant=false){
  state.view=index;state.frame=frame;const angle=index*Math.PI/4;
  character.root.updateMatrixWorld(true);const headPosition=character.upper.head.getWorldPosition(new THREE.Vector3());
  const radius=frame==='face'?.74:frame==='upper'?1.65:3.65,height=frame==='face'?headPosition.y+.005:frame==='upper'?headPosition.y-.24:1.02;
  targetFocus.set(0,height,0);
  if(frame==='face')targetFocus.set(headPosition.x,height,headPosition.z);
  if(frame==='top'){targetFocus.set(0,.80,0);targetPosition.set(.09,3.25,.025);}
  else targetPosition.set(targetFocus.x+Math.cos(angle)*radius,height+(frame==='face'?.025:.11),targetFocus.z+Math.sin(angle)*radius);
  if(instant){camera.position.copy(targetPosition);controls.target.copy(targetFocus);controls.update();}else blending=true;
  document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',+b.dataset.view===index));
  document.querySelectorAll('[data-frame]').forEach(b=>b.classList.toggle('active',b.dataset.frame===frame));
  document.querySelector('#viewLabel').textContent=frame==='top'?'俯视':labels[index];
}
document.querySelector('#views').addEventListener('click',e=>{if(e.target.dataset.view!==undefined){state.autoRotate=false;document.querySelector('#rotate').checked=false;view(+e.target.dataset.view);}});
document.querySelector('#framing').addEventListener('click',e=>{if(e.target.dataset.frame)view(state.view,e.target.dataset.frame);});
document.querySelector('#motion').addEventListener('click',e=>{if(!e.target.dataset.motion)return;state.mode=e.target.dataset.motion;state.time=0;document.querySelectorAll('[data-motion]').forEach(b=>b.classList.toggle('active',b.dataset.motion===state.mode));});
document.querySelector('#rate').addEventListener('input',e=>{state.rate=+e.target.value;document.querySelector('#rateValue').value=state.rate.toFixed(2)+'×';});
document.querySelector('#rotate').addEventListener('change',e=>{state.autoRotate=e.target.checked;});
document.querySelector('#toggle').addEventListener('click',()=>{state.paused=!state.paused;document.querySelector('#toggle').textContent=state.paused?'播放动作':'暂停动作';});
controls.addEventListener('start',()=>{blending=false;state.autoRotate=false;document.querySelector('#rotate').checked=false;});
function resize(){const {width,height}=stage.getBoundingClientRect();renderer.setSize(width,height);camera.aspect=width/height;camera.updateProjectionMatrix();}
new ResizeObserver(resize).observe(stage);resize();view(1,'full',true);
character.ready.then(()=>{
  document.querySelector('#status').textContent='人物已就绪';document.querySelector('#error').textContent=character.state.error??'';
  const image=character.upper.skull.material.userData.identityUniforms.uIdentity.value?.image;
  if(image)document.querySelector('#referenceImage').src=image.src;
});
let previous=performance.now(),fpsTime=previous,frames=0;
function frame(now){
  const wallDt=Math.min((now-previous)/1000,.05);previous=now;const dt=state.paused?0:wallDt*state.rate;
  if(dt>0){
    state.time+=dt;ctx.pedal=state.mode==='coast'?0:1;ctx.trick=state.mode==='balance'?1:0;
    if(state.jumpElapsed>=0){state.jumpElapsed+=dt;if(state.jumpElapsed>=.85){state.jumpElapsed=-1;state.jumpCooldown=0;}}
    else if(state.mode==='jump'){state.jumpCooldown+=dt;if(state.jumpCooldown>=1.3)state.jumpElapsed=0;}
    const jumpProgress=state.jumpElapsed/.85;
    ctx.airborne=state.jumpElapsed>=0&&jumpProgress<1;
    ctx.airHeight=ctx.airborne?4*jumpProgress*(1-jumpProgress)*.36:0;
    character.root.position.y=ctx.airHeight;character.update(dt,ctx);
  }
  if(blending){const t=1-Math.exp(-9*wallDt);camera.position.lerp(targetPosition,t);controls.target.lerp(targetFocus,t);if(camera.position.distanceTo(targetPosition)<.001)blending=false;}
  controls.autoRotate=state.autoRotate&&!blending;controls.autoRotateSpeed=.6;controls.update(wallDt);
  character.orient(camera);renderer.render(scene,camera);frames++;
  if(now-fpsTime>1200){document.querySelector('#fps').textContent=Math.round(frames*1000/(now-fpsTime))+' FPS';fpsTime=now;frames=0;}
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
// The same geometry, articulation and motion used in the game; exposed for render QA.
window.__characterPreview={character,scene,camera,renderer,controls,state,ctx,view};
