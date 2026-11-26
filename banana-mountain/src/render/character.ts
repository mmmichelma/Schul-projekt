/*
 * Spielfigur: Fabrikarbeiter mit Gelenken (Hüfte, Knie, Schultern, Ellbogen, Kopf)
 * und Animationen für Stehen, Gehen, Rennen, Springen und Greifen.
 * Blickrichtung: +x (wie alle Modelle im Spiel).
 */
import * as THREE from 'three';
import { bananaGeometry } from './assets';

const std = (color: string, rough = 0.6, metal = 0, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra });

const G = {
  thigh: new THREE.CapsuleGeometry(0.075, 0.26, 4, 10),
  shin: new THREE.CapsuleGeometry(0.065, 0.26, 4, 10),
  boot: new THREE.BoxGeometry(0.24, 0.1, 0.13),
  hips: new THREE.CapsuleGeometry(0.12, 0.1, 4, 12),
  torso: new THREE.CapsuleGeometry(0.17, 0.24, 6, 14),
  head: new THREE.SphereGeometry(0.2, 20, 16),
  helmet: new THREE.SphereGeometry(0.215, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55),
  brim: new THREE.CylinderGeometry(0.25, 0.25, 0.025, 20),
  upper: new THREE.CapsuleGeometry(0.058, 0.18, 4, 10),
  fore: new THREE.CapsuleGeometry(0.05, 0.17, 4, 10),
  hand: new THREE.SphereGeometry(0.06, 10, 8),
  eye: new THREE.SphereGeometry(0.03, 10, 8),
  stripe: new THREE.BoxGeometry(0.36, 0.035, 0.37),
  pack: new THREE.BoxGeometry(0.22, 0.3, 0.3),
};

export interface CharacterLook { shirt: string; vest: string; pants: string; skin: string; helmet: string }
export const DEFAULT_LOOK: CharacterLook = { shirt: '#3a6fd8', vest: '#ff8a1f', pants: '#2c3a5c', skin: '#eab894', helmet: '#ffd21f' };

function m(parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) {
  const o = new THREE.Mesh(geo, mat);
  o.position.set(x, y, z);
  o.castShadow = true;
  parent.add(o);
  return o;
}
function j(parent: THREE.Object3D, x = 0, y = 0, z = 0) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}
const damp = (a: number, b: number, k: number, dt: number) => a + (b - a) * (1 - Math.exp(-k * dt));

let heldGeo: THREE.BufferGeometry | null = null;

export class Character {
  root = new THREE.Group();
  private J: Record<string, THREE.Object3D> = {};
  private phase = 0;
  private t = Math.random() * 10;
  private w = { walk: 0, air: 0, grab: 0 };
  private blink = 3;
  private eyes: THREE.Mesh[] = [];
  private held: THREE.Mesh;
  grabTimer = 0;
  onStep: (() => void) | null = null;

