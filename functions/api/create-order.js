// POST /api/create-order
// Authoritatively computes totals from Supabase store_state on the server,
// creates a Razorpay Order, and stores a pending order in Supabase (if service key is set).

import {
  json,
  cleanText,
  randomOrderRef,
  razorpayAuthHeader,
  fetchStoreState,
  supabaseAdminRequest
} from '../_lib/razorpay.js';

export async function onRequestPost({ request, env }) {
  const authHeader = razorpayAuthHeader(env);
  if (!authHeader) {
    return json({ ok: false, error: 'Razorpay credentials are not configured on the server.' }, 500);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON request body.' }, 400);
  }

  const name = cleanText(body.name, 80);
  const email = cleanText(body.email, 120);
  const phone = cleanText(body.phone, 20);
  const city = cleanText(body.city, 80);
  const notes = cleanText(body.notes, 400);
  const rawItems = Array.isArray(body.items) ? body.items : [];

  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || (phone.match(/\d/g) || []).length < 10 || !city) {
    return json({ ok: false, error: 'Please provide valid name, email, phone, and delivery city.' }, 400);
  }
  if (!rawItems.length || rawItems.length > 50) {
    return json({ ok: false, error: 'Your cart is empty.' }, 400);
  }

  // Always compute prices from the authoritative store catalog on the server
  let store;
  try {
    store = await fetchStoreState(env);
  } catch (err) {
    return json({ ok: false, error: err.message || 'Could not verify product prices.' }, 500);
  }

  const verifiedItems = [];
  let subtotal = 0;

  for (const line of rawItems) {
    const qty = Math.min(99, Math.max(0, Math.round(Number(line?.qty || line?.q || 0))));
    if (qty < 1) continue;
    const product = store.products.find((p) => p && p.active !== false && String(p.id) === String(line.id));
    if (!product) {
      return json({ ok: false, error: 'One or more items in your cart are no longer available.' }, 400);
    }
    const price = Number(product.p);
    if (!Number.isFinite(price) || price <= 0) {
      return json({ ok: false, error: `Invalid price for ${product.n}.` }, 400);
    }
    const ribbon = cleanText(line.ribbon || line.c || '', 24);
    verifiedItems.push({
      id: product.id,
      name: String(product.n),
      ribbon,
      qty,
      price
    });
    subtotal += price * qty;
  }

  if (!verifiedItems.length) {
    return json({ ok: false, error: 'No valid items in cart.' }, 400);
  }

  const freeShippingFrom = Number.isFinite(Number(store.settings.freeShippingFrom))
    ? Number(store.settings.freeShippingFrom)
    : 1500;
  const shippingFee = Number.isFinite(Number(store.settings.shippingFee))
    ? Number(store.settings.shippingFee)
    : 199;
  const shipping = subtotal < freeShippingFrom ? shippingFee : 0;
  const total = subtotal + shipping;
  const amountPaise = Math.round(total * 100);

  if (amountPaise < 100) {
    return json({ ok: false, error: 'Order amount must be at least ₹1 (100 paise).' }, 400);
  }

  const orderRef = randomOrderRef();

  // Create Razorpay Order
  let rzpRes;
  let rzpData = {};
  try {
    rzpRes = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        amount: amountPaise,
        currency: 'INR',
        receipt: orderRef,
        notes: {
          order_ref: orderRef,
          customer_name: name,
          customer_phone: phone,
          customer_email: email,
          city
        }
      })
    });
    rzpData = await rzpRes.json().catch(() => ({}));
  } catch {
    return json({ ok: false, error: 'Could not reach Razorpay. Please try again.' }, 502);
  }

  if (rzpRes.status === 401) {
    return json({ ok: false, error: 'Razorpay authentication failed. Check API keys.' }, 401);
  }
  if (!rzpRes.ok || !rzpData.id) {
    return json({
      ok: false,
      error: rzpData?.error?.description || 'Failed to create Razorpay order.'
    }, 500);
  }

  // Save pending order in Supabase (when SUPABASE_SERVICE_ROLE_KEY is configured)
  const now = new Date().toISOString();
  await supabaseAdminRequest(env, '/rest/v1/orders', {
    method: 'POST',
    extraHeaders: { Prefer: 'return=minimal' },
    body: {
      id: orderRef,
      name,
      phone,
      email,
      city,
      notes,
      items: verifiedItems,
      subtotal,
      shipping,
      total,
      status: 'new',
      payment_status: 'pending',
      razorpay_order_id: rzpData.id,
      created_at: now,
      updated_at: now
    }
  });

  return json({
    ok: true,
    key_id: String(env.RAZORPAY_KEY_ID).trim(),
    order_id: rzpData.id,
    amount: rzpData.amount,
    currency: rzpData.currency || 'INR',
    order_ref: orderRef,
    subtotal,
    shipping,
    total,
    items: verifiedItems,
    brand_name: store.settings.brandName || 'VN crochet',
    accent: store.settings.accent || '#a93b5b'
  });
}
