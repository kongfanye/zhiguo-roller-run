import * as THREE from 'three';
import { solveTwoBone, placeBetween, unitCylinder, mulberry32 } from './util.js';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {batchStaticMeshes} from './mesh-batching.js';
import {SKIN_COLOR} from './zhiguo-identity.js';

// Zhiguo's legs and lower outfit as in her skating photo: slim legs, very dark
// high-waisted denim shorts ending mid-thigh, thick white socks slouched over
// the boot cuffs, and black inline skates with a white, red-trimmed lower shell
// and cream wheels.
export const LEG_LENGTHS = { thigh: 0.35, shin: 0.34 };
const FLOOR = 0.03, WHEEL_RADIUS = 0.037, WHEEL_HALF_WIDTH = 0.011, LIFT = WHEEL_RADIUS - 0.032;
const TAU = Math.PI * 2, smooth = THREE.MathUtils.smoothstep;
const curve1 = points => x => {
  let n = 0; while (n < points.length - 2 && x > points[n + 1][0]) n++;
  const [x0, y0] = points[n], [x1, y1] = points[n + 1], t = THREE.MathUtils.clamp((x - x0) / (x1 - x0), 0, 1);
  return y0 + (y1 - y0) * t * t * (3 - 2 * t);
};

// ------------------------------------------------------------------ legs
// Radius along the leg, from the hip joint (0) through the knee (0.35) to the
// ankle (0.69): slim adult-female thigh, knee, calf and ankle.
const LEG_RADIUS = curve1([[-.04,.084],[0,.083],[.06,.079],[.12,.073],[.18,.068],[.25,.062],[.30,.057],[.335,.054],
  [.36,.052],[.40,.050],[.45,.050],[.50,.048],[.56,.043],[.61,.038],[.65,.034],[.69,.031],[.72,.031]]);
