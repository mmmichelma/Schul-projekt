/*
 * 3D-Modelle aller Gebäude mit Animationen.
 * Lokales Koordinatensystem: Ausgang zeigt nach +x, Eingang ist bei −x,
 * Mittelpunkt der Grundfläche liegt im Ursprung.
 */
import * as THREE from 'three';
import { BUILDINGS, STAGES, BELT_TIERS } from '../sim/defs';
import type { Status } from '../sim/sim';
import { bananaGeometry, gearGeometry, hazardTexture, dripTexture, labelTexture, canvasTexture } from './assets';

export interface ModelCtx {
  t: number;
  dt: number;
  status: Status;
  speed: number;
  fill: number;        // 0..1 Füllstand (Lager)
  target: { x: number; z: number } | null; // lokale Richtung zum Ziel (Sammler)
  filterStage: number;   // Filter: Bitmaske der Zustände
  outMask?: number;      // Teiler/Filter: aktive Ausgänge (1 vorne, 2 rechts, 4 links)
  tier?: number;         // Knoten: Band-Stufe
  prio?: boolean;
}

export interface Model {
  group: THREE.Group;
  detail: THREE.Group;
  lod: THREE.Mesh;
  lamp: THREE.Mesh;
  emitters: THREE.Object3D[];
  update: (c: ModelCtx) => void;
}

// ---------------------------------------------------------------- Materialien
const std = (color: string, rough = 0.6, metal = 0.1, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra });

let M: Record<string, THREE.MeshStandardMaterial> | null = null;
function mats() {
  if (M) return M;
  const hz = hazardTexture();
  M = {
    steel: std('#9aa3ae', 0.4, 0.65),
    dark: std('#3f4650', 0.55, 0.5),
    darker: std('#262a30', 0.7, 0.3),
    panel: std('#d5dbe2', 0.55, 0.15),
    panelBlue: std('#5b7fa6', 0.5, 0.25),
    yellow: std('#f2c230', 0.45, 0.15),
    orange: std('#ff8a1f', 0.45, 0.1),
    red: std('#d94040', 0.5, 0.1),
    green: std('#3fae4b', 0.5, 0.1),
    blue: std('#3a7bd5', 0.45, 0.2),
    purple: std('#7b3fe4', 0.4, 0.3),
    white: std('#f2f2f2', 0.6),
    black: std('#1a1c20', 0.8),
    rubber: std('#22252a', 0.9),
    copper: std('#c87533', 0.3, 0.85),
    gold: std('#ffcf40', 0.22, 0.95),
    brick: std('#9b4a32', 0.9),
    wood: std('#9a6a3c', 0.8),
    cardboard: std('#c49a6c', 0.85),
    chocolate: std('#5a321b', 0.25, 0.05),
    caramel: std('#e08a28', 0.18, 0.1, { emissive: '#3a1800', emissiveIntensity: 0.4 }),
    pink: std('#f27aa8', 0.2),
    cream: std('#f6eecb', 0.6),
    glass: std('#a8d8ff', 0.05, 0.1, { transparent: true, opacity: 0.35 }),
    hazard: std('#ffffff', 0.6, 0.1, { map: hz }),
    banana: std('#ffffff', 0.55, 0, { vertexColors: true }),
    screen: std('#0b2a1a', 0.3, 0, { emissive: '#2bff88', emissiveIntensity: 0.7 }),
  };
  return M;
}

export const LAMP_MATS: Record<Status, THREE.MeshStandardMaterial> = {
  working: std('#3dff6a', 0.3, 0, { emissive: '#22ff55', emissiveIntensity: 1.6 }),
  idle: std('#ffd21f', 0.3, 0, { emissive: '#ffcc00', emissiveIntensity: 1.4 }),
  blocked: std('#ff3b30', 0.3, 0, { emissive: '#ff2a1a', emissiveIntensity: 1.8 }),
  off: std('#8a8f96', 0.6, 0, { emissive: '#000000' }),
};

// ---------------------------------------------------------------- Bausteine
function add<T extends THREE.Object3D>(parent: THREE.Object3D, o: T, x = 0, y = 0, z = 0): T {
  o.position.set(x, y, z);
  o.traverse((c) => { if ((c as THREE.Mesh).isMesh) { c.castShadow = true; c.receiveShadow = true; } });
  parent.add(o);
  return o;
}
const boxG = new Map<string, THREE.BoxGeometry>();
function box(p: THREE.Object3D, w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0) {
  const k = `${w},${h},${d}`;
  if (!boxG.has(k)) boxG.set(k, new THREE.BoxGeometry(w, h, d));
  return add(p, new THREE.Mesh(boxG.get(k)!, m), x, y, z);
}
function cyl(p: THREE.Object3D, rt: number, rb: number, h: number, m: THREE.Material, x = 0, y = 0, z = 0, seg = 16) {
  return add(p, new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m), x, y, z);
}
function sphere(p: THREE.Object3D, r: number, m: THREE.Material, x = 0, y = 0, z = 0) {
  return add(p, new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), m), x, y, z);
}
function group(p: THREE.Object3D, x = 0, y = 0, z = 0) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  p.add(g);
  return g;
}

const GEARS = new Map<string, THREE.BufferGeometry>();
function gear(p: THREE.Object3D, r: number, m: THREE.Material, x: number, y: number, z: number) {
  const k = String(r);
  if (!GEARS.has(k)) GEARS.set(k, gearGeometry(r, Math.max(8, Math.round(r * 22)), 0.08));
  return add(p, new THREE.Mesh(GEARS.get(k)!, m), x, y, z);
}

let smallBanana: THREE.BufferGeometry | null = null;
function bananaMesh(scale = 1) {
  if (!smallBanana) smallBanana = bananaGeometry({ len: 0.5, radius: 0.065, bend: 0.12, seg: 9 });
  const m = new THREE.Mesh(smallBanana, mats().banana);
  m.scale.setScalar(scale);
  m.castShadow = true;
  return m;
}

// Grundplatte mit Warnstreifen
function basePlate(p: THREE.Object3D, w: number, h: number, mat?: THREE.Material) {
  const m = mats();
  box(p, w - 0.06, 0.14, h - 0.06, mat || m.dark, 0, 0.07, 0);
  const t = 0.07;
  box(p, w - 0.06, 0.03, t, m.hazard, 0, 0.155, h / 2 - 0.03 - t / 2);
  box(p, w - 0.06, 0.03, t, m.hazard, 0, 0.155, -h / 2 + 0.03 + t / 2);
}

function ports(p: THREE.Object3D, w: number, h: number, input: boolean, output: boolean) {
  const m = mats();
  const oz = Math.floor(h / 2) + 0.5 - h / 2;
  if (output) {
    const g = group(p, w / 2 - 0.12, 0.2, oz);
    box(g, 0.24, 0.3, 0.62, m.steel, 0, 0.1, 0);
    box(g, 0.05, 0.22, 0.48, m.darker, 0.11, 0.08, 0);
    box(g, 0.05, 0.04, 0.5, m.orange, 0.12, 0.23, 0);
  }
  if (input) {
    for (let ly = 0; ly < h; ly++) {
      const z = ly + 0.5 - h / 2;
      const g = group(p, -w / 2 + 0.12, 0.2, z);
      box(g, 0.24, 0.26, 0.6, m.steel, 0, 0.08, 0);
      box(g, 0.05, 0.18, 0.46, m.darker, -0.11, 0.06, 0);
      box(g, 0.05, 0.04, 0.48, m.green, -0.12, 0.2, 0);
    }
  }
}

function lampAt(p: THREE.Object3D, x: number, y: number, z: number): THREE.Mesh {
  const m = mats();
  cyl(p, 0.025, 0.025, y, m.dark, x, y / 2, z, 6);
  const lamp = sphere(p, 0.11, LAMP_MATS.idle, x, y + 0.06, z);
  lamp.castShadow = false;
  return lamp;
}

