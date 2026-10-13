import * as THREE from 'three';
import {mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';
import {createBraidedHair} from './zhiguo-braids.js';

// The face comes from the user's original high-resolution frontal photograph
// (tests/make-face-texture.py). It is resampled into head space at one uniform
// scale, so the projection needs no per-row warping: texture pixel =
// ((Z0 - z), (Y0 - y)) * PX_PER_M. Its alpha fades out the photographed hair.
export const IDENTITY_PHOTO={asset:'zhiguo-face-photo-v13.webp',source:'zhiguo-identity-v8.jpg',width:552,height:816,
  pxPerMeter:2625,z0:.105,y0:.150,
  landmarks:{pupils:[[651.7,321.6],[711.7,322.5]],mouth:[679,389],chin:[672,435],lensCentres:[[652,329],[720,330]]},
  method:'uniform-orthographic-photo-projection'};
// The forehead hairline measured from that photograph, shared by the face
// shader's contact shadow and the 3D hair cap.
export const PHOTO_HAIRLINE=z=>{z=Math.abs(z);return .108-.020*THREE.MathUtils.smoothstep(z,.010,.040)-.080*THREE.MathUtils.smoothstep(z,.030,.080);};
// The scalp shell stands off the skin, so its clipped edge rides up the sloped
// forehead; the edge is set this far below the photo hairline to compensate.
export const HAIR_EDGE_DROP=.008;
const TAU=Math.PI*2,smooth=THREE.MathUtils.smoothstep;

export function identityMaterial(){
  const mat=new THREE.MeshStandardMaterial({color:SKIN_COLOR,roughness:.78});
  const uniforms={uIdentity:{value:null},uIdentityReady:{value:0}};mat.userData.identityUniforms=uniforms;
  const {pxPerMeter,z0,y0,width,height}=IDENTITY_PHOTO,f=v=>v.toFixed(5);
  mat.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,uniforms);
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vIdentityPosition;')
      .replace('#include <begin_vertex>','#include <begin_vertex>\nvIdentityPosition=position;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
      varying vec3 vIdentityPosition;uniform sampler2D uIdentity;uniform float uIdentityReady;`)
      .replace('#include <color_fragment>',`#include <color_fragment>
        vec3 p=vIdentityPosition;
        vec2 identityUv=vec2((${f(z0)}-p.z)*${f(pxPerMeter/width)},1.-(${f(y0)}-p.y)*${f(pxPerMeter/height)});
        vec4 originalPhoto=texture2D(uIdentity,identityUv);
        float front=smoothstep(.0,.035,p.x);
        diffuseColor.rgb=mix(diffuseColor.rgb,originalPhoto.rgb,front*uIdentityReady*originalPhoto.a);
        // Soft contact shadow just below the hair edge (the same boundary as the
        // scalp in zhiguo-braids.js): forehead arch, sideburns, then the nape.
        float hz=abs(p.z),az=degrees(atan(hz,p.x+.005));
        float hairline=.108-.020*smoothstep(.010,.040,hz)-.080*smoothstep(.030,.080,hz)-${f(HAIR_EDGE_DROP)};
        float hairEdge=mix(mix(hairline,-.030,smoothstep(50.,82.,az)),-.084,smoothstep(95.,125.,az));
        diffuseColor.rgb*=mix(.62,1.,smoothstep(-.002,.020,hairEdge-p.y));`);
  };
  mat.customProgramCacheKey=()=> 'zhiguo-photo-face-v13';return mat;
}
// Matches the reference sheet's skin and the photo texture's color-matched edge.
export const SKIN_COLOR='#d4a088';

const sections=[[-.153,.004,-.043,.055],[-.131,.009,-.046,.047],
  [-.110,.046,-.055,.038],[-.092,.070,-.071,.046],[-.075,.083,-.090,.056],
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
  // The reference hair covers both ears in every view; omitting the hidden ear
  // meshes keeps them from poking through the swept locks as the head turns.
  return closedHead;
}
const clamp01=t=>THREE.MathUtils.clamp(t,0,1);

export function createIdentityHead({mesh,tube,ellipsoid}){
  const head=new THREE.Group();head.name='zhiguo-restored-portrait-volumetric-head';head.position.set(.002,.635,0);
  const faceMat=identityMaterial(),skull=mesh(headGeometry(),faceMat,head);skull.name='identity-shaped-anatomical-head-and-neck';skull.receiveShadow=false;
  const hair=createBraidedHair({head,skull,mesh,section});
  const rim=new THREE.MeshStandardMaterial({color:'#b59a64',metalness:.75,roughness:.32});
  const pearl=new THREE.MeshStandardMaterial({color:'#efe8d8',roughness:.35,metalness:.12});
  const gold=new THREE.MeshStandardMaterial({color:'#b8955a',metalness:.7,roughness:.35});
  // The real photographed rims follow the 3D facial surface. Separate temple
  // arms add depth from the side without duplicating the frontal frame outline.
  // Thin gold rims traced over the photographed rounded-square lenses (photo
  // rims x 625-679 / 695-745, y 305-354), lying just off the face so the
  // glasses read as crisp wire frames from every angle.
  const lenses=[[.0354,.0178,.0309,.0271,1],[-.0423,.0165,.0288,.0276,-1]].map(([centre,height,halfWidth,halfHeight,side])=>{
    const points=[];
    for(let n=0;n<64;n++){
      // Geometric frames: squarer above the lens center, rounder below it.
      const a=n/64*TAU,c=Math.cos(a),s=Math.sin(a),q=s>0?.62:.85,z=centre+halfWidth*Math.sign(c)*Math.abs(c)**q,y=height+halfHeight*Math.sign(s)*Math.abs(s)**q;
      points.push(new THREE.Vector3(faceDepth(y,z)+.0030,y,z));
    }
    head.add(Object.assign(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points,true),128,.00078,6,true),rim),{castShadow:true,name:'wire-glasses-rim'}));
    return {side,outer:centre+side*halfWidth,inner:centre-side*halfWidth};
  });
  tube([[faceDepth(.032,lenses[0].inner)+.0030,.032,lenses[0].inner],[faceDepth(.034,-.0046)+.0050,.034,-.0046],[faceDepth(.032,lenses[1].inner)+.0030,.032,lenses[1].inner]],.00078,rim,head);
  for(const {side,outer} of lenses){
    tube([[faceDepth(.030,outer)+.0030,.030,outer],[faceDepth(.030,outer)-.004,.030,outer+side*.008],[.012,.028,side*.0745],[-.024,.024,side*.0765]],.00065,rim,head);
    // Gold hooks hang from the lobes below the hair, each with a cream drop.
    tube([[.000,-.020,side*.093],[.002,-.032,side*.097],[.002,-.045,side*.098]],.00055,gold,head);
    ellipsoid(head,gold,[.002,-.046,side*.098],[.0016,.0016,.0016]);
    ellipsoid(head,pearl,[.002,-.0545,side*.098],[.0034,.0062,.0034]);
  }
  const mouth=new THREE.Object3D();mouth.position.set(.109,-.046,0);head.add(mouth);
  return {head,skull,mouth,hair,faceMat,setPhoto(texture){faceMat.userData.identityUniforms.uIdentity.value=texture;faceMat.userData.identityUniforms.uIdentityReady.value=1;}};
}
