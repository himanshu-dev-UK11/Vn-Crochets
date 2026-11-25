import {PRODUCTS, SETTINGS, initCatalog, waLink} from '../js/data.js';
import {
  loadState, saveState, subtotal, pruneCart,
  loadProfile, saveProfile, clearProfile,
  loadLastOrder, saveLastOrder, clearLastOrder
} from '../js/store.js';

let state = loadState();
const money = (n) => (SETTINGS.currency || '₹') + Math.round(n).toLocaleString('en-IN');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]
));

const list = document.querySelector('#list');
const totals = document.querySelector('#totals');
const status = document.querySelector('#status');
const form = document.querySelector('#form');
const submit = form.querySelector('button[type="submit"]');
const DEFAULT_BTN_LABEL = 'Pay & place order';

function syncBrandAndTheme() {
  if (SETTINGS.brandName) {
    document.querySelectorAll('[data-brand]').forEach((el) => { el.textContent = SETTINGS.brandName; });
    document.title = `Checkout | ${SETTINGS.brandName}`;
  }
  if (SETTINGS.accent && /^#[0-9a-f]{6}$/i.test(SETTINGS.accent)) {
    document.documentElement.style.setProperty('--rose', SETTINGS.accent);
  }
  document.querySelectorAll('a[data-wa-link]').forEach((a) => { a.href = waLink(); });
}

/* ── Summary ───────────────────────────────────────────────── */

function currentTotals() {
  const sum = subtotal(state, PRODUCTS);
  const shipping = state.cart.length && sum < SETTINGS.freeShippingFrom ? SETTINGS.shippingFee : 0;
  return {sum, shipping, grand: sum + shipping};
}

function render() {
  syncBrandAndTheme();
  pruneCart(state, PRODUCTS);
  const {sum, shipping, grand} = currentTotals();

  if (!state.cart.length) {
    list.innerHTML = `
      <div class="empty">
        <span class="empty-mark" aria-hidden="true">🛍</span>
        <h3>There's nothing in your cart</h3>
        <p>Add a piece from the collection and come back here to place the order.</p>
        <div class="empty-actions">
          <a class="btn" href="../index.html#shop">Browse the collection</a>
        </div>
      </div>`;
    totals.innerHTML = '';
    submit.disabled = true;
    return;
  }

  submit.disabled = false;

  list.innerHTML = state.cart.map((line) => {
    const p = PRODUCTS.find((x) => String(x.id) === String(line.id)) || line.snap;
    if (!p) return '';
    const bg = /^#[0-9a-f]{3,8}$/i.test(p.bg || '') ? p.bg : 'var(--linen)';
    const fallbackEmoji = `<span class="card-emoji" aria-hidden="true">${esc(p.e || '🧶')}</span>`;
    const art = p.image
      ? `<img src="${esc(p.image)}" alt="${esc(p.n)}" loading="lazy" onerror="this.closest('.art-box')?.classList.add('tex','is-fallback');this.remove();">${fallbackEmoji}`
      : fallbackEmoji;
    return `
      <article class="co-item">
        <div class="crow-art art-box${p.image ? '' : ' tex is-fallback'}" style="background-color:${bg}">${art}</div>
        <div class="co-copy">
          <h3>${esc(p.n)}</h3>
          <p>${[line.c ? `${esc(line.c)} ribbon` : '', esc(p.s || '')].filter(Boolean).join(' · ')}</p>
        </div>
        <div class="co-meta">
          <b>Qty ${line.q}</b>
          <span>${money(p.p * line.q)}</span>
        </div>
      </article>`;
  }).join('');

  totals.innerHTML = `
    <div class="mat"><span>Subtotal</span><b>${money(sum)}</b></div>
    <div class="mat"><span>Shipping</span><b>${shipping === 0 ? 'Free' : money(shipping)}</b></div>
    <div class="mat total"><span>Total</span><b>${money(grand)}</b></div>`;
}

/* ── Validation ────────────────────────────────────────────── */

const clean = (v, max = 200) => String(v || '').trim().replace(/[<>]/g, '').slice(0, max);
const validEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
const validPhone = (v) => (v.match(/\d/g) || []).length >= 10;

function fieldError(input, message) {
  const field = input.closest('.field');
  let err = field.querySelector('.field-error');
  if (!err) {
    err = document.createElement('span');
    err.className = 'field-error';
    err.id = `err-${input.id}`;
    field.appendChild(err);
  }
  err.textContent = message;
  input.setAttribute('aria-invalid', 'true');
  input.setAttribute('aria-describedby', err.id);
}

function clearErrors() {
  form.querySelectorAll('.field-error').forEach((el) => { el.textContent = ''; });
  form.querySelectorAll('[aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'));
}

