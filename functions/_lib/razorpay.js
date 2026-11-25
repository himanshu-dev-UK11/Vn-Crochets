// Shared helpers for Cloudflare Pages Functions (Razorpay + Supabase)
// Never hardcode secrets here — all secrets come from Cloudflare Pages env bindings.

export const DEFAULT_SUPABASE_URL = 'https://wzbfezkbbpceyiszgxnh.supabase.co';
export const DEFAULT_SUPABASE_ANON_KEY = 'sb_publishable_1mEYuRFpOJUoDIy5L0_oCg_N2FU7B38';

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}

export function cleanText(v, max = 200) {
  return String(v || '').trim().replace(/[<>]/g, '').slice(0, max);
}

export function randomOrderRef() {
  const bytes = new Uint8Array(3);
  crypto.getRandomValues(bytes);
  return 'VN-' + [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

export async function hmacSha256Hex(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(String(secret)),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(String(message)));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function timingSafeEqualHex(a, b) {
  const s1 = String(a || '').toLowerCase();
  const s2 = String(b || '').toLowerCase();
  if (!s1 || s1.length !== s2.length) return false;
  let diff = 0;
  for (let i = 0; i < s1.length; i++) {
    diff |= s1.charCodeAt(i) ^ s2.charCodeAt(i);
  }
  return diff === 0;
}

export function razorpayAuthHeader(env) {
  const id = String(env.RAZORPAY_KEY_ID || '').trim();
  const secret = String(env.RAZORPAY_KEY_SECRET || '').trim();
  if (!id || !secret) return null;
  return 'Basic ' + btoa(`${id}:${secret}`);
}

export function supabaseBase(env) {
  return String(env.SUPABASE_URL || DEFAULT_SUPABASE_URL).trim().replace(/\/+$/, '');
}

export async function fetchStoreState(env) {
  const base = supabaseBase(env);
  const serviceKey = String(env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const anonKey = String(env.SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY).trim();
  const key = serviceKey || anonKey;
  const headers = { apikey: key };
  if (key.split('.').length === 3) {
    headers.Authorization = `Bearer ${key}`;
  }
  const res = await fetch(`${base}/rest/v1/store_state?id=eq.main&select=products,settings`, {
    headers,
    cf: { cacheTtl: 0 }
  });
  if (!res.ok) throw new Error(`Could not load store catalog (${res.status})`);
  const rows = await res.json();
  if (!Array.isArray(rows) || !rows.length) {
    throw new Error('Store catalog is empty.');
  }
  return {
    products: Array.isArray(rows[0].products) ? rows[0].products : [],
    settings: rows[0].settings && typeof rows[0].settings === 'object' ? rows[0].settings : {}
  };
}

export async function supabaseAdminRequest(env, path, { method = 'GET', body, extraHeaders = {} } = {}) {
  const serviceKey = String(env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!serviceKey) return { skipped: true };
  const base = supabaseBase(env);
  const headers = {
    apikey: serviceKey,
    ...extraHeaders
  };
  if (serviceKey.split('.').length === 3) {
    headers.Authorization = `Bearer ${serviceKey}`;
  }
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await res.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = { message: text.slice(0, 200) }; }
  }
  return { ok: res.ok, status: res.status, data };
}

export function buildVerifiedWhatsAppReceipt({
  brandName,
  whatsapp,
  currency = '₹',
  orderRef,
  paymentId,
  name,
  email,
  phone,
  city,
  notes,
  items,
  subtotal,
  shipping,
  total
}) {
  const fmt = (n) => `${currency}${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;
  const lines = [
    `Order Confirmed — ${brandName || 'VN crochet'}`,
    '',
    'Payment Status: PAID (Verified via Razorpay)',
    `Order Ref: ${orderRef}`,
    `Payment ID: ${paymentId}`,
    '',
    `Name: ${name}`,
    `Email: ${email}`,
    `Phone: ${phone}`,
    `City: ${city}`,
    '',
    'Items:'
  ];
  (items || []).forEach((it) => {
    lines.push(`- ${it.name}${it.ribbon ? ` (${it.ribbon} ribbon)` : ''} x${it.qty} — ${fmt(Number(it.price) * Number(it.qty))}`);
  });
  lines.push(
    '',
    `Subtotal: ${fmt(subtotal)}`,
    `Shipping: ${Number(shipping) === 0 ? 'Free' : fmt(shipping)}`,
    `Total Paid: ${fmt(total)}`
  );
  if (notes) lines.push('', `Notes: ${notes}`);
  const message = lines.join('\n');
  const digits = String(whatsapp || '918923646175').replace(/\D/g, '');
  const url = `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
  return { message, url };
}
