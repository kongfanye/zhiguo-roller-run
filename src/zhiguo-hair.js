import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

const TAU=Math.PI*2,smooth=THREE.MathUtils.smoothstep;
const HAIR_COLOR=[65,36,27]; // Muted auburn, with warm red-brown highlights.
export function fiberTexture(){
  const size=256,data=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const wave=.75*Math.sin(y*.036),strand=Math.sin(x*1.37+wave)+.4*Math.sin(x*3.07+y*.012);
    const shine=strand*6+3*Math.sin(x*.18+y*.007);
    data.set([HAIR_COLOR[0]+shine,HAIR_COLOR[1]+shine*.74,HAIR_COLOR[2]+shine*.55,255],(y*size+x)*4);
  }
  const t=new THREE.DataTexture(data,size,size);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;
  t.minFilter=THREE.LinearMipmapLinearFilter;t.generateMipmaps=true;t.anisotropy=8;t.needsUpdate=true;return t;
}

// A closed oval lock has visible width and depth from every direction. Its
// asymmetric taper and softly waving center line avoid cylinders or flat cards.
function lockGeometry(points,width,depth,phase=0,rows=44,sides=8,axis=[0,0,1],waveScale=1){
  const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)),false,'centripetal');
  const positions=[],uv=[],indices=[],centers=[],tangent=new THREE.Vector3(),across=new THREE.Vector3(),normal=new THREE.Vector3();
  for(let row=0;row<=rows;row++){
    const t=row/rows,p=curve.getPoint(t);tangent.copy(curve.getTangent(t));
    across.set(...axis);across.addScaledVector(tangent,-across.dot(tangent)).normalize();normal.crossVectors(tangent,across).normalize();
    const free=smooth(t,.20,.70),wave=Math.sin(t*TAU*1.6+phase)*.009*free*waveScale;
    p.addScaledVector(normal,wave);p.z+=Math.sin(t*TAU*1.25+phase)*.010*free*waveScale;centers.push(p.clone());
    const taper=(.025+.975*smooth(t,0,.14))*Math.max(.001,1-smooth(t,.77,1))**.7*(1-.15*t);
    for(let side=0;side<=sides;side++){
      const a=side/sides*TAU,v=p.clone().addScaledVector(across,Math.cos(a)*width*taper).addScaledVector(normal,Math.sin(a)*depth*taper);
      positions.push(v.x,v.y,v.z);uv.push(side/sides,(1-t)*2.7);
      if(row<rows&&side<sides){const k=row*(sides+1)+side;indices.push(k,k+1,k+sides+1,k+1,k+sides+2,k+sides+1);}
    }
  }
  // Cap the roots and tips; there are no open edges when viewed from above.
  for(const [row,flip] of [[0,true],[rows,false]]){
    const center=positions.length/3,p=centers[row];positions.push(p.x,p.y,p.z);uv.push(.5,1-row/rows);
    for(let side=0;side<sides;side++){const k=row*(sides+1)+side;indices.push(center,flip?k+1:k,flip?k:k+1);}
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();return g;
}

export function scalpGeometry(skull){
  const source=skull.geometry,positions=source.attributes.position,normals=source.attributes.normal,p=[],n=[],uv=[];
  const boundary=v=>{
    const front=smooth(v.x,.010,.075),part=.069+.013*Math.exp(-((v.z/.018)**2));
    return v.y-THREE.MathUtils.lerp(-.119,part-.073*smooth(Math.abs(v.z),.037,.083),front);
  };
  for(let i=0;i<source.index.count;i+=3){
    const poly=[0,1,2].map(j=>{const k=source.index.getX(i+j);return {p:new THREE.Vector3().fromBufferAttribute(positions,k),n:new THREE.Vector3().fromBufferAttribute(normals,k)};});
    if(poly.some(v=>Math.abs(v.p.z)>.087))continue;
    const clip=[];
    for(let j=0;j<3;j++){
      const a=poly[j],b=poly[(j+1)%3],da=boundary(a.p),db=boundary(b.p);
      if(da>=0)clip.push(a);
      if((da>=0)!==(db>=0)){const t=da/(da-db);clip.push({p:a.p.clone().lerp(b.p,t),n:a.n.clone().lerp(b.n,t).normalize()});}
    }
    for(let j=1;j<clip.length-1;j++)for(const v of [clip[0],clip[j],clip[j+1]]){
      const angle=Math.atan2(v.p.z,v.p.x+.018),volume=.005+.003*smooth(v.p.y,.01,.12);
      const q=v.p.clone().addScaledVector(v.n,volume);p.push(q.x,q.y,q.z);n.push(...v.n.toArray());
      uv.push(angle/TAU*3+.5,(q.y+.13)/.28*2);
    }
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(n,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));return g;
}

