// Catalogue + shop settings.
// In Cloud Mode (js/cloud-config.js filled in), loads live data directly from
// Supabase so edits from your phone go live immediately.
// Otherwise loads from /api/catalog (local server.js), and always falls back
// to data/catalog.json (+ data/settings.json) so the shop never shows blank.

import {isCloudEnabled, cloudFetchStore} from './cloud.js';

export const PRODUCTS = [];

export const RIBBON_COLORS = ['#fffdf7', '#f7a1b8', '#a9b8f0', '#ffc94d'];
export const RIBBON_NAMES = ['Cream', 'Pink', 'Periwinkle', 'Gold'];

export const CAT_ICONS = {};
export const CATEGORIES = [];

export const SETTINGS = {
  brandName: '',
  tagline: '',
  currency: '',
  heroTitle: '',
  heroText: '',
  heroImage: '',
  heroCaption: '',
  ticker: [],
  announcement: '',
  freeShippingFrom: 1500,
  shippingFee: 199,
  whatsapp: '918923646175',
  instagram: '',
  accent: ''
};

const CACHE_KEY = 'vnc.settings';

export let settingsLoaded = false;

function normalizeMediaPath(value, onDisk) {
  if (typeof value !== 'string' || !value) return value;
  if (onDisk && value.startsWith('/')) {
    return new URL(`..${value}`, import.meta.url).href;
  }
  return value;
}

function applySettings(src) {
  if (!src || typeof src !== 'object') return;
  settingsLoaded = true;
  for (const key of Object.keys(SETTINGS)) {
    if (src[key] === undefined || src[key] === null) continue;
    if (typeof SETTINGS[key] === 'number') {
      const n = Number(src[key]);
      if (Number.isFinite(n) && n >= 0) SETTINGS[key] = n;
    } else if (Array.isArray(SETTINGS[key])) {
      if (Array.isArray(src[key])) SETTINGS[key] = src[key].map(String);
    } else {
      SETTINGS[key] = String(src[key]);
    }
  }

  if (Array.isArray(src.ribbonColors) && src.ribbonColors.length) {
    RIBBON_COLORS.length = 0;
    RIBBON_COLORS.push(...src.ribbonColors.map(String));
  }
  if (Array.isArray(src.ribbonNames) && src.ribbonNames.length) {
    RIBBON_NAMES.length = 0;
    RIBBON_NAMES.push(...src.ribbonNames.map(String));
  }

  if (Array.isArray(src.categories) && src.categories.length) {
    CATEGORIES.length = 0;
    for (const c of src.categories) {
      const name = String((c && c.name) || c || '').trim();
      if (!name) continue;
      const icon = String((c && c.icon) || '•').trim() || '•';
      CATEGORIES.push({name, icon});
      CAT_ICONS[name] = icon;
    }
  }
}

try { applySettings(JSON.parse(localStorage.getItem(CACHE_KEY))); } catch { /* ignore */ }

async function getJson(url, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {cache: 'no-cache', signal: ctrl.signal});
    if (!res.ok) throw new Error(`${url} → ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function usable(p) {
  return p && p.active !== false && p.id !== undefined && p.n && Number.isFinite(Number(p.p));
}

function unpack(data) {
  if (Array.isArray(data)) return {products: data, settings: null};
  if (data && Array.isArray(data.products)) return {products: data.products, settings: data.settings || null};
  return null;
}

export async function initCatalog() {
  const onDisk = location.protocol === 'file:';
  let payload = null;

  if (isCloudEnabled()) {
    try {
      const live = await cloudFetchStore();
      if (live && live.products && live.products.length) {
        payload = live;
      }
    } catch { /* fall back below */ }
  }

  if (!payload && !onDisk && !isCloudEnabled()) {
    try {
      payload = unpack(await getJson(new URL('../api/catalog', import.meta.url).href, 10000));
    } catch { /* fall back below */ }
  }

  if (!payload) {
    payload = unpack(await getJson(new URL('../data/catalog.json', import.meta.url).href, 10000));
    if (payload && !payload.settings) {
      try {
        payload.settings = await getJson(new URL('../data/settings.json', import.meta.url).href, 5000);
      } catch { /* optional static settings file */ }
    }
  }
  if (!payload) throw new Error('Catalogue is not a list');

  if (payload.settings) {
    applySettings(payload.settings);
    if (SETTINGS.heroImage) SETTINGS.heroImage = normalizeMediaPath(SETTINGS.heroImage, onDisk);
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(payload.settings)); } catch { /* ignore */ }
  }

  PRODUCTS.length = 0;
  payload.products.filter(usable).forEach((p) => {
    const item = {...p};
    if (item.image) item.image = normalizeMediaPath(item.image, onDisk);
    if (item.video) item.video = normalizeMediaPath(item.video, onDisk);
    PRODUCTS.push(item);
  });
}

export const waLink = (text) => {
  const phone = String(SETTINGS.whatsapp || '').replace(/\D/g, '');
  return `https://wa.me/${phone}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
};

export function ribbonsFor(product) {
  if (!Array.isArray(product?.ribbons)) return RIBBON_NAMES.map((_, i) => i);
  return product.ribbons.map(Number).filter((i) => Number.isInteger(i) && i >= 0 && i < RIBBON_NAMES.length);
}
