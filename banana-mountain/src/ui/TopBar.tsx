import type { Engine } from '../engine';
import { TOTAL, PHASES } from '../sim/defs';
import { fmtInt, fmtNum, fmtPct, formatMoney } from './format';
import { IconCoin, IconBanana, IconGauge, IconBolt, IconChart, IconMenu, IconUsers, IconGear, IconWalk, IconMap } from './Icons';

export function TopBar({ engine, onStats, onMenu, onFriends, onSettings, onRoom }: { engine: Engine; onStats: () => void; onMenu: () => void; onFriends: () => void; onSettings: () => void; onRoom: () => void }) {
  const sim = engine.sim;
  const r = sim.rates();
  const progress = sim.stats.sold / TOTAL;
  return (
    <header className="topbar">
      <div className="brand">
        <svg width="26" height="26" viewBox="0 0 64 64" aria-hidden><path d="M8 38 Q30 60 56 20 Q51 15 46 20 Q34 44 10 32 Z" fill="#ffd21f" stroke="#a07800" strokeWidth="3" /></svg>
        <div>
          <b>Banana Mountain</b>
          <small>{PHASES[sim.phase()]}</small>
        </div>
      </div>
      <div className="chips">
        <div className="chip money" title="Kontostand"><IconCoin /><span>{formatMoney(sim.money)}</span></div>
        <div className="chip" title="Verbleibende Bananen im Haufen"><IconBanana /><span>{fmtInt(sim.pileRemaining)}</span></div>
        <div className="chip progress" title="Gesamtfortschritt (verkaufte Bananen)">
          <IconGauge />
          <span>{fmtPct(progress)}</span>
          <i style={{ width: `${progress * 100}%` }} />
        </div>
        <div className="chip" title="Einnahmen pro Sekunde"><IconChart /><span>{formatMoney(r.income)}/s</span></div>
        <div className="chip" title="Entnommene Bananen pro Sekunde"><IconBolt /><span>{fmtNum(r.grab)} B/s</span></div>
      </div>
      <div className="top-actions">
        {engine.settings.showFps && <span className="fps">{engine.fps} FPS · {engine.r?.drawCalls ?? 0} DC</span>}
        <button className={'icon-btn view-btn' + (engine.view === 'walk' ? ' walk' : '')} onClick={() => engine.toggleView()} title="Ansicht wechseln (V)">
          {engine.view === 'walk' ? <><IconMap /><span className="hide-sm">Bau-Ansicht</span></> : <><IconWalk /><span className="hide-sm">Laufen</span></>}
        </button>
        {(import.meta.env.VITE_SOLO === '1' || engine.roomMode) && (
          <button className={'icon-btn' + (engine.roomMode ? ' live' : '')} onClick={onRoom} title="Mehrspieler">
            <IconUsers /><span className="hide-sm">Mehrspieler</span>
            {!engine.roomMode && engine.roomGames.length > 0 && <em className="badge">{engine.roomGames.length}</em>}
          </button>
        )}
        {engine.mode !== 'offline' && !engine.roomMode && (
          <button className="icon-btn" onClick={onFriends} title="Freunde">
            <IconUsers /><span className="hide-sm">Freunde</span>
            {engine.net.friends.filter((f) => f.status === 'incoming').length > 0 && <em className="badge">{engine.net.friends.filter((f) => f.status === 'incoming').length}</em>}
          </button>
        )}
        <button className="icon-btn" onClick={onStats} title="Statistik"><IconChart /><span className="hide-sm">Statistik</span></button>
        <button className="icon-btn" onClick={onSettings} title="Einstellungen"><IconGear /></button>
        <button className="icon-btn" onClick={onMenu} title="Menü"><IconMenu /><span className="hide-sm">Menü</span></button>
      </div>
    </header>
  );
}
