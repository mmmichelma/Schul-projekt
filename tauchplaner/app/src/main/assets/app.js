(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var KEY_DIVES = 'tp_dives', KEY_SET = 'tp_settings';

  // ---------- Speicher ----------
  function load(key, def) {
    try { var v = localStorage.getItem(key); return v ? JSON.parse(v) : def; } catch (e) { return def; }
  }
  function store(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {} }

  var settings = load(KEY_SET, { gfLo: 40, gfHi: 85, descRate: 18, ascRate: 9, maxPpo2: 1.4, safetyStop: true });
  var dives = load(KEY_DIVES, []);

  // ---------- Hilfsfunktionen ----------
  function num(id, def) { var v = parseFloat(String($(id).value).replace(',', '.')); return isNaN(v) ? def : v; }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function fmtMin(m) {
    if (m == null) return '–';
    m = Math.round(m);
    if (m < 60) return m + ' min';
    var h = Math.floor(m / 60), r = m % 60;
    if (h >= 24) { var d = Math.floor(h / 24); h = h % 24; return d + ' d ' + h + ' h ' + pad(r) + ' min'; }
    return h + ' h ' + pad(r) + ' min';
  }
  function fmtClock(ms, refMs) {
    var d = new Date(ms);
    var t = pad(d.getHours()) + ':' + pad(d.getMinutes());
    var ref = new Date(refMs || Date.now());
    if (d.toDateString() !== ref.toDateString()) {
      t = pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '. ' + t;
    }
    return t + ' Uhr';
  }
  function fmtDate(ms) {
    var d = new Date(ms);
    var w = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'][d.getDay()];
    return w + ', ' + pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.' + d.getFullYear() + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  function esc(s) { return String(s || '').replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function gasName(o2) { return o2 === 21 ? 'Luft' : 'EAN' + o2; }
  function envFor(d) {
    return Deco.makeEnv({ altitude: d.alt || 0, water: d.water, gfLo: settings.gfLo, gfHi: settings.gfHi,
      descRate: settings.descRate, ascRate: settings.ascRate, maxPpo2: settings.maxPpo2, safetyStop: settings.safetyStop });
  }
  function kpi(val, label, cls) { return '<div class="kpi"><b class="' + (cls || '') + '">' + val + '</b><small>' + label + '</small></div>'; }

  // ---------- Verlauf: Reststickstoff aus früheren Tauchgängen ----------
  function history(beforeMs, env) {
    var list = dives.filter(function (d) { return d.start < beforeMs; }).sort(function (a, b) { return a.start - b.start; });
    var tissues = null, lastEnd = null, lastEnv = null, results = [], anyDeco = false;
    list.forEach(function (d) {
      var e = envFor(d);
      var si = null;
      if (tissues && lastEnd != null) {
        si = Math.max(0, (d.start - lastEnd) / 60000);
        if (si > 48 * 60) tissues = Deco.freshTissues(e);
        else tissues = Deco.surfaceInterval(lastEnv, tissues, si);
      } else {
        tissues = Deco.freshTissues(e);
      }
      var startT = tissues.slice();
      var ndl = Deco.ndl(e, startT, d.depth, d.o2 / 100, 400);
      var p = Deco.planDive(e, tissues, d.depth, d.bt, d.o2 / 100, { sac: d.sac || 20 });
      tissues = p.tissues;
      lastEnd = d.start + p.runtime * 60000;
      lastEnv = e;
      if (!p.noDeco) anyDeco = true;
      results.push({ dive: d, plan: p, si: si, ndl: ndl, end: lastEnd });
    });
    var out = { results: results, lastEnd: lastEnd, anyDeco: anyDeco, tissues: null };
    if (tissues) {
      var gap = (beforeMs - lastEnd) / 60000;
      out.gap = gap;
      out.tissues = gap > 48 * 60 ? Deco.freshTissues(env || lastEnv)
                                  : Deco.surfaceInterval(lastEnv, tissues, Math.max(0, gap));
      out.lastTissues = tissues;
      out.lastEnv = lastEnv;
    }
    return out;
  }

  function noFlyHours(h) {
    if (!h.results.length) return 0;
    if (h.anyDeco) return 24;
    var last = h.results[h.results.length - 1];
    var recent = h.results.filter(function (r) { return last.dive.start - r.dive.start < 24 * 3600000; });
    var days = {};
    h.results.forEach(function (r) { if (last.end - r.end < 72 * 3600000) days[new Date(r.dive.start).toDateString()] = 1; });
    if (recent.length > 1 || Object.keys(days).length > 1) return 18;
    return 12;
  }

  // ---------- Navigation ----------
  Array.prototype.forEach.call(document.querySelectorAll('#nav button'), function (b) {
    b.addEventListener('click', function () {
      Array.prototype.forEach.call(document.querySelectorAll('#nav button'), function (x) { x.classList.toggle('on', x === b); });
      Array.prototype.forEach.call(document.querySelectorAll('section'), function (s) { s.classList.toggle('on', s.id === b.dataset.t); });
      if (b.dataset.t === 'tag') renderDay();
      if (b.dataset.t === 'tab') { renderNdlTable(); renderModTable(); }
      window.scrollTo(0, 0);
    });
  });

  // ---------- PLANEN ----------
  (function initDate() {
    var now = new Date(Date.now() + 30 * 60000);
    $('p_date').value = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
    $('p_time').value = pad(now.getHours()) + ':' + pad(Math.floor(now.getMinutes() / 5) * 5);
  })();
  $('p_gas').addEventListener('change', function () { $('p_o2wrap').style.display = this.value === 'custom' ? '' : 'none'; });

  function readPlan() {
    var o2 = $('p_gas').value === 'custom' ? Math.round(num('p_o2', 32)) : parseInt($('p_gas').value, 10);
    o2 = Math.min(40, Math.max(21, o2));
    var dt = ($('p_date').value || '') + 'T' + ($('p_time').value || '09:00');
    var start = new Date(dt).getTime();
    if (isNaN(start)) start = Date.now();
    return {
      loc: $('p_loc').value.trim(), start: start, alt: Math.max(0, num('p_alt', 0)), water: $('p_water').value,
      depth: Math.min(60, Math.max(3, num('p_depth', 18))), bt: Math.min(300, Math.max(1, Math.round(num('p_bt', 40)))),
      o2: o2, tank: num('p_tank', 12), fill: num('p_fill', 200), sac: num('p_sac', 20), res: num('p_res', 50)
    };
  }

  var lastPlan = null;

  function calcPlan() {
    var d = readPlan();
    var env = envFor(d);
    var h = history(d.start, env);
    var out = '';

    if (h.lastEnd && d.start < h.lastEnd) {
      $('p_out').innerHTML = '<div class="card"><div class="status bad">Die Startzeit liegt vor dem Ende deines letzten Tauchgangs (' + fmtClock(h.lastEnd, d.start) + '). Bitte Startzeit anpassen.</div></div>';
      return;
    }
    var tissues = h.tissues || Deco.freshTissues(env);
    var fO2 = d.o2 / 100;
    var ndl = Deco.ndl(env, tissues, d.depth, fO2, 400);
    var p = Deco.planDive(env, tissues, d.depth, d.bt, fO2, { sac: d.sac });
    var modD = Deco.mod(env, fO2);
    var mod16 = Deco.mod(env, fO2, 1.6);
    var barNeeded = p.gasLiters / d.tank;
    var barAvail = d.fill - d.res;
    var maxD = Deco.maxDepthFor(env, tissues, d.bt, fO2);
    var endMs = d.start + p.runtime * 60000;

    // Status
    var msgs = [];
    var level = 'ok';
    if (p.maxPpo2 > 1.6 + 1e-9) { level = 'bad'; msgs.push('ppO₂ ' + p.maxPpo2.toFixed(2) + ' bar – Sauerstoffvergiftung! Max. Tiefe mit ' + gasName(d.o2) + ': ' + modD.toFixed(1) + ' m.'); }
    else if (p.maxPpo2 > settings.maxPpo2 + 1e-9) { level = 'bad'; msgs.push('MOD überschritten: ppO₂ ' + p.maxPpo2.toFixed(2) + ' bar. Max. Tiefe ' + modD.toFixed(1) + ' m.'); }
    if (!p.noDeco) { if (level !== 'bad') level = 'warn'; msgs.push('Nullzeit überschritten – Dekompressionstauchgang! Pflichtstopps: ' + p.decoTime + ' min.'); }
    if (barNeeded > barAvail) { level = 'bad'; msgs.push('Luft reicht nicht: Bedarf ' + Math.ceil(barNeeded) + ' bar, verfügbar ' + Math.round(barAvail) + ' bar (inkl. Reserve).'); }
    if (d.depth > 40 && d.o2 === 21) { level = 'bad'; msgs.push('Tiefer als 40 m mit Luft – außerhalb des Sporttauchbereichs.'); }
    else if (d.depth > 30) msgs.push('Tiefer als 30 m: nur mit entsprechender Ausbildung (z. B. Deep Diver).');
    if (p.cns > 80) { level = 'bad'; msgs.push('CNS-Belastung ' + Math.round(p.cns) + ' % – zu hoch!'); }
    if (level === 'ok') msgs.unshift('Nullzeittauchgang – Plan ist im sicheren Bereich ✓');

    out += '<div class="card"><h2>Ergebnis' + (d.loc ? ' – ' + esc(d.loc) : '') + '</h2>';
    out += '<div class="status ' + level + '">' + msgs.join('<br>') + '</div>';
    if (h.results.length && h.gap != null && h.gap <= 48 * 60) {
      out += '<p class="mut">Reststickstoff von ' + h.results.length + ' früheren Tauchgang/-gängen berücksichtigt. Oberflächenpause seit letztem TG: <b>' + fmtMin(h.gap) + '</b>.</p>';
    }
    out += '<div class="res">';
    out += kpi(ndl >= 400 ? '> 6 h' : ndl + ' min', 'Nullzeit auf ' + d.depth + ' m', p.noDeco ? 'ok-t' : 'warn-t');
    out += kpi(Math.round(p.runtime) + ' min', 'Gesamte Tauchzeit');
    out += kpi(fmtClock(endMs, d.start), 'Auftauchen');
    out += kpi(maxD + ' m', 'Max. Tiefe für ' + d.bt + ' min (Nullzeit)');
    out += kpi(modD.toFixed(1) + ' m', 'MOD bei ppO₂ ' + settings.maxPpo2.toFixed(1) + ' (' + gasName(d.o2) + ')');
    out += kpi(p.maxPpo2.toFixed(2) + ' bar', 'ppO₂ auf Maximaltiefe', p.maxPpo2 > settings.maxPpo2 ? 'bad-t' : '');
    out += kpi(Math.ceil(barNeeded) + ' bar', 'Gasbedarf (' + Math.round(p.gasLiters) + ' l)', barNeeded > barAvail ? 'bad-t' : 'ok-t');
    out += kpi(Math.round(d.fill - barNeeded) + ' bar', 'Restdruck beim Auftauchen', (d.fill - barNeeded) < d.res ? 'bad-t' : '');
    out += kpi(Math.round(p.cns) + ' %', 'CNS-Sauerstoffbelastung');
    out += kpi(fmtMin(Deco.desatTime(env, p.tissues)), 'Entsättigungszeit danach');
    out += '</div></div>';

    // Stopps
    out += '<div class="card"><h2>Aufstieg &amp; Stopps</h2><table><tr><th>Tiefe</th><th>Dauer</th><th>Art</th></tr>';
    if (!p.stops.length) out += '<tr><td colspan="3">Direkter Aufstieg mit ' + settings.ascRate + ' m/min</td></tr>';
    p.stops.forEach(function (s) {
      out += '<tr><td>' + s.depth + ' m</td><td>' + s.time + ' min</td><td>' + (s.safety ? 'Sicherheitsstopp' : '<span class="warn-t">Deko-Pflichtstopp</span>') + '</td></tr>';
    });
    out += '</table><p class="mut">Aufstiegsgeschwindigkeit ' + settings.ascRate + ' m/min. Abstieg ' + settings.descRate + ' m/min. GF ' + settings.gfLo + '/' + settings.gfHi + '.</p>';
    out += profileSvg(p, d.depth) + '</div>';

    // Wenn Nullzeit wegen Reststickstoff zu kurz: Mindestpause
    if (!p.noDeco && h.results.length && h.lastTissues) {
      var si = Deco.minSurfaceInterval(h.lastEnv, h.lastTissues, d.depth, d.bt, fO2);
      out += '<div class="card"><h2>Tipp</h2>';
      if (si == null) out += '<p>Diese Kombination ist auch nach langer Pause kein Nullzeittauchgang. Wähle eine geringere Tiefe oder kürzere Grundzeit (max. ' + Deco.ndl(env, Deco.freshTissues(env), d.depth, fO2) + ' min auf ' + d.depth + ' m).</p>';
      else out += '<p>Als Nullzeittauchgang möglich nach einer Oberflächenpause von <b>' + fmtMin(si) + '</b> – also ab <b>' + fmtClock(h.lastEnd + si * 60000, d.start) + '</b>.</p>';
      out += '</div>';
    }

    // Alternativen
    out += '<div class="card"><h2>Nullzeiten für diesen Tauchgang</h2><table><tr><th>Tiefe</th><th>Nullzeit</th><th>ppO₂</th></tr>';
    [9, 12, 15, 18, 21, 24, 27, 30, 35, 40].forEach(function (z) {
      var pp = Deco.amb(env, z) * fO2;
      if (pp > 1.6) return;
      var n = Deco.ndl(env, tissues, z, fO2, 400);
      var cls = pp > settings.maxPpo2 ? 'c-b' : (n >= d.bt ? 'c-ok' : 'c-w');
      out += '<tr><td>' + z + ' m</td><td class="' + cls + '">' + (n >= 400 ? '> 6 h' : n + ' min') + '</td><td>' + pp.toFixed(2) + '</td></tr>';
    });
    out += '</table></div>';

    out += '<button class="btn" id="p_save">Tauchgang im Tauchtag speichern</button>';
    $('p_out').innerHTML = out;
    lastPlan = d;
    $('p_save').addEventListener('click', function () {
      lastPlan.id = Date.now() + '' + Math.floor(Math.random() * 1000);
      dives.push(lastPlan);
      store(KEY_DIVES, dives);
      this.textContent = 'Gespeichert ✓';
      this.disabled = true;
      // nächsten Tauchgang vorbereiten: Startzeit = Auftauchen + 1 h
      var next = new Date(endMs + 60 * 60000);
      $('p_date').value = next.getFullYear() + '-' + pad(next.getMonth() + 1) + '-' + pad(next.getDate());
      $('p_time').value = pad(next.getHours()) + ':' + pad(Math.floor(next.getMinutes() / 5) * 5);
    });
    $('p_out').scrollIntoView({ behavior: 'smooth' });
  }
  $('p_calc').addEventListener('click', calcPlan);

  function profileSvg(p, maxDepth) {
    var W = 320, H = 140, L = 30, T = 10, R = 10, Bm = 20;
    var total = p.runtime;
    var pts = [[0, 0]], t = 0;
    p.segments.forEach(function (s) { t += s.time; pts.push([t, s.to]); });
    var x = function (v) { return L + v / total * (W - L - R); };
    var y = function (v) { return T + v / maxDepth * (H - T - Bm); };
    var path = pts.map(function (q, i) { return (i ? 'L' : 'M') + x(q[0]).toFixed(1) + ' ' + y(q[1]).toFixed(1); }).join(' ');
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" style="margin-top:8px">';
    s += '<line x1="' + L + '" y1="' + T + '" x2="' + (W - R) + '" y2="' + T + '" stroke="#1d4a73"/>';
    s += '<path d="' + path + ' L' + x(total) + ' ' + T + ' L' + L + ' ' + T + 'Z" fill="rgba(38,198,218,.15)"/>';
    s += '<path d="' + path + '" fill="none" stroke="#26c6da" stroke-width="2"/>';
    s += '<text x="2" y="' + (T + 4) + '">0 m</text><text x="2" y="' + (H - Bm + 3) + '">' + maxDepth + ' m</text>';
    s += '<text x="' + L + '" y="' + (H - 4) + '">0</text><text x="' + (W - R - 40) + '" y="' + (H - 4) + '">' + Math.round(total) + ' min</text>';
    return s + '</svg>';
  }

  // ---------- TAUCHTAG ----------
  function renderDay() {
    var h = history(Infinity);
    var el = $('t_list');
    if (!h.results.length) {
      el.innerHTML = '<p>Noch keine Tauchgänge gespeichert. Plane im Reiter <b>Planen</b> einen Tauchgang und speichere ihn.</p>';
      return;
    }
    var html = '';
    h.results.forEach(function (r) {
      var d = r.dive, p = r.plan;
      if (r.si != null) html += '<div class="si">⏱ Oberflächenpause: ' + (r.si > 48 * 60 ? '> 48 h' : fmtMin(r.si)) + '</div>';
      html += '<div class="dive" style="border-color:' + (p.noDeco && p.maxPpo2 <= settings.maxPpo2 ? 'var(--ok)' : 'var(--warn)') + '">';
      html += '<div class="row"><b>' + esc(d.loc || 'Tauchgang') + '</b><button class="btn sec small" data-del="' + d.id + '">Löschen</button></div>';
      html += '<div class="mut">' + fmtDate(d.start) + ' · ' + (d.water === 'fresh' ? 'Süßwasser' : 'Salzwasser') + (d.alt ? ' · ' + d.alt + ' m ü. NN' : '') + '</div>';
      html += '<div>' + d.depth + ' m · ' + d.bt + ' min Grundzeit · ' + gasName(d.o2) + ' · Laufzeit ' + Math.round(p.runtime) + ' min</div>';
      html += '<div class="mut">Nullzeit war ' + (r.ndl >= 400 ? '> 6 h' : r.ndl + ' min') + ' · Auftauchen ' + fmtClock(r.end, d.start) +
        (p.noDeco ? ' · <span class="ok-t">Nullzeit-TG</span>' : ' · <span class="warn-t">Deko ' + p.decoTime + ' min</span>') + '</div>';
      html += '</div>';
    });
    var desat = Deco.desatTime(h.lastEnv, h.lastTissues);
    var nf = noFlyHours(h);
    html += '<div class="res" style="margin-top:10px">';
    html += kpi(fmtClock(h.lastEnd + desat * 60000), 'Vollständig entsättigt');
    html += kpi(fmtClock(h.lastEnd + nf * 3600000), 'Fliegen frühestens (' + nf + ' h)', 'warn-t');
    var now = Date.now();
    if (now > h.lastEnd) {
      var cur = Deco.surfaceInterval(h.lastEnv, h.lastTissues, (now - h.lastEnd) / 60000);
      html += kpi(Math.round(Deco.surfaceGF(h.lastEnv, cur)) + ' %', 'Aktuelle Gewebesättigung (Leitgewebe)');
      html += kpi(fmtMin((now - h.lastEnd) / 60000), 'Seit dem letzten Auftauchen');
    }
    html += '</div>';
    el.innerHTML = html;
    Array.prototype.forEach.call(el.querySelectorAll('[data-del]'), function (b) {
      b.addEventListener('click', function () {
        if (!confirm('Diesen Tauchgang löschen?')) return;
        var id = b.getAttribute('data-del');
        dives = dives.filter(function (x) { return String(x.id) !== id; });
        store(KEY_DIVES, dives);
        renderDay();
      });
    });
  }

  $('n_calc').addEventListener('click', function () {
    var h = history(Infinity);
    var depth = Math.min(60, Math.max(3, num('n_depth', 18)));
    var bt = Math.max(1, Math.round(num('n_bt', 40)));
    var fO2 = parseInt($('n_gas').value, 10) / 100;
    var out = '';
    if (!h.results.length) {
      $('n_out').innerHTML = '<p class="mut" style="margin-top:10px">Keine früheren Tauchgänge gespeichert – du startest ohne Reststickstoff.</p>';
      return;
    }
    var env = h.lastEnv;
    var mod = Deco.mod(env, fO2);
    if (depth > mod) out += '<div class="status bad" style="margin-top:10px">' + depth + ' m liegt unter der MOD von ' + mod.toFixed(1) + ' m für dieses Gas!</div>';
    var si = Deco.minSurfaceInterval(env, h.lastTissues, depth, bt, fO2);
    if (si == null) {
      out += '<div class="status bad" style="margin-top:10px">Auch nach 48 h kein Nullzeittauchgang: Maximal ' + Deco.ndl(env, Deco.freshTissues(env), depth, fO2) + ' min auf ' + depth + ' m möglich.</div>';
    } else {
      var minSi = Math.max(si, 0);
      out += '<div class="status ok" style="margin-top:10px">Benötigte Oberflächenpause: <b>' + fmtMin(minSi) + '</b><br>Abtauchen frühestens um <b>' + fmtClock(h.lastEnd + minSi * 60000) + '</b>.';
      if (minSi < 60) out += '<br><span class="mut">Empfehlung: mindestens 1 h Pause zwischen Tauchgängen.</span>';
      out += '</div>';
    }
    out += '<table style="margin-top:8px"><tr><th>Pause</th><th>Nullzeit auf ' + depth + ' m</th><th>Abtauchen um</th></tr>';
    [10, 30, 60, 90, 120, 180, 240, 360].forEach(function (m) {
      var t = Deco.surfaceInterval(env, h.lastTissues, m);
      var n = Deco.ndl(env, t, depth, fO2, 400);
      out += '<tr><td>' + fmtMin(m) + '</td><td class="' + (n >= bt ? 'c-ok' : 'c-w') + '">' + (n >= 400 ? '> 6 h' : n + ' min') + '</td><td>' + fmtClock(h.lastEnd + m * 60000) + '</td></tr>';
    });
    out += '</table>';
    $('n_out').innerHTML = out;
  });

  // ---------- TABELLEN ----------
  function tableEnv() {
    var v = $('tb_env').value;
    var water = v.indexOf('fresh') === 0 ? 'fresh' : 'salt';
    var alt = parseInt(v.replace(/\D/g, ''), 10) || 0;
    return envFor({ alt: alt, water: water });
  }
  function renderNdlTable() {
    var env = tableEnv();
    var fO2 = parseInt($('tb_gas').value, 10) / 100;
    var t0 = Deco.freshTissues(env);
    var h = '<table><tr><th>Tiefe</th><th>Nullzeit</th><th>ppO₂</th><th>Gas*</th></tr>';
    for (var z = 6; z <= 45; z += 3) {
      var pp = Deco.amb(env, z) * fO2;
      if (pp > 1.6) break;
      var n = Deco.ndl(env, t0, z, fO2, 400);
      var gas = Deco.planDive(env, t0, z, Math.min(n, 400), fO2, { sac: 20 }).gasLiters;
      var over = pp > settings.maxPpo2;
      h += '<tr><td>' + z + ' m</td><td class="' + (over ? 'c-b' : '') + '">' + (n >= 400 ? '> 6 h' : n + ' min') + '</td><td class="' + (over ? 'bad-t' : '') + '">' + pp.toFixed(2) + '</td><td>' + Math.round(gas) + ' l</td></tr>';
    }
    h += '</table><p class="mut">Bühlmann ZHL-16C, GF ' + settings.gfLo + '/' + settings.gfHi + ', erster Tauchgang des Tages. *Gasbedarf bei voller Nullzeit, 20 l/min. Rot = MOD überschritten.</p>';
    $('tb_ndl').innerHTML = h;
  }
  $('tb_gas').addEventListener('change', renderNdlTable);
  $('tb_env').addEventListener('change', renderNdlTable);

  $('tr_calc').addEventListener('click', function () {
    var env = tableEnv();
    var fO2 = parseInt($('tb_gas').value, 10) / 100;
    var d1 = Math.min(60, Math.max(3, num('tr_d', 25))), t1 = Math.max(1, Math.round(num('tr_t', 25)));
    var p = Deco.planDive(env, Deco.freshTissues(env), d1, t1, fO2, { sac: 20 });
    var sis = [10, 30, 60, 120, 180, 360];
    var h = '';
    if (!p.noDeco) h += '<div class="status warn" style="margin-top:10px">Der erste Tauchgang (' + d1 + ' m / ' + t1 + ' min) ist bereits ein Deko-Tauchgang!</div>';
    h += '<table style="margin-top:8px"><tr><th>Tiefe</th>' + sis.map(function (s) { return '<th>' + (s < 60 ? s + "'" : s / 60 + ' h') + '</th>'; }).join('') + '</tr>';
    for (var z = 9; z <= 40; z += 3) {
      if (Deco.amb(env, z) * fO2 > settings.maxPpo2) break;
      var fresh = Deco.ndl(env, Deco.freshTissues(env), z, fO2, 400);
      h += '<tr><td>' + z + ' m</td>';
      sis.forEach(function (s) {
        var n = Deco.ndl(env, Deco.surfaceInterval(env, p.tissues, s), z, fO2, 400);
        var r = n / fresh;
        h += '<td class="' + (r > 0.9 ? 'c-ok' : r > 0.6 ? 'c-w' : 'c-b') + '">' + (n >= 400 ? '>6h' : n) + '</td>';
      });
      h += '</tr>';
    }
    h += '</table><p class="mut">Werte = Nullzeit (min) des Wiederholungstauchgangs nach der jeweiligen Oberflächenpause. Grün ≈ wie erster TG, Rot = stark verkürzt.</p>';
    $('tb_rep').innerHTML = h;
  });

  function renderModTable() {
    var env = Deco.makeEnv({});
    var h = '<table><tr><th>Gas</th><th>MOD 1,4</th><th>MOD 1,6</th><th>EAD auf 25 m</th></tr>';
    [21, 28, 32, 36, 40].forEach(function (o) {
      h += '<tr><td>' + gasName(o) + '</td><td>' + Deco.mod(env, o / 100, 1.4).toFixed(1) + ' m</td><td>' + Deco.mod(env, o / 100, 1.6).toFixed(1) + ' m</td><td>' + (Deco.mod(env, o / 100, 1.6) >= 25 ? Deco.ead(env, 25, o / 100).toFixed(1) + ' m' : '–') + '</td></tr>';
    });
    h += '</table><p class="mut">Salzwasser, Meereshöhe. EAD = äquivalente Lufttiefe (Stickstoffbelastung wie mit Luft auf dieser Tiefe).</p>';
    $('tb_mod').innerHTML = h;
  }

  // ---------- EINSTELLUNGEN ----------
  function showSettings() {
    $('s_gflo').value = settings.gfLo; $('s_gfhi').value = settings.gfHi;
    $('s_desc').value = settings.descRate; $('s_asc').value = settings.ascRate;
    $('s_ppo2').value = settings.maxPpo2; $('s_ss').value = settings.safetyStop ? '1' : '0';
    var pr = settings.gfLo + '/' + settings.gfHi;
    var opt = Array.prototype.some.call($('s_preset').options, function (o) { return o.value === pr; });
    $('s_preset').value = opt ? pr : 'custom';
  }
  $('s_preset').addEventListener('change', function () {
    if (this.value === 'custom') return;
    var p = this.value.split('/');
    $('s_gflo').value = p[0]; $('s_gfhi').value = p[1];
  });
  $('s_save').addEventListener('click', function () {
    var lo = Math.min(100, Math.max(10, Math.round(num('s_gflo', 40))));
    var hi = Math.min(100, Math.max(lo, Math.round(num('s_gfhi', 85))));
    settings = {
      gfLo: lo, gfHi: hi,
      descRate: Math.min(30, Math.max(5, num('s_desc', 18))),
      ascRate: Math.min(10, Math.max(3, num('s_asc', 9))),
      maxPpo2: Math.min(1.6, Math.max(1.0, num('s_ppo2', 1.4))),
      safetyStop: $('s_ss').value === '1'
    };
    store(KEY_SET, settings);
    showSettings();
    this.textContent = 'Gespeichert ✓';
    var b = this; setTimeout(function () { b.textContent = 'Speichern'; }, 1500);
  });
  $('s_clear').addEventListener('click', function () {
    if (!confirm('Wirklich alle gespeicherten Tauchgänge löschen?')) return;
    dives = []; store(KEY_DIVES, dives);
    alert('Alle Tauchgänge gelöscht.');
  });
  showSettings();
})();
