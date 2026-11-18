'use strict';
// Outer-island extras: loot areas (decorations, chests, traders), placeable campfires, bullets/zones/turrets, the trader menu,
// the hidden-ability button and the dynamic item slots. Loaded after game.js, which calls the x* hooks below.

// ---------- textures ----------
const T_MUSH = tex(46, 36, g => { [[12, 26, 8], [28, 22, 10], [20, 30, 6]].forEach(m => { g.fillStyle = '#eadfc8'; g.fillRect(m[0] - 2, m[1] - 4, 4, 9); g.fillStyle = '#d33f3a'; ell(g, m[0], m[1] - 5, m[2], m[2] * .7); g.fillStyle = '#fff'; circ(g, m[0] - 2, m[1] - 7, 1.6); circ(g, m[0] + 3, m[1] - 5, 1.3); }); });
const T_LOGF = tex(62, 30, g => { g.fillStyle = '#5a3a1e'; g.beginPath(); g.roundRect ? g.roundRect(4, 8, 52, 16, 7) : g.rect(4, 8, 52, 16); g.fill(); g.fillStyle = '#7b5230'; g.fillRect(8, 9, 44, 4); g.fillStyle = '#4f8a3c'; ell(g, 22, 10, 10, 3); ell(g, 42, 11, 8, 3); g.fillStyle = '#d9b676'; ell(g, 55, 16, 4, 7); });
const T_CAIRN = tex(40, 44, g => { [[20, 36, 15, 8], [20, 26, 11, 7], [20, 17, 7, 6], [20, 10, 4, 4]].forEach((r, i) => { g.fillStyle = ['#8b9096', '#a2a8ae', '#b6bcc2', '#c9ced3'][i]; ell(g, r[0], r[1], r[2], r[3]); g.strokeStyle = 'rgba(0,0,0,.3)'; g.lineWidth = 1; g.beginPath(); g.ellipse(r[0], r[1], r[2], r[3], 0, 0, TAU); g.stroke(); }); });
const T_BONES = tex(64, 42, g => { g.strokeStyle = '#efe6cf'; g.lineWidth = 4; g.lineCap = 'round'; g.beginPath(); g.moveTo(10, 36); g.lineTo(54, 36); g.stroke(); for (let i = 0; i < 5; i++) { g.beginPath(); g.ellipse(32, 22, 10 + i * 3, 4 + i * 4, 0, Math.PI, 0); g.stroke(); } });
const T_SKULL = tex(34, 34, g => { g.fillStyle = '#efe6cf'; ell(g, 17, 14, 12, 11); g.fillRect(10, 20, 14, 9); g.fillStyle = '#2b2118'; circ(g, 12, 14, 3.4); circ(g, 22, 14, 3.4); g.fillRect(15, 21, 1.5, 6); g.fillRect(19, 21, 1.5, 6); });
const T_PILLAR = tex(48, 78, g => { g.fillStyle = 'rgba(0,0,0,.18)'; ell(g, 24, 72, 20, 6); g.fillStyle = '#cdb98a'; g.fillRect(10, 20, 28, 52); g.fillStyle = '#b6a173'; g.fillRect(28, 20, 10, 52); g.fillStyle = '#dccb9c'; g.beginPath(); g.moveTo(8, 20); g.lineTo(14, 8); g.lineTo(22, 14); g.lineTo(30, 4); g.lineTo(40, 20); g.closePath(); g.fill(); g.fillStyle = '#a8946a'; g.fillRect(6, 68, 36, 8); });
const T_DRYB = tex(46, 38, g => { g.strokeStyle = '#a07a3c'; g.lineWidth = 2; for (let i = 0; i < 14; i++) { const a = i / 14 * TAU; g.beginPath(); g.moveTo(23, 22); g.quadraticCurveTo(23 + Math.cos(a) * 12, 22 + Math.sin(a) * 4, 23 + Math.cos(a + .6) * 19, 22 + Math.sin(a + .6) * 14); g.stroke(); } });
const T_ICE = tex(48, 56, g => { [[14, 50, 9, 34], [26, 52, 11, 46], [37, 50, 8, 28]].forEach(c => { g.fillStyle = '#bfe6ff'; g.beginPath(); g.moveTo(c[0] - c[2] / 2, c[1]); g.lineTo(c[0], c[1] - c[3]); g.lineTo(c[0] + c[2] / 2, c[1]); g.closePath(); g.fill(); g.fillStyle = 'rgba(255,255,255,.6)'; g.beginPath(); g.moveTo(c[0] - 1, c[1]); g.lineTo(c[0], c[1] - c[3]); g.lineTo(c[0] + c[2] / 4, c[1]); g.closePath(); g.fill(); }); });
const T_STUMP = tex(46, 40, g => { g.fillStyle = '#6b4a2c'; g.fillRect(10, 14, 26, 22); g.fillStyle = '#8a6540'; ell(g, 23, 14, 13, 5); g.fillStyle = '#f2f7fb'; ell(g, 23, 11, 14, 5); ell(g, 14, 15, 5, 3); g.fillStyle = '#d9a441'; g.fillRect(31, 22, 3, 12); });
const T_SNOWM = tex(60, 36, g => { g.fillStyle = '#eef4fa'; ell(g, 30, 26, 26, 11); ell(g, 22, 20, 14, 10); ell(g, 38, 22, 12, 8); g.fillStyle = '#cfe0ee'; ell(g, 30, 30, 22, 5); });
const DECOR = { f: [T_MUSH, T_MUSH, T_LOGF, T_CAIRN, T_FLOWER], d: [T_BONES, T_SKULL, T_PILLAR, T_DRYB, T_DRYB], s: [T_ICE, T_ICE, T_STUMP, T_SNOWM, T_CAIRN], l: [T_CAIRN, T_SKULL, T_BONES, T_CAIRN, T_STUMP] };
const chestTex = (tier, open) => tex(60, 50, g => {
  const body = ['', '#8a5a2b', '#9aa3ad', '#e0b020'][tier], lid = ['', '#a8733a', '#c3cad2', '#f5cf4a'][tier], band = ['', '#4a2f14', '#5a626b', '#a67c00'][tier];
  g.fillStyle = 'rgba(0,0,0,.2)'; ell(g, 30, 44, 26, 6);
  g.fillStyle = body; g.fillRect(8, 22, 44, 22); g.fillStyle = band; g.fillRect(8, 22, 44, 3); g.fillRect(8, 40, 44, 3); g.fillRect(27, 22, 6, 22);
  if (open) { g.fillStyle = '#1c130a'; g.fillRect(10, 18, 40, 6); g.fillStyle = lid; g.save(); g.translate(8, 18); g.rotate(-.9); g.fillRect(0, -14, 44, 14); g.restore(); g.fillStyle = '#ffe9a0'; circ(g, 30, 20, 3); }
  else { g.fillStyle = lid; g.beginPath(); g.moveTo(8, 22); g.quadraticCurveTo(30, 0, 52, 22); g.closePath(); g.fill(); g.fillStyle = band; g.fillRect(27, 10, 6, 12); g.fillStyle = '#ffe27a'; circ(g, 30, 24, 3.4); }
});
const T_LCHEST = [null, [chestTex(1, 0), chestTex(1, 1)], [chestTex(2, 0), chestTex(2, 1)], [chestTex(3, 0), chestTex(3, 1)]];
const T_BULLET = tex(26, 8, g => { const gr = g.createLinearGradient(0, 0, 26, 0); gr.addColorStop(0, 'rgba(255,200,80,0)'); gr.addColorStop(1, 'rgba(255,240,170,1)'); g.fillStyle = gr; g.fillRect(0, 2, 26, 4); g.fillStyle = '#fff'; circ(g, 23, 4, 3); });
const T_TURRET = tex(44, 56, g => { g.fillStyle = 'rgba(0,0,0,.2)'; ell(g, 22, 50, 18, 5); g.fillStyle = '#5b6068'; g.fillRect(10, 30, 24, 18); g.fillStyle = '#7d848d'; g.fillRect(12, 32, 8, 14); g.fillStyle = '#ffb74d'; circ(g, 22, 24, 11); g.fillStyle = '#3b3f45'; g.fillRect(20, 6, 6, 22); g.fillStyle = '#d32f2f'; circ(g, 22, 24, 3.5); });
const TRADER_LOOK = { 1: ['#9e9e9e', '#616161', '#3e2723', null, 'pack'], 2: ['#29b6f6', '#0277bd', '#6d4c41', null, 'basket'], 3: ['#8d6e63', '#4e342e', '#212121', 'wrench'], 4: ['#1e88e5', '#0d47a1', '#eeeeee', 'staff'], 5: ['#7e57c2', '#4527a0', '#e0e0e0', 'staff'] };
const T_TRADER = {}; for (const k in TRADER_LOOK) T_TRADER[k] = PIXI.Texture.from(mkPlayerCanvas(TRADER_LOOK[k]));

