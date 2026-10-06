import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {scalpGeometry,fiberTexture} from './zhiguo-hair.js';

const TAU=Math.PI*2,smooth=THREE.MathUtils.smoothstep;
export function createBraidedHair({head,skull,mesh}){
  const root=new THREE.Group();root.name='center-part-twin-braids';head.add(root);
  const material=new THREE.MeshStandardMaterial({map:fiberTexture(),roughness:.88});
  const fine=material.clone();fine.color.set('#b5a397');
  const cap=mesh(scalpGeometry(skull),material,root);cap.name='rounded-center-part-scalp';
  const swept=[];
  for(const side of [1,-1])for(let n=0;n<12;n++){
    const q=n/11,points=[new THREE.Vector3(.045-.085*q,.143-.014*q,side*.004),
      new THREE.Vector3(.083-.074*q,.113,side*.039),new THREE.Vector3(.073-.065*q,.055,side*.078),
      new THREE.Vector3(.027-.050*q,-.030,side*.087),new THREE.Vector3(.009,-.068,side*.080)];
    swept.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),30,.0026+Math.sin(n*1.4)**2*.0015,6,false));
  }
  const locks=mesh(mergeGeometries(swept),material,root);locks.name='swept-parted-hair-to-braid-roots';
  const dynamic=[];
  for(const side of [1,-1]){
    const parts=[];
    for(let strand=0;strand<3;strand++){
      const points=[];
      for(let n=0;n<=80;n++){
        const t=n/80,a=t*TAU*4.6+strand*TAU/3,r=.009*(1-.35*t);
        points.push(new THREE.Vector3(.012+.120*smooth(t,.05,.80)+Math.cos(a)*r,-.062-.238*t,side*(.082-.013*t)+Math.sin(a)*r));
      }
      parts.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),80,.0062,7,false));
    }
    const g=mergeGeometries(parts),braid=mesh(g,material,root);braid.name=side>0?'right-plait':'left-plait';braid.frustumCulled=false;
    g.attributes.position.setUsage(THREE.DynamicDrawUsage);dynamic.push({mesh:braid,rest:g.attributes.position.array.slice()});
    const tieGeometry=new THREE.TorusGeometry(.009,.0015,6,16);tieGeometry.rotateX(Math.PI/2);tieGeometry.translate(.130,-.282,side*.069);
    const tie=mesh(tieGeometry,new THREE.MeshStandardMaterial({color:'#9e7358',roughness:.8}),root);tie.name='braid-tie';
    tieGeometry.attributes.position.setUsage(THREE.DynamicDrawUsage);dynamic.push({mesh:tie,rest:tieGeometry.attributes.position.array.slice()});
    // Short, tapered loose ends beneath the tie.
    for(let n=0;n<5;n++){
      const points=[new THREE.Vector3(.130,-.282,side*.069),new THREE.Vector3(.131+n*.0008,-.302,side*.069+(n-2)*.0016),new THREE.Vector3(.128,-.318+(n%2)*.003,side*.068+(n-2)*.002)];
      const end=mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),12,.0017,5,false),fine,root);
      dynamic.push({mesh:end,rest:end.geometry.attributes.position.array.slice()});
    }
  }
  const state={roll:0,rollVelocity:0,pitch:0,pitchVelocity:0};
  const inverse=new THREE.Matrix4(),point=new THREE.Vector3();
  function spring(key,target,dt){const v=key+'Velocity',w=10,e=Math.exp(-w*dt),d=state[key]-target,c=state[v]+w*d;state[key]=target+(d+c*dt)*e;state[v]=(state[v]-w*c*dt)*e;}
  function pose({weight,lateral,airTuck},dt,torsoProfile){
    if(dt>0){spring('roll',weight*.030+lateral*.10,dt);spring('pitch',airTuck*.025,dt);}
    head.updateMatrix();inverse.copy(head.matrix).invert();
    for(const item of dynamic){
      const attr=item.mesh.geometry.attributes.position,rest=item.rest;
      for(let n=0;n<attr.count;n++){
        const k=n*3,bend=smooth(-rest[k+1],.075,.310);
        point.set(rest[k]+state.pitch*.07*bend,rest[k+1],rest[k+2]+state.roll*.07*bend).applyMatrix4(head.matrix);
        if(point.y>.18&&point.y<.495){
          const p=torsoProfile(point.y),width=p.z+.006,depth=(point.x>=0?p.x:p.y)+.009;
          if(Math.abs(point.z)<width){const edge=depth*Math.sqrt(Math.max(0,1-(point.z/width)**2));if(point.x>0&&point.x<edge)point.x=edge;}
        }
        point.applyMatrix4(inverse);attr.setXYZ(n,point.x,point.y,point.z);
      }
      attr.needsUpdate=true;item.mesh.geometry.computeVertexNormals();
    }
  }
  return {root,cap,dynamic,state,pose,color:'reference-dark-chestnut',style:'center-part-twin-braids'};
}
