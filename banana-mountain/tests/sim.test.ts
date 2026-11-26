import { describe, it, expect } from 'vitest';
import { Sim, generatePile, tileIndex } from '../src/sim/sim';
import { TOTAL, MAP_W, PILE_CY, BUILDINGS, qualityMult, upgradeCost, machineSpeed, SIM_HZ } from '../src/sim/defs';

function run(sim: Sim, seconds: number, check = true) {
  for (let i = 0; i < seconds * SIM_HZ; i++) {
    sim.step();
    if (check && i % 10 === 0) expect(sim.audit().total).toBe(TOTAL);
  }
}

// Rechter Rand des Bergs in Zeile PILE_CY
function eastEdge(sim: Sim, row = PILE_CY) {
  let maxX = 0;
  for (let x = 0; x < MAP_W; x++) if (sim.pile[tileIndex(x, row)] || sim.pile[tileIndex(x, row - 1)]) maxX = x;
  return maxX + 1;
}

// Sammler -> Band -> Schälmaschine -> Band -> Verkauf
function buildLine(sim: Sim, belt = 0) {
  const x = eastEdge(sim);
  const y = PILE_CY - 1;
  const col = sim.place('grab1', x, y, 0)!;
  expect(col).toBeTruthy();
  for (let i = 2; i <= 4; i++) expect(sim.placeBelt(x + i, y + 1, 0, belt)).toBeTruthy();
  const peeler = sim.place('peeler', x + 5, y, 0)!;
  expect(peeler).toBeTruthy();
  for (let i = 7; i <= 9; i++) expect(sim.placeBelt(x + i, y + 1, 0, belt)).toBeTruthy();
  const sell = sim.place('sell1', x + 10, y, 0)!;
  expect(sell).toBeTruthy();
  return { x, y, col, peeler, sell };
}

describe('Bananenberg', () => {
  it('enthält exakt 1.000.000 Bananen', () => {
    const pile = generatePile();
    expect(pile.reduce((a, b) => a + b, 0)).toBe(TOTAL);
    const sim = Sim.newGame();
    expect(sim.pileRemaining).toBe(TOTAL);
    expect(sim.audit().total).toBe(TOTAL);
    expect(sim.money).toBe(0);
    expect(sim.buildingList().filter((b) => b.type === 'sell1').length).toBe(1);
  });

  it('auf Bananen darf nicht gebaut werden', () => {
    const sim = Sim.newGame();
    sim.money = 1e9;
    expect(sim.place('peeler', 63, PILE_CY, 0)).toBeNull();
    expect(sim.placeBelt(64, PILE_CY, 0, 0)).toBeNull();
  });
});

describe('Handarbeit', () => {
  it('nehmen, drei Streifen schälen, verkaufen = 3 $', () => {
    const sim = Sim.newGame();
    const tile = sim.nearestPileTile(64, PILE_CY);
    expect(sim.manualTake(tile)).toBe(1);
    expect(sim.manualTake(tile)).toBe(0); // nur eine Hand frei
    expect(sim.pileRemaining).toBe(TOTAL - 1);
    expect(sim.audit().total).toBe(TOTAL);
    sim.manualPeel(0); sim.manualPeel(1);
    expect(sim.manual.slots[0].mask).toBe(3);
    sim.manualPeel(1); // schon geschält -> nimmt den nächsten freien Streifen
    expect(sim.manual.slots[0].mask).toBe(7);
    expect(sim.manualSellAll()).toBe(1);
    expect(sim.money).toBe(3);
    expect(sim.stats.sold).toBe(1);
    expect(sim.audit().total).toBe(TOTAL);
  });

  it('rohe Banane bringt 1 $, Upgrades wirken', () => {
    const sim = Sim.newGame();
    sim.manualTake(-1);
    sim.manualSellAll();
    expect(sim.money).toBe(1);
    sim.money = 1000;
    expect(sim.buyManualUpgrade('hands')).toBe(true);
    expect(sim.buyManualUpgrade('tongs')).toBe(true);
    expect(sim.buyManualUpgrade('strips')).toBe(true);
    expect(sim.buyManualUpgrade('autosell')).toBe(true);
    expect(sim.manualTake(-1)).toBe(2);
    sim.manualPeel(0); // 2 Streifen pro Zug
    sim.manualPeel(2); // fertig -> automatisch verkauft
    expect(sim.manual.slots.length).toBe(0);
    expect(sim.stats.manualPeeledSold).toBe(2);
    expect(sim.audit().total).toBe(TOTAL);
  });

  it('Lehrling und Rutsche arbeiten automatisch', () => {
    const sim = Sim.newGame();
    sim.money = 1e6;
    sim.buyManualUpgrade('autograb');
    sim.buyManualUpgrade('apprentice');
    sim.buyManualUpgrade('autosell');
    run(sim, 30);
    expect(sim.stats.manualPeeledSold).toBeGreaterThan(3);
  });
});

