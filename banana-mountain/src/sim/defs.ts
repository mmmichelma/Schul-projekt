/*
 * Banana Mountain – alle Spielwerte an einem Ort.
 * Diese Datei kennt keine Grafik, nur Zahlen und Regeln.
 */

export const TOTAL = 1_000_000;

// Bauraster (1 Feld = 1 Einheit in der 3D-Welt)
export const MAP_W = 128;
export const MAP_H = 112;
export const PILE_CX = 64;
export const PILE_CY = 42;
export const PILE_R = 31;

// Feste Simulationsrate
export const SIM_HZ = 20;
export const DT = 1 / SIM_HZ;

// Richtungen: 0 = Ost (+x), 1 = Süd (+y), 2 = West (−x), 3 = Nord (−y)
export const DX = [1, 0, -1, 0];
export const DY = [0, 1, 0, -1];

export interface StageDef {
  name: string;
  short: string;
  value: number;
  color: string;
}

export const STAGES: StageDef[] = [
  { name: 'Rohe Banane', short: 'Roh', value: 1, color: '#ffd21f' },
  { name: 'Geschälte Banane', short: 'Geschält', value: 3, color: '#f4ecc8' },
  { name: 'Geschnittene Banane', short: 'Geschnitten', value: 6, color: '#efe3b0' },
  { name: 'Gebackene Banane', short: 'Gebacken', value: 12, color: '#c98a3c' },
  { name: 'Karamellisierte Banane', short: 'Karamell', value: 25, color: '#d9822b' },
  { name: 'Schokolierte Banane', short: 'Schoko', value: 50, color: '#5a321b' },
  { name: 'Glasierte Banane', short: 'Glasiert', value: 100, color: '#f27aa8' },
  { name: 'Veredelte Banane', short: 'Veredelt', value: 200, color: '#ffcf40' },
  { name: 'Verpackte Banane', short: 'Verpackt', value: 350, color: '#c49a6c' },
  { name: 'Premium-Bananenprodukt', short: 'Premium', value: 500, color: '#8e5cf0' },
];

export type Category = 'collector' | 'machine' | 'sell' | 'storage' | 'logistic';

export interface BuildingDef {
  id: string;
  name: string;
  category: Category;
  price: number;
  w: number;
  h: number;
  desc: string;
  speed?: number;      // Sammler & Maschinen: Bananen pro Sekunde
  radius?: number;     // Sammler: Arbeitsradius in Feldern
  inStage?: number;    // Maschinen: benötigter Zustand
  rate?: number;       // Verkauf & Lager: Bananen pro Sekunde
  capacity?: number;   // Lager
  upgradable?: boolean;
  hidden?: boolean;     // nicht in der Bauleiste (z. B. die Bananen-Base)
  fixed?: boolean;      // kann nicht abgerissen werden
}

