/**
 * VN crochet — local dev & studio server
 *
 *   npm start   →  http://localhost:3000        (shop)
 *                  http://localhost:3000/admin/ (admin panel)
 *
 * Speaks the same /api contract as the serverless API, and reuses the shared
 * sign-in and validation code, so what works here works live.
 * Data is kept in local files:
 *   data/catalog.json        products (also the shop's static fallback)
 *   data/settings.json       shop settings
 *   data/orders.local.json   orders (git-ignored)
 *   images/                  uploaded photos & videos
 *
 * Admin username/password/JWT_SECRET are read from api/local.settings.json.
 */

'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 3000;
const FILES = {
  catalog: path.join(ROOT, 'data', 'catalog.json'),
  settings: path.join(ROOT, 'data', 'settings.json'),
  orders: path.join(ROOT, 'data', 'orders.local.json'),
  images: path.join(ROOT, 'images')
};

// ── Credentials: same variables the live API uses ───────────────────────────
try {
  const local = JSON.parse(fs.readFileSync(path.join(ROOT, 'api', 'local.settings.json'), 'utf8'));
  for (const [k, v] of Object.entries(local.Values || {})) if (v && !process.env[k]) process.env[k] = v;
} catch {
  console.warn('  ! api/local.settings.json not found — copy local.settings.json.example and fill it in.');
}

const auth = require('./api/shared/auth');
const {cleanProducts, cleanSettings, cleanOrder, DEFAULT_SETTINGS, ORDER_STATUSES} = require('./api/shared/validate');

// ── File helpers ────────────────────────────────────────────────────────────
const readJson = (file, fallback) => {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
};
const writeJson = (file, data) => {
  // Write to a temp file then rename, so a crash never leaves half a file.
  fs.mkdirSync(path.dirname(file), {recursive: true});
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, file);
};
function readStore() {
  const products = readJson(FILES.catalog, []);
  const settings = cleanSettings(readJson(FILES.settings, DEFAULT_SETTINGS));
  const etag = '"' + crypto.createHash('sha1').update(JSON.stringify([products, settings])).digest('hex').slice(0, 16) + '"';
  return {products: Array.isArray(products) ? products : [], settings, etag};
}

// Sniff real file signature for images (JPG/PNG/WebP) and videos (MP4/WebM)
function sniffMedia(buf) {
  if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return {ext: 'webp', kind: 'image'};
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return {ext: 'jpg', kind: 'image'};
  if (buf.length > 8 && buf.toString('hex', 0, 8) === '89504e470d0a1a0a') return {ext: 'png', kind: 'image'};
  if (buf.length > 12 && buf.toString('ascii', 4, 8) === 'ftyp') return {ext: 'mp4', kind: 'video'};
  if (buf.length > 4 && buf.toString('hex', 0, 4) === '1a45dfa3') return {ext: 'webm', kind: 'video'};
  return null;
}

function saveMediaBuffer(buf, ext) {
  const name = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  fs.writeFileSync(path.join(FILES.images, name), buf);
  return `/images/${name}`;
}

// Promote any base64 data:image/... URLs to real files in /images so
// data/catalog.json stays fast and lightweight.
function promoteLocalDataUrl(url) {
  if (typeof url !== 'string' || !url.startsWith('data:image/')) return url;
  const raw = url.replace(/^data:[^,]*,/, '');
  const buf = Buffer.from(raw, 'base64');
  if (!buf.length || buf.length > 6 * 1024 * 1024) return '';
  const detected = sniffMedia(buf);
  if (!detected || detected.kind !== 'image') return '';
  return saveMediaBuffer(buf, detected.ext);
}

fs.mkdirSync(FILES.images, {recursive: true});

// ── App ─────────────────────────────────────────────────────────────────────
const app = express();
app.use(express.json({limit: '35mb'}));
app.use(express.urlencoded({extended: false, limit: '35mb'}));
app.use((req, res, next) => { if (req.path.startsWith('/api/')) res.set('Cache-Control', 'no-store'); next(); });

const requireAdmin = (req, res, next) =>
  auth.isAdmin(req.headers) ? next() : res.status(401).json({error: 'Your session has ended. Sign in again.'});

app.post('/api/login', async (req, res) => {
  const ip = req.ip;
  const wait = auth.lockedFor(ip);
  if (wait) return res.status(429).json({error: `Too many attempts. Try again in ${wait} minute${wait === 1 ? '' : 's'}.`});
  const {username, password, remember} = req.body || {};
  if (auth.checkCredentials(username, password)) {
    auth.clearFails(ip);
    return res.json(auth.issueToken(remember === true));
  }
  auth.recordFail(ip);
  await new Promise((r) => setTimeout(r, 600));
  res.status(401).json({error: 'That username and password don’t match.'});
});

