import * as THREE from 'three';
import {solveTwoBone,placeBetween,mulberry32} from './util.js';
import {ANATOMY} from './anatomical-mesh.js';
import {batchStaticMeshes} from './mesh-batching.js';
import {createIdentityHead,SKIN_COLOR} from './zhiguo-identity.js';
import {createHair} from './zhiguo-hair.js';
import {denimTexture} from './skater-legs.js';

// Zhiguo's upper body and outfit as in her skating photo: a slim build; a fitted
// white T-shirt with a black neckband and a black "FREE" print, tucked into very
// dark high-waisted denim shorts; and an oversized cream-and-blue plaid shirt
// worn open over it, with rolled short sleeves and a hem at mid-thigh.
export const ARM_LENGTHS={upper:0.235,lower:0.225};
const clamp=THREE.MathUtils.clamp,smooth=THREE.MathUtils.smoothstep,lerp=THREE.MathUtils.lerp,TAU=Math.PI*2,Y=new THREE.Vector3(0,1,0),Z=new THREE.Vector3(0,0,1);
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

// Cross-sections (height above the hip joints, forward depth, back depth,
// half-width), as smooth curves through measured rows.
function sections(rows){
  const curves=[1,2,3].map(k=>new THREE.SplineCurve(rows.map(r=>new THREE.Vector2(r[0],r[k]))));
  const ys=rows.map(r=>r[0]);
  return y=>{
    let n=0;while(n<ys.length-2&&y>ys[n+1])n++;
    const t=clamp((y-ys[n])/(ys[n+1]-ys[n]),0,1),u=(n+t)/(ys.length-1);
    return curves.map(c=>c.getPoint(u).y);
  };
}
// Her slim torso, as worn by the fitted tee: hips, a narrow waist, the bust,
// narrow shoulders, and a crew neck closing round the base of the neck.
const TEE=sections([[-.02,.090,.118,.168],[.04,.088,.114,.165],[.09,.082,.100,.151],[.14,.077,.090,.133],[.19,.080,.089,.135],
  [.24,.092,.091,.140],[.29,.112,.093,.146],[.33,.111,.094,.150],[.37,.099,.093,.156],[.41,.085,.089,.163],[.44,.073,.080,.167],
  [.465,.059,.069,.140],[.485,.046,.063,.094],[.50,.037,.060,.064],[.512,.034,.059,.057]]);
const NECK_X=-.013;
// The neckline dips at the front like a crew neck.
const neckline=a=>.512-.020*Math.max(0,Math.cos(a))**1.6;
// The oversized open shirt hangs straight from the bust and shoulder blades,
// boxy over the hips, with room for the arms beside it.
const SHIRT=sections([[-.135,.126,.136,.197],[-.05,.126,.141,.196],[.05,.125,.139,.190],[.15,.125,.119,.176],[.22,.126,.108,.162],
  [.30,.127,.105,.153],[.36,.121,.106,.157],[.41,.104,.106,.166],[.445,.086,.098,.172],[.475,.065,.080,.138],[.50,.050,.069,.088],[.518,.046,.067,.069]]);
// Where the open fronts' edges hang (distance from the middle of the body).
const EDGE=sections([[-.135,.068,0,0],[.10,.064,0,0],[.25,.066,0,0],[.34,.070,0,0],[.40,.074,0,0],[.45,.070,0,0],[.49,.058,0,0],[.518,.052,0,0]]);
const SHIRT_HEM=-.135,SHIRT_TOP=.518;
// High-waisted shorts over the hips, closing at the crotch.
const SHORTS=sections([[-.088,.066,.090,.105],[-.06,.088,.122,.158],[-.02,.097,.130,.180],[.04,.096,.126,.178],[.09,.091,.111,.163],[.13,.087,.101,.146],[.152,.087,.100,.144]]);

