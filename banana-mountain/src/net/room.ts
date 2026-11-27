/*
 * Mehrspieler im Browser – über die „room“-Fähigkeit der claude.ai-Seite.
 * Alle, die die Seite gerade offen haben, sind in der Lobby. Jede Partie ist ein
 * eigener Raum. Der Gastgeber schickt Takte und Spielstand als Nachrichten,
 * die Gäste schicken ihre Befehle über ihre „Anwesenheit“ (presence) – das
 * darf jeder, auch wer die Seite nur ansehen darf.
 *
 * Alles, was von anderen kommt, ist nicht vertrauenswürdig: Befehle werden im
 * Spiel geprüft (validCmd), Namen nur als Text angezeigt.
 */
import { ls } from '../storage/local';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Handlers = Record<string, (p: any) => void>;
export interface Link { send(event: string, payload: unknown): void; close(): Promise<void> }
export interface RoomMe { id: string; name: string }
export interface RoomPlayer { id: string; name: string; world: string | null }
export interface RoomGame { code: string; name: string; owner: string; n: number }

const MAX_PART = 3000;     // Zeichen pro Nachricht (Grenze ist 4 KiB)
const MAX_QUEUE = 2800;    // Zeichen für wartende Befehle in der Anwesenheit
const TOPIC = 'm';

// Steuer- und unsichtbare Zeichen entfernen (ohne Regex, damit der Build keine Sonderzeichen enthält)
const badChar = (c: number) => c < 32 || (c >= 0x7f && c <= 0x9f) || (c >= 0x200b && c <= 0x200f) || (c >= 0x202a && c <= 0x202e) || (c >= 0x2060 && c <= 0x206f) || c === 0xfeff;
const clean = (v: unknown, n = 16) => Array.from(String(v ?? '')).filter((ch) => !badChar(ch.codePointAt(0)!)).join('').trim().slice(0, n);

// ---------------------------------------------------------------- Verbindung zur Seite
let roomP: Promise<any | null> | null = null;
let userP: Promise<any | null> | null = null;
function use(name: string): Promise<any | null> {
  const c = (window as any).claude;
  if (!c || typeof c.use !== 'function') return Promise.resolve(null);
  return Promise.resolve(c.use(name)).catch(() => null);
}
export const getRoom = () => (roomP ||= use('room'));
const getUser = () => (userP ||= use('user'));

export async function whoAmI(): Promise<RoomMe> {
  const user = await getUser();
  let id: string | null = null;
  let name = '';
  try { id = user ? await user.id() : null; } catch { /* egal */ }
  try { name = user ? clean((await user.me()).name, 16) : ''; } catch { /* egal */ }
  if (!id) {
    id = ls.get('bm-room-id');
    if (!id) { id = 'g' + Math.random().toString(36).slice(2, 12); ls.set('bm-room-id', id); }
  }
  const nick = clean(ls.get('bm-room-name'), 16);
  return { id, name: nick || name || 'Spieler ' + id.slice(-3).toUpperCase() };
}
export function setNick(name: string) { ls.set('bm-room-name', clean(name, 16)); }

// ---------------------------------------------------------------- Lobby
export class Lobby {
  games: RoomGame[] = [];
  online = 0;
  private off: (() => void) | null = null;
  constructor(private room: any, private onChange: () => void) {
    this.off = room.onPeers((c: any) => {
      const list: RoomGame[] = [];
      for (const p of c.peers) {
        const g = p.presence?.game;
        if (!g || p.sameTab || typeof g.code !== 'string' || !/^[a-z0-9]{4,8}$/.test(g.code)) continue;
        list.push({ code: g.code, name: clean(g.name), owner: clean(g.owner, 64), n: Math.max(1, Math.min(99, Number(g.n) || 1)) });
      }
      this.games = list;
      this.online = c.peers.length;
      this.onChange();
    }, () => {});
  }
  announce(game: { code: string; name: string; owner: string; n: number } | null) {
    this.room.presence({ game }).catch(() => {});
  }
  close() { this.off?.(); }
}

