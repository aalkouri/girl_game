'use strict';
// Island Night client: PixiJS renderer (water shader, dynamic lighting, particles) + net + input
const $ = id => document.getElementById(id);
const TAU = Math.PI * 2, rnd = (a, b) => a + Math.random() * (b - a), clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const BM = PIXI.BLEND_MODES;
let RR = 900;
const edgeJ = (a, r, s) => r + 16 * Math.sin(3 * a + 1.3 + s) + 9 * Math.sin(7 * a + .4 + s * 2) + 5 * Math.sin(13 * a + 2.1 + s * 3);
const edge = a => edgeJ(a, RR, 0);
let ISL = [];   // the other islands: [x, y, radius, 'f'orest | 'd'esert]
const isWaterC = (x, y) => { if (Math.hypot(x, y) < RR + 40) return false; for (const s of ISL) if (Math.hypot(x - s[0], y - s[1]) < s[2] + 40) return false; return true; };

// ---------- procedural textures ----------
const cv2 = (w, h, fn) => { const c = document.createElement('canvas'); c.width = w; c.height = h; fn(c.getContext('2d'), w, h); return c; };
const tex = (w, h, fn) => PIXI.Texture.from(cv2(w, h, fn));
const circ = (g, x, y, r) => { g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); };
const ell = (g, x, y, rx, ry) => { g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, TAU); g.fill(); };
const radial = (size, stops) => tex(size, size, g => { const h = size / 2, r = g.createRadialGradient(h, h, 0, h, h, h); stops.forEach(s => r.addColorStop(s[0], s[1])); g.fillStyle = r; g.fillRect(0, 0, size, size); });

const T_GLOW = radial(128, [[0, 'rgba(255,255,255,1)'], [.35, 'rgba(255,255,255,.4)'], [1, 'rgba(255,255,255,0)']]);
const T_LIGHT = radial(128, [[0, 'rgba(255,255,255,1)'], [.45, 'rgba(255,255,255,.75)'], [.8, 'rgba(255,255,255,.2)'], [1, 'rgba(255,255,255,0)']]);
const T_SHADOW = radial(64, [[0, 'rgba(0,0,0,.55)'], [.6, 'rgba(0,0,0,.3)'], [1, 'rgba(0,0,0,0)']]);
const T_RING = radial(256, [[0, 'rgba(255,255,255,0)'], [.86, 'rgba(255,255,255,0)'], [.96, 'rgba(255,255,255,.55)'], [1, 'rgba(255,255,255,0)']]);

function noiseTile(base, cols, bladeCols) {
  return tex(256, 256, g => {
    g.fillStyle = base; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 700; i++) {
      const x = Math.random() * 256, y = Math.random() * 256, r = rnd(6, 24); g.fillStyle = cols[i % cols.length];
      for (const dx of [-256, 0, 256]) for (const dy of [-256, 0, 256]) { g.globalAlpha = .28; circ(g, x + dx, y + dy, r); }
    }
    g.globalAlpha = .5;
    for (let i = 0; i < 1100; i++) {
      const x = Math.random() * 256, y = Math.random() * 256, h = rnd(3, 7);
      g.strokeStyle = bladeCols[i % bladeCols.length]; g.lineWidth = 1.2; g.beginPath(); g.moveTo(x, y); g.lineTo(x + rnd(-2, 2), y - h); g.stroke();
    }
    g.globalAlpha = 1;
  });
}
const T_GRASS = noiseTile('#3d7a3a', ['#4a9244', '#2f6a30', '#52a04a', '#357233'], ['#6cbb5d', '#2a5e2b', '#8fd070']);
const T_SAND = noiseTile('#dccb90', ['#e8d9a2', '#cdb97c', '#d5c284'], ['#f0e4b4', '#bfa96c']);

const T_TREE = tex(130, 140, g => {
  g.fillStyle = '#4b2f17'; g.fillRect(58, 82, 14, 42); g.fillStyle = '#6b4423'; g.fillRect(58, 82, 6, 42);
  const blob = (x, y, r, c) => { g.fillStyle = c; circ(g, x, y, r); };
  [[65, 70, 34], [42, 78, 26], [88, 78, 26], [50, 48, 27], [80, 48, 27], [65, 36, 24]].forEach(b => blob(b[0], b[1], b[2], '#15462a'));
  [[65, 66, 28], [45, 74, 20], [85, 74, 20], [52, 46, 21], [78, 46, 21], [65, 36, 18]].forEach(b => blob(b[0], b[1], b[2], '#1f6a37'));
  [[56, 52, 12], [44, 70, 9], [70, 36, 9], [80, 56, 8]].forEach(b => blob(b[0], b[1], b[2], '#3f9a4d'));
  g.globalAlpha = .6; blob(52, 44, 5, '#8bd47a'); blob(70, 32, 4, '#8bd47a'); g.globalAlpha = 1;
});
const T_ROCK = tex(72, 60, g => {
  g.fillStyle = '#5b6068'; g.beginPath(); g.moveTo(8, 48); g.lineTo(14, 22); g.lineTo(32, 8); g.lineTo(54, 14); g.lineTo(66, 36); g.lineTo(58, 52); g.lineTo(20, 54); g.closePath(); g.fill();
  g.fillStyle = '#8a9099'; g.beginPath(); g.moveTo(14, 22); g.lineTo(32, 8); g.lineTo(54, 14); g.lineTo(40, 30); g.lineTo(18, 36); g.closePath(); g.fill();
  g.fillStyle = '#b5bbc4'; g.beginPath(); g.moveTo(24, 20); g.lineTo(34, 12); g.lineTo(46, 16); g.lineTo(34, 24); g.closePath(); g.fill();
  g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 2; g.beginPath(); g.moveTo(40, 30); g.lineTo(58, 52); g.stroke();
});
const T_BUSH = tex(64, 56, g => {
  [[20, 36, 16, '#1d5a2a'], [44, 36, 16, '#1d5a2a'], [32, 28, 18, '#27763a'], [26, 24, 11, '#3a9a4a']].forEach(b => { g.fillStyle = b[3]; circ(g, b[0], b[1], b[2]); });
  g.fillStyle = '#e53935'; [[22, 30], [38, 26], [32, 40], [46, 36], [16, 40], [30, 20]].forEach(b => circ(g, b[0], b[1], 3.6));
  g.fillStyle = '#ff8a80'; [[21, 29], [37, 25], [31, 39]].forEach(b => circ(g, b[0], b[1], 1.2));
});
const T_TUFT = tex(24, 20, g => { g.strokeStyle = '#2d6b2e'; g.lineWidth = 2; for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(12, 19); g.quadraticCurveTo(12 + (i - 2.5) * 3, 10, 12 + (i - 2.5) * 5, 2 + (i % 2) * 3); g.stroke(); } });
const T_FLOWER = tex(16, 16, g => { g.fillStyle = '#fff'; for (let i = 0; i < 5; i++) circ(g, 8 + Math.cos(i * 1.256) * 3.5, 8 + Math.sin(i * 1.256) * 3.5, 2.6); g.fillStyle = '#ffd54f'; circ(g, 8, 8, 2.2); });
const T_PEBBLE = tex(14, 10, g => { g.fillStyle = '#9aa0a8'; ell(g, 7, 5, 6, 4); g.fillStyle = '#c5cad2'; ell(g, 5.5, 3.5, 2.5, 1.5); });
const T_FLAME = tex(64, 100, g => {
  const gr = g.createRadialGradient(32, 70, 2, 32, 62, 38); gr.addColorStop(0, 'rgba(255,255,230,1)'); gr.addColorStop(.35, 'rgba(255,200,60,.95)'); gr.addColorStop(.7, 'rgba(255,110,20,.6)'); gr.addColorStop(1, 'rgba(255,60,0,0)');
  g.fillStyle = gr; g.beginPath(); g.moveTo(32, 2); g.bezierCurveTo(50, 36, 62, 56, 48, 82); g.bezierCurveTo(42, 96, 22, 96, 16, 82); g.bezierCurveTo(2, 56, 20, 40, 32, 2); g.fill();
});

