/*
 * Engine: verbindet Simulation, 3D-Darstellung, Eingabe und Benutzeroberfläche.
 */
import { ls } from './storage/local';
import { startMusic, setVolumes, setFactoryActivity } from './ui/music';
import { sfx } from './ui/sound';
import { Sim, Blueprint, rotatedSize, Ent, LOCAL, Manual } from './sim/sim';
import { Cmd, applyCmd, validCmd, simHash } from './sim/commands';
import { Online, WorldLink, OnlineUser } from './net/online';
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
export interface Settings {
  quality: number; showFps: boolean;
  // Grafik
  shadows: 'auto' | 'on' | 'off'; resScale: number; lodScale: number; fpsLimit: number; effects: boolean; fov: number;
  // Audio
  master: number; music: number; sfx: number; musicOn: boolean;
  // Steuerung
  sensitivity: number; invertY: boolean; runToggle: boolean;
  // Spiel
  hints: boolean; startView: 'walk' | 'build';
}
export const DEFAULT_SETTINGS: Settings = {
  quality: 2, showFps: false, shadows: 'auto', resScale: 1, lodScale: 1, fpsLimit: 0, effects: true, fov: 42,
  master: 0.8, music: 0.5, sfx: 0.8, musicOn: true, sensitivity: 1, invertY: false, runToggle: false,
  hints: true, startView: 'walk',
};
export type View = 'walk' | 'build';

const SETTINGS_KEY = 'banana-mountain-settings';

