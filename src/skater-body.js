import * as THREE from 'three';
import { solveTwoBone, placeBetween, unitCylinder } from './util.js';

export const ARM_LENGTHS = { upper:0.235, lower:0.225 };
const clamp=THREE.MathUtils.clamp;

function shirtTexture() {
  const size=256,data=new Uint8Array(size*size*4);
  const mix=(a,b,t)=>a.map((v,i)=>Math.round(v+(b[i]-v)*t));
  for(let y=0;y<size;y++)for(let x=0;x<size;x++) {
    const u=x%64,v=y%64;
    let color=[205,209,191];
    if((u>14&&u<32)||(v>14&&v<32))color=mix(color,[83,106,138],0.56);
    if((u>20&&u<26)||(v>20&&v<26))color=mix(color,[41,63,101],0.82);
    if((u>42&&u<47)||(v>42&&v<47))color=mix(color,[192,165,112],0.80);
    if(u===6||v===6)color=mix(color,[251,247,219],0.70);
    const weave=((x+y)%2)*4-2;
    data.set([...color.map(c=>clamp(c+weave,0,255)),255],(y*size+x)*4);
  }
  const texture=new THREE.DataTexture(data,size,size);texture.colorSpace=THREE.SRGBColorSpace;
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(2.1,1.7);
  texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.generateMipmaps=true;texture.needsUpdate=true;
  return texture;
}

