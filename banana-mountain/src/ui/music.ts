/*
 * Hintergrundmusik – wird live im Browser erzeugt (WebAudio), keine Audiodateien.
 * Lockerer „Fabrik-Groove“: Akkorde, Bass, Arpeggio, Marimba-Melodie, Schlagzeug,
 * dazu ein leises Fabrik-Brummen, das lauter wird, je mehr Maschinen laufen.
 */

let ctx: AudioContext | null = null;
let master: GainNode, musicGain: GainNode, sfxGain: GainNode, ambGain: GainNode;
let reverb: ConvolverNode;
let noiseBuf: AudioBuffer;
let started = false;
let timer = 0;
let nextTime = 0;
let step = 0;
const vol = { master: 0.8, music: 0.55, sfx: 0.8, musicOn: true };

export function audioCtx(): AudioContext | null {
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    } catch { return null; }
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 3;
    master = ctx.createGain();
    musicGain = ctx.createGain();
    sfxGain = ctx.createGain();
    ambGain = ctx.createGain();
    ambGain.gain.value = 0;
    musicGain.connect(master);
    sfxGain.connect(master);
    ambGain.connect(master);
    master.connect(comp).connect(ctx.destination);
    // Hall aus Rauschen
    reverb = ctx.createConvolver();
    const len = ctx.sampleRate * 2.2;
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    reverb.buffer = ir;
    const rv = ctx.createGain();
    rv.gain.value = 0.35;
    reverb.connect(rv).connect(musicGain);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const nd = noiseBuf.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    applyVolumes();
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

export function sfxOut(): AudioNode | null { return audioCtx() ? sfxGain : null; }

function applyVolumes() {
  if (!ctx) return;
  const t = ctx.currentTime;
  master.gain.setTargetAtTime(vol.master, t, 0.05);
  musicGain.gain.setTargetAtTime(vol.musicOn ? vol.music : 0, t, 0.3);
  sfxGain.gain.setTargetAtTime(vol.sfx, t, 0.05);
}

export function setVolumes(v: Partial<typeof vol>) {
  Object.assign(vol, v);
  applyVolumes();
}

// Fabrik-Brummen: 0..1 je nach Anzahl arbeitender Maschinen
export function setFactoryActivity(a: number) {
  if (!ctx || !started) return;
  ambGain.gain.setTargetAtTime(Math.min(1, a) * 0.05, ctx.currentTime, 1.5);
}

// ---------------------------------------------------------------- Musik
const BPM = 96;
const SIXTEENTH = 60 / BPM / 4;
const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);
// Akkordfolge (C-Dur, entspannt): Cmaj9 – Am7 – Fmaj7 – G6
const CHORDS = [
  { root: 48, notes: [60, 64, 67, 71, 74] },
  { root: 45, notes: [57, 60, 64, 67, 72] },
  { root: 41, notes: [57, 60, 65, 69, 72] },
  { root: 43, notes: [55, 59, 62, 64, 71] },
];
const SCALE = [60, 62, 64, 67, 69, 72, 74, 76, 79];

// Zufall mit Startwert, damit Melodien sich wiederholen (wie ein Refrain)
function seeded(seed: number) { let s = seed; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; }
function makePhrase(seed: number): (number | null)[] {
  const r = seeded(seed);
  const out: (number | null)[] = [];
  let idx = 4;
  for (let i = 0; i < 32; i++) {
    const on = i % 4 === 0 ? r() < 0.75 : i % 2 === 0 ? r() < 0.4 : r() < 0.12;
    if (!on) { out.push(null); continue; }
    idx = Math.max(0, Math.min(SCALE.length - 1, idx + Math.round((r() - 0.5) * 4)));
    out.push(SCALE[idx]);
  }
  return out;
}
const PHRASES = [makePhrase(11), makePhrase(23), makePhrase(11), makePhrase(37)];

function env(g: GainNode, t: number, a: number, peak: number, d: number) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
}

function osc(type: OscillatorType, f: number, t: number, dur: number, peak: number, a: number, out: AudioNode, detune = 0) {
  const c = ctx!;
  const o = c.createOscillator();
  o.type = type;
  o.frequency.value = f;
  o.detune.value = detune;
  const g = c.createGain();
  env(g, t, a, peak, dur);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + a + dur + 0.05);
  return o;
}

function pad(chord: number[], t: number, dur: number) {
  const c = ctx!;
  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 1100;
  f.Q.value = 0.6;
  f.connect(musicGain);
  f.connect(reverb);
  for (const n of chord.slice(0, 4)) {
    for (const det of [-7, 7]) {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = midi(n);
      o.detune.value = det;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.018, t + 0.6);
      g.gain.setValueAtTime(0.018, t + dur - 0.4);
      g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.3);
      o.connect(g).connect(f);
      o.start(t);
      o.stop(t + dur + 0.4);
    }
  }
}

