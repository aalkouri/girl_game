// Island Night - authoritative multiplayer server (Node + ws) with saved player profiles
const http = require('http'), fs = require('fs'), path = require('path');
const { WebSocketServer } = require('ws');
const GC = require('./public/classes.js');
const RC = require('./public/recipes.js');
const PORT = process.env.PORT || 80;
const PUB = path.join(__dirname, 'public');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.txt': 'text/plain' };

// ---------- player profiles (no login: a secret random id stored in the player's browser) ----------
function pickDir() {
  for (const d of [process.env.DATA_DIR, '/var/lib/island-night', path.join(__dirname, 'data')]) {
    if (!d) continue;
    try { fs.mkdirSync(d, { recursive: true }); fs.accessSync(d, fs.constants.W_OK); return d; } catch (e) { }
  }
  return null;
}
const DIR = pickDir(), FILE = DIR && path.join(DIR, 'profiles.json');
let profiles = {}; try { profiles = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (e) { }
let pcount = Object.keys(profiles).length, dirty = false;
function save() {
  if (!dirty || !FILE) return; dirty = false;
  try { fs.writeFileSync(FILE + '.tmp', JSON.stringify(profiles)); fs.renameSync(FILE + '.tmp', FILE); } catch (e) { console.error('profile save failed:', e.message); }
}
let config = {}; try { config = JSON.parse(fs.readFileSync(path.join(DIR || '.', 'config.json'), 'utf8')); } catch (e) { }
if (process.env.GOOGLE_CLIENT_ID) config.googleClientId = process.env.GOOGLE_CLIENT_ID;
if (process.env.APPLE_CLIENT_ID) config.appleClientId = process.env.APPLE_CLIENT_ID;
if (process.env.MAIL_MODE) config.mailMode = process.env.MAIL_MODE;
if (process.env.MAIL_FROM) config.mailFrom = process.env.MAIL_FROM;
const auth = require('./auth.js')({ dir: DIR, config });
setInterval(() => { save(); auth.save(); }, 3000);
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { save(); auth.save(); process.exit(0); });
// accounts are keyed by lower-case email. Old anonymous profiles (random 16-32 char ids) can be claimed once at sign-in.
const LEGACY = /^[A-Za-z0-9]{16,32}$/;
function acct(email, create) {
  if (!email) return null;
  let p = profiles[email];
  if (!p && create) { if (pcount > 200000) return null; p = profiles[email] = { d: 0, owned: [], k: 0, n: 0, last: 'forester', t: Date.now() }; pcount++; dirty = true; }
  return p || null;
}
function claimLegacy(email, pid) {
  const p = acct(email, true), old = LEGACY.test(pid || '') ? profiles[pid] : null;
  if (!p || !old || (p.d || p.owned.length || p.n)) return;
  Object.assign(p, { d: old.d, owned: old.owned.slice(), k: old.k, n: old.n, last: old.last });
  delete profiles[pid]; pcount--; dirty = true;
}
const ownedOf = p => GC.DEFAULT_OWNED.concat(p ? p.owned : []);
const view = p => ({ d: p ? p.d : 0, owned: ownedOf(p), last: p && ownedOf(p).includes(p.last) ? p.last : 'forester', n: p ? p.n : 0 });
const send = (ws, o) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); };
function award(pl, amount, why) {
  if (!pl.prof) return;
  const n = Math.max(1, Math.round(amount * GC.BY[pl.cls].dia));
  pl.prof.d += n; dirty = true; send(pl.ws, { t: 'dia', n, d: pl.prof.d, why });
}

const MAXBODY = 8192;
function json(s, code, o) { s.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); s.end(JSON.stringify(o)); }
function body(q) {
  return new Promise(res => {
    let b = '', over = false;
    q.on('data', d => { b += d; if (b.length > MAXBODY) { over = true; q.destroy(); } });
    q.on('end', () => { if (over) return res(null); try { res(JSON.parse(b || '{}')); } catch (e) { res(null); } });
    q.on('error', () => res(null));
  });
}
const clientIp = q => { const x = q.headers['x-forwarded-for']; return (x ? String(x).split(',').pop().trim() : q.socket.remoteAddress) || ''; };
const login = (email, tok, extra) => Object.assign({ ok: true, token: tok, email }, extra || {}, { profile: view(acct(email, true)) });