const LOD_COLORS: Record<string, string> = {
  collector: '#e8871e', machine: '#6c8db5', sell: '#3fae4b', storage: '#a0784a', logistic: '#8a929c',
};

function finish(type: string, detail: THREE.Group, lamp: THREE.Mesh, height: number, update: (c: ModelCtx) => void, emitters: THREE.Object3D[] = []): Model {
  const def = BUILDINGS[type];
  const g = new THREE.Group();
  g.add(detail);
  const lod = new THREE.Mesh(new THREE.BoxGeometry(def.w - 0.12, height, def.h - 0.12), std(LOD_COLORS[def.category], 0.6, 0.2));
  lod.position.y = height / 2;
  lod.visible = false;
  lod.castShadow = true;
  g.add(lod);
  return { group: g, detail, lod, lamp, emitters, update };
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (t: number) => t * t * (3 - 2 * t);
const yawTo = (v: { x: number; z: number } | null) => (v ? Math.atan2(-v.z, v.x) : 0);
function dampAngle(cur: number, target: number, k: number, dt: number) {
  let d = target - cur;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return cur + d * (1 - Math.exp(-k * dt));
}

// ================================================================ Sammelmaschinen
function grabArm(p: THREE.Object3D, scale: number, color: THREE.Material) {
  const m = mats();
  const turret = group(p, 0, 0.16, 0);
  cyl(turret, 0.32 * scale, 0.38 * scale, 0.3, m.dark, 0, 0.15, 0, 20);
  cyl(turret, 0.2 * scale, 0.25 * scale, 0.25, color, 0, 0.42, 0, 16);
  const shoulder = group(turret, 0, 0.55, 0);
  const a1 = group(shoulder);
  box(a1, 0.9 * scale, 0.16, 0.16, color, 0.45 * scale, 0, 0);
  cyl(a1, 0.1, 0.1, 0.22, m.steel, 0, 0, 0, 12).rotation.x = Math.PI / 2;
  const elbow = group(a1, 0.9 * scale, 0, 0);
  cyl(elbow, 0.09, 0.09, 0.2, m.steel, 0, 0, 0, 12).rotation.x = Math.PI / 2;
  const a2 = group(elbow);
  box(a2, 0.75 * scale, 0.12, 0.12, m.steel, 0.37 * scale, 0, 0);
  const wrist = group(a2, 0.75 * scale, 0, 0);
  box(wrist, 0.12, 0.1, 0.25, m.dark, 0, -0.05, 0);
  const f1 = box(wrist, 0.05, 0.22, 0.05, m.darker, 0, -0.18, 0.1);
  const f2 = box(wrist, 0.05, 0.22, 0.05, m.darker, 0, -0.18, -0.1);
  const held = bananaMesh(0.8);
  held.position.set(0, -0.28, 0);
  wrist.add(held);
  return { turret, a1, a2, wrist, f1, f2, held };
}

function animateArm(arm: ReturnType<typeof grabArm>, c: ModelCtx, phaseOffset: number, rate: number) {
  const working = c.status === 'working';
  const ph = working ? (c.t * rate + phaseOffset) % 1 : 0.9;
  const targetYaw = yawTo(c.target);
  let yaw: number, reach: number, grip: number;
  if (ph < 0.35) { yaw = targetYaw; reach = ease(ph / 0.35); grip = 0; }
  else if (ph < 0.45) { yaw = targetYaw; reach = 1; grip = (ph - 0.35) / 0.1; }
  else if (ph < 0.8) { const k = ease((ph - 0.45) / 0.35); yaw = targetYaw * (1 - k); reach = 1 - k * 0.7; grip = 1; }
  else { yaw = 0; reach = 0.3; grip = 1 - (ph - 0.8) / 0.2; }
  arm.turret.rotation.y = dampAngle(arm.turret.rotation.y, working ? yaw : 0, 14, c.dt);
  arm.a1.rotation.z = lerp(0.9, 0.15, reach);
  arm.a2.rotation.z = lerp(-1.9, -1.35, reach);
  arm.wrist.rotation.z = -(arm.a1.rotation.z + arm.a2.rotation.z);
  arm.f1.position.z = lerp(0.12, 0.06, grip);
  arm.f2.position.z = -arm.f1.position.z;
  arm.held.visible = working && ph >= 0.42 && ph < 0.85;
}

function buildGrab1(type: string): Model {
  const m = mats();
  const d = new THREE.Group();
  basePlate(d, 2, 2);
  ports(d, 2, 2, false, true);
  const arm = grabArm(d, 1, m.orange);
  const lamp = lampAt(d, -0.75, 0.8, -0.75);
  return finish(type, d, lamp, 1.2, (c) => animateArm(arm, c, 0, Math.min(1.6, 0.5 + c.speed * 0.4)));
}

function buildGrab2(type: string): Model {
  const m = mats();
  const d = new THREE.Group();
  basePlate(d, 2, 2);
  ports(d, 2, 2, false, true);
  const g1 = group(d, -0.15, 0, -0.45);
  const g2 = group(d, -0.15, 0, 0.45);
  const a = grabArm(g1, 0.85, m.yellow);
  const b = grabArm(g2, 0.85, m.yellow);
  const lamp = lampAt(d, 0.75, 0.8, -0.75);
  return finish(type, d, lamp, 1.2, (c) => {
    const rate = Math.min(1.8, 0.6 + c.speed * 0.25);
    animateArm(a, c, 0, rate);
    animateArm(b, c, 0.5, rate);
  });
}

function buildVacuum(type: string): Model {
  const m = mats();
  const d = new THREE.Group();
  basePlate(d, 2, 2);
  ports(d, 2, 2, false, true);
  cyl(d, 0.55, 0.6, 1.1, m.green, -0.2, 0.7, 0, 24);
  cyl(d, 0.56, 0.56, 0.08, m.steel, -0.2, 0.95, 0, 24);
  cyl(d, 0.56, 0.56, 0.08, m.steel, -0.2, 0.45, 0, 24);
  const gauge = cyl(d, 0.14, 0.14, 0.04, m.white, 0.33, 0.8, 0, 16);
  gauge.rotation.z = Math.PI / 2;
  const fanG = group(d, -0.2, 1.3, 0);
  cyl(fanG, 0.12, 0.12, 0.12, m.dark, 0, 0, 0, 12);
  const blades: THREE.Mesh[] = [];
  for (let i = 0; i < 4; i++) {
    const bl = box(fanG, 0.45, 0.02, 0.1, m.steel, 0, 0.07, 0);
    bl.rotation.y = (i * Math.PI) / 2;
    bl.geometry = bl.geometry.clone().translate(0.22, 0, 0);
    blades.push(bl);
  }
  const hoseYaw = group(d, -0.2, 1.05, 0);
  const curve = new THREE.CubicBezierCurve3(
    new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.8, 0.9, 0), new THREE.Vector3(1.8, 0.6, 0), new THREE.Vector3(2.3, -0.75, 0),
  );
  const hose = add(hoseYaw, new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.11, 10), m.rubber));
  const nozzle = cyl(hoseYaw, 0.17, 0.12, 0.3, m.steel, 2.3, -0.85, 0, 14);
  const lamp = lampAt(d, 0.75, 0.9, -0.75);
  return finish(type, d, lamp, 1.4, (c) => {
    const w = c.status === 'working';
    fanG.rotation.y += c.dt * (w ? 14 : 0.5);
    hoseYaw.rotation.y = dampAngle(hoseYaw.rotation.y, yawTo(c.target), 4, c.dt);
    const s = w ? 1 + Math.sin(c.t * 25) * 0.04 : 1;
    hose.scale.set(1, s, s);
    nozzle.rotation.z = w ? Math.sin(c.t * 18) * 0.08 : 0;
  });
}

