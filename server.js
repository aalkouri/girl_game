// Island Night - authoritative multiplayer server (Node + ws) with saved player profiles
const http = require('http'), fs = require('fs'), path = require('path'), zlib = require('zlib'), crypto = require('crypto');
const { WebSocketServer } = require('ws');
const GC = require('./public/classes.js');
const RC = require('./public/recipes.js');
const PORT = process.env.PORT || 80;
const PUB = path.join(__dirname, 'public');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.txt': 'text/plain', '.webp': 'image/webp', '.png': 'image/png' };

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
process.on('uncaughtException', e => console.error('uncaught:', e && e.stack || e));   // a bug in one message handler must not take the whole server (and everyone's game) down
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { save(); auth.save(); saveRooms(); process.exit(0); });
// accounts are keyed by lower-case email. Old anonymous profiles (random 16-32 char ids) can be claimed once at sign-in.
const LEGACY = /^[A-Za-z0-9]{16,32}$/;
// test accounts with unlimited materials and diamonds: emails listed in the server's private config.json ("infiniteEmails")
// or the INFINITE_EMAILS env var (comma separated). Kept out of the repo on purpose.
const INFINITE = new Set([].concat(config.infiniteEmails || [], String(process.env.INFINITE_EMAILS || '').split(',')).map(e => String(e).trim().toLowerCase()).filter(Boolean));
const INF_N = 999, INF_D = 99999;
function acct(email, create) {
  if (!email) return null;
  let p = profiles[email];
  if (!p && create) { if (pcount > 200000) return null; p = profiles[email] = { d: 0, owned: [], k: 0, n: 0, last: 'forester', t: Date.now() }; pcount++; dirty = true; }
  if (p && INFINITE.has(email) && p.d < INF_D) { p.d = INF_D; dirty = true; }   // diamonds refill whenever the account is looked up (login, buying, joining)
  return p || null;
}
function claimLegacy(email, pid) {
  const p = acct(email, true), old = LEGACY.test(pid || '') ? profiles[pid] : null;
  if (!p || !old || (p.d || p.owned.length || p.n)) return;
  Object.assign(p, { d: old.d, owned: old.owned.slice(), k: old.k, n: old.n, last: old.last });
  delete profiles[pid]; pcount--; dirty = true;
}
const ownedOf = p => GC.DEFAULT_OWNED.concat(p ? p.owned : []);
const view = p => ({ save: p && p.save ? { at: p.save.at, n: p.save.n, bytes: p.save.bytes, gz: p.save.gz } : null, abil: p && p.abil ? Object.keys(p.abil) : [], d: p ? p.d : 0, owned: ownedOf(p), last: p && ownedOf(p).includes(p.last) ? p.last : 'forester', n: p ? p.n : 0 });
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
const R = 3600;                      // home island radius (doubled again from 1800)
const ALIEN_R = 950;                 // aliens come ashore this far from the fire
const DAY = 90, DUSK = 30, NIGHT = 60, CYC = DAY + DUSK + NIGHT;
const MAXP = 8;
const ROOM_IDLE_SEC = +process.env.ROOM_IDLE_SEC || 20 * 60;   // an empty room is kept this long; any join resets the timer
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const CAMP_CLEAR = RC.camp(RC.FIRE_MAX) + 30;          // no trees anywhere the camp can grow to (max level)
const BUSHES = 132;                  // berry bushes on home (4x the area of the 1800 island)
const HP = { t: 4, r: 3, b: 1, c: 4, p: 8, g: 5 };   // p = snowy pine (twice the chops), g = gold ore vein            // hits to break: tree 4, rock 3, berry bush 1
const STRUCT = { bench: { r: RC.RADIUS.bench }, chest: { r: RC.RADIUS.chest }, pot: { r: RC.RADIUS.pot }, smelter: { r: RC.RADIUS.smelter }, wall: { r: RC.RADIUS.wall, hp: 60 }, trap: { r: RC.RADIUS.trap } };
const CHEST_CAP = 500, REACH = 62;   // collision radius / hit points of placed structures
const SPILL = { t: 5, r: 3, c: 8, p: 12 };   // a pine gives far more wood
const SPEAR_REACH = 60;   // how much further than the normal swing the spear's poke reaches (straight ahead)
const GOLD_P = 0.01;   // chance a rock (new or regrowing) comes up as a gold ore vein
const WOODY = k => k === 't' || k === 'c' || k === 'p', ROCKY = k => k === 'r' || k === 'g';
const WOLF = { aHp: 100, aDmg: 16, aRun: 150, n: 6, outer: 8, alpha: 0.20, respawn: 40, reAggro: 3, pelt: 0.15, aPelt: 0.3, hp: 45, see: 300, give: 520, leash: 1100, run: 132, walk: 30, dmg: 9, reach: 30, cd: 1.0, fireGap: 140 };
const BIG = { 1: { name: 'bear', hp: 1000, dmg: 35, run: 105, reach: 46, cd: 1.3, walk: 26, see: 330, meat: [3, 3], pelt: 0.7 }, 2: { name: 'mammoth', hp: 2000, dmg: 50, run: 80, reach: 64, cd: 2.0, walk: 20, see: 280, meat: [6, 4], pelt: 1 } };   // snow-island giants (player walks 150): a bear takes ~30 s to kill, a mammoth ~60 s
const DIST_F = (x, y) => Math.max(0, Math.min(1, (Math.hypot(x, y) - R) / (WORLD_R - R)));   // 0 at home's shore, 1 at the far edge: out there alphas are common and bears / mammoths appear   // snow wolves: count, respawn s, hp, notice range, give-up range, max chase from home spot, speeds (players walk 150), bite   // a cactus gives more wood than a tree
// ---------- the archipelago: island 0 is home (all forest); the others are random sizes, each 25% forest on the side facing home and 75% its own biome (b) ----------
const WORLD_R = 30000, BOAT_SPEED = 190, BOAT_AHEAD = 100, ISL_VER = 5;   // ISL_VER: bump when island generation changes so saved rooms regenerate their outer islands
function seeded(code) { let h = 2166136261; for (const ch of String(code)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); let a = h >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
// every outer island is at least as big as home (radius R to 1.4 R). The two nearest sit 500-1100 of open sea from home's shore
// (about the same sail as before); the rest spread out across the world with at least 450 of sea between any two shores
const ISL_MIN = R, ISL_MAX = R * 1.4, ISL_GAP = 450;
function genIslands(code) {
  const rnd = seeded(code), out = [{ x: 0, y: 0, r: R, b: 'f' }]; let tries = 0;
  while (out.length < 11 && tries++ < 20000) {
    const near = out.length <= 2, r = ISL_MIN + rnd() * (ISL_MAX - ISL_MIN), lo = R + r + (near ? 500 : ISL_GAP), hi = near ? lo + 600 : WORLD_R - r - 300;
    const dist = lo + rnd() * (hi - lo), a = rnd() * 6.283, x = Math.cos(a) * dist, y = Math.sin(a) * dist;
    if (out.some(i => Math.hypot(x - i.x, y - i.y) < r + i.r + ISL_GAP)) continue;   // keep water between islands
    out.push({ x: Math.round(x), y: Math.round(y), r: Math.round(r), b: (q => q < 0.3 ? 'm' : q < 0.65 ? 's' : 'd')(rnd()) });   // the 75% biome: snow, desert, or a random mix of both ('m')
  }
  if (out.length > 2 && !out.some(i => i.b === 's' || i.b === 'm')) out[out.length - 1].b = 's';   // always at least one snow island
  if (out.length > 2 && !out.slice(1).some(i => i.b === 'd' || i.b === 'm')) out[out.length - 1].b = 'd';   // and at least one desert
  return out;
}
function islandRes(is, idx, code) {
  const rnd = seeded(code + '#' + idx), A = Math.PI * is.r * is.r, out = [];
  // part: true = only in the forest quarter, false = only in the biome's three quarters, null = anywhere
  const add = (k, n, part, biome) => { for (let i = 0, tries = 0; i < n && tries < n * 40; tries++) { const a = rnd() * 6.283, d = 30 + Math.sqrt(rnd()) * (is.r - 110), x = is.x + Math.cos(a) * d, y = is.y + Math.sin(a) * d; if (part !== null && RC.inForestPart(is.x, is.y, is.r, x, y) !== part) continue; if (biome && RC.biomeAt(is.x, is.y, is.r, is.b, x, y) !== biome) continue; const kk = k === 'r' && rnd() < GOLD_P ? 'g' : k; out.push({ k: kk, x, y, hp: HP[kk], mhp: HP[kk], rt: 0, isl: idx }); i++; } };
  add('t', Math.max(2, Math.round(A * 0.25 * 1.3e-5)), true); add('b', Math.max(1, Math.round(A * 0.25 * 3.2e-6)), true);   // forest quarter: trees + berry bushes
  const half = is.b === 'm' ? 0.5 : 1;   // a mixed island has cacti on its desert half and pines on its snow half
  if (is.b === 'd' || is.b === 'm') add('c', Math.max(3, Math.round(A * 0.75 * half * 1.1e-5)), false, 'd');   // desert: cacti
  if (is.b === 's' || is.b === 'm') add('p', Math.max(3, Math.round(A * 0.75 * half * 1.0e-5)), false, 's');   // snow: snowy pines
  add('r', Math.max(2, Math.round(A * 8e-6)), null);
  return out;
}
// end-of-run payout: 1 diamond per day survived up to day 20, 2 per day for days 21-60, 3 per day after that
const runPayout = days => { let t = 0; for (let d = 1; d <= days; d++) t += d <= 20 ? 1 : d <= 60 ? 2 : 3; return t; };
// ---------- loot areas: every outer island has 5-8 of them (small clusters of biome decorations); near each there may be a chest (3 tiers) and/or a trader ----------
function genLoot(islands, code) {
  const out = []; let id = 1;
  for (let i = 1; i < islands.length; i++) {
    const is = islands[i], rnd = seeded(code + '@loot' + i), n = 5 + Math.floor(rnd() * 4);
    for (let k = 0, tries = 0; k < n && tries < 800; tries++) {
      const a = rnd() * 6.283, d = 160 + Math.sqrt(rnd()) * Math.max(100, is.r - 520), x = is.x + Math.cos(a) * d, y = is.y + Math.sin(a) * d;
      if (out.some(l => l.isl === i && Math.hypot(l.x - x, l.y - y) < 500)) continue;
      const q = rnd(), tier = q < 0.30 ? 1 : q < 0.50 ? 2 : q < 0.58 ? 3 : 0, trader = rnd() < 0.18 ? 1 + Math.floor(rnd() * 5) : 0, seed = Math.floor(rnd() * 1e6), ca = (seed % 628) / 100;
      out.push({ id: id++, isl: i, x: Math.round(x), y: Math.round(y), b: RC.biomeAt(is.x, is.y, is.r, is.b, x, y), seed, tier, cx: Math.round(x + Math.cos(ca) * 90), cy: Math.round(y + Math.sin(ca) * 90), trader, tx: Math.round(x + Math.cos(ca + 3.14159) * 105), ty: Math.round(y + Math.sin(ca + 3.14159) * 105), open: 0 }); k++;
    }
  }
  const have = new Set(out.map(l => l.trader)), rnd = seeded(code + '@traders');   // every kind of trader exists somewhere in the world
  for (let t = 1; t <= 5; t++) if (!have.has(t)) { const c = out.filter(l => !l.trader); if (c.length) c[Math.floor(rnd() * c.length)].trader = t; }
  return out;
}
const SLOTS = 3, TRAP_SEC = 20, ARROW_SPEED = 520;
const slotCap = (p, room) => { const b = p.boat && room.boats.find(x => x.id === p.boat); return SLOTS + (b ? RC.BOATS[b.type || 'boat'].slots : 0); };   // bigger boats carry extra slots while you are aboard
const RAB = { home: 20, outer: 8, respawn: 6, see: 260, run: 95, walk: 28, edge: 45, foot: 0.10 };   // rabbits: counts per island, seconds between top-ups, flee range, speeds (players walk 150), shore margin, foot drop chance   // how long a trap holds the big monster   // cooked food you can carry
const REVIVE = { sec: 10, hp: .5, decay: 1 };   // a downed player is revived by a teammate standing still next to them and holding ACT for 10 s (Medic-type classes are faster); they come back with half health
const STA = { max: 100, drain: 16, regen: 22, delay: 1, tiredDelay: 1.6, resume: 30, sprint: 1.7, swing: 8, bush: 5, attack: 6 };   // stamina: a full-stick run drains 16/s (~6 s), refills 22/s after a 1 s rest; at 0 you are winded (no running, chopping, mining or attacking) until it climbs back to 30%; every chop/mine/pick costs 8/8/5 and every attack swing 6
// ---------- saving a game to your account: one save per account (the newest), gzipped, in <data dir>/saves ----------
const saveFile = email => DIR && path.join(DIR, 'saves', crypto.createHash('sha1').update(email).digest('hex').slice(0, 20) + '.json.gz');
function writeSave(email, blob) {
  const f = saveFile(email); if (!f) return null;
  const json = JSON.stringify(blob), gz = zlib.gzipSync(json, { level: 9 });
  fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f + '.tmp', gz); fs.renameSync(f + '.tmp', f);
  return { bytes: json.length, gz: gz.length };
}
function readSave(email) { try { return JSON.parse(zlib.gunzipSync(fs.readFileSync(saveFile(email))).toString()); } catch (e) { return null; } }
// the Charger: from night 4 on, one huge, very fast enemy per night that hammers players far backwards and vanishes at dawn
const CHARGER = { firstNight: 4, sp0: 115, spPerNight: 5, spMax: 185, dmg: 25, rad: 36, reach: 62, stop: 44, knock: 300, stunSec: 0.6 };               // logs per tree / stones per rock (before class bonus)