  constructor(look: CharacterLook = DEFAULT_LOOK) {
    const skin = std(look.skin, 0.55), shirt = std(look.shirt, 0.8), vest = std(look.vest, 0.6);
    const pants = std(look.pants, 0.85), boot = std('#3a2a1a', 0.7), helmet = std(look.helmet, 0.35, 0.1);
    const refl = std('#e8e8e8', 0.2, 0.6, { emissive: '#555555', emissiveIntensity: 0.4 });
    const J = this.J;
    const body = j(this.root);
    J.hips = j(body, 0, 0.74, 0);
    const hip = m(J.hips, G.hips, pants, 0, 0, 0);
    hip.rotation.x = Math.PI / 2;
    for (const [n, z] of [['L', -0.1], ['R', 0.1]] as const) {
      const h = j(J.hips, 0, -0.02, z);
      m(h, G.thigh, pants, 0, -0.15, 0);
      const k = j(h, 0, -0.32, 0);
      m(k, G.shin, pants, 0, -0.14, 0);
      const a = j(k, 0, -0.3, 0);
      m(a, G.boot, boot, 0.04, -0.03, 0);
      J['hip' + n] = h; J['knee' + n] = k; J['ankle' + n] = a;
    }
    J.spine = j(J.hips, 0, 0.05, 0);
    const torso = m(J.spine, G.torso, shirt, 0, 0.25, 0);
    torso.scale.set(0.8, 1, 1);
    // Warnweste mit Reflexstreifen
    const v = m(J.spine, G.torso, vest, 0, 0.25, 0);
    v.scale.set(0.84, 0.82, 1.04);
    m(J.spine, G.stripe, refl, 0, 0.2, 0).scale.set(0.8, 1, 1);
    m(J.spine, G.stripe, refl, 0, 0.32, 0).scale.set(0.8, 1, 1);
    m(J.spine, G.pack, std('#6b4a2a', 0.9), -0.2, 0.28, 0);
    J.neck = j(J.spine, 0, 0.5, 0);
    J.head = j(J.neck, 0, 0.17, 0);
    m(J.head, G.head, skin);
    m(J.head, G.helmet, helmet, 0, 0.03, 0);
    m(J.head, G.brim, helmet, 0.05, 0.04, 0).scale.set(1.15, 1, 1);
    const dark = std('#1d1410', 0.3);
    for (const z of [-0.07, 0.07]) { const e = m(J.head, G.eye, dark, 0.18, 0.02, z); e.castShadow = false; this.eyes.push(e); }
    const mouth = m(J.head, new THREE.TorusGeometry(0.04, 0.008, 6, 12, Math.PI), std('#7a2a2a'), 0.19, -0.07, 0);
    mouth.rotation.set(0, Math.PI / 2, Math.PI);
    for (const [n, z] of [['L', -0.22], ['R', 0.22]] as const) {
      const sh = j(J.spine, 0, 0.42, z);
      m(sh, G.upper, shirt, 0, -0.11, 0);
      const el = j(sh, 0, -0.24, 0);
      m(el, G.fore, skin, 0, -0.1, 0);
      const wr = j(el, 0, -0.22, 0);
      m(wr, G.hand, skin, 0, -0.03, 0);
      J['sh' + n] = sh; J['el' + n] = el; J['wr' + n] = wr;
    }
    if (!heldGeo) heldGeo = bananaGeometry({ len: 0.5, radius: 0.07, bend: 0.12, seg: 12 });
    this.held = new THREE.Mesh(heldGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 }));
    this.held.position.set(0.05, -0.08, 0);
    this.held.rotation.set(0, Math.PI / 2, 0.3);
    this.held.castShadow = true;
    J.wrR.add(this.held);
    this.held.visible = false;
  }

  setHolding(v: boolean) { this.held.visible = v; }
  grab() { this.grabTimer = 0.45; }

  update(dt: number, speed: number, air: boolean) {
    this.t += dt;
    this.grabTimer = Math.max(0, this.grabTimer - dt);
    const J = this.J, w = this.w;
    w.walk = damp(w.walk, air ? 0 : Math.min(1, speed / 2), 10, dt);
    w.air = damp(w.air, air ? 1 : 0, 10, dt);
    w.grab = damp(w.grab, this.grabTimer > 0 ? 1 : 0, 16, dt);
    const run = Math.min(1, Math.max(0, (speed - 4) / 4));
    const prev = this.phase;
    this.phase += dt * (speed * 2.2 + 0.001);
    if (this.onStep && w.walk > 0.5 && Math.floor(prev / Math.PI) !== Math.floor(this.phase / Math.PI)) this.onStep();
    const s = Math.sin(this.phase), ww = w.walk, amp = 0.6 + run * 0.35;
    const breathe = Math.sin(this.t * 2.1);
    const T: Record<string, number> = {
      hipL: -s * amp * ww + 0.7 * w.air, hipR: s * amp * ww - 0.15 * w.air,
      kneeL: ww * (0.1 + 0.9 * Math.max(0, Math.sin(this.phase - 1.3))) + 1.0 * w.air,
      kneeR: ww * (0.1 + 0.9 * Math.max(0, Math.sin(this.phase + Math.PI - 1.3))) + 0.4 * w.air,
      shL: s * (0.55 + run * 0.4) * ww + 0.3 * w.air, shR: -s * (0.55 + run * 0.4) * ww - 0.2 * w.air,
      elL: -0.15 - ww * (0.3 + run * 0.9), elR: -0.15 - ww * (0.3 + run * 0.9),
      spine: ww * (0.04 + run * 0.15), lift: ww * (Math.abs(Math.cos(this.phase)) * 0.04 - 0.015),
    };
    // Greifen: rechter Arm nach vorne
    T.shR = T.shR * (1 - w.grab) + 1.4 * w.grab;
    T.elR = T.elR * (1 - w.grab) - 0.2 * w.grab;
    if (this.held.visible) { T.shR = Math.max(T.shR, 0.5); T.elR = -1.1; }
    const k = 16;
    // Drehung um z: positiv = Bein/Arm schwingt nach vorne (+x)
    const rz = (o: THREE.Object3D, v: number) => { o.rotation.z = damp(o.rotation.z, v, k, dt); };
    rz(J.hipL, T.hipL); rz(J.hipR, T.hipR);
    rz(J.kneeL, -T.kneeL); rz(J.kneeR, -T.kneeR);
    rz(J.shL, T.shL); rz(J.shR, T.shR);
    rz(J.elL, -T.elL); rz(J.elR, -T.elR);
    J.spine.rotation.z = damp(J.spine.rotation.z, -T.spine, k, dt);
    J.shL.rotation.x = damp(J.shL.rotation.x, -0.08 - 0.7 * w.air, k, dt);
    J.shR.rotation.x = damp(J.shR.rotation.x, 0.08 + 0.7 * w.air, k, dt);
    J.hips.position.y = damp(J.hips.position.y, 0.74 + T.lift, k, dt);
    J.neck.rotation.y = Math.sin(this.t * 0.7) * 0.15 * (1 - ww);
    J.spine.scale.y = 1 + breathe * 0.01;
    this.blink -= dt;
    let e = 1;
    if (this.blink < 0) { e = 0.15; if (this.blink < -0.12) this.blink = 2 + Math.random() * 4; }
    for (const eye of this.eyes) eye.scale.y = e;
  }
}

// Namensschild über Mitspielern
export function nameSprite(name: string, color: string): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = 'rgba(15,18,24,0.85)';
  ctx.fillRect(0, 0, 256, 64);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 10, 64);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 34px Inter, Arial, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText(name, 22, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sp.scale.set(1.6, 0.4, 1);
  sp.renderOrder = 16;
  return sp;
}
