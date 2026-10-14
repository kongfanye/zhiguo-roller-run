import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createSkaterBody,ARM_LENGTHS} from '../src/skater-body.js';
import {createSkaterLegs} from '../src/skater-legs.js';
import {createSkatingMotion} from '../src/skating-motion.js';

const body=createSkaterBody(),legs=createSkaterLegs(),motion=createSkatingMotion();
const v=a=>new THREE.Vector3(...a);
// Catch the reported paper-plane failure in the actual render geometry.
for(const mesh of [body.shirt,body.skull]){
  mesh.geometry.computeBoundingBox();const size=mesh.geometry.boundingBox.getSize(new THREE.Vector3());
  assert(size.x>0.14&&size.y>0.24&&size.z>0.14,'Head and torso must have real volume along all axes');
  assert(!mesh.material.transparent,'The volume must remain opaque from above and behind');
}
assert.equal(body.head.parent,body.spine,'Head must move with the articulated spine');
let prior=null;
const segmentDistance=(p,a,b)=>{const d=b.clone().sub(a),t=THREE.MathUtils.clamp(p.clone().sub(a).dot(d)/d.lengthSq(),0,1);return p.distanceTo(a.clone().addScaledVector(d,t));};
for(let n=0;n<2400;n++){
  const ctx={speed:7.5,pedal:n<2100?1:0,rhythm:2,lean:0.28*Math.sin(n/160),
    trick:n>720&&n<1200?0.8:0,airborne:n>=1600&&n<1640,airHeight:n>=1600&&n<1640?0.1:0};
  const gait=motion.update(1/120,ctx);legs.pose(gait,ctx,1/120);body.pose(gait,ctx,1/120);
  const center=v(legs.state.joints.right.hip).add(v(legs.state.joints.left.hip)).multiplyScalar(0.5);
  assert(body.root.position.distanceTo(center)<1e-6,'Upper body and legs must share the same pelvis');
  assert.equal(body.root.rotation.y,gait.pelvisYaw,'Pelvis rotation must carry the upper body');
  for(const arm of body.arms){
    const j=body.state.joints[arm.name],s=v(j.shoulder),e=v(j.elbow),w=v(j.wrist);
    assert(Math.abs(s.distanceTo(e)-ARM_LENGTHS.upper)<1e-6,'Upper arm length must remain fixed');
    assert(Math.abs(e.distanceTo(w)-ARM_LENGTHS.lower)<1e-6,'Forearm length must remain fixed');
    const p=arm.skinArm.geometry.attributes.position;
    for(let i=0;i<p.count;i+=11){
      const vertex=new THREE.Vector3().fromBufferAttribute(p,i);
      assert(vertex.toArray().every(Number.isFinite),'Anatomical skin vertices must remain finite');
      assert(Math.min(segmentDistance(vertex,s,e),segmentDistance(vertex,e,w))<.18,'Skin and fingers must remain attached to the arm skeleton');
    }
    if(prior)for(const joint of ['shoulder','elbow','wrist'])
      assert(v(j[joint]).distanceTo(v(prior[arm.name][joint]))<0.026,'Arm motion must remain continuous');
  }
  body.root.traverse(node=>assert(node.matrixWorld.elements.every(Number.isFinite),'All body joints must remain finite'));
  prior=structuredClone(body.state.joints);
}
// Arm swing is coordinated with the alternating support, not random motion.
for(const phase of [0.25,0.75]){
  const gait=motion.state;gait.phase=phase;gait.activity=1;gait.balanceAmount=0;
  body.pose(gait,{speed:7.5});
  const right=body.state.joints.right.wrist[0],left=body.state.joints.left.wrist[0];
  assert(phase===0.25?left>right:right>left,'Arms must alternate with weight transfer');
}
console.log('PASS: volumetric head/torso, shared pelvis, fixed arm lengths, attached anatomical skin/hands, coordinated swing and continuous upper-body joints.');