function buildRobot(type: string): Model {
  const m = mats();
  const d = new THREE.Group();
  basePlate(d, 3, 3);
  ports(d, 3, 3, false, true);
  for (const z of [-0.8, 0.8]) box(d, 2.2, 0.35, 0.45, m.rubber, -0.1, 0.32, z);
  const body = group(d, -0.1, 0.5, 0);
  box(body, 1.4, 0.9, 1.3, m.panel, 0, 0.45, 0);
  box(body, 1.42, 0.12, 1.32, m.blue, 0, 0.75, 0);
  const head = group(body, 0, 1.05, 0);
  box(head, 0.7, 0.45, 0.6, m.panel, 0, 0.1, 0);
  const eyes = [sphere(head, 0.07, LAMP_MATS.working, 0.35, 0.15, 0.15), sphere(head, 0.07, LAMP_MATS.working, 0.35, 0.15, -0.15)];
  cyl(head, 0.02, 0.02, 0.4, m.dark, 0, 0.5, 0, 6);
  const ant = sphere(head, 0.06, LAMP_MATS.blocked, 0, 0.72, 0);
  const arms: THREE.Group[] = [];
  for (const [x, z] of [[0.4, 0.7], [0.4, -0.7], [-0.4, 0.7], [-0.4, -0.7]]) {
    const a = group(body, x, 0.6, z);
    box(a, 0.8, 0.12, 0.12, m.steel, 0.4, 0, 0);
    const claw = bananaMesh(0.6);
    claw.position.set(0.85, -0.1, 0);
    a.add(claw);
    arms.push(a);
  }
  const lamp = lampAt(d, -1.25, 1.4, -1.25);
  return finish(type, d, lamp, 1.8, (c) => {
    const w = c.status === 'working';
    head.rotation.y = dampAngle(head.rotation.y, w ? yawTo(c.target) : 0, 5, c.dt);
    arms.forEach((a, i) => {
      a.rotation.y = (i % 2 ? -1 : 1) * 0.5 + (w ? Math.sin(c.t * 6 + i * 1.6) * 0.7 : 0);
      a.rotation.z = w ? Math.sin(c.t * 6 + i) * 0.4 - 0.2 : -0.4;
      (a.children[1] as THREE.Mesh).visible = w && Math.sin(c.t * 6 + i * 1.6) > 0;
    });
    body.position.y = 0.5 + (w ? Math.abs(Math.sin(c.t * 8)) * 0.04 : 0);
    ant.material = Math.sin(c.t * 5) > 0 ? LAMP_MATS.blocked : LAMP_MATS.off;
    for (const e of eyes) e.scale.y = Math.sin(c.t * 1.3) > 0.97 ? 0.2 : 1;
  });
}

function buildDigger(type: string): Model {
  const m = mats();
  const d = new THREE.Group();
  basePlate(d, 3, 3);
  ports(d, 3, 3, false, true);
  for (const z of [-0.85, 0.85]) {
    box(d, 2.4, 0.45, 0.5, m.rubber, -0.1, 0.37, z);
    for (let i = 0; i < 6; i++) cyl(d, 0.16, 0.16, 0.52, m.dark, -1.1 + i * 0.4, 0.37, z, 10).rotation.x = Math.PI / 2;
  }
  const upper = group(d, -0.1, 0.65, 0);
  box(upper, 1.6, 0.6, 1.5, m.yellow, -0.2, 0.3, 0);
  box(upper, 0.7, 0.8, 0.7, m.yellow, 0.25, 0.95, -0.35);
  box(upper, 0.6, 0.5, 0.02, m.glass, 0.25, 1.05, -0.0);
  box(upper, 0.02, 0.5, 0.6, m.glass, 0.61, 1.05, -0.35);
  cyl(upper, 0.08, 0.08, 0.6, m.dark, -0.7, 0.9, 0.4, 8);
  const boom = group(upper, 0.5, 0.6, 0.35);
  box(boom, 1.8, 0.25, 0.25, m.yellow, 0.9, 0, 0);
  const stick = group(boom, 1.8, 0, 0);
  box(stick, 1.2, 0.2, 0.2, m.yellow, 0.6, 0, 0);
  const bucket = group(stick, 1.2, 0, 0);
  box(bucket, 0.5, 0.4, 0.6, m.dark, 0.1, -0.2, 0);
  const load: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const b = bananaMesh(0.7);
    b.position.set(0.1, 0.02, -0.15 + i * 0.15);
    b.rotation.y = i;
    bucket.add(b);
    load.push(b);
  }
  const exhaust = group(upper, -0.7, 1.25, 0.4);
  const lamp = lampAt(d, -1.25, 1.6, -1.25);
  return finish(type, d, lamp, 2, (c) => {
    const w = c.status === 'working';
    const ph = w ? (c.t * 0.6) % 1 : 0.95;
    const ty = yawTo(c.target);
    let yaw, dig;
    if (ph < 0.4) { yaw = ty; dig = ease(ph / 0.4); }
    else if (ph < 0.75) { const k = ease((ph - 0.4) / 0.35); yaw = ty * (1 - k); dig = 1 - k; }
    else { yaw = 0; dig = 0; }
    upper.rotation.y = dampAngle(upper.rotation.y, w ? yaw : 0, 6, c.dt);
    boom.rotation.z = lerp(0.55, -0.15, dig);
    stick.rotation.z = lerp(-1.1, -0.6, dig);
    bucket.rotation.z = lerp(0.6, -1.4, ph > 0.75 && w ? (ph - 0.75) * 4 : 0) - (ph < 0.4 ? dig * 0.6 : 0);
    for (const b of load) b.visible = w && ph > 0.35 && ph < 0.85;
  }, [exhaust]);
}

function buildMega(type: string): Model {
  const m = mats();
  const d = new THREE.Group();
  basePlate(d, 4, 4);
  ports(d, 4, 4, false, true);
  box(d, 3.4, 0.9, 3.0, m.orange, -0.2, 0.6, 0);
  box(d, 1.2, 1.0, 1.2, m.panel, -1.0, 1.5, -0.8);
  box(d, 1.0, 0.5, 0.02, m.glass, -0.8, 1.7, -0.19);
  const yawG = group(d, 0, 1.1, 0);
  box(yawG, 3.2, 0.35, 0.4, m.orange, 1.6, 0.6, 0).rotation.z = 0.35;
  const wheelG = group(yawG, 3.2, 1.2, 0);
  const wheel = group(wheelG);
  add(wheel, new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.09, 8, 32), m.dark));
  add(wheel, new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.06, 8, 24), m.steel));
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const sp = box(wheel, 1.1, 0.06, 0.06, m.steel, Math.cos(a) * 0.55, Math.sin(a) * 0.55, 0);
    sp.rotation.z = a;
    const bk = box(wheel, 0.35, 0.3, 0.5, m.orange, Math.cos(a) * 1.15, Math.sin(a) * 1.15, 0);
    bk.rotation.z = a;
    const bn = bananaMesh(0.7);
    bn.position.set(Math.cos(a) * 1.2, Math.sin(a) * 1.2, 0);
    wheel.add(bn);
  }
  const g1 = gear(d, 0.45, m.steel, -1.4, 1.3, 1.52);
  const g2 = gear(d, 0.3, m.gold, -0.75, 1.0, 1.52);
  const lamp = lampAt(d, -1.7, 2.4, 1.7);
  return finish(type, d, lamp, 2.8, (c) => {
    const w = c.status === 'working';
    yawG.rotation.y = dampAngle(yawG.rotation.y, w ? yawTo(c.target) : 0, 2, c.dt);
    wheel.rotation.z -= c.dt * (w ? 2.2 : 0.1);
    g1.rotation.z += c.dt * (w ? 1.5 : 0);
    g2.rotation.z -= c.dt * (w ? 2.25 : 0);
  });
}