// ---- hand-held tools and back items (drawn facing +x, origin at body centre) ----
const stroke = (g, c, w, x1, y1, x2, y2) => { g.strokeStyle = c; g.lineWidth = w; g.lineCap = 'round'; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); };
const poly = (g, c, pts) => { g.fillStyle = c; g.beginPath(); g.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]); g.closePath(); g.fill(); };
const FRONTS = {
  axe: g => { stroke(g, '#7b4f24', 3, 10, 18, 30, 8); poly(g, '#cfd8dc', [26, 2, 34, 6, 30, 14]); },
  gun: g => { g.fillStyle = '#37474f'; g.fillRect(10, 8, 22, 6); g.fillStyle = '#90a4ae'; g.fillRect(26, 9, 8, 4); },
  flare: g => { g.fillStyle = '#fff59d'; circ(g, 22, 12, 4); },
  dagger: g => { stroke(g, '#cfd8dc', 3, 12, 14, 30, 8); stroke(g, '#6d4c41', 4, 10, 15, 14, 13); },
  pick: g => { stroke(g, '#7b4f24', 3, 10, 18, 30, 6); poly(g, '#90a4ae', [24, -2, 38, 6, 33, 11, 22, 4]); },
  torch: g => { stroke(g, '#6d4c41', 3, 10, 18, 26, 11); g.fillStyle = '#ff6d00'; circ(g, 29, 9, 6); g.fillStyle = '#ffee58'; circ(g, 29, 9, 3); },
  shield: g => { g.fillStyle = '#546e7a'; circ(g, 16, -17, 11); g.strokeStyle = '#263238'; g.lineWidth = 2; g.stroke(); g.fillStyle = '#b0bec5'; circ(g, 16, -17, 5); },
  bow: g => { g.strokeStyle = '#8d6e63'; g.lineWidth = 3; g.beginPath(); g.arc(24, 0, 17, -1.2, 1.2); g.stroke(); stroke(g, '#eeeeee', 1, 24 + 17 * Math.cos(-1.2), 17 * Math.sin(-1.2), 24 + 17 * Math.cos(1.2), 17 * Math.sin(1.2)); },
  sword: g => { stroke(g, '#e0e0e0', 3, 12, 16, 36, 8); stroke(g, '#ffd54f', 3, 13, 11, 15, 20); },
  wrench: g => { stroke(g, '#9e9e9e', 4, 10, 18, 28, 8); g.fillStyle = '#bdbdbd'; circ(g, 31, 7, 6); g.fillStyle = '#37474f'; circ(g, 33, 6, 2.5); },
  staff: g => { stroke(g, '#6d4c41', 3, 6, 22, 32, -8); g.fillStyle = '#4db6ac'; circ(g, 33, -9, 5); g.fillStyle = '#e0f7fa'; circ(g, 32, -10, 2); },
  greataxe: g => { stroke(g, '#5d4037', 4, 6, 22, 30, 4); poly(g, '#b0bec5', [24, -8, 40, 0, 38, 14, 26, 10]); poly(g, '#e57373', [26, -4, 36, 1, 35, 9, 28, 7]); },
  lantern: g => { stroke(g, '#6d4c41', 2, 12, 16, 22, 13); g.fillStyle = '#ffee58'; g.fillRect(22, 8, 9, 11); g.strokeStyle = '#5d4037'; g.lineWidth = 2; g.strokeRect(22, 8, 9, 11); },
  clover: g => { g.fillStyle = '#66bb6a'; [[22, 8], [28, 8], [22, 14], [28, 14]].forEach(a => circ(g, a[0], a[1], 4)); stroke(g, '#2e7d32', 2, 25, 14, 20, 20); },
  fireorb: g => { g.fillStyle = '#ff5722'; circ(g, 26, 12, 8); g.fillStyle = '#ffab00'; circ(g, 26, 12, 5); g.fillStyle = '#fff59d'; circ(g, 26, 12, 2.5); },
  banner: g => { stroke(g, '#bdbdbd', 3, 14, 18, 28, -10); poly(g, '#e53935', [28, -10, 40, -6, 30, 1]); },
  twindagger: g => { stroke(g, '#e0e0e0', 3, 12, 15, 30, 20); stroke(g, '#e0e0e0', 3, 12, -15, 30, -20); },
  blade: g => { g.shadowColor = '#ffe082'; g.shadowBlur = 8; stroke(g, '#fff59d', 4, 10, 16, 38, 6); g.shadowBlur = 0; stroke(g, '#ffb300', 3, 12, 11, 15, 21); },
};
const BACKS = {
  radio: g => { stroke(g, '#cfd8dc', 2, -14, -6, -26, -16); g.fillStyle = '#546e7a'; g.fillRect(-18, -10, 10, 14); },
  medpack: g => { g.fillStyle = '#eceff1'; g.fillRect(-18, -9, 12, 18); g.fillStyle = '#e53935'; g.fillRect(-14, -6, 4, 12); g.fillRect(-17, -3, 10, 4); },
  pack: g => { g.fillStyle = '#6d4c41'; g.fillRect(-19, -9, 12, 18); g.fillStyle = '#8d6e63'; g.fillRect(-17, -6, 8, 6); },
  basket: g => { g.fillStyle = '#a1887f'; ell(g, -14, 0, 8, 11); g.fillStyle = '#e53935'; circ(g, -16, -3, 2.5); circ(g, -12, 2, 2.5); circ(g, -15, 5, 2.5); },
  quiver: g => { g.fillStyle = '#5d4037'; g.fillRect(-19, -7, 8, 15); stroke(g, '#cfd8dc', 1.5, -17, -7, -20, -14); stroke(g, '#cfd8dc', 1.5, -14, -7, -15, -15); },
};
function mkPlayerCanvas(L) {
  return cv2(64, 64, g => {
    g.translate(32, 32); g.lineWidth = 2; g.strokeStyle = 'rgba(0,0,0,.5)';
    if (BACKS[L[4]]) BACKS[L[4]](g);
    g.fillStyle = L[1]; ell(g, -2, 0, 12, 19); g.stroke();
    g.fillStyle = L[0]; ell(g, -3, -1, 10, 16);
    g.fillStyle = '#f0c8a0'; circ(g, 12, -16, 5); circ(g, 12, 16, 5);
    if (FRONTS[L[3]]) FRONTS[L[3]](g);
    g.fillStyle = '#f0c8a0'; circ(g, 2, 0, 11); g.stroke();
    g.fillStyle = L[2]; g.beginPath(); g.arc(2, 0, 11, Math.PI * .5, Math.PI * 1.5); g.fill();
    g.fillStyle = 'rgba(255,255,255,.25)'; circ(g, 5, -4, 3);
  });
}
const T_PL = {}, PCAN = {};
GC.LIST.forEach(c => { const cv = mkPlayerCanvas(c.look); PCAN[c.id] = cv; T_PL[c.id] = PIXI.Texture.from(cv); });
// swing tools (handle runs along +x from the pivot)
const T_AXE = tex(72, 44, g => {
  stroke(g, '#7a4a22', 6, 4, 22, 50, 22); stroke(g, '#a56b34', 2, 6, 20, 48, 20);
  poly(g, '#b0bec5', [42, 5, 66, 10, 68, 22, 66, 34, 42, 39, 49, 22]); poly(g, '#eceff1', [50, 11, 64, 14, 65, 19, 50, 19]);
  g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(42, 5); g.lineTo(66, 10); g.lineTo(68, 22); g.lineTo(66, 34); g.lineTo(42, 39); g.stroke();
});
const T_PICK = tex(72, 56, g => {
  stroke(g, '#7a4a22', 6, 4, 28, 50, 28); stroke(g, '#a56b34', 2, 6, 26, 48, 26);
  g.fillStyle = '#90a4ae'; g.beginPath(); g.moveTo(34, 6); g.quadraticCurveTo(76, 28, 34, 50); g.lineTo(44, 28); g.closePath(); g.fill();
  g.fillStyle = '#cfd8dc'; g.beginPath(); g.moveTo(37, 10); g.quadraticCurveTo(62, 28, 37, 30); g.lineTo(44, 24); g.closePath(); g.fill();
  g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(34, 6); g.quadraticCurveTo(76, 28, 34, 50); g.stroke();
});
const T_BLADE = tex(80, 40, g => {
  stroke(g, '#6d4423', 5, 4, 20, 16, 20); stroke(g, '#ffd54f', 4, 17, 11, 17, 29);
  poly(g, '#b0bec5', [20, 15, 70, 17, 78, 20, 70, 23, 20, 25]); poly(g, '#eceff1', [22, 17, 68, 18, 74, 20, 22, 20]);
  g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(20, 15); g.lineTo(70, 17); g.lineTo(78, 20); g.lineTo(70, 23); g.lineTo(20, 25); g.stroke();
});
const T_LOG = tex(44, 24, g => {
  g.fillStyle = '#6d4423'; g.beginPath(); g.roundRect ? g.roundRect(2, 4, 34, 16, 6) : g.rect(2, 4, 34, 16); g.fill();
  g.fillStyle = '#8d5a2b'; g.fillRect(6, 5, 28, 5); g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(6, 15, 28, 4);
  g.strokeStyle = '#4e2f15'; g.lineWidth = 1; [12, 20, 27].forEach(x => { g.beginPath(); g.moveTo(x, 6); g.lineTo(x + 2, 18); g.stroke(); });
  g.fillStyle = '#d9b676'; ell(g, 36, 12, 5, 8); g.strokeStyle = '#a0733d'; g.lineWidth = 1.5; g.beginPath(); g.ellipse(36, 12, 3, 5, 0, 0, TAU); g.stroke(); g.beginPath(); g.ellipse(36, 12, 1, 2, 0, 0, TAU); g.stroke();
});
const T_STONE = tex(30, 26, g => {
  poly(g, '#6b7078', [3, 20, 6, 9, 15, 3, 25, 8, 28, 19, 18, 24]); poly(g, '#9aa1aa', [6, 9, 15, 3, 25, 8, 17, 13, 8, 14]); poly(g, '#c6ccd4', [11, 8, 16, 5, 21, 8, 16, 10]);
  g.strokeStyle = 'rgba(0,0,0,.4)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(3, 20); g.lineTo(6, 9); g.lineTo(15, 3); g.lineTo(25, 8); g.lineTo(28, 19); g.lineTo(18, 24); g.closePath(); g.stroke();
});
const T_BERRY = tex(26, 28, g => {
  g.fillStyle = '#d32f2f'; ell(g, 13, 15, 9, 9); poly(g, '#d32f2f', [4.5, 17, 21.5, 17, 13, 27]);
  g.fillStyle = 'rgba(255,255,255,.28)'; ell(g, 9.5, 11, 2.5, 3.5);
  g.fillStyle = '#ffe082'; [[9, 15], [15, 13], [18, 17], [12, 19], [8, 20], [14, 23]].forEach(p => ell(g, p[0], p[1], .9, 1.3));
  poly(g, '#43a047', [13, 8, 5, 5, 9, 10]); poly(g, '#43a047', [13, 8, 21, 5, 17, 10]); poly(g, '#2e7d32', [13, 8, 10, 3, 16, 3]);
});
const T_GEM = tex(26, 26, g => {
  poly(g, '#26c6da', [13, 2, 23, 10, 13, 24, 3, 10]); poly(g, '#80deea', [13, 2, 23, 10, 13, 10, 3, 10]); poly(g, '#00acc1', [13, 10, 23, 10, 13, 24]);
  g.strokeStyle = 'rgba(255,255,255,.8)'; g.lineWidth = 1; g.beginPath(); g.moveTo(3, 10); g.lineTo(23, 10); g.moveTo(13, 2); g.lineTo(9, 10); g.lineTo(13, 24); g.lineTo(17, 10); g.lineTo(13, 2); g.stroke();
});
const T_CACTUS = tex(84, 130, g => {
  g.fillStyle = '#2f7d3a'; g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 2;
  const cap = (x, y, r) => { g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); g.stroke(); };
  g.beginPath(); g.moveTo(32, 120); g.lineTo(32, 38); g.arc(42, 38, 10, Math.PI, 0); g.lineTo(52, 120); g.closePath(); g.fill(); g.stroke();
  g.fillRect(14, 64, 20, 10); g.fillRect(14, 36, 10, 38); cap(19, 36, 5); cap(14, 70, 0.1);
  g.fillRect(50, 78, 20, 10); g.fillRect(60, 50, 10, 38); cap(65, 50, 5);
  g.fillStyle = '#43a35a'; g.fillRect(38, 40, 4, 78); g.fillRect(16, 38, 3, 34); g.fillRect(62, 52, 3, 34);
  g.fillStyle = '#f5f0c8'; [[36, 50], [48, 62], [37, 80], [47, 96], [38, 108], [19, 48], [65, 62]].forEach(p => { g.fillRect(p[0], p[1], 2, 2); });
});
const T_BOAT = tex(132, 74, g => {
  g.fillStyle = '#5a3818'; g.beginPath(); g.moveTo(8, 37); g.quadraticCurveTo(14, 8, 60, 8); g.quadraticCurveTo(112, 10, 126, 37); g.quadraticCurveTo(112, 64, 60, 66); g.quadraticCurveTo(14, 66, 8, 37); g.fill();
  g.fillStyle = '#a8773f'; g.beginPath(); g.moveTo(16, 37); g.quadraticCurveTo(22, 16, 60, 16); g.quadraticCurveTo(102, 18, 114, 37); g.quadraticCurveTo(102, 58, 60, 58); g.quadraticCurveTo(22, 58, 16, 37); g.fill();
  g.strokeStyle = '#7a5428'; g.lineWidth = 3; [38, 60, 82].forEach(x => { g.beginPath(); g.moveTo(x, 18); g.lineTo(x, 56); g.stroke(); });
  g.strokeStyle = 'rgba(0,0,0,.5)'; g.lineWidth = 2; g.beginPath(); g.moveTo(8, 37); g.quadraticCurveTo(14, 8, 60, 8); g.quadraticCurveTo(112, 10, 126, 37); g.quadraticCurveTo(112, 64, 60, 66); g.quadraticCurveTo(14, 66, 8, 37); g.stroke();
});
const T_TRAP = tex(64, 56, g => {
  g.fillStyle = 'rgba(0,0,0,.25)'; ell(g, 32, 38, 26, 10);
  g.fillStyle = '#6b6f76'; ell(g, 32, 32, 26, 16); g.fillStyle = '#4b4f55'; ell(g, 32, 32, 20, 11);
  g.fillStyle = '#b8bec6'; for (let i = 0; i < 9; i++) { const a = i / 9 * TAU, x = 32 + Math.cos(a) * 20, y = 32 + Math.sin(a) * 11; g.beginPath(); g.moveTo(x - 3, y); g.lineTo(x, y - 9); g.lineTo(x + 3, y); g.closePath(); g.fill(); }
  g.fillStyle = '#d9a441'; circ(g, 32, 32, 4);
});
const T_SLASH = tex(80, 80, g => { g.strokeStyle = '#fff'; g.lineCap = 'round'; g.lineWidth = 7; g.beginPath(); g.arc(8, 40, 52, -.75, .75); g.stroke(); g.lineWidth = 3; g.globalAlpha = .6; g.beginPath(); g.arc(8, 40, 44, -.6, .6); g.stroke(); });
const T_BENCH = tex(112, 84, g => {
  g.fillStyle = 'rgba(0,0,0,.0)';
  g.fillStyle = '#4a2f16'; g.fillRect(14, 48, 11, 30); g.fillRect(87, 48, 11, 30); g.fillStyle = '#6d4423'; g.fillRect(14, 48, 5, 30); g.fillRect(87, 48, 5, 30);
  poly(g, '#c18a4a', [14, 14, 98, 14, 110, 40, 2, 40]); g.strokeStyle = '#8a5a2b'; g.lineWidth = 1.5; for (let i = 1; i < 5; i++) { g.beginPath(); g.moveTo(14 + i * 17 - i * 2, 14); g.lineTo(2 + i * 21.6, 40); g.stroke(); }
  g.fillStyle = '#8a5a2b'; g.fillRect(2, 40, 108, 11); g.fillStyle = '#a56b34'; g.fillRect(2, 40, 108, 4);
  g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = 2; g.strokeRect(2, 40, 108, 11);
  // saw
  poly(g, '#cfd8dc', [24, 22, 56, 20, 57, 28, 24, 30]); g.fillStyle = '#8d6e63'; g.fillRect(18, 20, 9, 11); g.fillStyle = '#90a4ae'; for (let i = 0; i < 7; i++) poly(g, '#90a4ae', [28 + i * 4.2, 30, 30.5 + i * 4.2, 34, 33 + i * 4.2, 30]);
  // hammer
  stroke(g, '#7a4a22', 4, 66, 31, 88, 22); poly(g, '#78909c', [82, 15, 94, 20, 91, 29, 79, 24]);
  // little log stack
  g.fillStyle = '#6d4423'; ell(g, 70, 24, 8, 4); g.fillStyle = '#d9b676'; circ(g, 63, 24, 3);
});
const T_WALL = tex(84, 72, g => {
  for (let i = 0; i < 5; i++) {
    const x = 6 + i * 15, h = 40 + (i % 2) * 8;
    poly(g, '#7a4a22', [x, 64, x + 12, 64, x + 12, 64 - h + 14, x + 6, 64 - h, x, 64 - h + 14]);
    poly(g, '#a56b34', [x + 1, 62, x + 5, 62, x + 5, 64 - h + 12, x + 6, 64 - h + 3, x + 1, 64 - h + 14]);
    g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x, 64); g.lineTo(x, 64 - h + 14); g.lineTo(x + 6, 64 - h); g.lineTo(x + 12, 64 - h + 14); g.lineTo(x + 12, 64); g.stroke();
  }
  g.fillStyle = '#5a3a1c'; g.fillRect(2, 40, 80, 8); g.fillStyle = '#7a4a22'; g.fillRect(2, 40, 80, 3); g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = 1.5; g.strokeRect(2, 40, 80, 8);
});
const T_CHEST = tex(96, 80, g => {
  g.fillStyle = '#4a2f16'; g.beginPath(); g.roundRect ? g.roundRect(8, 30, 80, 42, 6) : g.rect(8, 30, 80, 42); g.fill();
  g.fillStyle = '#8a5a2b'; g.fillRect(10, 34, 76, 34); g.fillStyle = '#a56b34'; g.fillRect(10, 34, 76, 8);
  g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 1.5; for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(10, 34 + i * 8.5); g.lineTo(86, 34 + i * 8.5); g.stroke(); }
  g.fillStyle = '#6d4423'; g.beginPath(); g.moveTo(8, 32); g.quadraticCurveTo(48, 0, 88, 32); g.lineTo(88, 38); g.lineTo(8, 38); g.closePath(); g.fill();
  g.fillStyle = '#8a5a2b'; g.beginPath(); g.moveTo(11, 33); g.quadraticCurveTo(48, 6, 85, 33); g.lineTo(85, 36); g.lineTo(11, 36); g.closePath(); g.fill();
  g.fillStyle = '#90a4ae'; g.fillRect(8, 28, 10, 44); g.fillRect(78, 28, 10, 44); g.fillStyle = '#cfd8dc'; g.fillRect(9, 28, 3, 44); g.fillRect(79, 28, 3, 44);
  g.fillStyle = '#ffd54f'; g.fillRect(42, 34, 12, 14); g.fillStyle = '#6d4c00'; circ(g, 48, 41, 2.2);
  g.strokeStyle = 'rgba(0,0,0,.5)'; g.lineWidth = 2; g.strokeRect(8, 30, 80, 42);
});
const T_POT = tex(96, 84, g => {
  for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; g.fillStyle = '#7b8088'; ell(g, 48 + Math.cos(a) * 30, 62 + Math.sin(a) * 10, 9, 6); g.fillStyle = '#a9afb8'; ell(g, 48 + Math.cos(a) * 30 - 1, 61 + Math.sin(a) * 10, 6, 3.5); }
  g.fillStyle = 'rgba(255,120,30,.55)'; ell(g, 48, 60, 18, 7);
  g.fillStyle = '#252a30'; g.beginPath(); g.moveTo(18, 30); g.quadraticCurveTo(14, 66, 48, 68); g.quadraticCurveTo(82, 66, 78, 30); g.closePath(); g.fill();
  g.fillStyle = '#3a424b'; g.beginPath(); g.moveTo(22, 32); g.quadraticCurveTo(20, 56, 40, 62); g.lineTo(40, 34); g.closePath(); g.fill();
  g.fillStyle = '#1b1f24'; ell(g, 48, 30, 30, 9); g.fillStyle = '#c8742a'; ell(g, 48, 31, 26, 6.5); g.fillStyle = '#e8a050'; ell(g, 44, 30, 12, 3);
  g.strokeStyle = '#1b1f24'; g.lineWidth = 4; g.beginPath(); g.arc(48, 28, 34, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
  g.strokeStyle = 'rgba(0,0,0,.5)'; g.lineWidth = 2; g.beginPath(); g.moveTo(18, 30); g.quadraticCurveTo(14, 66, 48, 68); g.quadraticCurveTo(82, 66, 78, 30); g.stroke();
});
const T_SMELTER = tex(108, 108, g => {
  g.fillStyle = '#3d4249'; g.fillRect(14, 8, 22, 36);                              // chimney
  g.fillStyle = '#5b626b'; g.fillRect(16, 8, 18, 34); g.fillStyle = '#2c3036'; g.fillRect(12, 4, 26, 8);
  g.fillStyle = '#4a5058'; g.beginPath(); g.moveTo(12, 96); g.lineTo(20, 34); g.lineTo(88, 34); g.lineTo(96, 96); g.closePath(); g.fill();   // furnace body
  g.fillStyle = '#6a727c'; g.beginPath(); g.moveTo(16, 96); g.lineTo(23, 38); g.lineTo(54, 38); g.lineTo(54, 96); g.closePath(); g.fill();
  g.strokeStyle = 'rgba(0,0,0,.4)'; g.lineWidth = 1.5;                               // brick lines
  for (let r = 0; r < 6; r++) { const y = 44 + r * 9; g.beginPath(); g.moveTo(18 - r * .5, y); g.lineTo(90 + r * .5, y); g.stroke(); for (let c = 0; c < 6; c++) { const x = 22 + c * 12 + (r % 2) * 6; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 9); g.stroke(); } }
  g.fillStyle = '#1b1d21'; g.beginPath(); g.moveTo(36, 96); g.lineTo(36, 64); g.quadraticCurveTo(54, 46, 72, 64); g.lineTo(72, 96); g.closePath(); g.fill();   // fire door
  const gr = g.createRadialGradient(54, 84, 2, 54, 80, 22); gr.addColorStop(0, '#fff0a0'); gr.addColorStop(.5, '#ff8a1c'); gr.addColorStop(1, 'rgba(160,40,0,.2)');
  g.fillStyle = gr; g.beginPath(); g.moveTo(40, 96); g.lineTo(40, 68); g.quadraticCurveTo(54, 54, 68, 68); g.lineTo(68, 96); g.closePath(); g.fill();
  g.fillStyle = '#2c3036'; g.fillRect(10, 94, 88, 8); g.fillStyle = '#90a4ae'; g.fillRect(8, 36, 92, 5);                                                     // base + iron band
  g.strokeStyle = 'rgba(0,0,0,.5)'; g.lineWidth = 2; g.beginPath(); g.moveTo(12, 96); g.lineTo(20, 34); g.lineTo(88, 34); g.lineTo(96, 96); g.stroke();
});
const T_SCRAP = tex(36, 28, g => {
  poly(g, '#7d8791', [3, 20, 8, 8, 28, 6, 33, 18, 26, 25, 8, 25]); poly(g, '#b9c3cc', [8, 8, 28, 6, 24, 13, 11, 14]); poly(g, '#e9eef2', [12, 9, 24, 8, 21, 11, 13, 12]);
  g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(3, 20); g.lineTo(8, 8); g.lineTo(28, 6); g.lineTo(33, 18); g.lineTo(26, 25); g.lineTo(8, 25); g.closePath(); g.stroke();
  g.fillStyle = '#ffb74d'; circ(g, 14, 20, 1.6); circ(g, 22, 19, 1.3);
});
const T_MEAT = tex(34, 26, g => {   // a raw meat scrap with a little bone
  g.fillStyle = '#f3e9d8'; g.fillRect(20, 10, 11, 4); circ(g, 31, 9.5, 2.6); circ(g, 31, 14.5, 2.6);
  poly(g, '#b8323a', [3, 14, 7, 5, 17, 3, 23, 9, 22, 19, 13, 23, 5, 21]); poly(g, '#e2626a', [7, 7, 16, 5, 19, 10, 10, 12]);
  g.fillStyle = '#f6d7c8'; ell(g, 11, 15, 4, 2); g.strokeStyle = 'rgba(60,0,10,.55)'; g.lineWidth = 1.4;
  g.beginPath(); g.moveTo(3, 14); g.lineTo(7, 5); g.lineTo(17, 3); g.lineTo(23, 9); g.lineTo(22, 19); g.lineTo(13, 23); g.lineTo(5, 21); g.closePath(); g.stroke();
});
const T_RABBIT = tex(44, 30, g => {   // seen from above, facing right: round body, head, long ears laid back, white tail
  g.fillStyle = '#8a6a4f'; ell(g, 18, 15, 12, 9.5);
  g.fillStyle = '#9c7a5c'; ell(g, 31, 15, 7, 6);
  g.fillStyle = '#7a5b42'; ell(g, 24, 10, 8, 2.6); ell(g, 24, 20, 8, 2.6);
  g.fillStyle = '#e8b4a8'; ell(g, 24, 10, 6, 1.2); ell(g, 24, 20, 6, 1.2);
  g.fillStyle = '#b8977a'; ell(g, 15, 15, 7, 5);
  g.fillStyle = '#ffffff'; circ(g, 6.5, 15, 3.6);
  g.fillStyle = '#1a1a1a'; circ(g, 34, 12.6, 1.2); circ(g, 34, 17.4, 1.2); g.fillStyle = '#e48a9a'; circ(g, 37.6, 15, 1.1);
  g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 1.2; g.beginPath(); g.ellipse(18, 15, 12, 9.5, 0, 0, TAU); g.stroke();
});
function mkRabbit(b) {
  const c = new PIXI.Container(), sh = new PIXI.Sprite(T_SHADOW); sh.anchor.set(.5); sh.scale.set(.55, .32); sh.y = 5;
  const body = new PIXI.Sprite(T_RABBIT); body.anchor.set(.5); body.scale.set(.8); c.addChild(sh, body); ents.addChild(c); c.alpha = 0;
  return { c, body, sh, kind: 'r', ang: b[3] / 100, age: 0, hop: 0 };
}
const T_ALIEN = tex(84, 84, g => {
  g.translate(42, 42);
  g.strokeStyle = '#2a0c3c'; g.lineWidth = 4; g.lineCap = 'round';
  for (let i = 0; i < 8; i++) { const a = i * TAU / 8 + .2; g.beginPath(); g.moveTo(Math.cos(a) * 10, Math.sin(a) * 10); g.lineTo(Math.cos(a + .25) * 28, Math.sin(a + .25) * 28); g.lineTo(Math.cos(a) * 38, Math.sin(a) * 38); g.stroke(); }
  const gr = g.createRadialGradient(-4, -4, 2, 0, 0, 24); gr.addColorStop(0, '#b45fe0'); gr.addColorStop(.6, '#6b2191'); gr.addColorStop(1, '#2e0b46');
  g.fillStyle = gr; circ(g, 0, 0, 24); g.strokeStyle = 'rgba(0,0,0,.5)'; g.lineWidth = 2; g.stroke();
  g.fillStyle = 'rgba(0,0,0,.25)'; circ(g, -8, 6, 6); circ(g, -4, -10, 4);
  g.fillStyle = '#d4ff3a'; circ(g, 12, -7, 3.4); circ(g, 12, 7, 3.4);
});

// ---------- renderer ----------
const app = new PIXI.Application({ resizeTo: window, backgroundColor: 0x0d2a40, antialias: true, resolution: Math.min(window.devicePixelRatio || 1, 2), autoDensity: true });
document.body.insertBefore(app.view, document.body.firstChild);
app.view.style.cssText = 'position:fixed;inset:0;width:100%;height:100%';
const stage = app.stage;
let W = innerWidth, H = innerHeight, Z = 1;

