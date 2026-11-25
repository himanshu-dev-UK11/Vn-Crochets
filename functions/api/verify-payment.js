// POST /api/verify-payment
// Cryptographically verifies Razorpay HMAC-SHA256 payment signature on the server,
// marks the Supabase order as paid, and returns the verified WhatsApp receipt link.

import {
  json,
  cleanText,
  hmacSha256Hex,
  timingSafeEqualHex,
  fetchStoreState,
  supabaseAdminRequest,
  buildVerifiedWhatsAppReceipt
} from '../_lib/razorpay.js';

export async function onRequestPost({ request, env }) {
  const secret = String(env.RAZORPAY_KEY_SECRET || '').trim();
  if (!secret) {
    return json({ ok: false, error: 'Razorpay secret is not configured on the server.' }, 500);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON request body.' }, 400);
  }

  const rzpOrderId = cleanText(body.razorpay_order_id, 80);
  const rzpPaymentId = cleanText(body.razorpay_payment_id, 80);
  const rzpSignature = cleanText(body.razorpay_signature, 128);

  if (!rzpOrderId || !rzpPaymentId || !rzpSignature) {
    return json({ ok: false, error: 'Missing required payment verification fields.' }, 400);
  }

  // If Supabase service key is configured, fetch the authoritative order record by razorpay_order_id
  let dbOrder = null;
  const lookup = await supabaseAdminRequest(
    env,
    `/rest/v1/orders?razorpay_order_id=eq.${encodeURIComponent(rzpOrderId)}&select=*&limit=1`
  );
  if (lookup.ok && Array.isArray(lookup.data) && lookup.data[0]) {
    dbOrder = lookup.data[0];
  }

  const authoritativeOrderId = dbOrder?.razorpay_order_id || rzpOrderId;
  const expectedSig = await hmacSha256Hex(secret, `${authoritativeOrderId}|${rzpPaymentId}`);

  if (!timingSafeEqualHex(expectedSig, rzpSignature)) {
    return json({ ok: false, verified: false, error: 'Payment signature mismatch. Order not marked as paid.' }, 400);
  }

  const now = new Date().toISOString();
  if (dbOrder) {
    await supabaseAdminRequest(
      env,
      `/rest/v1/orders?razorpay_order_id=eq.${encodeURIComponent(authoritativeOrderId)}`,
      {
        method: 'PATCH',
        extraHeaders: { Prefer: 'return=minimal' },
        body: {
          payment_status: 'paid',
          status: 'confirmed',
          razorpay_payment_id: rzpPaymentId,
          paid_at: now,
          updated_at: now
        }
      }
    );
  }

  // Load official store WhatsApp number & brand name from server
  let settings = {};
  try {
    const store = await fetchStoreState(env);
    settings = store.settings || {};
  } catch { /* fallback defaults inside buildVerifiedWhatsAppReceipt */ }

  const orderData = dbOrder || {
    id: cleanText(body.order_ref, 40) || rzpOrderId,
    name: cleanText(body.name, 80),
    email: cleanText(body.email, 120),
    phone: cleanText(body.phone, 20),
    city: cleanText(body.city, 80),
    notes: cleanText(body.notes, 400),
    items: Array.isArray(body.items) ? body.items : [],
    subtotal: Number(body.subtotal) || 0,
    shipping: Number(body.shipping) || 0,
    total: Number(body.total) || 0
  };

  const receipt = buildVerifiedWhatsAppReceipt({
    brandName: settings.brandName || 'VN crochet',
    whatsapp: settings.whatsapp || '918923646175',
    currency: settings.currency || '₹',
    orderRef: orderData.id,
    paymentId: rzpPaymentId,
    name: orderData.name,
    email: orderData.email,
    phone: orderData.phone,
    city: orderData.city,
    notes: orderData.notes,
    items: orderData.items,
    subtotal: orderData.subtotal,
    shipping: orderData.shipping,
    total: orderData.total
  });

  return json({
    ok: true,
    verified: true,
    order_ref: orderData.id,
    razorpay_order_id: authoritativeOrderId,
    razorpay_payment_id: rzpPaymentId,
    total: orderData.total,
    whatsapp_url: receipt.url,
    receipt_message: receipt.message
  });
}