// Her skating outfit: an open plaid shirt over a white tee and dark denim shorts.
{
  const body=createSkaterBody(),legs=createSkaterLegs(),motion=createSkatingMotion(),root=new THREE.Group();root.add(legs.root,body.root);
  for(const part of [body.tee,body.shorts,body.shirt])assert(part?.isMesh,'Tee, shorts and shirt are all modelled');
  const p=new THREE.Vector3(),toSpine=new THREE.Matrix4(),hip=new THREE.Vector3(),knee=new THREE.Vector3(),d=new THREE.Vector3();
  let minGap=Infinity,worst=Infinity,maxLegStep=0,prior=null;
  for(let n=0;n<1500;n++){
    const ctx={speed:7.5,pedal:n<1200?1:0,rhythm:2,lean:.28*Math.sin(n/150),trick:n>500&&n<800?1:0,airborne:n>=1000&&n<1050,airHeight:n>=1000&&n<1050?.3*Math.sin((n-1000)/50*Math.PI):0};
    const gait=motion.update(1/120,ctx);legs.pose(gait,ctx,1/120);body.pose(gait,ctx,1/120,legs.state);
    const shirt=body.shirt.geometry.attributes.position;
    body.root.updateMatrix();body.spine.updateMatrix();toSpine.multiplyMatrices(body.root.matrix,body.spine.matrix).invert();
    for(const name of ['right','left']){
      hip.fromArray(legs.state.joints[name].hip).applyMatrix4(toSpine);knee.fromArray(legs.state.joints[name].knee).applyMatrix4(toSpine);
      d.subVectors(knee,hip);const len=d.length();d.divideScalar(len);
      for(let i=0;i<shirt.count;i++){
        p.fromBufferAttribute(shirt,i);if(p.y>.10)continue;
        const s=THREE.MathUtils.clamp(p.clone().sub(hip).dot(d),0,len);
        worst=Math.min(worst,p.distanceTo(hip.clone().addScaledVector(d,s))-(s<.17?.078:.056));
      }
    }
    for(let i=0;i<shirt.count;i++){p.fromBufferAttribute(shirt,i);if(p.x>.06&&p.y<.44)minGap=Math.min(minGap,Math.abs(p.z));}
    const points=[];
    for(const leg of legs.legs){const a=leg.leg.geometry.attributes.position;for(let i=0;i<a.count;i+=37){p.fromBufferAttribute(a,i);assert(p.toArray().every(Number.isFinite));points.push(p.clone());}}
    if(prior)for(let i=0;i<points.length;i++)maxLegStep=Math.max(maxLegStep,points[i].distanceTo(prior[i]));prior=points;
  }
  assert(minGap>.05,`The shirt hangs open at the front (${minGap})`);
  assert(worst>-1e-4,`The shirt's hem never cuts into the thighs or shorts (${worst})`);
  assert(maxLegStep<.03,`The skinned legs move continuously (${maxLegStep} m/frame at 120 Hz)`);
  // Each skinned leg stays on its bones: no vertex strays from the hip-knee-ankle chain.
  const seg=(q,a,b)=>{const ab=b.clone().sub(a),t=THREE.MathUtils.clamp(q.clone().sub(a).dot(ab)/ab.lengthSq(),0,1);return q.distanceTo(a.clone().addScaledVector(ab,t));};
  for(const leg of legs.legs){
    const j=legs.state.joints[leg.name],h=v(j.hip),k=v(j.knee),a=v(j.ankle),pos=leg.leg.geometry.attributes.position;
    for(let i=0;i<pos.count;i+=5){p.fromBufferAttribute(pos,i);assert(Math.min(seg(p,h,k),seg(p,k,a))<.11,'Leg skin stays attached to the leg bones');}
  }
  console.log(`PASS: open plaid shirt (${(minGap*200).toFixed(1)} cm opening), hem clear of the thighs through skating, balance and jumps, and continuous skinned legs (${(maxLegStep*1000).toFixed(1)} mm/frame).`);
}