app.get('/api/catalog', (req, res) => {
  const store = readStore();
  const wantsEverything = req.query.all === '1';
  if (wantsEverything && req.headers.authorization && !auth.isAdmin(req.headers)) {
    return res.status(401).json({error: 'Your session has ended. Sign in again.'});
  }
  if (wantsEverything && auth.isAdmin(req.headers)) return res.json(store);
  res.json({products: store.products.filter((p) => p.active !== false), settings: store.settings});
});

// Support BOTH POST and PUT so admin saves work identically locally and online.
const saveCatalogHandler = (req, res) => {
  const body = req.body || {};
  // Accept {products, settings, etag} and the legacy bare array alike.
  const incoming = Array.isArray(body) ? {products: body} : body;
  const current = readStore();
  if (incoming.etag && incoming.etag !== current.etag) {
    return res.status(409).json({error: 'The shop was changed on another device. Reload to get the latest version, then make your change again.'});
  }
  const products = cleanProducts(incoming.products);
  for (const p of products) p.image = promoteLocalDataUrl(p.image);
  const settings = cleanSettings(incoming.settings !== undefined ? incoming.settings : current.settings);
  if (settings.heroImage) settings.heroImage = promoteLocalDataUrl(settings.heroImage);
  writeJson(FILES.catalog, products);
  writeJson(FILES.settings, settings);
  const saved = readStore();
  res.json({ok: true, etag: saved.etag, updatedAt: new Date().toISOString(), products, settings});
};
app.post('/api/catalog', requireAdmin, saveCatalogHandler);
app.put('/api/catalog', requireAdmin, saveCatalogHandler);

app.post('/api/upload', requireAdmin, (req, res) => {
  const raw = String(req.body?.data || '').replace(/^data:[^,]*,/, '');
  const buf = Buffer.from(raw, 'base64');
  if (!buf.length) return res.status(400).json({error: 'No file was received. Pick a photo (JPG/PNG/WebP) or video (MP4/WebM) and try again.'});
  const detected = sniffMedia(buf);
  if (!detected) return res.status(415).json({error: 'Use a JPG, PNG, WebP photo or an MP4/WebM video.'});
  const maxBytes = detected.kind === 'video' ? 25 * 1024 * 1024 : 5 * 1024 * 1024;
  if (buf.length > maxBytes) {
    return res.status(413).json({error: detected.kind === 'video' ? 'That video is larger than 25 MB.' : 'That image is larger than 5 MB.'});
  }
  const url = saveMediaBuffer(buf, detected.ext);
  res.json({ok: true, url, kind: detected.kind});
});

app.post('/api/orders', (req, res) => {
  const store = readStore();
  const order = cleanOrder(req.body, store.products, store.settings);
  order.id = 'VN-' + crypto.randomBytes(3).toString('hex').toUpperCase();
  order.createdAt = new Date().toISOString();
  order.key = `orders/${order.createdAt}-${order.id}.json`;
  const all = readJson(FILES.orders, []);
  all.push(order);
  writeJson(FILES.orders, all);
  res.json({ok: true, orderId: order.id, total: order.total});
});

app.get('/api/orders', requireAdmin, (_req, res) => {
  const all = readJson(FILES.orders, []);
  res.json({orders: all.slice().reverse()});
});

app.patch('/api/orders', requireAdmin, (req, res) => {
  const {key, status} = req.body || {};
  if (!ORDER_STATUSES.includes(status)) return res.status(400).json({error: 'Unknown order status.'});
  const all = readJson(FILES.orders, []);
  const order = all.find((o) => o.key === key);
  if (!order) return res.status(404).json({error: 'That order no longer exists.'});
  order.status = status;
  order.updatedAt = new Date().toISOString();
  writeJson(FILES.orders, all);
  res.json({ok: true, order});
});

app.use('/api', (_req, res) => res.status(404).json({error: 'Not found.'}));

// Static site. Never serve server-side secrets or tooling.
app.use((req, res, next) => {
  if (/^\/(api|node_modules|\.git|\.github|\.venv|\.vscode|\.kilo)(\/|$)/.test(req.path) || /\.(md|zip|bat|cmd)$/i.test(req.path) || req.path === '/server.js') {
    return res.status(404).send('Not found');
  }
  next();
});
app.use(express.static(ROOT, {index: 'index.html', extensions: ['html']}));
app.use((_req, res) => res.status(404).sendFile(path.join(ROOT, '404.html')));

// Errors (including validation) come back as clear JSON messages.
app.use((err, _req, res, _next) => {
  const status = err.status || (err.type === 'entity.too.large' ? 413 : 500);
  if (status >= 500) console.error(err);
  res.status(status).json({error: status === 413 ? 'That upload is too large.' : err.status ? err.message : 'Something went wrong on the server.'});
});

app.listen(PORT, () => {
  console.log(`\n  VN crochet is running`);
  console.log(`    Shop   http://localhost:${PORT}`);
  console.log(`    Admin  http://localhost:${PORT}/admin/\n`);
});
