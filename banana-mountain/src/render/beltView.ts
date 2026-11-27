/*
 * Förderbänder (instanziert, wenige Draw-Calls) und alle Bananen darauf.
 * Die Bananen werden jeden Frame aus der Simulation gelesen und zwischen
 * zwei Simulationstakten weich interpoliert.
 */
import * as THREE from 'three';
import { BELT_TIERS, STAGES, NODE_TYPES, DX, DY } from '../sim/defs';
import type { Belt, Building, Sim } from '../sim/sim';
import { straightBelt, curveBelt, beltTexture, stageVisuals, beltPath, BELT_Y } from './assets';

const SHAPES = [0, 1, 3]; // gerade, Kurve von oben, Kurve von unten
const NODE_Y = 0.27;      // Höhe des Kreuzungs-Decks

interface TierMeshes {
  tex: THREE.Texture;
  surface: THREE.InstancedMesh[];
  frame: THREE.InstancedMesh[];
}

export class BeltView {
  group = new THREE.Group();
  private tiers: TierMeshes[] = [];
  private capacity = 0;
  private stageMeshes: THREE.InstancedMesh[] = [];
  private stageCap: number[] = [];
  private version = -1;
  private belts: Belt[] = [];
  private nodes: Building[] = [];
  private tmp = { x: 0, z: 0, tx: 1, tz: 0 };
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3(1, 1, 1);
  private yAxis = new THREE.Vector3(0, 1, 0);