describe('Fabrik', () => {
  it('Sammler -> Schälmaschine -> Verkauf funktioniert und hält die Gesamtmenge', () => {
    const sim = Sim.newGame();
    sim.money = 10000;
    buildLine(sim);
    const m0 = sim.money;
    run(sim, 40);
    expect(sim.stats.factorySold).toBeGreaterThan(15);
    expect(sim.stats.autoProcessedSold).toBe(sim.stats.factorySold); // alles geschält
    expect(sim.money - m0).toBeCloseTo(sim.stats.factorySold * 3, 5);
    expect(sim.pileRemaining).toBe(TOTAL - sim.stats.grabbed);
  });

  it('Standardband schafft ca. 2 Bananen pro Sekunde', () => {
    const sim = Sim.newGame();
    sim.money = 1e7;
    const x = eastEdge(sim), y = PILE_CY - 1;
    sim.place('vacuum', x, y, 0); // 10/s – mehr als das Band schafft
    for (let i = 2; i < 12; i++) sim.placeBelt(x + i, y + 1, 0, 0);
    sim.place('sell1', x + 12, y, 0);
    run(sim, 20, false);
    const before = sim.stats.sold;
    run(sim, 30);
    const rate = (sim.stats.sold - before) / 30;
    expect(rate).toBeGreaterThan(1.8);
    expect(rate).toBeLessThan(2.2);
  });

  it('Stau: volles Band stoppt den Sammler, nichts geht verloren', () => {
    const sim = Sim.newGame();
    sim.money = 1000;
    const x = eastEdge(sim), y = PILE_CY - 1;
    const col = sim.place('grab2', x, y, 0)!;
    for (let i = 2; i < 5; i++) sim.placeBelt(x + i, y + 1, 0, 0); // Sackgasse
    run(sim, 60);
    const belts = [...sim.ents.values()].filter((e) => e.kind === 'belt');
    for (const b of belts) expect(b.kind === 'belt' && b.items.length).toBe(4);
    expect(col.status).toBe('blocked');
    expect(sim.stats.grabbed).toBe(12 + col.outBuf.length);
    // Kein Stau-Verlust: alle entnommenen Bananen sind noch da
    expect(sim.audit().factory).toBe(sim.stats.grabbed);
  });

  it('Maschinen nehmen nur den richtigen Zustand an', () => {
    const sim = Sim.newGame();
    sim.money = 1e6;
    const x = eastEdge(sim), y = PILE_CY - 1;
    sim.place('grab1', x, y, 0);
    sim.placeBelt(x + 2, y + 1, 0, 0);
    sim.placeBelt(x + 3, y + 1, 0, 0);
    const cutter = sim.place('cutter', x + 4, y, 0)!; // erwartet geschälte Bananen
    run(sim, 20);
    expect(cutter.inBuf.length).toBe(0);
    expect(cutter.processed).toBe(0);
  });

  it('Upgrade-Formeln und Qualitätsbonus', () => {
    const def = BUILDINGS.peeler;
    expect(machineSpeed(def, 1)).toBe(2);
    expect(machineSpeed(def, 3)).toBeCloseTo(4.5);
    expect(qualityMult(3)).toBeCloseTo(1.3);
    expect(upgradeCost(def, 1)).toBeCloseTo(180);
    const sim = Sim.newGame();
    sim.money = 1e6;
    const line = buildLine(sim);
    expect(sim.upgrade(line.peeler.id)).toBe(true);
    expect(sim.upgrade(line.peeler.id)).toBe(true);
    expect(line.peeler.level).toBe(3);
    expect(line.peeler.invested).toBeCloseTo(100 + 180 + 324);
    const m0 = sim.money;
    run(sim, 30);
    expect(sim.stats.factorySold).toBeGreaterThan(5);
    // Jede Banane: 3 $ × 1,3
    expect(sim.money - m0).toBeCloseTo(sim.stats.factorySold * 3 * 1.3, 4);
  });

  it('Abriss erstattet 100 % und verliert keine Bananen', () => {
    const sim = Sim.newGame();
    sim.money = 1e6;
    const line = buildLine(sim);
    sim.upgrade(line.peeler.id);
    run(sim, 15);
    const money = sim.money;
    const invested = line.peeler.invested;
    const inside = line.peeler.inBuf.length + line.peeler.outBuf.length;
    expect(sim.demolish(line.peeler.id)).toBe(true);
    expect(sim.money).toBeCloseTo(money + invested);
    expect(sim.salvage.length).toBe(inside);
    expect(sim.audit().total).toBe(TOTAL);
    sim.sellSalvage();
    expect(sim.salvage.length).toBe(0);
    expect(sim.audit().total).toBe(TOTAL);
  });

  it('Teiler, Filter und Tunnel geben Bananen weiter', () => {
    const sim = Sim.newGame();
    sim.money = 1e7;
    const x = eastEdge(sim), y = PILE_CY - 1;
    sim.place('grab2', x, y, 0);
    sim.placeBelt(x + 2, y + 1, 0, 0);
    sim.place('tunnelIn', x + 3, y + 1, 0);
    sim.place('tunnelOut', x + 7, y + 1, 0);
    sim.place('filter', x + 8, y + 1, 0);      // Filter auf "Geschält": rohe gehen zur Seite
    sim.placeBelt(x + 8, y + 2, 1, 0);         // rechte Seite (Süd)
    sim.place('sell1', x + 7, y + 3, 0);
    run(sim, 40);
    expect(sim.stats.factorySold).toBeGreaterThan(10);
  });

  it('Kopieren & Einfügen einer Produktionslinie', () => {
    const sim = Sim.newGame();
    sim.money = 1e7;
    const line = buildLine(sim);
    const ids = [...sim.ents.values()].filter((e) => e.kind === 'belt' || e.id === line.peeler.id).map((e) => e.id);
    const bp = sim.copy(ids)!;
    expect(bp.entries.length).toBe(7);
    const m = sim.money;
    expect(sim.paste(bp, line.x + 2, line.y + 6)).toBe(true);
    expect(m - sim.money).toBeCloseTo(sim.blueprintCost(bp));
  });
});

describe('Spielstand', () => {
  it('Speichern und Laden ergibt exakt denselben Ablauf', () => {
    const sim = Sim.newGame();
    sim.money = 1e6;
    buildLine(sim);
    sim.manualTake(-1);
    sim.manualPeel(1);
    run(sim, 12);
    const json = JSON.parse(JSON.stringify(sim.serialize()));
    const copy = Sim.deserialize(json);
    expect(copy.audit()).toEqual(sim.audit());
    expect(copy.money).toBe(sim.money);
    run(sim, 10, false);
    run(copy, 10, false);
    expect(copy.audit()).toEqual(sim.audit());
    expect(copy.money).toBeCloseTo(sim.money, 6);
    expect(copy.manual.slots).toEqual(sim.manual.slots);
  });

  it('manipulierte Spielstände werden abgelehnt', () => {
    const sim = Sim.newGame();
    const data = sim.serialize();
    data.pile[1] += 5;
    expect(() => Sim.deserialize(data)).toThrow();
  });
});
