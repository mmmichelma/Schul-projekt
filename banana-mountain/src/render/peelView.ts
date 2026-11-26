/*
 * Der Schälbereich in 3D: Bananen stehen aufrecht, drei Schalenstreifen
 * klappen beim Ziehen nach unten weg (wie beim echten Schälen).
 */
import * as THREE from 'three';
import type { ManualBanana } from '../sim/sim';
import { canvasTexture } from './assets';

const LEN = 1.6;
const R = 0.2;
const BEND = 0.22;
const T0 = 0.1, T1 = 0.9;
const MIDS = [Math.PI / 2 + (2 * Math.PI) / 3, Math.PI / 2, Math.PI / 2 - (2 * Math.PI) / 3];

const pathAt = (t: number) => new THREE.Vector3(BEND * (1 - (2 * t - 1) ** 2), t * LEN, 0);
const radiusAt = (t: number) => R * Math.pow(Math.sin(Math.PI * Math.min(0.98, Math.max(0.02, t))), 0.5);

function tube(t0: number, t1: number, a0: number, a1: number, rScale: number, segT = 18, segA = 10, origin?: THREE.Vector3) {
  const pos: number[] = [], idx: number[] = [], uv: number[] = [];
  for (let i = 0; i <= segT; i++) {
    const t = t0 + (t1 - t0) * (i / segT);
    const c = pathAt(t);
    const r = radiusAt(t) * rScale;
    for (let j = 0; j <= segA; j++) {
      const a = a0 + (a1 - a0) * (j / segA);
      const x = c.x + Math.cos(a) * r, y = c.y, z = Math.sin(a) * r;
      pos.push(x - (origin?.x || 0), y - (origin?.y || 0), z - (origin?.z || 0));
      uv.push(j / segA, i / segT);
    }
  }
  for (let i = 0; i < segT; i++) for (let j = 0; j < segA; j++) {
    const a = i * (segA + 1) + j, b = a + 1, c = a + segA + 1, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

interface Strip { pivot: THREE.Group; angle: number; axis: THREE.Vector3 }
interface BananaView { group: THREE.Group; strips: Strip[]; drop: number; scale: number; leaving: boolean }

export class PeelView {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(32, 1.5, 0.1, 50);
  private views: BananaView[] = [];
  private geo: { fruit: THREE.BufferGeometry; strips: THREE.BufferGeometry[]; pivots: THREE.Vector3[]; stem: THREE.BufferGeometry; tip: THREE.BufferGeometry };
  private mats: { fruit: THREE.Material; peelOut: THREE.Material; peelIn: THREE.Material; stem: THREE.Material; tip: THREE.Material };
  private board: THREE.Mesh;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.camera.position.set(0, 1.25, 4.2);
    this.camera.lookAt(0, 0.75, 0);
    this.scene.add(new THREE.HemisphereLight('#fff6e0', '#5a4030', 1.6));
    const key = new THREE.DirectionalLight('#ffffff', 2.2);
    key.position.set(2, 4, 3);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    this.scene.add(key);

    const wood = canvasTexture(256, 128, (ctx) => {
      ctx.fillStyle = '#b07a45';
      ctx.fillRect(0, 0, 256, 128);
      for (let i = 0; i < 40; i++) {
        ctx.strokeStyle = `rgba(90,50,20,${0.08 + Math.random() * 0.15})`;
        ctx.lineWidth = 1 + Math.random() * 2;
        ctx.beginPath();
        const y = Math.random() * 128;
        ctx.moveTo(0, y);
        ctx.bezierCurveTo(80, y + Math.random() * 10 - 5, 170, y + Math.random() * 10 - 5, 256, y);
        ctx.stroke();
      }
    });
    this.board = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.16, 2.0), new THREE.MeshStandardMaterial({ map: wood, roughness: 0.8 }));
    this.board.position.y = -0.08;
    this.board.receiveShadow = true;
    this.scene.add(this.board);

    const pivots: THREE.Vector3[] = [];
    const strips = MIDS.map((m) => {
      const half = Math.PI / 3 - 0.035;
      const base = pathAt(T0);
      const r0 = radiusAt(T0) * 1.02;
      const pivot = new THREE.Vector3(base.x + Math.cos(m) * r0, base.y, Math.sin(m) * r0);
      pivots.push(pivot);
      return tube(T0, T1, m - half, m + half, 1.02, 18, 10, pivot);
    });
    this.geo = {
      fruit: tube(0.03, 0.97, 0, Math.PI * 2, 0.86, 22, 16),
      strips,
      pivots,
      stem: new THREE.CylinderGeometry(0.05, 0.07, 0.25, 8).translate(pathAt(0.97).x, LEN * 0.97 + 0.1, 0),
      tip: new THREE.SphereGeometry(0.06, 8, 6).translate(pathAt(0.02).x, 0.02 * LEN, 0),
    };
    this.mats = {
      fruit: new THREE.MeshStandardMaterial({ color: '#f6eecb', roughness: 0.55 }),
      peelOut: new THREE.MeshStandardMaterial({ color: '#ffd21f', roughness: 0.45, side: THREE.FrontSide }),
      peelIn: new THREE.MeshStandardMaterial({ color: '#fff6d2', roughness: 0.7, side: THREE.BackSide }),
      stem: new THREE.MeshStandardMaterial({ color: '#6e5a24', roughness: 0.8 }),
      tip: new THREE.MeshStandardMaterial({ color: '#3a2810', roughness: 0.8 }),
    };
  }

  private makeBanana(): BananaView {
    const group = new THREE.Group();
    const fruit = new THREE.Mesh(this.geo.fruit, this.mats.fruit);
    fruit.castShadow = true;
    group.add(fruit);
    group.add(new THREE.Mesh(this.geo.stem, this.mats.stem));
    group.add(new THREE.Mesh(this.geo.tip, this.mats.tip));
    const strips: Strip[] = this.geo.strips.map((g, k) => {
      const pivot = new THREE.Group();
      pivot.position.copy(this.geo.pivots[k]);
      const outer = new THREE.Mesh(g, this.mats.peelOut);
      const inner = new THREE.Mesh(g, this.mats.peelIn);
      outer.castShadow = true;
      pivot.add(outer, inner);
      group.add(pivot);
      const m = MIDS[k];
      return { pivot, angle: 0, axis: new THREE.Vector3(-Math.sin(m), 0, Math.cos(m)) };
    });
    this.scene.add(group);
    return { group, strips, drop: 1.6, scale: 1, leaving: false };
  }

  // Abgleich mit den gehaltenen Bananen der Simulation
  sync(slots: ManualBanana[]) {
    const active = this.views.filter((v) => !v.leaving);
    while (active.length < slots.length) { const v = this.makeBanana(); this.views.push(v); active.push(v); }
    while (active.length > slots.length) { const v = active.pop()!; v.leaving = true; }
    const n = slots.length;
    const spacing = n > 3 ? 0.78 : 1.05;
    const scale = n > 4 ? 0.72 : n > 2 ? 0.85 : 1;
    active.forEach((v, i) => {
      const mask = slots[i].mask;
      v.group.userData.targetX = (i - (n - 1) / 2) * spacing;
      v.group.userData.targetScale = scale;
      v.strips.forEach((s, k) => { s.pivot.userData.target = mask & (1 << k) ? -2.75 : 0; });
    });
  }

  render(dt: number) {
    const k = 1 - Math.exp(-12 * dt);
    this.views = this.views.filter((v) => {
      if (v.leaving) {
        v.scale -= dt * 4;
        v.group.position.y += dt * 2;
        if (v.scale <= 0) { this.scene.remove(v.group); return false; }
      } else {
        v.drop = Math.max(0, v.drop - dt * 6);
        v.scale += ((v.group.userData.targetScale ?? 1) - v.scale) * k;
        v.group.position.x += ((v.group.userData.targetX ?? 0) - v.group.position.x) * k;
        v.group.position.y = v.drop * v.drop * 0.6;
      }
      v.group.scale.setScalar(Math.max(0.001, v.scale));
      v.group.rotation.y = Math.sin(performance.now() / 900 + v.group.position.x) * 0.08;
      for (const s of v.strips) {
        const target = s.pivot.userData.target ?? 0;
        s.angle += (target - s.angle) * (1 - Math.exp(-9 * dt));
        s.pivot.quaternion.setFromAxisAngle(s.axis, s.angle);
      }
      return true;
    });
    this.renderer.render(this.scene, this.camera);
  }

  resize(w: number, h: number) {
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }

  dispose() { this.renderer.dispose(); }
}
