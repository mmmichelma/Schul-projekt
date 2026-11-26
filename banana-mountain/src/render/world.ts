/*
 * Der 3D-Renderer. Liest die Simulation, verändert sie aber nie.
 */
import * as THREE from 'three';
import { MAP_W, MAP_H, PILE_CX, PILE_CY, PILE_R, BUILDINGS, machineSpeed, collectorRadius, DX, DY } from '../sim/defs';
import { Sim, Building, Ent, outputCell, inputCells, hasInput, hasOutput, rotatedSize, tileIndex, Blueprint } from '../sim/sim';
import { PileView } from './pileView';
import { BeltView } from './beltView';
import { Effects } from './effects';
import { createModel, createGhost, Model, LAMP_MATS } from './models';
import { floorTexture, wallTexture, hazardTexture, canvasTexture } from './assets';
import { Character, nameSprite } from './character';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export interface Quality {
  name: string;
  shadows: boolean;
  shadowRes: number;
  pixelRatio: number;
  lod: number;
  pileInstances: boolean;
}
export const QUALITIES: Quality[] = [
  { name: 'Niedrig', shadows: false, shadowRes: 1024, pixelRatio: 0.85, lod: 45, pileInstances: true },
  { name: 'Mittel', shadows: true, shadowRes: 1024, pixelRatio: 1, lod: 70, pileInstances: true },
  { name: 'Hoch', shadows: true, shadowRes: 2048, pixelRatio: 1.5, lod: 95, pileInstances: true },
  { name: 'Ultra', shadows: true, shadowRes: 4096, pixelRatio: 2, lod: 140, pileInstances: true },
];

interface BView { model: Model; key: string; ent: Building; center: THREE.Vector3; height: number }

export interface Preview {
  kind: 'none' | 'building' | 'belt' | 'demolish' | 'blueprint';
  type?: string;
  x?: number;
  y?: number;
  dir?: number;
  valid?: boolean;
  cells?: { x: number; y: number; dir: number; ok: boolean }[];
  rect?: { x0: number; y0: number; x1: number; y1: number };
  blueprint?: Blueprint;
}

export class GameRenderer {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  cam = { tx: PILE_CX, tz: PILE_CY + 22, dist: 82, yaw: 0, pitch: 0.82, follow: false, ty: 0 };
  // Spielfigur (Laufen-Modus)
  player = new Character();
  playerVisible = false;
  private tuning = { resScale: 1, lodScale: 1, shadows: 'auto' as 'auto' | 'on' | 'off', effects: true };
  sim: Sim;
  quality = QUALITIES[2];
  private sun: THREE.DirectionalLight;
  private pile!: PileView;
  private belts = new BeltView();
  private fx = new Effects();
  private views = new Map<number, BView>();
  private version = -1;
  private time = 0;
  private ghost: { type: string; g: ReturnType<typeof createGhost> } | null = null;
  private beltGhost: THREE.InstancedMesh;
  private radiusRing: THREE.Mesh;
  private radiusFill: THREE.Mesh;
  private selLines = new THREE.Group();
  private portGroup = new THREE.Group();
  private hoverBox: THREE.Mesh;
  private rectMesh: THREE.Mesh;
  private moneyAcc = new Map<number, number>();
  private moneyTimer = 0;
  private raycaster = new THREE.Raycaster();
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private selection: number[] = [];
  private selKey = '';
  preview: Preview = { kind: 'none' };
  private cursorViews = new Map<string, THREE.Group>();
  myPid = 'me';
  viewRect = { x0: 0, y0: 0, x1: MAP_W, y1: MAP_H };

  constructor(canvas: HTMLCanvasElement, sim: Sim) {
    this.sim = sim;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.5, 600);
    this.scene.background = new THREE.Color('#2b3038');
    this.scene.fog = new THREE.Fog('#2b3038', 140, 320);

