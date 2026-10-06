import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {createSkaterBody} from '../src/skater-body.js';
import {createSkatingMotion} from '../src/skating-motion.js';

const body=createSkaterBody(),g=body.skull.geometry;
const hash=v=>createHash('sha256').update(v).digest('hex');
// Captured from the accepted v8 face before replacing the hairstyle.
assert.equal(hash(Buffer.from(g.attributes.position.array.buffer)),'52ad7a685b300c2c9c1b98f14072cbb45b3805e3611789eb19e125f1e235c2c1','Face vertices must remain exactly unchanged');
assert.equal(hash(Buffer.from(g.attributes.normal.array.buffer)),'ed2f4c639caeaf0d1b622d8e44326dc2ba168108e5e3f22c647af3cbafa85eff','Face normals must remain exactly unchanged');
assert.equal(hash(Buffer.from(g.index.array.buffer)),'54add59a2a0a126b576a3da30baf9a1c787af41ae82c10cc1d1f5e7c493c60bf','Face topology must remain exactly unchanged');
assert.equal(hash(body.skull.material.onBeforeCompile.toString()),'674d7e46cbd89fab72ee73b14f8bcddb6d0f4f962df267c227704ca17849e1a3','Face projection and lighting must remain unchanged');
assert.equal(hash(readFileSync('assets/zhiguo-identity-v8.jpg')),'d3a0104e1b6a1633827f3c3a45593e75924f06126b195fc560d33b31d6114592','Original face photograph must remain unchanged');
assert.deepEqual(body.head.position.toArray(),[.002,.635,0]);

const motion=createSkatingMotion(),v=new THREE.Vector3();let prior=null,maxStep=0;
for(let i=0;i<480;i++){
  const ctx={speed:7.5,pedal:1,lean:.28*Math.sin(i/60),trick:i>120&&i<240?1:0,airborne:i>=300&&i<350,airHeight:i>=300&&i<350?.3*Math.sin((i-300)/50*Math.PI):0};
  const m=motion.update(1/60,ctx);body.pose(m,ctx,1/60);
  const points=[];
  for(const item of body.hair.dynamic){const p=item.mesh.geometry.attributes.position;
    for(let n=0;n<p.count;n+=13){
      v.fromBufferAttribute(p,n).applyMatrix4(body.head.matrix);
      assert(v.toArray().every(Number.isFinite),'Hair must remain finite while turning, balancing and jumping');
      points.push(v.clone());
    }
  }
  if(prior)for(let n=0;n<points.length;n++)maxStep=Math.max(maxStep,points[n].distanceTo(prior[n]));
  prior=points;
}
assert(maxStep<.015,'Loose hair must move continuously without sudden jumps');
console.log(`PASS: v8 face geometry/material/photo unchanged; loose hair stays connected and finite; maximum local hair movement ${(maxStep*1000).toFixed(2)} mm/frame.`);
