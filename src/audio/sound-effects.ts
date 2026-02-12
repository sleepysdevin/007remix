/**
 * Procedural sound effects using Web Audio API.
 * No audio files needed — generates gunshot, reload, etc. from noise and oscillators.
 */

let audioCtx: AudioContext | null = null;
let soundPrewarmed = false;

function getAudioCtx(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  return audioCtx;
}

/**
 * Prewarm WebAudio graph to avoid first-shot / first-explosion hitch.
 * Safe to call repeatedly.
 */
export function prewarmSoundEffects(): void {
  const ctx = getAudioCtx();
  if (ctx.state === 'suspended') {
    void ctx.resume().catch(() => {});
  }
  if (soundPrewarmed) return;
  soundPrewarmed = true;

  const now = ctx.currentTime;
  const noise = makeNoise(ctx, 0.005, 2);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.setValueAtTime(1200, now);
  const dist = makeDistortion(ctx, 18);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.00001, now);
  noise.connect(hp);
  hp.connect(dist);
  dist.connect(gain);
  gain.connect(ctx.destination);
  noise.start(now);
  noise.stop(now + 0.006);

  // Warm oscillator/panner paths used by various effects.
  const osc = ctx.createOscillator();
  const og = ctx.createGain();
  og.gain.setValueAtTime(0.00001, now);
  const panner = ctx.createPanner();
  panner.panningModel = 'HRTF';
  panner.distanceModel = 'inverse';
  panner.refDistance = 1;
  panner.maxDistance = 30;
  osc.connect(og);
  og.connect(panner);
  panner.connect(ctx.destination);
  osc.frequency.setValueAtTime(440, now);
  osc.start(now);
  osc.stop(now + 0.006);

  // Warm the exact barrel explosion synthesis path once to avoid first-barrel hitch.
  prewarmBarrelExplosionPath(ctx, now);
}

function prewarmBarrelExplosionPath(ctx: AudioContext, startTime: number): void {
  const base = startTime + 0.02;

  const burst = makeNoise(ctx, 0.01, 4);
  const burstHp = ctx.createBiquadFilter();
  burstHp.type = 'highpass';
  burstHp.frequency.setValueAtTime(3000, base);
  const burstG = ctx.createGain();
  burstG.gain.setValueAtTime(0.00001, base);
  burst.connect(burstHp);
  burstHp.connect(burstG);
  burstG.connect(ctx.destination);
  burst.start(base);
  burst.stop(base + 0.012);

  const boom = makeNoise(ctx, 0.02, 2);
  const boomLp = ctx.createBiquadFilter();
  boomLp.type = 'lowpass';
  boomLp.frequency.setValueAtTime(1500, base);
  const boomDist = makeDistortion(ctx, 50);
  const boomG = ctx.createGain();
  boomG.gain.setValueAtTime(0.00001, base);
  boom.connect(boomLp);
  boomLp.connect(boomDist);
  boomDist.connect(boomG);
  boomG.connect(ctx.destination);
  boom.start(base);
  boom.stop(base + 0.022);

  const bass = ctx.createOscillator();
  const bassG = ctx.createGain();
  bass.frequency.setValueAtTime(70, base);
  bassG.gain.setValueAtTime(0.00001, base);
  bass.connect(bassG);
  bassG.connect(ctx.destination);
  bass.start(base);
  bass.stop(base + 0.02);
}

export type WeaponSoundType = 'pistol' | 'rifle' | 'shotgun' | 'sniper';

// ─── Shared helpers ───

function makeNoise(ctx: AudioContext, duration: number, decay = 3): AudioBufferSourceNode {
  const size = Math.ceil(ctx.sampleRate * duration);
  const buf = ctx.createBuffer(1, size, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < size; i++) {
    d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / size, decay);
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  return src;
}

