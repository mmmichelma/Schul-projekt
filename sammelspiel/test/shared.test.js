const test = require('node:test');
const assert = require('node:assert');
const Shared = require('../public/shared.js');

test('gleicher Seed ergibt gleiche Runde (wichtig für Online)', () => {
  const a = Shared.generateRound(42, 'heu', 3, { collectibleChance: 1 });
  const b = Shared.generateRound(42, 'heu', 3, { collectibleChance: 1 });
  assert.deepStrictEqual(a, b);
});

test('Anzahl Ziele wächst mit dem Level', () => {
  for (let l = 1; l <= 20; l++) {
    const r = Shared.generateRound(l, 'wald', l);
    assert.strictEqual(r.targets.length, Shared.difficulty(l).targets);
  }
});

test('Ziele liegen im Spielfeld und nicht aufeinander', () => {
  const r = Shared.generateRound(7, 'schatz', 15, { collectibleChance: 1 });
  for (const t of r.targets) {
    assert.ok(t.x > 0 && t.x < Shared.W && t.y > 0 && t.y < Shared.H);
    for (const u of r.targets) {
      if (u !== t) assert.ok(Math.hypot(u.x - t.x, u.y - t.y) >= 45);
    }
  }
  assert.ok(r.collectible);
  assert.ok(Shared.findCollectible(r.collectible.cid));
});

test('jede Welt hat 5 Sammelgegenstände mit gültiger Seltenheit', () => {
  for (const w of Shared.WORLDS) {
    assert.strictEqual(w.collectibles.length, 5);
    for (const c of w.collectibles) assert.ok(Shared.RARITY[c.rarity], c.id);
  }
});
