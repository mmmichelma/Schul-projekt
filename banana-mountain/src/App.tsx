import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Engine } from './engine';
import { TopBar } from './ui/TopBar';
import { BuildBar } from './ui/BuildBar';
import { InfoPanel } from './ui/InfoPanel';
import { PeelPanel } from './ui/PeelPanel';
import { StatsModal, MenuModal, EndScreen, hintFor } from './ui/Modals';
import { formatMoney, fmtInt } from './ui/format';
import { stageValue } from './sim/sim';
import { IconCrate, IconClose } from './ui/Icons';
import { sfx } from './ui/sound';
import { StartScreen, FriendsModal, PlayersBar, ChatBox } from './ui/OnlineUI';

const engine = new Engine();
(window as unknown as { __bm: Engine }).__bm = engine;

export default function App() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const [modal, setModal] = useState<'none' | 'stats' | 'menu' | 'friends'>('none');
  const [needLogin, setNeedLogin] = useState(false);
  const [endSeen, setEndSeen] = useState(false);
  const [hideHint, setHideHint] = useState<string | null>(null);
  useSyncExternalStore(engine.subscribe, engine.getVersion);

  useEffect(() => {
    let alive = true;
    if (!canvas.current) return;
    engine.attach(canvas.current);
    // Angemeldet geblieben? Dann direkt in die eigene Fabrik
    engine.net.resume().then(async (me) => {
      if (!alive) return;
      if (me) {
        try { await engine.startOnline(); setReady(true); return; } catch (e) { engine.toast('Online-Fabrik konnte nicht geladen werden: ' + (e as Error).message, 'bad'); }
      }
      setNeedLogin(true);
    });
    return () => { alive = false; engine.detach(); };
  }, []);

  // Kleiner Klang, wenn die Fabrik Geld verdient
  const lastRev = useRef(0);
  useEffect(() => {
    const id = setInterval(() => {
      const r = engine.sim.stats.revenue;
      if (r > lastRev.current + 0.5 && engine.sim.stats.factorySold > 0) sfx.coin();
      lastRev.current = r;
    }, 1600);
    return () => clearInterval(id);
  }, []);

  const sim = engine.sim;
  const hint = ready ? hintFor(engine) : null;
  const salvage = sim.salvage;

  return (
    <div className="app">
      <canvas ref={canvas} className="game-canvas" />
      {needLogin && !ready && <StartScreen engine={engine} onDone={() => { setNeedLogin(false); setReady(true); }} />}
      {!ready && !needLogin && (
        <div className="loading">
          <svg width="80" height="80" viewBox="0 0 64 64" aria-hidden><path d="M8 38 Q30 60 56 20 Q51 15 46 20 Q34 44 10 32 Z" fill="#ffd21f" stroke="#a07800" strokeWidth="3" /></svg>
          <b>Banana Mountain</b>
          <span>Der Bananenberg wird aufgeschüttet …</span>
        </div>
      )}
      {ready && (
        <>
          <TopBar engine={engine} onStats={() => setModal('stats')} onMenu={() => setModal('menu')} onFriends={() => setModal('friends')} />
          <PlayersBar engine={engine} />
          <ChatBox engine={engine} />
          {hint && hint !== hideHint && (
            <div className="hint">
              <span>{hint}</span>
              <button className="x" onClick={() => setHideHint(hint)}><IconClose size={14} /></button>
            </div>
          )}
          <PeelPanel engine={engine} />
          <InfoPanel engine={engine} />
          {salvage.length > 0 && (
            <div className="salvage">
              <IconCrate />
              <span>Bergungskiste: <b>{fmtInt(salvage.length)}</b> Bananen ({formatMoney(salvage.reduce((a, it) => a + stageValue(it), 0))})</span>
              <button className="btn small" onClick={() => engine.sellSalvage()}>Verkaufen</button>
            </div>
          )}
          <BuildBar engine={engine} />
          {engine.tooltip && (
            <div className={'tooltip' + (engine.tooltip.ok ? '' : ' bad')} style={{ left: engine.tooltip.x + 16, top: engine.tooltip.y + 18 }}>{engine.tooltip.text}</div>
          )}
          <div className="toasts">
            {engine.toasts.map((t) => <div key={t.id} className={'toast ' + t.kind}>{t.text}</div>)}
          </div>
          {modal === 'stats' && <StatsModal engine={engine} onClose={() => setModal('none')} />}
          {modal === 'menu' && <MenuModal engine={engine} onClose={() => setModal('none')} onLogout={() => { setModal('none'); setReady(false); engine.logout().then(() => setNeedLogin(true)); }} />}
          {modal === 'friends' && <FriendsModal engine={engine} onClose={() => setModal('none')} />}
          {sim.finished && !endSeen && <EndScreen engine={engine} onClose={() => setEndSeen(true)} />}
        </>
      )}
    </div>
  );
}