async function api(q, s, u) {
  const ip = clientIp(q);
  if (!auth.allow('api:' + ip, 240, 60000)) return json(s, 429, { ok: false, err: 'Slow down.' });
  if (u.pathname === '/api/config' && q.method === 'GET') return json(s, 200, { ok: true, google: config.googleClientId || null, apple: config.appleClientId || null });
  if (q.method !== 'POST') return json(s, 405, { ok: false });
  const b = await body(q); if (!b) return json(s, 400, { ok: false, err: 'Bad request.' });
  switch (u.pathname) {
    case '/api/auth/email/start': return json(s, 200, await auth.startEmail(b.email, ip));
    case '/api/auth/email/verify': {
      if (!auth.allow('v:' + ip, 40, 3600e3)) return json(s, 200, { ok: false, err: 'Too many tries. Please try again later.' });
      const r = auth.verifyEmail(b.email, b.code); if (!r.ok) return json(s, 200, r);
      claimLegacy(r.email, b.pid); return json(s, 200, login(r.email, auth.createSession(r.email)));
    }
    case '/api/auth/google': {
      const r = await auth.verifyGoogle(b.credential); if (!r.ok) return json(s, 200, r);
      claimLegacy(r.email, b.pid); return json(s, 200, login(r.email, auth.createSession(r.email), { name: r.name }));
    }
    case '/api/auth/apple': {
      const r = await auth.verifyApple(b.credential); if (!r.ok) return json(s, 200, r);
      claimLegacy(r.email, b.pid); return json(s, 200, login(r.email, auth.createSession(r.email), { name: r.name }));
    }
    case '/api/auth/session': { const e = auth.sessionEmail(b.token); return json(s, 200, e ? login(e, b.token) : { ok: false }); }
    case '/api/auth/logout': auth.logout(b.token); return json(s, 200, { ok: true });
    case '/api/profile': { const e = auth.sessionEmail(b.token); return json(s, 200, e ? { ok: true, profile: view(acct(e, true)) } : { ok: false, err: 'auth' }); }
    case '/api/buy': {
      const e = auth.sessionEmail(b.token); if (!e) return json(s, 200, { ok: false, err: 'auth' });
      const c = GC.BY[b.cls]; if (!c || c.price <= 0) return json(s, 200, { ok: false, err: 'unknown class' });
      const p = acct(e, true); if (!p) return json(s, 200, { ok: false, err: 'bad profile' });
      if (ownedOf(p).includes(c.id)) return json(s, 200, Object.assign({ ok: false, err: 'already owned' }, { profile: view(p) }));
      if (p.d < c.price) return json(s, 200, { ok: false, err: 'need', need: c.price - p.d, profile: view(p) });
      p.d -= c.price; p.owned.push(c.id); dirty = true;
      return json(s, 200, { ok: true, profile: view(p) });
    }
  }
  return json(s, 404, { ok: false });
}

const srv = http.createServer((q, s) => {
  const u = new URL(q.url, 'http://x');
  if (u.pathname.startsWith('/api/')) { api(q, s, u).catch(e => { console.error('api error', e); if (!s.headersSent) json(s, 500, { ok: false, err: 'Server error.' }); }); return; }
  let f = u.pathname;
  if (f === '/') f = '/index.html';
  const p = path.join(PUB, path.normalize(f));
  if (!p.startsWith(PUB)) { s.writeHead(403); return s.end(); }
  fs.readFile(p, (e, d) => {
    if (e) { s.writeHead(404); return s.end('not found'); }
    s.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    s.end(d);
  });
});

// ---------- game constants ----------
const R = 1800;                      // island radius (doubled from 900)
const ALIEN_R = 950;                 // aliens come ashore this far from the fire
const DAY = 90, DUSK = 30, NIGHT = 60, CYC = DAY + DUSK + NIGHT;
const MAXP = 8;
const ROOM_IDLE_SEC = +process.env.ROOM_IDLE_SEC || 20 * 60;   // an empty room is kept this long; any join resets the timer
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const CAMP_CLEAR = RC.camp(5) + 30;          // no trees anywhere the camp can grow to (max level)
const HP = { t: 4, r: 3, b: 1 };            // hits to break: tree 4, rock 3, berry bush 1
const STRUCT = { bench: { r: RC.RADIUS.bench }, chest: { r: RC.RADIUS.chest }, pot: { r: RC.RADIUS.pot }, smelter: { r: RC.RADIUS.smelter }, wall: { r: RC.RADIUS.wall, hp: 60 } };
const CHEST_CAP = 500, REACH = 62;   // collision radius / hit points of placed structures
const SPILL = { t: 5, r: 3 };
const STA = { max: 100, drain: 16, regen: 22, delay: 1, tiredDelay: 1.6, resume: 25, sprint: 1.7 };   // stamina: a full-stick run drains 16/s (~6 s), refills 22/s after a 1 s rest; at 0 you are winded until it climbs back to 25
// the Charger: from night 4 on, one huge, very fast enemy per night that hammers players far backwards and vanishes at dawn
const CHARGER = { firstNight: 4, sp0: 175, spPerNight: 12, spMax: 320, dmg: 25, rad: 36, reach: 62, stop: 44, knock: 300, stunSec: 0.6 };               // logs per tree / stones per rock (before class bonus)

