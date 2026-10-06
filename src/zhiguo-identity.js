import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {ANATOMY} from './anatomical-mesh.js';
import {createLooseHair} from './zhiguo-hair.js';

// Pixel landmarks measured on the user's unaltered 1440 x 960 photograph.
// The source photograph supplies the actual eyes, brows, nose and smile.
export const IDENTITY_PHOTO={asset:'zhiguo-identity-v8.jpg',width:1440,height:960,
  landmarks:{hairline:[678,268],eyes:[678,325],nose:[684,362],mouth:[679,391],chin:[670,438]},
  method:'original-photograph-on-volumetric-anatomy'};
const TAU=Math.PI*2,smooth=THREE.MathUtils.smoothstep;

export function identityMaterial(){
  const mat=new THREE.MeshStandardMaterial({color:'#b68062',roughness:.82});
  const uniforms={uIdentity:{value:null},uIdentityReady:{value:0}};mat.userData.identityUniforms=uniforms;
  mat.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,uniforms);
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vIdentityPosition;')
      .replace('#include <begin_vertex>','#include <begin_vertex>\nvIdentityPosition=position;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
      varying vec3 vIdentityPosition;uniform sampler2D uIdentity;uniform float uIdentityReady;
      vec2 photoRow(float y){
        if(y>.083)return vec2(678.,mix(268.,213.,(y-.083)/.057));
        if(y>.022)return mix(vec2(678.,325.),vec2(678.,268.),(y-.022)/.061);
        if(y>-.018)return mix(vec2(684.,362.),vec2(678.,325.),(y+.018)/.040);
        if(y>-.046)return mix(vec2(679.,391.),vec2(684.,362.),(y+.046)/.028);
        if(y<-.090)return vec2(670.,mix(438.,468.,clamp((-.090-y)/.04,0.,1.)));
        return mix(vec2(670.,438.),vec2(679.,391.),clamp((y+.090)/.044,0.,1.));
      }`)
      .replace('#include <color_fragment>',`#include <color_fragment>
        vec3 p=vIdentityPosition;vec2 pixel=photoRow(p.y);
        float horizontalScale=mix(450.,850.,smoothstep(-.092,-.052,p.y));pixel.x-=p.z*horizontalScale;
        vec2 identityUv=vec2(pixel.x/1440.,1.-pixel.y/960.);
        vec3 originalPhoto=texture2D(uIdentity,identityUv).rgb;
        float jawWidth=mix(.034,.088,smoothstep(-.094,-.045,p.y));
        float mask=smoothstep(.000,.028,p.x)*smoothstep(-.105,-.087,p.y)
          *(1.-smoothstep(.09,.12,p.y))*(1.-smoothstep(jawWidth-.010,jawWidth+.004,abs(p.z)));
        diffuseColor.rgb=mix(diffuseColor.rgb,originalPhoto,mask*uIdentityReady);`)
      .replace('#include <opaque_fragment>',`// Retain the photograph's soft facial lighting while allowing the
        // model to respond to scene light. Avoid shading the baked shadows twice.
        outgoingLight=mix(outgoingLight,originalPhoto*1.15,mask*uIdentityReady*.65);
        #include <opaque_fragment>`);
  };
  mat.customProgramCacheKey=()=> 'zhiguo-original-photo-v8';return mat;
}

const sections=[[-.153,.004,-.043,.055],[-.131,.009,-.049,.047],
  [-.110,.044,-.075,.045],[-.092,.078,-.091,.052],[-.075,.094,-.102,.064],
  [-.050,.098,-.108,.075],[-.020,.099,-.112,.081],[.020,.098,-.111,.083],
  [.060,.096,-.102,.081],[.100,.078,-.081,.068],[.131,.037,-.040,.033],
  [.140,-.003,-.006,.0004]];
