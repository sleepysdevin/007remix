/**
 * Procedural spy-thriller background music — 007-inspired.
 * Fully procedural, no audio files — all Web Audio API oscillators and noise.
 * 5.6 second loop at 173 BPM, 4 bars of 4/4
 */
import { GameSettings } from '../core/game-settings';

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let loopTimer: number | null = null;
let playing = false;

const BPM = 173;
const LOOP = 5.6;
const BEAT = LOOP / 16; // 16 beats in 4 bars
const BAR = BEAT * 4;

// Swing: off-beat 8ths delayed (approx 2:1 swing)
const EIGHTH = BEAT / 2;
const SWING = EIGHTH * 0.35; // off-beat pushed later

// ─── Note frequencies (hz) ───
const NOTE: Record<string, number> = {
  'B1': 61.74, 'C2': 65.41, 'Cs2': 69.30, 'D2': 73.42, 'E2': 82.41,
  'F2': 87.31, 'Fs2': 92.50, 'G2': 98.00, 'Gs2': 103.83, 'A2': 110.00,
  'As2': 116.54, 'B2': 123.47,
  'C3': 130.81, 'Cs3': 138.59, 'D3': 146.83, 'Ds3': 155.56, 'E3': 164.81,
  'F3': 174.61, 'Fs3': 185.00, 'G3': 196.00, 'Gs3': 207.65, 'A3': 220.00,
  'As3': 233.08, 'B3': 246.94,
  'C4': 261.63, 'Cs4': 277.18, 'D4': 293.66, 'Ds4': 311.13, 'E4': 329.63,
  'F4': 349.23, 'Fs4': 369.99, 'G4': 392.00, 'Gs4': 415.30, 'A4': 440.00,
  'As4': 466.16, 'B4': 493.88,
  'C5': 523.25, 'Cs5': 554.37, 'D5': 587.33, 'Ds5': 622.25, 'E5': 659.25,
  'F5': 698.46, 'Fs5': 739.99, 'G5': 783.99, 'Gs5': 830.61,
  'A5': 880.00, 'As5': 932.33,
};

function getCtx(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext();
    masterGain = ctx.createGain();
    masterGain.gain.value = GameSettings.getVolumeMaster() * GameSettings.getVolumeMusic();
    masterGain.connect(ctx.destination);
  }
  return ctx;
}

function getMaster(): GainNode {
  getCtx();
  return masterGain!;
}

// ─── Instrument helpers ───

/** Filtered triangle tone */
function playTriangle(
  freq: number,
  startTime: number,
  duration: number,
  volume: number,
  dest: AudioNode,
  lpFreq = 1200,
): void {
  const c = getCtx();
  const osc = c.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(freq, startTime);
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(lpFreq, startTime);
  lp.frequency.exponentialRampToValueAtTime(200, startTime + duration);
  const g = c.createGain();
  g.gain.setValueAtTime(0, startTime);
  g.gain.linearRampToValueAtTime(volume, startTime + 0.01);
  g.gain.setValueAtTime(volume * 0.7, startTime + duration * 0.6);
  g.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
  osc.connect(lp);
  lp.connect(g);
  g.connect(dest);
  osc.start(startTime);
  osc.stop(startTime + duration + 0.02);
}

/** Sub-octave sine */
function playSubSine(
  freq: number,
  startTime: number,
  duration: number,
  volume: number,
  dest: AudioNode,
): void {
  const c = getCtx();
  const osc = c.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq * 0.5, startTime);
  const g = c.createGain();
  g.gain.setValueAtTime(0, startTime);
  g.gain.linearRampToValueAtTime(volume, startTime + 0.01);
  g.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
  osc.connect(g);
  g.connect(dest);
  osc.start(startTime);
  osc.stop(startTime + duration + 0.01);
}

/** Noise burst with bandpass (trap-style stab) */
function playNoiseStab(
  startTime: number,
  duration: number,
  volume: number,
  bpFreq: number,
  bpQ: number,
  dest: AudioNode,
): void {
  const c = getCtx();
  const size = Math.ceil(c.sampleRate * duration);
  const buf = c.createBuffer(1, size, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < size; i++) {
    d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / size, 2);
  }
  const src = c.createBufferSource();
  src.buffer = buf;
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = bpFreq;
  bp.Q.value = bpQ;
  const g = c.createGain();
  g.gain.setValueAtTime(volume, startTime);
  g.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
  src.connect(bp);
  bp.connect(g);
  g.connect(dest);
  src.start(startTime);
  src.stop(startTime + duration + 0.01);
}

/** Hi-hat (shorter, crisp) */
function playHiHat(
  startTime: number,
  duration: number,
  volume: number,
  dest: AudioNode,
): void {
  const c = getCtx();
  const size = Math.ceil(c.sampleRate * duration);
  const buf = c.createBuffer(1, size, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < size; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / size, 4);
  }
  const src = c.createBufferSource();
  src.buffer = buf;
  const hp = c.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 6000;
  const g = c.createGain();
  g.gain.setValueAtTime(volume, startTime);
  g.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
  src.connect(hp);
  hp.connect(g);
  g.connect(dest);
  src.start(startTime);
  src.stop(startTime + duration + 0.01);
}

