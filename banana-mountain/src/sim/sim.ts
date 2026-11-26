/*
 * Banana Mountain – Fabriksimulation
 *
 * Vollständig getrennt von der Grafik. Läuft mit fester Rate (SIM_HZ).
 * Wichtigste Regel (wird in den Tests geprüft):
 *   Bananen im Haufen + Bananen in Fabrik & Handbereich + verkaufte Bananen = 1.000.000
 */
import {
  TOTAL, MAP_W, MAP_H, PILE_CX, PILE_CY, PILE_R, DT, DX, DY, STAGES,
  BUILDINGS, BuildingDef, BELT_TIERS, MAX_LEVEL, TUNNEL_RANGE, LOGISTIC_CAP,
  machineSpeed, qualityMult, upgradeCost, collectorRadius, bufferCap,
  MANUAL_UPGRADES, ManualUpgradeId, AUTOGRAB_RATE, APPRENTICE_RATE,
} from './defs';

export interface Item {
  s: number;  // Verarbeitungszustand (0 = roh … 9 = Premium)
  q: number;  // Produkt aller Qualitätsboni
  p: number;  // Position auf dem aktuellen Bandfeld (0 = Eingang, 1 = Ausgang)
  dp: number; // Bewegung im letzten Takt (für flüssige Darstellung)
}

export type Status = 'working' | 'idle' | 'blocked' | 'off';

export interface Belt {
  kind: 'belt';
  id: number;
  x: number;
  y: number;
  dir: number;
  tier: number;
  items: Item[];   // sortiert: [0] ist am weitesten vorne
  invested: number;
  curve: number;   // 0 = gerade, 1/3 = Kurve (relative Eintrittsrichtung)
}

export interface Transit { it: Item; t: number }

export interface Building {
  kind: 'building';
  id: number;
  type: string;
  x: number;
  y: number;
  dir: number;
  w: number;       // Größe nach Drehung
  h: number;
  level: number;
  invested: number;
  enabled: boolean;
  inBuf: Item[];
  outBuf: Item[];
  progress: number;
  status: Status;
  busy: number;      // Auslastung (gleitender Mittelwert 0..1)
  processed: number;
  filter: number;    // Filter: durchgelassener Zustand
  rr: number;        // Teiler: Reihum-Zähler
  link: number;      // Tunnel: ID des Ausgangs
  transit: Transit[];
  bucket: number;    // Verkauf/Lager: Kontingent pro Takt
  radTiles: number[] | null;
  radIdx: number;
  target: number;    // Sammler: aktuelles Feld (für die Animation)
  lastWork: number;
}

export type Ent = Belt | Building;

export interface ManualBanana { mask: number } // Bit 0..2 = Schalenstreifen abgezogen
export interface Manual { slots: ManualBanana[]; up: Record<ManualUpgradeId, number>; grabAcc: number; peelAcc: number }
export const LOCAL = 'me';
export function newManual(): Manual {
  return { slots: [], up: { finger: 0, strips: 0, hands: 0, tongs: 0, autosell: 0, autograb: 0, apprentice: 0 }, grabAcc: 0, peelAcc: 0 };
}
const EMPTY_MANUAL: Manual = Object.freeze(newManual()) as Manual;

export interface SimEvent {
  t: 'grab' | 'sell' | 'manualGrab' | 'manualSell';
  tile?: number;
  id?: number;
  value?: number;
  pid?: string;
}

export interface Stats {
  time: number;
  revenue: number;
  sold: number;
  soldValue: number;
  manualPeeledSold: number;
  manualRawSold: number;
  factorySold: number;
  autoProcessedSold: number;
  grabbed: number;
  built: number;
  maxMoney: number;
  maxSoldRate: number;
  maxGrabRate: number;
  maxIncomeRate: number;
  finishedAt: number;
}

export interface BlueprintEntry {
  belt: boolean;
  type?: string;
  dx: number;
  dy: number;
  dir: number;
  tier?: number;
  level?: number;
  filter?: number;
}
export interface Blueprint { entries: BlueprintEntry[]; w: number; h: number }

const WINDOW = 10; // Sekunden für Raten

export function tileIndex(x: number, y: number) { return y * MAP_W + x; }
export const inBounds = (x: number, y: number) => x >= 0 && y >= 0 && x < MAP_W && y < MAP_H;

export function stageValue(it: { s: number; q: number }) { return STAGES[it.s].value * it.q; }

// Hilfsfunktion: lokale Koordinaten eines Gebäudes (Ausgang zeigt lokal nach +x) -> Welt
export function localToWorld(x: number, y: number, dir: number, w: number, h: number, lx: number, ly: number): [number, number] {
  switch (dir) {
    case 0: return [x + lx, y + ly];
    case 1: return [x + (h - 1 - ly), y + lx];
    case 2: return [x + (w - 1 - lx), y + (h - 1 - ly)];
    default: return [x + ly, y + (w - 1 - lx)];
  }
}
export function rotatedSize(def: BuildingDef, dir: number): [number, number] {
  return dir % 2 === 0 ? [def.w, def.h] : [def.h, def.w];
}
export function outputCell(b: { x: number; y: number; dir: number; type: string }): [number, number] {
  const def = BUILDINGS[b.type];
  return localToWorld(b.x, b.y, b.dir, def.w, def.h, def.w, Math.floor(def.h / 2));
}
export function inputCells(b: { x: number; y: number; dir: number; type: string }): [number, number][] {
  const def = BUILDINGS[b.type];
  const out: [number, number][] = [];
  for (let ly = 0; ly < def.h; ly++) out.push(localToWorld(b.x, b.y, b.dir, def.w, def.h, -1, ly));
  return out;
}
export const hasInput = (type: string) => !['collector', 'sell'].includes(BUILDINGS[type].category) && type !== 'tunnelOut';
export const hasOutput = (type: string) => BUILDINGS[type].category !== 'sell' && type !== 'tunnelIn' && type !== 'splitter' && type !== 'filter';

function makeItem(s: number, q: number): Item { return { s, q, p: 0, dp: 0 }; }

