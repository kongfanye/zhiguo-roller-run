import * as THREE from 'three';
import {HEAD_MODEL} from './zhiguo-head-model.js';

// Zhiguo's head, rebuilt from her real photographs (tests/make-head-model.py).
// The surface is a radius field around a vertical axis: her measured face from
// 478 landmarks in two portraits, joined to an adult-female cranium and neck.
// The texture uses the same (azimuth, height) layout, so every photo pixel lands
// on the 3D point it was measured at.
const M=HEAD_MODEL,TAU=Math.PI*2;
export const SKIN_COLOR=M.skinColor;
export const HEAD_LANDMARKS=M.landmarks;
const COLS=M.cols,ROWS=M.rows,STRIDE=COLS+1;
const RADIUS=(()=>{
  const bin=atob(M.radius),out=new Float32Array(bin.length/2);
  for(let i=0;i<out.length;i++)out[i]=(bin.charCodeAt(2*i)|bin.charCodeAt(2*i+1)<<8)*M.radiusScale;
  return out;
})();
// Columns are twice as dense over the face as behind the ears.
const KNOT_U=[0,1/6,5/6,1],KNOT_A=[-Math.PI,-Math.PI/2,Math.PI/2,Math.PI];
function azimuthColumn(az){
  az=((az+Math.PI)%TAU+TAU)%TAU-Math.PI;
  for(let k=0;k<3;k++)if(az<=KNOT_A[k+1])return (KNOT_U[k]+(KNOT_U[k+1]-KNOT_U[k])*(az-KNOT_A[k])/(KNOT_A[k+1]-KNOT_A[k]))*COLS;
  return COLS;
}
function heightRow(y){
  const h=M.heights;if(y<=h[0])return 0;if(y>=h[ROWS])return ROWS;
  let lo=0,hi=ROWS;while(hi-lo>1){const mid=(lo+hi)>>1;if(h[mid]<=y)lo=mid;else hi=mid;}
  return lo+(y-h[lo])/(h[hi]-h[lo]);
}
// Skin radius from the head axis at a given azimuth (0 = facing forward, +PI/2 =
// her right) and height, in head coordinates.
export function headRadius(az,y){
  const c=azimuthColumn(az),r=heightRow(y),c0=Math.min(COLS-1,Math.floor(c)),r0=Math.min(ROWS-1,Math.floor(r)),fc=c-c0,fr=r-r0;
  const k=r0*STRIDE+c0;
  return (RADIUS[k]*(1-fc)+RADIUS[k+1]*fc)*(1-fr)+(RADIUS[k+STRIDE]*(1-fc)+RADIUS[k+STRIDE+1]*fc)*fr;
}
export const HEAD_AXIS_X=M.axisX,HEAD_TOP=M.heights[ROWS];
export function headPoint(az,y,offset=0,target=new THREE.Vector3()){
  const r=headRadius(az,y)+offset;return target.set(M.axisX+r*Math.cos(az),y,r*Math.sin(az));
}
// Outward surface normal by central differences on the radius field.
export function headNormal(az,y,target=new THREE.Vector3()){
  const e=.004,a=headPoint(az,y),du=headPoint(az+e/Math.max(headRadius(az,y),.02),y).sub(headPoint(az-e/Math.max(headRadius(az,y),.02),y));
  const dv=headPoint(az,y+e).sub(headPoint(az,y-e));
  target.crossVectors(dv,du).normalize();
  if(target.x*Math.cos(az)+target.z*Math.sin(az)<0&&a.y<HEAD_TOP-.01)target.negate();
  return target;
}

function headGeometry(){
  const pos=new Float32Array((ROWS+1)*STRIDE*3),uv=new Float32Array((ROWS+1)*STRIDE*2),index=[];
  for(let row=0;row<=ROWS;row++)for(let col=0;col<=COLS;col++){
    const k=row*STRIDE+col,a=M.azimuths[col],r=RADIUS[k];
    pos.set([M.axisX+r*Math.cos(a),M.heights[row],r*Math.sin(a)],k*3);uv.set([col/COLS,row/ROWS],k*2);
    if(row<ROWS&&col<COLS)index.push(k,k+STRIDE,k+1,k+1,k+STRIDE,k+STRIDE+1);
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));g.setAttribute('uv',new THREE.BufferAttribute(uv,2));g.setIndex(index);
  g.computeVertexNormals();
  // Weld the shading across the back seam and at the crown.
  const n=g.attributes.normal,v=new THREE.Vector3(),w=new THREE.Vector3();
  for(let row=0;row<=ROWS;row++){
    const a=row*STRIDE,b=a+COLS;v.fromBufferAttribute(n,a).add(w.fromBufferAttribute(n,b)).normalize();n.setXYZ(a,v.x,v.y,v.z);n.setXYZ(b,v.x,v.y,v.z);
  }
  for(let col=0;col<=COLS;col++)n.setXYZ(ROWS*STRIDE+col,0,1,0);
  return g;
}

