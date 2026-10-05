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