function pileNoise(x: number, y: number) {
  const h = (a: number, b: number) => {
    let n = Math.imul(a, 374761393) + Math.imul(b, 668265263);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  };
  const xi = Math.floor(x), yi = Math.floor(y);
  const fx = x - xi, fy = y - yi;
  const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

// Erzeugt den Bananenberg mit exakt TOTAL Bananen
export function generatePile(): Uint32Array {
  const pile = new Uint32Array(MAP_W * MAP_H);
  const weights = new Float64Array(MAP_W * MAP_H);
  let sum = 0;
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const dx = x + 0.5 - PILE_CX, dy = y + 0.5 - PILE_CY;
      const ang = Math.atan2(dy, dx);
      const R = PILE_R * (1 + 0.08 * Math.sin(ang * 3 + 0.4) + 0.05 * Math.sin(ang * 5 + 1.3));
      const d2 = (dx * dx + dy * dy) / (R * R);
      if (d2 >= 1) continue;
      // Kegelform mit Hügeln
      const w = Math.pow(1 - d2, 1.6) * (0.7 + 0.45 * pileNoise(x * 0.16, y * 0.16) + 0.25 * pileNoise(x * 0.4 + 7, y * 0.4 + 3));
      weights[tileIndex(x, y)] = w;
      sum += w;
    }
  }
  let given = 0;
  const frac: [number, number][] = [];
  for (let i = 0; i < weights.length; i++) {
    if (!weights[i]) continue;
    const exact = (weights[i] / sum) * TOTAL;
    pile[i] = Math.floor(exact);
    given += pile[i];
    frac.push([exact - pile[i], i]);
  }
  frac.sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (let k = 0; given < TOTAL; k++, given++) pile[frac[k % frac.length][1]]++;
  return pile;
}

export class Sim {
  pile: Uint32Array;
  pileRemaining = TOTAL;
  tiles = new Int32Array(MAP_W * MAP_H);
  ents = new Map<number, Ent>();
  nextId = 1;
  money = 0;
  inFactory = 0;   // Bananen auf Bändern, in Maschinen, Lagern und der Bergungskiste
  salvage: Item[] = []; // Bananen aus abgerissenen Gebäuden – gehen nie verloren
  manuals: Record<string, Manual> = {};
  stats: Stats = {
    time: 0, revenue: 0, sold: 0, soldValue: 0, manualPeeledSold: 0, manualRawSold: 0, factorySold: 0,
    autoProcessedSold: 0, grabbed: 0, built: 0, maxMoney: 0, maxSoldRate: 0, maxGrabRate: 0, maxIncomeRate: 0, finishedAt: 0,
  };
  tick = 0;
  finished = false;
  structVersion = 1;   // ändert sich bei jedem Umbau (für die Grafik)
  pileVersion = 1;
  dirtyPile = new Set<number>();
  events: SimEvent[] = [];

  private netDirty = true;
  private beltOrder: Belt[] = [];
  private buildings: Building[] = [];
  private outerTiles: number[] = [];
  private outerIdx = 0;
  // Raten (pro Sekunde, gleitendes Fenster)
  private winRevenue = new Float64Array(WINDOW);
  private winSold = new Float64Array(WINDOW);
  private winGrab = new Float64Array(WINDOW);
  private winSec = 0;

  constructor(pile?: Uint32Array) {
    this.pile = pile || generatePile();
    this.recountPile();
    this.buildOuterList();
  }

  static newGame(): Sim {
    const sim = new Sim();
    // Kostenlose Verkaufsstation unterhalb des Berges
    sim.place('sell1', PILE_CX - 1, PILE_CY + PILE_R + 6, 3, { free: true });
    sim.stats.built = 0;
    return sim;
  }

  recountPile() {
    let n = 0;
    for (let i = 0; i < this.pile.length; i++) n += this.pile[i];
    this.pileRemaining = n;
  }

  private buildOuterList() {
    const list: [number, number][] = [];
    for (let i = 0; i < this.pile.length; i++) {
      if (!this.pile[i]) continue;
      const x = i % MAP_W, y = (i / MAP_W) | 0;
      // Von unten außen nach innen – dort ist der Handbereich
      const ddx = x + 0.5 - PILE_CX, ddy = y + 0.5 - PILE_CY;
      const d = Math.sqrt(ddx * ddx + ddy * ddy);
      list.push([-(d + (y - PILE_CY) * 0.05), i]);
    }
    list.sort((a, b) => a[0] - b[0]);
    this.outerTiles = list.map((e) => e[1]);
    this.outerIdx = 0;
  }

  // ================================================================ Bananen aus dem Haufen
  private takeFromTile(i: number): boolean {
    if (!this.pile[i]) return false;
    const before = this.pile[i];
    this.pile[i]--;
    this.pileRemaining--;
    this.stats.grabbed++;
    this.winGrab[this.winSec % WINDOW]++;
    if (visualLevel(before) !== visualLevel(before - 1)) {
      this.dirtyPile.add(i);
      this.pileVersion++;
    }
    return true;
  }

  // Nächstes nicht leeres Feld in der Nähe (für Handarbeit)
  nearestPileTile(x: number, y: number, maxR = 4): number {
    let best = -1, bd = Infinity;
    for (let dy = -maxR; dy <= maxR; dy++) {
      for (let dx = -maxR; dx <= maxR; dx++) {
        const tx = x + dx, ty = y + dy;
        if (!inBounds(tx, ty)) continue;
        const i = tileIndex(tx, ty);
        if (!this.pile[i]) continue;
        const d = dx * dx + dy * dy;
        if (d < bd) { bd = d; best = i; }
      }
    }
    return best;
  }

  private outerPileTile(): number {
    while (this.outerIdx < this.outerTiles.length && !this.pile[this.outerTiles[this.outerIdx]]) this.outerIdx++;
    return this.outerIdx < this.outerTiles.length ? this.outerTiles[this.outerIdx] : -1;
  }

  // ================================================================ Handarbeit (jeder Spieler hat eigene Hände)
  // Nur lesen – legt nichts an (wichtig: die Oberfläche darf den Zustand nicht verändern)
  getManual(pid = LOCAL): Manual { return this.manuals[pid] || EMPTY_MANUAL; }
  private manualOf(pid: string): Manual {
    if (!this.manuals[pid]) this.manuals[pid] = newManual();
    return this.manuals[pid];
  }
  // Kompatibilität für Einzelspieler
  get manual(): Manual { return this.getManual(LOCAL); }
  handsOf(pid = LOCAL) { return 1 + this.getManual(pid).up.hands; }
  get hands() { return this.handsOf(LOCAL); }