/** FM mallet — triangle carrier + sine modulator for xylophone bite */
function playFMMallet(
  freq: number,
  startTime: number,
  duration: number,
  volume: number,
  modIndex: number,
  dest: AudioNode,
): void {
  const c = getCtx();
  const carrier = c.createOscillator();
  carrier.type = 'triangle';
  carrier.frequency.setValueAtTime(freq, startTime);
  const modulator = c.createOscillator();
  modulator.type = 'sine';
  modulator.frequency.setValueAtTime(freq * 3.5, startTime); // harmonic ratio for bite
  const modGain = c.createGain();
  modGain.gain.setValueAtTime(modIndex * freq, startTime);
  modulator.connect(modGain);
  modGain.connect(carrier.frequency);
  const g = c.createGain();
  const attack = 0.005;
  g.gain.setValueAtTime(0, startTime);
  g.gain.linearRampToValueAtTime(volume, startTime + attack);
  g.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
  carrier.connect(g);
  g.connect(dest);
  carrier.start(startTime);
  carrier.stop(startTime + duration + 0.02);
  modulator.start(startTime);
  modulator.stop(startTime + duration + 0.02);
}

/** String pad — detuned sawtooth ensemble, LP-filtered */
function playStringPad(
  freqs: number[],
  startTime: number,
  duration: number,
  volume: number,
  dest: AudioNode,
): void {
  const c = getCtx();
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(900, startTime);
  lp.frequency.exponentialRampToValueAtTime(400, startTime + duration * 0.8);
  lp.Q.value = 0.5;
  const g = c.createGain();
  const attack = duration * 0.25;
  g.gain.setValueAtTime(0, startTime);
  g.gain.linearRampToValueAtTime(volume, startTime + attack);
  g.gain.setValueAtTime(volume * 0.8, startTime + duration * 0.85);
  g.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
  lp.connect(g);
  g.connect(dest);
  for (const freq of freqs) {
    for (const det of [-6, 0, 5]) {
      const osc = c.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, startTime);
      osc.detune.setValueAtTime(det, startTime);
      osc.connect(lp);
      osc.start(startTime);
      osc.stop(startTime + duration + 0.05);
    }
  }
}

/** Reverb-drenched snare (noise + tone body + delayed wash) */
function playSnare(startTime: number, volume: number, dest: AudioNode): void {
  const c = getCtx();
  const merger = c.createGain();
  merger.connect(dest);

  // Main noise body
  const size = Math.ceil(c.sampleRate * 0.12);
  const buf = c.createBuffer(1, size, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < size; i++) {
    d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / size, 2);
  }
  const src = c.createBufferSource();
  src.buffer = buf;
  const hp = c.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 1500;
  const bodyG = c.createGain();
  bodyG.gain.setValueAtTime(volume, startTime);
  bodyG.gain.exponentialRampToValueAtTime(0.001, startTime + 0.1);
  src.connect(hp);
  hp.connect(bodyG);
  bodyG.connect(merger);
  src.start(startTime);
  src.stop(startTime + 0.15);

  // Tone body
  const tone = c.createOscillator();
  tone.frequency.setValueAtTime(180, startTime);
  tone.frequency.exponentialRampToValueAtTime(80, startTime + 0.05);
  const toneG = c.createGain();
  toneG.gain.setValueAtTime(volume * 0.8, startTime);
  toneG.gain.exponentialRampToValueAtTime(0.001, startTime + 0.08);
  tone.connect(toneG);
  toneG.connect(merger);
  tone.start(startTime);
  tone.stop(startTime + 0.1);

  // Reverb wash: multiple delayed copies
  const delays = [0.04, 0.08, 0.12, 0.18];
  for (let i = 0; i < delays.length; i++) {
    const del = c.createDelay(0.4);
    del.delayTime.value = delays[i];
    const g = c.createGain();
    g.gain.setValueAtTime(volume * 0.5 * Math.pow(0.4, i), startTime);
    g.gain.exponentialRampToValueAtTime(0.001, startTime + 0.3 + delays[i]);
    bodyG.connect(del);
    del.connect(g);
    g.connect(dest);
  }
}

// ─── The loop composition ───

