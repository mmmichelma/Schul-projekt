/*
 * Darstellung des Bananenbergs:
 *  - Höhenfeld (eine Fläche, deren Höhe von der Bananenmenge pro Feld abhängt)
 *  - Darauf einzelne 3D-Bananen an der Oberfläche, in Chunks zu 8×8 Feldern
 *  - Detailstufe: weit entfernte Chunks zeigen nur das Höhenfeld
 * Es werden nie eine Million Objekte gezeichnet – aber jede Entnahme ist sichtbar.
 */
import * as THREE from 'three';
import { MAP_W, MAP_H } from '../sim/defs';
import { Sim, pileHeight, tileIndex } from '../sim/sim';
import { bananaGeometry, bananaBunchGeometry, bananaPileTexture } from './assets';

const CHUNK = 8;
const MAX_PER_TILE = 3;
const EXTRA_PER_TILE = 4; // zusätzliche Bananen ganz in der Nähe der Kamera

function hash(a: number, b: number) {
  let n = Math.imul(a, 374761393) + Math.imul(b, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function bananasForCount(c: number) {
  if (c <= 0) return 0;
  if (c < 4) return Math.min(c, 2);
  if (c < 60) return 2;
  return MAX_PER_TILE;
}

interface Chunk {
  cx: number;
  cy: number;
  mesh: THREE.InstancedMesh;   // einzelne Bananen
  bunch: THREE.InstancedMesh;  // Bananenbüschel
  extra: THREE.InstancedMesh;  // dichte Lage für die Nähe
  dirty: boolean;
  center: THREE.Vector3;
}

export class PileView {
  group = new THREE.Group();
  private sim: Sim;
  private x0 = 0; private y0 = 0; private x1 = 0; private y1 = 0;
  private vw = 0; private vh = 0;
  private geo!: THREE.BufferGeometry;
  private mesh!: THREE.Mesh;
  private heights!: Float32Array; // pro Feld
  private chunks: Chunk[] = [];
  private chunkByKey = new Map<number, Chunk>();
  private normalsDirty = false;
  private normalsTimer = 0;
  // Wenig Polygone: davon gibt es tausende auf dem Berg
  private bananaGeo = bananaGeometry({ len: 0.95, radius: 0.12, bend: 0.24, seg: 10, radial: 8, green: 0.3 });
  private bunchGeo = bananaBunchGeometry(3, { len: 0.85, radius: 0.11, bend: 0.22, seg: 8, radial: 7, green: 0.35 });
  private bananaMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0, envMapIntensity: 0.55 });
  lodDistance = 95;
  instancesVisible = true;

  constructor(sim: Sim) {
    this.sim = sim;
    this.build();
  }

  dispose() {
    this.geo.dispose();
    for (const c of this.chunks) { c.mesh.dispose(); c.bunch.dispose(); c.extra.dispose(); }
    this.group.clear();
  }

  private build() {
    const sim = this.sim;
    // Umriss des Berges bestimmen (nur dieser Bereich bekommt ein Höhenfeld)
    let x0 = MAP_W, y0 = MAP_H, x1 = 0, y1 = 0, any = false;
    for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
      if (sim.pile[tileIndex(x, y)]) { any = true; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    }
    if (!any) { x0 = y0 = 0; x1 = y1 = 1; }
    this.x0 = Math.max(0, x0 - 1); this.y0 = Math.max(0, y0 - 1);
    this.x1 = Math.min(MAP_W - 1, x1 + 1); this.y1 = Math.min(MAP_H - 1, y1 + 1);
    this.vw = this.x1 - this.x0 + 2;
    this.vh = this.y1 - this.y0 + 2;
    this.heights = new Float32Array(MAP_W * MAP_H);
    for (let i = 0; i < this.heights.length; i++) this.heights[i] = pileHeight(sim.pile[i]);

    // Höhenfeld (Eckpunkte der Felder)
    const pos = new Float32Array(this.vw * this.vh * 3);
    const uv = new Float32Array(this.vw * this.vh * 2);
    const col = new Float32Array(this.vw * this.vh * 3);
    const idx: number[] = [];
    for (let j = 0; j < this.vh; j++) {
      for (let i = 0; i < this.vw; i++) {
        const k = j * this.vw + i;
        pos[k * 3] = this.x0 + i;
        pos[k * 3 + 2] = this.y0 + j;
        uv[k * 2] = (this.x0 + i) / 7;
        uv[k * 2 + 1] = (this.y0 + j) / 7;
        if (i < this.vw - 1 && j < this.vh - 1) {
          const a = k, b = k + 1, c = k + this.vw, d = k + this.vw + 1;
          idx.push(a, c, b, b, c, d);
        }
      }
    }
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    this.geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.geo.setIndex(idx);
    for (let j = 0; j < this.vh; j++) for (let i = 0; i < this.vw; i++) this.updateVertex(i, j);
    this.geo.computeVertexNormals();
    this.geo.computeBoundingSphere();
    const tex = bananaPileTexture();
    const mat = new THREE.MeshStandardMaterial({ map: tex, vertexColors: true, roughness: 0.75, metalness: 0, envMapIntensity: 0.35 });
    // Dreiseitige Projektion: an steilen Hängen wird die Textur nicht mehr in Streifen gezogen
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vTpPos;\nvarying vec3 vTpN;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTpPos = (modelMatrix * vec4(position, 1.0)).xyz;\nvTpN = normalize(mat3(modelMatrix) * normal);');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vTpPos;\nvarying vec3 vTpN;')
        .replace('#include <map_fragment>', `
          vec3 tpW = pow(abs(normalize(vTpN)), vec3(10.0));
          tpW /= (tpW.x + tpW.y + tpW.z);
          vec2 tpOff = vec2(0.37, 0.61);
          vec4 sampledDiffuseColor = texture2D(map, vTpPos.zy / 5.0 + tpOff) * tpW.x
            + texture2D(map, vTpPos.xz / 5.0) * tpW.y
            + texture2D(map, vTpPos.xy / 5.0 + tpOff.yx) * tpW.z;
          diffuseColor *= sampledDiffuseColor;`);
    };
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = true;
    this.group.add(this.mesh);

    // Chunks mit einzelnen Bananen
    for (let cy = Math.floor(this.y0 / CHUNK); cy <= Math.floor(this.y1 / CHUNK); cy++) {
      for (let cx = Math.floor(this.x0 / CHUNK); cx <= Math.floor(this.x1 / CHUNK); cx++) {
        const make = (geo: THREE.BufferGeometry) => {
          const m = new THREE.InstancedMesh(geo, this.bananaMat, CHUNK * CHUNK * MAX_PER_TILE);
          m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
          m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CHUNK * CHUNK * MAX_PER_TILE * 3), 3);
          m.castShadow = true;
          m.receiveShadow = true;
          m.frustumCulled = false;
          m.count = 0;
          return m;
        };
        const mesh = make(this.bananaGeo);
        const bunch = make(this.bunchGeo);
        const extra = new THREE.InstancedMesh(this.bananaGeo, this.bananaMat, CHUNK * CHUNK * EXTRA_PER_TILE);
        extra.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        extra.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CHUNK * CHUNK * EXTRA_PER_TILE * 3), 3);
        extra.castShadow = false;
        extra.receiveShadow = true;
        extra.frustumCulled = false;
        extra.count = 0;
        this.group.add(bunch, extra);
        const c: Chunk = { cx, cy, mesh, bunch, extra, dirty: true, center: new THREE.Vector3((cx + 0.5) * CHUNK, 4, (cy + 0.5) * CHUNK) };
        this.chunks.push(c);
        this.chunkByKey.set(cy * 1000 + cx, c);
        this.group.add(mesh);
      }
    }
  }

  // Höhe eines Eckpunkts = weicher Mittelwert der Felder ringsum (keine Stufen und Zacken)
  private updateVertex(i: number, j: number) {
    const x = this.x0 + i, y = this.y0 + j;
    let sum = 0, wsum = 0, max = 0;
    for (let ty = y - 2; ty <= y + 1; ty++) {
      for (let tx = x - 2; tx <= x + 1; tx++) {
        const dx = tx + 0.5 - x, dy = ty + 0.5 - y;
        const w = Math.exp(-(dx * dx + dy * dy) / 1.1);
        const h = tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H ? 0 : this.heights[tileIndex(tx, ty)];
        sum += h * w;
        wsum += w;
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) max = Math.max(max, h);
      }
    }
    const k = j * this.vw + i;
    const pos = this.geo.attributes.position.array as Float32Array;
    const col = this.geo.attributes.color.array as Float32Array;
    const avg = sum / wsum;
    const h = max > 0 ? avg : avg > 0.15 ? avg * 0.6 : -0.08;
    pos[k * 3 + 1] = h;
    // Tiefer = dunkler (Schatten zwischen den Bananen)
    const shade = h > 0 ? 0.62 + Math.min(0.3, h * 0.035) + hash(x, y) * 0.08 : 0.45;
    col[k * 3] = shade;
    col[k * 3 + 1] = shade * 0.97;
    col[k * 3 + 2] = shade * 0.9;
  }

  surfaceHeight(x: number, z: number): number {
    const fx = x - this.x0, fz = z - this.y0;
    const i = Math.floor(fx), j = Math.floor(fz);
    if (i < 0 || j < 0 || i >= this.vw - 1 || j >= this.vh - 1) return 0;
    const tx = fx - i, tz = fz - j;
    const p = this.geo.attributes.position.array as Float32Array;
    const h = (ii: number, jj: number) => p[(jj * this.vw + ii) * 3 + 1];
    return (h(i, j) * (1 - tx) + h(i + 1, j) * tx) * (1 - tz) + (h(i, j + 1) * (1 - tx) + h(i + 1, j + 1) * tx) * tz;
  }

  tileTop(tile: number): THREE.Vector3 {
    const x = tile % MAP_W, y = (tile / MAP_W) | 0;
    return new THREE.Vector3(x + 0.5, Math.max(0.1, this.surfaceHeight(x + 0.5, y + 0.5)), y + 0.5);
  }

  private rebuildChunk(c: Chunk) {
    c.dirty = false;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const qs = new THREE.Quaternion();
    const e = new THREE.Euler();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    const nrm = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const color = new THREE.Color();
    let n = 0, nb = 0, ne = 0;
    const x0 = c.cx * CHUNK, y0 = c.cy * CHUNK;
    // Banane liegt auf dem Hang: nach der Flächennormale ausrichten
    const place = (ti: number, b: number, px: number, pz: number, count: number) => {
      const r3 = hash(ti, b * 7 + 3), r4 = hash(ti, b * 7 + 4);
      const h = count < 4 ? 0.1 : this.surfaceHeight(px, pz);
      if (count < 4) nrm.copy(up);
      else {
        const d = 0.35;
        nrm.set(this.surfaceHeight(px - d, pz) - this.surfaceHeight(px + d, pz), 2 * d, this.surfaceHeight(px, pz - d) - this.surfaceHeight(px, pz + d)).normalize();
      }
      qs.setFromUnitVectors(up, nrm);
      e.set((r3 - 0.5) * 0.5, r4 * Math.PI * 2, (hash(ti, b * 7 + 5) - 0.5) * 0.5);
      q.setFromEuler(e).premultiply(qs);
      p.set(px, h, pz).addScaledVector(nrm, 0.07);
      const sc = 0.9 + hash(ti, b * 7 + 6) * 0.35;
      s.set(sc, sc, sc);
      m.compose(p, q, s);
      const tone = hash(ti, b * 7 + 8);
      if (tone < 0.08) color.setRGB(0.85, 1, 0.7);            // noch etwas grün
      else if (tone < 0.18) color.setRGB(1, 0.83, 0.62);      // sehr reif
      else color.setRGB(0.92 + tone * 0.08, 0.92 + tone * 0.08, 0.92 + tone * 0.08);
    };
    for (let y = y0; y < y0 + CHUNK; y++) {
      for (let x = x0; x < x0 + CHUNK; x++) {
        if (x >= MAP_W || y >= MAP_H) continue;
        const ti = tileIndex(x, y);
        const count = this.sim.pile[ti];
        const k = bananasForCount(count);
        for (let b = 0; b < k; b++) {
          const px = x + 0.1 + hash(ti, b * 7 + 1) * 0.8, pz = y + 0.1 + hash(ti, b * 7 + 2) * 0.8;
          place(ti, b, px, pz, count);
          // Auf dicken Stellen liegen ganze Büschel, am Rand einzelne Bananen
          if (count >= 30 && b % 2 === 0) { c.bunch.setMatrixAt(nb, m); c.bunch.setColorAt(nb, color); nb++; }
          else { c.mesh.setMatrixAt(n, m); c.mesh.setColorAt(n, color); n++; }
        }
        // dichte Lage in der Nähe (nur wo genug Bananen liegen)
        if (count >= 8) {
          for (let b = 0; b < EXTRA_PER_TILE; b++) {
            const bb = b + 10;
            const px = x + 0.05 + hash(ti, bb * 7 + 1) * 0.9, pz = y + 0.05 + hash(ti, bb * 7 + 2) * 0.9;
            place(ti, bb, px, pz, count);
            c.extra.setMatrixAt(ne, m); c.extra.setColorAt(ne, color); ne++;
          }
        }
      }
    }
    c.mesh.count = n;
    c.bunch.count = nb;
    c.extra.count = ne;
    for (const mm of [c.mesh, c.bunch, c.extra]) {
      mm.instanceMatrix.needsUpdate = true;
      if (mm.instanceColor) mm.instanceColor.needsUpdate = true;
    }
  }

  // Übernimmt geänderte Felder aus der Simulation
  sync(budget = 6) {
    const dirty = this.sim.dirtyPile;
    if (dirty.size) {
      for (const ti of dirty) {
        this.heights[ti] = pileHeight(this.sim.pile[ti]);
        const x = ti % MAP_W, y = (ti / MAP_W) | 0;
        // Glättung reicht zwei Felder weit
        for (let dy = -1; dy <= 2; dy++) for (let dx = -1; dx <= 2; dx++) {
          const i = x + dx - this.x0, j = y + dy - this.y0;
          if (i >= 0 && j >= 0 && i < this.vw && j < this.vh) this.updateVertex(i, j);
        }
        for (const [dx, dy] of [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]]) {
          const c = this.chunkByKey.get(Math.floor((y + dy) / CHUNK) * 1000 + Math.floor((x + dx) / CHUNK));
          if (c) c.dirty = true;
        }
      }
      dirty.clear();
      this.geo.attributes.position.needsUpdate = true;
      this.geo.attributes.color.needsUpdate = true;
      this.normalsDirty = true;
    }
    for (const c of this.chunks) {
      if (budget <= 0) break;
      if (c.dirty && c.mesh.visible) { this.rebuildChunk(c); budget--; }
    }
  }

  update(dt: number, camPos: THREE.Vector3) {
    this.normalsTimer -= dt;
    if (this.normalsDirty && this.normalsTimer <= 0) {
      this.geo.computeVertexNormals();
      this.normalsDirty = false;
      this.normalsTimer = 0.25;
    }
    for (const c of this.chunks) {
      // Einzelne 3D-Bananen nur in der Nähe – weiter weg reicht die Bananen-Textur
      const dist = c.center.distanceTo(camPos);
      const vis = this.instancesVisible && dist < Math.min(42, this.lodDistance * 0.45);
      if (vis && !c.mesh.visible && c.dirty) this.rebuildChunk(c);
      c.mesh.visible = vis;
      c.bunch.visible = vis;
      c.extra.visible = vis && dist < Math.min(20, this.lodDistance * 0.22);
    }
  }

  raycast(ray: THREE.Raycaster): THREE.Vector3 | null {
    const hit = ray.intersectObject(this.mesh, false)[0];
    return hit ? hit.point : null;
  }

  // Einzelbananen werfen nur auf hoher Qualität Schatten (spart Leistung)
  setShadows(on: boolean, detailed = on) {
    this.mesh.castShadow = on;
    for (const c of this.chunks) { c.mesh.castShadow = detailed; c.bunch.castShadow = detailed; }
  }
}
