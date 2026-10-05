import * as THREE from 'three';
import { solveTwoBone } from './util.js';

// Pixel landmarks in the existing reference atlas: hip, knee, ankle, sole,
// then shoulder, elbow and wrist. Right and left are anatomical directions.
const VIEWS = [
  { R:[[195,303],[134,382],[77,466],[44,532]], L:[[242,303],[235,387],[235,476],[246,538]], A:[[178,156],[151,226],[122,280]], B:[[280,157],[296,237],[312,298]] },
  { R:[[190,306],[137,383],[71,467],[43,531]], L:[[241,310],[235,384],[231,474],[239,538]], A:[[176,164],[179,235],[204,280]], B:[[271,164],[281,227],[302,282]] },
  { R:[[183,309],[139,384],[80,466],[48,534]], L:[[233,309],[247,382],[233,477],[251,540]], A:[[230,175],[265,239],[325,266]], B:null, torso:[[182,142],[249,142],[238,309],[146,309]] },
  { R:[[250,312],[243,386],[239,477],[246,540]], L:[[192,313],[140,392],[80,471],[48,532]], A:[[267,179],[288,237],[321,268]], B:[[179,170],[156,234],[118,295]] },
  { R:[[272,315],[314,393],[373,472],[417,537]], L:[[224,315],[225,383],[222,475],[219,538]], A:[[304,168],[321,233],[350,264]], B:[[188,170],[167,244],[145,297]] },
  { R:[[266,310],[324,391],[372,472],[413,536]], L:[[220,310],[212,385],[226,476],[231,540]], A:[[270,173],[295,233],[323,283]], B:[[216,166],[199,241],[145,287]] },
  { R:[[245,319],[305,395],[367,476],[405,538]], L:[[221,315],[189,386],[211,481],[216,540]], A:[[241,185],[251,258],[269,315]], B:[[215,180],[190,239],[141,267]] },
  { R:[[219,313],[218,386],[220,479],[221,540]], L:[[268,313],[313,395],[372,476],[403,536]], A:[[188,172],[160,244],[126,291]], B:[[284,170],[290,245],[309,309]] },
];
const SCALE = 280;
const point = ([x,y]) => new THREE.Vector2((x-240)/SCALE, (280-y)/SCALE);
const clamp = (v,a,b) => Math.min(b,Math.max(a,v));