function makeDistortion(ctx: AudioContext, amount = 20): WaveShaperNode {
  const ws = ctx.createWaveShaper();
  const c = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const x = (i * 2) / 256 - 1;
    c[i] = (Math.PI + amount) * x / (Math.PI + amount * Math.abs(x));
  }
  ws.curve = c;
  return ws;
}

// ─── Per-weapon sound synthesis ───

/** PP7 Pistol: short, tight snap — high-frequency crack with quick cutoff */
export function playGunshotPistol(): void {
  const ctx = getAudioCtx();
  const now = ctx.currentTime;

  // Sharp transient noise (very short)
  const noise = makeNoise(ctx, 0.06, 5);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.setValueAtTime(2000, now);
  hp.frequency.exponentialRampToValueAtTime(800, now + 0.04);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.35, now);
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
  noise.connect(hp);
  hp.connect(g);
  g.connect(ctx.destination);
  noise.start(now);
  noise.stop(now + 0.06);

  // Tiny mechanical click (slide action)
  const click = ctx.createOscillator();
  click.frequency.setValueAtTime(4000, now);
  click.frequency.exponentialRampToValueAtTime(1500, now + 0.02);
  const cg = ctx.createGain();
  cg.gain.setValueAtTime(0.12, now);
  cg.gain.exponentialRampToValueAtTime(0.001, now + 0.025);
  click.connect(cg);
  cg.connect(ctx.destination);
  click.start(now);
  click.stop(now + 0.03);

  // Light bass punch
  const bass = ctx.createOscillator();
  bass.frequency.setValueAtTime(200, now);
  bass.frequency.exponentialRampToValueAtTime(60, now + 0.04);
  const bg = ctx.createGain();
  bg.gain.setValueAtTime(0.2, now);
  bg.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
  bass.connect(bg);
  bg.connect(ctx.destination);
  bass.start(now);
  bass.stop(now + 0.06);
}

/** AR-style Rifle: aggressive crack + punchy mid-bass + bolt carrier slap */
export function playGunshotRifle(): void {
  const ctx = getAudioCtx();
  const now = ctx.currentTime;

  // 1. Initial sharp transient crack — the "snap" when the round breaks the sound barrier
  const crack = makeNoise(ctx, 0.025, 7);
  const crackHp = ctx.createBiquadFilter();
  crackHp.type = 'highpass';
  crackHp.frequency.setValueAtTime(4500, now);
  crackHp.frequency.exponentialRampToValueAtTime(1800, now + 0.015);
  const crackG = ctx.createGain();
  crackG.gain.setValueAtTime(0.5, now);
  crackG.gain.exponentialRampToValueAtTime(0.001, now + 0.025);
  crack.connect(crackHp);
  crackHp.connect(crackG);
  crackG.connect(ctx.destination);
  crack.start(now);
  crack.stop(now + 0.025);

  // 2. Main body — distorted mid-frequency blast (the concussive "bark")
  const body = makeNoise(ctx, 0.1, 3.5);
  const bodyBp = ctx.createBiquadFilter();
  bodyBp.type = 'bandpass';
  bodyBp.frequency.setValueAtTime(1800, now);
  bodyBp.frequency.exponentialRampToValueAtTime(400, now + 0.07);
  bodyBp.Q.value = 1.5;
  const bodyDist = makeDistortion(ctx, 45);
  const bodyG = ctx.createGain();
  bodyG.gain.setValueAtTime(0.4, now);
  bodyG.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
  body.connect(bodyBp);
  bodyBp.connect(bodyDist);
  bodyDist.connect(bodyG);
  bodyG.connect(ctx.destination);
  body.start(now);
  body.stop(now + 0.1);

  // 3. Punchy bass thump — felt in the chest
  const bass = ctx.createOscillator();
  bass.frequency.setValueAtTime(160, now);
  bass.frequency.exponentialRampToValueAtTime(45, now + 0.06);
  const bassG = ctx.createGain();
  bassG.gain.setValueAtTime(0.35, now);
  bassG.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
  bass.connect(bassG);
  bassG.connect(ctx.destination);
  bass.start(now);
  bass.stop(now + 0.09);

  // 4. Bolt carrier slap — short metallic rattle after main blast
  const bolt = makeNoise(ctx, 0.04, 5);
  const boltBp = ctx.createBiquadFilter();
  boltBp.type = 'bandpass';
  boltBp.frequency.setValueAtTime(3200, now + 0.02);
  boltBp.frequency.exponentialRampToValueAtTime(1200, now + 0.05);
  boltBp.Q.value = 4;
  const boltG = ctx.createGain();
  boltG.gain.setValueAtTime(0, now);
  boltG.gain.setValueAtTime(0.18, now + 0.02);
  boltG.gain.exponentialRampToValueAtTime(0.001, now + 0.055);
  bolt.connect(boltBp);
  boltBp.connect(boltG);
  boltG.connect(ctx.destination);
  bolt.start(now + 0.02);
  bolt.stop(now + 0.06);

  // 5. Sub-bass pressure wave — adds weight
  const sub = ctx.createOscillator();
  sub.frequency.setValueAtTime(55, now);
  sub.frequency.exponentialRampToValueAtTime(20, now + 0.05);
  const subG = ctx.createGain();
  subG.gain.setValueAtTime(0.2, now);
  subG.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
  sub.connect(subG);
  subG.connect(ctx.destination);
  sub.start(now);
  sub.stop(now + 0.07);
}

