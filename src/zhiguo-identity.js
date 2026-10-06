import * as THREE from 'three';
import {mergeGeometries,mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';
import {ANATOMY} from './anatomical-mesh.js';
import {createBraidedHair} from './zhiguo-braids.js';

// Reuse the exact frontal portrait from the version selected by the user.
// Its photographed glasses, eyes and smile remain together on one surface.
export const IDENTITY_PHOTO={asset:'zhiguo-front.webp',width:480,height:560,
  landmarks:{hairline:[240,67],eyes:[240,88],nose:[240,102],mouth:[240,113],chin:[240,128]},
  method:'restored-v4-portrait-on-volumetric-anatomy'};
const TAU=Math.PI*2,smooth=THREE.MathUtils.smoothstep;

export function identityMaterial(){
  const mat=new THREE.MeshStandardMaterial({color:'#c59678',roughness:.82});
  const uniforms={uIdentity:{value:null},uIdentityReady:{value:0}};mat.userData.identityUniforms=uniforms;
  mat.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,uniforms);
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vIdentityPosition;')
      .replace('#include <begin_vertex>','#include <begin_vertex>\nvIdentityPosition=position;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
      varying vec3 vIdentityPosition;uniform sampler2D uIdentity;uniform float uIdentityReady;
      vec2 photoRow(float y){
        if(y>.090)return vec2(240.,mix(67.,51.,(y-.090)/.050));
        if(y>.026)return vec2(240.,mix(88.,67.,(y-.026)/.064));
        if(y>-.018)return vec2(240.,mix(102.,88.,(y+.018)/.044));
        if(y>-.049)return vec2(240.,mix(113.,102.,(y+.049)/.031));
        if(y<-.102)return vec2(240.,mix(128.,143.,clamp((-.102-y)/.043,0.,1.)));
        return vec2(240.,mix(128.,113.,clamp((y+.102)/.053,0.,1.)));
      }`)
      .replace('#include <color_fragment>',`#include <color_fragment>
        vec3 p=vIdentityPosition;vec2 pixel=photoRow(p.y);
        pixel.x-=p.z*315.;
        vec2 identityUv=vec2(pixel.x/480.,1.-pixel.y/560.);
        vec4 originalPhoto=texture2D(uIdentity,identityUv);
        float mask=smoothstep(.012,.065,p.x)*smoothstep(-.128,-.105,p.y)
          *(1.-smoothstep(.106,.127,p.y));
        diffuseColor.rgb=mix(diffuseColor.rgb,originalPhoto.rgb,mask*uIdentityReady*originalPhoto.a);`);
  };
  mat.customProgramCacheKey=()=> 'zhiguo-restored-v4-face-v11';return mat;
}

const sections=[[-.153,.004,-.043,.055],[-.131,.009,-.049,.047],
  [-.110,.046,-.075,.036],[-.092,.070,-.091,.045],[-.075,.083,-.102,.056],
  [-.050,.092,-.108,.066],[-.020,.097,-.112,.074],[.020,.097,-.111,.076],
  [.060,.091,-.102,.074],[.100,.075,-.081,.062],[.131,.037,-.040,.033],
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
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setIndex(index);
  // The angular seam is at the middle of the face. Weld it before calculating
  // normals so the two cheeks cannot acquire different lighting at the nose.
  const closedHead=mergeVertices(g,1e-6);closedHead.computeVertexNormals();
  const original=new THREE.BufferGeometry();original.setAttribute('position',new THREE.Float32BufferAttribute(ANATOMY.head.positions,3));original.setIndex(ANATOMY.head.indices);original.computeVertexNormals();
  const earPositions=[],earNormals=[];
  for(let i=0;i<ANATOMY.head.indices.length;i+=3){
    const points=[0,1,2].map(k=>ANATOMY.head.positions.slice(ANATOMY.head.indices[i+k]*3,ANATOMY.head.indices[i+k]*3+3));
    if(points.some(p=>Math.abs(p[2])>.087)&&points.every(p=>p[0]<.040&&p[0]>-.050&&p[1]<.042&&p[1]>-.055)){
      earPositions.push(...points.flat());for(let k=0;k<3;k++){const v=ANATOMY.head.indices[i+k];earNormals.push(original.attributes.normal.getX(v),original.attributes.normal.getY(v),original.attributes.normal.getZ(v));}
    }
  }
  const ears=new THREE.BufferGeometry();ears.setAttribute('position',new THREE.Float32BufferAttribute(earPositions,3));ears.setAttribute('normal',new THREE.Float32BufferAttribute(earNormals,3));ears.setIndex(Array.from({length:earPositions.length/3},(_,i)=>i));
  return mergeGeometries([closedHead,ears]);
}
const clamp01=t=>THREE.MathUtils.clamp(t,0,1);

export function createIdentityHead({mesh,tube,ellipsoid}){
  const head=new THREE.Group();head.name='zhiguo-restored-portrait-volumetric-head';head.position.set(.002,.635,0);
  const faceMat=identityMaterial(),skull=mesh(headGeometry(),faceMat,head);skull.name='identity-shaped-anatomical-head-and-neck';skull.receiveShadow=false;
  const hair=createBraidedHair({head,skull,mesh});
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
