import assert from 'node:assert/strict';
import { createSkatingMotion, skateFoot } from '../src/skating-motion.js';
import { createSkaterLegs, LEG_LENGTHS } from '../src/skater-legs.js';
import * as THREE from 'three';

// Physical constraints, rather than comparing to an implementation snapshot.
const legs=createSkaterLegs();
const motion=createSkatingMotion();
const ctx={speed:7.5,pedal:1,rhythm:2,airborne:false,trick:0};
for (let n=0;n<1800;n++) {
  const gait=motion.update(1/120,ctx);
  legs.pose(gait,ctx,1/120);
  assert(gait.right.contact||gait.left.contact,'Ground skating must retain a supporting skate');
  for(const side of ['right','left']) {
      const height=legs.state[side+'SoleHeight'];
      assert(height>=0.03-1e-6,'No skate may penetrate the road');
      if(gait[side].contact) assert(height<0.033,'A supporting skate must remain on the road');
  }
}
for (const phase of [0,0.42,0.72,0.94,1]) {
  const a=skateFoot(phase-1e-5,0.23),b=skateFoot(phase+1e-5,0.23);
  assert(Math.abs(a.out-b.out)<0.001&&Math.abs(a.lift-b.lift)<0.001&&Math.abs(a.fore-b.fore)<0.001,'Stroke transitions must be continuous');
}
for(let n=0;n<360;n++) {
  motion.update(1/120,{...ctx,trick:Math.sin(n/360*Math.PI)});
  assert(motion.state.right.contact||motion.state.left.contact,'A balance trick must retain ground support');
}
for(let n=0;n<600;n++) motion.update(1/120,{...ctx,pedal:0});
assert.equal(motion.state.mode,'coast');
assert(motion.state.cadenceSpm<0.01,'Coasting must stop the stepping animation');
motion.update(1/60,{...ctx,airborne:true});
assert(!motion.state.left.contact&&!motion.state.right.contact,'Jumping releases both ground contacts');
motion.update(1/60,ctx);
assert(motion.state.landing>0,'Landing must absorb the impact with a knee dip');
console.log('PASS: 15 seconds of skating, ground support, stroke continuity, coasting, jump and landing.');

// These catch the visible failure that the earlier finite-value/height tests
// missed: anatomical lengths, forward knees, actual wheel contact and jumps
// in the rendered joint positions, including stage boundaries and coasting.
const vector=a=>new THREE.Vector3(...a);
for(const speed of [0,2,7.5,15]) {
  const cycle=createSkatingMotion();let previous=null;
  for(let n=0;n<1200;n++) {
    const context={...ctx,speed,pedal:n<900?1:0};
    const gait=cycle.update(1/120,context);legs.pose(gait,context,1/120);
    assert(legs.state.maxReachError<1e-6,'Skates must remain attached to the ankle');
    for(const leg of legs.legs) {
      const j=legs.state.joints[leg.name],h=vector(j.hip),k=vector(j.knee),a=vector(j.ankle);
      assert(Math.abs(h.distanceTo(k)-LEG_LENGTHS.thigh)<1e-6,'Thigh length must remain fixed');
      assert(Math.abs(k.distanceTo(a)-LEG_LENGTHS.shin)<1e-6,'Shin length must remain fixed');
      const t=h.distanceTo(k)/(h.distanceTo(k)+k.distanceTo(a));
      assert(k.x>h.clone().lerp(a,t).x,'Knee must bend forwards, never backwards');
      assert(j.bend<2,'Knee flexion must remain within the intended skating range');
      if(previous)for(const joint of ['hip','knee','ankle']) {
        assert(vector(j[joint]).distanceTo(vector(previous[leg.name][joint]))<0.026,'No visible frame-to-frame joint teleport at 120 Hz');
      }
      leg.skate.updateMatrixWorld(true);
      for(const axle of leg.wheels) {
        const tire=axle.children[0];tire.updateWorldMatrix(true,false);
        let bottom=Infinity;
        const position=tire.geometry.attributes.position;
        for(let v=0;v<position.count;v++)bottom=Math.min(bottom,new THREE.Vector3().fromBufferAttribute(position,v).applyMatrix4(tire.matrixWorld).y);
        assert(bottom>=0.03-0.0002,'Actual wheel geometry must not penetrate the road');
        if(gait[leg.name].contact)assert(bottom<0.033,'Supporting wheels must actually touch the road');
      }
    }
    previous=structuredClone(legs.state.joints);
  }
}
console.log('PASS: fixed bone lengths, forward knees, attached boots, actual wheel contact and continuous joint positions at four speeds.');

const transition=createSkatingMotion();let trick=0,prior=null;
for(let n=0;n<1200;n++) {
  trick+=(Number(n>=240&&n<720)-trick)*(1-Math.exp(-4/120));
  const context={...ctx,speed:15,trick,lean:0.28*Math.sin(n/140)};
  const gait=transition.update(1/120,context);legs.pose(gait,context,1/120);
  assert(gait.right.contact||gait.left.contact,'Trick transitions must retain a supporting skate');
  assert(legs.state.maxReachError<1e-6,'Turning and tricks must not detach the boots');
  if(prior)for(const side of ['right','left'])for(const joint of ['hip','knee','ankle']) {
    assert(vector(legs.state.joints[side][joint]).distanceTo(vector(prior[side][joint]))<0.026,'Entering or leaving a trick must not snap a leg');
  }
  prior=structuredClone(legs.state.joints);
}
console.log('PASS: turning and entering/leaving a single-foot balance retain contact and continuous joints.');
