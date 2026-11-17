'use strict';
// The map: a 🗺️ button (or M) opens a chart of the archipelago. Home and the home-facing start of each outer island are known;
// everything else is fogged until you (or your boat) travel near it. What you have explored is remembered per room code.
let mapRoom = '', mapCells = new Set(), mapDirty = false, mapOpen = false, mapAll = { ext: 1, isl: [] };
const MCELL = 250;
const mkey = (cx, cy) => (cx + 400) * 1000 + (cy + 400);

function mapInit(m) {
  mapRoom = m.room; mapCells = new Set();
  try { const s = JSON.parse(localStorage.getItem('map_' + mapRoom) || '[]'); for (const k of s) mapCells.add(k); } catch (e) { }
  const isl = [[0, 0, m.R, 'f']].concat((m.isl || []).slice(1));
  let ext = 1; for (const [x, y, r, , ss] of isl) { const rr = r * (ss ? RC.SHAPE_MAX : 1); ext = Math.max(ext, Math.abs(x) + rr, Math.abs(y) + rr); }
  mapAll = { ext: ext * 1.06, isl };
  if (!$('mapBtn')) {
    const b = document.createElement('button'); b.id = 'mapBtn'; b.className = 'zb'; b.textContent = '🗺️'; b.setAttribute('aria-label', 'Map');
    b.style.cssText = 'bottom:max(152px,calc(env(safe-area-inset-bottom) + 142px));font-size:18px'; $('btns').appendChild(b);
    b.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); toggleMap(); });
    const d = document.createElement('div'); d.id = 'mapView'; d.className = 'ov'; d.style.cssText = 'display:none;align-items:center;justify-content:center;z-index:55;background:#030a14ee';
    d.innerHTML = '<div style="position:relative"><canvas id="mapCv" style="border:2px solid #ffd000;border-radius:12px;background:#0b1623;display:block"></canvas><button class="mini gray" id="mapClose" style="position:absolute;right:8px;top:8px">Close</button><div id="mapLeg" style="position:absolute;left:10px;bottom:8px;font-size:12px;font-weight:700;text-shadow:0 1px 3px #000;opacity:.9">🔥 camp  ⛵ boat  🐺🎣⚒️⚓🔮 traders  · fog clears as you explore</div></div>';
    document.body.appendChild(d); d.querySelector('#mapClose').onclick = () => toggleMap(false);
    d.addEventListener('pointerdown', e => { if (e.target === d) toggleMap(false); });
  }
}
function toggleMap(on) { const v = $('mapView'); if (!v) return; mapOpen = on === undefined ? !mapOpen : on; v.style.display = mapOpen ? 'flex' : 'none'; if (mapOpen) drawMap(); }

// remember where we have been (and where boats took us)
setInterval(() => {
  if (typeof S === 'undefined' || !S || !myId) return; const me = ents2['p' + myId]; if (!me) return;
  const cx = Math.round(me.x / MCELL), cy = Math.round(me.y / MCELL);
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) { const k = mkey(cx + dx, cy + dy); if (!mapCells.has(k)) { mapCells.add(k); mapDirty = true; } }
}, 600);
setInterval(() => { if (mapDirty && mapRoom) { mapDirty = false; try { localStorage.setItem('map_' + mapRoom, JSON.stringify([...mapCells])); } catch (e) { } } if (mapOpen) drawMap(); }, 2500);

