import { useRef, useState } from 'react';
import type { Engine } from '../engine';
import { TOTAL, STAGES, BUILDINGS } from '../sim/defs';
import { QUALITIES } from '../render/world';
import { fmtInt, fmtNum, fmtPct, fmtTime, formatMoney } from './format';
import { IconClose, IconSound, IconMute } from './Icons';
import { isMuted, setMuted } from './sound';

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="modal-bg" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={'modal' + (wide ? ' wide' : '')}>
        <div className="panel-head"><b>{title}</b><button className="x" onClick={onClose}><IconClose /></button></div>
        {children}
      </div>
    </div>
  );
}

export function StatsModal({ engine, onClose }: { engine: Engine; onClose: () => void }) {
  const sim = engine.sim;
  const a = sim.audit();
  const r = sim.rates();
  const st = sim.stats;
  const byStage = sim.factoryByStage();
  const left = TOTAL - st.sold;
  const eta = r.sold > 0.01 ? left / r.sold : Infinity;
  const ok = a.total === TOTAL;
  return (
    <Modal title="Fortschritt & Statistik" onClose={onClose} wide>
      <div className="stat-grid">
        <div className="stat big"><small>Ursprüngliche Menge</small><b>{fmtInt(TOTAL)}</b></div>
        <div className="stat big"><small>Im Haufen</small><b>{fmtInt(a.pile)}</b></div>
        <div className="stat big"><small>In der Fabrik</small><b>{fmtInt(a.factory)}</b></div>
        <div className="stat big"><small>Im Handbereich</small><b>{fmtInt(a.manual)}</b></div>
        <div className="stat big"><small>Verkauft</small><b>{fmtInt(a.sold)}</b></div>
        <div className="stat big"><small>Abgebaut (entnommen)</small><b>{fmtInt(TOTAL - a.pile)}</b></div>
      </div>
      <div className="bars">
        <label>Abbaufortschritt <b>{fmtPct(1 - a.pile / TOTAL)}</b></label>
        <div className="bar"><i style={{ width: `${(1 - a.pile / TOTAL) * 100}%` }} /></div>
        <label>Gesamtfortschritt (verkauft) <b>{fmtPct(a.sold / TOTAL)}</b></label>
        <div className="bar sold"><i style={{ width: `${(a.sold / TOTAL) * 100}%` }} /></div>
      </div>
      <div className={'check ' + (ok ? 'ok' : 'bad')}>
        Kontrolle: {fmtInt(a.pile)} + {fmtInt(a.factory + a.manual)} + {fmtInt(a.sold)} = <b>{fmtInt(a.total)}</b> {ok ? '✓' : '✗'}
      </div>
      <div className="stat-grid">
        <div className="stat"><small>Einnahmen pro Sekunde</small><b>{formatMoney(r.income)}</b></div>
        <div className="stat"><small>Entnahme pro Sekunde</small><b>{fmtNum(r.grab)}</b></div>
        <div className="stat"><small>Verkauf pro Sekunde</small><b>{fmtNum(r.sold)}</b></div>
        <div className="stat"><small>Geschätzte Restzeit</small><b>{fmtTime(eta)}</b></div>
        <div className="stat"><small>Spielzeit</small><b>{fmtTime(st.time)}</b></div>
        <div className="stat"><small>Umsatz gesamt</small><b>{formatMoney(st.revenue)}</b></div>
        <div className="stat"><small>Ø Wert pro Banane</small><b>{formatMoney(st.sold ? st.soldValue / st.sold : 0)}</b></div>
        <div className="stat"><small>Höchster Kontostand</small><b>{formatMoney(st.maxMoney)}</b></div>
      </div>
      <h4>Bananen in der Fabrik nach Zustand</h4>
      <div className="stage-table">
        {STAGES.map((s, i) => (
          <div key={i} className="stage-row">
            {engine.icons['stage' + i] ? <img src={engine.icons['stage' + i]} alt="" /> : <i style={{ background: s.color }} />}
            <span>{s.name}</span>
            <small>{s.value} $</small>
            <b>{fmtInt(byStage[i])}</b>
          </div>
        ))}
      </div>
    </Modal>
  );
}

export function MenuModal({ engine, onClose, onLogout, onSettings }: { engine: Engine; onClose: () => void; onLogout: () => void; onSettings: () => void }) {
  const file = useRef<HTMLInputElement>(null);
  const [confirm, setConfirm] = useState(false);
  return (
    <Modal title="Menü" onClose={onClose}>
      {engine.mode !== 'offline' && engine.net.me && (
        <div className="account">
          <span>Angemeldet als <b>{engine.net.me.name}</b>{engine.mode === 'guest' ? ` – zu Gast bei ${engine.worldOwnerName}` : ''}</span>
          <button className="btn small ghost" onClick={onLogout}>Abmelden</button>
        </div>
      )}
      {engine.mode === 'offline' && import.meta.env.VITE_SOLO !== '1' && (
        <div className="account"><span>Offline-Modus (ohne Konto)</span><button className="btn small" onClick={onLogout}>Anmelden für Online</button></div>
      )}
      <div className="menu-list">
        <button className="btn" onClick={() => { engine.save().then(() => engine.toast('Gespeichert.', 'good')); }}>Jetzt speichern</button>
        {import.meta.env.VITE_SOLO !== '1' && <button className="btn ghost" onClick={() => engine.exportSave()}>Spielstand exportieren</button>}
        {engine.mode !== 'guest' && <button className="btn ghost" onClick={() => file.current?.click()}>Spielstand importieren</button>}
        <input ref={file} type="file" accept=".json,application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) { engine.importSave(f); onClose(); } e.target.value = ''; }} />
        {engine.mode === 'guest' ? null : !confirm
          ? <button className="btn danger" onClick={() => setConfirm(true)}>Neues Spiel starten …</button>
          : <div className="confirm"><span>Wirklich? Die aktuelle Fabrik wird gelöscht.</span><button className="btn danger" onClick={() => { engine.newGame(); onClose(); }}>Ja, neu starten</button><button className="btn ghost" onClick={() => setConfirm(false)}>Abbrechen</button></div>}
      </div>
      <button className="btn ghost wide-btn" onClick={() => { onClose(); onSettings(); }}>Einstellungen (Grafik, Audio, Steuerung)</button>
      <p className="note">{engine.mode === 'guest' ? 'Der Besitzer der Fabrik speichert automatisch.' : engine.mode === 'host' ? 'Online gespeichert' : 'Automatisch gespeichert'} {engine.mode !== 'guest' ? (engine.lastSaved ? ` um ${new Date(engine.lastSaved).toLocaleTimeString('de-DE')}` : ' –') : ''}. Wenn das Spiel geschlossen ist, steht die Fabrik still.</p>
    </Modal>
  );
}

