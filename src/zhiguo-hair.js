import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {headRadius,HEAD_AXIS_X,HEAD_TOP} from './zhiguo-identity.js';

// Zhiguo's hair as in her braided photos: a centre part with the scalp showing,
// soft volume over the ears, fine broken hairs along the forehead, curtain
// strands and loose wisps framing her face and ears, and two loose, slightly
// uneven three-strand braids that start low behind the ears and hang over the
// front of her shoulders, tied with small pink-and-white elastics.
//
// A smooth cap gives the hair its volume; overlapping strand cards on top break
// its outline into locks with feathered tips, so it never reads as a shell.
const TAU=Math.PI*2,DEG=Math.PI/180,smooth=THREE.MathUtils.smoothstep,lerp=THREE.MathUtils.lerp,clamp=THREE.MathUtils.clamp;
// Dark brown with the auburn tint her hair shows indoors and in sunlight.
const HAIR=[44,28,22],SHINE=[96,60,45];
const CENTER=new THREE.Vector3(0,.015,0);
function random(seed){return ()=>((seed=(seed*16807)%2147483647)/2147483647);}

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
const scalpPoint=(az,y,offset)=>onScalp(toward(az,y),offset);
const sagittal=el=>new THREE.Vector3(Math.cos(el),Math.sin(el),0);

function texture(w,h,pixel,srgb=true){
  const data=new Uint8Array(w*h*4);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)data.set(pixel(x,y).map(v=>clamp(Math.round(v),0,255)),(y*w+x)*4);
  const t=new THREE.DataTexture(data,w,h);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.minFilter=THREE.LinearMipmapLinearFilter;t.magFilter=THREE.LinearFilter;
  t.generateMipmaps=true;t.anisotropy=8;if(srgb)t.colorSpace=THREE.SRGBColorSpace;t.needsUpdate=true;return t;
}
// Fine strands across u, gentle variation along v, for the cap and braids. The
// same data gives a bump map, so each strand catches light like real hair.
function strandTextures(){
  const w=256,h=64,rnd=random(11);
  const strand=Array.from({length:w},()=>rnd()),clump=Array.from({length:w},(_,x)=>.5+.5*Math.sin(x/w*TAU*5+rnd()*.6));
  const tone=(x,y)=>clamp(.25+.55*(strand[x]*.7+.3*strand[(x+1)%w])+.2*clump[x]+.08*Math.sin(y/h*TAU*2+x*.37),0,1);
  const map=texture(w,h,(x,y)=>{const t=tone(x,y)*.8;return [...HAIR.map((c,i)=>c+(SHINE[i]-c)*t),255];});
  const bump=texture(w,h,x=>{const b=255*(.35+.65*strand[x]);return [b,b,b,255];},false);
  return {map,bump};
}
// Strand cards: clumps of hair along v, from the root (v=0) to uneven tapered
// tips, transparent between clumps. Clumps are several texels wide so they
// survive mipmapping and alpha testing at a distance. `density` thins wisps.
function cardTexture(density,seed){
  const w=128,h=256,rnd=random(seed),cols=[];
  for(let x=0;x<w;){
    const width=3+Math.floor(rnd()*5),on=rnd()<density,tip=.62+.38*rnd(),tone=.8+.45*rnd(),wave=rnd()*TAU;
    for(let k=0;k<width&&x<w;k++,x++)cols.push({on,tip,tone,edge:Math.min(k,width-1-k),wave});
    x+=rnd()<.5?1:0;while(cols.length<x)cols.push({on:false});
  }
  return texture(w,h,(x,y)=>{
    const c=cols[x],v=y/h;if(!c?.on)return [...HAIR,0];
    const tip=1-smooth(v,c.tip-.22,c.tip),root=smooth(v,0,.03),side=Math.min(1,(Math.min(x,w-1-x))/5);
    const a=255*tip*root*side*(c.edge===0?.75:1);
    const t=clamp(.30+.42*(c.tone-.8)/.45+.10*Math.sin(v*9+c.wave),0,1);
    return [...HAIR.map((h0,i)=>h0+(SHINE[i]-h0)*t),a];
  });
}

