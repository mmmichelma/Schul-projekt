import { useEffect, useRef, useState } from 'react';
import type { Engine } from '../engine';
import type { LeaderRow } from '../net/online';
import { fmtInt, formatMoney } from './format';
import { IconClose } from './Icons';

// ---------------------------------------------------------------- Login / Registrieren
export function StartScreen({ engine, onDone }: { engine: Engine; onDone: () => void }) {
  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [pass, setPass] = useState('');
  const [pass2, setPass2] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    if (tab === 'register' && pass !== pass2) { setErr('Die Passwörter sind nicht gleich.'); return; }
    setBusy(true);
    try {
      await engine.net.login(name, pass, tab === 'register');
      await engine.startOnline();
      onDone();
    } catch (ex) {
      setErr((ex as Error).message);
    }
    setBusy(false);
  };

  const offline = async () => {
    setBusy(true);
    await engine.startOffline();
    setBusy(false);
    onDone();
  };

  return (
    <div className="start">
      <div className="start-card">
        <div className="start-logo">
          <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden><path d="M8 38 Q30 60 56 20 Q51 15 46 20 Q34 44 10 32 Z" fill="#ffd21f" stroke="#a07800" strokeWidth="3" /></svg>
          <div>
            <h1>Banana Mountain</h1>
            <p>1.000.000 Bananen. Eine Fabrik. Du und deine Freunde.</p>
          </div>
        </div>
        <div className="seg wide">
          <button className={tab === 'login' ? 'active' : ''} onClick={() => { setTab('login'); setErr(''); }}>Anmelden</button>
          <button className={tab === 'register' ? 'active' : ''} onClick={() => { setTab('register'); setErr(''); }}>Konto erstellen</button>
        </div>
        <form onSubmit={submit} className="login-form">
          <label>Spielername
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={16} autoComplete="username" placeholder="z. B. Bananenboss" required />
          </label>
          <label>Passwort
            <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} maxLength={72} autoComplete={tab === 'login' ? 'current-password' : 'new-password'} required />
          </label>
          {tab === 'register' && (
            <label>Passwort wiederholen
              <input type="password" value={pass2} onChange={(e) => setPass2(e.target.value)} maxLength={72} autoComplete="new-password" required />
            </label>
          )}
          {err && <div className="form-error">{err}</div>}
          <button className="btn big" disabled={busy}>{busy ? 'Einen Moment …' : tab === 'login' ? 'Anmelden & spielen' : 'Konto erstellen & spielen'}</button>
          {tab === 'register' && <small className="note">Kein E-Mail nötig. Name: 3–16 Zeichen (Buchstaben, Zahlen, _ und -). Merk dir dein Passwort gut!</small>}
        </form>
        <div className="or"><span>oder</span></div>
        <button className="btn ghost wide" onClick={offline} disabled={busy}>Ohne Konto offline spielen</button>
        <small className="note center">Mit Konto wird deine Fabrik online gespeichert und Freunde können mitspielen.</small>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Freunde
