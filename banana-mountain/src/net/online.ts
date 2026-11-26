/*
 * Online-Anbindung über Supabase:
 *  - Login/Registrierung (eigene Konten mit Name + Passwort, ohne E-Mail)
 *  - Freunde, Bestenliste, Fabriken speichern/laden (Datenbank-Funktionen)
 *  - Echtzeit-Kanäle: „Lobby“ (wer ist online?) und ein Kanal pro Fabrik
 */
import { createClient, SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import type { SaveData } from '../sim/sim';

// Öffentliche Projekt-Adresse und öffentlicher Schlüssel (dürfen im Browser stehen;
// die Daten sind über die Datenbank-Funktionen geschützt)
const SUPABASE_URL = 'https://evzyaroqduvkcxnpuaup.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV2enlhcm9xZHV2a2N4bnB1YXVwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTU0OTcxMTMsImV4cCI6MjExMTA3MzExM30.Yn4fDc-C2kCWDT6ZfrPjVWmmX5hiCK7Tc-9-3qyC9IE';
const TOKEN_KEY = 'banana-mountain-token';

export interface Me { token: string; id: string; name: string }
export interface Friend { id: string; name: string; status: 'friend' | 'incoming' | 'outgoing' }
export interface OnlineUser { id: string; name: string; world: string | null }
export interface LeaderRow { name: string; sold: number; revenue: number }

function errText(e: unknown): string {
  const m = (e as { message?: string })?.message || String(e);
  if (/Failed to fetch|NetworkError|network/i.test(m)) return 'Keine Verbindung zum Server.';
  return m.replace(/^.*?ERROR:\s*/, '');
}

export class Online {
  sb: SupabaseClient;
  me: Me | null = null;
  friends: Friend[] = [];
  users = new Map<string, OnlineUser>(); // wer gerade online ist
  onChange: () => void = () => {};
  private lobby: RealtimeChannel | null = null;
  private myWorld: string | null = null;

  constructor() {
    this.sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: { params: { eventsPerSecond: 40 } },
    });
  }

  private async rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
    const { data, error } = await this.sb.rpc(fn, args);
    if (error) throw new Error(errText(error));
    return data as T;
  }

  // ---------------------------------------------------------------- Konto
  async resume(): Promise<Me | null> {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return null;
    try {
      const me = await this.rpc<Me | null>('bm_session', { p_token: token });
      if (me) this.me = me;
      else localStorage.removeItem(TOKEN_KEY);
      return me;
    } catch {
      return null;
    }
  }

  async login(name: string, pass: string, register: boolean): Promise<Me> {
    const res = await this.rpc<Me & { error?: string }>(register ? 'bm_register' : 'bm_login', { p_name: name, p_pass: pass });
    if (res.error) throw new Error(res.error);
    this.me = res;
    localStorage.setItem(TOKEN_KEY, res.token);
    return res;
  }

  async logout() {
    if (this.me) await this.rpc('bm_logout', { p_token: this.me.token }).catch(() => {});
    localStorage.removeItem(TOKEN_KEY);
    await this.leaveLobby();
    this.me = null;
    this.friends = [];
  }

  // ---------------------------------------------------------------- Freunde
  async refreshFriends() {
    if (!this.me) return;
    try {
      this.friends = await this.rpc<Friend[]>('bm_friends_list', { p_token: this.me.token });
      this.onChange();
    } catch { /* später erneut */ }
  }
  async addFriend(name: string): Promise<string> {
    const msg = await this.rpc<string>('bm_friend_add', { p_token: this.me!.token, p_name: name });
    await this.refreshFriends();
    this.ping();
    return msg;
  }
  async answer(id: string, accept: boolean) {
    await this.rpc('bm_friend_answer', { p_token: this.me!.token, p_id: id, p_accept: accept });
    await this.refreshFriends();
    this.ping();
  }
  async removeFriend(id: string) {
    await this.rpc('bm_friend_remove', { p_token: this.me!.token, p_id: id });
    await this.refreshFriends();
    this.ping();
  }
  leaderboard() { return this.rpc<LeaderRow[]>('bm_leaderboard'); }

  // ---------------------------------------------------------------- Fabriken
  loadWorld(owner: string) { return this.rpc<SaveData | null>('bm_world_load', { p_token: this.me!.token, p_owner: owner }); }
  saveWorld(data: SaveData) {
    return this.rpc('bm_world_save', { p_token: this.me!.token, p_data: data, p_sold: data.stats.sold, p_revenue: data.stats.revenue });
  }

  // ---------------------------------------------------------------- Lobby (wer ist online?)
  async joinLobby(world: string | null) {
    this.myWorld = world;
    if (this.lobby) { await this.track(); return; }
    const me = this.me!;
    const ch = this.sb.channel('bm-lobby', { config: { presence: { key: me.id } } });
    ch.on('presence', { event: 'sync' }, () => {
      this.users.clear();
      const state = ch.presenceState<OnlineUser>();
      for (const [id, metas] of Object.entries(state)) {
        const m = metas[metas.length - 1];
        if (m) this.users.set(id, { id, name: m.name, world: m.world });
      }
      this.onChange();
    });
    // Freundesliste aktualisieren, wenn jemand Anfragen schickt
    ch.on('broadcast', { event: 'friends' }, ({ payload }) => {
      if (payload?.to === me.id || payload?.all) this.refreshFriends();
    });
    this.lobby = ch;
    ch.subscribe((status) => { if (status === 'SUBSCRIBED') this.track(); });
    await this.refreshFriends();
  }

  async setWorld(world: string | null) {
    this.myWorld = world;
    await this.track();
  }

  private async track() {
    if (this.lobby && this.me) await this.lobby.track({ id: this.me.id, name: this.me.name, world: this.myWorld }).catch(() => {});
  }

  // Andere bitten, ihre Freundesliste neu zu laden
  private ping() { this.lobby?.send({ type: 'broadcast', event: 'friends', payload: { all: true } }); }

  private async leaveLobby() {
    if (this.lobby) { await this.sb.removeChannel(this.lobby); this.lobby = null; }
    this.users.clear();
  }

  isOnline(id: string) { return this.users.has(id); }
  worldOf(id: string) { return this.users.get(id)?.world ?? null; }

  // ---------------------------------------------------------------- Kanal einer Fabrik
  openWorld(owner: string, handlers: Record<string, (payload: any) => void>, onPlayers: (p: OnlineUser[]) => void, onReady: () => void): WorldLink {
    const me = this.me!;
    const ch = this.sb.channel('bm-world-' + owner, { config: { broadcast: { self: false, ack: false }, presence: { key: me.id } } });
    for (const [ev, fn] of Object.entries(handlers)) ch.on('broadcast', { event: ev }, ({ payload }) => fn(payload));
    ch.on('presence', { event: 'sync' }, () => {
      const list: OnlineUser[] = [];
      for (const [id, metas] of Object.entries(ch.presenceState<OnlineUser>())) {
        const m = metas[metas.length - 1];
        if (m) list.push({ id, name: m.name, world: owner });
      }
      onPlayers(list);
    });
    ch.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await ch.track({ id: me.id, name: me.name, world: owner });
        onReady();
      }
    });
    return new WorldLink(this.sb, ch, owner);
  }
}

export class WorldLink {
  constructor(private sb: SupabaseClient, private ch: RealtimeChannel, public owner: string) {}
  send(event: string, payload: unknown) {
    this.ch.send({ type: 'broadcast', event, payload }).catch(() => {});
  }
  async close() { await this.sb.removeChannel(this.ch); }
}
