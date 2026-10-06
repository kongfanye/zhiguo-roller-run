import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createSkaterBody} from '../src/skater-body.js';
import {createSkatingMotion} from '../src/skating-motion.js';
import {IDENTITY_PHOTO} from '../src/zhiguo-identity.js';

const body=createSkaterBody(),g=body.skull.geometry;
assert.equal(IDENTITY_PHOTO.asset,'zhiguo-front.webp','Restore the exact portrait chosen in the user\'s third reference');
const seams=new Map();
for(let i=0;i<g.attributes.position.count;i++){
  const p=new THREE.Vector3().fromBufferAttribute(g.attributes.position,i);
  if(p.x<.04)continue;
  const key=p.toArray().map(v=>Math.round(v*1e5)).join(','),normal=new THREE.Vector3().fromBufferAttribute(g.attributes.normal,i);
  if(seams.has(key))assert(normal.distanceTo(seams.get(key))<.02,'No lighting seam may divide the middle of the face');
  seams.set(key,normal);
}
const plaits=body.hair.dynamic.filter(item=>item.mesh.name.endsWith('plait'));
assert.equal(plaits.length,2,'The chosen hairstyle must have two braids');
for(const item of plaits){item.mesh.geometry.computeBoundingBox();const size=item.mesh.geometry.boundingBox.getSize(new THREE.Vector3());assert(size.x>.03&&size.y>.20&&size.z>.012,'Each braid must have real three-dimensional volume');}
const motion=createSkatingMotion(),v=new THREE.Vector3();let prior=null,maxStep=0;
for(let i=0;i<480;i++){
  const ctx={speed:7.5,pedal:1,lean:.28*Math.sin(i/60),trick:i>120&&i<240?1:0,airborne:i>=300&&i<350,airHeight:i>=300&&i<350?.3*Math.sin((i-300)/50*Math.PI):0};
  body.pose(motion.update(1/60,ctx),ctx,1/60);
  const points=[];
  for(const item of body.hair.dynamic){const p=item.mesh.geometry.attributes.position;
    for(let n=0;n<p.count;n+=13){v.fromBufferAttribute(p,n).applyMatrix4(body.head.matrix);assert(v.toArray().every(Number.isFinite));points.push(v.clone());}
  }
  if(prior)for(let n=0;n<points.length;n++)maxStep=Math.max(maxStep,points[n].distanceTo(prior[n]));prior=points;
}
assert(maxStep<.015,'Braids and ties must move continuously without sudden jumps');
console.log(`PASS: restored portrait, seamless face normals, two volumetric braids, and continuous braid motion (${(maxStep*1000).toFixed(2)} mm/frame).`);