// ================================================================ Produktionsmaschinen
function machineBody(d: THREE.Group, w: number, h: number, height: number, color: THREE.Material) {
  const m = mats();
  basePlate(d, w, h);
  ports(d, w, h, true, true);
  box(d, w - 0.55, height, h - 0.3, color, 0, 0.14 + height / 2, 0);
  box(d, w - 0.5, 0.08, h - 0.25, m.dark, 0, 0.14 + height + 0.04, 0);
  // Inneres Band (Eingang -> Ausgang)
  box(d, w - 0.3, 0.06, 0.5, m.darker, 0, 0.2, Math.floor(h / 2) + 0.5 - h / 2);
}

function buildPeeler(type: string): Model {
  const m = mats();
  const d = new THREE.Group();
  machineBody(d, 2, 2, 0.6, m.panel);
  const rollers: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const r = cyl(d, 0.13, 0.13, 1.1, m.yellow, -0.4 + i * 0.35, 0.95, -0.05, 14);
    r.rotation.x = Math.PI / 2;
    rollers.push(r);
  }
  box(d, 1.3, 0.25, 0.08, m.dark, -0.05, 0.95, 0.58);
  box(d, 1.3, 0.25, 0.08, m.dark, -0.05, 0.95, -0.66);
  const bin = group(d, 0.25, 0.14, -0.68);
  box(bin, 0.5, 0.3, 0.35, m.green, 0, 0.15, -0.1);
  const peels: THREE.Mesh[] = [];
  for (let i = 0; i < 4; i++) {
    const pl = box(bin, 0.25, 0.03, 0.06, m.yellow, -0.1 + (i % 2) * 0.15, 0.31, -0.18 + Math.floor(i / 2) * 0.12);
    pl.rotation.y = i;
    peels.push(pl);
  }
  const g = gear(d, 0.25, m.steel, 0.55, 0.55, 0.86);
  const item = bananaMesh(0.9);
  item.position.set(-0.1, 1.15, -0.05);
  d.add(item);
  const lamp = lampAt(d, -0.75, 1.3, -0.75);
  return finish(type, d, lamp, 1.1, (c) => {
    const w = c.status === 'working';
    for (const r of rollers) r.rotation.y += c.dt * (w ? 10 : 0);
    g.rotation.z += c.dt * (w ? 3 : 0);
    item.visible = w;
    item.rotation.y = c.t * 3;
  });
}

function buildCutter(type: string): Model {
  const m = mats();
  const d = new THREE.Group();
  machineBody(d, 2, 2, 0.55, m.panelBlue);
  const arm = group(d, 0, 0.9, 0);
  box(arm, 0.2, 0.7, 0.2, m.dark, 0.1, 0.25, -0.55);
  box(arm, 0.2, 0.15, 1.05, m.dark, 0.1, 0.55, -0.1);
  const blade = add(arm, new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.025, 32), m.steel), 0.1, 0.25, 0.2);
  blade.rotation.x = Math.PI / 2;
  const teeth = add(blade, new THREE.Mesh(gearGeometry(0.44, 24, 0.02), m.steel));
  teeth.rotation.x = Math.PI / 2;
  const guard = add(arm, new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.15, 24, 1, true, 0, Math.PI), m.yellow), 0.1, 0.3, 0.2);
  guard.rotation.x = Math.PI / 2;
  guard.material = m.yellow;
  const slices: THREE.Mesh[] = [];
  for (let i = 0; i < 4; i++) {
    const s = cyl(d, 0.08, 0.08, 0.03, m.cream, 0.3 + i * 0.12, 0.88, 0.2, 10);
    s.rotation.z = Math.PI / 2;
    slices.push(s);
  }
  const lamp = lampAt(d, -0.75, 1.3, -0.75);
  return finish(type, d, lamp, 1.1, (c) => {
    const w = c.status === 'working';
    blade.rotation.y += c.dt * (w ? 30 : 0);
    arm.position.y = 0.9 + (w ? Math.max(0, Math.sin(c.t * 8)) * -0.12 : 0);
    slices.forEach((s, i) => { s.visible = w; s.position.x = 0.3 + ((i * 0.12 + c.t * 0.5) % 0.5); });
  });
}

function buildOven(type: string): Model {
  const m = mats();
  const d = new THREE.Group();
  machineBody(d, 2, 2, 1.1, m.brick);
  const glowMat = std('#ff7a1a', 0.5, 0, { emissive: '#ff5a00', emissiveIntensity: 1.5 });
  const win = box(d, 0.9, 0.45, 0.04, glowMat, 0, 0.75, 0.86);
  box(d, 1.05, 0.06, 0.06, m.steel, 0, 1.02, 0.88);
  box(d, 1.05, 0.06, 0.06, m.steel, 0, 0.48, 0.88);
  box(d, 0.6, 0.05, 0.05, m.steel, 0, 1.12, 0.9);
  const chimney = cyl(d, 0.14, 0.17, 0.8, m.dark, -0.45, 1.65, -0.4, 12);
  const top = group(chimney, 0, 0.45, 0);
  const coils: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) coils.push(box(d, 0.8, 0.03, 0.03, glowMat, 0, 0.56 + i * 0.12, 0.83));
  const light = new THREE.PointLight('#ff7a20', 0, 3.5, 2);
  light.position.set(0, 0.8, 1.2);
  d.add(light);
  const lamp = lampAt(d, 0.75, 1.6, -0.75);
  return finish(type, d, lamp, 1.4, (c) => {
    const w = c.status === 'working';
    const flick = w ? 1.3 + Math.sin(c.t * 13) * 0.25 + Math.sin(c.t * 7.3) * 0.2 : 0.25;
    glowMat.emissiveIntensity = flick;
    light.intensity = w ? flick * 1.6 : 0;
    void coils;
  }, [top]);
}

function buildCaramel(type: string): Model {
  const m = mats();
  const d = new THREE.Group();
  basePlate(d, 2, 2);
  ports(d, 2, 2, true, true);
  box(d, 1.5, 0.06, 0.5, m.darker, 0, 0.2, 0.5);
  const pts = [];
  for (let i = 0; i <= 10; i++) { const t = i / 10; pts.push(new THREE.Vector2(0.15 + Math.sin(t * Math.PI * 0.55) * 0.6, t * 0.9)); }
  const kettle = add(d, new THREE.Mesh(new THREE.LatheGeometry(pts, 28), m.copper), -0.05, 0.25, -0.1);
  (kettle.material as THREE.Material).side = THREE.DoubleSide;
  const liquid = cyl(d, 0.58, 0.58, 0.04, m.caramel, -0.05, 1.05, -0.1, 28);
  for (const a of [0, 2.1, 4.2]) cyl(d, 0.04, 0.04, 0.3, m.dark, -0.05 + Math.cos(a) * 0.45, 0.2, -0.1 + Math.sin(a) * 0.45, 6);
  const stir = group(d, -0.05, 1.35, -0.1);
  cyl(stir, 0.03, 0.03, 0.7, m.steel, 0, -0.15, 0, 8);
  box(stir, 0.5, 0.15, 0.04, m.steel, 0.15, -0.45, 0);
  box(d, 0.15, 0.7, 0.15, m.dark, -0.7, 0.75, -0.1);
  box(d, 0.8, 0.12, 0.12, m.dark, -0.35, 1.5, -0.1);
  const top = group(d, -0.05, 1.15, -0.1);
  const lamp = lampAt(d, 0.75, 1.3, -0.75);
  return finish(type, d, lamp, 1.3, (c) => {
    const w = c.status === 'working';
    stir.rotation.y += c.dt * (w ? 4 : 0);
    liquid.scale.y = 1 + (w ? Math.sin(c.t * 6) * 0.4 : 0);
  }, [top]);
}