function showStatusError(msg) {
  status.textContent = msg;
  status.className = 'co-status err';
  status.scrollIntoView({behavior: 'smooth', block: 'center'});
}

/* ── Saved customer details (stored only on this device) ───── */

function hydrateFormFromDevice() {
  const prof = loadProfile();
  if (prof.name && !form.name.value) form.name.value = prof.name;
  if (prof.email && !form.email.value) form.email.value = prof.email;
  if (prof.phone && !form.phone.value) form.phone.value = prof.phone;
  if (prof.city && !form.city.value) form.city.value = prof.city;
  if (prof.notes && !form.notes.value) form.notes.value = prof.notes;
}

function wireProfilePersistence() {
  ['name', 'email', 'phone', 'city', 'notes'].forEach((field) => {
    const input = form.elements[field];
    if (!input) return;
    input.addEventListener('input', () => {
      saveProfile({[field]: input.value});
    });
  });

  const note = form.querySelector('.form-note');
  if (note && !form.querySelector('#clearSavedInfo')) {
    const helper = document.createElement('p');
    helper.className = 'form-note';
    helper.style.marginTop = '6px';
    helper.innerHTML = 'Your details are saved only on this device for faster checkout. <button type="button" id="clearSavedInfo" class="link-quiet" style="background:none;border:0;padding:0;font:inherit;text-decoration:underline;cursor:pointer">Clear saved details</button>';
    note.after(helper);
    helper.querySelector('#clearSavedInfo').addEventListener('click', () => {
      clearProfile();
      form.reset();
      clearErrors();
    });
  }
}

/* ── Verified order confirmation card ──────────────────────── */

function showOrderConfirmation({name, orderTotal, ref, paymentId, url, message, redirecting = false}) {
  status.innerHTML = `
    <span><strong>Payment successful!</strong> Thank you, <strong>${esc(name)}</strong>. Your payment of <strong>${money(orderTotal)}</strong> is verified.</span>
    <span>${ref ? `Order Ref: <strong>${esc(ref)}</strong>` : ''}${paymentId ? ` · Payment ID: <strong>${esc(paymentId)}</strong>` : ''}</span>
    <span>${redirecting ? 'Opening WhatsApp with your verified receipt… If it doesn’t open automatically, tap below:' : 'Send your verified receipt on WhatsApp below:'}</span>
    <a class="btn" href="${esc(url)}" target="_blank" rel="noopener" style="margin-top:6px">Send Receipt on WhatsApp</a>
    <button class="btn btn-ghost" type="button" id="copyOrderMsg" style="margin-top:4px">Copy receipt message</button>`;
  status.className = 'co-status ok';

  const copyBtn = status.querySelector('#copyOrderMsg');
  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(message);
        copyBtn.textContent = 'Copied!';
        setTimeout(() => { copyBtn.textContent = 'Copy receipt message'; }, 2000);
      } catch {
        const ta = document.createElement('textarea');
        ta.value = message;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
        copyBtn.textContent = 'Copied!';
        setTimeout(() => { copyBtn.textContent = 'Copy receipt message'; }, 2000);
      }
    });
  }
}

