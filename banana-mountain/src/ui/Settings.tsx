import { useRef, useState } from 'react';
import type { Engine, Settings } from '../engine';
import { QUALITIES } from '../render/world';
import { IconClose } from './Icons';

type Tab = 'grafik' | 'audio' | 'steuerung' | 'spiel';

function Slider({ label, value, min, max, step, fmt, onChange }: { label: string; value: number; min: number; max: number; step: number; fmt: (v: number) => string; onChange: (v: number) => void }) {
  return (
    <label className="set-row">
      <span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <b>{fmt(value)}</b>
    </label>
  );
}

function Toggle({ label, value, onChange, note }: { label: string; value: boolean; onChange: (v: boolean) => void; note?: string }) {
  return (
    <label className="set-row toggle-row">
      <span>{label}{note && <small>{note}</small>}</span>
      <button type="button" className={'switch' + (value ? ' on' : '')} onClick={() => onChange(!value)} aria-pressed={value}><i /></button>
    </label>
  );
}

function Choice<T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="set-row">
      <span>{label}</span>
      <div className="seg">
        {options.map(([v, n]) => <button key={String(v)} className={value === v ? 'active' : ''} onClick={() => onChange(v)}>{n}</button>)}
      </div>
    </div>
  );
}

const pct = (v: number) => Math.round(v * 100) + ' %';

export function SettingsModal({ engine, onClose }: { engine: Engine; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('grafik');
  const s = engine.settings;
  const set = (p: Partial<Settings>) => engine.setSettings(p);
  const confirmReset = useRef(false);
  const [resetAsk, setResetAsk] = useState(false);
  void confirmReset;

  return (
    <div className="modal-bg" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal settings">
        <div className="panel-head"><b>Einstellungen</b><button className="x" onClick={onClose}><IconClose /></button></div>
        <div className="seg wide tabs4">
          {([['grafik', 'Grafik'], ['audio', 'Audio'], ['steuerung', 'Steuerung'], ['spiel', 'Spiel']] as [Tab, string][]).map(([id, n]) => (
            <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>{n}</button>
          ))}
        </div>

        {tab === 'grafik' && (
          <div className="set-list">
            <Choice label="Qualität" value={s.quality} options={QUALITIES.map((q, i) => [i, q.name] as [number, string])} onChange={(v) => set({ quality: v })} />
            <Choice label="Schatten" value={s.shadows} options={[['auto', 'Wie Qualität'], ['on', 'An'], ['off', 'Aus']]} onChange={(v) => set({ shadows: v })} />
            <Choice label="Plastische Schatten (AO)" value={s.ao} options={[['auto', 'Wie Qualität'], ['on', 'An'], ['off', 'Aus']]} onChange={(v) => set({ ao: v })} />
            <Slider label="Auflösung" value={s.resScale} min={0.5} max={1.5} step={0.05} fmt={pct} onChange={(v) => set({ resScale: v })} />
            <Slider label="Sichtweite (Details)" value={s.lodScale} min={0.5} max={2} step={0.1} fmt={pct} onChange={(v) => set({ lodScale: v })} />
            <Slider label="Sichtfeld" value={s.fov} min={32} max={75} step={1} fmt={(v) => v + '°'} onChange={(v) => set({ fov: v })} />
            <Choice label="Bildrate begrenzen" value={s.fpsLimit} options={[[0, 'Aus'], [30, '30'], [60, '60'], [120, '120']]} onChange={(v) => set({ fpsLimit: v })} />
            <Toggle label="Automatische Qualität" note="senkt die Grafik, wenn es ruckelt" value={s.autoQuality} onChange={(v) => set({ autoQuality: v })} />
            <Toggle label="Effekte" note="Dampf, Funken" value={s.effects} onChange={(v) => set({ effects: v })} />
            <Toggle label="FPS anzeigen" value={s.showFps} onChange={(v) => set({ showFps: v })} />
            <p className="note">Läuft es ruckelig? Qualität „Niedrig“ wählen oder die Auflösung senken.</p>
          </div>
        )}

        {tab === 'audio' && (
          <div className="set-list">
            <Slider label="Gesamtlautstärke" value={s.master} min={0} max={1} step={0.05} fmt={pct} onChange={(v) => set({ master: v })} />
            <Toggle label="Musik" value={s.musicOn} onChange={(v) => set({ musicOn: v })} />
            <Slider label="Musik-Lautstärke" value={s.music} min={0} max={1} step={0.05} fmt={pct} onChange={(v) => set({ music: v })} />
            <Slider label="Effekte" value={s.sfx} min={0} max={1} step={0.05} fmt={pct} onChange={(v) => set({ sfx: v })} />
            <p className="note">Die Musik wird live im Browser erzeugt. Sie startet nach dem ersten Klick.</p>
          </div>
        )}

        {tab === 'steuerung' && (
          <div className="set-list">
            <Slider label="Maus-Empfindlichkeit" value={s.sensitivity} min={0.3} max={3} step={0.1} fmt={(v) => v.toFixed(1) + '×'} onChange={(v) => set({ sensitivity: v })} />
            <Toggle label="Kamera folgt beim Laufen" note="schwenkt automatisch hinter die Figur" value={s.camFollow} onChange={(v) => set({ camFollow: v })} />
            <Toggle label="Kamera oben/unten umkehren" value={s.invertY} onChange={(v) => set({ invertY: v })} />
            <Toggle label="Immer rennen" note="Shift zum Gehen" value={s.runToggle} onChange={(v) => { set({ runToggle: v }); engine.running = v; }} />
            <h4>Tasten</h4>
            <ul className="help">
              <li><b>V</b> – zwischen Laufen und Bau-Ansicht wechseln</li>
              <li><b>Laufen:</b> WASD bewegen · Shift rennen · Leertaste springen · E Banane greifen / verkaufen · C schälen · Maus ziehen = umsehen</li>
              <li><b>Bau-Ansicht:</b> Maus ziehen = verschieben · rechte Maus = drehen · Mausrad = zoomen · WASD/Q/E</li>
              <li><b>R</b> drehen · <b>B</b> Förderband · <b>X</b> Abriss · <b>Esc</b> abbrechen · <b>U</b> verbessern · <b>Entf</b> abreißen</li>
              <li><b>Shift + Ziehen</b> mehrere auswählen · <b>Strg+C / Strg+V</b> Linie kopieren</li>
              <li>Handy/Tablet: Joystick links unten, Knöpfe rechts; zwei Finger zoomen & drehen</li>
            </ul>
          </div>
        )}

        {tab === 'spiel' && (
          <div className="set-list">
            <Choice label="Ansicht beim Start" value={s.startView} options={[['walk', 'Laufen'], ['build', 'Bau-Ansicht']]} onChange={(v) => set({ startView: v })} />
            <Toggle label="Tipps anzeigen" value={s.hints} onChange={(v) => set({ hints: v })} />
            {!resetAsk
              ? <button className="btn ghost" onClick={() => setResetAsk(true)}>Alle Einstellungen zurücksetzen</button>
              : <div className="confirm"><span>Wirklich alles zurücksetzen?</span><button className="btn" onClick={() => { engine.resetSettings(); setResetAsk(false); }}>Ja</button><button className="btn ghost" onClick={() => setResetAsk(false)}>Nein</button></div>}
          </div>
        )}
      </div>
    </div>
  );
}