function buildChoco(type: string): Model {
  const m = mats();
  const d = new THREE.Group();
  basePlate(d, 2, 2);
  ports(d, 2, 2, true, true);
  box(d, 1.6, 0.06, 0.5, m.darker, 0, 0.2, 0.5);
  const dripTex = dripTexture('#7a4526', '#3e2010');
  dripTex.wrapS = dripTex.wrapT = THREE.RepeatWrapping;
  const flowMat = std('#ffffff', 0.25, 0.05, { map: dripTex, side: THREE.DoubleSide });
  const tiers = [[0.75, 0.25], [0.55, 0.75], [0.35, 1.15]];
  const flows: THREE.Mesh[] = [];
  for (const [r, y] of tiers) {
    cyl(d, r, r * 0.85, 0.12, m.steel, -0.1, y, -0.15, 24);
    cyl(d, r * 0.95, r * 0.95, 0.02, m.chocolate, -0.1, y + 0.065, -0.15, 24);
    const f = add(d, new THREE.Mesh(new THREE.CylinderGeometry(r * 0.98, r * 1.02, 0.35, 24, 1, true), flowMat), -0.1, y - 0.2, -0.15);
    flows.push(f);
  }
  cyl(d, 0.06, 0.06, 1.3, m.steel, -0.1, 0.8, -0.15, 8);
  sphere(d, 0.12, m.chocolate, -0.1, 1.48, -0.15);
  const lamp = lampAt(d, 0.75, 1.3, -0.75);
  return finish(type, d, lamp, 1.5, (c) => {
    const w = c.status === 'working';
    if (w) dripTex.offset.y = (dripTex.offset.y - c.dt * 0.8) % 1;
    flows.forEach((f) => { f.visible = c.status !== 'off'; });
  });
}

function buildGlaze(type: string): Model {
  const m = mats();
  const d = new THREE.Group();
  basePlate(d, 2, 2);
  ports(d, 2, 2, true, true);
  box(d, 1.6, 0.06, 0.5, m.darker, 0, 0.2, 0.5);
  // Tunnel
  box(d, 1.2, 0.08, 1.4, m.white, 0, 1.2, 0);
  box(d, 1.2, 1.0, 0.08, m.white, 0, 0.7, -0.66);
  box(d, 1.2, 0.5, 0.08, m.white, 0, 0.95, 0.66);
  const tex = dripTexture('#ff9cc4', '#e85590');
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  const curtain = add(d, new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.9), std('#ffffff', 0.15, 0, { map: tex, transparent: true, opacity: 0.9, side: THREE.DoubleSide })), 0, 0.7, 0.2);
  curtain.rotation.y = Math.PI / 2;
  for (let i = 0; i < 4; i++) cyl(d, 0.05, 0.03, 0.15, m.steel, 0, 1.1, -0.35 + i * 0.25, 8);
  cyl(d, 0.25, 0.25, 0.4, m.pink, -0.3, 1.45, -0.3, 16);
  const g = gear(d, 0.22, m.steel, 0.5, 0.9, 0.71);
  const lamp = lampAt(d, 0.75, 1.5, -0.75);
  return finish(type, d, lamp, 1.3, (c) => {
    const w = c.status === 'working';
    if (w) tex.offset.y = (tex.offset.y - c.dt * 1.2) % 1;
    curtain.visible = c.status !== 'off' && c.status !== 'idle';
    g.rotation.z += c.dt * (w ? 2 : 0);
  });
}

function buildRefine(type: string): Model {
  const m = mats();
  const d = new THREE.Group();
  machineBody(d, 2, 2, 0.5, m.purple);
  const core = sphere(d, 0.28, std('#fff2b0', 0.2, 0.3, { emissive: '#ffcf40', emissiveIntensity: 1.2 }), 0, 1.2, 0);
  const rings: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const r = add(d, new THREE.Mesh(new THREE.TorusGeometry(0.45 + i * 0.12, 0.03, 8, 40), m.gold), 0, 1.2, 0);
    rings.push(r);
  }
  for (const [x, z] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) cyl(d, 0.04, 0.06, 0.8, m.gold, x, 1.0, z, 8);
  const sparks: THREE.Mesh[] = [];
  for (let i = 0; i < 6; i++) {
    const s = sphere(d, 0.035, std('#ffffff', 0.2, 0, { emissive: '#fff2b0', emissiveIntensity: 2 }), 0, 1.2, 0);
    s.castShadow = false;
    sparks.push(s);
  }
  const lamp = lampAt(d, -0.75, 1.3, -0.75);
  return finish(type, d, lamp, 1.6, (c) => {
    const w = c.status === 'working';
    const sp = w ? 1 : 0.1;
    rings[0].rotation.x += c.dt * 1.5 * sp;
    rings[1].rotation.y += c.dt * 2 * sp;
    rings[2].rotation.x -= c.dt * 1.2 * sp;
    rings[2].rotation.z += c.dt * 0.8 * sp;
    core.scale.setScalar(1 + (w ? Math.sin(c.t * 6) * 0.1 : 0));
    sparks.forEach((s, i) => {
      s.visible = w;
      const a = c.t * 2 + i;
      s.position.set(Math.cos(a) * 0.7, 1.2 + Math.sin(a * 1.7) * 0.35, Math.sin(a) * 0.7);
    });
  });
}

function buildPack(type: string): Model {
  const m = mats();
  const d = new THREE.Group();
  machineBody(d, 2, 2, 0.5, m.panel);
  const frame = group(d, 0, 0.64, 0);
  for (const z of [-0.45, 0.45]) box(frame, 0.1, 0.9, 0.1, m.dark, -0.1, 0.45, z);
  box(frame, 0.12, 0.12, 1.0, m.dark, -0.1, 0.9, 0);
  const piston = group(frame, -0.1, 0.85, 0);
  cyl(piston, 0.06, 0.06, 0.5, m.steel, 0, -0.2, 0, 10);
  box(piston, 0.4, 0.06, 0.4, m.dark, 0, -0.45, 0);
  const boxMesh = box(d, 0.36, 0.25, 0.3, m.cardboard, -0.1, 0.77, 0);
  const tape = add(d, new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.05, 8, 20), m.cardboard), 0.6, 1.0, -0.4);
  const stack = group(d, 0.55, 0.64, 0.55);
  for (let i = 0; i < 3; i++) box(stack, 0.3, 0.2, 0.25, m.cardboard, 0, 0.1 + i * 0.21, 0);
  const lamp = lampAt(d, -0.75, 1.3, -0.75);
  return finish(type, d, lamp, 1.5, (c) => {
    const w = c.status === 'working';
    const ph = (c.t * 2.5) % 1;
    piston.position.y = 0.85 - (w ? Math.max(0, Math.sin(ph * Math.PI * 2)) * 0.12 : 0);
    boxMesh.scale.y = w ? 1 - Math.max(0, Math.sin(ph * Math.PI * 2)) * 0.15 : 1;
    tape.rotation.z += c.dt * (w ? 6 : 0);
  });
}

