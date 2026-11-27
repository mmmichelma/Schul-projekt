/*
 * Geometrien, Materialien und Texturen, die mehrfach benutzt werden.
 * Alles wird per Code erzeugt – keine Bilddateien, keine Emojis.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

// Kasten mit abgerundeten Kanten (statt scharfer Ecken) – zwischengespeichert nach Größe
const RBOX = new Map<string, THREE.BufferGeometry>();
export function rbox(w: number, h: number, d: number, radius?: number): THREE.BufferGeometry {
  const r = radius ?? Math.min(0.06, Math.min(w, h, d) * 0.22);
  const k = `${w},${h},${d},${r}`;
  let g = RBOX.get(k);
  if (!g) { g = new RoundedBoxGeometry(w, h, d, 2, Math.max(0.001, r)); RBOX.set(k, g); }
  return g;
}
// Für Merges: eine eigene Kopie
export const rboxCopy = (w: number, h: number, d: number, radius?: number) => rbox(w, h, d, radius).clone();

// ---------------------------------------------------------------- Hilfen
export function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void, repeat = true): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

function rand(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- Banane
export interface BananaOpts {
  len?: number;
  radius?: number;
  bend?: number;
  seg?: number;
  sides?: number;
  body?: string;
  tip?: string;
  stem?: string;
  stripes?: string; // Glasur-Streifen
  radial?: number;  // Punkte rund um den Querschnitt
}

/*
 * Echte Bananenform: gebogener Körper mit 5 weichen Kanten, dicker in der Mitte,
 * dunkle Blütenspitze vorne, schmaler Hals und Stiel mit braunem Schnittende hinten.
 * Farben über Vertex-Farben: Gelb, zum Stiel hin grünlich, kleine braune Flecken.
 */
