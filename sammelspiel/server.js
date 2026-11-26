/*
 * Heuhaufen-Helden – Server
 * Liefert das Spiel aus (http://localhost:3000) und verwaltet den Online-Modus
 * über WebSockets: Räume, Runden, wer welchen Gegenstand zuerst gefunden hat,
 * und eine Bestenliste.
 *
 * Start:  npm install   (einmalig)
 *         npm start
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { WebSocketServer } = require('ws');
const Shared = require('./public/shared.js');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const BOARD_FILE = path.join(DATA_DIR, 'bestenliste.json');

const ROUND_SECONDS = 75;
const COUNTDOWN_SECONDS = 3;
const TARGETS_PER_ROUND = 15;
const MAX_PLAYERS = 8;

// ---------------------------------------------------------------- HTTP
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
};

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  const file = path.normalize(path.join(PUBLIC_DIR, urlPath));
  if (!file.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('Verboten');
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Nicht gefunden');
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});

// ---------------------------------------------------------------- Bestenliste
let board = {}; // name -> { name, points, wins, rounds }
try {
  board = JSON.parse(fs.readFileSync(BOARD_FILE, 'utf8'));
} catch (_) { /* noch keine Datei */ }

let saveTimer = null;
function saveBoard() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(BOARD_FILE, JSON.stringify(board, null, 2));
    } catch (e) {
      console.warn('Bestenliste konnte nicht gespeichert werden:', e.message);
    }
  }, 1000);
}

function topList() {
  return Object.values(board)
    .sort((a, b) => b.points - a.points || b.wins - a.wins)
    .slice(0, 10);
}

// ---------------------------------------------------------------- Räume
const rooms = new Map(); // code -> room
let nextPlayerId = 1;

function makeCode() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = '';
    for (let i = 0; i < 4; i++) code += letters[Math.floor(Math.random() * letters.length)];
  } while (rooms.has(code));
  return code;
}

function createRoom(isPublic) {
  const room = {
    code: makeCode(),
    isPublic,
    hostId: null,
    players: new Map(), // id -> player
    state: 'lobby', // lobby | countdown | playing
    roundNo: 0,
    round: null,
    timers: [],
  };
  rooms.set(room.code, room);
  return room;
}

function send(ws, msg) {
  if (ws.readyState === 1) ws.send(JSON.stringify(msg));
}

function broadcast(room, msg) {
  for (const p of room.players.values()) send(p.ws, msg);
}

function roomInfo(room) {
  return {
    type: 'room',
    code: room.code,
    hostId: room.hostId,
    state: room.state,
    isPublic: room.isPublic,
    players: [...room.players.values()].map((p) => ({
      id: p.id, name: p.name, score: p.score, total: p.total, wins: p.wins,
    })),
  };
}

function joinRoom(player, room) {
  leaveRoom(player);
  if (room.players.size >= MAX_PLAYERS) return send(player.ws, { type: 'error', msg: 'Der Raum ist voll.' });
  room.players.set(player.id, player);
  player.room = room;
  player.score = 0;
  if (!room.hostId) room.hostId = player.id;
  broadcast(room, roomInfo(room));
  // Läuft schon eine Runde? Dann direkt mitspielen.
  if (room.state === 'playing' && room.round) {
    send(player.ws, roundMessage(room));
  }
}

function leaveRoom(player) {
  const room = player.room;
  if (!room) return;
  room.players.delete(player.id);
  player.room = null;
  if (room.players.size === 0) {
    room.timers.forEach(clearTimeout);
    rooms.delete(room.code);
    return;
  }
  if (room.hostId === player.id) room.hostId = room.players.keys().next().value;
  broadcast(room, roomInfo(room));
}

function roundMessage(room) {
  const r = room.round;
  return {
    type: 'round',
    world: r.world,
    seed: r.seed,
    level: r.level,
    targetCount: r.targetCount,
    collectibleChance: 1,
    remainingMs: Math.max(0, r.endsAt - Date.now()),
    found: [...r.found.entries()].map(([itemId, pid]) => ({ itemId, playerId: pid })),
  };
}

function startRound(room, worldId) {
  if (room.state !== 'lobby') return;
  const world = Shared.getWorld(worldId);
  room.state = 'countdown';
  room.roundNo++;
  for (const p of room.players.values()) p.score = 0;
  broadcast(room, roomInfo(room));
  broadcast(room, { type: 'countdown', seconds: COUNTDOWN_SECONDS, world: world.id });

  room.timers.push(setTimeout(() => {
    const seed = Math.floor(Math.random() * 2 ** 31);
    const level = Math.min(2 + room.roundNo, 12);
    const gen = Shared.generateRound(seed, world.id, level, {
      targetCount: TARGETS_PER_ROUND,
      collectibleChance: 1,
    });
    const items = new Map();
    for (const t of gen.targets) items.set(t.id, t);
    if (gen.collectible) items.set(gen.collectible.id, gen.collectible);
    room.round = {
      world: world.id, seed, level,
      targetCount: TARGETS_PER_ROUND,
      radius: gen.radius,
      items,
      found: new Map(), // itemId -> playerId
      endsAt: Date.now() + ROUND_SECONDS * 1000,
    };
    room.state = 'playing';
    broadcast(room, roomInfo(room));
    broadcast(room, roundMessage(room));
    room.timers.push(setTimeout(() => endRound(room), ROUND_SECONDS * 1000));
  }, COUNTDOWN_SECONDS * 1000));
}