function buildPremium(type: string): Model {
  const m = mats();
  const d = new THREE.Group();
  machineBody(d, 3, 3, 1.0, m.purple);
  box(d, 2.5, 0.08, 2.75, m.gold, 0, 1.18, 0);
  const dome = add(d, new THREE.Mesh(new THREE.SphereGeometry(0.75, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2), m.glass), 0, 1.22, 0);
  void dome;
  const prod = group(d, 0, 1.55, 0);
  box(prod, 0.4, 0.3, 0.35, m.purple, 0, 0, 0);
  box(prod, 0.42, 0.31, 0.08, m.gold, 0, 0, 0);
  box(prod, 0.08, 0.31, 0.37, m.gold, 0, 0, 0);
  const gears: THREE.Mesh[] = [];
  for (const [x, z, r] of [[-0.7, 1.39, 0.4], [0.05, 1.39, 0.28], [0.7, 1.39, 0.36]] as const) gears.push(gear(d, r, m.gold, x, 0.75, z));
  for (const [x, z, r] of [[-0.6, -1.39, 0.35], [0.4, -1.39, 0.45]] as const) gears.push(gear(d, r, m.steel, x, 0.75, z));
  const lights: THREE.Mesh[] = [];
  for (let i = 0; i < 8; i++) {
    const l = sphere(d, 0.06, LAMP_MATS.idle, -1.0 + i * 0.28, 1.28, 1.25);
    l.castShadow = false;
    lights.push(l);
  }
  const lamp = lampAt(d, -1.25, 2.0, -1.25);
  return finish(type, d, lamp, 2, (c) => {
    const w = c.status === 'working';
    gears.forEach((g, i) => { g.rotation.z += c.dt * (w ? (i % 2 ? -2 : 2) : 0); });
    prod.rotation.y += c.dt * (w ? 2 : 0.3);
    prod.position.y = 1.55 + Math.sin(c.t * 2) * 0.06;
    lights.forEach((l, i) => { l.material = w && Math.floor(c.t * 8 + i) % 3 === 0 ? LAMP_MATS.working : LAMP_MATS.off; });
  });
}

// ================================================================ Verkaufsstationen
let dollarTex: THREE.Texture | null = null;
function dollarSign(p: THREE.Object3D, size: number, x: number, y: number, z: number) {
  if (!dollarTex) dollarTex = labelTexture('$', '#1a5c2a', '#7dff9a', 'bold 110px Arial', 128, 128);
  const mesh = add(p, new THREE.Mesh(new THREE.BoxGeometry(size, size, 0.08), [
    mats().green, mats().green, mats().green, mats().green,
    std('#ffffff', 0.5, 0, { map: dollarTex, emissive: '#2a8a3a', emissiveIntensity: 0.4 }),
    std('#ffffff', 0.5, 0, { map: dollarTex, emissive: '#2a8a3a', emissiveIntensity: 0.4 }),
  ]), x, y, z);
  return mesh;
}

function stripeTex() {
  return canvasTexture(128, 32, (ctx) => {
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = i % 2 ? '#ffffff' : '#e23c3c';
      ctx.fillRect(i * 16, 0, 16, 32);
    }
  });
}

function buildSell1(type: string): Model {
  const m = mats();
  const d = new THREE.Group();
  basePlate(d, 2, 2, m.green);
  box(d, 1.4, 0.7, 0.5, m.wood, 0, 0.5, 0.45);
  box(d, 1.5, 0.06, 0.6, m.panel, 0, 0.88, 0.45);
  for (const [x, z] of [[-0.7, 0.7], [0.7, 0.7], [-0.7, -0.7], [0.7, -0.7]]) cyl(d, 0.04, 0.04, 1.6, m.steel, x, 0.95, z, 8);
  const aw = add(d, new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.05, 1.7), std('#ffffff', 0.7, 0, { map: stripeTex() })), 0, 1.78, 0);
  aw.rotation.x = 0.12;
  const reg = group(d, 0.35, 0.92, 0.45);
  box(reg, 0.35, 0.2, 0.3, m.dark, 0, 0.1, 0);
  const drawer = box(reg, 0.3, 0.06, 0.28, m.steel, 0, 0.02, 0.05);
  box(reg, 0.2, 0.12, 0.02, m.screen, 0, 0.26, -0.08);
  const crates = group(d, -0.3, 0.14, -0.35);
  box(crates, 0.5, 0.35, 0.4, m.wood, 0, 0.18, 0);
  for (let i = 0; i < 3; i++) { const b = bananaMesh(0.8); b.position.set(-0.1 + i * 0.1, 0.4, 0); b.rotation.y = i; crates.add(b); }
  const sign = dollarSign(d, 0.5, 0, 2.25, 0);
  const lamp = lampAt(d, 0.8, 1.0, -0.2);
  return finish(type, d, lamp, 1.8, (c) => {
    const w = c.status === 'working';
    sign.rotation.y += c.dt * (w ? 3 : 0.6);
    drawer.position.z = 0.05 + (w ? Math.max(0, Math.sin(c.t * 10)) * 0.12 : 0);
  });
}

function buildSell2(type: string): Model {
  const m = mats();
  const d = new THREE.Group();
  basePlate(d, 3, 3, m.green);
  box(d, 2.4, 1.4, 1.6, m.panel, -0.1, 0.85, -0.55);
  const roof = add(d, new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 2.5, 3, 1), m.blue), -0.1, 1.55, -0.55);
  roof.rotation.z = Math.PI / 2;
  roof.scale.set(1, 1, 0.55);
  const door = box(d, 1.0, 0.9, 0.05, m.steel, -0.1, 0.6, 0.27);
  // Lastwagen
  const truck = group(d, 0.2, 0.14, 0.9);
  box(truck, 1.3, 0.55, 0.6, m.white, -0.2, 0.45, 0);
  box(truck, 0.45, 0.45, 0.58, m.red, 0.65, 0.38, 0);
  box(truck, 0.02, 0.2, 0.45, m.glass, 0.88, 0.5, 0);
  for (const x of [-0.6, 0.0, 0.6]) for (const z of [-0.3, 0.3]) cyl(truck, 0.13, 0.13, 0.08, m.rubber, x, 0.13, z, 12).rotation.x = Math.PI / 2;
  const sign = dollarSign(d, 0.6, 1.1, 1.9, -0.55);
  const lamp = lampAt(d, 1.2, 1.2, -1.2);
  return finish(type, d, lamp, 2.1, (c) => {
    const w = c.status === 'working';
    sign.rotation.y += c.dt * (w ? 2.5 : 0.5);
    door.position.y = 0.6 + (w ? 0.35 : 0);
    door.scale.y = w ? 0.25 : 1;
    truck.position.y = 0.14 + (w ? Math.abs(Math.sin(c.t * 14)) * 0.015 : 0);
  });
}

function buildSell3(type: string): Model {
  const m = mats();
  const d = new THREE.Group();
  basePlate(d, 3, 3, m.green);
  const colors = [m.red, m.blue, m.orange, m.green];
  for (let i = 0; i < 4; i++) {
    box(d, 1.1, 0.55, 0.55, colors[i], -0.6 + (i % 2) * 0.05, 0.42 + Math.floor(i / 2) * 0.56, -0.8 + (i % 2) * 0.6);
  }
  const crane = group(d, 0.7, 0.14, 0.6);
  box(crane, 0.2, 2.0, 0.2, m.yellow, 0, 1.0, 0);
  const jib = group(crane, 0, 2.0, 0);
  box(jib, 2.0, 0.15, 0.15, m.yellow, -0.5, 0, 0);
  box(jib, 0.3, 0.3, 0.3, m.dark, 0.5, 0.05, 0);
  const hook = group(jib, -1.2, 0, 0);
  cyl(hook, 0.01, 0.01, 0.8, m.dark, 0, -0.4, 0, 4);
  const cont = box(hook, 0.6, 0.3, 0.3, m.purple, 0, -0.9, 0);
  const sign = dollarSign(d, 0.5, -1.1, 1.75, 0.9);
  const lamp = lampAt(d, 1.2, 1.0, -1.2);
  return finish(type, d, lamp, 2.4, (c) => {
    const w = c.status === 'working';
    jib.rotation.y = Math.sin(c.t * (w ? 0.9 : 0.1)) * 1.2;
    cont.position.y = -0.9 + (w ? Math.sin(c.t * 1.8) * 0.3 : 0);
    sign.rotation.y += c.dt * (w ? 2 : 0.4);
  });
}