// The outline of the hair on one side, as (theta, azimuth deg, height, lift):
// forehead hairline at the part, temple, over the ear, braid root behind the
// ear lobe, then the nape hairline back to the middle.
const OUTLINE=[[0,0,.088,.0005],[.06,15,.086,.0005],[.12,30,.080,.0006],[.18,45,.069,.0008],[.24,58,.054,.0012],
  [.30,68,.036,.003],[.36,80,.012,.007],[.42,95,-.018,.012],[.50,118,-.046,.010],[.60,136,-.058,.005],
  [.75,155,-.064,.0025],[.90,170,-.066,.0015],[1,180,-.066,.0015]];
function outline(theta){
  let k=0;while(k<OUTLINE.length-2&&theta>OUTLINE[k+1][0])k++;
  const a=OUTLINE[k],b=OUTLINE[k+1],t=smooth(theta,a[0],b[0]);
  return [lerp(a[1],b[1],t)*DEG,lerp(a[2],b[2],t),lerp(a[3],b[3],t)];
}
// The centre line runs from the forehead hairline over the crown to the nape.
const PART_FRONT=Math.atan2(toward(0,.088).y,toward(0,.088).x),PART_BACK=Math.PI+Math.atan2(-toward(Math.PI,-.066).y,-toward(Math.PI,-.066).x);
export const BRAID_ROOT_THETA=.5;
// Each half starts a little off the middle, so a fine line of scalp shows along
// the part, widest at the forehead.
const partOffset=theta=>.016-.007*smooth(theta,.05,.35)-.0075*smooth(theta,.45,.7);

