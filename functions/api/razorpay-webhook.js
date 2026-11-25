// POST /api/razorpay-webhook
// Server-to-server backup webhook so orders are marked paid in Supabase even if
// the customer closes their browser immediately after paying UPI.

import {
  json,
  hmacSha256Hex,
  timingSafeEqualHex,
  supabaseAdminRequest
} from '../_lib/razorpay.js';

export async function onRequestPost({ request, env }) {
  const webhookSecret = String(env.RAZORPAY_WEBHOOK_SECRET || '').trim();
  if (!webhookSecret) {
    return json({ ok: false, error: 'Webhook secret not configured.' }, 500);
  }

  const signature = request.headers.get('X-Razorpay-Signature') || '';
  if (!signature) {
    return json({ ok: false, error: 'Missing X-Razorpay-Signature header.' }, 400);
  }

  // Must verify HMAC against the raw request body bytes (never re-serialized JSON)
  const rawBody = await request.text();
  const expected = await hmacSha256Hex(webhookSecret, rawBody);
  if (!timingSafeEqualHex(expected, signature)) {
    return json({ ok: false, error: 'Invalid webhook signature.' }, 400);
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return json({ ok: false, error: 'Malformed webhook payload.' }, 400);
  }

  const type = event?.event;
  if (type === 'payment.captured' || type === 'order.paid') {
    const payment = event?.payload?.payment?.entity || {};
    const order = event?.payload?.order?.entity || {};
    const rzpOrderId = payment.order_id || order.id;
    const rzpPaymentId = payment.id || '';

    if (rzpOrderId) {
      const now = new Date().toISOString();
      await supabaseAdminRequest(
        env,
        `/rest/v1/orders?razorpay_order_id=eq.${encodeURIComponent(rzpOrderId)}`,
        {
          method: 'PATCH',
          extraHeaders: { Prefer: 'return=minimal' },
          body: {
            payment_status: 'paid',
            status: 'confirmed',
            ...(rzpPaymentId ? { razorpay_payment_id: rzpPaymentId } : {}),
            paid_at: now,
            updated_at: now
          }
        }
      );
    }
  } else if (type === 'payment.failed') {
    const payment = event?.payload?.payment?.entity || {};
    if (payment.order_id) {
      await supabaseAdminRequest(
        env,
        `/rest/v1/orders?razorpay_order_id=eq.${encodeURIComponent(payment.order_id)}&payment_status=neq.paid`,
        {
          method: 'PATCH',
          extraHeaders: { Prefer: 'return=minimal' },
          body: {
            payment_status: 'failed',
            updated_at: new Date().toISOString()
          }
        }
      );
    }
  }

  return json({ ok: true });
}