function torsoGeometry() {
  const sections=[[0,0.114,0.167],[0.08,0.110,0.151],[0.19,0.095,0.139],[0.32,0.118,0.161],[0.43,0.115,0.174],[0.49,0.075,0.133],[0.52,0.052,0.055]];
  const positions=[],uv=[],indices=[],sides=40;
  sections.forEach(([y,depth,width],row)=>{
    for(let n=0;n<=sides;n++){
      const angle=n/sides*Math.PI*2;
      positions.push(Math.cos(angle)*depth,y,Math.sin(angle)*width);uv.push(n/sides,y/0.52);
      if(row<sections.length-1&&n<sides){const a=row*(sides+1)+n,b=a+sides+1;indices.push(a,b,a+1,a+1,b,b+1);}
    }
  });
  for(const row of [0,sections.length-1]){
    const center=positions.length/3;positions.push(0,sections[row][0],0);uv.push(0.5,row?1:0);
    for(let n=0;n<sides;n++){const a=row*(sides+1)+n;if(row===0)indices.push(center,a,a+1);else indices.push(center,a+1,a);}
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}

function headGeometry() {
  const g=new THREE.SphereGeometry(1,64,40),p=g.attributes.position;
  for(let i=0;i<p.count;i++) {
    const nx=p.getX(i),ny=p.getY(i),nz=p.getZ(i),angle=Math.atan2(nz,nx);
    const jaw=ny<0?1+ny*0.12:1;
    let x=nx*0.098*jaw,y=ny*0.135,z=nz*0.112*jaw;
    // The image sits on a closed skull with cheek, nose and chin relief.
    x+=0.027*Math.exp(-((angle/0.19)**2)-((y+0.043)/0.028)**2);
    x+=0.011*Math.exp(-((angle/0.30)**2)-((y+0.083)/0.019)**2);
    p.setXYZ(i,x,y,z);
  }
  g.computeVertexNormals();return g;
}

function portraitMaterial() {
  const material=new THREE.ShaderMaterial({
    uniforms:{uAtlas:{value:null},uLight:{value:1}},
    vertexShader:`varying vec3 vLocal;varying vec3 vNormal;
      void main(){vLocal=position;vNormal=normal;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader:`
      varying vec3 vLocal;varying vec3 vNormal;uniform sampler2D uAtlas;uniform float uLight;
      const float PI=3.14159265359;
      vec4 photograph(){
        vec2 pixel=vec2(236.,79.)+vec2(-vLocal.z,-vLocal.y)*280.;
        return texture2D(uAtlas,(vec2(pixel.x/480.,1.-pixel.y/560.)+vec2(0.,1.))/vec2(4.,2.));
      }
      void main(){
        // Select photograph by the fixed surface direction, never by camera.
        float a=mod(atan(vLocal.z/0.112,vLocal.x/0.098)+2.*PI,2.*PI);
        // A single calibrated face avoids mixing different eyes and mouths
        // across the cheeks. Projection remains fixed to the skull surface.
        vec4 p=photograph();
        vec3 hair=vec3(0.065,0.033,0.023);
        float front=smoothstep(0.02,0.22,cos(a));
        float strand=0.003*sin(atan(vLocal.z,vLocal.x)*45.+vLocal.y*30.);
        vec3 fallback=hair+strand;
        vec3 color=mix(fallback,p.rgb,front*smoothstep(0.90,0.99,p.a));
        color=mix(color,hair,smoothstep(0.111,0.132,vLocal.y));
        float shade=0.80+0.20*max(0.,dot(normalize(vNormal),normalize(vec3(0.5,1.,0.35))));
        gl_FragColor=vec4(color*shade*uLight,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  return material;
}

export function createSkaterBody() {
  const root=new THREE.Group();root.name='volumetric-skater-upper-body';
  const spine=new THREE.Group();spine.name='articulated-spine';root.add(spine);
  const fabric=new THREE.MeshStandardMaterial({map:shirtTexture(),color:'#ffffff',roughness:0.94});
  const skin=new THREE.MeshStandardMaterial({color:'#d6a07c',roughness:0.82});
  const hair=new THREE.MeshStandardMaterial({color:'#39251e',roughness:0.86});
  const rim=new THREE.MeshStandardMaterial({color:'#736450',metalness:0.45,roughness:0.48});
  const silver=new THREE.MeshStandardMaterial({color:'#d8d2bb',metalness:0.65,roughness:0.4});
  const hitMeshes=[];
  function mesh(g,mat,parent=spine){const m=new THREE.Mesh(g,mat);m.castShadow=true;m.receiveShadow=true;parent.add(m);hitMeshes.push(m);return m;}
  const sphere=new THREE.SphereGeometry(1,24,16);
  function ellipsoid(parent,mat,scale){const m=mesh(sphere,mat,parent);m.scale.set(...scale);return m;}
  const shirt=mesh(torsoGeometry(),fabric);shirt.name='closed-shirt-volume';
  const neck=mesh(new THREE.CylinderGeometry(0.037,0.043,0.10,24),skin);neck.position.set(0,0.55,0);
  const collar=mesh(new THREE.TorusGeometry(0.055,0.015,10,32),fabric);collar.rotation.x=Math.PI/2;collar.position.y=0.513;
  const buttonMat=new THREE.MeshStandardMaterial({color:'#ebe6d7',roughness:0.85});
  for(let n=0;n<5;n++){const y=0.10+n*0.079,depth=y<0.19?0.110-(y-0.08)/0.11*0.015:y<0.32?0.095+(y-0.19)/0.13*0.023:0.118;
    const button=ellipsoid(spine,buttonMat,[0.003,0.0045,0.0045]);button.position.set(depth+0.002,y,0);}
  const head=new THREE.Group();head.name='closed-photographic-head';head.position.set(0.010,0.722,0);spine.add(head);
  const faceMat=portraitMaterial();const skull=mesh(headGeometry(),faceMat,head);skull.name='portrait-on-3d-skull';
  for(const side of [1,-1]){
    const ear=ellipsoid(head,skin,[0.024,0.036,0.014]);ear.position.set(-0.003,-0.015,side*0.106);
    const hoop=mesh(new THREE.TorusGeometry(0.007,0.0018,6,14),silver,head);hoop.position.set(0,-0.05,side*0.121);
    const drop=ellipsoid(head,silver,[0.005,0.014,0.006]);drop.position.set(0,-0.073,side*0.121);
    const frame=mesh(new THREE.TorusGeometry(0.032,0.0014,7,40),rim,head);
    frame.rotation.y=Math.PI/2;frame.scale.set(0.94,1,1.18);frame.position.set(0.104,-0.027,side*0.053);
    const temple=mesh(unitCylinder(0.0014,0.0014,6),rim,head);
    placeBetween(temple,new THREE.Vector3(0.104,-0.025,side*0.092),new THREE.Vector3(-0.035,-0.015,side*0.110));
  }
  const bridge=mesh(unitCylinder(0.0013,0.0013,6),rim,head);placeBetween(bridge,new THREE.Vector3(0.105,-0.010,-0.022),new THREE.Vector3(0.105,-0.010,0.022));
  const braids=[];
  for(const side of [1,-1]){
    const braid=new THREE.Group();braid.position.set(-0.025,-0.075,side*0.103);head.add(braid);braids.push({mesh:braid,side});
    for(let strand=0;strand<3;strand++){
      const points=[];
      for(let n=0;n<=64;n++){const t=n/64,a=t*Math.PI*16+strand*Math.PI*2/3,r=0.009*(1-t*0.4);
        points.push(new THREE.Vector3(t*0.034+Math.cos(a)*r,-t*0.28,-side*t*0.022+Math.sin(a)*r));}
      mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),64,0.006,7,false),hair,braid);
    }
  }
  const mouth=new THREE.Object3D();mouth.position.set(0.115,-0.083,0);head.add(mouth);
  const knot=new THREE.Object3D();knot.position.set(-0.02,0.57,0);spine.add(knot);
  const arms=[1,-1].map((side,i)=>{
    const upper=mesh(unitCylinder(0.043,0.034,20),skin),lower=mesh(unitCylinder(0.034,0.025,20),skin);
    const elbowMesh=ellipsoid(spine,skin,[0.034,0.034,0.034]);
    const sleeve=mesh(unitCylinder(0.074,0.066,24),fabric);
    const hand=ellipsoid(spine,skin,[0.026,0.050,0.018]);
    return {side,name:i===0?'right':'left',upper,lower,elbowMesh,sleeve,hand,
      shoulder:new THREE.Vector3(),elbow:new THREE.Vector3(),wrist:new THREE.Vector3(),target:new THREE.Vector3(),pole:new THREE.Vector3(),
      skinStart:new THREE.Vector3(),sleeveEnd:new THREE.Vector3(),handEnd:new THREE.Vector3()};
  });
  const state={joints:{},torsoDepth:0.236,shoulderWidth:0.348,poseVersion:0};
  function pose(motion,ctx={},dt=0){
    root.position.set(-0.025,motion.hipHeight,motion.shift);root.rotation.y=motion.pelvisYaw??0;
    const activity=motion.activity??0,weight=Math.sin(motion.phase*Math.PI*2)*activity;
    const forwardLean=0.055+clamp((ctx.speed??0)/15,0,1)*0.065;
    const lateralLean=clamp(ctx.lean??0,-0.28,0.28)*0.50+weight*0.020;
    spine.rotation.set(lateralLean,-weight*0.055,-forwardLean);
    head.rotation.set(-lateralLean*0.35,weight*0.028,forwardLean*0.40);
    faceMat.uniforms.uLight.value=1-(ctx.night??0)*0.28;
    for(const leg of arms){
      const {side,shoulder,elbow,wrist,target,pole}=leg;
      shoulder.set(0,0.433,side*0.166);
      target.set(0.16-side*weight*0.085,0.22+Math.abs(weight)*0.018,side*(0.22+(motion.balanceAmount??0)*0.12));
      pole.set(-0.22,-1,side*0.25);
      solveTwoBone(shoulder,target,ARM_LENGTHS.upper,ARM_LENGTHS.lower,pole,elbow,wrist);
      leg.skinStart.copy(shoulder).lerp(elbow,0.38);placeBetween(leg.upper,leg.skinStart,elbow);
      placeBetween(leg.lower,elbow,wrist);leg.elbowMesh.position.copy(elbow);
      leg.sleeveEnd.copy(shoulder).lerp(elbow,0.44);placeBetween(leg.sleeve,shoulder,leg.sleeveEnd);
      leg.handEnd.copy(wrist).addScaledVector(wrist.clone().sub(elbow).normalize(),0.06);
      leg.hand.position.copy(wrist).lerp(leg.handEnd,0.45);leg.hand.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),leg.handEnd.clone().sub(wrist).normalize());
      state.joints[leg.name]={shoulder:shoulder.toArray(),elbow:elbow.toArray(),wrist:wrist.toArray()};
    }
    for(const {mesh:braid,side}of braids)braid.rotation.z=weight*0.045+side*lateralLean*0.2;
    state.pelvisPosition=root.position.toArray();state.pelvisYaw=root.rotation.y;state.spineRotation=spine.rotation.toArray().slice(0,3);
    state.poseVersion++;root.updateMatrixWorld(true);
    return state;
  }
  return {root,spine,head,mouth,knot,arms,shirt,skull,state,hitMeshes,pose,setAtlas(texture){faceMat.uniforms.uAtlas.value=texture;}};
}
