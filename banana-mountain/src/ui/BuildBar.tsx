import { useState } from 'react';
import type { Engine } from '../engine';
import { BUILDING_LIST, BELT_TIERS, Category, beltThroughput } from '../sim/defs';
import { formatMoney, fmtNum } from './format';
import { IconCursor, IconBox, IconTrash, IconRotate } from './Icons';
import { sfx } from './sound';

type Tab = Category | 'belt';
const TABS: { id: Tab; name: string }[] = [
  { id: 'collector', name: 'Sammeln' },
  { id: 'belt', name: 'Förderbänder' },
  { id: 'machine', name: 'Produktion' },
  { id: 'logistic', name: 'Logistik' },
  { id: 'storage', name: 'Lager' },
  { id: 'sell', name: 'Verkauf' },
];

export function BuildBar({ engine }: { engine: Engine }) {
  const [tab, setTab] = useState<Tab | null>(null);
  engine.buildMenuOpen = tab !== null;
  const t = engine.tool;
  const money = engine.sim.money;

  const items = tab === 'belt'
    ? BELT_TIERS.map((b, i) => ({
      key: 'belt' + i, name: `${b.name}-Band`, price: b.price, sub: `${fmtNum(beltThroughput(i), 0)}/s · ${formatMoney(b.price)}/Feld`,
      active: t.kind === 'belt' && t.tier === i, pick: () => engine.setTool({ kind: 'belt', tier: i, dir: t.kind === 'belt' ? t.dir : 0 }),
      icon: engine.icons['belt' + i],
    }))
    : tab
      ? BUILDING_LIST.filter((d) => d.category === tab).map((d) => ({
        key: d.id, name: d.name, price: d.price,
        sub: d.category === 'collector' ? `${d.speed}/s · Radius ${d.radius}`
          : d.category === 'machine' ? `${d.speed}/s · ${d.desc}`
            : d.category === 'sell' ? `${d.rate}/s` : d.capacity ? `${fmtNum(d.capacity, 0)} Plätze` : '',
        desc: d.desc,
        active: t.kind === 'build' && t.type === d.id,
        pick: () => engine.setTool({ kind: 'build', type: d.id, dir: t.kind === 'build' ? t.dir : 0 }),
        icon: engine.icons[d.id],
      }))
      : [];

  return (
    <div className="buildbar">
      {tab && (
        <div className="build-items">
          {items.map((it) => (
            <button
              key={it.key}
              className={'build-item' + (it.active ? ' active' : '') + (money < it.price ? ' poor' : '')}
              onClick={() => { sfx.grab(); it.pick(); }}
              title={'desc' in it ? String(it.desc) : it.name}
            >
              {it.icon ? <img src={it.icon} alt="" draggable={false} /> : <div className="img-ph" />}
              <b>{it.name}</b>
              <small>{it.sub}</small>
              <span className="price">{formatMoney(it.price)}</span>
            </button>
          ))}
        </div>
      )}
      <div className="build-tabs">
        <button className={'tool' + (t.kind === 'select' && !t.box ? ' active' : '')} onClick={() => { engine.setTool({ kind: 'select' }); setTab(null); }} title="Auswählen / Bananen nehmen (Esc)">
          <IconCursor /><span>Auswahl</span>
        </button>
        <button className={'tool' + (t.kind === 'select' && t.box ? ' active' : '')} onClick={() => { engine.setTool({ kind: 'select', box: true }); setTab(null); }} title="Mehrere auswählen (oder Shift + Ziehen)">
          <IconBox /><span>Mehrere</span>
        </button>
        <div className="sep" />
        {TABS.map((tb) => (
          <button key={tb.id} className={'tab' + (tab === tb.id ? ' active' : '')} onClick={() => setTab(tab === tb.id ? null : tb.id)}>
            {tb.name}
          </button>
        ))}
        <div className="sep" />
        {(t.kind === 'build' || t.kind === 'belt' || t.kind === 'move') && (
          <button className="tool" onClick={() => engine.rotateTool()} title="Drehen (R)"><IconRotate /><span>Drehen</span></button>
        )}
        <button className={'tool danger' + (t.kind === 'demolish' ? ' active' : '')} onClick={() => { engine.setTool(t.kind === 'demolish' ? { kind: 'select' } : { kind: 'demolish' }); setTab(null); }} title="Abreißen (X) – 100 % Erstattung">
          <IconTrash /><span>Abriss</span>
        </button>
      </div>
    </div>
  );
}
