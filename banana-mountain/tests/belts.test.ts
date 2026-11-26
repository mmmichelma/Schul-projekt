import { it, expect, describe } from 'vitest';
import { Sim, tileIndex, Building, Belt } from '../src/sim/sim';
import { TOTAL, MAP_W, PILE_CY, SIM_HZ } from '../src/sim/defs';

function run(sim: Sim, seconds: number) {
  for (let i = 0; i < seconds * SIM_HZ; i++) {
    sim.step();
    if (i % 20 === 0) expect(sim.audit().total).toBe(TOTAL);
  }
}
// Östlich des Berges – über alle Zeilen, die die Tests benutzen
function eastEdge(sim: Sim) {
  let maxX = 0;
  for (let y = PILE_CY - 8; y <= PILE_CY + 9; y++) for (let x = 0; x < MAP_W; x++) if (sim.pile[tileIndex(x, y)]) maxX = Math.max(maxX, x);
  return maxX + 1;
}
const line = (sim: Sim, x0: number, x1: number, y: number, dir: number, tier = 0) => {
  if (dir === 0) for (let x = x0; x <= x1; x++) expect(sim.placeBelt(x, y, 0, tier)).toBeTruthy();
  else for (let yy = x0; yy <= x1; yy++) expect(sim.placeBelt(y, yy, dir, tier)).toBeTruthy();
};