  // Nimmt eine (oder mit Zange mehrere) Banane(n) vom Feld. Rückgabe: Anzahl
  manualTake(tile: number, pid = LOCAL): number {
    const m = this.manualOf(pid);
    const free = this.handsOf(pid) - m.slots.length;
    if (free <= 0 || this.finished) return 0;
    const want = m.up.tongs ? free : 1;
    let got = 0;
    for (let k = 0; k < want; k++) {
      let t = tile >= 0 && this.pile[tile] ? tile : -1;
      if (t < 0 && tile >= 0) t = this.nearestPileTile(tile % MAP_W, (tile / MAP_W) | 0, 3);
      if (t < 0) t = this.outerPileTile();
      if (t < 0 || !this.takeFromTile(t)) break;
      m.slots.push({ mask: 0 });
      this.events.push({ t: 'manualGrab', tile: t, pid });
      got++;
    }
    return got;
  }

  // Zieht Streifen `strip` (0..2) an allen gehaltenen Bananen ab
  manualPeel(strip: number, pid = LOCAL): number {
    const m = this.manualOf(pid);
    const per = 1 + m.up.strips;
    let peeled = 0;
    for (const b of m.slots) {
      for (let k = 0; k < per; k++) {
        if (b.mask === 7) break;
        let st = strip;
        for (let j = 0; j < 3 && (b.mask & (1 << st)); j++) st = (st + 1) % 3;
        b.mask |= 1 << st;
        peeled++;
      }
    }
    if (m.up.autosell) this.sellPeeledManual(pid);
    return peeled;
  }

  private sellManualAt(m: Manual, i: number, pid: string) {
    const b = m.slots[i];
    const peeled = b.mask === 7;
    const value = peeled ? STAGES[1].value : STAGES[0].value;
    m.slots.splice(i, 1);
    if (peeled) this.stats.manualPeeledSold++; else this.stats.manualRawSold++;
    this.registerSale(value);
    this.events.push({ t: 'manualSell', value, pid });
  }

  sellPeeledManual(pid = LOCAL): number {
    const m = this.manualOf(pid);
    let n = 0;
    for (let i = m.slots.length - 1; i >= 0; i--) {
      if (m.slots[i].mask === 7) { this.sellManualAt(m, i, pid); n++; }
    }
    return n;
  }

  // Verkauft alles aus dem Handbereich (geschält 3 $, roh 1 $)
  manualSellAll(pid = LOCAL): number {
    const m = this.manualOf(pid);
    const n = m.slots.length;
    for (let i = n - 1; i >= 0; i--) this.sellManualAt(m, i, pid);
    return n;
  }

  manualUpgradeCost(id: ManualUpgradeId, pid = LOCAL): number | null {
    const def = MANUAL_UPGRADES.find((u) => u.id === id);
    if (!def) return null;
    const lvl = this.getManual(pid).up[id];
    return lvl < def.costs.length ? def.costs[lvl] : null;
  }

  buyManualUpgrade(id: ManualUpgradeId, pid = LOCAL): boolean {
    const cost = this.manualUpgradeCost(id, pid);
    if (cost === null || this.money < cost) return false;
    this.money -= cost;
    this.manualOf(pid).up[id]++;
    return true;
  }

  private tickManual() {
    // Feste Reihenfolge der Spieler -> auf allen Geräten gleich
    for (const pid of Object.keys(this.manuals).sort()) {
      const m = this.manuals[pid];
      const rate = AUTOGRAB_RATE[m.up.autograb];
      if (rate > 0) {
        m.grabAcc = Math.min(m.grabAcc + rate * DT, 2);
        while (m.grabAcc >= 1 && m.slots.length < this.handsOf(pid)) {
          const t = this.outerPileTile();
          if (t < 0 || !this.takeFromTile(t)) break;
          m.slots.push({ mask: 0 });
          this.events.push({ t: 'manualGrab', tile: t, pid });
          m.grabAcc -= 1;
        }
      }
      const pr = APPRENTICE_RATE[m.up.apprentice];
      if (pr > 0 && m.slots.length) {
        m.peelAcc += pr * DT;
        while (m.peelAcc >= 1) {
          m.peelAcc -= 1;
          for (const b of m.slots) {
            if (b.mask === 7) continue;
            for (let st = 0; st < 3; st++) if (!(b.mask & (1 << st))) { b.mask |= 1 << st; break; }
          }
        }
        if (m.up.autosell) this.sellPeeledManual(pid);
      } else if (!m.slots.length) {
        m.peelAcc = 0;
      }
    }
  }

  // ================================================================ Verkauf
  private registerSale(value: number) {
    this.money += value;
    this.stats.revenue += value;
    this.stats.sold++;
    this.stats.soldValue += value;
    this.winRevenue[this.winSec % WINDOW] += value;
    this.winSold[this.winSec % WINDOW]++;
    if (this.money > this.stats.maxMoney) this.stats.maxMoney = this.money;
  }

  private sellFactoryItem(it: Item) {
    this.inFactory--;
    this.stats.factorySold++;
    if (it.s >= 1) this.stats.autoProcessedSold++;
    this.registerSale(stageValue(it));
  }

  // Bergungskiste (Bananen aus abgerissenen Gebäuden) verkaufen
  sellSalvage(): number {
    const n = this.salvage.length;
    let v = 0;
    for (const it of this.salvage) { this.sellFactoryItem(it); v += stageValue(it); }
    this.salvage = [];
    return v;
  }

  // ================================================================ Bauen
  get(id: number) { return this.ents.get(id); }
  entAt(x: number, y: number): Ent | undefined {
    if (!inBounds(x, y)) return undefined;
    const id = this.tiles[tileIndex(x, y)];
    return id ? this.ents.get(id) : undefined;
  }

