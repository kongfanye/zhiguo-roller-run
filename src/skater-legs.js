import * as THREE from 'three';
import { solveTwoBone, placeBetween, unitCylinder, mulberry32 } from './util.js';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {batchStaticMeshes} from './mesh-batching.js';
import {SKIN_COLOR} from './zhiguo-identity.js';

export const LEG_LENGTHS = { thigh: 0.35, shin: 0.34 };
const FLOOR = 0.03, WHEEL_RADIUS = 0.037, WHEEL_HALF_WIDTH = 0.011, LIFT = WHEEL_RADIUS - 0.032;
const TAU = Math.PI * 2;
const TORUS_UP = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0), Math.PI/2);
const curve1 = points => x => {
  let n = 0; while (n < points.length - 2 && x > points[n + 1][0]) n++;
  const [x0, y0] = points[n], [x1, y1] = points[n + 1], t = THREE.MathUtils.clamp((x - x0) / (x1 - x0), 0, 1);
  return y0 + (y1 - y0) * t * t * (3 - 2 * t);
};
// Low-cut skate shell from heel to toe. Each cross-section is a squircle, so the
// boot reads as a rigid shell with a rounded toe box rather than a soft blob.
const SHELL_TOP = curve1([[-.112,.190],[-.060,.207],[.010,.200],[.070,.166],[.128,.134]]);
const SHELL_WIDTH = curve1([[-.112,.036],[-.060,.043],[0,.046],[.060,.050],[.100,.046],[.128,.034]]);
function shellGeometry() {
  const rows = 44, sides = 32, pos = [], uv = [], idx = [], heel = -.114, toe = .130, bottom = .099 + LIFT;
  for (let i = 0; i <= rows; i++) {
    const t = i / rows, x = heel + (toe - heel) * t;
    const end = Math.min(1, t / .09, (1 - t) / .15), round = Math.sqrt(Math.max(0, 1 - (1 - end) ** 2));
    const top = SHELL_TOP(x) + LIFT, half = (top - bottom) / 2, centre = bottom + half;
    for (let j = 0; j <= sides; j++) {
      const a = j / sides * TAU, c = Math.cos(a), s = Math.sin(a), n = 2 / 3;
      const y = centre + Math.sign(c) * Math.abs(c) ** n * half * (c > 0 ? round : 1);
      const z = Math.sign(s) * Math.abs(s) ** n * SHELL_WIDTH(x) * round;
      pos.push(x, Math.max(bottom - .002, y), z); uv.push(j / sides * 2, t * 2.4);
      if (i < rows && j < sides) { const k = i * (sides + 1) + j, m = k + sides + 1; idx.push(k, m, k + 1, k + 1, m, m + 1); }
    }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
// A thin sole that follows the shell's own footprint.
function soleGeometry() {
  const shape = new THREE.Shape(), heel = -.116, toe = .132, steps = 30, outline = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, x = heel + (toe - heel) * t;
    const end = Math.min(1, t / .09, (1 - t) / .15), round = Math.sqrt(Math.max(0, 1 - (1 - end) ** 2));
    outline.push([x, SHELL_WIDTH(Math.min(.128, Math.max(-.112, x))) * .9 * Math.max(round, .35)]);
  }
  outline.forEach(([x, w], i) => i ? shape.lineTo(x, w) : shape.moveTo(x, w));
  for (let i = outline.length - 1; i >= 0; i--) shape.lineTo(outline[i][0], -outline[i][1]);
  const g = new THREE.ExtrudeGeometry(shape, { depth: .010, bevelEnabled: true, bevelThickness: .002, bevelSize: .002, bevelSegments: 2, curveSegments: 4 });
  g.rotateX(Math.PI / 2); g.translate(0, .103 + LIFT, 0); g.computeVertexNormals(); return g;
}
// Black shell with the reference's small pink-red floral print.
function skatePrint() {
  const size = 256, data = new Uint8Array(size * size * 4), rnd = mulberry32(7);
  for (let i = 0; i < size * size; i++) data.set([20, 21, 26, 255], i * 4);
  for (let n = 0; n < 260; n++) {
    const cx = rnd() * size, cy = rnd() * size, r = 1.0 + rnd() * 2.0, pink = rnd() < .7;
    const color = pink ? [168 + rnd() * 40, 58 + rnd() * 30, 86 + rnd() * 30] : [96, 98, 108];
    for (let y = -4; y <= 4; y++) for (let x = -4; x <= 4; x++) {
      if (x * x + y * y > r * r) continue;
      const px = ((Math.round(cx + x) % size) + size) % size, py = ((Math.round(cy + y) % size) + size) % size;
      data.set([...color, 255], (py * size + px) * 4);
    }
  }
  const tex = new THREE.DataTexture(data, size, size); tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true; tex.needsUpdate = true; return tex;
}
// Navy denim twill with tan topstitching at the leg hems.
function denimTexture() {
  const size = 128, data = new Uint8Array(size * size * 4), rnd = mulberry32(11);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const twill = ((x + y) % 4 < 2 ? 7 : -5) + (rnd() - .5) * 10, fade = 6 * Math.sin(x * .09 + y * .05);
    let color = [36 + twill + fade, 45 + twill + fade, 72 + twill * 1.3 + fade];
    if (y === 6 || y === 121 || y === 124) color = (x % 4 < 3) ? [176, 136, 86] : color;
    data.set([...color.map(c => THREE.MathUtils.clamp(c, 0, 255)), 255], (y * size + x) * 4);
  }
  const tex = new THREE.DataTexture(data, size, size); tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.ClampToEdgeWrapping; tex.repeat.set(3, 1);
  tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.generateMipmaps = true; tex.needsUpdate = true; return tex;
}
// The cuff pivots at the ankle with the shin, like a real hinged skate cuff.
function cuffGeometry() {
  const profile = [[.049,0],[.050,.45],[.052,.88],[.054,.95],[.050,1],[.046,.97],[.044,.88],[.043,.62]]
    .map(([r, y]) => new THREE.Vector2(r, y));
  return new THREE.LatheGeometry(profile, 32);
}

