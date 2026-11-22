// ============================================================================
// VN crochet — Zero-Dependency Cloud Adapter (Supabase + Cloudinary)
// Works directly in any modern browser and on Cloudflare Pages with zero build
// steps and zero npm packages.
// ============================================================================

import {CLOUD_CONFIG} from './cloud-config.js';

const SESSION_KEY = 'vnc.cloud.session';

const cleanUrl = (u) => String(u || '').trim().replace(/\/+$/, '');

export function isCloudEnabled() {
  return Boolean(cleanUrl(CLOUD_CONFIG.supabaseUrl) && String(CLOUD_CONFIG.supabaseAnonKey || '').trim());
}

export function isCloudinaryEnabled() {
  return Boolean(String(CLOUD_CONFIG.cloudinaryCloudName || '').trim() && String(CLOUD_CONFIG.cloudinaryUploadPreset || '').trim());
}

function baseUrl() {
  return cleanUrl(CLOUD_CONFIG.supabaseUrl);
}

function anonKey() {
  return String(CLOUD_CONFIG.supabaseAnonKey || '').trim();
}

// ── Session storage (localStorage when "Remember me", else sessionStorage) ───

function readSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && parsed.access_token ? parsed : null;
  } catch {
    return null;
  }
}

function writeSession(session, persistent) {
  cloudSignOut();
  if (!session || !session.access_token) return;
  const payload = JSON.stringify({
    access_token: session.access_token,
    refresh_token: session.refresh_token || '',
    expires_at: session.expires_at || (Math.floor(Date.now() / 1000) + Number(session.expires_in || 3600)),
    persistent: persistent === true
  });
  try {
    (persistent ? localStorage : sessionStorage).setItem(SESSION_KEY, payload);
  } catch { /* private mode fallback */ }
}

export function cloudSignOut() {
  try {
    localStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(SESSION_KEY);
  } catch { /* ignore */ }
}

export function cloudHasSession() {
  return Boolean(readSession());
}

