/**
 * Procedural sound effects using Web Audio API.
 * No audio files needed — generates gunshot, reload, etc. from noise and oscillators.
 */

let audioCtx: AudioContext | null = null;

function getAudioCtx(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  return audioCtx;
}

/** Procedural gunshot: burst of noise with quick pitch drop */
export function playGunshot(): void {
  const ctx = getAudioCtx();
  const now = ctx.currentTime;

  // White noise burst
  const bufferSize = ctx.sampleRate * 0.15;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 3);
  }

  const noise = ctx.createBufferSource();
  noise.buffer = buffer;

  // Bandpass filter for punch
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(800, now);
  filter.frequency.exponentialRampToValueAtTime(200, now + 0.1);
  filter.Q.value = 1;

  // Distortion for crunch
  const distortion = ctx.createWaveShaper();
  const curve = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const x = (i * 2) / 256 - 1;
    curve[i] = (Math.PI + 20) * x / (Math.PI + 20 * Math.abs(x));
  }
  distortion.curve = curve;

  // Volume envelope
  const gainNode = ctx.createGain();
  gainNode.gain.setValueAtTime(0.4, now);
  gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.12);

  noise.connect(filter);
  filter.connect(distortion);
  distortion.connect(gainNode);
  gainNode.connect(ctx.destination);

  noise.start(now);
  noise.stop(now + 0.15);

  // Low-frequency thump for bass
  const osc = ctx.createOscillator();
  osc.frequency.setValueAtTime(150, now);
  osc.frequency.exponentialRampToValueAtTime(30, now + 0.08);
  const oscGain = ctx.createGain();
  oscGain.gain.setValueAtTime(0.5, now);
  oscGain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
  osc.connect(oscGain);
  oscGain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.1);
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