function buildSell4(type: string): Model {
  const m = mats();
  const d = new THREE.Group();
  basePlate(d, 4, 4, m.green);
  box(d, 3.2, 1.0, 3.2, m.panel, 0, 0.64, 0);
  box(d, 3.22, 0.25, 3.22, m.blue, 0, 1.0, 0);
  cyl(d, 0.8, 1.0, 1.6, m.white, 0, 1.95, 0, 24);
  for (let i = 0; i < 5; i++) cyl(d, 0.81 - i * 0.04, 0.81 - i * 0.04, 0.05, m.glass, 0, 1.4 + i * 0.25, 0, 24);
  const globe = group(d, 0, 3.4, 0);
  add(globe, new THREE.Mesh(new THREE.SphereGeometry(0.65, 24, 18), std('#2f7fd5', 0.4, 0.2)));
  add(globe, new THREE.Mesh(new THREE.SphereGeometry(0.66, 12, 8), std('#3fae4b', 0.6, 0, { wireframe: true })));
  add(globe, new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.035, 8, 40), m.gold)).rotation.x = 1.2;
  const dish = group(d, 1.2, 1.15, -1.2);
  add(dish, new THREE.Mesh(new THREE.SphereGeometry(0.4, 16, 8, 0, Math.PI * 2, 0, Math.PI / 3), std('#e0e4ea', 0.4, 0.3, { side: THREE.DoubleSide })), 0, 0.5, 0).rotation.x = Math.PI * 0.8;
  cyl(dish, 0.04, 0.04, 0.5, m.dark, 0, 0.25, 0, 6);
  const sign = dollarSign(d, 0.6, -1.2, 1.6, 1.2);
  const lamp = lampAt(d, 1.6, 1.4, 1.6);
  return finish(type, d, lamp, 4, (c) => {
    const w = c.status === 'working';
    globe.rotation.y += c.dt * (w ? 1.2 : 0.2);
    dish.rotation.y += c.dt * 0.4;
    sign.rotation.y += c.dt * (w ? 2 : 0.4);
  });
}

// ================================================================ Lager
function fillBar(p: THREE.Object3D, w: number, h: number, d: number, x: number, y: number, z: number) {
  const g = group(p, x, y, z);
  const fill = box(g, w, h, d, std('#ffd21f', 0.6, 0, { emissive: '#5a4300', emissiveIntensity: 0.4 }), 0, h / 2, 0);
  fill.geometry = fill.geometry.clone().translate(0, -h / 2, 0);
  fill.position.y = 0;
  return fill;
}

function buildBuffer(type: string): Model {
  const m = mats();
  const d = new THREE.Group();
  basePlate(d, 1, 1);
  ports(d, 1, 1, true, true);
  box(d, 0.6, 0.06, 0.7, m.steel, 0, 0.17, 0);
  for (const [x, z, w2, d2] of [[0, 0.32, 0.6, 0.05], [0, -0.32, 0.6, 0.05], [0.28, 0, 0.05, 0.62], [-0.28, 0, 0.05, 0.62]]) box(d, w2, 0.6, d2, m.panelBlue, x, 0.5, z);
  const fill = fillBar(d, 0.52, 0.55, 0.58, 0, 0.2, 0);
  const lamp = lampAt(d, 0.32, 0.9, 0.32);
  return finish(type, d, lamp, 0.8, (c) => { fill.scale.y = Math.max(0.01, c.fill); });
}

function buildStorage(type: string): Model {
  const m = mats();
  const d = new THREE.Group();
  basePlate(d, 2, 2);
  ports(d, 2, 2, true, true);
  for (const x of [-0.55, 0.55]) for (const z of [-0.65, 0.65]) box(d, 0.08, 1.5, 0.08, m.orange, x, 0.9, z);
  const shelves: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    box(d, 1.2, 0.05, 1.4, m.blue, 0, 0.35 + i * 0.5, 0);
    for (let k = 0; k < 6; k++) {
      const cr = box(d, 0.32, 0.3, 0.38, m.cardboard, -0.38 + (k % 3) * 0.38, 0.53 + i * 0.5, -0.3 + Math.floor(k / 3) * 0.6);
      shelves.push(cr);
    }
  }
  const lamp = lampAt(d, 0.85, 1.8, -0.85);
  return finish(type, d, lamp, 1.7, (c) => {
    const n = Math.round(c.fill * shelves.length);
    shelves.forEach((s, i) => { s.visible = i < n; });
  });
}

function buildSilo(type: string): Model {
  const m = mats();
  const d = new THREE.Group();
  basePlate(d, 3, 3);
  ports(d, 3, 3, true, true);
  cyl(d, 1.1, 1.1, 2.6, m.steel, 0, 1.45, 0, 28);
  add(d, new THREE.Mesh(new THREE.ConeGeometry(1.15, 0.6, 28), m.dark), 0, 3.05, 0);
  for (let i = 0; i < 4; i++) cyl(d, 1.12, 1.12, 0.05, m.dark, 0, 0.5 + i * 0.65, 0, 28);
  const gauge = group(d, 0, 0.2, 1.12);
  box(gauge, 0.3, 2.5, 0.04, m.darker, 0, 1.25, 0);
  const fill = fillBar(gauge, 0.24, 2.4, 0.05, 0, 0.05, 0.01);
  const ladder = group(d, 1.12, 0, 0);
  for (let i = 0; i < 12; i++) box(ladder, 0.04, 0.03, 0.3, m.yellow, 0, 0.3 + i * 0.22, 0);
  const lamp = lampAt(d, -1.25, 1.2, -1.25);
  return finish(type, d, lamp, 3.2, (c) => { fill.scale.y = Math.max(0.01, c.fill); });
}

// ================================================================ Logistik
function arrow(p: THREE.Object3D, mat: THREE.Material, x: number, z: number, yaw: number) {
  const a = add(p, new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.22, 3), mat), x, 0.36, z);
  a.rotation.set(0, yaw, -Math.PI / 2);
  return a;
}

// ---------------------------------------------------------------- Knoten: kleine Band-Kreuzungen
// Lokale Richtungen: 0 = vorne (+x), 1 = rechts (+z), 2 = hinten (−x), 3 = links (−z)
const NODE_ARROW = new THREE.ConeGeometry(0.075, 0.17, 3).rotateZ(-Math.PI / 2);
const ARROW_ON = new THREE.MeshBasicMaterial({ color: '#46ff7a' });
const ARROW_IN = new THREE.MeshBasicMaterial({ color: '#7fc8ff' });
const ARROW_OFF = new THREE.MeshBasicMaterial({ color: '#4a4f57' });
const ARROW_PRIO = new THREE.MeshBasicMaterial({ color: '#ffd21f' });

function edgeArrow(p: THREE.Object3D, k: number, outward: boolean, mat: THREE.Material) {
  const yaw = -k * Math.PI / 2 + (outward ? 0 : Math.PI);
  const r = outward ? 0.4 : 0.36;
  const a = new THREE.Mesh(NODE_ARROW, mat);
  a.position.set(Math.cos(-k * Math.PI / 2) * r, 0.26, -Math.sin(-k * Math.PI / 2) * r);
  a.rotation.y = yaw;
  p.add(a);
  return a;
}

function nodeDeck(d: THREE.Group) {
  const m = mats();
  basePlate(d, 1, 1);
  box(d, 0.94, 0.07, 0.6, m.rubber, 0, 0.2, 0);
  box(d, 0.6, 0.07, 0.94, m.rubber, 0, 0.2, 0);
  for (const [x, z] of [[-0.39, -0.39], [0.39, -0.39], [-0.39, 0.39], [0.39, 0.39]]) box(d, 0.16, 0.12, 0.16, m.dark, x, 0.22, z);
  const ringMat = std(BELT_TIERS[0].color, 0.4, 0.5);
  add(d, new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.022, 6, 32).rotateX(Math.PI / 2), ringMat), 0, 0.24, 0);
  let lastTier = 0;
  return (tier = 0) => {
    if (tier === lastTier) return;
    lastTier = tier;
    ringMat.color.set(BELT_TIERS[tier].color);
    ringMat.emissive.set(tier === 4 ? BELT_TIERS[tier].color : '#000000');
  };
}

