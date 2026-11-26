/*
 * Alle Änderungen an der Fabrik laufen über Befehle.
 * Offline werden sie sofort ausgeführt. Online schickt jeder Spieler seine
 * Befehle an den Gastgeber, der sie in einem bestimmten Takt einplant –
 * alle Geräte führen dann exakt dieselben Befehle im selben Takt aus.
 */
import { Sim, Blueprint } from './sim';
import { BUILDINGS, BELT_TIERS, MANUAL_UPGRADES, ManualUpgradeId, STAGES } from './defs';

export type Cmd =
  | { k: 'place'; type: string; x: number; y: number; dir: number }
  | { k: 'belts'; cells: [number, number, number][]; tier: number }
  | { k: 'demolish'; ids: number[] }
  | { k: 'rotate'; id: number }
  | { k: 'move'; id: number; x: number; y: number; dir: number }
  | { k: 'upgrade'; ids: number[] }
  | { k: 'toggle'; ids: number[] }
  | { k: 'filter'; id: number; stage: number }
  | { k: 'nodeCfg'; id: number; outMask?: number; prio?: boolean; mask?: number }
  | { k: 'paste'; bp: Blueprint; x: number; y: number }
  | { k: 'salvage' }
  | { k: 'take'; tile: number }
  | { k: 'peel'; strip: number }
  | { k: 'sellHand'; station: number; peeledOnly?: boolean }
  | { k: 'buyHand'; id: ManualUpgradeId };

const int = (v: unknown, min: number, max: number) => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
const ids = (v: unknown) => Array.isArray(v) && v.length <= 5000 && v.every((x) => int(x, 1, 1e9));

// Prüft Befehle von anderen Spielern (Daten aus dem Netz sind nie vertrauenswürdig)
export function validCmd(c: unknown): c is Cmd {
  if (!c || typeof c !== 'object') return false;
  const o = c as Record<string, unknown>;
  switch (o.k) {
    case 'place': return typeof o.type === 'string' && !!BUILDINGS[o.type] && int(o.x, -10, 500) && int(o.y, -10, 500) && int(o.dir, 0, 3);
    case 'belts': return int(o.tier, 0, BELT_TIERS.length - 1) && Array.isArray(o.cells) && o.cells.length <= 2000
      && o.cells.every((cell) => Array.isArray(cell) && cell.length === 3 && int(cell[0], -10, 500) && int(cell[1], -10, 500) && int(cell[2], 0, 3));
    case 'demolish': case 'upgrade': case 'toggle': return ids(o.ids);
    case 'rotate': return int(o.id, 1, 1e9);
    case 'move': return int(o.id, 1, 1e9) && int(o.x, -10, 500) && int(o.y, -10, 500) && int(o.dir, 0, 3);
    case 'filter': return int(o.id, 1, 1e9) && int(o.stage, 0, STAGES.length - 1);
    case 'nodeCfg': return int(o.id, 1, 1e9) && (o.outMask === undefined || int(o.outMask, 0, 7))
      && (o.prio === undefined || typeof o.prio === 'boolean') && (o.mask === undefined || int(o.mask, 0, 1023));
    case 'paste': {
      const bp = o.bp as Blueprint | undefined;
      return !!bp && Array.isArray(bp.entries) && bp.entries.length <= 5000 && int(o.x, -10, 500) && int(o.y, -10, 500)
        && bp.entries.every((e) => e && int(e.dx, 0, 500) && int(e.dy, 0, 500) && int(e.dir, 0, 3)
          && (e.belt ? int(e.tier ?? 0, 0, BELT_TIERS.length - 1) : typeof e.type === 'string' && !!BUILDINGS[e.type] && int(e.level ?? 1, 1, 10)));
    }
    case 'salvage': return true;
    case 'sellHand': return int(o.station, 1, 1e9) && (o.peeledOnly === undefined || typeof o.peeledOnly === 'boolean');
    case 'take': return int(o.tile, -1, 1e6);
    case 'peel': return int(o.strip, 0, 2);
    case 'buyHand': return MANUAL_UPGRADES.some((u) => u.id === o.id);
    default: return false;
  }
}

// Führt einen Befehl aus. Rückgabe: true, wenn sich etwas geändert hat
export function applyCmd(sim: Sim, pid: string, c: Cmd): boolean {
  switch (c.k) {
    case 'place': return !!sim.place(c.type, c.x, c.y, c.dir);
    case 'belts': return sim.placeBeltPath(c.cells.map(([x, y, dir]) => ({ x, y, dir })), c.tier) > 0;
    case 'demolish': { let n = 0; for (const id of c.ids) if (sim.demolish(id)) n++; return n > 0; }
    case 'rotate': return sim.rotate(c.id);
    case 'move': return sim.move(c.id, c.x, c.y, c.dir);
    case 'upgrade': { let n = 0; for (const id of c.ids) if (sim.upgrade(id)) n++; return n > 0; }
    case 'toggle': for (const id of c.ids) sim.toggle(id); return true;
    case 'filter': sim.setFilter(c.id, c.stage); return true;
    case 'nodeCfg': return sim.configNode(c.id, c);
    case 'paste': return sim.paste(c.bp, c.x, c.y);
    case 'salvage': return sim.sellSalvage() > 0;
    case 'take': return sim.manualTake(c.tile, pid) > 0;
    case 'peel': return sim.manualPeel(c.strip, pid) > 0;
    case 'sellHand': return (c.peeledOnly ? sim.sellPeeledManual(pid, c.station) : sim.manualSellAll(pid, c.station)) > 0;
    case 'buyHand': return sim.buyManualUpgrade(c.id, pid);
  }
}

// Kurzer Fingerabdruck des Zustands – damit merken wir, falls ein Gerät abweicht
export function simHash(sim: Sim): string {
  let items = 0;
  for (const e of sim.ents.values()) items += e.kind === 'belt' ? e.items.length * 7 + e.id : e.inBuf.length * 3 + e.outBuf.length * 5 + e.level;
  return `${sim.tick}|${sim.money.toFixed(3)}|${sim.pileRemaining}|${sim.stats.sold}|${sim.ents.size}|${items}`;
}