const B: BuildingDef[] = [
  // ---------------------------------------------------------------- Sammelmaschinen
  { id: 'grab1', name: 'Kleiner Greifarm', category: 'collector', price: 50, w: 2, h: 2, speed: 1, radius: 4, upgradable: true, desc: 'Greift Bananen aus dem Haufen.' },
  { id: 'grab2', name: 'Doppelgreifarm', category: 'collector', price: 300, w: 2, h: 2, speed: 3, radius: 5, upgradable: true, desc: 'Zwei Arme, doppelt so fleißig.' },
  { id: 'vacuum', name: 'Bananensauger', category: 'collector', price: 2000, w: 2, h: 2, speed: 10, radius: 6, upgradable: true, desc: 'Saugt Bananen durch einen Schlauch.' },
  { id: 'robot', name: 'Sammelroboter', category: 'collector', price: 15000, w: 3, h: 3, speed: 25, radius: 7, upgradable: true, desc: 'Ein Roboter mit vier Greifern.' },
  { id: 'digger', name: 'Industrieller Bagger', category: 'collector', price: 100000, w: 3, h: 3, speed: 100, radius: 9, upgradable: true, desc: 'Schaufelt ganze Ladungen.' },
  { id: 'mega', name: 'Mega-Sammler', category: 'collector', price: 1000000, w: 4, h: 4, speed: 500, radius: 12, upgradable: true, desc: 'Ein riesiges Schaufelrad.' },
  // ---------------------------------------------------------------- Produktion
  { id: 'peeler', name: 'Schälmaschine', category: 'machine', price: 100, w: 2, h: 2, speed: 2, inStage: 0, upgradable: true, desc: 'Roh → Geschält' },
  { id: 'cutter', name: 'Schneidemaschine', category: 'machine', price: 250, w: 2, h: 2, speed: 2, inStage: 1, upgradable: true, desc: 'Geschält → Geschnitten' },
  { id: 'oven', name: 'Backofen', category: 'machine', price: 500, w: 2, h: 2, speed: 1, inStage: 2, upgradable: true, desc: 'Geschnitten → Gebacken' },
  { id: 'caramel', name: 'Karamellisierer', category: 'machine', price: 1500, w: 2, h: 2, speed: 1, inStage: 3, upgradable: true, desc: 'Gebacken → Karamellisiert' },
  { id: 'choco', name: 'Schokoladenmaschine', category: 'machine', price: 4000, w: 2, h: 2, speed: 1, inStage: 4, upgradable: true, desc: 'Karamellisiert → Schokoliert' },
  { id: 'glaze', name: 'Glasiermaschine', category: 'machine', price: 10000, w: 2, h: 2, speed: 2, inStage: 5, upgradable: true, desc: 'Schokoliert → Glasiert' },
  { id: 'refine', name: 'Veredelungsmaschine', category: 'machine', price: 25000, w: 2, h: 2, speed: 2, inStage: 6, upgradable: true, desc: 'Glasiert → Veredelt' },
  { id: 'pack', name: 'Verpackungsmaschine', category: 'machine', price: 75000, w: 2, h: 2, speed: 3, inStage: 7, upgradable: true, desc: 'Veredelt → Verpackt' },
  { id: 'premium', name: 'Premium-Produktionsmaschine', category: 'machine', price: 250000, w: 3, h: 3, speed: 5, inStage: 8, upgradable: true, desc: 'Verpackt → Premium' },
  // ---------------------------------------------------------------- Verkauf
  { id: 'base', name: 'Bananen-Base', category: 'sell', price: 0, w: 4, h: 3, rate: 20, hidden: true, fixed: true, desc: 'Deine Base: Hier verkaufst du Bananen aus deinen Händen. Förderbänder können von allen Seiten anliefern (20/s).' },
  { id: 'sell1', name: 'Standard-Verkauf', category: 'sell', price: 200, w: 2, h: 2, rate: 10, desc: 'Verkauft 10 Bananen/s. Nimmt von allen Seiten an.' },
  { id: 'sell2', name: 'Großhandel', category: 'sell', price: 15000, w: 3, h: 3, rate: 50, desc: 'Verkauft 50 Bananen/s.' },
  { id: 'sell3', name: 'Exportzentrum', category: 'sell', price: 250000, w: 3, h: 3, rate: 250, desc: 'Verkauft 250 Bananen/s.' },
  { id: 'sell4', name: 'Globales Vertriebszentrum', category: 'sell', price: 2000000, w: 4, h: 4, rate: 1000, desc: 'Verkauft 1.000 Bananen/s.' },
  // ---------------------------------------------------------------- Lager
  { id: 'buffer', name: 'Puffer', category: 'storage', price: 100, w: 1, h: 1, capacity: 50, rate: 20, desc: 'Kleiner Zwischenspeicher (50).' },
  { id: 'storage', name: 'Lager', category: 'storage', price: 1500, w: 2, h: 2, capacity: 1000, rate: 60, desc: 'Großes Lager (1.000).' },
  { id: 'silo', name: 'Bananensilo', category: 'storage', price: 40000, w: 3, h: 3, capacity: 20000, rate: 400, desc: 'Riesiges Silo (20.000).' },
  // ---------------------------------------------------------------- Logistik
  { id: 'splitter', name: 'Förderbandteiler', category: 'logistic', price: 20, w: 1, h: 1, desc: 'Teilt ein Band auf vorne, rechts und links – gleichmäßig oder mit Vorfahrt. Auch direkt auf ein Band setzbar.' },
  { id: 'merger', name: 'Förderbandverbinder', category: 'logistic', price: 20, w: 1, h: 1, desc: 'Führt bis zu drei Bänder fair zu einem zusammen.' },
  { id: 'filter', name: 'Filter', category: 'logistic', price: 100, w: 1, h: 1, desc: 'Gewählte Zustände gehen geradeaus, alle anderen zur Seite.' },
  { id: 'crossing', name: 'Kreuzung', category: 'logistic', price: 30, w: 1, h: 1, desc: 'Zwei Bänder kreuzen sich, ohne sich zu vermischen.' },
  { id: 'tunnelIn', name: 'Tunnel-Eingang', category: 'logistic', price: 50, w: 1, h: 1, desc: 'Unterirdisches Band – verbindet sich mit dem nächsten Ausgang (max. 6 Felder).' },
  { id: 'tunnelOut', name: 'Tunnel-Ausgang', category: 'logistic', price: 50, w: 1, h: 1, desc: 'Ende eines unterirdischen Bandes.' },
];

