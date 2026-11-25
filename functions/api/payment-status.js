// GET /api/payment-status
// Returns non-sensitive gateway configuration status for the Admin Payments page.
import { json } from '../_lib/razorpay.js';

export async function onRequestGet({ env }) {
  const keyId = String(env.RAZORPAY_KEY_ID || '').trim();
  const keySecret = String(env.RAZORPAY_KEY_SECRET || '').trim();
  const webhookSecret = String(env.RAZORPAY_WEBHOOK_SECRET || '').trim();
  const serviceKey = String(env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

  let mode = 'not_configured';
  if (keyId.startsWith('rzp_live_')) mode = 'live';
  else if (keyId.startsWith('rzp_test_')) mode = 'test';

  return json({
    ok: true,
    mode,
    razorpayConfigured: Boolean(keyId && keySecret),
    webhookConfigured: Boolean(webhookSecret),
    supabaseAdminConfigured: Boolean(serviceKey)
  });
}
