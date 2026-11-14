'use strict';
// Accounts: Google sign-in (ID token verified against Google's public keys) and emailed one-time codes.
// Sessions are random tokens; only their SHA-256 hash is stored.
const crypto = require('crypto'), https = require('https'), fs = require('fs'), path = require('path');

const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const EMAIL = /^[A-Za-z0-9._%+\-]{1,64}@[A-Za-z0-9.\-]{1,190}\.[A-Za-z]{2,24}$/;
const normEmail = e => { e = String(e || '').trim().toLowerCase(); return e.length <= 254 && EMAIL.test(e) && !e.includes('..') ? e : null; };
const SESSION_MS = 90 * 24 * 3600e3;

module.exports = function makeAuth({ dir, config }) {
  const file = dir && path.join(dir, 'sessions.json');
  let sessions = {}; try { sessions = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { }
  let dirty = false;
  const save = () => {
    if (!dirty || !file) return; dirty = false;
    const now = Date.now(); for (const h in sessions) if (sessions[h].x < now) delete sessions[h];
    try { fs.writeFileSync(file + '.tmp', JSON.stringify(sessions)); fs.renameSync(file + '.tmp', file); } catch (e) { console.error('session save failed:', e.message); }
  };

  function createSession(email) {
    const token = crypto.randomBytes(32).toString('hex');
    sessions[sha(token)] = { e: email, t: Date.now(), x: Date.now() + SESSION_MS }; dirty = true; return token;
  }
  function sessionEmail(token) {
    if (typeof token !== 'string' || token.length !== 64) return null;
    const s = sessions[sha(token)]; if (!s) return null;
    if (s.x < Date.now()) { delete sessions[sha(token)]; dirty = true; return null; }
    return s.e;
  }
  function logout(token) { if (typeof token === 'string' && sessions[sha(token)]) { delete sessions[sha(token)]; dirty = true; } }

  // ---- rate limiting (sliding window in memory) ----
  const log = new Map();
  function allow(key, max, windowMs) {
    const now = Date.now(), a = (log.get(key) || []).filter(t => now - t < windowMs);
    if (a.length >= max) { log.set(key, a); return false; }
    a.push(now); log.set(key, a); return true;
  }
  setInterval(() => { const now = Date.now(); for (const [k, a] of log) { const f = a.filter(t => now - t < 3600e3); if (f.length) log.set(k, f); else log.delete(k); } }, 600e3).unref();

  // ---- email one-time codes ----
  const codes = new Map();
  let ses = null;
  async function sendMail(to, code) {
    if ((config.mailMode || 'ses') === 'log') { console.log('[MAIL]', to, code); return; }
    const { SESv2Client, SendEmailCommand } = require('@aws-sdk/client-sesv2');
    ses = ses || new SESv2Client({ region: config.sesRegion || 'us-west-1' });
    await ses.send(new SendEmailCommand({
      FromEmailAddress: config.mailFrom, Destination: { ToAddresses: [to] },
      Content: { Simple: {
        Subject: { Data: 'Your Island Night code: ' + code },
        Body: {
          Text: { Data: 'Your Island Night sign-in code is ' + code + '\n\nIt expires in 10 minutes. If you did not ask for this, you can ignore this email.' },
          Html: { Data: '<div style="font-family:sans-serif"><h2>🌙 Island Night</h2><p>Your sign-in code is</p><p style="font-size:32px;letter-spacing:6px;font-weight:bold">' + code + '</p><p>It expires in 10 minutes. If you did not ask for this, you can ignore this email.</p></div>' },
        },
      } },
    }));
  }
  async function startEmail(email, ip) {
    const e = normEmail(email); if (!e) return { ok: false, err: 'Enter a valid email address.' };
    if (!allow('e:' + e, 5, 3600e3) || !allow('ip:' + ip, 20, 3600e3) || !allow('all', 400, 3600e3)) return { ok: false, err: 'Too many requests. Please try again later.' };
    const prev = codes.get(e); if (prev && Date.now() - prev.t < 30e3) return { ok: false, err: 'Please wait 30 seconds before asking for another code.' };
    const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0'), salt = crypto.randomBytes(8).toString('hex');
    codes.set(e, { h: sha(salt + code), salt, x: Date.now() + 10 * 60e3, tries: 0, t: Date.now() });
    try { await sendMail(e, code); } catch (err) { codes.delete(e); console.error('mail failed:', err.name, err.message); return { ok: false, err: 'Could not send the email right now. Please try again later.' }; }
    return { ok: true };
  }
  function verifyEmail(email, code) {
    const e = normEmail(email), c = e && codes.get(e);
    if (!c || Date.now() > c.x) { if (c) codes.delete(e); return { ok: false, err: 'That code has expired. Ask for a new one.' }; }
    if (++c.tries > 5) { codes.delete(e); return { ok: false, err: 'Too many wrong tries. Ask for a new code.' }; }
    const a = Buffer.from(sha(c.salt + String(code || '').replace(/\s/g, ''))), b = Buffer.from(c.h);
    if (!crypto.timingSafeEqual(a, b)) return { ok: false, err: 'Wrong code. Check the email and try again.' };
    codes.delete(e); return { ok: true, email: e };
  }

  // ---- Google ID token verification ----
  let jwks = null, jwksAt = 0;
  const getJson = url => new Promise((res, rej) => https.get(url, r => { let b = ''; r.on('data', d => b += d); r.on('end', () => { try { res(JSON.parse(b)); } catch (e) { rej(e); } }); }).on('error', rej));
  async function keys(force) {
    if (!force && jwks && Date.now() - jwksAt < 3600e3) return jwks;
    const j = await (config._fetchKeys ? config._fetchKeys() : getJson('https://www.googleapis.com/oauth2/v3/certs'));
    jwks = j.keys || []; jwksAt = Date.now(); return jwks;
  }
  const b64 = s => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  async function verifyGoogle(cred) {
    const bad = err => ({ ok: false, err: err || 'Google sign-in failed. Please try again.' });
    if (!config.googleClientId) return bad('Google sign-in is not set up yet.');
    const parts = String(cred || '').split('.'); if (parts.length !== 3) return bad();
    let h, p; try { h = JSON.parse(b64(parts[0])); p = JSON.parse(b64(parts[1])); } catch (e) { return bad(); }
    if (h.alg !== 'RS256' || !h.kid) return bad();
    try {
      let k = (await keys(false)).find(x => x.kid === h.kid); if (!k) k = (await keys(true)).find(x => x.kid === h.kid);
      if (!k) return bad();
      const pub = crypto.createPublicKey({ key: k, format: 'jwk' });
      if (!crypto.verify('RSA-SHA256', Buffer.from(parts[0] + '.' + parts[1]), pub, b64(parts[2]))) return bad();
    } catch (e) { console.error('google verify error:', e.message); return bad(); }
    const now = Date.now() / 1000;
    if (p.iss !== 'accounts.google.com' && p.iss !== 'https://accounts.google.com') return bad();
    if (p.aud !== config.googleClientId || !(p.exp > now) || p.nbf > now + 60) return bad();
    if (p.email_verified !== true && p.email_verified !== 'true') return bad('Your Google email is not verified.');
    const email = normEmail(p.email); if (!email) return bad();
    return { ok: true, email, name: String(p.name || '').slice(0, 40) };
  }

  return { normEmail, createSession, sessionEmail, logout, startEmail, verifyEmail, verifyGoogle, save, allow };
};