  constructor() {
    const geos = SHAPES.map((sh) => (sh === 0 ? straightBelt() : curveBelt(sh)));
    BELT_TIERS.forEach((tier) => {
      const tex = beltTexture(tier.color);
      const surfMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, metalness: 0.05, side: THREE.DoubleSide });
      // Rahmen: Vertex-Farben machen die Schienen dunkel (getönt) und den Streifen voll farbig
      const frameMat = new THREE.MeshStandardMaterial({
        color: tier.color, vertexColors: true, roughness: 0.38, metalness: 0.6,
        emissive: tier.name === 'Hyper' ? tier.color : '#000000', emissiveIntensity: 0.25,
      });
      this.tiers.push({
        tex,
        surface: geos.map((g) => this.instanced(g.surface, surfMat, false)),
        frame: geos.map((g) => this.instanced(g.frame, frameMat, true)),
      });
    });
    for (const sv of stageVisuals()) {
      const mesh = new THREE.InstancedMesh(sv.geo, sv.mat, 256);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.castShadow = false;
      this.stageMeshes.push(mesh);
      this.stageCap.push(256);
      this.group.add(mesh);
    }
    void STAGES;
  }

  private instanced(geo: THREE.BufferGeometry, mat: THREE.Material, shadow: boolean) {
    const m = new THREE.InstancedMesh(geo, mat, 16);
    m.count = 0;
    m.frustumCulled = false;
    m.receiveShadow = true;
    m.castShadow = shadow;
    this.group.add(m);
    return m;
  }

  private grow(mesh: THREE.InstancedMesh, need: number): THREE.InstancedMesh {
    const n = new THREE.InstancedMesh(mesh.geometry, mesh.material, need);
    n.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    n.frustumCulled = false;
    n.receiveShadow = mesh.receiveShadow;
    n.castShadow = mesh.castShadow;
    n.count = 0;
    this.group.remove(mesh);
    this.group.add(n);
    mesh.dispose();
    return n;
  }

  // Bandpositionen neu aufbauen (nur nach Umbauten)
  private rebuild(sim: Sim) {
    this.belts = [];
    this.nodes = [];
    for (const e of sim.ents.values()) {
      if (e.kind === 'belt') this.belts.push(e);
      else if (NODE_TYPES.has(e.type)) this.nodes.push(e);
    }
    const counts = this.tiers.map(() => SHAPES.map(() => 0));
    for (const b of this.belts) counts[b.tier][SHAPES.indexOf(b.curve)]++;
    this.tiers.forEach((t, ti) => {
      SHAPES.forEach((_, si) => {
        const need = counts[ti][si];
        if (need > t.surface[si].instanceMatrix.count) {
          const cap = Math.max(16, need * 2);
          t.surface[si] = this.grow(t.surface[si], cap);
          t.frame[si] = this.grow(t.frame[si], cap);
        }
        t.surface[si].count = 0;
        t.frame[si].count = 0;
      });
    });
    for (const b of this.belts) {
      const t = this.tiers[b.tier];
      const si = SHAPES.indexOf(b.curve);
      this.q.setFromAxisAngle(this.yAxis, -b.dir * Math.PI / 2);
      this.v.set(b.x + 0.5, 0, b.y + 0.5);
      this.m4.compose(this.v, this.q, this.s);
      const k = t.surface[si].count++;
      t.frame[si].count++;
      t.surface[si].setMatrixAt(k, this.m4);
      t.frame[si].setMatrixAt(k, this.m4);
    }
    for (const t of this.tiers) for (let si = 0; si < SHAPES.length; si++) {
      t.surface[si].instanceMatrix.needsUpdate = true;
      t.frame[si].instanceMatrix.needsUpdate = true;
    }
    this.capacity = this.belts.length;
  }

  update(sim: Sim, time: number, alpha: number, view: { x0: number; y0: number; x1: number; y1: number }) {
    if (sim.structVersion !== this.version) {
      this.version = sim.structVersion;
      this.rebuild(sim);
    }
    // Band-Textur läuft mit der Geschwindigkeit der Stufe
    this.tiers.forEach((t, i) => { t.tex.offset.x = -((time * BELT_TIERS[i].speed) % 1); });

    // Bananen auf den Bändern
    const counts = new Array(this.stageMeshes.length).fill(0);
    const c = Math.cos, sn = Math.sin;
    for (const b of this.belts) {
      if (!b.items.length || b.x < view.x0 || b.x > view.x1 || b.y < view.y0 || b.y > view.y1) continue;
      const rot = -b.dir * Math.PI / 2;
      const cr = c(rot), sr = sn(rot);
      const lanes = BELT_TIERS[b.tier].cap > 6;
      for (let k = 0; k < b.items.length; k++) {
        const it = b.items[k];
        const p = Math.max(0, Math.min(1, it.p - it.dp * (1 - alpha)));
        beltPath(b.curve, p, this.tmp);
        // Bei breiten Bändern zwei Spuren
        let lx = this.tmp.x, lz = this.tmp.z;
        if (lanes) { const off = (k % 2 ? 0.17 : -0.17); lx += -this.tmp.tz * off; lz += this.tmp.tx * off; }
        if (it.o) { lx += -this.tmp.tz * it.o; lz += this.tmp.tx * it.o; } // gleitet beim Einfädeln von der Seite herein
        // lokal -> Welt (Drehung um y)
        const wx = b.x + 0.5 + lx * cr + lz * sr;
        const wz = b.y + 0.5 - lx * sr + lz * cr;
        const yaw = Math.atan2(-this.tmp.tz, this.tmp.tx) + rot;
        const s = it.s;
        let mesh = this.stageMeshes[s];
        if (counts[s] >= this.stageCap[s]) {
          this.stageCap[s] *= 2;
          mesh = this.stageMeshes[s] = this.grow(mesh, this.stageCap[s]);
        }
        this.q.setFromAxisAngle(this.yAxis, yaw);
        this.v.set(wx, BELT_Y, wz);
        this.m4.compose(this.v, this.q, this.s);
        mesh.setMatrixAt(counts[s]++, this.m4);
      }
    }
    // Bananen auf Teilern, Verbindern, Filtern und Kreuzungen (Rand -> Mitte -> Rand)
    for (const b of this.nodes) {
      if (b.x < view.x0 || b.x > view.x1 || b.y < view.y0 || b.y > view.y1) continue;
      const cx = b.x + 0.5, cz = b.y + 0.5;
      for (let li = 0; li < 8; li++) {
        const lane = b.lanes[li];
        if (!lane || !lane.length) continue;
        const inLane = li < 4;
        const side = li % 4;
        const moveDir = inLane ? (side + 2) % 4 : side;
        const yaw = -moveDir * Math.PI / 2;
        for (const it of lane) {
          const p = Math.max(0, Math.min(1, it.p - it.dp * 2 * (1 - alpha)));
          // Einfahrt: vom Rand der Seite zur Mitte · Ausfahrt: von der Mitte zum Rand
          const f = inLane ? 0.5 * (1 - p) : 0.5 * p;
          const wx = cx + DX[side] * f, wz = cz + DY[side] * f;
          const s = it.s;
          let mesh = this.stageMeshes[s];
          if (counts[s] >= this.stageCap[s]) {
            this.stageCap[s] *= 2;
            mesh = this.stageMeshes[s] = this.grow(mesh, this.stageCap[s]);
          }
          this.q.setFromAxisAngle(this.yAxis, yaw);
          this.v.set(wx, NODE_Y, wz);
          this.m4.compose(this.v, this.q, this.s);
          mesh.setMatrixAt(counts[s]++, this.m4);
        }
      }
    }
    this.stageMeshes.forEach((m, i) => {
      m.count = counts[i];
      m.instanceMatrix.needsUpdate = true;
    });
  }

  setShadows(on: boolean) {
    for (const t of this.tiers) t.frame.forEach((f) => { f.castShadow = on; });
  }

  get count() { return this.capacity; }
}