// Joined outer/inner surfaces form a full rear hair mass, instead of showing
// separate locks with holes between them when the camera moves behind the head.
function rearSurface(skull,y,a,layer=0){
  const s=Math.sin(a),c=Math.cos(a),p=skull.geometry.attributes.position;
  // Sample the accepted head's existing surface. Following that same crown
  // makes the scalp and falling hair a continuous silhouette at the roots.
  const sampleY=Math.max(.012,Math.min(.139,y-.008)),row=(sampleY+.153)/.293*64;
  const lo=Math.floor(row),hi=Math.min(64,lo+1),side=a/TAU*96,sl=Math.floor(side),sh=sl+1;
  const sample=k=>THREE.MathUtils.lerp(
    THREE.MathUtils.lerp(p.array[(lo*97+sl)*3+k],p.array[(lo*97+sh)*3+k],side-sl),
    THREE.MathUtils.lerp(p.array[(hi*97+sl)*3+k],p.array[(hi*97+sh)*3+k],side-sl),row-lo);
  const t=smooth(-y,-.020,.210),lower=smooth(-y,.25,.43);
  const depth=.108+.025*t-.009*lower,spread=.087+.039*t-.010*lower;
  const wave=(Math.sin(-y*22+a*3)*.006+Math.cos(a*17+y*11)*.0015)*t;
  const thickness=(.010-.008*lower)*layer;
  let x=THREE.MathUtils.lerp(sample(0)+c*(.010-thickness),-.018+c*(depth+wave-thickness),t);
  const z=THREE.MathUtils.lerp(sample(2)+s*(.008-thickness),s*(spread+wave-thickness),t);
  const drape=smooth(-y,.085,.19),shoulder=-.087*Math.sqrt(Math.max(.08,1-(z/.166)**2))-.026;
  x=THREE.MathUtils.lerp(x,Math.min(x,shoulder),drape);
  return [x,y,z];
}
function rearGeometry(skull){
  const rows=72,sides=72,pos=[],uv=[],idx=[],count=(rows+1)*(sides+1);
  for(let layer=0;layer<2;layer++)for(let row=0;row<=rows;row++)for(let side=0;side<=sides;side++){
    const t=row/rows,a=Math.PI/2+side/sides*Math.PI;
    const length=.570+.010*Math.cos(a*5)+.006*Math.sin(a*11),y=.147-t*length;
    pos.push(...rearSurface(skull,y,a,layer));uv.push(side/sides*3,(1-t)*3);
    if(row<rows&&side<sides){const k=layer*count+row*(sides+1)+side,b=k+sides+1;
      if(layer)idx.push(k,b,k+1,k+1,b,b+1);else idx.push(k,k+1,b,k+1,b+1,b);}
  }
  for(const row of [0,rows])for(let side=0;side<sides;side++){
    const k=row*(sides+1)+side;idx.push(k,k+1,k+count,k+1,k+count+1,k+count);
  }
  for(const side of [0,sides])for(let row=0;row<rows;row++){
    const k=row*(sides+1)+side,b=k+sides+1;idx.push(k,k+count,b,k+count,b+count,b);
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();return g;
}

export function createLooseHair({head,skull,mesh}){
  const root=new THREE.Group();root.name='auburn-loose-wavy-long-hair';head.add(root);
  const texture=fiberTexture(),material=new THREE.MeshStandardMaterial({map:texture,roughness:.78});
  const highlight=material.clone();highlight.color.set('#bda594');
  const cap=mesh(scalpGeometry(skull),material,root);cap.name='center-part-scalp';
  const dynamic=[];
  function add(g,mat,name){const m=mesh(g,mat,root);m.name=name;m.frustumCulled=false;g.attributes.position.setUsage(THREE.DynamicDrawUsage);dynamic.push({mesh:m,rest:g.attributes.position.array.slice()});return m;}
  add(rearGeometry(skull),material,'closed-long-rear-hair');
  const frontLocks=[],fineLocks=[];
  for(const side of [1,-1])for(let i=0;i<7;i++){
    const q=i/6,tip=(side===1?-.382:-.423)-.026*Math.sin(i*1.8+side),z=.107+.031*q;
    const points=[[.046-.020*q,.125-.013*q,side*(.012+.025*q)],
      [.071-.020*q,.080-.025*q,side*(.048+.029*q)],
      [.058-.014*q,.009-.023*q,side*(.091+.013*q)],
      [.054+.018*q,-.102,side*(.105+.015*q)],
      [.134+.011*q,-.211,side*z],
      [.148-.013*q,-.313,side*(z-.020)],
      [.138+.006*Math.cos(i),tip,side*(z+.004*Math.sin(i))]];
    frontLocks.push(lockGeometry(points,.014+.004*Math.sin(i*1.4)**2,.0038,i*.77+side));
  }
  for(const side of [1,-1])for(let i=0;i<4;i++){
    const q=i/3,points=[[-.023+.020*q,.111,side*.063],[-.028+.028*q,.039,side*.108],
      [-.025+.024*q,-.067,side*.112],[.054+.008*q,-.166,side*.117],
      [.143,-.277,side*(.126+.009*q)],[.132,-.359-.023*q,side*(.122+.010*q)]];
    frontLocks.push(lockGeometry(points,.015,.0045,i*.65+side,44,8,[1,0,0]));
  }
  // Sparse wisps add an irregular edge without obscuring the eyes or smile.
  for(const side of [1,-1])for(let i=0;i<3;i++){
    const points=[[.060,.120-i*.002,side*(.013+i*.003)],[.096,.073,side*(.058+i*.003)],
      [.079,-.003,side*(.091+i*.003)],[.094,-.118,side*(.108+i*.003)],
      [.155,-.254,side*(.106+i*.004)],[.139,-.387-i*.005,side*(.116+i*.004)]];
    fineLocks.push(lockGeometry(points,.0008,.0005,i*.88,36,5));
  }
  add(mergeGeometries(frontLocks),material,'loose-front-wavy-locks');
  add(mergeGeometries(fineLocks),highlight,'fine-loose-hair-strands');
  const state={roll:0,rollVelocity:0,pitch:0,pitchVelocity:0};
  const inverse=new THREE.Matrix4(),point=new THREE.Vector3();
  function spring(key,target,dt){const v=key+'Velocity',w=9,e=Math.exp(-w*dt),d=state[key]-target,c=state[v]+w*d;state[key]=target+(d+c*dt)*e;state[v]=(state[v]-w*c*dt)*e;}
  function pose({weight,lateral,airTuck},dt,torsoProfile){
    if(dt>0){spring('roll',weight*.038+lateral*.12,dt);spring('pitch',airTuck*.035+Math.abs(weight)*.009,dt);}
    head.updateMatrix();inverse.copy(head.matrix).invert();
    for(const item of dynamic){
      const attr=item.mesh.geometry.attributes.position,rest=item.rest;
      for(let n=0;n<attr.count;n++){
        const k=n*3,x=rest[k],y=rest[k+1],z=rest[k+2],bend=smooth(-y,.085,.425);
        point.set(x+state.pitch*.10*bend,y,z+state.roll*.10*bend).applyMatrix4(head.matrix);
        // Collide with the unchanged shirt in spine coordinates. The free ends
        // move around the chest/back, rather than passing through the shoulders.
        if(point.y>.11&&point.y<.495){
          const p=torsoProfile(point.y),width=p.z+.007,depth=(point.x>=0?p.x:p.y)+.014;
          if(Math.abs(point.z)<width){const edge=depth*Math.sqrt(Math.max(0,1-(point.z/width)**2));
            if(Math.abs(point.x)<edge)point.x=(point.x<0?-1:1)*edge;}
        }
        point.applyMatrix4(inverse);attr.setXYZ(n,point.x,point.y,point.z);
      }
      attr.needsUpdate=true;item.mesh.geometry.computeVertexNormals();
    }
  }
  return {root,cap,dynamic,state,pose,color:'muted-auburn',style:'center-part-loose-wavy-chest-length'};
}
