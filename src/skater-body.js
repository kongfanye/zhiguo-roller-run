import * as THREE from 'three';
import {solveTwoBone,placeBetween} from './util.js';
import {ANATOMY} from './anatomical-mesh.js';
import {batchStaticMeshes} from './mesh-batching.js';
import {createIdentityHead} from './zhiguo-identity.js';

export const ARM_LENGTHS={upper:0.235,lower:0.225};
const clamp=THREE.MathUtils.clamp,TAU=Math.PI*2,Y=new THREE.Vector3(0,1,0),Z=new THREE.Vector3(0,0,1);
const frameX=new THREE.Vector3(),frameY=new THREE.Vector3(),frameZ=new THREE.Vector3(),frameMatrix=new THREE.Matrix4();
function armFrame(start,end,q){
  frameY.subVectors(end,start).normalize();
  // Orient the anatomical bind frame with palms toward the thighs. A stable
  // frame also prevents the 180-degree roll caused by shortest-arc Y rotations.
  frameX.set(-1,0,0).addScaledVector(frameY,frameY.x).normalize();
  frameZ.crossVectors(frameX,frameY).normalize();
  q.setFromRotationMatrix(frameMatrix.makeBasis(frameX,frameY,frameZ));
}
// A loose, open short-sleeve overshirt, measured against the real photos.
const profiles=[[0,.113,.104,.154],[.08,.111,.102,.156],[.19,.104,.087,.148],[.30,.115,.092,.155],[.39,.107,.084,.162],[.445,.082,.072,.164],[.49,.052,.048,.078],[.52,.044,.043,.046]];
const profileCurve=new THREE.CatmullRomCurve3(profiles.map(([y,f,b,w])=>new THREE.Vector3(f,b,w)),false,'catmullrom',0.4);
function profile(y){
  let n=0;while(n<profiles.length-2&&y>profiles[n+1][0])n++;
  const t=(y-profiles[n][0])/(profiles[n+1][0]-profiles[n][0]);
  return profileCurve.getPoint((n+clamp(t,0,1))/(profiles.length-1));
}
function fabricTexture(){
  const size=256,data=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const u=x%64,v=y%64;let color=[207,200,174];
    if((u>17&&u<31)||(v>17&&v<31))color=[124,136,151];
    if((u>22&&u<26)||(v>22&&v<26))color=[70,89,118];
    if((u>42&&u<49)||(v>42&&v<49))color=[176,159,114];
    if(u===8||v===8||u===54||v===54)color=[231,226,205];
    const weave=((x+y)%2)*3-1.5;
    data.set([...color.map(c=>c+weave),255],(y*size+x)*4);
  }
  const tex=new THREE.DataTexture(data,size,size);tex.colorSpace=THREE.SRGBColorSpace;
  tex.wrapS=tex.wrapT=THREE.RepeatWrapping;tex.repeat.set(2.5,1.75);tex.anisotropy=8;
  tex.magFilter=THREE.LinearFilter;tex.minFilter=THREE.LinearMipmapLinearFilter;tex.generateMipmaps=true;tex.needsUpdate=true;return tex;
}
const shirtGap=t=>.34+.20*t+.055*(1-t)**10;
function torsoGeometry(shirt=false){
  const pos=[],uv=[],idx=[],rows=48,sides=64;
  for(let row=0;row<=rows;row++){
    const t=row/rows,y=t*.52,p=profile(y),gap=shirt?shirtGap(t):0;
    for(let n=0;n<=sides;n++){
      const angle=gap+(TAU-gap*2)*n/sides,c=Math.cos(angle),s=Math.sin(angle);
      let depth=c>0?p.x:p.y,width=p.z;
      const fold=shirt?Math.sin(Math.PI*t)*(.0025*Math.sin(angle*11+y*43)+.0015*Math.sin(angle*23-y*67)):0;
      depth+=fold; width+=fold*.7;
      const x=c*(depth+(shirt?.003:0)),z=s*(width+(shirt?.002:0));
      const hem=shirt?.008*Math.cos(angle*2)*(1-t)**5:0;
      const crew=shirt?0:-.032*Math.max(0,c)*t**10;
      pos.push(x,y+hem+crew,z);uv.push(angle/TAU,t);
      if(row<rows&&n<sides){const a=row*(sides+1)+n,b=a+sides+1;idx.push(a,b,a+1,a+1,b,b+1);}
    }
  }
  if(!shirt)for(const row of [0]){
    const c=pos.length/3;pos.push(0,row/rows*.52,0);uv.push(.5,row/rows);
    for(let n=0;n<sides;n++){const a=row*(sides+1)+n;if(row)idx.push(c,a+1,a);else idx.push(c,a,a+1);}
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();return g;
}
function geometry(data){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(data.positions,3));g.setIndex(data.indices);g.computeVertexNormals();return g;}
export function createSkaterBody(){
  const root=new THREE.Group();root.name='volumetric-skater-upper-body';
  const spine=new THREE.Group();spine.name='articulated-spine';root.add(spine);
  const skin=new THREE.MeshStandardMaterial({color:'#c19072',roughness:.78});
  const fabric=new THREE.MeshStandardMaterial({map:fabricTexture(),roughness:.98,side:THREE.DoubleSide});
  const teeMat=new THREE.MeshStandardMaterial({color:'#92928b',roughness:1});
  const silver=new THREE.MeshStandardMaterial({color:'#b8ad97',metalness:.7,roughness:.38});
  const gold=new THREE.MeshStandardMaterial({color:'#a98a51',metalness:.55,roughness:.45});
  const hitMeshes=[];
  function mesh(g,mat,parent=spine){const m=new THREE.Mesh(g,mat);m.castShadow=true;m.receiveShadow=true;parent.add(m);hitMeshes.push(m);return m;}
  function ellipsoid(parent,mat,position,scale){const m=mesh(new THREE.SphereGeometry(1,20,12),mat,parent);m.position.set(...position);m.scale.set(...scale);return m;}
  function tube(points,r,mat,parent=spine){return mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),40,r,6,false),mat,parent);}
  const tee=mesh(torsoGeometry(),teeMat);tee.scale.set(.97,1,.97);tee.name='inner-shirt-body-volume';
  const shirt=mesh(torsoGeometry(true),fabric);shirt.name='reference-open-beige-blue-plaid-shirt';
  // Loose open overshirt and grey inner shirt from the real photographs.
  for(const side of [1,-1]){
    const points=[[.039,.517,side*.035],[.081,.479,side*.045],[.115,.418,side*.061],[.100,.445,side*.109],[.047,.503,side*.083]];
    const p=points.flat(),g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));
    g.setAttribute('uv',new THREE.Float32BufferAttribute([0,1,.25,.7,.5,0,1,.5,.75,1],2));
    g.setIndex(side===1?[0,1,2,0,2,3,0,3,4]:[0,2,1,0,3,2,0,4,3]);g.computeVertexNormals();mesh(g,fabric);
    const edge=[];for(let n=0;n<=40;n++){const y=n/40*.495,p=profile(y),a=shirtGap(y/.52);
      edge.push([Math.cos(a)*(p.x+.006),y,side*Math.sin(a)*(p.z+.002)]);}
    tube(edge,.0016,fabric);
    if(side===1)for(let n=0;n<6;n++){const y=.04+n*.068,p=profile(y),a=shirtGap(y/.52);ellipsoid(spine,silver,[Math.cos(a)*(p.x+.007),y,Math.sin(a)*(p.z+.004)],[.0018,.0026,.0026]);}
  }
  tube([[.052,.512,-.044],[-.030,.523,-.047],[-.052,.526,0],[-.030,.523,.047],[.052,.512,.044]],.0065,fabric);
  const identity=createIdentityHead({mesh,tube,ellipsoid}),{head,skull,mouth,hair,faceMat}=identity;spine.add(head);
  tube([[.044,.501,-.032],[.113,.337,-.021],[.118,.270,0],[.113,.337,.021],[.044,.501,.032]],.00065,gold);
  const leaf=ellipsoid(spine,gold,[.118,.248,0],[.0015,.018,.0055]);leaf.rotation.x=.32;
  const knot=new THREE.Object3D();knot.position.set(-.035,.526,0);spine.add(knot);
  const arms=[1,-1].map((side,i)=>{
    const data=ANATOMY.arms[i],g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array(data.weight.length*3),3));g.setIndex(data.indices);
    const skinArm=mesh(g,skin);skinArm.name=(i?'left':'right')+'-continuous-arm-and-hand';skinArm.frustumCulled=false;g.attributes.position.setUsage(THREE.DynamicDrawUsage);
    const upper=new THREE.Object3D(),lower=new THREE.Object3D(),hand=new THREE.Object3D();spine.add(upper,lower,hand);
    const sleeveProfile=[[0,0],[.037,0],[.049,.14],[.056,.38],[.057,.80],[.056,1]].map(([r,y])=>new THREE.Vector2(r,y));
    const sleeve=mesh(new THREE.LatheGeometry(sleeveProfile,32),fabric);
    return {side,name:i?'left':'right',upper,lower,hand,sleeve,skinArm,data,
      shoulder:new THREE.Vector3(),elbow:new THREE.Vector3(),wrist:new THREE.Vector3(),target:new THREE.Vector3(),pole:new THREE.Vector3(),
      sleeveStart:new THREE.Vector3(),sleeveEnd:new THREE.Vector3(),qu:new THREE.Quaternion(),ql:new THREE.Quaternion(),qh:new THREE.Quaternion(),wristRest:new THREE.Quaternion().setFromAxisAngle(Y,side*.10).multiply(new THREE.Quaternion().setFromAxisAngle(Z,.055))};
  });
  batchStaticMeshes(head,new Set([skull,...head.children.filter(n=>n.material===faceMat)]),hitMeshes);
  batchStaticMeshes(spine,new Set([shirt,tee,...arms.flatMap(a=>[a.sleeve,a.skinArm])]),hitMeshes);
  const a=new THREE.Vector3(),b=new THREE.Vector3(),h=new THREE.Vector3();
  const state={joints:{},hands:{},torsoDepth:.23,shoulderWidth:.33,poseVersion:0,jumpArmBlend:0,appearanceVersion:11,faceSource:'restored-v4-portrait'};
  function pose(motion,ctx={},dt=0){
    root.position.set(-.025,motion.hipHeight,motion.shift);root.rotation.y=motion.pelvisYaw??0;
    const weight=Math.sin(motion.phase*TAU)*(motion.activity??0),forward=.07+clamp((ctx.speed??0)/15,0,1)*.07;
    const lateral=clamp(ctx.lean??0,-.28,.28)*.50+weight*.02;
    state.jumpArmBlend=THREE.MathUtils.lerp(state.jumpArmBlend,motion.airTuck??0,1-Math.exp(-9*dt));
    spine.rotation.set(lateral,-weight*.055,-forward);head.rotation.set(-lateral*.35,weight*.028,forward*.4);
    for(const arm of arms){
      const {side,shoulder,elbow,wrist,target,pole,qu,ql,qh,data}=arm;
      shoulder.set(-.002,.433,side*.160);
      const balance=motion.balanceAmount??0,tuck=state.jumpArmBlend;
      target.set(.065-side*weight*.085,.058+Math.abs(weight)*.020+balance*.13+tuck*.08,side*(.225+balance*.13));pole.set(-.35,-1,side*.18);
      solveTwoBone(shoulder,target,ARM_LENGTHS.upper,ARM_LENGTHS.lower,pole,elbow,wrist);
      armFrame(shoulder,elbow,qu);armFrame(elbow,wrist,ql);qh.copy(ql).multiply(arm.wristRest);
      arm.upper.position.copy(shoulder);arm.upper.quaternion.copy(qu);arm.lower.position.copy(elbow);arm.lower.quaternion.copy(ql);arm.hand.position.copy(wrist);arm.hand.quaternion.copy(qh);
      const p=arm.skinArm.geometry.attributes.position;
      for(let n=0;n<data.weight.length;n++){
        a.fromArray(data.upper,n*3).applyQuaternion(qu).add(shoulder);b.fromArray(data.lower,n*3).applyQuaternion(ql).add(elbow);
        h.fromArray(data.lower,n*3);h.y-=ARM_LENGTHS.lower;h.applyQuaternion(qh).add(wrist);
        a.lerp(b,data.weight[n]).lerp(h,data.handWeight[n]);p.setXYZ(n,a.x,a.y,a.z);
      }
      p.needsUpdate=true;arm.skinArm.geometry.computeVertexNormals();
      arm.sleeveStart.copy(shoulder);arm.sleeveStart.y+=.008;
      arm.sleeveEnd.copy(shoulder).lerp(elbow,.60);placeBetween(arm.sleeve,arm.sleeveStart,arm.sleeveEnd);
      state.joints[arm.name]={shoulder:shoulder.toArray(),elbow:elbow.toArray(),wrist:wrist.toArray()};
      state.hands[arm.name]={wristFlex:.055,wristTwist:side*.10,palmNormal:h.fromArray(data.palmNormal).applyQuaternion(qh).toArray(),fingers:data.fingers.map(chain=>chain.map(point=>{h.fromArray(point);h.y-=ARM_LENGTHS.lower;return h.applyQuaternion(qh).add(wrist).toArray();}))};
    }
    hair.pose({weight,lateral,airTuck:motion.airTuck??0},dt,profile);
    state.pelvisPosition=root.position.toArray();state.pelvisYaw=root.rotation.y;state.spineRotation=spine.rotation.toArray().slice(0,3);state.poseVersion++;root.updateMatrixWorld(true);return state;
  }
  return {root,spine,head,mouth,knot,arms,shirt,skull,tee,hair,state,hitMeshes,pose,setFaceTexture(texture){identity.setPhoto(texture);}};
}
