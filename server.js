// Island Night - authoritative multiplayer server (Node + ws)
const http = require('http'), fs = require('fs'), path = require('path');
const { WebSocketServer } = require('ws');
const PORT = process.env.PORT || 80;
const PUB = path.join(__dirname, 'public');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

const srv = http.createServer((q, s) => {
  let f = q.url.split('?')[0];
  if (f === '/') f = '/index.html';
  const p = path.join(PUB, path.normalize(f));
  if (!p.startsWith(PUB)) { s.writeHead(403); return s.end(); }
  fs.readFile(p, (e, d) => {
    if (e) { s.writeHead(404); return s.end('not found'); }
    s.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    s.end(d);
  });
});

// ---- game constants ----
const R = 900;                       // island radius
const DAY = 90, DUSK = 30, NIGHT = 60, CYC = DAY + DUSK + NIGHT;
const MAXP = 8;
const CLS = {
  forester: { hp: 100, spd: 150, dmg: 10 },  // +25% wood
  marine:   { hp: 130, spd: 150, dmg: 20 },  // tough, hits hard
  tech:     { hp: 100, spd: 165, dmg: 10 },  // fire burns 25% slower
  medic:    { hp: 100, spd: 150, dmg: 8 },   // heals allies, 2x revive
};
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

class Room {
  constructor(code) {
    this.code = code; this.players = new Map(); this.nid = 1; this.emptyFor = 0; this.n = 0;
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
    const c = CLS[p.cls]; p.mhp = c.hp; p.hp = c.hp; p.down = 0; p.rev = 0;
    const a = Math.random() * 6.283; p.x = Math.cos(a) * 100; p.y = Math.sin(a) * 100;
  }
  ph() { return this.c < DAY ? 0 : this.c < DAY + DUSK ? 1 : 2; }
  add(ws, name, cls) {
    const p = { id: this.nid++, ws, name, cls, wood: 0, stone: 0, food: 0, actcd: 0, hitcd: 0, eat: 0, inp: { dx: 0, dy: 0, act: 0, hit: 0 } };
    this.respawn(p); this.players.set(p.id, p); return p;
  }
  tick(dt) {
    const P = [...this.players.values()];
    if (!P.length) { this.emptyFor += dt; return; } this.emptyFor = 0;
    if (this.over > 0) { this.over -= dt; if (this.over <= 0) this.reset(); return; }
    this.c += dt; if (this.c >= CYC) { this.c -= CYC; this.night++; }
    const ph = this.ph(), f = this.fire, maxF = 150 + (f.lvl - 1) * 75;
    const tech = P.some(p => p.cls === 'tech' && !p.down);
    f.fuel = Math.max(0, f.fuel - (ph === 0 ? 0.4 : 1) * (tech ? 0.75 : 1) * dt);
    const fr = f.fuel > 0 ? 120 + f.lvl * 40 : 0;

    for (const r of this.res) if (!r.alive && (r.rt -= dt) <= 0) r.alive = 1;
    for (const p of P) p.rv = 0;

    for (const p of P) {
      if (p.down) continue;
      const c = CLS[p.cls], i = p.inp;
      p.actcd -= dt; p.hitcd -= dt;
      let dx = i.dx, dy = i.dy; const m = Math.hypot(dx, dy); if (m > 1) { dx /= m; dy /= m; }
      p.x += dx * c.spd * dt; p.y += dy * c.spd * dt;
      const d = Math.hypot(p.x, p.y); if (d > R - 30) { p.x *= (R - 30) / d; p.y *= (R - 30) / d; }

      if (i.act) {
        const mate = P.find(q => q.down && dist(p, q) < 60);
        if (mate) { mate.rev += dt * (p.cls === 'medic' ? 2 : 1); mate.rv = 1; }
        else if (p.actcd <= 0) {
          if (d < 80) {
            if (p.wood > 0) { f.fuel = Math.min(maxF, f.fuel + p.wood * 15); p.wood = 0; p.actcd = 0.3; }
            else if (f.lvl < 5 && p.stone >= 10 * f.lvl) { p.stone -= 10 * f.lvl; f.lvl++; p.actcd = 0.5; }
          } else {
            let best = null, bd = 55;
            for (const r of this.res) if (r.alive) { const dd = dist(p, r); if (dd < bd) { bd = dd; best = r; } }
            if (best) {
              best.alive = 0; best.rt = 45 + Math.random() * 30; p.actcd = 0.4;
              if (best.k === 't') p.wood += Math.round(3 * (p.cls === 'forester' ? 1.25 : 1));
              else if (best.k === 'r') p.stone += 2; else p.food += 2;
            }
          }
        }
      }
      if (i.hit && p.hitcd <= 0) {
        p.hitcd = 0.45;
        let best = null, bd = 65;
        for (const a of this.aliens) { const dd = dist(p, a); if (dd < bd) { bd = dd; best = a; } }
        if (best) {
          best.hp -= c.dmg;
          const kd = Math.max(1, dist(p, best)); best.x += (best.x - p.x) / kd * (p.cls === 'marine' ? 40 : 22); best.y += (best.y - p.y) / kd * (p.cls === 'marine' ? 40 : 22);
        }
      }
      if (p.food > 0 && p.hp < p.mhp) { p.eat -= dt; if (p.eat <= 0) { p.food--; p.hp = Math.min(p.mhp, p.hp + 12); p.eat = 1; } }
      if (p.cls === 'medic') for (const q of P) if (!q.down && q.hp < q.mhp && dist(p, q) < 90) q.hp = Math.min(q.mhp, q.hp + 3 * dt);
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
      let tgt = null, bd = 1e9;
      for (const p of P) if (!p.down) { const dd = dist(a, p); if (dd < bd) { bd = dd; tgt = p; } }
      const tx = tgt ? tgt.x : 0, ty = tgt ? tgt.y : 0, d = Math.max(1, Math.hypot(tx - a.x, ty - a.y));
      if (d > 20) { a.x += (tx - a.x) / d * a.sp * dt; a.y += (ty - a.y) / d * a.sp * dt; }
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
      const cls = CLS[m.cls] ? m.cls : 'forester';
      let rc = String(m.room || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
      if (!rc) rc = code();
      if (!rooms.has(rc)) rooms.set(rc, new Room(rc));
      room = rooms.get(rc);
      if (room.players.size >= MAXP) { ws.send(JSON.stringify({ t: 'err', m: 'Room is full' })); return; }
      me = room.add(ws, name, cls);
      ws.send(JSON.stringify({ t: 'init', id: me.id, room: rc, R, res: room.res.map(r => [r.k, Math.round(r.x), Math.round(r.y)]) }));
    } else if (m.t === 'in' && me) {
      const n = v => Math.max(-1, Math.min(1, +v || 0));
      me.inp = { dx: n(m.dx), dy: n(m.dy), act: m.act ? 1 : 0, hit: m.hit ? 1 : 0 };
    }
  });
  ws.on('close', () => { if (room && me) room.players.delete(me.id); });
  ws.on('error', () => {});
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

srv.listen(PORT, () => console.log('Island Night listening on', PORT));