export function bananaGeometry(o: BananaOpts = {}): THREE.BufferGeometry {
  const len = o.len ?? 0.9, R = o.radius ?? 0.1, bend = o.bend ?? 0.22;
  const seg = Math.max(6, o.seg ?? 16);
  const radial = o.radial ?? 12;
  const plain = !!o.stripes || o.body !== undefined;
  const body = new THREE.Color(o.body ?? '#ffd52e');
  const ridge = body.clone().multiplyScalar(0.86);
  const green = new THREE.Color(o.body ? o.body : '#c2cf3a');
  const tip = new THREE.Color(o.tip ?? '#6b4a22');
  const stem = new THREE.Color(o.stem ?? '#8a9a3a');
  const cut = new THREE.Color('#5a4320');
  const speck = new THREE.Color('#7a4c1c');
  const stripes = o.stripes ? new THREE.Color(o.stripes) : null;
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  // Mittellinie: Bogen in der x-z-Ebene, leicht angehoben zur Mitte
  const path = (t: number) => {
    const u = 2 * t - 1;
    return new THREE.Vector3((t - 0.5) * len, (1 - u * u) * bend * 0.25, bend * (1 - u * u) - bend * 0.5);
  };
  // Dicke entlang der Banane: rundes Ende vorne, bauchig, langer schmaler Hals zum Stiel
  const thick = (t: number) => {
    if (t < 0.05) return 0.35 + (t / 0.05) * 0.4;
    if (t < 0.18) return 0.75 + ((t - 0.05) / 0.13) * 0.25;
    if (t < 0.68) return 1;
    if (t < 0.86) return 1 - ((t - 0.68) / 0.18) * 0.62;
    return 0.38 - ((t - 0.86) / 0.14) * 0.1;
  };
  const rnd = (i: number) => { let h = Math.imul(i ^ 0x9e3779b9, 2654435761); h ^= h >>> 15; return (h >>> 0) / 4294967296; };
  const up = new THREE.Vector3(0, 1, 0);
  const c = new THREE.Color();
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    const ctr = path(t);
    const tan = path(Math.min(1, t + 0.01)).sub(path(Math.max(0, t - 0.01))).normalize();
    const side = new THREE.Vector3().crossVectors(tan, up).normalize();
    const nrm = new THREE.Vector3().crossVectors(side, tan).normalize();
    const r = R * thick(t);
    for (let k = 0; k < radial; k++) {
      const a = (k / radial) * Math.PI * 2;
      // 5 weiche Kanten (nicht am Stiel)
      const edge = t > 0.86 ? 0 : 0.07 * Math.cos(5 * a);
      const rr = r * (1 + edge);
      const v = ctr.clone().addScaledVector(nrm, Math.cos(a) * rr * 0.92).addScaledVector(side, Math.sin(a) * rr);
      pos.push(v.x, v.y, v.z);
      // Farbe
      if (t < 0.035) c.copy(tip);
      else if (t > 0.96) c.copy(cut);
      else if (t > 0.86) c.copy(stem);
      else {
        c.copy(Math.cos(5 * a) > 0.93 && !plain ? ridge : body);
        if (!plain && t > 0.6) c.lerp(green, Math.min(1, (t - 0.6) / 0.26) * 0.75);
        if (!plain && t < 0.07) c.lerp(tip, (0.07 - t) / 0.07 * 0.4);
        if (stripes && Math.floor(t * 9) % 2 === 0) c.copy(stripes);
        if (!plain && rnd(i * 31 + k * 7) < 0.025) c.lerp(speck, 0.5);
      }
      col.push(c.r, c.g, c.b);
    }
  }
  for (let i = 0; i < seg; i++) {
    for (let k = 0; k < radial; k++) {
      const a = i * radial + k, b = i * radial + ((k + 1) % radial);
      idx.push(a, a + radial, b, b, a + radial, b + radial);
    }
  }
  // Enden schließen
  for (const [ring, flip, color] of [[0, true, tip], [seg, false, cut]] as [number, boolean, THREE.Color][]) {
    const center = path(ring / seg);
    const ci = pos.length / 3;
    pos.push(center.x, center.y, center.z);
    col.push(color.r, color.g, color.b);
    for (let k = 0; k < radial; k++) {
      const a = ring * radial + k, b = ring * radial + ((k + 1) % radial);
      if (flip) idx.push(ci, b, a); else idx.push(ci, a, b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/* Ein Bananenbüschel („Hand“): mehrere Bananen, deren Stiele sich in einer Krone treffen */
export function bananaBunchGeometry(n = 4, o: BananaOpts = {}): THREE.BufferGeometry {
  const len = o.len ?? 0.9;
  const parts: THREE.BufferGeometry[] = [];
  for (let k = 0; k < n; k++) {
    const g = bananaGeometry({ ...o, seg: o.seg ?? 12 });
    // Stielende (x = +len/2) liegt in der Krone; Bananen fächern sich auf
    g.translate(-len / 2, 0, 0);
    g.rotateY(Math.PI + (k - (n - 1) / 2) * 0.32);
    g.rotateZ(-0.12);
    g.translate(0, (k % 2) * 0.05, 0);
    parts.push(g.toNonIndexed());
  }
  const crown = new THREE.CylinderGeometry(0.06, 0.08, 0.2, 8).rotateZ(Math.PI / 2).translate(0.05, 0.04, 0).toNonIndexed();
  const cc = new THREE.Color('#6a7a2c');
  const arr = new Float32Array(crown.attributes.position.count * 3);
  for (let i = 0; i < crown.attributes.position.count; i++) { arr[i * 3] = cc.r; arr[i * 3 + 1] = cc.g; arr[i * 3 + 2] = cc.b; }
  crown.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  crown.deleteAttribute('uv');
  parts.push(crown);
  const merged = mergeGeometries(parts)!;
  merged.computeVertexNormals();
  return merged;
}

function colorize(g: THREE.BufferGeometry, color: string): THREE.BufferGeometry {
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  if (g.index) return g.toNonIndexed();
  return g;
}

function nonIndexed(g: THREE.BufferGeometry) { return g.index ? g.toNonIndexed() : g; }

// ---------------------------------------------------------------- Produkte auf den Bändern (10 Zustände)
export interface StageVisual { geo: THREE.BufferGeometry; mat: THREE.MeshStandardMaterial }

export function stageVisuals(): StageVisual[] {
  const m = (rough: number, metal = 0, emissive = '#000000') => new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: rough, metalness: metal, emissive, emissiveIntensity: 0.25,
  });
  const small = { len: 0.52, radius: 0.075, bend: 0.13, seg: 12 };
  const slices = (() => {
    const parts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 3; i++) {
      const d = new THREE.CylinderGeometry(0.075, 0.075, 0.04, 12);
      d.rotateZ(Math.PI / 2 + (i - 1) * 0.25);
      d.translate((i - 1) * 0.09, 0.05, (i - 1) * 0.02);
      parts.push(colorize(d, i === 1 ? '#f3e6b4' : '#efe0a6'));
      const core = new THREE.CylinderGeometry(0.02, 0.02, 0.045, 6);
      core.rotateZ(Math.PI / 2 + (i - 1) * 0.25);
      core.translate((i - 1) * 0.09, 0.05, (i - 1) * 0.02);
      parts.push(colorize(core, '#b8a26a'));
    }
    return mergeGeometries(parts.map(nonIndexed))!;
  })();
  const box = (color: string, ribbon: string, label: string) => {
    const parts = [
      colorize(new THREE.BoxGeometry(0.3, 0.18, 0.22).translate(0, 0.09, 0), color),
      colorize(new THREE.BoxGeometry(0.31, 0.185, 0.05).translate(0, 0.09, 0), ribbon),
      colorize(new THREE.BoxGeometry(0.05, 0.185, 0.225).translate(0, 0.09, 0), ribbon),
      colorize(new THREE.BoxGeometry(0.12, 0.01, 0.08).translate(0.07, 0.185, 0.05), label),
    ];
    return mergeGeometries(parts.map(nonIndexed))!;
  };
  const banana = (o: BananaOpts) => bananaGeometry({ ...small, ...o }).translate(0, 0.07, 0);
  return [
    { geo: banana({}), mat: m(0.55) },
    { geo: banana({ body: '#f6eecb', tip: '#d8cc9a', stem: '#e8dcb0', radius: 0.05 }), mat: m(0.6) },
    { geo: slices, mat: m(0.6) },
    { geo: banana({ body: '#c98a3c', tip: '#6e4518', stem: '#8a5a24', radius: 0.055 }), mat: m(0.7) },
    { geo: banana({ body: '#e08a28', tip: '#8a4a10', stem: '#a65a18', radius: 0.058 }), mat: m(0.2, 0, '#5a2a00') },
    { geo: banana({ body: '#5a321b', tip: '#2e170a', stem: '#3e2010', radius: 0.062 }), mat: m(0.3) },
    { geo: banana({ body: '#f27aa8', tip: '#5a321b', stem: '#5a321b', stripes: '#ffffff', radius: 0.064 }), mat: m(0.15) },
    { geo: banana({ body: '#ffcf40', tip: '#b88a10', stem: '#c99a20', radius: 0.064 }), mat: m(0.25, 0.85, '#6a4a00') },
    { geo: box('#c49a6c', '#8a5a2a', '#ffd21f'), mat: m(0.8) },
    { geo: box('#7b3fe4', '#ffcf40', '#ffffff'), mat: m(0.35, 0.3, '#2a1060') },
  ];
}