/** Shotgun: thunderous BOOM — heavy bass + wide noise + long tail */
export function playGunshotShotgun(): void {
  const ctx = getAudioCtx();
  const now = ctx.currentTime;

  // Wide noise burst (long, heavy)
  const noise = makeNoise(ctx, 0.25, 2);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(1200, now);
  lp.frequency.exponentialRampToValueAtTime(200, now + 0.15);
  const dist = makeDistortion(ctx, 40);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.5, now);
  g.gain.exponentialRampToValueAtTime(0.01, now + 0.22);
  noise.connect(lp);
  lp.connect(dist);
  dist.connect(g);
  g.connect(ctx.destination);
  noise.start(now);
  noise.stop(now + 0.25);

  // Heavy bass thump (deep boom)
  const bass = ctx.createOscillator();
  bass.frequency.setValueAtTime(80, now);
  bass.frequency.exponentialRampToValueAtTime(25, now + 0.15);
  const bg = ctx.createGain();
  bg.gain.setValueAtTime(0.6, now);
  bg.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
  bass.connect(bg);
  bg.connect(ctx.destination);
  bass.start(now);
  bass.stop(now + 0.2);

  // Secondary bass (sub-harmonic rumble)
  const sub = ctx.createOscillator();
  sub.frequency.setValueAtTime(45, now);
  sub.frequency.exponentialRampToValueAtTime(20, now + 0.12);
  const sg = ctx.createGain();
  sg.gain.setValueAtTime(0.35, now);
  sg.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
  sub.connect(sg);
  sg.connect(ctx.destination);
  sub.start(now);
  sub.stop(now + 0.18);

  // High-frequency crack (pellet spread)
  const crack = makeNoise(ctx, 0.04, 6);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 3000;
  const cg = ctx.createGain();
  cg.gain.setValueAtTime(0.2, now);
  cg.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
  crack.connect(hp);
  hp.connect(cg);
  cg.connect(ctx.destination);
  crack.start(now);
  crack.stop(now + 0.04);
}