// ---------- state ----------
let LOOT = [], cullList = [], lootE = {}, campE = {}, bulletE = {}, zoneE = {}, turretE = {};
const BSPEED = { 1: 700, 2: 800, 3: 1000 };
const COSTI = { wood: '🪵', stone: '🪨', food: '🍓', scrap: '🔩', pelt: '🐺', apelt: '🐾', meat: '🍖', gold: '🪙' }, COSTX = { wood: 7, stone: 8, food: 9, scrap: 15, meat: 21, gold: 22, pelt: 23, apelt: 26 };

// ---------- loot areas ----------
// ---- desert villages: a few tipis around a campfire that is only for show (no glow, keeps nothing away) ----
const T_TIPI = tex(120, 136, g => {
  g.fillStyle = 'rgba(0,0,0,.22)'; g.beginPath(); g.ellipse(60, 122, 52, 11, 0, 0, TAU); g.fill();
  g.strokeStyle = '#5a3a1c'; g.lineWidth = 4; g.beginPath(); g.moveTo(52, 10); g.lineTo(46, -2); g.moveTo(68, 10); g.lineTo(74, -2); g.stroke();   // the poles poking out of the top
  g.fillStyle = '#e8d4a6'; g.beginPath(); g.moveTo(60, 8); g.lineTo(112, 122); g.lineTo(8, 122); g.closePath(); g.fill(); g.strokeStyle = 'rgba(0,0,0,.5)'; g.lineWidth = 2; g.stroke();
  g.fillStyle = '#d3b97d'; g.beginPath(); g.moveTo(60, 8); g.lineTo(112, 122); g.lineTo(76, 122); g.closePath(); g.fill();   // the shaded side
  g.fillStyle = '#b3402a'; for (let i = 0; i < 3; i++) { const y = 46 + i * 20, w = 12 + i * 11; g.fillRect(60 - w, y, w * 2, 5); }   // painted bands
  g.fillStyle = '#3a2412'; g.beginPath(); g.moveTo(60, 70); g.lineTo(76, 122); g.lineTo(44, 122); g.closePath(); g.fill();   // the door flap
});
const T_VFIRE = tex(90, 60, g => {
  g.fillStyle = 'rgba(0,0,0,.2)'; g.beginPath(); g.ellipse(45, 42, 36, 12, 0, 0, TAU); g.fill();
  for (let i = 0; i < 9; i++) { const a = i / 9 * TAU, x = 45 + Math.cos(a) * 28, y = 38 + Math.sin(a) * 11; g.fillStyle = '#8a8d92'; g.beginPath(); g.ellipse(x, y, 7, 5, 0, 0, TAU); g.fill(); g.strokeStyle = 'rgba(0,0,0,.4)'; g.stroke(); }
  g.strokeStyle = '#4b2f17'; g.lineWidth = 6; g.lineCap = 'round'; g.beginPath(); g.moveTo(30, 40); g.lineTo(60, 34); g.moveTo(32, 33); g.lineTo(58, 42); g.stroke();   // two logs
});
// ---- lava pools (burn anyone standing in them) ----
let LAVAP = [];
function xLava(m) {
  LAVAP = (m.lv || []).map(([x, y, r]) => ({ x, y, r, ph: rnd(0, TAU) }));
  for (const L of LAVAP) {
    const g = new PIXI.Graphics(), rr = L.r, pts = k => { const o = []; for (let i = 0; i < 24; i++) { const a = i / 24 * TAU, w = 1 + .1 * Math.sin(a * 3 + L.x) + .07 * Math.sin(a * 5 + L.y); o.push(Math.cos(a) * rr * k * w, Math.sin(a) * rr * k * w * .8); } return o; };
    g.beginFill(0x120a0c, .9); g.drawPolygon(pts(1.14)); g.endFill(); g.beginFill(0x8a2a0c); g.drawPolygon(pts(1)); g.endFill(); g.beginFill(0xe8561a); g.drawPolygon(pts(.8)); g.endFill(); g.beginFill(0xffa23a, .9); g.drawPolygon(pts(.5)); g.endFill(); g.beginFill(0xffe08a, .7); g.drawPolygon(pts(.22)); g.endFill();
    g.position.set(L.x, L.y); ground.addChild(g); L.g = g;
    const gl = new PIXI.Sprite(T_GLOW); gl.anchor.set(.5); gl.tint = 0xff6a1a; gl.blendMode = BM.ADD; gl.position.set(L.x, L.y); gl.scale.set(rr / 60 * 1.8); overL.addChild(gl); L.gl = gl;   // lava glows even at night
  }
}
let VILL = [];
function xVillages(m) {
  VILL = (m.vg || []).map(v => ({ id: v[0], x: v[1], y: v[2], seed: v[3], flames: [] }));
  for (const v of VILL) {
    const rng = mulberry(v.seed), c = new PIXI.Container(); c.position.set(v.x, v.y); c.zIndex = v.y;
    const pad = new PIXI.Graphics(); pad.beginFill(0x8a6a34, .25); pad.drawEllipse(v.x, v.y + 8, 190, 120); pad.endFill(); ground.addChild(pad);
    const n = 3, a0 = rng() * TAU;
    for (let i = 0; i < n; i++) {   // tipis in a ring around the fire (each is its own sprite so it sorts by depth)
      const a = a0 + i * TAU / n + (rng() - .5) * .4, d = 110 + rng() * 25, s = new PIXI.Sprite(T_TIPI); s.anchor.set(.5, .92); s.scale.set(.85 + rng() * .25); s.position.set(v.x + Math.cos(a) * d, v.y + Math.sin(a) * d * .8); s.zIndex = s.y; cullList.push({ c: s, x: s.x, y: s.y });
    }
    const ring = new PIXI.Sprite(T_VFIRE); ring.anchor.set(.5, .6); c.addChild(ring);
    for (let i = 0; i < 2; i++) { const f = new PIXI.Sprite(T_FLAME); f.anchor.set(.5, .9); f.scale.set(.42 - i * .1); f.y = 2; c.addChild(f); v.flames.push(f); }   // normal blending, no glow sprite: just a picture of a fire
    v.c = c; cullList.push({ c, x: v.x, y: v.y });
  }
}
function xInit(m) {
  window.mapInit && mapInit(m); xVillages(m); xLava(m);
  LOOT = (m.loot || []).map(l => ({ id: l[0], x: l[1], y: l[2], b: l[3], seed: l[4], tier: l[5], cx: l[6], cy: l[7], trader: l[8], tx: l[9], ty: l[10] }));
  for (const l of LOOT) {
    const rng = mulberry(l.seed), list = DECOR[l.b] || DECOR.f, n = 6 + Math.floor(rng() * 4);
    const pad = new PIXI.Graphics(); pad.beginFill(l.b === 's' ? 0xcfe0ee : l.b === 'd' ? 0xb98d44 : l.b === 'l' ? 0x4a2a2e : 0x2e5a2a, .18); pad.drawEllipse(l.x, l.y + 6, 92, 62); pad.endFill(); ground.addChild(pad);
    for (let i = 0; i < n; i++) {
      const a = rng() * TAU, d = Math.sqrt(rng()) * 70, sp = new PIXI.Sprite(list[Math.floor(rng() * list.length)]);
      sp.anchor.set(.5, .88); sp.position.set(l.x + Math.cos(a) * d, l.y + Math.sin(a) * d * .75); sp.scale.set(.85 + rng() * .5); sp.zIndex = sp.y; cullList.push({ c: sp, x: sp.x, y: sp.y });
    }
    if (l.tier) { const c = new PIXI.Container(), sp = new PIXI.Sprite(T_LCHEST[l.tier][0]); sp.anchor.set(.5, .85); c.addChild(sp); c.position.set(l.cx, l.cy); c.zIndex = l.cy; cullList.push({ c, x: l.cx, y: l.cy }); lootE[l.id] = { sp, c, tier: l.tier, open: 0 }; }
    if (l.trader) {
      const c = new PIXI.Container(), sh = new PIXI.Sprite(T_SHADOW); sh.anchor.set(.5); sh.scale.set(.8, .5); sh.y = 8;
      const body = new PIXI.Sprite(T_TRADER[l.trader]); body.anchor.set(.5); body.scale.set(.95); body.rotation = Math.atan2(l.y - l.ty, l.x - l.tx) + 0;
      const tag = new PIXI.Text(RC.TRADERS[l.trader].e + ' ' + RC.TRADERS[l.trader].n, { fontFamily: 'system-ui,sans-serif', fontSize: 13, fontWeight: '800', fill: 0xffe082, stroke: 0x000000, strokeThickness: 4 }); tag.anchor.set(.5, 1); tag.y = -34; tag.resolution = 2;
      c.addChild(sh, body, tag); c.position.set(l.tx, l.ty); c.zIndex = l.ty; cullList.push({ c, x: l.tx, y: l.ty });
    }
  }
}
function xSnap(m) {
  const op = new Set(m.lo || []);
  const firstLoot = !window._lootSeen; window._lootSeen = 1;
  for (const id in lootE) { const e = lootE[id]; if (!e.open && op.has(+id)) { e.open = 1; e.openAt = firstLoot ? -1e9 : Date.now(); e.sp.texture = T_LCHEST[e.tier][1]; }
    if (e.open && !e.gone) {   // an opened chest stays a few seconds, fades, then is gone (the ones opened before you joined are already gone)
      const age = (Date.now() - e.openAt) / 1000;
      if (age > 6.5) { e.gone = 1; const k = cullList.findIndex(o => o.c === e.c); if (k >= 0) cullList.splice(k, 1); e.c.destroy({ children: true }); }
      else e.c.alpha = age < 5 ? 1 : 1 - (age - 5) / 1.5;
    } }
  // campfires
  const seen = {};
  for (const c of m.cf || []) {
    seen[c[0]] = 1; let e = campE[c[0]];
    if (!e) {
      const flames = [0, 1, 2].map(() => { const s = new PIXI.Sprite(T_FLAME); s.anchor.set(.5, .9); s.blendMode = BM.ADD; overL.addChild(s); return s; });
      const glow = new PIXI.Sprite(T_GLOW); glow.anchor.set(.5); glow.blendMode = BM.ADD; glow.tint = 0xff8a30; overL.addChild(glow);
      const ring = new PIXI.Sprite(T_RING); ring.anchor.set(.5); ring.blendMode = BM.ADD; ring.tint = 0xffc266; overL.addChildAt(ring, 0);
      const stones = []; for (let i = 0; i < 10; i++) { const a = i / 10 * TAU, s = new PIXI.Sprite(T_ROCK); s.anchor.set(.5, .8); s.scale.set(.26); s.position.set(c[1] + Math.cos(a) * 30, c[2] + Math.sin(a) * 30 + 4); s.zIndex = s.y; s.tint = 0xbbbbbb; ents.addChild(s); stones.push(s); }
      e = campE[c[0]] = { flames, glow, ring, stones, ringR: 0, ph: rnd(0, TAU) };
    }
    if (e.d) {   // sounds for campfires, like the main fire has (only for ones you are near)
      if (c[5] > e.d[5]) fireSound(c[1], c[2], 'levelup'); else if (c[3] > e.d[3] + 5) fireSound(c[1], c[2], 'feed'); if (e.d[3] > 0 && c[3] <= 0) fireSound(c[1], c[2], 'fireOut');
    }
    e.d = c;
  }
  for (const id in campE) if (!seen[id]) { const e = campE[id]; e.flames.forEach(s => s.destroy()); e.glow.destroy(); e.ring.destroy(); e.stones.forEach(s => s.destroy()); delete campE[id]; }
  // bullets / zones / turrets
  const mk = (map, list, make) => { const sn = {}; for (const o of list || []) { sn[o[0]] = 1; if (!map[o[0]]) map[o[0]] = make(o); map[o[0]].d = o; map[o[0]].t0 = performance.now(); } for (const id in map) if (!sn[id]) { map[id].s.destroy(); delete map[id]; } };
  mk(bulletE, m.bl, () => { const s = new PIXI.Sprite(T_BULLET); s.anchor.set(1, .5); s.blendMode = BM.ADD; ents.addChild(s); return { s }; });
  mk(zoneE, m.zn, o => { const s = new PIXI.Sprite(T_RING); s.anchor.set(.5); s.blendMode = BM.ADD; s.tint = o[4] === 1 ? 0x7dffb0 : 0xfff08a; overL.addChildAt(s, 0); return { s }; });
  mk(turretE, m.tr, () => { const s = new PIXI.Sprite(T_TURRET); s.anchor.set(.5, .85); ents.addChild(s); return { s }; });
}
function xStep(dt, me) {
  const now = performance.now(), cr = Math.max(W, H) / Z / 2 + 160;
  for (const o of cullList) { const nr = Math.abs(o.x - camX) < cr && Math.abs(o.y - camY) < cr; if (nr) { if (!o.c.parent) ents.addChild(o.c); } else if (o.c.parent && (Math.abs(o.x - camX) > cr * 1.3 || Math.abs(o.y - camY) > cr * 1.3)) ents.removeChild(o.c); }   // decorations, chests, traders: in the scene only near the camera
  for (const id in bulletE) { const e = bulletE[id], el = Math.min(.1, (now - e.t0) / 1000), a = e.d[3] / 100, v = BSPEED[e.d[4]] || 800; e.s.position.set(e.d[1] + Math.cos(a) * v * el, e.d[2] + Math.sin(a) * v * el); e.s.rotation = a; e.s.zIndex = e.s.y + 40; }
  for (const id in zoneE) { const e = zoneE[id]; e.s.position.set(e.d[1], e.d[2]); e.s.scale.set(e.d[3] * 2 / 256 * (1 + Math.sin(T * 3) * .02)); e.s.alpha = .35 + Math.sin(T * 5) * .08; }
  for (const id in turretE) { const e = turretE[id]; e.s.position.set(e.d[1], e.d[2]); e.s.zIndex = e.d[2]; }
  for (const L of LAVAP) { const near = Math.abs(L.x - camX) < W / Z / 2 + L.r + 200 && Math.abs(L.y - camY) < H / Z / 2 + L.r + 200; L.g.visible = L.gl.visible = near; if (!near) continue; L.gl.alpha = .45 + Math.sin(T * 2 + L.ph) * .12; L.g.scale.set(1 + Math.sin(T * 1.3 + L.ph) * .015); if (Math.random() < dt * 2.5) { const a = rnd(0, TAU), d = rnd(0, L.r * .8); emit(overL, T_GLOW, L.x + Math.cos(a) * d, L.y + Math.sin(a) * d * .8, rnd(-8, 8), rnd(-40, -20), rnd(.6, 1.1), .08, .02, 0xffb040, .9, true, -10); } }   // bubbling and sparks
  for (const v of VILL) { const fl = 1 + Math.sin(T * 14 + v.id) * .07 + Math.sin(T * 23) * .04; v.flames.forEach((f, i) => f.scale.set((.42 - i * .1) * fl, (.42 - i * .1) * fl * (1 + Math.sin(T * (10 + i * 4)) * .08))); }
  let tipCamp = null;
  for (const id in campE) {
    const e = campE[id], c = e.d, x = c[1], y = c[2], fuelK = clamp(c[3] / c[4], 0, 1), alive = c[3] > 0, fl = 1 + Math.sin(T * 17 + e.ph) * .06 + Math.sin(T * 29) * .04;
    e.flames.forEach((s, i) => { s.visible = alive; const w = (.5 + .5 * fuelK) * (1 - i * .22) * fl; s.scale.set(w * (1 + Math.sin(T * (9 + i * 3) + i) * .08), w * (1 + Math.sin(T * (13 + i * 4) + i * 2) * .14)); s.rotation = Math.sin(T * (6 + i * 2) + i) * .08; s.position.set(x + (i - 1) * 7, y + 2 - i * 3); });
    e.glow.visible = alive; e.glow.position.set(x, y - 6); e.glow.scale.set((1.6 + fuelK * 1.4) * fl); e.glow.alpha = .55;
    if (alive) e.ringR += (c[6] - (e.ringR || c[6])) * Math.min(1, dt * 2.5), e.ringR = e.ringR || c[6];
    e.ring.visible = alive; e.ring.position.set(x, y); e.ring.scale.set(e.ringR * 2 / 256); e.ring.alpha = .35 + Math.sin(T * 2) * .08;
    if (alive && Math.random() < dt * (10 + 30 * fuelK)) emit(overL, T_GLOW, x + rnd(-8, 8), y - 2, rnd(-14, 14), rnd(-70, -35), rnd(.6, 1.3), .08, .01, Math.random() < .5 ? 0xffb347 : 0xffe08a, 1, true, -10);
    if (me && Math.hypot(me.x - x, me.y - y) < 80 && !me.d[10]) tipCamp = c;
  }
  if (typeof fireTip !== 'undefined') {
    if (tipCamp) {
      const feed = (GC.BY[me.d[2]] || GC.BY.forester).feed || 1, need = tipCamp[4] - tipCamp[3], lines = [];
      if (need > 15 * feed * .5) lines.push('🪵 ×' + Math.ceil(need / (15 * feed)) + ' to refuel');
      lines.push(tipCamp[5] < RC.FIRE_MAX ? '⬆ Level ' + (tipCamp[5] + 1) + ': 🪨 ×' + 10 * tipCamp[5] : 'Fire is max level');
      const t = lines.join('\n'); if (fireTip.text !== t) fireTip.text = t; fireTip.position.set(tipCamp[1], tipCamp[2] - 78); fireTip.visible = true;
    } else fireTip.position.set(0, -78);
  }
  if (trOpen && me) { const l = LOOT.find(q => q.id === trOpen.id); if (!l || Math.hypot(me.x - l.tx, me.y - l.ty) > 190) closeTrader(); }
}
function xLights(li, sx, sy2) {   // campfire light holes in the night
  for (const id in campE) { const c = campE[id].d; if (c[3] <= 0) continue; const L = getLight(li++); L.visible = true; L.position.set((W / 2 + (c[1] - camX) * Z + sx) * LS, (H / 2 + (c[2] - camY) * Z + sy2) * LS); L.scale.set(c[6] * 1.25 * Z * 2 * LS / 128); L.alpha = 1; }
  return li;
}
// nearest campfire within reach (the ACT label)
function xCampNear(me) { for (const id in campE) { const c = campE[id].d; if (Math.hypot(me.x - c[1], me.y - c[2]) < 80) return c; } return null; }

