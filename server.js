// Island Night - authoritative multiplayer server (Node + ws) with saved player profiles
const http = require('http'), fs = require('fs'), path = require('path');
const { WebSocketServer } = require('ws');
const GC = require('./public/classes.js');
const PORT = process.env.PORT || 80;
const PUB = path.join(__dirname, 'public');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

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
  if (u.pathname === '/api/config' && q.method === 'GET') return json(s, 200, { ok: true, google: config.googleClientId || null });
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
const R = 900;                       // island radius
const DAY = 90, DUSK = 30, NIGHT = 60, CYC = DAY + DUSK + NIGHT;
const MAXP = 8;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

class Room {
  constructor(code) {
    this.code = code; this.players = new Map(); this.nid = 1; this.emptyFor = 0;
    this.res = [];
    const add = (k, n) => { for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, d = 130 + Math.sqrt(Math.random()) * (R - 200); this.res.push({ k, x: Math.cos(a) * d, y: Math.sin(a) * d, alive: 1, rt: 0 }); } };
    add('t', 45); add('r', 28); add('b', 22);
    this.reset();
  }
  reset() {
    this.c = +process.env.START_C || 0; this.night = +process.env.START_N || 1; this.fire = { fuel: 150, lvl: 1 }; this.aliens = []; this.over = 0;
    for (const r of this.res) r.alive = 1;
    for (const p of this.players.values()) this.respawn(p);
  }
  respawn(p) {
    const c = GC.BY[p.cls]; p.mhp = c.hp; p.hp = c.hp; p.down = 0; p.rev = 0;
    const a = Math.random() * 6.283; p.x = Math.cos(a) * 100; p.y = Math.sin(a) * 100;
  }
  ph() { return this.c < DAY ? 0 : this.c < DAY + DUSK ? 1 : 2; }
  add(ws, name, cls, pf) {
    const p = { id: this.nid++, ws, name, cls, prof: pf, wood: 0, stone: 0, food: 0, actcd: 0, hitcd: 0, eat: 0, inp: { dx: 0, dy: 0, act: 0, hit: 0 } };
    this.respawn(p); this.players.set(p.id, p); return p;
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
    const fr = f.fuel > 0 ? 120 + f.lvl * 40 : 0;

    for (const r of this.res) if (!r.alive && (r.rt -= dt) <= 0) r.alive = 1;
    for (const p of P) p.rv = 0;

    for (const p of P) {
      if (p.down) continue;
      const c = GC.BY[p.cls], i = p.inp;
      p.actcd -= dt; p.hitcd -= dt;
      let dx = i.dx, dy = i.dy; const m = Math.hypot(dx, dy); if (m > 1) { dx /= m; dy /= m; }
      p.x += dx * c.spd * dt; p.y += dy * c.spd * dt;
      const d = Math.hypot(p.x, p.y); if (d > R - 30) { p.x *= (R - 30) / d; p.y *= (R - 30) / d; }

      if (i.act) {
        const mate = P.find(q => q.down && dist(p, q) < 60);
        if (mate) { mate.rev += dt * c.rev; mate.rv = 1; }
        else if (p.actcd <= 0) {
          if (d < 80) {
            if (p.wood > 0) { f.fuel = Math.min(maxF, f.fuel + p.wood * 15 * c.feed); p.wood = 0; p.actcd = 0.3; }
            else if (f.lvl < 5 && p.stone >= 10 * f.lvl) { p.stone -= 10 * f.lvl; f.lvl++; p.actcd = 0.5; }
          } else {
            let best = null, bd = 55;
            for (const r of this.res) if (r.alive) { const dd = dist(p, r); if (dd < bd) { bd = dd; best = r; } }
            if (best) {
              best.alive = 0; best.rt = 45 + Math.random() * 30; p.actcd = 0.4;
              if (best.k === 't') p.wood += Math.max(1, Math.round(3 * c.wood));
              else if (best.k === 'r') p.stone += Math.max(1, Math.round(2 * c.stone));
              else p.food += Math.max(1, Math.round(2 * c.food));
            }
          }
        }
      }
      if (i.hit && p.hitcd <= 0) {
        p.hitcd = c.cd;
        let best = null, bd = c.range;
        for (const a of this.aliens) { if (a.hp <= 0) continue; const dd = dist(p, a); if (dd < bd) { bd = dd; best = a; } }
        if (best) {
          best.hp -= c.dmg * (Math.random() < c.crit ? 2 : 1);
          const kd = Math.max(1, dist(p, best)); best.x += (best.x - p.x) / kd * c.knock; best.y += (best.y - p.y) / kd * c.knock;
          if (best.hp <= 0 && p.prof) { p.prof.k++; dirty = true; if (p.prof.k % 10 === 0) award(p, 1, 'kills'); }
        }
      }
      if (p.food > 0 && p.hp < p.mhp) { p.eat -= dt; if (p.eat <= 0) { p.food--; p.hp = Math.min(p.mhp, p.hp + 12); p.eat = 1; } }
      if (c.regen && p.hp < p.mhp) p.hp = Math.min(p.mhp, p.hp + c.regen * dt);
      if (c.heal) for (const q of P) if (!q.down && q.hp < q.mhp && dist(p, q) < 90) q.hp = Math.min(q.mhp, q.hp + c.heal * dt);
    }
    for (const p of P) if (p.down) {
      if (!p.rv) p.rev = Math.max(0, p.rev - 0.5 * dt);
      if (p.rev >= 3) { p.down = 0; p.rev = 0; p.hp = p.mhp * 0.4; }
    }

    // aliens
    if (ph === 2) {
      let want = Math.min(40, 2 + this.night * 2); if (this.night % 5 === 0) want = Math.floor(want * 1.5);
      if (this.aliens.length < want && Math.random() < dt * 2) {
        const a = Math.random() * 6.283, brute = this.night % 5 === 0 && Math.random() < 0.2;
        this.aliens.push({ id: this.nid++, x: Math.cos(a) * (R + 30), y: Math.sin(a) * (R + 30), hp: brute ? 120 : 30, mhp: brute ? 120 : 30, sp: brute ? 55 : 70 + Math.min(30, this.night * 2), dmg: brute ? 20 : 10, k: brute ? 1 : 0, cd: 0 });
      }
    }
    for (const a of this.aliens) {
      if (ph !== 2) a.hp -= 25 * dt;       // sunlight burns them
      a.cd -= dt;
      let tgt = null, bd = 1e9, slow = 0;
      for (const p of P) if (!p.down) {
        const dd = dist(a, p); if (dd < bd) { bd = dd; tgt = p; }
        const sl = GC.BY[p.cls].slow; if (sl > slow && dd < 110) slow = sl;
      }
      const sp = a.sp * (1 - slow);
      const tx = tgt ? tgt.x : 0, ty = tgt ? tgt.y : 0, d = Math.max(1, Math.hypot(tx - a.x, ty - a.y));
      if (d > 20) { a.x += (tx - a.x) / d * sp * dt; a.y += (ty - a.y) / d * sp * dt; }
      const ad = Math.hypot(a.x, a.y);
      if (fr > 0 && ad < fr) { const k = fr / Math.max(1, ad); a.x = ad < 1 ? fr : a.x * k; a.y *= ad < 1 ? 1 : k; }   // repelled by firelight
      if (tgt && d < 28 && a.cd <= 0 && (fr === 0 || Math.hypot(tgt.x, tgt.y) >= fr)) {
        tgt.hp -= a.dmg; a.cd = 1;
        if (tgt.hp <= 0) { tgt.hp = 0; tgt.down = 1; tgt.rev = 0; }
      }
    }
    this.aliens = this.aliens.filter(a => a.hp > 0);
    if (P.every(p => p.down)) this.over = 6;
  }
  snap() {
    const f = this.fire;
    return JSON.stringify({
      t: 's', c: Math.round(this.c * 10) / 10, n: this.night, ph: this.ph(), o: this.over > 0 ? 1 : 0,
      f: [Math.round(f.fuel), 150 + (f.lvl - 1) * 75, f.lvl, f.fuel > 0 ? 120 + f.lvl * 40 : 0],
      p: [...this.players.values()].map(p => [p.id, p.name, p.cls, Math.round(p.x), Math.round(p.y), Math.round(p.hp), p.mhp, p.wood, p.stone, p.food, p.down, Math.round(p.rev * 10) / 10]),
      a: this.aliens.map(a => [a.id, Math.round(a.x), Math.round(a.y), Math.round(a.hp), a.mhp, a.k]),
      r: this.res.map(r => r.alive).join(''),
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
      me = room.add(ws, name, cls, pf);
      send(ws, { t: 'init', id: me.id, room: rc, R, cls, prof: view(pf), res: room.res.map(r => [r.k, Math.round(r.x), Math.round(r.y)]) });
    } else if (m.t === 'in' && me) {
      const n = v => Math.max(-1, Math.min(1, +v || 0));
      me.inp = { dx: n(m.dx), dy: n(m.dy), act: m.act ? 1 : 0, hit: m.hit ? 1 : 0 };
    }
  });
  ws.on('close', () => { if (room && me) room.players.delete(me.id); });
  ws.on('error', () => { });
});

let tk = 0;
setInterval(() => {
  tk++;
  for (const [c, r] of rooms) {
    r.tick(1 / 30);
    if (tk % 2 === 0 && r.players.size) { const s = r.snap(); for (const p of r.players.values()) if (p.ws.readyState === 1) p.ws.send(s); }
    if (r.emptyFor > 120) rooms.delete(c);
  }
}, 1000 / 30);

srv.listen(PORT, () => console.log('Island Night listening on', PORT, 'profiles:', pcount, 'dir:', DIR));