// ---------------------------------------------------------------- Verbindung in einer Partie
export class RoomLink implements Link {
  private out: string[] = [];
  private timers: number[] = [];
  private offs: (() => void)[] = [];
  private parts = new Map<string, { n: number; got: string[]; c: number }>();
  private partId = 0;
  // Gast: eigene Befehle, bis der Gastgeber sie bestätigt
  private seq = 0;
  private queue: [number, number, unknown][] = [];
  private overflow: [number, number, unknown][] = [];
  private req = 0;
  private chatN = 0;
  private chatMsg: [number, string] | null = null;
  private cur: unknown = null;
  // Was ich von den anderen schon gesehen habe (Schlüssel = peer)
  private seen = new Map<string, { seq: number; req: number; chat: number }>();
  private lastCur = new Map<string, { id: string; c: any }>();
  private myPeer = '';
  private hostSeen = false;
  private closed = false;

  constructor(
    private room: any, private isHost: boolean, private me: RoomMe, private ownerId: string,
    private h: Handlers, private onPlayers: (p: RoomPlayer[]) => void, private onReady: () => void,
  ) {
    this.offs.push(room.on(TOPIC, (m: any) => this.onMessage(m), () => {}));
    this.offs.push(room.onPeers((c: any) => this.onPeers(c.peers), () => {}));
    this.pushPresence();
    // höchstens ~20 Nachrichten pro Sekunde
    this.timers.push(window.setInterval(() => this.flush(), 50));
    // Figuren der anderen regelmäßig auffrischen (Anwesenheit ändert sich nur bei Bewegung)
    this.timers.push(window.setInterval(() => { for (const v of this.lastCur.values()) this.h.cursor?.({ ...v.c, pid: v.id }); }, 1000));
  }

  get code() { return this.room.name as string; }

  send(event: string, payload: any) {
    if (this.closed) return;
    if (event === 'cursor') { this.cur = { ...payload, name: undefined, pid: undefined }; this.pushPresence(); return; }
    if (event === 'chat') { this.chatMsg = [++this.chatN, String(payload?.text || '').slice(0, 200)]; this.pushPresence(); return; }
    if (!this.isHost) {
      if (event === 'cmd') {
        const entry: [number, number, unknown] = [++this.seq, payload.e, payload.cmd];
        if (JSON.stringify(entry).length > MAX_QUEUE) return; // zu groß (riesiges Einfügen) – verworfen
        this.overflow.push(entry);
        this.fillQueue();
      } else if (event === 'sync_req') { this.req++; this.pushPresence(); }
      return;
    }
    // Gastgeber: Takte bestätigen die Befehle der Gäste
    if (event === 'tick') {
      const a: Record<string, number> = {};
      for (const [peer, s] of this.seen) if (s.seq) a[peer] = s.seq;
      payload = { ...payload, a };
    }
    const text = JSON.stringify({ v: event, p: payload });
    if (text.length <= MAX_PART) { this.out.push(JSON.stringify({ v: event, p: payload })); return; }
    // Große Nachrichten (Spielstand) in Stücke teilen
    const id = `${this.myPeer.slice(0, 6)}${++this.partId}`;
    const n = Math.ceil(text.length / MAX_PART);
    // alte, noch nicht gesendete Spielstände verwerfen (nur der neueste zählt)
    if (event === 'sync') this.out = this.out.filter((s) => !s.startsWith('{"k":"part"') || !s.includes('"sync":1'));
    for (let i = 0; i < n; i++) this.out.push(JSON.stringify({ k: 'part', id, i, n, sync: event === 'sync' ? 1 : 0, s: text.slice(i * MAX_PART, (i + 1) * MAX_PART) }));
  }

  private flush() {
    if (!this.out.length || this.closed || !this.room.connected()) return;
    const s = this.out.shift()!;
    this.room.emit(TOPIC, JSON.parse(s)).catch((e: any) => {
      if (e?.code === 'not_permitted') { this.out = []; this.h.denied?.({}); }
    });
  }

  private fillQueue() {
    while (this.overflow.length) {
      const next = [...this.queue, this.overflow[0]];
      if (JSON.stringify(next).length > MAX_QUEUE && this.queue.length) break;
      this.queue.push(this.overflow.shift()!);
    }
    this.pushPresence();
  }

  private pushPresence() {
    if (this.closed) return;
    const p: Record<string, unknown> = { id: this.me.id, name: this.me.name, host: this.isHost, cur: this.cur, chat: this.chatMsg };
    if (!this.isHost) { p.q = this.queue; p.req = this.req; }
    this.room.presence(p).catch(() => {});
  }