export function createIdentityHead({mesh,tube,ellipsoid,createHair}){
  const head=new THREE.Group();head.name='zhiguo-photo-measured-head';head.position.set(.002,.635,0);
  const faceMat=new THREE.MeshStandardMaterial({color:SKIN_COLOR,roughness:.62});faceMat.name='zhiguo-skin-and-face';
  const skull=mesh(headGeometry(),faceMat,head);skull.name='measured-head-face-and-neck';
  const hair=createHair?createHair({head,skull,mesh}):{root:new THREE.Group(),dynamic:[],state:{},pose(){}};

  // Large geometric wire frames in rose gold, traced over her real glasses.
  const rim=new THREE.MeshStandardMaterial({color:'#b88a68',metalness:.85,roughness:.28});
  const pearl=new THREE.MeshStandardMaterial({color:'#f1ebe0',roughness:.3,metalness:.1});
  const gold=new THREE.MeshStandardMaterial({color:'#c39a5d',metalness:.8,roughness:.3});
  const glasses=new THREE.Group();glasses.name='hexagonal-wire-glasses';head.add(glasses);
  const lensCurve=side=>new THREE.CatmullRomCurve3(M.lens.map(([x,y,z])=>new THREE.Vector3(x,y,z*side)),true,'centripetal');
  for(const side of [1,-1]){
    const curve=lensCurve(side);
    const r=new THREE.Mesh(new THREE.TubeGeometry(curve,160,.00075,6,true),rim);r.name='wire-rim';glasses.add(r);
    // A faint clear lens catches highlights like real glass.
    const pts=curve.getPoints(48),centre=pts.reduce((s,p)=>s.add(p),new THREE.Vector3()).divideScalar(pts.length);
    const lp=[centre.x,centre.y,centre.z],li=[];
    pts.forEach(p=>lp.push(p.x,p.y,p.z));for(let i=0;i<pts.length;i++)li.push(0,1+i,1+(i+1)%pts.length);
    const lg=new THREE.BufferGeometry();lg.setAttribute('position',new THREE.Float32BufferAttribute(lp,3));lg.setIndex(side>0?li:li.map((v,i)=>i%3===1?li[i+1]:i%3===2?li[i-1]:v));lg.computeVertexNormals();
    const lens=new THREE.Mesh(lg,new THREE.MeshPhysicalMaterial({color:'#ffffff',transparent:true,opacity:.07,roughness:.05,metalness:0,clearcoat:1,depthWrite:false,side:THREE.DoubleSide}));
    lens.name='glass-lens';lens.renderOrder=2;glasses.add(lens);
    // Nose pad on a short arm, resting on the side of the nose.
    const [px,py,pz]=M.pad,inner=M.bridge[0];
    tube([[inner[0]-.001,inner[1]-.004,inner[2]*side],[px+.002,py+.002,pz*side*.9],[px-.002,py,pz*side*.75]],.0004,rim,glasses);
    ellipsoid(glasses,pearl,[px-.003,py-.002,pz*side*.72],[.0018,.0042,.0012]).material=new THREE.MeshPhysicalMaterial({color:'#f4efe6',transparent:true,opacity:.6,roughness:.15});
    // Temple arm from the hinge back along the side of the head, into the hair.
    const [hx,hy,hz]=M.hinge,arm=[];
    for(let n=0;n<=6;n++){
      const t=n/6,az=side*THREE.MathUtils.lerp(Math.atan2(Math.abs(hz),hx-M.axisX),1.62,t),y=hy-.003*t;
      const p=headPoint(az,y,THREE.MathUtils.lerp(Math.hypot(hx-M.axisX,hz)-headRadius(az,y),.004,Math.min(1,t*1.6)));arm.push(p.toArray());
    }
    arm[0]=[hx-.001,hy,hz*side];
    tube(arm,.0009,rim,glasses);
    // Small pearl drops on gold hooks below the ear lobes.
    const lobe=headPoint(side*1.60,-.030,.004);
    tube([[lobe.x,lobe.y+.004,lobe.z],[lobe.x+.002,lobe.y-.004,lobe.z+side*.002],[lobe.x+.002,lobe.y-.012,lobe.z+side*.002]],.0005,gold,head);
    ellipsoid(head,pearl,[lobe.x+.002,lobe.y-.017,lobe.z+side*.002],[.0035,.0048,.0035]);
  }
  tube(M.bridge.map(([x,y,z],i)=>[x,y+(i===1?.0015:0),z]),.0008,rim,glasses);
  // Sub-millimetre wires would cast aliased, scar-like shadow lines on the skin.
  glasses.traverse(node=>{node.castShadow=false;});
  const mouth=new THREE.Object3D();mouth.position.fromArray(M.landmarks.mouth);head.add(mouth);
  return {head,skull,mouth,hair,faceMat,glasses,setPhoto(texture){faceMat.map=texture;faceMat.color.set('#ffffff');faceMat.needsUpdate=true;}};
}