/** Sniper: heavy .50 cal boom — massive supersonic crack + deep concussive blast + long reverb tail */
export function playGunshotSniper(): void {
  const ctx = getAudioCtx();
  const now = ctx.currentTime;

  // 1. Supersonic crack — razor-sharp initial transient
  const crack = makeNoise(ctx, 0.02, 8);
  const crackHp = ctx.createBiquadFilter();
  crackHp.type = 'highpass';
  crackHp.frequency.setValueAtTime(6000, now);
  crackHp.frequency.exponentialRampToValueAtTime(2500, now + 0.012);
  const crackG = ctx.createGain();
  crackG.gain.setValueAtTime(0.6, now);
  crackG.gain.exponentialRampToValueAtTime(0.001, now + 0.02);
  crack.connect(crackHp);
  crackHp.connect(crackG);
  crackG.connect(ctx.destination);
  crack.start(now);
  crack.stop(now + 0.02);

  // 2. Main concussive blast — heavy, wide, distorted body
  const body = makeNoise(ctx, 0.18, 2.5);
  const bodyLp = ctx.createBiquadFilter();
  bodyLp.type = 'lowpass';
  bodyLp.frequency.setValueAtTime(2200, now);
  bodyLp.frequency.exponentialRampToValueAtTime(300, now + 0.12);
  const bodyDist = makeDistortion(ctx, 50);
  const bodyG = ctx.createGain();
  bodyG.gain.setValueAtTime(0.55, now);
  bodyG.gain.exponentialRampToValueAtTime(0.01, now + 0.16);
  body.connect(bodyLp);
  bodyLp.connect(bodyDist);
  bodyDist.connect(bodyG);
  bodyG.connect(ctx.destination);
  body.start(now);
  body.stop(now + 0.18);

  // 3. Deep bass cannon boom — the gut-punch
  const bass = ctx.createOscillator();
  bass.frequency.setValueAtTime(90, now);
  bass.frequency.exponentialRampToValueAtTime(18, now + 0.15);
  const bassG = ctx.createGain();
  bassG.gain.setValueAtTime(0.6, now);
  bassG.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
  bass.connect(bassG);
  bassG.connect(ctx.destination);
  bass.start(now);
  bass.stop(now + 0.2);

  // 4. Sub-bass pressure wave — shakes the room
  const sub = ctx.createOscillator();
  sub.frequency.setValueAtTime(40, now);
  sub.frequency.exponentialRampToValueAtTime(12, now + 0.12);
  const subG = ctx.createGain();
  subG.gain.setValueAtTime(0.45, now);
  subG.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
  sub.connect(subG);
  subG.connect(ctx.destination);
  sub.start(now);
  sub.stop(now + 0.18);

  // 5. Barrel ring — high-frequency harmonic resonance after the shot
  const ring = ctx.createOscillator();
  ring.type = 'sine';
  ring.frequency.setValueAtTime(2800, now + 0.01);
  ring.frequency.exponentialRampToValueAtTime(1800, now + 0.15);
  const ringG = ctx.createGain();
  ringG.gain.setValueAtTime(0, now);
  ringG.gain.setValueAtTime(0.08, now + 0.01);
  ringG.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
  ring.connect(ringG);
  ringG.connect(ctx.destination);
  ring.start(now + 0.01);
  ring.stop(now + 0.22);

  // 6. First echo — close wall reflection (offset 0.08s)
  const echo1 = makeNoise(ctx, 0.15, 2.5);
  const echo1Bp = ctx.createBiquadFilter();
  echo1Bp.type = 'bandpass';
  echo1Bp.frequency.setValueAtTime(600, now + 0.08);
  echo1Bp.frequency.exponentialRampToValueAtTime(150, now + 0.22);
  echo1Bp.Q.value = 0.6;
  const echo1G = ctx.createGain();
  echo1G.gain.setValueAtTime(0, now);
  echo1G.gain.setValueAtTime(0.2, now + 0.08);
  echo1G.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
  echo1.connect(echo1Bp);
  echo1Bp.connect(echo1G);
  echo1G.connect(ctx.destination);
  echo1.start(now + 0.08);
  echo1.stop(now + 0.25);

  // 7. Second echo — far wall, deeper and quieter (offset 0.18s)
  const echo2 = makeNoise(ctx, 0.2, 2);
  const echo2Lp = ctx.createBiquadFilter();
  echo2Lp.type = 'lowpass';
  echo2Lp.frequency.setValueAtTime(350, now + 0.18);
  echo2Lp.frequency.exponentialRampToValueAtTime(80, now + 0.4);
  const echo2G = ctx.createGain();
  echo2G.gain.setValueAtTime(0, now);
  echo2G.gain.setValueAtTime(0.1, now + 0.18);
  echo2G.gain.exponentialRampToValueAtTime(0.001, now + 0.42);
  echo2.connect(echo2Lp);
  echo2Lp.connect(echo2G);
  echo2G.connect(ctx.destination);
  echo2.start(now + 0.18);
  echo2.stop(now + 0.42);

  // 8. Bolt action clack — delayed mechanical sound (offset 0.12s)
  const bolt = ctx.createOscillator();
  bolt.frequency.setValueAtTime(3500, now + 0.12);
  bolt.frequency.exponentialRampToValueAtTime(1000, now + 0.15);
  const boltG = ctx.createGain();
  boltG.gain.setValueAtTime(0, now);
  boltG.gain.setValueAtTime(0.12, now + 0.12);
  boltG.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
  bolt.connect(boltG);
  boltG.connect(ctx.destination);
  bolt.start(now + 0.12);
  bolt.stop(now + 0.18);
}