const WATER_FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 vTextureCoord;
uniform float uTime; uniform vec2 uCam; uniform vec2 uRes; uniform float uZoom; uniform vec4 uIs[12];
float edgeI(float a,float r,float s){return r+16.*sin(3.*a+1.3+s)+9.*sin(7.*a+.4+s*2.)+5.*sin(13.*a+2.1+s*3.);}
void main(){
  vec2 px=(vTextureCoord-.5)*uRes;
  vec2 p=uCam+px/uZoom;
  float d=1e9;
  for(int i=0;i<12;i++){vec2 q=p-uIs[i].xy;d=min(d,length(q)-edgeI(atan(q.y,q.x),uIs[i].z,uIs[i].w));}
  float t=uTime;
  float w=(sin(p.x*.045+t*.9)+sin(p.y*.05-t*1.1)+sin((p.x*.7+p.y)*.03+t*.6)+sin(length(p)*.06-t*1.4))*.25;
  vec3 deep=vec3(.03,.13,.24),mid=vec3(.07,.33,.46),shallow=vec3(.22,.62,.62);
  float k=clamp(d/260.,0.,1.);
  vec3 c=mix(shallow,mid,smoothstep(0.,.35,k)); c=mix(c,deep,smoothstep(.25,1.,k));
  c+=vec3(.04,.07,.09)*w;
  float g=smoothstep(.5,.95,w+.12*sin(p.x*.2+t*2.)*sin(p.y*.2-t*1.7));
  c+=vec3(.5,.7,.8)*g*.1*(1.-k*.6);
  float f1=exp(-pow((d-(10.+7.*sin(t*1.2)))/7.,2.));
  float f2=exp(-pow((d-(34.+10.*sin(t*1.2+1.5)))/5.,2.))*.55*(.5+.5*sin(p.x*.08+p.y*.06+t));
  c=mix(c,vec3(.93,.98,1.),clamp(f1*.85+f2,0.,1.));
  gl_FragColor=vec4(c,1.);
}`;
const water = new PIXI.Sprite(PIXI.Texture.WHITE);
const waterF = new PIXI.Filter(undefined, WATER_FRAG, { uTime: 0, uCam: [0, 0], uRes: [W, H], uZoom: 1, uIs: new Float32Array(48) });
water.filters = [waterF]; stage.addChild(water);

const world = new PIXI.Container(), overL = new PIXI.Container();
const ground = new PIXI.Container(), ents = new PIXI.Container(), pfx = new PIXI.Container();
ents.sortableChildren = true; world.addChild(ground, pfx, ents); stage.addChild(world);

// lighting: dark layer rendered to a half-res texture with erased holes
const LS = .5; let rt = null; const lightCont = new PIXI.Container(), darkBase = new PIXI.Sprite(PIXI.Texture.WHITE), lightSpr = new PIXI.Sprite();
lightCont.addChild(darkBase); const lightPool = [];
function getLight(i) { if (!lightPool[i]) { const s = new PIXI.Sprite(T_LIGHT); s.anchor.set(.5); s.blendMode = BM.ERASE; lightCont.addChild(s); lightPool[i] = s; } return lightPool[i]; }
stage.addChild(lightSpr);
const fogC = new PIXI.Container(); stage.addChild(fogC);
const fogs = []; for (let i = 0; i < 6; i++) { const s = new PIXI.Sprite(T_GLOW); s.anchor.set(.5); s.tint = 0x9db4dc; s.alpha = 0; s.ph = rnd(0, TAU); s.sp = rnd(.05, .12); s.sc = rnd(.9, 1.5); fogC.addChild(s); fogs.push(s); }
stage.addChild(overL);
// fireflies: fx/fy are fractions of the visible half-width/height, so they always span the screen at any zoom;
// the pool covers the widest view and only as many are shown as keep the density of ~22 per 760x760 world units
const FLY_MAX = 140, FLY_DENS = 22 / (760 * 760);
const flies = []; for (let i = 0; i < FLY_MAX; i++) { const s = new PIXI.Sprite(T_GLOW); s.anchor.set(.5); s.tint = 0xd8ff6a; s.blendMode = BM.ADD; s.scale.set(.14); s.fx = rnd(-1.08, 1.08); s.fy = rnd(-1.08, 1.08); s.ph = rnd(0, TAU); overL.addChild(s); flies.push(s); }

const UZ_MIN = .4 / .75, UZ_MAX = 1.8;   // furthest zoom-out shows 25% less than it used to (was .4)
let UZ = 0.85; try { const s = parseFloat(localStorage.getItem('in_zoom')); if (s > 0) UZ = Math.max(UZ_MIN, Math.min(UZ_MAX, s)); } catch (e) {}
function setZoom(v) { UZ = Math.max(UZ_MIN, Math.min(UZ_MAX, v)); try { localStorage.setItem('in_zoom', UZ); } catch (e) {} resize(); }
function resize() {
  W = innerWidth; H = innerHeight; Z = Math.min(W, H) / 620 * UZ;
  water.width = W; water.height = H; waterF.uniforms.uRes = [W, H]; waterF.uniforms.uZoom = Z;
  if (rt) rt.destroy(true);
  rt = PIXI.RenderTexture.create({ width: Math.ceil(W * LS), height: Math.ceil(H * LS) });
  lightSpr.texture = rt; lightSpr.scale.set(1 / LS);
}
addEventListener('resize', resize); resize();
$('zoomIn').addEventListener('click', () => setZoom(UZ * 1.15)); $('zoomOut').addEventListener('click', () => setZoom(UZ / 1.15));

// ---------- world building (after server init) ----------
let resNodes = [], built = false, fireStones = null;
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const polyOf = fn => { const p = []; for (let i = 0; i < 200; i++) { const a = i / 200 * TAU, r = fn(a); p.push(Math.cos(a) * r, Math.sin(a) * r); } return p; };
const islandCs = [];   // outer island ground layers: big, so the ones off screen are skipped when drawing
function buildIsland(is, idx) {   // is = [x, y, radius, biome]: the quarter facing home is forest, the rest is the biome ('d' desert)
  const [ix, iy, R, biome] = is, s = idx * 1.7, ef = a => edgeJ(a, R, s), c = new PIXI.Container(); c.position.set(ix, iy); ground.addChild(c); islandCs.push({ c, x: ix, y: iy, r: R + 80 });
  const inF = (x, y) => RC.inForestPart(ix, iy, R, ix + x, iy + y);   // local coords
  const shore = new PIXI.Graphics(); shore.beginFill(0x9d8c58, .5); shore.drawPolygon(polyOf(a => ef(a) + 10)); shore.endFill(); c.addChild(shore);
  const sand = new PIXI.TilingSprite(T_SAND, R * 2 + 120, R * 2 + 120); sand.position.set(-R - 60, -R - 60); if (biome === 'd') sand.tint = 0xf2c076;
  const sm = new PIXI.Graphics(); sm.beginFill(0xffffff); sm.drawPolygon(polyOf(ef)); sm.endFill(); sand.mask = sm; c.addChild(sm, sand);
  const rng = mulberry(idx * 977 + 13);
  if (biome === 'd') {   // desert: a few darker dunes, kept off the forest
    const dn = new PIXI.Graphics(); dn.beginFill(0xc99a4e, .25);
    for (let i = 0; i < Math.round(R / 40); i++) { const a = rng() * TAU, d = Math.sqrt(rng()) * (R - 120), x = Math.cos(a) * d, y = Math.sin(a) * d; if (!inF(x, y)) dn.drawEllipse(x, y, 40 + rng() * 70, 14 + rng() * 22); }
    dn.endFill(); dn.mask = sm; c.addChild(dn);
  }
  { // forest quarter: grass along the coast facing home, closed off by the (wavy) forest edge across the island
    const grassR = a => ef(a) - 55 + 10 * Math.sin(5 * a + .7 + s) + 6 * Math.sin(11 * a);
    const [ux, uy] = RC.homeDir(ix, iy), vx = -uy, vy = ux, h = Math.atan2(uy, ux), pts = [];
    let wA = null, wB = null;
    for (let i = 0; i <= 400; i++) {   // sweep the coast from one side of the home direction to the other, keeping the forest stretch
      const a = h - Math.PI + i / 400 * TAU, r = grassR(a), x = Math.cos(a) * r, y = Math.sin(a) * r;
      if (!inF(x, y)) continue; const w = (x * vx + y * vy) / R; if (wA === null) wA = w; wB = w; pts.push(x, y);
    }
    if (pts.length > 4) {
      for (let i = 0; i <= 60; i++) { const w = wB + (wA - wB) * i / 60, t = RC.forestEdge(ix, iy, w); pts.push((ux * t + vx * w) * R, (uy * t + vy * w) * R); }
      const gr = new PIXI.TilingSprite(T_GRASS, R * 2, R * 2); gr.position.set(-R, -R);
      const gm = new PIXI.Graphics(); gm.beginFill(0xffffff); gm.drawPolygon(pts); gm.endFill(); gr.mask = gm;
      const rim = new PIXI.Graphics(); rim.lineStyle(10, 0x25552a, .35); rim.drawPolygon(pts); rim.mask = sm; c.addChild(gm, gr, rim);
    }
  }
  const N = Math.round(Math.PI * R * R * 8e-5 / 1.5);
  for (let i = 0; i < N; i++) {
    const a = rng() * TAU, d = Math.sqrt(rng()) * (R - 90), k = rng(), x = Math.cos(a) * d, y = Math.sin(a) * d, f = inF(x, y);
    const tx = f ? (k < .6 ? T_TUFT : k < .85 ? T_FLOWER : T_PEBBLE) : (k < .55 ? T_PEBBLE : T_TUFT);
    const sp = new PIXI.Sprite(tx); sp.anchor.set(.5, .9); sp.position.set(x, y); sp.scale.set(.8 + rng() * .6); sp.rotation = (rng() - .5) * .4;
    if (!f && biome === 'd' && tx === T_TUFT) sp.tint = 0xb59a58; else if (tx === T_FLOWER) sp.tint = [0xffffff, 0xff8aa0, 0xffe066, 0xa0c4ff][i % 4];
    c.addChild(sp);
  }
}
function buildWorld(list) {
  { const u = new Float32Array(48).fill(0); for (let i = 0; i < 12; i++) { u[i * 4] = 1e7; u[i * 4 + 2] = -1e5; } u.set([0, 0, RR, 0], 0); ISL.slice(0, 11).forEach((s, i) => u.set([s[0], s[1], s[2], (i + 1) * 1.7], (i + 1) * 4)); waterF.uniforms.uIs = u; }
  const poly = fn => { const p = []; for (let i = 0; i < 200; i++) { const a = i / 200 * TAU, r = fn(a); p.push(Math.cos(a) * r, Math.sin(a) * r); } return p; };
  const shore = new PIXI.Graphics(); shore.beginFill(0x9d8c58, .5); shore.drawPolygon(poly(a => edge(a) + 10)); shore.endFill(); ground.addChild(shore);
  const sand = new PIXI.TilingSprite(T_SAND, RR * 2 + 120, RR * 2 + 120); sand.position.set(-RR - 60, -RR - 60);
  const sm = new PIXI.Graphics(); sm.beginFill(0xffffff); sm.drawPolygon(poly(a => edge(a))); sm.endFill(); sand.mask = sm; ground.addChild(sm, sand);
  const grassR = a => edge(a) - 55 + 10 * Math.sin(5 * a + .7) + 6 * Math.sin(11 * a);
  const gr = new PIXI.TilingSprite(T_GRASS, RR * 2, RR * 2); gr.position.set(-RR, -RR);
  const gm = new PIXI.Graphics(); gm.beginFill(0xffffff); gm.drawPolygon(poly(grassR)); gm.endFill(); gr.mask = gm;
  const rim = new PIXI.Graphics(); rim.lineStyle(10, 0x25552a, .35); rim.drawPolygon(poly(a => grassR(a) - 4)); rim.lineStyle(0);
  ground.addChild(gm, gr, rim);
  const dirt = new PIXI.Graphics(); dirt.beginFill(0x5e4526, .5); dirt.drawCircle(0, 0, 78); dirt.beginFill(0x3d2c17, .55); dirt.drawCircle(0, 0, 46); dirt.endFill(); ground.addChild(dirt);
  const rng = mulberry(7), N = Math.round(320 * (RR / 900) * (RR / 900) / 1.5);
  const pcs = [T_TUFT, T_FLOWER, T_PEBBLE].map(() => { const pc = new PIXI.ParticleContainer(4000, { position: true, rotation: true, scale: true, tint: true }); ground.addChild(pc); return pc; });
  for (let i = 0; i < N; i++) {
    const a = rng() * TAU, d = Math.sqrt(rng()) * (RR - 110); if (d < 90) continue;
    const k = rng(), ti = k < .6 ? 0 : k < .85 ? 1 : 2; const sp = new PIXI.Sprite([T_TUFT, T_FLOWER, T_PEBBLE][ti]);
    sp.anchor.set(.5, .9); sp.position.set(Math.cos(a) * d, Math.sin(a) * d); sp.scale.set(.8 + rng() * .6); sp.rotation = (rng() - .5) * .4;
    if (ti === 1) sp.tint = [0xffffff, 0xff8aa0, 0xffe066, 0xa0c4ff][i % 4];
    pcs[ti].addChild(sp);
  }
  // fire pit stones
  for (let i = 0; i < 10; i++) { const a = i / 10 * TAU, s = new PIXI.Sprite(T_ROCK); s.anchor.set(.5, .8); s.scale.set(.26); s.position.set(Math.cos(a) * 30, Math.sin(a) * 30 + 4); s.zIndex = s.y; s.tint = 0xbbbbbb; ents.addChild(s); }
  ISL.forEach((is, i) => buildIsland(is, i + 1));
  // resources
  list.forEach((r, i) => {
    const c = new PIXI.Container(), sh = new PIXI.Sprite(T_SHADOW); sh.anchor.set(.5); c.addChild(sh);
    let s;
    if (r[0] === 't') { s = new PIXI.Sprite(T_TREE); s.anchor.set(.5, .88); s.scale.set(.62 + (i % 5) * .03); sh.scale.set(1.7, .8); sh.y = 4; }
    else if (r[0] === 'c') { s = new PIXI.Sprite(T_CACTUS); s.anchor.set(.5, .9); s.scale.set(.62 + (i % 5) * .03); sh.scale.set(1.1, .6); sh.y = 4; }
    else if (r[0] === 'r') { s = new PIXI.Sprite(T_ROCK); s.anchor.set(.5, .8); s.scale.set(.6); sh.scale.set(1.1, .6); sh.y = 4; }
    else { s = new PIXI.Sprite(T_BUSH); s.anchor.set(.5, .8); s.scale.set(.62); sh.scale.set(1, .5); sh.y = 4; }
    c.addChild(s); c.position.set(r[1], r[2]); c.zIndex = r[2]; ents.addChild(c);
    const mhp = r[0] === 't' || r[0] === 'c' ? 4 : r[0] === 'r' ? 3 : 1, bar = null;
    resNodes.push({ c, s, k: r[0], x: r[1], y: r[2], pop: 1, hp: mhp, mhp, bar, barT: 0, shake: 0, ph: rnd(0, TAU), base: s.scale.x });
  });
  built = true;
}

// campfire visuals (above darkness)
const flames = [0, 1, 2].map(i => { const s = new PIXI.Sprite(T_FLAME); s.anchor.set(.5, .9); s.blendMode = BM.ADD; overL.addChild(s); return s; });
const fireTip = new PIXI.Text('', { fontFamily: 'system-ui,sans-serif', fontSize: 16, fontWeight: '800', fill: 0xffffff, stroke: 0x000000, strokeThickness: 4, align: 'center' }); fireTip.anchor.set(.5, 1); fireTip.resolution = 2; fireTip.position.set(0, -78); fireTip.visible = false; overL.addChild(fireTip);
const fireGlow = new PIXI.Sprite(T_GLOW); fireGlow.anchor.set(.5); fireGlow.blendMode = BM.ADD; fireGlow.tint = 0xff8a30; overL.addChildAt(fireGlow, 0);
const ring = new PIXI.Sprite(T_RING); ring.anchor.set(.5); ring.blendMode = BM.ADD; ring.tint = 0xffc266; overL.addChildAt(ring, 0);

// ---------- particles ----------
const parts = [];
function emit(layer, t, x, y, vx, vy, life, s0, s1, col, a0, add, g) {
  const s = new PIXI.Sprite(t); s.anchor.set(.5); s.position.set(x, y); s.tint = col; s.blendMode = add ? BM.ADD : BM.NORMAL; s.scale.set(s0); layer.addChild(s);
  parts.push({ s, vx, vy, life, max: life, s0, s1, a0, g: g || 0 });
}
function burst(x, y, n, col, speed, add, size) { for (let i = 0; i < n; i++) { const a = rnd(0, TAU), v = rnd(.3, 1) * speed; emit(add ? overL : pfx, T_GLOW, x, y, Math.cos(a) * v, Math.sin(a) * v, rnd(.3, .6), size || .12, 0, col, 1, add, 0); } }
function stepParts(dt) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i]; p.life -= dt;
    if (p.life <= 0) { p.s.destroy(); parts.splice(i, 1); continue; }
    const k = 1 - p.life / p.max; p.s.x += p.vx * dt; p.s.y += p.vy * dt; p.vy += p.g * dt; p.s.scale.set(p.s0 + (p.s1 - p.s0) * k); p.s.alpha = p.a0 * (1 - k);
  }
}
function floatText(x, y, txt, col) {
  const t = new PIXI.Text(txt, { fontFamily: 'system-ui,sans-serif', fontSize: 16, fontWeight: '800', fill: col, stroke: 0x000000, strokeThickness: 4 });
  t.anchor.set(.5); t.position.set(x, y - 30); t.resolution = 2; overL.addChild(t); ftexts.push({ t, life: 1.1 });
}
const ftexts = [];

// ---------- entities ----------
let warnUntil = 0, lastMe = null, noticeUntil = 0, noticeText = '';
function notice(t) { noticeText = t; noticeUntil = performance.now() + 3000; }   // one-shot headline text, shown for 3 seconds
let S = null, myId = 0, roomCode = '', tipUntil = 0, ws = null, T = 0, shake = 0, lastInv = null, lastHp = null;
const ents2 = {}; // key -> {x,y,tx,ty,node...}
function mkPlayer(p) {
  const c = new PIXI.Container(), sh = new PIXI.Sprite(T_SHADOW); sh.anchor.set(.5); sh.scale.set(.8, .5); sh.y = 8; sh.alpha = .9;
  const body = new PIXI.Sprite(T_PL[p[2]]); body.anchor.set(.5); body.scale.set(.85);
  const name = new PIXI.Text(p[1], { fontFamily: 'system-ui,sans-serif', fontSize: 13, fontWeight: '700', fill: 0xffffff, stroke: 0x000000, strokeThickness: 3 }); name.anchor.set(.5, 1); name.y = -30; name.resolution = 2;
  const hp = new PIXI.Graphics(); hp.y = 28; const sta = new PIXI.Graphics(); sta.y = -27; sta.visible = false;
  const tool = new PIXI.Sprite(T_AXE); tool.anchor.set(.08, .5); tool.scale.set(.62); tool.visible = false;
  c.addChild(sh, body, tool, name, hp, sta); ents.addChild(c);
  return { c, body, tool, name, hp, sta, stv: 100, ang: 0, lh: -1, ld: -1, dust: 0, kind: 'p', sw: p[12], swing: null };
}
// per-kind look: 0 = normal alien, 1 = brute (every 5th night), 2 = the Charger (3x a normal alien)
const AK = {
  0: { sc: .5, eo: 10, es: 6, hpW: 26, hpY: -26, shX: 1, shY: .55, eye: .24, tint: 0xffffff, eyeCol: 0xc6ff2a },
  1: { sc: .95, eo: 20, es: 12, hpW: 50, hpY: -42, shX: 1.8, shY: .9, eye: .42, tint: 0xff9ad0, eyeCol: 0xc6ff2a },
  2: { sc: 1.5, eo: 31, es: 18, hpW: 96, hpY: -78, shX: 3.4, shY: 1.4, eye: .72, tint: 0xff7043, eyeCol: 0xff2a2a },
  3: { sc: .85, eo: 0, es: 0, hpW: 34, hpY: -32, shX: .8, shY: .5, eye: 0, tint: 0xffffff, eyeCol: 0, human: true },   // raiding villager (melee)
  4: { sc: .85, eo: 0, es: 0, hpW: 34, hpY: -32, shX: .8, shY: .5, eye: 0, tint: 0xffffff, eyeCol: 0, human: true },   // raiding villager (archer)
};
const T_VIL = { 3: PIXI.Texture.from(mkPlayerCanvas(['#b0432f', '#7a2a1c', '#3e2723', 'sword'])), 4: PIXI.Texture.from(mkPlayerCanvas(['#5d8f3a', '#33691e', '#3e2723', 'bow'])) };
const T_ARROW = tex(40, 8, g => { g.fillStyle = '#c9a66b'; g.fillRect(2, 3, 28, 2); g.fillStyle = '#e0e0e0'; poly(g, '#e0e0e0', [38, 4, 29, 0, 29, 8]); g.fillStyle = '#d32f2f'; g.fillRect(0, 1, 6, 2); g.fillRect(0, 5, 6, 2); });
function mkAlien(a) {
  const ak = AK[a[5]] || AK[0], c = new PIXI.Container(), sh = new PIXI.Sprite(T_SHADOW); sh.anchor.set(.5); sh.scale.set(ak.shX, ak.shY); sh.y = a[5] === 2 ? 14 : 6;
  const body = new PIXI.Sprite(ak.human ? T_VIL[a[5]] : T_ALIEN); body.anchor.set(.5); body.scale.set(ak.sc); body.tint = ak.tint;
  const hp = new PIXI.Graphics(); c.addChild(sh, body, hp); ents.addChild(c); c.alpha = 0;
  const eyes = (ak.human ? [] : [0, 1]).map(() => { const s = new PIXI.Sprite(T_GLOW); s.anchor.set(.5); s.tint = ak.eyeCol; s.blendMode = BM.ADD; s.scale.set(ak.eye); overL.addChild(s); return s; });
  return { c, body, hp, eyes, sc: ak.sc, ak, big: a[5] > 0, charger: a[5] === 2, ang: 0, age: 0, lh: -1, kind: 'a', flash: 0, trail: 0 };
}
function drawHp(g, w, f, col) { g.clear(); g.beginFill(0x000000, .55); g.drawRoundedRect(-w / 2, 0, w, 5, 2); g.endFill(); g.beginFill(col); g.drawRoundedRect(-w / 2, 0, Math.max(0, w * f), 5, 2); g.endFill(); }
function angLerp(a, b, k) { let d = ((b - a + Math.PI) % TAU + TAU) % TAU - Math.PI; return a + d * k; }

// ---- swing / hit / fall / crumble / pickup effects ----
const ease = u => u < .5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
function startSwing(e, p, d, dx) {
  const kind = p[13], ang = p[14] / 100;
  e.swing = { t: 0, kind, ang, hit: false }; e.ang = ang;
  if (kind === 1) e.tool.texture = T_AXE; else if (kind === 2) e.tool.texture = T_PICK; else if (kind === 4) e.tool.texture = T_BLADE;
  e.tool.visible = kind !== 3; SFX.whoosh(d, dx);
}
function swingOff(t) {   // relative tool angle: wind-up back, fast strike, recover
  if (t < .14) return .3 - 1.8 * ease(t / .14);
  if (t < .26) { const u = (t - .14) / .12; return -1.5 + 2.4 * u * u; }
  return .9 - .6 * ease(Math.min(1, (t - .26) / .16));
}
function drawPips(r) {
  const g = r.bar || (r.bar = r.c.addChild(new PIXI.Graphics())); g.clear(); if (r.hp <= 0 || r.hp >= r.mhp && r.barT <= 0) { return; }
  const w = 9, gap = 3, tot = r.mhp * w + (r.mhp - 1) * gap, y = -(r.s.height * r.s.anchor.y) - 14;
  g.beginFill(0x000000, .55); g.drawRoundedRect(-tot / 2 - 3, y - 3, tot + 6, 11, 4); g.endFill();
  for (let i = 0; i < r.mhp; i++) { g.beginFill(i < r.hp ? (r.k === 't' || r.k === 'c' ? 0x7bd37b : 0xcfd8dc) : 0x444444); g.drawRoundedRect(-tot / 2 + i * (w + gap), y, w, 5, 2); g.endFill(); }
}
function hitFx(r, d, dx) {
  r.shake = .32; r.barT = 1.6;
  if (r.k === 't' || r.k === 'c') { SFX.chop(d, dx); burst(r.x, r.y - 30, 6, 0x6fcf6a, 90, false, .11); burst(r.x, r.y - 6, 5, 0xb98349, 80, false, .09); for (let i = 0; i < 4; i++) emit(pfx, T_GLOW, r.x + rnd(-14, 14), r.y - rnd(40, 70), rnd(-30, 30), rnd(20, 60), rnd(.8, 1.3), .09, .05, 0x4caf50, .9, false, 40); }
  else { SFX.mine(d, dx); burst(r.x, r.y - 8, 8, 0xc5cbd3, 130, false, .1); burst(r.x, r.y - 10, 4, 0xfff59d, 90, true, .08); }
}
const fallers = [];
function breakFx(r, fromX, d, dx) {
  r.c.visible = false; if (r.bar) r.bar.clear();
  if (r.k === 't' || r.k === 'c') {
    const spr = new PIXI.Sprite(r.k === 'c' ? T_CACTUS : T_TREE); spr.anchor.set(.5, r.k === 'c' ? .9 : .88); spr.position.set(r.x, r.y); spr.scale.set(r.s.scale.x); spr.zIndex = r.y; ents.addChild(spr);
    const sh = new PIXI.Sprite(T_SHADOW); sh.anchor.set(.5); sh.scale.set(1.7, .8); sh.position.set(r.x, r.y + 4); sh.zIndex = r.y - 1; ents.addChild(sh);
    fallers.push({ k: 't', spr, sh, t: 0, dir: r.x >= fromX ? 1 : -1, r, landed: false, d, dx });
  } else {
    const spr = new PIXI.Sprite(T_ROCK); spr.anchor.set(.5, .8); spr.position.set(r.x, r.y); spr.scale.set(r.base); spr.zIndex = r.y; ents.addChild(spr);
    SFX.rockbreak(d, dx); shake = Math.max(shake, .08);
    burst(r.x, r.y - 8, 14, 0xaab0b8, 170, false, .16); burst(r.x, r.y - 10, 8, 0x8d939b, 120, false, .2);
    for (let i = 0; i < 7; i++) emit(pfx, T_STONE, r.x, r.y - 10, rnd(-110, 110), rnd(-150, -40), rnd(.5, .8), .5, .3, 0xffffff, 1, false, 420);
    fallers.push({ k: 'r', spr, t: 0 });
  }
}
function stepFallers(dt) {
  for (let i = fallers.length - 1; i >= 0; i--) {
    const f = fallers[i]; f.t += dt;
    if (f.k === 't') {
      const D = .85;
      if (f.t < D) {
        const u = f.t / D, a = f.dir * 1.5 * Math.pow(u, 2.3); f.spr.rotation = a; f.spr.skew.x = 0;
        if (Math.random() < dt * 14) emit(pfx, T_GLOW, f.r.x + f.dir * Math.sin(a) * 70 * f.spr.scale.x * 1.6, f.r.y - Math.cos(a) * 70 * f.spr.scale.x * 1.6, rnd(-20, 20), rnd(10, 50), rnd(.6, 1), .1, .05, 0x4caf50, .9, false, 90);
      } else {
        if (!f.landed) {
          f.landed = true; f.spr.rotation = f.dir * 1.5; SFX.treefall(f.d, f.dx); shake = Math.max(shake, .22);
          const tx = f.r.x + f.dir * 95 * f.spr.scale.x * 1.4;
          for (let j = 0; j < 12; j++) emit(pfx, T_GLOW, tx + rnd(-30, 30), f.r.y + rnd(-6, 10), rnd(-60, 60), rnd(-40, 10), rnd(.5, .9), .2, .5, 0xd9c79a, .5, false, 0);
          burst(tx, f.r.y - 10, 10, 0x5fbf5a, 120, false, .13);
        }
        const u = (f.t - D) / .7; f.spr.alpha = Math.max(0, 1 - Math.max(0, u - .35) / .65); f.sh.alpha = f.spr.alpha;
        if (u >= 1) { f.spr.destroy(); f.sh.destroy(); fallers.splice(i, 1); }
      }
    } else {
      const u = f.t / .38; f.spr.scale.set(f.spr.scale.x * (1 - dt * 7)); f.spr.alpha = Math.max(0, 1 - u); f.spr.x += rnd(-1.5, 1.5);
      if (u >= 1) { f.spr.destroy(); fallers.splice(i, 1); }
    }
  }
}

// ground pickups (logs from trees, stones from rocks): hop out, bob, fly to the player that grabs them
const dropE = {}, flyers = [], DROP_S = { w: .8, s: .85, m: .9, f: .75, d: .9, q: 1, n: .8 };
function syncDrops(m, _d, _dx) {
  const seen = {};
  for (const d of m.dr || []) {
    seen[d[0]] = 1; let e = dropE[d[0]];
    if (!e) {
      const c = new PIXI.Container(), sh = new PIXI.Sprite(T_SHADOW); sh.anchor.set(.5); sh.scale.set(.6, .35); sh.y = 4;
      const spr = d[1] === 'q' ? Object.assign(new PIXI.Text((RC.ITEM_BY[d[4]] || {}).e || '🍲', { fontSize: 30 }), { resolution: 2 }) : new PIXI.Sprite(d[1] === 'w' ? T_LOG : d[1] === 'm' ? T_SCRAP : d[1] === 'f' ? T_BERRY : d[1] === 'd' ? T_GEM : d[1] === 'n' ? T_MEAT : T_STONE); spr.anchor.set(.5); spr.scale.set(DROP_S[d[1]]); spr.rotation = d[1] === 'w' ? rnd(-.8, .8) : rnd(-.4, .4);
      c.addChild(sh, spr); c.position.set(d[2], d[3]); c.zIndex = d[3]; ents.addChild(c);
      e = dropE[d[0]] = { c, spr, sh, x: d[2], y: d[3], t: 0, ph: rnd(0, TAU), k: d[1], dur: d[1] === 'm' || d[1] === 'q' ? .5 : .35 };
      if (d[1] === 'm' || (d[1] === 'q' && d[4] !== 'foot')) {   // metal scrap jumps out of the nearest smelter; cooked food pops out of the nearest pot
        let bs = null, bd = 160; for (const id in structE) { const st = structE[id]; if (st.k !== (d[1] === 'q' ? 'pot' : 'smelter')) continue; const dd = Math.hypot(st.x - d[2], st.y - d[3]); if (dd < bd) { bd = dd; bs = st; } }
        if (bs) e.from = { x: bs.x, y: bs.y - 18 }; const me = ents2['p' + myId], dm = me ? Math.hypot(me.x - d[2], me.y - d[3]) : 0; if (d[1] === 'm') SFX.smeltDone(dm, me ? d[2] - me.x : 0);
      }
      overGlow(e);
    }
  }
  for (const id in dropE) if (!seen[id]) {
    const e = dropE[id]; delete dropE[id];
    let best = null, bd = 90; for (const p of m.p) { const dd = Math.hypot(p[3] - e.x, p[4] - e.y); if (dd < bd) { bd = dd; best = p; } }
    if (best) { flyers.push({ c: e.c, t: 0, fx: e.x, fy: e.y, pid: best[0] }); if (best[0] === myId) SFX.pickup(); }
    else { e.c.destroy({ children: true }); }
  }
}
function overGlow(e) { /* small sparkle when a pickup appears */ emit(overL, T_GLOW, e.x, e.y - 6, 0, -20, .5, .16, .02, e.k === 'w' ? 0xffd9a0 : e.k === 'f' ? 0xffb3b3 : e.k === 'd' ? 0x7fe9ff : e.k === 'q' ? 0xffe9a8 : 0xdfe8f5, .8, true, 0); }
function stepDrops(dt) {
  for (const id in dropE) {
    const e = dropE[id]; e.t += dt; const u = Math.min(1, e.t / e.dur), hop = Math.sin(u * Math.PI) * (e.from ? 46 : 26) * (1 - u * .3);
    if (e.from && u < 1) { e.c.x = e.from.x + (e.x - e.from.x) * u; e.c.y = e.from.y + (e.y - e.from.y) * u; } else if (e.from) { e.c.x = e.x; e.c.y = e.y; }
    e.spr.y = -hop + Math.sin(T * 3 + e.ph) * 1.2 * (u >= 1 ? 1 : 0); e.spr.rotation += e.from && u < 1 ? dt * 14 : 0; e.spr.scale.set(DROP_S[e.k] * (.3 + .7 * Math.min(1, u * 1.6))); e.sh.alpha = .4 + .5 * u;
  }
  for (let i = flyers.length - 1; i >= 0; i--) {
    const f = flyers[i]; f.t += dt; const u = Math.min(1, f.t / .2), pe = ents2['p' + f.pid];
    if (pe) { f.c.x = f.fx + (pe.x - f.fx) * u * u; f.c.y = f.fy + (pe.y - f.fy) * u * u - Math.sin(u * Math.PI) * 14; }
    f.c.scale.set(1 - .6 * u); f.c.alpha = 1 - u * .6;
    if (u >= 1) { f.c.destroy({ children: true }); flyers.splice(i, 1); }
  }
}

// ---- villager arrows and archers' aim lines ----
const arrowE = {}, aimG = new PIXI.Graphics(); pfx.addChild(aimG);
function syncArrows(m) {
  const seen = {}, now = performance.now();
  for (const w of m.ar || []) {
    seen[w[0]] = 1; let e = arrowE[w[0]];
    if (!e) { const s = new PIXI.Sprite(T_ARROW); s.anchor.set(.9, .5); s.scale.set(.9); ents.addChild(s); e = arrowE[w[0]] = { s }; }
    e.x = w[1]; e.y = w[2]; e.a = w[3] / 100; e.t0 = now; e.s.rotation = e.a;
  }
  for (const id in arrowE) if (!seen[id]) { arrowE[id].s.destroy(); delete arrowE[id]; }
}
function stepArrows() {
  const now = performance.now();
  for (const id in arrowE) { const e = arrowE[id], el = Math.min(.12, (now - e.t0) / 1000); e.s.position.set(e.x + Math.cos(e.a) * 520 * el, e.y + Math.sin(e.a) * 520 * el); e.s.zIndex = e.s.y; }   // keep flying between snapshots
  aimG.clear();
  for (const k in ents2) { const e = ents2[k]; if (e.kind !== 'a' || !e.d || !(e.d[8] > 0)) continue; const f = e.d[8] / 100, a = e.d[6] != null ? e.d[6] / 100 : e.ang; aimG.lineStyle(1.5 + f * 2.5, 0xff5252, .25 + f * .55); aimG.moveTo(e.x, e.y); aimG.lineTo(e.x + Math.cos(a) * 300, e.y + Math.sin(a) * 300); }
}
// ---- boats (placed in the water; two riders; the first one steers) ----
const boatE = {};
function syncBoats(m) {
  const seen = {};
  for (const b of m.bt || []) {
    seen[b[0]] = 1; let e = boatE[b[0]];
    if (!e) {
      const c = new PIXI.Container(), sh = new PIXI.Sprite(T_SHADOW); sh.anchor.set(.5); sh.scale.set(2.2, 1); sh.alpha = .5;
      const sp = new PIXI.Sprite(T_BOAT); sp.anchor.set(.5); sp.scale.set(.8); c.addChild(sh, sp); ents.addChild(c);
      e = boatE[b[0]] = { c, sp, x: b[1], y: b[2], tx: b[1], ty: b[2], ang: b[3] / 100, ta: b[3] / 100, ph: rnd(0, TAU) }; c.position.set(e.x, e.y);
    }
    e.tx = b[1]; e.ty = b[2]; e.ta = b[3] / 100; e.riders = b[4]; e.drv = b[5];
  }
  for (const id in boatE) if (!seen[id]) { boatE[id].c.destroy({ children: true }); delete boatE[id]; }
}
function stepBoats(dt) {
  for (const id in boatE) {
    const e = boatE[id], k = Math.min(1, dt * 12); e.x += (e.tx - e.x) * k; e.y += (e.ty - e.y) * k; e.ang = angLerp(e.ang, e.ta, Math.min(1, dt * 8));
    e.c.position.set(e.x, e.y + Math.sin(T * 1.6 + e.ph) * 1.5); e.c.zIndex = e.y - 40; e.sp.rotation = e.ang;
  }
}
// ---- placed structures (crafting bench, spike walls) ----
const structE = {}; let GEAR = {}, craftOpen = false, craftSig = '', chestId = null, chestSig = '', potOpen = false, potSig = '';
const SDEF = { bench: { tex: T_BENCH, ay: .8, base: .72, sh: 2, hy: 14 }, wall: { tex: T_WALL, ay: .85, base: .62, sh: 1.6, hy: 12 }, chest: { tex: T_CHEST, ay: .8, base: .62, sh: 1.7, hy: 12 }, pot: { tex: T_POT, ay: .8, base: .62, sh: 1.5, hy: 12 }, smelter: { tex: T_SMELTER, ay: .84, base: .62, sh: 1.9, hy: 12 } , trap: { tex: T_TRAP, ay: .5, base: .8, sh: 1, hy: 10 }};
function syncStructs(m, first) {
  const seen = {}, me = ents2['p' + myId];
  for (const t of m.st || []) {
    seen[t[0]] = 1; let e = structE[t[0]];
    if (!e) {
      const D = SDEF[t[1]] || SDEF.wall, c = new PIXI.Container(), sh = new PIXI.Sprite(T_SHADOW); sh.anchor.set(.5);
      sh.scale.set(D.sh, .7); sh.y = 4;
      const spr = new PIXI.Sprite(D.tex); spr.anchor.set(.5, .5); const base = D.base; spr.scale.set(base);
      const rotc = new PIXI.Container(); rotc.y = -(D.ay - .5) * D.tex.height * base; rotc.rotation = (t[7] || 0) * Math.PI / 4; rotc.addChild(spr);   // turns about its own centre
      const hp = new PIXI.Graphics(); hp.y = D.hy; c.addChild(sh, rotc, hp); c.position.set(t[2], t[3]); c.zIndex = t[3]; ents.addChild(c);
      e = structE[t[0]] = { c, spr, rotc, rot: t[7] || 0, hp, k: t[1], x: t[2], y: t[3], base, mhp: t[5], hpv: t[4], t: first ? 1 : 0, flash: 0, barT: 0 };
      if (!first) { const d = me ? Math.hypot(me.x - t[2], me.y - t[3]) : 0; SFX.build(d, me ? t[2] - me.x : 0); burst(t[2], t[3], 10, 0xd9c79a, 80, false, .16); }
    } else if (t[4] < e.hpv) { e.flash = .12; e.barT = 2; const d = me ? Math.hypot(me.x - t[2], me.y - t[3]) : 0; SFX.hit(d, me ? t[2] - me.x : 0); burst(t[2], t[3] - 14, 4, 0xb98349, 80, false, .1); }
    if ((t[7] || 0) !== e.rot) { e.rot = t[7] || 0; e.rotc.rotation = e.rot * Math.PI / 4; }
    if (t[1] === 'smelter') { const pq = e.smelt ? e.smelt[0] : t[6][0]; if (t[6][0] > pq) { const d = me ? Math.hypot(me.x - t[2], me.y - t[3]) : 0; SFX.smelterStart(d, me ? t[2] - me.x : 0); } e.smelt = t[6]; }
    else e.items = t[6];
    e.hpv = t[4]; e.x = t[2]; e.y = t[3];
  }
  for (const id in structE) if (!seen[id]) {
    const e = structE[id]; delete structE[id]; if (e.glow) e.glow.destroy(); const me2 = ents2['p' + myId], d = me2 ? Math.hypot(me2.x - e.x, me2.y - e.y) : 0;
    SFX.rockbreak(d, me2 ? e.x - me2.x : 0); burst(e.x, e.y - 12, 14, 0xb98349, 150, false, .15); e.c.destroy({ children: true });
  }
}
function stepStructs(dt) {
  for (const id in structE) {
    const e = structE[id];
    if (e.t < 1) { e.t = Math.min(1, e.t + dt * 4); const u = e.t, b = 1 + 2.2 * Math.pow(u - 1, 3) + 1.2 * Math.pow(u - 1, 2); e.spr.scale.set(e.base * Math.max(.1, b)); }
    e.flash = Math.max(0, e.flash - dt); e.spr.tint = e.flash > 0 ? 0xffaaaa : 0xffffff;
    if (e.k === 'smelter') {
      const sm = e.smelt || [0, 0], working = sm[0] > 0;
      if (!e.prog) { e.prog = new PIXI.Graphics(); e.prog.y = -66; e.c.addChild(e.prog); e.qt = new PIXI.Text('', { fontFamily: 'system-ui,sans-serif', fontSize: 13, fontWeight: '800', fill: 0xffe082, stroke: 0x000000, strokeThickness: 3 }); e.qt.anchor.set(.5, 1); e.qt.y = -72; e.qt.resolution = 2; e.c.addChild(e.qt); e.pv = 0; e.glow = new PIXI.Sprite(T_GLOW); e.glow.anchor.set(.5); e.glow.blendMode = BM.ADD; e.glow.tint = 0xff8a1c; overL.addChild(e.glow); }
      if (!working) e.pv = 0; else if (sm[1] < e.pv - .05) e.pv = sm[1]; else e.pv += (sm[1] - e.pv) * Math.min(1, dt * 10);
      e.prog.clear(); if (working) { e.prog.beginFill(0x000000, .65); e.prog.drawRoundedRect(-28, -5, 56, 11, 5); e.prog.endFill(); e.prog.beginFill(0xffa726); e.prog.drawRoundedRect(-26, -3, Math.max(2, 52 * e.pv), 7, 3); e.prog.endFill(); }
      const qs = sm[0] > 1 ? '×' + sm[0] : ''; if (e.qt.text !== qs) e.qt.text = qs;
      e.glow.position.set(e.x, e.y - 8); e.glow.scale.set(working ? 1.2 + Math.sin(T * 14) * .08 : .5); e.glow.alpha = working ? .75 : .12;
      if (working) { e.sm = (e.sm || 0) - dt; if (e.sm <= 0) { e.sm = .16; emit(pfx, T_GLOW, e.x - 16 + rnd(-3, 3), e.y - 52, rnd(-8, 8), rnd(-40, -22), 1.4, .14, .45, 0x888888, .35, false, 0); if (Math.random() < .5) emit(overL, T_GLOW, e.x - 16 + rnd(-4, 4), e.y - 52, rnd(-14, 14), rnd(-70, -40), .6, .06, .01, 0xffb347, 1, true, 60); } }
    }
    if (e.k === 'pot') { e.steam = (e.steam || 0) - dt; if (e.steam <= 0) { e.steam = .22; emit(pfx, T_GLOW, e.x + rnd(-8, 8), e.y - 34, rnd(-6, 6), rnd(-30, -16), 1.3, .12, .4, 0xffffff, .28, false, 0); } }
    if (e.k === 'wall') { if (e.barT > 0) { e.barT -= dt; e.hp.alpha = Math.min(1, e.barT * 2); if (e.lbar !== e.hpv) { e.lbar = e.hpv; drawHp(e.hp, 34, e.hpv / e.mhp, 0xffb74d); } } else if (e.hp.alpha) e.hp.alpha = 0; }
  }
}
// ---- placement ghost: craft a placeable item, walk to aim, press ACT to put it down ----
let placingId = null, ghost = null, ghostRot = null, ghostF = null, placeRot = 0, lastPlaceAt = 0;
const PLACE_AHEAD = 58;   // must match the server
function placeCheck(r, x, y) {   // mirrors the server's rules so the silhouette can show green/red; the server stays in charge
  const d = Math.hypot(x, y), campR = RC.camp(S.f[2]), sr = RC.RADIUS[r.kind], station = r.kind !== 'wall' && r.kind !== 'trap';
  if (d < RC.fireClear(r.kind)) return 'Too close to the fire';
  if (station && d > campR) return 'Must be inside the camp (the fire ring)';
  if (!station && d > campR + 200) return 'Too far from camp';
  if (d > RR - 50) return 'Too close to the water';
  if ((S.st || []).filter(t => t[1] === r.kind).length >= (r.max || 99)) return 'You built the maximum of these';
  for (const t of S.st || []) {
    const stWall = t[1] === 'wall', dd = Math.hypot(t[2] - x, t[3] - y), need = station && !stWall ? RC.STATION_GAP : (station || !stWall) ? RC.WALL_GAP : RC.RADIUS[t[1]] + sr - 4;
    if (dd < need) return need > 60 ? 'Too close to another structure' : 'Something is already there';
  }
  const pl = pooled(); if (pl.wood < r.cost.wood || pl.stone < r.cost.stone || pl.scrap < (r.cost.scrap || 0)) return 'Not enough materials';
  return '';
}
const lastRot = {};   // remember the last rotation used for each recipe (handy when lining up walls)
function startPlacing(r) {
  stopPlacing(); setCraft(false); closeChest(); closePot(); closeSmelt();
  const D = SDEF[r.kind]; placingId = r.id; placeRot = (lastRot[r.id] || 0) % 8;
  ghost = new PIXI.Container(); ghostRot = new PIXI.Container();
  const sp = new PIXI.Sprite(D.tex); sp.anchor.set(.5, .5); sp.scale.set(D.base);
  ghostRot.y = -(D.ay - .5) * D.tex.height * D.base; ghostRot.addChild(sp); ghost.addChild(ghostRot);
  ghostF = new PIXI.ColorMatrixFilter(); ghost.filters = [ghostF]; ents.addChild(ghost);
  $('placeRotR').style.display = r.norot ? 'none' : ''; $('placeBar').style.display = 'flex'; $('placeName').textContent = r.e + ' ' + r.n; $('placeMsg').textContent = '';
}
function rotatePlace() { if (!placingId || RC.BY[placingId].norot) return;   // square things (cooking pot, smelter) can't be turned
  placeRot = (placeRot + 1) % 8;   // one tap = 45° (two taps = a quarter turn), one direction only
  lastRot[placingId] = placeRot; SFX.pickup(); }
RC.BY.__boat = { id: '__boat', n: 'Boat', e: '⛵', kind: 'boat', norot: true, cost: { wood: 0, stone: 0 } };
let boatSlot = -1;
function startPlacingBoat(i) {   // tap the boat in a slot: a see-through boat follows you at the water's edge; ACT puts it down
  stopPlacing(); setCraft(false); closeChest(); closePot(); closeSmelt(); boatSlot = i; placingId = '__boat';
  ghost = new PIXI.Container(); ghostRot = new PIXI.Container();
  const sp = new PIXI.Sprite(T_BOAT); sp.anchor.set(.5); sp.scale.set(.8); ghostRot.addChild(sp); ghost.addChild(ghostRot);
  ghostF = new PIXI.ColorMatrixFilter(); ghost.filters = [ghostF]; ents.addChild(ghost);
  $('placeRotR').style.display = 'none'; $('placeBar').style.display = 'flex'; $('placeName').textContent = '⛵ Boat'; $('placeMsg').textContent = '';
}
function stopPlacing() {
  boatSlot = -1;
  if (ghost) { ghost.destroy({ children: true }); ghost = null; } ghostRot = null;
  ghostF = null; placingId = null; $('placeBar').style.display = 'none';
}
function updateGhost(me) {
  if (!placingId || !ghost) return;
  if (placingId === '__boat') {
    const mp = S.p.find(p => p[0] === myId), fa = mp && mp[16] !== undefined ? mp[16] / 100 : 0, x = me.x + Math.cos(fa) * 100, y = me.y + Math.sin(fa) * 100;
    let why = ''; if (mp && mp[20]) why = 'You are already in a boat'; else if (!isWaterC(x, y)) why = 'Boats only go in the water - stand at the shore and face the sea';
    else if ((S.bt || []).some(b => Math.hypot(b[1] - x, b[2] - y) < 90)) why = 'Too close to another boat';
    const ok = !why; ghost.position.set(x, y); ghost.zIndex = y + 1; ghost.alpha = .55 + Math.sin(T * 5) * .1; ghostRot.rotation = fa;
    ghostF.matrix = ok ? [0, 0, 0, 0, .35, 0, 0, 0, 0, 1, 0, 0, 0, 0, .5, 0, 0, 0, 1, 0] : [0, 0, 0, 0, 1, 0, 0, 0, 0, .3, 0, 0, 0, 0, .3, 0, 0, 0, 1, 0];
    const msg = ok ? 'Looks good - press ACT to put it down' : why, pm = $('placeMsg'); if (pm.textContent !== msg || pm.dataset.ok !== String(ok)) { pm.textContent = msg; pm.style.color = ok ? '#8dffa8' : '#ff8a80'; pm.dataset.ok = ok; }
    return;
  }
  const r = RC.BY[placingId], mp = S.p.find(p => p[0] === myId), fa = mp && mp[16] !== undefined ? mp[16] / 100 : 0;
  const x = me.x + Math.cos(fa) * PLACE_AHEAD, y = me.y + Math.sin(fa) * PLACE_AHEAD, why = placeCheck(r, x, y), ok = !why;
  ghost.position.set(x, y); ghost.zIndex = y + 1; ghost.alpha = .55 + Math.sin(T * 5) * .1; ghostRot.rotation = placeRot * Math.PI / 4;
  ghostF.matrix = ok ? [0, 0, 0, 0, .35, 0, 0, 0, 0, 1, 0, 0, 0, 0, .5, 0, 0, 0, 1, 0] : [0, 0, 0, 0, 1, 0, 0, 0, 0, .3, 0, 0, 0, 0, .3, 0, 0, 0, 1, 0];
  const msg = ok ? 'Looks good - press ACT to place' : why; const pm = $('placeMsg'); if (pm.textContent !== msg || pm.dataset.ok !== String(ok)) { pm.textContent = msg; pm.style.color = ok ? '#8dffa8' : '#ff8a80'; pm.dataset.ok = ok; }
}
function actPress() {   // rising edge of the ACT button while placing: ask the server to place (it pays and checks the rules)
  if (!placingId || !ws || ws.readyState !== 1) return;
  const now = performance.now(); if (now - lastPlaceAt < 250) return; lastPlaceAt = now;
  if (placingId === '__boat') { ws.send(JSON.stringify({ t: 'boat', i: boatSlot })); return; }
  ws.send(JSON.stringify({ t: 'craft', id: placingId, rot: placeRot }));
}
$('placeCancel').addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); stopPlacing(); });
$('placeRotR').addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); rotatePlace(); });

// ---- crafting menu ----
const pooled = () => {   // what you can spend on crafting: your bag plus everything in the chests
  const mp = S && S.p.find(p => p[0] === myId), o = mp ? { wood: mp[7], stone: mp[8], food: mp[9], scrap: mp[15] || 0 } : { wood: 0, stone: 0, food: 0, scrap: 0 };
  for (const t of (S && S.st) || []) if (t[1] === 'chest' && t[6]) { o.wood += t[6][0]; o.stone += t[6][1]; o.food += t[6][2]; o.scrap += t[6][3] || 0; }
  return o;
};
const inv = pooled;
const hasBench = () => !!(S && S.st && S.st.some(t => t[1] === 'bench'));
function buildCraft() {
  const iv = inv(), bench = hasBench(), list = $('craftList'); $('craftInv').textContent = '🪵' + iv.wood + '  🪨' + iv.stone + '  (chests incl.)';
  list.innerHTML = '';
  if (!bench) list.insertAdjacentHTML('beforeend', '<div class="lockhint">🔒 Place a Crafting Bench in your camp to unlock more recipes.</div>');
  for (const r of RC.LIST) {
    if (r.id === 'bench' ? bench : !bench) continue;   // bench recipe hides once one exists; other recipes appear once it does
    if (r.max && (S.st || []).filter(t => t[1] === r.kind).length >= r.max) continue;   // one chest / pot / smelter per camp: the recipe disappears once it is built (and comes back if you dismantle it)
    if (r.scrap && !(S && S.sf)) continue;   // scrap recipes (the boat) appear once anyone has found scrap
    if (r.kind === 'gear' && GEAR[r.gear]) continue;   // tools you already made disappear from your menu (per player)
    const ok = iv.wood >= r.cost.wood && iv.stone >= r.cost.stone && iv.scrap >= (r.cost.scrap || 0);
    const co = [r.cost.wood ? '<span class="' + (iv.wood >= r.cost.wood ? '' : 'no') + '">🪵 ' + iv.wood + '/' + r.cost.wood + '</span>' : '', r.cost.stone ? '<span class="' + (iv.stone >= r.cost.stone ? '' : 'no') + '">🪨 ' + iv.stone + '/' + r.cost.stone + '</span>' : '', r.cost.scrap ? '<span class="' + (iv.scrap >= r.cost.scrap ? '' : 'no') + '">🔩 ' + iv.scrap + '/' + r.cost.scrap + '</span>' : ''].filter(Boolean).join(' &nbsp; ');
    const d = document.createElement('div'); d.className = 'rc';
    d.innerHTML = '<div class="ic">' + r.e + '</div><div class="tx"><div class="nm">' + r.n + '</div><div class="ds">' + r.d + '</div><div class="co">' + co + '</div></div>';
    const placeable = r.kind !== 'gear' && r.kind !== 'boat' && r.kind !== 'item';   // the whole row is the button: tap anywhere on it (items like the trap go into a slot)
    d.classList.add('pick'); if (!ok) d.classList.add('dim');
    d.onclick = () => {
      if (!ok) { const m = $('craftMsg'); m.textContent = 'Not enough materials for ' + r.n + '.'; m.style.color = '#ff8a80'; return; }
      if (placeable) startPlacing(r); else if (ws && ws.readyState === 1) ws.send(JSON.stringify({ t: 'craft', id: r.id }));
    };
    list.appendChild(d);
  }
  craftSig = refreshSig();
}
const refreshSig = () => { const iv = inv(); return ((S && S.st) || []).map(t => t[1]).join('') + iv.wood + ',' + iv.stone + ',' + iv.scrap + ',' + (S && S.sf) + ',' + hasBench() + ',' + JSON.stringify(GEAR); };
function setCraft(open) { if (open) { if ((S && S.st || []).some(t => t[1] === 'bench')) armDismantle($('craftDis'), () => nearestOf('bench')); else $('craftDis').style.display = 'none'; } craftOpen = open; $('craft').style.display = open ? 'flex' : 'none'; if (open) { $('craftMsg').textContent = ''; buildCraft(); } }
$('craftClose').onclick = () => setCraft(false);

// ---- shared chest + cooking pot menus ----
const BUFF = { speed: 0, regen: 0, dmg: 0 }; let buffAt = 0;
const nearStruct = id => { const e = structE[id], me = ents2['p' + myId]; return !!(e && me && Math.hypot(me.x - e.x, me.y - e.y) < 125); };
const anyPotNear = () => { for (const id in structE) if (structE[id].k === 'pot' && nearStruct(id)) return true; return false; };
function openChest(id) { setCraft(false); closePot(); closeSmelt(); chestId = id; chestSig = ''; $('chest').style.display = 'flex'; armDismantle($('chestDis'), () => chestId); buildChest(); }
function closeChest() { chestId = null; $('chest').style.display = 'none'; }
function buildChest() {
  const e = structE[chestId]; if (!e) { closeChest(); return; }
  const mp = S && S.p.find(p => p[0] === myId), it = e.items || [0, 0, 0, 0], me = mp ? [mp[7], mp[8], mp[9], mp[15] || 0] : [0, 0, 0, 0];
  const sig = it.join() + '|' + me.join(); if (sig === chestSig) return; chestSig = sig;
  const list = $('chestList'); list.innerHTML = '';
  [['wood', '🪵', 'Wood'], ['stone', '🪨', 'Stone'], ['food', '🍓', 'Berries'], ['scrap', '🔩', 'Metal scrap']].forEach((r, i) => {
    const d = document.createElement('div'); d.className = 'rc';
    d.innerHTML = '<div class="ic">' + r[1] + '</div><div class="tx"><div class="nm">' + r[2] + '</div><div class="co">In chest: <b>' + it[i] + '</b> &nbsp; You: <b>' + me[i] + '</b></div></div>';
    const bx = document.createElement('div'); bx.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:6px';
    [['Put 1', 1, me[i] <= 0], ['Put all', 1e6, me[i] <= 0]].forEach(b => {
      const bt = document.createElement('button'); bt.textContent = b[0]; bt.disabled = b[2]; bt.style.cssText = 'min-width:78px;padding:9px 6px;font-size:13px';
      bt.onclick = () => { if (ws && ws.readyState === 1) ws.send(JSON.stringify({ t: 'chest', id: chestId, res: r[0], n: b[1] })); SFX.pickup(); }; bx.appendChild(bt);
    });
    d.appendChild(bx); list.appendChild(d);
  });
}
// dismantle buttons (bench / chest / pot panels): first tap asks "Sure?", second tap within 3 s does it
function armDismantle(btn, getId) {
  let t = null; btn.style.display = '';
  btn.onclick = () => {
    if (t) { clearTimeout(t); t = null; btn.textContent = 'Dismantle'; const id = getId(); if (id != null && ws && ws.readyState === 1) ws.send(JSON.stringify({ t: 'dismantle', id })); return; }
    btn.textContent = 'Sure?'; t = setTimeout(() => { t = null; btn.textContent = 'Dismantle'; }, 3000);
  };
}
const nearestOf = kind => { const me = ents2['p' + myId]; let best = null, bd = 1e9; for (const id in structE) { const e = structE[id]; if (e.k !== kind || !me) continue; const d = Math.hypot(me.x - e.x, me.y - e.y); if (d < bd) { bd = d; best = id; } } return best == null ? null : +best; };
function openPot() { setCraft(false); closeChest(); closeSmelt(); armDismantle($('potDis'), () => nearestOf('pot')); potOpen = true; potSig = ''; $('pot').style.display = 'flex'; $('potMsg').textContent = ''; buildPot(); }
function closePot() { potOpen = false; $('pot').style.display = 'none'; }
function buildPot() {
  const food = pooled().food, sig = String(food); if (sig === potSig) return; potSig = sig;
  $('potInv').textContent = '🍓 ' + food + ' (chests incl.)'; const list = $('potList'); list.innerHTML = '';
  for (const f of RC.FOOD) {
    const ok = food >= f.cost.food, d = document.createElement('div'); d.className = 'rc';
    d.innerHTML = '<div class="ic">' + f.e + '</div><div class="tx"><div class="nm">' + f.n + ' <span style="font-weight:400;opacity:.7;font-size:11px">' + f.type + '</span></div><div class="ds">' + f.d + '</div><div class="co"><span class="' + (ok ? '' : 'no') + '">🍓 ' + food + '/' + f.cost.food + '</span></div></div>';
    d.classList.add('pick'); if (!ok) d.classList.add('dim');   // the whole row is the button: tap anywhere on it to cook
    d.onclick = () => {
      if (!ok) { const m = $('potMsg'); m.textContent = 'Not enough berries for ' + f.n + '.'; m.style.color = '#ff8a80'; return; }
      if (ws && ws.readyState === 1) ws.send(JSON.stringify({ t: 'cook', id: f.id }));
    };
    list.appendChild(d);
  }
}
// smelter menu: nothing happens until you put rocks in (5 rocks = 1 metal scrap); it shows what is loaded and how far along it is
let smeltId = null, smeltSig = '';
function openSmelt(id) { setCraft(false); closeChest(); closePot(); smeltId = id; smeltSig = ''; $('smelt').style.display = 'flex'; $('smeltMsg').textContent = ''; armDismantle($('smeltDis'), () => smeltId); buildSmelt(); }
function closeSmelt() { smeltId = null; $('smelt').style.display = 'none'; }
function buildSmelt() {
  const e = structE[smeltId]; if (!e) { closeSmelt(); return; }
  const stone = pooled().stone, q = (e.smelt || [0, 0])[0], C = RC.SMELT.cost, free = RC.SMELT.queue - q, can = Math.min(free, Math.floor(stone / C));
  const sig = stone + '|' + q; if (sig === smeltSig) return; smeltSig = sig;
  $('smeltInv').textContent = '🪨 ' + stone + ' (chests incl.)';
  const list = $('smeltList'); list.innerHTML = '';
  const d = document.createElement('div'); d.className = 'rc';
  d.innerHTML = '<div class="ic">🔩</div><div class="tx"><div class="nm">Metal scrap</div><div class="ds">' + C + ' rocks smelt into 1 scrap in ' + RC.SMELT.time + ' s. It pops out for pickup.</div>' +
    '<div class="co">' + (q ? 'Smelting: <b>' + q + '</b> scrap (' + q * C + ' rocks inside)' : '<span style="opacity:.8">Empty. Put rocks in to start it.</span>') + ' &nbsp; Room for ' + free + ' more</div></div>';
  const bx = document.createElement('div'); bx.style.cssText = 'display:grid;grid-template-columns:1fr;gap:6px';
  [['Put ' + C, 1, can >= 1], ['Put ' + Math.max(can, 1) * C, RC.SMELT.queue, can > 1]].forEach(b => {
    const bt = document.createElement('button'); bt.textContent = b[0]; bt.disabled = !b[2]; bt.style.cssText = 'min-width:84px;padding:9px 6px;font-size:13px';
    bt.onclick = () => { if (ws && ws.readyState === 1) ws.send(JSON.stringify({ t: 'smelt', id: smeltId, n: b[1] })); };
    bx.appendChild(bt);
  });
  if (can <= 1) bx.lastChild.style.display = 'none';   // only one batch possible: a single button is enough
  d.appendChild(bx); list.appendChild(d);
  if (!free) { $('smeltMsg').textContent = 'The smelter is full.'; $('smeltMsg').style.color = '#ffd000'; }
  else if (can < 1) { $('smeltMsg').textContent = 'You need ' + C + ' rocks (your bag plus the chests).'; $('smeltMsg').style.color = '#ff8a80'; }
}
$('chestClose').onclick = closeChest; $('potClose').onclick = closePot; $('smeltClose').onclick = closeSmelt;

// ---- teammate pointers: like the campfire one, a badge pinned to the screen edge toward each other player who is off screen ----
const plPtrs = {}; let plPtrBox = null;
const PL_COL = ['#4fc3f7', '#ba68c8', '#81c784', '#ff8a65', '#f06292', '#fff176', '#90a4ae', '#a1887f'];
function updatePlayerPtrs(ox, oy) {   // (ox, oy) = where world (0,0) is on screen right now
  if (!plPtrBox) { plPtrBox = document.createElement('div'); plPtrBox.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:6'; document.body.appendChild(plPtrBox); }
  const cx = W / 2, cy = H / 2, margin = 26, L = 34, Rr = W - 34, Tp = 124, Bt = H - 56, seen = {};
  for (const p of S.p) {
    if (p[0] === myId) continue; const e = ents2['p' + p[0]]; if (!e) continue; seen[p[0]] = 1;
    let el = plPtrs[p[0]];
    if (!el) {
      const col = PL_COL[(p[0] - 1) % PL_COL.length], d = document.createElement('div'); d.style.cssText = 'position:absolute;left:0;top:0;width:0;height:0';
      d.innerHTML = '<div class="pb" style="position:absolute;left:-19px;top:-19px;width:38px;height:38px;border-radius:50%;background:#0b1a2acc;border:3px solid ' + col + ';display:flex;align-items:center;justify-content:center;font-size:20px"></div>' +
        '<div class="pa" style="position:absolute;left:-8px;top:-10px;width:16px;line-height:20px;font-size:17px;text-align:center;color:' + col + ';text-shadow:0 1px 3px #000">▶</div>' +
        '<div class="pn" style="position:absolute;left:-40px;top:21px;width:80px;text-align:center;font-size:11px;font-weight:700;text-shadow:0 1px 3px #000"></div>';
      plPtrBox.appendChild(d); el = plPtrs[p[0]] = { d, b: d.children[0], a: d.children[1], n: d.children[2], icon: '', txt: '' };
    }
    const sx = ox + e.x * Z, sy = oy + e.y * Z;
    if (sx > margin && sx < W - margin && sy > margin && sy < H - margin) { el.d.style.display = 'none'; continue; }   // already on screen
    const dx = sx - cx, dy = sy - cy; let t = Infinity;
    if (dx > 0) t = Math.min(t, (Rr - cx) / dx); else if (dx < 0) t = Math.min(t, (L - cx) / dx);
    if (dy > 0) t = Math.min(t, (Bt - cy) / dy); else if (dy < 0) t = Math.min(t, (Tp - cy) / dy);
    let px = cx + dx * t, py = cy + dy * t; if (px > W - 250) py = Math.min(py, H - 290);
    const icon = p[10] ? '🆘' : ((GC.BY[p[2]] || {}).e || '🙂'), txt = (p[1] || '').slice(0, 9) + ' · ' + Math.round(Math.hypot(e.x - (me0x()), e.y - (me0y())) / 10) + 'm';
    el.d.style.display = 'block'; el.d.style.transform = 'translate(' + Math.round(px) + 'px,' + Math.round(py) + 'px)';
    el.a.style.transform = 'rotate(' + Math.atan2(dy, dx) + 'rad) translateX(30px)';
    if (el.icon !== icon) { el.icon = icon; el.b.textContent = icon; } if (el.txt !== txt) { el.txt = txt; el.n.textContent = txt; el.n.style.color = p[10] ? '#ff8a80' : '#fff'; }
  }
  for (const id in plPtrs) if (!seen[id]) { plPtrs[id].d.remove(); delete plPtrs[id]; }
}
const me0x = () => { const m = ents2['p' + myId]; return m ? m.x : 0; }, me0y = () => { const m = ents2['p' + myId]; return m ? m.y : 0; };
// ---- campfire pointer: a little 🔥 icon pinned to the screen edge, in the direction of the camp (hidden while the campfire is on screen) ----
function updateCampPtr(ox, oy) {   // (ox, oy) = where world (0,0), the campfire, is on screen right now
  const ptr = $('campPtr'), cx = W / 2, cy = H / 2, dx = ox - cx, dy = oy - cy, margin = 26;
  if (ox > margin && ox < W - margin && oy > margin && oy < H - margin) { ptr.style.display = 'none'; return; }   // you can already see it
  const L = 34, Rr = W - 34, Tp = 124, Bt = H - 56;   // keep clear of the top HUD and the screen edges
  let t = Infinity;
  if (dx > 0) t = Math.min(t, (Rr - cx) / dx); else if (dx < 0) t = Math.min(t, (L - cx) / dx);
  if (dy > 0) t = Math.min(t, (Bt - cy) / dy); else if (dy < 0) t = Math.min(t, (Tp - cy) / dy);
  let px = cx + dx * t, py = cy + dy * t;
  if (px > W - 250) py = Math.min(py, H - 290);   // stay above the ACT / ATTACK / CRAFT buttons
  const f = S && S.f, lit = f && f[0] > 0, dist = Math.hypot(ox - (W / 2 - 0), oy - H / 2) / Z / 10;
  ptr.style.display = 'block'; ptr.style.transform = 'translate(' + Math.round(px) + 'px,' + Math.round(py) + 'px)';
  $('campArrow').style.transform = 'rotate(' + Math.atan2(dy, dx) + 'rad) translateX(35px)';
  $('campBadge').style.opacity = lit ? 1 : .55; $('campBadge').style.filter = lit ? '' : 'grayscale(1)';
  const ds = Math.round(Math.hypot(camX, camY) / 10) + 'm'; if ($('campDist').textContent !== ds) $('campDist').textContent = ds;
}

let snapDur = .066, lastSnapAt = 0;
function aim(e, x, y, now) { e.px = e.x; e.py = e.y; if (Math.hypot(x - e.x, y - e.y) > 250) { e.px = e.x = x; e.py = e.y = y; } e.tx = x; e.ty = y; e.t0 = now; }
function onSnap(m) {
  const nowS = performance.now(); if (lastSnapAt) snapDur += (Math.max(.04, Math.min(.15, (nowS - lastSnapAt) / 1000)) - snapDur) * .2; lastSnapAt = nowS;
  const prevS = S; S = m; const seen = {};
  const meE = ents2['p' + myId], _d = (x, y) => meE ? Math.hypot(x - meE.x, y - meE.y) : 0, _dx = x => meE ? x - meE.x : 0;
  for (const p of m.p) {
    const k = 'p' + p[0]; seen[k] = 1; let e = ents2[k];
    if (!e) { e = ents2[k] = mkPlayer(p); e.x = e.tx = p[3]; e.y = e.ty = p[4]; e.c.position.set(e.x, e.y); }
    aim(e, p[3], p[4], nowS); e.d = p;
    if (p[12] !== e.sw) { e.sw = p[12]; startSwing(e, p, _d(e.x, e.y), _dx(e.x)); }
  }
  for (const a of m.a) {
    const k = 'a' + a[0]; seen[k] = 1; let e = ents2[k];
    if (!e) { e = ents2[k] = mkAlien(a); e.x = e.tx = a[1]; e.y = e.ty = a[2]; e.c.position.set(e.x, e.y); if (a[5] === 2 && prevS) { SFX.roar(); shake = Math.max(shake, .4); warnUntil = performance.now() + 7000; } }
    if (e.lh >= 0 && a[3] < e.lh) { e.flash = .12; burst(e.x, e.y, 6, 0xc6ff2a, 120, true, .1); SFX.hit(_d(e.x, e.y), _dx(e.x)); }
    e.lh = a[3]; aim(e, a[1], a[2], nowS); e.d = a;
  }
  for (const b of m.rb || []) {   // rabbits
    const k = 'r' + b[0]; seen[k] = 1; let e = ents2[k];
    if (!e) { e = ents2[k] = mkRabbit(b); e.x = e.tx = b[1]; e.y = e.ty = b[2]; e.c.position.set(e.x, e.y); }
    aim(e, b[1], b[2], nowS); e.d = b;
  }
  for (const k in ents2) if (!seen[k]) {
    const e = ents2[k];
    if (e.kind === 'r') { SFX.hit(_d(e.x, e.y), _dx(e.x)); burst(e.x, e.y, 9, 0xc62828, 110, false, .1); burst(e.x, e.y, 5, 0xf5f5f5, 70, false, .08); }
    if (e.kind === 'a') { SFX.alienDie(_d(e.x, e.y), _dx(e.x)); burst(e.x, e.y, 14, 0xb45fe0, 160, true, .2); burst(e.x, e.y, 8, 0xc6ff2a, 90, true, .12); e.eyes.forEach(s => s.destroy()); }
    e.c.destroy({ children: true }); delete ents2[k];
  }
  if (built) for (let i = 0; i < resNodes.length; i++) {
    const r = resNodes[i], hp = +m.r[i];
    if (!r.init) { r.init = true; r.hp = hp; if (hp <= 0) r.c.visible = false; continue; }
    if (hp < r.hp) {
      let who = null, wd = 110; for (const p of m.p) { const dd = Math.hypot(p[3] - r.x, p[4] - r.y); if (dd < wd) { wd = dd; who = p; } }
      const fromX = who ? who[3] : r.x - 1;
      if (r.k === 'b') { SFX.pick(_d(r.x, r.y), _dx(r.x)); burst(r.x, r.y - 8, 10, 0xe53935, 140, false, .12); r.c.visible = false; }
      else {
        const d0 = _d(r.x, r.y), dx0 = _dx(r.x);
        r.barT = 1.6; r.hp = hp; drawPips(r);
        setTimeout(() => { hitFx(r, d0, dx0); if (hp <= 0) breakFx(r, fromX, d0, dx0); }, 170);
      }
    }
    if (hp > r.hp) { if (r.hp <= 0) { r.c.visible = true; r.pop = 0; r.s.rotation = 0; r.s.alpha = 1; } r.barT = 0; }
    r.hp = hp;
  }
  syncDrops(m, _d, _dx);
  syncStructs(m, !prevS); syncBoats(m); syncArrows(m);
  if (chestId !== null) { if (!nearStruct(chestId)) closeChest(); else buildChest(); }
  if (potOpen) { if (!anyPotNear()) closePot(); else buildPot(); }
  if (smeltId !== null) { if (!nearStruct(smeltId)) closeSmelt(); else buildSmelt(); }
  if (craftOpen) { const bid = nearestOf('bench'), me2 = ents2['p' + myId], benchNear = bid != null ? nearStruct(bid) : !!(me2 && Math.hypot(me2.x, me2.y) < RC.camp(m.f[2])); if (!benchNear) setCraft(false); else if (refreshSig() !== craftSig) buildCraft(); }
  const mp = m.p.find(p => p[0] === myId);
  if (mp) {
    if (lastInv) { const dw = mp[7] - lastInv[0], ds = mp[8] - lastInv[1], df = mp[9] - lastInv[2], e = ents2['p' + myId];
      if (e) { if (dw > 0) floatText(e.x, e.y, '+' + dw + ' wood', 0xffcc80); if (ds > 0) floatText(e.x, e.y, '+' + ds + ' stone', 0xcfd8dc); if (df > 0) floatText(e.x, e.y, '+' + df + ' food', 0xff8a80); } }
    lastInv = [mp[7], mp[8], mp[9]];
    if (lastHp !== null && mp[5] < lastHp && lastMe && Math.hypot(mp[3] - lastMe[0], mp[4] - lastMe[1]) > 140) { shake = .7; SFX.slam(); }   // sent flying by the Charger
    lastMe = [mp[3], mp[4]];
    if (lastHp !== null && mp[5] < lastHp) { shake = Math.max(shake, .3); SFX.hurt(); const h = $('hurt'); h.style.opacity = '1'; setTimeout(() => h.style.opacity = '0', 120); }
    lastHp = mp[5];
  }
  if (prevS && m.n > prevS.n) floatText(0, -120, 'Night ' + m.n + ' begins', 0xffffff);
  if (prevS) {
    if (m.ph === 1 && prevS.ph !== 1) notice('Night is approaching...');
    if (prevS.f[0] >= 25 && m.f[0] < 25 && m.f[0] > 0) notice('Fire is low - bring wood!');
    if (m.ph !== prevS.ph) { if (m.ph === 1) SFX.horn(); else if (m.ph === 2) SFX.night(); else SFX.dawn(); }
    if (m.f[0] > prevS.f[0] + 5) SFX.feed();
    if (m.f[2] > prevS.f[2]) SFX.levelup();
    if (prevS.f[0] > 0 && m.f[0] <= 0) SFX.fireOut();
    for (const p of m.p) { const o = prevS.p.find(q => q[0] === p[0]); if (!o) continue; if (!o[10] && p[10] && p[0] === myId) SFX.down(); if (o[10] && !p[10]) SFX.revive(); }
  }
}

// ---------- frame ----------
function darkness(c) { return c < 5 ? .74 * (1 - c / 5) : c < 90 ? 0 : c < 120 ? .74 * (c - 90) / 30 : .74; }
function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
const rgb = c => (Math.round(c[0]) << 16) | (Math.round(c[1]) << 8) | Math.round(c[2]);
let camX = 0, camY = 0, fireTick = 0, smokeTick = 0, ringR = 0;

app.ticker.add(() => {
  const dt = Math.min(.1, app.ticker.deltaMS / 1000); T += dt;
  const me = ents2['p' + myId];
  if (!S || !me || !built) return;
  water.visible = true;
  // smoothing + node updates
  for (const k in ents2) {
    const e = ents2[k], ox = e.x, oy = e.y;
    if (e.ph === undefined) { e.vx = e.vy = 0; e.ph = Math.random() * 6.28; }
    if (e.t0 === undefined) { e.px = e.x; e.py = e.y; e.t0 = -1e9; }
    // constant-speed glide from where we were to the newest server position over one snapshot interval (no exponential chasing)
    const u = Math.min(1.25, (performance.now() - e.t0) / 1000 / snapDur);
    e.x = e.px + (e.tx - e.px) * u; e.y = e.py + (e.ty - e.py) * u;
    const ks = Math.min(1, dt * 10); e.vx += ((e.x - ox) / dt - e.vx) * ks; e.vy += ((e.y - oy) / dt - e.vy) * ks;
    const vx = e.vx, vy = e.vy, sp = Math.hypot(vx, vy);
    e.c.position.set(e.x, e.y); e.c.zIndex = e.y;
    if (e.kind === 'p') {
      const p = e.d, down = p[10];
      if (sp > 12 && !down && !e.swing) e.ang = angLerp(e.ang, Math.atan2(vy, vx), Math.min(1, dt * 12));
      if (e.swing) {
        const sw = e.swing; sw.t += dt;
        if (sw.t >= .42) { e.swing = null; e.tool.visible = false; }
        else {
          e.ang = sw.ang; e.tool.rotation = sw.ang + swingOff(sw.t); e.tool.position.set(Math.cos(sw.ang) * 6, Math.sin(sw.ang) * 6);
          if (!sw.hit && sw.t >= .2) { sw.hit = true; const sl = new PIXI.Sprite(T_SLASH); sl.anchor.set(.1, .5); sl.rotation = sw.ang; sl.position.set(e.x + Math.cos(sw.ang) * 16, e.y + Math.sin(sw.ang) * 16); sl.blendMode = BM.ADD; sl.scale.set(.75); overL.addChild(sl); parts.push({ s: sl, vx: 0, vy: 0, life: .16, max: .16, s0: .75, s1: 1, a0: .75, g: 0 }); }
        }
      }
      e.fall = Math.max(0, Math.min(1, (e.fall === undefined ? (down ? 1 : 0) : e.fall) + (down ? dt * 2.2 : -dt * 3)));   // 0 = standing, 1 = lying on the ground: tips over with a little stumble
      if (down && !e.wasDown) { burst(e.x, e.y + 6, 8, 0xd9c79a, 70, false, .12); } e.wasDown = down;
      const fu = ease(e.fall), tint = Math.round(255 - (255 - 0x77) * fu) & 255;
      e.body.rotation = e.ang + (((1.2 - e.ang + Math.PI) % TAU + TAU) % TAU - Math.PI) * fu; e.body.tint = (tint << 16) | (tint << 8) | tint;
      e.body.y = down || e.fall > 0 ? -Math.sin(fu * Math.PI) * 7 : Math.sin(T * 16 + e.ph) * (sp > 12 ? 1.8 : .4); e.body.scale.y = (.85 - .25 * fu) * (1 + (sp > 12 && !down ? Math.sin(T * 16) * .04 : 0));
      if (k === 'p' + myId) {   // stamina bar over your own character: shown while it's below full, red when winded
        const tgt = p[17] === undefined ? 100 : p[17]; e.stv += (tgt - e.stv) * Math.min(1, dt * 14);
        const show = e.stv < 99 || p[18]; e.sta.visible = !!show && !down && !p[20];
        if (e.sta.visible) { const f = Math.max(0, e.stv / 100), tired = !!p[18], col = tired ? (Math.sin(T * 12) > 0 ? 0xff5252 : 0xb71c1c) : f < .3 ? 0xffb74d : 0xffee58; if (e.stDraw !== col + ':' + Math.round(f * 60)) { e.stDraw = col + ':' + Math.round(f * 60); drawHp(e.sta, 34, f, col); if (tired) { e.sta.beginFill(0xffffff, .85); e.sta.drawRect(-17 + 34 * .3 - .5, -1, 1, 7); e.sta.endFill(); } } }
      }
      if (e.lh !== p[5] || e.ld !== p[10] || e.lr !== p[11]) { e.lh = p[5]; e.ld = p[10]; e.lr = p[11]; if (p[10]) drawHp(e.hp, 40, Math.min(1, p[11] / 10), 0x4caf50); else drawHp(e.hp, 34, p[5] / p[6], 0xef5350); }
      if (sp > 30 && !down && !p[20]) { e.st = (e.st || 0) - dt; if (e.st <= 0) { e.st = .3; SFX.step(Math.hypot(e.x - me.x, e.y - me.y), e.x - me.x); } e.dust -= dt; if (e.dust <= 0) { e.dust = .14; emit(pfx, T_GLOW, e.x, e.y + 8, rnd(-8, 8), rnd(-8, 4), .5, .12, .3, 0xd9c79a, .35, false, 0); } }
    } else if (e.kind === 'r') {   // rabbit: faces where it hops, bounces while moving, fast hops when it runs
      const b = e.d; e.age += dt; e.c.alpha = Math.min(1, e.age * 2);
      e.c.renderable = Math.abs(e.x - camX) < W / Z / 2 + 80 && Math.abs(e.y - camY) < H / Z / 2 + 80;
      e.ang = angLerp(e.ang, b[3] / 100, Math.min(1, dt * 10)); e.body.rotation = e.ang;
      const moving = sp > 6; e.hop = moving ? e.hop + dt * (b[4] === 1 ? 13 : 7) : 0;
      const h = moving ? Math.abs(Math.sin(e.hop)) : 0; e.body.y = -h * (b[4] === 1 ? 6 : 3.5); e.sh.scale.set(.55 - h * .12, .32 - h * .07);
      e.body.scale.set(.8 * (1 + h * .08), .8 * (1 - h * .05));
    } else {
      const a = e.d; e.age += dt; e.c.alpha = Math.min(1, e.age * 2);
      if (a[6] != null) e.ang = angLerp(e.ang, a[6] / 100, Math.min(1, dt * (e.charger ? 14 : 10)));   // turn toward the player it is going for (works while standing still, e.g. against the fire ring)
      else if (sp > 8) e.ang = angLerp(e.ang, Math.atan2(vy, vx), Math.min(1, dt * 8));
      e.body.rotation = e.ang; const pulse = 1 + Math.sin(T * 9 + e.x * .1) * .05; e.body.scale.set(e.sc * pulse);
      if (S.ph === 2 && Math.random() < dt * .12) { const gd = Math.hypot(e.x - me.x, e.y - me.y); if (gd < 520) SFX.growl(gd, e.x - me.x); }
      e.flash = Math.max(0, e.flash - dt); e.body.tint = e.flash > 0 ? 0xffffff : e.ak.tint;
      if (a[7] > 0) {   // caught in a trap: tinted, struggling, with a countdown over its head
        if (e.flash <= 0) e.body.tint = 0x8fb4ff; e.body.rotation += Math.sin(T * 34) * .06;
        if (!e.trapTxt) { e.trapTxt = new PIXI.Text('', { fontFamily: 'system-ui,sans-serif', fontSize: 15, fontWeight: '800', fill: 0xffe082, stroke: 0x000000, strokeThickness: 4 }); e.trapTxt.anchor.set(.5, 1); e.trapTxt.resolution = 2; e.trapTxt.y = e.ak.hpY - 14; e.c.addChild(e.trapTxt); }
        const tt = 'TRAPPED ' + a[7]; if (e.trapTxt.text !== tt) e.trapTxt.text = tt; e.trapTxt.visible = true;
      } else if (e.trapTxt) e.trapTxt.visible = false;
      if (a[3] < a[4] && e.lh2 !== a[3]) { e.lh2 = a[3]; drawHp(e.hp, e.ak.hpW, a[3] / a[4], e.charger ? 0xff5252 : 0xb6ff3c); e.hp.y = e.ak.hpY; e.hp.visible = true; }
      const ca = Math.cos(e.ang), sa = Math.sin(e.ang), o = e.ak.eo, sy = e.ak.es;
      if (e.eyes.length) e.eyes[0].position.set(e.x + ca * o - sa * -sy, e.y + sa * o + ca * -sy); if (e.eyes.length) e.eyes[1].position.set(e.x + ca * o - sa * sy, e.y + sa * o + ca * sy);
      e.eyes.forEach(s => s.alpha = e.c.alpha * (.75 + Math.sin(T * 6 + e.x) * .25));
      if (e.charger && sp > 90) { e.trail -= dt; if (e.trail <= 0) { e.trail = .04; emit(pfx, T_GLOW, e.x - Math.cos(e.ang) * 40 + rnd(-14, 14), e.y + 18 + rnd(-8, 8), -Math.cos(e.ang) * 30, rnd(-14, 6), .7, .32, .8, 0xd9c79a, .45, false, 0); } }   // dust kicked up by the charge
    }
  }
  // resources: sway + pop-in
  const cullR = Math.max(W, H) / Z / 2 + 140;
  for (const ic of islandCs) ic.c.renderable = Math.hypot(ic.x - camX, ic.y - camY) < ic.r + cullR * 1.42;   // island ground: drawn only when any of it can be on screen
  for (const r of resNodes) {
    r.c.renderable = Math.abs(r.x - camX) < cullR && Math.abs(r.y - camY) < cullR;   // skip drawing what is off screen
    if (r.barT > 0 && r.bar) { r.barT -= dt; if (r.barT <= 0) r.bar.clear(); else if (r.barT < .4) r.bar.alpha = r.barT / .4; else r.bar.alpha = 1; }
    if (r.shake > 0) r.shake = Math.max(0, r.shake - dt);
    if (!r.c.visible) continue;
    if (r.shake > 0) { const sh = Math.sin(T * 55) * r.shake; r.s.skew.x = sh * .22; r.s.x = sh * 3; r.s.y = Math.abs(sh) * -1.2; }
    else if (r.s.x !== 0 || r.s.y !== 0) { r.s.x = 0; r.s.y = 0; }
    if (r.pop < 1) { r.pop = Math.min(1, r.pop + dt * 2.5); const b = 1 - Math.pow(1 - r.pop, 3); r.s.scale.set(r.base * (.2 + .8 * b)); }
    if (r.shake <= 0) { if (r.k === 't' || r.k === 'c') r.s.skew.x = Math.sin(T * 1.3 + r.ph) * .035 + Math.sin(T * 3.1 + r.ph) * .01; else if (r.k === 'b') r.s.skew.x = Math.sin(T * 2 + r.ph) * .02; }
  }
  updateGhost(me);
  { // the ACT button names whatever ACT would do right now (same priority and ranges as the server)
    let lab = 'ACT';
    if (placingId) lab = 'PLACE';
    else if (me.d[20]) lab = 'EXIT';
    else if (!me.d[10]) {
      const dist = (x, y) => Math.hypot(x - me.x, y - me.y); let st = null, sd = 1e9;   // the nearest station in reach (same rule as the server)
      for (const t of S.st || []) { if (t[1] !== 'bench' && t[1] !== 'chest' && t[1] !== 'pot' && t[1] !== 'smelter') continue; const dd = dist(t[2], t[3]); if (dd < RC.RADIUS[t[1]] + 62 && dd < sd) { sd = dd; st = t; } }
      const nb = (S.bt || []).find(b => dist(b[1], b[2]) < 125);
      if (S.p.some(q => q[10] && q[0] !== myId && dist(q[3], q[4]) < 60)) lab = 'REVIVE';
      else if (nb) lab = nb[4] >= 2 ? 'FULL' : 'ENTER';
      else if (st) lab = st[1] === 'bench' ? 'CRAFT' : st[1] === 'chest' ? 'OPEN' : st[1] === 'pot' ? 'COOK' : 'SMELT';
      else if (Math.hypot(me.x, me.y) < 80) {
        const feed = (GC.BY[me.d[2]] || GC.BY.forester).feed || 1;
        lab = S.f[1] - S.f[0] > 15 * feed * .5 ? 'REFUEL' : S.f[2] < RC.FIRE_MAX ? 'UPGRADE' : 'ACT';
      } else {
        let bd = 55, near = null; for (const r of resNodes) if (r.hp > 0) { const dd = dist(r.x, r.y); if (dd < bd) { bd = dd; near = r; } }
        if (near) lab = near.k === 't' || near.k === 'c' ? 'CHOP' : near.k === 'r' ? 'MINE' : 'PICK';
        else if (!(S.st || []).some(t => t[1] === 'bench') && Math.hypot(me.x, me.y) < RC.camp(S.f[2])) lab = 'BUILD';   // no bench yet: ACT in camp opens the build menu
      }
    }
    if (S.dr && !me.d[10] && (me.d[19] || []).length >= 3 && performance.now() - slotFullAt > 2500 && S.dr.some(q => q[1] === 'q' && Math.hypot(q[2] - me.x, q[3] - me.y) < 34)) { slotFullAt = performance.now(); floatText(me.x, me.y - 14, 'Slots full', 0xff8a80); }
    const ab = $('act'); if (ab.textContent !== lab) { ab.textContent = lab; ab.style.fontSize = lab.length > 6 ? '9.5px' : lab.length > 4 ? '11px' : ''; }
  }
  // camera
  camX += (me.x - camX) * Math.min(1, dt * 10); camY += (me.y - camY) * Math.min(1, dt * 10);
  if (T < 1) { camX = me.x; camY = me.y; }
  shake = Math.max(0, shake - dt); const sx = shake > 0 ? rnd(-1, 1) * shake * 18 : 0, sy2 = shake > 0 ? rnd(-1, 1) * shake * 18 : 0;
  const ox = W / 2 - camX * Z + sx, oy = H / 2 - camY * Z + sy2;
  world.position.set(ox, oy); world.scale.set(Z); overL.position.set(ox, oy); overL.scale.set(Z);
  updateCampPtr(ox, oy); updatePlayerPtrs(ox, oy);
  waterF.uniforms.uTime = T; waterF.uniforms.uCam = [camX - sx / Z, camY - sy2 / Z];
  // campfire
  const f = S.f, fuelK = clamp(f[0] / f[1], 0, 1), alive = f[0] > 0, fl = 1 + Math.sin(T * 17) * .06 + Math.sin(T * 29) * .04;
  flames.forEach((s, i) => { s.visible = alive; const w = (.5 + .5 * fuelK) * (1 - i * .22) * fl; s.scale.set(w * (1 + Math.sin(T * (9 + i * 3) + i) * .08), w * (1 + Math.sin(T * (13 + i * 4) + i * 2) * .14)); s.rotation = Math.sin(T * (6 + i * 2) + i) * .08; s.position.set((i - 1) * 4, 6); });
  { // standing at the fire: show what it needs (same rules as the server: ACT refuels with wood, then levels up with stone)
    const near = Math.hypot(me.x, me.y) < 80 && !me.d[10]; fireTip.visible = near;
    if (near) {
      const feed = (GC.BY[me.d[2]] || GC.BY.forester).feed || 1, need = f[1] - f[0], lines = [];
      if (need > 15 * feed * .5) lines.push('🪵 ×' + Math.ceil(need / (15 * feed)) + ' to refuel');
      lines.push(f[2] < RC.FIRE_MAX ? '⬆ Level ' + (f[2] + 1) + ': 🪨 ×' + 10 * f[2] : 'Fire is max level');
      const t = lines.join('\n'); if (fireTip.text !== t) fireTip.text = t;
    }
  }
  fireGlow.visible = alive; fireGlow.position.set(0, -6); fireGlow.scale.set((1.6 + fuelK * 1.4) * fl); fireGlow.alpha = .55;
  if (alive) { if (!ringR) ringR = f[3]; ringR += (f[3] - ringR) * Math.min(1, dt * 2.5); }
  ring.visible = alive; ring.scale.set(ringR * 2 / 256 * 1.0); ring.alpha = .35 + Math.sin(T * 2) * .08;
  if (alive) { fireTick += dt * (20 + 40 * fuelK); while (fireTick > 1) { fireTick--; emit(overL, T_GLOW, rnd(-8, 8), -2, rnd(-14, 14), rnd(-70, -35), rnd(.6, 1.3), .08, .01, Math.random() < .5 ? 0xffb347 : 0xffe08a, 1, true, -10); } }
  smokeTick += dt * (alive ? 4 : 9); while (smokeTick > 1) { smokeTick--; emit(pfx, T_GLOW, rnd(-6, 6), -14, rnd(-6, 6), rnd(-26, -14), 2.2, .25, .9, alive ? 0x555555 : 0x444444, alive ? .22 : .35, false, 0); }
  stepParts(dt); stepFallers(dt); stepDrops(dt); stepStructs(dt); stepBoats(dt); stepArrows();
  for (let i = ftexts.length - 1; i >= 0; i--) { const q = ftexts[i]; q.life -= dt; q.t.y -= dt * 34; q.t.alpha = clamp(q.life * 2, 0, 1); if (q.life <= 0) { q.t.destroy(); ftexts.splice(i, 1); } }
  // lighting
  const d = darkness(S.c);
  let col, al;
  if (S.c >= 90 && S.c < 120) { const k = (S.c - 90) / 30; col = mix([255, 140, 70], [10, 14, 46], Math.pow(k, .7)); al = .12 + (d - .12) * k; } else { col = [10, 14, 46]; al = d; }
  darkBase.visible = d > .005; darkBase.width = rt.width; darkBase.height = rt.height; darkBase.tint = rgb(col); darkBase.alpha = al;
  if (darkBase.visible) {
    let li = 0;
    if (alive) { const L = getLight(li++); L.visible = true; L.position.set((W / 2 + (0 - camX) * Z + sx) * LS, (H / 2 + (0 - camY) * Z + sy2) * LS); const r = f[3] * 1.25 * Z * (1 + Math.sin(T * 13) * .012); L.scale.set(r * 2 * LS / 128); }
    for (const p of S.p) { const e = ents2['p' + p[0]]; if (!e) continue; const L = getLight(li++); L.visible = true; L.position.set((W / 2 + (e.x - camX) * Z + sx) * LS, (H / 2 + (e.y - camY) * Z + sy2) * LS); L.scale.set(((GC.BY[p[2]] || GC.BY.forester).light) * Z * 2 * LS / 128); L.alpha = p[10] ? .3 : 1; }
    for (let j = li; j < lightPool.length; j++) lightPool[j].visible = false;
    app.renderer.render(lightCont, { renderTexture: rt, clear: true });
  }
  lightSpr.visible = darkBase.visible;
  // fog + fireflies react to darkness
  const nk = d / .74, sailing = !!((S.p.find(p => p[0] === myId) || [])[20]);   // no night fog or fireflies while you are out on a boat
  fogs.forEach(s => { s.visible = nk > .05 && !sailing; s.alpha = .13 * nk; s.scale.set(Math.max(W, H) / 128 * s.sc * 1.2); s.position.set(W / 2 + Math.sin(T * s.sp + s.ph) * W * .35 - camX * .15 % 50, H / 2 + Math.cos(T * s.sp * .8 + s.ph) * H * .3); });
  { const hw = W / Z / 2, hh = H / Z / 2, nf = Math.min(FLY_MAX, Math.round(4 * hw * hh * FLY_DENS));
    flies.forEach((s, i) => { s.visible = nk > .1 && i < nf && !sailing; if (!s.visible) return; s.position.set(camX + s.fx * hw + Math.sin(T * .6 + s.ph) * 40, camY + s.fy * hh + Math.cos(T * .5 + s.ph) * 30);
      if (isWaterC(s.x, s.y)) { s.visible = false; return; }   // fireflies only over land, never out on the sea
      s.alpha = nk * (.4 + .6 * Math.abs(Math.sin(T * 1.7 + s.ph))); }); }
  const md = Math.hypot(me.x, me.y);
  // ocean sound: only when water is actually on screen. How far is the shore in the direction it lies, compared with how far the screen reaches that way?
  const sAng = Math.atan2(me.y, me.x), shoreDist = edge(sAng) - md, ux = Math.max(Math.abs(Math.cos(sAng)), 1e-3), uy = Math.max(Math.abs(Math.sin(sAng)), 1e-3);
  const reach = Math.min(W / Z / 2 / ux, H / Z / 2 / uy), shoreVis = clamp((reach - shoreDist) / (reach * .55), 0, 1);
  SFX.update({ night: d / .74, shore: shoreVis * shoreVis, fire: alive ? clamp(1 - md / 520, 0, 1) : 0, alive });
  hud(me);
});

// ---------- HUD (DOM) ----------
let slotSig = '', slotFullAt = 0, menuClosedAt = 0;
function useSlotAt(i) {   // tap a slot (or press 1-3): the boat starts placement, anything else (food, trap) is used
  const it = ((S && S.p.find(q => q[0] === myId)) || [])[19] || []; if (!it[i]) return;
  if (it[i] === 'boat') { startPlacingBoat(i); return; }
  if (ws && ws.readyState === 1) ws.send(JSON.stringify({ t: 'use', i }));
}
document.querySelectorAll('#slots .slot').forEach((el, i) => el.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); useSlotAt(i); }));
function hud() {
  const f = S.f, mp = S.p.find(p => p[0] === myId), PH = ['DAY', 'DUSK', 'NIGHT'][S.ph], left = Math.ceil(S.ph === 0 ? 90 - S.c : S.ph === 1 ? 120 - S.c : 180 - S.c);
  $('t1').textContent = 'Night ' + S.n + ' · ' + PH + ' ' + left + 's · 🔥 Lv' + f[2];
  $('bar').firstElementChild.style.width = (100 * f[0] / f[1]) + '%';
  if (mp) $('inv').textContent = '🪵' + mp[7] + '  🪨' + mp[8] + '  🍓' + mp[9] + (mp[15] ? '  🔩' + mp[15] : '') + (mp[21] ? '  🍖' + mp[21] : '') + '   ❤ ' + mp[5] + '/' + mp[6];
  if (mp) { const sl = mp[19] || [], sig = sl.join(','); if (sig !== slotSig) { slotSig = sig; document.querySelectorAll('#slots .slot').forEach((el, i) => { const f = RC.ITEM_BY[sl[i]]; el.textContent = f ? f.e : ''; el.classList.toggle('full', !!f); el.title = f ? f.n + ' - tap to use' : 'empty'; }); } }
  $('pl').textContent = S.p.length + ' player' + (S.p.length > 1 ? 's' : '');
  { const el = (performance.now() - buffAt) / 1000, bt = []; if (BUFF.speed - el > 0) bt.push('⚡' + Math.ceil(BUFF.speed - el) + 's'); if (BUFF.regen - el > 0) bt.push('💚' + Math.ceil(BUFF.regen - el) + 's'); if (BUFF.dmg - el > 0) bt.push('⚔' + Math.ceil(BUFF.dmg - el) + 's'); const bs = bt.join('  '); if ($('buffs').textContent !== bs) $('buffs').textContent = bs; }
  const now = performance.now(); let b = '';
  if (S.o) b = 'Everyone is down... heading back to the title screen';
  else if (now < warnUntil) b = '⚠ A CHARGER is hunting! It cannot be killed - stay inside the fire ring until dawn!';
  else if (mp && mp[10]) b = 'You are down - a teammate can revive you (they stand next to you and hold ACT for 10 s)';
  else if (now < noticeUntil) b = noticeText;
  else if (S.ph === 2 && f[0] <= 0) b = '⚠ The fire is out!';
  else if (now < tipUntil) b = 'Hold ACT by a tree (4 hits) or rock (3 hits), pick berries, then run over the logs, stones and berries. Push the stick past the ring to run (uses stamina). At the fire, ACT adds wood or upgrades it (stone). ATTACK: fight aliens.';
  const bn = $('banner'); if (bn.textContent !== b) { bn.textContent = b; bn.style.fontSize = b.length > 60 ? '15px' : '22px'; }
}

// ---------- accounts (Google or emailed code) / lobby ----------
const post = async (path, body) => { try { const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return await r.json(); } catch (e) { return { ok: false, err: 'Network problem. Check your connection.' }; } };
let token = '', myEmail = '', cfg = {}, runOver = false;
try { token = localStorage.getItem('tok') || ''; } catch (e) { }
const PF = { d: 0, owned: GC.DEFAULT_OWNED.slice() };
let sel = 'forester', hadCls = false; try { const sc = localStorage.getItem('cls'); if (sc) { sel = sc; hadCls = true; } } catch (e) { }
function chosen() {
  const c = GC.BY[sel] || GC.BY.forester, ic = $('cIcon');
  ic.textContent = '';
  if (PCAN[c.id]) { const cv = document.createElement('canvas'); cv.width = cv.height = 64; cv.getContext('2d').drawImage(PCAN[c.id], 0, 0); cv.style.cssText = 'width:36px;height:36px;display:block'; ic.appendChild(cv); }
  else ic.textContent = c.e;
  $('cName').textContent = c.n;
}
function setDia(n) { PF.d = n; document.querySelectorAll('.diaN').forEach(e => e.textContent = n); }
function applyProfile(pr, useLast) {
  PF.owned = pr.owned; setDia(pr.d);
  if (useLast || !PF.owned.includes(sel)) sel = PF.owned.includes(pr.last) ? pr.last : 'forester';
  try { localStorage.setItem('cls', sel); } catch (e) { }
  chosen(); buildPicker();
}
try { $('name').value = localStorage.getItem('nm') || ''; } catch (e) { }
const q = new URLSearchParams(location.search).get('room'); if (q) $('room').value = q;

// class picker
const TIERS = [[0, 'Unlocked'], [50, 'Tier 1 · 50 💎'], [120, 'Tier 2 · 120 💎'], [250, 'Tier 3 · 250 💎'], [400, 'Tier 4 · 400 💎']];
function buildPicker() {
  const box = $('grid'); box.innerHTML = '';
  for (const [price, title] of TIERS) {
    const h = document.createElement('div'); h.className = 'tier'; h.textContent = title; box.appendChild(h);
    const row = document.createElement('div'); row.className = 'row'; box.appendChild(row);
    for (const c of GC.LIST.filter(x => x.price === price)) {
      const owned = PF.owned.includes(c.id), d = document.createElement('div'); d.className = 'card' + (c.id === sel ? ' sel' : '') + (owned ? '' : ' locked');
      const cvs = document.createElement('canvas'); cvs.width = cvs.height = 64; cvs.getContext('2d').drawImage(PCAN[c.id], 0, 0); d.appendChild(cvs);
      const st = '❤' + c.hp + '  ⚔' + c.dmg + '  👟' + c.spd;
      d.insertAdjacentHTML('beforeend', '<div class="cn">' + c.e + ' ' + c.n + '</div><div class="cd">' + c.d + '</div><div class="cs">' + st + '</div><div class="cb">' + (c.id === sel ? '✔ Selected' : owned ? 'Tap to select' : '🔒 ' + c.price + ' 💎') + '</div>');
      d.onclick = () => owned ? pick(c.id) : askBuy(c.id);
      row.appendChild(d);
    }
  }
}
function pick(id) { sel = id; try { localStorage.setItem('cls', id); } catch (e) { } chosen(); buildPicker(); $('picker').style.display = 'none'; }
let buying = null;
function askBuy(id) {
  const c = GC.BY[id]; buying = id; const need = c.price - PF.d;
  $('buyTxt').innerHTML = '<b>' + c.e + ' ' + c.n + '</b><br>' + c.d + '<br><br>Price: ' + c.price + ' 💎<br>You have: ' + PF.d + ' 💎' + (need > 0 ? '<br><span style="color:#ff8a80">Need ' + need + ' more 💎 (earn them by surviving nights)</span>' : '');
  $('buyGo').style.display = need > 0 ? 'none' : ''; $('buy').style.display = 'flex';
}
$('buyNo').onclick = () => { $('buy').style.display = 'none'; };
$('buyGo').onclick = async () => {
  $('buyGo').disabled = true;
  try {
    const r = await post('/api/buy', { token, cls: buying });
    if (r.err === 'auth') { logoutUI('Please sign in again.'); return; }
    if (r.ok) { applyProfile(r.profile); SFX.init(); SFX.levelup(); pick(buying); }
    else if (r.profile) { applyProfile(r.profile); buildPicker(); if (r.err === 'need') { } }
    if (!r.ok) { $('buyTxt').insertAdjacentHTML('beforeend', '<br><span style="color:#ff8a80">' + (r.err === 'need' ? 'Not enough 💎' : 'Could not buy') + '</span>'); }
  } catch (e) { }
  $('buyGo').disabled = false; $('buy').style.display = 'none';
};
$('chooseBtn').onclick = () => { buildPicker(); $('picker').style.display = 'flex'; };
$('pickDone').onclick = () => { $('picker').style.display = 'none'; };


// ---- sign in ----
function showLogin(msg) { $('login').style.display = 'flex'; $('lmsg').textContent = msg || ''; $('stepEmail').style.display = ''; $('stepCode').style.display = 'none'; }
function logoutUI(msg) { token = ''; myEmail = ''; try { localStorage.removeItem('tok'); } catch (e) { } if (ws) { try { ws.close(); } catch (e) { } ws = null; } myId = 0; $('picker').style.display = 'none'; $('buy').style.display = 'none'; showLogin(msg); }
function loggedIn(r) {
  token = r.token || token; myEmail = r.email; try { localStorage.setItem('tok', token); localStorage.removeItem('pid'); } catch (e) { }
  $('who').textContent = myEmail; $('login').style.display = 'none'; applyProfile(r.profile, !hadCls); hadCls = true; $('err').textContent = '';
  try { const rr = JSON.parse(sessionStorage.getItem('runres') || 'null'); sessionStorage.removeItem('runres'); if (rr) $('runres').textContent = 'Last run: ' + rr.n + ' day' + (rr.n === 1 ? '' : 's') + ' survived  ·  +' + rr.d + ' 💎'; } catch (e) { }
  let rj = 0; try { rj = +sessionStorage.getItem('rejoin') || 0; sessionStorage.removeItem('rejoin'); } catch (e) { }
  if (rj && Date.now() - rj < 20 * 60 * 1000 && $('room').value) setTimeout(() => $('go').onclick(), 0);   // dropped mid-game: jump straight back into the same room
}
const legacyPid = () => { try { return localStorage.getItem('pid') || ''; } catch (e) { return ''; } };
let pendingEmail = '';
$('sendCode').onclick = async () => {
  const em = $('email').value.trim(); if (!em) { $('lmsg').textContent = 'Enter your email address.'; return; }
  $('sendCode').disabled = true; $('lmsg').textContent = 'Sending...';
  const r = await post('/api/auth/email/start', { email: em });
  $('sendCode').disabled = false;
  if (r.ok) { pendingEmail = em; $('lmsg').textContent = ''; $('sentTo').textContent = em; $('stepEmail').style.display = 'none'; $('stepCode').style.display = ''; $('code').value = ''; $('code').focus(); }
  else $('lmsg').textContent = r.err || 'Could not send the code.';
};
$('email').addEventListener('keydown', e => { if (e.key === 'Enter') $('sendCode').click(); });
$('verify').onclick = async () => {
  const c = $('code').value.replace(/\D/g, ''); if (c.length !== 6) { $('lmsg').textContent = 'Enter the 6-digit code from the email.'; return; }
  $('verify').disabled = true; $('lmsg').textContent = 'Checking...';
  const r = await post('/api/auth/email/verify', { email: pendingEmail, code: c, pid: legacyPid() });
  $('verify').disabled = false;
  if (r.ok) loggedIn(r); else $('lmsg').textContent = r.err || 'Could not sign in.';
};
$('code').addEventListener('keydown', e => { if (e.key === 'Enter') $('verify').click(); });
$('backEmail').onclick = () => { $('lmsg').textContent = ''; $('stepCode').style.display = 'none'; $('stepEmail').style.display = ''; };
$('signout').onclick = async () => { await post('/api/auth/logout', { token }); logoutUI(''); };
function initGoogle(clientId) {
  const sc = document.createElement('script'); sc.src = 'https://accounts.google.com/gsi/client'; sc.async = true;
  sc.onload = () => {
    google.accounts.id.initialize({ client_id: clientId, callback: async resp => {
      $('lmsg').textContent = 'Signing in...'; const r = await post('/api/auth/google', { credential: resp.credential, pid: legacyPid() });
      if (r.ok) loggedIn(r); else $('lmsg').textContent = r.err || 'Google sign-in failed.';
    }, auto_select: false });
    google.accounts.id.renderButton($('gbtn'), { theme: 'filled_blue', size: 'large', text: 'signin_with', shape: 'pill', width: 280 });
    $('gwrap').style.display = ''; $('orline').style.display = '';
  };
  sc.onerror = () => { $('gwrap').style.display = 'none'; };
  document.head.appendChild(sc);
}
function initApple(clientId) {
  const sc = document.createElement('script'); sc.async = true; sc.src = 'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js';
  sc.onload = () => {
    try { AppleID.auth.init({ clientId, scope: 'name email', redirectURI: location.origin + '/', usePopup: true }); } catch (e) { return; }
    $('awrap').style.display = ''; $('orline').style.display = '';
  };
  sc.onerror = () => { $('awrap').style.display = 'none'; };
  document.head.appendChild(sc);
  document.addEventListener('AppleIDSignInOnSuccess', async ev => {
    const cred = ev.detail && ev.detail.authorization && ev.detail.authorization.id_token; if (!cred) return;
    $('lmsg').textContent = 'Signing in...'; const r = await post('/api/auth/apple', { credential: cred, pid: legacyPid() });
    if (r.ok) loggedIn(r); else $('lmsg').textContent = r.err || 'Apple sign-in failed.';
  });
  document.addEventListener('AppleIDSignInOnFailure', ev => { const e = ev.detail && ev.detail.error; if (e && e !== 'popup_closed_by_user' && e !== 'user_cancelled_authorize') $('lmsg').textContent = 'Apple sign-in was cancelled or failed.'; });
}
(async function boot() {
  try { cfg = await (await fetch('/api/config', { cache: 'no-store' })).json(); } catch (e) { cfg = {}; }
  if (cfg.google) initGoogle(cfg.google);
  if (cfg.apple) initApple(cfg.apple);
  if (token) { const r = await post('/api/auth/session', { token }); if (r.ok) { loggedIn(r); return; } token = ''; try { localStorage.removeItem('tok'); } catch (e) { } }
  showLogin('');
})();

$('go').onclick = () => {
  if (!token) { showLogin('Please sign in to play.'); return; }
  SFX.init();
  const name = $('name').value.trim() || 'Survivor'; try { localStorage.setItem('nm', name); } catch (e) { }
  $('err').textContent = 'Connecting...';
  ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host);
  ws.onopen = () => ws.send(JSON.stringify({ t: 'join', name, cls: sel, room: $('room').value, token }));
  ws.onerror = () => $('err').textContent = 'Could not connect';
  ws.onclose = () => {
    if (!myId || runOver) return; $('banner').textContent = 'Connection lost - reconnecting...';
    try { sessionStorage.setItem('rejoin', String(Date.now())); } catch (e) { }
    const tryBack = async () => { try { const r = await fetch('/api/config', { cache: 'no-store' }); if (r.ok) { location.reload(); return; } } catch (e) { } setTimeout(tryBack, 2000); };
    setTimeout(tryBack, 1500);
  };
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.t === 'err') { if (m.m === 'auth') logoutUI('Your session expired. Please sign in again.'); else { $('err').textContent = m.m; ws.close(); ws = null; } }
    else if (m.t === 'init') {
      myId = m.id; RR = m.R; ISL = m.isl ? m.isl.slice(1) : []; roomCode = m.room; GEAR = m.gear || {}; buildWorld(m.res); if (m.prof) { PF.owned = m.prof.owned; setDia(m.prof.d); }
      $('lobby').style.display = 'none'; $('hud').style.display = 'block'; $('btns').style.display = 'block';
      $('rm').textContent = 'Room ' + roomCode + ' (tap to copy link)'; tipUntil = performance.now() + 14000; history.replaceState(null, '', '?room=' + roomCode);
    } else if (m.t === 'crafted') {
      GEAR = m.gear || GEAR; const msg = $('craftMsg'); msg.textContent = m.msg || ''; msg.style.color = m.ok ? '#7fe9a0' : '#ff8a80';
      if (placingId && m.id === placingId) { if (m.ok) { const r = RC.BY[placingId], pl = pooled(); if ((r.kind !== 'wall' && r.kind !== 'trap') || pl.wood < r.cost.wood || pl.stone < r.cost.stone || pl.scrap < (r.cost.scrap || 0)) stopPlacing(); } else { const me0 = ents2['p' + myId]; if (me0) floatText(me0.x, me0.y - 6, m.msg || 'Cannot place here', 0xff8a80); } }
      if (m.ok) { SFX.levelup(); const me = ents2['p' + myId]; if (me) floatText(me.x, me.y - 10, m.msg, 0xffe082); }
      if (craftOpen) buildCraft();
    } else if (m.t === 'toast') {
      const me = ents2['p' + myId]; if (me) floatText(me.x, me.y - 6, m.msg, 0xff8a80); SFX.pickup();
    } else if (m.t === 'open') {
      if (performance.now() - menuClosedAt < 700) return;   // you just closed it with E / Space: the server's reply to that same key press must not pop it open again
      SFX.init(); if (m.what === 'chest') { SFX.chest(); openChest(m.id); } else if (m.what === 'bench') { if (!craftOpen) { SFX.chest(); closeChest(); closePot(); closeSmelt(); setCraft(true); } } else if (m.what === 'smelter') { SFX.chest(); openSmelt(m.id); } else { SFX.chest(); openPot(); }
    } else if (m.t === 'smelted') {
      const msg = $('smeltMsg'); msg.textContent = m.msg || ''; msg.style.color = m.ok ? '#7fe9a0' : '#ff8a80'; if (m.ok) SFX.pickup();
    } else if (m.t === 'cooked') {
      const msg = $('potMsg'); msg.textContent = m.msg || ''; msg.style.color = m.ok ? '#7fe9a0' : '#ff8a80';
      if (m.b) { for (const k in BUFF) BUFF[k] = m.b[k] || 0; buffAt = performance.now(); }
      if (m.ok) { SFX.cook(); const me = ents2['p' + myId]; if (me) floatText(me.x, me.y - 10, m.msg, 0xffe082); }
    } else if (m.t === 'raid') {
      notice('Villagers are raiding the camp!'); SFX.horn();
    } else if (m.t === 'trapped') {
      notice('The big monster is trapped for 20 seconds!');
    } else if (m.t === 'boatPlaced') {
      if (m.ok) { stopPlacing(); actBlock = true; SFX.levelup(); const me = ents2['p' + myId]; if (me) floatText(me.x, me.y - 14, m.msg, 0xffe082); }
      else { const pm = $('placeMsg'); pm.textContent = m.msg || 'Could not place it there.'; pm.style.color = '#ff8a80'; }
    } else if (m.t === 'dism') {
      const me = ents2['p' + myId]; if (me) floatText(me.x, me.y - 12, m.msg, m.ok ? 0xffe082 : 0xff8a80);
      if (m.ok) { SFX.levelup(); closeChest(); closePot(); closeSmelt(); setCraft(false); }
    } else if (m.t === 'trapSet') {
      const me = ents2['p' + myId]; if (me) floatText(me.x, me.y - 10, 'Trap set!', 0xffe082);   // (the trap appearing already plays the build sound)
    } else if (m.t === 'ate') {
      if (m.b) { for (const k in BUFF) BUFF[k] = m.b[k] || 0; buffAt = performance.now(); }
      SFX.cook(); const me = ents2['p' + myId]; if (me) floatText(me.x, me.y - 10, m.msg, 0xffe082);
    } else if (m.t === 'over') {   // everyone went down: remember the result, then back to the title screen
      runOver = true; setDia(m.total); try { sessionStorage.setItem('runres', JSON.stringify({ n: m.n, d: m.d })); sessionStorage.removeItem('rejoin'); } catch (e) { }
      $('banner').style.fontSize = '22px'; $('banner').textContent = 'Game over - you survived ' + m.n + ' day' + (m.n === 1 ? '' : 's') + ' and earned ' + m.d + ' 💎';
      setTimeout(() => { try { ws.close(); } catch (e) { } location.reload(); }, 3500);
    } else if (m.t === 'dia') {
      setDia(m.d); const me = ents2['p' + myId];
      if (me) floatText(me.x, me.y - 24, '+' + m.n + ' 💎' + (m.why === 'milestone' ? ' milestone!' : ''), 0x7fe9ff);
      SFX.coin();
    } else if (m.t === 's') onSnap(m);
  };
};
$('rm').onclick = () => { const u = location.origin + '/?room=' + roomCode; try { navigator.clipboard.writeText(u); $('rm').textContent = 'Link copied!'; } catch (e) { prompt('Share this link', u); } };

const snd = $('snd'); const sndIcon = () => snd.style.backgroundImage = SFX.isMuted() ? 'url(ui/mute.webp)' : 'url(ui/sound.webp)'; sndIcon();
snd.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); SFX.init(); SFX.setMuted(!SFX.isMuted()); sndIcon(); });
addEventListener('pointerdown', () => SFX.resume());
// ---------- input ----------
let joy = null, act = 0, hit = 0; const keys = {};
const jb = $('jbase'), jk = $('jknob');
app.view.addEventListener('pointerdown', e => { if (joy || e.clientX > innerWidth * .6) return; joy = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY }; app.view.setPointerCapture(e.pointerId); jb.style.display = jk.style.display = 'block'; jpos(); });
app.view.addEventListener('pointermove', e => { if (joy && joy.id === e.pointerId) { joy.x = e.clientX; joy.y = e.clientY; jpos(); } });
const jend = e => { if (joy && joy.id === e.pointerId) { joy = null; jb.style.display = jk.style.display = 'none'; } };
app.view.addEventListener('pointerup', jend); app.view.addEventListener('pointercancel', jend);
function jpos() { const dx = joy.x - joy.ox, dy = joy.y - joy.oy, m = Math.min(100, Math.hypot(dx, dy)), a = Math.atan2(dy, dx); jk.style.background = m > 63 ? '#ffb74dd0' : ''; jb.style.left = joy.ox + 'px'; jb.style.top = joy.oy + 'px'; jk.style.left = (joy.ox + Math.cos(a) * m) + 'px'; jk.style.top = (joy.oy + Math.sin(a) * m) + 'px'; }
function bind(id, set) { const b = $(id); b.addEventListener('pointerdown', e => { e.preventDefault(); set(1); b.setPointerCapture(e.pointerId); b.style.transform = 'scale(.92)'; }); ['pointerup', 'pointercancel'].forEach(t => b.addEventListener(t, () => { set(0); b.style.transform = ''; })); }
bind('act', v => { act = v; if (v) actPress(); }); bind('hit', v => hit = v);
addEventListener('keydown', e => { const k = e.key.toLowerCase(); if (placingId && k === 'r') rotatePlace(); if (!keys[k] && (k === ' ' || k === 'e') && !/INPUT|TEXTAREA/.test((e.target || {}).tagName || '')) {
    if (craftOpen || chestId !== null || potOpen || smeltId !== null) { setCraft(false); closeChest(); closePot(); closeSmelt(); menuClosedAt = performance.now(); }   // E / Space closes whatever menu is open
    else actPress();
  }
  if (!keys[k] && (k === '1' || k === '2' || k === '3') && $('btns').style.display !== 'none' && !/INPUT|TEXTAREA/.test((e.target || {}).tagName || '')) useSlotAt(+k - 1);   // 1-3 use the item in that slot (only in game, not while typing)
  if (k === 'escape') { if (craftOpen || chestId !== null || potOpen || smeltId !== null) { setCraft(false); closeChest(); closePot(); closeSmelt(); menuClosedAt = performance.now(); } else if (placingId) stopPlacing(); }   // Escape closes menus / cancels placing
  keys[k] = 1; }); addEventListener('keyup', e => { keys[e.key.toLowerCase()] = 0; });
// never let a lost touch/key leave the character walking: drop all held input whenever the page loses focus or no finger is down
function clearInput() { joy = null; jb.style.display = jk.style.display = 'none'; act = hit = 0; for (const k in keys) keys[k] = 0; ['act', 'hit'].forEach(i => { $(i).style.transform = ''; }); }
addEventListener('blur', clearInput); document.addEventListener('visibilitychange', () => { if (document.hidden) clearInput(); }); addEventListener('pagehide', clearInput);
app.view.addEventListener('lostpointercapture', jend);
addEventListener('touchend', e => { if (!e.touches.length) clearInput(); }, { passive: true }); addEventListener('touchcancel', clearInput, { passive: true });
app.view.addEventListener('touchstart', e => { if (e.touches.length >= 2) { joy = null; jb.style.display = jk.style.display = 'none'; } }, { passive: true });
app.view.addEventListener('contextmenu', e => e.preventDefault());
let actBlock = false;   // set after placing something so a still-held ACT doesn't instantly act again (e.g. hop into the boat you just put down)
function readInput() {
  let dx = 0, dy = 0;
  let rn = 0; if (actBlock && !(act || keys[' '] || keys.e)) actBlock = false;
  if (joy) { dx = (joy.x - joy.ox) / 55; dy = (joy.y - joy.oy) / 55; const m = Math.hypot(dx, dy); if (m > 1) { dx /= m; dy /= m; } if (m < .12) dx = dy = 0; else if (m > 1.15) rn = Math.min(1, (m - 1.15) / .75); }   // past the ring = run, faster the further you push
  if (keys.a || keys.arrowleft) dx -= 1; if (keys.d || keys.arrowright) dx += 1; if (keys.w || keys.arrowup) dy -= 1; if (keys.s || keys.arrowdown) dy += 1;
  if (keys.shift && (dx || dy)) rn = 1;
  return { dx, dy, rn: Math.round(rn * 100) / 100, act: !placingId && !actBlock && (act || keys[' '] || keys.e) ? 1 : 0, hit: hit || keys.q || keys.f || keys.j ? 1 : 0 };
}
setInterval(() => { if (ws && ws.readyState === 1 && myId) ws.send(JSON.stringify(Object.assign({ t: 'in' }, readInput()))); }, 50);
