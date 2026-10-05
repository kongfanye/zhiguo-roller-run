import * as THREE from 'three';
import { createSkatingMotion } from './skating-motion.js';
import { createSkaterLegs } from './skater-legs.js';
import { createSkaterBody } from './skater-body.js';

const DIRECTIONS=['正面','右前方','右侧面','右后方','背面','左后方','左侧面','左前方'];
const TAU=Math.PI*2;

export function createZhiguo() {
  const root=new THREE.Group();root.name='zhiguo-articulated-3d-skater';
  const upper=createSkaterBody(),legs=createSkaterLegs(),motion=createSkatingMotion();
  root.add(upper.root,legs.root);upper.root.visible=legs.root.visible=false;
  const state={ready:false,error:null,direction:0,directionLabel:DIRECTIONS[0],phase:0,cheer:0,collect:0};
  // Preserve the game's anchor/debug interfaces; every anchor is now attached
  // to a real body joint and all geometry has camera-independent orientation.
  const {head,knot,mouth}=upper,body=upper.root;
  const rig={state:legs.state};
  const shadowCanvas=document.createElement('canvas');shadowCanvas.width=shadowCanvas.height=64;
  const c=shadowCanvas.getContext('2d'),gradient=c.createRadialGradient(32,32,1,32,32,32);
  gradient.addColorStop(0,'rgba(0,0,0,0.35)');gradient.addColorStop(1,'rgba(0,0,0,0)');
  c.fillStyle=gradient;c.fillRect(0,0,64,64);
  const shadowMaterial=new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(shadowCanvas),transparent:true,depthWrite:false});
  const shadow=new THREE.Mesh(new THREE.PlaneGeometry(1.25,0.72),shadowMaterial);
  shadow.rotation.x=-Math.PI/2;shadow.position.y=0.022;root.add(shadow);
  const ready=new THREE.TextureLoader().loadAsync('./assets/zhiguo-face-v6.webp').then(texture=>{
    texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;
    texture.minFilter=THREE.LinearMipmapLinearFilter;upper.setFaceTexture(texture);
    state.ready=true;upper.root.visible=legs.root.visible=true;
  }).catch(error=>{state.error='角色图片加载失败';throw error;});
  const cameraLocal=new THREE.Vector3();
  function orient(camera,hide=false) {
    if(camera){
      root.updateWorldMatrix(true,false);camera.getWorldPosition(cameraLocal);root.worldToLocal(cameraLocal);
      const angle=(Math.atan2(cameraLocal.z,cameraLocal.x)+TAU)%TAU;
      state.direction=Math.round(angle/TAU*8)%8;state.directionLabel=DIRECTIONS[state.direction];
    }
    // No billboard rotation, geometry switch, flattening or camera-facing mesh.
    upper.root.visible=legs.root.visible=state.ready&&!hide;
  }
  function update(dt,ctx) {
    const gait=motion.update(dt,ctx);legs.pose(gait,ctx,dt);upper.pose(gait,ctx,dt);
    state.phase=gait.phase;state.cadenceSpm=gait.cadenceSpm;state.gait=gait;
    state.cheer=Math.max(0,state.cheer-dt);state.collect=Math.max(0,state.collect-dt);
    shadow.scale.setScalar(ctx.airborne?0.65:1);shadowMaterial.opacity=ctx.airborne?0.4:0.85;
  }
  return {root,body,head,knot,mouth,state,rig,legs,upper,update,orient,ready,
    hitMeshes:[...upper.hitMeshes,...legs.legs.flatMap(l=>[l.thigh,l.shin,l.skate])],
    honk(){state.cheer=1;},gulp(){state.collect=0.4;}};
}