/** Play gunshot by weapon type (player weapons) */
export function playGunshotWeapon(type: WeaponSoundType): void {
  switch (type) {
    case 'pistol': playGunshotPistol(); break;
    case 'rifle': playGunshotRifle(); break;
    case 'shotgun': playGunshotShotgun(); break;
    case 'sniper': playGunshotSniper(); break;
  }
}

/** Legacy: single generic gunshot (e.g. for enemy fire). */
export function playGunshot(): void {
  playGunshotRifle();
}

/** Procedural empty click (dry fire) */
export function playDryFire(): void {
  const ctx = getAudioCtx();
  const now = ctx.currentTime;

  const osc = ctx.createOscillator();
  osc.frequency.setValueAtTime(1200, now);
  osc.frequency.exponentialRampToValueAtTime(600, now + 0.03);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.15, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.05);
}

// ─── Destruction sounds ───

/** Wood crate breaking — splintering crack + wood crunch */
export function playCrateBreak(): void {
  const ctx = getAudioCtx();
  const now = ctx.currentTime;

  // 1. Sharp crack — wood splitting
  const crack = makeNoise(ctx, 0.06, 4);
  const crackHp = ctx.createBiquadFilter();
  crackHp.type = 'highpass';
  crackHp.frequency.setValueAtTime(2500, now);
  crackHp.frequency.exponentialRampToValueAtTime(800, now + 0.04);
  const crackG = ctx.createGain();
  crackG.gain.setValueAtTime(0.35, now);
  crackG.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
  crack.connect(crackHp);
  crackHp.connect(crackG);
  crackG.connect(ctx.destination);
  crack.start(now);
  crack.stop(now + 0.06);

  // 2. Mid crunch — body of the break
  const crunch = makeNoise(ctx, 0.12, 2.5);
  const crunchBp = ctx.createBiquadFilter();
  crunchBp.type = 'bandpass';
  crunchBp.frequency.setValueAtTime(800, now);
  crunchBp.frequency.exponentialRampToValueAtTime(200, now + 0.1);
  crunchBp.Q.value = 1.2;
  const crunchDist = makeDistortion(ctx, 25);
  const crunchG = ctx.createGain();
  crunchG.gain.setValueAtTime(0.3, now);
  crunchG.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
  crunch.connect(crunchBp);
  crunchBp.connect(crunchDist);
  crunchDist.connect(crunchG);
  crunchG.connect(ctx.destination);
  crunch.start(now);
  crunch.stop(now + 0.12);

  // 3. Low thump — weight of pieces hitting ground
  const thump = ctx.createOscillator();
  thump.frequency.setValueAtTime(100, now + 0.02);
  thump.frequency.exponentialRampToValueAtTime(35, now + 0.08);
  const thumpG = ctx.createGain();
  thumpG.gain.setValueAtTime(0, now);
  thumpG.gain.setValueAtTime(0.2, now + 0.02);
  thumpG.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
  thump.connect(thumpG);
  thumpG.connect(ctx.destination);
  thump.start(now + 0.02);
  thump.stop(now + 0.12);

  // 4. Trailing splinter rattle
  const rattle = makeNoise(ctx, 0.15, 3);
  const rattleBp = ctx.createBiquadFilter();
  rattleBp.type = 'bandpass';
  rattleBp.frequency.setValueAtTime(1500, now + 0.04);
  rattleBp.frequency.exponentialRampToValueAtTime(400, now + 0.15);
  rattleBp.Q.value = 2;
  const rattleG = ctx.createGain();
  rattleG.gain.setValueAtTime(0, now);
  rattleG.gain.setValueAtTime(0.12, now + 0.04);
  rattleG.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
  rattle.connect(rattleBp);
  rattleBp.connect(rattleG);
  rattleG.connect(ctx.destination);
  rattle.start(now + 0.04);
  rattle.stop(now + 0.18);
}

