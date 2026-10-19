'use strict';
// The Comparison Society – web server for Railway.
// Serves the site, stores the site data (state.json) and pictures (uploads/) on disk,
// and protects saving behind an admin password.

const express = require('express');
const sharp = require('sharp');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.resolve(process.env.DATA_DIR || process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(__dirname, 'data'));
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const HISTORY_DIR = path.join(DATA_DIR, 'history');
const STATE_FILE = path.join(DATA_DIR, 'state.json');
const TRAFFIC_FILE = path.join(DATA_DIR, 'traffic.json');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const SECRET = process.env.SESSION_SECRET || ADMIN_PASSWORD;
const HISTORY_KEEP = 30;
const SESSION_DAYS = 30;
const MIME_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
const THUMB_WIDTH = 1000;

for (const d of [DATA_DIR, UPLOAD_DIR, HISTORY_DIR]) fs.mkdirSync(d, { recursive: true });

const TEMPLATE = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
const SEED_RE = /(<script id="seed" type="application\/json">)[\s\S]*?(<\/script>)/;
if (!SEED_RE.test(TEMPLATE)) throw new Error('public/index.html has no seed script');

// ---------- storage ----------

function writeAtomic(file, text) {
  const tmp = file + '.' + process.pid + '.tmp';
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}

function readState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch (e) { return null; }
}

function writeState(state) {
  const text = JSON.stringify(state);
  writeAtomic(STATE_FILE, text);
  // keep the last HISTORY_KEEP versions so a bad save can be undone by hand
  fs.writeFileSync(path.join(HISTORY_DIR, String(Date.now()).padStart(14, '0') + '.json'), text);
  const old = fs.readdirSync(HISTORY_DIR).filter(f => f.endsWith('.json')).sort().slice(0, -HISTORY_KEEP);
  for (const f of old) fs.unlinkSync(path.join(HISTORY_DIR, f));
}

function saveImage(buf, mime) {
  const ext = MIME_EXT[mime];
  if (!ext) return null;
  const name = crypto.createHash('sha256').update(buf).digest('hex').slice(0, 32) + '.' + ext;
  const file = path.join(UPLOAD_DIR, name);
  if (!fs.existsSync(file)) writeAtomic(file, buf);
  return '/uploads/' + name;
}

// Pictures restored from an old backup arrive as base64 inside the data.
// Move each one into its own file and keep only its address in the data.
const DATA_URL_RE = /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=\s]+)$/;
function extractImages(v, moved) {
  if (typeof v === 'string') {
    const m = DATA_URL_RE.exec(v);
    if (!m) return v;
    const url = saveImage(Buffer.from(m[2], 'base64'), m[1]);
    if (!url) return v;
    moved.n++;
    return url;
  }
  if (Array.isArray(v)) return v.map(x => extractImages(x, moved));
  if (v && typeof v === 'object') {
    const o = {};
    for (const k of Object.keys(v)) o[k] = extractImages(v[k], moved);
    return o;
  }
  return v;
}

// ---------- admin login ----------

function sign(value) {
  return crypto.createHmac('sha256', SECRET).update(value).digest('base64url');
}

function makeToken() {
  const exp = String(Date.now() + SESSION_DAYS * 864e5);
  return exp + '.' + sign(exp);
}

function isAdmin(req) {
  if (!ADMIN_PASSWORD) return false;
  const m = /(?:^|;\s*)cs_admin=([^;]+)/.exec(req.headers.cookie || '');
  if (!m) return false;
  const [exp, sig] = decodeURIComponent(m[1]).split('.');
  if (!exp || !sig || +exp < Date.now()) return false;
  const want = Buffer.from(sign(exp));
  const got = Buffer.from(sig);
  return want.length === got.length && crypto.timingSafeEqual(want, got);
}

function passwordMatches(given) {
  const a = crypto.createHash('sha256').update(String(given || '')).digest();
  const b = crypto.createHash('sha256').update(ADMIN_PASSWORD).digest();
  return crypto.timingSafeEqual(a, b);
}

const failures = new Map(); // ip -> { n, until }
function lockedOut(ip) {
  const f = failures.get(ip);
  return f && f.until > Date.now();
}
function noteFailure(ip) {
  const f = failures.get(ip) || { n: 0, until: 0 };
  f.n++;
  if (f.n >= 5) { f.n = 0; f.until = Date.now() + 15 * 60e3; }
  failures.set(ip, f);
}

function requireAdmin(req, res, next) {
  if (isAdmin(req)) return next();
  res.status(401).json({ error: 'login required' });
}

// ---------- app ----------

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');

