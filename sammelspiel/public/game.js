/*
 * Heuhaufen-Helden – Spiel im Browser
 * Solo-Modus, Shop, Sammelalbum, Erfolge und Online-Modus.
 */
(function () {
  'use strict';
  const { W, H, WORLDS, RARITY } = Shared;
  const ART = WorldArt.art;
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => document.querySelectorAll(s);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ================================================================ Spielstand
  const SAVE_KEY = 'heuhaufen-helden-v1';
  function defaultSave() {
    return {
      coins: 0,
      unlocked: { heu: true },
      levels: { heu: 1 },
      upgrades: { lupe: 0, auge: 0, zeit: 0, klee: 0, gold: 0 },
      items: { magnet: 3, freeze: 1 },
      album: {},
      stats: { found: 0, collectibles: 0, rounds: 0, wins: 0, perfect: 0, onlineRounds: 0, onlineWins: 0, bestLevel: 1 },
      ach: {},
      name: '',
      sound: true,
      lupeOn: true,
      tutorial: false,
    };
  }
  function load() {
    const base = defaultSave();
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        for (const k of Object.keys(base)) {
          if (data[k] === undefined) continue;
          if (base[k] && typeof base[k] === 'object') Object.assign(base[k], data[k]);
          else base[k] = data[k];
        }
      }
    } catch (_) { /* privater Modus o. Ä. */ }
    return base;
  }
  let S = load();
  function save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (_) { /* egal */ }
    renderTop();
  }

  // ================================================================ Daten: Shop & Erfolge
  const LUPE = [{ r: 0, z: 1 }, { r: 65, z: 2 }, { r: 85, z: 2.5 }, { r: 105, z: 3 }];
  const UPGRADES = [
    { id: 'lupe', icon: '🔍', name: 'Lupe', costs: [80, 250, 600], desc: 'Vergrößert die Stelle unter deiner Maus. Jede Stufe: größer und stärker.' },
    { id: 'auge', icon: '🦅', name: 'Adlerauge', costs: [60, 180, 450], desc: 'Du darfst ungenauer klicken: +3 Pixel Trefferbereich pro Stufe.' },
    { id: 'zeit', icon: '⏳', name: 'Sanduhr', costs: [100, 300, 700], desc: '+10 Sekunden in jeder Solo-Runde pro Stufe.' },
    { id: 'klee', icon: '🍀', name: 'Glücksklee', costs: [120, 350, 800], desc: 'Sammelgegenstände tauchen öfter auf und sind öfter selten.' },
    { id: 'gold', icon: '🤑', name: 'Goldfinger', costs: [150, 400, 900], desc: '+20 % Münzen für alles, was du findest.' },
  ];
  const ITEMS = [
    { id: 'magnet', icon: '🧲', name: 'Magnet', cost: 40, desc: 'Zeigt dir 3,5 Sekunden lang ungefähr, wo etwas liegt.' },
    { id: 'freeze', icon: '⏸️', name: 'Zeitstopp', cost: 60, desc: 'Hält die Zeit 10 Sekunden lang an (nur Solo).' },
  ];

  const albumUnique = () => Object.keys(S.album).length;
  const legendCount = () => Object.keys(S.album).filter((id) => (Shared.findCollectible(id) || {}).rarity === 'legendaer').length;
  const unlockedCount = () => WORLDS.filter((w) => S.unlocked[w.id]).length;
  const totalCollectibles = WORLDS.reduce((n, w) => n + w.collectibles.length, 0);

  const ACH = [
    { id: 'first', icon: '📍', name: 'Erster Fund', desc: 'Finde deinen ersten Gegenstand.', goal: 1, val: () => S.stats.found, reward: 20 },
    { id: 'f100', icon: '🔎', name: 'Suchprofi', desc: 'Finde 100 Gegenstände.', goal: 100, val: () => S.stats.found, reward: 100 },
    { id: 'f500', icon: '🕵️', name: 'Meisterdetektiv', desc: 'Finde 500 Gegenstände.', goal: 500, val: () => S.stats.found, reward: 300 },
    { id: 'f2000', icon: '🦸', name: 'Heuhaufen-Held', desc: 'Finde 2000 Gegenstände.', goal: 2000, val: () => S.stats.found, reward: 1000 },
    { id: 'col1', icon: '✨', name: 'Glücksfund', desc: 'Finde deinen ersten Sammelgegenstand.', goal: 1, val: albumUnique, reward: 30 },
    { id: 'col15', icon: '📚', name: 'Sammler', desc: 'Sammle 15 verschiedene Gegenstände.', goal: 15, val: albumUnique, reward: 300 },
    { id: 'colall', icon: '👑', name: 'Album komplett', desc: 'Sammle alle Gegenstände.', goal: totalCollectibles, val: albumUnique, reward: 2000 },
    { id: 'leg', icon: '🌟', name: 'Legendär!', desc: 'Finde einen legendären Gegenstand.', goal: 1, val: legendCount, reward: 200 },
    { id: 'perfect', icon: '🎯', name: 'Scharfschütze', desc: 'Schaffe eine Runde ohne Fehlklick.', goal: 1, val: () => S.stats.perfect, reward: 50 },
    { id: 'perfect10', icon: '🏹', name: 'Robin Hood', desc: 'Schaffe 10 Runden ohne Fehlklick.', goal: 10, val: () => S.stats.perfect, reward: 300 },
    { id: 'lvl5', icon: '⭐', name: 'Aufsteiger', desc: 'Erreiche Level 5 in einer Welt.', goal: 5, val: () => S.stats.bestLevel, reward: 80 },
    { id: 'lvl10', icon: '🚀', name: 'Level 10', desc: 'Erreiche Level 10 in einer Welt.', goal: 10, val: () => S.stats.bestLevel, reward: 250 },
    { id: 'worlds', icon: '🗺️', name: 'Weltenbummler', desc: 'Schalte alle Welten frei.', goal: WORLDS.length, val: unlockedCount, reward: 500 },
    { id: 'online1', icon: '🌐', name: 'Online-Debüt', desc: 'Spiele eine Online-Runde.', goal: 1, val: () => S.stats.onlineRounds, reward: 30 },
    { id: 'onwin', icon: '🥇', name: 'Champion', desc: 'Gewinne eine Online-Runde.', goal: 1, val: () => S.stats.onlineWins, reward: 100 },
    { id: 'onwin10', icon: '🏆', name: 'Unbesiegbar', desc: 'Gewinne 10 Online-Runden.', goal: 10, val: () => S.stats.onlineWins, reward: 500 },
    { id: 'rich', icon: '💰', name: 'Reich!', desc: 'Besitze 1000 Münzen auf einmal.', goal: 1000, val: () => S.coins, reward: 100 },
  ];

  function checkAchievements() {
    let changed = false;
    for (const a of ACH) {
      if (S.ach[a.id]) continue;
      if (a.val() >= a.goal) {
        S.ach[a.id] = Date.now();
        S.coins += a.reward;
        changed = true;
        toast(`${a.icon} Erfolg: <b>${esc(a.name)}</b> &nbsp;+${a.reward} 🪙`, 'gold');
        SFX.rare();
      }
    }
    if (changed) save();
  }

  const coinMult = () => 1 + S.upgrades.gold * 0.2;
  function earn(n) {
    const v = Math.round(n * coinMult());
    S.coins += v;
    return v;
  }

  // ================================================================ Töne (ohne Dateien, mit WebAudio)
  let actx = null;
  function beep(freqs, dur, type, vol) {
    if (!S.sound) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const t = actx.currentTime;
      freqs.forEach((f, i) => {
        const o = actx.createOscillator();
        const g = actx.createGain();
        o.type = type || 'sine';
        o.frequency.value = f;
        g.gain.setValueAtTime(vol || 0.12, t + i * dur);
        g.gain.exponentialRampToValueAtTime(0.001, t + i * dur + dur * 1.6);
        o.connect(g).connect(actx.destination);
        o.start(t + i * dur);
        o.stop(t + i * dur + dur * 1.7);
      });
    } catch (_) { /* kein Ton möglich */ }
  }
  const SFX = {
    found: () => beep([880, 1320], 0.06, 'triangle'),
    other: () => beep([440], 0.05, 'triangle', 0.06),
    miss: () => beep([150], 0.14, 'sawtooth', 0.06),
    rare: () => beep([660, 880, 1100, 1320, 1760], 0.07, 'triangle'),
    win: () => beep([523, 659, 784, 1047], 0.12, 'triangle'),
    lose: () => beep([392, 330, 262], 0.18),
    tick: () => beep([1000], 0.03, 'square', 0.03),
    buy: () => beep([700, 1050], 0.05, 'square', 0.05),
  };

  // ================================================================ Kleine Helfer
  function toast(html, cls) {
    const d = document.createElement('div');
    d.className = 'toast ' + (cls || '');
    d.innerHTML = html;
    $('#toasts').appendChild(d);
    setTimeout(() => d.remove(), 3200);
  }

  function showModal(html) {
    $('#modal').innerHTML = html;
    $('#overlay').classList.remove('hidden');
  }
  function hideModal() { $('#overlay').classList.add('hidden'); }

  function renderTop() {
    $('#coins').textContent = S.coins;
    $('#foundTotal').textContent = S.stats.found;
    $('#soundBtn').textContent = S.sound ? '🔊' : '🔇';
  }

  // ================================================================ Szene aufbauen
  // Zwei Ebenen: "unten" (Hintergrund + meiste Ablenkung) und "oben" (ein paar
  // Objekte, die teilweise über den gesuchten Gegenständen liegen).
  function buildLayers(round, seed, level, res) {
    const art = ART[round.world];
    const diff = Shared.difficulty(level);
    const make = () => {
      const c = document.createElement('canvas');
      c.width = Math.round(W * res);
      c.height = Math.round(H * res);
      const x = c.getContext('2d');
      x.scale(res, res);
      return [c, x];
    };
    const [bottom, b] = make();
    const [top, t] = make();
    const r = Shared.rng((seed ^ 0x5bd1e995) >>> 0);
    art.bg(b, r);
    const items = round.targets.concat(round.collectible ? [round.collectible] : []);
    const safe = round.radius * 0.6 + art.decoyRadius * 1.3;
    for (let i = 0; i < diff.decoys; i++) {
      const x = r() * W;
      const y = r() * H;
      const s = 0.8 + r() * 0.4;
      let onTop = r() < diff.cover;
      if (onTop) {
        for (const it of items) {
          if ((it.x - x) ** 2 + (it.y - y) ** 2 < safe * safe) { onTop = false; break; }
        }
      }
      art.decoy(onTop ? t : b, r, x, y, s);
    }
    return { bottom, top };
  }

  function drawItem(ctx, world, it) {
    if (it.kind === 'collectible') WorldArt.drawCollectible(ctx, it);
    else ART[world].target(ctx, it);
  }

  const thumbCache = {};
  function worldThumb(id) {
    if (thumbCache[id]) return thumbCache[id];
    const res = 0.34;
    const round = Shared.generateRound(1234, id, 2, { targetCount: 8 });
    const layers = buildLayers(round, 1234, 2, res);
    const c = document.createElement('canvas');
    c.width = layers.bottom.width;
    c.height = layers.bottom.height;
    const x = c.getContext('2d');
    x.drawImage(layers.bottom, 0, 0);
    x.save();
    x.scale(res, res);
    round.targets.forEach((t) => drawItem(x, id, t));
    x.restore();
    x.drawImage(layers.top, 0, 0);
    thumbCache[id] = c.toDataURL('image/jpeg', 0.8);
    return thumbCache[id];
  }

  // ================================================================ Bildschirme
  let current = 'menu';
  function go(name) {
    current = name;
    $$('.screen').forEach((s) => s.classList.toggle('active', s.id === 'screen-' + name));
    $$('#nav button').forEach((b) => b.classList.toggle('active', b.dataset.go === name));
    document.body.classList.toggle('playing', name === 'game');
    if (name === 'menu') renderWorlds();
    if (name === 'shop') renderShop();
    if (name === 'album') renderAlbum();
    if (name === 'erfolge') renderAch();
    if (name === 'online') { ensureConnection(); renderOnline(); }
    window.scrollTo(0, 0);
  }

  function worldRequirement(i) {
    const w = WORLDS[i];
    const prev = WORLDS[i - 1];
    const levelOk = !prev || (S.levels[prev.id] || 1) >= w.needLevel;
    const coinOk = S.coins >= w.cost;
    return { w, prev, levelOk, coinOk };
  }

  function renderWorlds() {
    const grid = $('#worldGrid');
    grid.innerHTML = '';
    WORLDS.forEach((w, i) => {
      const unlocked = !!S.unlocked[w.id];
      const got = w.collectibles.filter((c) => S.album[c.id]).length;
      const card = document.createElement('div');
      card.className = 'card world' + (unlocked ? '' : ' locked');
      let body;
      if (unlocked) {
        body = `
          <div class="name">${w.emoji} ${esc(w.name)}</div>
          <div class="desc">${esc(w.text)}</div>
          <div class="meta"><span>⭐ Level ${S.levels[w.id] || 1}</span><span>📖 ${got}/${w.collectibles.length}</span></div>
          <button class="btn green">▶️ Spielen</button>`;
      } else {
        const req = worldRequirement(i);
        const canUnlock = req.levelOk && req.coinOk && (!req.prev || S.unlocked[req.prev.id]);
        body = `
          <div class="name">${w.emoji} ${esc(w.name)}</div>
          <div class="desc">Gesucht: ${esc(w.targetPl)}</div>
          <div class="req">
            <div class="${req.levelOk ? 'ok' : 'no'}">${req.levelOk ? '✔' : '✘'} Level ${w.needLevel} in „${esc(req.prev.name)}“</div>
            <div class="${req.coinOk ? 'ok' : 'no'}">${req.coinOk ? '✔' : '✘'} ${w.cost} 🪙</div>
          </div>
          <button class="btn" ${canUnlock ? '' : 'disabled'} data-unlock="${w.id}">🔓 Freischalten</button>`;
      }
      card.innerHTML = `<img class="thumb" alt="" src="${worldThumb(w.id)}">${unlocked ? '' : '<span class="lockbadge">🔒 Gesperrt</span>'}<div class="body">${body}</div>`;
      if (unlocked) card.addEventListener('click', () => startSolo(w.id));
      grid.appendChild(card);
    });
    grid.querySelectorAll('[data-unlock]').forEach((b) => b.addEventListener('click', (e) => {
      e.stopPropagation();
      unlockWorld(b.dataset.unlock);
    }));
  }

  function unlockWorld(id) {
    const i = WORLDS.findIndex((w) => w.id === id);
    const req = worldRequirement(i);
    if (!req.levelOk || !req.coinOk) return;
    S.coins -= req.w.cost;
    S.unlocked[id] = true;
    S.levels[id] = S.levels[id] || 1;
    save();
    SFX.rare();
    toast(`🎉 Neue Welt freigeschaltet: <b>${req.w.emoji} ${esc(req.w.name)}</b>`, 'gold');
    checkAchievements();
    renderWorlds();
  }

  function renderShop() {
    const ug = $('#upgradeGrid');
    ug.innerHTML = '';
    for (const u of UPGRADES) {
      const lvl = S.upgrades[u.id];
      const max = lvl >= u.costs.length;
      const cost = u.costs[lvl];
      const card = document.createElement('div');
      card.className = 'card shopcard';
      card.innerHTML = `
        <div class="icon">${u.icon}</div>
        <div class="name">${esc(u.name)}</div>
        <div class="desc">${esc(u.desc)}</div>
        <div class="levels">${u.costs.map((_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('')}</div>
        <button class="btn" ${max || S.coins < cost ? 'disabled' : ''}>${max ? '✔ Maximal' : `Stufe ${lvl + 1} – ${cost} 🪙`}</button>`;
      card.querySelector('button').addEventListener('click', () => {
        if (max || S.coins < cost) return;
        S.coins -= cost;
        S.upgrades[u.id]++;
        if (u.id === 'lupe') S.lupeOn = true;
        save();
        SFX.buy();
        toast(`${u.icon} ${esc(u.name)} ist jetzt Stufe ${S.upgrades[u.id]}!`);
        renderShop();
      });
      ug.appendChild(card);
    }
    const ig = $('#itemGrid');
    ig.innerHTML = '';
    for (const it of ITEMS) {
      const card = document.createElement('div');
      card.className = 'card shopcard';
      card.innerHTML = `
        <div class="icon">${it.icon}</div>
        <div class="name">${esc(it.name)} <small>(du hast ${S.items[it.id]})</small></div>
        <div class="desc">${esc(it.desc)}</div>
        <button class="btn" ${S.coins < it.cost ? 'disabled' : ''}>Kaufen – ${it.cost} 🪙</button>`;
      card.querySelector('button').addEventListener('click', () => {
        if (S.coins < it.cost) return;
        S.coins -= it.cost;
        S.items[it.id]++;
        save();
        SFX.buy();
        renderShop();
      });
      ig.appendChild(card);
    }
  }

  function renderAlbum() {
    const n = albumUnique();
    $('#albumProgress > div').style.width = (n / totalCollectibles) * 100 + '%';
    $('#albumProgress > span').textContent = `${n} von ${totalCollectibles} gesammelt`;
    const list = $('#albumList');
    list.innerHTML = '';
    for (const w of WORLDS) {
      const got = w.collectibles.filter((c) => S.album[c.id]).length;
      const sec = document.createElement('div');
      sec.className = 'album-world';
      sec.innerHTML = `<h2>${w.emoji} ${esc(w.name)} <small>${got}/${w.collectibles.length}${got === w.collectibles.length ? ' · ✔ komplett!' : ''}</small></h2>
        <div class="album-row">${w.collectibles.map((c) => {
          const has = S.album[c.id];
          const rar = RARITY[c.rarity];
          return `<div class="sticker ${has ? '' : 'missing'}" style="border-color:${has ? rar.color : ''}">
            <div class="em">${c.icon}</div>
            <div class="nm">${has ? esc(c.name) : '???'}</div>
            <div class="rar" style="color:${rar.color}">${rar.name}</div>
            ${has && has > 1 ? `<div class="cnt">${has}× gefunden</div>` : ''}
          </div>`;
        }).join('')}</div>`;
      list.appendChild(sec);
    }
  }

  function renderAch() {
    const list = $('#achList');
    list.innerHTML = '';
    for (const a of ACH) {
      const done = !!S.ach[a.id];
      const v = Math.min(a.val(), a.goal);
      const card = document.createElement('div');
      card.className = 'card ach' + (done ? ' done' : '');
      card.innerHTML = `<div class="icon">${a.icon}</div>
        <div class="txt"><div class="name">${esc(a.name)}</div><div class="desc">${esc(a.desc)} · ${a.reward} 🪙</div>
        ${done ? '<div class="desc">✔ Geschafft</div>' : `<div class="progress"><div style="width:${(v / a.goal) * 100}%"></div></div>`}</div>`;
      list.appendChild(card);
    }
  }

  // ================================================================ Spielrunde
  const canvas = $('#game');
  const ctx = canvas.getContext('2d');
  let G = null; // aktuelle Runde
  let rafId = 0;
  const pointer = { x: 0, y: 0, inside: false, touch: false };

  function startSolo(worldId) {
    const level = S.levels[worldId] || 1;
    const seed = (Math.random() * 2 ** 31) >>> 0;
    const round = Shared.generateRound(seed, worldId, level, {
      collectibleChance: Math.min(0.9, 0.35 + S.upgrades.klee * 0.12),
      luck: S.upgrades.klee,
    });
    const duration = 55 + Math.min(35, level * 3) + S.upgrades.zeit * 10;
    beginRound({ mode: 'solo', round, seed, level, duration });
    if (!S.tutorial) {
      G.paused = true;
      const w = Shared.getWorld(worldId);
      showModal(`<div class="big-emoji">🧐</div><h2>So geht's</h2>
        <p>Im Bild sind <b>${round.targets.length} ${esc(w.targetPl)}</b> versteckt. Klicke sie an, bevor die Zeit abläuft!</p>
        <p>Daneben klicken kostet <b>2 Sekunden</b>. Manchmal ist auch ein <b>Sammelgegenstand</b> ✨ versteckt – der kommt in dein Album.</p>
        <p>Mit Münzen kaufst du im Shop eine <b>Lupe</b> 🔍 und mehr. Wenn du Level 3 erreichst, kannst du eine neue Welt freischalten.</p>
        <button class="btn big green" id="tutOk">Los geht's!</button>`);
      $('#tutOk').addEventListener('click', () => {
        S.tutorial = true;
        save();
        hideModal();
        countdown(3, () => { if (G) G.paused = false; });
      });
    } else {
      G.paused = true;
      countdown(3, () => { if (G) G.paused = false; });
    }
  }

  function countdown(n, done, stepMs) {
    const el = $('#countdown');
    el.classList.remove('hidden');
    let k = n;
    const step = () => {
      if (k <= 0) { el.classList.add('hidden'); done(); return; }
      el.textContent = k;
      SFX.tick();
      k--;
      setTimeout(step, stepMs || 700);
    };
    step();
  }

  function beginRound(o) {
    hideModal();
    const items = o.round.targets.concat(o.round.collectible ? [o.round.collectible] : []);
    G = Object.assign({
      world: Shared.getWorld(o.round.world),
      items,
      found: new Map(),
      pending: new Set(),
      timeLeft: o.duration,
      frozenUntil: 0,
      magnet: null,
      misses: 0,
      lockUntil: 0,
      effects: [],
      ended: false,
      paused: false,
      coins: 0,
      myFinds: 0,
      newCollectible: null,
      scores: {},
      last: performance.now(),
    }, o);
    G.layers = buildLayers(o.round, o.seed, o.level, 2);
    go('game');
    $('#scorePanel').classList.toggle('hidden', G.mode !== 'online');
    $('#feed').innerHTML = '';
    drawPreview();
    resizeCanvas();
    updateHud();
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(frame);
  }

  function drawPreview() {
    const p = $('#preview');
    const c = p.getContext('2d');
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, p.width, p.height);
    c.setTransform(2, 0, 0, 2, 0, 0);
    ART[G.world.id].target(c, { x: 30, y: 20, a: -0.4, s: 1.35 });
  }

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(300, Math.round(rect.width * dpr));
    canvas.width = w;
    canvas.height = Math.round((w * H) / W);
  }
  window.addEventListener('resize', () => { if (G) resizeCanvas(); });

  function targetsFound() {
    let n = 0;
    for (const id of G.found.keys()) if (id[0] === 't') n++;
    return n;
  }

  function updateHud() {
    if (!G) return;
    const w = G.world;
    $('#hudTitle').textContent = G.mode === 'online'
      ? `🌐 Online · ${w.emoji} ${w.name}`
      : `${w.emoji} ${w.name} · Level ${G.level}`;
    $('#hudFound').textContent = targetsFound();
    $('#hudTotal').textContent = G.round.targets.length;
    $('#hudName').textContent = w.targetPl;
    const m = $('#toolMagnet');
    m.querySelector('b').textContent = S.items.magnet;
    m.disabled = S.items.magnet <= 0;
    const f = $('#toolFreeze');
    f.querySelector('b').textContent = S.items.freeze;
    f.disabled = S.items.freeze <= 0 || G.mode === 'online';
    const l = $('#toolLupe');
    l.disabled = S.upgrades.lupe === 0;
    l.title = S.upgrades.lupe === 0 ? 'Lupe – im Shop kaufen' : 'Lupe an/aus (Taste L)';
    l.classList.toggle('on', S.upgrades.lupe > 0 && S.lupeOn);
  }

  function updateTimer(now) {
    const bar = $('#timeBar');
    const pct = Math.max(0, Math.min(1, G.timeLeft / G.duration));
    bar.firstElementChild.style.width = pct * 100 + '%';
    const frozen = G.mode === 'solo' && now < G.frozenUntil;
    $('#timeText').textContent = frozen ? `⏸️ ${Math.ceil(G.timeLeft)} s` : `${Math.ceil(G.timeLeft)} s`;
    bar.classList.toggle('low', G.timeLeft < 10);
    bar.classList.toggle('frozen', frozen);
  }

  function frame(now) {
    if (!G) return;
    const dt = Math.min(0.1, (now - G.last) / 1000);
    G.last = now;
    if (!G.ended && !G.paused) {
      if (G.mode === 'solo') {
        if (now >= G.frozenUntil) {
          const before = Math.ceil(G.timeLeft);
          G.timeLeft -= dt;
          if (G.timeLeft < 10 && Math.ceil(G.timeLeft) !== before) SFX.tick();
        }
        if (G.timeLeft <= 0) { G.timeLeft = 0; endSolo(false); }
      } else {
        G.timeLeft = Math.max(0, (G.endsAt - now) / 1000);
      }
    }
    updateTimer(now);
    draw(now);
    rafId = requestAnimationFrame(frame);
  }

  function drawScene(c) {
    c.drawImage(G.layers.bottom, 0, 0, W, H);
    for (const it of G.items) if (!G.found.has(it.id)) drawItem(c, G.world.id, it);
    c.drawImage(G.layers.top, 0, 0, W, H);
  }

  function draw(now) {
    const k = canvas.width / W;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    drawScene(ctx);

    // Markierungen für bereits gefundene Gegenstände
    for (const [id, info] of G.found) {
      const it = G.items.find((x) => x.id === id);
      if (!it) continue;
      ctx.strokeStyle = info.mine ? 'rgba(63,174,75,0.9)' : 'rgba(255,255,255,0.75)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(it.x, it.y, 9, 0, Math.PI * 2);
      ctx.stroke();
      if (!info.mine && info.name) {
        ctx.font = '600 10px Fredoka, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillText(info.name, it.x + 1, it.y - 13);
        ctx.fillStyle = '#fff';
        ctx.fillText(info.name, it.x, it.y - 14);
      }
    }

    // Effekte (+Münzen, Fehlklick-Kreuze …)
    G.effects = G.effects.filter((e) => now - e.t0 < e.life);
    for (const e of G.effects) {
      const a = (now - e.t0) / e.life;
      ctx.globalAlpha = 1 - a;
      if (e.type === 'ring') {
        ctx.strokeStyle = e.color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(e.x, e.y, 10 + a * 30, 0, Math.PI * 2);
        ctx.stroke();
      } else if (e.type === 'x') {
        ctx.strokeStyle = '#ff3b30';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(e.x - 7, e.y - 7); ctx.lineTo(e.x + 7, e.y + 7);
        ctx.moveTo(e.x + 7, e.y - 7); ctx.lineTo(e.x - 7, e.y + 7);
        ctx.stroke();
      }
      if (e.text) {
        ctx.font = `700 ${e.size || 16}px Fredoka, sans-serif`;
        ctx.textAlign = 'center';
        ctx.lineWidth = 4;
        ctx.strokeStyle = 'rgba(0,0,0,0.55)';
        ctx.strokeText(e.text, e.x, e.y - 18 - a * 26);
        ctx.fillStyle = e.textColor || '#fff';
        ctx.fillText(e.text, e.x, e.y - 18 - a * 26);
      }
      ctx.globalAlpha = 1;
    }

    // Magnet-Hinweis
    if (G.magnet && now < G.magnet.until) {
      const p = (now / 300) % 1;
      ctx.setLineDash([6, 6]);
      ctx.strokeStyle = 'rgba(255,60,60,0.95)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(G.magnet.x, G.magnet.y, 48 + p * 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Lupe
    const L = LUPE[S.upgrades.lupe];
    if (L.r && S.lupeOn && pointer.inside && !G.ended) {
      const lx = pointer.x;
      const ly = pointer.touch ? pointer.y - L.r - 30 : pointer.y;
      ctx.save();
      ctx.beginPath();
      ctx.arc(lx, ly, L.r, 0, Math.PI * 2);
      ctx.clip();
      ctx.translate(lx, ly);
      ctx.scale(L.z, L.z);
      ctx.translate(-pointer.x, -pointer.y);
      drawScene(ctx);
      ctx.restore();
      ctx.lineWidth = 5;
      ctx.strokeStyle = '#3b2a12';
      ctx.beginPath(); ctx.arc(lx, ly, L.r, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.beginPath(); ctx.arc(lx, ly, L.r - 3, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(lx - 6, ly); ctx.lineTo(lx + 6, ly);
      ctx.moveTo(lx, ly - 6); ctx.lineTo(lx, ly + 6);
      ctx.stroke();
    } else if (pointer.touch && pointer.inside) {
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(pointer.x, pointer.y, 14, 0, Math.PI * 2); ctx.stroke();
    }
  }

  function addEffect(e) {
    e.t0 = performance.now();
    e.life = e.life || 1100;
    G.effects.push(e);
  }

  // ---------------------------------------------------------------- Eingabe
  function setPointer(e) {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((e.clientX - rect.left) / rect.width) * W;
    pointer.y = ((e.clientY - rect.top) / rect.height) * H;
    pointer.touch = e.pointerType !== 'mouse';
  }
  canvas.addEventListener('pointermove', (e) => { setPointer(e); pointer.inside = true; });
  canvas.addEventListener('pointerleave', () => { pointer.inside = false; });
  canvas.addEventListener('pointerdown', (e) => {
    setPointer(e);
    pointer.inside = true;
    if (e.pointerType === 'mouse') {
      if (e.button === 0) tryHit(pointer.x, pointer.y);
    } else {
      try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* egal */ }
    }
  });
  canvas.addEventListener('pointerup', (e) => {
    if (e.pointerType === 'mouse') return;
    setPointer(e);
    tryHit(pointer.x, pointer.y);
    pointer.inside = false;
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  function tryHit(x, y) {
    if (!G || G.ended || G.paused) return;
    const now = performance.now();
    if (now < G.lockUntil) return;
    const extra = S.upgrades.auge * 3 + (pointer.touch ? 4 : 0);
    let best = null;
    let bestD = Infinity;
    for (const it of G.items) {
      if (G.found.has(it.id) || G.pending.has(it.id)) continue;
      const rad = it.kind === 'collectible' ? 13 + extra : G.round.radius * Math.max(0.8, it.s) + extra;
      const d = Math.hypot(it.x - x, it.y - y);
      if (d < rad && d < bestD) { best = it; bestD = d; }
    }
    if (best) {
      if (G.mode === 'solo') {
        markFound(best, { mine: true });
      } else {
        G.pending.add(best.id);
        netSend({ type: 'find', id: best.id, x: Math.round(x), y: Math.round(y) });
        setTimeout(() => G && G.pending.delete(best.id), 1500);
      }
      return;
    }
    // Daneben!
    G.misses++;
    SFX.miss();
    if (G.mode === 'solo') {
      G.timeLeft = Math.max(0, G.timeLeft - 2);
      G.lockUntil = now + 400;
      addEffect({ type: 'x', x, y, text: '−2 s', textColor: '#ff8a80', life: 900 });
    } else {
      G.lockUntil = now + 1200;
      addEffect({ type: 'x', x, y, text: 'Gesperrt!', textColor: '#ff8a80', life: 1200 });
    }
  }

  function markFound(item, info) {
    if (!G || G.found.has(item.id)) return;
    G.found.set(item.id, info);
    G.pending.delete(item.id);
    if (info.mine) {
      if (item.kind === 'collectible') {
        const c = Shared.findCollectible(item.cid);
        const rar = RARITY[c.rarity];
        const isNew = !S.album[c.id];
        S.album[c.id] = (S.album[c.id] || 0) + 1;
        S.stats.collectibles++;
        const v = earn(isNew ? rar.coins : Math.round(rar.coins / 2));
        G.coins += v;
        G.newCollectible = { c, isNew, coins: v };
        SFX.rare();
        addEffect({ type: 'ring', x: item.x, y: item.y, color: rar.color, text: `${c.icon} +${v}`, textColor: '#ffe17a', size: 20, life: 1600 });
        toast(`${c.icon} ${isNew ? 'Neu im Album' : 'Doppelt gefunden'}: <b>${esc(c.name)}</b> <span style="color:${rar.color}">(${rar.name})</span> +${v} 🪙`, isNew ? 'gold' : '');
      } else {
        const v = earn(5 + G.level);
        G.coins += v;
        G.myFinds++;
        S.stats.found++;
        SFX.found();
        addEffect({ type: 'ring', x: item.x, y: item.y, color: '#7CFC00', text: `+${v} 🪙`, textColor: '#ffe17a' });
      }
      save();
      checkAchievements();
    } else {
      SFX.other();
      addEffect({ type: 'ring', x: item.x, y: item.y, color: '#ffffff', text: info.name, size: 13, life: 900 });
    }
    updateHud();
    if (G.mode === 'solo' && targetsFound() >= G.round.targets.length) endSolo(true);
  }

  // ---------------------------------------------------------------- Hilfsmittel
  function useMagnet() {
    if (!G || G.ended || G.paused || S.items.magnet <= 0) return;
    const open = G.items.filter((it) => !G.found.has(it.id) && it.kind === 'target');
    if (!open.length) return;
    const it = open[Math.floor(Math.random() * open.length)];
    const ang = Math.random() * Math.PI * 2;
    const off = Math.random() * 28;
    G.magnet = { x: it.x + Math.cos(ang) * off, y: it.y + Math.sin(ang) * off, until: performance.now() + 3500 };
    S.items.magnet--;
    save();
    updateHud();
    SFX.buy();
  }
  function useFreeze() {
    if (!G || G.ended || G.paused || G.mode !== 'solo' || S.items.freeze <= 0) return;
    G.frozenUntil = Math.max(performance.now(), G.frozenUntil) + 10000;
    S.items.freeze--;
    save();
    updateHud();
    SFX.buy();
  }
  function toggleLupe() {
    if (S.upgrades.lupe === 0) return;
    S.lupeOn = !S.lupeOn;
    save();
    updateHud();
  }
  $('#toolMagnet').addEventListener('click', useMagnet);
  $('#toolFreeze').addEventListener('click', useFreeze);
  $('#toolLupe').addEventListener('click', toggleLupe);
  document.addEventListener('keydown', (e) => {
    if (current !== 'game' || e.target.tagName === 'INPUT') return;
    const k = e.key.toLowerCase();
    if (k === 'm') useMagnet();
    if (k === 'z') useFreeze();
    if (k === 'l') toggleLupe();
    if (k === 'escape') quitGame();
  });

  function quitGame() {
    if (!G) {
      if (current === 'game') {
        $('#countdown').classList.add('hidden');
        if (Net.room) netSend({ type: 'leave' });
        go(Net.room ? 'online' : 'menu');
      }
      return;
    }
    const mode = G.mode;
    cancelAnimationFrame(rafId);
    G = null;
    hideModal();
    $('#countdown').classList.add('hidden');
    if (mode === 'online') {
      netSend({ type: 'leave' });
      go('online');
    } else {
      go('menu');
    }
  }
  $('#quitBtn').addEventListener('click', quitGame);

  // ---------------------------------------------------------------- Ende einer Solo-Runde
  function endSolo(win) {
    if (G.ended) return;
    G.ended = true;
    const w = G.world;
    S.stats.rounds++;
    let bonus = 0;
    let unlockHint = '';
    if (win) {
      bonus = earn(20 + G.level * 10 + Math.floor(G.timeLeft));
      G.coins += bonus;
      S.levels[w.id] = G.level + 1;
      S.stats.wins++;
      if (G.misses === 0) S.stats.perfect++;
      S.stats.bestLevel = Math.max(S.stats.bestLevel, G.level + 1);
      const idx = WORLDS.findIndex((x) => x.id === w.id);
      const next = WORLDS[idx + 1];
      if (next && !S.unlocked[next.id] && S.levels[w.id] >= next.needLevel) {
        unlockHint = S.coins >= next.cost
          ? `<div class="newitem">🔓 Du kannst jetzt <b>${next.emoji} ${esc(next.name)}</b> freischalten!</div>`
          : `<div class="newitem">🔓 Für <b>${next.emoji} ${esc(next.name)}</b> brauchst du noch ${next.cost - S.coins} 🪙.</div>`;
      }
      SFX.win();
    } else {
      SFX.lose();
    }
    save();
    checkAchievements();
    const nc = G.newCollectible;
    setTimeout(() => {
      if (!G) return;
      showModal(`
        <div class="big-emoji">${win ? (G.misses === 0 ? '🎯' : '🎉') : '⏰'}</div>
        <h2>${win ? 'Geschafft!' : 'Zeit abgelaufen!'}</h2>
        ${win && G.misses === 0 ? '<p><b>Perfekt – kein einziger Fehlklick!</b></p>' : ''}
        <div class="stats">
          <div>Gefunden<b>${targetsFound()} / ${G.round.targets.length}</b></div>
          <div>Münzen<b>+${G.coins} 🪙</b></div>
          <div>Fehlklicks<b>${G.misses}</b></div>
          <div>${win ? 'Zeitbonus' : 'Level'}<b>${win ? Math.floor(G.timeLeft) + ' s' : G.level}</b></div>
        </div>
        ${nc ? `<div class="newitem"><div class="em">${nc.c.icon}</div><b>${esc(nc.c.name)}</b> ${nc.isNew ? '– neu im Album!' : '(doppelt)'}</div>` : ''}
        ${unlockHint}
        ${win
          ? `<button class="btn big green" id="mNext">▶️ Weiter zu Level ${G.level + 1}</button>`
          : '<button class="btn big green" id="mNext">🔁 Nochmal versuchen</button>'}
        <button class="btn alt" id="mMenu">🗺️ Zur Weltkarte</button>`);
      $('#mNext').addEventListener('click', () => startSolo(w.id));
      $('#mMenu').addEventListener('click', quitGame);
    }, 700);
  }

  // ================================================================ Online
  const Net = { ws: null, id: null, room: null, connected: false, board: [], selWorld: 'heu' };

  function ensureConnection() {
    if (Net.ws && (Net.ws.readyState === 0 || Net.ws.readyState === 1)) return;
    if (location.protocol === 'file:') { renderOnline(); return; }
    let ws;
    try {
      ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host);
    } catch (_) { renderOnline(); return; }
    Net.ws = ws;
    ws.onopen = () => {
      Net.connected = true;
      netSend({ type: 'hello', name: S.name });
      renderOnline();
    };
    ws.onmessage = (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch (_) { return; }
      onNet(msg);
    };
    ws.onclose = () => {
      const wasPlaying = G && G.mode === 'online';
      Net.connected = false;
      Net.room = null;
      Net.ws = null;
      if (wasPlaying) {
        toast('⚠️ Verbindung zum Server verloren');
        cancelAnimationFrame(rafId);
        G = null;
        go('online');
      }
      renderOnline();
    };
  }

  function netSend(msg) {
    if (Net.ws && Net.ws.readyState === 1) Net.ws.send(JSON.stringify(msg));
  }

  function onNet(msg) {
    switch (msg.type) {
      case 'welcome':
        Net.id = msg.id;
        break;
      case 'leaderboard':
        Net.board = msg.list;
        renderBoard();
        break;
      case 'room':
        Net.room = msg;
        if (current === 'online') renderOnline();
        renderScores();
        break;
      case 'left':
        Net.room = null;
        renderOnline();
        break;
      case 'error':
        toast('⚠️ ' + esc(msg.msg));
        break;
      case 'countdown': {
        hideModal();
        cancelAnimationFrame(rafId);
        G = null;
        go('game');
        resizeCanvas();
        $('#scorePanel').classList.remove('hidden');
        $('#feed').innerHTML = '';
        const k = canvas.width / W;
        ctx.setTransform(k, 0, 0, k, 0, 0);
        ctx.fillStyle = '#222';
        ctx.fillRect(0, 0, W, H);
        countdown(msg.seconds, () => {}, 1000);
        break;
      }
      case 'round': {
        const round = Shared.generateRound(msg.seed, msg.world, msg.level, {
          targetCount: msg.targetCount,
          collectibleChance: msg.collectibleChance,
        });
        beginRound({
          mode: 'online', round, seed: msg.seed, level: msg.level,
          duration: 75, endsAt: performance.now() + msg.remainingMs,
        });
        G.timeLeft = msg.remainingMs / 1000;
        for (const f of msg.found || []) {
          const it = G.items.find((x) => x.id === f.itemId);
          if (it) G.found.set(it.id, { mine: f.playerId === Net.id, name: playerName(f.playerId) });
        }
        updateHud();
        renderScores();
        break;
      }
      case 'found': {
        if (!G || G.mode !== 'online') break;
        const it = G.items.find((x) => x.id === msg.itemId);
        G.scores[msg.playerId] = (G.scores[msg.playerId] || 0) + msg.points;
        if (it) {
          const mine = msg.playerId === Net.id;
          markFound(it, { mine, name: msg.name });
          const what = it.kind === 'collectible' ? `${(Shared.findCollectible(it.cid) || {}).icon || '✨'} Sammelstück` : G.world.target;
          feed(`${mine ? '🟢 Du' : '⚪ ' + esc(msg.name)}: ${what} (+${msg.points})`);
        }
        renderScores();
        break;
      }
      case 'end':
        onlineEnd(msg);
        break;
      case 'emote':
        feed(`${esc(msg.name)}: <span style="font-size:1.2em">${msg.e}</span>`);
        if (G && G.mode === 'online') {
          addEffect({ type: 'none', x: 80 + Math.random() * (W - 160), y: 90 + Math.random() * 60, text: msg.e + ' ' + msg.name, size: 22, life: 1800 });
        }
        break;
      default:
        break;
    }
  }

  function playerName(id) {
    const p = Net.room && Net.room.players.find((x) => x.id === id);
    return p ? p.name : '?';
  }

  function feed(html) {
    const f = $('#feed');
    const d = document.createElement('div');
    d.innerHTML = html;
    f.prepend(d);
    while (f.children.length > 10) f.lastChild.remove();
  }

  function renderScores() {
    if (!Net.room) return;
    const scores = G && G.mode === 'online' ? G.scores : {};
    const list = Net.room.players
      .map((p) => ({ ...p, s: scores[p.id] || 0 }))
      .sort((a, b) => b.s - a.s);
    $('#scoreList').innerHTML = list.map((p) =>
      `<li class="${p.id === Net.id ? 'me' : ''}">${esc(p.name)}${p.id === Net.id ? ' (du)' : ''}<b>${p.s}</b></li>`).join('');
  }

  function onlineEnd(msg) {
    if (!G || G.mode !== 'online') return;
    G.ended = true;
    const mine = msg.ranking.find((r) => r.id === Net.id);
    const won = msg.winners.includes(Net.id);
    S.stats.onlineRounds++;
    let bonus = 0;
    if (won) {
      S.stats.onlineWins++;
      bonus = earn(50);
      G.coins += bonus;
      SFX.win();
    } else {
      SFX.lose();
    }
    save();
    checkAchievements();
    const medals = ['🥇', '🥈', '🥉'];
    showModal(`
      <div class="big-emoji">${won ? '🏆' : '🏁'}</div>
      <h2>${won ? 'Du hast gewonnen!' : 'Runde vorbei!'}</h2>
      <ol>${msg.ranking.map((r, i) => `<li>${medals[i] || ''} ${esc(r.name)}${r.id === Net.id ? ' (du)' : ''} – <b>${r.score}</b> Punkte</li>`).join('')}</ol>
      <div class="stats">
        <div>Deine Punkte<b>${mine ? mine.score : 0}</b></div>
        <div>Münzen<b>+${G.coins} 🪙</b></div>
      </div>
      ${G.newCollectible ? `<div class="newitem"><div class="em">${G.newCollectible.c.icon}</div><b>${esc(G.newCollectible.c.name)}</b> ${G.newCollectible.isNew ? '– neu im Album!' : '(doppelt)'}</div>` : ''}
      <button class="btn big green" id="mRoom">↩️ Zurück in den Raum</button>`);
    $('#mRoom').addEventListener('click', () => {
      hideModal();
      cancelAnimationFrame(rafId);
      G = null;
      go('online');
    });
  }

  function renderBoard() {
    const html = Net.board.length
      ? Net.board.map((e) => `<li>${esc(e.name)} <small>(${e.wins} Siege)</small><b>${e.points}</b></li>`).join('')
      : '<li class="hint">Noch keine Einträge – spiel die erste Runde!</li>';
    $('#leaderboard').innerHTML = html;
    $('#leaderboard2').innerHTML = html;
  }

  function renderOnline() {
    const offline = !Net.connected;
    const connecting = Net.ws && Net.ws.readyState === 0;
    $('#onlineOffline').classList.toggle('hidden', !offline || connecting);
    $('#onlineLobby').classList.toggle('hidden', offline || !!Net.room);
    $('#onlineRoom').classList.toggle('hidden', offline || !Net.room);
    $('#nameInput').value = S.name;
    renderBoard();
    if (!Net.room) return;
    const room = Net.room;
    const isHost = room.hostId === Net.id;
    $('#roomCode').textContent = room.code;
    $('#roomHint').textContent = room.isPublic
      ? 'Öffentlicher Raum – andere kommen über „Schnelles Spiel“ dazu.'
      : 'Privater Raum – gib deinen Freunden den Code!';
    $('#roomPlayers').innerHTML = room.players.map((p) =>
      `<li><span>${p.id === room.hostId ? '👑 ' : ''}${esc(p.name)}${p.id === Net.id ? ' (du)' : ''}</span><span>🏆 ${p.wins} · ${p.total} P.</span></li>`).join('');
    $('#hostControls').classList.toggle('hidden', !isHost);
    $('#waitHost').classList.toggle('hidden', isHost);
    if (isHost) {
      const avail = WORLDS.filter((w) => S.unlocked[w.id]);
      if (!avail.some((w) => w.id === Net.selWorld)) Net.selWorld = avail[0].id;
      $('#roomWorlds').innerHTML = avail.map((w) =>
        `<button data-w="${w.id}" class="${w.id === Net.selWorld ? 'sel' : ''}">${w.emoji} ${esc(w.name)}</button>`).join('');
      $$('#roomWorlds button').forEach((b) => b.addEventListener('click', () => {
        Net.selWorld = b.dataset.w;
        renderOnline();
      }));
      $('#startBtn').disabled = room.state !== 'lobby';
      $('#startBtn').textContent = room.state === 'lobby' ? '▶️ Runde starten' : '⏳ Runde läuft …';
    }
  }

  function saveName() {
    S.name = $('#nameInput').value.trim().slice(0, 16);
    save();
    netSend({ type: 'hello', name: S.name });
  }
  $('#nameInput').addEventListener('change', saveName);
  $('#quickBtn').addEventListener('click', () => { saveName(); netSend({ type: 'quick' }); });
  $('#createBtn').addEventListener('click', () => { saveName(); netSend({ type: 'create' }); });
  $('#joinBtn').addEventListener('click', () => {
    const code = $('#codeInput').value.trim().toUpperCase();
    if (code.length !== 4) return toast('Der Code hat 4 Zeichen.');
    saveName();
    netSend({ type: 'join', code });
  });
  $('#codeInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#joinBtn').click(); });
  $('#leaveBtn').addEventListener('click', () => netSend({ type: 'leave' }));
  $('#startBtn').addEventListener('click', () => netSend({ type: 'start', world: Net.selWorld }));
  $('#reconnectBtn').addEventListener('click', () => {
    if (location.protocol === 'file:') {
      toast('Öffne das Spiel über den Server: http://localhost:3000');
      return;
    }
    ensureConnection();
    renderOnline();
  });
  $$('.emotes button').forEach((b) => b.addEventListener('click', () => netSend({ type: 'emote', e: b.dataset.e })));

  // ================================================================ Start
  $$('[data-go]').forEach((b) => b.addEventListener('click', () => {
    if (G) quitGame();
    go(b.dataset.go);
  }));
  $('#soundBtn').addEventListener('click', () => { S.sound = !S.sound; save(); });

  renderTop();
  go('menu');
  checkAchievements();
  // Für Tests im Browser
  window.__game = { get state() { return G; }, get save() { return S; }, Net };
})();