function closest(p,a,b) {
  const x=b[0]-a[0], y=b[1]-a[1];
  const t=clamp(((p[0]-a[0])*x+(p[1]-a[1])*y)/(x*x+y*y),0,1);
  return { d:Math.hypot(p[0]-a[0]-t*x,p[1]-a[1]-t*y),t };
}
function chainWeights(p,chain,ids) {
  const candidates=chain.slice(0,-1).map((a,i)=>({...closest(p,a,chain[i+1]),i}));
  candidates.sort((a,b)=>a.d-b.d);
  const a=candidates[0];
  const weights=[[ids[a.i],1]];
  const joint=a.t<0.5?a.i:a.i+1;
  if (joint>0&&joint<chain.length-1) {
    const d=Math.hypot(p[0]-chain[joint][0],p[1]-chain[joint][1]);
    if(d<25) {const blend=(1-d/25)*0.5;weights[0][1]-=blend;weights.push([ids[a.t<0.5?a.i-1:a.i+1],blend]);}
  }
  return {d:a.d,weights};
}
function geometryFor(view) {
  // Separate source regions prevent triangles between two legs folding across
  // the empty space in the atlas when the photographed stride is regrouped.
  const parts=Array.from({length:3},()=>new THREE.PlaneGeometry(12/7,2,80,112));
  const uv=parts[0].attributes.uv;
  const data=parts.map(()=>({indexes:new Float32Array(uv.count*4),weights:new Float32Array(uv.count*4),mask:new Float32Array(uv.count)}));
  const minHip=Math.min(view.R[0][1],view.L[0][1]);
  for(let n=0;n<uv.count;n++) {
    const p=[uv.getX(n)*480,(1-uv.getY(n))*560];
    const r=chainWeights(p,view.R,[1,2,3]),l=chainWeights(p,view.L,[4,5,6]);
    const armA=view.A?chainWeights(p,view.A,[7,8]):{d:Infinity,weights:[[0,1]]};
    const armB=view.B?chainWeights(p,view.B,[9,10]):{d:Infinity,weights:[[0,1]]};
    let armMask=0;
    const maxWrist=Math.max(view.A?.[2][1]??0,view.B?.[2][1]??0);
    if(p[1]>140 && p[1]<maxWrist+25) {
      const t=clamp((p[1]-155)/(minHip-155),0,1);
      const shoulders=[view.A?.[0][0]??220,view.B?.[0][0]??220];
      const hips=[view.R[0][0],view.L[0][0]];
      const left=view.torso?(1-t)*view.torso[0][0]+t*view.torso[3][0]:(1-t)*(Math.min(...shoulders)-12)+t*(Math.min(...hips)-20);
      const right=view.torso?(1-t)*view.torso[1][0]+t*view.torso[2][0]:(1-t)*(Math.max(...shoulders)+12)+t*(Math.max(...hips)+22);
      const outside=Math.max(left-p[0],p[0]-right);
      armMask=clamp((outside+10)/20,0,1)*clamp((40-Math.min(armA.d,armB.d))/8,0,1);
    }
    const legMask=(p[1]>minHip+34?1:0)*(1-armMask);
    const rightMask=r.d<l.d?1:0;
    const masks=[1-legMask,legMask*rightMask,legMask*(1-rightMask)];
    const hipBlend=clamp((p[1]-minHip-38)/42,0,1);
    const withBody=result=>result.map(([id,w])=>[id,w*hipBlend]).concat([[0,1-hipBlend]]);
    const armRoot=(chain,result)=>{
      if(!chain)return [[0,1]];
      const blend=clamp((p[1]-chain[0][1]-8)/Math.max(chain[1][1]-chain[0][1]-8,25),0,1);
      return result.weights.map(([id,w])=>[id,w*blend]).concat([[0,1-blend]]);
    };
    const arm=armA.d<armB.d?armRoot(view.A,armA):armRoot(view.B,armB);
    const torsoWeights=arm.map(([id,w])=>[id,w*armMask]).concat([[0,1-armMask]]);
    const results=[torsoWeights,withBody(r.weights),withBody(l.weights)];
    data.forEach((part,i)=>{
      part.mask[n]=masks[i];
      results[i].slice(0,4).forEach(([id,w],k)=>{part.indexes[n*4+k]=id;part.weights[n*4+k]=w;});
    });
  }
  return parts.map((geometry,i)=>{
    geometry.setAttribute('aBone',new THREE.BufferAttribute(data[i].indexes,4));
    geometry.setAttribute('aWeight',new THREE.BufferAttribute(data[i].weights,4));
    geometry.setAttribute('aMask',new THREE.BufferAttribute(data[i].mask,1));
    return geometry;
  });
}
function segmentMatrix(matrix,a,b,c,d) {
  const r=b.clone().sub(a),t=d.clone().sub(c),lr=r.length(),lt=t.length();
  if(lr<1e-5||lt<1e-5){matrix.identity();return;}
  r.divideScalar(lr);t.divideScalar(lt);
  const stretch=clamp(lt/lr,0.25,2),side=clamp(Math.sqrt(lr/lt),0.86,1.1);
  const m00=t.x*r.x*stretch+t.y*r.y*side;
  const m01=t.x*r.y*stretch-t.y*r.x*side;
  const m10=t.y*r.x*stretch-t.x*r.y*side;
  const m11=t.y*r.y*stretch+t.x*r.x*side;
  matrix.set(m00,m01,c.x-m00*a.x-m01*a.y,m10,m11,c.y-m10*a.x-m11*a.y,0,0,1);
}

