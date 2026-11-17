// Copies the game files (../public) into ./www and points them at the game server. Run by `npm run sync` and by the build workflow.
// The server address comes from the GAME_URL environment variable, or the first line of game-url.txt (e.g. https://play.example.com).
const fs = require('fs'), path = require('path');
const src = path.join(__dirname, '..', 'public'), dst = path.join(__dirname, 'www');
let url = (process.env.GAME_URL || '').trim();
if (!url) { try { url = fs.readFileSync(path.join(__dirname, 'game-url.txt'), 'utf8').split('\n')[0].trim(); } catch (e) { } }
if (!/^https:\/\/[^\s/]+$/.test(url) || /REPLACE/i.test(url)) { console.error('Set the game server address: put it on the first line of mobile/game-url.txt (like https://play.example.com, https, no trailing slash) or set GAME_URL.'); process.exit(1); }
fs.rmSync(dst, { recursive: true, force: true });
fs.cpSync(src, dst, { recursive: true });
const f = path.join(dst, 'index.html');
let html = fs.readFileSync(f, 'utf8');
const inject = '<script>window.GAME_BASE=' + JSON.stringify(url) + ';window.IN_APP=true;</script>';
if (!html.includes('<head>')) { console.error('index.html has no <head>'); process.exit(1); }
html = html.replace('<head>', '<head>' + inject);
fs.writeFileSync(f, html);
console.log('www ready, server =', url);