    // Licht
    // Umgebungsspiegelung: Metall, Lack und Glas glänzen realistisch
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.45;
    pmrem.dispose();
    this.scene.add(new THREE.HemisphereLight('#e6eef8', '#4a4036', 0.7));
    this.sun = new THREE.DirectionalLight('#fff4e0', 2.4);
    this.sun.castShadow = true;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.sun, this.sun.target);
    const fill = new THREE.DirectionalLight('#9fc4ff', 0.5);
    fill.position.set(60, 40, 200);
    this.scene.add(fill);

    this.buildHall();
    this.pile = new PileView(sim);
    this.scene.add(this.pile.group, this.belts.group, this.fx.group, this.selLines, this.portGroup, this.player.root);
    this.player.root.visible = false;

    // Vorschau-Objekte
    const arrowTex = canvasTexture(64, 64, (ctx) => {
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fillRect(4, 4, 56, 56);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.moveTo(14, 18); ctx.lineTo(50, 32); ctx.lineTo(14, 46); ctx.closePath(); ctx.fill();
    }, false);
    const arrowGeo = new THREE.PlaneGeometry(0.92, 0.92).rotateX(-Math.PI / 2).translate(0, 0.22, 0);
    this.beltGhost = new THREE.InstancedMesh(arrowGeo, new THREE.MeshBasicMaterial({ map: arrowTex, transparent: true, depthWrite: false, opacity: 0.85 }), 1024);
    this.beltGhost.count = 0;
    this.beltGhost.frustumCulled = false;
    this.beltGhost.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(1024 * 3), 3);
    this.scene.add(this.beltGhost);
    this.radiusRing = new THREE.Mesh(new THREE.RingGeometry(0.96, 1, 96).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffe14a', transparent: true, opacity: 0.9, depthWrite: false }));
    this.radiusFill = new THREE.Mesh(new THREE.CircleGeometry(1, 96).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffe14a', transparent: true, opacity: 0.12, depthWrite: false, depthTest: false }));
    this.radiusRing.renderOrder = 5;
    this.radiusFill.renderOrder = 4;
    this.radiusRing.visible = this.radiusFill.visible = false;
    this.scene.add(this.radiusRing, this.radiusFill);
    this.hoverBox = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: '#ff4a3a', transparent: true, opacity: 0.35, depthWrite: false }));
    this.hoverBox.visible = false;
    this.scene.add(this.hoverBox);
    this.rectMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#4ab0ff', transparent: true, opacity: 0.22, depthWrite: false }));
    this.rectMesh.visible = false;
    this.scene.add(this.rectMesh);
    this.setQuality(this.quality);
  }

  private buildHall() {
    const ft = floorTexture();
    ft.repeat.set(MAP_W / 2, MAP_H / 2);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(MAP_W, MAP_H), new THREE.MeshStandardMaterial({ map: ft, roughness: 0.85, metalness: 0.05 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(MAP_W / 2, 0, MAP_H / 2);
    floor.receiveShadow = true;
    this.scene.add(floor);
    const outside = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), new THREE.MeshStandardMaterial({ color: '#23272e', roughness: 1 }));
    outside.rotation.x = -Math.PI / 2;
    outside.position.set(MAP_W / 2, -0.05, MAP_H / 2);
    this.scene.add(outside);

    // Warnring um die Bananenzone
    const hz = hazardTexture();
    hz.repeat.set(80, 1);
    const ring = new THREE.Mesh(new THREE.RingGeometry(PILE_R * 1.145, PILE_R * 1.145 + 0.5, 160, 1), new THREE.MeshStandardMaterial({ map: hz, roughness: 0.7 }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(PILE_CX, 0.012, PILE_CY);
    ring.receiveShadow = true;
    this.scene.add(ring);

    // Wände
    const wt = wallTexture();
    const wallMat = (len: number) => {
      const t = wt.clone();
      t.needsUpdate = true;
      t.repeat.set(len / 8, 1);
      return new THREE.MeshStandardMaterial({ map: t, roughness: 0.8, metalness: 0.2 });
    };
    const H = 10;
    const walls: [number, number, number, number][] = [
      [MAP_W / 2, -0.5, MAP_W + 2, 1], [MAP_W / 2, MAP_H + 0.5, MAP_W + 2, 1],
      [-0.5, MAP_H / 2, 1, MAP_H], [MAP_W + 0.5, MAP_H / 2, 1, MAP_H],
    ];
    for (const [x, z, w, d] of walls) {
      const len = Math.max(w, d);
      const wall = new THREE.Mesh(new THREE.BoxGeometry(w, H, d), wallMat(len));
      wall.position.set(x, H / 2, z);
      wall.receiveShadow = true;
      this.scene.add(wall);
    }
    // Stahlstützen und Kranbahn
    const steel = new THREE.MeshStandardMaterial({ color: '#d9a21b', roughness: 0.5, metalness: 0.4 });
    const pillarGeo = new THREE.BoxGeometry(0.8, H + 2, 0.8);
    const pillars = new THREE.InstancedMesh(pillarGeo, steel, 64);
    let n = 0;
    const m4 = new THREE.Matrix4();
    for (let x = 0; x <= MAP_W; x += 16) for (const z of [0, MAP_H]) { m4.makeTranslation(x, (H + 2) / 2, z); pillars.setMatrixAt(n++, m4); }
    for (let z = 16; z < MAP_H; z += 16) for (const x of [0, MAP_W]) { m4.makeTranslation(x, (H + 2) / 2, z); pillars.setMatrixAt(n++, m4); }
    pillars.count = n;
    pillars.castShadow = true;
    this.scene.add(pillars);
    for (const z of [0.2, MAP_H - 0.2]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(MAP_W, 0.6, 0.6), steel);
      rail.position.set(MAP_W / 2, H + 1.6, z);
      this.scene.add(rail);
    }
    // Schild
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(34, 5.5), new THREE.MeshBasicMaterial({
      map: canvasTexture(1024, 160, (ctx) => {
        ctx.fillStyle = '#1b1f27';
        ctx.fillRect(0, 0, 1024, 160);
        ctx.fillStyle = '#ffd21f';
        ctx.font = '900 104px Inter, Arial Black, Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('BANANA MOUNTAIN', 512, 86);
      }, false),
    }));
    sign.position.set(MAP_W / 2, 6.5, 0.05);
    this.scene.add(sign);
  }

  setSim(sim: Sim) {
    this.sim = sim;
    this.scene.remove(this.pile.group);
    this.pile.dispose();
    this.pile = new PileView(sim);
    this.pile.lodDistance = this.quality.lod;
    this.pile.setShadows(this.quality.shadows, this.quality.shadows && this.quality.shadowRes >= 2048);
    this.scene.add(this.pile.group);
    for (const v of this.views.values()) this.scene.remove(v.model.group);
    this.views.clear();
    this.version = -1;
    this.selection = [];
    this.selKey = '';
  }

  // Feineinstellungen aus dem Einstellungs-Menü
  setTuning(t: Partial<GameRenderer['tuning']>, fov?: number) {
    Object.assign(this.tuning, t);
    if (fov) { this.camera.fov = fov; this.camera.updateProjectionMatrix(); }
    this.setQuality(this.quality);
  }

  setQuality(preset: Quality) {
    this.quality = preset;
    const t = this.tuning;
    const q = { ...preset, shadows: t.shadows === 'auto' ? preset.shadows : t.shadows === 'on', lod: preset.lod * t.lodScale };
    this.renderer.setPixelRatio(Math.max(0.4, Math.min(window.devicePixelRatio || 1, q.pixelRatio) * t.resScale));
    this.renderer.shadowMap.enabled = q.shadows;
    this.sun.castShadow = q.shadows;
    if (this.sun.shadow.mapSize.x !== q.shadowRes) {
      this.sun.shadow.mapSize.set(q.shadowRes, q.shadowRes);
      this.sun.shadow.map?.dispose();
      (this.sun.shadow as unknown as { map: null }).map = null;
    }
    this.pile.lodDistance = q.lod;
    this.lodDist = q.lod;
    this.pile.setShadows(q.shadows, q.shadows && q.shadowRes >= 2048);
    this.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(m)) m.forEach((x) => { x.needsUpdate = true; }); else if (m) m.needsUpdate = true;
    });
  }

  resize(w: number, h: number) {
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }

  // ---------------------------------------------------------------- Kamera
  pan(dx: number, dz: number) {
    this.cam.tx = Math.max(-5, Math.min(MAP_W + 5, this.cam.tx + dx));
    this.cam.tz = Math.max(-5, Math.min(MAP_H + 5, this.cam.tz + dz));
  }
  zoom(f: number) {
    this.cam.dist = this.cam.follow ? Math.max(2.5, Math.min(25, this.cam.dist * f)) : Math.max(7, Math.min(170, this.cam.dist * f));
  }
  rotate(dyaw: number, dpitch: number) {
    this.cam.yaw += dyaw;
    const lo = this.cam.follow ? -0.15 : 0.42;
    this.cam.pitch = Math.max(lo, Math.min(1.48, this.cam.pitch + dpitch));
  }

  // Höhe des Bodens: Hallenboden, Bananenberg oder Förderband
  groundHeight(x: number, z: number): number {
    let h = Math.max(0, this.pile.surfaceHeight(x, z));
    const e = this.sim.entAt(Math.floor(x), Math.floor(z));
    if (e && e.kind === 'belt') h = Math.max(h, 0.2);
    else if (e && e.kind === 'building' && BUILDINGS[e.type].category === 'logistic') h = Math.max(h, 0.24);
    return h;
  }

  lodDist = 95;
  focus(x: number, z: number) { this.cam.tx = x; this.cam.tz = z; }

  private updateCamera() {
    const c = this.cam;
    const h = Math.sin(c.pitch) * c.dist;
    const r = Math.cos(c.pitch) * c.dist;
    if (c.follow) {
      // Dritte-Person-Kamera hinter der Spielfigur
      const ty = c.ty + 1.5;
      let cy = ty + h;
      const cx = c.tx + Math.sin(c.yaw) * r, cz = c.tz + Math.cos(c.yaw) * r;
      cy = Math.max(cy, this.groundHeight(cx, cz) + 0.6);
      this.camera.position.set(cx, cy, cz);
      this.camera.lookAt(c.tx, ty, c.tz);
    } else {
      this.camera.position.set(c.tx + Math.sin(c.yaw) * r, h, c.tz + Math.cos(c.yaw) * r);
      this.camera.lookAt(c.tx, 0, c.tz);
    }
    // Sichtbarer Bereich (grob) für das Ausblenden entfernter Objekte
    const reach = c.follow ? 95 : c.dist * (1.25 + (1.5 - c.pitch) * 0.9) + 6;
    this.viewRect = { x0: c.tx - reach, y0: c.tz - reach, x1: c.tx + reach, y1: c.tz + reach };
    // Schatten folgen der Kamera
    const s = Math.min(90, Math.max(22, c.dist * 0.95));
    const sc = this.sun.shadow.camera;
    if (sc.right !== s) {
      sc.left = -s; sc.right = s; sc.top = s; sc.bottom = -s; sc.near = 1; sc.far = 260;
      sc.updateProjectionMatrix();
    }
    this.sun.position.set(c.tx - 60, 62, c.tz - 25);
    this.sun.target.position.set(c.tx, 0, c.tz);
  }

  // ---------------------------------------------------------------- Auswahl per Maus
  private setRay(cx: number, cy: number) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((cx - rect.left) / rect.width) * 2 - 1, -((cy - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
  }

  groundPoint(cx: number, cy: number): THREE.Vector3 | null {
    this.updateCamera();
    this.setRay(cx, cy);
    const p = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(this.groundPlane, p) ? p : null;
  }

  pickTile(cx: number, cy: number): { x: number; y: number } | null {
    const p = this.groundPoint(cx, cy);
    return p ? { x: Math.floor(p.x), y: Math.floor(p.z) } : null;
  }

  // Trifft der Klick den Bananenberg? -> Feldindex
  pickPile(cx: number, cy: number): number {
    this.updateCamera();
    this.setRay(cx, cy);
    const hit = this.pile.raycast(this.raycaster);
    if (!hit) return -1;
    const x = Math.floor(hit.x), y = Math.floor(hit.z);
    const t = this.sim.nearestPileTile(x, y, 2);
    return t;
  }

  // Gebäude unter dem Mauszeiger (inkl. Höhe)
  pickEntity(cx: number, cy: number): Ent | undefined {
    this.updateCamera();
    this.setRay(cx, cy);
    const objs: THREE.Object3D[] = [];
    for (const v of this.views.values()) objs.push(v.model.group);
    const hit = this.raycaster.intersectObjects(objs, true)[0];
    if (hit) {
      let o: THREE.Object3D | null = hit.object;
      while (o && !(o.userData && o.userData.id)) o = o.parent;
      if (o) return this.sim.get(o.userData.id);
    }
    const t = this.pickTile(cx, cy);
    return t ? this.sim.entAt(t.x, t.y) : undefined;
  }

  // ---------------------------------------------------------------- Abgleich mit der Simulation
  private syncBuildings() {
    if (this.sim.structVersion === this.version) return;
    this.version = this.sim.structVersion;
    const seen = new Set<number>();
    for (const e of this.sim.ents.values()) {
      if (e.kind !== 'building') continue;
      seen.add(e.id);
      const key = `${e.type}|${e.x}|${e.y}|${e.dir}`;
      let v = this.views.get(e.id);
      if (v && v.key.split('|')[0] !== e.type) { this.scene.remove(v.model.group); v = undefined; }
      if (!v) {
        const model = createModel(e.type);
        model.group.userData.id = e.id;
        this.scene.add(model.group);
        v = { model, key: '', ent: e, center: new THREE.Vector3(), height: 1.5 };
        this.views.set(e.id, v);
      }
      v.ent = e;
      if (v.key !== key) {
        v.key = key;
        v.model.group.position.set(e.x + e.w / 2, 0, e.y + e.h / 2);
        v.model.group.rotation.y = -e.dir * Math.PI / 2;
        v.center.set(e.x + e.w / 2, 0, e.y + e.h / 2);
        const box = new THREE.Box3().setFromObject(v.model.detail);
        v.height = Math.max(1, box.max.y);
      }
    }
    for (const [id, v] of this.views) {
      if (!seen.has(id)) { this.scene.remove(v.model.group); this.views.delete(id); }
    }
    this.selKey = '';
  }

  setSelection(ids: number[]) { this.selection = ids; this.selKey = ''; }

  private updateSelectionVisuals() {
    const key = this.selection.join(',') + '|' + this.version + '|' + this.preview.kind + (this.preview.type || '') + this.preview.x + ',' + this.preview.y + ',' + this.preview.dir;
    if (key === this.selKey) return;
    this.selKey = key;
    this.selLines.clear();
    this.portGroup.clear();
    const lineMat = new THREE.LineBasicMaterial({ color: '#4ab0ff' });
    for (const id of this.selection) {
      const e = this.sim.get(id);
      if (!e) continue;
      const w = e.kind === 'belt' ? 1 : e.w, h = e.kind === 'belt' ? 1 : e.h;
      const hgt = e.kind === 'belt' ? 0.4 : (this.views.get(id)?.height || 1.5) + 0.1;
      const l = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w + 0.08, hgt, h + 0.08)), lineMat);
      l.position.set(e.x + w / 2, hgt / 2, e.y + h / 2);
      this.selLines.add(l);
      if (e.kind === 'building' && this.selection.length === 1) this.addPorts(e);
    }
    if (this.preview.kind === 'building' && this.preview.type) {
      this.addPorts({ type: this.preview.type, x: this.preview.x!, y: this.preview.y!, dir: this.preview.dir! });
    }
  }

  private addPorts(b: { type: string; x: number; y: number; dir: number }) {
    const inMat = new THREE.MeshBasicMaterial({ color: '#46ff7a' });
    const outMat = new THREE.MeshBasicMaterial({ color: '#ffa31a' });
    const cone = new THREE.ConeGeometry(0.22, 0.45, 4).rotateZ(-Math.PI / 2);
    const place = (x: number, y: number, dir: number, mat: THREE.Material) => {
      const m = new THREE.Mesh(cone, mat);
      m.position.set(x + 0.5, 0.55, y + 0.5);
      m.rotation.y = -dir * Math.PI / 2;
      this.portGroup.add(m);
    };
    const t = b.type;
    const mask = (b as { outMask?: number }).outMask ?? 7;
    if (t === 'crossing') {
      for (let d = 0; d < 4; d++) place(b.x + DX[d], b.y + DY[d], d, outMat);
      return;
    }
    if (t === 'splitter') { [b.dir, (b.dir + 1) % 4, (b.dir + 3) % 4].forEach((d, i) => { if (mask & (1 << i)) place(b.x + DX[d], b.y + DY[d], d, outMat); }); }
    else if (t === 'filter') { place(b.x + DX[b.dir], b.y + DY[b.dir], b.dir, outMat); for (const d of [(b.dir + 1) % 4, (b.dir + 3) % 4]) place(b.x + DX[d], b.y + DY[d], d, outMat); }
    else if (hasOutput(t)) { const [ox, oy] = outputCell(b); place(ox, oy, b.dir, outMat); }
    if (t === 'merger') { for (const d of [b.dir, (b.dir + 1) % 4, (b.dir + 3) % 4]) place(b.x - DX[d], b.y - DY[d], d, inMat); }
    else if (hasInput(t)) for (const [ix, iy] of inputCells(b)) place(ix, iy, b.dir, inMat);
  }

  private updatePreview() {
    const p = this.preview;
    // Gebäude-Vorschau
    if (p.kind === 'building' && p.type) {
      if (!this.ghost || this.ghost.type !== p.type) {
        if (this.ghost) this.scene.remove(this.ghost.g.group);
        this.ghost = { type: p.type, g: createGhost(p.type) };
        this.scene.add(this.ghost.g.group);
      }
      const [w, h] = rotatedSize(BUILDINGS[p.type], p.dir!);
      this.ghost.g.group.visible = true;
      this.ghost.g.group.position.set(p.x! + w / 2, 0.02, p.y! + h / 2);
      this.ghost.g.group.rotation.y = -p.dir! * Math.PI / 2;
      this.ghost.g.setValid(!!p.valid);
    } else if (this.ghost) {
      this.ghost.g.group.visible = false;
    }
    // Arbeitsradius
    let radius = 0, rx = 0, rz = 0;
    if (p.kind === 'building' && p.type && BUILDINGS[p.type].category === 'collector') {
      const [w, h] = rotatedSize(BUILDINGS[p.type], p.dir!);
      radius = collectorRadius(BUILDINGS[p.type], 1);
      rx = p.x! + w / 2; rz = p.y! + h / 2;
    } else if (this.selection.length === 1) {
      const e = this.sim.get(this.selection[0]);
      if (e && e.kind === 'building' && BUILDINGS[e.type].category === 'collector') {
        radius = collectorRadius(BUILDINGS[e.type], e.level);
        rx = e.x + e.w / 2; rz = e.y + e.h / 2;
      }
    }
    this.radiusRing.visible = this.radiusFill.visible = radius > 0;
    if (radius > 0) {
      this.radiusRing.position.set(rx, 0.05, rz);
      this.radiusFill.position.set(rx, 0.04, rz);
      this.radiusRing.scale.set(radius, 1, radius);
      this.radiusFill.scale.set(radius, 1, radius);
    }
    // Bänder / Blaupause
    const ghostCells: { x: number; y: number; dir: number; ok: boolean }[] = [];
    if (p.kind === 'belt' && p.cells) ghostCells.push(...p.cells);
    if (p.kind === 'blueprint' && p.blueprint) {
      for (const e of p.blueprint.entries) {
        if (e.belt) ghostCells.push({ x: p.x! + e.dx, y: p.y! + e.dy, dir: e.dir, ok: !!p.valid });
        else for (const [cx, cy] of this.sim.footprint(e.type!, p.x! + e.dx, p.y! + e.dy, e.dir)) ghostCells.push({ x: cx, y: cy, dir: e.dir, ok: !!p.valid });
      }
    }
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1);
    const ok = new THREE.Color('#46ff7a'), bad = new THREE.Color('#ff4a3a');
    let n = 0;
    for (const c of ghostCells.slice(0, 1024)) {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -c.dir * Math.PI / 2);
      v.set(c.x + 0.5, 0, c.y + 0.5);
      m4.compose(v, q, s);
      this.beltGhost.setMatrixAt(n, m4);
      this.beltGhost.setColorAt(n, c.ok ? ok : bad);
      n++;
    }
    this.beltGhost.count = n;
    this.beltGhost.instanceMatrix.needsUpdate = true;
    if (this.beltGhost.instanceColor) this.beltGhost.instanceColor.needsUpdate = true;
    // Abriss-Markierung / Auswahlrechteck
    this.hoverBox.visible = false;
    this.rectMesh.visible = false;
    if (p.rect) {
      const { x0, y0, x1, y1 } = p.rect;
      const target = p.kind === 'demolish' ? this.hoverBox : this.rectMesh;
      target.visible = true;
      if (target === this.hoverBox) {
        target.scale.set(x1 - x0 + 1.05, 1.6, y1 - y0 + 1.05);
        target.position.set((x0 + x1 + 1) / 2, 0.8, (y0 + y1 + 1) / 2);
      } else {
        target.scale.set(x1 - x0 + 1, 1, y1 - y0 + 1);
        target.position.set((x0 + x1 + 1) / 2, 0.06, (y0 + y1 + 1) / 2);
      }
    }
  }

  // ---------------------------------------------------------------- Frame
  render(dt: number, alpha: number) {
    this.time += dt;
    this.updateCamera();
    this.syncBuildings();
    this.pile.sync();
    this.pile.update(dt, this.camera.position);
    this.belts.update(this.sim, this.time, alpha, this.viewRect);

    // Gebäude animieren (nur sichtbare), Detailstufe nach Entfernung
    const camPos = this.camera.position;
    const vr = this.viewRect;
    for (const v of this.views.values()) {
      const e = v.ent;
      const visible = e.x + e.w >= vr.x0 && e.x <= vr.x1 && e.y + e.h >= vr.y0 && e.y <= vr.y1;
      v.model.group.visible = visible;
      if (!visible) continue;
      const far = v.center.distanceTo(camPos) > this.lodDist * 1.3;
      v.model.detail.visible = !far;
      v.model.lod.visible = far;
      v.model.lamp.material = LAMP_MATS[e.status];
      if (far) continue;
      const def = BUILDINGS[e.type];
      let target: { x: number; z: number } | null = null;
      if (def.category === 'collector' && e.target >= 0) {
        const tx = (e.target % MAP_W) + 0.5 - v.center.x, tz = Math.floor(e.target / MAP_W) + 0.5 - v.center.z;
        // Welt -> lokal (Gegen-Drehung)
        const a = e.dir * Math.PI / 2;
        target = { x: tx * Math.cos(a) + tz * Math.sin(a), z: -tx * Math.sin(a) + tz * Math.cos(a) };
      }
      const cap = def.capacity || 1;
      v.model.update({
        t: this.time + e.id * 0.37, dt, status: e.status, speed: machineSpeed(def, e.level) || 1,
        fill: def.category === 'storage' ? e.inBuf.length / cap : 0, target, filterStage: e.filter,
        outMask: e.outMask, tier: e.level - 1, prio: e.prio,
      });
      if (this.tuning.effects && e.status === 'working' && v.model.emitters.length && Math.random() < dt * 5) {
        for (const em of v.model.emitters) {
          const wp = em.getWorldPosition(new THREE.Vector3());
          this.fx.steam(wp, e.type === 'digger' ? '#555555' : '#ffffff');
        }
      }
    }

    // Ereignisse aus der Simulation -> Effekte
    let flyBudget = 24;
    for (const ev of this.sim.events) {
      if (ev.t === 'grab' && flyBudget > 0 && ev.tile !== undefined) {
        const v = this.views.get(ev.id!);
        if (!v || !v.model.group.visible) continue;
        flyBudget--;
        this.fx.fly(this.pile.tileTop(ev.tile), v.center.clone().setY(1.2), 0.5, 1.5);
      } else if (ev.t === 'manualGrab' && ev.tile !== undefined && ev.pid !== undefined && ev.pid !== this.myPid) {
        const cur = this.cursorViews.get(ev.pid);
        if (cur) this.fx.fly(this.pile.tileTop(ev.tile), cur.position.clone().setY(1.5), 0.5, 1.5);
      } else if (ev.t === 'manualGrab' && ev.tile !== undefined && this.cam.follow) {
        // Im Laufen-Modus fliegt die Banane in die Hand der Figur
        this.fx.fly(this.pile.tileTop(ev.tile), this.player.root.position.clone().add(new THREE.Vector3(0, 1.2, 0)), 0.4, 0.8);
      } else if (ev.t === 'manualGrab' && ev.tile !== undefined) {
        // Fliegt zur Kamera (in den Schälbereich unten rechts)
        const to = new THREE.Vector3(0.72, -0.75, 0.5).unproject(this.camera);
        to.sub(camPos).normalize().multiplyScalar(6).add(camPos);
        this.fx.fly(this.pile.tileTop(ev.tile), to, 0.45, 2);
      } else if (ev.t === 'sell' && ev.id) {
        this.moneyAcc.set(ev.id, (this.moneyAcc.get(ev.id) || 0) + (ev.value || 0));
      }
    }
    this.sim.events.length = 0;
    this.moneyTimer -= dt;
    if (this.moneyTimer <= 0) {
      this.moneyTimer = 0.45;
      for (const [id, val] of this.moneyAcc) {
        const v = this.views.get(id);
        if (v && v.model.group.visible) this.fx.money(v.center.clone().setY(v.height + 0.6), val);
      }
      this.moneyAcc.clear();
    }
    this.fx.update(dt, this.cam.dist);
    this.updatePreview();
    this.updateSelectionVisuals();
    this.renderer.render(this.scene, this.camera);
  }

  // Mitspieler: als laufende Figur (Laufen-Modus) oder als farbiger Ring (Bau-Ansicht)
  private remote = new Map<string, { g: THREE.Group; ring: THREE.Mesh; ch: Character; label: THREE.Sprite; last: THREE.Vector3; speed: number }>();
  setCursors(list: Map<string, { name: string; x: number; z: number; y?: number; yaw?: number; walk?: boolean; hold?: boolean }>) {
    for (const [id, r] of this.remote) {
      if (!list.has(id)) { this.scene.remove(r.g); this.remote.delete(id); this.cursorViews.delete(id); }
    }
    for (const [id, c] of list) {
      let r = this.remote.get(id);
      if (!r) {
        let h = 0;
        for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
        const color = new THREE.Color().setHSL((h % 360) / 360, 0.85, 0.6);
        const g = new THREE.Group();
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.08, 8, 32).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true }));
        ring.position.y = 0.3;
        ring.renderOrder = 15;
        const ch = new Character({ shirt: '#' + color.getHexString(), vest: '#ff8a1f', pants: '#2c3a5c', skin: '#eab894', helmet: '#' + color.getHexString() });
        const label = nameSprite(c.name, '#' + color.getHexString());
        g.add(ring, ch.root, label);
        g.position.set(c.x, 0, c.z);
        this.scene.add(g);
        r = { g, ring, ch, label, last: new THREE.Vector3(c.x, 0, c.z), speed: 0 };
        this.remote.set(id, r);
        this.cursorViews.set(id, g);
      }
      const before = r.g.position.clone();
      r.g.position.x += (c.x - r.g.position.x) * 0.2;
      r.g.position.z += (c.z - r.g.position.z) * 0.2;
      r.g.position.y += ((c.walk ? c.y ?? 0 : 0) - r.g.position.y) * 0.2;
      r.ring.visible = !c.walk;
      r.ch.root.visible = !!c.walk;
      r.label.position.y = c.walk ? 2.3 : 1.6;
      r.ring.rotation.y += 0.03;
      if (c.walk) {
        r.speed += (before.distanceTo(r.g.position) * 60 - r.speed) * 0.2;
        if (c.yaw !== undefined) r.ch.root.rotation.y = c.yaw;
        r.ch.setHolding(!!c.hold);
        r.ch.update(1 / 60, r.speed, false);
      }
    }
  }

  // Spielfigur setzen (Position, Blickrichtung, Animation)
  updatePlayer(dt: number, x: number, y: number, z: number, yaw: number, speed: number, air: boolean, holding: boolean, visible: boolean) {
    const p = this.player;
    p.root.visible = visible;
    if (!visible) return;
    p.root.position.set(x, y, z);
    p.root.rotation.y = yaw;
    p.setHolding(holding);
    p.update(dt, speed, air);
  }

  // Bildschirmposition eines Weltpunkts (für HTML-Overlays)
  toScreen(x: number, y: number, z: number): { x: number; y: number; visible: boolean } {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    const rect = this.renderer.domElement.getBoundingClientRect();
    return { x: (v.x * 0.5 + 0.5) * rect.width + rect.left, y: (-v.y * 0.5 + 0.5) * rect.height + rect.top, visible: v.z < 1 };
  }

  get drawCalls() { return this.renderer.info.render.calls; }
  get triangles() { return this.renderer.info.render.triangles; }
  pileTopAt(tile: number) { return this.pile.tileTop(tile); }
  tileIndexOf(x: number, y: number) { return tileIndex(x, y); }
}