function handleFind(player, msg) {
  const room = player.room;
  if (!room || room.state !== 'playing' || !room.round) return;
  const now = Date.now();
  if (now - (player.lastFind || 0) < 120) return; // Schutz gegen Dauerklicken
  player.lastFind = now;

  const r = room.round;
  const item = r.items.get(String(msg.id));
  if (!item || r.found.has(item.id)) return;
  // Leichter Schummelschutz: Der Klick muss ungefähr beim Gegenstand sein
  const dx = Number(msg.x) - item.x;
  const dy = Number(msg.y) - item.y;
  if (!(dx * dx + dy * dy <= (r.radius + 30) ** 2)) return;

  r.found.set(item.id, player.id);
  const points = item.kind === 'collectible' ? 3 : 1;
  player.score += points;
  broadcast(room, {
    type: 'found', itemId: item.id, playerId: player.id, name: player.name, points,
  });
  if (r.found.size >= r.items.size) endRound(room);
}

function endRound(room) {
  if (room.state !== 'playing') return;
  room.timers.forEach(clearTimeout);
  room.timers = [];
  room.state = 'lobby';
  const ranking = [...room.players.values()]
    .sort((a, b) => b.score - a.score)
    .map((p) => ({ id: p.id, name: p.name, score: p.score }));
  const best = ranking.length ? ranking[0].score : 0;
  const winners = ranking.filter((p) => p.score === best && best > 0).map((p) => p.id);
  for (const p of room.players.values()) {
    p.total += p.score;
    if (winners.includes(p.id)) p.wins++;
    const key = p.name.toLowerCase();
    const entry = board[key] || (board[key] = { name: p.name, points: 0, wins: 0, rounds: 0 });
    entry.name = p.name;
    entry.points += p.score;
    entry.rounds += 1;
    if (winners.includes(p.id)) entry.wins += 1;
  }
  saveBoard();
  const collectibleItem = room.round && room.round.items.get('c0');
  broadcast(room, {
    type: 'end',
    ranking,
    winners,
    collectible: collectibleItem ? {
      cid: collectibleItem.cid,
      playerId: room.round.found.get('c0') || null,
    } : null,
  });
  room.round = null;
  broadcast(room, roomInfo(room));
  broadcast(room, { type: 'leaderboard', list: topList() });
}

// ---------------------------------------------------------------- WebSocket
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  const player = {
    id: nextPlayerId++, ws, name: 'Gast', room: null, score: 0, total: 0, wins: 0, lastFind: 0,
  };
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  send(ws, { type: 'welcome', id: player.id });
  send(ws, { type: 'leaderboard', list: topList() });

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch (_) { return; }
    if (!msg || typeof msg.type !== 'string') return;

    switch (msg.type) {
      case 'hello': {
        const name = String(msg.name || '').replace(/[<>]/g, '').trim().slice(0, 16);
        player.name = name || 'Gast' + player.id;
        if (player.room) broadcast(player.room, roomInfo(player.room));
        break;
      }
      case 'quick': {
        let room = [...rooms.values()].find((r) => r.isPublic && r.players.size < MAX_PLAYERS);
        if (!room) room = createRoom(true);
        joinRoom(player, room);
        break;
      }
      case 'create':
        joinRoom(player, createRoom(false));
        break;
      case 'join': {
        const room = rooms.get(String(msg.code || '').toUpperCase().trim());
        if (!room) send(ws, { type: 'error', msg: 'Diesen Raum gibt es nicht.' });
        else joinRoom(player, room);
        break;
      }
      case 'leave':
        leaveRoom(player);
        send(ws, { type: 'left' });
        break;
      case 'start':
        if (player.room && player.room.hostId === player.id) startRound(player.room, msg.world);
        break;
      case 'find':
        handleFind(player, msg);
        break;
      case 'emote': {
        const emotes = ['👍', '😂', '😮', '🔥', '😭', '🎉'];
        if (player.room && emotes.includes(msg.e)) {
          broadcast(player.room, { type: 'emote', name: player.name, e: msg.e });
        }
        break;
      }
      default:
        break;
    }
  });

  ws.on('close', () => leaveRoom(player));
});

// Tote Verbindungen aufräumen
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, 15000);

server.listen(PORT, () => {
  console.log('');
  console.log('  🌾 Heuhaufen-Helden läuft!');
  console.log(`  Auf diesem PC:      http://localhost:${PORT}`);
  for (const list of Object.values(os.networkInterfaces())) {
    for (const net of list || []) {
      if (net.family === 'IPv4' && !net.internal) {
        console.log(`  Im gleichen WLAN:   http://${net.address}:${PORT}`);
      }
    }
  }
  console.log('');
});

module.exports = { server, rooms };