// ---------- trader menu ----------
let trOpen = null;
(function () {
  const d = document.createElement('div'); d.className = 'ov'; d.id = 'trader'; d.style.cssText = 'pointer-events:none;background:transparent;justify-content:flex-end;z-index:16';
  d.innerHTML = '<div class="sheet"><div class="ch"><span id="trTitle"></span><span id="trInv" style="font-weight:700;font-size:13px"></span><button class="mini gray" id="trClose">Close</button></div><div id="trMsg" style="min-height:18px;padding:0 14px 4px;font-size:13px"></div><div id="trList" style="overflow-y:auto;padding:4px 12px 16px"></div></div>';
  document.body.appendChild(d); d.querySelector('#trClose').onclick = () => closeTrader();
})();
function closeTrader() { trOpen = null; $('trader').style.display = 'none'; }
function xOpenTrader(m) { setCraft(false); closeChest(); closePot(); trOpen = { id: m.id, ty: m.ty }; $('trader').style.display = 'flex'; $('trMsg').textContent = ''; buildTrader(); SFX.chest(); }
const costStr = (cost, mp) => Object.entries(cost).map(([k, n]) => '<span class="' + ((mp[COSTX[k]] || 0) >= n ? '' : 'no') + '">' + COSTI[k] + ' ' + (mp[COSTX[k]] || 0) + '/' + n + '</span>').join(' &nbsp; ');
function buildTrader() {
  if (!trOpen) return; const T = RC.TRADERS[trOpen.ty], mp = S.p.find(p => p[0] === myId) || [], list = $('trList'); list.innerHTML = '';
  $('trTitle').textContent = T.e + ' ' + T.n; $('trInv').textContent = Object.keys(COSTI).filter(k => (mp[COSTX[k]] || 0) > 0).map(k => COSTI[k] + (mp[COSTX[k]] || 0)).join(' ');
  const rows = [];
  if (trOpen.ty === 5) { const c = GC.BY[mp[2]], ab = c && GC.ABIL[c.id]; if (ab) rows.push({ id: 'abil:' + c.id, e: ab.e, n: ab.n + ' (' + c.n + ')', d: ab.d + ' Cooldown ' + ab.cd + 's. Unlocks it for this game only.', cost: GC.abilCost(c), done: mp[25] > 0, doneT: 'Unlocked this game' }); }   // only the ability of the character you are playing, for this game only
  else for (const o of T.offers) rows.push({ id: o.id, e: o.e, n: o.n, d: o.d, cost: o.cost, done: o.armor ? (GEAR.armor || 0) >= o.armor : o.gear ? !!GEAR[o.gear] : false, doneT: o.armor ? 'Owned' : 'Owned' });
  for (const r of rows) {
    const ok = Object.entries(r.cost).every(([k, n]) => (mp[COSTX[k]] || 0) >= n), el = document.createElement('div'); el.className = 'rc' + (r.done ? ' dim' : ok ? ' pick' : ' pick dim');
    el.innerHTML = '<div class="ic">' + r.e + '</div><div class="tx"><div class="nm">' + r.n + (r.done ? ' <span style="color:#7fe9a0;font-size:12px">✔ ' + r.doneT + '</span>' : '') + '</div><div class="ds">' + r.d + '</div><div class="co">' + costStr(r.cost, mp) + '</div></div>';
    el.onclick = () => { if (r.done) return; if (!ok) { $('trMsg').textContent = 'You can\'t afford that yet.'; $('trMsg').style.color = '#ff8a80'; return; } if (ws && ws.readyState === 1) ws.send(JSON.stringify({ t: 'trade', id: trOpen.id, offer: r.id })); };
    list.appendChild(el);
  }
}

