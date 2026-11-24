/*
 * Dekompressions-Engine: Bühlmann ZHL-16C (nur Stickstoff) mit Gradientenfaktoren.
 * Unterstützt Luft und Nitrox, Höhentauchen (Luftdruck), Salz-/Süßwasser,
 * Wiederholungstauchgänge mit Oberflächenpausen.
 *
 * ACHTUNG: Nur für Ausbildung/Planung. Ersetzt keinen Tauchcomputer und keine Ausbildung.
 */
(function (root) {
  'use strict';

  var HT = [4.0, 8.0, 12.5, 18.5, 27.0, 38.3, 54.3, 77.0, 109, 146, 187, 239, 305, 390, 498, 635];
  var A = [1.2599, 1.0000, 0.8618, 0.7562, 0.6200, 0.5043, 0.4410, 0.4000,
           0.3750, 0.3500, 0.3295, 0.3065, 0.2835, 0.2610, 0.2480, 0.2327];
  var B = [0.5050, 0.6514, 0.7222, 0.7825, 0.8126, 0.8434, 0.8693, 0.8910,
           0.9092, 0.9222, 0.9319, 0.9403, 0.9477, 0.9544, 0.9602, 0.9653];
  var PH2O = 0.0627; // Wasserdampfdruck in der Lunge (bar)
  var AIR_N2 = 0.7902;
  var N = HT.length;
  var K = HT.map(function (h) { return Math.LN2 / h; });

  // NOAA CNS-Grenzen (Minuten bei ppO2)
  var CNS_TABLE = [[0.6, 720], [0.7, 570], [0.8, 450], [0.9, 360], [1.0, 300],
                   [1.1, 240], [1.2, 210], [1.3, 180], [1.4, 150], [1.5, 120], [1.6, 45]];

  function surfacePressure(altitudeM) {
    // Barometrische Höhenformel (Standardatmosphäre)
    return 1.01325 * Math.pow(1 - 2.25577e-5 * Math.max(0, altitudeM), 5.25588);
  }

  function makeEnv(o) {
    o = o || {};
    var salt = o.water !== 'fresh';
    var env = {
      psurf: surfacePressure(o.altitude || 0),
      barPerM: (salt ? 1.025 : 1.000) * 9.80665 / 100,
      gfLo: (o.gfLo || 30) / 100,
      gfHi: (o.gfHi || 85) / 100,
      descRate: o.descRate || 18,
      ascRate: o.ascRate || 9,
      lastStop: o.lastStop || 3,
      stopStep: 3,
      safetyStop: o.safetyStop !== false,
      maxPpo2: o.maxPpo2 || 1.4,
      altitude: o.altitude || 0
    };
    return env;
  }

  function amb(env, depth) { return env.psurf + depth * env.barPerM; }

  function freshTissues(env) {
    var p = (env.psurf - PH2O) * AIR_N2;
    var t = [];
    for (var i = 0; i < N; i++) t.push(p);
    return t;
  }

  function cloneT(t) { return t.slice(); }

  // Konstante Tiefe (Haldane)
  function constant(env, t, depth, minutes, fN2) {
    if (minutes <= 0) return t;
    var pi = (amb(env, depth) - PH2O) * fN2;
    for (var i = 0; i < N; i++) {
      t[i] = t[i] + (pi - t[i]) * (1 - Math.exp(-K[i] * minutes));
    }
    return t;
  }

  // Tiefenwechsel mit konstanter Geschwindigkeit (Schreiner)
  function changeDepth(env, t, d1, d2, rate, fN2) {
    var time = Math.abs(d2 - d1) / rate;
    if (time <= 0) return 0;
    var pi0 = (amb(env, d1) - PH2O) * fN2;
    var R = ((d2 - d1) / time) * env.barPerM * fN2;
    for (var i = 0; i < N; i++) {
      var k = K[i];
      t[i] = pi0 + R * (time - 1 / k) - (pi0 - t[i] - R / k) * Math.exp(-k * time);
    }
    return time;
  }

  // Tolerierter Umgebungsdruck für einen GF
  function tolerated(t, gf) {
    var m = 0;
    for (var i = 0; i < N; i++) {
      var p = (t[i] - A[i] * gf) / (gf / B[i] + 1 - gf);
      if (p > m) m = p;
    }
    return m;
  }

  function ceilingDepth(env, t, gf) {
    return Math.max(0, (tolerated(t, gf) - env.psurf) / env.barPerM);
  }

  function gfAt(env, depth, firstStop) {
    if (!firstStop || firstStop <= 0) return env.gfHi;
    var f = Math.max(0, Math.min(1, depth / firstStop));
    return env.gfHi - (env.gfHi - env.gfLo) * f;
  }

  function cnsRate(ppo2) {
    if (ppo2 < 0.5) return 0;
    if (ppo2 <= 0.6) return 1 / 720;
    for (var i = 1; i < CNS_TABLE.length; i++) {
      if (ppo2 <= CNS_TABLE[i][0]) {
        var a = CNS_TABLE[i - 1], b = CNS_TABLE[i];
        var lim = a[1] + (b[1] - a[1]) * (ppo2 - a[0]) / (b[0] - a[0]);
        return 1 / lim;
      }
    }
    return 1 / 45 * Math.exp((ppo2 - 1.6) * 10); // > 1.6: sehr schnell steigend
  }

  function mod(env, o2frac, ppo2) {
    return Math.max(0, ((ppo2 || env.maxPpo2) / o2frac - env.psurf) / env.barPerM);
  }

  function ead(env, depth, o2frac) {
    var fN2 = 1 - o2frac;
    return Math.max(0, ((amb(env, depth) * fN2 / AIR_N2) - env.psurf) / env.barPerM);
  }

  /*
   * Nullzeit: maximale Grundzeit (inkl. Abstieg) auf Tiefe, sodass ein
   * direkter Aufstieg (mit Aufstiegsgeschwindigkeit) ohne Pflichtstopp möglich ist.
   */
  function ndl(env, tissues, depth, o2frac, maxMin) {
    maxMin = maxMin || 999;
    var fN2 = 1 - o2frac;
    var t = cloneT(tissues);
    var desc = changeDepth(env, t, 0, depth, env.descRate, fN2);
    if (!canAscendDirect(env, t, depth, fN2)) return 0;
    var minutes = desc;
    var step = 1;
    while (minutes < maxMin) {
      var next = cloneT(t);
      constant(env, next, depth, step, fN2);
      if (!canAscendDirect(env, next, depth, fN2)) break;
      t = next;
      minutes += step;
    }
    return Math.min(maxMin, Math.floor(minutes));
  }

  function canAscendDirect(env, t, depth, fN2) {
    var x = cloneT(t);
    changeDepth(env, x, depth, 0, env.ascRate, fN2);
    return tolerated(x, env.gfHi) <= env.psurf + 1e-9 && ceilingDepth(env, t, env.gfHi) <= 0;
  }

  /*
   * Plant einen Tauchgang. bottomTime = Zeit ab Abtauchen bis Beginn Aufstieg (Minuten).
   * Gibt Profil, Stopps, Laufzeit, Gewebe nach dem Tauchgang usw. zurück.
   */
  function planDive(env, tissues, depth, bottomTime, o2frac, gas) {
    var fN2 = 1 - o2frac;
    var t = cloneT(tissues);
    var segs = [];
    var cns = 0;
    var gasUsed = 0;
    var sac = (gas && gas.sac) || 20;
    var maxPpo2 = amb(env, depth) * o2frac;

    function addSeg(type, d1, d2, time) {
      if (time <= 0) return;
      var avgP = (amb(env, d1) + amb(env, d2)) / 2;
      cns += cnsRate(avgP * o2frac) * time;
      gasUsed += sac * avgP * time;
      segs.push({ type: type, from: d1, to: d2, time: time });
    }

    var descT = Math.min(changeDepth(env, t, 0, depth, env.descRate, fN2), bottomTime);
    addSeg('Abstieg', 0, depth, descT);
    var atDepth = Math.max(0, bottomTime - descT);
    constant(env, t, depth, atDepth, fN2);
    addSeg('Grund', depth, depth, atDepth);

    var noDeco = canAscendDirect(env, t, depth, fN2);
    var stops = [];
    var cur = depth;
    var firstStop = 0;

    if (!noDeco) {
      var c = ceilingDepth(env, t, env.gfLo);
      firstStop = Math.ceil(c / env.stopStep) * env.stopStep;
      if (firstStop < env.lastStop) firstStop = env.lastStop;
      if (firstStop >= depth) firstStop = Math.floor((depth - 0.01) / env.stopStep) * env.stopStep;
      // Aufstieg zum ersten Stopp; ggf. tiefer stoppen falls nötig
      var ascT = changeDepth(env, t, cur, firstStop, env.ascRate, fN2);
      addSeg('Aufstieg', cur, firstStop, ascT);
      cur = firstStop;
      var guard = 0;
      while (cur > 0 && guard++ < 2000) {
        var next = cur - env.stopStep;
        if (next < env.lastStop) next = 0;
        var stopMin = 0;
        while (guard++ < 5000) {
          var gfNext = gfAt(env, next, firstStop);
          var probe = cloneT(t);
          changeDepth(env, probe, cur, next, env.ascRate, fN2);
          var ok = next === 0 ? tolerated(probe, env.gfHi) <= env.psurf + 1e-9
                              : tolerated(probe, gfNext) <= amb(env, next) + 1e-9;
          if (ok) break;
          constant(env, t, cur, 1, fN2);
          stopMin++;
        }
        if (stopMin > 0) {
          stops.push({ depth: cur, time: stopMin });
          addSeg('Stopp', cur, cur, stopMin);
        }
        var aT = changeDepth(env, t, cur, next, env.ascRate, fN2);
        addSeg('Aufstieg', cur, next, aT);
        cur = next;
      }
    } else {
      if (env.safetyStop && depth > 6) {
        var a1 = changeDepth(env, t, depth, 5, env.ascRate, fN2);
        addSeg('Aufstieg', depth, 5, a1);
        constant(env, t, 5, 3, fN2);
        addSeg('Sicherheitsstopp', 5, 5, 3);
        stops.push({ depth: 5, time: 3, safety: true });
        var a2 = changeDepth(env, t, 5, 0, env.ascRate, fN2);
        addSeg('Aufstieg', 5, 0, a2);
      } else {
        var a3 = changeDepth(env, t, depth, 0, env.ascRate, fN2);
        addSeg('Aufstieg', depth, 0, a3);
      }
    }

    var runtime = segs.reduce(function (s, x) { return s + x.time; }, 0);
    var decoTime = stops.filter(function (s) { return !s.safety; })
                        .reduce(function (s, x) { return s + x.time; }, 0);
    return {
      noDeco: noDeco,
      stops: stops,
      segments: segs,
      runtime: runtime,
      decoTime: decoTime,
      tissues: t,
      cns: cns * 100,
      maxPpo2: maxPpo2,
      gasLiters: gasUsed,
      firstStop: firstStop
    };
  }

  function surfaceInterval(env, tissues, minutes) {
    return constant(env, cloneT(tissues), 0, minutes, AIR_N2);
  }

  // Minimale Oberflächenpause, damit der nächste Tauchgang ein Nullzeit-TG ist.
  function minSurfaceInterval(env, tissues, depth, bottomTime, o2frac) {
    function ok(si) {
      var t = surfaceInterval(env, tissues, si);
      return ndl(env, t, depth, o2frac, bottomTime + 1) >= bottomTime;
    }
    if (ok(0)) return 0;
    var hi = 10, max = 48 * 60;
    while (!ok(hi)) { hi *= 2; if (hi > max) return null; }
    var lo = hi / 2 | 0;
    while (hi - lo > 1) {
      var mid = (lo + hi) >> 1;
      if (ok(mid)) hi = mid; else lo = mid;
    }
    return hi;
  }

  // Maximale Tiefe (ganze Meter) für eine Grundzeit als Nullzeit-TG
  function maxDepthFor(env, tissues, bottomTime, o2frac) {
    var limit = Math.floor(mod(env, o2frac));
    var best = 0;
    for (var d = 3; d <= Math.min(limit, 60); d++) {
      if (ndl(env, tissues, d, o2frac, bottomTime + 1) >= bottomTime) best = d; else break;
    }
    return best;
  }

  // Zeit, bis alle Gewebe nahezu entsättigt sind (Übersättigung < 2 %)
  function desatTime(env, tissues) {
    var eq = (env.psurf - PH2O) * AIR_N2;
    var maxT = 0;
    for (var i = 0; i < N; i++) {
      var excess = tissues[i] - eq;
      if (excess > eq * 0.02) {
        var tt = Math.log(excess / (eq * 0.02)) / K[i];
        if (tt > maxT) maxT = tt;
      }
    }
    return Math.ceil(maxT);
  }

  // Sättigung des Leitgewebes in % des M-Werts an der Oberfläche
  function surfaceGF(env, tissues) {
    var eq = (env.psurf - PH2O) * AIR_N2;
    var m = 0;
    for (var i = 0; i < N; i++) {
      var mv = env.psurf / B[i] + A[i];
      var g = (tissues[i] - env.psurf) / (mv - env.psurf);
      if (g > m) m = g;
    }
    return Math.max(0, m * 100);
  }

  var api = {
    makeEnv: makeEnv, freshTissues: freshTissues, ndl: ndl, planDive: planDive,
    surfaceInterval: surfaceInterval, minSurfaceInterval: minSurfaceInterval,
    maxDepthFor: maxDepthFor, desatTime: desatTime, mod: mod, ead: ead,
    surfacePressure: surfacePressure, surfaceGF: surfaceGF, amb: amb, AIR_N2: AIR_N2
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Deco = api;
})(this);
