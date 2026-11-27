/*
 * Erzeugt kleine Vorschaubilder (Icons) direkt aus den 3D-Modellen.
 */
import * as THREE from 'three';
import { BUILDING_LIST, BUILDINGS, BELT_TIERS } from '../sim/defs';
import { createModel } from './models';
import { straightBelt, beltTexture, stageVisuals } from './assets';

export type IconMap = Record<string, string>;

export async function renderIcons(): Promise<IconMap> {
  const size = 112;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
  } catch {
    return {};
  }
  renderer.setPixelRatio(1);
  renderer.setSize(size, size, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#ffffff', '#555555', 2.2));
  const key = new THREE.DirectionalLight('#ffffff', 2.4);
  key.position.set(3, 6, 4);
  scene.add(key);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  const out: IconMap = {};

  const shot = (obj: THREE.Object3D, name: string) => {
    scene.add(obj);
    const box = new THREE.Box3().setFromObject(obj);
    const center = box.getCenter(new THREE.Vector3());
    const r = box.getSize(new THREE.Vector3()).length() * 0.5;
    const d = r / Math.sin((cam.fov * Math.PI) / 360) * 0.95;
    cam.position.set(center.x + d * 0.62, center.y + d * 0.58, center.z + d * 0.55);
    cam.lookAt(center);
    renderer.render(scene, cam);
    out[name] = canvas.toDataURL('image/png');
    scene.remove(obj);
  };

  for (const def of BUILDING_LIST) {
    const m = createModel(def.id);
    m.update({ t: 0.3, dt: 0.016, status: 'working', speed: def.speed || 1, fill: 0.7, target: { x: 1, z: -0.4 }, filterStage: 6, tier: 0 });
    m.group.rotation.y = 0;
    shot(m.group, def.id);
    await new Promise((r) => setTimeout(r, 0));
  }
  const visuals = stageVisuals();
  BELT_TIERS.forEach((tier, i) => {
    const g = new THREE.Group();
    const { surface, frame } = straightBelt();
    const tex = beltTexture(tier.color);
    for (const dx of [-1, 0, 1]) {
      const s = new THREE.Mesh(surface, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 }));
      const f = new THREE.Mesh(frame, new THREE.MeshStandardMaterial({ color: tier.color, vertexColors: true, metalness: 0.6, roughness: 0.38 }));
      s.position.x = f.position.x = dx;
      g.add(s, f);
    }
    const item = new THREE.Mesh(visuals[0].geo, visuals[0].mat);
    item.position.y = 0.17;
    item.scale.setScalar(1.6);
    g.add(item);
    shot(g, 'belt' + i);
  });
  visuals.forEach((v, i) => {
    const m = new THREE.Mesh(v.geo, v.mat);
    shot(m, 'stage' + i);
  });
  renderer.dispose();
  renderer.forceContextLoss();
  void BUILDINGS;
  return out;
}
