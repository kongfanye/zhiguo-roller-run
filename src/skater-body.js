import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {solveTwoBone,placeBetween,unitCylinder} from './util.js';
import {ANATOMY} from './anatomical-mesh.js';

export const ARM_LENGTHS={upper:0.235,lower:0.225};
const clamp=THREE.MathUtils.clamp,TAU=Math.PI*2,Y=new THREE.Vector3(0,1,0);
const profiles=[[0,.116,.120,.167],[.08,.109,.117,.151],[.19,.088,.075,.132],[.30,.112,.083,.148],[.39,.105,.078,.162],[.445,.085,.074,.165],[.49,.057,.053,.080],[.52,.046,.043,.047]];
const profileCurve=new THREE.CatmullRomCurve3(profiles.map(([y,f,b,w])=>new THREE.Vector3(f,b,w)),false,'catmullrom',0.4);
function profile(y){
  let n=0;while(n<profiles.length-2&&y>profiles[n+1][0])n++;
  const t=(y-profiles[n][0])/(profiles[n+1][0]-profiles[n][0]);
  return profileCurve.getPoint((n+clamp(t,0,1))/(profiles.length-1));
}
function fabricTexture(){
  const size=256,data=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const u=x%64,v=y%64;let color=[199,200,180];
    if((u>18&&u<30)||(v>18&&v<30))color=[119,138,155];
    if((u>22&&u<26)||(v>22&&v<26))color=[68,87,118];
    if((u>43&&u<47)||(v>43&&v<47))color=[173,154,117];
    if(u===7||v===7)color=[227,226,209];
    const weave=((x+y)%2)*3-1.5;
    data.set([...color.map(c=>c+weave),255],(y*size+x)*4);
  }
  const tex=new THREE.DataTexture(data,size,size);tex.colorSpace=THREE.SRGBColorSpace;
  tex.wrapS=tex.wrapT=THREE.RepeatWrapping;tex.repeat.set(2.1,1.65);
  tex.magFilter=THREE.LinearFilter;tex.minFilter=THREE.LinearMipmapLinearFilter;tex.generateMipmaps=true;tex.needsUpdate=true;return tex;
}
function torsoGeometry(open=false){
  const pos=[],uv=[],idx=[],rows=48,sides=64;
  for(let row=0;row<=rows;row++){
    const t=row/rows,y=t*.52,p=profile(y),gap=open?.37+.22*t:0;
    for(let n=0;n<=sides;n++){
      const angle=gap+(TAU-gap*2)*n/sides,c=Math.cos(angle),s=Math.sin(angle);
      let depth=c>0?p.x:p.y,width=p.z;
      const fold=open?Math.sin(Math.PI*t)*(.0025*Math.sin(angle*11+y*43)+.0015*Math.sin(angle*23-y*67)):0;
      depth+=fold; width+=fold*.7;
      const x=c*(depth+(open?.003:0)),z=s*(width+(open?.002:0));
      const hem=open?.008*Math.cos(angle*2)*(1-t)**5:0;
      const crew=open?0:-.032*Math.max(0,c)*t**10;
      pos.push(x,y+hem+crew,z);uv.push(angle/TAU,t);
      if(row<rows&&n<sides){const a=row*(sides+1)+n,b=a+sides+1;idx.push(a,b,a+1,a+1,b,b+1);}
    }
  }
  if(!open)for(const row of [0]){
    const c=pos.length/3;pos.push(0,row/rows*.52,0);uv.push(.5,row/rows);
    for(let n=0;n<sides;n++){const a=row*(sides+1)+n;if(row)idx.push(c,a+1,a);else idx.push(c,a,a+1);}
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();return g;
}
function geometry(data){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(data.positions,3));g.setIndex(data.indices);g.computeVertexNormals();return g;}
function faceMaterial(){
  return new THREE.ShaderMaterial({uniforms:{uFace:{value:null},uLight:{value:1}},
    vertexShader:`varying vec3 vLocal;varying vec3 vNormal;void main(){vLocal=position;vNormal=mat3(modelMatrix)*normal;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`varying vec3 vLocal;varying vec3 vNormal;uniform sampler2D uFace;uniform float uLight;
      float row(float y){
        if(y>.072)return mix(.08,-.12,(y-.072)/.068);
        if(y>.022)return mix(.403,.08,(y-.022)/.05);
        if(y>-.018)return mix(.60,.403,(y+.018)/.04);
        if(y>-.047)return mix(.738,.60,(y+.047)/.029);
        if(y>-.077)return mix(.956,.738,(y+.077)/.03);
        return mix(1.15,.956,(y+.122)/.045);
      }
      void main(){
        vec2 uv=vec2(.5-vLocal.z*4.6,1.-row(vLocal.y));
        vec3 photo=texture2D(uFace,clamp(uv,0.,1.)).rgb;
        vec3 skin=vec3(.60,.32,.20);
        float front=smoothstep(.015,.055,vLocal.x)*smoothstep(-.095,-.074,vLocal.y);
        vec3 color=mix(skin,photo,front);
        float light=.72+.28*max(0.,dot(normalize(vNormal),normalize(vec3(.6,1.,.45))));
        gl_FragColor=vec4(color*light*uLight,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`});
}

export function createSkaterBody(){
  const root=new THREE.Group();root.name='volumetric-skater-upper-body';
  const spine=new THREE.Group();spine.name='articulated-spine';root.add(spine);
  const skin=new THREE.MeshStandardMaterial({color:'#cc9c7d',roughness:.78});
  const fabric=new THREE.MeshStandardMaterial({map:fabricTexture(),roughness:.98,side:THREE.DoubleSide});
  const teeMat=new THREE.MeshStandardMaterial({color:'#cccac3',roughness:1});
  const hairMat=new THREE.MeshStandardMaterial({color:'#493127',roughness:.9});
  const silver=new THREE.MeshStandardMaterial({color:'#b8ad97',metalness:.7,roughness:.38});
  const gold=new THREE.MeshStandardMaterial({color:'#a98a51',metalness:.55,roughness:.45});
  const hitMeshes=[];
  function mesh(g,mat,parent=spine){const m=new THREE.Mesh(g,mat);m.castShadow=true;m.receiveShadow=true;parent.add(m);hitMeshes.push(m);return m;}
  function ellipsoid(parent,mat,position,scale){const m=mesh(new THREE.SphereGeometry(1,20,12),mat,parent);m.position.set(...position);m.scale.set(...scale);return m;}
  function tube(points,r,mat,parent=spine){return mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),40,r,6,false),mat,parent);}
  const tee=mesh(torsoGeometry(),teeMat);tee.scale.set(.97,1,.97);tee.name='inner-shirt-body-volume';
  const shirt=mesh(torsoGeometry(true),fabric);shirt.name='tailored-open-plaid-shirt';
  // Folded collar leaves the inner shirt visible instead of a torus neckline.
  for(const side of [1,-1]){
    const points=[[.039,.517,side*.035],[.081,.479,side*.045],[.115,.418,side*.061],[.100,.445,side*.109],[.047,.503,side*.083]];
    const p=points.flat(),g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));
    g.setAttribute('uv',new THREE.Float32BufferAttribute([0,1,.25,.7,.5,0,1,.5,.75,1],2));
    g.setIndex(side===1?[0,1,2,0,2,3,0,3,4]:[0,2,1,0,3,2,0,4,3]);g.computeVertexNormals();mesh(g,fabric);
    const edge=[];for(let n=0;n<=20;n++){const y=n/20*.46,p=profile(y),a=.37+.22*y/.52;
      edge.push([Math.cos(a)*(p.x+.006),y,side*Math.sin(a)*(p.z+.002)]);}
    tube(edge,.0023,fabric);
    if(side===1)for(let n=0;n<5;n++){const p=edge[2+n*4];ellipsoid(spine,silver,[p[0]+.002,p[1],p[2]],[.002,.0035,.0035]);}
  }
  tube([[.052,.512,-.044],[-.030,.523,-.047],[-.052,.526,0],[-.030,.523,.047],[.052,.512,.044]],.0065,fabric);
  tube([[.054,.490,-.026],[.098,.360,-.016],[.113,.267,0],[.098,.360,.016],[.054,.490,.026]],.0008,gold);
  ellipsoid(spine,gold,[.113,.263,0],[.004,.009,.006]);
  const head=new THREE.Group();head.name='anatomical-photographic-head';head.position.set(.002,.650,0);spine.add(head);
  const faceMat=faceMaterial(),skull=mesh(geometry(ANATOMY.head),faceMat,head);skull.name='anatomical-face-and-neck';
  for(const side of [1,-1]){
    const eye=new THREE.SphereGeometry(.0135,24,16);eye.translate(.075,.022,side*.033);mesh(eye,faceMat,head);
    const loop=new THREE.TorusGeometry(.006,.0011,6,16);const hoop=mesh(loop,silver,head);hoop.rotation.y=Math.PI/2;hoop.position.set(-.018,-.014,side*.090);
    ellipsoid(head,silver,[-.018,-.036,side*.090],[.004,.012,.005]);
    const rim=[];
    for(let n=0;n<=80;n++){
      const a=n/80*TAU,cz=Math.cos(a),sy=Math.sin(a),z=side*.035+Math.sign(cz)*Math.abs(cz)**.65*.030;
      rim.push([.105-Math.abs(z)*.16,.022+Math.sign(sy)*Math.abs(sy)**.65*.023,z]);
    }
    tube(rim,.00085,silver,head);
    tube([[.094,.023,side*.067],[.047,.024,side*.085],[-.027,.021,side*.089]],.0009,silver,head);
  }
  tube([[.103,.028,-.005],[.111,.032,0],[.103,.028,.005]],.0008,silver,head);
  // A scalp plus swept locks gives a parted hairline and full side volume.
  const scalp=[],scalpNormals=[];const data=ANATOMY.head,pos=data.positions;
  for(let n=0;n<data.indices.length;n+=3){const ids=data.indices.slice(n,n+3),c=new THREE.Vector3();
    for(const i of ids)c.add(new THREE.Vector3(...pos.slice(i*3,i*3+3)));c.multiplyScalar(1/3);
    if(c.y>.085||(c.x<.025&&c.y>-.072)||(Math.abs(c.z)>.074&&c.y>-.045))
      for(const i of ids){const normals=skull.geometry.attributes.normal;
        scalp.push(pos[i*3]+normals.getX(i)*.0038,pos[i*3+1]+normals.getY(i)*.0038,pos[i*3+2]+normals.getZ(i)*.0038);
        scalpNormals.push(normals.getX(i),normals.getY(i),normals.getZ(i));}
  }
  const cap=new THREE.BufferGeometry();cap.setAttribute('position',new THREE.Float32BufferAttribute(scalp,3));cap.setAttribute('normal',new THREE.Float32BufferAttribute(scalpNormals,3));mesh(cap,hairMat,head);
  const locks=[];
  for(const side of [1,-1])for(let n=0;n<18;n++){
    const t=n/17,points=[[-.041+t*.11,.129-t*.02,side*.004],[-.025+t*.10,.126-t*.02,side*.039],[.007+t*.061,.080-t*.029,side*.073],[-.039+t*.114,-.045-t*.003,side*.084],[-.036+t*.034,-.094,side*.080]];
    const g=new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),36,.0035+Math.sin(n)*.0006,5,false);
    locks.push(g);
  }
  mesh(mergeGeometries(locks),hairMat,head);
  const braids=[];
  for(const side of [1,-1]){
    const group=new THREE.Group();group.position.set(-.025,-.087,side*.078);head.add(group);braids.push({mesh:group,side});const strands=[];
    for(let strand=0;strand<3;strand++){
      const points=[];for(let n=0;n<=72;n++){const t=n/72,a=t*TAU*6+strand*TAU/3,r=.0085*(1-t*.35);
        points.push(new THREE.Vector3(.05*t+Math.cos(a)*r,-t*.225,side*.012*t+Math.sin(a)*r));}
      strands.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),72,.0068,7,false));
    }
    mesh(mergeGeometries(strands),hairMat,group);
    const tie=mesh(new THREE.TorusGeometry(.009,.0015,6,14),gold,group);tie.rotation.x=Math.PI/2;tie.position.set(.045,-.204,side*.012);
  }
  const mouth=new THREE.Object3D();mouth.position.set(.105,-.047,0);head.add(mouth);
  const knot=new THREE.Object3D();knot.position.set(-.035,.526,0);spine.add(knot);
  const arms=[1,-1].map((side,i)=>{
    const data=ANATOMY.arms[i],g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array(data.weight.length*3),3));g.setIndex(data.indices);
    const skinArm=mesh(g,skin);skinArm.name=(i?'left':'right')+'-continuous-arm-and-hand';skinArm.frustumCulled=false;g.attributes.position.setUsage(THREE.DynamicDrawUsage);
    const upper=new THREE.Object3D(),lower=new THREE.Object3D(),hand=new THREE.Object3D();spine.add(upper,lower,hand);
    const sleeveProfile=[[0,0],[.061,0],[.064,.17],[.062,.42],[.055,.83],[.053,1]].map(([r,y])=>new THREE.Vector2(r,y));
    const sleeve=mesh(new THREE.LatheGeometry(sleeveProfile,32),fabric);
    return {side,name:i?'left':'right',upper,lower,hand,sleeve,skinArm,data,
      shoulder:new THREE.Vector3(),elbow:new THREE.Vector3(),wrist:new THREE.Vector3(),target:new THREE.Vector3(),pole:new THREE.Vector3(),
      sleeveStart:new THREE.Vector3(),sleeveEnd:new THREE.Vector3(),qu:new THREE.Quaternion(),ql:new THREE.Quaternion()};
  });
  const a=new THREE.Vector3(),b=new THREE.Vector3();
  const state={joints:{},torsoDepth:.23,shoulderWidth:.33,poseVersion:0};
  function pose(motion,ctx={},dt=0){
    root.position.set(-.025,motion.hipHeight,motion.shift);root.rotation.y=motion.pelvisYaw??0;
    const weight=Math.sin(motion.phase*TAU)*(motion.activity??0),forward=.07+clamp((ctx.speed??0)/15,0,1)*.07;
    const lateral=clamp(ctx.lean??0,-.28,.28)*.50+weight*.02;
    spine.rotation.set(lateral,-weight*.055,-forward);head.rotation.set(-lateral*.35,weight*.028,forward*.4);
    faceMat.uniforms.uLight.value=1-(ctx.night??0)*.28;
    for(const arm of arms){
      const {side,shoulder,elbow,wrist,target,pole,qu,ql,data}=arm;
      shoulder.set(-.002,.433,side*.160);
      target.set(.16-side*weight*.085,.22+Math.abs(weight)*.018,side*(.22+(motion.balanceAmount??0)*.12));pole.set(-.22,-1,side*.25);
      solveTwoBone(shoulder,target,ARM_LENGTHS.upper,ARM_LENGTHS.lower,pole,elbow,wrist);
      qu.setFromUnitVectors(Y,a.copy(elbow).sub(shoulder).normalize());ql.setFromUnitVectors(Y,b.copy(wrist).sub(elbow).normalize());
      arm.upper.position.copy(shoulder);arm.upper.quaternion.copy(qu);arm.lower.position.copy(elbow);arm.lower.quaternion.copy(ql);arm.hand.position.copy(wrist);arm.hand.quaternion.copy(ql);
      const p=arm.skinArm.geometry.attributes.position;
      for(let n=0;n<data.weight.length;n++){
        a.fromArray(data.upper,n*3).applyQuaternion(qu).add(shoulder);b.fromArray(data.lower,n*3).applyQuaternion(ql).add(elbow);
        a.lerp(b,data.weight[n]);p.setXYZ(n,a.x,a.y,a.z);
      }
      p.needsUpdate=true;arm.skinArm.geometry.computeVertexNormals();
      arm.sleeveStart.copy(shoulder);arm.sleeveStart.z-=side*.025;arm.sleeveStart.y+=.006;
      arm.sleeveEnd.copy(shoulder).lerp(elbow,.53);placeBetween(arm.sleeve,arm.sleeveStart,arm.sleeveEnd);
      state.joints[arm.name]={shoulder:shoulder.toArray(),elbow:elbow.toArray(),wrist:wrist.toArray()};
    }
    for(const braid of braids)braid.mesh.rotation.z=weight*.04+braid.side*lateral*.2;
    state.pelvisPosition=root.position.toArray();state.pelvisYaw=root.rotation.y;state.spineRotation=spine.rotation.toArray().slice(0,3);state.poseVersion++;root.updateMatrixWorld(true);return state;
  }
  return {root,spine,head,mouth,knot,arms,shirt,skull,tee,state,hitMeshes,pose,setFaceTexture(texture){faceMat.uniforms.uFace.value=texture;}};
}
