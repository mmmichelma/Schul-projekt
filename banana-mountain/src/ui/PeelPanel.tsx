import { useEffect, useRef, useState } from 'react';
import type { Engine } from '../engine';
import { MANUAL_UPGRADES, PEEL_DISTANCE, AUTOGRAB_RATE, APPRENTICE_RATE } from '../sim/defs';
import { PeelView } from '../render/peelView';
import { formatMoney } from './format';
import { IconHand, IconClose } from './Icons';
import { sfx } from './sound';

export function PeelPanel({ engine }: { engine: Engine }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const view = useRef<PeelView | null>(null);
  const drag = useRef<{ y: number; id: number } | null>(null);
  const [open, setOpen] = useState(true);
  const [tab, setTab] = useState<'peel' | 'shop'>('peel');
  const [pops, setPops] = useState<{ id: number; text: string }[]>([]);
  const sim = engine.sim;
  const m = engine.myManual();
  const hands = engine.myHands();
  // Auf kleinen Bildschirmen weicht der Schälbereich der Bauleiste aus
  const small = typeof window !== 'undefined' && window.innerWidth < 640;
  const collapsed = !open || (small && (engine.buildMenuOpen || engine.tool.kind !== 'select' || engine.selection.length > 0));

  useEffect(() => {
    if (collapsed || tab !== 'peel' || !canvas.current) return;
    const v = new PeelView(canvas.current);
    view.current = v;
    let raf = 0, last = performance.now();
    const el = canvas.current;
    const rs = () => { const r = el.getBoundingClientRect(); v.resize(r.width, r.height); };
    rs();
    const ro = new ResizeObserver(rs);
    ro.observe(el);
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      v.sync(engine.myManual().slots);
      v.render(Math.min(0.1, (now - last) / 1000));
      last = now;
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); v.dispose(); view.current = null; };
  }, [collapsed, tab, engine]);

  // Geld-Popups beim Verkauf aus dem Handbereich
  const soldRef = useRef(sim.stats.manualPeeledSold * 3 + sim.stats.manualRawSold);
  useEffect(() => {
    const now = sim.stats.manualPeeledSold * 3 + sim.stats.manualRawSold;
    if (now > soldRef.current) {
      const v = now - soldRef.current;
      sfx.coin();
      const id = Math.random();
      setPops((p) => [...p.slice(-3), { id, text: `+${formatMoney(v)}` }]);
      setTimeout(() => setPops((p) => p.filter((x) => x.id !== id)), 900);
    }
    soldRef.current = now;
  });

  const onDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    if (!m.slots.length) { if (engine.grabFromPile()) sfx.grab(); return; }
    drag.current = { y: e.clientY, id: e.pointerId };
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    if (e.clientY - d.y > PEEL_DISTANCE[m.up.finger]) {
      const r = (e.target as HTMLElement).getBoundingClientRect();
      const strip = Math.max(0, Math.min(2, Math.floor(((e.clientX - r.left) / r.width) * 3)));
      if (engine.peelStrip(strip) > 0) sfx.peel();
      d.y = e.clientY;
    }
  };
  const onUp = () => { drag.current = null; };

  const peeled = m.slots.filter((s) => s.mask === 7).length;
  const raw = m.slots.length - peeled;
  const hint = !m.slots.length
    ? 'Klicke auf den Bananenberg (oder hier), um eine Banane zu nehmen.'
    : peeled === m.slots.length
      ? 'Fertig geschält! Jetzt verkaufen.'
      : 'Ziehe die Schale nach unten – links, Mitte oder rechts.';

  if (collapsed) {
    return (
      <button className="peel-mini" onClick={() => setOpen(true)} title="Schälbereich öffnen">
        <IconHand /> {m.slots.length}/{hands}
      </button>
    );
  }

  return (
    <section className="panel peel">
      <div className="panel-head">
        <IconHand />
        <b>Schälbereich</b>
        <span className="hands">{m.slots.length} / {hands} Hände</span>
        <div className="seg">
          <button className={tab === 'peel' ? 'active' : ''} onClick={() => setTab('peel')}>Schälen</button>
          <button className={tab === 'shop' ? 'active' : ''} onClick={() => setTab('shop')}>Werkstatt</button>
        </div>
        <button className="x" onClick={() => setOpen(false)}><IconClose /></button>
      </div>
      {tab === 'peel' ? (
        <>
          <div className="peel-stage">
            <canvas ref={canvas} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} />
            {m.slots.length > 0 && peeled < m.slots.length && (
              <div className="peel-arrows" aria-hidden><span>↓</span><span>↓</span><span>↓</span></div>
            )}
            {pops.map((p) => <div key={p.id} className="peel-pop">{p.text}</div>)}
            <div className="peel-hint">{hint}</div>
          </div>
          <div className="peel-actions">
            <button className="btn ghost" onClick={() => { engine.grabFromPile(); sfx.grab(); }} disabled={m.slots.length >= hands}>Banane nehmen</button>
            <button className="btn" disabled={!m.slots.length} onClick={() => engine.manualSellAll()}>
              Verkaufen {m.slots.length ? formatMoney(peeled * 3 + raw) : ''}
            </button>
          </div>
          {raw > 0 && peeled > 0 && <small className="note">Ungeschälte Bananen bringen nur 1 $.</small>}
        </>
      ) : (
        <div className="manual-shop">
          {MANUAL_UPGRADES.map((u) => {
            const lvl = m.up[u.id];
            const cost = sim.manualUpgradeCost(u.id, engine.pid);
            const extra = u.id === 'autograb' && lvl ? ` (${AUTOGRAB_RATE[lvl]}/s)` : u.id === 'apprentice' && lvl ? ` (${APPRENTICE_RATE[lvl]} Streifen/s)` : '';
            return (
              <div key={u.id} className="mup">
                <div>
                  <b>{u.name}{extra}</b>
                  <small>{u.desc}</small>
                  <div className="pips">{u.costs.map((_, i) => <i key={i} className={i < lvl ? 'on' : ''} />)}</div>
                </div>
                <button className="btn small" disabled={cost === null || sim.money < cost} onClick={() => { engine.buyManual(u.id); sfx.upgrade(); }}>
                  {cost === null ? 'Max' : formatMoney(cost)}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
