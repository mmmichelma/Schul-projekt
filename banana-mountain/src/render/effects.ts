/*
 * Kleine Effekte: fliegende Bananen (Greifen), Geld-Anzeigen (+$), Dampf.
 * Alles in Pools, damit nichts ständig neu erzeugt wird.
 */
import * as THREE from 'three';
import { bananaGeometry, softDotTexture } from './assets';

interface Flyer { from: THREE.Vector3; to: THREE.Vector3; t: number; dur: number; spin: number; arc: number }
interface Popup { sprite: THREE.Sprite; t: number; base: THREE.Vector3; active: boolean }
interface Puff { sprite: THREE.Sprite; t: number; life: number; vel: THREE.Vector3; active: boolean }

export function formatMoney(v: number): string {
  if (v >= 1e9) return '$' + (v / 1e9).toFixed(2).replace('.', ',') + ' Mrd.';
  if (v >= 1e6) return '$' + (v / 1e6).toFixed(2).replace('.', ',') + ' Mio.';
  if (v >= 1000) return '$' + Math.floor(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  if (v >= 100) return '$' + Math.floor(v);
  return '$' + v.toFixed(2).replace('.', ',');
}

export class Effects {
  group = new THREE.Group();
  private flyers: Flyer[] = [];
  private flyMesh: THREE.InstancedMesh;
  private popups: Popup[] = [];
  private puffs: Puff[] = [];
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3(1, 1, 1);
  private texCache = new Map<string, THREE.CanvasTexture>();
  private steamMat: THREE.SpriteMaterial;

  constructor() {
    this.flyMesh = new THREE.InstancedMesh(
      bananaGeometry({ len: 0.8, radius: 0.09, bend: 0.2, seg: 9 }),
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 }),
      160,
    );
    this.flyMesh.count = 0;
    this.flyMesh.frustumCulled = false;
    this.flyMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.group.add(this.flyMesh);
    for (let i = 0; i < 40; i++) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false, depthTest: false }));
      sprite.visible = false;
      sprite.renderOrder = 20;
      this.group.add(sprite);
      this.popups.push({ sprite, t: 0, base: new THREE.Vector3(), active: false });
    }
    this.steamMat = new THREE.SpriteMaterial({ map: softDotTexture(), color: '#ffffff', transparent: true, depthWrite: false, opacity: 0.5 });
    for (let i = 0; i < 120; i++) {
      const sprite = new THREE.Sprite(this.steamMat.clone());
      sprite.visible = false;
      this.group.add(sprite);
      this.puffs.push({ sprite, t: 0, life: 1, vel: new THREE.Vector3(), active: false });
    }
  }

  fly(from: THREE.Vector3, to: THREE.Vector3, dur = 0.45, arc = 1.2) {
    if (this.flyers.length >= 160) return;
    this.flyers.push({ from: from.clone(), to: to.clone(), t: 0, dur, spin: Math.random() * 6, arc });
  }

  private moneyTexture(text: string) {
    let t = this.texCache.get(text);
    if (t) return t;
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 80;
    const ctx = c.getContext('2d')!;
    ctx.font = 'bold 52px Inter, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 9;
    ctx.strokeStyle = 'rgba(10,40,15,0.85)';
    ctx.strokeText(text, 128, 42);
    ctx.fillStyle = '#7dff8a';
    ctx.fillText(text, 128, 42);
    t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    if (this.texCache.size > 200) this.texCache.clear();
    this.texCache.set(text, t);
    return t;
  }

  money(pos: THREE.Vector3, value: number) {
    const p = this.popups.find((x) => !x.active);
    if (!p) return;
    p.active = true;
    p.t = 0;
    p.base.copy(pos);
    const mat = p.sprite.material as THREE.SpriteMaterial;
    mat.map = this.moneyTexture('+' + formatMoney(value));
    mat.needsUpdate = true;
    p.sprite.visible = true;
  }

  steam(pos: THREE.Vector3, color = '#ffffff') {
    const p = this.puffs.find((x) => !x.active);
    if (!p) return;
    p.active = true;
    p.t = 0;
    p.life = 1.2 + Math.random() * 0.8;
    p.vel.set((Math.random() - 0.5) * 0.3, 0.7 + Math.random() * 0.4, (Math.random() - 0.5) * 0.3);
    p.sprite.position.copy(pos);
    (p.sprite.material as THREE.SpriteMaterial).color.set(color);
    p.sprite.visible = true;
  }

  update(dt: number, camDist: number) {
    // Fliegende Bananen
    let n = 0;
    this.flyers = this.flyers.filter((f) => (f.t += dt) < f.dur);
    for (const f of this.flyers) {
      const k = f.t / f.dur;
      this.v.lerpVectors(f.from, f.to, k);
      this.v.y += Math.sin(k * Math.PI) * f.arc;
      this.e.set(k * 6 + f.spin, k * 4, f.spin);
      this.q.setFromEuler(this.e);
      const sc = 1 - k * 0.3;
      this.s.set(sc, sc, sc);
      this.m4.compose(this.v, this.q, this.s);
      this.flyMesh.setMatrixAt(n++, this.m4);
    }
    this.s.set(1, 1, 1);
    this.flyMesh.count = n;
    this.flyMesh.instanceMatrix.needsUpdate = true;

    // Geld-Anzeigen
    const scale = Math.max(1.2, camDist * 0.045);
    for (const p of this.popups) {
      if (!p.active) continue;
      p.t += dt;
      const k = p.t / 1.3;
      if (k >= 1) { p.active = false; p.sprite.visible = false; continue; }
      p.sprite.position.set(p.base.x, p.base.y + k * 1.6 * scale * 0.5, p.base.z);
      p.sprite.scale.set(scale * 1.6, scale * 0.5, 1);
      (p.sprite.material as THREE.SpriteMaterial).opacity = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
    }

    // Dampf
    for (const p of this.puffs) {
      if (!p.active) continue;
      p.t += dt;
      const k = p.t / p.life;
      if (k >= 1) { p.active = false; p.sprite.visible = false; continue; }
      p.sprite.position.addScaledVector(p.vel, dt);
      const s = 0.25 + k * 0.8;
      p.sprite.scale.set(s, s, 1);
      (p.sprite.material as THREE.SpriteMaterial).opacity = 0.45 * (1 - k);
    }
  }
}
