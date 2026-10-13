import * as THREE from 'three';
import {solveTwoBone,placeBetween} from './util.js';
import {ANATOMY} from './anatomical-mesh.js';
import {batchStaticMeshes} from './mesh-batching.js';
import {createIdentityHead,SKIN_COLOR} from './zhiguo-identity.js';

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
function mirrorArmBindPose(data){
  // The imported arm uses the opposite handedness to the game's +X-forward,
  // +Z-right skeleton. Reflect the whole bind mesh across its longitudinal
  // plane so the wrist blend stays continuous and both thumbs point forward.
  // A reflection reverses winding; reverse each triangle to retain outward normals.
  const reflect=values=>values.map((value,i)=>i%3===0?-value:value);
  const indices=data.indices.slice();
  for(let i=0;i<indices.length;i+=3)[indices[i+1],indices[i+2]]=[indices[i+2],indices[i+1]];
  return {...data,upper:reflect(data.upper),lower:reflect(data.lower),indices,
    palmNormal:reflect(data.palmNormal),fingers:data.fingers.map(chain=>chain.map(reflect))};
}
// A loose, buttoned short-sleeve shirt, measured against the reference sheet.
const profiles=[[0,.113,.104,.154],[.08,.111,.102,.156],[.19,.104,.087,.148],[.30,.115,.092,.155],[.39,.107,.084,.162],[.445,.082,.072,.164],[.49,.052,.048,.078],[.52,.044,.043,.046]];
const profileCurve=new THREE.CatmullRomCurve3(profiles.map(([y,f,b,w])=>new THREE.Vector3(f,b,w)),false,'catmullrom',0.4);
function profile(y){
  let n=0;while(n<profiles.length-2&&y>profiles[n+1][0])n++;
  const t=(y-profiles[n][0])/(profiles[n+1][0]-profiles[n][0]);
  return profileCurve.getPoint((n+clamp(t,0,1))/(profiles.length-1));
}
// Blue, lavender and white madras plaid from the reference shirt. Warp and
// weft stripes alternate in a 2/2 twill, so mipmaps blend them like woven cloth.
const PLAID=[[6,[206,207,220]],[3,[38,48,96]],[14,[78,98,160]],[2,[206,207,220]],[7,[146,162,204]],[2,[150,64,110]],
  [5,[206,207,220]],[10,[118,104,160]],[2,[38,48,96]],[6,[200,195,180]],[4,[78,98,160]],[3,[206,207,220]]];