// ---------- ability button + dynamic slots ----------
let abilEl = null, slotCap = 3, slotSig2 = '', abilSig = '';
function xButtons() {
  const wrap = $('btns'); if (!wrap || abilEl) return;
  abilEl = document.createElement('div'); abilEl.className = 'btn'; abilEl.id = 'abil';
  abilEl.style.cssText = 'right:calc(max(16px,env(safe-area-inset-right)) + clamp(52px,15vmin,76px) + clamp(44px,12vmin,60px) + 18px);bottom:max(24px,env(safe-area-inset-bottom));width:clamp(42px,11.5vmin,56px);height:clamp(42px,11.5vmin,56px);background:radial-gradient(circle at 35% 30%,#8e6bd8,#4a2d94);font-size:22px;overflow:hidden';
  abilEl.innerHTML = '<span class="ai"></span><span class="ac" style="position:absolute;inset:0;display:none;align-items:center;justify-content:center;background:#000a;font-size:15px;font-weight:800"></span><span class="al" style="position:absolute;right:3px;bottom:1px;font-size:13px">🔒</span>';
  wrap.appendChild(abilEl);
  abilEl.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); useAbility(); });
}
function useAbility() { if (ws && ws.readyState === 1 && myId) ws.send(JSON.stringify({ t: 'abil' })); }
function xHud(mp) {
  xButtons(); if (!mp) return;
  // slots: as many as you can carry right now (a bigger boat adds some)
  const cap = mp[24] || 3, items = mp[19] || [], box = $('slots'), sig = cap + ':' + items.join(',');
  if (sig !== slotSig2) {
    slotSig2 = sig; while (box.children.length < cap) { const el = document.createElement('div'), i = box.children.length; el.className = 'slot'; el.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); const it = ((S && S.p.find(q => q[0] === myId)) || [])[19] || []; if (RC.BOATS[it[i]]) { startPlacingBoat(i); return; } if (ws && ws.readyState === 1) ws.send(JSON.stringify({ t: 'use', i })); }); box.appendChild(el); }
    while (box.children.length > cap) box.lastChild.remove();
    [...box.children].forEach((el, i) => { const f = RC.ITEM_BY[items[i]]; el.textContent = f ? f.e : ''; el.classList.toggle('full', !!f); el.title = f ? f.n + ' - tap to use' : 'empty'; });
  }
  // ability button: locked / ready / cooling down
  const ab = GC.ABIL[mp[2]], st = mp[25] || 0, key = mp[2] + ':' + st; if (!ab || key === abilSig) return; abilSig = key;
  abilEl.title = ab.n + ' - ' + ab.d; abilEl.querySelector('.ai').textContent = ab.e; abilEl.querySelector('.al').style.display = st === 0 ? '' : 'none';
  abilEl.style.filter = st === 0 ? 'grayscale(1) brightness(.7)' : ''; const ac = abilEl.querySelector('.ac'); ac.style.display = st > 1 ? 'flex' : 'none'; ac.textContent = st > 1 ? st - 1 : '';
  abilEl.style.boxShadow = st === 1 ? '0 0 14px #b388ffcc, 0 4px 14px #0008' : '0 4px 14px #0008';
}
// class select: the (locked/unlocked) hidden ability of each class
function xCard(c, el) {
  const ab = GC.ABIL[c.id]; if (!ab) return; const has = false;   // abilities start locked every game (unlock yours with the Ability Unlocker trader)
  el.insertAdjacentHTML('beforeend', '<div class="ab" style="margin-top:4px;font-size:11px;line-height:1.25;text-align:left;color:' + (has ? '#b9f6ca' : '#cfd8dc') + '"><b>' + (has ? '✔' : '🔒') + ' ' + ab.e + ' ' + ab.n + '</b> · ' + ab.cd + 's<br>' + ab.d + '</div>');
}