class Room {
  constructor(code) {
    this.code = code; this.away = new Map(); this.players = new Map(); this.nid = 1; this.emptyFor = 0;
    this.res = [];
    const add = (k, n, min = 130) => { for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, d = min + Math.sqrt(Math.random()) * (R - 70 - min); this.res.push({ k, x: Math.cos(a) * d, y: Math.sin(a) * d, hp: HP[k], mhp: HP[k], rt: 0 }); } };
    add('t', 135, CAMP_CLEAR); add('r', 84); add('b', 66);   // island area is 4x, so ~3x the resources
    this.reset();
  }
  reset() {
    this.c = +process.env.START_C || 0; this.night = +process.env.START_N || 1; this.fire = { fuel: 150, lvl: 1 }; this.aliens = []; this.over = 0;
    for (const r of this.res) r.hp = r.mhp;
    this.drops = []; this.pend = []; this.struct = []; this.chargerNight = 0;
    for (const p of this.players.values()) { this.respawn(p); p.gear = {}; p.buff = { speed: 0, regen: 0, dmg: 0 }; p.kb = null; }
  }
  respawn(p) {
    const c = GC.BY[p.cls]; p.mhp = c.hp; p.hp = c.hp; p.down = 0; p.rev = 0; p.sta = STA.max; p.tired = 0; p.staCd = 0;
    const a = Math.random() * 6.283; p.x = Math.cos(a) * 100; p.y = Math.sin(a) * 100;
  }
  // a broken tree/rock leaves pickups on the ground after its fall/crumble animation (client shows them when they appear)
  spill(r, n) {
    const delay = r.k === 't' ? .95 : .5, kind = r.k === 't' ? 'w' : r.k === 'b' ? 'f' : 's';
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283, d = 24 + Math.random() * 28; let x = r.x + Math.cos(a) * d, y = r.y + Math.sin(a) * d;
      const dd = Math.hypot(x, y); if (dd > R - 40) { x *= (R - 40) / dd; y *= (R - 40) / dd; }
      this.pend.push({ k: kind, x, y, t: delay });
    }
  }
  craft(p, id, rot) {
    const r = RC.BY[id], fail = msg => ({ ok: false, msg });
    if (!r) return fail('Unknown recipe.');
    if (p.down) return fail('You are down.');
    const hasBench = this.struct.some(st => st.k === 'bench');
    if (r.kind === 'bench' && hasBench) return fail('Your camp already has a crafting bench.');
    if (r.kind !== 'bench' && !hasBench) return fail('Build a crafting bench first.');
    if (r.kind === 'gear' && p.gear[r.gear]) return fail('You already have that.');
    if (!this.canPay(p, r.cost)) return fail('Not enough materials (your bag plus the chests).');
    if (r.kind !== 'gear') {
      const x = p.x + Math.cos(p.fa) * 58, y = p.y + Math.sin(p.fa) * 58, d = Math.hypot(x, y), campR = RC.camp(this.fire.lvl);
      const sr = STRUCT[r.kind].r, station = r.kind !== 'wall';
      if (d < RC.fireClear(r.kind)) return fail('Too close to the fire. Nothing can be built on or against it.');
      if (station && d > campR) return fail('Stand inside the camp (the fire ring), a little away from the fire, facing a free spot.');
      if (!station && d > campR + 200) return fail('Walls go in or just outside the camp.');
      if (d > R - 50) return fail('Too close to the water.');
      if (this.struct.filter(st => st.k === r.kind).length >= (r.max || 99)) return fail('You have built the maximum number of those.');
      for (const st of this.struct) {   // nothing may be crafted too close to anything else
        const stWall = st.k === 'wall', dd = Math.hypot(st.x - x, st.y - y);
        const need = station && !stWall ? RC.STATION_GAP : (station || !stWall) ? RC.WALL_GAP : st.r + sr - 4;
        if (dd < need) return fail(need > 60 ? 'Too close to another structure. Keep stations about ' + RC.STATION_GAP + ' apart (walls about ' + RC.WALL_GAP + ' from stations).' : 'Something is already there. Turn and try another spot.');
      }
      this.pay(p, r.cost);
      const st = { id: this.nid++, k: r.kind, x, y, r: sr, hp: STRUCT[r.kind].hp || 0, mhp: STRUCT[r.kind].hp || 0, rot: ((Math.trunc(+rot) || 0) % 8 + 8) % 8, items: r.kind === 'chest' ? { wood: 0, stone: 0, food: 0, scrap: 0 } : null, smelt: r.kind === 'smelter' ? { q: 0, prog: 0 } : null }; this.struct.push(st);
      return { ok: true, msg: r.kind === 'bench' ? 'Crafting bench placed! More recipes unlocked.' : r.n + ' placed.' };
    }
    this.pay(p, r.cost); p.gear[r.gear] = 1;
    return { ok: true, msg: r.n + ' crafted!' };
  }
  smelterStart(p, st) {   // ACT next to a smelter: automatically takes 5 rocks and queues one scrap
    if (st.smelt.q >= RC.SMELT.queue) return { ok: false, msg: 'The smelter is full.' };
    if (this.pool(p, 'stone') < RC.SMELT.cost) return { ok: false, msg: 'Need ' + RC.SMELT.cost + ' rocks to smelt (your bag plus the chests).' };
    this.pay(p, { stone: RC.SMELT.cost }); if (st.smelt.q === 0) st.smelt.prog = 0; st.smelt.q++;
    return { ok: true };
  }
  // Materials are drawn from the crafter's own bag first, then from the chests (oldest chest first). Chests are put-only.
  pool(p, res) { let n = p[res] || 0; for (const t of this.struct) if (t.items) n += t.items[res] || 0; return n; }
  canPay(p, cost) { for (const k in cost) if (cost[k] && this.pool(p, k) < cost[k]) return false; return true; }
  pay(p, cost) {
    for (const k in cost) {
      let need = cost[k] || 0; if (!need) continue;
      const own = Math.min(p[k] || 0, need); p[k] -= own; need -= own;
      for (const t of this.struct) { if (!need) break; if (!t.items) continue; const take = Math.min(t.items[k] || 0, need); t.items[k] -= take; need -= take; }
    }
  }
  near(p, st) { return Math.hypot(p.x - st.x, p.y - st.y) < st.r + REACH + 30; }
  chestOp(p, id, res, n) {   // shared storage, put-only: anyone may deposit; nothing can be taken out (crafting uses it automatically)
    const st = this.struct.find(s => s.id === id && s.k === 'chest');
    if (!st || p.down || !this.near(p, st) || !['wood', 'stone', 'food', 'scrap'].includes(res)) return;
    n = Math.max(-1e6, Math.min(1e6, Math.trunc(+n) || 0)); if (!n) return;
    if (n <= 0) return;   // no withdrawing
    const k = Math.min(n, p[res], CHEST_CAP - st.items[res]); p[res] -= k; st.items[res] += k;
  }
  cook(p, id) {
    const f = RC.FOOD_BY[id], fail = msg => ({ ok: false, msg });
    if (!f) return fail('Unknown recipe.'); if (p.down) return fail('You are down.');
    if (!this.struct.some(s => s.k === 'pot' && this.near(p, s))) return fail('Stand next to a cooking pot.');
    if (this.pool(p, 'food') < f.cost.food) return fail('Not enough berries (your bag plus the chests).');
    this.pay(p, { food: f.cost.food });
    if (id === 'juice') p.hp = Math.min(p.mhp, p.hp + 40);
    else if (id === 'tea') p.buff.speed = 60;
    else if (id === 'stew') { p.hp = Math.min(p.mhp, p.hp + 60); p.buff.regen = 30; }
    else if (id === 'pie') p.buff.dmg = 60;
    return { ok: true, msg: f.n + ' ready!' };
  }
  ph() { return this.c < DAY ? 0 : this.c < DAY + DUSK ? 1 : 2; }
  stash(p) {   // remember a leaving player's character so they can come back (dropped connection) within the room window
    if (!p.email) return; const now = Date.now(); for (const [k, v] of this.away) if (now - v.t > ROOM_IDLE_SEC * 1000) this.away.delete(k);
    this.away.set(p.email, { t: now, s: { wood: p.wood, stone: p.stone, food: p.food, scrap: p.scrap, gear: p.gear, buff: p.buff, cls: p.cls, down: p.down, hp: p.hp, x: p.x, y: p.y } });
  }
  add(ws, name, cls, pf, email) {
    const p = { id: this.nid++, ws, name, cls, prof: pf, gear: {}, buff: { speed: 0, regen: 0, dmg: 0 }, actPrev: 0, fa: 0, sw: 0, swk: 0, swa: 0, wood: parseInt(process.env.START_WOOD) || 0, stone: parseInt(process.env.START_STONE) || 0, food: parseInt(process.env.START_FOOD) || 0, scrap: 0, sta: STA.max, staCd: 0, tired: 0, actcd: 0, hitcd: 0, eat: 0, inp: { dx: 0, dy: 0, act: 0, hit: 0 } };
    p.email = email; this.respawn(p);
    const a = email && this.away.get(email); this.away.delete(email);
    if (a && Date.now() - a.t <= ROOM_IDLE_SEC * 1000) {   // welcome back: same stuff, same spot (a downed player just respawns)
      const o = a.s; p.wood = o.wood; p.stone = o.stone; p.food = o.food; p.scrap = o.scrap; p.gear = o.gear; p.buff = o.buff;
      if (o.cls === cls && !o.down) { p.hp = Math.min(p.mhp, o.hp); p.x = o.x; p.y = o.y; }
    }
    this.players.set(p.id, p); return p;
  }
  tick(dt) {
    const P = [...this.players.values()];
    if (!P.length) { this.emptyFor += dt; return; } this.emptyFor = 0;
    if (this.over > 0) { this.over -= dt; if (this.over <= 0) this.reset(); return; }
    this.c += dt;
    if (this.c >= CYC) {
      this.c -= CYC; this.night++;
      const survived = this.night - 1, bonus = survived % 5 === 0 ? 10 : 0;
      for (const p of P) { award(p, 5 + bonus, bonus ? 'milestone' : 'night'); if (p.prof) { p.prof.n++; dirty = true; } }
    }
    const ph = this.ph(), f = this.fire, maxF = 150 + (f.lvl - 1) * 75;
    let burn = 1; for (const p of P) if (!p.down) burn = Math.min(burn, GC.BY[p.cls].burn);
    f.fuel = Math.max(0, f.fuel - (ph === 0 ? 0.4 : 1) * burn * dt);
    const fr = f.fuel > 0 ? RC.camp(f.lvl) : 0;

    for (const r of this.res) if (r.hp <= 0 && (r.rt -= dt) <= 0) r.hp = r.mhp;
    for (const p of P) p.rv = 0;

    for (const p of P) {
      if (p.down) continue;
      if (p.inpAt && Date.now() - p.inpAt > 400) p.inp = { dx: 0, dy: 0, act: 0, hit: 0, rn: 0 };   // client stopped sending (frozen/backgrounded tab): never keep walking
      const c = GC.BY[p.cls], i = p.inp;
      p.actcd -= dt; p.hitcd -= dt;
      const B = p.buff; for (const k in B) if (B[k] > 0) B[k] = Math.max(0, B[k] - dt);
      const actEdge = i.act && !p.actPrev; p.actPrev = i.act;
      if (B.regen > 0 && p.hp < p.mhp) p.hp = Math.min(p.mhp, p.hp + 2 * dt);
      let dx = i.dx, dy = i.dy; const m = Math.hypot(dx, dy); if (m > 1) { dx /= m; dy /= m; }
      let spd = c.spd * (B.speed > 0 ? 1.25 : 1);
      // running: the further the stick is pushed past the walk ring, the faster (up to 1.7x); it costs stamina, and a winded player can only walk
      let rn = m > 0.1 ? Math.max(0, Math.min(1, +i.rn || 0)) : 0; if (p.tired) rn = 0;
      if (rn > 0 && p.sta > 0) {
        p.sta = Math.max(0, p.sta - STA.drain * rn * dt); p.staCd = STA.delay; spd *= 1 + (STA.sprint - 1) * rn;
        if (p.sta <= 0) { p.tired = 1; p.staCd = STA.tiredDelay; }
      } else {
        p.staCd -= dt; if (p.staCd <= 0) p.sta = Math.min(STA.max, p.sta + STA.regen * dt);
        if (p.tired && p.sta >= STA.resume) p.tired = 0;
      }
      let flying = false;
      if (p.kb) { p.kb.t += dt; const u = p.kb.t / CHARGER.stunSec; if (u >= 1) p.kb = null; else { const v = p.kb.v0 * (1 - u) * (1 - u); p.x += p.kb.dx * v * dt; p.y += p.kb.dy * v * dt; flying = true; } }   // knocked back: no steering until it wears off
      if (!flying) { p.x += dx * spd * dt; p.y += dy * spd * dt; } if (m > 0.1) p.fa = Math.atan2(dy, dx);
      for (const st of this.struct) { const sd = Math.hypot(p.x - st.x, p.y - st.y), mn = st.r + 14; if (sd < mn && sd > 0.01) { p.x = st.x + (p.x - st.x) / sd * mn; p.y = st.y + (p.y - st.y) / sd * mn; } }
      const d = Math.hypot(p.x, p.y); if (d > R - 30) { p.x *= (R - 30) / d; p.y *= (R - 30) / d; }

      if (i.act) {
        const mate = P.find(q => q.down && dist(p, q) < 60);
        if (mate) { mate.rev += dt * c.rev; mate.rv = 1; }
        else if (p.actcd <= 0) {
          const stn = this.struct.find(st => (st.k === 'chest' || st.k === 'pot' || st.k === 'smelter') && Math.hypot(p.x - st.x, p.y - st.y) < st.r + REACH);
          if (stn) { if (actEdge) { p.actcd = 0.4; if (stn.k === 'smelter') { const sr = this.smelterStart(p, stn); if (!sr.ok) send(p.ws, { t: 'toast', msg: sr.msg }); } else send(p.ws, { t: 'open', what: stn.k, id: stn.id }); } }
          else if (d < 80) {
            const per = 15 * c.feed, need = maxF - f.fuel;
            if (p.wood > 0 && need > per * 0.5) { const n = Math.min(p.wood, Math.ceil(need / per)); f.fuel = Math.min(maxF, f.fuel + n * per); p.wood -= n; p.actcd = 0.3; }   // only as much wood as the gauge needs
            else if (f.lvl < 5 && p.stone >= 10 * f.lvl) { p.stone -= 10 * f.lvl; f.lvl++; p.actcd = 0.5; }                                                          // gauge full: level the fire up with stone
          } else {
            let best = null, bd = 55;
            for (const r of this.res) if (r.hp > 0) { const dd = dist(p, r); if (dd < bd) { bd = dd; best = r; } }
            if (best) {
              p.actcd = 0.55; p.sw = (p.sw + 1) & 255; p.swk = best.k === 't' ? 1 : best.k === 'r' ? 2 : 3; p.swa = Math.atan2(best.y - p.y, best.x - p.x);
              best.hp -= best.k === 't' && p.gear.axe ? 1.34 : best.k === 'r' && p.gear.pick ? 1.5 : 1;
              if (best.hp <= 0) {
                best.rt = 45 + Math.random() * 30;
                if (best.k === 'b') this.spill(best, Math.max(1, Math.round(2 * c.food)));   // little strawberries pop out around the bush
                else this.spill(best, Math.max(1, Math.round(SPILL[best.k] * (best.k === 't' ? c.wood : c.stone))));
              }
            } else { p.actcd = 0.55; p.sw = (p.sw + 1) & 255; p.swk = 1; p.swa = p.fa; }   // nothing to chop: still swing
          }
        }
      }
      if (i.hit && p.hitcd <= 0) {
        p.hitcd = c.cd;
        let best = null, bd = c.range + (p.gear.spear ? 15 : 0);
        for (const a of this.aliens) { if (a.hp <= 0 || a.k === 2) continue; const dd = dist(p, a); if (dd < bd) { bd = dd; best = a; } }   // the Charger cannot be hit
        p.sw = (p.sw + 1) & 255; p.swk = 4; p.swa = best ? Math.atan2(best.y - p.y, best.x - p.x) : p.fa;   // the weapon swings even when nothing is in front of you
        if (best) {
          best.hp -= (c.dmg + (p.gear.spear ? 6 : 0) + (B.dmg > 0 ? 5 : 0)) * (Math.random() < c.crit ? 2 : 1);
          const kd = Math.max(1, dist(p, best)); const kr = best.k === 2 ? 0.2 : 1; best.x += (best.x - p.x) / kd * c.knock * kr; best.y += (best.y - p.y) / kd * c.knock * kr;
          if (best.hp <= 0 && p.prof) { p.prof.k++; dirty = true; if (p.prof.k % 10 === 0) award(p, 1, 'kills'); }
        }
      }
      if (this.fire.fuel > 0 && p.hp < p.mhp && Math.hypot(p.x, p.y) < RC.camp(this.fire.lvl)) p.hp = Math.min(p.mhp, p.hp + 2 * dt);   // resting at a lit camp heals 2 HP/s (berries are for crafting only)
      if (c.regen && p.hp < p.mhp) p.hp = Math.min(p.mhp, p.hp + c.regen * dt);
      if (c.heal) for (const q of P) if (!q.down && q.hp < q.mhp && dist(p, q) < 90) q.hp = Math.min(q.mhp, q.hp + c.heal * dt);
    }
    for (const p of P) if (p.down) {
      if (!p.rv) p.rev = Math.max(0, p.rev - 0.5 * dt);
      if (p.rev >= 3) { p.down = 0; p.rev = 0; p.hp = p.mhp * 0.4; }
    }

    // smelters: one scrap per SMELT.time seconds, then it hops out onto the ground
    for (const st of this.struct) if (st.smelt && st.smelt.q > 0) {
      st.smelt.prog += dt;
      if (st.smelt.prog >= RC.SMELT.time) {
        st.smelt.prog = 0; st.smelt.q--;
        const a = Math.PI * (0.15 + Math.random() * 0.7), dd = st.r + 24 + Math.random() * 18;   // lands in front (below) of the smelter
        this.pend.push({ k: 'm', x: st.x + Math.cos(a) * dd, y: st.y + Math.sin(a) * dd, t: 0.45 });
      }
    }
    // ground pickups: appear after the animation, collected by running over them
    for (let i = this.pend.length - 1; i >= 0; i--) {
      const q = this.pend[i]; if ((q.t -= dt) > 0) continue;
      this.pend.splice(i, 1); if (this.drops.length < 160) this.drops.push({ id: this.nid++, k: q.k, x: q.x, y: q.y, ttl: 100 });
    }
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i]; d.ttl -= dt; let taken = false;
      if (d.ttl > 0) for (const p of P) if (!p.down && dist(p, d) < 30) { if (d.k === 'w') p.wood++; else if (d.k === 's') p.stone++; else if (d.k === 'f') p.food++; else p.scrap++; taken = true; break; }
      if (taken || d.ttl <= 0) this.drops.splice(i, 1);
    }
    // aliens
    if (ph === 2) {
      let want = Math.min(40, 2 + this.night * 2); if (this.night % 5 === 0) want = Math.floor(want * 1.5);
      if (this.night >= CHARGER.firstNight && this.chargerNight !== this.night) {
        this.chargerNight = this.night; const a = Math.random() * 6.283, hp = 1;   // it cannot be hurt; hp only exists so dawn can remove it
        this.aliens.push({ id: this.nid++, x: Math.cos(a) * ALIEN_R, y: Math.sin(a) * ALIEN_R, hp, mhp: hp, sp: Math.min(CHARGER.spMax, CHARGER.sp0 + CHARGER.spPerNight * (this.night - CHARGER.firstNight)), dmg: CHARGER.dmg, k: 2, cd: 0, rad: CHARGER.rad, reach: CHARGER.reach, stop: CHARGER.stop });
      }
      if (this.aliens.filter(a => a.k !== 2).length < want && Math.random() < dt * 2) {
        const a = Math.random() * 6.283, brute = this.night % 5 === 0 && Math.random() < 0.2;
        this.aliens.push({ id: this.nid++, x: Math.cos(a) * ALIEN_R, y: Math.sin(a) * ALIEN_R, hp: brute ? 120 : 30, mhp: brute ? 120 : 30, sp: brute ? 55 : 70 + Math.min(30, this.night * 2), dmg: brute ? 20 : 10, k: brute ? 1 : 0, cd: 0 });
      }
    }
    for (const a of this.aliens) {
      if (ph !== 2) { if (a.k === 2) a.hp = 0; else a.hp -= 25 * dt; }       // sunlight burns them; the Charger vanishes the moment night ends
      a.cd -= dt;
      let tgt = null, bd = 1e9, slow = 0;
      for (const p of P) if (!p.down) {
        const dd = dist(a, p); if (dd < bd) { bd = dd; tgt = p; }
        const sl = GC.BY[p.cls].slow; if (sl > slow && dd < 110) slow = sl;
      }
      const sp = a.sp * (1 - slow);
      const tx = tgt ? tgt.x : 0, ty = tgt ? tgt.y : 0, d = Math.max(1, Math.hypot(tx - a.x, ty - a.y));
      if (d > (a.stop || 20)) { a.x += (tx - a.x) / d * sp * dt; a.y += (ty - a.y) / d * sp * dt; }
      const ad = Math.hypot(a.x, a.y);
      for (const st of this.struct) {   // every structure is solid and indestructible
        const sd = Math.hypot(a.x - st.x, a.y - st.y), mn = st.r + (a.rad || 12);
        if (sd < mn) { const k = sd > 0.01 ? mn / sd : 1; a.x = st.x + (a.x - st.x) * k; a.y = st.y + (a.y - st.y) * k; }   // solid: aliens slide around it, but cannot damage it, and it does not damage them
      }
      if (fr > 0 && ad < fr) { const k = fr / Math.max(1, ad); a.x = ad < 1 ? fr : a.x * k; a.y *= ad < 1 ? 1 : k; }   // repelled by firelight
      if (tgt && d < (a.reach || 28) && a.cd <= 0 && (fr === 0 || Math.hypot(tgt.x, tgt.y) >= fr)) {
        tgt.hp -= a.dmg; a.cd = 1;
        if (a.k === 2) {   // the Charger sends you flying (about 10 steps) and then needs a moment before it can hit again
          const kx = tgt.x - a.x, ky = tgt.y - a.y, kl = Math.max(1, Math.hypot(kx, ky));
          tgt.kb = { dx: kx / kl, dy: ky / kl, t: 0, v0: CHARGER.knock * 3 / CHARGER.stunSec }; a.cd = 1.3;
        }
        if (tgt.hp <= 0) { tgt.hp = 0; tgt.down = 1; tgt.rev = 0; }
      }
    }
    this.aliens = this.aliens.filter(a => a.hp > 0);
    if (this.struct.some(st => st.dead)) this.struct = this.struct.filter(st => !st.dead);
    if (P.every(p => p.down)) this.over = 6;
  }
  snap() {
    const f = this.fire;
    return JSON.stringify({
      t: 's', c: Math.round(this.c * 10) / 10, n: this.night, ph: this.ph(), o: this.over > 0 ? 1 : 0,
      f: [Math.round(f.fuel), 150 + (f.lvl - 1) * 75, f.lvl, f.fuel > 0 ? RC.camp(f.lvl) : 0],
      p: [...this.players.values()].map(p => [p.id, p.name, p.cls, Math.round(p.x), Math.round(p.y), Math.round(p.hp), p.mhp, p.wood, p.stone, p.food, p.down, Math.round(p.rev * 10) / 10, p.sw, p.swk, Math.round(p.swa * 100), p.scrap, Math.round(p.fa * 100), Math.round(p.sta), p.tired]),
      a: this.aliens.map(a => [a.id, Math.round(a.x), Math.round(a.y), Math.round(a.hp), a.mhp, a.k]),
      r: this.res.map(r => Math.max(0, Math.ceil(r.hp - 1e-9))).join(''),
      dr: this.drops.map(d => [d.id, d.k, Math.round(d.x), Math.round(d.y)]),
      st: this.struct.map(t => [t.id, t.k, Math.round(t.x), Math.round(t.y), Math.round(t.hp), t.mhp, t.items ? [t.items.wood, t.items.stone, t.items.food, t.items.scrap] : t.smelt ? [t.smelt.q, Math.round(t.smelt.prog / RC.SMELT.time * 100) / 100] : 0, t.rot || 0]),
    });
  }
}

