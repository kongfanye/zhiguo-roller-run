import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createSkaterBody} from '../src/skater-body.js';
import {createSkatingMotion} from '../src/skating-motion.js';

const body=createSkaterBody(),motion=createSkatingMotion(),v=new THREE.Vector3(),w=new THREE.Vector3();
const edges=body.arms.map(arm=>{
  const count=new Map(),idx=arm.data.indices;
  for(let n=0;n<idx.length;n+=3)for(let j=0;j<3;j++){
    const a=idx[n+j],b=idx[n+(j+1)%3],key=a<b?`${a},${b}`:`${b},${a}`;count.set(key,(count.get(key)??0)+1);
  }
  const result=[];
  for(const [key,total] of count){const [a,b]=key.split(',').map(Number);
    if(Math.min(arm.data.handWeight[a],arm.data.handWeight[b])>.98){
      assert.equal(total,2,'Every fingertip must be a closed mesh; an export cutoff must not amputate digits');
      const length=v.fromArray(arm.data.lower,a*3).distanceTo(w.fromArray(arm.data.lower,b*3));result.push({a,b,length});
    }
  }
  return result;
});
let prior=null,maxStep=0,maxStrain=0,maxFrame=0;
for(let n=0;n<720;n++){
  const ctx={speed:7.5,pedal:n<600?1:0,lean:.28*Math.sin(n/75),trick:n>200&&n<360?1:0,airborne:n>=450&&n<500,airHeight:n>=450&&n<500?.3*Math.sin((n-450)/50*Math.PI):0};
  const gait=motion.update(1/60,ctx);body.pose(gait,ctx,1/60);body.root.updateMatrixWorld(true);
  const points=[];
  for(let i=0;i<body.arms.length;i++){
    const arm=body.arms[i],p=arm.skinArm.geometry.attributes.position,hand=body.state.hands[arm.name];
    assert.equal(hand.fingers.length,5);assert(Math.abs(hand.wristFlex)<.15&&Math.abs(hand.wristTwist)<.25,'Skating must keep wrists close to neutral');
    if(gait.balanceAmount<.1)assert(hand.palmNormal[2]*arm.side<-.6,'Palms must face the thighs during normal skating');
    for(let f=0;f<5;f++)for(let j=0;j<3;j++){
      const expected=v.fromArray(arm.data.fingers[f][j]).distanceTo(w.fromArray(arm.data.fingers[f][j+1]));
      const actual=v.fromArray(hand.fingers[f][j]).distanceTo(w.fromArray(hand.fingers[f][j+1]));
      assert(Math.abs(actual-expected)<1e-6,'Each finger phalanx must retain its length as the arm moves');
    }
    for(const edge of edges[i]){
      const length=v.fromBufferAttribute(p,edge.a).distanceTo(w.fromBufferAttribute(p,edge.b));
      if(edge.length>1e-5)maxStrain=Math.max(maxStrain,Math.abs(length/edge.length-1));
    }
    for(let k=0;k<p.count;k+=31)if(arm.data.handWeight[k]>.98)points.push(new THREE.Vector3().fromBufferAttribute(p,k).applyMatrix4(arm.skinArm.matrixWorld));
  }
  if(prior)for(let i=0;i<points.length;i++){const step=points[i].distanceTo(prior[i]);if(step>maxStep){maxStep=step;maxFrame=n;}}prior=points;
}
assert(maxStrain<.025,'The actual hand mesh must not stretch or collapse');assert(maxStep<.05,`Hand vertices must stay below 3 m/s at 60 Hz: ${maxStep} at frame ${maxFrame}`);
console.log(`PASS: complete five-finger meshes, inward neutral palms, fixed finger lengths, ${maxStrain.toFixed(5)} maximum hand strain and ${(maxStep*1000).toFixed(2)} mm/frame continuity.`);
