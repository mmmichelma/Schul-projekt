import { it, expect } from 'vitest';
import { Sim, tileIndex } from '../src/sim/sim';
import { applyCmd, validCmd, simHash, Cmd } from '../src/sim/commands';
import { TOTAL, MAP_W, PILE_CY } from '../src/sim/defs';

function eastEdge(sim: Sim) {
  let maxX = 0;
  for (let x = 0; x < MAP_W; x++) if (sim.pile[tileIndex(x, PILE_CY)] || sim.pile[tileIndex(x, PILE_CY - 1)]) maxX = x;
  return maxX + 1;
}

it('Gastgeber und Gast bleiben im Gleichschritt (auch bei spätem Beitritt)', () => {
  const host = Sim.newGame();
  host.money = 1e6;
  const X = eastEdge(host), Y = PILE_CY - 1;
  // Befehle mit Takt-Nummer, wie sie übers Netz kämen
  const plan: [number, string, Cmd][] = [
    [5, 'anna', { k: 'place', type: 'vacuum', x: X, y: Y, dir: 0 }],
    [5, 'anna', { k: 'belts', cells: [[X + 2, Y + 1, 0], [X + 3, Y + 1, 0], [X + 4, Y + 1, 0]], tier: 1 }],
    [9, 'ben', { k: 'take', tile: -1 }],
    [12, 'ben', { k: 'peel', strip: 0 }],
    [20, 'anna', { k: 'place', type: 'peeler', x: X + 5, y: Y, dir: 0 }],
    [40, 'ben', { k: 'peel', strip: 1 }],
    [41, 'ben', { k: 'peel', strip: 2 }],
    [60, 'anna', { k: 'belts', cells: [[X + 7, Y + 1, 0], [X + 8, Y + 1, 0], [X + 9, Y + 1, 1], [X + 9, Y + 2, 1]], tier: 0 }],
    [61, 'anna', { k: 'place', type: 'sell1', x: X + 8, y: Y + 3, dir: 0 }],
    [300, 'ben', { k: 'sellHand' }],
    [310, 'anna', { k: 'upgrade', ids: [2, 3] }],
    [500, 'ben', { k: 'buyHand', id: 'hands' }],
    [700, 'anna', { k: 'demolish', ids: [6] }],
    [720, 'anna', { k: 'salvage' }],
  ];
  for (const [, , c] of plan) expect(validCmd(c)).toBe(true);
  let guest: Sim | null = null;
  for (let t = 1; t <= 1200; t++) {
    for (const [tt, pid, c] of plan) if (tt === t) { applyCmd(host, pid, c); if (guest) applyCmd(guest, pid, c); }
    host.step();
    if (guest) guest.step();
    // Gast steigt bei Takt 250 ein: lädt Schnappschuss (über JSON, wie aus der Datenbank)
    if (t === 250) guest = Sim.deserialize(JSON.parse(JSON.stringify(host.serialize())));
    if (guest && t % 50 === 0) expect(simHash(guest)).toBe(simHash(host));
  }
  expect(JSON.stringify(guest!.serialize())).toBe(JSON.stringify(host.serialize()));
  expect(host.audit().total).toBe(TOTAL);
  expect(host.stats.factorySold).toBeGreaterThan(10);
  expect(host.getManual('ben').up.hands).toBe(1);
});

it('ungültige Befehle aus dem Netz werden abgelehnt', () => {
  expect(validCmd({ k: 'place', type: 'hack', x: 1, y: 1, dir: 0 })).toBe(false);
  expect(validCmd({ k: 'belts', cells: [[1, 2]], tier: 0 })).toBe(false);
  expect(validCmd({ k: 'peel', strip: 7 })).toBe(false);
  expect(validCmd({ k: 'buyHand', id: 'geld' })).toBe(false);
  expect(validCmd(null)).toBe(false);
});