export function createPhotographicRig() {
  const geometries=VIEWS.map(geometryFor);
  const matrices=Array.from({length:11},()=>new THREE.Matrix3());
  const hip=new THREE.Vector3(),ankle=new THREE.Vector3(),knee=new THREE.Vector3(),end=new THREE.Vector3(),pole=new THREE.Vector3(1,0,0);
  const tmp=new THREE.Vector2();
  const state={rightSoleHeight:0.03,leftSoleHeight:0.03,kneeBend:0};
  function pose(index,motion,ctx) {
    state.kneeBend=0;
    const view=VIEWS[index],angle=index*Math.PI/4;
    const forward=Math.sin(angle),lateral=-Math.cos(angle);
    const bodyX=motion.shift*lateral;
    const bodyY=-motion.bodyDip;
    const torsoAngle=-forward*(0.035+Math.min(ctx.speed/15,1)*0.055);
    const centre=point([(view.R[0][0]+view.L[0][0])/2,(view.R[0][1]+view.L[0][1])/2]);
    const ca=Math.cos(torsoAngle),sa=Math.sin(torsoAngle);
    matrices[0].set(ca,-sa,centre.x-ca*centre.x+sa*centre.y+bodyX,
      sa,ca,centre.y-sa*centre.x-ca*centre.y+bodyY,0,0,1);
    for(const [name,side,offset] of [['R',1,1],['L',-1,4]]) {
      const chain=view[name],foot=name==='R'?motion.right:motion.left;
      const source=chain.map(point),base=source[0];
      const hipHeight=0.96+base.y;
      const bootHeight=(chain[3][1]-chain[2][1])/SCALE+0.03;
      hip.set(0,hipHeight+bodyY,side*0.10+motion.shift);
      ankle.set(0.045-foot.out*0.12,bootHeight+foot.lift,side*(0.10+foot.out));
      solveTwoBone(hip,ankle,0.315,0.33,pole,knee,end);
      const projection=p=>new THREE.Vector2(base.x+forward*(p.x-hip.x)+lateral*(p.z-side*0.10),base.y+(p.y-hipHeight));
      const h=projection(hip),k=projection(knee),a=projection(end);
      segmentMatrix(matrices[offset],source[0],source[1],h,k);
      segmentMatrix(matrices[offset+1],source[1],source[2],k,a);
      // Skates keep their photographed shape; only bank slightly on the push.
      const delta=source[3].clone().sub(source[2]);
      const bank=-side*foot.bank*Math.cos(angle);
      const toe=new THREE.Vector2(delta.x*Math.cos(bank)-delta.y*Math.sin(bank),delta.x*Math.sin(bank)+delta.y*Math.cos(bank)).add(a);
      toe.y=0.03+foot.lift-0.96;
      segmentMatrix(matrices[offset+2],source[2],source[3],a,toe);
      state[name==='R'?'rightSoleHeight':'leftSoleHeight']=0.96+toe.y;
      state.kneeBend=Math.max(state.kneeBend,Math.abs(knee.x-hip.x));
    }
    for(const [chain,side,offset] of [[view.A,1,7],[view.B,-1,9]]) {
      if(!chain){matrices[offset].copy(matrices[0]);matrices[offset+1].copy(matrices[0]);continue;}
      const source=chain.map(point);
      tmp.copy(source[0]).applyMatrix3(matrices[0]);
      // Small joint rotations preserve the photographed sleeves and hands.
      // Fore-aft arm swing projects strongly in a side view and softly head-on.
      const swing=side*motion.armSwing*(forward*1.15+lateral*0.2)+(ctx.trick??0)*side*lateral*0.18;
      const turn=(v,a)=>new THREE.Vector2(v.x*Math.cos(a)-v.y*Math.sin(a),v.x*Math.sin(a)+v.y*Math.cos(a));
      const upper=source[1].clone().sub(source[0]);
      const lower=source[2].clone().sub(source[1]);
      const e=turn(upper,torsoAngle+swing).add(tmp);
      const w=turn(lower,torsoAngle+swing*0.65).add(e);
      segmentMatrix(matrices[offset],source[0],source[1],tmp,e);
      segmentMatrix(matrices[offset+1],source[1],source[2],e,w);
    }
    return matrices;
  }
  return {geometries,matrices,pose,state};
}
