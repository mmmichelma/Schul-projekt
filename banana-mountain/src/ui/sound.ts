/* Kleine Klänge mit WebAudio – keine Audiodateien nötig. Lautstärke über die Einstellungen. */
import { audioCtx, sfxOut } from './music';

function tone(freq: number, dur: number, type: OscillatorType, vol: number, slide = 0) {
  const a = audioCtx(), out = sfxOut();
  if (!a || !out) return;
  try {
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, a.currentTime);
    if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, a.currentTime + dur);
    g.gain.setValueAtTime(vol, a.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
    o.connect(g).connect(out);
    o.start();
    o.stop(a.currentTime + dur + 0.02);
  } catch { /* kein Ton möglich */ }
}

function noise(dur: number, vol: number, freq: number, type: BiquadFilterType = 'bandpass') {
  const a = audioCtx(), out = sfxOut();
  if (!a || !out) return;
  try {
    const buf = a.createBuffer(1, Math.floor(a.sampleRate * dur), a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = a.createBufferSource();
    src.buffer = buf;
    const f = a.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = a.createGain();
    g.gain.value = vol;
    src.connect(f).connect(g).connect(out);
    src.start();
  } catch { /* kein Ton möglich */ }
}

export const sfx = {
  peel: () => { noise(0.18, 0.35, 1800); tone(500, 0.12, 'triangle', 0.05, 0.6); },
  grab: () => tone(320, 0.08, 'sine', 0.08, 1.6),
  coin: () => { tone(1320, 0.07, 'square', 0.035); setTimeout(() => tone(1760, 0.1, 'square', 0.03), 60); },
  build: () => { tone(140, 0.15, 'sine', 0.15, 0.6); noise(0.08, 0.15, 500); },
  error: () => tone(160, 0.18, 'sawtooth', 0.05, 0.8),
  upgrade: () => { [523, 659, 784].forEach((f, i) => setTimeout(() => tone(f, 0.12, 'triangle', 0.07), i * 70)); },
  step: () => noise(0.06, 0.12 + Math.random() * 0.05, 300 + Math.random() * 200, 'lowpass'),
  jump: () => tone(260, 0.16, 'triangle', 0.06, 1.8),
  land: () => noise(0.1, 0.25, 200, 'lowpass'),
};

// Alte Schnittstelle (Menü-Knopf „Töne an/aus“)
let muted = false;
export function isMuted() { return muted; }
export function setMuted(m: boolean) { muted = m; }
