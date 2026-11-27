/*
 * Mehrspieler im Browser: Partie eröffnen, offenen Partien beitreten, verlassen.
 */
import { useState } from 'react';
import type { Engine } from '../engine';
import { Modal } from './Modals';

export function RoomModal({ engine, onClose }: { engine: Engine; onClose: () => void }) {
  const [name, setName] = useState(engine.roomMe?.name || '');
  const [busy, setBusy] = useState(false);
  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); onClose(); } catch (e) { engine.toast('Mehrspieler: ' + (e as Error).message, 'bad'); }
    setBusy(false);
  };
  if (engine.roomAvailable === null) return <Modal title="Mehrspieler" onClose={onClose}><p className="note">Verbinde …</p></Modal>;
  if (!engine.roomAvailable) {
    return (
      <Modal title="Mehrspieler" onClose={onClose}>
        <p>Mehrspieler im Browser geht nur auf der <b>claude.ai-Seite</b> des Spiels, wenn du dort angemeldet bist.</p>
        <p className="note">In der APK oder in der heruntergeladenen Datei spielst du allein.</p>
      </Modal>
    );
  }
  const games = engine.roomGames.filter((g) => g.code !== engine.roomCode);
  return (
    <Modal title="Mehrspieler" onClose={onClose}>
      <div className="room">
        <label className="room-name">Dein Name
          <span>
            <input value={name} maxLength={16} onChange={(e) => setName(e.target.value)} placeholder="Name" />
            <button className="btn small ghost" disabled={busy || !name.trim() || name.trim() === engine.roomMe?.name || engine.roomMode} onClick={() => engine.setRoomName(name)}>Speichern</button>
          </span>
        </label>

        {engine.roomMode ? (
          <div className="room-in">
            <p>{engine.mode === 'host'
              ? <>Deine Fabrik ist <b>offen</b>. Freunde sehen sie unter „Offene Fabriken“, wenn sie diese Seite öffnen.</>
              : <>Du spielst in der Fabrik von <b>{engine.worldOwnerName}</b>.</>}</p>
            <p className="note">Mitspieler: {engine.players.map((p) => p.name).join(', ') || '–'}</p>
            <button className="btn danger wide-btn" disabled={busy} onClick={() => act(() => engine.leaveRoom())}>
              {engine.mode === 'host' ? 'Fabrik schließen (allein weiterspielen)' : 'Verlassen – zurück in meine Fabrik'}
            </button>
          </div>
        ) : (
          <button className="btn wide-btn" disabled={busy} onClick={() => act(() => engine.hostRoom())}>Meine Fabrik für Freunde öffnen</button>
        )}

        <h4>Offene Fabriken</h4>
        {!games.length && <p className="note">Gerade ist keine andere Fabrik offen. Wenn ein Freund seine Fabrik öffnet, erscheint sie hier.</p>}
        <div className="room-list">
          {games.map((g) => (
            <div key={g.code} className="room-game">
              <span><b>{g.name}</b> <small>{g.n} {g.n === 1 ? 'Spieler' : 'Spieler'}</small></span>
              <button className="btn small" disabled={busy} onClick={() => act(() => engine.joinRoomGame(g))}>Beitreten</button>
            </div>
          ))}
        </div>
        <p className="note">So spielen deine Freunde mit: Teile diese Seite über „Teilen“ mit ihnen. Sie öffnen sie, klicken auf „Mehrspieler“ und treten deiner Fabrik bei. Die Fabrik läuft beim Gastgeber – schließt er sie, gehen alle zurück in ihre eigene Fabrik.</p>
      </div>
    </Modal>
  );
}