// ---------------------------------------------------------------- Zahnrad
export function gearGeometry(r: number, teeth: number, thick: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  const inner = r * 0.82;
  for (let i = 0; i < teeth * 2; i++) {
    const a0 = (i / (teeth * 2)) * Math.PI * 2;
    const a1 = ((i + 1) / (teeth * 2)) * Math.PI * 2;
    const rr = i % 2 === 0 ? r : inner;
    if (i === 0) shape.moveTo(Math.cos(a0) * rr, Math.sin(a0) * rr);
    else shape.lineTo(Math.cos(a0) * rr, Math.sin(a0) * rr);
    shape.lineTo(Math.cos(a1) * rr, Math.sin(a1) * rr);
  }
  const hole = new THREE.Path();
  hole.absarc(0, 0, r * 0.25, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(shape, { depth: thick * 0.7, bevelEnabled: true, bevelThickness: thick * 0.15, bevelSize: r * 0.03, bevelSegments: 2, curveSegments: 6 });
  g.translate(0, 0, -thick / 2);
  return g;
}

// ---------------------------------------------------------------- Förderband-Geometrien
// Lokal: Bewegung nach +x, Mitte des Feldes = Ursprung, z = Raster-y
export const BELT_Y = 0.17;
const BELT_HALF = 0.39;
const RAIL_OFF = 0.43;

// Querschnitt (Profil) mit abgerundeten Ecken: Punkte in (Seite, Höhe)
function roundedProfile(w: number, h: number, r: number, steps = 3): [number, number][] {
  const pts: [number, number][] = [];
  const corners: [number, number, number][] = [[w / 2 - r, h / 2 - r, 0], [-w / 2 + r, h / 2 - r, Math.PI / 2], [-w / 2 + r, -h / 2 + r, Math.PI], [w / 2 - r, -h / 2 + r, Math.PI * 1.5]];
  for (const [cx, cy, a0] of corners) {
    for (let i = 0; i <= steps; i++) {
      const a = a0 + (i / steps) * (Math.PI / 2);
      pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
  }
  return pts;
}

/*
 * Zieht ein Profil entlang eines Pfades (Mittellinie in x/z), mit festem „oben“.
 * offset = seitlicher Abstand von der Mittellinie, y = Höhe, color = Vertex-Farbe.
 */
function sweep(path: THREE.Vector3[], profile: [number, number][], offset: number, y: number, color: THREE.Color): THREE.BufferGeometry {
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  const up = new THREE.Vector3(0, 1, 0);
  const n = profile.length;
  for (let i = 0; i < path.length; i++) {
    const prev = path[Math.max(0, i - 1)], next = path[Math.min(path.length - 1, i + 1)];
    const tan = next.clone().sub(prev).normalize();
    const side = new THREE.Vector3().crossVectors(tan, up).normalize();
    for (const [sx, sy] of profile) {
      const v = path[i].clone().addScaledVector(side, offset + sx);
      pos.push(v.x, y + sy, v.z);
      col.push(color.r, color.g, color.b);
    }
  }
  for (let i = 0; i < path.length - 1; i++) {
    for (let k = 0; k < n; k++) {
      const a = i * n + k, b = i * n + ((k + 1) % n), c = a + n, d = b + n;
      idx.push(a, b, c, b, d, c);
    }
  }
  // Enden zu
  for (const [ring, flip] of [[0, true], [path.length - 1, false]] as [number, boolean][]) {
    for (let k = 1; k < n - 1; k++) {
      const a = ring * n, b = ring * n + k, c = ring * n + k + 1;
      if (flip) idx.push(a, c, b); else idx.push(a, b, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g.toNonIndexed();
}

function paint(g: THREE.BufferGeometry, color: THREE.Color): THREE.BufferGeometry {
  const ng = g.index ? g.toNonIndexed() : g;
  if (ng.attributes.uv) ng.deleteAttribute('uv');
  const arr = new Float32Array(ng.attributes.position.count * 3);
  for (let i = 0; i < arr.length; i += 3) { arr[i] = color.r; arr[i + 1] = color.g; arr[i + 2] = color.b; }
  ng.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return ng;
}

const C_STEEL = new THREE.Color('#c3c9d1');
const C_DARK = new THREE.Color('#2b2f36');
const C_BED = new THREE.Color('#1d2026');
const C_BOLT = new THREE.Color('#e6e9ee');

// Standfuß: Stütze + Fußplatte
function stand(x: number, z: number, yaw: number): THREE.BufferGeometry[] {
  const post = rbox(0.07, 0.09, 0.12, 0.015).clone().translate(0, 0.075, 0);
  const foot = rbox(0.13, 0.025, 0.2, 0.01).clone().translate(0, 0.0125, 0);
  return [post, foot].map((g) => paint(g, C_DARK).rotateY(yaw).translate(x, 0, z));
}

/*
 * Rahmen eines Bandfeldes: Seitenwangen (Stufenfarbe), Kantenschutz aus Stahl,
 * Nieten, dunkles Bett, Rollen-Enden und Standfüße. Farben stecken in den Vertex-Farben.
 */
function beltFrame(path: THREE.Vector3[], color: string): THREE.BufferGeometry {
  const tier = new THREE.Color(color);
  const sideP = roundedProfile(0.05, 0.15, 0.012, 2);
  const lip = roundedProfile(0.085, 0.035, 0.016, 3);
  const bed = roundedProfile(BELT_HALF * 2 + 0.02, 0.06, 0.015, 2);
  const parts: THREE.BufferGeometry[] = [
    sweep(path, sideP, RAIL_OFF, 0.155, tier),
    sweep(path, sideP, -RAIL_OFF, 0.155, tier),
    sweep(path, lip, RAIL_OFF - 0.008, 0.245, C_STEEL),
    sweep(path, lip, -RAIL_OFF + 0.008, 0.245, C_STEEL),
    sweep(path, bed, 0, 0.13, C_BED),
  ];
  const up = new THREE.Vector3(0, 1, 0);
  const at = (t: number) => {
    const f = t * (path.length - 1), i = Math.min(path.length - 2, Math.floor(f)), k = f - i;
    const pnt = path[i].clone().lerp(path[i + 1], k);
    const tan = path[i + 1].clone().sub(path[i]).normalize();
    const side = new THREE.Vector3().crossVectors(tan, up).normalize();
    return { pnt, tan, side };
  };
  // Nieten außen an den Wangen
  const rivet = new THREE.CylinderGeometry(0.014, 0.016, 0.012, 8);
  for (const t of [0.17, 0.5, 0.83]) {
    const { pnt, side } = at(t);
    for (const sgn of [1, -1]) {
      const o = sgn * (RAIL_OFF + 0.027);
      const g = paint(rivet.clone(), C_BOLT);
      g.rotateZ(Math.PI / 2);
      g.rotateY(Math.atan2(-side.z, side.x));
      g.translate(pnt.x + side.x * o, 0.155, pnt.z + side.z * o);
      parts.push(g);
    }
  }
  // Achsen der Umlenkrollen an beiden Enden (kleine Stahlkappen außen)
  for (const t of [0.02, 0.98]) {
    const { pnt, side } = at(t);
    for (const sgn of [1, -1]) {
      const o = sgn * (RAIL_OFF + 0.03);
      const g = paint(new THREE.CylinderGeometry(0.03, 0.03, 0.02, 12), C_STEEL);
      g.rotateZ(Math.PI / 2);
      g.rotateY(Math.atan2(-side.z, side.x));
      g.translate(pnt.x + side.x * o, 0.165, pnt.z + side.z * o);
      parts.push(g);
    }
  }
  // Standfüße in der Mitte
  const { pnt, side } = at(0.5);
  const yaw = Math.atan2(-side.z, side.x);
  for (const sgn of [1, -1]) {
    const o = sgn * (RAIL_OFF - 0.01);
    parts.push(...stand(pnt.x + side.x * o, pnt.z + side.z * o, yaw));
  }
  return mergeGeometries(parts.map((g) => { if (g.attributes.uv) g.deleteAttribute('uv'); if (g.attributes.uv1) g.deleteAttribute('uv1'); return g; }))!;
}

export function straightBelt(color = '#f2c230'): { surface: THREE.BufferGeometry; frame: THREE.BufferGeometry } {
  const surface = new THREE.PlaneGeometry(1, BELT_HALF * 2);
  surface.rotateX(-Math.PI / 2);
  surface.translate(0, BELT_Y, 0);
  const path = [new THREE.Vector3(-0.5, 0, 0), new THREE.Vector3(0.5, 0, 0)];
  return { surface, frame: beltFrame(path, color) };
}

// Kurve: rel = 1 (kommt von „oben“, z = −0.5) oder 3 (von unten) – fein unterteilt und glatt
export function curveBelt(rel: number, color = '#f2c230'): { surface: THREE.BufferGeometry; frame: THREE.BufferGeometry } {
  const cz = rel === 1 ? -0.5 : 0.5;
  const cx = 0.5;
  const N = 20;
  const ang = (t: number) => (rel === 1 ? Math.PI - t * (Math.PI / 2) : Math.PI + t * (Math.PI / 2));
  const ri = 0.5 - BELT_HALF, ro = 0.5 + BELT_HALF;
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let s = 0; s <= N; s++) {
    const a = ang(s / N);
    for (const [r, v] of [[ri, 0], [ro, 1]]) {
      pos.push(cx + Math.cos(a) * r, BELT_Y, cz + Math.sin(a) * r);
      uv.push(s / N, v);
    }
  }
  for (let s = 0; s < N; s++) {
    const a = s * 2, b = a + 1, c = a + 2, d = a + 3;
    if (rel === 1) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d);
  }
  const surface = new THREE.BufferGeometry();
  surface.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  surface.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  surface.setIndex(idx);
  surface.computeVertexNormals();
  const nrm = surface.attributes.normal;
  for (let i = 0; i < nrm.count; i++) nrm.setXYZ(i, 0, 1, 0);
  // Mittellinie des Bogens (Radius 0,5 um die Ecke)
  const path: THREE.Vector3[] = [];
  for (let s = 0; s <= N; s++) { const a = ang(s / N); path.push(new THREE.Vector3(cx + Math.cos(a) * 0.5, 0, cz + Math.sin(a) * 0.5)); }
  return { surface, frame: beltFrame(path, color) };
}

// Position einer Banane auf dem Band (lokal), p = 0..1
export function beltPath(curve: number, p: number, out: { x: number; z: number; tx: number; tz: number }) {
  if (curve === 1) {
    const a = Math.PI - p * (Math.PI / 2);
    out.x = 0.5 + Math.cos(a) * 0.5;
    out.z = -0.5 + Math.sin(a) * 0.5;
    out.tx = Math.sin(a);
    out.tz = -Math.cos(a);
  } else if (curve === 3) {
    const a = Math.PI + p * (Math.PI / 2);
    out.x = 0.5 + Math.cos(a) * 0.5;
    out.z = 0.5 + Math.sin(a) * 0.5;
    out.tx = -Math.sin(a);
    out.tz = Math.cos(a);
  } else {
    out.x = p - 0.5;
    out.z = 0;
    out.tx = 1;
    out.tz = 0;
  }
}

// ---------------------------------------------------------------- Texturen
export function floorTexture() {
  return canvasTexture(256, 256, (ctx) => {
    const r = rand(7);
    ctx.fillStyle = '#7d8189';
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 2600; i++) {
      const v = 110 + r() * 40;
      ctx.fillStyle = `rgba(${v},${v + 2},${v + 6},${0.12 + r() * 0.15})`;
      ctx.fillRect(r() * 256, r() * 256, 1 + r() * 3, 1 + r() * 3);
    }
    // Fugen (2×2 Felder pro Textur)
    ctx.strokeStyle = 'rgba(40,44,50,0.55)';
    ctx.lineWidth = 3;
    ctx.strokeRect(1.5, 1.5, 253, 253);
    ctx.strokeStyle = 'rgba(40,44,50,0.22)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(128, 0); ctx.lineTo(128, 256); ctx.moveTo(0, 128); ctx.lineTo(256, 128); ctx.stroke();
    // Flecken
    for (let i = 0; i < 3; i++) {
      const g = ctx.createRadialGradient(r() * 256, r() * 256, 0, r() * 256, r() * 256, 40 + r() * 40);
      g.addColorStop(0, 'rgba(50,45,40,0.12)');
      g.addColorStop(1, 'rgba(50,45,40,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 256, 256);
    }
  });
}

export function beltTexture(accent: string, arrows = true) {
  return canvasTexture(256, 128, (ctx) => {
    const r = rand(11);
    ctx.fillStyle = '#26292f';
    ctx.fillRect(0, 0, 256, 128);
    // Gummi-Körnung
    for (let i = 0; i < 1400; i++) {
      const v = 30 + r() * 26;
      ctx.fillStyle = `rgba(${v},${v + 2},${v + 5},0.5)`;
      ctx.fillRect(r() * 256, r() * 128, 1 + r() * 2, 1);
    }
    // Querrippen mit Licht- und Schattenkante
    for (let x = 0; x < 256; x += 16) {
      ctx.fillStyle = '#3a3e46';
      ctx.fillRect(x, 8, 5, 112);
      ctx.fillStyle = 'rgba(255,255,255,0.09)';
      ctx.fillRect(x, 8, 1.5, 112);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(x + 5, 8, 2, 112);
    }
    // Ränder des Gurtes etwas dunkler
    const g = ctx.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, 'rgba(0,0,0,0.45)'); g.addColorStop(0.09, 'rgba(0,0,0,0)');
    g.addColorStop(0.91, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 128);
    // dezente Laufrichtungs-Pfeile in der Stufenfarbe
    if (!arrows) return;
    ctx.strokeStyle = accent;
    ctx.globalAlpha = 0.6;
    ctx.lineWidth = 6;
    ctx.lineJoin = ctx.lineCap = 'round';
    for (const x of [52, 180]) {
      ctx.beginPath();
      ctx.moveTo(x, 44); ctx.lineTo(x + 16, 64); ctx.lineTo(x, 84);
      ctx.stroke();
    }
  });
}

export function bananaPileTexture() {
  return canvasTexture(1024, 1024, (ctx) => {
    const r = rand(42);
    ctx.fillStyle = '#c99812';
    ctx.fillRect(0, 0, 1024, 1024);
    // Eine Banane: Halbmond mit Kante, Lichtkante, brauner Spitze und grünlichem Stiel
    const banana = (x: number, y: number, a: number, L: number, ripe: number) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a);
      const W = L * 0.2;
      // Schatten
      ctx.fillStyle = 'rgba(40,25,0,0.45)';
      ctx.beginPath();
      ctx.moveTo(-L / 2 + 3, 4);
      ctx.quadraticCurveTo(0, -L * 0.28 + 4, L / 2 + 3, 4);
      ctx.quadraticCurveTo(0, -L * 0.28 + W * 2 + 4, -L / 2 + 3, 4);
      ctx.fill();
      // Körper
      const g = ctx.createLinearGradient(0, -L * 0.25, 0, W);
      const top = ripe < 0.12 ? '#e9ec7a' : '#fff27a';
      const mid = ripe < 0.12 ? '#c9d23a' : ripe > 0.9 ? '#e9b52a' : '#ffd21f';
      g.addColorStop(0, top);
      g.addColorStop(0.55, mid);
      g.addColorStop(1, '#b88a08');
      ctx.fillStyle = g;
      ctx.strokeStyle = 'rgba(95,60,0,0.75)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-L / 2, 0);
      ctx.quadraticCurveTo(0, -L * 0.3, L / 2, 0);
      ctx.quadraticCurveTo(0, -L * 0.3 + W * 2, -L / 2, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Kante (Rippe)
      ctx.strokeStyle = 'rgba(150,105,0,0.55)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-L / 2 + 6, -1);
      ctx.quadraticCurveTo(0, -L * 0.3 + W * 0.9, L / 2 - 8, -1);
      ctx.stroke();
      // Glanz
      ctx.strokeStyle = 'rgba(255,255,220,0.65)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(-L / 4, -L * 0.1);
      ctx.quadraticCurveTo(0, -L * 0.2, L / 4, -L * 0.1);
      ctx.stroke();
      // Flecken bei reifen Bananen
      if (ripe > 0.7) {
        ctx.fillStyle = 'rgba(110,65,10,0.6)';
        for (let k = 0; k < 5; k++) { ctx.beginPath(); ctx.arc((r() - 0.5) * L * 0.6, -L * 0.1 + r() * W * 0.8, 1.2 + r() * 1.8, 0, Math.PI * 2); ctx.fill(); }
      }
      // Spitze und Stiel
      ctx.fillStyle = '#3a2610';
      ctx.beginPath(); ctx.ellipse(-L / 2, 0, 3.2, 2.6, a, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#7a8a30';
      ctx.fillRect(L / 2 - 2, -3, 9, 5);
      ctx.fillStyle = '#4a3a18';
      ctx.fillRect(L / 2 + 6, -3, 3, 5);
      ctx.restore();
    };
    // Mehrere Lagen, damit es wie ein Haufen aussieht
    for (let layer = 0; layer < 3; layer++) {
      const n = [260, 260, 200][layer];
      for (let i = 0; i < n; i++) {
        const x = r() * 1024, y = r() * 1024, a = r() * Math.PI * 2, L = 70 + r() * 40;
        const ripe = r();
        if (r() < 0.25) {
          // Büschel aus 3–4 Bananen
          const k = 3 + Math.floor(r() * 2);
          for (let j = 0; j < k; j++) banana(x + Math.cos(a) * j * 9, y + Math.sin(a) * j * 9, a + (j - k / 2) * 0.12, L, ripe);
        } else {
          banana(x, y, a, L, ripe);
        }
        // nahtlos kachelbar: am Rand wiederholen
        if (x < 60 || x > 964 || y < 60 || y > 964) banana((x + 512) % 1024 - (x > 512 ? 0 : 0), y, a, L, ripe);
      }
    }
  });
}

// Lack mit leichter Körnung und abgenutzten Kanten (weiß – wird mit der Materialfarbe multipliziert)
export function paintTexture() {
  return canvasTexture(256, 256, (ctx) => {
    const r = rand(23);
    ctx.fillStyle = '#f4f4f4';
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 3000; i++) {
      const v = 215 + r() * 40;
      ctx.fillStyle = `rgba(${v},${v},${v},0.35)`;
      ctx.fillRect(r() * 256, r() * 256, 1 + r() * 2, 1 + r() * 2);
    }
    // Rand etwas dunkler (wirkt wie Kantenschatten / Schmutz)
    const g = ctx.createRadialGradient(128, 128, 90, 128, 128, 190);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(60,55,50,0.28)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
    // ein paar feine Kratzer
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 0.8;
    for (let i = 0; i < 14; i++) {
      const x = r() * 256, y = r() * 256, a = r() * Math.PI;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * (6 + r() * 14), y + Math.sin(a) * (6 + r() * 14)); ctx.stroke();
    }
  });
}

