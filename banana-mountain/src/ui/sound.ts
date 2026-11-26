/* Kleine Klänge mit WebAudio – keine Audiodateien nötig. */
import { ls } from '../storage/local';
let ctx: AudioContext | null = null;
let muted = ls.get('banana-mountain-mute') === '1';

function ac() {
  if (!ctx) ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone(freq: number, dur: number, type: OscillatorType, vol: number, slide = 0) {
  if (muted) return;
  try {
    const a = ac();
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, a.currentTime);
    if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, a.currentTime + dur);
    g.gain.setValueAtTime(vol, a.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
    o.connect(g).connect(a.destination);
    o.start();
    o.stop(a.currentTime + dur + 0.02);
  } catch { /* kein Ton möglich */ }
}

function noise(dur: number, vol: number, freq: number) {
  if (muted) return;
  try {
    const a = ac();
    const buf = a.createBuffer(1, Math.floor(a.sampleRate * dur), a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = a.createBufferSource();
    src.buffer = buf;
    const f = a.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    const g = a.createGain();
    g.gain.value = vol;
    src.connect(f).connect(g).connect(a.destination);
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
};

export function isMuted() { return muted; }
export function setMuted(m: boolean) { muted = m; ls.set('banana-mountain-mute', m ? '1' : '0'); }
