import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createSkatingMotion,skateFoot} from '../src/skating-motion.js';
import {createSkaterLegs} from '../src/skater-legs.js';
import {createSkaterBody} from '../src/skater-body.js';

// Check rendered joint trajectories at different refresh rates, including
// realistic take-off/landing heights and stopping/restarting the stride.
const finals=[];
for(const fps of [30,60,120]){
  const motion=createSkatingMotion(),legs=createSkaterLegs(),body=createSkaterBody(),root=new THREE.Group();root.add(legs.root,body.root);
  let previous=null,maxSpeed=0;
  for(let n=0;n<fps*12;n++){
    const t=(n+1)/fps,jump=(t-4)/.85,airborne=jump>0&&jump<1,airHeight=airborne?4*jump*(1-jump)*.36:0;
    const ctx={speed:7.5,pedal:t>=6&&t<7.5?0:1,trick:t>=8&&t<10?1:0,rhythm:2,lean:.2*Math.sin(t),airborne,airHeight};
    const gait=motion.update(1/fps,ctx);legs.pose(gait,ctx,1/fps);body.pose(gait,ctx,1/fps);root.position.y=airHeight;root.updateMatrixWorld(true);
    assert(legs.state.maxReachError<1e-6,'A jump, turn, or balance transition must not separate ankle and boot');
    if(!airborne)assert(gait.right.contact||gait.left.contact,'Ground transitions must retain support');
    const points=[];
    for(const name of ['right','left']){
      const leg=legs.state.joints[name];for(const key of ['hip','knee','ankle'])points.push(new THREE.Vector3(...leg[key]).applyMatrix4(legs.root.matrixWorld));
      const arm=body.state.joints[name];for(const key of ['shoulder','elbow','wrist'])points.push(new THREE.Vector3(...arm[key]).applyMatrix4(body.spine.matrixWorld));
    }
    if(previous)for(let i=0;i<points.length;i++)maxSpeed=Math.max(maxSpeed,points[i].distanceTo(previous[i])*fps);
    previous=points;
  }
  assert(maxSpeed<5.8,`No rendered joint may teleport during realistic action transitions (${fps} Hz, ${maxSpeed.toFixed(2)} m/s)`);
  finals.push(previous);console.log(`PASS: ${fps} Hz action sequence, maximum joint movement speed ${maxSpeed.toFixed(2)} m/s`);
}
for(let i=0;i<finals[0].length;i++)assert(finals[0][i].distanceTo(finals[2][i])<.05,'Refresh rate must not substantially change the final pose');
// Quintic easing must preserve foot velocity on both sides of every stroke boundary.
const eps=1e-5;
for(const phase of [0,.42,.72,.94,1])for(const key of ['out','fore','lift']){
  const a=skateFoot(phase-2*eps,.215)[key],b=skateFoot(phase-eps,.215)[key],c=skateFoot(phase+eps,.215)[key],d=skateFoot(phase+2*eps,.215)[key];
  assert(Math.abs((b-a)/eps-(d-c)/eps)<.002,'A stroke boundary must not abruptly reverse foot velocity');
}
console.log('PASS: consistent poses across refresh rates and continuous foot velocity at all stroke boundaries.');