const plaidStripe=[];for(const [width,color] of PLAID)for(let n=0;n<width;n++)plaidStripe.push(color);
function fabricTexture(repeatX,repeatY){
  const size=256,data=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const warp=plaidStripe[x%64],weft=plaidStripe[(y+23)%64],color=(x+y)%4<2?warp:weft;
    const weave=((x*3+y)%5===0?-6:0)+((x+y)%2)*2;
    data.set([...color.map(c=>clamp(c+weave,0,255)),255],(y*size+x)*4);
  }
  const tex=new THREE.DataTexture(data,size,size);tex.colorSpace=THREE.SRGBColorSpace;
  tex.wrapS=tex.wrapT=THREE.RepeatWrapping;tex.repeat.set(repeatX,repeatY);tex.anisotropy=8;
  tex.magFilter=THREE.LinearFilter;tex.minFilter=THREE.LinearMipmapLinearFilter;tex.generateMipmaps=true;tex.needsUpdate=true;return tex;
}
// The shirt closes down the front; only the open top button leaves a small V.
const shirtGap=t=>.012+.30*smooth01(t,.80,1)**1.5;
const shirtFold=(angle,y,t)=>Math.sin(Math.PI*t)*(.0025*Math.sin(angle*11+y*43)+.0015*Math.sin(angle*23-y*67));
const smooth01=(x,a,b)=>THREE.MathUtils.smoothstep(x,a,b);
const SKIN_ROW=37;
function torsoGeometry(shirt=false){
  const pos=[],uv=[],idx=[],rows=48,sides=64;
  for(let row=0;row<=rows;row++){
    const t=row/rows,y=t*.52,p=profile(y),gap=shirt?shirtGap(t):0;
    for(let n=0;n<=sides;n++){
      const angle=gap+(TAU-gap*2)*n/sides,c=Math.cos(angle),s=Math.sin(angle);
      let depth=c>0?p.x:p.y,width=p.z;
      const fold=shirt?shirtFold(angle,y,t):0;
      depth+=fold; width+=fold*.7;
      const x=c*(depth+(shirt?.003:0)),z=s*(width+(shirt?.002:0));
      // A curved shirt-tail hem: longer at the front and back, higher at the side seams.
      const hem=shirt?-.017*Math.cos(angle*2)*(1-t)**5:0;
      const crew=shirt?0:-.032*Math.max(0,c)*t**10;
      pos.push(x,y+hem+crew,z);uv.push(angle/TAU,t);
      if(row<rows&&n<sides){const a=row*(sides+1)+n,b=a+sides+1;idx.push(a,b,a+1,a+1,b,b+1);}
    }
  }
  if(!shirt)for(const row of [0]){
    const c=pos.length/3;pos.push(0,row/rows*.52,0);uv.push(.5,row/rows);
    for(let n=0;n<sides;n++){const a=row*(sides+1)+n;if(row)idx.push(c,a+1,a);else idx.push(c,a,a+1);}
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);
  // The inner body shows as chest skin inside the open collar, and as an
  // unseen lining below it.
  if(!shirt){const band=sides*6;g.addGroup(0,SKIN_ROW*band,0);g.addGroup(SKIN_ROW*band,(rows-SKIN_ROW)*band,1);g.addGroup(rows*band,idx.length-rows*band,0);}
  g.computeVertexNormals();return g;
}
// A pointed shirt collar: a stand around the neck that folds over and lies on
// the shoulders, ending in two points on the upper chest.
function collarGeometry(side){
  const pos=[],uv=[],idx=[],cols=30,rows=10,inner=new THREE.Vector3(),fold=new THREE.Vector3(),outer=new THREE.Vector3(),q=new THREE.Vector3();
  for(let i=0;i<=cols;i++){
    const u=i/cols,phi=THREE.MathUtils.lerp(Math.PI,.30,u),c=Math.cos(phi),s=Math.sin(phi);
    // The stand is tallest at the back and drops to the base of the neck in front.
    const front=smooth01(u,.45,1);
    inner.set(-.016+.040*c,.503-.012*front,side*.058*s);
    fold.set(-.016+.047*c,.526-.022*front,side*.066*s);
    const yo=.482-.014*(1-smooth01(u,0,.45))-.040*smooth01(u,.62,1),po=profile(yo),a=THREE.MathUtils.lerp(Math.PI,.30,u);
    outer.set(Math.cos(a)*((Math.cos(a)>0?po.x:po.y)+.011),yo,side*Math.sin(a)*(po.z+.009));
    for(let j=0;j<=rows;j++){
      const v=j/rows;
      if(v<.3)q.lerpVectors(inner,fold,v/.3);
      else{const w=(v-.3)/.7;q.lerpVectors(fold,outer,w);const bulge=Math.sin(Math.PI*w)*.008+.003*w;q.x+=c*bulge;q.z+=side*s*bulge;q.y+=Math.sin(Math.PI*w)*.004;}
      pos.push(q.x,q.y,q.z);uv.push(u*1.4,v*.35);
      if(i<cols&&j<rows){const k=i*(rows+1)+j,n=k+rows+1;if(side>0)idx.push(k,k+1,n,k+1,n+1,n);else idx.push(k,n,k+1,k+1,n,n+1);}
    }
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();
  // The rolled outer edge and front edge give the collar visible thickness, so
  // its points read against the shirt in the same plaid.
  const at=(i,j)=>new THREE.Vector3().fromArray(pos,(i*(rows+1)+j)*3);
  const edge=[];for(let i=0;i<=cols;i++)edge.push(at(i,rows));for(let j=rows-1;j>=3;j--)edge.push(at(cols,j));
  return {geometry:g,edge};
}
// A button placket that follows the folds down the closed front.
function placketGeometry(){
  const pos=[],uv=[],idx=[],rows=40,cols=4;
  for(let row=0;row<=rows;row++){
    const y=-.012+row/rows*.452,t=clamp(y/.52,0,1),p=profile(Math.max(y,0));
    for(let col=0;col<=cols;col++){
      const z=(col/cols-.5)*.030,angle=Math.asin(clamp(z/(p.z+.002),-1,1));
      const x=Math.cos(angle)*(p.x+.003+shirtFold(angle,y,t))+.0022;
      const hem=-.017*Math.cos(angle*2)*(1-t)**5;
      pos.push(x,Math.max(y,hem+.004),z);uv.push(col/cols*.1,row/rows*.9);
      if(row<rows&&col<cols){const k=row*(cols+1)+col,n=k+cols+1;idx.push(k,n,k+1,k+1,n,n+1);}
    }
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();return g;
}
function geometry(data){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(data.positions,3));g.setIndex(data.indices);g.computeVertexNormals();return g;}
export function createSkaterBody(){
  const root=new THREE.Group();root.name='volumetric-skater-upper-body';
  const spine=new THREE.Group();spine.name='articulated-spine';root.add(spine);
  const skin=new THREE.MeshStandardMaterial({color:SKIN_COLOR,roughness:.78});
  const fabric=new THREE.MeshStandardMaterial({map:fabricTexture(9,6),roughness:.95,side:THREE.DoubleSide});
  const sleeveFabric=new THREE.MeshStandardMaterial({map:fabricTexture(4,1.2),roughness:.95,side:THREE.DoubleSide});
  const lining=new THREE.MeshStandardMaterial({color:'#9aa5c4',roughness:1});
  const button=new THREE.MeshStandardMaterial({color:'#ece8df',roughness:.35});
  const chain=new THREE.MeshStandardMaterial({color:'#cfcac0',metalness:.75,roughness:.3});
  const jade=new THREE.MeshStandardMaterial({color:'#a7d3a4',roughness:.32,emissive:'#1d3320',emissiveIntensity:.25});
  const hitMeshes=[];
  function mesh(g,mat,parent=spine){const m=new THREE.Mesh(g,mat);m.castShadow=true;m.receiveShadow=true;parent.add(m);hitMeshes.push(m);return m;}
  function ellipsoid(parent,mat,position,scale){const m=mesh(new THREE.SphereGeometry(1,20,12),mat,parent);m.position.set(...position);m.scale.set(...scale);return m;}
  function tube(points,r,mat,parent=spine){return mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),40,r,6,false),mat,parent);}
  const tee=mesh(torsoGeometry(),[lining,skin]);tee.scale.set(.97,1,.97);tee.name='inner-body-and-open-collar-skin';
  const shirt=mesh(torsoGeometry(true),fabric);shirt.name='reference-buttoned-blue-lavender-plaid-shirt';
  const placket=mesh(placketGeometry(),fabric);placket.name='button-placket';
  for(let n=0;n<6;n++){
    const y=.045+n*.075,p=profile(y),x=p.x+.003+shirtFold(0,y,y/.52)+.0042;
    const b=mesh(new THREE.CylinderGeometry(.0052,.0052,.0018,16),button);b.position.set(x,y,0);b.rotation.z=Math.PI/2;b.name='shirt-button';
  }
  for(const side of [1,-1]){
    const {geometry,edge}=collarGeometry(side);mesh(geometry,fabric).name='pointed-shirt-collar';
    mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(edge),80,.0021,6,false),fabric).name='collar-edge';
  }
  const identity=createIdentityHead({mesh,tube,ellipsoid}),{head,skull,mouth,hair,faceMat}=identity;spine.add(head);
  // Fine chain and pale green four-petal flower pendant from the reference.
  for(const side of [1,-1])tube([[-.010,.512,side*.052],[.040,.498,side*.050],[.090,.430,side*.030],[.116,.372,side*.010],[.121,.350,0]],.0007,chain);
  const pendant=new THREE.Group();pendant.name='green-flower-pendant';pendant.position.set(.124,.338,0);pendant.rotation.z=-.10;pendant.scale.setScalar(1.35);spine.add(pendant);
  for(let n=0;n<4;n++){
    const a=Math.PI/4+n*Math.PI/2,petal=ellipsoid(pendant,jade,[0,Math.sin(a)*.0085,Math.cos(a)*.0085],[.0032,.0078,.0078]);
    petal.rotation.x=-a;petal.scale.set(.0032,.0068,.0090);
  }
  ellipsoid(pendant,jade,[.0025,0,0],[.0025,.0035,.0035]);
  const knot=new THREE.Object3D();knot.position.set(-.035,.526,0);spine.add(knot);
  const arms=[1,-1].map((side,i)=>{
    const data=mirrorArmBindPose(ANATOMY.arms[i]),g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array(data.weight.length*3),3));g.setIndex(data.indices);
    const skinArm=mesh(g,skin);skinArm.name=(i?'left':'right')+'-continuous-arm-and-hand';skinArm.frustumCulled=false;g.attributes.position.setUsage(THREE.DynamicDrawUsage);
    const upper=new THREE.Object3D(),lower=new THREE.Object3D(),hand=new THREE.Object3D();spine.add(upper,lower,hand);
    // Loose short sleeve ending above the elbow in a turned-up cuff.
    const sleeveProfile=[[0,0],[.042,0],[.057,.09],[.063,.30],[.063,.78],[.064,.80],[.067,.82],[.067,.98],[.062,1],[.060,.97]].map(([r,y])=>new THREE.Vector2(r,y));
    const sleeve=mesh(new THREE.LatheGeometry(sleeveProfile,32),sleeveFabric);
    return {side,name:i?'left':'right',upper,lower,hand,sleeve,skinArm,data,
      shoulder:new THREE.Vector3(),elbow:new THREE.Vector3(),wrist:new THREE.Vector3(),target:new THREE.Vector3(),pole:new THREE.Vector3(),
      sleeveStart:new THREE.Vector3(),sleeveEnd:new THREE.Vector3(),qu:new THREE.Quaternion(),ql:new THREE.Quaternion(),qh:new THREE.Quaternion(),wristRest:new THREE.Quaternion().setFromAxisAngle(Y,side*.10).multiply(new THREE.Quaternion().setFromAxisAngle(Z,.055))};
  });
  batchStaticMeshes(head,new Set([skull,...head.children.filter(n=>n.material===faceMat)]),hitMeshes);
  batchStaticMeshes(spine,new Set([shirt,tee,...arms.flatMap(a=>[a.sleeve,a.skinArm])]),hitMeshes);
  batchStaticMeshes(pendant,new Set(),hitMeshes);
  const a=new THREE.Vector3(),b=new THREE.Vector3(),h=new THREE.Vector3();
  const state={joints:{},hands:{},torsoDepth:.23,shoulderWidth:.33,poseVersion:0,jumpArmBlend:0,appearanceVersion:13,faceSource:'original-photo-v13'};
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
      // Relaxed arms hang slightly forward and away from the hips, elbows soft,
      // as in every view of the reference sheet.
      target.set(.080-side*weight*.090,.008+Math.abs(weight)*.020+balance*.15+tuck*.10,side*(.268+balance*.11));pole.set(-.35,-1,side*.18);
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
      arm.sleeveEnd.copy(shoulder).lerp(elbow,.54);placeBetween(arm.sleeve,arm.sleeveStart,arm.sleeveEnd);
      state.joints[arm.name]={shoulder:shoulder.toArray(),elbow:elbow.toArray(),wrist:wrist.toArray()};
      state.hands[arm.name]={wristFlex:.055,wristTwist:side*.10,palmNormal:h.fromArray(data.palmNormal).applyQuaternion(qh).toArray(),fingers:data.fingers.map(chain=>chain.map(point=>{h.fromArray(point);h.y-=ARM_LENGTHS.lower;return h.applyQuaternion(qh).add(wrist).toArray();}))};
    }
    hair.pose({weight,lateral,airTuck:motion.airTuck??0},dt,profile);
    state.pelvisPosition=root.position.toArray();state.pelvisYaw=root.rotation.y;state.spineRotation=spine.rotation.toArray().slice(0,3);state.poseVersion++;root.updateMatrixWorld(true);return state;
  }
  return {root,spine,head,mouth,knot,arms,shirt,skull,tee,hair,state,hitMeshes,pose,setFaceTexture(texture){identity.setPhoto(texture);}};
}
