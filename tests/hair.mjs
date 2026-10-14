import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createSkaterBody} from '../src/skater-body.js';
import {createSkatingMotion} from '../src/skating-motion.js';
import {HEAD_MODEL} from '../src/zhiguo-head-model.js';
import {HEAD_LANDMARKS,headRadius} from '../src/zhiguo-identity.js';

const body=createSkaterBody(),g=body.skull.geometry,L=HEAD_LANDMARKS,v=new THREE.Vector3();
// One face, from one photograph, with one expression.
assert.equal(HEAD_MODEL.source,'zhiguo-identity-v8.jpg','The face comes from her single frontal portrait');
assert.equal(HEAD_MODEL.expression,'smile');
assert.equal(Object.keys(g.morphAttributes).length,0,'The head has no expression morphs to switch between');
// Real adult proportions, measured from her landmarks.
const pupils=new THREE.Vector3(...L.pupilRight).distanceTo(new THREE.Vector3(...L.pupilLeft));
assert(Math.abs(pupils-.062)<.004,`Pupil distance ${pupils}`);
g.computeBoundingBox();const size=g.boundingBox.getSize(new THREE.Vector3());
const height=g.boundingBox.max.y-L.chin[1];
assert(height>.20&&height<.24,`Chin to crown ${height} m`);
assert(size.z>.14&&size.z<.16,`Head breadth ${size.z} m`);
assert(L.noseTip[0]-L.nasion[0]>.015,'The nose stands out of the face');
// The measured surface is smooth: only the nose and mouth curve sharply, and
// the cranium, neck and the join to the face have no spikes or folds.
for(let az=-Math.PI;az<Math.PI;az+=.02)for(let y=-.14;y<.12;y+=.002){
  const r=headRadius(az,y),bend=Math.max(Math.abs(headRadius(az,y+.002)-2*r+headRadius(az,y-.002)),Math.abs(headRadius(az+.02,y)-2*r+headRadius(az-.02,y)));
  assert(r>.02&&r<.13&&bend<(Math.abs(az)<1.2?.006:.0015),`Radius field ${r} / ${bend} at ${az.toFixed(2)}, ${y.toFixed(3)}`);
}
const positions=g.attributes.position.array.slice(),texture={};
body.setFaceTexture(texture);
const plaits=body.hair.dynamic.filter(item=>item.mesh.name.endsWith('plait'));
assert.equal(plaits.length,2,'The hairstyle has two braids');
for(const item of plaits){item.mesh.geometry.computeBoundingBox();const s=item.mesh.geometry.boundingBox.getSize(new THREE.Vector3());assert(s.x>.03&&s.y>.20&&s.z>.012,'Each braid has real three-dimensional volume');}
const motion=createSkatingMotion();let prior=null,maxStep=0;
for(let i=0;i<480;i++){
  const ctx={speed:7.5,pedal:1,lean:.28*Math.sin(i/60),trick:i>120&&i<240?1:0,airborne:i>=300&&i<350,airHeight:i>=300&&i<350?.3*Math.sin((i-300)/50*Math.PI):0};
  body.pose(motion.update(1/60,ctx),ctx,1/60);
  const points=[];
  for(const item of body.hair.dynamic){const p=item.mesh.geometry.attributes.position;
    for(let n=0;n<p.count;n+=13){v.fromBufferAttribute(p,n).applyMatrix4(body.head.matrix);assert(v.toArray().every(Number.isFinite));points.push(v.clone());}
  }
  if(prior)for(let n=0;n<points.length;n++)maxStep=Math.max(maxStep,points[n].distanceTo(prior[n]));prior=points;
}
assert(maxStep<.015,'Braids and ties move continuously without sudden jumps');
// Skating, balancing and jumping never change her face.
assert.deepEqual(g.attributes.position.array,positions,'The face geometry stays the same while she skates');
assert.equal(body.skull.material.map,texture,'The face texture stays the same while she skates');
console.log(`PASS: one photo-measured face with one expression, ${(pupils*1000).toFixed(1)} mm pupils, ${(height*100).toFixed(1)} cm chin to crown, smooth head surface, two volumetric braids moving continuously (${(maxStep*1000).toFixed(2)} mm/frame).`);