describe('Förderband-Mechanik', () => {
  it('Teiler verteilt gleichmäßig auf drei Ausgänge', () => {
    const sim = Sim.newGame();
    sim.money = 1e7;
    const X = eastEdge(sim), Y = PILE_CY - 1;
    sim.place('vacuum', X, Y, 0);                       // 10 Bananen/s
    line(sim, X + 2, X + 4, Y + 1, 0, 2);               // Turbo-Band
    const sp = sim.place('splitter', X + 5, Y + 1, 0, { level: 3 })!;
    line(sim, X + 6, X + 8, Y + 1, 0);                  // vorne
    const a = sim.place('sell1', X + 9, Y, 0)!;
    line(sim, Y + 2, Y + 4, X + 5, 1);                  // rechts (Süden)
    const b = sim.place('sell1', X + 5, Y + 5, 0)!;
    line(sim, Y - 2, Y, X + 5, 3);                      // links (Norden) – Band zeigt nach oben
    const c = sim.place('sell1', X + 5, Y - 4, 0)!;
    run(sim, 60);
    const counts = [a, b, c].map((s) => s.processed);
    expect(sp.status).not.toBe('blocked');
    for (const n of counts) expect(n).toBeGreaterThan(60);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(3);
  });

  it('Teiler mit Vorfahrt: alles nach vorne, Rest nur bei Stau zur Seite', () => {
    const sim = Sim.newGame();
    sim.money = 1e7;
    const X = eastEdge(sim), Y = PILE_CY - 1;
    sim.place('grab2', X, Y, 0);                        // 3/s
    line(sim, X + 2, X + 4, Y + 1, 0, 1);
    sim.place('splitter', X + 5, Y + 1, 0, { level: 2, prio: true });
    line(sim, X + 6, X + 8, Y + 1, 0, 1);
    const front = sim.place('sell1', X + 9, Y, 0)!;
    line(sim, Y + 2, Y + 4, X + 5, 1, 1);
    const side = sim.place('sell1', X + 5, Y + 5, 0)!;
    run(sim, 40);
    expect(front.processed).toBeGreaterThan(80);
    expect(side.processed).toBe(0);
  });

  it('Teiler-Ausgang abschalten', () => {
    const sim = Sim.newGame();
    sim.money = 1e7;
    const X = eastEdge(sim), Y = PILE_CY - 1;
    sim.place('grab2', X, Y, 0);
    line(sim, X + 2, X + 4, Y + 1, 0, 1);
    const sp = sim.place('splitter', X + 5, Y + 1, 0, { level: 2 })!;
    line(sim, X + 6, X + 8, Y + 1, 0, 1);
    const front = sim.place('sell1', X + 9, Y, 0)!;
    line(sim, Y + 2, Y + 4, X + 5, 1, 1);
    const side = sim.place('sell1', X + 5, Y + 5, 0)!;
    sim.configNode(sp.id, { outMask: 2 });              // nur rechts
    run(sim, 30);
    expect(front.processed).toBe(0);
    expect(side.processed).toBeGreaterThan(40);
  });

  it('Verbinder führt zwei Linien fair zusammen', () => {
    const sim = Sim.newGame();
    sim.money = 1e7;
    const X = eastEdge(sim), Y = PILE_CY - 1;
    const g1 = sim.place('grab2', X, Y, 0)!;            // Linie 1 von Westen
    line(sim, X + 2, X + 4, Y + 1, 0, 0);
    const g2 = sim.place('grab2', X, Y + 6, 0)!;        // Linie 2 kommt von Süden hoch
    line(sim, X + 2, X + 4, Y + 7, 0, 0);
    for (let yy = Y + 7; yy >= Y + 2; yy--) sim.placeBelt(X + 5, yy, 3, 0);
    sim.placeBelt(X + 5, Y + 7, 3, 0);
    sim.place('merger', X + 5, Y + 1, 0);
    line(sim, X + 6, X + 8, Y + 1, 0, 0);               // Ausgang: nur 2/s
    sim.place('sell1', X + 9, Y, 0);
    run(sim, 80);
    expect(g1.processed).toBeGreaterThan(30);
    expect(g2.processed).toBeGreaterThan(30);
    expect(Math.abs(g1.processed - g2.processed)).toBeLessThan(15);
  });

  it('Kreuzung: zwei Linien kreuzen sich ohne Vermischung', () => {
    const sim = Sim.newGame();
    sim.money = 1e7;
    const X = eastEdge(sim), Y = PILE_CY - 1;
    const g1 = sim.place('grab2', X, Y, 0)!;            // Ost-West-Linie
    line(sim, X + 2, X + 9, Y + 1, 0);
    const east = sim.place('sell1', X + 10, Y, 0)!;
    const g2 = sim.place('grab2', X, Y - 6, 0)!;        // zweite Linie: nach Osten, dann nach Süden durch die Kreuzung
    line(sim, X + 2, X + 4, Y - 5, 0);
    for (let yy = Y - 5; yy <= Y + 4; yy++) if (yy !== Y + 1) sim.placeBelt(X + 5, yy, 1, 0);
    const cross = sim.place('crossing', X + 5, Y + 1, 0)!; // ersetzt das Band
    expect(cross).toBeTruthy();
    const south = sim.place('sell1', X + 5, Y + 5, 0)!;
    run(sim, 60);
    expect(east.processed).toBeGreaterThan(40);
    expect(south.processed).toBeGreaterThan(15);
    // Nichts vermischt: jede Verkaufsstelle bekommt nur Bananen ihrer eigenen Linie
    expect(east.processed).toBeLessThanOrEqual(g1.processed);
    expect(south.processed).toBeLessThanOrEqual(g2.processed);
    expect(g2.processed - south.processed).toBeLessThanOrEqual(30); // Rest ist noch unterwegs
  });

  it('Seitliches Einfädeln: Nebenband schiebt sich in Lücken ein', () => {
    const sim = Sim.newGame();
    sim.money = 1e7;
    const X = eastEdge(sim), Y = PILE_CY - 1;
    sim.place('grab1', X, Y, 0);                        // Hauptband 1/s (viele Lücken)
    line(sim, X + 2, X + 8, Y + 1, 0, 1);
    const sell = sim.place('sell1', X + 9, Y, 0)!;
    sim.place('grab2', X, Y + 6, 0);                    // Nebenband von Süden in die Seite
    line(sim, X + 2, X + 5, Y + 7, 0, 0);
    for (let yy = Y + 7; yy >= Y + 2; yy--) sim.placeBelt(X + 6, yy, 3, 0);
    run(sim, 60);
    const main = sim.entAt(X + 6, Y + 1) as Belt;
    expect(main.kind).toBe('belt');
    expect(sell.processed).toBeGreaterThan(100);       // beide Linien kommen an
  });

  it('Teiler direkt auf ein volles Band setzen: Bananen bleiben erhalten', () => {
    const sim = Sim.newGame();
    sim.money = 1e7;
    const X = eastEdge(sim), Y = PILE_CY - 1;
    sim.place('grab2', X, Y, 0);
    line(sim, X + 2, X + 8, Y + 1, 0);                  // Sackgasse -> volles Band
    run(sim, 30);
    const belt = sim.entAt(X + 6, Y + 1) as Belt;
    expect(belt.items.length).toBe(4);
    const money = sim.money;
    const sp = sim.place('splitter', X + 6, Y + 1, 0) as Building;
    expect(sp).toBeTruthy();
    expect(sim.money).toBeCloseTo(money + 2 - 20);      // Band erstattet, Teiler bezahlt
    expect(sim.audit().total).toBe(TOTAL);
    expect(sp.lanes.flat().length + sim.salvage.length).toBe(4);
  });

  it('Knoten-Stufe bestimmt den Durchsatz', () => {
    const sim = Sim.newGame();
    sim.money = 1e8;
    const X = eastEdge(sim), Y = PILE_CY - 1;
    sim.place('vacuum', X, Y, 0);                       // 10/s
    line(sim, X + 2, X + 4, Y + 1, 0, 2);               // Turbo 15/s
    const m = sim.place('merger', X + 5, Y + 1, 0)!;    // Stufe 1 = 2/s
    line(sim, X + 6, X + 8, Y + 1, 0, 2);
    const sell = sim.place('sell2', X + 9, Y, 0)!;
    run(sim, 30);
    const slow = sell.processed;
    sim.upgrade(m.id); sim.upgrade(m.id);               // Turbo-Stufe
    expect(m.level).toBe(3);
    run(sim, 30);
    expect(slow).toBeLessThan(70);
    expect(sell.processed - slow).toBeGreaterThan(250);
  });

  it('Mehrere Filter-Zustände gleichzeitig', () => {
    const sim = Sim.newGame();
    sim.money = 1e7;
    const X = eastEdge(sim), Y = PILE_CY - 1;
    sim.place('grab2', X, Y, 0);
    line(sim, X + 2, X + 4, Y + 1, 0);
    const f = sim.place('filter', X + 5, Y + 1, 0)!;
    line(sim, X + 6, X + 8, Y + 1, 0);
    const front = sim.place('sell1', X + 9, Y, 0)!;
    line(sim, Y + 2, Y + 4, X + 5, 1);
    const side = sim.place('sell1', X + 5, Y + 5, 0)!;
    sim.configNode(f.id, { mask: 0b11 });               // roh + geschält geradeaus
    run(sim, 60);
    expect(front.processed).toBeGreaterThan(40);
    expect(side.processed).toBe(0);
  });
});