// ---------- messages from the server ----------
function xMsg(m) {
  const me = ents2['p' + myId];
  if (m.t === 'loot') { SFX.levelup(); if (me) floatText(me.x, me.y - 24, m.msg, 0xffe082); notice(m.msg); }
  else if (m.t === 'camped') { notice('Campfire lit! Feed it wood to keep it burning.'); SFX.levelup(); }
  else if (m.t === 'fish') { if (me) floatText(me.x, me.y - 14, m.n ? '+' + m.n + ' 🍓 fish!' : 'Nothing bit...', m.n ? 0x9be7ff : 0xcfd8dc); if (m.n) SFX.pickup(); }
  else if (m.t === 'fx') {
    if (m.k === 'boom') { const n = Math.min(40, 8 + Math.round(m.r / 12)); for (let i = 0; i < n; i++) { const a = rnd(0, TAU), d = Math.sqrt(Math.random()) * m.r; burst(m.x + Math.cos(a) * d, m.y + Math.sin(a) * d, 3, 0xffa24a, 110, true, .16); } shake = Math.max(shake, .25); }
    else if (m.k === 'heal' && me) floatText(me.x, me.y - 20, '✨ Revived!', 0xb9f6ca);
  }
  else if (m.t === 'abilUsed') { if (m.b) { for (const k in BUFF) BUFF[k] = m.b[k] || 0; buffAt = performance.now(); } SFX.levelup(); if (me) floatText(me.x, me.y - 26, m.n + '!', 0xd1b3ff); }
  else if (m.t === 'saved') {
    const pi = $('pmInfo'); if (!pi) return;
    if (m.ok) { PF.save = { at: m.at, n: m.night, bytes: m.bytes, gz: m.gz }; pi.textContent = '✔ Saved: night ' + m.night + ', ' + m.players + ' player' + (m.players === 1 ? '' : 's') + '. Size ' + fmtBytes(m.bytes) + ' (' + fmtBytes(m.gz) + ' stored compressed).'; pi.style.color = '#b9f6ca'; }
    else { pi.textContent = 'Could not save right now.'; pi.style.color = '#ff8a80'; }
  }
  else if (m.t === 'traded') {
    GEAR = m.gear || GEAR; if (m.prof) PF.abil = m.prof.abil || PF.abil;
    const tm = $('trMsg'); if (tm) { tm.textContent = m.msg || ''; tm.style.color = m.ok ? '#7fe9a0' : '#ff8a80'; } if (m.ok) { SFX.cook(); const me2 = ents2['p' + myId]; if (me2) floatText(me2.x, me2.y - 20, m.msg, 0xffe082); }
    buildTrader(); try { buildPicker(); } catch (e) { }
  }
}

