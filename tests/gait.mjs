import assert from 'node:assert/strict';
import { createSkatingMotion, skateFoot } from '../src/skating-motion.js';
import { createPhotographicRig } from '../src/zhiguo-rig.js';

// Physical constraints, rather than comparing to an implementation snapshot.
const rig=createPhotographicRig();
const motion=createSkatingMotion();
const ctx={speed:7.5,pedal:1,rhythm:2,airborne:false,trick:0};
for (let n=0;n<1800;n++) {
  const gait=motion.update(1/120,ctx);
  assert(gait.right.contact||gait.left.contact,'Ground skating must retain a supporting skate');
  for(let view=0;view<8;view++) {
    rig.pose(view,gait,ctx);
    for(const matrix of rig.matrices) assert(matrix.elements.every(Number.isFinite),'Pose must remain finite in every view');
    for(const side of ['right','left']) {
      const height=rig.state[side+'SoleHeight'];
      assert(height>=0.03-1e-6,'No skate may penetrate the road');
      if(gait[side].contact) assert(height<0.033,'A supporting skate must remain on the road');
    }
  }
}
for (const phase of [0,0.5,0.76,0.97,1]) {
  const a=skateFoot(phase-1e-5,0.23),b=skateFoot(phase+1e-5,0.23);
  assert(Math.abs(a.out-b.out)<0.001&&Math.abs(a.lift-b.lift)<0.001,'Stroke transitions must be continuous');
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
for(const parts of rig.geometries) for(const geometry of parts) {
  const weights=geometry.attributes.aWeight.array;
  for(let i=0;i<weights.length;i+=4) assert(Math.abs(weights[i]+weights[i+1]+weights[i+2]+weights[i+3]-1)<1e-5,'Skinning weights must sum to one');
}
console.log('PASS: 8 views, 15 seconds of skating, ground support, stroke continuity, coasting, jump, landing and normalized skinning.');
