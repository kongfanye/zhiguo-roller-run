import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {headRadius,HEAD_AXIS_X,HEAD_TOP} from './zhiguo-identity.js';

// Zhiguo's hair as in her braided photos: a centre part, smooth on top with soft
// volume over the ears, long curtain strands framing her face, and two loose
// three-strand braids that start low behind the ears and hang over the front of
// her shoulders, tied with small pink-and-white elastics.
const TAU=Math.PI*2,DEG=Math.PI/180,smooth=THREE.MathUtils.smoothstep,lerp=THREE.MathUtils.lerp,clamp=THREE.MathUtils.clamp;
// Dark brown with the auburn tint her hair shows indoors and in sunlight.
const HAIR=[44,28,22],SHINE=[96,60,45];
const CENTER=new THREE.Vector3(0,.015,0);

// Distance from CENTER to the skin along a direction, by bisection on the head's
// measured radius field.
function skinDistance(dir){
  const p=new THREE.Vector3();let lo=0,hi=.25;
  for(let n=0;n<30;n++){
    const mid=(lo+hi)/2;p.copy(CENTER).addScaledVector(dir,mid);
    const inside=p.y<HEAD_TOP&&p.y>-.153&&Math.hypot(p.x-HEAD_AXIS_X,p.z)<headRadius(Math.atan2(p.z,p.x-HEAD_AXIS_X),p.y);
    if(inside)lo=mid;else hi=mid;
  }
  return lo;
}
// Direction from CENTER towards the skin point at (azimuth, height).
function toward(az,y){
  const r=headRadius(az,y);
  return new THREE.Vector3(HEAD_AXIS_X+r*Math.cos(az),y,r*Math.sin(az)).sub(CENTER).normalize();
}
const onScalp=(dir,offset)=>CENTER.clone().addScaledVector(dir,skinDistance(dir)+offset);
const sagittal=el=>new THREE.Vector3(Math.cos(el),Math.sin(el),0);

// Fine strands across u, gentle variation along v. The same data gives a bump
// map, so each strand catches light like real hair.
function strandTextures(){
  const w=256,h=64,color=new Uint8Array(w*h*4),bump=new Uint8Array(w*h*4);
  let seed=11;const rnd=()=>((seed=(seed*16807)%2147483647)/2147483647);
  const strand=Array.from({length:w},()=>rnd()),clump=Array.from({length:w},(_,x)=>.5+.5*Math.sin(x/w*TAU*5+rnd()*.6));
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const s=strand[x]*.7+.3*strand[(x+1)%w],along=.08*Math.sin(y/h*TAU*2+x*.37);
    const t=clamp(.25+.55*s+.2*clump[x]+along,0,1);
    for(let c=0;c<3;c++)color[(y*w+x)*4+c]=HAIR[c]+(SHINE[c]-HAIR[c])*t*.8;
    color[(y*w+x)*4+3]=255;const b=Math.round(255*(.35+.65*s));bump.set([b,b,b,255],(y*w+x)*4);
  }
  const make=data=>{const t=new THREE.DataTexture(data,w,h);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.minFilter=THREE.LinearMipmapLinearFilter;t.magFilter=THREE.LinearFilter;t.generateMipmaps=true;t.anisotropy=8;t.needsUpdate=true;return t;};
  const map=make(color);map.colorSpace=THREE.SRGBColorSpace;return {map,bump:make(bump)};
}

// The outline of the hair on one side, as (theta, azimuth deg, height, lift):
// forehead hairline at the part, temple, over the ear, braid root behind the
// ear lobe, then the nape hairline back to the middle.
const OUTLINE=[[0,0,.088,.0005],[.06,15,.086,.0005],[.12,30,.080,.0006],[.18,45,.069,.0008],[.24,58,.054,.0012],
  [.30,68,.036,.003],[.36,80,.012,.009],[.42,95,-.018,.017],[.50,118,-.046,.017],[.60,136,-.058,.007],
  [.75,155,-.064,.0025],[.90,170,-.066,.0015],[1,180,-.066,.0015]];