export function FriendsModal({ engine, onClose }: { engine: Engine; onClose: () => void }) {
  const net = engine.net;
  const [tab, setTab] = useState<'friends' | 'top'>('friends');
  const [name, setName] = useState('');
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const [top, setTop] = useState<LeaderRow[] | null>(null);

  useEffect(() => { net.refreshFriends(); }, [net]);
  useEffect(() => {
    if (tab === 'top') net.leaderboard().then(setTop).catch(() => setTop([]));
  }, [tab, net]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    try { setMsg({ text: await net.addFriend(name.trim()) }); setName(''); }
    catch (ex) { setMsg({ text: (ex as Error).message, bad: true }); }
  };

  const friends = net.friends.filter((f) => f.status === 'friend');
  const incoming = net.friends.filter((f) => f.status === 'incoming');
  const outgoing = net.friends.filter((f) => f.status === 'outgoing');
  // Online zuerst
  friends.sort((a, b) => Number(net.isOnline(b.id)) - Number(net.isOnline(a.id)));

  return (
    <div className="modal-bg" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <div className="panel-head"><b>Freunde</b><button className="x" onClick={onClose}><IconClose /></button></div>
        <div className="seg wide">
          <button className={tab === 'friends' ? 'active' : ''} onClick={() => setTab('friends')}>Freunde{incoming.length ? ` (${incoming.length} neu)` : ''}</button>
          <button className={tab === 'top' ? 'active' : ''} onClick={() => setTab('top')}>Bestenliste</button>
        </div>
        {tab === 'friends' ? (
          <>
            <p className="note">Du bist angemeldet als <b>{net.me?.name}</b>. Gib deinen Namen an Freunde weiter, damit sie dich hinzufügen können.</p>
            <form className="row-form" onSubmit={add}>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name eines Freundes" maxLength={16} />
              <button className="btn">Hinzufügen</button>
            </form>
            {msg && <div className={'form-msg' + (msg.bad ? ' bad' : '')}>{msg.text}</div>}
            {incoming.length > 0 && <h4>Anfragen an dich</h4>}
            {incoming.map((f) => (
              <div key={f.id} className="friend">
                <span className="dot" /><b>{f.name}</b>
                <button className="btn small" onClick={() => net.answer(f.id, true)}>Annehmen</button>
                <button className="btn small ghost" onClick={() => net.answer(f.id, false)}>Ablehnen</button>
              </div>
            ))}
            <h4>Deine Freunde</h4>
            {!friends.length && <p className="note">Noch keine Freunde – füge oben jemanden hinzu!</p>}
            {friends.map((f) => {
              const online = net.isOnline(f.id);
              const world = net.worldOf(f.id);
              const hosting = online && world === f.id;
              const here = engine.worldOwner === f.id;
              return (
                <div key={f.id} className="friend">
                  <span className={'dot' + (online ? ' on' : '')} />
                  <div className="fname">
                    <b>{f.name}</b>
                    <small>{!online ? 'offline' : here ? 'du bist in dieser Fabrik' : hosting ? 'in seiner Fabrik' : world ? 'besucht jemanden' : 'online'}</small>
                  </div>
                  {hosting && !here && <button className="btn small" onClick={() => { engine.joinFriend(f.id, f.name); onClose(); }}>Beitreten</button>}
                  <button className="btn small ghost" title="Entfernen" onClick={() => { if (confirm(`${f.name} als Freund entfernen?`)) net.removeFriend(f.id); }}>✕</button>
                </div>
              );
            })}
            {outgoing.length > 0 && <h4>Gesendete Anfragen</h4>}
            {outgoing.map((f) => (
              <div key={f.id} className="friend">
                <span className="dot" /><b>{f.name}</b><small className="grow">wartet …</small>
                <button className="btn small ghost" onClick={() => net.removeFriend(f.id)}>Zurückziehen</button>
              </div>
            ))}
            {engine.mode === 'guest' && <button className="btn ghost wide" onClick={() => { engine.goHome(); onClose(); }}>Zurück in meine Fabrik</button>}
          </>
        ) : (
          <div className="leader">
            {!top && <p className="note">Lade …</p>}
            {top && !top.length && <p className="note">Noch keine Einträge.</p>}
            {top && top.map((r, i) => (
              <div key={i} className={'lrow' + (r.name === net.me?.name ? ' me' : '')}>
                <span className="rank">{i + 1}.</span><b>{r.name}</b>
                <span>{fmtInt(r.sold)} verkauft</span><span className="money">{formatMoney(r.revenue)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Mitspieler & Chat
export function PlayersBar({ engine }: { engine: Engine }) {
  if (engine.mode === 'offline') return null;
  const color = (id: string) => {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    return `hsl(${h % 360} 85% 60%)`;
  };
  return (
    <div className="players">
      <span className="where">
        {engine.syncing ? 'Verbinde …' : engine.mode === 'host' ? 'Deine Fabrik' : `Fabrik von ${engine.worldOwnerName}`}
      </span>
      {engine.players.map((p) => (
        <span key={p.id} className="pl" style={{ borderColor: color(p.id) }} title={p.name}>
          <i style={{ background: color(p.id) }}>{p.name.slice(0, 1).toUpperCase()}</i>{p.name}{p.id === engine.worldOwner ? ' ★' : ''}
        </span>
      ))}
    </div>
  );
}

export function ChatBox({ engine }: { engine: Engine }) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(0);
  const last = engine.chat.length ? engine.chat[engine.chat.length - 1].id : 0;
  useEffect(() => { if (open) setSeen(last); }, [open, last]);
  useEffect(() => { list.current?.scrollTo(0, 1e6); }, [last, open]);
  if (engine.mode === 'offline' || engine.players.length < 2 && !engine.chat.length) return null;
  const unread = engine.chat.filter((c) => c.id > seen && !c.mine).length;
  if (!open) return <button className="chat-btn" onClick={() => setOpen(true)}>Chat{unread ? ` (${unread})` : ''}</button>;
  return (
    <div className="panel chat">
      <div className="panel-head"><b>Chat</b><button className="x" onClick={() => setOpen(false)}><IconClose /></button></div>
      <div className="chat-list" ref={list}>
        {!engine.chat.length && <small className="note">Schreib deinen Mitspielern!</small>}
        {engine.chat.map((c) => <div key={c.id} className={c.mine ? 'mine' : ''}><b>{c.name}:</b> {c.text}</div>)}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); engine.sendChat(text); setText(''); }}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Nachricht …" maxLength={200} />
      </form>
    </div>
  );
}