/** Metal crate breaking — metallic crash + reverberant ring */
export function playMetalCrateBreak(): void {
  const ctx = getAudioCtx();
  const now = ctx.currentTime;

  // 1. Sharp metallic impact
  const impact = makeNoise(ctx, 0.04, 5);
  const impactHp = ctx.createBiquadFilter();
  impactHp.type = 'highpass';
  impactHp.frequency.setValueAtTime(3500, now);
  impactHp.frequency.exponentialRampToValueAtTime(1000, now + 0.03);
  const impactG = ctx.createGain();
  impactG.gain.setValueAtTime(0.4, now);
  impactG.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
  impact.connect(impactHp);
  impactHp.connect(impactG);
  impactG.connect(ctx.destination);
  impact.start(now);
  impact.stop(now + 0.04);

  // 2. Metal crash body — resonant bandpass with distortion
  const crash = makeNoise(ctx, 0.15, 2.5);
  const crashBp = ctx.createBiquadFilter();
  crashBp.type = 'bandpass';
  crashBp.frequency.setValueAtTime(1200, now);
  crashBp.frequency.exponentialRampToValueAtTime(300, now + 0.12);
  crashBp.Q.value = 3;
  const crashDist = makeDistortion(ctx, 35);
  const crashG = ctx.createGain();
  crashG.gain.setValueAtTime(0.35, now);
  crashG.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
  crash.connect(crashBp);
  crashBp.connect(crashDist);
  crashDist.connect(crashG);
  crashG.connect(ctx.destination);
  crash.start(now);
  crash.stop(now + 0.15);

  // 3. Metallic ring — lingering resonance
  const ring = ctx.createOscillator();
  ring.type = 'sine';
  ring.frequency.setValueAtTime(1800, now);
  ring.frequency.exponentialRampToValueAtTime(900, now + 0.25);
  const ringG = ctx.createGain();
  ringG.gain.setValueAtTime(0.1, now);
  ringG.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
  ring.connect(ringG);
  ringG.connect(ctx.destination);
  ring.start(now);
  ring.stop(now + 0.32);

  // 4. Bass thud — heavy metal hitting ground
  const bass = ctx.createOscillator();
  bass.frequency.setValueAtTime(120, now);
  bass.frequency.exponentialRampToValueAtTime(30, now + 0.08);
  const bassG = ctx.createGain();
  bassG.gain.setValueAtTime(0.3, now);
  bassG.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
  bass.connect(bassG);
  bassG.connect(ctx.destination);
  bass.start(now);
  bass.stop(now + 0.12);
}

