import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {scalpGeometry,fiberTexture} from './zhiguo-hair.js';
import {PHOTO_HAIRLINE,HAIR_EDGE_DROP} from './zhiguo-identity.js';

const TAU=Math.PI*2,DEG=Math.PI/180,smooth=THREE.MathUtils.smoothstep,lerp=THREE.MathUtils.lerp;
// Rays from this point inside the skull place every lock on the head surface.
const CENTER=new THREE.Vector3(-.005,.010,0);
// The plaits begin behind and below each ear, where the reference gathers the hair.
const ROOT=new THREE.Vector3(-.036,-.060,.066);

function headRadius(section,dir){
  const p=new THREE.Vector3();
  const inside=r=>{
    p.copy(CENTER).addScaledVector(dir,r);
    if(p.y<-.153||p.y>.140)return false;
    const [forward,back,width]=section(p.y),x=p.x+.018;
    const nx=x>0?x/(forward+.018):x/(back+.018),nz=p.z/Math.max(width,1e-4);
    return nx*nx+nz*nz<1;
  };
  let lo=0,hi=.25;
  for(let n=0;n<28;n++){const mid=(lo+hi)/2;if(inside(mid))lo=mid;else hi=mid;}
  return lo;
}
const direction=(az,el)=>new THREE.Vector3(Math.cos(el)*Math.cos(az),Math.sin(el),Math.cos(el)*Math.sin(az));
// Extra volume where the hair passes over the ear, so the ear never pokes through.
function earLift(dir){
  const az=Math.atan2(Math.abs(dir.z),dir.x),el=Math.asin(THREE.MathUtils.clamp(dir.y,-1,1));
  return Math.exp(-(((az-86*DEG)/(26*DEG))**2+((el+6*DEG)/(24*DEG))**2));
}