export async function cloudSignIn(email, password, remember = true) {
  const res = await fetch(`${baseUrl()}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      apikey: anonKey(),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({email: String(email || '').trim(), password: String(password || '')})
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description || data.msg || data.message || 'That email and password don’t match.');
  }
  writeSession(data, remember);
  return data;
}

export async function cloudGetAccessToken() {
  const session = readSession();
  if (!session) return '';
  const nowSec = Math.floor(Date.now() / 1000);
  // Refresh automatically if token expires within 60 seconds
  if (session.expires_at && session.expires_at - nowSec > 60) {
    return session.access_token;
  }
  if (!session.refresh_token) return session.access_token;
  try {
    const res = await fetch(`${baseUrl()}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: {
        apikey: anonKey(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({refresh_token: session.refresh_token})
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.access_token) {
      writeSession(data, session.persistent);
      return data.access_token;
    }
  } catch { /* fall through */ }
  cloudSignOut();
  return '';
}

const isJwt = (token) => typeof token === 'string' && token.split('.').length === 3;

async function sbFetch(path, {method = 'GET', body, auth = false, extraHeaders = {}} = {}) {
  const key = anonKey();
  const headers = {
    apikey: key,
    ...extraHeaders
  };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth) {
    const token = await cloudGetAccessToken();
    if (!token) {
      const err = new Error('Your session has ended. Please sign in again.');
      err.status = 401;
      err.authError = true;
      throw err;
    }
    headers.Authorization = `Bearer ${token}`;
  } else if (isJwt(key)) {
    // Only send Authorization: Bearer for legacy JWT anon keys (eyJ...).
    // New Supabase publishable keys (sb_publishable_...) authenticate via the
    // apikey header alone — sending them as Bearer causes PostgREST 401.
    headers.Authorization = `Bearer ${key}`;
  }

  const res = await fetch(`${baseUrl()}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store'
  });

  const text = await res.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = {message: text.slice(0, 200)}; }
  }

  if (res.status === 401 || res.status === 403) {
    if (auth) {
      cloudSignOut();
      const err = new Error('Your session has ended. Please sign in again.');
      err.status = 401;
      err.authError = true;
      throw err;
    }
  }
  if (!res.ok) {
    const err = new Error((data && (data.message || data.error_description || data.hint || data.error)) || `Cloud request failed (${res.status}).`);
    err.status = res.status;
    throw err;
  }
  return data;
}

// ── Storefront & Admin Catalog / Settings ────────────────────────────────────

export async function cloudFetchStore() {
  const rows = await sbFetch('/rest/v1/store_state?id=eq.main&select=products,settings,updated_at');
  if (!Array.isArray(rows) || !rows.length) return null;
  const row = rows[0];
  return {
    products: Array.isArray(row.products) ? row.products : [],
    settings: row.settings && typeof row.settings === 'object' && Object.keys(row.settings).length ? row.settings : null,
    updatedAt: row.updated_at || null,
    etag: row.updated_at || null
  };
}

function normalizeProductsForCloud(products) {
  const list = Array.isArray(products) ? products.map((p) => ({...p})) : [];
  const seen = new Set();
  let next = list.reduce((max, p) => Math.max(max, Number(p.id) || 0), 0) + 1;
  for (const p of list) {
    const id = Number(p.id) || 0;
    if (!id || seen.has(id)) p.id = next++;
    else p.id = id;
    seen.add(p.id);
  }
  return list;
}

export async function cloudSaveStore(products, settings) {
  const cleanedProducts = normalizeProductsForCloud(products);
  const updatedAt = new Date().toISOString();
  const rows = await sbFetch('/rest/v1/store_state', {
    method: 'POST',
    auth: true,
    extraHeaders: {Prefer: 'resolution=merge-duplicates,return=representation'},
    body: {
      id: 'main',
      products: cleanedProducts,
      settings: settings || {},
      updated_at: updatedAt
    }
  });
  const saved = Array.isArray(rows) && rows[0] ? rows[0] : {products: cleanedProducts, settings, updated_at: updatedAt};
  return {
    ok: true,
    etag: saved.updated_at || updatedAt,
    updatedAt: saved.updated_at || updatedAt,
    products: Array.isArray(saved.products) ? saved.products : cleanedProducts,
    settings: saved.settings || settings
  };
}

// ── Orders ───────────────────────────────────────────────────────────────────

function randomOrderId() {
  const bytes = new Uint8Array(3);
  crypto.getRandomValues(bytes);
  return 'VN-' + [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

export async function cloudCreateOrder(order) {
  const id = randomOrderId();
  const createdAt = new Date().toISOString();
  const items = Array.isArray(order.items) ? order.items : [];
  const subtotal = items.reduce((s, it) => s + (Number(it.price) || 0) * (Number(it.qty) || 1), 0);
  const total = Number.isFinite(Number(order.total)) ? Number(order.total) : subtotal;
  const shipping = Math.max(0, total - subtotal);

  await sbFetch('/rest/v1/orders', {
    method: 'POST',
    auth: false,
    extraHeaders: {Prefer: 'return=minimal'},
    body: {
      id,
      name: String(order.name || '').slice(0, 80),
      phone: String(order.phone || '').slice(0, 20),
      email: String(order.email || '').slice(0, 120),
      city: String(order.city || '').slice(0, 80),
      notes: String(order.notes || '').slice(0, 400),
      items,
      subtotal,
      shipping,
      total,
      status: 'new',
      created_at: createdAt,
      updated_at: createdAt
    }
  });
  return {ok: true, orderId: id, total};
}

export async function cloudListOrders() {
  const rows = await sbFetch('/rest/v1/orders?select=*&order=created_at.desc&limit=200', {auth: true});
  const orders = (Array.isArray(rows) ? rows : []).map((o) => ({
    ...o,
    key: o.id,
    createdAt: o.created_at,
    updatedAt: o.updated_at
  }));
  return {orders};
}

export async function cloudUpdateOrderStatus(orderId, status) {
  const updatedAt = new Date().toISOString();
  await sbFetch(`/rest/v1/orders?id=eq.${encodeURIComponent(orderId)}`, {
    method: 'PATCH',
    auth: true,
    extraHeaders: {Prefer: 'return=minimal'},
    body: {status, updated_at: updatedAt}
  });
  return {ok: true};
}

// ── Cloudinary Direct Upload (Photos & Videos from phone or desktop) ─────────

export async function cloudinaryUpload(file) {
  if (!isCloudinaryEnabled()) {
    throw new Error('Cloudinary is not configured yet. Add your Cloud Name and Upload Preset in js/cloud-config.js.');
  }
  const cloudName = String(CLOUD_CONFIG.cloudinaryCloudName).trim();
  const preset = String(CLOUD_CONFIG.cloudinaryUploadPreset).trim();

  const form = new FormData();
  form.append('file', file);
  form.append('upload_preset', preset);
  form.append('folder', 'vn-crochet');

  const res = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/auto/upload`, {
    method: 'POST',
    body: form
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.secure_url) {
    throw new Error((data && data.error && data.error.message) || 'Cloudinary upload failed. Check your Cloud Name and Unsigned Upload Preset.');
  }
  return {
    ok: true,
    url: data.secure_url,
    kind: data.resource_type === 'video' ? 'video' : 'image'
  };
}