  private onMessage(m: any) {
    if (m.sameTab || this.isHost) return;
    // nur dem Gastgeber dieser Partie glauben
    const host = this.room.peers().find((p: any) => p.peer === m.peer);
    if (!host || host.presence?.id !== this.ownerId || !host.presence?.host) return;
    let d = m.data;
    if (d && d.k === 'part') {
      if (typeof d.id !== 'string' || !Number.isInteger(d.i) || !Number.isInteger(d.n) || d.n > 2000 || d.i < 0 || d.i >= d.n || typeof d.s !== 'string') return;
      let e = this.parts.get(d.id);
      if (!e) {
        e = { n: d.n, got: new Array(d.n), c: 0 };
        this.parts.set(d.id, e);
        if (this.parts.size > 4) this.parts.delete(this.parts.keys().next().value as string);
      }
      if (e.got[d.i] === undefined) { e.got[d.i] = d.s; e.c++; }
      if (e.c < e.n) return;
      this.parts.delete(d.id);
      try { d = JSON.parse(e.got.join('')); } catch { return; }
    }
    if (!d || typeof d.v !== 'string' || !['tick', 'sync', 'bye'].includes(d.v)) return;
    if (d.v === 'tick' && d.p?.a && typeof d.p.a === 'object') {
      const ack = d.p.a[this.myPeer];
      if (typeof ack === 'number') {
        const before = this.queue.length;
        this.queue = this.queue.filter((q) => q[0] > ack);
        if (this.queue.length !== before) this.fillQueue();
      }
    }
    this.h[d.v]?.(d.p);
  }

  private onPeers(peers: readonly any[]) {
    const players: RoomPlayer[] = [];
    const alive = new Set<string>();
    for (const p of peers) {
      const pr = p.presence || {};
      if (p.sameTab) { this.myPeer = p.peer; players.push({ id: this.me.id, name: this.me.name, world: this.ownerId }); continue; }
      if (typeof pr.id !== 'string' || !pr.id) continue;
      const id = clean(pr.id, 64);
      const name = clean(pr.name) || 'Spieler';
      alive.add(p.peer);
      if (!players.some((x) => x.id === id)) players.push({ id, name, world: this.ownerId });
      let s = this.seen.get(p.peer);
      if (!s) { s = { seq: 0, req: 0, chat: 0 }; this.seen.set(p.peer, s); }
      // Chat (von allen)
      if (Array.isArray(pr.chat) && typeof pr.chat[0] === 'number' && pr.chat[0] > s.chat) {
        s.chat = pr.chat[0];
        this.h.chat?.({ name, text: String(pr.chat[1] || '') });
      }
      // Figur / Mauszeiger
      if (pr.cur && typeof pr.cur === 'object') {
        const c = { ...pr.cur, name, pid: id };
        this.lastCur.set(p.peer, { id, c });
        this.h.cursor?.(c);
      }
      if (this.isHost) {
        // Befehle der Gäste (nur neue)
        if (Array.isArray(pr.q)) {
          for (const e of pr.q) {
            if (!Array.isArray(e) || e.length !== 3 || typeof e[0] !== 'number' || e[0] <= s.seq) continue;
            s.seq = e[0];
            this.h.cmd?.({ e: e[1], pid: id, cmd: e[2] });
          }
        }
        if (typeof pr.req === 'number' && pr.req > s.req) { s.req = pr.req; this.h.sync_req?.({}); }
      } else if (pr.host && id === this.ownerId && !this.hostSeen) {
        this.hostSeen = true;
        this.onReady();
      }
    }
    for (const k of [...this.seen.keys()]) if (!alive.has(k)) { this.seen.delete(k); this.lastCur.delete(k); }
    this.onPlayers(players);
  }

  async close() {
    if (this.closed) return;
    // „Tschüss“ direkt senden (nicht über die Warteschlange)
    if (this.isHost) await this.room.emit(TOPIC, { v: 'bye', p: {} }).catch(() => {});
    this.closed = true;
    for (const t of this.timers) clearInterval(t);
    for (const o of this.offs) o();
    await this.room.leave().catch(() => {});
  }
}

export async function joinRoom(code: string) {
  const room = await getRoom();
  if (!room) throw new Error('Mehrspieler geht nur auf der claude.ai-Seite des Spiels.');
  return room.join('bm-' + code);
}

export function newCode() {
  const a = 'abcdefghjkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < 5; i++) s += a[Math.floor(Math.random() * a.length)];
  return s;
}