// A closed, flattened lock swept along a curve. Width lies across the scalp and
// depth points away from the head, so neighbouring locks overlap like real hair.
function lockGeometry(points,width,depth,{rows=36,sides=8,taper=t=>1,outward=null}={}){
  const curve=new THREE.CatmullRomCurve3(points,false,'centripetal');
  const pos=[],uv=[],idx=[],ends=[],T=new THREE.Vector3(),A=new THREE.Vector3(),N=new THREE.Vector3(),out=new THREE.Vector3();
  for(let row=0;row<=rows;row++){
    const t=row/rows,p=curve.getPoint(t);T.copy(curve.getTangent(t));
    if(outward)outward(p,out);else out.subVectors(p,CENTER);
    A.crossVectors(T,out).normalize();N.crossVectors(A,T).normalize();
    const s=taper(t);ends.push(p);
    for(let side=0;side<=sides;side++){
      const a=side/sides*TAU,v=p.clone().addScaledVector(A,Math.cos(a)*width*s).addScaledVector(N,Math.sin(a)*depth*s);
      pos.push(v.x,v.y,v.z);uv.push(side/sides,t*2.6);
      if(row<rows&&side<sides){const k=row*(sides+1)+side;idx.push(k,k+sides+1,k+1,k+1,k+sides+1,k+sides+2);}
    }
  }
  for(const [row,flip] of [[0,true],[rows,false]]){
    const c=pos.length/3,p=ends[row];pos.push(p.x,p.y,p.z);uv.push(.5,row/rows*2.6);
    for(let side=0;side<sides;side++){const k=row*(sides+1)+side;idx.push(c,flip?k+1:k,flip?k:k+1);}
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();return g;
}

// Hair parted at the center sweeps over the temples and ears, and down the
// back of the head, converging on the plait root behind each ear.
function partedLocks(section,side){
  const root=ROOT.clone();root.z*=side;
  const end=root.clone().sub(CENTER),endLength=end.length();end.normalize();
  const endOffset=endLength-headRadius(section,end),locks=[];
  for(let i=0;i<30;i++){
    const s=i/29,part=lerp(52,240,s)*DEG;
    const start=new THREE.Vector3(Math.cos(part),Math.sin(part),side*.008).normalize();
    // Front locks sweep back over the temples and behind the cheeks, so the
    // hair frames the whole face instead of hooding over it.
    const control=direction(side*lerp(96,150,s)*DEG,(lerp(30,-14,s)+18*Math.sin(Math.PI*s))*DEG);
    const points=[];
    for(let n=0;n<=14;n++){
      const v=n/14,a=(1-v)**2,b=2*v*(1-v),c=v*v;
      const dir=start.clone().multiplyScalar(a).addScaledVector(control,b).addScaledVector(end,c).normalize();
      // Locks at the forehead start flush with the skin for a soft hairline;
      // over the crown they start on top of the scalp, right at the part.
      const crown=smooth(s,.04,.14),rise=(.0018+.0040*smooth(v,0,.16))*(1-crown)+.0068*crown;
      const offset=lerp(rise+.0030*Math.sin(Math.PI*v)+.012*earLift(dir)+.0015*Math.sin(i*2.3),endOffset,smooth(v,.78,1));
      points.push(CENTER.clone().addScaledVector(dir,headRadius(section,dir)+offset));
    }
    locks.push(lockGeometry(points,.0105+.0015*Math.sin(i*1.7)**2,.0024,{taper:t=>.30+.70*smooth(t,0,.12)-.45*smooth(t,.55,1)}));
  }
  return {geometry:mergeGeometries(locks),root};
}

// Three strands follow offset figure-eight paths around the plait axis, so the
// strands visibly pass over and under each other like a real three-strand braid.
function plaitGeometry(curve,side){
  const strands=[],anchors=[],rows=150,sides=9,frames=curve.computeFrenetFrames(rows,false),reference=new THREE.Vector3(1,.1,side*.7).normalize();
  const L=new THREE.Vector3(),D=new THREE.Vector3();
  for(let k=0;k<3;k++){
    const points=[];
    for(let n=0;n<=rows;n++){
      const t=n/rows,p=curve.getPoint(t),T=frames.tangents[n];
      L.crossVectors(T,reference).normalize();D.crossVectors(L,T).normalize();
      const angle=t*TAU*7.2+k*TAU/3,scale=1-.38*t;
      points.push(p.addScaledVector(L,Math.sin(angle)*.0112*scale).addScaledVector(D,Math.sin(angle*2)*.0042*scale));
    }
    strands.push(lockGeometry(points,.0088,.0068,{rows,sides,taper:t=>(.45+.55*smooth(t,0,.04))*(1-.36*t),
      outward:(p,out)=>out.copy(reference)}));
    // Each ring of a strand is anchored to the plait axis at the same height.
    for(let n=0;n<=rows;n++){const a=curve.getPoint(n/rows);for(let j=0;j<=sides;j++)anchors.push(a.x,a.y,a.z);}
    for(const t of [0,1]){const a=curve.getPoint(t);anchors.push(a.x,a.y,a.z);}
  }
  return {geometry:mergeGeometries(strands),anchors:new Float32Array(anchors)};
}
const fixedAnchors=(geometry,point)=>{const a=new Float32Array(geometry.attributes.position.count*3);for(let n=0;n<a.length;n+=3)a.set([point.x,point.y,point.z],n);return a;};

export function createBraidedHair({head,skull,mesh,section}){
  const root=new THREE.Group();root.name='center-part-twin-braids';head.add(root);
  const material=new THREE.MeshStandardMaterial({map:fiberTexture(),roughness:.74});
  // The photo's forehead arch, then a sideburn edge in front of the (hidden)
  // ear, then the nape: the cap never reaches across the cheeks.
  const capBoundary=v=>{
    const az=Math.atan2(Math.abs(v.z),v.x+.005)/DEG;
    const edge=lerp(lerp(PHOTO_HAIRLINE(v.z)-HAIR_EDGE_DROP,-.030,smooth(az,50,82)),-.084,smooth(az,95,125));
    return v.y-edge;
  };
  const cap=mesh(scalpGeometry(skull,capBoundary),material,root);cap.name='rounded-center-part-scalp';
  const dynamic=[],tieMaterial=new THREE.MeshStandardMaterial({color:'#2b2626',roughness:.7});
  for(const side of [1,-1]){
    const {geometry,root:plaitRoot}=partedLocks(section,side);
    const locks=mesh(geometry,material,root);locks.name=(side>0?'right':'left')+'-swept-parted-hair-over-ear';
    // From behind the ear, over the front of the shoulder, down to the chest.
    const curve=new THREE.CatmullRomCurve3([plaitRoot.clone().add(new THREE.Vector3(.006,.006,-side*.004)),
      new THREE.Vector3(-.026,-.100,side*.079),new THREE.Vector3(.016,-.150,side*.090),
      new THREE.Vector3(.098,-.208,side*.087),new THREE.Vector3(.130,-.278,side*.080),new THREE.Vector3(.131,-.335,side*.076)],false,'centripetal');
    const {geometry:g,anchors}=plaitGeometry(curve,side),braid=mesh(g,material,root);braid.name=side>0?'right-plait':'left-plait';braid.frustumCulled=false;
    g.attributes.position.setUsage(THREE.DynamicDrawUsage);dynamic.push({mesh:braid,rest:g.attributes.position.array.slice(),anchors});
    const end=curve.getPoint(.985),tangent=curve.getTangent(.985);
    const tieGeometry=new THREE.TorusGeometry(.0085,.0024,8,18);tieGeometry.rotateX(Math.PI/2);
    tieGeometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),tangent));tieGeometry.translate(end.x,end.y,end.z);
    const tie=mesh(tieGeometry,tieMaterial,root);tie.name='braid-tie';
    tieGeometry.attributes.position.setUsage(THREE.DynamicDrawUsage);dynamic.push({mesh:tie,rest:tieGeometry.attributes.position.array.slice(),anchors:fixedAnchors(tieGeometry,end)});
    // Short, tapered loose ends beneath the tie.
    const tufts=[];
    for(let n=0;n<7;n++){
      const a=n/7*TAU,spread=new THREE.Vector3(Math.cos(a)*.0045,0,Math.sin(a)*.0045);
      const points=[end.clone().addScaledVector(tangent,-.004),end.clone().addScaledVector(tangent,.014).add(spread),
        end.clone().addScaledVector(tangent,.030+.004*Math.sin(n*2.1)).addScaledVector(spread,1.7)];
      tufts.push(lockGeometry(points,.0034,.0026,{rows:10,sides:6,taper:t=>1-.9*smooth(t,.2,1),outward:(p,out)=>out.set(1,0,0)}));
    }
    const tuft=mesh(mergeGeometries(tufts),material,root);tuft.name='braid-loose-end';tuft.frustumCulled=false;
    tuft.geometry.attributes.position.setUsage(THREE.DynamicDrawUsage);dynamic.push({mesh:tuft,rest:tuft.geometry.attributes.position.array.slice(),anchors:fixedAnchors(tuft.geometry,end)});
  }
  const state={roll:0,rollVelocity:0,pitch:0,pitchVelocity:0};
  function spring(key,target,dt){const v=key+'Velocity',w=10,e=Math.exp(-w*dt),d=state[key]-target,c=state[v]+w*d;state[key]=target+(d+c*dt)*e;state[v]=(state[v]-w*c*dt)*e;}
  const inverse=new THREE.Matrix4(),point=new THREE.Vector3(),axis=new THREE.Vector3();
  function pose({weight,lateral,airTuck},dt,torsoProfile){
    if(dt>0){spring('roll',weight*.030+lateral*.10,dt);spring('pitch',airTuck*.025,dt);}
    head.updateMatrix();inverse.copy(head.matrix).invert();
    const sway=(target,x,y,z)=>{const bend=smooth(-y,.085,.330);return target.set(x+state.pitch*.07*bend,y,z+state.roll*.07*bend).applyMatrix4(head.matrix);};
    for(const item of dynamic){
      const attr=item.mesh.geometry.attributes.position,rest=item.rest,anchors=item.anchors;
      let ax=NaN,ay=NaN,az=NaN,dx=0,dz=0;
      for(let n=0;n<attr.count;n++){
        const k=n*3;sway(point,rest[k],rest[k+1],rest[k+2]);
        // Push the plait axis out of the shirt and move each whole ring with
        // it, so the braid slides over the shoulder without being flattened.
        if(anchors[k]!==ax||anchors[k+1]!==ay||anchors[k+2]!==az){
          ax=anchors[k];ay=anchors[k+1];az=anchors[k+2];sway(axis,ax,ay,az);dx=dz=0;
          if(axis.y>.15&&axis.y<.54){
            const p=torsoProfile(axis.y),width=p.z+.024,depth=(axis.x>=0?p.x:p.y)+.030;
            const fade=smooth(axis.y,.15,.19)*(1-smooth(axis.y,.48,.54)),r=Math.hypot(axis.x/depth,axis.z/width);
            if(r<1&&r>1e-4){const push=(1/r-1)*fade;dx=axis.x*push;dz=axis.z*push;}
          }
        }
        point.x+=dx;point.z+=dz;point.applyMatrix4(inverse);attr.setXYZ(n,point.x,point.y,point.z);
      }
      attr.needsUpdate=true;item.mesh.geometry.computeVertexNormals();
    }
  }
  return {root,cap,dynamic,state,pose,color:'reference-warm-brown',style:'center-part-twin-braids-over-shoulders'};
}