function section(y){
  let n=0;while(n<sections.length-2&&y>sections[n+1][0])n++;
  const a=sections[n],b=sections[n+1],prev=sections[Math.max(0,n-1)],next=sections[Math.min(sections.length-1,n+2)],d=b[0]-a[0],t=clamp01((y-a[0])/d);
  return [1,2,3].map(k=>{
    const ma=(b[k]-prev[k])/(b[0]-prev[0]),mb=(next[k]-a[k])/(next[0]-a[0]);
    return (2*t**3-3*t*t+1)*a[k]+(t**3-2*t*t+t)*d*ma+(-2*t**3+3*t*t)*b[k]+(t**3-t*t)*d*mb;
  });
}
function faceDepth(y,z){
  const [forward,,width]=section(y),c=Math.sqrt(Math.max(0,1-(z/width)**2));
  return -.018+(forward+.018)*c+smooth(c,.35,.75)*(.014*Math.exp(-(((y+.017)/.025)**2+(z/.014)**2))+.003*Math.exp(-(((y+.049)/.012)**2+(z/.037)**2)));
}
function headGeometry(){
  // Anatomical cross sections, with the reference's soft jaw and cheek width.
  // A single continuous facial surface avoids generic eye cavities and keeps
  // the photographed eyelids and smile attached to the same 3D skin.
  const pos=[],index=[],rows=64,sides=96;
  for(let row=0;row<=rows;row++){
    const y=-.153+row/rows*.293,[forward,back,width]=section(y);
    for(let side=0;side<=sides;side++){
      const a=side/sides*TAU,c=Math.cos(a),z=Math.sin(a)*width;
      let x=c>0?-.018+(forward+.018)*c:(back+.018)*(-c)-.018;
      const front=smooth(c,.35,.75);
      x+=front*(.014*Math.exp(-(((y+.017)/.025)**2+(z/.014)**2))
        +.003*Math.exp(-(((y+.049)/.012)**2+(z/.037)**2)));
      pos.push(x,y,z);
      if(row<rows&&side<sides){const k=row*(sides+1)+side;index.push(k,k+sides+1,k+1,k+1,k+sides+1,k+sides+2);}
    }
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setIndex(index);g.computeVertexNormals();
  const original=new THREE.BufferGeometry();original.setAttribute('position',new THREE.Float32BufferAttribute(ANATOMY.head.positions,3));original.setIndex(ANATOMY.head.indices);original.computeVertexNormals();
  const earPositions=[],earNormals=[];
  for(let i=0;i<ANATOMY.head.indices.length;i+=3){
    const points=[0,1,2].map(k=>ANATOMY.head.positions.slice(ANATOMY.head.indices[i+k]*3,ANATOMY.head.indices[i+k]*3+3));
    if(points.some(p=>Math.abs(p[2])>.087)&&points.every(p=>p[0]<.040&&p[0]>-.050&&p[1]<.042&&p[1]>-.055)){
      earPositions.push(...points.flat());for(let k=0;k<3;k++){const v=ANATOMY.head.indices[i+k];earNormals.push(original.attributes.normal.getX(v),original.attributes.normal.getY(v),original.attributes.normal.getZ(v));}
    }
  }
  const ears=new THREE.BufferGeometry();ears.setAttribute('position',new THREE.Float32BufferAttribute(earPositions,3));ears.setAttribute('normal',new THREE.Float32BufferAttribute(earNormals,3));ears.setIndex(Array.from({length:earPositions.length/3},(_,i)=>i));
  return mergeGeometries([g,ears]);
}
const clamp01=t=>THREE.MathUtils.clamp(t,0,1);

export function createIdentityHead({mesh,tube,ellipsoid}){
  const head=new THREE.Group();head.name='zhiguo-original-photo-volumetric-head';head.position.set(.002,.635,0);
  const faceMat=identityMaterial(),skull=mesh(headGeometry(),faceMat,head);skull.name='identity-shaped-anatomical-head-and-neck';skull.receiveShadow=false;
  const hair=createLooseHair({head,skull,mesh});
  const wire=new THREE.MeshStandardMaterial({color:'#786f5c',metalness:.55,roughness:.4});
  const pearl=new THREE.MeshStandardMaterial({color:'#ece5d1',roughness:.35,metalness:.12});
  // The real photographed rims follow the 3D facial surface. Separate temple
  // arms add depth from the side without duplicating the frontal frame outline.
  for(const side of [1,-1]){
    tube([[faceDepth(.024,side*.075)+.001,.024,side*.075],[.015,.026,side*.091],[-.027,.022,side*.090]],.00055,wire,head);
    tube([[-.018,-.010,side*.091],[-.013,-.031,side*.092],[-.006,-.059,side*.091]],.00045,wire,head);
    ellipsoid(head,pearl,[-.011,-.034,side*.092],[.0032,.0038,.0032]);
    ellipsoid(head,pearl,[-.005,-.061,side*.091],[.0044,.0052,.0044]);
  }
  const mouth=new THREE.Object3D();mouth.position.set(.109,-.046,0);head.add(mouth);
  return {head,skull,mouth,hair,faceMat,setPhoto(texture){faceMat.userData.identityUniforms.uIdentity.value=texture;faceMat.userData.identityUniforms.uIdentityReady.value=1;}};
}