function outline(theta){
  let k=0;while(k<OUTLINE.length-2&&theta>OUTLINE[k+1][0])k++;
  const a=OUTLINE[k],b=OUTLINE[k+1],t=smooth(theta,a[0],b[0]);
  return [lerp(a[1],b[1],t)*DEG,lerp(a[2],b[2],t),lerp(a[3],b[3],t)];
}
// The centre line runs from the forehead hairline over the crown to the nape.
const PART_FRONT=Math.atan2(toward(0,.088).y,toward(0,.088).x),PART_BACK=Math.PI+Math.atan2(-toward(Math.PI,-.066).y,-toward(Math.PI,-.066).x);
export const BRAID_ROOT_THETA=.5;

// One side of the hair cap: strands run from the part (t=0) to the outline (t=1).
function capGeometry(side,{rows=150,cols=44}={}){
  const pos=[],uv=[],idx=[],dir=new THREE.Vector3();
  for(let i=0;i<=rows;i++){
    const theta=i/rows,[az,y,edgeLift]=outline(theta);
    const from=sagittal(lerp(PART_FRONT,PART_BACK,theta)),to=toward(side*az,y);
    // More volume over the sides and back than at the part or the hairline.
    const volume=.0035+.0085*smooth(theta,.10,.35)*(1-.6*smooth(theta,.65,1));
    for(let j=0;j<=cols;j++){
      const t=j/cols;dir.copy(from).lerp(to,t).normalize();
      // Gentle grouping of strands into soft locks, fading out at the hairline.
      const locks=.0011*Math.sin(theta*TAU*17+Math.sin(theta*31)*1.4)*smooth(t,.15,.6)*(1-smooth(t,.9,1));
      const ear=.010*Math.exp(-(((Math.atan2(Math.abs(dir.z),dir.x)/DEG-92)/18)**2+((dir.y+.10)/.28)**2));
      const lift=lerp(.0028,edgeLift,smooth(t,.55,1))+volume*Math.sin(Math.PI*Math.min(1,t*1.15))**.7+ear*smooth(t,.3,.8)+locks;
      const p=onScalp(dir,lift);pos.push(p.x,p.y,p.z);uv.push(theta*14,t*2.2);
      if(i<rows&&j<cols){const k=i*(cols+1)+j,n=k+cols+1;if(side>0)idx.push(k,k+1,n,k+1,n+1,n);else idx.push(k,n,k+1,k+1,n,n+1);}
    }
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();return g;
}

// A flattened lock swept along a curve, tapered to a fine tip. Width lies across
// the scalp, depth points away from it.
function lockGeometry(points,width,depth,{rows=40,sides=8,taper=t=>1,outward=null,uvScale=1}={}){
  const curve=new THREE.CatmullRomCurve3(points,false,'centripetal');
  const pos=[],uv=[],idx=[],ends=[],T=new THREE.Vector3(),A=new THREE.Vector3(),N=new THREE.Vector3(),out=new THREE.Vector3();
  for(let row=0;row<=rows;row++){
    const t=row/rows,p=curve.getPoint(t);T.copy(curve.getTangent(t));
    if(outward)outward(p,out,t);else out.subVectors(p,CENTER);
    A.crossVectors(T,out).normalize();N.crossVectors(A,T).normalize();
    const s=taper(t);ends.push(p);
    for(let k=0;k<=sides;k++){
      const a=k/sides*TAU,v=p.clone().addScaledVector(A,Math.cos(a)*width*s).addScaledVector(N,Math.sin(a)*depth*s);
      pos.push(v.x,v.y,v.z);uv.push(k/sides*uvScale,t*2.5*uvScale);
      if(row<rows&&k<sides){const q=row*(sides+1)+k;idx.push(q,q+sides+1,q+1,q+1,q+sides+1,q+sides+2);}
    }
  }
  for(const [row,flip] of [[0,true],[rows,false]]){
    const c=pos.length/3,p=ends[row];pos.push(p.x,p.y,p.z);uv.push(.5,row/rows);
    for(let k=0;k<sides;k++){const q=row*(sides+1)+k;idx.push(c,flip?q+1:q,flip?q:q+1);}
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();return g;
}
const scalpPoint=(az,y,offset)=>onScalp(toward(az,y),offset);

// Curtain strands from the part over the corners of the forehead, past the
// temples and down beside her cheeks to the jaw, clear of the glasses.
function curtainGeometry(side){
  const locks=[];
  const specs=[[3,0,0,1],[6,4,.002,.93],[9,-3,.004,.86],[5,8,.001,.78]];
  for(const [startAz,spread,lift,length] of specs){
    const pts=[[startAz,.0875,.0035],[24+spread*.4,.077,.0075+lift],[46+spread*.7,.054,.0105+lift],[61+spread,.024,.0125+lift],
      [67+spread,-.012,.014+lift],[70+spread,-.046*length-.004,.015+lift]].map(([az,y,o])=>scalpPoint(side*az*DEG,y,o));
    locks.push(lockGeometry(pts,.0068+.0012*Math.abs(spread)/8,.0016,{rows:46,taper:t=>(.55+.45*smooth(t,0,.15))*(1-smooth(t,.62,1))**.75+.03}));
  }
  return mergeGeometries(locks);
}

// Three strands follow offset figure-eight paths around the braid's axis, so
// they pass over and under each other like a real three-strand plait.
function plaitGeometry(curve,side){
  const strands=[],anchors=[],rows=140,sides=9,frames=curve.computeFrenetFrames(rows,false),reference=new THREE.Vector3(1,.15,side*.6).normalize();
  const L=new THREE.Vector3(),D=new THREE.Vector3();
  for(let k=0;k<3;k++){
    const points=[];
    for(let n=0;n<=rows;n++){
      const t=n/rows,p=curve.getPoint(t),T=frames.tangents[n];
      L.crossVectors(T,reference).normalize();D.crossVectors(L,T).normalize();
      const angle=t*TAU*6.4+k*TAU/3,scale=(1-.34*t)*(1+.12*smooth(t,0,.08)*(1-smooth(t,.08,.2)));
      points.push(p.addScaledVector(L,Math.sin(angle)*.0118*scale).addScaledVector(D,Math.sin(angle*2)*.0046*scale));
    }
    strands.push(lockGeometry(points,.0094,.0072,{rows,sides,taper:t=>(.62+.38*smooth(t,0,.05))*(1-.32*t),outward:(p,out)=>out.copy(reference),uvScale:.6}));
    for(let n=0;n<=rows;n++){const a=curve.getPoint(n/rows);for(let j=0;j<=sides;j++)anchors.push(a.x,a.y,a.z);}
    for(const t of [0,1]){const a=curve.getPoint(t);anchors.push(a.x,a.y,a.z);}
  }
  return {geometry:mergeGeometries(strands),anchors:new Float32Array(anchors)};
}
const fixedAnchors=(geometry,point)=>{const a=new Float32Array(geometry.attributes.position.count*3);for(let n=0;n<a.length;n+=3)a.set([point.x,point.y,point.z],n);return a;};

export function createHair({head,mesh}){
  const root=new THREE.Group();root.name='centre-part-hair-and-twin-braids';head.add(root);
  const {map,bump}=strandTextures();
  // Strands run along the texture's v axis; anisotropic highlights follow them.
  const material=new THREE.MeshPhysicalMaterial({map,bumpMap:bump,bumpScale:.5,roughness:.64,specularIntensity:.55,anisotropy:.55,anisotropyRotation:Math.PI/2,
    sheen:.25,sheenRoughness:.6,sheenColor:new THREE.Color('#8a5a46'),side:THREE.DoubleSide});
  material.name='zhiguo-hair';
  const dynamic=[],tieMaterial=new THREE.MeshStandardMaterial({color:'#f2c7cf',roughness:.55});
  const bead=new THREE.MeshStandardMaterial({color:'#fbf6ef',roughness:.35});
  for(const side of [1,-1]){
    const name=side>0?'right':'left';
    mesh(capGeometry(side),material,root).name=name+'-hair-cap';
    mesh(curtainGeometry(side),material,root).name=name+'-curtain-strands';
    // From the root behind the ear lobe, over the front of the shoulder, to the chest.
    const [az,y,lift]=outline(BRAID_ROOT_THETA),start=scalpPoint(side*az,y,lift-.006);
    const curve=new THREE.CatmullRomCurve3([start,new THREE.Vector3(-.022,-.086,side*.080),new THREE.Vector3(.012,-.140,side*.093),
      new THREE.Vector3(.084,-.200,side*.092),new THREE.Vector3(.124,-.268,side*.085),new THREE.Vector3(.130,-.330,side*.080)],false,'centripetal');
    const {geometry:g,anchors}=plaitGeometry(curve,side),braid=mesh(g,material,root);braid.name=name+'-plait';braid.frustumCulled=false;
    g.attributes.position.setUsage(THREE.DynamicDrawUsage);dynamic.push({mesh:braid,rest:g.attributes.position.array.slice(),anchors});
    // A small pink-and-white elastic near the end, then a short loose tuft.
    const end=curve.getPoint(.975),tangent=curve.getTangent(.975);
    const tieParts=[new THREE.TorusGeometry(.0086,.0030,8,20)];
    for(let n=0;n<3;n++){const b=new THREE.SphereGeometry(.0026,10,8);const a=n/3*TAU+.4;b.translate(Math.cos(a)*.0098,0,Math.sin(a)*.0098);tieParts.push(b);}
    tieParts[0].rotateX(Math.PI/2);
    const tieGeometry=mergeGeometries(tieParts.map(p=>p.index?p.toNonIndexed():p).map(p=>{p.deleteAttribute('uv');return p;}));
    tieGeometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),tangent));tieGeometry.translate(end.x,end.y,end.z);
    const tie=mesh(tieGeometry,tieMaterial,root);tie.name='braid-tie';
    tieGeometry.attributes.position.setUsage(THREE.DynamicDrawUsage);dynamic.push({mesh:tie,rest:tieGeometry.attributes.position.array.slice(),anchors:fixedAnchors(tieGeometry,end)});
    const tufts=[];
    for(let n=0;n<9;n++){
      const a=n/9*TAU,spread=new THREE.Vector3(Math.cos(a)*.0045,0,Math.sin(a)*.0045);
      tufts.push(lockGeometry([end.clone().addScaledVector(tangent,-.004),end.clone().addScaledVector(tangent,.018).add(spread),
        end.clone().addScaledVector(tangent,.040+.006*Math.sin(n*2.1)).addScaledVector(spread,1.9)],.0034,.0024,{rows:12,sides:6,taper:t=>1-.92*smooth(t,.15,1),outward:(p,out)=>out.set(1,0,0)}));
    }
    const tuft=mesh(mergeGeometries(tufts),material,root);tuft.name='braid-loose-end';tuft.frustumCulled=false;
    tuft.geometry.attributes.position.setUsage(THREE.DynamicDrawUsage);dynamic.push({mesh:tuft,rest:tuft.geometry.attributes.position.array.slice(),anchors:fixedAnchors(tuft.geometry,end)});
  }
  void bead;
  const state={roll:0,rollVelocity:0,pitch:0,pitchVelocity:0};
  function spring(key,target,dt){const v=key+'Velocity',w=10,e=Math.exp(-w*dt),d=state[key]-target,c=state[v]+w*d;state[key]=target+(d+c*dt)*e;state[v]=(state[v]-w*c*dt)*e;}
  const inverse=new THREE.Matrix4(),point=new THREE.Vector3(),axis=new THREE.Vector3();
  function pose({weight,lateral,airTuck},dt,torsoProfile){
    if(dt>0){spring('roll',weight*.030+lateral*.10,dt);spring('pitch',airTuck*.025,dt);}
    head.updateMatrix();inverse.copy(head.matrix).invert();
    const sway=(target,x,y,z)=>{const bend=smooth(-y,.07,.33);return target.set(x+state.pitch*.07*bend,y,z+state.roll*.07*bend).applyMatrix4(head.matrix);};
    for(const item of dynamic){
      const attr=item.mesh.geometry.attributes.position,rest=item.rest,anchors=item.anchors;
      let ax=NaN,ay=NaN,az=NaN,dx=0,dz=0;
      for(let n=0;n<attr.count;n++){
        const k=n*3;sway(point,rest[k],rest[k+1],rest[k+2]);
        // Push the braid axis out of the shirt and move each whole ring with it,
        // so the braid slides over the shoulder without being flattened.
        if(anchors[k]!==ax||anchors[k+1]!==ay||anchors[k+2]!==az){
          ax=anchors[k];ay=anchors[k+1];az=anchors[k+2];sway(axis,ax,ay,az);dx=dz=0;
          if(torsoProfile&&axis.y>.15&&axis.y<.54){
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
  return {root,dynamic,state,pose,material,color:'dark-auburn-brown',style:'centre-part-curtain-strands-twin-braids'};
}