function drawMap() {
  const cv = $('mapCv'); if (!cv || typeof S === 'undefined' || !S) return;
  const size = Math.floor(Math.min(innerWidth * .94, innerHeight * .9)); if (cv.width !== size) { cv.width = cv.height = size; }
  const g = cv.getContext('2d'), s = size / 2 / mapAll.ext, X = x => size / 2 + x * s, Y = y => size / 2 + y * s;
  // layer: the whole world drawn in colour
  const L = document.createElement('canvas'); L.width = L.height = size; const lg = L.getContext('2d');
  lg.fillStyle = '#1b5f86'; lg.fillRect(0, 0, size, size);
  let curSS = 0; const wob = (a, r, sd) => edgeJ(a, r, sd, curSS);
  const path = (ctx, ix, iy, r, sd) => { ctx.beginPath(); for (let i = 0; i <= 120; i++) { const a = i / 120 * TAU, rr = wob(a, r, sd); const x = X(ix + Math.cos(a) * rr), y = Y(iy + Math.sin(a) * rr); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.closePath(); };
  mapAll.isl.forEach(([ix, iy, r, b, ss], idx) => {
    curSS = ss || 0; const sd = idx === 0 ? 0 : (ss || idx * 1.7);
    lg.save(); path(lg, ix, iy, r + 40, sd); lg.fillStyle = '#c9b77a'; lg.fill(); lg.restore();   // beach ring
    lg.save(); path(lg, ix, iy, r - 20, sd); lg.clip();
    const [ux, uy] = RC.homeDir(ix, iy), vx = -uy, vy = ux;
    const half = (ctx, col, tFrom, wSign) => { ctx.fillStyle = col; ctx.beginPath(); const B = r * 3, t0 = tFrom * r; const pts = [[t0, -B], [B, -B], [B, B], [t0, B]]; pts.forEach(([t, w], i) => { const x = X(ix + ux * t + vx * w), y = Y(iy + uy * t + vy * w); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.closePath(); ctx.fill(); };
    if (idx === 0) {   // home: forest with the snow wedge in the north
      lg.fillStyle = '#3f8040'; lg.fillRect(0, 0, size, size);
      lg.fillStyle = '#eef4fa'; lg.beginPath(); const a0 = RC.SNOW_A; let first = true;
      for (let i = 0; i <= 40; i++) { const a = a0 - Math.PI / 4 + i / 40 * Math.PI / 2, rr = r; const x = X(Math.cos(a) * rr), y = Y(Math.sin(a) * rr); first ? lg.moveTo(x, y) : lg.lineTo(x, y); first = false; }
      for (let i = 40; i >= 0; i--) { const a = a0 - Math.PI / 4 + i / 40 * Math.PI / 2, rr = RC.snowIn(a); lg.lineTo(X(Math.cos(a) * rr), Y(Math.sin(a) * rr)); }
      lg.closePath(); lg.fill();
    } else {
      const own = b === 's' ? '#eef4fa' : b === 'l' ? '#4a2a2e' : '#dcb26e'; lg.fillStyle = own; lg.fillRect(0, 0, size, size);
      if (b === 'm') { lg.fillStyle = '#eef4fa'; lg.beginPath(); const B = r * 3; [[-B, -B], [B, -B], [B, 0], [-B, 0]].forEach(([t, w], i) => { const x = X(ix + ux * t + vx * w), y = Y(iy + uy * t + vy * w); i ? lg.lineTo(x, y) : lg.moveTo(x, y); }); lg.closePath(); lg.fill(); }   // the snow half
      half(lg, '#3f8040', RC.FOREST_CUT);   // the forest quarter facing home
    }
    lg.restore();
  });
  // mask: what the player may see
  const M = document.createElement('canvas'); M.width = M.height = size; const mg = M.getContext('2d'); mg.fillStyle = '#fff';
  mg.beginPath(); mg.arc(X(0), Y(0), (RR + 160) * s, 0, TAU); mg.fill();   // the whole home island
  for (const [ix, iy, r] of mapAll.isl.slice(1)) { const [ux, uy] = RC.homeDir(ix, iy); mg.beginPath(); mg.arc(X(ix + ux * r * .85), Y(iy + uy * r * .85), r * .42 * s, 0, TAU); mg.fill(); }   // the start of each outer island
  const rr = MCELL * 1.9 * s; for (const k of mapCells) { const cx = Math.floor(k / 1000) - 400, cy = (k % 1000) - 400; mg.beginPath(); mg.arc(X(cx * MCELL), Y(cy * MCELL), Math.max(2, rr), 0, TAU); mg.fill(); }
  lg.globalCompositeOperation = 'destination-in'; lg.drawImage(M, 0, 0);
  // fog + revealed map
  g.fillStyle = '#0d1a28'; g.fillRect(0, 0, size, size);
  g.fillStyle = '#12263a'; for (let i = 0; i < 260; i++) { const a = (i * 97) % size, b = (i * 211 + 40) % size; g.globalAlpha = .35; g.beginPath(); g.arc(a, b, 18 + (i % 7) * 6, 0, TAU); g.fill(); } g.globalAlpha = 1;   // cloud puffs
  g.drawImage(L, 0, 0);
  // markers
  const revealed = (x, y) => { const k = mkey(Math.round(x / MCELL), Math.round(y / MCELL)); return Math.hypot(x, y) < RR + 160 || mapCells.has(k); };
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '16px system-ui,sans-serif';
  g.fillText('🔥', X(0), Y(0));
  for (const c of S.cf || []) g.fillText('🔥', X(c[1]), Y(c[2]));
  for (const l of (typeof LOOT !== 'undefined' ? LOOT : [])) if (l.trader && revealed(l.tx, l.ty)) {   // a discovered trader stays on the map, each kind with its own icon
    const T = RC.TRADERS[l.trader]; g.beginPath(); g.arc(X(l.tx), Y(l.ty), 11, 0, TAU); g.fillStyle = '#14304acc'; g.fill(); g.lineWidth = 2; g.strokeStyle = '#ffd000'; g.stroke(); g.font = '14px system-ui,sans-serif'; g.fillStyle = '#fff'; g.fillText(T.e, X(l.tx), Y(l.ty) + 1); g.font = '16px system-ui,sans-serif';
  }
  for (const b of S.bt || []) g.fillText('⛵', X(b[1]), Y(b[2]));
  for (const p of S.p) { const me = p[0] === myId, e = ents2['p' + p[0]], x = e ? e.x : p[3], y = e ? e.y : p[4]; g.beginPath(); g.arc(X(x), Y(y), me ? 7 : 5, 0, TAU); g.fillStyle = me ? '#ffeb3b' : '#4fc3f7'; g.fill(); g.lineWidth = 2; g.strokeStyle = '#000'; g.stroke(); if (!me) { g.font = '11px system-ui,sans-serif'; g.fillStyle = '#fff'; g.fillText((p[1] || '').slice(0, 9), X(x), Y(y) - 12); g.font = '16px system-ui,sans-serif'; } }
}
addEventListener('keydown', e => { if (e.key.toLowerCase() === 'm' && !/INPUT|TEXTAREA/.test((e.target || {}).tagName || '') && $('btns') && $('btns').style.display !== 'none') toggleMap(); else if (e.key === 'Escape' && mapOpen) toggleMap(false); });