// A point of one side's hair surface: strands run from the part (t=0) to the outline (t=1).
const capDir=new THREE.Vector3();
function capPoint(side,theta,t,extra=0){
  const [az,y,edgeLift]=outline(theta);
  const from=sagittal(lerp(PART_FRONT,PART_BACK,theta));from.z=side*partOffset(theta);from.normalize();
  capDir.copy(from).lerp(toward(side*az,y),t).normalize();
  // More volume over the sides and back than at the part or the hairline.
  const volume=.0035+.0085*smooth(theta,.10,.35)*(1-.6*smooth(theta,.65,1));
  const locks=.0011*Math.sin(theta*TAU*17+Math.sin(theta*31)*1.4)*smooth(t,.15,.6)*(1-smooth(t,.9,1));
  const ear=.008*Math.exp(-(((Math.atan2(Math.abs(capDir.z),capDir.x)/DEG-92)/18)**2+((capDir.y+.10)/.28)**2));
  const lift=lerp(.0026,edgeLift,smooth(t,.55,1))+volume*Math.sin(Math.PI*Math.min(1,t*1.15))**.7+ear*smooth(t,.3,.8)+locks;
  return onScalp(capDir,lift+extra);
}
function capGeometry(side,{rows=150,cols=44}={}){
  const pos=[],uv=[],idx=[];
  for(let i=0;i<=rows;i++)for(let j=0;j<=cols;j++){
    const theta=i/rows,t=j/cols,p=capPoint(side,theta,t);pos.push(p.x,p.y,p.z);uv.push(theta*14,t*2.2);
    if(i<rows&&j<cols){const k=i*(cols+1)+j,n=k+cols+1;if(side>0)idx.push(k,k+1,n,k+1,n+1,n);else idx.push(k,n,k+1,k+1,n,n+1);}
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();return g;
}

// A strand card along a curve: a slightly arched ribbon whose width lies across
// `outward(p)`, textured from root (v=0) to tip (v=1).
function ribbon(points,width,{rows=24,outward=null,widthAt=t=>1,arch=.25}={}){
  const curve=new THREE.CatmullRomCurve3(points,false,'centripetal'),pos=[],uv=[],idx=[];
  const T=new THREE.Vector3(),A=new THREE.Vector3(),N=new THREE.Vector3(),out=new THREE.Vector3();
  for(let i=0;i<=rows;i++){
    const t=i/rows,p=curve.getPoint(t);T.copy(curve.getTangent(t));
    if(outward)outward(p,out,t);else out.subVectors(p,CENTER);
    A.crossVectors(T,out).normalize();N.crossVectors(A,T).normalize();
    const w=width*widthAt(t);
    for(let j=0;j<=2;j++){const s=j-1,q=p.clone().addScaledVector(A,s*w/2).addScaledVector(N,(1-s*s)*w*arch*.25);pos.push(q.x,q.y,q.z);uv.push(j/2,t);}
    if(i<rows){const k=i*3;idx.push(k,k+3,k+1,k+1,k+3,k+4,k+1,k+4,k+2,k+2,k+4,k+5);}
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();return g;
}
// A closed, flattened strand swept along a curve, for the braids.
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

// Locks lying over the cap from the part towards the braid root and hairline.
function capCards(side,rnd){
  const cards=[];
  for(let n=0;n<76;n++){
    const theta=clamp((n+.5)/76+(rnd()-.5)*.012,.005,.995),spread=.010+.012*rnd(),lift=.0010+.0026*rnd();
    const t0=.01+.05*rnd(),t1=theta<.33?.97+.05*rnd():.80+.2*rnd(),pts=[];
    for(let k=0;k<=10;k++){
      const t=lerp(t0,t1,k/10),wob=Math.sin(k*.9+n)*.0012*smooth(t,.2,.7);
      pts.push(capPoint(side,theta,t,lift*(1-.6*smooth(t,.85,1))+wob));
    }
    const across=capPoint(side,Math.min(.999,theta+spread),.5).distanceTo(capPoint(side,Math.max(0,theta-spread),.5));
    cards.push(ribbon(pts,clamp(across,.006,.020),{rows:22,widthAt:t=>.75+.25*Math.sin(Math.PI*Math.min(1,t*1.4))}));
  }
  return mergeGeometries(cards);
}
// Fine broken hairs along the forehead hairline and a few strands that fall
// across the forehead from the part.
function foreheadWisps(side,rnd){
  const cards=[];
  for(let n=0;n<11;n++){
    const theta=.01+.26*n/10+.01*rnd(),[az,y]=outline(theta),len=.010+.016*rnd(),drop=.006+.012*rnd();
    const pts=[0,.5,1].map(k=>scalpPoint(side*(az+(k*.05+.02)*rnd()*.3),y+.004-k*drop,.0015+k*len*.25));
    cards.push(ribbon(pts,.004+.003*rnd(),{rows:8,arch:.6}));
  }
  for(const [startAz,endAz,endY,lift] of [[3,22,.046,.003],[5,30,.050,.004]]){
    const pts=[[startAz,.0885,.0022],[lerp(startAz,endAz,.4),.077,lift],[lerp(startAz,endAz,.75),.062,lift+.001],[endAz,endY,lift+.0015]]
      .map(([a,y,o])=>scalpPoint(side*a*DEG,y,o));
    cards.push(ribbon(pts,.0055,{rows:18,arch:.3}));
  }
  // A soft nape hairline: short strands hang a little below the cap's edge.
  for(let n=0;n<14;n++){
    const theta=.56+.42*n/13,[az,y]=outline(theta),drop=.005+.005*rnd();
    const pts=[capPoint(side,theta,.86,.0004),scalpPoint(side*az,y-.001,.0012),scalpPoint(side*(az+.03*(rnd()-.5)),y-drop,.0008)];
    cards.push(ribbon(pts,.008+.005*rnd(),{rows:8,arch:.2}));
  }
  return mergeGeometries(cards);
}
// Curtain strands from the part over the forehead corners, hanging beside her
// cheeks to the jaw, and loose wisps in front of the ears.
function framingCards(side,rnd){
  const cards=[];
  const curtains=[[2,0,.010,-.060,1.6],[5,3,.012,-.072,1.9],[8,-2,.0135,-.064,1.7],[4,6,.0115,-.085,1.3],[10,2,.015,-.054,1.5]];
  for(const [startAz,spread,off,endY,width] of curtains){
    const pts=[[startAz,.0875,.0030],[22+spread*.4,.079,off*.55],[40+spread*.6,.060,off*.85],[50+spread,.030,off],
      [54+spread,.000,off*1.04],[55+spread,-.030,off*1.06],[52+spread,endY,off*.95]].map(([a,y,o])=>scalpPoint(side*a*DEG,y,o));
    cards.push(ribbon(pts,width*.01,{rows:34,arch:.35,widthAt:t=>.55+.45*smooth(t,0,.25)}));
    // A second, offset layer fills the curtain out.
    cards.push(ribbon(pts.map(p=>p.clone().add(new THREE.Vector3(-.0015,-.002,side*.0018))),width*.0085,{rows:34,arch:.35,widthAt:t=>.5+.5*smooth(t,0,.3)}));
  }
  for(let n=0;n<4;n++){
    const a=72+n*5+3*rnd(),pts=[[a,.040,.009],[a+4,.012,.014],[a+3,-.025,.016],[a-2,-.060-.02*rnd(),.015]].map(([az,y,o])=>scalpPoint(side*az*DEG,y,o));
    cards.push(ribbon(pts,.006+.004*rnd(),{rows:20,arch:.4}));
  }
  return mergeGeometries(cards);
}

// Three strands follow offset figure-eight paths around the braid's axis. Their
// crossings vary a little in spacing and fullness, so the braid looks hand-made.
function plaitGeometry(curve,side,rnd){
  const strands=[],anchors=[],rows=150,sides=9,frames=curve.computeFrenetFrames(rows,false),reference=new THREE.Vector3(1,.15,side*.6).normalize();
  const L=new THREE.Vector3(),D=new THREE.Vector3(),phase=[0,1,2].map(()=>rnd()*TAU);
  for(let k=0;k<3;k++){
    const points=[];
    for(let n=0;n<=rows;n++){
      const t=n/rows,p=curve.getPoint(t),T=frames.tangents[n];
      L.crossVectors(T,reference).normalize();D.crossVectors(L,T).normalize();
      const angle=t*TAU*6.0+k*TAU/3+.35*Math.sin(t*TAU*2.3+phase[k]);
      const scale=(1-.42*t)*(1+.10*Math.sin(t*TAU*3.1+phase[(k+1)%3]))*(1+.18*smooth(t,0,.06)*(1-smooth(t,.06,.18)));
      points.push(p.addScaledVector(L,Math.sin(angle)*.0090*scale).addScaledVector(D,Math.sin(angle*2)*.0036*scale));
    }
    strands.push(lockGeometry(points,.0070*(1+.08*(k-1)),.0052,{rows,sides,taper:t=>(.60+.40*smooth(t,0,.05))*(1-.38*t),outward:(p,out)=>out.copy(reference),uvScale:.6}));
    for(let n=0;n<=rows;n++){const a=curve.getPoint(n/rows);for(let j=0;j<=sides;j++)anchors.push(a.x,a.y,a.z);}
    for(const t of [0,1]){const a=curve.getPoint(t);anchors.push(a.x,a.y,a.z);}
  }
  return {geometry:mergeGeometries(strands),anchors:new Float32Array(anchors)};
}
// Short flyaways escaping the braid, and a feathered loose end below the tie.
function braidWisps(curve,side,rnd){
  const cards=[],anchors=[];
  const push=(g,a)=>{cards.push(g);for(let i=0;i<g.attributes.position.count;i++)anchors.push(a.x,a.y,a.z);};
  for(let n=0;n<16;n++){
    const t=.05+.88*n/15+.02*rnd(),p=curve.getPoint(t),T=curve.getTangent(t),a=rnd()*TAU;
    const out=new THREE.Vector3(Math.cos(a)*.5,0,Math.sin(a)).add(new THREE.Vector3(.4,0,side*.3)).normalize();
    const len=.012+.016*rnd();
    const pts=[p.clone().addScaledVector(out,.004),p.clone().addScaledVector(out,.008).addScaledVector(T,len*.5),p.clone().addScaledVector(out,.010+.006*rnd()).addScaledVector(T,len)];
    push(ribbon(pts,.003+.003*rnd(),{rows:6,outward:(q,o)=>o.copy(out)}),p);
  }
  const end=curve.getPoint(.975),T=curve.getTangent(.975);
  for(let n=0;n<9;n++){
    const a=n/9*TAU,spread=new THREE.Vector3(Math.cos(a),0,Math.sin(a)).multiplyScalar(.004),len=.040+.022*rnd();
    const pts=[end.clone().addScaledVector(T,-.006),end.clone().addScaledVector(T,len*.45).addScaledVector(spread,1.4),end.clone().addScaledVector(T,len).addScaledVector(spread,2.6+rnd())];
    push(ribbon(pts,.008+.004*rnd(),{rows:10,outward:()=>spread.clone().normalize(),widthAt:t=>1-.3*t}),end);
  }
  return {geometry:mergeGeometries(cards),anchors:new Float32Array(anchors)};
}
const fixedAnchors=(geometry,point)=>{const a=new Float32Array(geometry.attributes.position.count*3);for(let n=0;n<a.length;n+=3)a.set([point.x,point.y,point.z],n);return a;};

export function createHair({head,mesh}){
  const root=new THREE.Group();root.name='centre-part-hair-and-twin-braids';head.add(root);
  const {map,bump}=strandTextures(),rnd=random(41);
  // Strands run along the texture's v axis; anisotropic highlights follow them.
  const common={roughness:.70,specularIntensity:.40,anisotropy:.50,anisotropyRotation:Math.PI/2,sheen:.12,sheenRoughness:.7,sheenColor:new THREE.Color('#7a5040'),side:THREE.DoubleSide};
  const material=new THREE.MeshPhysicalMaterial({...common,map,bumpMap:bump,bumpScale:.5});material.name='zhiguo-hair';
  const card=new THREE.MeshPhysicalMaterial({...common,map:cardTexture(.88,7),alphaTest:.42,alphaToCoverage:true});card.name='zhiguo-hair-strands';
  const wisp=new THREE.MeshPhysicalMaterial({...common,map:cardTexture(.45,19),alphaTest:.4,alphaToCoverage:true});wisp.name='zhiguo-hair-wisps';
  const dynamic=[],tieMaterial=new THREE.MeshStandardMaterial({color:'#f2c7cf',roughness:.55});
  const addDynamic=(m,anchors)=>{m.frustumCulled=false;m.geometry.attributes.position.setUsage(THREE.DynamicDrawUsage);dynamic.push({mesh:m,rest:m.geometry.attributes.position.array.slice(),anchors});};
  for(const side of [1,-1]){
    const name=side>0?'right':'left';
    mesh(capGeometry(side),material,root).name=name+'-hair-cap';
    mesh(capCards(side,rnd),card,root).name=name+'-hair-strand-locks';
    mesh(foreheadWisps(side,rnd),wisp,root).name=name+'-forehead-broken-hairs';
    mesh(framingCards(side,rnd),card,root).name=name+'-curtain-and-ear-strands';
    // From the root behind the ear lobe, over the front of the shoulder, to the chest,
    // with a slight natural sway in its line.
    const [az,y,lift]=outline(BRAID_ROOT_THETA),start=scalpPoint(side*az,y,lift-.007);
    const curve=new THREE.CatmullRomCurve3([start,new THREE.Vector3(-.020,-.084,side*.079),new THREE.Vector3(.010,-.135,side*.090),
      new THREE.Vector3(.066,-.185,side*.093),new THREE.Vector3(.110,-.240,side*.087),new THREE.Vector3(.126,-.290,side*.084),new THREE.Vector3(.131,-.322,side*.078)],false,'centripetal');
    const {geometry:g,anchors}=plaitGeometry(curve,side,rnd),braid=mesh(g,material,root);braid.name=name+'-plait';addDynamic(braid,anchors);
    const wisps=braidWisps(curve,side,rnd),loose=mesh(wisps.geometry,card,root);loose.name='braid-flyaways-and-loose-end';addDynamic(loose,wisps.anchors);
    // A small pink-and-white elastic near the end.
    const end=curve.getPoint(.975),tangent=curve.getTangent(.975);
    const tieParts=[new THREE.TorusGeometry(.0072,.0026,8,20)];
    for(let n=0;n<3;n++){const b=new THREE.SphereGeometry(.0023,10,8);const a=n/3*TAU+.4;b.translate(Math.cos(a)*.0083,0,Math.sin(a)*.0083);tieParts.push(b);}
    tieParts[0].rotateX(Math.PI/2);
    const tieGeometry=mergeGeometries(tieParts.map(p=>p.index?p.toNonIndexed():p).map(p=>{p.deleteAttribute('uv');return p;}));
    tieGeometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),tangent));tieGeometry.translate(end.x,end.y,end.z);
    const tie=mesh(tieGeometry,tieMaterial,root);tie.name='braid-tie';addDynamic(tie,fixedAnchors(tieGeometry,end));
  }
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
            const p=torsoProfile(axis.y),width=p.z+.020,depth=(axis.x>=0?p.x:p.y)+.024;
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