class Room {
  constructor(code) {
    this.code = code; this.away = new Map(); this.players = new Map(); this.nid = 1; this.emptyFor = 0;
    this.res = [];
    const add = (k, n, min = 130) => { for (let i = 0, tries = 0; i < n && tries < n * 20; tries++) {
      const a = Math.random() * 6.283, d = min + Math.sqrt(Math.random()) * (R - 70 - min), x = Math.cos(a) * d, y = Math.sin(a) * d, snow = RC.inSnow(x, y);
      if (k === 'b' && snow) continue;   // no berries in the snow
      const kk = k === 't' && snow ? 'p' : k === 'r' && Math.random() < GOLD_P ? 'g' : k;   // trees in the snow quarter are snowy pines
      this.res.push({ k: kk, x, y, hp: HP[kk], mhp: HP[kk], rt: 0 }); i++;
    } };
    add('t', 540, CAMP_CLEAR); add('r', 336); add('b', BUSHES);   // 4x the area of the old island, same density
    this.islands = genIslands(code); this.islands.forEach((is, i) => { if (i > 0) this.res.push(...islandRes(is, i, code)); });
    this.loot = genLoot(this.islands, code);
    this.reset();
  }
  endRun() {   // everyone is down: pay out by days survived, send everyone back to the title screen, and start the room fresh
    const days = Math.max(0, this.night - 1), pay = runPayout(days);
    for (const p of this.players.values()) {
      p.ended = 1; let got = 0;
      if (p.prof && pay > 0) { const before = p.prof.d; award(p, pay, 'run'); got = p.prof.d - before; }
      send(p.ws, { t: 'over', n: days, d: got, total: p.prof ? p.prof.d : 0 });
    }
    this.players.clear(); this.away.clear(); this.reset();
  }
  reset() {
    this.c = +process.env.START_C || 0; this.night = +process.env.START_N || 1; this.fire = { fuel: 150, lvl: 1 }; this.aliens = []; this.over = 0;
    for (const r of this.res) r.hp = r.mhp;
    if (process.env.START_BREAKALL) for (const r of this.res) { r.hp = 0; r.rt = 1e9; }   // (test hook: size a worst-case save)
    this.drops = []; this.pend = []; this.struct = []; this.chargerNight = 0; this.islNight = {}; this.boats = []; this.camps = []; this.bullets = []; this.zones = []; this.turrets = []; for (const l of this.loot || []) l.open = 0; this.arrows = []; this.rabbits = []; this.rabT = 0; this.rabFull = 0; this.wolves = []; this.wolfT = 0; this.raidNight = 0; this.scrapFound = !!process.env.START_SCRAPFOUND;
    if (process.env.START_BENCH) this.struct.push({ id: this.nid++, k: 'bench', x: 110, y: 0, r: RC.RADIUS.bench, hp: 0, mhp: 0, rot: 0 });   // (test hook)
    for (const p of this.players.values()) { this.respawn(p); p.gear = {}; p.buff = { speed: 0, regen: 0, dmg: 0 }; p.kb = null; p.slots = []; }
  }
  respawn(p) {
    const c = GC.BY[p.cls]; p.mhp = c.hp; p.hp = c.hp; p.down = 0; p.rev = 0; p.sta = STA.max; p.tired = 0; p.staCd = 0;
    const a = Math.random() * 6.283; p.x = Math.cos(a) * 100; p.y = Math.sin(a) * 100;
    if (process.env.START_TRADER) { const l = (this.loot || []).find(x => x.trader === +process.env.START_TRADER); if (l) { p.x = l.tx - 30; p.y = l.ty; return; } }   // (test hook: start next to a trader)
    if (process.env.START_ISL) { const is = this.islands[+process.env.START_ISL]; if (is) { p.x = is.x; p.y = is.y; } }   // (test hook: start on an outer island)
  }
  // a broken tree/rock leaves pickups on the ground after its fall/crumble animation (client shows them when they appear)
  spendSta(p, amt) {   // chopping, mining, picking and attacking cost stamina; while winded (after hitting 0) you can't until it refills to 30%
    if (p.tired || p.sta <= 0) return false;
    p.sta = Math.max(0, p.sta - amt); p.staCd = STA.delay; if (p.sta <= 0) { p.tired = 1; p.staCd = STA.tiredDelay; }
    return true;
  }
  winded(p) { const now = Date.now(); if (now - (p.windedAt || 0) > 1500) { p.windedAt = now; send(p.ws, { t: 'toast', msg: 'Out of breath!' }); } }
  onIsland(p, i) { return i === 0 ? Math.hypot(p.x, p.y) < R + 40 : this.landAt(p.x, p.y, 0) === i; }
  // night enemies for one island. Home always gets them (they gather around the fire); any other island only while someone
  // is standing on it: the same mix (aliens, brutes, the Charger, villager raids), coming ashore, scaled to the island's size
  nightSpawns(i, P, dt) {
    const is = this.islands[i], home = i === 0, here = P.filter(p => !p.boat && this.onIsland(p, i));
    if (!home && !here.some(p => !p.down)) return;
    const st = home ? this : (this.islNight[i] = this.islNight[i] || { chargerNight: 0, raidNight: 0 });
    const size = home ? 1 : Math.min(1, Math.max(0.15, is.r / R));   // never more than home gets
    const at = (ang, out = 0) => home ? [Math.cos(ang) * (ALIEN_R + out), Math.sin(ang) * (ALIEN_R + out)] : [is.x + Math.cos(ang) * (is.r - 40), is.y + Math.sin(ang) * (is.r - 40)];
    let want = Math.min(40, 2 + this.night * 2); if (this.night % 5 === 0) want = Math.floor(want * 1.5);
    if (!home) want = Math.max(2, Math.round(want * size));
    if (this.night >= CHARGER.firstNight && st.chargerNight !== this.night) {
      st.chargerNight = this.night; const [x, y] = at(Math.random() * 6.283), hp = 1;   // it cannot be hurt; hp only exists so dawn can remove it
      this.aliens.push({ id: this.nid++, isl: i, x, y, hp, mhp: hp, sp: Math.min(CHARGER.spMax, CHARGER.sp0 + CHARGER.spPerNight * (this.night - CHARGER.firstNight)), dmg: CHARGER.dmg, k: 2, cd: 0, rad: CHARGER.rad, reach: CHARGER.reach, stop: CHARGER.stop });
    }
    if (this.night % 5 === 0 && st.raidNight !== this.night) {   // every 5th night villagers raid: 3 the first time, one more each time, stronger every night
      st.raidNight = this.night; const n = 3 + (this.night / 5 - 1), s = 1 + 0.04 * (this.night - 1), a0 = Math.random() * 6.283, arch = Math.floor(n / 2);
      for (let k = 0; k < n; k++) {
        const [x, y] = at(a0 + (k - (n - 1) / 2) * (home ? 0.22 : 0.5), 40), archer = k < arch, hp = Math.round((archer ? 30 : 45) * s);
        this.aliens.push({ id: this.nid++, isl: i, x, y, hp, mhp: hp, sp: archer ? 70 : 80, dmg: (archer ? 6 : 7) * s, k: archer ? 4 : 3, cd: 0, atkCd: 1.5, reach: archer ? 0 : 30, stop: archer ? 250 : 22, range: 290, aim: 0, shotCd: 0 });
      }
      for (const q of home ? P : here) send(q.ws, { t: 'raid', n });
    }
    if (this.aliens.filter(a => (a.isl | 0) === i && a.k < 2).length < want && Math.random() < dt * 2) {
      const [x, y] = at(Math.random() * 6.283), brute = this.night % 5 === 0 && Math.random() < 0.2;
      this.aliens.push({ id: this.nid++, isl: i, x, y, hp: brute ? 120 : 30, mhp: brute ? 120 : 30, sp: brute ? 55 : 70 + Math.min(30, this.night * 2), dmg: brute ? 20 : 10, k: brute ? 1 : 0, cd: 0 });
    }
  }
  landAt(x, y, m = 30) { for (let i = 0; i < this.islands.length; i++) { const s = this.islands[i]; if (Math.hypot(x - s.x, y - s.y) < s.r - m) return i; } return -1; }
  isWater(x, y) { if (Math.hypot(x, y) > WORLD_R) return false; for (const s of this.islands) if (Math.hypot(x - s.x, y - s.y) < s.r + 40) return false; return true; }
  landPoint(x, y, m = 30) { let best = null, bd = 1e9; for (const s of this.islands) { const d = Math.hypot(x - s.x, y - s.y) - s.r; if (d < bd) { bd = d; best = s; } } const dx = x - best.x, dy = y - best.y, L = Math.hypot(dx, dy) || 1, k = Math.min(L, best.r - m) / L; return [best.x + dx * k, best.y + dy * k]; }
  // ----- boats: placed in the water near the shore; two riders, the first one steers -----
  tickBoats(dt) {
    for (const b of this.boats) {
      b.riders = b.riders.filter(id => { const p = this.players.get(id); return p && p.boat === b.id; });
      if (!b.riders.includes(b.drv)) b.drv = b.riders[0] || 0;
      const d = b.drv && this.players.get(b.drv);
      if (d && !d.down) {
        const i = d.inpAt && Date.now() - d.inpAt > 400 ? { dx: 0, dy: 0 } : d.inp; let dx = i.dx, dy = i.dy; const m = Math.hypot(dx, dy); if (m > 1) { dx /= m; dy /= m; }
        if (m > 0.1) {
          const sp = (RC.BOATS[b.type || 'boat'].speed) * Math.min(1, m), nx = b.x + dx * sp * dt, ny = b.y + dy * sp * dt;
          if (this.isWater(nx, ny)) { b.x = nx; b.y = ny; } else if (this.isWater(nx, b.y)) b.x = nx; else if (this.isWater(b.x, ny)) b.y = ny;
          const da = ((Math.atan2(dy, dx) - b.ang + Math.PI) % 6.283185 + 6.283185) % 6.283185 - Math.PI; b.ang += da * Math.min(1, dt * 5);
        }
      }
      b.riders.forEach((id, k) => { const p = this.players.get(id), o = k === 0 ? 12 : -14; p.x = b.x + Math.cos(b.ang) * o; p.y = b.y + Math.sin(b.ang) * o; p.fa = b.ang; });
    }
  }
  boatNear(p) { let best = null, bd = 125; for (const b of this.boats) { const d = Math.hypot(p.x - b.x, p.y - b.y); if (d < bd) { bd = d; best = b; } } return best; }
  enterBoat(p, b) {
    if (b.riders.length >= RC.BOATS[b.type || 'boat'].riders) { send(p.ws, { t: 'toast', msg: 'The boat is full.' }); return; }
    b.riders.push(p.id); p.boat = b.id; if (!b.drv) b.drv = p.id; p.x = b.x; p.y = b.y;
  }
  releaseBoat(p) { if (!p.boat) return; const b = this.boats.find(x => x.id === p.boat); p.boat = 0; if (b) { b.riders = b.riders.filter(id => id !== p.id); if (b.drv === p.id) b.drv = b.riders[0] || 0; } }
  exitBoat(p) {   // step out onto the nearest shore (must be close to land)
    const b = this.boats.find(x => x.id === p.boat); if (!b) { p.boat = 0; return; }
    let best = null, bd = 1e9; for (const s of this.islands) { const d = Math.hypot(b.x - s.x, b.y - s.y) - s.r; if (d < bd) { bd = d; best = s; } }
    if (!best || bd > 120) { send(p.ws, { t: 'toast', msg: 'Sail closer to land to get out.' }); return; }
    const dx = b.x - best.x, dy = b.y - best.y, k = (best.r - 50) / (Math.hypot(dx, dy) || 1); this.releaseBoat(p); p.x = best.x + dx * k; p.y = best.y + dy * k;
  }
  placeBoat(p, i) {
    const fail = msg => ({ ok: false, msg });
    if (p.down || p.boat) return fail('Not now.'); if (!RC.BOATS[p.slots[i]]) return fail('You have no boat there.');
    const x = p.x + Math.cos(p.fa) * BOAT_AHEAD, y = p.y + Math.sin(p.fa) * BOAT_AHEAD;
    if (!this.isWater(x, y)) return fail('A boat can only go in the water - stand at the shore and face the sea.');
    if (this.boats.some(b => Math.hypot(b.x - x, b.y - y) < 90)) return fail('Too close to another boat.');
    const type = p.slots[i]; p.slots.splice(i, 1); this.boats.push({ id: this.nid++, type, x, y, ang: p.fa, riders: [], drv: 0 });
    return { ok: true, msg: 'Boat placed. Walk up to it and press ACT to get in.' };
  }
  // ===== campfires, loot, traders, abilities =====
  fires() { return [{ f: this.fire, x: 0, y: 0, home: true }, ...this.camps.map(c => ({ f: c, x: c.x, y: c.y }))]; }
  litAt(x, y, margin = 0) { for (const F of this.fires()) if (F.f.fuel > 0 && Math.hypot(x - F.x, y - F.y) < RC.camp(F.f.lvl) + margin) return F; return null; }
  campOf(p) { for (const F of this.fires()) if (Math.hypot(p.x - F.x, p.y - F.y) < RC.camp(F.f.lvl)) return F; return null; }   // the campfire whose ring you stand in (home or a camp on another island)
  inCamp(F, st) { return Math.hypot(st.x - F.x, st.y - F.y) < RC.camp(F.f.lvl); }
  fireNear(p, r = 80) { let best = null, bd = r; for (const F of this.fires()) { const d = Math.hypot(p.x - F.x, p.y - F.y); if (d < bd) { bd = d; best = F; } } return best; }
  placeCampfire(p, i) {   // tap the Campfire in a slot: it is lit where you stand (outer islands only, away from the shore)
    const no = msg => send(p.ws, { t: 'toast', msg });
    if (p.boat) return no('Not from a boat.');
    const ii = this.landAt(p.x, p.y); if (ii <= 0) return no('Campfires go on the outer islands - home already has its fire.');
    const is = this.islands[ii]; if (Math.hypot(p.x - is.x, p.y - is.y) > is.r - 250) return no('Too close to the shore.');
    if (this.camps.some(c => c.isl === ii)) return no('This island already has a campfire - only one per island.');
    if (this.camps.some(c => Math.hypot(c.x - p.x, c.y - p.y) < 260)) return no('Too close to another campfire.');
    p.slots.splice(i, 1); this.camps.push({ id: this.nid++, isl: ii, x: p.x, y: p.y, fuel: 120, lvl: 1 }); send(p.ws, { t: 'camped' });
  }
  lootNear(p, kind) {
    for (const l of this.loot) {
      if (kind === 'chest') { if (l.tier && !l.open && Math.hypot(p.x - l.cx, p.y - l.cy) < 80) return l; }
      else if (l.trader && Math.hypot(p.x - l.tx, p.y - l.ty) < 100) return l;
    }
    return null;
  }
  openChest(p, l) {
    const R2 = (a, b) => a + Math.floor(Math.random() * (b - a + 1)), got = [];
    const give = (k, n, e) => { if (n > 0) { p[k] = (p[k] || 0) + n; got.push('+' + n + ' ' + e); } };
    const t = l.tier;
    // chests hold only what the traders want: scrap and gold (pelts come from wolves)
    give('scrap', t === 1 ? R2(2, 4) : t === 2 ? R2(5, 8) : R2(9, 14), '🔩'); if (t >= 2) give('gold', t === 2 ? R2(1, 2) : R2(3, 5), '🪙');
    const dia = t === 3 ? R2(2, 4) : t === 2 && Math.random() < 0.3 ? 1 : 0; if (dia) { award(p, dia, 'chest'); got.push('+' + dia + ' 💎'); }
    l.open = 1; this.scrapFound = this.scrapFound || got.some(g => g.includes('🔩'));
    send(p.ws, { t: 'loot', tier: t, msg: ['', 'Small', 'Silver', 'Golden'][t] + ' chest: ' + got.join('  ') });
  }
  trade(p, lid, offerId) {
    const fail = msg => ({ ok: false, msg }), l = this.loot.find(x => x.id === lid);
    if (!l || !l.trader || p.down) return fail('No trader here.');
    if (Math.hypot(p.x - l.tx, p.y - l.ty) > 150) return fail('Stand next to the trader.');
    let cost, apply;
    if (l.trader === 5) {
      const cid = String(offerId).replace('abil:', ''), c = GC.BY[cid], pf = p.prof;
      if (!c || !pf || !ownedOf(pf).includes(cid)) return fail('You do not own that class.');
      if (pf.abil && pf.abil[cid]) return fail('Already unlocked.');
      cost = GC.abilCost(c); apply = () => { pf.abil = pf.abil || {}; pf.abil[cid] = 1; dirty = true; };
    } else {
      const o = RC.TRADERS[l.trader].offers.find(x => x.id === offerId); if (!o) return fail('Unknown offer.');
      if (o.armor && (p.gear.armor || 0) >= o.armor) return fail('You already wear equal or better armor.'); if (o.gear && p.gear[o.gear]) return fail('You already have that.');
      cost = o.cost;
      apply = () => {
        if (o.armor) p.gear.armor = o.armor; else if (o.gear) p.gear[o.gear] = true;
        else if (o.item) { if (p.slots.length < slotCap(p, this)) p.slots.push(o.item); else { const q = this.landPoint(p.x + 30, p.y + 30, 50); this.pend.push({ k: 'q', food: o.item, x: q[0], y: q[1], t: 0.2 }); } }
      };
    }
    for (const k in cost) if ((p[k] || 0) < cost[k]) return fail('You need ' + Object.entries(cost).map(([a, b]) => b + ' ' + a).join(', ') + '.');
    for (const k in cost) p[k] -= cost[k]; apply();
    return { ok: true, msg: 'Deal!' };
  }
  hurt(p, d) {   // every hit on a player goes through here (armor, Bulwark, Blood Rage)
    const B = p.buff; d *= 1 - Math.min(0.6, RC.ARMOR[p.gear.armor || 0] + RC.armorOf(p.gear)); if (B.shield > 0) d *= 0.3; if (B.rage > 0) d *= 1.5;
    p.hp -= d; if (p.hp <= 0) { p.hp = 0; p.down = 1; p.rev = 0; }
  }
  killCredit(p, a) { if (a.hp <= 0 && !a.cred) { a.cred = 1; if (p.prof) { p.prof.k++; dirty = true; if (p.prof.k % 10 === 0) award(p, 1, 'kills'); } } }
  aoe(p, x, y, r, dmg, stun) {   // damage (and stun) every alien and wolf in a circle; the Charger cannot be hurt
    for (const a of this.aliens) if (a.hp > 0 && a.k !== 2 && Math.hypot(a.x - x, a.y - y) < r) { a.hp -= dmg; if (stun) a.stunT = stun; this.killCredit(p, a); }
    for (const w of this.wolves || []) if (w.hp > 0 && Math.hypot(w.x - x, w.y - y) < r) { w.hp -= dmg; w.st = 1; w.tg = p.id; this.killCredit(p, w); }
    for (const q of this.players.values()) send(q.ws, { t: 'fx', k: 'boom', x, y, r });
  }
  shoot(p, ang, dmg, speed, ttl, kind) { this.bullets.push({ id: this.nid++, x: p.x, y: p.y, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, dmg, ttl, owner: p.id, kind: kind || 0 }); }
  useAbility(p) {
    const c = GC.BY[p.cls], ab = GC.ABIL[p.cls], no = msg => send(p.ws, { t: 'toast', msg });
    if (!ab || p.down || p.boat) return;
    if (!(p.prof && p.prof.abil && p.prof.abil[p.cls])) return no('Locked - find an Ability Unlocker trader on the outer islands.');
    if (p.abilCd > 0) return no(ab.n + ' is recharging (' + Math.ceil(p.abilCd) + 's).');
    const B = p.buff, R2 = (a, b) => a + Math.floor(Math.random() * (b - a + 1)), here = this.landAt(p.x, p.y), all = [...this.players.values()];
    const ahead = d => [p.x + Math.cos(p.fa) * d, p.y + Math.sin(p.fa) * d];
    switch (ab.id) {
      case 'timber': case 'quake': {
        let n = 0; for (const r of this.res) if (r.hp > 0 && (ab.id === 'timber' ? WOODY(r.k) : ROCKY(r.k)) && Math.hypot(r.x - p.x, r.y - p.y) < 260) { r.hp = 0; r.rt = 45 + Math.random() * 30; this.spill(r, Math.max(1, Math.round(SPILL[r.k] * (ab.id === 'timber' ? c.wood : c.stone)))); n++; }
        this.rForce = 1; for (const q of all) send(q.ws, { t: 'fx', k: 'boom', x: p.x, y: p.y, r: 260 }); if (!n) return no('Nothing in reach.'); break; }
      case 'harvest': { for (const r of this.res) if (r.k === 'b' && Math.hypot(r.x - p.x, r.y - p.y) < 500) r.hp = r.mhp; p.food += Math.round(8 * c.food); this.rForce = 1; break; }
      case 'grenade': { const [x, y] = ahead(260); this.aoe(p, x, y, 130, 60, 2); break; }
      case 'meteor': { const [x, y] = ahead(350); this.aoe(p, x, y, 170, 120, 1); break; }
      case 'inferno': this.aoe(p, p.x, p.y, 220, 50, 2); break;
      case 'signal': { const F = this.fireNear(p, 600); if (!F) return no('No campfire close enough.'); F.f.fuel = RC.fuelMax(F.f.lvl); F.f.slow = 60; break; }
      case 'massrevive': for (const q of all) { if (q.down) { q.down = 0; q.rev = 0; q.hp = q.mhp * 0.5; } q.hp = Math.min(q.mhp, q.hp + q.mhp * 0.3); send(q.ws, { t: 'fx', k: 'heal' }); } break;
      case 'sprint': B.haste = 6; break;
      case 'bulwark': for (const q of all) if (!q.down && Math.hypot(q.x - p.x, q.y - p.y) < 220) B.shield = 8, q.buff.shield = 8; break;
      case 'volley': for (let k = 0; k < 16; k++) this.shoot(p, k / 16 * 6.2832, 25, 700, 0.6, 1); break;
      case 'flurry': B.flurry = 6; break;
      case 'turret': this.turrets.push({ id: this.nid++, x: p.x, y: p.y, ttl: 20, cd: 0, owner: p.id }); break;
      case 'totem': this.zones.push({ id: this.nid++, k: 1, x: p.x, y: p.y, r: 300, ttl: 8 }); break;
      case 'beacon': this.zones.push({ id: this.nid++, k: 2, x: p.x, y: p.y, r: 260, ttl: 10 }); break;
      case 'rage': B.rage = 8; break;
      case 'jackpot': { p.wood += R2(20, 40); p.stone += R2(20, 40); p.food += R2(6, 12); p.scrap += R2(3, 8); if (Math.random() < 0.25) award(p, R2(1, 3), 'jackpot'); break; }
      case 'rally': for (const q of all) if (!q.down && !q.boat && this.landAt(q.x, q.y) === here) { q.hp = Math.min(q.mhp, q.hp + q.mhp * 0.4); q.buff.speed = 8; } break;
      case 'shadowstep': { const [x, y] = ahead(380); if (this.landAt(x, y) >= 0) { p.x = x; p.y = y; } else { const q = this.landPoint(x, y); p.x = q[0]; p.y = q[1]; } B.crit3 = 10; break; }
      case 'legendary': p.hp = p.mhp; B.power = 8; break;
    }
    p.abilCd = ab.cd; send(p.ws, { t: 'abilUsed', n: ab.n, b: p.buff });
  }
  stepBattle(P, dt) {   // bullets, turrets and zones (totems, beacons)
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i]; b.x += b.vx * dt; b.y += b.vy * dt; b.ttl -= dt; let dead = b.ttl <= 0; const owner = this.players.get(b.owner);
      if (!dead) for (const a of this.aliens) if (a.hp > 0 && a.k !== 2 && Math.hypot(a.x - b.x, a.y - b.y) < (a.rad || 22)) { a.hp -= b.dmg; if (owner) this.killCredit(owner, a); dead = true; break; }
      if (!dead) for (const w of this.wolves || []) if (w.hp > 0 && Math.hypot(w.x - b.x, w.y - b.y) < 24) { w.hp -= b.dmg; w.st = 1; w.tg = b.owner; if (owner) this.killCredit(owner, w); dead = true; break; }
      if (dead) this.bullets.splice(i, 1);
    }
    for (let i = this.turrets.length - 1; i >= 0; i--) {
      const t = this.turrets[i]; t.ttl -= dt; t.cd -= dt; if (t.ttl <= 0) { this.turrets.splice(i, 1); continue; }
      if (t.cd <= 0) { let best = null, bd = 450; for (const a of this.aliens) if (a.hp > 0 && a.k !== 2) { const d = Math.hypot(a.x - t.x, a.y - t.y); if (d < bd) { bd = d; best = a; } }
        if (best) { t.cd = 0.8; const ang = Math.atan2(best.y - t.y, best.x - t.x); this.bullets.push({ id: this.nid++, x: t.x, y: t.y, vx: Math.cos(ang) * 800, vy: Math.sin(ang) * 800, dmg: 14, ttl: 0.7, owner: t.owner, kind: 2 }); } }
    }
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const z = this.zones[i]; z.ttl -= dt; if (z.ttl <= 0) { this.zones.splice(i, 1); continue; }
      if (z.k === 1) { for (const q of P) if (!q.down && Math.hypot(q.x - z.x, q.y - z.y) < z.r) q.hp = Math.min(q.mhp, q.hp + 8 * dt); for (const a of this.aliens) if (a.k !== 2 && Math.hypot(a.x - z.x, a.y - z.y) < z.r) a.slowT = 0.3; }
      else for (const a of this.aliens) if (a.k !== 2) { const dx = a.x - z.x, dy = a.y - z.y, d = Math.hypot(dx, dy); if (d < z.r) { const k = Math.min(z.r - d, 220 * dt) / Math.max(1, d); a.x += dx * k; a.y += dy * k; } }
    }
  }
  spill(r, n) {
    const wood = WOODY(r.k), delay = wood ? .95 : .5, kind = wood ? 'w' : r.k === 'b' ? 'f' : r.k === 'g' ? 'o' : 's';
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283, d = 24 + Math.random() * 28; let x = r.x + Math.cos(a) * d, y = r.y + Math.sin(a) * d;
      { const s = this.islands[r.isl | 0] || this.islands[0], dx = x - s.x, dy = y - s.y, dd = Math.hypot(dx, dy); if (dd > s.r - 40) { x = s.x + dx * (s.r - 40) / dd; y = s.y + dy * (s.r - 40) / dd; } }
      this.pend.push({ k: kind, x, y, t: delay });
    }
  }
  craft(p, id, rot) {
    const r = RC.BY[id], fail = msg => ({ ok: false, msg });
    if (!r) return fail('Unknown recipe.');
    if (p.down) return fail('You are down.');
    const CF = this.campOf(p), hasBench = !!CF && this.struct.some(st => st.k === 'bench' && this.inCamp(CF, st));
    if (r.kind === 'bench' && hasBench) return fail('This camp already has a crafting bench.');
    if (r.kind !== 'bench' && !hasBench) return fail(CF ? 'Build a crafting bench in this camp first.' : 'Stand inside a camp to craft.');
    if (r.kind === 'gear' && p.gear[r.gear]) return fail('You already have that.');
    if (!this.canPay(p, r.cost)) return fail('Not enough materials (your bag plus the chests).');
    if (r.kind === 'boat' || r.kind === 'item') {   // items (boat, trap) go into a free slot, or onto the floor next to you when all 3 are full
      if (r.scrap && !this.scrapFound) return fail('Nobody has found scrap yet.');
      this.pay(p, r.cost); const it = r.item || 'boat';
      if (p.slots.length < slotCap(p, this)) { p.slots.push(it); return { ok: true, msg: r.n + ' crafted - it is in your slot.' }; }
      const q = this.landPoint(p.x + 30, p.y + 30, 50); this.pend.push({ k: 'q', food: it, x: q[0], y: q[1], t: 0.2 });
      return { ok: true, msg: r.n + ' crafted - your slots are full, so it dropped on the floor.' };
    }
    if (r.kind !== 'gear') {
      if (!CF) return fail('Stand inside a camp to build.');
      const x = p.x + Math.cos(p.fa) * 58, y = p.y + Math.sin(p.fa) * 58, d = Math.hypot(x - CF.x, y - CF.y), campR = RC.camp(CF.f.lvl), isl = this.islands[CF.f.isl | 0] || this.islands[0];
      const sr = STRUCT[r.kind].r, station = r.kind !== 'wall' && r.kind !== 'trap';
      if (d < RC.fireClear(r.kind)) return fail('Too close to the fire. Nothing can be built on or against it.');
      if (station && d > campR) return fail('Stand inside the camp (the fire ring), a little away from the fire, facing a free spot.');
      if (!station && d > campR + 200) return fail('Walls and traps go in or just outside the camp.');
      if (Math.hypot(x - isl.x, y - isl.y) > isl.r - 50) return fail('Too close to the water.');
      if (this.struct.filter(st => st.k === r.kind && this.inCamp(CF, st)).length >= (r.max || 99)) return fail('You have built the maximum number of those.');
      for (const st of this.struct) {   // nothing may be crafted too close to anything else
        const stWall = st.k === 'wall', dd = Math.hypot(st.x - x, st.y - y);
        const need = station && !stWall ? RC.STATION_GAP : (station || !stWall) ? RC.WALL_GAP : st.r + sr - 4;
        if (dd < need) return fail(need > 60 ? 'Too close to another structure. Keep stations about ' + RC.STATION_GAP + ' apart (walls about ' + RC.WALL_GAP + ' from stations).' : 'Something is already there. Turn and try another spot.');
      }
      this.pay(p, r.cost);
      const st = { id: this.nid++, k: r.kind, x, y, r: sr, hp: STRUCT[r.kind].hp || 0, mhp: STRUCT[r.kind].hp || 0, rot: r.norot ? 0 : ((Math.trunc(+rot) || 0) % 8 + 8) % 8, items: r.kind === 'chest' ? { wood: 0, stone: 0, food: 0, scrap: 0 } : null, smelt: r.kind === 'smelter' ? { q: 0, prog: 0 } : null }; this.struct.push(st);
      return { ok: true, msg: r.kind === 'bench' ? 'Crafting bench placed! More recipes unlocked.' : r.n + ' placed.' };
    }
    this.pay(p, r.cost); p.gear[r.gear] = 1;
    return { ok: true, msg: r.n + ' crafted!' };
  }
  dismantle(p, id) {   // take a bench / chest / pot / smelter apart: its building materials drop around it for anyone to pick up
    const fail = msg => ({ ok: false, msg }), st = this.struct.find(s => s.id === id);
    if (!st || !['bench', 'chest', 'pot', 'smelter'].includes(st.k)) return fail('Nothing to dismantle.');
    if (p.down) return fail('You are down.'); if (!this.near(p, st)) return fail('Stand next to it to dismantle it.');
    const r = RC.LIST.find(x => x.kind === st.k); let wood = r.cost.wood, stone = r.cost.stone, extra = '';
    if (st.k === 'chest' && st.items) { p.wood += st.items.wood; p.stone += st.items.stone; p.food += st.items.food; p.scrap += st.items.scrap; extra = ' What was inside went into your bag.'; }
    if (st.k === 'smelter' && st.smelt && st.smelt.q) stone += st.smelt.q * RC.SMELT.cost;   // rocks that were queued come back
    this.struct = this.struct.filter(s => s !== st);
    if (this.drops.length + this.pend.length + wood + stone > 150) { p.wood += wood; p.stone += stone; }   // too much already on the floor: straight into the bag
    else for (const [k, n] of [['w', wood], ['s', stone]]) for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, d = st.r + 16 + Math.random() * 30; this.pend.push({ k, x: st.x + Math.cos(a) * d, y: st.y + Math.sin(a) * d, t: 0.45 }); }
    return { ok: true, msg: r.n + ' dismantled.' + extra };
  }
  smelterLoad(p, id, n) {   // put rocks into the smelter from its menu: n batches of 5 rocks (1 scrap each). It only runs while it has rocks in it
    const st = this.struct.find(s => s.id === id && s.k === 'smelter'), fail = msg => ({ ok: false, msg });
    if (!st || p.down || !this.near(p, st)) return fail('Stand next to the smelter.');
    n = Math.max(1, Math.min(RC.SMELT.queue, Math.trunc(+n) || 1));
    const room = RC.SMELT.queue - st.smelt.q, afford = Math.floor(this.pool(p, 'stone') / RC.SMELT.cost), k = Math.min(n, room, afford);
    if (room <= 0) return fail('The smelter is full.');
    if (k <= 0) return fail('Need ' + RC.SMELT.cost + ' rocks to smelt (your bag plus the chests).');
    this.pay(p, { stone: k * RC.SMELT.cost }); if (st.smelt.q === 0) st.smelt.prog = 0; st.smelt.q += k;
    return { ok: true, msg: 'Put in ' + k * RC.SMELT.cost + ' rocks.' };
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
    for (const k in f.cost) if (this.pool(p, k) < f.cost[k]) return fail('Not enough ' + (k === 'meat' ? 'meat' : 'berries') + ' (your bag plus the chests).');
    this.pay(p, f.cost);
    const pot = this.struct.find(s => s.k === 'pot' && this.near(p, s)), a = Math.PI * (0.15 + Math.random() * 0.7), dd = pot.r + 24 + Math.random() * 18;
    this.pend.push({ k: 'q', food: id, x: pot.x + Math.cos(a) * dd, y: pot.y + Math.sin(a) * dd, t: 0.45 });   // the dish pops out of the pot and lands on the floor to be picked up
    return { ok: true, msg: f.n + ' popped out of the pot!' };
  }
  useSlot(p, i) {   // eat/drink what is in one of your 3 slots, or set a trap down where you stand
    const id = p.slots[i]; if (p.down || !id) return;
    if (id === 'trap') {
      const no = msg => send(p.ws, { t: 'toast', msg });
      if (p.boat) return no('Not from a boat.');
      if (Math.hypot(p.x, p.y) < RC.fireClear('trap')) return no('Too close to the fire.');
      if (this.struct.some(st => st.k === 'trap' && Math.hypot(st.x - p.x, st.y - p.y) < RC.RADIUS.trap * 2)) return no('There is already a trap here.');
      p.slots.splice(i, 1);
      this.struct.push({ id: this.nid++, k: 'trap', x: p.x, y: p.y, r: STRUCT.trap.r, hp: 0, mhp: 0, rot: 0, items: null, smelt: null });
      send(p.ws, { t: 'trapSet' }); return;
    }
    if (id === 'campfire') return this.placeCampfire(p, i);
    if (id === 'foot') return send(p.ws, { t: 'toast', msg: "Your lucky rabbit's foot. Hold on to it." });
    if (!RC.FOOD_BY[id]) return;
    p.slots.splice(i, 1);
    if (id === 'steak') p.hp = Math.min(p.mhp, p.hp + 80);
    else if (id === 'juice') p.hp = Math.min(p.mhp, p.hp + 40);
    else if (id === 'tea') p.buff.speed = 60;
    send(p.ws, { t: 'ate', id, msg: RC.FOOD_BY[id].n, b: p.buff });
  }
  // rabbits: live in the forest (all of home, the forest quarter of the other islands), run slowly from people, slide along the coast
  rabSpot(i) {
    const is = this.islands[i];
    for (let k = 0; k < 30; k++) {
      const a = Math.random() * 6.283, d = Math.sqrt(Math.random()) * (is.r - RAB.edge - 20), x = is.x + Math.cos(a) * d, y = is.y + Math.sin(a) * d;
      if (i === 0 ? Math.hypot(x, y) < RC.camp(3) + 60 : !RC.inForestPart(is.x, is.y, is.r, x, y)) continue;   // not in camp / only the forest part
      if ([...this.players.values()].some(p => Math.hypot(p.x - x, p.y - y) < 500)) continue;   // never pop in next to someone
      return [x, y];
    }
    return null;
  }
  stepRabbits(P, dt) {
    if (!this.rabbits) this.rabbits = [];
    if ((this.rabT = (this.rabT || 0) - dt) <= 0) {   // top the forests back up, one per island at a time
      this.rabT = RAB.respawn; const fill = !this.rabFull; this.rabFull = 1;   // the first time, every forest is filled at once
      for (let i = 0; i < this.islands.length; i++) for (let k = 0; k < (fill ? 12 : 1); k++) {
        if (this.rabbits.filter(b => b.isl === i).length >= (i === 0 ? RAB.home : RAB.outer)) break;
        const q = this.rabSpot(i); if (q) this.rabbits.push({ id: this.nid++, rab: 1, x: q[0], y: q[1], hx: q[0], hy: q[1], isl: i, hp: 1, fa: Math.random() * 6.283, wt: 0, wa: 0, run: 0, sit: 1, side: 1 });
      }
    }
    for (const b of this.rabbits) {
      const is = this.islands[b.isl]; let near = null, nd = RAB.see;
      for (const p of P) if (!p.down && !p.boat) { const d = Math.hypot(p.x - b.x, p.y - b.y); if (d < nd) { nd = d; near = p; } }
      let dx, dy, spd;
      if (near) { dx = b.x - near.x; dy = b.y - near.y; const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L; spd = RAB.run; b.run = 1; b.sit = 0; b.wt = 0; }
      else {
        b.run = 0; b.wt -= dt;
        if (b.wt <= 0) {   // wander: hop a bit, sit a bit; drift back toward home turf if it strayed out of the forest
          b.wt = 1 + Math.random() * 2.5; b.sit = Math.random() < 0.45;
          const out = b.isl !== 0 && !RC.inForestPart(is.x, is.y, is.r, b.x, b.y);
          b.wa = out || Math.hypot(b.x - b.hx, b.y - b.hy) > 350 ? Math.atan2(b.hy - b.y, b.hx - b.x) + (Math.random() - 0.5) : Math.random() * 6.283;
        }
        if (b.sit) continue;
        dx = Math.cos(b.wa); dy = Math.sin(b.wa); spd = RAB.walk;
      }
      let nx = b.x + dx * spd * dt, ny = b.y + dy * spd * dt;
      const lim = is.r - RAB.edge, cx = nx - is.x, cy = ny - is.y, cd = Math.hypot(cx, cy);
      if (cd > lim) {   // at the shore: run along the coast (whichever way leads away), never stand there stuck
        const ux = cx / cd, uy = cy / cd; let tx = -uy, ty = ux; const dot = tx * dx + ty * dy;
        if (dot < -0.05 || (Math.abs(dot) <= 0.05 && b.side < 0)) { tx = -tx; ty = -ty; }   // head-on: keep the way it was already going
        b.side = (tx === -uy) ? 1 : -1;
        nx = b.x + tx * spd * dt; ny = b.y + ty * spd * dt;
        const ex = nx - is.x, ey = ny - is.y, ed = Math.hypot(ex, ey); if (ed > lim) { nx = is.x + ex / ed * lim; ny = is.y + ey / ed * lim; }
        dx = tx; dy = ty;
        if (!near) b.wa = Math.atan2(ty, tx);
      }
      if (b.isl === 0 && Math.hypot(nx, ny) < RC.FIRE_R + 30) continue;   // don't hop into the fire
      b.x = nx; b.y = ny; b.fa = Math.atan2(dy, dx);
    }
    if (this.rabbits.some(b => b.hp <= 0)) this.rabbits = this.rabbits.filter(b => b.hp > 0);
  }
  // snow wolves: roam the snow quarter of home; chase anyone who comes close; when the chase reaches the fire (or drags them
  // too far from home) they turn tail and run back to where they spawned. st: 0 roaming, 1 chasing, 2 running home
  stepWolves(P, dt) {
    if (!this.wolves) this.wolves = [];
    if ((this.wolfT -= dt) <= 0) {   // home's snow quarter and every snow island; all filled at once the first time, then one per island at a time
      const first = !this.wolfFull; this.wolfFull = 1; this.wolfT = WOLF.respawn;
      for (let i = 0; i < this.islands.length; i++) {
        const is = this.islands[i]; if (i > 0 && is.b !== 's' && is.b !== 'm') continue;
        const want = i === 0 ? WOLF.n : WOLF.outer; let have = this.wolves.filter(w => w.isl === i).length;
        for (let k = 0; k < (first ? want : 1) && have < want; k++) {
          let q = null;
          for (let t = 0; t < 40 && !q; t++) {
            let x, y;
            if (i === 0) { const a = RC.SNOW_A + (Math.random() - 0.5) * 1.3, d = 1300 + Math.random() * (R - 1500); x = Math.cos(a) * d; y = Math.sin(a) * d; if (!RC.inSnow(x, y)) continue; }
            else { const a = Math.random() * 6.283, d = Math.sqrt(Math.random()) * (is.r - 200); x = is.x + Math.cos(a) * d; y = is.y + Math.sin(a) * d; if (RC.biomeAt(is.x, is.y, is.r, is.b, x, y) !== 's') continue; }
            if (!P.some(p => Math.hypot(p.x - x, p.y - y) < 600)) q = [x, y];
          }
          if (!q) continue; have++;
          const f = i > 0 ? DIST_F(q[0], q[1]) : 0, rl = Math.random(), nB = this.wolves.filter(w => w.isl === i && w.big === 1).length, nM = this.wolves.filter(w => w.isl === i && w.big === 2).length;
          const big = i > 0 && nM < 1 && rl < 0.07 * f ? 2 : i > 0 && nB < 2 && rl < 0.07 * f + 0.28 * f ? 1 : 0;   // farther out: more bears, and the odd mammoth
          if (big) { const B = BIG[big]; this.wolves.push({ id: this.nid++, wolf: 1, big, heavy: 1, isl: i, alpha: 0, x: q[0], y: q[1], hx: q[0], hy: q[1], hp: B.hp, mhp: B.hp, run: B.run, dmg: B.dmg, reach: B.reach, bcd: B.cd, see: B.see, walk: B.walk, fa: Math.random() * 6.283, st: 0, tg: 0, cd: 0, wt: 0, wa: 0, bite: 0 }); continue; }
          const al = i > 0 && Math.random() < 0.08 + 0.55 * f, hp = al ? WOLF.aHp : WOLF.hp;   // alphas get more common the farther from home
          this.wolves.push({ id: this.nid++, wolf: 1, isl: i, alpha: al ? 1 : 0, x: q[0], y: q[1], hx: q[0], hy: q[1], hp, mhp: hp, run: al ? WOLF.aRun : WOLF.run, dmg: al ? WOLF.aDmg : WOLF.dmg, fa: Math.random() * 6.283, st: 0, tg: 0, cd: 0, wt: 0, wa: 0, bite: 0 });
        }
      }
    }
    const nearFire = (x, y) => this.fires().some(F => Math.hypot(x - F.x, y - F.y) < (F.f.fuel > 0 ? RC.camp(F.f.lvl) : RC.FIRE_R) + WOLF.fireGap);
    for (const w of this.wolves) {
      w.cd -= dt; w.bite -= dt; let dx = 0, dy = 0, spd = 0; const wi = w.isl | 0, is = this.islands[wi] || this.islands[0];
      const home = Math.hypot(w.x - w.hx, w.y - w.hy);
      if (w.st === 2) {   // running home; after 3 s of that, anyone who comes close (away from the fire) gets chased again
        w.rt = (w.rt || 0) + dt; let re = null;
        if (w.rt >= WOLF.reAggro) { let nd = WOLF.see; for (const p of P) if (!p.down && !p.boat && this.onIsland(p, wi) && !nearFire(p.x, p.y)) { const d = Math.hypot(p.x - w.x, p.y - w.y); if (d < nd) { nd = d; re = p; } } }
        if (re) { w.st = 1; w.tg = re.id; w.rt = 0; }
        else if (home < 40) { w.st = 0; w.wt = 0; w.rt = 0; } else { dx = (w.hx - w.x) / home; dy = (w.hy - w.y) / home; spd = w.run || WOLF.run; }
      }
      if (w.st !== 2) {
        let tg = w.st === 1 ? P.find(p => p.id === w.tg && !p.down && !p.boat) : null;
        if (tg && Math.hypot(tg.x - w.x, tg.y - w.y) > WOLF.give) tg = null;
        if (!tg) { let nd = w.see || WOLF.see; for (const p of P) if (!p.down && !p.boat && this.onIsland(p, wi)) { const d = Math.hypot(p.x - w.x, p.y - w.y); if (d < nd) { nd = d; tg = p; } } }
        if (tg && !nearFire(tg.x, tg.y)) {
          w.st = 1; w.tg = tg.id; const d = Math.hypot(tg.x - w.x, tg.y - w.y) || 1; dx = (tg.x - w.x) / d; dy = (tg.y - w.y) / d;
          if (d > (w.reach || WOLF.reach) * (w.alpha ? 1.25 : 1)) spd = w.run || WOLF.run;
          else if (w.cd <= 0) { w.cd = w.bcd || WOLF.cd; w.bite = 0.25; this.hurt(tg, w.dmg || WOLF.dmg); }
        } else if (w.st === 1) { w.st = 2; w.rt = 0; continue; }   // lost them (or they reached the fire): head home
        else {   // roaming around its spot
          w.wt -= dt; if (w.wt <= 0) { w.wt = 1.5 + Math.random() * 3; w.sit = Math.random() < 0.5; w.wa = home > 260 ? Math.atan2(w.hy - w.y, w.hx - w.x) : Math.random() * 6.283; }
          if (!w.sit) { dx = Math.cos(w.wa); dy = Math.sin(w.wa); spd = w.walk || WOLF.walk; }
        }
      }
      if (!spd) { if (dx || dy) w.fa = Math.atan2(dy, dx); continue; }
      let nx = w.x + dx * spd * dt, ny = w.y + dy * spd * dt;
      if (w.st !== 2 && (nearFire(nx, ny) || Math.hypot(nx - w.hx, ny - w.hy) > WOLF.leash)) { w.st = 2; w.rt = 0; continue; }   // got near the fire / too far from home: back it goes
      { const ex = nx - is.x, ey = ny - is.y, L = Math.hypot(ex, ey); if (L > is.r - 45) { nx = is.x + ex * (is.r - 45) / L; ny = is.y + ey * (is.r - 45) / L; } }   // stays on its island
      w.x = nx; w.y = ny; w.fa = Math.atan2(dy, dx);
    }
    for (const w of this.wolves) if (w.hp <= 0 && !w.dropped) { w.dropped = 1; const BG = BIG[w.big], AL = w.alpha || w.big === 2, n = BG ? BG.meat[0] + (Math.random() * (BG.meat[1] + 1) | 0) : 1 + (Math.random() < 0.5 ? 1 : 0); for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, d = 8 + Math.random() * (BG ? 40 : 18); this.pend.push({ k: 'n', x: w.x + Math.cos(a) * d, y: w.y + Math.sin(a) * d, t: 0.15 }); }
      if (BG) { for (let i = 0; i < (w.big === 2 ? 3 : 1); i++) if (Math.random() < BG.pelt) this.pend.push({ k: 'h', x: w.x + 10 + i * 14, y: w.y - 6, t: 0.2 }); } else if (Math.random() < WOLF.pelt) this.pend.push({ k: 'h', x: w.x + 10, y: w.y - 6, t: 0.2 });
      if (AL && Math.random() < (w.big === 2 ? 1 : WOLF.aPelt)) this.pend.push({ k: 'H', x: w.x - 12, y: w.y + 8, t: 0.25 }); }   // alpha wolves (and mammoths) can drop an alpha pelt   // 1-2 meat scraps, and a 10% chance of a wolf pelt
    if (this.wolves.some(w => w.hp <= 0)) this.wolves = this.wolves.filter(w => w.hp > 0);
  }
  killRabbit(b) {   // one hit: 1-2 meat scraps, and a 10% chance of a lucky rabbit's foot
    b.hp = 0; const n = 1 + (Math.random() < 0.5 ? 1 : 0), drops = [];
    for (let i = 0; i < n; i++) drops.push({ k: 'n' });
    if (Math.random() < RAB.foot) drops.push({ k: 'q', food: 'foot' });
    for (const q of drops) { const a = Math.random() * 6.283, d = 8 + Math.random() * 18; q.x = b.x + Math.cos(a) * d; q.y = b.y + Math.sin(a) * d; q.t = 0.15; this.pend.push(q); }
  }
  ph() { return this.c < DAY ? 0 : this.c < DAY + DUSK ? 1 : 2; }
  awayEntry(p) { return { t: Date.now(), s: { wood: p.wood, stone: p.stone, food: p.food, scrap: p.scrap, meat: p.meat, gold: p.gold, pelt: p.pelt, apelt: p.apelt, gear: p.gear, buff: p.buff, slots: p.slots, cls: p.cls, down: p.down, hp: p.hp, x: p.x, y: p.y } }; }
  stash(p) {   // remember a leaving player's character so they can come back (dropped connection) within the room window
    if (!p.email) return; const now = Date.now(); for (const [k, v] of this.away) if (now - v.t > ROOM_IDLE_SEC * 1000) this.away.delete(k);
    this.away.set(p.email, this.awayEntry(p));
  }
  snapshot() {   // everything needed to rebuild this room after a server restart; connected players are saved as 'away' so they get their character back when they reconnect
    const away = [...this.away]; for (const p of this.players.values()) if (p.email) away.push([p.email, this.awayEntry(p)]);
    return { code: this.code, c: this.c, night: this.night, fire: this.fire, aliens: this.aliens, res: this.res, islands: this.islands, isv: ISL_VER, camps: this.camps, lootOpen: this.loot.filter(l => l.open).map(l => l.id), boats: this.boats.map(b => ({ id: b.id, type: b.type || 'boat', x: b.x, y: b.y, ang: b.ang })), scrapFound: this.scrapFound, drops: this.drops, pend: this.pend, struct: this.struct, chargerNight: this.chargerNight, raidNight: this.raidNight, islNight: this.islNight, nid: this.nid, away };
  }
  saveBlob() {   // everything about this game, compactly: island resources are re-made from the room code, so only home's resources and the changed island ones are stored
    const o = this.snapshot(); delete o.islands;
    const homeRes = [], dev = []; let ri = 0;
    const fresh = []; this.islands.forEach((is, i) => { if (i > 0) fresh.push(...islandRes(is, i, this.code)); });
    for (const r of this.res) {
      if (!(r.isl > 0)) homeRes.push([r.k, Math.round(r.x), Math.round(r.y), Math.round(r.hp * 10) / 10]);
      else { const f = fresh[ri++]; if (!f || r.hp !== r.mhp || r.k !== f.k) dev.push([ri - 1, r.k, Math.round(r.hp * 10) / 10]); }
    }
    o.res = undefined; o.homeRes = homeRes; o.dev = dev; o.v = 2; o.at = Date.now();
    const rd = n => Math.round(n * 10) / 10;
    o.aliens = (o.aliens || []).map(a => ({ id: a.id, isl: a.isl, k: a.k, x: rd(a.x), y: rd(a.y), hp: rd(a.hp), mhp: a.mhp, sp: a.sp, dmg: a.dmg, cd: 0, atkCd: a.atkCd, reach: a.reach, stop: a.stop, range: a.range, rad: a.rad, aim: 0, shotCd: 0 }));
    return o;
  }
  static fromSave(b) {   // rebuild the snapshot form that restore() understands, then restore it
    const r0 = new Room(b.code), rest = r0.res.filter(x => x.isl > 0);
    for (const [i, k, hp] of b.dev || []) if (rest[i]) { rest[i].k = k; rest[i].mhp = HP[k]; rest[i].hp = hp; }
    const home = (b.homeRes || []).map(a => ({ k: a[0], x: a[1], y: a[2], hp: a[3], mhp: HP[a[0]], rt: 0, isl: 0 }));
    const o = Object.assign({}, b, { res: home.concat(rest), islands: r0.islands, isv: ISL_VER, islandsV: 2 });
    return Room.restore(o);
  }
  static restore(o) {
    const r = new Room(o.code), genIsl = r.islands, genExtra = r.res.filter(x => x.isl > 0), fresh = r.res;
    Object.assign(r, { c: o.c, night: o.night, fire: o.fire, aliens: o.aliens || [], res: o.res, drops: (o.drops || []).filter(d => d.k !== 'q' || RC.ITEM_BY[d.food]), pend: o.pend || [], struct: o.struct || [], chargerNight: o.chargerNight || 0, raidNight: o.raidNight || 0, islNight: o.islNight || {}, nid: o.nid || 1, over: 0, emptyFor: 0 });
    if (o.islands) { r.islands = o.islands; r.boats = (o.boats || []).map(b => ({ id: b.id, type: b.type || 'boat', x: b.x, y: b.y, ang: b.ang, riders: [], drv: 0 })); r.scrapFound = !!o.scrapFound; }
    else { r.islands = genIsl; r.res = o.res.concat(genExtra); }   // rooms saved before the islands existed get the archipelago added
    if (o.islands && o.isv !== ISL_VER) {   // older island layouts: regenerate the outer islands (seeded by room code) and their resources
      r.islands = genIsl; r.res = fresh;   // the whole archipelago (home too) is regenerated
      for (const b of r.boats) if (!r.isWater(b.x, b.y)) {   // a boat that now sits on land is pushed out to the nearest shore
        let best = r.islands[0], bd = 1e9; for (const s of r.islands) { const d = Math.hypot(b.x - s.x, b.y - s.y) - s.r; if (d < bd) { bd = d; best = s; } }
        const dx = b.x - best.x, dy = b.y - best.y, L = Math.hypot(dx, dy) || 1; b.x = best.x + dx / L * (best.r + 90); b.y = best.y + dy / L * (best.r + 90);
      }
    }
    r.loot = genLoot(r.islands, o.code);   // loot areas are derived from the islands; only which chests were opened and the campfires are saved
    if (o.islands && o.isv === ISL_VER) { r.camps = o.camps || []; const op = new Set(o.lootOpen || []); for (const l of r.loot) if (op.has(l.id)) l.open = 1; }
    { let nb = 0; r.res = r.res.filter(x => x.k !== 'b' || x.isl > 0 || ++nb <= BUSHES); }   // rooms saved before the bush cut lose their extra bushes (done before anyone joins, so client indexes stay aligned)
    const now = Date.now(); r.away = new Map((o.away || []).map(([e, v]) => [e, { t: now, s: v.s }]));   // the reconnect window starts from the restart
    return r;
  }
  add(ws, name, cls, pf, email) {
    this.rForce = 1;   // the next snapshot carries the full resource state for the newcomer
    const p = { id: this.nid++, ws, name, cls, prof: pf, gear: {}, buff: { speed: 0, regen: 0, dmg: 0 }, actPrev: 0, fa: 0, sw: 0, swk: 0, swa: 0, wood: parseInt(process.env.START_WOOD) || 0, stone: parseInt(process.env.START_STONE) || 0, food: parseInt(process.env.START_FOOD) || 0, scrap: parseInt(process.env.START_SCRAP) || 0, meat: parseInt(process.env.START_MEAT) || 0, gold: 0, pelt: 0, apelt: 0, slots: [], abilCd: 0, sta: STA.max, staCd: 0, tired: 0, actcd: 0, hitcd: 0, eat: 0, inp: { dx: 0, dy: 0, act: 0, hit: 0 } };
    p.email = email; p.inf = INFINITE.has(email); this.respawn(p);
    if (process.env.START_ABIL && pf) { pf.abil = {}; for (const c of GC.LIST) pf.abil[c.id] = 1; }   // (test hook: every ability unlocked)
    const a = email && this.away.get(email); this.away.delete(email);
    if (a && Date.now() - a.t <= ROOM_IDLE_SEC * 1000) {   // welcome back: same stuff, same spot (a downed player just respawns)
      const o = a.s; p.wood = o.wood; p.stone = o.stone; p.food = o.food; p.scrap = o.scrap; p.meat = o.meat || 0; p.gold = o.gold || 0; p.pelt = o.pelt || 0; p.apelt = o.apelt || 0; p.gear = o.gear; p.buff = o.buff; p.slots = (o.slots || []).filter(id => RC.ITEM_BY[id]).slice(0, 7);
      if (o.cls === cls && !o.down) { p.hp = Math.min(p.mhp, o.hp); p.x = o.x; p.y = o.y; if (this.landAt(p.x, p.y) < 0) { const q = this.landPoint(p.x, p.y); p.x = q[0]; p.y = q[1]; } }   // (someone who left while sailing comes back on the nearest shore)
    }
    this.players.set(p.id, p); return p;
  }
  tick(dt) {
    const P = [...this.players.values()];
    if (!P.length) { this.emptyFor += dt; return; } this.emptyFor = 0;
    for (const p of P) if (p.inf) { p.wood = p.stone = p.food = p.scrap = p.meat = p.gold = p.pelt = p.apelt = INF_N; }   // test accounts: bag always full
    if (this.over > 0) { this.over -= dt; if (this.over <= 0) this.endRun(); return; }
    this.c += dt;
    if (this.c >= CYC) {
      this.c -= CYC; this.night++;
      for (const p of P) if (p.prof) { p.prof.n++; dirty = true; }   // diamonds are paid when the run ends, not per night
    }
    const ph = this.ph(), f = this.fire, maxF = RC.fuelMax(f.lvl);
    let burn = 1; for (const p of P) if (!p.down) burn = Math.min(burn, GC.BY[p.cls].burn);
    f.fuel = Math.max(0, f.fuel - (ph === 0 ? 0.4 : 1) * burn * (f.slow > 0 ? 0.5 : 1) * dt); f.slow = Math.max(0, (f.slow || 0) - dt);
    const fr = f.fuel > 0 ? RC.camp(f.lvl) : 0;

    for (let ri = 0; ri < this.res.length; ri++) { const r = this.res[ri]; if (r.hp <= 0 && (r.rt -= dt) <= 0) {
      if (ROCKY(r.k)) { const nk = Math.random() < GOLD_P ? 'g' : 'r'; if (nk !== r.k) { r.k = nk; r.mhp = HP[nk]; this.rForce = 1; for (const q of P) send(q.ws, { t: 'rk', i: ri, k: nk }); } }   // ~1% of regrowing rocks come up as gold ore veins
      r.hp = r.mhp;
    } }
    for (const p of P) p.rv = 0;
    this.tickBoats(dt); this.stepBattle(P, dt);
    for (const c of this.camps) c.fuel = Math.max(0, c.fuel - (ph === 0 ? 0.4 : 1) * burn * (c.slow > 0 ? 0.5 : 1) * dt), c.slow = Math.max(0, (c.slow || 0) - dt);

    for (const p of P) {
      if (p.down) continue;
      if (p.inpAt && Date.now() - p.inpAt > 400) p.inp = { dx: 0, dy: 0, act: 0, hit: 0, rn: 0 };   // client stopped sending (frozen/backgrounded tab): never keep walking
      const c = GC.BY[p.cls], i = p.inp;
      p.actcd -= dt; p.hitcd -= dt; p.abilCd = Math.max(0, (p.abilCd || 0) - dt);
      const B = p.buff; for (const k in B) if (B[k] > 0) B[k] = Math.max(0, B[k] - dt);
      const actEdge = i.act && !p.actPrev; p.actPrev = i.act;
      if (p.boat) {   // aboard a boat: the boat carries you; ACT gets you out near land. Passengers (not the captain) can shoot projectiles with ATTACK
        if (actEdge) this.exitBoat(p);
        const bt = this.boats.find(x => x.id === p.boat);
        if (bt && bt.drv !== p.id && i.hit && p.hitcd <= 0) {
          if (!this.spendSta(p, STA.attack)) { p.hitcd = 0.3; this.winded(p); }
          else {
            const g = p.gear.rifle ? RC.GUNS.rifle : p.gear.pistol ? RC.GUNS.pistol : { dmg: c.dmg + (p.gear.sword ? 8 : 0), cd: Math.max(0.5, c.cd), speed: 800, ttl: 0.6 };   // no gun: a plain thrown shot
            p.hitcd = g.cd; let ang = p.fa, bd = 700;
            for (const t of [...this.aliens, ...(this.wolves || [])]) if (t.hp > 0 && t.k !== 2) { const dd = dist(p, t); if (dd < bd) { bd = dd; ang = Math.atan2(t.y - p.y, t.x - p.x); } }   // aboard you can aim all around
            p.sw = (p.sw + 1) & 255; p.swk = 4; p.swa = ang; this.shoot(p, ang, g.dmg * (B.rage > 0 || B.power > 0 ? 2 : 1), g.speed, g.ttl, 3);
          }
        }
        continue;
      }
      if (B.regen > 0 && p.hp < p.mhp) p.hp = Math.min(p.mhp, p.hp + 2 * dt);
      let dx = i.dx, dy = i.dy; const m = Math.hypot(dx, dy); if (m > 1) { dx /= m; dy /= m; }
      let spd = c.spd * (B.speed > 0 ? 1.25 : 1) * (B.haste > 0 ? 2 : 1) * (B.rage > 0 || B.power > 0 ? 1.4 : 1);
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
      for (const st of this.struct) { if (st.k === 'trap') continue; const sd = Math.hypot(p.x - st.x, p.y - st.y), mn = st.r + 14; if (sd < mn && sd > 0.01) { p.x = st.x + (p.x - st.x) / sd * mn; p.y = st.y + (p.y - st.y) / sd * mn; } }
      if (this.landAt(p.x, p.y) < 0) { const q = this.landPoint(p.x, p.y); p.x = q[0]; p.y = q[1]; }   // stay on land (any island); only boats go on water
      const d = Math.hypot(p.x, p.y);

      if (i.act) {
        const mate = P.find(q => q.down && dist(p, q) < 60);
        if (mate) { if (m <= 0.1) { mate.rev += dt * c.rev; mate.rv = 1; } }   // you have to stand still while reviving
        else if (actEdge && this.boatNear(p)) this.enterBoat(p, this.boatNear(p));
        else if (actEdge && this.lootNear(p, 'chest')) this.openChest(p, this.lootNear(p, 'chest'));
        else if (actEdge && this.lootNear(p, 'trader')) { const l = this.lootNear(p, 'trader'); send(p.ws, { t: 'open', what: 'trader', id: l.id, ty: l.trader }); }
        else if (p.actcd <= 0) {
          const FF = this.fireNear(p, 80);
          let stn = null, sd = 1e9; for (const st of this.struct) { if (st.k !== 'bench' && st.k !== 'chest' && st.k !== 'pot' && st.k !== 'smelter') continue; const dd = Math.hypot(p.x - st.x, p.y - st.y); if (dd < st.r + REACH && dd < sd) { sd = dd; stn = st; } }   // the nearest station in reach
          if (stn) { if (actEdge) { p.actcd = 0.4; send(p.ws, { t: 'open', what: stn.k, id: stn.id }); } }   // every station opens its menu; the smelter only starts when you put rocks in
          else if (FF) {   // the main fire or any campfire: wood refuels it, stone levels it up
            const ff = FF.f, mxF = RC.fuelMax(ff.lvl), per = 15 * c.feed, need = mxF - ff.fuel;
            if (p.wood > 0 && need > per * 0.5) { const n = Math.min(p.wood, Math.ceil(need / per)); ff.fuel = Math.min(mxF, ff.fuel + n * per); p.wood -= n; p.actcd = 0.3; }   // only as much wood as the gauge needs
            else if (ff.lvl < RC.FIRE_MAX && p.stone >= 10 * ff.lvl) { p.stone -= 10 * ff.lvl; ff.lvl++; p.actcd = 0.5; }                                                          // gauge full: level the fire up with stone
          } else {
            let best = null, bd = 55;
            for (const r of this.res) if (r.hp > 0) { const dd = dist(p, r); if (dd < bd) { bd = dd; best = r; } }
            if (best && !this.spendSta(p, best.k === 'b' ? STA.bush : STA.swing)) { p.actcd = 0.3; this.winded(p); }
            else if (best) {
              p.actcd = 0.55; p.sw = (p.sw + 1) & 255; p.swk = WOODY(best.k) ? 1 : ROCKY(best.k) ? 2 : 3; p.swa = Math.atan2(best.y - p.y, best.x - p.x);
              best.hp -= WOODY(best.k) && p.gear.axe ? 1.34 : ROCKY(best.k) && p.gear.pick ? 1.5 : 1;
              if (best.hp <= 0) {
                best.rt = 45 + Math.random() * 30;
                if (best.k === 'g') this.spill(best, 1 + (Math.random() < 0.5 ? 1 : 0));   // a gold vein: 1-2 gold ore
                else if (best.k === 'b') this.spill(best, Math.max(1, Math.round(2 * c.food)));   // little strawberries pop out around the bush
                else this.spill(best, Math.max(1, Math.round(SPILL[best.k] * (best.k === 'r' ? c.stone : c.wood))));
              }
            } else if (this.campOf(p) && !this.struct.some(st => st.k === 'bench' && this.inCamp(this.campOf(p), st))) { if (actEdge) { p.actcd = 0.4; send(p.ws, { t: 'open', what: 'bench', id: 0 }); } }   // no bench yet: ACT in camp opens the build menu so you can place the first one
            else if (p.gear.rod && !p.boat && this.isWater(p.x + Math.cos(p.fa) * 80, p.y + Math.sin(p.fa) * 80)) {   // fishing rod at the shore: ACT casts
              if (!this.spendSta(p, STA.bush)) { p.actcd = 0.3; this.winded(p); }
              else { p.actcd = 1.1; p.sw = (p.sw + 1) & 255; p.swk = 1; p.swa = p.fa; if (Math.random() < 0.5) { const n = Math.max(1, Math.round(2 * c.food)); p.food += n; send(p.ws, { t: 'fish', n }); } else send(p.ws, { t: 'fish', n: 0 }); }
            }
            else { p.actcd = 0.55; p.sw = (p.sw + 1) & 255; p.swk = 1; p.swa = p.fa; }   // nothing to chop: still swing
          }
        }
      }
      if (i.hit && p.hitcd <= 0 && !this.spendSta(p, STA.attack)) { p.hitcd = 0.3; this.winded(p); }
      else if (i.hit && p.hitcd <= 0 && !p.boat && (p.gear.rifle || p.gear.pistol)) {   // guns: ATTACK fires a bullet (auto-aimed at the nearest target in front)
        const g = p.gear.rifle ? RC.GUNS.rifle : RC.GUNS.pistol; p.hitcd = g.cd; let ang = p.fa, bd = 700;
        for (const t of [...this.aliens, ...(this.wolves || [])]) if (t.hp > 0 && t.k !== 2) { const dd = dist(p, t); let da = Math.atan2(t.y - p.y, t.x - p.x) - p.fa; da = Math.atan2(Math.sin(da), Math.cos(da)); if (dd < bd && Math.abs(da) < 1.0) { bd = dd; ang = Math.atan2(t.y - p.y, t.x - p.x); } }
        p.sw = (p.sw + 1) & 255; p.swk = 4; p.swa = ang; this.shoot(p, ang, g.dmg * (B.rage > 0 || B.power > 0 ? 2 : 1), g.speed, g.ttl, 3);
      }
      else if (i.hit && p.hitcd <= 0) {
        p.hitcd = c.cd * (B.flurry > 0 ? 0.5 : 1);
        // with the spear it is a poke: anything up close as usual, plus a long reach straight ahead (within ~35 degrees of where you face)
        const sp = !!p.gear.spear, far = c.range + SPEAR_REACH; let best = null, bd = 1e9;
        const ok = t => { const dd = dist(p, t); if (dd < c.range) return dd; if (!sp || dd > far) return -1; let da = Math.atan2(t.y - p.y, t.x - p.x) - p.fa; da = Math.atan2(Math.sin(da), Math.cos(da)); return Math.abs(da) < 0.6 ? dd : -1; };
        const consider = t => { const dd = ok(t); if (dd >= 0 && dd < bd) { bd = dd; best = t; } };
        for (const a of this.aliens) if (a.hp > 0 && a.k !== 2) consider(a);   // the Charger cannot be hit
        for (const b of this.rabbits) if (b.hp > 0) consider(b);   // rabbits too
        for (const w of this.wolves || []) if (w.hp > 0) consider(w);   // and wolves
        p.sw = (p.sw + 1) & 255; p.swk = sp ? 5 : 4; p.swa = best ? Math.atan2(best.y - p.y, best.x - p.x) : p.fa;   // the weapon swings (or the spear pokes) even when nothing is in front of you
        if (best && best.rab) this.killRabbit(best);
        else if (best) {
          let mul = (B.rage > 0 || B.power > 0 ? 2 : 1) * (B.flurry > 0 ? 1.5 : 1); if (B.crit3 > 0) { mul *= 3; B.crit3 = 0; }
          best.hp -= (c.dmg + (p.gear.spear ? 6 : 0) + (p.gear.sword ? 8 : 0) + (B.dmg > 0 ? 5 : 0)) * (Math.random() < c.crit ? 2 : 1) * mul;
          const kd = Math.max(1, dist(p, best)); const kr = best.k === 2 ? 0.2 : best.big === 2 ? 0.05 : best.heavy ? 0.12 : 1; best.x += (best.x - p.x) / kd * c.knock * kr; best.y += (best.y - p.y) / kd * c.knock * kr;
          if (best.wolf) { best.st = 1; best.tg = p.id; }   // a hit wolf turns on you
          if (best.hp <= 0 && p.prof) { p.prof.k++; dirty = true; if (p.prof.k % 10 === 0) award(p, 1, 'kills'); }
        }
      }
      if (p.hp < p.mhp && this.litAt(p.x, p.y)) p.hp = Math.min(p.mhp, p.hp + 2 * dt);   // resting at a lit camp heals 2 HP/s (berries are for crafting only)
      if (c.regen && p.hp < p.mhp) p.hp = Math.min(p.mhp, p.hp + c.regen * dt);
      if (c.heal) for (const q of P) if (!q.down && q.hp < q.mhp && dist(p, q) < 90) q.hp = Math.min(q.mhp, q.hp + c.heal * dt);
    }
    for (const p of P) if (p.down) {
      if (!p.rv) p.rev = Math.max(0, p.rev - REVIVE.decay * dt);
      if (p.rev >= REVIVE.sec) { p.down = 0; p.rev = 0; p.hp = p.mhp * REVIVE.hp; }
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
      this.pend.splice(i, 1); if (this.drops.length < 160) this.drops.push({ id: this.nid++, k: q.k, x: q.x, y: q.y, ttl: 100, food: q.food });
    }
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i]; d.ttl -= dt; let taken = false;
      if (d.ttl > 0) for (const p of P) if (!p.down && dist(p, d) < 30) { if (d.k === 'q') { if (p.slots.length >= slotCap(p, this) || (d.food === 'foot' && p.slots.includes('foot'))) continue; p.slots.push(d.food); taken = true; break; }   // cooked food needs a free slot; with all 3 full it stays on the floor
        if (d.k === 'w') p.wood++; else if (d.k === 's') p.stone++; else if (d.k === 'f') p.food++; else if (d.k === 'd') award(p, 1, 'drop'); else if (d.k === 'n') p.meat++; else if (d.k === 'o') p.gold++; else if (d.k === 'h') p.pelt++; else if (d.k === 'H') p.apelt++; else { p.scrap++; this.scrapFound = true; } taken = true; break; }
      if (taken || d.ttl <= 0) this.drops.splice(i, 1);
    }
    this.stepRabbits(P, dt); this.stepWolves(P, dt);
    // aliens
    if (ph === 2) for (let i = 0; i < this.islands.length; i++) this.nightSpawns(i, P, dt);
    for (const a of this.aliens) {
      if (ph !== 2) { if (a.k === 2) a.hp = 0; else a.hp -= 25 * dt; }       // sunlight burns them; the Charger vanishes the moment night ends
      a.cd -= dt;
      if (a.k === 2 && !(a.trapT > 0)) { const tr = this.struct.find(st => st.k === 'trap' && Math.hypot(a.x - st.x, a.y - st.y) < 34); if (tr) { a.trapT = TRAP_SEC; this.struct = this.struct.filter(s => s !== tr); for (const q of P) send(q.ws, { t: 'trapped' }); } }   // the big monster ran over a trap: stuck for 20 s
      if (a.trapT > 0) { a.trapT -= dt; a.cd = Math.max(a.cd, 0.3); continue; }   // stuck: no moving, no attacking
      if (a.stunT > 0) { a.stunT -= dt; a.cd = Math.max(a.cd, 0.3); continue; }   // stunned by an ability
      if (a.slowT > 0) a.slowT -= dt;
      let tgt = null, bd = 1e9, slow = 0; const ai = a.isl | 0, home = ai === 0, own = this.islands[ai] || this.islands[0];
      for (const p of P) if (!p.down && !p.boat && this.onIsland(p, ai)) {   // aliens only hunt players on their own island
        const dd = dist(a, p); if (dd < bd) { bd = dd; tgt = p; }
        const sl = GC.BY[p.cls].slow; if (sl > slow && dd < 110) slow = sl;
      }
      const sp = a.sp * (1 - slow) * (a.slowT > 0 ? 0.45 : 1);
      const tx = tgt ? tgt.x : own.x, ty = tgt ? tgt.y : own.y, d = Math.max(1, Math.hypot(tx - a.x, ty - a.y));   // with nobody to chase they drift to the fire (home) or the island's middle
      if (tgt) a.fa = Math.atan2(ty - a.y, tx - a.x);   // always face the nearest living player, even when standing still against the fire ring
      let mx = (tx - a.x) / d, my = (ty - a.y) / d;
      { // the firelight ring is a wall for aliens: when the straight line to the player would run into it, slide around it (the short way) instead of getting stuck on the near side
        const LF = a.k < 3 ? this.litAt(a.x, a.y, 70) : null, ad0 = LF ? Math.max(1, Math.hypot(a.x - LF.x, a.y - LF.y)) : 1;
        if (LF) {
          const ux = (a.x - LF.x) / ad0, uy = (a.y - LF.y) / ad0;
          if (mx * ux + my * uy < 0.15) {
            const cr = ux * my - uy * mx; if (Math.abs(cr) > 0.25) a.side = cr >= 0 ? 1 : -1; else if (!a.side) a.side = Math.random() < 0.5 ? 1 : -1;
            mx = -uy * a.side; my = ux * a.side;
          }
        }
      }
      let stay = false;
      if (a.k === 4 && tgt) {   // archer villager: stops at range, aims for 1.5 s (the client shows a red aim line), then looses a fast arrow
        if (a.shotCd > 0) a.shotCd -= dt;
        if (d <= a.range && a.shotCd <= 0) {
          a.aim = (a.aim || 0) + dt; stay = true;
          if (a.aim >= 1.5) { const ang = Math.atan2(ty - a.y, tx - a.x); this.arrows.push({ id: this.nid++, x: a.x, y: a.y, vx: Math.cos(ang) * ARROW_SPEED, vy: Math.sin(ang) * ARROW_SPEED, dmg: a.dmg, ttl: 1.3 }); a.aim = 0; a.shotCd = 2.6; }
        } else a.aim = 0;
      } else if (a.k === 4) a.aim = 0;
      if (!stay && d > (a.stop || 20)) { a.x += mx * sp * dt; a.y += my * sp * dt; }
      for (const st of this.struct) {   // every structure is solid and indestructible (except traps)
        if (st.k === 'trap') continue;
        const sd = Math.hypot(a.x - st.x, a.y - st.y), mn = st.r + (a.rad || 12);
        if (sd < mn) { const k = sd > 0.01 ? mn / sd : 1; a.x = st.x + (a.x - st.x) * k; a.y = st.y + (a.y - st.y) * k; }   // solid: aliens slide around it, but cannot damage it, and it does not damage them
      }
      { const LF = a.k < 3 ? this.litAt(a.x, a.y, 0) : null; if (LF) { const r0 = RC.camp(LF.f.lvl), dx = a.x - LF.x, dy = a.y - LF.y, dd = Math.max(1, Math.hypot(dx, dy)); a.x = LF.x + dx * r0 / dd; a.y = LF.y + dy * r0 / dd; } }   // repelled by firelight (the main fire or any campfire)
      if (!home) { const ox = a.x - own.x, oy = a.y - own.y, od = Math.hypot(ox, oy), lim = own.r - 30; if (od > lim) { a.x = own.x + ox * lim / od; a.y = own.y + oy * lim / od; } }   // outer-island enemies stay ashore
      if (tgt && d < (a.reach === undefined ? 28 : a.reach) && a.cd <= 0 && (a.k >= 3 || !this.litAt(tgt.x, tgt.y))) {
        this.hurt(tgt, a.dmg); a.cd = a.atkCd || 1;
        if (a.k === 2) {   // the Charger sends you flying (about 10 steps) and then needs a moment before it can hit again
          const kx = tgt.x - a.x, ky = tgt.y - a.y, kl = Math.max(1, Math.hypot(kx, ky));
          tgt.kb = { dx: kx / kl, dy: ky / kl, t: 0, v0: CHARGER.knock * 3 / CHARGER.stunSec }; a.cd = 1.3;
        }
        if (tgt.hp <= 0) { tgt.hp = 0; tgt.down = 1; tgt.rev = 0; }
      }
    }
    for (let i = this.arrows.length - 1; i >= 0; i--) {   // arrows fly straight; spike walls / stations stop them, players take the damage
      const w = this.arrows[i]; w.x += w.vx * dt; w.y += w.vy * dt; w.ttl -= dt; let dead = w.ttl <= 0;
      if (!dead) for (const st of this.struct) if (st.k !== 'trap' && Math.hypot(w.x - st.x, w.y - st.y) < st.r) { dead = true; break; }
      if (!dead) for (const p of P) if (!p.down && !p.boat && Math.hypot(p.x - w.x, p.y - w.y) < 18) { this.hurt(p, w.dmg); dead = true; break; }
      if (dead) this.arrows.splice(i, 1);
    }
    for (const a of this.aliens) if (a.hp <= 0 && !a.dropped) { a.dropped = 1; if (Math.random() < 0.03) this.pend.push({ k: 'd', x: a.x, y: a.y, t: 0.35 }); }   // 3% of dead mobs leave a diamond
    this.aliens = this.aliens.filter(a => a.hp > 0);
    if (this.struct.some(st => st.dead)) this.struct = this.struct.filter(st => !st.dead);
    if (P.every(p => p.down)) this.over = 6;
  }
  snap() {
    const f = this.fire, rs = this.res.map(r => Math.max(0, Math.ceil(r.hp - 1e-9))).join('');
    this.rTick = ((this.rTick || 0) + 1) % 60; const rSend = rs !== this.lastR || this.rForce || this.rTick === 0; this.lastR = rs; this.rForce = 0;
    return JSON.stringify({
      t: 's', c: Math.round(this.c * 10) / 10, n: this.night, ph: this.ph(), o: this.over > 0 ? 1 : 0,
      f: [Math.round(f.fuel), RC.fuelMax(f.lvl), f.lvl, f.fuel > 0 ? RC.camp(f.lvl) : 0],
      p: [...this.players.values()].map(p => [p.id, p.name, p.cls, Math.round(p.x), Math.round(p.y), Math.round(p.hp), p.mhp, p.wood, p.stone, p.food, p.down, Math.round(p.rev * 10) / 10, p.sw, p.swk, Math.round(p.swa * 100), p.scrap, Math.round(p.fa * 100), Math.round(p.sta), p.tired, p.slots, p.boat || 0, p.meat || 0, p.gold || 0, p.pelt || 0, slotCap(p, this), !(p.prof && p.prof.abil && p.prof.abil[p.cls]) ? 0 : p.abilCd > 0 ? Math.ceil(p.abilCd) + 1 : 1, p.apelt || 0]),
      bt: this.boats.map(b => [b.id, Math.round(b.x), Math.round(b.y), Math.round(b.ang * 100), b.riders.length, b.drv, b.type || 'boat']), sf: this.scrapFound ? 1 : 0,
      a: this.aliens.map(a => [a.id, Math.round(a.x), Math.round(a.y), Math.round(a.hp), a.mhp, a.k, a.fa === undefined ? null : Math.round(a.fa * 100), Math.ceil(a.trapT > 0 ? a.trapT : 0), a.aim > 0 ? Math.round(Math.min(1, a.aim / 1.5) * 100) : 0]),
      wf: (this.wolves || []).map(w => [w.id, Math.round(w.x), Math.round(w.y), Math.round(w.fa * 100), Math.round(w.hp), w.mhp, w.st, w.bite > 0 ? 1 : 0, w.alpha || 0, w.big || 0]),
      rb: this.rabbits.map(b => [b.id, Math.round(b.x), Math.round(b.y), Math.round(b.fa * 100), b.run ? 1 : b.sit ? 0 : 2]),
      cf: this.camps.map(c => [c.id, Math.round(c.x), Math.round(c.y), Math.round(c.fuel), RC.fuelMax(c.lvl), c.lvl, c.fuel > 0 ? RC.camp(c.lvl) : 0]),
      lo: this.loot.filter(l => l.open).map(l => l.id),
      bl: this.bullets.map(b => [b.id, Math.round(b.x), Math.round(b.y), Math.round(Math.atan2(b.vy, b.vx) * 100), b.kind]),
      zn: this.zones.map(z => [z.id, Math.round(z.x), Math.round(z.y), z.r, z.k, Math.ceil(z.ttl)]),
      tr: this.turrets.map(t => [t.id, Math.round(t.x), Math.round(t.y)]),
      ar: this.arrows.map(w => [w.id, Math.round(w.x), Math.round(w.y), Math.round(Math.atan2(w.vy, w.vx) * 100)]),
      r: rSend ? rs : undefined,
      dr: this.drops.map(d => [d.id, d.k, Math.round(d.x), Math.round(d.y), d.food]),
      st: this.struct.map(t => [t.id, t.k, Math.round(t.x), Math.round(t.y), Math.round(t.hp), t.mhp, t.items ? [t.items.wood, t.items.stone, t.items.food, t.items.scrap] : t.smelt ? [t.smelt.q, Math.round(t.smelt.prog / RC.SMELT.time * 100) / 100] : 0, t.rot || 0]),
    });
  }
}