function drum(kind: 'kick' | 'snare' | 'hat' | 'shaker', t: number) {
  const c = ctx!;
  if (kind === 'kick') {
    const o = c.createOscillator();
    o.frequency.setValueAtTime(130, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
    const g = c.createGain();
    env(g, t, 0.003, 0.5, 0.3);
    o.connect(g).connect(musicGain);
    o.start(t);
    o.stop(t + 0.35);
    return;
  }
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  const f = c.createBiquadFilter();
  const g = c.createGain();
  if (kind === 'snare') { f.type = 'bandpass'; f.frequency.value = 1900; env(g, t, 0.002, 0.18, 0.16); }
  else if (kind === 'hat') { f.type = 'highpass'; f.frequency.value = 8000; env(g, t, 0.001, 0.06, 0.05); }
  else { f.type = 'highpass'; f.frequency.value = 6000; env(g, t, 0.01, 0.025, 0.06); }
  src.connect(f).connect(g).connect(musicGain);
  if (kind === 'snare') g.connect(reverb);
  src.start(t, Math.random() * 0.5);
  src.stop(t + 0.3);
}

function scheduleStep(s: number, t: number) {
  const bar = Math.floor(s / 16);
  const pos = s % 16;
  const chord = CHORDS[bar % 4];
  const section = Math.floor(bar / 8) % 4; // 0 Intro, 1 Groove, 2 Pause, 3 Groove
  const drums = section === 1 || section === 3;
  if (pos === 0) pad(chord.notes, t, SIXTEENTH * 16);
  // Bass
  if (section !== 0 && [0, 6, 8, 11, 14].includes(pos)) {
    const n = pos === 14 ? chord.root + 7 : chord.root;
    osc('triangle', midi(n), t, SIXTEENTH * (pos === 0 ? 3 : 1.6), 0.16, 0.005, musicGain);
    osc('sine', midi(n - 12), t, SIXTEENTH * 2, 0.12, 0.005, musicGain);
  }
  // Arpeggio (Achtel)
  if (pos % 2 === 0) {
    const n = chord.notes[(pos / 2 + bar) % chord.notes.length] + 12;
    const o = osc('triangle', midi(n), t, 0.22, 0.03, 0.004, musicGain);
    void o;
    if (pos % 4 === 0) osc('sine', midi(n), t + SIXTEENTH * 3, 0.2, 0.012, 0.004, reverb);
  }
  // Marimba-Melodie
  if (section >= 1) {
    const phrase = PHRASES[Math.floor(bar / 2) % 4];
    const n = phrase[(bar % 2) * 16 + pos];
    if (n !== null && n !== undefined) {
      osc('sine', midi(n), t, 0.35, 0.07, 0.003, musicGain);
      osc('sine', midi(n) * 4, t, 0.08, 0.015, 0.002, musicGain);
      osc('sine', midi(n), t, 0.3, 0.02, 0.003, reverb);
    }
  }
  // Schlagzeug
  if (drums) {
    if (pos === 0 || pos === 8 || (pos === 10 && bar % 2 === 1)) drum('kick', t);
    if (pos === 4 || pos === 12) drum('snare', t);
    if (pos % 2 === 1) drum('hat', t);
  } else if (section === 2 && pos % 4 === 2) drum('shaker', t);
}

function startAmbience() {
  const c = ctx!;
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 220;
  const hum = c.createOscillator();
  hum.frequency.value = 55;
  const hg = c.createGain();
  hg.gain.value = 0.25;
  hum.connect(hg).connect(ambGain);
  src.connect(f).connect(ambGain);
  src.start();
  hum.start();
}

export function startMusic() {
  const c = audioCtx();
  if (!c || started) return;
  started = true;
  startAmbience();
  nextTime = c.currentTime + 0.1;
  const tick = () => {
    if (!ctx) return;
    while (nextTime < ctx.currentTime + 0.25) {
      if (vol.musicOn && vol.music > 0) scheduleStep(step, nextTime);
      nextTime += SIXTEENTH;
      step++;
    }
  };
  timer = window.setInterval(tick, 50);
  // Im Hintergrund-Tab pausieren
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend().catch(() => {});
    else { ctx.resume().catch(() => {}); nextTime = Math.max(nextTime, ctx.currentTime + 0.1); }
  });
}

export function stopMusic() { clearInterval(timer); started = false; }