function ellipsePoint(a,f,b,w,x0=0){const c=Math.cos(a);return [x0+(c>0?f:b)*c,w*Math.sin(a)];}
function grid(rows,cols,point,{flip=false}={}){
  const pos=[],uv=[],idx=[];
  for(let i=0;i<=rows;i++)for(let j=0;j<=cols;j++){
    const [x,y,z,u,v]=point(i/rows,j/cols);pos.push(x,y,z);uv.push(u,v);
    if(i<rows&&j<cols){const k=i*(cols+1)+j,n=k+cols+1;if(flip)idx.push(k,k+1,n,k+1,n+1,n);else idx.push(k,n,k+1,k+1,n,n+1);}
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();return g;
}
// The torso centre drifts back toward the neck at the top.
const centreX=y=>NECK_X*smooth(y,.42,.50);
function teeGeometry(){
  return grid(56,72,(t,s)=>{
    const a=s*TAU,y=lerp(-.02,neckline(a),t),[f,b,w]=TEE(y),[x,z]=ellipsePoint(a,f,b,w,centreX(y));
    return [x,y,z,s*6,y*8];
  });
}
function teePoint(a,y,offset=0,out=new THREE.Vector3()){
  const [f,b,w]=TEE(y),[x,z]=ellipsePoint(a,f+offset,b+offset,w+offset,centreX(y));return out.set(x,y,z);
}
function shortsGeometry(){
  return grid(26,72,(t,s)=>{
    const a=s*TAU,y=lerp(-.088,.152,t),[f,b,w]=SHORTS(y),band=.0025*smooth(y,.120,.125),[x,z]=ellipsePoint(a,f+band,b+band,w+band);
    return [x,y,z,s*5,1-(y+.088)/.24*.25];
  });
}
// Ellipse parameter of the shirt's front edge at a height.
function edgeAngle(y){const [, ,w]=SHIRT(y);return Math.asin(clamp(EDGE(y)[0]/w,0,.98));}
function shirtPoint(i,j,rows,cols,out=[]){
  const t=i/rows,y=lerp(SHIRT_HEM,SHIRT_TOP,t),gap=edgeAngle(y),a=gap+(TAU-2*gap)*j/cols,[f,b,w]=SHIRT(y);
  // A shirt-tail hem: longer at the front and back than at the side seams.
  const hem=.024*Math.sin(a)**2*(1-t)**6;
  const [x,z]=ellipsePoint(a,f,b,w,centreX(y));
  out[0]=x;out[1]=y+hem;out[2]=z;out[3]=a/TAU*13;out[4]=y/.072;return out;
}
function shirtGeometry(rows=64,cols=88){
  return grid(rows,cols,(t,s)=>shirtPoint(Math.round(t*rows),Math.round(s*cols),rows,cols));
}
// A pointed collar: a stand round the back of the neck that folds over and lies
// on the shoulders, spreading open to points on the upper chest.
function collarGeometry(side){
  const cols=30,rows=10,pos=[],uv=[],idx=[],inner=new THREE.Vector3(),fold=new THREE.Vector3(),outer=new THREE.Vector3(),q=new THREE.Vector3();
  for(let i=0;i<=cols;i++){
    const u=i/cols,a=lerp(Math.PI,.62,u),front=smooth(u,.5,1);
    teePoint(a,.513-.020*front,.010,inner);
    teePoint(a,.536-.030*front,.016,fold);
    const yo=lerp(.489,.440,smooth(u,.45,1)),ao=lerp(Math.PI,.42,u),[f,b,w]=SHIRT(yo),[x,z]=ellipsePoint(ao,f+.006,b+.006,w+.006,centreX(yo));
    outer.set(x,yo,z);
    for(let j=0;j<=rows;j++){
      const v=j/rows;
      if(v<.3)q.lerpVectors(inner,fold,v/.3);
      else{const k=(v-.3)/.7;q.lerpVectors(fold,outer,k);q.y+=Math.sin(Math.PI*k)*.006;q.x+=Math.sin(Math.PI*k)*.004*Math.cos(ao);}
      pos.push(q.x,q.y,q.z*side);uv.push(u*1.6,v*.4);
      if(i<cols&&j<rows){const k=i*(rows+1)+j,n=k+rows+1;if(side>0)idx.push(k,k+1,n,k+1,n+1,n);else idx.push(k,n,k+1,k+1,n,n+1);}
    }
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();return g;
}

// ------------------------------------------------------------------ textures
function dataTexture(w,h,pixel,{alpha=false}={}){
  const data=new Uint8Array(w*h*4);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const c=pixel(x,y);data.set([c[0],c[1],c[2],alpha?c[3]:255].map(v=>clamp(Math.round(v),0,255)),(y*w+x)*4);}
  const t=new THREE.DataTexture(data,w,h);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;
  t.magFilter=THREE.LinearFilter;t.minFilter=THREE.LinearMipmapLinearFilter;t.generateMipmaps=true;t.anisotropy=8;t.needsUpdate=true;return t;
}
// Her shirt's check: a cream ground with periwinkle-blue bands, pale blue,
// fine navy lines and a thin tan line, woven as a 2/2 twill.
const PLAID=[[22,[239,234,219]],[2,[43,53,97]],[6,[239,234,219]],[17,[124,151,207]],[6,[167,189,227]],[17,[124,151,207]],
  [6,[239,234,219]],[2,[43,53,97]],[20,[239,234,219]],[3,[205,185,133]],[12,[242,238,226]],[9,[167,189,227]],[6,[239,234,219]]];
const plaidStripe=[];for(const [n,c] of PLAID)for(let k=0;k<n;k++)plaidStripe.push(c);
function plaidTexture(){
  const n=plaidStripe.length;
  return dataTexture(n,n,(x,y)=>{
    const warp=plaidStripe[x],weft=plaidStripe[(y+31)%n],c=(x+y)%4<2?warp:weft,weave=((x*3+y)%5===0?-7:0)+((x+y)%2)*3;
    return c.map(v=>v+weave);
  });
}
function knitTexture(base){return dataTexture(32,32,(x,y)=>{const k=(x%3===0?-5:0)+(y%2?-2:2);return base.map(v=>v+k);});}
// The tee's black print: "FREE" in bold serif capitals over a line of small
// script and a little round emblem, drawn as an alpha-tested decal.
const GLYPHS={
  F:['111111111','011000011','011000001','011000000','011000100','011111100','011000100','011000000','011000000','011000000','111100000'],
  R:['111111100','011000110','011000011','011000011','011000110','011111100','011001100','011000110','011000110','011000011','111100011'],
  E:['111111111','011000011','011000001','011000000','011000100','011111100','011000100','011000000','011000001','011000011','111111111']};
function printTexture(){
  const W=256,H=128,ink=new Float32Array(W*H);
  const dot=(cx,cy,r)=>{for(let y=Math.floor(cy-r-1);y<=cy+r+1;y++)for(let x=Math.floor(cx-r-1);x<=cx+r+1;x++){if(x<0||y<0||x>=W||y>=H)continue;const d=Math.hypot(x-cx,y-cy);ink[y*W+x]=Math.max(ink[y*W+x],clamp(r+.5-d,0,1));}};
  const cell=5.4,letters='FREE',x0=(W-(letters.length*10-1)*cell)/2,y0=8;
  [...letters].forEach((ch,i)=>GLYPHS[ch].forEach((row,r)=>[...row].forEach((on,c)=>{
    if(on!=='1')return;for(let sy=0;sy<2;sy++)for(let sx=0;sx<2;sx++)dot(x0+(i*10+c)*cell+(sx+.5)*cell/2,y0+r*cell+(sy+.5)*cell/2,cell*.36);
  })));
  // A line of small script and a little round emblem below.
  const rnd=mulberry32(5);
  for(let k=0;k<170;k++){const t=k/170,x=60+t*136,y=84+3.2*Math.sin(t*TAU*10)+1.6*Math.sin(t*TAU*27+rnd());dot(x,y,1.0);}
  for(let k=0;k<64;k++){const a=k/64*TAU;dot(128+Math.cos(a)*10,107+Math.sin(a)*10,1.0);}
  for(let k=0;k<5;k++){const a=-Math.PI/2+k/5*TAU,b=a+TAU/10;dot(128+Math.cos(a)*6,107+Math.sin(a)*6,1.2);dot(128+Math.cos(b)*2.6,107+Math.sin(b)*2.6,1.2);}
  const t=dataTexture(W,H,(x,y)=>{const a=ink[(H-1-y)*W+x];return [24,24,26,a*255];},{alpha:true});
  t.wrapS=t.wrapT=THREE.ClampToEdgeWrapping;return t;
}
// A curved patch on the front of the tee that carries the print.
function printGeometry(){
  return grid(10,24,(t,s)=>{const a=lerp(-.62,.62,s),y=lerp(.318,.398,t),p=teePoint(a,y,.0015);return [p.x,p.y,p.z,1-s,t];});
}

export function createSkaterBody(){
  const root=new THREE.Group();root.name='volumetric-skater-upper-body';
  const spine=new THREE.Group();spine.name='articulated-spine';root.add(spine);
  const skin=new THREE.MeshStandardMaterial({color:SKIN_COLOR,roughness:.66});
  const plaid=plaidTexture(),shirtMat=new THREE.MeshStandardMaterial({map:plaid,roughness:.92,side:THREE.DoubleSide});
  const sleeveMap=plaid.clone();sleeveMap.repeat.set(5.5,2);sleeveMap.needsUpdate=true;
  const sleeveMat=new THREE.MeshStandardMaterial({map:sleeveMap,roughness:.92,side:THREE.DoubleSide});
  const teeMat=new THREE.MeshStandardMaterial({map:knitTexture([243,242,237]),roughness:.95});
  const bandMat=new THREE.MeshStandardMaterial({map:knitTexture([30,30,33]),roughness:.9});
  const printMat=new THREE.MeshStandardMaterial({map:printTexture(),alphaTest:.45,roughness:.85});
  const denimMap=denimTexture(false);denimMap.repeat.set(1,4);
  const denim=new THREE.MeshStandardMaterial({map:denimMap,roughness:.92,side:THREE.DoubleSide});
  const button=new THREE.MeshStandardMaterial({color:'#f4f1ea',roughness:.35});
  const brass=new THREE.MeshStandardMaterial({color:'#9b8f7a',metalness:.8,roughness:.35});
  const hitMeshes=[];
  function mesh(g,mat,parent=spine){const m=new THREE.Mesh(g,mat);m.castShadow=true;m.receiveShadow=true;parent.add(m);hitMeshes.push(m);return m;}
  function ellipsoid(parent,mat,position,scale){const m=mesh(new THREE.SphereGeometry(1,20,12),mat,parent);m.position.set(...position);m.scale.set(...scale);return m;}
  function tube(points,r,mat,parent=spine,closed=false){return mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>p.isVector3?p:new THREE.Vector3(...p)),closed),closed?96:40,r,6,closed),mat,parent);}

  // The fitted white tee is the visible torso; a black ribbed band edges the crew neck.
  const tee=mesh(teeGeometry(),teeMat);tee.name='white-fitted-tee';
  const neck=[];for(let n=0;n<64;n++){const a=n/64*TAU;neck.push(teePoint(a,neckline(a)-.002,.0025));}
  tube(neck,.0042,bandMat,spine,true).name='black-crew-neckband';
  mesh(printGeometry(),printMat).name='tee-print-FREE';
  // High-waisted shorts: waistband, belt loops, a metal button and the fly.
  const shorts=mesh(shortsGeometry(),denim);shorts.name='dark-denim-high-waisted-shorts';
  for(const a of [.55,1.45,2.4,Math.PI,-.55,-1.45,-2.4]){
    const [f,b,w]=SHORTS(.136),[x,z]=ellipsePoint(a,f+.004,b+.004,w+.004);
    const loop=mesh(new THREE.BoxGeometry(.004,.026,.011),denim);loop.position.set(x,.137,z);loop.rotation.y=-a;loop.name='belt-loop';
  }
  { const [f]=SHORTS(.137),b=mesh(new THREE.CylinderGeometry(.0065,.0065,.003,16),brass);b.position.set(f+.004,.137,0);b.rotation.z=Math.PI/2;b.name='shorts-button';
    const fly=[];for(let n=0;n<=8;n++){const y=lerp(.122,-.045,n/8),a=.10*Math.sin(n/8*Math.PI*.9),[ff,bb,w]=SHORTS(y),[x,z]=ellipsePoint(a,ff+.0012,bb,w+.0012);fly.push([x,y,z]);}
    tube(fly,.0011,brass).name='fly-stitching'; }

  // The open plaid shirt. Its lower panels are pushed out by the thighs each frame.
  const shirtRows=64,shirtCols=88,shirtGeo=shirtGeometry(shirtRows,shirtCols);
  const shirt=mesh(shirtGeo,shirtMat);shirt.name='open-cream-blue-plaid-shirt';shirt.frustumCulled=false;
  shirtGeo.attributes.position.setUsage(THREE.DynamicDrawUsage);
  const shirtRest=shirtGeo.attributes.position.array.slice();
  for(const side of [1,-1])mesh(collarGeometry(side),shirtMat).name='pointed-shirt-collar';
  // Plackets with white buttons on her right front; buttonholes on the left.
  for(const side of [1,-1]){
    const edge=[];for(let n=0;n<=24;n++){const y=lerp(SHIRT_HEM+.004,.46,n/24),a=edgeAngle(y)+.035,[f,b,w]=SHIRT(y),[x,z]=ellipsePoint(a,f+.0015,b,w+.0015,centreX(y));edge.push([x,y,z*side]);}
    tube(edge,.0024,shirtMat).name='shirt-front-edge';
    for(let n=0;n<7;n++){
      const y=lerp(-.07,.43,n/6),a=edgeAngle(y)+.10,[f,b,w]=SHIRT(y),[x,z]=ellipsePoint(a,f+.0025,b,w+.0025,centreX(y));
      if(side>0){const btn=mesh(new THREE.CylinderGeometry(.0048,.0048,.0018,14),button);btn.position.set(x,y,z);btn.rotation.set(0,-a,Math.PI/2);btn.name='shirt-button';}
    }
  }
  const identity=createIdentityHead({mesh,tube,ellipsoid,createHair}),{head,skull,mouth,hair}=identity;spine.add(head);
  const knot=new THREE.Object3D();knot.position.set(-.035,.526,0);spine.add(knot);
  const arms=[1,-1].map((side,i)=>{
    const data=mirrorArmBindPose(ANATOMY.arms[i]),g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array(data.weight.length*3),3));g.setIndex(data.indices);
    const skinArm=mesh(g,skin);skinArm.name=(i?'left':'right')+'-continuous-arm-and-hand';skinArm.frustumCulled=false;g.attributes.position.setUsage(THREE.DynamicDrawUsage);
    const upper=new THREE.Object3D(),lower=new THREE.Object3D(),hand=new THREE.Object3D();spine.add(upper,lower,hand);
    // Loose, oversized short sleeve, rolled into a cuff above the elbow.
    const sleeveProfile=[[0,0],[.040,0],[.058,.08],[.0675,.18],[.069,.32],[.067,.70],[.068,.72],[.072,.74],[.073,.97],[.068,1],[.064,.97]].map(([r,y])=>new THREE.Vector2(r,y));
    const sleeve=mesh(new THREE.LatheGeometry(sleeveProfile,32),sleeveMat);sleeve.name='rolled-plaid-sleeve';
    return {side,name:i?'left':'right',upper,lower,hand,sleeve,skinArm,data,
      shoulder:new THREE.Vector3(),elbow:new THREE.Vector3(),wrist:new THREE.Vector3(),target:new THREE.Vector3(),pole:new THREE.Vector3(),
      sleeveStart:new THREE.Vector3(),sleeveEnd:new THREE.Vector3(),qu:new THREE.Quaternion(),ql:new THREE.Quaternion(),qh:new THREE.Quaternion(),wristRest:new THREE.Quaternion().setFromAxisAngle(Y,side*.10).multiply(new THREE.Quaternion().setFromAxisAngle(Z,.055))};
  });
  batchStaticMeshes(head,new Set([skull]),hitMeshes);
  batchStaticMeshes(spine,new Set([shirt,tee,...arms.flatMap(a=>[a.sleeve,a.skinArm])]),hitMeshes);
  const a=new THREE.Vector3(),b=new THREE.Vector3(),h=new THREE.Vector3();
  const state={joints:{},hands:{},torsoDepth:.23,shoulderWidth:.33,poseVersion:0,jumpArmBlend:0,appearanceVersion:15,faceSource:'measured-photo-head-v14',
    outfit:'open-plaid-shirt-white-tee-dark-denim-shorts',shirtClearance:Infinity};

  // Keep the hanging shirt outside the thighs and shorts legs (spine-local capsules).
  const toSpine=new THREE.Matrix4(),capsules=[0,1].map(()=>({a:new THREE.Vector3(),b:new THREE.Vector3()})),p=new THREE.Vector3(),d=new THREE.Vector3(),out=new THREE.Vector3(),off=new THREE.Vector3(),axis=new THREE.Vector3();
  const legClearance=s=>(s<.17?lerp(.094,.080,s/.17):lerp(.070,.058,clamp((s-.17)/.16,0,1)))+.010;
  function dressShirt(legState){
    const attr=shirtGeo.attributes.position,arr=attr.array;arr.set(shirtRest);
    let clearance=Infinity;
    if(legState?.joints?.right){
      root.updateMatrix();spine.updateMatrix();toSpine.multiplyMatrices(root.matrix,spine.matrix).invert();
      ['right','left'].forEach((name,k)=>{const j=legState.joints[name];capsules[k].a.fromArray(j.hip).applyMatrix4(toSpine);capsules[k].b.fromArray(j.knee).applyMatrix4(toSpine);});
      for(let n=0;n<arr.length;n+=3){
        if(arr[n+1]>.10)continue;
        p.set(arr[n],arr[n+1],arr[n+2]);
        // Cloth is pushed outward from the body, like a skirt over the legs, so
        // the open fronts never swing across the middle.
        out.set(p.x-centreX(p.y),0,p.z).normalize();
        for(let pass=0;pass<4;pass++){
          let moved=false;
          for(const c of capsules){
            d.subVectors(c.b,c.a);const len=d.length();d.divideScalar(len);
            const s=clamp(off.subVectors(p,c.a).dot(d),0,len);axis.copy(c.a).addScaledVector(d,s);off.subVectors(p,axis);
            const dist=off.length(),need=legClearance(s);
            if(pass===0)clearance=Math.min(clearance,dist-need+.010);
            if(dist<need){p.addScaledVector(out,(need-dist)/Math.max(.35,out.dot(off.divideScalar(Math.max(dist,1e-6))))+1e-4);moved=true;}
          }
          if(!moved)break;
        }
        arr[n]=p.x;arr[n+1]=p.y;arr[n+2]=p.z;
      }
    }
    attr.needsUpdate=true;shirtGeo.computeVertexNormals();state.shirtClearance=clearance;
  }
  // The braids slide over the shirt's outline.
  const shirtOutline=y=>{const [f,b,w]=SHIRT(clamp(y,SHIRT_HEM,SHIRT_TOP));return new THREE.Vector3(f+.004,b+.004,w+.004);};
  function pose(motion,ctx={},dt=0,legState=null){
    root.position.set(-.025,motion.hipHeight,motion.shift);root.rotation.y=motion.pelvisYaw??0;
    const weight=Math.sin(motion.phase*TAU)*(motion.activity??0),forward=.07+clamp((ctx.speed??0)/15,0,1)*.07;
    const lateral=clamp(ctx.lean??0,-.28,.28)*.50+weight*.02;
    state.jumpArmBlend=THREE.MathUtils.lerp(state.jumpArmBlend,motion.airTuck??0,1-Math.exp(-9*dt));
    spine.rotation.set(lateral,-weight*.055,-forward);head.rotation.set(-lateral*.35,weight*.028,forward*.4);
    for(const arm of arms){
      const {side,shoulder,elbow,wrist,target,pole,qu,ql,qh,data}=arm;
      shoulder.set(-.002,.433,side*.160);
      const balance=motion.balanceAmount??0,tuck=state.jumpArmBlend;
      // Relaxed arms hang slightly forward and away from the hips, elbows soft.
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
      // The dropped shoulder seam sits just outside and below the shoulder joint.
      arm.sleeveStart.copy(shoulder);arm.sleeveStart.y+=.002;arm.sleeveStart.z+=side*.004;
      arm.sleeveEnd.copy(shoulder).lerp(elbow,.62);placeBetween(arm.sleeve,arm.sleeveStart,arm.sleeveEnd);
      state.joints[arm.name]={shoulder:shoulder.toArray(),elbow:elbow.toArray(),wrist:wrist.toArray()};
      state.hands[arm.name]={wristFlex:.055,wristTwist:side*.10,palmNormal:h.fromArray(data.palmNormal).applyQuaternion(qh).toArray(),fingers:data.fingers.map(chain=>chain.map(point=>{h.fromArray(point);h.y-=ARM_LENGTHS.lower;return h.applyQuaternion(qh).add(wrist).toArray();}))};
    }
    dressShirt(legState);
    hair.pose({weight,lateral,airTuck:motion.airTuck??0},dt,shirtOutline);
    state.pelvisPosition=root.position.toArray();state.pelvisYaw=root.rotation.y;state.spineRotation=spine.rotation.toArray().slice(0,3);state.poseVersion++;root.updateMatrixWorld(true);return state;
  }
  return {root,spine,head,mouth,knot,arms,shirt,skull,tee,shorts,hair,state,hitMeshes,pose,setFaceTexture(texture){identity.setPhoto(texture);}};
}
