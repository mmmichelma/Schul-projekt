/*
 * Engine: verbindet Simulation, 3D-Darstellung, Eingabe und Benutzeroberfläche.
 */
import { Sim, Blueprint, rotatedSize, Ent } from './sim/sim';
import { BUILDINGS, BELT_TIERS, DT, DX, DY, ManualUpgradeId, STAGES } from './sim/defs';
import { GameRenderer, QUALITIES } from './render/world';
import { saveGame, loadGame, exportFile, readFile, deleteGame } from './storage/idb';
import { formatMoney } from './render/effects';
import type { IconMap } from './render/icons';

export type Tool =
  | { kind: 'select'; box?: boolean }
  | { kind: 'build'; type: string; dir: number }
  | { kind: 'belt'; tier: number; dir: number }
  | { kind: 'demolish' }
  | { kind: 'move'; id: number; dir: number }
  | { kind: 'paste'; bp: Blueprint };

interface Pointer { x: number; y: number; sx: number; sy: number; type: string; button: number }
type Gesture = 'none' | 'pending' | 'pan' | 'rotate' | 'box' | 'beltDrag' | 'demolishBox' | 'place' | 'pinch';

export interface Toast { id: number; text: string; kind: 'info' | 'good' | 'bad' }
export interface Settings { quality: number; showFps: boolean }

const SETTINGS_KEY = 'banana-mountain-settings';

export class Engine {
  sim: Sim;
  r: GameRenderer | null = null;
  tool: Tool = { kind: 'select' };
  selection: number[] = [];
  clipboard: Blueprint | null = null;
  toasts: Toast[] = [];
  tooltip: { x: number; y: number; text: string; ok: boolean } | null = null;
  selectRect: { x0: number; y0: number; x1: number; y1: number } | null = null;
  icons: IconMap = {};
  fps = 0;
  settings: Settings = { quality: 2, showFps: false };
  lastSaved = 0;
  loaded = false;

  private version = 0;
  private listeners = new Set<() => void>();
  private acc = 0;
  private last = 0;
  private raf = 0;
  private uiTimer = 0;
  private saveTimer = 0;
  private fpsFrames = 0;
  private fpsTime = 0;
  private pointers = new Map<number, Pointer>();
  private gesture: Gesture = 'none';
  private grab: { x: number; z: number } | null = null;
  private pinch: { d: number; a: number; mx: number; my: number } | null = null;
  private path: { x: number; y: number }[] = [];
  private startTile: { x: number; y: number } | null = null;
  private hover: { x: number; y: number } | null = null;
  private keys = new Set<string>();
  private saving = false;
  private toastId = 0;
  private canvas: HTMLCanvasElement | null = null;
  private cleanup: (() => void)[] = [];

  constructor() {
    this.sim = Sim.newGame();
    try {
      const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null');
      if (s) this.settings = { ...this.settings, ...s };
    } catch { /* egal */ }
    // Auf Handys standardmäßig etwas sparsamer
    if (!localStorage.getItem(SETTINGS_KEY) && /Mobi|Android/i.test(navigator.userAgent)) this.settings.quality = 1;
  }

  // ---------------------------------------------------------------- Abo für React
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  getVersion = () => this.version;
  emit() { this.version++; for (const fn of this.listeners) fn(); }

  toast(text: string, kind: Toast['kind'] = 'info') {
    const t = { id: ++this.toastId, text, kind };
    this.toasts = [...this.toasts.slice(-3), t];
    this.emit();
    setTimeout(() => { this.toasts = this.toasts.filter((x) => x.id !== t.id); this.emit(); }, 3200);
  }

  // ---------------------------------------------------------------- Start
  async load() {
    try {
      const data = await loadGame();
      if (data) {
        this.sim = Sim.deserialize(data);
        this.toast('Spielstand geladen – die Fabrik läuft genau dort weiter.', 'good');
      }
    } catch (e) {
      console.warn(e);
      this.toast('Spielstand konnte nicht geladen werden – neues Spiel.', 'bad');
    }
    this.loaded = true;
    this.emit();
  }