function sendSite(req, res, adminPage) {
  const state = readState();
  let html = TEMPLATE;
  if (state) {
    const json = JSON.stringify(state).replace(/</g, '\\u003c');
    html = html.replace(SEED_RE, (m, a, b) => a + json + b);
  }
  html = html.replace('<meta charset=utf8>', '<meta charset=utf8><script>window.__SERVER=1;window.__ADMIN=' + (isAdmin(req) ? 1 : 0) + (adminPage === true ? ';window.__ADMINPAGE=1' : '') + '</script>');
  res.set('Cache-Control', 'no-store').type('html').send(html);
}

app.get('/', (req, res) => sendSite(req, res));
app.get('/index.html', (req, res) => sendSite(req, res));
// The Back page lives at its own address; the public site has no Admin button
// Not logged in: only a small login page is sent (no site or Back page code at all)
const LOGIN_PAGE = `<!doctype html><html><head><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">
<title>Back page login</title><meta name="robots" content="noindex,nofollow"><style>
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;background:linear-gradient(160deg,#01030d,#041a5c 55%,#06388a);font-family:'Exo 2',system-ui,sans-serif;color:#fff}
form{background:#0b0f1a;border:2px solid #4a8dff;border-radius:12px;padding:20px;width:100%;max-width:340px;box-shadow:0 0 18px rgba(74,141,255,.45)}
h1{margin:0 0 12px;font-size:17px;color:#7db0ff;font-weight:600}
input{width:100%;box-sizing:border-box;padding:10px;border-radius:8px;border:1px solid #4a8dff;background:#000;color:#fff;font-size:16px}
.er{color:#ff6b7a;font-size:13px;min-height:18px;margin:6px 0}.row{display:flex;gap:8px}
button,a{flex:1;padding:10px;border-radius:8px;font-size:15px;font-weight:600;cursor:pointer;text-align:center;text-decoration:none}
button{border:2px solid #1e90ff;background:rgba(30,144,255,.22);color:#fff}a{flex:none;padding:10px 14px;border:1px solid #555;color:#ccc;font-weight:400}
</style></head><body><form id=f><h1>Back page login</h1><input id=p type=password autocomplete=current-password placeholder=Password autofocus>
<div class=er id=e></div><div class=row><button type=submit>Log in</button><a href="/">Cancel</a></div></form><script>
document.getElementById('f').onsubmit=async ev=>{ev.preventDefault();const e=document.getElementById('e');e.textContent='';
try{const r=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:document.getElementById('p').value})});
if(r.ok){location.reload();return}e.textContent=r.status===429?'Too many tries – wait 15 minutes':r.status===503?'No admin password is set on the server':'Wrong password'}catch(x){e.textContent='Could not reach the server'}};
</script></body></html>`;

app.get(['/admin', '/admin/'], (req, res) => {
  res.set('X-Robots-Tag', 'noindex, nofollow');
  if (!isAdmin(req)) return res.set('Cache-Control', 'no-store').type('html').send(LOGIN_PAGE);
  sendSite(req, res, true);
});

// Lighter copy of a picture for thumbnails and holders (made the first time it is asked for)
app.get(/^\/uploads\/([0-9a-f]{32})\.t\.(jpg|png|webp)$/, async (req, res, next) => {
  const [name, ext] = [req.params[0], req.params[1]];
  const thumb = path.join(UPLOAD_DIR, name + '.t.' + ext);
  const full = path.join(UPLOAD_DIR, name + '.' + ext);
  try {
    if (!fs.existsSync(thumb)) {
      if (!fs.existsSync(full)) return res.status(404).send('Not found');
      const buf = await sharp(full).resize({ width: THUMB_WIDTH, withoutEnlargement: true })
        .toFormat(ext === 'jpg' ? 'jpeg' : ext, { quality: 85 }).toBuffer();
      writeAtomic(thumb, buf);
    }
    res.set('Cache-Control', 'public, max-age=31536000, immutable').sendFile(thumb);
  } catch (e) {
    console.error('Making a thumbnail failed:', e);
    res.set('Cache-Control', 'no-store').sendFile(full, err => { if (err) next(); });
  }
});

app.use('/uploads', express.static(UPLOAD_DIR, { immutable: true, maxAge: '365d', index: false }));

app.get('/healthz', (req, res) => res.send('ok'));

app.get('/api/state', (req, res) => {
  res.set('Cache-Control', 'no-store').json(readState());
});

