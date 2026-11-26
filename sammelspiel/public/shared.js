/*
 * Gemeinsamer Spielkern – wird vom Browser UND vom Server benutzt.
 * Wichtig: Alles hier ist deterministisch (gleicher Seed => gleiche Runde),
 * damit im Online-Modus alle Spieler dieselben Gegenstände an denselben
 * Stellen sehen.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Shared = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Logische Größe des Spielfelds (wird im Browser auf die Bildschirmgröße skaliert)
  const W = 1000;
  const H = 625;

  // Kleiner, schneller Zufallsgenerator mit Seed (mulberry32)
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const RARITY = {
    gewoehnlich: { name: 'Gewöhnlich', weight: 50, coins: 20, color: '#9aa5b1' },
    selten: { name: 'Selten', weight: 30, coins: 40, color: '#3b9bff' },
    episch: { name: 'Episch', weight: 15, coins: 90, color: '#b260ff' },
    legendaer: { name: 'Legendär', weight: 5, coins: 220, color: '#ffb300' },
  };

  /*
   * Die Welten. Jede neue Welt wird freigeschaltet, wenn man in der
   * vorherigen Welt ein bestimmtes Level erreicht hat und genug Münzen hat.
   * radius = Trefferradius des gesuchten Gegenstands (logische Pixel)
   */
  const WORLDS = [
    {
      id: 'heu', name: 'Heuhaufen', emoji: '🌾', target: 'Nadel', targetPl: 'Nadeln',
      cost: 0, needLevel: 0, radius: 15,
      text: 'Der Klassiker: Finde die Nadeln im Heuhaufen!',
      collectibles: [
        { id: 'heu1', name: 'Alter Schlüssel', icon: '🗝️', rarity: 'gewoehnlich' },
        { id: 'heu2', name: 'Marienkäfer', icon: '🐞', rarity: 'gewoehnlich' },
        { id: 'heu3', name: 'Verlorene Münze', icon: '🪙', rarity: 'selten' },
        { id: 'heu4', name: 'Ehering', icon: '💍', rarity: 'episch' },
        { id: 'heu5', name: 'Goldene Nadel', icon: '🏆', rarity: 'legendaer' },
      ],
    },
    {
      id: 'strand', name: 'Strand', emoji: '🏖️', target: 'Muschel', targetPl: 'Muscheln',
      cost: 150, needLevel: 3, radius: 13,
      text: 'Zwischen Kieseln und Sand verstecken sich rosa Muscheln.',
      collectibles: [
        { id: 'str1', name: 'Krabbe', icon: '🦀', rarity: 'gewoehnlich' },
        { id: 'str2', name: 'Seestern', icon: '⭐', rarity: 'gewoehnlich' },
        { id: 'str3', name: 'Flaschenpost', icon: '🍾', rarity: 'selten' },
        { id: 'str4', name: 'Baby-Schildkröte', icon: '🐢', rarity: 'episch' },
        { id: 'str5', name: 'Antike Vase', icon: '🏺', rarity: 'legendaer' },
      ],
    },
    {
      id: 'wald', name: 'Herbstwald', emoji: '🍂', target: 'Pilz', targetPl: 'Pilze',
      cost: 400, needLevel: 3, radius: 13,
      text: 'Unter dem bunten Laub wachsen kleine Fliegenpilze.',
      collectibles: [
        { id: 'wal1', name: 'Eichel', icon: '🌰', rarity: 'gewoehnlich' },
        { id: 'wal2', name: 'Schnecke', icon: '🐌', rarity: 'gewoehnlich' },
        { id: 'wal3', name: 'Igel', icon: '🦔', rarity: 'selten' },
        { id: 'wal4', name: 'Eichhörnchen', icon: '🐿️', rarity: 'episch' },
        { id: 'wal5', name: 'Einhorn', icon: '🦄', rarity: 'legendaer' },
      ],
    },
    {
      id: 'bonbon', name: 'Bonbonladen', emoji: '🍬', target: 'Goldbonbon', targetPl: 'Goldbonbons',
      cost: 800, needLevel: 3, radius: 13,
      text: 'Tausende Bonbons – aber nur wenige sind aus Gold.',
      collectibles: [
        { id: 'bon1', name: 'Lolli', icon: '🍭', rarity: 'gewoehnlich' },
        { id: 'bon2', name: 'Donut', icon: '🍩', rarity: 'gewoehnlich' },
        { id: 'bon3', name: 'Cupcake', icon: '🧁', rarity: 'selten' },
        { id: 'bon4', name: 'Geburtstagstorte', icon: '🎂', rarity: 'episch' },
        { id: 'bon5', name: 'Goldenes Ticket', icon: '🎫', rarity: 'legendaer' },
      ],
    },
    {
      id: 'weltall', name: 'Weltall', emoji: '🌌', target: 'UFO', targetPl: 'UFOs',
      cost: 1500, needLevel: 3, radius: 13,
      text: 'Zwischen Milliarden Sternen fliegen winzige UFOs.',
      collectibles: [
        { id: 'all1', name: 'Komet', icon: '☄️', rarity: 'gewoehnlich' },
        { id: 'all2', name: 'Satellit', icon: '🛰️', rarity: 'gewoehnlich' },
        { id: 'all3', name: 'Astronaut', icon: '🧑‍🚀', rarity: 'selten' },
        { id: 'all4', name: 'Rakete', icon: '🚀', rarity: 'episch' },
        { id: 'all5', name: 'Außerirdischer', icon: '👽', rarity: 'legendaer' },
      ],
    },
    {
      id: 'schatz', name: 'Schatzkammer', emoji: '💎', target: 'Diamant', targetPl: 'Diamanten',
      cost: 2500, needLevel: 3, radius: 12,
      text: 'Ein Berg aus Gold und Edelsteinen. Finde die echten Diamanten!',
      collectibles: [
        { id: 'sch1', name: 'Kelch', icon: '🏅', rarity: 'gewoehnlich' },
        { id: 'sch2', name: 'Schatzkarte', icon: '🗺️', rarity: 'gewoehnlich' },
        { id: 'sch3', name: 'Zauberstab', icon: '🪄', rarity: 'selten' },
        { id: 'sch4', name: 'Drachenei', icon: '🥚', rarity: 'episch' },
        { id: 'sch5', name: 'Königskrone', icon: '👑', rarity: 'legendaer' },
      ],
    },
  ];

  function getWorld(id) {
    return WORLDS.find((w) => w.id === id) || WORLDS[0];
  }

  // Je höher das Level, desto mehr Gegenstände, mehr Ablenkung, kleinere Ziele
  function difficulty(level) {
    const l = Math.max(1, level | 0);
    return {
      targets: Math.min(5 + l, 20),
      decoys: Math.min(900 + l * 180, 3200),
      size: Math.max(0.6, 1 - (l - 1) * 0.035),
      cover: Math.min(0.35, 0.06 + l * 0.025), // Anteil der Ablenkung, die ÜBER den Zielen liegt
    };
  }

  /*
   * Erzeugt die Positionen aller Ziele + (vielleicht) einen Sammelgegenstand.
   * opts.targetCount: Anzahl Ziele (sonst nach Level)
   * opts.collectibleChance: 0..1
   * opts.luck: Glücksklee-Stufe (seltenere Funde wahrscheinlicher)
   */
  function generateRound(seed, worldId, level, opts) {
    opts = opts || {};
    const world = getWorld(worldId);
    const diff = difficulty(level);
    const r = rng(seed);
    const count = opts.targetCount || diff.targets;
    const margin = 30;
    const targets = [];
    let tries = 0;
    while (targets.length < count && tries < 5000) {
      tries++;
      const x = margin + r() * (W - 2 * margin);
      const y = margin + r() * (H - 2 * margin);
      if (targets.some((t) => (t.x - x) ** 2 + (t.y - y) ** 2 < 45 * 45)) continue;
      targets.push({
        id: 't' + targets.length,
        kind: 'target',
        x, y,
        a: r() * Math.PI * 2,
        s: diff.size * (0.85 + r() * 0.3),
      });
    }

    let collectible = null;
    if (r() < (opts.collectibleChance || 0)) {
      const luck = opts.luck || 0;
      const items = world.collectibles;
      const weights = items.map((c) => RARITY[c.rarity].weight * (c.rarity === 'gewoehnlich' ? 1 : 1 + luck * 0.5));
      const total = weights.reduce((a, b) => a + b, 0);
      let pick = r() * total;
      let chosen = items[0];
      for (let i = 0; i < items.length; i++) {
        pick -= weights[i];
        if (pick <= 0) { chosen = items[i]; break; }
      }
      let cx, cy, ok = false;
      for (let i = 0; i < 300 && !ok; i++) {
        cx = margin + r() * (W - 2 * margin);
        cy = margin + r() * (H - 2 * margin);
        ok = !targets.some((t) => (t.x - cx) ** 2 + (t.y - cy) ** 2 < 40 * 40);
      }
      collectible = { id: 'c0', kind: 'collectible', cid: chosen.id, x: cx, y: cy, a: (r() - 0.5) * 1.2, s: 1 };
    }
    return { world: world.id, level, targets, collectible, radius: world.radius };
  }

  function findCollectible(cid) {
    for (const w of WORLDS) {
      const c = w.collectibles.find((x) => x.id === cid);
      if (c) return Object.assign({ world: w.id }, c);
    }
    return null;
  }

  return { W, H, rng, WORLDS, RARITY, getWorld, difficulty, generateRound, findCollectible };
});
