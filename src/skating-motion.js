const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smooth = x => { x = clamp(x, 0, 1); return x * x * x * (10 + x * (-15 + 6 * x)); };
const mix = (a, b, t) => a + (b - a) * t;
const TAU = Math.PI * 2;

// One cycle contains a right and a left stroke. Each skate first supports,
// then pushes sideways, lifts for recovery, and sets down pointing forwards.
export function skateFoot(phase, width, activity = 1) {
  phase = ((phase % 1) + 1) % 1;
  let out = 0, lift = 0, fore = 0.045, stage = 'glide';
  if (phase < 0.42) {
    fore = mix(0.045, -0.025, smooth(phase / 0.42));
  } else if (phase < 0.72) {
    const q = smooth((phase - 0.42) / 0.30);
    out = width * q; fore = mix(-0.025, -0.145, q); stage = 'push';
  } else if (phase < 0.94) {
    const q = (phase - 0.72) / 0.22;
    out = width * (1 - smooth(q));
    fore = mix(-0.145, 0.045, smooth(q));
    lift = Math.sin(Math.PI * q) ** 2 * 0.065; stage = 'recover';
  } else stage = 'set-down';
  lift *= activity;
  return { phase, out: out * activity, fore: fore * activity, lift, stage,
    contact: lift < 0.002, bank: 0.065 * out / Math.max(width, 0.01) * activity,
    toeAngle: 0.23 * out / Math.max(width, 0.01) * activity };
}

export function createSkatingMotion() {
  const state = { phase: 0, activity: 0, crouch: 0.035, landing: 0, landingTime: 10, wasAirborne: false, balanceReady: false, balanceAmount: 0,
    right: skateFoot(0, 0), left: skateFoot(0.5, 0), mode: 'glide', supportFoot: 'right', cadenceSpm: 0,
    shift: 0, armSwing: 0, bodyDip: 0.035, hipHeight: 0.90 };
  function update(dt, ctx) {
    const speed = ctx.speed ?? 0;
    const air = !!ctx.airborne;
    if(((ctx.trick??0)<=0.01&&state.balanceAmount<0.0035)||air)state.balanceReady=false;
    const effort = !air && !state.balanceReady && ctx.pedal > 0.5 && speed > 0.4 ? 1 : 0;
    state.activity = mix(state.activity, effort, 1 - Math.exp(-5 * dt));
    const frequency = clamp(0.40 + speed * 0.035, 0.42, 0.9) * (1.08 - (ctx.rhythm ?? 2) * 0.04);
    state.phase = (state.phase + dt * frequency * state.activity * (state.balanceReady?0:1)) % 1;
    if (state.wasAirborne && !air) state.landingTime = 0;
    state.wasAirborne = air;
    state.landingTime+=dt;
    const impact=state.landingTime/0.10;
    state.landing=impact<10?impact*Math.exp(1-impact):0;
    const width = clamp(0.145 + speed * 0.004, 0.145, 0.215);
    state.right = skateFoot(state.phase, width, state.activity);
    state.left = skateFoot(state.phase + 0.5, width, state.activity);
    state.supportFoot = state.phase < 0.5 ? 'right' : 'left';
    state.mode = air ? 'jump' : effort ? 'stride' : speed > 0.2 ? 'coast' : 'stand';
    state.cadenceSpm = air ? 0 : frequency * 120 * state.activity;
    state.crouch = mix(state.crouch, 0.025 + clamp(speed / 15, 0, 1) * 0.045 + (ctx.trick ?? 0) * 0.015, 1 - Math.exp(-6 * dt));
    const weight = Math.sin(state.phase * TAU) * state.activity;
    state.shift = 0.072 * weight + clamp(ctx.lean??0,-0.28,0.28)*0.12;
    state.armSwing = 0.11 * weight;
    const extension = Math.max(state.right.out,state.left.out)/Math.max(width,0.01);
    state.bodyDip = state.crouch + 0.008 * (1 - Math.cos(state.phase * TAU * 2)) * state.activity
      + 0.035 * extension * extension + 0.045 * state.landing;
    if (air) for (const foot of [state.right, state.left]) {
      // Tuck follows jump height, so take-off and landing do not snap the feet.
      const tuck = ctx.airHeight === undefined ? 1 : smooth((ctx.airHeight ?? 0) / 0.22);
      foot.out *= 1 - tuck; foot.fore *= 1 - tuck;
      foot.lift *= 1 - tuck; foot.lift += 0.065 * tuck;
      foot.contact = false; foot.bank *= 1 - tuck; foot.toeAngle *= 1 - tuck;
    }
    // Begin the balance only after the support skate has naturally landed.
    // Freezing this phase avoids planting a recovering skate in one frame.
    if((ctx.trick??0)>0.01&&!air&&state.right.contact)state.balanceReady=true;
    state.balanceAmount=mix(state.balanceAmount,state.balanceReady?(ctx.trick??0):0,1-Math.exp(-6*dt));
    if (state.balanceReady && !air) {
      const balance=state.balanceAmount;
      state.right.lift = 0; state.right.contact = true;
      state.right.out *= 1 - balance;
      state.left.lift += 0.16 * balance; state.left.out *= 1 - balance;
      state.left.contact = false; state.supportFoot = 'right';
      state.mode = 'balance'; state.cadenceSpm = 0;
      state.armSwing *= 1 - balance;
      state.shift = mix(state.shift, 0.10, balance);
      state.right.fore *= 1 - balance; state.left.fore = mix(state.left.fore, -0.07, balance);
      state.right.bank *= 1 - balance; state.right.toeAngle *= 1 - balance;
    }
    state.hipHeight = 0.935 - state.bodyDip;
    return state;
  }
  return { state, update };
}