it('Speichern/Laden mitten im Betrieb: Knoten laufen identisch weiter', () => {
  const sim = Sim.newGame();
  sim.money = 1e7;
  const X = eastEdge(sim), Y = PILE_CY - 1;
  sim.place('vacuum', X, Y, 0);
  line(sim, X + 2, X + 4, Y + 1, 0, 2);
  const sp = sim.place('splitter', X + 5, Y + 1, 0, { level: 3 })!;
  sim.configNode(sp.id, { prio: false, outMask: 3 });
  line(sim, X + 6, X + 8, Y + 1, 0, 1);
  sim.place('merger', X + 9, Y + 1, 0, { level: 2, prio: true });
  sim.placeBelt(X + 10, Y + 1, 0, 1);
  sim.place('sell1', X + 11, Y, 0);
  line(sim, Y + 2, Y + 4, X + 5, 1, 1);
  sim.place('crossing', X + 5, Y + 3, 0);
  sim.place('sell1', X + 5, Y + 5, 0);
  run(sim, 20);
  const copy = Sim.deserialize(JSON.parse(JSON.stringify(sim.serialize())));
  for (let i = 0; i < 400; i++) { sim.step(); copy.step(); }
  const A = JSON.stringify(copy.serialize()), B = JSON.stringify(sim.serialize());
  expect(A).toBe(B);
  expect(sim.audit().total).toBe(TOTAL);
});