export type Mode = 'offline' | 'host' | 'guest';
export interface ChatLine { id: number; name: string; text: string; mine: boolean }
export interface Cursor { name: string; x: number; z: number; t: number }

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
  settings: Settings = { ...DEFAULT_SETTINGS };
  // ---------------------------------------------------------------- Laufen
  view: View = 'walk';
  player = { x: 59.5, z: 85, y: 0, vx: 0, vz: 0, vy: 0, yaw: Math.PI / 2, speed: 0, air: false };
  joy = { x: 0, y: 0 };      // Touch-Joystick
  running = false;
  private lastAvatarSend = 0;
  private lastRender = 0;
  private activityTimer = 0;
  lastSaved = 0;
  loaded = false;

  // ---------------------------------------------------------------- Online
  mode: Mode = 'offline';
  pid = LOCAL;               // wer bin ich in der Simulation (eigene Hände)
  net = new Online();
  worldOwner: string | null = null;
  worldOwnerName = '';
  players: OnlineUser[] = [];
  chat: ChatLine[] = [];
  cursors = new Map<string, Cursor>();
  syncing = false;           // Gast wartet auf den Spielstand des Gastgebers
  private link: WorldLink | null = null;
  private epoch = 0;
  private pending: { pid: string; cmd: Cmd }[] = [];
  private outCmds: [number, string, Cmd][] = [];
  private sendTimer = 0;
  private gCmds = new Map<number, [string, Cmd][]>();
  private hostTick = 0;
  private hostHash: [number, string] | null = null;
  private lastResync = -1e9;
  private lastSyncServe = 0;
  private ownerMissing = 0;
  private lastCursor = 0;
  private chatId = 0;

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
      const s = JSON.parse(ls.get(SETTINGS_KEY) || 'null');
      if (s) this.settings = { ...this.settings, ...s };
    } catch { /* egal */ }
    // Auf Handys standardmäßig etwas sparsamer
    if (!ls.get(SETTINGS_KEY) && /Mobi|Android/i.test(navigator.userAgent)) this.settings.quality = 1;
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
  // Ohne Konto: Spielstand aus diesem Browser (IndexedDB)
  async startOffline() {
    await this.leaveWorld();
    this.mode = 'offline';
    this.pid = LOCAL;
    let sim = Sim.newGame();
    try {
      const data = await loadGame();
      if (data) {
        sim = Sim.deserialize(data);
        this.toast('Spielstand geladen – die Fabrik läuft genau dort weiter.', 'good');
      }
    } catch (e) {
      console.warn(e);
      this.toast('Spielstand konnte nicht geladen werden – neues Spiel.', 'bad');
    }
    this.setSim(sim);
    this.loaded = true;
    this.emit();
  }

  // Mit Konto: die eigene Fabrik liegt auf dem Server, ich bin Gastgeber
  async startOnline() {
    const me = this.net.me!;
    await this.leaveWorld();
    let sim: Sim;
    const data = await this.net.loadWorld(me.id);
    if (data) {
      sim = Sim.deserialize(data);
    } else {
      // Erste Anmeldung: Offline-Spielstand übernehmen, falls vorhanden
      const local = await loadGame().catch(() => null);
      sim = local ? Sim.deserialize(local) : Sim.newGame();
      this.toast(local ? 'Dein Offline-Spielstand wurde in dein Konto übernommen.' : 'Deine eigene Fabrik wurde angelegt!', 'good');
    }
    if (sim.manuals[LOCAL] && !sim.manuals[me.id]) { sim.manuals[me.id] = sim.manuals[LOCAL]; delete sim.manuals[LOCAL]; }
    this.mode = 'host';
    this.pid = me.id;
    this.epoch = Date.now() % 1e9;
    this.worldOwner = me.id;
    this.worldOwnerName = me.name;
    this.setSim(sim);
    this.link = this.net.openWorld(me.id, this.hostHandlers(), (p) => this.onPlayers(p), () => {});
    await this.net.joinLobby(me.id);
    this.net.onChange = () => this.emit();
    await this.save();
    this.loaded = true;
    this.emit();
  }

  // Einer Freundes-Fabrik beitreten (als Gast)
  async joinFriend(id: string, name: string) {
    if (this.worldOwner === id) return;
    await this.leaveWorld();
    this.mode = 'guest';
    this.pid = this.net.me!.id;
    this.worldOwner = id;
    this.worldOwnerName = name;
    this.syncing = true;
    this.epoch = 0;
    this.gCmds.clear();
    this.hostTick = 0;
    this.hostHash = null;
    this.ownerMissing = 0;
    this.lastResync = -1e9;
    this.link = this.net.openWorld(id, this.guestHandlers(), (p) => this.onPlayers(p), () => this.requestResync(true));
    await this.net.setWorld(id);
    this.toast(`Verbinde mit der Fabrik von ${name} …`);
    this.emit();
  }

  async goHome(reason?: string) {
    if (reason) this.toast(reason, 'bad');
    await this.startOnline();
  }

  async logout() {
    await this.leaveWorld();
    await this.net.logout();
    this.mode = 'offline';
    this.pid = LOCAL;
    this.loaded = false;
    this.emit();
  }

  private async leaveWorld() {
    if (this.mode === 'host') {
      this.link?.send('bye', {});
      await this.save();
    }
    if (this.link) { await this.link.close(); this.link = null; }
    this.players = [];
    this.cursors.clear();
    this.chat = [];
    this.pending = [];
    this.outCmds = [];
    this.syncing = false;
    this.worldOwner = null;
  }

  private onPlayers(p: OnlineUser[]) {
    this.players = p;
    this.emit();
  }

  // ---------------------------------------------------------------- Gastgeber
  private hostHandlers(): Record<string, (p: any) => void> {
    return {
      cmd: (p) => {
        if (!p || p.e !== this.epoch || !validCmd(p.cmd)) return;
        if (!this.players.some((pl) => pl.id === p.pid)) return;
        this.pending.push({ pid: p.pid, cmd: p.cmd });
      },
      sync_req: () => this.serveSync(),
      cursor: (p) => this.onCursor(p),
      chat: (p) => this.onChat(p),
    };
  }

  private async serveSync() {
    const now = performance.now();
    if (now - this.lastSyncServe < 800) return;
    this.lastSyncServe = now;
    const data = this.sim.serialize();
    try {
      await this.net.saveWorld(data);
      this.lastSaved = Date.now();
      this.link?.send('sync', { e: this.epoch, t: data.tick });
    } catch (e) {
      console.warn('Sync fehlgeschlagen', e);
    }
  }

  // ---------------------------------------------------------------- Gast
  private guestHandlers(): Record<string, (p: any) => void> {
    return {
      tick: (p) => {
        if (!p || typeof p.t !== 'number' || !Array.isArray(p.c)) return;
        if (p.e !== this.epoch) {
          if (!this.syncing) { this.requestResync(true); }
          this.epoch = p.e;
          this.gCmds.clear();
        }
        for (const entry of p.c) {
          if (!Array.isArray(entry) || entry.length !== 3) continue;
          const [t, pid, cmd] = entry;
          if (typeof t !== 'number' || typeof pid !== 'string' || !validCmd(cmd)) continue;
          if (!this.syncing && t <= this.sim.tick) continue;
          if (!this.gCmds.has(t)) this.gCmds.set(t, []);
          this.gCmds.get(t)!.push([pid, cmd]);
        }
        this.hostTick = Math.max(this.hostTick, p.t);
        if (typeof p.h === 'string') this.hostHash = [p.t, p.h];
      },
      sync: (p) => { if (p && (this.syncing || p.e !== this.epoch)) this.loadSnapshot(p.e); },
      bye: () => { if (this.mode === 'guest') this.goHome(`${this.worldOwnerName} hat die Fabrik verlassen – zurück in deine eigene.`); },
      cursor: (p) => this.onCursor(p),
      chat: (p) => this.onChat(p),
    };
  }

  private requestResync(force = false) {
    const now = performance.now();
    if (!force && now - this.lastResync < 5000) return;
    this.lastResync = now;
    this.syncing = true;
    this.link?.send('sync_req', {});
  }

  private async loadSnapshot(epoch: number) {
    if (!this.worldOwner) return;
    try {
      const data = await this.net.loadWorld(this.worldOwner);
      if (!data || this.mode !== 'guest') return;
      const sim = Sim.deserialize(data);
      if (epoch !== this.epoch) { this.gCmds.clear(); this.epoch = epoch; }
      for (const t of [...this.gCmds.keys()]) if (t <= sim.tick) this.gCmds.delete(t);
      this.hostTick = Math.max(this.hostTick, sim.tick);
      const first = this.sim.tick === 0 || this.syncing;
      this.setSim(sim, true);
      this.syncing = false;
      if (first) this.toast(`Du bist in der Fabrik von ${this.worldOwnerName}!`, 'good');
    } catch (e) {
      this.goHome('Beitreten nicht möglich: ' + (e as Error).message);
    }
  }

  private guestStep(dt: number) {
    if (this.syncing) { this.acc = 0; return; }
    const behind = this.hostTick - this.sim.tick;
    if (behind > 400) { this.requestResync(); return; }
    if (behind <= 0) { this.acc = Math.min(this.acc, DT); return; }
    this.acc += dt * (behind > 12 ? 3 : behind > 6 ? 1.4 : 1);
    let steps = 0;
    while (this.acc >= DT && this.sim.tick < this.hostTick && steps < 40) {
      const t = this.sim.tick + 1;
      const cmds = this.gCmds.get(t);
      if (cmds) { for (const [pid, c] of cmds) applyCmd(this.sim, pid, c); this.gCmds.delete(t); }
      this.sim.step();
      this.acc -= DT;
      steps++;
      if (this.hostHash && this.hostHash[0] === this.sim.tick && this.hostHash[1] !== simHash(this.sim)) {
        console.warn('Abweichung erkannt – lade neu');
        this.requestResync();
        break;
      }
    }
  }

  // ---------------------------------------------------------------- Chat & Mauszeiger
  private onCursor(p: any) {
    if (!p || typeof p.pid !== 'string' || p.pid === this.pid || typeof p.x !== 'number' || typeof p.z !== 'number') return;
    this.cursors.set(p.pid, { name: String(p.name || '?').slice(0, 16), x: p.x, z: p.z, t: performance.now() });
  }
  private onChat(p: any) {
    if (!p || typeof p.text !== 'string') return;
    this.chat = [...this.chat.slice(-30), { id: ++this.chatId, name: String(p.name || '?').slice(0, 16), text: p.text.slice(0, 200), mine: false }];
    this.emit();
  }
  sendChat(text: string) {
    text = text.trim().slice(0, 200);
    if (!text || !this.link || !this.net.me) return;
    this.link.send('chat', { name: this.net.me.name, text });
    this.chat = [...this.chat.slice(-30), { id: ++this.chatId, name: this.net.me.name, text, mine: true }];
    this.emit();
  }

  // ---------------------------------------------------------------- Befehle
  // Jede Änderung an der Fabrik läuft hier durch
  run(cmd: Cmd) {
    if (this.mode === 'offline') { applyCmd(this.sim, this.pid, cmd); this.emit(); }
    else if (this.mode === 'host') this.pending.push({ pid: this.pid, cmd });
    else if (this.link && !this.syncing) this.link.send('cmd', { e: this.epoch, pid: this.pid, cmd });
  }

  myManual(): Manual { return this.sim.getManual(this.pid); }
  myHands() { return this.sim.handsOf(this.pid); }

  buildMenuOpen = false;

  attach(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.r = new GameRenderer(canvas, this.sim);
    this.applySettings();
    this.r.player.onStep = () => sfx.step();
    this.setView(this.settings.startView);
    // Musik startet beim ersten Klick/Tastendruck (Browser erlauben vorher keinen Ton)
    const startAudio = () => { startMusic(); window.removeEventListener('pointerdown', startAudio); window.removeEventListener('keydown', startAudio); };
    window.addEventListener('pointerdown', startAudio);
    window.addEventListener('keydown', startAudio);
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
    // Bildraten-Begrenzung aus den Einstellungen
    const lim = this.settings.fpsLimit;
    if (lim && now - this.lastRender < 1000 / lim - 2) return;
    this.lastRender = now;
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.stepSim(dt);
    if (this.view === 'walk') this.updateWalk(dt);
    else {
      this.keyboardCamera(dt);
      const p = this.player;
      this.r?.updatePlayer(dt, p.x, p.y, p.z, p.yaw, 0, false, this.myManual().slots.length > 0, true);
    }
    this.activityTimer += dt;
    if (this.activityTimer > 1) {
      this.activityTimer = 0;
      let n = 0;
      for (const e of this.sim.ents.values()) if (e.kind === 'building' && e.status === 'working') n++;
      setFactoryActivity(n / 30);
    }
    if (this.r && this.mode !== 'offline') {
      const now = performance.now();
      for (const [id, c] of this.cursors) if (now - c.t > 6000) this.cursors.delete(id);
      this.r.setCursors(this.cursors);
    }
    this.r!.myPid = this.pid;
    this.r!.render(dt, Math.min(1, this.acc / DT));
    this.fpsFrames++;
    this.fpsTime += dt;
    if (this.fpsTime >= 1) { this.fps = Math.round(this.fpsFrames / this.fpsTime); this.fpsFrames = 0; this.fpsTime = 0; }
    this.uiTimer += dt;
    if (this.uiTimer > 0.2) { this.uiTimer = 0; this.emit(); }
    this.saveTimer += dt;
    if (this.saveTimer > 15) { this.saveTimer = 0; this.save(); }
  };

  private stepSim(dt: number) {
    if (this.mode === 'guest') {
      this.guestStep(dt);
      // Ist der Besitzer noch da?
      if (!this.syncing && this.players.length && !this.players.some((p) => p.id === this.worldOwner)) {
        this.ownerMissing += dt;
        if (this.ownerMissing > 6) { this.ownerMissing = 0; this.goHome(`${this.worldOwnerName} ist nicht mehr online – zurück in deine Fabrik.`); }
      } else this.ownerMissing = 0;
      return;
    }
    this.acc += dt;
    let steps = 0;
    while (this.acc >= DT && steps < 10) {
      if (this.mode === 'host') {
        const cmds = this.pending.splice(0);
        for (const c of cmds) applyCmd(this.sim, c.pid, c.cmd);
        this.sim.step();
        for (const c of cmds) this.outCmds.push([this.sim.tick, c.pid, c.cmd]);
      } else {
        this.sim.step();
      }
      this.acc -= DT;
      steps++;
    }
    if (steps === 10) this.acc = 0;
    if (this.mode === 'host' && this.link) {
      this.sendTimer += dt;
      if (this.sendTimer >= 0.2 || this.outCmds.length > 30) {
        this.sendTimer = 0;
        if (this.players.length > 1) this.link.send('tick', { e: this.epoch, t: this.sim.tick, c: this.outCmds, h: simHash(this.sim) });
        this.outCmds = [];
      }
    }
  }

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
    if (this.saving || !this.loaded) return; // vor dem Start nichts überschreiben
    this.saving = true;
    try {
      if (this.mode === 'offline') await saveGame(this.sim.serialize());
      else if (this.mode === 'host') await this.net.saveWorld(this.sim.serialize());
      if (this.mode !== 'guest') this.lastSaved = Date.now();
    } catch (e) {
      console.warn('Speichern fehlgeschlagen', e);
    }
    this.saving = false;
  }

  exportSave() { exportFile(this.sim.serialize()); }

  async importSave(file: File) {
    try {
      const data = await readFile(file);
      if (this.mode === 'guest') throw new Error('Nur in deiner eigenen Fabrik möglich.');
      const sim = Sim.deserialize(data);
      if (this.mode === 'host' && sim.manuals[LOCAL] && !sim.manuals[this.pid]) { sim.manuals[this.pid] = sim.manuals[LOCAL]; delete sim.manuals[LOCAL]; }
      this.replaceWorld(sim);
      await this.save();
      this.toast('Spielstand importiert.', 'good');
    } catch (e) {
      this.toast('Import fehlgeschlagen: ' + (e as Error).message, 'bad');
    }
  }

  async newGame() {
    if (this.mode === 'guest') { this.toast('Ein neues Spiel geht nur in deiner eigenen Fabrik.', 'bad'); return; }
    if (this.mode === 'offline') await deleteGame();
    this.replaceWorld(Sim.newGame());
    await this.save();
    this.toast('Neues Spiel: 1.000.000 Bananen warten auf dich!', 'good');
  }

  // Ganze Fabrik austauschen (als Gastgeber: Gäste laden neu)
  private replaceWorld(sim: Sim) {
    this.setSim(sim);
    if (this.mode === 'host') {
      this.epoch = Date.now() % 1e9;
      this.pending = [];
      this.outCmds = [];
      this.serveSync();
    }
  }

  private setSim(sim: Sim, keepView = false) {
    this.sim = sim;
    if (keepView) { this.r?.setSim(sim); this.select(this.selection.filter((id) => sim.get(id))); this.emit(); return; }
    this.selection = [];
    this.tool = { kind: 'select' };
    this.r?.setSim(sim);
    this.r?.setSelection([]);
    this.emit();
  }

  setSettings(s: Partial<Settings>) {
    this.settings = { ...this.settings, ...s };
    ls.set(SETTINGS_KEY, JSON.stringify(this.settings));
    this.applySettings();
    this.emit();
  }

  resetSettings() { this.setSettings({ ...DEFAULT_SETTINGS }); }

  private applySettings() {
    const s = this.settings;
    if (this.r) {
      this.r.setTuning({ resScale: s.resScale, lodScale: s.lodScale, shadows: s.shadows, effects: s.effects }, s.fov);
      this.r.setQuality(QUALITIES[s.quality]);
    }
    setVolumes({ master: s.master, music: s.music, sfx: s.sfx, musicOn: s.musicOn });
    this.running = s.runToggle;
  }

  // ---------------------------------------------------------------- Laufen & Ansicht
  setView(v: View) {
    this.view = v;
    const r = this.r;
    if (!r) return;
    const c = r.cam;
    c.follow = v === 'walk';
    if (v === 'walk') {
      c.dist = 7.5; c.pitch = 0.32;
      c.tx = this.player.x; c.tz = this.player.z; c.ty = this.player.y;
    } else {
      c.dist = 40; c.pitch = 0.95;
    }
    this.emit();
  }
  toggleView() { this.setView(this.view === 'walk' ? 'build' : 'walk'); }

  // Kann die Figur hier stehen? (Gebäude blockieren, Bänder und Logistik nicht)
  private blocked(x: number, z: number, fromY: number): boolean {
    const R = 0.28;
    for (const [dx, dz] of [[-R, -R], [R, -R], [-R, R], [R, R]]) {
      const tx = Math.floor(x + dx), tz = Math.floor(z + dz);
      if (tx < 0 || tz < 0 || tx >= 128 || tz >= 112) return true;
      const e = this.sim.entAt(tx, tz);
      if (e && e.kind === 'building' && BUILDINGS[e.type].category !== 'logistic') return true;
      if (this.r!.groundHeight(x + dx, z + dz) - fromY > 0.9) return true; // zu steil
    }
    return false;
  }

  private updateWalk(dt: number) {
    const r = this.r!;
    const p = this.player;
    const c = r.cam;
    const k = this.keys;
    const fx = -Math.sin(c.yaw), fz = -Math.cos(c.yaw);
    const rx = Math.cos(c.yaw), rz = -Math.sin(c.yaw);
    let ix = 0, iz = 0;
    if (k.has('w') || k.has('arrowup')) { ix += fx; iz += fz; }
    if (k.has('s') || k.has('arrowdown')) { ix -= fx; iz -= fz; }
    if (k.has('d') || k.has('arrowright')) { ix += rx; iz += rz; }
    if (k.has('a') || k.has('arrowleft')) { ix -= rx; iz -= rz; }
    ix += rx * this.joy.x - fx * this.joy.y;
    iz += rz * this.joy.x - fz * this.joy.y;
    const len = Math.hypot(ix, iz);
    if (len > 1) { ix /= len; iz /= len; }
    const run = this.running !== (k.has('shift'));
    const maxSpeed = run ? 8 : 4.2;
    const tvx = ix * maxSpeed, tvz = iz * maxSpeed;
    const a = 1 - Math.exp(-(p.air ? 3 : 12) * dt);
    p.vx += (tvx - p.vx) * a;
    p.vz += (tvz - p.vz) * a;
    // Förderbänder nehmen dich mit
    let bx = 0, bz = 0;
    const under = this.sim.entAt(Math.floor(p.x), Math.floor(p.z));
    if (!p.air && under && under.kind === 'belt') {
      const sp = BELT_TIERS[under.tier].speed;
      bx = DX[under.dir] * sp; bz = DY[under.dir] * sp;
    }
    const mx = (p.vx + bx) * dt, mz = (p.vz + bz) * dt;
    if (!this.blocked(p.x + mx, p.z, p.y)) p.x += mx;
    if (!this.blocked(p.x, p.z + mz, p.y)) p.z += mz;
    // Schwerkraft & Boden
    const ground = r.groundHeight(p.x, p.z);
    p.vy -= 22 * dt;
    p.y += p.vy * dt;
    if (p.y <= ground || (!p.air && ground - p.y < 0.9 && p.y - ground < 0.25)) {
      if (p.air && p.vy < -5) sfx.land();
      p.y = ground;
      p.vy = 0;
      p.air = false;
    } else if (p.y > ground + 0.05) {
      p.air = true;
    }
    p.speed = Math.hypot(p.vx, p.vz);
    if (p.speed > 0.3) {
      const target = Math.atan2(-p.vz, p.vx);
      let d = target - p.yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      p.yaw += d * (1 - Math.exp(-12 * dt));
    }
    // Kamera folgt weich
    c.tx += (p.x - c.tx) * (1 - Math.exp(-14 * dt));
    c.tz += (p.z - c.tz) * (1 - Math.exp(-14 * dt));
    c.ty += (p.y - c.ty) * (1 - Math.exp(-8 * dt));
    r.updatePlayer(dt, p.x, p.y, p.z, p.yaw, p.speed, p.air, this.myManual().slots.length > 0, true);
    // Mitspieler sehen dich laufen
    const now = performance.now();
    if (this.link && this.net.me && this.players.length > 1 && now - this.lastAvatarSend > 100) {
      this.lastAvatarSend = now;
      this.link.send('cursor', { pid: this.pid, name: this.net.me.name, x: p.x, z: p.z, y: p.y, yaw: p.yaw, walk: true, hold: this.myManual().slots.length > 0 });
    }
  }

  jump() {
    if (this.view !== 'walk' || this.player.air) return;
    this.player.vy = 7.5;
    this.player.air = true;
    sfx.jump();
  }

  // Banane in der Nähe der Figur greifen
  grabNear() {
    const p = this.player;
    const tile = this.sim.nearestPileTile(Math.floor(p.x), Math.floor(p.z), 3);
    if (tile < 0) { this.toast('Geh näher an den Bananenberg, um eine Banane zu nehmen.', 'bad'); return; }
    if (this.grabFromPile(tile)) { this.r?.player.grab(); sfx.grab(); }
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
      const e = this.sim.get(this.selection[0]);
      if (e && e.kind === 'building' && !this.sim.canPlace(e.type, e.x, e.y, (e.dir + 1) % 4, e.id)) { this.toast('Drehen nicht möglich – kein Platz.', 'bad'); return; }
      this.run({ k: 'rotate', id: this.selection[0] });
    }
  }

  demolishSelection() {
    let refund = 0;
    for (const id of this.selection) refund += this.sim.get(id)?.invested || 0;
    if (this.selection.length) this.run({ k: 'demolish', ids: [...this.selection] });
    if (this.selection.length) this.toast(`Abgerissen – ${formatMoney(refund)} erstattet.`, 'good');
    this.select([]);
  }

  upgradeSelection() {
    const prices = this.selection.map((id) => this.sim.upgradePrice(id)).filter((c): c is number => c !== null);
    if (!prices.length) { this.toast('Schon auf dem höchsten Level.', 'bad'); return; }
    if (this.sim.money < Math.min(...prices)) { this.toast('Nicht genug Geld.', 'bad'); return; }
    this.run({ k: 'upgrade', ids: [...this.selection] });
  }

  upgradeSelectionCost(): number {
    let c = 0;
    for (const id of this.selection) c += this.sim.upgradePrice(id) || 0;
    return c;
  }

  toggleSelection() {
    this.run({ k: 'toggle', ids: [...this.selection] });
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
    this.run({ k: 'salvage' });
    this.toast('Bergungskiste wird verkauft.', 'good');
  }

  // Handarbeit
  // Rückgabe: ob ein Streifen abgezogen werden kann
  peelStrip(strip: number) {
    const m = this.myManual();
    if (!m.slots.some((b) => b.mask !== 7)) return 0;
    this.run({ k: 'peel', strip });
    return 1;
  }
  manualSellAll() { this.run({ k: 'sellHand' }); }
  buyManual(id: ManualUpgradeId) {
    const cost = this.sim.manualUpgradeCost(id, this.pid);
    if (cost === null || this.sim.money < cost) { this.toast('Nicht genug Geld.', 'bad'); return; }
    this.run({ k: 'buyHand', id });
  }
  grabFromPile(tile = -1) {
    if (this.myManual().slots.length >= this.myHands()) { this.toast('Deine Hände sind voll – erst schälen!', 'bad'); return false; }
    if (this.sim.pileRemaining <= 0) { this.toast('Keine Bananen mehr im Berg.', 'bad'); return false; }
    this.run({ k: 'take', tile });
    return true;
  }
  setFilter(id: number, stage: number) { this.run({ k: 'filter', id, stage }); }
  nodeCfg(id: number, cfg: { outMask?: number; prio?: boolean; mask?: number }) { this.run({ k: 'nodeCfg', id, ...cfg }); }
  upgradeOne(id: number) {
    const c = this.sim.upgradePrice(id);
    if (c === null || this.sim.money < c) { this.toast('Nicht genug Geld.', 'bad'); return false; }
    this.run({ k: 'upgrade', ids: [id] });
    return true;
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
      const sens = this.settings.sensitivity;
      const inv = this.settings.invertY ? -1 : 1;
      this.r.rotate(-(p.x - prev.x) * 0.006 * sens, (p.y - prev.y) * 0.004 * sens * inv * (this.view === 'walk' ? 1.2 : 1));
      return;
    }
    // Im Laufen-Modus dreht Ziehen die Kamera (statt sie zu verschieben)
    if (this.view === 'walk' && this.gesture === 'pending' && moved > 6) this.gesture = 'rotate';
    if ((this.gesture === 'pending' && moved > 6) || (this.gesture === 'place' && p && p.type !== 'mouse' && moved > 14)) this.gesture = 'pan';
    if (this.gesture === 'pan') {
      const gp = this.r.groundPoint(e.clientX, e.clientY);
      if (gp && this.grab) this.r.pan(this.grab.x - gp.x, this.grab.z - gp.z);
      return;
    }
    const tile = this.r.pickTile(e.clientX, e.clientY);
    const changed = !tile || !this.hover || tile.x !== this.hover.x || tile.y !== this.hover.y;
    if (tile && changed && this.link && this.net.me && this.players.length > 1 && performance.now() - this.lastCursor > 150) {
      this.lastCursor = performance.now();
      this.link.send('cursor', { pid: this.pid, name: this.net.me.name, x: tile.x + 0.5, z: tile.y + 0.5 });
    }
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
          const cost = this.sim.beltPathCost(cells, t.tier);
          if (cost > this.sim.money) this.toast(this.sim.money >= BELT_TIERS[t.tier].price ? 'Nicht genug Geld für alle Felder – es wird gebaut, so weit das Geld reicht.' : 'Zu wenig Geld für Förderbänder.', 'bad');
          if (cells.length) this.run({ k: 'belts', cells: cells.map((c) => [c.x, c.y, c.dir] as [number, number, number]), tier: t.tier });
        }
        this.path = [];
        break;
      case 'demolishBox':
        if (this.startTile && tile) {
          const rc = rectOf(this.startTile, tile);
          const ids = new Set<number>();
          for (let y = rc.y0; y <= rc.y1; y++) for (let x = rc.x0; x <= rc.x1; x++) { const en = this.sim.entAt(x, y); if (en) ids.add(en.id); }
          let refund = 0;
          for (const id of ids) refund += this.sim.get(id)!.invested;
          if (ids.size) {
            this.run({ k: 'demolish', ids: [...ids] });
            this.toast(`${ids.size} Teile abgerissen – ${formatMoney(refund)} erstattet.`, 'good');
          }
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
      if (this.view === 'walk') {
        const tx = tile % 128 + 0.5, tz = Math.floor(tile / 128) + 0.5;
        if (Math.hypot(tx - this.player.x, tz - this.player.z) > 6) { this.toast('Zu weit weg – lauf näher an den Berg.', 'bad'); return; }
        if (this.grabFromPile(tile)) { r.player.grab(); sfx.grab(); }
        return;
      }
      this.grabFromPile(tile);
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
      if (!this.sim.canPlace(t.type, o.x, o.y, t.dir)) { this.toast('Hier ist kein Platz (Bananen oder Gebäude im Weg).', 'bad'); return; }
      this.run({ k: 'place', type: t.type, x: o.x, y: o.y, dir: t.dir });
    } else if (t.kind === 'move') {
      const e = this.sim.get(t.id);
      if (!e) return;
      const o = e.kind === 'building' ? this.placementOrigin(e.type, t.dir, tile) : tile;
      const free = e.kind === 'building' ? this.sim.canPlace(e.type, o.x, o.y, t.dir, e.id) : this.sim.cellFree(o.x, o.y, e.id);
      if (!free) { this.toast('Hier ist kein Platz.', 'bad'); return; }
      this.run({ k: 'move', id: t.id, x: o.x, y: o.y, dir: t.dir });
      this.setTool({ kind: 'select' });
      this.select([t.id]);
    } else if (t.kind === 'paste') {
      if (!this.sim.blueprintValid(t.bp, tile.x, tile.y) || this.sim.money < this.sim.blueprintCost(t.bp)) { this.toast('Einfügen nicht möglich (Platz oder Geld).', 'bad'); return; }
      this.run({ k: 'paste', bp: t.bp, x: tile.x, y: tile.y });
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
    if (this.view === 'walk' && k === 'e') { if (down && !e.repeat) this.grabNear(); return; }
    if (this.view === 'walk' && k === ' ') { e.preventDefault(); if (down) this.jump(); return; }
    if (['w', 'a', 's', 'd', 'q', 'e', 'shift', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) {
      if (down) this.keys.add(k); else this.keys.delete(k);
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
      return;
    }
    if (!down) return;
    if (k === 'v' && !(e.ctrlKey || e.metaKey)) { this.toggleView(); return; }
    if (k === 'r') this.rotateTool();
    else if (k === 'escape') { this.setTool({ kind: 'select' }); this.select([]); }
    else if (k === 'delete' || k === 'backspace') this.demolishSelection();
    else if (k === 'u') this.upgradeSelection();
    else if (k === 'c' && (e.ctrlKey || e.metaKey)) this.copySelection();
    else if (k === 'v' && (e.ctrlKey || e.metaKey) && this.clipboard) this.setTool({ kind: 'paste', bp: this.clipboard });
    else if (k === 'b') this.setTool({ kind: 'belt', tier: 0, dir: 0 });
    else if (k === 'x') this.setTool({ kind: 'demolish' });
    else if (k === ' ') { e.preventDefault(); this.grabFromPile(); }
    else if (k === 'enter') { this.emit(); }
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
