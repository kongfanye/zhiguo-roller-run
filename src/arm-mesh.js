import * as THREE from 'three';

// Refines the anatomical arm and hand before skinning:
//  * one level of Loop subdivision, applied alike to both bone-frame bind
//    positions and the skinning weights, so the arm surface is smooth rather than
//    faceted;
//  * a few passes of weight smoothing above the hand, so the elbow and wrist bend
//    over a wider, softer band;
//  * fingers relaxed out of the exported grip, by rigid rotations at each joint,
//    blended across the knuckles, so every phalanx keeps its length.

function loopSubdivide(data){
  const index=data.indices,n=data.weight.length;
  const attrs=[['upper',3],['lower',3],['weight',1],['handWeight',1]];
  const edges=new Map(),neighbours=Array.from({length:n},()=>new Set());
  const key=(a,b)=>a<b?a*n+b:b*n+a;
  for(let f=0;f<index.length;f+=3)for(let j=0;j<3;j++){
    const a=index[f+j],b=index[f+(j+1)%3],c=index[f+(j+2)%3],k=key(a,b);
    let e=edges.get(k);if(!e){e={a,b,opposite:[]};edges.set(k,e);}e.opposite.push(c);
    neighbours[a].add(b);neighbours[b].add(a);
  }
  const boundary=Array.from({length:n},()=>[]);
  for(const e of edges.values())if(e.opposite.length===1){boundary[e.a].push(e.b);boundary[e.b].push(e.a);}
  const out={};let count=n;
  for(const e of edges.values())e.index=count++;
  for(const [name,size] of attrs){
    const src=data[name],dst=new Float32Array(count*size);
    for(let v=0;v<n;v++){
      const nb=[...neighbours[v]];
      for(let c=0;c<size;c++){
        let value;
        if(boundary[v].length>=2)value=.75*src[v*size+c]+.125*(src[boundary[v][0]*size+c]+src[boundary[v][1]*size+c]);
        else{const k=nb.length,beta=k>3?3/(8*k):3/16;value=(1-k*beta)*src[v*size+c];for(const u of nb)value+=beta*src[u*size+c];}
        dst[v*size+c]=value;
      }
    }
    for(const e of edges.values())for(let c=0;c<size;c++){
      const a=src[e.a*size+c],b=src[e.b*size+c];
      dst[e.index*size+c]=e.opposite.length===2?.375*(a+b)+.125*(src[e.opposite[0]*size+c]+src[e.opposite[1]*size+c]):.5*(a+b);
    }
    out[name]=dst;
  }
  const faces=[];
  for(let f=0;f<index.length;f+=3){
    const [a,b,c]=[index[f],index[f+1],index[f+2]],ab=edges.get(key(a,b)).index,bc=edges.get(key(b,c)).index,ca=edges.get(key(c,a)).index;
    faces.push(a,ab,ca,b,bc,ab,c,ca,bc,ab,bc,ca);
  }
  return {...data,...out,indices:faces};
}

function smoothWeights(data,passes=4){
  const n=data.weight.length,nb=Array.from({length:n},()=>new Set()),idx=data.indices;
  for(let f=0;f<idx.length;f+=3)for(let j=0;j<3;j++){nb[idx[f+j]].add(idx[f+(j+1)%3]);nb[idx[f+(j+1)%3]].add(idx[f+j]);}
  for(const name of ['weight','handWeight']){
    const w=data[name];
    for(let p=0;p<passes;p++){
      const next=Float32Array.from(w);
      for(let v=0;v<n;v++){
        if(data.handWeight[v]>.995&&name==='weight')continue;
        let s=0;for(const u of nb[v])s+=w[u];next[v]=.5*w[v]+.5*s/nb[v].size;
      }
      w.set(next);
    }
  }
}

