/**
 * /api/payments/safe-refund
 *
 * Admin endpoint for processing safe refunds with "Hit & Run" protection.
 *
 * Logic:
 *   1. Receives userId (or stripe_customer_id) + charge ID.
 *   2. Checks how many AI credits the user has consumed.
 *   3. If consumption exceeds 5% of their plan allocation, DENIES the refund.
 *   4. If under 5%, processes the refund via Stripe — which triggers the
 *      charge.refunded webhook to handle revocation + clawback automatically.
 *
 * Request body (JSON):
 *   {
 *     "userId":             "uuid",              // optional if stripe_customer_id is provided
 *     "stripe_customer_id": "cus_xxx",           // optional if userId is provided
 *     "charge_id":          "ch_xxx"             // required — the Stripe charge to refund
 *   }
 *
 * Environment variables required:
 *   STRIPE_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { getStripe, getSupabase } from '../_lib/stripe.js';

// Per-plan credit allocations — must match webhook.js PLAN_CREDITS
const PLAN_CREDITS = {
  pro:                       1000,
  pro_anual:                 12000,
  growth:                    10000,
  growth_anual:              -1,    // unlimited
  estrellas_blancas:         10000,
  estrellas_blancas_anual:   -1,    // unlimited
  scale:                     -1,    // unlimited
  scale_oferta:              -1,
  scale_anual:               -1,
  addon_account:             0,
};

const UNLIMITED_CREDIT_PLANS = new Set([
  'growth_anual', 'estrellas_blancas_anual', 'scale', 'scale_oferta', 'scale_anual',
]);

/** Normalise plan string — mirrors webhook.js normalisePlan */
function normalisePlan(raw = '') {
  const s = raw.toLowerCase().replace(/[\s-]/g, '_');
  if (s.includes('addon') || s.includes('add_on')) return 'addon_account';
  if (s.includes('estrella') && (s.includes('anual') || s.includes('annual'))) return 'estrellas_blancas_anual';
  if (s.includes('estrella')) return 'estrellas_blancas';
  if (s.includes('scale') && (s.includes('oferta') || s.includes('offer'))) return 'scale_oferta';
  if (s.includes('scale') && (s.includes('anual') || s.includes('annual'))) return 'scale_anual';
  if (s.includes('scale') || s.includes('agency'))  return 'scale';
  if (s.includes('growth') && (s.includes('anual') || s.includes('annual'))) return 'growth_anual';
  if (s.includes('growth')) return 'growth';
  if (s.includes('pro') && (s.includes('anual') || s.includes('annual'))) return 'pro_anual';
  if (s.includes('pro') || s.includes('starter')) return 'pro';
  return null;
}

/** Maximum consumption percentage allowed for a refund */
const MAX_CONSUMPTION_PERCENT = 5;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const stripe   = getStripe();
  const supabase = getSupabase();

  // ── Parse & validate request body ─────────────────────────────────────────
  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  const { userId, stripe_customer_id, charge_id } = body || {};

  if (!charge_id) {
    return res.status(400).json({ error: 'charge_id is required' });
  }
  if (!userId && !stripe_customer_id) {
    return res.status(400).json({ error: 'userId or stripe_customer_id is required' });
  }

  // ── Find the user ─────────────────────────────────────────────────────────
  let userRecord = null;

  if (userId) {
    const { data } = await supabase.from('users')
      .select('id, email, subscription_status, ai_credits, ai_credits_unlimited, stripe_customer_id, fraud_flag')
      .eq('id', userId)
      .single();
    userRecord = data;
  }
  if (!userRecord && stripe_customer_id) {
    const { data } = await supabase.from('users')
      .select('id, email, subscription_status, ai_credits, ai_credits_unlimited, stripe_customer_id, fraud_flag')
      .eq('stripe_customer_id', stripe_customer_id)
      .single();
    userRecord = data;
  }

  if (!userRecord) {
    return res.status(404).json({ error: 'User not found' });
  }

  // ── Block already-flagged fraud users ─────────────────────────────────────
  if (userRecord.fraud_flag) {
    return res.status(403).json({ error: 'Usuario marcado como fraude. Reembolso bloqueado.' });
  }

  // ── Check consumption against plan allocation ─────────────────────────────
  const planKey = normalisePlan(userRecord.subscription_status);

  // For unlimited plans, check if the user has made any AI usage via credits consumed
  // If unlimited, we allow refund only if they haven't used the platform meaningfully
  if (planKey && UNLIMITED_CREDIT_PLANS.has(planKey)) {
    // For unlimited plans we can't measure by credits. Deny if they've used the platform.
    // Admin should review unlimited plan refunds manually.
    if (userRecord.ai_credits_unlimited) {
      return res.status(400).json({
        error: 'Reembolso denegado: Plan ilimitado activo. Los reembolsos de planes ilimitados requieren revisión manual del administrador.',
        plan: planKey,
      });
    }
  }

  const allocatedCredits = PLAN_CREDITS[planKey] ?? 0;
  if (allocatedCredits > 0) {
    const currentCredits = typeof userRecord.ai_credits === 'number' ? userRecord.ai_credits : 0;
    const consumed       = allocatedCredits - currentCredits;
    const consumedPct    = (consumed / allocatedCredits) * 100;

    if (consumedPct > MAX_CONSUMPTION_PERCENT) {
      console.log(
        `[SAFE-REFUND] Refund DENIED for user ${userRecord.id}: consumed ${consumed}/${allocatedCredits} credits (${consumedPct.toFixed(1)}% > ${MAX_CONSUMPTION_PERCENT}%)`
      );
      return res.status(400).json({
        error: `Reembolso denegado: El usuario ha consumido más del ${MAX_CONSUMPTION_PERCENT}% de sus recursos de Inteligencia Artificial.`,
        details: {
          plan: planKey,
          allocated_credits: allocatedCredits,
          current_credits: currentCredits,
          consumed_credits: consumed,
          consumed_percent: parseFloat(consumedPct.toFixed(1)),
          threshold_percent: MAX_CONSUMPTION_PERCENT,
        },
      });
    }

    console.log(
      `[SAFE-REFUND] Consumption check passed: ${consumed}/${allocatedCredits} (${consumedPct.toFixed(1)}% <= ${MAX_CONSUMPTION_PERCENT}%)`
    );
  }

  // ── Process the refund via Stripe ─────────────────────────────────────────
  // This triggers the charge.refunded webhook which handles:
  //   - User revocation (plan → free, credits → 0, fraud_flag → true)
  //   - Partner clawback (transfer reversal)
  try {
    const refund = await stripe.refunds.create({
      charge: charge_id,
    });

    console.log(
      `[SAFE-REFUND] ✓ Refund processed: ${refund.id} for charge ${charge_id} (user ${userRecord.id})`
    );

    return res.status(200).json({
      success: true,
      refund_id: refund.id,
      charge_id: charge_id,
      user_id: userRecord.id,
      message: 'Reembolso procesado. El webhook charge.refunded se encargará de revocar el plan y revertir la transferencia al partner.',
    });
  } catch (stripeErr) {
    console.error(`[SAFE-REFUND] ✗ Stripe refund failed for charge ${charge_id}:`, stripeErr.message);
    return res.status(500).json({
      error: 'Failed to process refund via Stripe',
      stripe_error: stripeErr.message,
    });
  }
}