app.put('/api/state', requireAdmin, express.json({ limit: '60mb' }), (req, res) => {
  const incoming = req.body;
  if (!incoming || typeof incoming !== 'object' || !Array.isArray(incoming.tiles)) {
    return res.status(400).json({ error: 'not site data' });
  }
  const current = readState();
  // newest _t wins, like the browser copy
  if (current && (current._t || 0) > (incoming._t || 0)) {
    return res.status(409).json({ error: 'newer version on server', t: current._t });
  }
  const moved = { n: 0 };
  let state;
  try {
    state = extractImages(incoming, moved);
    writeState(state);
  } catch (e) {
    console.error('Saving the site data failed:', e);
    return res.status(500).json({ error: 'could not save: ' + e.message });
  }
  res.json({ ok: true, t: state._t, moved: moved.n, state: moved.n ? state : undefined });
});

app.post('/api/upload', requireAdmin, express.raw({ type: Object.keys(MIME_EXT), limit: '20mb' }), (req, res) => {
  if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: 'no picture' });
  let url;
  try {
    url = saveImage(req.body, req.get('content-type').split(';')[0].trim());
  } catch (e) {
    console.error('Saving a picture failed:', e);
    return res.status(500).json({ error: 'could not save picture: ' + e.message });
  }
  if (!url) return res.status(415).json({ error: 'unsupported picture type' });
  res.json({ url });
});

app.post('/api/login', express.json({ limit: '10kb' }), (req, res) => {
  if (!ADMIN_PASSWORD) return res.status(503).json({ error: 'ADMIN_PASSWORD is not set' });
  if (lockedOut(req.ip)) return res.status(429).json({ error: 'too many tries' });
  if (!passwordMatches(req.body && req.body.password)) {
    noteFailure(req.ip);
    return res.status(401).json({ error: 'wrong password' });
  }
  failures.delete(req.ip);
  res.cookie('cs_admin', makeToken(), {
    httpOnly: true, sameSite: 'lax', secure: req.secure, maxAge: SESSION_DAYS * 864e5, path: '/',
  });
  res.json({ ok: true });
});

app.post('/api/logout', (req, res) => {
  res.clearCookie('cs_admin', { path: '/' }).json({ ok: true });
});

app.get('/api/me', (req, res) => res.json({ admin: isAdmin(req) }));

// Plain check of the storage, for finding out why saving does not work
app.get('/api/status', (req, res) => {
  let writable = false;
  try {
    const f = path.join(DATA_DIR, '.write-test');
    fs.writeFileSync(f, 'ok');
    fs.unlinkSync(f);
    writable = true;
  } catch (e) {}
  let saved = null;
  try { saved = new Date(fs.statSync(STATE_FILE).mtimeMs).toISOString(); } catch (e) {}
  let pictures = 0;
  try { pictures = fs.readdirSync(UPLOAD_DIR).length; } catch (e) {}
  res.set('Cache-Control', 'no-store').json({
    loggedIn: isAdmin(req),
    passwordSet: !!ADMIN_PASSWORD,
    volume: process.env.RAILWAY_VOLUME_MOUNT_PATH || 'none',
    dataFolder: DATA_DIR,
    storageWritable: writable,
    siteDataSaved: saved,
    picturesStored: pictures,
    codeVersion: (process.env.RAILWAY_GIT_COMMIT_SHA || 'local').slice(0, 7),
  });
});

// Click tracking (sent by the page with navigator.sendBeacon)
let traffic = { d: {}, n: {} };
try { traffic = JSON.parse(fs.readFileSync(TRAFFIC_FILE, 'utf8')); } catch (e) {}
let trafficT = 0;
app.post('/api/track', express.text({ type: '*/*', limit: '2kb' }), (req, res) => {
  try {
    const { id, label, day } = JSON.parse(req.body);
    if (typeof id === 'string' && id.length < 100 && /^\d{4}-\d{2}-\d{2}$/.test(day)) {
      const o = traffic.d[day] = traffic.d[day] || {};
      o[id] = (o[id] || 0) + 1;
      if (typeof label === 'string') traffic.n[id] = label.slice(0, 200);
      clearTimeout(trafficT);
      trafficT = setTimeout(() => writeAtomic(TRAFFIC_FILE, JSON.stringify(traffic)), 2000);
    }
  } catch (e) {}
  res.status(204).end();
});
app.get('/api/traffic', requireAdmin, (req, res) => res.json(traffic));

app.use((req, res) => res.status(404).send('Not found'));

if (require.main === module) {
  if (!ADMIN_PASSWORD) console.warn('WARNING: ADMIN_PASSWORD is not set – nobody can log in to the Back page or save.');
  app.listen(PORT, () => console.log('The Comparison Society running on port ' + PORT + ', data in ' + DATA_DIR));
}

module.exports = app;