function scheduleLoop(baseTime: number): void {
  const dest = getMaster();

  // === BASS: B→C→C♯→C→B walking chromatically (filtered triangle + sub sine) ===
  const bassWalk = ['B2', 'C3', 'Cs3', 'C3', 'B2'];
  for (let i = 0; i < 16; i++) {
    const note = bassWalk[i % 5];
    const t = baseTime + i * BEAT;
    const dur = BEAT * 0.9;
    playTriangle(NOTE[note], t, dur, 0.2, dest, 800);
    playSubSine(NOTE[note], t, dur, 0.18, dest);
  }

  // === KICK on 1 & 3 ===
  for (let bar = 0; bar < 4; bar++) {
    for (const b of [0, 2]) {
      const t = baseTime + bar * BAR + b * BEAT;
      const c = getCtx();
      const kick = c.createOscillator();
      kick.frequency.setValueAtTime(120, t);
      kick.frequency.exponentialRampToValueAtTime(28, t + 0.06);
      const kg = c.createGain();
      kg.gain.setValueAtTime(0.35, t);
      kg.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
      kick.connect(kg);
      kg.connect(dest);
      kick.start(t);
      kick.stop(t + 0.12);
    }
  }

  // === SNARE on 2 & 4 (reverb-drenched) ===
  for (let bar = 0; bar < 4; bar++) {
    for (const b of [1, 3]) {
      playSnare(baseTime + bar * BAR + b * BEAT, 0.11, dest);
    }
  }

  // === SWUNG 8th-note HI-HATS ===
  for (let i = 0; i < 32; i++) {
    const isOffbeat = i % 2 === 1;
    const t = baseTime + Math.floor(i / 2) * BEAT + (isOffbeat ? EIGHTH + SWING : 0);
    const vol = isOffbeat ? 0.045 : 0.065;
    playHiHat(t, 0.03, vol, dest);
  }

  // === MALLET RIFF: FM triangle+sine, sneaky descending melody ===
  const malletNotes: { note: string; time: number; dur: number }[] = [
    { note: 'E5', time: 0, dur: BEAT * 0.35 },
    { note: 'Ds5', time: BEAT * 0.5, dur: BEAT * 0.3 },
    { note: 'D5', time: BEAT, dur: BEAT * 0.35 },
    { note: 'Cs5', time: BEAT * 1.5, dur: BEAT * 0.3 },
    { note: 'C5', time: BEAT * 2, dur: BEAT * 0.4 },
    { note: 'B4', time: BEAT * 2.7, dur: BEAT * 0.5 },
    { note: 'As4', time: BAR * 2, dur: BEAT * 0.35 },
    { note: 'A4', time: BAR * 2 + BEAT * 0.5, dur: BEAT * 0.5 },
    { note: 'Gs4', time: BAR * 3, dur: BEAT * 0.35 },
    { note: 'G5', time: BAR * 3 + BEAT * 1.5, dur: BEAT * 0.25 },
    { note: 'Fs5', time: BAR * 3 + BEAT * 1.8, dur: BEAT * 0.3 },
  ];
  for (const m of malletNotes) {
    playFMMallet(NOTE[m.note], baseTime + m.time, m.dur, 0.06, 8, dest);
  }

  // === STRING PAD: Em(add9) → C(add♯11) → C♯dim, LP-filtered ===
  // Em(add9) = E G B F#
  playStringPad([NOTE['E3'], NOTE['G3'], NOTE['B3'], NOTE['Fs4']], baseTime, BAR * 1.4, 0.035, dest);
  // C(add♯11) = C E G F# (F# = #11)
  playStringPad([NOTE['C3'], NOTE['E3'], NOTE['G3'], NOTE['Fs4']], baseTime + BAR * 1.4, BAR * 1.4, 0.032, dest);
  // C♯dim = C# E G (dim triad) + A (dim7)
  playStringPad([NOTE['Cs3'], NOTE['E3'], NOTE['G3'], NOTE['A3']], baseTime + BAR * 2.8, BAR * 1.4, 0.038, dest);
  // Back to Em for bar 4
  playStringPad([NOTE['E3'], NOTE['G3'], NOTE['B3'], NOTE['Fs4']], baseTime + BAR * 2.8 + BEAT * 2, BAR * 1.2, 0.03, dest);

  // === ECHO STABS: Bandpassed white noise on bar transitions (trap-esque) ===
  const stabTimes = [0, BAR, BAR * 2, BAR * 3, LOOP - 0.02];
  for (const st of stabTimes) {
    const t = baseTime + st;
    playNoiseStab(t, 0.08, 0.14, 1200, 4, dest);
    playNoiseStab(t + 0.06, 0.1, 0.08, 800, 3, dest);
  }
}

// ─── Public API ───

export function startMusic(): void {
  if (playing) return;
  playing = true;

  const c = getCtx();
  if (c.state === 'suspended') c.resume();

  let nextLoopTime = c.currentTime + 0.1;
  scheduleLoop(nextLoopTime);

  const schedule = () => {
    if (!playing) return;
    const now = c.currentTime;
    if (now > nextLoopTime - 2) {
      nextLoopTime += LOOP;
      scheduleLoop(nextLoopTime);
    }
    loopTimer = window.setTimeout(schedule, 400) as unknown as number;
  };
  loopTimer = window.setTimeout(schedule, 400) as unknown as number;
}

export function stopMusic(): void {
  playing = false;
  if (loopTimer !== null) {
    clearTimeout(loopTimer);
    loopTimer = null;
  }
  if (masterGain && ctx) {
    masterGain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.5);
    setTimeout(() => {
      if (masterGain) masterGain.gain.value = 0.2;
    }, 600);
  }
}

export function setMusicVolume(vol: number): void {
  if (masterGain) masterGain.gain.value = Math.max(0, Math.min(1, vol));
}

export function isMusicPlaying(): boolean {
  return playing;
}