function buildSplitter(type: string): Model {
  const m = mats();
  const d = new THREE.Group();
  const setTier = nodeDeck(d);
  const disc = cyl(d, 0.13, 0.13, 0.03, m.orange, 0, 0.245, 0, 16);
  box(disc, 0.26, 0.035, 0.05, m.dark, 0, 0.02, 0);
  edgeArrow(d, 2, false, ARROW_IN);
  const outs = [edgeArrow(d, 0, true, ARROW_ON), edgeArrow(d, 1, true, ARROW_ON), edgeArrow(d, 3, true, ARROW_ON)];
  const lamp = lampAt(d, -0.39, 0.55, -0.39);
  return finish(type, d, lamp, 0.4, (c) => {
    setTier(c.tier);
    const mask = c.outMask ?? 7;
    outs.forEach((a, i) => { a.material = !(mask & (1 << i)) ? ARROW_OFF : c.prio && i === 0 ? ARROW_PRIO : ARROW_ON; });
    disc.rotation.y += c.dt * (c.status === 'working' ? 9 : 0);
  });
}

function buildMerger(type: string): Model {
  const m = mats();
  const d = new THREE.Group();
  const setTier = nodeDeck(d);
  const funnel = cyl(d, 0.15, 0.08, 0.06, m.steel, 0, 0.26, 0, 12);
  const ins = [edgeArrow(d, 2, false, ARROW_IN), edgeArrow(d, 1, false, ARROW_IN), edgeArrow(d, 3, false, ARROW_IN)];
  edgeArrow(d, 0, true, ARROW_ON);
  const lamp = lampAt(d, 0.39, 0.55, -0.39);
  return finish(type, d, lamp, 0.4, (c) => {
    setTier(c.tier);
    ins[0].material = c.prio ? ARROW_PRIO : ARROW_IN;
    funnel.rotation.y += c.dt * (c.status === 'working' ? 5 : 0);
  });
}

function buildFilter(type: string): Model {
  const m = mats();
  const d = new THREE.Group();
  const setTier = nodeDeck(d);
  edgeArrow(d, 2, false, ARROW_IN);
  const outs = [edgeArrow(d, 0, true, ARROW_PRIO), edgeArrow(d, 1, true, ARROW_ON), edgeArrow(d, 3, true, ARROW_ON)];
  // Schild mit den Farben der durchgelassenen Zustände
  const sign = group(d, -0.39, 0.3, 0.39);
  cyl(sign, 0.02, 0.02, 0.5, m.dark, 0, 0.25, 0, 6);
  box(sign, 0.06, 0.24, 0.34, m.darker, 0, 0.55, 0);
  const swatches = STAGES.map((st, i) => {
    const sw = box(sign, 0.07, 0.04, 0.05, std(st.color, 0.4, 0, { emissive: st.color, emissiveIntensity: 0.6 }), 0.01, 0.46 + Math.floor(i / 5) * 0.08, -0.12 + (i % 5) * 0.06);
    sw.castShadow = false;
    return sw;
  });
  const lamp = lampAt(d, 0.39, 0.55, -0.39);
  let last = -1;
  return finish(type, d, lamp, 0.6, (c) => {
    setTier(c.tier);
    const mask = c.outMask ?? 7;
    outs.forEach((a, i) => { a.material = !(mask & (1 << i)) ? ARROW_OFF : i === 0 ? ARROW_PRIO : ARROW_ON; });
    if (c.filterStage !== last) {
      last = c.filterStage;
      swatches.forEach((sw, i) => { sw.visible = !!((c.filterStage >> i) & 1); });
    }
  });
}

function buildCrossing(type: string): Model {
  const m = mats();
  const d = new THREE.Group();
  const setTier = nodeDeck(d);
  // kleine Brücke über der Kreuzung
  for (const z of [-0.33, 0.33]) box(d, 0.05, 0.22, 0.05, m.yellow, 0, 0.33, z);
  box(d, 0.05, 0.05, 0.72, m.yellow, 0, 0.45, 0);
  for (let k = 0; k < 4; k++) edgeArrow(d, k, true, ARROW_ON);
  const lamp = lampAt(d, -0.39, 0.55, -0.39);
  return finish(type, d, lamp, 0.5, (c) => { setTier(c.tier); });
}

function buildTunnel(type: string, entrance: boolean): Model {
  const m = mats();
  const d = new THREE.Group();
  basePlate(d, 1, 1);
  const ramp = box(d, 0.9, 0.08, 0.8, m.darker, 0, 0.3, 0);
  ramp.rotation.z = entrance ? -0.35 : 0.35;
  box(d, 0.1, 0.6, 0.9, m.orange, entrance ? 0.4 : -0.4, 0.45, 0);
  box(d, 0.9, 0.08, 0.1, m.orange, 0, 0.72, 0.42);
  box(d, 0.9, 0.08, 0.1, m.orange, 0, 0.72, -0.42);
  box(d, 0.08, 0.45, 0.75, m.black, entrance ? 0.36 : -0.36, 0.4, 0);
  arrow(d, m.green, entrance ? -0.3 : 0.3, 0, 0);
  const lamp = lampAt(d, entrance ? -0.35 : 0.35, 0.8, -0.35);
  return finish(type, d, lamp, 0.8, () => {});
}

// ================================================================ Fabrik
const BUILDERS: Record<string, (type: string) => Model> = {
  grab1: buildGrab1, grab2: buildGrab2, vacuum: buildVacuum, robot: buildRobot, digger: buildDigger, mega: buildMega,
  peeler: buildPeeler, cutter: buildCutter, oven: buildOven, caramel: buildCaramel, choco: buildChoco,
  glaze: buildGlaze, refine: buildRefine, pack: buildPack, premium: buildPremium,
  sell1: buildSell1, sell2: buildSell2, sell3: buildSell3, sell4: buildSell4,
  buffer: buildBuffer, storage: buildStorage, silo: buildSilo,
  splitter: buildSplitter, merger: buildMerger, filter: buildFilter, crossing: buildCrossing,
  tunnelIn: (t) => buildTunnel(t, true), tunnelOut: (t) => buildTunnel(t, false),
};

export function createModel(type: string): Model {
  return BUILDERS[type](type);
}

// Durchsichtige Vorschau (grün/rot)
const ghostOk = new THREE.MeshBasicMaterial({ color: '#46ff7a', transparent: true, opacity: 0.45, depthWrite: false });
const ghostBad = new THREE.MeshBasicMaterial({ color: '#ff4a3a', transparent: true, opacity: 0.45, depthWrite: false });
export function createGhost(type: string): { group: THREE.Group; setValid: (ok: boolean) => void } {
  const model = createModel(type);
  model.lod.visible = false;
  const meshes: THREE.Mesh[] = [];
  model.group.traverse((o) => {
    const mm = o as THREE.Mesh;
    if (mm.isMesh) { mm.castShadow = false; mm.receiveShadow = false; meshes.push(mm); }
    if ((o as THREE.Light).isLight) o.visible = false;
  });
  meshes.forEach((mm) => { mm.material = ghostOk; });
  model.update({ t: 0, dt: 0, status: 'idle', speed: 1, fill: 0, target: null, filterStage: 2 });
  return {
    group: model.group,
    setValid: (ok) => meshes.forEach((mm) => { mm.material = ok ? ghostOk : ghostBad; }),
  };
}