// the ACT button names what it would do here (loot chest, trader, campfire, fishing)
function xActLabel(me) {
  for (const l of LOOT) { if (l.tier && !(lootE[l.id] || {}).open && Math.hypot(me.x - l.cx, me.y - l.cy) < 80) return 'OPEN'; if (l.trader && Math.hypot(me.x - l.tx, me.y - l.ty) < 100) return 'TRADE'; }
  const c = xCampNear(me); if (c) return c[4] - c[3] > 8 ? 'REFUEL' : c[5] < RC.FIRE_MAX ? 'UPGRADE' : 'ACT';
  const mp = S.p.find(q => q[0] === myId); if (GEAR.rod && mp && !mp[20]) { const fa = (mp[16] || 0) / 100; if (isWaterC(me.x + Math.cos(fa) * 80, me.y + Math.sin(fa) * 80)) return 'FISH'; }
  return null;
}

// ---------- Escape menu: resume / save the game to your account / exit ----------
(function () {
  const d = document.createElement('div'); d.className = 'ov'; d.id = 'pauseMenu'; d.style.cssText = 'display:none;align-items:center;justify-content:center;z-index:60;background:#06101ccc';
  d.innerHTML = '<div style="background:#14304a;border:2px solid #ffd000;border-radius:14px;padding:18px 22px;width:min(360px,90vw);max-height:92vh;overflow:auto;text-align:center;box-shadow:0 8px 30px #000a"><div style="font-size:20px;font-weight:800;margin-bottom:12px">Menu</div>' +
    '<button class="mini" id="pmResume" style="display:block;width:100%;margin:6px 0;padding:11px">Resume</button>' +
    '<button class="mini" id="pmSave" style="display:block;width:100%;margin:6px 0;padding:11px;background:#1565c0">💾 Save game</button>' +
    '<div id="pmInfo" style="font-size:12px;opacity:.85;min-height:34px;margin:4px 0 6px;line-height:1.35">Saves this whole game (every player, everything built and collected) to your account. One save per account; a new save replaces the old one.</div>' +
    '<button class="mini gray" id="pmKeys" style="display:block;width:100%;margin:6px 0;padding:11px">🎮 Controls</button>' +
    '<div id="pmCtl" style="display:none;text-align:left;font-size:12.5px;line-height:1.55;margin:6px 0 4px;background:#0b1a2a;border-radius:10px;padding:10px 12px">' +
    '<b>Keyboard + mouse</b><br>W A S D / arrows - move &nbsp;·&nbsp; Shift - run<br>Mouse - aim (your character faces the crosshair)<br>Click / Q / F / J - attack &nbsp;·&nbsp; Space / E - ACT (chop, mine, pick, open, refuel)<br>R - rotate what you are placing, or use your ability<br>1-7 - use the item in that slot &nbsp;·&nbsp; M - map &nbsp;·&nbsp; Esc - this menu<br>' +
    '<b style="display:block;margin-top:6px">Touch</b>Left side of the screen: drag to move, push past the ring to run<br>ACT button: chop, mine, pick, open, refuel<br>ATTACK button: hold to keep attacking, drag it to aim<br>Slot buttons (right edge): tap to use an item &nbsp;·&nbsp; + / − zoom &nbsp;·&nbsp; 🗺️ map &nbsp;·&nbsp; ☰ this menu</div>' +
    '<button class="mini gray" id="pmExit" style="display:block;width:100%;margin:6px 0;padding:11px">Exit to main menu</button></div>';
  document.body.appendChild(d);
  d.querySelector('#pmResume').onclick = () => xPause(false);
  d.querySelector('#pmKeys').onclick = () => { const c = d.querySelector('#pmCtl'); c.style.display = c.style.display === 'none' ? 'block' : 'none'; };
  const mb = document.createElement('button'); mb.id = 'menuBtn'; mb.className = 'zb'; mb.textContent = '☰'; mb.setAttribute('aria-label', 'Menu'); mb.style.cssText = 'bottom:max(196px,calc(env(safe-area-inset-bottom) + 186px));font-size:18px'; $('btns').appendChild(mb);   // phones have no Escape key
  mb.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); xPause(); });
  d.querySelector('#pmSave').onclick = () => { if (ws && ws.readyState === 1) { ws.send(JSON.stringify({ t: 'save' })); $('pmInfo').textContent = 'Saving...'; } };
  d.querySelector('#pmExit').onclick = () => { try { sessionStorage.removeItem('rejoin'); } catch (e) { } runOver = true; try { ws.close(); } catch (e) { } location.reload(); };
})();
const fmtBytes = n => n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(2) + ' MB';
function xPause(on) { const m = $('pauseMenu'), show = on === undefined ? m.style.display === 'none' : on; m.style.display = show ? 'flex' : 'none'; if (show && PF.save) $('pmInfo').textContent = 'Last save: night ' + PF.save.n + ', ' + fmtBytes(PF.save.bytes) + ' (' + fmtBytes(PF.save.gz) + ' stored compressed).'; }
// lobby: continue the saved game
function xLobby() {
  const b = $('loadBtn'); if (!b) return;
  if (PF.save) { b.style.display = ''; b.textContent = 'Continue saved game - night ' + PF.save.n + ' (' + new Date(PF.save.at).toLocaleString() + ')'; b.onclick = () => { window.loadSaveFlag = true; $('go').onclick(); }; } else b.style.display = 'none';
}