/** Barrel explosion — fiery burst + concussive boom + debris scatter */
export function playBarrelExplode(): void {
  const ctx = getAudioCtx();
  const now = ctx.currentTime;

  // 1. Initial burst — hot, bright
  const burst = makeNoise(ctx, 0.05, 4);
  const burstHp = ctx.createBiquadFilter();
  burstHp.type = 'highpass';
  burstHp.frequency.setValueAtTime(3000, now);
  burstHp.frequency.exponentialRampToValueAtTime(800, now + 0.03);
  const burstG = ctx.createGain();
  burstG.gain.setValueAtTime(0.5, now);
  burstG.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
  burst.connect(burstHp);
  burstHp.connect(burstG);
  burstG.connect(ctx.destination);
  burst.start(now);
  burst.stop(now + 0.05);

  // 2. Main boom — heavy distorted lowpass
  const boom = makeNoise(ctx, 0.2, 2);
  const boomLp = ctx.createBiquadFilter();
  boomLp.type = 'lowpass';
  boomLp.frequency.setValueAtTime(1500, now);
  boomLp.frequency.exponentialRampToValueAtTime(150, now + 0.15);
  const boomDist = makeDistortion(ctx, 50);
  const boomG = ctx.createGain();
  boomG.gain.setValueAtTime(0.55, now);
  boomG.gain.exponentialRampToValueAtTime(0.01, now + 0.18);
  boom.connect(boomLp);
  boomLp.connect(boomDist);
  boomDist.connect(boomG);
  boomG.connect(ctx.destination);
  boom.start(now);
  boom.stop(now + 0.2);

  // 3. Deep bass — concussive pressure
  const bass = ctx.createOscillator();
  bass.frequency.setValueAtTime(70, now);
  bass.frequency.exponentialRampToValueAtTime(18, now + 0.12);
  const bassG = ctx.createGain();
  bassG.gain.setValueAtTime(0.5, now);
  bassG.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
  bass.connect(bassG);
  bassG.connect(ctx.destination);
  bass.start(now);
  bass.stop(now + 0.18);

  // 4. Sub rumble
  const sub = ctx.createOscillator();
  sub.frequency.setValueAtTime(35, now);
  sub.frequency.exponentialRampToValueAtTime(10, now + 0.1);
  const subG = ctx.createGain();
  subG.gain.setValueAtTime(0.35, now);
  subG.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
  sub.connect(subG);
  subG.connect(ctx.destination);
  sub.start(now);
  sub.stop(now + 0.15);

  // 5. Fire crackle tail — debris and flame
  const crackle = makeNoise(ctx, 0.25, 2);
  const crackleBp = ctx.createBiquadFilter();
  crackleBp.type = 'bandpass';
  crackleBp.frequency.setValueAtTime(600, now + 0.05);
  crackleBp.frequency.exponentialRampToValueAtTime(100, now + 0.3);
  crackleBp.Q.value = 0.8;
  const crackleG = ctx.createGain();
  crackleG.gain.setValueAtTime(0, now);
  crackleG.gain.setValueAtTime(0.15, now + 0.05);
  crackleG.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
  crackle.connect(crackleBp);
  crackleBp.connect(crackleG);
  crackleG.connect(ctx.destination);
  crackle.start(now + 0.05);
  crackle.stop(now + 0.35);
}

/** Play destruction sound by prop type */
export function playDestruction(type: string): void {
  switch (type) {
    case 'crate': playCrateBreak(); break;
    case 'crate_metal': playMetalCrateBreak(); break;
    case 'barrel': playBarrelExplode(); break;
  }
}

