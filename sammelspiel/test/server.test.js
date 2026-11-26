const test = require('node:test');
const assert = require('node:assert');
const WebSocket = require('ws');
const Shared = require('../public/shared.js');

process.env.PORT = '0';
const { server } = require('../server.js');

function client(port) {
  return new Promise((resolve) => {
    const ws = new WebSocket('ws://localhost:' + port);
    const queue = [];
    const waiters = [];
    ws.on('message', (d) => {
      const m = JSON.parse(d);
      const i = waiters.findIndex((w) => w.type === m.type);
      if (i >= 0) waiters.splice(i, 1)[0].resolve(m); else queue.push(m);
    });
    ws.next = (type) => {
      const i = queue.findIndex((m) => m.type === type);
      if (i >= 0) return Promise.resolve(queue.splice(i, 1)[0]);
      return new Promise((r) => waiters.push({ type, resolve: r }));
    };
    ws.sendJ = (m) => ws.send(JSON.stringify(m));
    ws.on('open', () => resolve(ws));
  });
}

test('zwei Spieler: Raum, Runde, Punkte', { timeout: 15000 }, async () => {
  await new Promise((r) => (server.listening ? r() : server.once('listening', r)));
  const port = server.address().port;
  const a = await client(port);
  const b = await client(port);
  a.sendJ({ type: 'hello', name: 'Anna' });
  b.sendJ({ type: 'hello', name: 'Ben' });
  a.sendJ({ type: 'create' });
  const room = await a.next('room');
  b.sendJ({ type: 'join', code: room.code });
  let rb;
  do { rb = await b.next('room'); } while (rb.players.length < 2);
  assert.strictEqual(rb.players.length, 2);

  a.sendJ({ type: 'start', world: 'strand' });
  const ra = await a.next('round');
  const rb2 = await b.next('round');
  assert.strictEqual(ra.seed, rb2.seed);

  // Beide Clients berechnen dieselben Positionen wie der Server
  const gen = Shared.generateRound(ra.seed, ra.world, ra.level, {
    targetCount: ra.targetCount, collectibleChance: ra.collectibleChance,
  });
  const t0 = gen.targets[0];
  a.sendJ({ type: 'find', id: t0.id, x: t0.x, y: t0.y });
  const f = await b.next('found');
  assert.strictEqual(f.itemId, t0.id);
  assert.strictEqual(f.name, 'Anna');

  // Doppelt finden geht nicht, falsche Position zählt nicht
  b.sendJ({ type: 'find', id: t0.id, x: t0.x, y: t0.y });
  const t1 = gen.targets[1];
  b.sendJ({ type: 'find', id: t1.id, x: t1.x + 300, y: t1.y });
  await new Promise((r) => setTimeout(r, 200));

  // Rest finden -> Runde endet
  const all = gen.targets.slice(1).concat([gen.collectible]);
  for (const it of all) {
    b.sendJ({ type: 'find', id: it.id, x: it.x, y: it.y });
    await new Promise((r) => setTimeout(r, 130));
  }
  const end = await a.next('end');
  assert.strictEqual(end.ranking[0].name, 'Ben');
  assert.strictEqual(end.ranking[0].score, 14 + 3);
  assert.strictEqual(end.ranking[1].score, 1);
  a.close(); b.close();
  server.close();
  process.exit(0);
});
