import * as THREE from 'three';
import { createSkatingMotion } from './skating-motion.js';
import { createPhotographicRig } from './zhiguo-rig.js';

// Photographic eight-direction impostor, not a scanned 3D human model.
const DIRECTIONS = ['正面', '右前方', '右侧面', '右后方', '背面', '左后方', '左侧面', '左前方'];
const TAU = Math.PI * 2;

export function createZhiguo() {
  const root = new THREE.Group(); root.name = 'zhiguo-photographic-skater';
  const body = new THREE.Group(); root.add(body);
  const head = new THREE.Object3D(); head.position.set(0.02, 1.72, 0); root.add(head);
  const knot = new THREE.Object3D(); knot.position.set(0.02, 1.55, 0); root.add(knot);
  const mouth = new THREE.Object3D(); mouth.position.set(0.24, 1.43, 0); root.add(mouth);
  const state = { ready: false, error: null, direction: 0, directionLabel: DIRECTIONS[0], phase: 0, cheer: 0, collect: 0 };
  const motion = createSkatingMotion();
  const rig = createPhotographicRig();
  let poseContext = { speed: 0, trick: 0 };
  const uniforms = {
    uMapA: { value: null },
    uCell: { value: new THREE.Vector2() },
    uLight: { value: 1 },
    uBones: { value: rig.matrices },
  };
  const material = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: true, side: THREE.DoubleSide,
    vertexShader: `
      varying vec2 vUv;
      varying float vMask;
      uniform mat3 uBones[11];
      attribute vec4 aBone, aWeight;
      attribute float aMask;
      void main() {
        vUv = uv;
        vMask = aMask;
        vec3 source = vec3(position.xy, 1.0);
        vec3 deformed = uBones[int(aBone.x)] * source * aWeight.x
          + uBones[int(aBone.y)] * source * aWeight.y
          + uBones[int(aBone.z)] * source * aWeight.z
          + uBones[int(aBone.w)] * source * aWeight.w;
        vec3 p = vec3(deformed.xy, position.z);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      varying float vMask;
      uniform sampler2D uMapA;
      uniform vec2 uCell;
      uniform float uLight;
      void main() {
        vec2 atlasUv = (vUv + uCell) / vec2(4.0, 2.0);
        vec4 a = texture2D(uMapA, atlasUv);
        if (vMask < 0.5) discard;
        float opacity = a.a;
        if (opacity < 0.035) discard;
        vec3 rgb = a.rgb;
        gl_FragColor = vec4(rgb * uLight, opacity);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const portrait = new THREE.Group();
  const layers = rig.geometries[0].map(geometry => new THREE.Mesh(geometry,material));
  portrait.add(...layers);
  portrait.position.y = 0.96; portrait.visible = false; body.add(portrait);

  const shadowCanvas = document.createElement('canvas'); shadowCanvas.width = shadowCanvas.height = 64;
  const c = shadowCanvas.getContext('2d');
  const gradient = c.createRadialGradient(32, 32, 1, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(0,0,0,0.35)'); gradient.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = gradient; c.fillRect(0, 0, 64, 64);
  const shadowMaterial = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(shadowCanvas), transparent: true, depthWrite: false });
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 0.72), shadowMaterial);
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.022; root.add(shadow);

  const loader = new THREE.TextureLoader();
  const ready = loader.loadAsync('./assets/zhiguo-atlas-a.webp').then(a => {
    for (const texture of [a]) {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 4; texture.generateMipmaps = true;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
    }
    uniforms.uMapA.value = a;
    state.ready = true; portrait.visible = true;
  }).catch(error => {
    state.error = '角色图片加载失败';
    throw error;
  });
  const cameraLocal = new THREE.Vector3();

  function orient(camera, hide = false) {
    if (!camera) return;
    root.updateWorldMatrix(true, false);
    camera.getWorldPosition(cameraLocal); root.worldToLocal(cameraLocal);
    const angle = (Math.atan2(cameraLocal.z, cameraLocal.x) + TAU) % TAU;
    const index = Math.round(angle / TAU * 8) % 8;
    state.direction = index; state.directionLabel = DIRECTIONS[index];
    layers.forEach((mesh,part)=>{mesh.geometry = rig.geometries[index][part];});
    rig.pose(index, motion.state, poseContext);
    uniforms.uCell.value.set(index % 4, 1 - Math.floor(index / 4));
    body.rotation.y = Math.atan2(cameraLocal.x, cameraLocal.z);
    portrait.visible = state.ready && !hide;
  }

  function update(dt, ctx) {
    poseContext = ctx;
    motion.update(dt, ctx);
    state.phase = motion.state.phase;
    state.cadenceSpm = motion.state.cadenceSpm;
    state.gait = motion.state;
    state.cheer = Math.max(0, state.cheer - dt); state.collect = Math.max(0, state.collect - dt);
    uniforms.uLight.value = 1 - (ctx.night ?? 0) * 0.3;
    body.position.y = Math.sin(state.cheer * Math.PI) * 0.015;
    portrait.rotation.z = 0;
    shadow.scale.setScalar(ctx.airborne ? 0.65 : 1);
    shadowMaterial.opacity = ctx.airborne ? 0.4 : 0.85;
    mouth.position.y = 1.43 + body.position.y - motion.state.bodyDip;
  }
  return { root, body, head, knot, mouth, hitMeshes: layers, update, orient, ready, state, rig,
    honk() { state.cheer = 1; }, gulp() { state.collect = 0.4; } };
}