/* ── Submit -> Razorpay Checkout -> Server Verify -> WhatsApp ─ */

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearErrors();
  status.textContent = '';
  status.className = 'co-status';

  if (!state.cart.length) {
    showStatusError('Your cart is empty. Add a piece before placing an order.');
    return;
  }

  const name = clean(form.name.value, 80);
  const email = clean(form.email.value, 120);
  const phone = clean(form.phone.value, 20);
  const city = clean(form.city.value, 80);
  const notes = clean(form.notes.value, 400);

  let ok = true;
  if (!name) { fieldError(form.name, 'Please add your name.'); ok = false; }
  if (!validEmail(email)) { fieldError(form.email, 'Enter a valid email address.'); ok = false; }
  if (!validPhone(phone)) { fieldError(form.phone, 'Enter a phone number we can reach you on.'); ok = false; }
  if (!city) { fieldError(form.city, 'Which city should we deliver to?'); ok = false; }
  if (!ok) { form.querySelector('[aria-invalid]')?.focus(); return; }

  if (typeof window.Razorpay !== 'function') {
    showStatusError('Payment gateway script failed to load. Please check your connection and reload the page.');
    return;
  }

  submit.disabled = true;
  submit.textContent = 'Starting secure checkout…';

  const items = state.cart.map((line) => ({
    id: line.id,
    ribbon: line.c || '',
    qty: line.q
  }));

  // Step 1: Create verified order on our server (never trusts client prices)
  let order;
  try {
    const res = await fetch('/api/create-order', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({name, email, phone, city, notes, items})
    });
    order = await res.json().catch(() => ({}));
    if (!res.ok || !order.ok || !order.order_id) {
      throw new Error(order.error || 'Could not start payment. Please try again in a moment.');
    }
  } catch (err) {
    submit.disabled = false;
    submit.textContent = DEFAULT_BTN_LABEL;
    showStatusError(err.message || 'Could not start payment. Please try again.');
    return;
  }

  // Step 2: Open Razorpay Standard Checkout modal
  let paymentHandled = false;
  const rzp = new window.Razorpay({
    key: order.key_id,
    amount: order.amount,
    currency: order.currency || 'INR',
    name: order.brand_name || SETTINGS.brandName || 'VN crochet',
    description: `Order ${order.order_ref}`,
    order_id: order.order_id,
    prefill: {
      name,
      email,
      contact: phone
    },
    notes: {
      order_ref: order.order_ref,
      city
    },
    theme: {
      color: order.accent || SETTINGS.accent || '#a93b5b'
    },
    modal: {
      ondismiss() {
        if (paymentHandled) return;
        submit.disabled = false;
        submit.textContent = DEFAULT_BTN_LABEL;
        showStatusError('Payment was cancelled. Your cart and details are still saved—tap Pay whenever you’re ready.');
      }
    },
    async handler(response) {
      paymentHandled = true;
      submit.disabled = true;
      submit.textContent = 'Verifying payment…';
      status.textContent = 'Verifying your payment securely…';
      status.className = 'co-status';

      // Step 3: Verify HMAC-SHA256 signature on our server
      try {
        const verifyRes = await fetch('/api/verify-payment', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            razorpay_order_id: response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature: response.razorpay_signature,
            order_ref: order.order_ref,
            name,
            email,
            phone,
            city,
            notes,
            items: order.items,
            subtotal: order.subtotal,
            shipping: order.shipping,
            total: order.total
          })
        });
        const verified = await verifyRes.json().catch(() => ({}));
        if (!verifyRes.ok || !verified.verified) {
          throw new Error(verified.error || 'Payment verification failed. Please contact us with your Payment ID.');
        }

        // Keep customer's contact details saved on their device; clear one-time notes.
        saveProfile({name, email, phone, city, notes: ''});
        form.notes.value = '';

        const confirmation = {
          name,
          orderTotal: verified.total ?? order.total,
          ref: verified.order_ref || order.order_ref,
          paymentId: verified.razorpay_payment_id || response.razorpay_payment_id,
          url: verified.whatsapp_url,
          message: verified.receipt_message
        };
        saveLastOrder(confirmation);

        state.cart = [];
        saveState(state);

        showOrderConfirmation({...confirmation, redirecting: true});
        render();
        submit.textContent = DEFAULT_BTN_LABEL;
        status.scrollIntoView({behavior: 'smooth', block: 'center'});

        // Automatically redirect customer to WhatsApp with the verified receipt
        if (verified.whatsapp_url) {
          setTimeout(() => {
            window.location.href = verified.whatsapp_url;
          }, 1200);
        }
      } catch (err) {
        submit.disabled = false;
        submit.textContent = DEFAULT_BTN_LABEL;
        showStatusError(err.message || 'Could not verify payment. Please contact us on WhatsApp.');
      }
    }
  });

  rzp.on('payment.failed', (resp) => {
    paymentHandled = true;
    submit.disabled = false;
    submit.textContent = DEFAULT_BTN_LABEL;
    const reason = resp?.error?.description || 'Payment failed. Please try another method.';
    showStatusError(`Payment failed: ${reason}`);
  });

  rzp.open();
});

/* ── Boot ──────────────────────────────────────────────────── */

syncBrandAndTheme();
hydrateFormFromDevice();
wireProfilePersistence();
render();
if (!state.cart.length) {
  const recent = loadLastOrder();
  if (recent) showOrderConfirmation(recent);
} else {
  clearLastOrder();
}

window.addEventListener('pageshow', (e) => {
  if (e.persisted) {
    state = loadState();
    hydrateFormFromDevice();
    render();
  }
});
window.addEventListener('storage', (e) => {
  if (e.key === 'vnc.v1') {
    state = loadState();
    render();
  }
});

initCatalog().then(render).catch(() => {
  if (state.cart.length && state.cart.every((l) => l.snap)) return;
  list.innerHTML = `
    <div class="empty">
      <span class="empty-mark" aria-hidden="true">⚠</span>
      <h3>We couldn't load your cart</h3>
      <p>Reload the page to try again, or message us and we'll take the order directly.</p>
      <div class="empty-actions">
        <button class="btn" type="button" onclick="location.reload()">Reload the page</button>
        <a class="link-quiet" href="${waLink()}" target="_blank" rel="noopener">Message us</a>
      </div>
    </div>`;
  submit.disabled = true;
});