// Gebürsteter Stahl (Rauheit-Karte)
export function brushedTexture() {
  const t = canvasTexture(256, 256, (ctx) => {
    const r = rand(5);
    ctx.fillStyle = '#8a8a8a';
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 900; i++) {
      const v = 100 + r() * 90;
      ctx.fillStyle = `rgba(${v},${v},${v},0.5)`;
      ctx.fillRect(r() * 256, r() * 256, 20 + r() * 80, 1);
    }
  });
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

// Riffelblech (Tränenblech) für Bodenplatten
export function treadTexture() {
  return canvasTexture(128, 128, (ctx) => {
    ctx.fillStyle = '#5a616b';
    ctx.fillRect(0, 0, 128, 128);
    const tear = (x: number, y: number, a: number) => {
      ctx.save(); ctx.translate(x, y); ctx.rotate(a);
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(1, 1.5, 7, 2.2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#7d8590'; ctx.beginPath(); ctx.ellipse(0, 0, 7, 2.2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.beginPath(); ctx.ellipse(-1, -0.8, 5, 0.8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    };
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) tear(x * 16 + (y % 2) * 8 + 4, y * 16 + 8, (x + y) % 2 ? Math.PI / 4 : -Math.PI / 4);
  });
}

// Lüftungsgitter
export function ventTexture() {
  return canvasTexture(64, 64, (ctx) => {
    ctx.fillStyle = '#30353c';
    ctx.fillRect(0, 0, 64, 64);
    for (let y = 6; y < 60; y += 8) {
      ctx.fillStyle = '#0c0e11'; ctx.fillRect(6, y, 52, 4);
      ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(6, y + 4, 52, 1);
    }
  }, false);
}

export function hazardTexture() {
  return canvasTexture(128, 32, (ctx) => {
    ctx.fillStyle = '#f2c230';
    ctx.fillRect(0, 0, 128, 32);
    ctx.fillStyle = '#222';
    for (let i = -2; i < 10; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 16, 32); ctx.lineTo(i * 16 + 8, 32); ctx.lineTo(i * 16 + 24, 0); ctx.lineTo(i * 16 + 16, 0);
      ctx.fill();
    }
  });
}

