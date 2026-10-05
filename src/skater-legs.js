import * as THREE from 'three';
import { solveTwoBone, placeBetween, unitCylinder } from './util.js';

export const LEG_LENGTHS = { thigh: 0.35, shin: 0.34 };
const FLOOR = 0.03, WHEEL_RADIUS = 0.032, WHEEL_HALF_WIDTH = 0.010;

// Real joint geometry: each segment rotates rigidly and keeps its length.
// The articulated upper body shares these hips and their pelvis rotation.
export function createSkaterLegs() {
  const root = new THREE.Group(); root.name = 'anatomical-skating-legs';
  const skin = new THREE.MeshStandardMaterial({ color:'#d6a07c', roughness:0.82 });
  const shorts = new THREE.MeshStandardMaterial({ color:'#1c2230', roughness:0.94 });
  const bootMat = new THREE.MeshStandardMaterial({ color:'#191c25', roughness:0.56 });
  const strapMat = new THREE.MeshStandardMaterial({ color:'#363948', roughness:0.72 });
  const red = new THREE.MeshStandardMaterial({ color:'#8b3442', roughness:0.65 });
  const metal = new THREE.MeshStandardMaterial({ color:'#818995', metalness:0.65, roughness:0.4 });
  const tire = new THREE.MeshStandardMaterial({ color:'#c6c1aa', roughness:0.76 });
  const pixels = new Uint8Array(32*32*4);
  for(let i=0;i<32*32;i++) {
    const stripe=i%32%4===0?219:242;
    pixels.set([stripe,stripe,stripe,255],i*4);
  }
  const sockTex=new THREE.DataTexture(pixels,32,32);sockTex.colorSpace=THREE.SRGBColorSpace;sockTex.needsUpdate=true;
  const sockMat=new THREE.MeshStandardMaterial({color:'#f6f4ed',map:sockTex,roughness:1});
  function mesh(geometry,material,parent=root) {
    const m=new THREE.Mesh(geometry,material);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;
  }
  const sphere=new THREE.SphereGeometry(1,24,16);
  function ellipsoid(parent,mat,position,scale) {
    const m=mesh(sphere,mat,parent);m.position.set(...position);m.scale.set(...scale);return m;
  }
  const pelvis=mesh(new THREE.CylinderGeometry(0.133,0.124,0.13,28),shorts);
  pelvis.scale.x=0.77;
  const pole=new THREE.Vector3(1,0,0);
  const legs=['right','left'].map((name,i)=>{
    const side=i===0?1:-1;
    const thigh=mesh(unitCylinder(0.065,0.046,24),skin);
    const shinProfile=[[0.044,0],[0.048,0.12],[0.049,0.28],[0.043,0.55],[0.034,0.86],[0.032,1]].map(([r,y])=>new THREE.Vector2(r,y));
    const shin=mesh(new THREE.LatheGeometry(shinProfile,24),skin);
    const kneeMesh=ellipsoid(root,skin,[0,0,0],[0.047,0.047,0.047]);
    const cuff=mesh(unitCylinder(0.076,0.07,24),shorts);
    const sock=mesh(unitCylinder(0.035,0.039,24),sockMat);
    const skate=new THREE.Group();skate.name=`${name}-inline-skate`;skate.rotation.order='YXZ';root.add(skate);
    ellipsoid(skate,bootMat,[0.014,0.137,0],[0.137,0.063,0.061]);
    ellipsoid(skate,bootMat,[-0.026,0.189,0],[0.06,0.065,0.061]);
    ellipsoid(skate,strapMat,[-0.022,0.212,0],[0.062,0.015,0.064]);
    ellipsoid(skate,red,[0.02,0.164,0],[0.075,0.009,0.063]);
    const sole=mesh(new THREE.BoxGeometry(0.245,0.02,0.111),strapMat,skate);sole.position.set(0.02,0.090,0);
    const frame=mesh(new THREE.BoxGeometry(0.225,0.021,0.035),metal,skate);frame.position.set(0.012,0.072,0);
    const wheels=[];
    for(const x of [-0.101,-0.034,0.034,0.102]) {
      const axle=new THREE.Group();axle.position.set(x,WHEEL_RADIUS,0);skate.add(axle);
      const wheel=mesh(new THREE.CylinderGeometry(WHEEL_RADIUS,WHEEL_RADIUS,WHEEL_HALF_WIDTH*2,24),tire,axle);
      wheel.rotation.x=Math.PI/2;
      const hub=mesh(new THREE.CylinderGeometry(0.014,0.014,0.023,16),metal,axle);hub.rotation.x=Math.PI/2;
      wheels.push(axle);
    }
    return {name,side,thigh,shin,kneeMesh,cuff,sock,skate,wheels,
      hip:new THREE.Vector3(),knee:new THREE.Vector3(),ankle:new THREE.Vector3(),target:new THREE.Vector3(),
      cuffEnd:new THREE.Vector3(),skinStart:new THREE.Vector3(),sockTop:new THREE.Vector3()};
  });
  const state={rightSoleHeight:FLOOR,leftSoleHeight:FLOOR,kneeBend:0,joints:{},maxReachError:0};
  function pose(motion,ctx={},dt=0) {
    const hipHeight=motion.hipHeight??0.935-motion.bodyDip;
    pelvis.position.set(-0.025,hipHeight+0.008,motion.shift);
    const hipYaw=motion.pelvisYaw??0;pelvis.rotation.y=hipYaw;
    state.kneeBend=0;state.maxReachError=0;
    for(const leg of legs) {
      const {name,side,hip,knee,ankle,target,skate}=leg,foot=motion[name];
      const bank=side*(foot.bank??0);
      skate.position.set(foot.fore??0,FLOOR+foot.lift+WHEEL_HALF_WIDTH*Math.abs(Math.sin(bank)),side*(0.105+foot.out));
      skate.rotation.set(bank,-side*(foot.toeAngle??0),0);
      skate.updateMatrix();
      target.set(-0.018,0.223,0).applyMatrix4(skate.matrix);
      hip.set(-0.025+Math.sin(hipYaw)*side*0.085,hipHeight,Math.cos(hipYaw)*side*0.085+motion.shift);
      solveTwoBone(hip,target,LEG_LENGTHS.thigh,LEG_LENGTHS.shin,pole,knee,ankle);
      state.maxReachError=Math.max(state.maxReachError,ankle.distanceTo(target));
      // Start the skin inside the shorts: coincident skin/fabric end caps at
      // the hip would flicker through each other despite correct joint lengths.
      leg.skinStart.copy(hip).lerp(knee,0.26);
      placeBetween(leg.thigh,leg.skinStart,knee);placeBetween(leg.shin,knee,ankle);
      leg.kneeMesh.position.copy(knee);
      leg.cuffEnd.copy(hip).lerp(knee,0.30);placeBetween(leg.cuff,hip,leg.cuffEnd);
      leg.sockTop.copy(ankle).lerp(knee,0.28);placeBetween(leg.sock,ankle,leg.sockTop);
      for(const wheel of leg.wheels) wheel.rotation.z-=(ctx.speed??0)*dt/WHEEL_RADIUS;
      state[name+'SoleHeight']=FLOOR+foot.lift;
      const upper=knee.clone().sub(hip).normalize(),lower=ankle.clone().sub(knee).normalize();
      const bend=Math.acos(THREE.MathUtils.clamp(upper.dot(lower),-1,1));
      state.kneeBend=Math.max(state.kneeBend,bend);
      state.joints[name]={hip:hip.toArray(),knee:knee.toArray(),ankle:ankle.toArray(),target:target.toArray(),bend};
    }
    return state;
  }
  return {root,legs,state,pose};
}