// Unbend each finger joint by a fraction: knuckle, middle and end joints.
function relaxFingers(data,armLength){
  const lower=data.lower,wrist=new THREE.Vector3(0,armLength,0),chains=data.fingers.map(c=>c.map(p=>new THREE.Vector3(...p)));
  const relax=[[.55,.55,.35],[.62,.55,.45],[.62,.55,.45],[.62,.55,.45],[.60,.55,.45]];
  // Assign hand vertices to their nearest finger segment.
  const assign=new Int16Array(data.weight.length).fill(-1),along=new Float32Array(data.weight.length),v=new THREE.Vector3(),d=new THREE.Vector3();
  for(let i=0;i<data.weight.length;i++){
    if(data.handWeight[i]<.98)continue;v.fromArray(lower,i*3);let best=.0125;
    chains.forEach((c,f)=>{for(let k=0;k<3;k++){
      d.subVectors(c[k+1],c[k]);const len=d.length();d.divideScalar(len);
      const s=v.clone().sub(c[k]).dot(d);if(k===0&&s<-.006)continue;
      const dist=v.distanceTo(c[k].clone().addScaledVector(d,THREE.MathUtils.clamp(s,0,len)));
      if(dist<best){best=dist;assign[i]=f*3+k;along[i]=s;}
    }});
  }
  const transforms=chains.map((c,f)=>{
    const out=[new THREE.Matrix4()],m=new THREE.Matrix4(),pts=c.map(p=>p.clone());
    let prev=c[0].clone().sub(wrist).normalize();
    for(let j=0;j<3;j++){
      const dir=pts[j+1].clone().sub(pts[j]).normalize(),axis=new THREE.Vector3().crossVectors(prev,dir),s=axis.length();
      const angle=Math.atan2(s,prev.dot(dir));
      const r=new THREE.Matrix4();
      if(s>1e-6){axis.divideScalar(s);r.makeTranslation(pts[j].x,pts[j].y,pts[j].z).multiply(new THREE.Matrix4().makeRotationAxis(axis,-angle*relax[f][j])).multiply(new THREE.Matrix4().makeTranslation(-pts[j].x,-pts[j].y,-pts[j].z));}
      m.premultiply(r);out.push(m.clone());
      for(let k=j+1;k<4;k++)pts[k].applyMatrix4(r);
      prev=pts[j+1].clone().sub(pts[j]).normalize();
    }
    data.fingers[f]=pts.map(p=>p.toArray());
    return out;
  });
  const a=new THREE.Vector3(),b=new THREE.Vector3();
  for(let i=0;i<assign.length;i++){
    if(assign[i]<0)continue;const f=Math.floor(assign[i]/3),k=assign[i]%3;
    v.fromArray(lower,i*3);a.copy(v).applyMatrix4(transforms[f][k]);b.copy(v).applyMatrix4(transforms[f][k+1]);
    a.lerp(b,THREE.MathUtils.smoothstep(along[i],-.005,.004));lower[i*3]=a.x;lower[i*3+1]=a.y;lower[i*3+2]=a.z;
  }
}

// The shoulder cap is always under the shirt and sleeve; slimming it a little
// keeps it from showing between them as the arm swings.
function tuckShoulder(data){
  const u=data.upper;
  for(let i=0;i<data.weight.length;i++){
    if(data.weight[i]>.6)continue;
    const y=u[i*3+1],k=1-.14*(1-THREE.MathUtils.smoothstep(y,.06,.13))*(1-data.weight[i]/.6);
    u[i*3]*=k;u[i*3+2]*=k;
  }
}

export function refineArm(data,armLength){
  const refined=loopSubdivide({...data,upper:Float32Array.from(data.upper),lower:Float32Array.from(data.lower),weight:Float32Array.from(data.weight),handWeight:Float32Array.from(data.handWeight)});
  smoothWeights(refined);
  tuckShoulder(refined);
  refined.fingers=data.fingers.map(c=>c.map(p=>p.slice()));
  relaxFingers(refined,armLength);
  return refined;
}