/** Procedural reload sound (mechanical click-clack) */
export function playReload(): void {
  const ctx = getAudioCtx();
  const now = ctx.currentTime;

  // Magazine out (click)
  const click1 = ctx.createOscillator();
  click1.frequency.setValueAtTime(3000, now + 0.1);
  click1.frequency.exponentialRampToValueAtTime(800, now + 0.13);
  const g1 = ctx.createGain();
  g1.gain.setValueAtTime(0, now);
  g1.gain.setValueAtTime(0.2, now + 0.1);
  g1.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
  click1.connect(g1);
  g1.connect(ctx.destination);
  click1.start(now);
  click1.stop(now + 0.2);

  // Magazine in (heavier click)
  const click2 = ctx.createOscillator();
  click2.frequency.setValueAtTime(2000, now + 0.7);
  click2.frequency.exponentialRampToValueAtTime(500, now + 0.73);
  const g2 = ctx.createGain();
  g2.gain.setValueAtTime(0, now);
  g2.gain.setValueAtTime(0.25, now + 0.7);
  g2.gain.exponentialRampToValueAtTime(0.001, now + 0.78);
  click2.connect(g2);
  g2.connect(ctx.destination);
  click2.start(now);
  click2.stop(now + 0.8);

  // Slide rack
  const bufferSize = ctx.sampleRate * 0.06;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 2) * 0.3;
  }
  const slide = ctx.createBufferSource();
  slide.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = 2000;
  const g3 = ctx.createGain();
  g3.gain.setValueAtTime(0, now);
  g3.gain.setValueAtTime(0.3, now + 0.95);
  g3.gain.exponentialRampToValueAtTime(0.001, now + 1.0);
  slide.connect(filter);
  filter.connect(g3);
  g3.connect(ctx.destination);
  slide.start(now + 0.95);
  slide.stop(now + 1.05);
}

/**
 * Play a positioned gunshot sound for remote players.
 * Uses Web Audio API's PannerNode for 3D spatial audio.
 * @param type Weapon type
 * @param position World position where the sound originates
 * @param listenerPosition Camera/player position (the listener)
 */
export function playPositionalGunshot(
  type: WeaponSoundType,
  position: { x: number; y: number; z: number },
  listenerPosition: { x: number; y: number; z: number }
): void {
  const ctx = getAudioCtx();
  const now = ctx.currentTime;

  // Set listener position
  if (ctx.listener.positionX) {
    ctx.listener.positionX.setValueAtTime(listenerPosition.x, now);
    ctx.listener.positionY.setValueAtTime(listenerPosition.y, now);
    ctx.listener.positionZ.setValueAtTime(listenerPosition.z, now);
  } else {
    // Fallback for older browsers
    ctx.listener.setPosition(listenerPosition.x, listenerPosition.y, listenerPosition.z);
  }

  // Create panner for 3D positioning
  const panner = ctx.createPanner();
  panner.panningModel = 'HRTF';
  panner.distanceModel = 'inverse';
  panner.refDistance = 1;
  panner.maxDistance = 100;
  panner.rolloffFactor = 1.5;
  panner.coneInnerAngle = 360;
  panner.coneOuterAngle = 360;
  panner.coneOuterGain = 0;

  // Set sound source position
  if (panner.positionX) {
    panner.positionX.setValueAtTime(position.x, now);
    panner.positionY.setValueAtTime(position.y, now);
    panner.positionZ.setValueAtTime(position.z, now);
  } else {
    // Fallback for older browsers
    panner.setPosition(position.x, position.y, position.z);
  }

  // Create a simple gunshot sound (simplified version)
  // Transient crack
  const noise = makeNoise(ctx, 0.06, 5);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 800;
  const crack = ctx.createGain();
  crack.gain.setValueAtTime(0.6, now);
  crack.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

  noise.connect(hp);
  hp.connect(crack);
  crack.connect(panner);
  panner.connect(ctx.destination);
  noise.start(now);
  noise.stop(now + 0.06);

  // Body thump
  const body = makeNoise(ctx, 0.1, 3);
  const bodyLp = ctx.createBiquadFilter();
  bodyLp.type = 'lowpass';
  bodyLp.frequency.setValueAtTime(400, now);
  bodyLp.frequency.exponentialRampToValueAtTime(150, now + 0.08);
  const bodyG = ctx.createGain();
  bodyG.gain.setValueAtTime(0.5, now);
  bodyG.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

  body.connect(bodyLp);
  bodyLp.connect(bodyG);
  bodyG.connect(panner);
  body.start(now);
  body.stop(now + 0.1);
}