const rooms = new Map();
// ---------- rooms survive a server restart: saved to rooms.json every 3 s and on shutdown, reloaded at startup ----------
const ROOMS_FILE = DIR && path.join(DIR, 'rooms.json'); let lastRoomsJson = '';
function saveRooms() {
  if (!ROOMS_FILE) return;
  try { const j = JSON.stringify([...rooms.values()].map(r => r.snapshot())); if (j === lastRoomsJson) return; lastRoomsJson = j; fs.writeFileSync(ROOMS_FILE + '.tmp', j); fs.renameSync(ROOMS_FILE + '.tmp', ROOMS_FILE); } catch (e) { console.error('rooms save failed:', e.message); }
}
try { for (const o of JSON.parse(fs.readFileSync(ROOMS_FILE, 'utf8'))) rooms.set(o.code, Room.restore(o)); console.log('restored', rooms.size, 'room(s)'); } catch (e) { }
setInterval(saveRooms, 3000);
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
      const owned = process.env.START_OWNALL ? GC.LIST.map(c => c.id) : ownedOf(pf);   // (START_OWNALL: test hook)
      const cls = owned.includes(m.cls) ? m.cls : (owned.includes(pf.last) ? pf.last : 'forester');
      if (pf.last !== cls) { pf.last = cls; dirty = true; }
      let rc = String(m.room || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
      if (m.load) {   // "Continue saved game": rebuild the saved room (unless that room is still running)
        const sv = readSave(email); if (!sv || !sv.code) { send(ws, { t: 'err', m: 'No saved game found.' }); return; }
        rc = sv.code; if (!rooms.has(rc)) { try { rooms.set(rc, Room.fromSave(sv)); } catch (e) { console.error('load failed:', e && e.stack || e); send(ws, { t: 'err', m: 'The saved game could not be loaded.' }); return; } }
      }
      if (!rc) rc = code();
      if (!rooms.has(rc)) rooms.set(rc, new Room(rc));
      room = rooms.get(rc);
      if (room.players.size >= MAXP) { send(ws, { t: 'err', m: 'Room is full' }); return; }
      me = room.add(ws, name, cls, pf, email);
      send(ws, { t: 'init', id: me.id, room: rc, R, cls, gear: me.gear, prof: view(pf), res: room.res.map(r => [r.k, Math.round(r.x), Math.round(r.y)]), isl: room.islands.map(i => [i.x, i.y, i.r, i.b]), loot: room.loot.map(l => [l.id, l.x, l.y, l.b, l.seed, l.tier, l.cx, l.cy, l.trader, l.tx, l.ty]) });
    } else if (m.t === 'craft' && me) {
      const now = Date.now(); if (now - (me.lastCraft || 0) < 200) { send(ws, { t: 'crafted', id: String(m.id || ''), ok: false, msg: 'Slow down a little.', gear: me.gear }); return; } me.lastCraft = now;
      let res; try { res = room.craft(me, String(m.id || ''), m.rot); } catch (e) { console.error('craft error:', e && e.stack || e); res = { ok: false, msg: 'Could not craft that.' }; }
      send(ws, { t: 'crafted', id: String(m.id || ''), ok: res.ok, msg: res.msg, gear: me.gear });
    } else if (m.t === 'chest' && me) {
      try { room.chestOp(me, +m.id, String(m.res || ''), m.n); } catch (e) { console.error('chest error:', e && e.stack || e); }
    } else if (m.t === 'smelt' && me) {
      const now = Date.now(); if (now - (me.lastSmelt || 0) < 150) return; me.lastSmelt = now;
      let res; try { res = room.smelterLoad(me, m.id | 0, m.n); } catch (e) { console.error('smelt error:', e && e.stack || e); res = { ok: false, msg: 'Could not smelt that.' }; }
      send(ws, { t: 'smelted', ok: res.ok, msg: res.msg });
    } else if (m.t === 'dismantle' && me) {
      const now = Date.now(); if (now - (me.lastDis || 0) < 300) return; me.lastDis = now;
      let res; try { res = room.dismantle(me, m.id | 0); } catch (e) { console.error('dismantle error:', e && e.stack || e); res = { ok: false, msg: 'Could not dismantle that.' }; }
      send(ws, { t: 'dism', ok: res.ok, msg: res.msg });
    } else if (m.t === 'boat' && me) {
      const now = Date.now(); if (now - (me.lastBoat || 0) < 300) return; me.lastBoat = now;
      const res = room.placeBoat(me, m.i | 0); send(ws, { t: 'boatPlaced', ok: res.ok, msg: res.msg });
    } else if (m.t === 'save' && me) {
      const now = Date.now(); if (now - (me.lastSave || 0) < 5000) return; me.lastSave = now;
      let out = null; try { out = writeSave(me.email, room.saveBlob()); } catch (e) { console.error('save failed:', e && e.stack || e); }
      if (!out || !me.prof) { send(ws, { t: 'saved', ok: false }); return; }
      me.prof.save = { at: now, n: room.night, rc: room.code, bytes: out.bytes, gz: out.gz }; dirty = true;
      send(ws, { t: 'saved', ok: true, at: now, night: room.night, bytes: out.bytes, gz: out.gz, players: room.players.size });
    } else if (m.t === 'trade' && me) {
      const now = Date.now(); if (now - (me.lastTrade || 0) < 250) return; me.lastTrade = now;
      let res; try { res = room.trade(me, m.id | 0, String(m.offer || '')); } catch (e) { console.error('trade error:', e && e.stack || e); res = { ok: false, msg: 'Trade failed.' }; }
      send(ws, { t: 'traded', ok: res.ok, msg: res.msg, gear: me.gear, prof: view(me.prof) });
    } else if (m.t === 'abil' && me) {
      const now = Date.now(); if (now - (me.lastAbil || 0) < 300) return; me.lastAbil = now;
      try { room.useAbility(me); } catch (e) { console.error('ability error:', e && e.stack || e); }
    } else if (m.t === 'use' && me) {
      const now = Date.now(); if (now - (me.lastUse || 0) < 150) return; me.lastUse = now;
      try { room.useSlot(me, m.i | 0); } catch (e) { console.error('use error:', e && e.stack || e); }
    } else if (m.t === 'cook' && me) {
      const now = Date.now(); if (now - (me.lastCook || 0) < 150) return; me.lastCook = now;
      let res; try { res = room.cook(me, String(m.id || '')); } catch (e) { console.error('cook error:', e && e.stack || e); res = { ok: false, msg: 'Could not cook that.' }; }
      send(ws, { t: 'cooked', id: String(m.id || ''), ok: res.ok, msg: res.msg, b: me.buff });
    } else if (m.t === 'in' && me) {
      const n = v => Math.max(-1, Math.min(1, +v || 0));
      me.inp = { dx: n(m.dx), dy: n(m.dy), act: m.act ? 1 : 0, hit: m.hit ? 1 : 0, rn: Math.max(0, Math.min(1, +m.rn || 0)) }; me.inpAt = Date.now();
    }
  });
  ws.on('close', () => { if (room && me) { room.releaseBoat(me); if (!me.ended) room.stash(me); room.players.delete(me.id); } });
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
