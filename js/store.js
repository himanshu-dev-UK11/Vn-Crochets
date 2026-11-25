const KEY = 'vnc.v1';
const PROFILE_KEY = 'vnc.profile.v1';
const LAST_ORDER_KEY = 'vnc.lastOrder.v1';
const defaults = {cart: [], cat: 'All', sort: 'feat', query: ''};
const profileDefaults = {
  name: '',
  email: '',
  phone: '',
  city: '',
  notes: '',
  customBrief: '',
  customSize: ''
};

function sanitizeSnap(s) {
  if (!s || typeof s !== 'object') return null;
  const p = Number(s.p);
  if (!s.n || !Number.isFinite(p)) return null;
  return {
    n: String(s.n).slice(0, 120),
    p,
    s: typeof s.s === 'string' ? s.s.slice(0, 80) : '',
    image: typeof s.image === 'string' ? s.image.slice(0, 400) : '',
    bg: typeof s.bg === 'string' ? s.bg.slice(0, 20) : '',
    e: typeof s.e === 'string' ? s.e.slice(0, 8) : ''
  };
}

export function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (!saved || typeof saved !== 'object') return {...defaults};
    const state = {...defaults, ...saved};
    // Never trust persisted data: keep only well-formed cart lines.
    state.cart = Array.isArray(state.cart)
      ? state.cart
          .filter((l) => l && l.id !== undefined && Number(l.q) > 0)
          .map((l) => {
            const line = {
              id: l.id,
              q: Math.min(99, Math.max(1, Math.round(Number(l.q)))),
              c: typeof l.c === 'string' ? l.c.slice(0, 20) : ''
            };
            const snap = sanitizeSnap(l.snap);
            if (snap) line.snap = snap;
            return line;
          })
      : [];
    return state;
  } catch {
    return {...defaults};
  }
}

export function saveState(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch { /* storage full or blocked — the session still works */ }
}

/** Drop cart lines whose product no longer exists in the catalogue, and refresh snapshots. */
export function pruneCart(state, products) {
  if (!products.length) return state.cart;
  let changed = false;
  const next = [];
  for (const line of state.cart) {
    const p = products.find((x) => String(x.id) === String(line.id));
    if (!p) {
      changed = true;
      continue;
    }
    const snap = sanitizeSnap(p);
    if (snap && (!line.snap || line.snap.n !== snap.n || line.snap.p !== snap.p || line.snap.image !== snap.image)) {
      line.snap = snap;
      changed = true;
    }
    next.push(line);
  }
  state.cart = next;
  if (changed) saveState(state);
  return state.cart;
}

export function itemCount(state) {
  return state.cart.reduce((n, l) => n + l.q, 0);
}

export function subtotal(state, products) {
  return state.cart.reduce((sum, line) => {
    const product = products.find((p) => String(p.id) === String(line.id)) || line.snap;
    return product ? sum + Number(product.p || 0) * line.q : sum;
  }, 0);
}

/* ── Device-local customer details (never sent anywhere until submit) ─────── */

export function loadProfile() {
  try {
    const saved = JSON.parse(localStorage.getItem(PROFILE_KEY));
    if (!saved || typeof saved !== 'object') return {...profileDefaults};
    const out = {...profileDefaults};
    for (const k of Object.keys(profileDefaults)) {
      if (typeof saved[k] === 'string') out[k] = saved[k].slice(0, k === 'customBrief' ? 600 : k === 'notes' ? 400 : 120);
    }
    return out;
  } catch {
    return {...profileDefaults};
  }
}

export function saveProfile(patch) {
  const next = {...loadProfile(), ...(patch || {})};
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(next));
  } catch { /* storage full or blocked */ }
  return next;
}

export function clearProfile() {
  try {
    localStorage.removeItem(PROFILE_KEY);
  } catch { /* ignore */ }
}

/* ── Recent order confirmation (survives accidental refresh on checkout) ──── */

export function loadLastOrder() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(LAST_ORDER_KEY));
    if (!saved || typeof saved !== 'object' || !saved.url) return null;
    // Expire after 2 hours
    if (saved.ts && Date.now() - Number(saved.ts) > 2 * 60 * 60 * 1000) {
      sessionStorage.removeItem(LAST_ORDER_KEY);
      return null;
    }
    return saved;
  } catch {
    return null;
  }
}

export function saveLastOrder(order) {
  try {
    sessionStorage.setItem(LAST_ORDER_KEY, JSON.stringify({...order, ts: Date.now()}));
  } catch { /* ignore */ }
}

export function clearLastOrder() {
  try {
    sessionStorage.removeItem(LAST_ORDER_KEY);
  } catch { /* ignore */ }
}
