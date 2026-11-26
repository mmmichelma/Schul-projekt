import type { Engine } from '../engine';
import { BUILDINGS, BELT_TIERS, STAGES, MAX_LEVEL, machineSpeed, qualityMult, collectorRadius, bufferCap, beltThroughput, LOGISTIC_CAP } from '../sim/defs';
import type { Item, Building } from '../sim/sim';
import { formatMoney, fmtInt, fmtNum, fmtPct } from './format';
import { IconUp, IconRotate, IconMove, IconPower, IconTrash, IconCopy, IconClose } from './Icons';
import { sfx } from './sound';

const STATUS_TEXT = { working: 'Arbeitet', idle: 'Keine Bananen', blocked: 'Ausgang blockiert', off: 'Deaktiviert' };

function stageSummary(items: Item[]) {
  if (!items.length) return '0';
  const counts = new Map<number, number>();
  for (const it of items) counts.set(it.s, (counts.get(it.s) || 0) + 1);
  return [...counts].map(([s, n]) => `${n}× ${STAGES[s].short}`).join(', ');
}

export function InfoPanel({ engine }: { engine: Engine }) {
  const sim = engine.sim;
  const sel = engine.selection;
  if (!sel.length) return null;
  const close = () => engine.select([]);

  if (sel.length > 1) {
    const cost = engine.upgradeSelectionCost();
    return (
      <aside className="panel info">
        <div className="panel-head"><b>{sel.length} Teile ausgewählt</b><button className="x" onClick={close}><IconClose /></button></div>
        <div className="actions">
          <button className="btn" disabled={!cost || sim.money < cost} onClick={() => { engine.upgradeSelection(); sfx.upgrade(); }}><IconUp />Alle verbessern {cost ? formatMoney(cost) : ''}</button>
          <button className="btn ghost" onClick={() => engine.toggleSelection()}><IconPower />An / Aus</button>
          <button className="btn ghost" onClick={() => engine.copySelection()}><IconCopy />Linie kopieren</button>
          <button className="btn danger" onClick={() => engine.demolishSelection()}><IconTrash />Abreißen</button>
        </div>
      </aside>
    );
  }

  const e = sim.get(sel[0]);
  if (!e) return null;
  const upPrice = sim.upgradePrice(e.id);

  if (e.kind === 'belt') {
    const tier = BELT_TIERS[e.tier];
    return (
      <aside className="panel info">
        <div className="panel-head"><b>{tier.name}-Förderband</b><button className="x" onClick={close}><IconClose /></button></div>
        <dl>
          <dt>Durchsatz</dt><dd>{fmtNum(beltThroughput(e.tier), 0)} Bananen/s</dd>
          <dt>Plätze</dt><dd>{e.items.length} / {tier.cap}</dd>
          <dt>Inhalt</dt><dd>{stageSummary(e.items)}</dd>
        </dl>
        <div className="actions">
          {upPrice !== null && <button className="btn" disabled={sim.money < upPrice} onClick={() => { sim.upgrade(e.id); sfx.upgrade(); engine.emit(); }}><IconUp />Zu {BELT_TIERS[e.tier + 1].name} {formatMoney(upPrice)}</button>}
          <button className="btn ghost" onClick={() => engine.rotateTool()}><IconRotate />Drehen</button>
          <button className="btn ghost" onClick={() => engine.startMove()}><IconMove />Verschieben</button>
          <button className="btn danger" onClick={() => engine.demolishSelection()}><IconTrash />Abreißen (+{formatMoney(e.invested)})</button>
        </div>
      </aside>
    );
  }

  const b = e as Building;
  const def = BUILDINGS[b.type];
  const cat = def.category;
  const speed = machineSpeed(def, b.level);
  return (
    <aside className="panel info">
      <div className="panel-head">
        {engine.icons[b.type] && <img src={engine.icons[b.type]} alt="" className="head-icon" />}
        <div>
          <b>{def.name}</b>
          <span className={'status ' + b.status}>{STATUS_TEXT[b.status]}</span>
        </div>
        <button className="x" onClick={close}><IconClose /></button>
      </div>
      <dl>
        {def.upgradable && <><dt>Level</dt><dd><span className="lvl">{b.level}</span> / {MAX_LEVEL}</dd></>}
        {(cat === 'collector' || cat === 'machine') && <><dt>Geschwindigkeit</dt><dd>{fmtNum(speed, 2)} Bananen/s</dd></>}
        {cat === 'collector' && <>
          <dt>Arbeitsradius</dt><dd>{collectorRadius(def, b.level)} Felder</dd>
          <dt>Bananen im Radius</dt><dd>{fmtInt(sim.bananasInRadius(b))}</dd>
        </>}
        {cat === 'machine' && <>
          <dt>Verarbeitung</dt><dd>{STAGES[def.inStage!].short} → {STAGES[def.inStage! + 1].short}</dd>
          <dt>Qualitätsbonus</dt><dd>×{qualityMult(b.level).toFixed(2).replace('.', ',')}</dd>
        </>}
        {cat === 'sell' && <><dt>Kapazität</dt><dd>{def.rate} Bananen/s</dd><dt>Verkauft</dt><dd>{fmtInt(b.processed)}</dd></>}
        {(cat === 'collector' || cat === 'machine') && <><dt>Auslastung</dt><dd>{fmtPct(Math.min(1, b.busy), 0)}</dd></>}
        {cat === 'machine' && <><dt>Eingang</dt><dd>{b.inBuf.length} / {bufferCap(speed)} {b.inBuf.length ? `(${stageSummary(b.inBuf)})` : ''}</dd></>}
        {(cat === 'collector' || cat === 'machine') && <><dt>Ausgang</dt><dd>{b.outBuf.length} / {bufferCap(speed)} {b.outBuf.length ? `(${stageSummary(b.outBuf)})` : ''}</dd></>}
        {cat === 'storage' && <><dt>Bestand</dt><dd>{fmtInt(b.inBuf.length)} / {fmtInt(def.capacity!)}</dd><dt>Inhalt</dt><dd>{stageSummary(b.inBuf)}</dd><dt>Ausgabe</dt><dd>{def.rate}/s</dd></>}
        {cat === 'logistic' && b.type !== 'tunnelIn' && <><dt>Puffer</dt><dd>{b.outBuf.length} / {LOGISTIC_CAP}</dd></>}
        {b.type === 'tunnelIn' && <><dt>Verbindung</dt><dd>{b.link ? 'Mit Ausgang verbunden' : 'Kein Ausgang in Reichweite (6 Felder, gleiche Richtung)'}</dd><dt>Unterwegs</dt><dd>{b.transit.length}</dd></>}
        {(cat === 'collector' || cat === 'machine') && <><dt>Gesamt</dt><dd>{fmtInt(b.processed)} Bananen</dd></>}
        {upPrice !== null && <><dt>Upgrade-Kosten</dt><dd>{formatMoney(upPrice)}</dd></>}
      </dl>
      {b.type === 'filter' && (
        <div className="filter-pick">
          <small>Geradeaus durchlassen:</small>
          <div className="stage-chips">
            {STAGES.map((s, i) => (
              <button key={i} className={b.filter === i ? 'active' : ''} onClick={() => { sim.setFilter(b.id, i); engine.emit(); }} title={s.name}>
                <i style={{ background: s.color }} />{s.short}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="actions">
        {upPrice !== null && (
          <button className="btn" disabled={sim.money < upPrice} onClick={() => { if (sim.upgrade(b.id)) sfx.upgrade(); engine.emit(); }}>
            <IconUp />Verbessern auf Level {b.level + 1} – {formatMoney(upPrice)}
          </button>
        )}
        <button className="btn ghost" onClick={() => engine.rotateTool()}><IconRotate />Drehen</button>
        <button className="btn ghost" onClick={() => engine.startMove()}><IconMove />Verschieben</button>
        <button className="btn ghost" onClick={() => engine.toggleSelection()}><IconPower />{b.enabled ? 'Deaktivieren' : 'Aktivieren'}</button>
        <button className="btn ghost" onClick={() => engine.copySelection()}><IconCopy />Kopieren</button>
        <button className="btn danger" onClick={() => { sfx.build(); engine.demolishSelection(); }}><IconTrash />Abreißen (+{formatMoney(b.invested)})</button>
      </div>
    </aside>
  );
}