export function EndScreen({ engine, onClose }: { engine: Engine; onClose: () => void }) {
  const sim = engine.sim;
  const st = sim.stats;
  let machines = 0, belts = 0;
  for (const e of sim.ents.values()) { if (e.kind === 'belt') belts++; else if (BUILDINGS[e.type]) machines++; }
  return (
    <div className="modal-bg end">
      <div className="modal wide">
        <div className="end-title">
          <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden><path d="M8 38 Q30 60 56 20 Q51 15 46 20 Q34 44 10 32 Z" fill="#ffd21f" stroke="#a07800" strokeWidth="3" /></svg>
          <div><h2>Der Bananenberg ist verschwunden!</h2><p>Alle 1.000.000 Bananen wurden verkauft.</p></div>
        </div>
        <div className="stat-grid">
          <div className="stat big"><small>Gesamte Spielzeit</small><b>{fmtTime(st.finishedAt || st.time)}</b></div>
          <div className="stat big"><small>Gesamter Umsatz</small><b>{formatMoney(st.revenue)}</b></div>
          <div className="stat big"><small>Ø Verkaufswert pro Banane</small><b>{formatMoney(st.soldValue / Math.max(1, st.sold))}</b></div>
          <div className="stat big"><small>Gebaute Maschinen</small><b>{fmtInt(st.built)}</b><small>davon stehen noch {fmtInt(machines)}</small></div>
          <div className="stat big"><small>Länge aller Förderbänder</small><b>{fmtInt(belts)} Felder</b></div>
          <div className="stat big"><small>Höchste Produktion</small><b>{fmtNum(st.maxSoldRate)} Verkäufe/s</b><small>{fmtNum(st.maxGrabRate)} Entnahmen/s · {formatMoney(st.maxIncomeRate)}/s</small></div>
          <div className="stat big"><small>Manuell geschält</small><b>{fmtPct(st.manualPeeledSold / TOTAL)}</b></div>
          <div className="stat big"><small>Automatisch verarbeitet</small><b>{fmtPct(st.autoProcessedSold / TOTAL)}</b></div>
          <div className="stat big"><small>Höchster Kontostand</small><b>{formatMoney(st.maxMoney)}</b></div>
        </div>
        <div className="actions row">
          <button className="btn" onClick={onClose}>Fabrik weiter ansehen</button>
          <button className="btn ghost" onClick={() => { engine.newGame(); onClose(); }}>Neues Spiel</button>
        </div>
      </div>
    </div>
  );
}

// Tipps für den Anfang (Phase 1 → 2 → 3)
export function hintFor(engine: Engine): string | null {
  const sim = engine.sim;
  const slots = engine.myManual().slots;
  let collectors = 0, machines = 0, belts = 0;
  for (const e of sim.ents.values()) {
    if (e.kind === 'belt') belts++;
    else if (BUILDINGS[e.type].category === 'collector') collectors++;
    else if (BUILDINGS[e.type].category === 'machine') machines++;
  }
  const walk = engine.view === 'walk';
  if (sim.stats.sold === 0 && !slots.length) return walk
    ? 'Lauf mit WASD zum gelben Bananenberg und drück E (oder klick auf den Berg), um eine Banane zu nehmen. V wechselt zur Bau-Ansicht.'
    : 'Klicke auf den gelben Bananenberg, um deine erste Banane zu nehmen.';
  if (sim.stats.sold === 0 && slots.some((s) => s.mask !== 7)) return 'Ziehe im Schälbereich die Schale nach unten – drei Streifen.';
  if (sim.stats.sold === 0) return 'Geschält! Klicke auf „Verkaufen“ – das bringt 3 $.';
  if (!collectors && sim.money < 50) return `Weiter schälen! Bei 50 $ kannst du deinen ersten Greifarm kaufen. (Tipp: „Werkstatt“ im Schälbereich)`;
  if (!collectors) return 'Du kannst dir einen Kleinen Greifarm leisten! „Sammeln“ → am Rand des Berges platzieren (gelber Kreis = Arbeitsradius).';
  if (!belts) return 'Verbinde den orangen Ausgangspfeil des Greifarms mit Förderbändern (ziehen!) bis zur Verkaufsstation.';
  if (!machines && sim.money >= 100) return 'Baue eine Schälmaschine in die Linie – geschälte Bananen bringen 3 $ statt 1 $. Eingang = grüne Pfeile.';
  if (machines && sim.stats.time < 1200 && sim.money >= 250 && machines < 2) return 'Nächster Schritt: Schneidemaschine hinter die Schälmaschine – 6 $ pro Banane!';
  return null;
}

export { formatMoney };
