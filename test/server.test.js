'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-test-'));
process.env.DATA_DIR = dataDir;
process.env.ADMIN_PASSWORD = 'test-pass';
const app = require('../server');

let server, base, cookie;
before(async () => {
  server = app.listen(0);
  await new Promise(r => server.once('listening', r));
  base = 'http://127.0.0.1:' + server.address().port;
});
after(() => { server.close(); fs.rmSync(dataDir, { recursive: true, force: true }); });

const put = (body, c) => fetch(base + '/api/state', {
  method: 'PUT', headers: { 'Content-Type': 'application/json', ...(c ? { Cookie: c } : {}) }, body: JSON.stringify(body),
});

test('home page is served with the server flag', async () => {
  const r = await fetch(base + '/');
  assert.strictEqual(r.status, 200);
  const html = await r.text();
  assert.match(html, /window\.__SERVER=1;window\.__ADMIN=0/);
  assert.match(html, /<script id="seed" type="application\/json">/);
});

test('saving needs a login', async () => {
  assert.strictEqual((await put({ tiles: [], _t: 1 })).status, 401);
});

test('wrong password is refused, right one logs in', async () => {
  const bad = await fetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"password":"nope"}' });
  assert.strictEqual(bad.status, 401);
  const ok = await fetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"password":"test-pass"}' });
  assert.strictEqual(ok.status, 200);
  cookie = ok.headers.get('set-cookie').split(';')[0];
  const me = await (await fetch(base + '/api/me', { headers: { Cookie: cookie } })).json();
  assert.strictEqual(me.admin, true);
});

test('saved data appears in the page seed, and older saves are refused', async () => {
  assert.strictEqual((await put({ tiles: [{ text: 'Boat A v Boat B </script>' }], _t: 1000 }, cookie)).status, 200);
  const html = await (await fetch(base + '/')).text();
  assert.match(html, /Boat A v Boat B \\u003c\/script>/);
  assert.strictEqual((await put({ tiles: [], _t: 999 }, cookie)).status, 409);
});

test('pictures inside old backups are moved to files', async () => {
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
  const r = await put({ tiles: [{ img: png, ex: [png] }], _t: 2000 }, cookie);
  const j = await r.json();
  assert.strictEqual(j.moved, 2);
  assert.match(j.state.tiles[0].img, /^\/uploads\/[0-9a-f]{32}\.png$/);
  const pic = await fetch(base + j.state.tiles[0].img);
  assert.strictEqual(pic.status, 200);
  assert.strictEqual(pic.headers.get('content-type'), 'image/png');
});

test('picture upload needs a login and returns an address', async () => {
  const body = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
  assert.strictEqual((await fetch(base + '/api/upload', { method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body })).status, 401);
  const r = await fetch(base + '/api/upload', { method: 'POST', headers: { 'Content-Type': 'image/jpeg', Cookie: cookie }, body });
  assert.match((await r.json()).url, /^\/uploads\/[0-9a-f]{32}\.jpg$/);
});

test('a lighter thumbnail copy is made from a large picture', async () => {
  const sharp = require('sharp');
  const big = await sharp({ create: { width: 1920, height: 1080, channels: 3, background: '#336699' } }).jpeg().toBuffer();
  const up = await (await fetch(base + '/api/upload', { method: 'POST', headers: { 'Content-Type': 'image/jpeg', Cookie: cookie }, body: big })).json();
  const t = await fetch(base + up.url.replace(/\.jpg$/, '.t.jpg'));
  assert.strictEqual(t.status, 200);
  const meta = await sharp(Buffer.from(await t.arrayBuffer())).metadata();
  assert.strictEqual(meta.width, 1000);
  const full = await sharp(Buffer.from(await (await fetch(base + up.url)).arrayBuffer())).metadata();
  assert.strictEqual(full.width, 1920);
  assert.strictEqual((await fetch(base + '/uploads/' + '0'.repeat(32) + '.t.jpg')).status, 404);
});

test('the admin page is separate and not indexed', async () => {
  const pub = await (await fetch(base + '/')).text();
  assert.doesNotMatch(pub, /window\.__ADMINPAGE=1/);
  const anon = await fetch(base + '/admin');
  assert.strictEqual(anon.status, 200);
  assert.strictEqual(anon.headers.get('x-robots-tag'), 'noindex, nofollow');
  const anonHtml = await anon.text();
  assert.match(anonHtml, /Back page login/);
  assert.doesNotMatch(anonHtml, /__ADMINPAGE|id="adm"|id="seed"/);
  const r = await fetch(base + '/admin', { headers: { Cookie: cookie } });
  assert.match(await r.text(), /window\.__ADMINPAGE=1/);
});

test('the website file is sent compressed', async () => {
  const r = await fetch(base + '/', { headers: { 'Accept-Encoding': 'gzip' } });
  assert.strictEqual(r.headers.get('content-encoding'), 'gzip');
});
