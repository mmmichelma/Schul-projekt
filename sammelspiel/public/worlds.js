/*
 * Zeichenfunktionen für alle Welten (nur im Browser).
 * Jede Welt hat:
 *   bg(ctx, r)               – Hintergrund
 *   decoy(ctx, r, x, y, s)   – ein Ablenkungs-Objekt (Strohhalm, Kiesel, Blatt …)
 *   target(ctx, t)           – das gesuchte Objekt (Nadel, Muschel, Pilz …)
 *   decoyRadius              – ungefähre Größe der Ablenkung
 */
(function () {
  'use strict';
  const { W, H } = Shared;

  const pick = (r, arr) => arr[Math.floor(r() * arr.length)];

  function speckle(ctx, r, n, colors, maxR) {
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = pick(r, colors);
      ctx.globalAlpha = 0.25 + r() * 0.5;
      ctx.beginPath();
      ctx.arc(r() * W, r() * H, 0.5 + r() * maxR, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function radial(ctx, inner, outer) {
    const g = ctx.createRadialGradient(W / 2, H / 2, 50, W / 2, H / 2, W * 0.7);
    g.addColorStop(0, inner);
    g.addColorStop(1, outer);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  // Ein Blatt mit spitzen Enden
  function leafPath(ctx, len, wid) {
    ctx.beginPath();
    ctx.moveTo(-len / 2, 0);
    ctx.quadraticCurveTo(0, -wid, len / 2, 0);
    ctx.quadraticCurveTo(0, wid, -len / 2, 0);
    ctx.closePath();
  }

  function wrappedCandy(ctx, rad, fill, edge) {
    ctx.fillStyle = fill;
    ctx.strokeStyle = edge;
    ctx.lineWidth = 1;
    for (const d of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(d * rad * 0.8, 0);
      ctx.lineTo(d * rad * 1.9, -rad * 0.75);
      ctx.lineTo(d * rad * 1.9, rad * 0.75);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.ellipse(0, 0, rad * 1.05, rad * 0.85, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    ctx.ellipse(-rad * 0.35, -rad * 0.3, rad * 0.35, rad * 0.2, -0.5, 0, Math.PI * 2);
    ctx.fill();
  }

  function gemPath(ctx, rad) {
    ctx.beginPath();
    ctx.moveTo(0, -rad);
    ctx.lineTo(rad * 0.8, -rad * 0.3);
    ctx.lineTo(0, rad);
    ctx.lineTo(-rad * 0.8, -rad * 0.3);
    ctx.closePath();
  }

  const WORLD_ART = {
    // ------------------------------------------------------------ Heuhaufen
    heu: {
      decoyRadius: 6,
      bg(ctx, r) {
        radial(ctx, '#d8ad4a', '#9c7424');
        speckle(ctx, r, 2500, ['#f3d77a', '#b5862c', '#7d5a1a'], 1.6);
      },
      decoy(ctx, r, x, y, s) {
        const len = (22 + r() * 40) * s;
        const a = r() * Math.PI;
        const w = 1.3 + r() * 2.2;
        // Nur wenige Halme sind grau – die sehen einer Nadel gemein ähnlich
        const col = r() < 0.04 ? '#c9cbc4' : pick(r, ['#f1d36b', '#e3bd4f', '#d4a83c', '#f7e39a', '#c09033', '#e8c860']);
        const dx = Math.cos(a) * len / 2;
        const dy = Math.sin(a) * len / 2;
        ctx.lineCap = 'round';
        ctx.strokeStyle = 'rgba(90,60,10,0.45)';
        ctx.lineWidth = w + 1.2;
        ctx.beginPath(); ctx.moveTo(x - dx, y - dy); ctx.lineTo(x + dx, y + dy); ctx.stroke();
        ctx.strokeStyle = col;
        ctx.lineWidth = w;
        ctx.beginPath(); ctx.moveTo(x - dx, y - dy); ctx.lineTo(x + dx, y + dy); ctx.stroke();
      },
      target(ctx, t) {
        const len = 30 * t.s;
        ctx.save();
        ctx.translate(t.x, t.y);
        ctx.rotate(t.a);
        ctx.lineCap = 'round';
        ctx.strokeStyle = 'rgba(40,40,50,0.6)';
        ctx.lineWidth = 2.8;
        ctx.beginPath(); ctx.moveTo(-len / 2, 0); ctx.lineTo(len / 2, 0); ctx.stroke();
        const g = ctx.createLinearGradient(0, -1.5, 0, 1.5);
        g.addColorStop(0, '#ffffff');
        g.addColorStop(0.5, '#b9c0c8');
        g.addColorStop(1, '#6d7681');
        ctx.strokeStyle = g;
        ctx.lineWidth = 1.8;
        ctx.beginPath(); ctx.moveTo(-len / 2, 0); ctx.lineTo(len / 2 - 2, 0); ctx.stroke();
        // Spitze
        ctx.fillStyle = '#9aa3ad';
        ctx.beginPath(); ctx.moveTo(len / 2 - 3, -1); ctx.lineTo(len / 2 + 2, 0); ctx.lineTo(len / 2 - 3, 1); ctx.fill();
        // Öhr
        ctx.strokeStyle = '#5f6872';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.ellipse(-len / 2 + 3, 0, 2.6, 1.3, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      },
    },

    // ------------------------------------------------------------ Strand
    strand: {
      decoyRadius: 7,
      bg(ctx, r) {
        radial(ctx, '#f1dcaa', '#cfae6e');
        speckle(ctx, r, 4000, ['#fff3d1', '#b8955a', '#d9c08a', '#8d7550'], 1.4);
      },
      decoy(ctx, r, x, y, s) {
        const rad = (3 + r() * 7) * s;
        const col = pick(r, ['#8e8a85', '#b7aea2', '#6f6a66', '#d8cbb6', '#a08f7a', '#e4c3b4', '#c99f8d', '#ffffff', '#5d6b73']);
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(r() * Math.PI);
        ctx.fillStyle = 'rgba(70,50,20,0.25)';
        ctx.beginPath(); ctx.ellipse(1.5, 1.5, rad, rad * 0.7, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.ellipse(0, 0, rad, rad * (0.55 + r() * 0.3), 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.beginPath(); ctx.ellipse(-rad * 0.3, -rad * 0.2, rad * 0.35, rad * 0.2, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      },
      target(ctx, t) {
        const rad = 11 * t.s;
        ctx.save();
        ctx.translate(t.x, t.y);
        ctx.rotate(t.a);
        ctx.fillStyle = '#f2a39b';
        ctx.strokeStyle = '#b86158';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, rad * 0.55);
        ctx.arc(0, rad * 0.55, rad, Math.PI * 1.15, Math.PI * 1.85);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        for (let i = 0; i < 6; i++) {
          const ang = Math.PI * (1.2 + i * 0.12);
          ctx.beginPath();
          ctx.moveTo(0, rad * 0.55);
          ctx.lineTo(Math.cos(ang) * rad, rad * 0.55 + Math.sin(ang) * rad);
          ctx.stroke();
        }
        ctx.fillStyle = '#d9837a';
        ctx.fillRect(-rad * 0.25, rad * 0.45, rad * 0.5, rad * 0.25);
        ctx.restore();
      },
    },

    // ------------------------------------------------------------ Herbstwald
    wald: {
      decoyRadius: 9,
      bg(ctx, r) {
        radial(ctx, '#5c4a2a', '#2e2414');
        speckle(ctx, r, 2500, ['#3d5c22', '#6b5330', '#1c140a'], 2);
      },
      decoy(ctx, r, x, y, s) {
        const len = (12 + r() * 16) * s;
        const col = pick(r, ['#c8501e', '#e2892b', '#f2c03a', '#8a3b17', '#6f8a2a', '#a8361c', '#d96a24', '#b58b3a', '#cc3322']);
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(r() * Math.PI * 2);
        ctx.fillStyle = col;
        leafPath(ctx, len, len * 0.45);
        ctx.fill();
        ctx.strokeStyle = 'rgba(40,20,5,0.55)';
        ctx.lineWidth = 0.8;
        ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-len / 2, 0); ctx.lineTo(len / 2 + 3, 0); ctx.stroke();
        ctx.restore();
      },
      target(ctx, t) {
        const rad = 8 * t.s;
        ctx.save();
        ctx.translate(t.x, t.y);
        ctx.rotate(t.a * 0.25 - 0.4);
        ctx.fillStyle = '#efe2c4';
        ctx.strokeStyle = '#7d6a4a';
        ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.rect(-rad * 0.35, 0, rad * 0.7, rad * 1.1); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#e0241b';
        ctx.strokeStyle = '#7a0f0a';
        ctx.beginPath(); ctx.arc(0, rad * 0.1, rad, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#ffffff';
        for (const [dx, dy] of [[-0.5, -0.35], [0.1, -0.65], [0.55, -0.25], [-0.1, -0.15]]) {
          ctx.beginPath(); ctx.arc(dx * rad, dy * rad, rad * 0.15, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
      },
    },

    // ------------------------------------------------------------ Bonbonladen
    bonbon: {
      decoyRadius: 9,
      bg(ctx, r) {
        radial(ctx, '#ffd6e8', '#e98bb5');
        speckle(ctx, r, 1500, ['#ffffff', '#ff6fa8', '#9ad8ff'], 2);
      },
      decoy(ctx, r, x, y, s) {
        const rad = (4.5 + r() * 3) * s;
        const [fill, edge] = pick(r, [
          ['#ff4d6d', '#9b1d33'], ['#4dabff', '#1d5a9b'], ['#7be37b', '#2a7f2a'],
          ['#b36bff', '#5a2a9b'], ['#ff9a3c', '#a2551a'], ['#f7e36a', '#a59320'],
          ['#ffffff', '#999999'], ['#ff7fcf', '#a33d7f'], ['#e0b84a', '#8a6d1d'],
        ]);
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(r() * Math.PI * 2);
        wrappedCandy(ctx, rad, fill, edge);
        ctx.restore();
      },
      target(ctx, t) {
        const rad = 6 * t.s;
        ctx.save();
        ctx.translate(t.x, t.y);
        ctx.rotate(t.a);
        const g = ctx.createLinearGradient(-rad, -rad, rad, rad);
        g.addColorStop(0, '#fff6b0');
        g.addColorStop(0.45, '#ffcf1f');
        g.addColorStop(1, '#b8860b');
        wrappedCandy(ctx, rad, g, '#7a5600');
        ctx.restore();
        // Funkeln
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.beginPath();
        ctx.moveTo(t.x + 5, t.y - 9); ctx.lineTo(t.x + 6, t.y - 6); ctx.lineTo(t.x + 9, t.y - 5);
        ctx.lineTo(t.x + 6, t.y - 4); ctx.lineTo(t.x + 5, t.y - 1); ctx.lineTo(t.x + 4, t.y - 4);
        ctx.lineTo(t.x + 1, t.y - 5); ctx.lineTo(t.x + 4, t.y - 6); ctx.closePath(); ctx.fill();
      },
    },

    // ------------------------------------------------------------ Weltall
    weltall: {
      decoyRadius: 4,
      bg(ctx, r) {
        ctx.fillStyle = '#05071a';
        ctx.fillRect(0, 0, W, H);
        for (let i = 0; i < 6; i++) {
          const x = r() * W, y = r() * H, rad = 120 + r() * 220;
          const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
          g.addColorStop(0, pick(r, ['rgba(120,60,200,0.35)', 'rgba(40,120,220,0.3)', 'rgba(220,60,140,0.25)']));
          g.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, W, H);
        }
        speckle(ctx, r, 3000, ['#ffffff', '#9ab8ff', '#ffe9a8'], 1);
      },
      decoy(ctx, r, x, y, s) {
        const k = r();
        if (k < 0.8) {
          const rad = (1.5 + r() * 3.5) * s;
          ctx.fillStyle = pick(r, ['#ffffff', '#cfe0ff', '#ffeeb0', '#ffc2c2', '#b0ffcf']);
          ctx.beginPath();
          for (let i = 0; i < 8; i++) {
            const ang = (i / 8) * Math.PI * 2;
            const rr = i % 2 === 0 ? rad : rad * 0.35;
            ctx.lineTo(x + Math.cos(ang) * rr, y + Math.sin(ang) * rr);
          }
          ctx.closePath();
          ctx.fill();
        } else {
          const rad = (3 + r() * 6) * s;
          const col = pick(r, ['#c0712f', '#6b8cd6', '#9c9c9c', '#7fbf7f', '#d1a3e0']);
          const g = ctx.createRadialGradient(x - rad * 0.4, y - rad * 0.4, 0, x, y, rad);
          g.addColorStop(0, '#ffffff');
          g.addColorStop(0.25, col);
          g.addColorStop(1, '#111122');
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
        }
      },
      target(ctx, t) {
        const rad = 9 * t.s;
        ctx.save();
        ctx.translate(t.x, t.y);
        ctx.rotate(Math.sin(t.a) * 0.35);
        ctx.fillStyle = 'rgba(140,255,170,0.75)';
        ctx.beginPath(); ctx.ellipse(0, -rad * 0.25, rad * 0.45, rad * 0.45, 0, Math.PI, 0); ctx.fill();
        const g = ctx.createLinearGradient(0, -rad * 0.3, 0, rad * 0.4);
        g.addColorStop(0, '#e8ecf2');
        g.addColorStop(1, '#6a7380');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.ellipse(0, 0, rad, rad * 0.32, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffde3b';
        for (const dx of [-0.55, 0, 0.55]) {
          ctx.beginPath(); ctx.arc(dx * rad, rad * 0.08, rad * 0.09, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
      },
    },

    // ------------------------------------------------------------ Schatzkammer
    schatz: {
      decoyRadius: 7,
      bg(ctx, r) {
        radial(ctx, '#7a5a1a', '#2a1c06');
        speckle(ctx, r, 2500, ['#ffd86b', '#a87a1a', '#3d2a08'], 2);
      },
      decoy(ctx, r, x, y, s) {
        if (r() < 0.75) {
          const rad = (5 + r() * 4) * s;
          ctx.save();
          ctx.translate(x, y);
          ctx.scale(1, 0.55 + r() * 0.45);
          const g = ctx.createLinearGradient(-rad, -rad, rad, rad);
          g.addColorStop(0, '#fff1a8');
          g.addColorStop(0.5, '#e6b422');
          g.addColorStop(1, '#8a6410');
          ctx.fillStyle = g;
          ctx.strokeStyle = '#6b4a08';
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(0, 0, rad, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          ctx.strokeStyle = 'rgba(110,75,8,0.7)';
          ctx.beginPath(); ctx.arc(0, 0, rad * 0.65, 0, Math.PI * 2); ctx.stroke();
          ctx.restore();
        } else {
          const rad = (4 + r() * 4) * s;
          const col = pick(r, ['#e0203a', '#1fae4b', '#8a2be2', '#2a5bd8', '#ff7ab8', '#14b8a6']);
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate((r() - 0.5) * 1.2);
          ctx.fillStyle = col;
          gemPath(ctx, rad);
          ctx.fill();
          ctx.strokeStyle = 'rgba(0,0,0,0.5)';
          ctx.lineWidth = 0.8;
          ctx.stroke();
          ctx.fillStyle = 'rgba(255,255,255,0.4)';
          ctx.beginPath(); ctx.moveTo(0, -rad); ctx.lineTo(rad * 0.3, -rad * 0.3); ctx.lineTo(0, rad * 0.2); ctx.closePath(); ctx.fill();
          ctx.restore();
        }
      },
      target(ctx, t) {
        const rad = 8 * t.s;
        ctx.save();
        ctx.translate(t.x, t.y);
        ctx.rotate((Math.sin(t.a) * 0.5));
        const g = ctx.createLinearGradient(-rad, -rad, rad, rad);
        g.addColorStop(0, '#ffffff');
        g.addColorStop(0.4, '#aef0ff');
        g.addColorStop(1, '#3fb6e0');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(-rad * 0.55, -rad * 0.55);
        ctx.lineTo(rad * 0.55, -rad * 0.55);
        ctx.lineTo(rad, -rad * 0.15);
        ctx.lineTo(0, rad);
        ctx.lineTo(-rad, -rad * 0.15);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#1a6f8f';
        ctx.lineWidth = 0.8;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-rad, -rad * 0.15); ctx.lineTo(rad, -rad * 0.15);
        ctx.moveTo(-rad * 0.3, -rad * 0.15); ctx.lineTo(0, rad); ctx.lineTo(rad * 0.3, -rad * 0.15);
        ctx.stroke();
        ctx.restore();
      },
    },
  };

  // Sammelgegenstände sind Emojis
  function drawCollectible(ctx, item) {
    const c = Shared.findCollectible(item.cid);
    if (!c) return;
    ctx.save();
    ctx.translate(item.x, item.y);
    ctx.rotate(item.a);
    ctx.font = '17px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.globalAlpha = 0.92;
    ctx.fillText(c.icon, 0, 0);
    ctx.restore();
  }

  window.WorldArt = { art: WORLD_ART, drawCollectible };
})();
