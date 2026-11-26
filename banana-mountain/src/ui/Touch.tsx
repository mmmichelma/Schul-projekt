import { useEffect, useRef, useState } from 'react';
import type { Engine } from '../engine';

// Joystick und Knöpfe für Handy/Tablet im Laufen-Modus
export function TouchControls({ engine }: { engine: Engine }) {
  const [coarse, setCoarse] = useState(false);
  const base = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const active = useRef<number | null>(null);

  useEffect(() => {
    try { setCoarse(window.matchMedia('(pointer: coarse)').matches); } catch { /* egal */ }
  }, []);
  if (!coarse || engine.view !== 'walk') return null;

  const move = (e: React.PointerEvent) => {
    if (active.current !== e.pointerId || !base.current) return;
    const r = base.current.getBoundingClientRect();
    let x = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
    let y = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    setKnob({ x, y });
    engine.joy.x = x;
    engine.joy.y = y;
    engine.running = l > 0.85 || engine.settings.runToggle;
  };
  const end = () => { active.current = null; setKnob({ x: 0, y: 0 }); engine.joy.x = 0; engine.joy.y = 0; engine.running = engine.settings.runToggle; };

  return (
    <>
      <div
        className="joystick" ref={base}
        onPointerDown={(e) => { active.current = e.pointerId; (e.target as HTMLElement).setPointerCapture(e.pointerId); move(e); }}
        onPointerMove={move} onPointerUp={end} onPointerCancel={end}
      >
        <i style={{ transform: `translate(${knob.x * 38}px, ${knob.y * 38}px)` }} />
      </div>
      <div className="touch-btns">
        {engine.stationNear && engine.myManual().slots.length
          ? <button className="sell" onPointerDown={() => engine.manualSellAll()}>Verkaufen</button>
          : <button onPointerDown={() => engine.grabNear()}>Greifen</button>}
        <button onPointerDown={() => engine.jump()}>Springen</button>
      </div>
    </>
  );
}