export function wallTexture() {
  return canvasTexture(256, 256, (ctx) => {
    ctx.fillStyle = '#5b636e';
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 16; i++) {
      ctx.fillStyle = i % 2 ? '#56606b' : '#626b77';
      ctx.fillRect(i * 16, 0, 16, 256);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(i * 16 + 14, 0, 2, 256);
    }
    ctx.fillStyle = '#9fd3ff';
    ctx.globalAlpha = 0.85;
    ctx.fillRect(0, 40, 256, 34);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#3a414a';
    for (let i = 0; i < 8; i++) ctx.fillRect(i * 32, 40, 3, 34);
    ctx.fillStyle = '#f2c230';
    ctx.fillRect(0, 230, 256, 10);
  });
}

export function dripTexture(top: string, bottom: string) {
  return canvasTexture(64, 128, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, top);
    g.addColorStop(1, bottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 128);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    for (let i = 0; i < 6; i++) ctx.fillRect(i * 11 + 3, 0, 3, 128);
  });
}

export function labelTexture(text: string, color: string, bg: string, font = 'bold 64px Inter, Arial, sans-serif', w = 256, h = 128) {
  return canvasTexture(w, h, (ctx) => {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = color;
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, w / 2, h / 2 + 4);
  }, false);
}

export function softDotTexture() {
  return canvasTexture(64, 64, (ctx) => {
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,0.9)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
  }, false);
}