const KNEE = LEG_LENGTHS.thigh, ANKLE = LEG_LENGTHS.thigh + LEG_LENGTHS.shin;
// Cross-section at distance s along the leg and angle a (0 front, PI/2 lateral,
// PI back, 3PI/2 medial): thighs a little wider than deep, a kneecap, a calf
// that bulges at the back and inside, and a flatter shin bone in front.
function legRadius(s, a) {
  const c = Math.cos(a), back = Math.max(0, -c), front = Math.max(0, c);
  let r = LEG_RADIUS(s) * (1 - .035 * Math.cos(2 * a) * smooth(s, 0, .1) * (1 - smooth(s, .28, .34)));
  r += .0055 * Math.exp(-(((s - KNEE + .006) / .020) ** 2)) * front ** 2;
  r -= .0035 * Math.exp(-(((s - KNEE - .012) / .022) ** 2)) * back ** 2;
  const u = (s - KNEE) / LEG_LENGTHS.shin, calf = Math.exp(-(((u - .30) / .15) ** 2)) * Math.max(0, -Math.cos(a - .35)) ** 1.5;
  r += .0105 * calf * smooth(s, KNEE, KNEE + .03);
  r *= 1 - .06 * front * smooth(u, .05, .2) * (1 - smooth(u, .75, .95));
  return r;
}
function legBind(side, sFrom, sTo, rows, sides, radius, {lateralShift = () => 0} = {}) {
  const pos = [], uv = [], idx = [], dist = [];
  for (let i = 0; i <= rows; i++) {
    const s = sFrom + (sTo - sFrom) * i / rows;
    for (let j = 0; j <= sides; j++) {
      const a = j / sides * TAU, r = radius(s, a);
      // Local frame: +x forward, +y up the leg, z = side * lateral.
      pos.push(r * Math.cos(a), -s, side * (r * Math.sin(a) + lateralShift(s)));
      uv.push(j / sides, (s - sFrom) / (sTo - sFrom)); dist.push(s);
      if (i < rows && j < sides) { const k = i * (sides + 1) + j, n = k + sides + 1; if (side > 0) idx.push(k, k + 1, n, k + 1, n + 1, n); else idx.push(k, n, k + 1, k + 1, n, n + 1); }
    }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  g.attributes.position.setUsage(THREE.DynamicDrawUsage);
  return { geometry: g, bind: new Float32Array(pos), dist: new Float32Array(dist) };
}

// ------------------------------------------------------------------ textures
function dataTexture(size, pixel, { wrapT = THREE.RepeatWrapping, srgb = true } = {}) {
  const [w, h] = Array.isArray(size) ? size : [size, size], data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data.set([...pixel(x, y).map(c => THREE.MathUtils.clamp(Math.round(c), 0, 255)), 255], (y * w + x) * 4);
  const t = new THREE.DataTexture(data, w, h); if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping; t.wrapT = wrapT; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true; t.anisotropy = 8; t.needsUpdate = true; return t;
}
// Very dark indigo denim twill; light topstitching rows near the hem (v < .1).
export function denimTexture(hemStitches = true) {
  const rnd = mulberry32(11), noise = Array.from({ length: 256 * 256 }, () => rnd());
  return dataTexture([256, 256], (x, y) => {
    const twill = ((x + y) % 4 < 2 ? 6 : -4) + (noise[y * 256 + x] - .5) * 9 + 4 * Math.sin(x * .07 + y * .04);
    if (hemStitches && (y === 6 || y === 16) && x % 5 < 3) return [150, 140, 120];
    return [28 + twill, 33 + twill, 46 + twill * 1.2];
  }, { wrapT: hemStitches ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping });
}
// Thick knit: fine vertical ribs.
function knitTexture() {
  return dataTexture([64, 64], (x, y) => { const rib = x % 4 < 2 ? 246 : 226, k = (y % 3 === 0 ? -6 : 0); return [rib + k, rib + k, rib - 4 + k]; });
}

// ------------------------------------------------------------------ skates
// Low hard shell from heel to toe. Each cross-section is a squircle, so the
// boot reads as a rigid shell with a rounded toe box rather than a soft blob.
const SHELL_TOP = curve1([[-.112,.190],[-.060,.207],[.010,.200],[.070,.166],[.128,.134]]);
const SHELL_WIDTH = curve1([[-.112,.036],[-.060,.043],[0,.046],[.060,.050],[.100,.046],[.128,.034]]);
function shellPoint(x, a, out = new THREE.Vector3(), grow = 0) {
  const heel = -.114, toe = .130, bottom = .099 + LIFT, t = (x - heel) / (toe - heel);
  const end = Math.min(1, t / .09, (1 - t) / .15), round = Math.sqrt(Math.max(0, 1 - (1 - end) ** 2));
  const top = SHELL_TOP(x) + LIFT, half = (top - bottom) / 2, centre = bottom + half, c = Math.cos(a), s = Math.sin(a), n = 2 / 3;
  const y = centre + Math.sign(c) * Math.abs(c) ** n * (half + grow) * (c > 0 ? round : 1);
  const z = Math.sign(s) * Math.abs(s) ** n * (SHELL_WIDTH(x) + grow) * round;
  return out.set(x, Math.max(bottom - .002, y), z);
}
function shellGeometry() {
  const rows = 44, sides = 32, pos = [], uv = [], idx = [], p = new THREE.Vector3();
  for (let i = 0; i <= rows; i++) {
    const x = -.114 + .244 * i / rows;
    for (let j = 0; j <= sides; j++) {
      shellPoint(x, j / sides * TAU, p); pos.push(p.x, p.y, p.z); uv.push(j / sides, i / rows);
      if (i < rows && j < sides) { const k = i * (sides + 1) + j, m = k + sides + 1; idx.push(k, k + 1, m, k + 1, m + 1, m); }
    }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
// The white lower shell wraps the sides and heel up to this line, higher at the
// heel; above it the boot is black, and a thin red stripe runs along the edge.
const SHELL_BOTTOM = .099 + LIFT;
const trimHeight = x => THREE.MathUtils.lerp(SHELL_BOTTOM, SHELL_TOP(x) + LIFT, .40 + .22 * smooth(-x, -.02, .09));
function shellLine(sideZ) {
  const pts = [], p = new THREE.Vector3();
  for (let i = 0; i <= 30; i++) {
    const x = -.112 + .238 * i / 30, target = trimHeight(x);
    // Find the point on this side of the shell at the trim height.
    let lo = 0, hi = Math.PI / 2;
    for (let n = 0; n < 20; n++) { const mid = (lo + hi) / 2; if (shellPoint(x, mid, p).y > target) lo = mid; else hi = mid; }
    shellPoint(x, Math.sign(sideZ) > 0 ? lo : -lo, p, .0014); p.z *= 1.02; p.x *= 1.006; pts.push(p.clone());
  }
  return new THREE.CatmullRomCurve3(pts);
}
function soleGeometry() {
  const shape = new THREE.Shape(), heel = -.116, toe = .132, steps = 30, outline = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, x = heel + (toe - heel) * t;
    const end = Math.min(1, t / .09, (1 - t) / .15), round = Math.sqrt(Math.max(0, 1 - (1 - end) ** 2));
    outline.push([x, SHELL_WIDTH(Math.min(.128, Math.max(-.112, x))) * .9 * Math.max(round, .35)]);
  }
  outline.forEach(([x, w], i) => i ? shape.lineTo(x, w) : shape.moveTo(x, w));
  for (let i = outline.length - 1; i >= 0; i--) shape.lineTo(outline[i][0], -outline[i][1]);
  const g = new THREE.ExtrudeGeometry(shape, { depth: .010, bevelEnabled: true, bevelThickness: .002, bevelSize: .002, bevelSegments: 2, curveSegments: 4 });
  g.rotateX(Math.PI / 2); g.translate(0, .103 + LIFT, 0); g.computeVertexNormals(); return g;
}
// The boot's black cuff pivots at the ankle with the shin, like a real hinged cuff.
function cuffGeometry() {
  const profile = [[.050,0],[.051,.45],[.053,.86],[.056,.95],[.052,1],[.047,.97],[.045,.88],[.044,.62]].map(([r, y]) => new THREE.Vector2(r, y));
  return new THREE.LatheGeometry(profile, 32);
}

// ------------------------------------------------------------------ socks
// A thick white crew sock slouched into soft folds above the boot cuff.
function sockGeometry() {
  const pts = [[.000,.036],[.10,.040],[.20,.044],[.30,.048],[.40,.052],[.48,.0555],[.56,.0525],[.64,.0555],[.72,.053],[.80,.0555],[.88,.0535],[.95,.0525],[.985,.051],[1,.0485]];
  return new THREE.LatheGeometry(pts.map(([y, r]) => new THREE.Vector2(r, y)), 28);
}

export function createSkaterLegs() {
  const root = new THREE.Group(); root.name = 'anatomical-skating-legs';
  const hitMeshes = [];
  const skin = new THREE.MeshStandardMaterial({ color: SKIN_COLOR, roughness: 0.66 });
  const denim = new THREE.MeshStandardMaterial({ map: denimTexture(true), roughness: 0.92, side: THREE.DoubleSide });
  const sockMat = new THREE.MeshStandardMaterial({ map: knitTexture(), roughness: 1 });
  const shellMat = new THREE.MeshStandardMaterial({ color: '#ecebe7', roughness: 0.38 });
  const bootMat = new THREE.MeshStandardMaterial({ color: '#1a1b1f', roughness: 0.55 });
  const strapMat = new THREE.MeshStandardMaterial({ color: '#131417', roughness: 0.75 });
  const red = new THREE.MeshStandardMaterial({ color: '#c0262f', roughness: 0.45 });
  const frameMat = new THREE.MeshStandardMaterial({ color: '#16171b', metalness: 0.55, roughness: 0.42 });
  const metal = new THREE.MeshStandardMaterial({ color: '#9aa0a8', metalness: 0.75, roughness: 0.3 });
  const tire = new THREE.MeshStandardMaterial({ color: '#efe6cf', roughness: 0.7 });
  function mesh(geometry, material, parent = root) {
    const m = new THREE.Mesh(geometry, material); m.castShadow = true; m.receiveShadow = true; parent.add(m); hitMeshes.push(m); return m;
  }
  const pole = new THREE.Vector3(1, 0, 0);
  const legs = ['right', 'left'].map((name, i) => {
    const side = i === 0 ? 1 : -1;
    // One continuous skinned leg from inside the shorts to inside the boot.
    const legData = legBind(side, -.04, .70, 118, 28, legRadius);
    const leg = mesh(legData.geometry, skin); leg.name = `${name}-continuous-leg`; leg.frustumCulled = false;
    // Loose shorts leg, slightly A-line, ending mid-thigh in a stitched hem.
    const shortsRadius = (s, a) => THREE.MathUtils.lerp(.092, .078, smooth(s, 0, .17)) - .011 * Math.max(0, -Math.sin(a)) ** 2 + .003 * Math.exp(-(((s - .168) / .006) ** 2));
    const shortsData = legBind(side, -.05, .172, 26, 32, shortsRadius, { lateralShift: s => .006 });
    shortsData.geometry.attributes.uv.array.forEach((v, k, arr) => { if (k % 2) arr[k] = 1 - v; else arr[k] = v * 4; });
    const shorts = mesh(shortsData.geometry, denim); shorts.name = `${name}-denim-shorts-leg`; shorts.frustumCulled = false;
    const sock = mesh(sockGeometry(), sockMat); sock.name = `${name}-slouch-sock`;
    const bootCuff = mesh(cuffGeometry(), bootMat); bootCuff.name = `${name}-hinged-skate-cuff`;
    const cuffStrapProfile = [[.0575,.60],[.0585,.64],[.0585,.76],[.0575,.80]].map(([r, y]) => new THREE.Vector2(r, y));
    const cuffStrap = mesh(new THREE.LatheGeometry(cuffStrapProfile, 32), strapMat);
    const cuffBuckle = mesh(new RoundedBoxGeometry(.020, .014, .008, 2, .002), metal); cuffBuckle.name = 'cuff-buckle';
    const cuffLogo = mesh(new RoundedBoxGeometry(.004, .016, .024, 1, .001), red); cuffLogo.name = 'cuff-logo';
    const skate = new THREE.Group(); skate.name = `${name}-inline-skate`; skate.rotation.order = 'YXZ'; root.add(skate);
    // Black upper over the foot and a white lower shell trimmed with red.
    const upper = mesh(shellGeometry(), bootMat, skate); upper.name = 'black-skate-upper'; upper.scale.set(.985, 1, .97);
    const lower = mesh(shellGeometry(), shellMat, skate); lower.name = 'white-lower-shell';
    lower.geometry = lower.geometry.clone();
    { const p = lower.geometry.attributes.position, v = new THREE.Vector3();
      for (let k = 0; k < p.count; k++) { v.fromBufferAttribute(p, k);
        // Clip the white shell below the trim line; keep it slightly proud of the black upper.
        p.setXYZ(k, v.x * 1.006, Math.min(v.y, trimHeight(v.x)), v.z * 1.02); }
      lower.geometry.computeVertexNormals(); }
    for (const s of [1, -1]) mesh(new THREE.TubeGeometry(shellLine(s), 48, .0016, 6), red, skate).name = 'red-shell-trim';
    // Instep strap with a buckle, and laces over the toe box.
    const strap = mesh(new RoundedBoxGeometry(.034, .010, .108, 2, .004), strapMat, skate); strap.position.set(-.006, .192 + LIFT, 0); strap.rotation.z = -.32;
    const buckle = mesh(new RoundedBoxGeometry(.020, .014, .008, 2, .002), metal, skate); buckle.position.set(-.008, .186 + LIFT, side * .053); buckle.rotation.z = -.32;
    for (let n = 0; n < 4; n++) for (const s of [1, -1]) {
      const x0 = .028 + n * .017, x1 = x0 + .014, start = new THREE.Vector3(x0, SHELL_TOP(x0) + LIFT + .001, s * .024), end = new THREE.Vector3(x1, SHELL_TOP(x1) + LIFT + .001, -s * .024);
      const lace = mesh(unitCylinder(.0015, .0015, 6), strapMat, skate); placeBetween(lace, start, end);
    }
    mesh(soleGeometry(), strapMat, skate).name = 'skate-sole';
    // Black frame rails hold the axles of four cream wheels with dark hubs.
    for (const s of [1, -1]) {
      const rail = mesh(new RoundedBoxGeometry(0.248, 0.030, 0.004, 2, .0015), frameMat, skate); rail.position.set(0.002, 0.070 + LIFT, s * 0.0140);
    }
    const bridge = mesh(new RoundedBoxGeometry(0.200, 0.008, 0.032, 2, .003), frameMat, skate); bridge.position.set(0.004, 0.088 + LIFT, 0);
    const wheels = [];
    for (const x of [-0.104, -0.035, 0.035, 0.104]) {
      const axle = new THREE.Group(); axle.position.set(x, WHEEL_RADIUS, 0); skate.add(axle);
      const wheel = mesh(new THREE.CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, WHEEL_HALF_WIDTH * 2, 28), tire, axle);
      wheel.rotation.x = Math.PI / 2;
      const hub = mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.024, 16), frameMat, axle); hub.rotation.x = Math.PI / 2;
      const bolt = mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.034, 8), metal, axle); bolt.rotation.x = Math.PI / 2;
      wheels.push(axle);
    }
    batchStaticMeshes(skate, new Set(), hitMeshes);
    return { name, side, leg, legData, shorts, shortsData, sock, bootCuff, cuffStrap, cuffBuckle, cuffLogo, skate, wheels,
      hip: new THREE.Vector3(), knee: new THREE.Vector3(), ankle: new THREE.Vector3(), target: new THREE.Vector3(),
      bootBottom: new THREE.Vector3(), bootTop: new THREE.Vector3(), shinAxis: new THREE.Vector3(), sockTop: new THREE.Vector3() };
  });
  const state = { rightSoleHeight: FLOOR, leftSoleHeight: FLOOR, kneeBend: 0, joints: {}, maxReachError: 0, pelvis: new THREE.Matrix4() };
  // Bone frames: +y up along the bone, +x towards the knee's pole (forward).
  const mPelvis = new THREE.Matrix4(), mThigh = new THREE.Matrix4(), mShin = new THREE.Matrix4(), mCuff = new THREE.Matrix4();
  const X = new THREE.Vector3(), Y = new THREE.Vector3(), Z = new THREE.Vector3(), t0 = new THREE.Vector3(), t1 = new THREE.Vector3(), t2 = new THREE.Vector3(), b = new THREE.Vector3();
  function frame(m, origin, up, offsetY = 0) {
    Y.copy(up).normalize(); X.copy(pole).addScaledVector(Y, -pole.dot(Y)).normalize(); Z.crossVectors(X, Y);
    m.makeBasis(X, Y, Z); m.setPosition(origin.x - Y.x * offsetY, origin.y - Y.y * offsetY, origin.z - Y.z * offsetY);
    return m;
  }
  // Linear-blend skinning across pelvis, thigh and shin frames.
  function skinLeg(data, attr, weights) {
    const bind = data.bind, dist = data.dist, out = attr.array;
    for (let k = 0; k < dist.length; k++) {
      const [wp, ws] = weights(dist[k]), wt = 1 - wp - ws;
      b.set(bind[k * 3], bind[k * 3 + 1], bind[k * 3 + 2]);
      t0.copy(b).applyMatrix4(mPelvis); t1.copy(b).applyMatrix4(mThigh); t2.copy(b).applyMatrix4(mShin);
      out[k * 3] = t0.x * wp + t1.x * wt + t2.x * ws; out[k * 3 + 1] = t0.y * wp + t1.y * wt + t2.y * ws; out[k * 3 + 2] = t0.z * wp + t1.z * wt + t2.z * ws;
    }
    attr.needsUpdate = true;
  }
  const legWeights = s => [1 - smooth(s, -.02, .12), smooth(s, KNEE - .045, KNEE + .035)];
  const shortsWeights = s => [1 - smooth(s, -.02, .13), 0];
  const down = new THREE.Vector3(), yawAxis = new THREE.Vector3(0, 1, 0), q = new THREE.Quaternion();
  function pose(motion, ctx = {}, dt = 0) {
    const hipHeight = motion.hipHeight ?? 0.935 - motion.bodyDip;
    const hipYaw = motion.pelvisYaw ?? 0;
    state.pelvis.makeRotationY(hipYaw).setPosition(-0.025, hipHeight, motion.shift);
    state.kneeBend = 0; state.maxReachError = 0;
    for (const leg of legs) {
      const { name, side, hip, knee, ankle, target, skate } = leg, foot = motion[name];
      const bank = side * (foot.bank ?? 0);
      skate.position.set(foot.fore ?? 0, FLOOR + foot.lift + WHEEL_HALF_WIDTH * Math.abs(Math.sin(bank)), side * (0.105 + foot.out));
      skate.rotation.set(bank, -side * (foot.toeAngle ?? 0), 0);
      skate.updateMatrix();
      target.set(-0.018, 0.223 + LIFT, 0).applyMatrix4(skate.matrix);
      hip.set(-0.025 + Math.sin(hipYaw) * side * 0.085, hipHeight, Math.cos(hipYaw) * side * 0.085 + motion.shift);
      solveTwoBone(hip, target, LEG_LENGTHS.thigh, LEG_LENGTHS.shin, pole, knee, ankle);
      state.maxReachError = Math.max(state.maxReachError, ankle.distanceTo(target));
      // The top of the leg and shorts stay with the pelvis; the rest follows the bones.
      q.setFromAxisAngle(yawAxis, hipYaw); mPelvis.makeRotationFromQuaternion(q).setPosition(hip);
      frame(mThigh, hip, down.subVectors(hip, knee));
      frame(mShin, knee, down.subVectors(knee, ankle), -KNEE);
      skinLeg(leg.legData, leg.leg.geometry.attributes.position, legWeights); leg.leg.geometry.computeVertexNormals();
      skinLeg(leg.shortsData, leg.shorts.geometry.attributes.position, shortsWeights); leg.shorts.geometry.computeVertexNormals();
      leg.shinAxis.subVectors(knee, ankle).normalize();
      leg.bootBottom.copy(ankle).addScaledVector(leg.shinAxis, -0.062); leg.bootTop.copy(ankle).addScaledVector(leg.shinAxis, 0.080);
      placeBetween(leg.bootCuff, leg.bootBottom, leg.bootTop); placeBetween(leg.cuffStrap, leg.bootBottom, leg.bootTop);
      // Buckle and logo ride on the outside of the cuff.
      frame(mCuff, leg.bootBottom, leg.shinAxis); X.setFromMatrixColumn(mCuff, 0); Y.setFromMatrixColumn(mCuff, 1); Z.setFromMatrixColumn(mCuff, 2);
      leg.cuffBuckle.position.copy(leg.bootBottom).addScaledVector(Y, .142 * .70).addScaledVector(Z, side * .060);
      leg.cuffBuckle.quaternion.setFromRotationMatrix(mCuff);
      leg.cuffLogo.position.copy(leg.bootBottom).addScaledVector(Y, .142 * .45).addScaledVector(Z, side * .052).addScaledVector(X, -.012);
      leg.cuffLogo.quaternion.copy(leg.cuffBuckle.quaternion);
      // The slouch sock rises from inside the boot to well above the cuff.
      leg.sockTop.copy(ankle).addScaledVector(leg.shinAxis, .165);
      placeBetween(leg.sock, ankle.clone().addScaledVector(leg.shinAxis, .02), leg.sockTop);
      for (const wheel of leg.wheels) wheel.rotation.z -= (ctx.speed ?? 0) * dt / WHEEL_RADIUS;
      state[name + 'SoleHeight'] = FLOOR + foot.lift;
      const upperDir = knee.clone().sub(hip).normalize(), lowerDir = ankle.clone().sub(knee).normalize();
      const bend = Math.acos(THREE.MathUtils.clamp(upperDir.dot(lowerDir), -1, 1));
      state.kneeBend = Math.max(state.kneeBend, bend);
      state.joints[name] = { hip: hip.toArray(), knee: knee.toArray(), ankle: ankle.toArray(), target: target.toArray(), bend };
    }
    return state;
  }
  return { root, legs, state, pose, hitMeshes, legRadius };
}