  footprint(type: string, x: number, y: number, dir: number): [number, number][] {
    const [w, h] = rotatedSize(BUILDINGS[type], dir);
    const out: [number, number][] = [];
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) out.push([x + i, y + j]);
    return out;
  }

  cellFree(x: number, y: number, ignore = 0): boolean {
    if (!inBounds(x, y)) return false;
    const i = tileIndex(x, y);
    if (this.pile[i]) return false;
    const id = this.tiles[i];
    return !id || id === ignore;
  }

  canPlace(type: string, x: number, y: number, dir: number, ignore = 0): boolean {
    return this.footprint(type, x, y, dir).every(([cx, cy]) => this.cellFree(cx, cy, ignore));
  }

  private newBuilding(type: string, x: number, y: number, dir: number, level: number, invested: number): Building {
    const [w, h] = rotatedSize(BUILDINGS[type], dir);
    return {
      kind: 'building', id: this.nextId++, type, x, y, dir, w, h, level, invested, enabled: true,
      inBuf: [], outBuf: [], progress: 0, status: 'idle', busy: 0, processed: 0, filter: 1, rr: 0, link: 0,
      transit: [], bucket: 0, radTiles: null, radIdx: 0, target: -1, lastWork: -10,
    };
  }

  private occupy(e: Ent, on: boolean) {
    const cells: [number, number][] = e.kind === 'belt' ? [[e.x, e.y]] : this.footprint(e.type, e.x, e.y, e.dir);
    for (const [cx, cy] of cells) this.tiles[tileIndex(cx, cy)] = on ? e.id : 0;
  }

  private changed() {
    this.netDirty = true;
    this.structVersion++;
  }

  place(type: string, x: number, y: number, dir: number, opts: { free?: boolean; level?: number; filter?: number } = {}): Building | null {
    const def = BUILDINGS[type];
    if (!def || !this.canPlace(type, x, y, dir)) return null;
    const level = opts.level || 1;
    let cost = opts.free ? 0 : def.price;
    if (!opts.free) for (let l = 1; l < level; l++) cost += upgradeCost(def, l);
    if (this.money < cost) return null;
    this.money -= cost;
    const b = this.newBuilding(type, x, y, dir, level, cost);
    if (opts.filter !== undefined) b.filter = opts.filter;
    this.ents.set(b.id, b);
    this.occupy(b, true);
    this.stats.built++;
    this.changed();
    return b;
  }

  // Ein Bandfeld bauen. Liegt dort schon ein Band, wird nur die Richtung geändert (kostenlos)
  placeBelt(x: number, y: number, dir: number, tier: number): Belt | null {
    const existing = this.entAt(x, y);
    if (existing && existing.kind === 'belt') {
      if (existing.dir !== dir) { existing.dir = dir; this.changed(); }
      return existing;
    }
    if (!this.cellFree(x, y)) return null;
    const price = BELT_TIERS[tier].price;
    if (this.money < price) return null;
    this.money -= price;
    const belt: Belt = { kind: 'belt', id: this.nextId++, x, y, dir, tier, items: [], invested: price, curve: 0 };
    this.ents.set(belt.id, belt);
    this.occupy(belt, true);
    this.changed();
    return belt;
  }

  placeBeltPath(cells: { x: number; y: number; dir: number }[], tier: number): number {
    let n = 0;
    for (const c of cells) if (this.placeBelt(c.x, c.y, c.dir, tier)) n++;
    return n;
  }

  beltPathCost(cells: { x: number; y: number }[], tier: number): number {
    let c = 0;
    for (const cell of cells) {
      const e = this.entAt(cell.x, cell.y);
      if (!(e && e.kind === 'belt')) c += BELT_TIERS[tier].price;
    }
    return c;
  }

  private collectItems(e: Ent): Item[] {
    if (e.kind === 'belt') return e.items;
    return e.inBuf.concat(e.outBuf, e.transit.map((t) => t.it));
  }

  // Abreißen: 100 % Erstattung, Bananen wandern in die Bergungskiste
  demolish(id: number): boolean {
    const e = this.ents.get(id);
    if (!e) return false;
    for (const it of this.collectItems(e)) { it.p = 0; it.dp = 0; this.salvage.push(it); }
    this.occupy(e, false);
    this.ents.delete(id);
    this.money += e.invested;
    this.changed();
    return true;
  }

  rotate(id: number): boolean {
    const e = this.ents.get(id);
    if (!e) return false;
    const nd = (e.dir + 1) % 4;
    if (e.kind === 'belt') { e.dir = nd; this.changed(); return true; }
    return this.move(id, e.x, e.y, nd);
  }

  move(id: number, x: number, y: number, dir: number): boolean {
    const e = this.ents.get(id);
    if (!e) return false;
    if (e.kind === 'belt') {
      if (!this.cellFree(x, y, id)) return false;
      this.occupy(e, false);
      e.x = x; e.y = y; e.dir = dir;
      this.occupy(e, true);
    } else {
      if (!this.canPlace(e.type, x, y, dir, id)) return false;
      this.occupy(e, false);
      e.x = x; e.y = y; e.dir = dir;
      [e.w, e.h] = rotatedSize(BUILDINGS[e.type], dir);
      e.radTiles = null;
      this.occupy(e, true);
    }
    this.changed();
    return true;
  }

  upgradePrice(id: number): number | null {
    const e = this.ents.get(id);
    if (!e) return null;
    if (e.kind === 'belt') return e.tier < BELT_TIERS.length - 1 ? BELT_TIERS[e.tier + 1].price - BELT_TIERS[e.tier].price : null;
    const def = BUILDINGS[e.type];
    if (!def.upgradable || e.level >= MAX_LEVEL) return null;
    return upgradeCost(def, e.level);
  }

  upgrade(id: number): boolean {
    const e = this.ents.get(id);
    const cost = this.upgradePrice(id);
    if (!e || cost === null || this.money < cost) return false;
    this.money -= cost;
    e.invested += cost;
    if (e.kind === 'belt') e.tier++;
    else { e.level++; e.radTiles = null; }
    this.changed();
    return true;
  }

  toggle(id: number) {
    const e = this.ents.get(id);
    if (e && e.kind === 'building') { e.enabled = !e.enabled; this.structVersion++; }
  }

  setFilter(id: number, stage: number) {
    const e = this.ents.get(id);
    if (e && e.kind === 'building' && e.type === 'filter') { e.filter = stage; this.structVersion++; }
  }

  // ---------------------------------------------------------------- Kopieren & Einfügen
  copy(ids: number[]): Blueprint | null {
    const list = ids.map((id) => this.ents.get(id)).filter(Boolean) as Ent[];
    if (!list.length) return null;
    const minX = Math.min(...list.map((e) => e.x)), minY = Math.min(...list.map((e) => e.y));
    let maxX = 0, maxY = 0;
    const entries = list.map((e): BlueprintEntry => {
      const w = e.kind === 'belt' ? 1 : e.w, h = e.kind === 'belt' ? 1 : e.h;
      maxX = Math.max(maxX, e.x - minX + w);
      maxY = Math.max(maxY, e.y - minY + h);
      return e.kind === 'belt'
        ? { belt: true, dx: e.x - minX, dy: e.y - minY, dir: e.dir, tier: e.tier }
        : { belt: false, type: e.type, dx: e.x - minX, dy: e.y - minY, dir: e.dir, level: e.level, filter: e.filter };
    });
    return { entries, w: maxX, h: maxY };
  }

  blueprintCost(bp: Blueprint): number {
    let c = 0;
    for (const e of bp.entries) {
      if (e.belt) { c += BELT_TIERS[e.tier || 0].price; continue; }
      const def = BUILDINGS[e.type!];
      c += def.price;
      for (let l = 1; l < (e.level || 1); l++) c += upgradeCost(def, l);
    }
    return c;
  }

  blueprintValid(bp: Blueprint, ox: number, oy: number): boolean {
    const used = new Set<number>();
    for (const e of bp.entries) {
      const cells: [number, number][] = e.belt ? [[ox + e.dx, oy + e.dy]] : this.footprint(e.type!, ox + e.dx, oy + e.dy, e.dir);
      for (const [x, y] of cells) {
        if (!this.cellFree(x, y)) return false;
        const k = tileIndex(x, y);
        if (used.has(k)) return false;
        used.add(k);
      }
    }
    return true;
  }

  paste(bp: Blueprint, ox: number, oy: number): boolean {
    const cost = this.blueprintCost(bp);
    if (this.money < cost || !this.blueprintValid(bp, ox, oy)) return false;
    for (const e of bp.entries) {
      if (e.belt) this.placeBelt(ox + e.dx, oy + e.dy, e.dir, e.tier || 0);
      else this.place(e.type!, ox + e.dx, oy + e.dy, e.dir, { level: e.level, filter: e.filter });
    }
    return true;
  }

  // ================================================================ Netzwerk (Reihenfolge der Bänder)
  private rebuild() {
    this.netDirty = false;
    const belts: Belt[] = [];
    this.buildings = [];
    for (const e of this.ents.values()) {
      if (e.kind === 'belt') belts.push(e);
      else this.buildings.push(e);
    }
    // Bänder flussabwärts zuerst bearbeiten -> keine künstlichen Lücken
    const downstream = new Map<number, Belt>();
    const upstream = new Map<number, Belt[]>();
    for (const b of belts) {
      const n = this.entAt(b.x + DX[b.dir], b.y + DY[b.dir]);
      if (n && n.kind === 'belt' && n.dir !== (b.dir + 2) % 4) {
        downstream.set(b.id, n);
        if (!upstream.has(n.id)) upstream.set(n.id, []);
        upstream.get(n.id)!.push(b);
      }
    }
    const order: Belt[] = [];
    const seen = new Set<number>();
    const queue = belts.filter((b) => !downstream.has(b.id));
    for (const b of queue) seen.add(b.id);
    for (let qi = 0; qi < queue.length; qi++) {
      const b = queue[qi];
      order.push(b);
      for (const u of upstream.get(b.id) || []) {
        if (!seen.has(u.id)) { seen.add(u.id); queue.push(u); }
      }
    }
    for (const b of belts) if (!seen.has(b.id)) order.push(b); // Kreise
    this.beltOrder = order;

    // Kurven für die Darstellung
    for (const b of belts) {
      const feeds = (fx: number, fy: number, moveDir: number) => {
        const e = this.entAt(fx, fy);
        if (!e) return false;
        if (e.kind === 'belt') return e.dir === moveDir;
        if (!hasOutput(e.type) && !['splitter', 'filter'].includes(e.type)) return false;
        const [ox, oy] = outputCell(e);
        return ox === b.x && oy === b.y && e.dir === moveDir;
      };
      const back = feeds(b.x - DX[b.dir], b.y - DY[b.dir], b.dir);
      b.curve = 0;
      if (!back) {
        const sides: number[] = [];
        for (const s of [(b.dir + 1) % 4, (b.dir + 3) % 4]) {
          const move = (s + 2) % 4;
          if (feeds(b.x + DX[s], b.y + DY[s], move)) sides.push((move - b.dir + 4) % 4);
        }
        if (sides.length === 1) b.curve = sides[0];
      }
    }

    // Tunnel verbinden
    const linked = new Set<number>();
    for (const b of this.buildings) {
      if (b.type !== 'tunnelIn') continue;
      b.link = 0;
      for (let d = 1; d <= TUNNEL_RANGE; d++) {
        const e = this.entAt(b.x + DX[b.dir] * d, b.y + DY[b.dir] * d);
        if (e && e.kind === 'building' && e.type === 'tunnelOut' && e.dir === b.dir && !linked.has(e.id)) {
          b.link = e.id;
          linked.add(e.id);
          break;
        }
      }
    }
    // Reihenfolge: Verkauf, Lager, Logistik, Maschinen, Sammler
    const rank: Record<string, number> = { sell: 0, storage: 1, logistic: 2, machine: 3, collector: 4 };
    this.buildings.sort((a, b) => rank[BUILDINGS[a.type].category] - rank[BUILDINGS[b.type].category] || a.id - b.id);
  }

  // ================================================================ Weitergabe von Bananen
  // Versucht, eine Banane in Feld (tx, ty) zu schieben, Bewegungsrichtung moveDir
  private pushInto(tx: number, ty: number, moveDir: number, it: Item, p0: number): boolean {
    if (!inBounds(tx, ty)) return false;
    const id = this.tiles[tileIndex(tx, ty)];
    if (!id) return false;
    const e = this.ents.get(id)!;
    if (e.kind === 'belt') return this.beltAccept(e, it, moveDir, p0);
    return this.buildingAccept(e, it, moveDir);
  }

  private beltAccept(b: Belt, it: Item, moveDir: number, p0: number): boolean {
    if (b.dir === (moveDir + 2) % 4) return false; // frontal
    const tier = BELT_TIERS[b.tier];
    if (b.items.length >= tier.cap) return false;
    const spacing = 1 / tier.cap;
    const last = b.items[b.items.length - 1];
    let p = Math.max(0, Math.min(p0, 0.999));
    if (last) {
      if (last.p < spacing) return false;
      p = Math.min(p, last.p - spacing);
    }
    it.p = p;
    it.dp = p;
    b.items.push(it);
    return true;
  }

  private buildingAccept(b: Building, it: Item, moveDir: number): boolean {
    const def = BUILDINGS[b.type];
    switch (def.category) {
      case 'sell': {
        if (b.bucket < 1 || !b.enabled) return false;
        b.bucket -= 1;
        this.sellFactoryItem(it);
        b.processed++;
        b.lastWork = this.stats.time;
        this.events.push({ t: 'sell', id: b.id, value: stageValue(it) });
        return true;
      }
      case 'machine': {
        if (moveDir !== b.dir || it.s !== def.inStage) return false;
        if (b.inBuf.length >= bufferCap(machineSpeed(def, b.level))) return false;
        b.inBuf.push(it);
        return true;
      }
      case 'storage': {
        if (moveDir !== b.dir || b.inBuf.length >= (def.capacity || 0)) return false;
        b.inBuf.push(it);
        return true;
      }
      case 'logistic': {
        if (b.type === 'tunnelOut') return false;
        if (b.type === 'merger') { if (moveDir === (b.dir + 2) % 4) return false; }
        else if (moveDir !== b.dir) return false;
        if (b.type === 'tunnelIn') {
          if (!b.link || b.transit.length >= 6 * TUNNEL_RANGE) return false;
          const out = this.ents.get(b.link) as Building;
          const dist = Math.abs(out.x - b.x) + Math.abs(out.y - b.y);
          b.transit.push({ it, t: dist / 8 });
          return true;
        }
        if (b.outBuf.length >= LOGISTIC_CAP) return false;
        b.outBuf.push(it);
        return true;
      }
      default:
        return false;
    }
  }

  private pushOut(b: Building, max = Infinity): number {
    if (!b.outBuf.length) return 0;
    const [ox, oy] = outputCell(b);
    let n = 0;
    while (b.outBuf.length && n < max) {
      if (!this.pushInto(ox, oy, b.dir, b.outBuf[0], 0)) break;
      b.outBuf.shift();
      n++;
    }
    return n;
  }

  // ================================================================ Ein Simulationstakt
  step() {
    if (this.netDirty) this.rebuild();
    this.tick++;
    this.stats.time += DT;
    const sec = Math.floor(this.stats.time);
    if (sec !== this.winSec) {
      // Neue Sekunde: Raten-Fenster weiterschieben
      for (let s = this.winSec + 1; s <= sec && s <= this.winSec + WINDOW; s++) {
        this.winRevenue[s % WINDOW] = 0;
        this.winSold[s % WINDOW] = 0;
        this.winGrab[s % WINDOW] = 0;
      }
      this.winSec = sec;
      const r = this.rates();
      this.stats.maxSoldRate = Math.max(this.stats.maxSoldRate, r.sold);
      this.stats.maxGrabRate = Math.max(this.stats.maxGrabRate, r.grab);
      this.stats.maxIncomeRate = Math.max(this.stats.maxIncomeRate, r.income);
    }

    // Verkaufsstationen & Lager bekommen ihr Kontingent für diesen Takt
    for (const b of this.buildings) {
      const def = BUILDINGS[b.type];
      if (def.category === 'sell' || def.category === 'storage') {
        const per = (def.rate || 0) * DT;
        b.bucket = Math.min(b.bucket + per, per + 1);
      }
    }
    for (const belt of this.beltOrder) this.moveBelt(belt);
    for (const b of this.buildings) this.tickBuilding(b);
    this.tickManual();

    if (!this.finished && this.stats.sold === TOTAL) {
      this.finished = true;
      this.stats.finishedAt = this.stats.time;
    }
  }

  private moveBelt(b: Belt) {
    const items = b.items;
    if (!items.length) return;
    const tier = BELT_TIERS[b.tier];
    const dv = tier.speed * DT;
    const spacing = 1 / tier.cap;
    // 1) Bananen, die das Ende erreichen, weitergeben
    let k = 0;
    while (k < items.length) {
      const it = items[k];
      const np = it.p + dv;
      if (np < 1) break;
      if (!this.pushInto(b.x + DX[b.dir], b.y + DY[b.dir], b.dir, it, np - 1)) break;
      k++;
    }
    if (k) items.splice(0, k);
    // 2) Restliche Bananen nachrücken (mit Mindestabstand)
    let limit = 1;
    for (const it of items) {
      const old = it.p;
      let np = Math.min(old + dv, limit);
      if (np < old) np = old;
      it.dp = np - old;
      it.p = np;
      limit = np - spacing;
    }
  }

  private tickBuilding(b: Building) {
    const def = BUILDINGS[b.type];
    const t = this.stats.time;
    let worked = false;
    let active = false; // hatte Arbeit (für die Auslastung)
    switch (def.category) {
      case 'collector': {
        if (!b.enabled) { b.status = 'off'; break; }
        const speed = machineSpeed(def, b.level);
        const cap = bufferCap(speed);
        if (!b.radTiles) this.computeRadius(b);
        let empty = false;
        active = b.outBuf.length < cap;
        if (b.outBuf.length < cap) {
          b.progress = Math.min(b.progress + speed * DT, cap);
          while (b.progress >= 1 && b.outBuf.length < cap) {
            const tile = this.nextCollectorTile(b);
            if (tile < 0) { empty = true; b.progress = 0; break; }
            this.takeFromTile(tile);
            this.inFactory++;
            b.outBuf.push(makeItem(0, 1));
            b.progress -= 1;
            b.processed++;
            b.target = tile;
            worked = true;
            if (this.events.length < 400) this.events.push({ t: 'grab', tile, id: b.id });
          }
        }
        this.pushOut(b);
        if (b.outBuf.length >= cap) b.status = 'blocked';
        else if (empty || this.nextCollectorTile(b) < 0) { b.status = 'idle'; active = false; }
        else b.status = 'working';
        break;
      }
      case 'machine': {
        const speed = machineSpeed(def, b.level);
        const cap = bufferCap(speed);
        active = b.enabled && b.inBuf.length > 0 && b.outBuf.length < cap;
        if (active) {
          b.progress += speed * DT;
          const q = qualityMult(b.level);
          while (b.progress >= 1 && b.inBuf.length && b.outBuf.length < cap) {
            const it = b.inBuf.shift()!;
            it.s++;
            it.q *= q;
            b.outBuf.push(it);
            b.progress -= 1;
            b.processed++;
            worked = true;
          }
          if (!b.inBuf.length) b.progress = Math.min(b.progress, 0.999);
        }
        this.pushOut(b);
        if (!b.enabled) b.status = 'off';
        else if (b.outBuf.length >= cap) b.status = 'blocked';
        else if (b.inBuf.length || worked) b.status = 'working';
        else b.status = 'idle';
        break;
      }
      case 'sell':
        b.status = !b.enabled ? 'off' : t - b.lastWork < 1 ? 'working' : 'idle';
        worked = t - b.lastWork < DT * 1.5;
        break;
      case 'storage': {
        if (b.enabled) {
          // Inhalt in Reihenfolge ausgeben (Kontingent pro Takt)
          const [ox, oy] = outputCell(b);
          while (b.inBuf.length && b.bucket >= 1) {
            if (!this.pushInto(ox, oy, b.dir, b.inBuf[0], 0)) break;
            b.inBuf.shift();
            b.bucket -= 1;
            worked = true;
          }
        }
        const cap = def.capacity || 0;
        b.status = !b.enabled ? 'off' : b.inBuf.length >= cap ? 'blocked' : b.inBuf.length ? 'working' : 'idle';
        break;
      }
      case 'logistic': {
        if (!b.enabled) { b.status = 'off'; break; }
        if (b.type === 'tunnelIn') {
          const out = b.link ? (this.ents.get(b.link) as Building | undefined) : undefined;
          for (const tr of b.transit) tr.t -= DT;
          while (out && b.transit.length && b.transit[0].t <= 0 && out.outBuf.length < LOGISTIC_CAP) {
            out.outBuf.push(b.transit.shift()!.it);
            worked = true;
          }
          b.status = !b.link ? 'blocked' : b.transit.length >= 6 * TUNNEL_RANGE ? 'blocked' : b.transit.length ? 'working' : 'idle';
          break;
        }
        const n0 = b.outBuf.length;
        if (b.type === 'splitter') this.splitOut(b, [b.dir, (b.dir + 1) % 4, (b.dir + 3) % 4], () => true);
        else if (b.type === 'filter') this.filterOut(b);
        else this.pushOut(b);
        worked = b.outBuf.length !== n0;
        b.status = b.outBuf.length >= LOGISTIC_CAP ? 'blocked' : b.outBuf.length || worked ? 'working' : 'idle';
        break;
      }
    }
    if (worked) b.lastWork = t;
    b.busy += ((active || worked ? 1 : 0) - b.busy) * 0.03;
  }

  private splitOut(b: Building, dirs: number[], ok: (it: Item, d: number) => boolean) {
    let fails = 0;
    while (b.outBuf.length && fails < dirs.length) {
      const d = dirs[b.rr % dirs.length];
      b.rr++;
      const it = b.outBuf[0];
      if (ok(it, d) && this.pushInto(b.x + DX[d], b.y + DY[d], d, it, 0)) { b.outBuf.shift(); fails = 0; }
      else fails++;
    }
  }

  private filterOut(b: Building) {
    // Passender Zustand geradeaus, alles andere abwechselnd rechts/links
    let guard = 0;
    while (b.outBuf.length && guard++ < 64) {
      const it = b.outBuf[0];
      if (it.s === b.filter) {
        if (!this.pushInto(b.x + DX[b.dir], b.y + DY[b.dir], b.dir, it, 0)) break;
      } else {
        const d1 = (b.dir + 1 + (b.rr % 2) * 2) % 4, d2 = (d1 + 2) % 4;
        b.rr++;
        if (!this.pushInto(b.x + DX[d1], b.y + DY[d1], d1, it, 0) && !this.pushInto(b.x + DX[d2], b.y + DY[d2], d2, it, 0)) break;
      }
      b.outBuf.shift();
    }
  }

  // ---------------------------------------------------------------- Arbeitsradius der Sammler
  collectorCenter(b: Building): [number, number] { return [b.x + b.w / 2, b.y + b.h / 2]; }

  computeRadius(b: Building) {
    const def = BUILDINGS[b.type];
    const r = collectorRadius(def, b.level);
    const [cx, cy] = this.collectorCenter(b);
    const list: [number, number][] = [];
    for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y++) {
      for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
        if (!inBounds(x, y)) continue;
        const ex = x + 0.5 - cx, ey = y + 0.5 - cy;
        const d2 = ex * ex + ey * ey; // exakt (halbe Felder), daher überall gleich
        const i = tileIndex(x, y);
        if (d2 <= r * r && this.pile[i]) list.push([d2, i]);
      }
    }
    list.sort((a, b2) => a[0] - b2[0] || a[1] - b2[1]);
    b.radTiles = list.map((e) => e[1]);
    b.radIdx = 0;
  }

  private nextCollectorTile(b: Building): number {
    const list = b.radTiles!;
    while (b.radIdx < list.length && !this.pile[list[b.radIdx]]) b.radIdx++;
    return b.radIdx < list.length ? list[b.radIdx] : -1;
  }

  bananasInRadius(b: Building): number {
    if (!b.radTiles) this.computeRadius(b);
    let n = 0;
    for (let i = b.radIdx; i < b.radTiles!.length; i++) n += this.pile[b.radTiles![i]];
    return n;
  }

  // ================================================================ Auswertung
  rates() {
    let rev = 0, sold = 0, grab = 0;
    const n = Math.min(WINDOW - 1, Math.max(1, this.winSec));
    for (let k = 1; k <= n; k++) {
      const s = (this.winSec - k + WINDOW * 10) % WINDOW;
      rev += this.winRevenue[s];
      sold += this.winSold[s];
      grab += this.winGrab[s];
    }
    return { income: rev / n, sold: sold / n, grab: grab / n };
  }

  // Zählt alle Bananen wirklich nach (für Tests & Anzeige)
  audit() {
    let pile = 0;
    for (let i = 0; i < this.pile.length; i++) pile += this.pile[i];
    let factory = this.salvage.length;
    for (const e of this.ents.values()) factory += this.collectItems(e).length;
    let manual = 0;
    for (const m of Object.values(this.manuals)) manual += m.slots.length;
    return { pile, factory, manual, sold: this.stats.sold, total: pile + factory + manual + this.stats.sold };
  }

  factoryByStage(): number[] {
    const out = new Array(STAGES.length).fill(0);
    for (const e of this.ents.values()) for (const it of this.collectItems(e)) out[it.s]++;
    for (const it of this.salvage) out[it.s]++;
    return out;
  }

  phase(): number {
    if (this.finished) return 5;
    let collectors = 0, machines = 0, count = 0;
    for (const e of this.ents.values()) {
      if (e.kind !== 'building') continue;
      count++;
      const c = BUILDINGS[e.type].category;
      if (c === 'collector') collectors++;
      if (c === 'machine') machines++;
    }
    const mined = 1 - this.pileRemaining / TOTAL;
    if (count >= 80 || mined > 0.6) return 4;
    if (collectors >= 6 || mined > 0.15) return 3;
    if (machines >= 2 && collectors >= 2) return 2;
    if (collectors >= 1) return 1;
    return 0;
  }

  buildingList(): Building[] {
    const out: Building[] = [];
    for (const e of this.ents.values()) if (e.kind === 'building') out.push(e);
    return out;
  }

  // ================================================================ Spielstand
  serialize(): SaveData {
    const pile: number[] = [];
    for (let i = 0; i < this.pile.length; i++) if (this.pile[i]) pile.push(i, this.pile[i]);
    const enc = (list: Item[]) => list.flatMap((it) => [it.s, +it.q.toFixed(6), +it.p.toFixed(4)]);
    const ents: SavedEnt[] = [];
    for (const e of this.ents.values()) {
      if (e.kind === 'belt') ents.push({ k: 'belt', id: e.id, x: e.x, y: e.y, dir: e.dir, tier: e.tier, inv: e.invested, items: enc(e.items) });
      else ents.push({
        k: 'b', id: e.id, type: e.type, x: e.x, y: e.y, dir: e.dir, level: e.level, inv: e.invested, en: e.enabled,
        inBuf: enc(e.inBuf), outBuf: enc(e.outBuf), pr: e.progress, f: e.filter, rr: e.rr, bu: e.bucket, n: e.processed,
        tr: e.transit.flatMap((t) => [t.it.s, +t.it.q.toFixed(6), +t.t.toFixed(3)]),
      });
    }
    return {
      v: 1, money: this.money, nextId: this.nextId, tick: this.tick, finished: this.finished,
      pile, ents, salvage: enc(this.salvage), manuals: JSON.parse(JSON.stringify(this.manuals)), stats: { ...this.stats },
      win: [Array.from(this.winRevenue), Array.from(this.winSold), Array.from(this.winGrab), this.winSec],
    };
  }

  static deserialize(d: SaveData): Sim {
    if (!d || d.v !== 1) throw new Error('Unbekanntes Spielstand-Format');
    const pile = new Uint32Array(MAP_W * MAP_H);
    for (let k = 0; k < d.pile.length; k += 2) pile[d.pile[k]] = d.pile[k + 1];
    const sim = new Sim(pile);
    const dec = (arr: number[]) => {
      const out: Item[] = [];
      for (let k = 0; k < arr.length; k += 3) out.push({ s: arr[k], q: arr[k + 1], p: arr[k + 2], dp: 0 });
      return out;
    };
    sim.money = d.money;
    sim.nextId = d.nextId;
    sim.tick = d.tick;
    sim.finished = d.finished;
    sim.stats = { ...sim.stats, ...d.stats };
    // Ältere Spielstände hatten nur einen Handbereich
    const manuals = d.manuals || (d.manual ? { [LOCAL]: d.manual } : {});
    for (const [pid, m] of Object.entries(manuals)) {
      const base = newManual();
      sim.manuals[pid] = { ...base, ...m, up: { ...base.up, ...(m.up || {}) }, slots: (m.slots || []).map((b) => ({ mask: b.mask | 0 })) };
    }
    sim.salvage = dec(d.salvage);
    for (const s of d.ents) {
      if (s.k === 'belt') {
        const belt: Belt = { kind: 'belt', id: s.id, x: s.x, y: s.y, dir: s.dir, tier: s.tier, items: dec(s.items), invested: s.inv, curve: 0 };
        sim.ents.set(belt.id, belt);
        sim.occupyPublic(belt);
      } else {
        if (!BUILDINGS[s.type]) throw new Error('Unbekanntes Gebäude: ' + s.type);
        const b = sim.newBuilding(s.type, s.x, s.y, s.dir, s.level, s.inv);
        b.id = s.id;
        b.enabled = s.en;
        b.inBuf = dec(s.inBuf);
        b.outBuf = dec(s.outBuf);
        b.progress = s.pr;
        b.filter = s.f;
        b.rr = s.rr;
        b.bucket = s.bu;
        b.processed = s.n || 0;
        for (let k = 0; k < s.tr.length; k += 3) b.transit.push({ it: { s: s.tr[k], q: s.tr[k + 1], p: 0, dp: 0 }, t: s.tr[k + 2] });
        sim.ents.set(b.id, b);
        sim.occupyPublic(b);
      }
    }
    if (d.win) {
      sim.winRevenue = Float64Array.from(d.win[0]);
      sim.winSold = Float64Array.from(d.win[1]);
      sim.winGrab = Float64Array.from(d.win[2]);
      sim.winSec = d.win[3];
    }
    sim.nextId = d.nextId; // newBuilding() hat beim Laden hochgezählt
    const a = sim.audit();
    sim.inFactory = a.factory;
    if (a.total !== TOTAL) throw new Error(`Spielstand ungültig: ${a.total} statt ${TOTAL} Bananen`);
    sim.netDirty = true;
    return sim;
  }

  private occupyPublic(e: Ent) { this.occupy(e, true); }
}

// Wie viele „Höhenstufen“ ein Feld hat – ändert sich nur gelegentlich (spart Neuzeichnen)
export function visualLevel(count: number): number {
  if (count <= 0) return 0;
  return 1 + Math.floor(Math.sqrt(count) * 1.6);
}
export function pileHeight(count: number): number {
  return count <= 0 ? 0 : 0.12 + Math.sqrt(count) * 0.58;
}

export type SavedEnt =
  | { k: 'belt'; id: number; x: number; y: number; dir: number; tier: number; inv: number; items: number[] }
  | {
    k: 'b'; id: number; type: string; x: number; y: number; dir: number; level: number; inv: number; en: boolean;
    inBuf: number[]; outBuf: number[]; pr: number; f: number; rr: number; bu: number; n: number; tr: number[];
  };

export interface SaveData {
  v: 1;
  money: number;
  nextId: number;
  tick: number;
  finished: boolean;
  pile: number[];
  ents: SavedEnt[];
  salvage: number[];
  manuals?: Record<string, Manual>;
  manual?: Manual;
  stats: Stats;
  win?: [number[], number[], number[], number];
}
