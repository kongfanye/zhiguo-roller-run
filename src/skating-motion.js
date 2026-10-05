const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smooth = x => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const mix = (a, b, t) => a + (b - a) * t;
const TAU = Math.PI * 2;

// One cycle contains a right and a left stroke. Each skate first supports,
// then pushes sideways, lifts for recovery, and sets down pointing forwards.
export function skateFoot(phase, width, activity = 1) {
  phase = ((phase % 1) + 1) % 1;
  let out = 0, lift = 0, stage = 'glide';
  if (phase >= 0.5 && phase < 0.76) {
    out = width * smooth((phase - 0.5) / 0.26); stage = 'push';
  } else if (phase >= 0.76 && phase < 0.97) {
    const q = (phase - 0.76) / 0.21;
    out = width * (1 - smooth(q));
    lift = Math.sin(Math.PI * q) ** 2 * 0.105; stage = 'recover';
  } else if (phase >= 0.97) stage = 'set-down';
  return { phase, out: out * activity, lift: lift * activity, stage,
    contact: lift < 0.002, bank: -0.12 * out / Math.max(width, 0.01) * activity };
}

export function createSkatingMotion() {
  const state = { phase: 0, activity: 0, crouch: 0.035, landing: 0, wasAirborne: false,
    right: skateFoot(0, 0), left: skateFoot(0.5, 0), mode: 'glide', supportFoot: 'right', cadenceSpm: 0 };
  function update(dt, ctx) {
    const speed = ctx.speed ?? 0;
    const air = !!ctx.airborne;
    const effort = !air && ctx.pedal > 0.5 && speed > 0.4 ? 1 : 0;
    state.activity = mix(state.activity, effort, 1 - Math.exp(-5 * dt));
    const frequency = clamp(0.52 + speed * 0.045, 0.52, 1.22) * (1.1 - (ctx.rhythm ?? 2) * 0.06);
    state.phase = (state.phase + dt * frequency * state.activity) % 1;
    if (state.wasAirborne && !air) state.landing = 1;
    state.wasAirborne = air;
    state.landing *= Math.exp(-7 * dt);
    const width = clamp(0.17 + speed * 0.006, 0.17, 0.265);
    state.right = skateFoot(state.phase, width, state.activity);
    state.left = skateFoot(state.phase + 0.5, width, state.activity);
    state.supportFoot = state.phase < 0.5 ? 'right' : 'left';
    state.mode = air ? 'jump' : effort ? 'stride' : speed > 0.2 ? 'coast' : 'stand';
    state.cadenceSpm = air ? 0 : frequency * 120 * state.activity;
    state.crouch = mix(state.crouch, 0.025 + clamp(speed / 15, 0, 1) * 0.045 + (ctx.trick ?? 0) * 0.015, 1 - Math.exp(-6 * dt));
    const weight = Math.sin(state.phase * TAU) * state.activity;
    state.shift = 0.065 * weight;
    state.armSwing = 0.16 * weight;
    state.bodyDip = state.crouch + 0.05 * state.landing;
    if (air) for (const foot of [state.right, state.left]) {
      foot.out = 0.01; foot.lift = 0.09; foot.contact = false; foot.bank = 0;
    }
    if ((ctx.trick ?? 0) > 0.01 && !air) {
      state.right.lift = 0; state.right.contact = true;
      state.right.out *= 1 - ctx.trick;
      state.left.lift += 0.16 * ctx.trick; state.left.out *= 1 - ctx.trick;
      state.left.contact = false; state.supportFoot = 'right';
      state.mode = 'balance'; state.cadenceSpm = 0;
      state.armSwing *= 1 - ctx.trick;
    }
    return state;
  }
  return { state, update };
}