  buildMenuOpen = false;

  attach(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.r = new GameRenderer(canvas, this.sim);
    this.r.setQuality(QUALITIES[this.settings.quality]);
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      this.r!.resize(rect.width, rect.height);
    };
    resize();
    // Hochformat (Handy): weiter herauszoomen, damit der ganze Berg zu sehen ist
    const rect0 = canvas.getBoundingClientRect();
    if (rect0.height > rect0.width) { this.r.cam.dist = 150; this.r.cam.tz = 50; }
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    const on = <K extends keyof HTMLElementEventMap>(el: HTMLElement | Window | Document, ev: string, fn: (e: never) => void, opts?: AddEventListenerOptions) => {
      el.addEventListener(ev, fn as EventListener, opts);
      this.cleanup.push(() => el.removeEventListener(ev, fn as EventListener));
      return undefined as unknown as K;
    };
    on(canvas, 'pointerdown', (e: PointerEvent) => this.onDown(e));
    on(canvas, 'pointermove', (e: PointerEvent) => this.onMove(e));
    on(canvas, 'pointerup', (e: PointerEvent) => this.onUp(e));
    on(canvas, 'pointercancel', (e: PointerEvent) => this.onUp(e, true));
    on(canvas, 'pointerleave', () => { this.hover = null; this.tooltip = null; this.updatePreview(); });
    on(canvas, 'wheel', (e: WheelEvent) => { e.preventDefault(); this.r!.zoom(Math.exp(e.deltaY * 0.0012)); }, { passive: false });
    on(canvas, 'contextmenu', (e: Event) => e.preventDefault());
    on(window, 'keydown', (e: KeyboardEvent) => this.onKey(e, true));
    on(window, 'keyup', (e: KeyboardEvent) => this.onKey(e, false));
    on(document, 'visibilitychange', () => { if (document.hidden) this.save(); });
    on(window, 'beforeunload', () => this.save());
    this.cleanup.push(() => ro.disconnect());
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
    import('./render/icons').then((m) => m.renderIcons()).then((icons) => { this.icons = icons; this.emit(); });
  }

  detach() {
    cancelAnimationFrame(this.raf);
    this.cleanup.forEach((f) => f());
    this.cleanup = [];
  }

  // ---------------------------------------------------------------- Spielschleife
  private loop = (now: number) => {
    this.raf = requestAnimationFrame(this.loop);
    // Große Pausen (Tab im Hintergrund) werden NICHT nachgeholt – kein Offline-Farmen
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.acc += dt;
    let steps = 0;
    while (this.acc >= DT && steps < 10) { this.sim.step(); this.acc -= DT; steps++; }
    if (steps === 10) this.acc = 0;
    this.keyboardCamera(dt);
    this.r!.render(dt, this.acc / DT);
    this.fpsFrames++;
    this.fpsTime += dt;
    if (this.fpsTime >= 1) { this.fps = Math.round(this.fpsFrames / this.fpsTime); this.fpsFrames = 0; this.fpsTime = 0; }
    this.uiTimer += dt;
    if (this.uiTimer > 0.2) { this.uiTimer = 0; this.emit(); }
    this.saveTimer += dt;
    if (this.saveTimer > 15) { this.saveTimer = 0; this.save(); }
  };

  private keyboardCamera(dt: number) {
    if (!this.keys.size || !this.r) return;
    const c = this.r.cam;
    const sp = c.dist * 0.9 * dt;
    const fx = -Math.sin(c.yaw), fz = -Math.cos(c.yaw);
    const rx = Math.cos(c.yaw), rz = -Math.sin(c.yaw);
    let mx = 0, mz = 0;
    if (this.keys.has('w') || this.keys.has('arrowup')) { mx += fx; mz += fz; }
    if (this.keys.has('s') || this.keys.has('arrowdown')) { mx -= fx; mz -= fz; }
    if (this.keys.has('d') || this.keys.has('arrowright')) { mx += rx; mz += rz; }
    if (this.keys.has('a') || this.keys.has('arrowleft')) { mx -= rx; mz -= rz; }
    if (mx || mz) this.r.pan(mx * sp, mz * sp);
    if (this.keys.has('q')) this.r.rotate(dt * 1.6, 0);
    if (this.keys.has('e')) this.r.rotate(-dt * 1.6, 0);
  }

  // ---------------------------------------------------------------- Speichern
  async save() {
    if (this.saving) return;
    this.saving = true;
    try {
      await saveGame(this.sim.serialize());
      this.lastSaved = Date.now();
    } catch (e) {
      console.warn('Speichern fehlgeschlagen', e);
    }
    this.saving = false;
  }

  exportSave() { exportFile(this.sim.serialize()); }

  async importSave(file: File) {
    try {
      const data = await readFile(file);
      const sim = Sim.deserialize(data);
      this.setSim(sim);
      await this.save();
      this.toast('Spielstand importiert.', 'good');
    } catch (e) {
      this.toast('Import fehlgeschlagen: ' + (e as Error).message, 'bad');
    }
  }

  async newGame() {
    await deleteGame();
    this.setSim(Sim.newGame());
    await this.save();
    this.toast('Neues Spiel: 1.000.000 Bananen warten auf dich!', 'good');
  }

  private setSim(sim: Sim) {
    this.sim = sim;
    this.selection = [];
    this.tool = { kind: 'select' };
    this.r?.setSim(sim);
    this.r?.setSelection([]);
    this.emit();
  }

  setSettings(s: Partial<Settings>) {
    this.settings = { ...this.settings, ...s };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
    if (s.quality !== undefined) this.r?.setQuality(QUALITIES[s.quality]);
    this.emit();
  }

  // ---------------------------------------------------------------- Werkzeuge & Aktionen
  setTool(t: Tool) {
    this.tool = t;
    this.gesture = 'none';
    this.path = [];
    if (t.kind !== 'select') this.select([]);
    this.updatePreview();
    this.emit();
  }

  select(ids: number[]) {
    this.selection = ids.filter((id) => this.sim.get(id));
    this.r?.setSelection(this.selection);
    this.emit();
  }

  rotateTool() {
    const t = this.tool;
    if (t.kind === 'build' || t.kind === 'belt' || t.kind === 'move') { t.dir = (t.dir + 1) % 4; this.updatePreview(); this.emit(); return; }
    if (this.selection.length === 1) {
      if (!this.sim.rotate(this.selection[0])) this.toast('Drehen nicht möglich – kein Platz.', 'bad');
      this.emit();
    }
  }

  demolishSelection() {
    let refund = 0;
    for (const id of this.selection) {
      const e = this.sim.get(id);
      if (e) { refund += e.invested; this.sim.demolish(id); }
    }
    if (this.selection.length) this.toast(`Abgerissen – ${formatMoney(refund)} erstattet.`, 'good');
    this.select([]);
  }

  upgradeSelection() {
    let n = 0;
    for (const id of this.selection) if (this.sim.upgrade(id)) n++;
    if (!n) this.toast('Nicht genug Geld oder schon maximal.', 'bad');
    this.emit();
  }

  upgradeSelectionCost(): number {
    let c = 0;
    for (const id of this.selection) c += this.sim.upgradePrice(id) || 0;
    return c;
  }

  toggleSelection() {
    for (const id of this.selection) this.sim.toggle(id);
    this.emit();
  }

  copySelection() {
    const bp = this.sim.copy(this.selection);
    if (!bp) return;
    this.clipboard = bp;
    this.setTool({ kind: 'paste', bp });
    this.toast(`${bp.entries.length} Teile kopiert – klicke zum Einfügen (${formatMoney(this.sim.blueprintCost(bp))}).`);
  }

  startMove() {
    if (this.selection.length !== 1) return;
    const e = this.sim.get(this.selection[0]);
    if (e) this.setTool({ kind: 'move', id: e.id, dir: e.dir });
  }

  sellSalvage() {
    const v = this.sim.sellSalvage();
    this.toast(`Bergungskiste verkauft: +${formatMoney(v)}`, 'good');
  }

  // Handarbeit
  peelStrip(strip: number) { const n = this.sim.manualPeel(strip); this.emit(); return n; }
  manualSellAll() { this.sim.manualSellAll(); this.emit(); }
  buyManual(id: ManualUpgradeId) { if (!this.sim.buyManualUpgrade(id)) this.toast('Nicht genug Geld.', 'bad'); this.emit(); }
  grabFromPile() {
    const n = this.sim.manualTake(-1);
    if (!n) this.toast(this.sim.manual.slots.length >= this.sim.hands ? 'Deine Hände sind voll – erst schälen!' : 'Keine Bananen mehr.', 'bad');
    this.emit();
  }

  focusPile() { this.r?.focus(64, 60); }

  // ---------------------------------------------------------------- Vorschau
  private placementOrigin(type: string, dir: number, tile: { x: number; y: number }) {
    const [w, h] = rotatedSize(BUILDINGS[type], dir);
    return { x: tile.x - Math.floor((w - 1) / 2), y: tile.y - Math.floor((h - 1) / 2) };
  }

  private beltCells() {
    const t = this.tool as { kind: 'belt'; tier: number; dir: number };
    const p = this.path;
    return p.map((c, i) => {
      let dir = t.dir;
      if (i < p.length - 1) dir = dirBetween(c, p[i + 1]);
      else if (i > 0) dir = dirBetween(p[i - 1], c);
      const e = this.sim.entAt(c.x, c.y);
      return { x: c.x, y: c.y, dir, ok: this.sim.cellFree(c.x, c.y) || (!!e && e.kind === 'belt') };
    });
  }

  private updatePreview() {
    const r = this.r;
    if (!r) return;
    const t = this.tool;
    const h = this.hover;
    r.preview = { kind: 'none' };
    this.tooltip = null;
    const at = this.lastPointer;
    if (t.kind === 'build' && h) {
      const o = this.placementOrigin(t.type, t.dir, h);
      const def = BUILDINGS[t.type];
      const fits = this.sim.canPlace(t.type, o.x, o.y, t.dir);
      const money = this.sim.money >= def.price;
      r.preview = { kind: 'building', type: t.type, x: o.x, y: o.y, dir: t.dir, valid: fits && money };
      if (at) this.tooltip = { x: at.x, y: at.y, ok: fits && money, text: `${def.name} – ${formatMoney(def.price)}${!money ? ' (zu wenig Geld)' : !fits ? ' (kein Platz)' : ''}` };
    } else if (t.kind === 'move' && h) {
      const e = this.sim.get(t.id);
      if (e && e.kind === 'building') {
        const o = this.placementOrigin(e.type, t.dir, h);
        r.preview = { kind: 'building', type: e.type, x: o.x, y: o.y, dir: t.dir, valid: this.sim.canPlace(e.type, o.x, o.y, t.dir, e.id) };
      } else if (e) {
        r.preview = { kind: 'belt', cells: [{ x: h.x, y: h.y, dir: t.dir, ok: this.sim.cellFree(h.x, h.y, e.id) }] };
      }
    } else if (t.kind === 'belt') {
      if (this.gesture === 'beltDrag' && this.path.length) {
        const cells = this.beltCells();
        r.preview = { kind: 'belt', cells };
        const cost = this.sim.beltPathCost(cells, t.tier);
        if (at) this.tooltip = { x: at.x, y: at.y, ok: cost <= this.sim.money, text: `${cells.length} Felder – ${formatMoney(cost)}` };
      } else if (h) {
        r.preview = { kind: 'belt', cells: [{ x: h.x, y: h.y, dir: t.dir, ok: this.sim.cellFree(h.x, h.y) }] };
      }
    } else if (t.kind === 'paste' && h) {
      const valid = this.sim.blueprintValid(t.bp, h.x, h.y) && this.sim.money >= this.sim.blueprintCost(t.bp);
      r.preview = { kind: 'blueprint', blueprint: t.bp, x: h.x, y: h.y, valid };
      if (at) this.tooltip = { x: at.x, y: at.y, ok: valid, text: `Einfügen – ${formatMoney(this.sim.blueprintCost(t.bp))}` };
    } else if (t.kind === 'demolish') {
      if (this.gesture === 'demolishBox' && this.startTile && h) {
        r.preview = { kind: 'demolish', rect: rectOf(this.startTile, h) };
      } else if (h) {
        const e = this.sim.entAt(h.x, h.y);
        if (e) {
          const w = e.kind === 'belt' ? 1 : e.w, hh = e.kind === 'belt' ? 1 : e.h;
          r.preview = { kind: 'demolish', rect: { x0: e.x, y0: e.y, x1: e.x + w - 1, y1: e.y + hh - 1 } };
          if (at) this.tooltip = { x: at.x, y: at.y, ok: true, text: `Abreißen: +${formatMoney(e.invested)} zurück` };
        }
      }
    } else if (t.kind === 'select' && this.gesture === 'box' && this.startTile && h) {
      r.preview = { kind: 'none', rect: rectOf(this.startTile, h) };
    }
  }

  private lastPointer: { x: number; y: number } | null = null;

  // ---------------------------------------------------------------- Eingabe
  private onDown(e: PointerEvent) {
    if (!this.r || !this.canvas) return;
    this.canvas.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, type: e.pointerType, button: e.button });
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.gesture = 'pinch';
      this.path = [];
      this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), a: Math.atan2(b.y - a.y, b.x - a.x), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
      const g = this.r.groundPoint(this.pinch.mx, this.pinch.my);
      this.grab = g ? { x: g.x, z: g.z } : null;
      this.updatePreview();
      return;
    }
    if (this.pointers.size > 2) return;
    const tile = this.r.pickTile(e.clientX, e.clientY);
    this.hover = tile;
    if (e.button === 2) { this.gesture = 'rotate'; return; }
    const g = this.r.groundPoint(e.clientX, e.clientY);
    this.grab = g ? { x: g.x, z: g.z } : null;
    if (e.button === 1) { this.gesture = 'pan'; return; }
    const t = this.tool;
    if (t.kind === 'select') {
      this.gesture = e.shiftKey || t.box ? 'box' : 'pending';
      this.startTile = tile;
    } else if (t.kind === 'belt' && tile) {
      this.gesture = 'beltDrag';
      this.path = [tile];
    } else if (t.kind === 'demolish') {
      this.gesture = 'demolishBox';
      this.startTile = tile;
    } else {
      this.gesture = 'place';
    }
    this.updatePreview();
  }

  private onMove(e: PointerEvent) {
    if (!this.r) return;
    this.lastPointer = { x: e.clientX, y: e.clientY };
    const p = this.pointers.get(e.pointerId);
    const prev = p ? { x: p.x, y: p.y } : null;
    if (p) { p.x = e.clientX; p.y = e.clientY; }
    if (this.gesture === 'pinch' && this.pointers.size >= 2 && this.pinch) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      this.r.zoom(this.pinch.d / Math.max(10, d));
      this.r.rotate(-(ang - this.pinch.a), 0);
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const gp = this.r.groundPoint(mx, my);
      if (gp && this.grab) this.r.pan(this.grab.x - gp.x, this.grab.z - gp.z);
      this.pinch = { d, a: ang, mx, my };
      return;
    }
    const moved = p ? Math.hypot(p.x - p.sx, p.y - p.sy) : 0;
    if (this.gesture === 'rotate' && prev && p) {
      this.r.rotate(-(p.x - prev.x) * 0.006, (p.y - prev.y) * 0.004);
      return;
    }
    if ((this.gesture === 'pending' && moved > 6) || (this.gesture === 'place' && p && p.type !== 'mouse' && moved > 14)) this.gesture = 'pan';
    if (this.gesture === 'pan') {
      const gp = this.r.groundPoint(e.clientX, e.clientY);
      if (gp && this.grab) this.r.pan(this.grab.x - gp.x, this.grab.z - gp.z);
      return;
    }
    const tile = this.r.pickTile(e.clientX, e.clientY);
    const changed = !tile || !this.hover || tile.x !== this.hover.x || tile.y !== this.hover.y;
    this.hover = tile;
    if (this.gesture === 'beltDrag' && tile) this.extendPath(tile);
    if (changed || this.tooltip) this.updatePreview();
  }

  private onUp(e: PointerEvent, cancel = false) {
    const p = this.pointers.get(e.pointerId);
    this.pointers.delete(e.pointerId);
    if (!this.r) return;
    if (this.gesture === 'pinch') {
      if (this.pointers.size === 0) this.gesture = 'none';
      return;
    }
    if (cancel || !p) { this.gesture = 'none'; this.path = []; this.updatePreview(); return; }
    const tile = this.r.pickTile(e.clientX, e.clientY);
    const t = this.tool;
    switch (this.gesture) {
      case 'pending': this.clickSelect(e); break;
      case 'place': if (tile) this.placeAt(tile); break;
      case 'box':
        if (this.startTile && tile) {
          const rc = rectOf(this.startTile, tile);
          const ids = new Set<number>(e.shiftKey ? this.selection : []);
          for (let y = rc.y0; y <= rc.y1; y++) for (let x = rc.x0; x <= rc.x1; x++) { const en = this.sim.entAt(x, y); if (en) ids.add(en.id); }
          this.select([...ids]);
          if (ids.size) this.toast(`${ids.size} Teile ausgewählt.`);
        }
        break;
      case 'beltDrag':
        if (t.kind === 'belt' && this.path.length) {
          const cells = this.beltCells().filter((c) => c.ok);
          const n = this.sim.placeBeltPath(cells, t.tier);
          if (n < cells.length) this.toast(n ? `Nur ${n} von ${cells.length} Feldern gebaut – zu wenig Geld.` : 'Zu wenig Geld für Förderbänder.', 'bad');
        }
        this.path = [];
        break;
      case 'demolishBox':
        if (this.startTile && tile) {
          const rc = rectOf(this.startTile, tile);
          const ids = new Set<number>();
          for (let y = rc.y0; y <= rc.y1; y++) for (let x = rc.x0; x <= rc.x1; x++) { const en = this.sim.entAt(x, y); if (en) ids.add(en.id); }
          let refund = 0;
          for (const id of ids) { refund += this.sim.get(id)!.invested; this.sim.demolish(id); }
          if (ids.size) this.toast(`${ids.size} Teile abgerissen – ${formatMoney(refund)} erstattet.`, 'good');
          if (this.sim.salvage.length) this.toast(`${this.sim.salvage.length} Bananen liegen in der Bergungskiste.`);
        }
        break;
      default: break;
    }
    this.gesture = this.pointers.size ? this.gesture : 'none';
    this.startTile = null;
    this.updatePreview();
    this.emit();
  }

  private clickSelect(e: PointerEvent) {
    const r = this.r!;
    const ent = r.pickEntity(e.clientX, e.clientY);
    if (ent) {
      if (e.shiftKey) this.select(this.selection.includes(ent.id) ? this.selection.filter((i) => i !== ent.id) : [...this.selection, ent.id]);
      else this.select([ent.id]);
      return;
    }
    const tile = r.pickPile(e.clientX, e.clientY);
    if (tile >= 0) {
      const n = this.sim.manualTake(tile);
      if (!n) this.toast('Deine Hände sind voll – schäl erst die Banane!', 'bad');
      this.emit();
      return;
    }
    this.select([]);
  }

  private placeAt(tile: { x: number; y: number }) {
    const t = this.tool;
    if (t.kind === 'build') {
      const o = this.placementOrigin(t.type, t.dir, tile);
      const def = BUILDINGS[t.type];
      if (this.sim.money < def.price) { this.toast(`Zu wenig Geld für ${def.name}.`, 'bad'); return; }
      if (!this.sim.place(t.type, o.x, o.y, t.dir)) this.toast('Hier ist kein Platz (Bananen oder Gebäude im Weg).', 'bad');
    } else if (t.kind === 'move') {
      const e = this.sim.get(t.id);
      if (!e) return;
      const o = e.kind === 'building' ? this.placementOrigin(e.type, t.dir, tile) : tile;
      if (this.sim.move(t.id, o.x, o.y, t.dir)) { this.setTool({ kind: 'select' }); this.select([t.id]); }
      else this.toast('Hier ist kein Platz.', 'bad');
    } else if (t.kind === 'paste') {
      if (!this.sim.paste(t.bp, tile.x, tile.y)) this.toast('Einfügen nicht möglich (Platz oder Geld).', 'bad');
    }
  }

  private extendPath(tile: { x: number; y: number }) {
    const p = this.path;
    let last = p[p.length - 1];
    if (last.x === tile.x && last.y === tile.y) return;
    if (p.length >= 2 && p[p.length - 2].x === tile.x && p[p.length - 2].y === tile.y) { p.pop(); return; }
    let guard = 0;
    while ((last.x !== tile.x || last.y !== tile.y) && guard++ < 300) {
      const dx = tile.x - last.x, dy = tile.y - last.y;
      const next = Math.abs(dx) >= Math.abs(dy) ? { x: last.x + Math.sign(dx), y: last.y } : { x: last.x, y: last.y + Math.sign(dy) };
      const at = p.findIndex((c) => c.x === next.x && c.y === next.y);
      if (at >= 0) p.length = at + 1; else p.push(next);
      last = p[p.length - 1];
    }
  }

  private onKey(e: KeyboardEvent, down: boolean) {
    if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
    const k = e.key.toLowerCase();
    if (['w', 'a', 's', 'd', 'q', 'e', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) {
      if (down) this.keys.add(k); else this.keys.delete(k);
      return;
    }
    if (!down) return;
    if (k === 'r') this.rotateTool();
    else if (k === 'escape') { this.setTool({ kind: 'select' }); this.select([]); }
    else if (k === 'delete' || k === 'backspace') this.demolishSelection();
    else if (k === 'u') this.upgradeSelection();
    else if (k === 'c' && (e.ctrlKey || e.metaKey)) this.copySelection();
    else if (k === 'v' && (e.ctrlKey || e.metaKey) && this.clipboard) this.setTool({ kind: 'paste', bp: this.clipboard });
    else if (k === 'b') this.setTool({ kind: 'belt', tier: 0, dir: 0 });
    else if (k === 'x') this.setTool({ kind: 'demolish' });
    else if (k === ' ') { e.preventDefault(); this.grabFromPile(); }
  }

  // ---------------------------------------------------------------- Hilfen für die Oberfläche
  selected(): Ent | undefined { return this.selection.length === 1 ? this.sim.get(this.selection[0]) : undefined; }
  stageName(s: number) { return STAGES[s].name; }
  beltName(t: number) { return BELT_TIERS[t].name; }
  screenOf(x: number, y: number, z: number) { return this.r?.toScreen(x, y, z); }
}

function dirBetween(a: { x: number; y: number }, b: { x: number; y: number }) {
  for (let d = 0; d < 4; d++) if (a.x + DX[d] === b.x && a.y + DY[d] === b.y) return d;
  return 0;
}

function rectOf(a: { x: number; y: number }, b: { x: number; y: number }) {
  return { x0: Math.min(a.x, b.x), y0: Math.min(a.y, b.y), x1: Math.max(a.x, b.x), y1: Math.max(a.y, b.y) };
}