// Real joint geometry: each segment rotates rigidly and keeps its length.
// The articulated upper body shares these hips and their pelvis rotation.
export function createSkaterLegs() {
  const root = new THREE.Group(); root.name = 'anatomical-skating-legs';
  const hitMeshes=[];
  const skin = new THREE.MeshStandardMaterial({ color:SKIN_COLOR, roughness:0.82 });
  const shorts = new THREE.MeshStandardMaterial({ map:denimTexture(), roughness:0.93, side:THREE.DoubleSide });
  const bootMat = new THREE.MeshStandardMaterial({ map:skatePrint(), roughness:0.48 });
  const strapMat = new THREE.MeshStandardMaterial({ color:'#25262d', roughness:0.7 });
  const frameMat = new THREE.MeshStandardMaterial({ color:'#1c1d22', metalness:0.55, roughness:0.42 });
  const red = new THREE.MeshStandardMaterial({ color:'#a33a52', roughness:0.55 });
  const metal = new THREE.MeshStandardMaterial({ color:'#8c929c', metalness:0.7, roughness:0.35 });
  const tire = new THREE.MeshStandardMaterial({ color:'#ecdfbd', roughness:0.72 });
  const pixels = new Uint8Array(32*32*4);
  for(let i=0;i<32*32;i++) {
    const stripe=i%32%4===0?219:242;
    pixels.set([stripe,stripe,stripe,255],i*4);
  }
  const sockTex=new THREE.DataTexture(pixels,32,32);sockTex.colorSpace=THREE.SRGBColorSpace;sockTex.needsUpdate=true;
  const sockMat=new THREE.MeshStandardMaterial({color:'#f6f4ed',map:sockTex,roughness:1});
  function mesh(geometry,material,parent=root) {
    const m=new THREE.Mesh(geometry,material);m.castShadow=true;m.receiveShadow=true;parent.add(m);hitMeshes.push(m);return m;
  }
  const sphere=new THREE.SphereGeometry(1,24,16);
  function ellipsoid(parent,mat,position,scale) {
    const m=mesh(sphere,mat,parent);m.position.set(...position);m.scale.set(...scale);return m;
  }
  // Loose navy denim shorts: the seat sits under the shirt hem and each leg
  // opens wider than the thigh, ending at mid-thigh as in the reference.
  const pelvis=mesh(new THREE.CylinderGeometry(0.130,0.138,0.15,32),shorts);
  pelvis.scale.x=0.70;
  const pole=new THREE.Vector3(1,0,0);
  const legs=['right','left'].map((name,i)=>{
    const side=i===0?1:-1;
    const thighProfile=[[0,0],[.062,0],[.065,.18],[.060,.42],[.050,.78],[.046,1]].map(([r,y])=>new THREE.Vector2(r,y));
    const thigh=mesh(new THREE.LatheGeometry(thighProfile,32),skin);
    const shinProfile=[[0.044,0],[0.048,0.12],[0.049,0.28],[0.043,0.55],[0.034,0.86],[0.032,1]].map(([r,y])=>new THREE.Vector2(r,y));
    const shin=mesh(new THREE.LatheGeometry(shinProfile,24),skin);
    const kneeMesh=ellipsoid(root,skin,[0,0,0],[0.0445,0.0445,0.0445]);
    const cuffGeometryShorts=new THREE.CylinderGeometry(0.084,0.075,1,28,1,true);cuffGeometryShorts.translate(0,0.5,0);
    const cuff=mesh(cuffGeometryShorts,shorts);
    // Thick white crew socks, bunched above the boot cuff.
    const sock=mesh(unitCylinder(0.037,0.042,24),sockMat);
    const sockFold=mesh(new THREE.TorusGeometry(0.041,0.006,8,24),sockMat);
    const bootCuff=mesh(cuffGeometry(),bootMat);bootCuff.name=`${name}-hinged-skate-cuff`;
    const cuffStrapProfile=[[.0545,.66],[.0555,.70],[.0555,.80],[.0545,.84]].map(([r,y])=>new THREE.Vector2(r,y));
    const cuffStrap=mesh(new THREE.LatheGeometry(cuffStrapProfile,32),strapMat);
    const skate=new THREE.Group();skate.name=`${name}-inline-skate`;skate.rotation.order='YXZ';root.add(skate);
    mesh(shellGeometry(),bootMat,skate).name='printed-skate-shell';
    // Instep strap with a red buckle and crossed laces over the toe box.
    const strap=mesh(new RoundedBoxGeometry(.030,.010,.104,2,.004),strapMat,skate);strap.position.set(-.004,.203+LIFT,0);strap.rotation.z=-.30;
    const buckle=mesh(new THREE.BoxGeometry(.020,.016,.008),red,skate);buckle.position.set(-.006,.196+LIFT,side*.052);buckle.rotation.z=-.30;
    for(let n=0;n<4;n++)for(const s of [1,-1]){
      const x0=.026+n*.017,x1=x0+.014,start=new THREE.Vector3(x0,SHELL_TOP(x0)+LIFT+.001,s*.026),end=new THREE.Vector3(x1,SHELL_TOP(x1)+LIFT+.001,-s*.026);
      const lace=mesh(unitCylinder(.0016,.0016,6),strapMat,skate);placeBetween(lace,start,end);
    }
    mesh(soleGeometry(),strapMat,skate).name='skate-sole';
    // Slim black frame rails hold the axles of four large cream wheels.
    for(const s of [1,-1]){
      const rail=mesh(new RoundedBoxGeometry(0.248,0.030,0.004,2,.0015),frameMat,skate);rail.position.set(0.002,0.070+LIFT,s*0.0140);
    }
    const bridge=mesh(new RoundedBoxGeometry(0.200,0.008,0.032,2,.003),frameMat,skate);bridge.position.set(0.004,0.088+LIFT,0);
    const wheels=[];
    for(const x of [-0.104,-0.035,0.035,0.104]) {
      const axle=new THREE.Group();axle.position.set(x,WHEEL_RADIUS,0);skate.add(axle);
      const wheel=mesh(new THREE.CylinderGeometry(WHEEL_RADIUS,WHEEL_RADIUS,WHEEL_HALF_WIDTH*2,28),tire,axle);
      wheel.rotation.x=Math.PI/2;
      const hub=mesh(new THREE.CylinderGeometry(0.016,0.016,0.024,16),frameMat,axle);hub.rotation.x=Math.PI/2;
      const bolt=mesh(new THREE.CylinderGeometry(0.004,0.004,0.034,8),metal,axle);bolt.rotation.x=Math.PI/2;
      wheels.push(axle);
    }
    batchStaticMeshes(skate,new Set(),hitMeshes);
    return {name,side,thigh,shin,kneeMesh,cuff,sock,sockFold,bootCuff,cuffStrap,skate,wheels,
      hip:new THREE.Vector3(),knee:new THREE.Vector3(),ankle:new THREE.Vector3(),target:new THREE.Vector3(),
      cuffEnd:new THREE.Vector3(),skinStart:new THREE.Vector3(),sockTop:new THREE.Vector3(),
      bootBottom:new THREE.Vector3(),bootTop:new THREE.Vector3(),shinAxis:new THREE.Vector3()};
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
      target.set(-0.018,0.223+LIFT,0).applyMatrix4(skate.matrix);
      hip.set(-0.025+Math.sin(hipYaw)*side*0.085,hipHeight,Math.cos(hipYaw)*side*0.085+motion.shift);
      solveTwoBone(hip,target,LEG_LENGTHS.thigh,LEG_LENGTHS.shin,pole,knee,ankle);
      state.maxReachError=Math.max(state.maxReachError,ankle.distanceTo(target));
      // Start the skin inside the shorts: coincident skin/fabric end caps at
      // the hip would flicker through each other despite correct joint lengths.
      leg.skinStart.copy(hip).lerp(knee,0.26);
      placeBetween(leg.thigh,leg.skinStart,knee);placeBetween(leg.shin,knee,ankle);
      leg.kneeMesh.position.copy(knee);
      leg.cuffEnd.copy(hip).lerp(knee,0.43);placeBetween(leg.cuff,hip,leg.cuffEnd);
      leg.sockTop.copy(ankle).lerp(knee,0.34);placeBetween(leg.sock,ankle,leg.sockTop);
      leg.sockFold.position.copy(leg.sockTop);leg.sockFold.quaternion.copy(leg.sock.quaternion).multiply(TORUS_UP);
      leg.shinAxis.subVectors(knee,ankle).normalize();
      leg.bootBottom.copy(ankle).addScaledVector(leg.shinAxis,-0.062);leg.bootTop.copy(ankle).addScaledVector(leg.shinAxis,0.080);
      placeBetween(leg.bootCuff,leg.bootBottom,leg.bootTop);placeBetween(leg.cuffStrap,leg.bootBottom,leg.bootTop);
      for(const wheel of leg.wheels) wheel.rotation.z-=(ctx.speed??0)*dt/WHEEL_RADIUS;
      state[name+'SoleHeight']=FLOOR+foot.lift;
      const upper=knee.clone().sub(hip).normalize(),lower=ankle.clone().sub(knee).normalize();
      const bend=Math.acos(THREE.MathUtils.clamp(upper.dot(lower),-1,1));
      state.kneeBend=Math.max(state.kneeBend,bend);
      state.joints[name]={hip:hip.toArray(),knee:knee.toArray(),ankle:ankle.toArray(),target:target.toArray(),bend};
    }
    return state;
  }
  return {root,legs,state,pose,hitMeshes};
}