export const BUILDINGS: Record<string, BuildingDef> = Object.fromEntries(B.map((b) => [b.id, b]));
export const BUILDING_LIST = B;

export interface BeltTier {
  name: string;
  price: number;
  cap: number;     // Plätze pro Feld
  speed: number;   // Felder pro Sekunde
  color: string;
}
// Durchsatz = cap × speed
export const BELT_TIERS: BeltTier[] = [
  { name: 'Standard', price: 2, cap: 4, speed: 0.5, color: '#c9a227' },
  { name: 'Schnell', price: 10, cap: 4, speed: 1.25, color: '#d94040' },
  { name: 'Turbo', price: 50, cap: 6, speed: 2.5, color: '#3a7bd5' },
  { name: 'Industriell', price: 200, cap: 10, speed: 5, color: '#9b59b6' },
  { name: 'Hyper', price: 1000, cap: 20, speed: 10, color: '#19d3e6' },
];
export const beltThroughput = (t: number) => BELT_TIERS[t].cap * BELT_TIERS[t].speed;

export const MAX_LEVEL = 10;
// Teiler, Verbinder, Filter und Kreuzung sind kleine Kreuzungs-Bänder mit Band-Stufen
export const NODE_TYPES = new Set(['splitter', 'merger', 'filter', 'crossing']);
export const nodeTierCost = (tier: number) => (BELT_TIERS[tier + 1].price - BELT_TIERS[tier].price) * 10;
export const TUNNEL_RANGE = 6;
export const LOGISTIC_CAP = 12;

// Formeln aus der Spielbeschreibung
// Potenz per Multiplikation: liefert auf jedem Gerät exakt dasselbe Ergebnis (wichtig für den Online-Modus)
export function ipow(base: number, exp: number): number {
  let r = 1;
  for (let i = 0; i < exp; i++) r *= base;
  return r;
}
export const machineSpeed = (def: BuildingDef, level: number) => (def.speed || 0) * ipow(1.5, level - 1);
export const qualityMult = (level: number) => 1 + 0.15 * (level - 1);
export const upgradeCost = (def: BuildingDef, level: number) => def.price * ipow(1.8, level);
export const collectorRadius = (def: BuildingDef, level: number) => (def.radius || 0) + (level - 1);
export const bufferCap = (speed: number) => Math.max(4, Math.ceil(speed * 0.6));

// ---------------------------------------------------------------- Hand-Upgrades (Phase 1)
export interface ManualUpgradeDef {
  id: ManualUpgradeId;
  name: string;
  desc: string;
  costs: number[];
}
export type ManualUpgradeId = 'finger' | 'strips' | 'hands' | 'tongs' | 'autosell' | 'autograb' | 'apprentice';

export const MANUAL_UPGRADES: ManualUpgradeDef[] = [
  { id: 'finger', name: 'Geschickte Finger', desc: 'Du musst weniger weit ziehen, um einen Streifen abzuschälen.', costs: [8, 60] },
  { id: 'strips', name: 'Profi-Schältechnik', desc: 'Ein Zug schält 2 Streifen – auf der höchsten Stufe alle 3.', costs: [35, 220] },
  { id: 'hands', name: 'Mehr Hände', desc: 'Du hältst eine Banane mehr. Alle werden gleichzeitig geschält.', costs: [20, 90, 400, 1800, 7500] },
  { id: 'tongs', name: 'Bananenzange', desc: 'Ein Klick auf den Berg füllt alle freien Hände.', costs: [45] },
  { id: 'autosell', name: 'Verkaufskorb', desc: 'An einer Verkaufsstation werden geschälte Bananen automatisch verkauft – du musst nur hinlaufen.', costs: [70] },
  { id: 'autograb', name: 'Nachschub-Rutsche', desc: 'Leere Hände werden automatisch aus dem Berg gefüllt.', costs: [350, 1500, 6000, 24000] },
  { id: 'apprentice', name: 'Schäl-Lehrling', desc: 'Ein Helfer schält automatisch Streifen ab.', costs: [250, 1200, 5000, 20000, 80000] },
];
export const AUTOGRAB_RATE = [0, 0.5, 1, 2, 4];       // Bananen pro Sekunde
export const APPRENTICE_RATE = [0, 0.6, 1.2, 2.5, 5, 10]; // Streifen pro Sekunde
export const PEEL_DISTANCE = [70, 45, 25];              // Pixel Ziehweg

export const PHASES = [
  'Phase 1 – Handarbeit',
  'Phase 2 – Erste Automatisierung',
  'Phase 3 – Kleine Fabrik',
  'Phase 4 – Industrielle Fabrik',
  'Phase 5 – Megafabrik',
  'Phase 6 – Geschafft!',
];