const rooms = new Map();
const code = () => { let c; do { c = Array.from({ length: 4 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ'[Math.random() * 24 | 0]).join(''); } while (rooms.has(c)); return c; };

const wss = new WebSocketServer({ server: srv, maxPayload: 1024 });
wss.on('connection', ws => {
  let room = null, me = null;
  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (m.t === 'join' && !me) {
      const name = String(m.name || 'Survivor').replace(/[^\w \-]/g, '').slice(0, 12) || 'Survivor';
      const email = auth.sessionEmail(m.token);
      if (!email) { send(ws, { t: 'err', m: 'auth' }); return; }
      const pf = acct(email, true); if (!pf) { send(ws, { t: 'err', m: 'Server is full' }); return; }
      const owned = ownedOf(pf);
      const cls = owned.includes(m.cls) ? m.cls : (owned.includes(pf.last) ? pf.last : 'forester');
      if (pf.last !== cls) { pf.last = cls; dirty = true; }
      let rc = String(m.room || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
      if (!rc) rc = code();
      if (!rooms.has(rc)) rooms.set(rc, new Room(rc));
      room = rooms.get(rc);
      if (room.players.size >= MAXP) { send(ws, { t: 'err', m: 'Room is full' }); return; }
      me = room.add(ws, name, cls, pf, email);
      send(ws, { t: 'init', id: me.id, room: rc, R, cls, gear: me.gear, prof: view(pf), res: room.res.map(r => [r.k, Math.round(r.x), Math.round(r.y)]) });
    } else if (m.t === 'craft' && me) {
      const now = Date.now(); if (now - (me.lastCraft || 0) < 200) { send(ws, { t: 'crafted', id: String(m.id || ''), ok: false, msg: 'Slow down a little.', gear: me.gear }); return; } me.lastCraft = now;
      let res; try { res = room.craft(me, String(m.id || ''), m.rot); } catch (e) { console.error('craft error:', e && e.stack || e); res = { ok: false, msg: 'Could not craft that.' }; }
      send(ws, { t: 'crafted', id: String(m.id || ''), ok: res.ok, msg: res.msg, gear: me.gear });
    } else if (m.t === 'chest' && me) {
      try { room.chestOp(me, +m.id, String(m.res || ''), m.n); } catch (e) { console.error('chest error:', e && e.stack || e); }
    } else if (m.t === 'cook' && me) {
      const now = Date.now(); if (now - (me.lastCook || 0) < 150) return; me.lastCook = now;
      let res; try { res = room.cook(me, String(m.id || '')); } catch (e) { console.error('cook error:', e && e.stack || e); res = { ok: false, msg: 'Could not cook that.' }; }
      send(ws, { t: 'cooked', id: String(m.id || ''), ok: res.ok, msg: res.msg, b: me.buff });
    } else if (m.t === 'in' && me) {
      const n = v => Math.max(-1, Math.min(1, +v || 0));
      me.inp = { dx: n(m.dx), dy: n(m.dy), act: m.act ? 1 : 0, hit: m.hit ? 1 : 0, rn: Math.max(0, Math.min(1, +m.rn || 0)) }; me.inpAt = Date.now();
    }
  });
  ws.on('close', () => { if (room && me) { room.stash(me); room.players.delete(me.id); } });
  ws.on('error', () => { });
});

let tk = 0;
setInterval(() => {
  tk++;
  for (const [c, r] of rooms) {
    try { r.tick(1 / 30); } catch (e) { console.error('tick error:', e && e.stack || e); }
    if (tk % 2 === 0 && r.players.size) { const s = r.snap(); for (const p of r.players.values()) if (p.ws.readyState === 1) p.ws.send(s); }
    if (r.emptyFor > ROOM_IDLE_SEC) rooms.delete(c);   // nobody joined for the whole window: destroy the session
  }
}, 1000 / 30);

srv.listen(PORT, () => console.log('Island Night listening on', PORT, 'profiles:', pcount, 'dir:', DIR));
