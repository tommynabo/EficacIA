/**
 * /api/payments/webhook
 *
 * Unified Stripe webhook handler — V1 events + V2 Thin Events.
 *
 * V1 events handled:
 *   checkout.session.completed     → AI credits grant / subscription activation
 *   invoice.paid                   → 50% Separate Charges & Transfers split to partner
 *   customer.subscription.deleted  → downgrade user to free
 *
 * V2 Thin Events handled:
 *   v2.core.account[requirements].updated → notify admin when partner needs docs
 *
 * Environment variables required:
 *   STRIPE_SECRET_KEY          — Platform Stripe secret key
 *   STRIPE_WEBHOOK_SECRET      — Signing secret for V1 events (whsec_…)
 *   STRIPE_WEBHOOK_SECRET_V2   — Signing secret for V2 thin events (optional)
 *   PARTNER_STRIPE_ACCOUNT_ID  — Connected account ID of the revenue-share partner
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { getStripe, getSupabase } from '../_lib/stripe.js';

// Raw body is required by Stripe's webhook signature verification.
// Vercel serialless functions forward it automatically; do NOT parse with bodyParser.
export const config = { api: { bodyParser: false } };

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const stripe   = getStripe();
  const supabase = getSupabase();

  const rawBody = await getRawBody(req);
  const sig     = req.headers['stripe-signature'];

  // ── Construct and verify the event ────────────────────────────────────────
  // We check for a V2 thin-event secret first (registered separately in Stripe);
  // if absent, fall back to the standard V1 webhook secret.
  let event;
  const v2Secret = process.env.STRIPE_WEBHOOK_SECRET_V2;
  const v1Secret = process.env.STRIPE_WEBHOOK_SECRET;

  const signingSecret = v2Secret || v1Secret;

  if (signingSecret && sig) {
    try {
      event = stripe.webhooks.constructEvent(rawBody, sig, signingSecret);
    } catch (err) {
      // Try the other secret if both are present (e.g., both endpoints share this function)
      if (v2Secret && v1Secret && signingSecret === v2Secret) {
        try {
          event = stripe.webhooks.constructEvent(rawBody, sig, v1Secret);
        } catch {
          console.error('[WEBHOOK] Signature verification failed for both secrets:', err.message);
          return res.status(400).json({ error: `Webhook signature error: ${err.message}` });
        }
      } else {
        console.error('[WEBHOOK] Signature verification failed:', err.message);
        return res.status(400).json({ error: `Webhook signature error: ${err.message}` });
      }
    }
  } else {
    // Development-only fallback — never run without verification in production.
    try {
      event = JSON.parse(rawBody.toString());
    } catch {
      return res.status(400).json({ error: 'Invalid JSON body' });
    }
  }

  console.log(`[WEBHOOK] ▶ ${event.type} (${event.id})`);

  // ══════════════════════════════════════════════════════════════════════════
  // V2 THIN EVENTS
  // V2 thin event types are prefixed "v2." — the body carries only an event ID
  // and the affected resource ID; fetch the full payload separately.
  // ══════════════════════════════════════════════════════════════════════════

  if (event.type?.startsWith('v2.')) {
    return handleV2ThinEvent(stripe, supabase, event, res);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // V1 EVENTS
  // ══════════════════════════════════════════════════════════════════════════

  // ── checkout.session.completed ────────────────────────────────────────────
  if (event.type === 'checkout.session.completed') {
    const session  = event.data.object;
    const metadata = session.metadata || {};
    const plan     = metadata.plan  || '';
    const userId   = metadata.userId || null;

    // ── AI Credits one-time purchase ────────────────────────────────────
    if (plan === 'ai_credits') {
      const sessionId     = session.id;
      const customerEmail = session.customer_details?.email || session.customer_email || null;

      console.log(`[WEBHOOK] AI-credits purchase: sessionId=${sessionId} userId=${userId}`);

      let userRecord = null;
      if (userId) {
        const { data } = await supabase.from('users')
          .select('id, email, ai_credits, last_credits_session_id').eq('id', userId).single();
        userRecord = data;
      }
      if (!userRecord && customerEmail) {
        const { data } = await supabase.from('users')
          .select('id, email, ai_credits, last_credits_session_id').eq('email', customerEmail).single();
        userRecord = data;
      }

      if (!userRecord) {
        console.error('[WEBHOOK] User not found for AI-credits. email:', customerEmail);
        return res.status(200).json({ received: true, warning: 'User not found' });
      }
      if (userRecord.last_credits_session_id === sessionId) {
        console.log(`[WEBHOOK] session ${sessionId} already processed — idempotency check passed`);
        return res.status(200).json({ received: true, skipped: 'already_processed' });
      }

      const newCredits = (typeof userRecord.ai_credits === 'number' ? userRecord.ai_credits : 0) + 1000;
      const { error: upErr } = await supabase.from('users')
        .update({ ai_credits: newCredits, last_credits_session_id: sessionId })
        .eq('id', userRecord.id);

      if (upErr) {
        console.error('[WEBHOOK] Failed to update ai_credits:', upErr.message);
        return res.status(500).json({ error: 'Failed to update credits' });
      }
      console.log(`[WEBHOOK] ✓ +1000 ai_credits → user ${userRecord.id}. Balance: ${newCredits}`);
      return res.status(200).json({ received: true });
    }

    // ── Subscription plan activation ─────────────────────────────────────
    if (plan && plan !== 'unknown') {
      const customerEmail = session.customer_details?.email || session.customer_email || null;
      let userRecord = null;
      if (userId) {
        const { data } = await supabase.from('users').select('id').eq('id', userId).single();
        userRecord = data;
      }
      if (!userRecord && customerEmail) {
        const { data } = await supabase.from('users').select('id').eq('email', customerEmail).single();
        userRecord = data;
      }
      if (userRecord) {
        const stripeCustomerId = typeof session.customer === 'string' ? session.customer : session.customer?.id || null;
        await supabase.from('users')
          .update({ subscription_status: plan, ...(stripeCustomerId ? { stripe_customer_id: stripeCustomerId } : {}) })
          .eq('id', userRecord.id);
        console.log(`[WEBHOOK] ✓ Plan '${plan}' activated for user ${userRecord.id}`);
      }
      return res.status(200).json({ received: true });
    }
  }

  // ── invoice.paid — Separate Charges & Transfers (50% split) ──────────────
  //
  // `invoice.paid` fires once per billing cycle after a successful subscription
  // payment — including after a trial ends and the first real charge processes.
  // We use this (not `invoice.payment_succeeded`) because it represents the
  // final settled state of the payment.
  //
  // Logic:
  //   1. Extract the gross amount that landed in our Stripe balance.
  //   2. Subtract the Stripe processing fee (~1.5% + 0.25 € for EU cards).
  //      The fee is available on the BalanceTransaction linked to the payment_intent.
  //   3. The Rewardful affiliate commission has already been deducted from the
  //      gross via an Application Fee on the Platform — so `amount_paid` already
  //      reflects the net after affiliate payout.
  //   4. Transfer exactly 50% of the net (step 2 result) to the partner account.
  //   5. Use an idempotency key tied to the invoice ID to prevent double transfers.
  //
  if (event.type === 'invoice.paid') {
    const invoice = event.data.object;

    // Only split on real subscription payments — skip free trials, voids, etc.
    const splitReasons = ['subscription_create', 'subscription_cycle', 'subscription_update'];
    if (!splitReasons.includes(invoice.billing_reason)) {
      console.log(`[WEBHOOK] invoice.paid billing_reason='${invoice.billing_reason}' — no split needed`);
      return res.status(200).json({ received: true });
    }

    await executePartnerSplit(stripe, invoice);
    return res.status(200).json({ received: true });
  }

  // ── customer.subscription.deleted ────────────────────────────────────────
  if (event.type === 'customer.subscription.deleted') {
    const sub       = event.data.object;
    const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;
    if (customerId) {
      await supabase.from('users').update({ subscription_status: 'free' }).eq('stripe_customer_id', customerId);
      console.log(`[WEBHOOK] ✓ Subscription cancelled → free. customer: ${customerId}`);
    }
    return res.status(200).json({ received: true });
  }

  // All other events — acknowledge silently (Stripe retries on non-2xx only)
  return res.status(200).json({ received: true });
}

// ─────────────────────────────────────────────────────────────────────────────
// V2 Thin Event dispatcher
// ─────────────────────────────────────────────────────────────────────────────
async function handleV2ThinEvent(stripe, supabase, thinEvent, res) {
  // A V2 thin event contains only: { id, type, created, data: { id: 'resource_id' } }
  // Fetch the full event payload from the V2 events API before processing.
  let fullEvent;
  try {
    fullEvent = await stripe.v2.core.events.retrieve(thinEvent.id);
  } catch (err) {
    console.error('[WEBHOOK V2] Failed to retrieve full event:', err.message);
    // Still ACK — Stripe should not retry because it's a retrieval failure on our side
    return res.status(200).json({ received: true, warning: 'Could not retrieve full V2 event' });
  }

  console.log(`[WEBHOOK V2] Full event type: ${fullEvent.type}`);

  // ── v2.core.account[requirements].updated ─────────────────────────────────
  //
  // Fires when Stripe updates the requirements for a Connect account — e.g.,
  // when KYB/KYC documents are needed, or when a deadline approaches.
  //
  // Action: persist the requirement summary to Supabase so the Finance
  // admin tab can surface it without hitting the Stripe API on every render.
  //
  if (fullEvent.type === 'v2.core.account[requirements].updated') {
    const accountData    = fullEvent.data?.account || fullEvent.data;
    const accountId      = accountData?.id || thinEvent.data?.id;
    const requirements   = accountData?.requirements || {};
    const currentlyDue   = requirements.currently_due   || [];
    const pastDue        = requirements.past_due        || [];
    const eventuallyDue  = requirements.eventually_due  || [];
    const disabledReason = requirements.disabled_reason || null;

    const requiresAction = currentlyDue.length > 0 || pastDue.length > 0;

    console.log(`[WEBHOOK V2] ⚠ Account ${accountId} requirements updated.`);
    if (requiresAction) {
      console.warn(`[WEBHOOK V2] ACTION REQUIRED — currently_due: [${currentlyDue.join(', ')}]`);
      if (pastDue.length) console.error(`[WEBHOOK V2] PAST DUE: [${pastDue.join(', ')}] — account may be restricted`);
    }

    // Persist to Supabase so the Finance UI can show the status without
    // making a live Stripe API call on every page load.
    try {
      await supabase.from('platform_config').upsert({
        key:   'connect_account_requirements',
        value: JSON.stringify({
          account_id:     accountId,
          currently_due:  currentlyDue,
          past_due:       pastDue,
          eventually_due: eventuallyDue,
          disabled_reason: disabledReason,
          requires_action: requiresAction,
          updated_at:     new Date().toISOString(),
        }),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'key' });
    } catch (dbErr) {
      // Non-fatal — the Stripe webhook must still receive 200
      console.warn('[WEBHOOK V2] Could not persist requirements to DB:', dbErr.message);
    }

    return res.status(200).json({ received: true, requires_action: requiresAction });
  }

  // Unknown V2 event — ACK silently
  return res.status(200).json({ received: true });
}

// ─────────────────────────────────────────────────────────────────────────────
// executePartnerSplit  —  Payment Cascade (50/50 Revenue Split)
//
// Separate Charges & Transfers pattern:
//   - EficacIA is the merchant of record. Stripe charges the customer on the
//     platform account; we then Transfer the partner share to their connected
//     account from the platform balance.
//
// Cascade order per payment:
//   1. Gross         = invoice.amount_paid  (total charged to customer)
//   2. − Stripe Fee  = exact fee from BalanceTransaction  (fallback: estimate)
//   3. − Op. Costs   = fixed infra costs  (PRO/GROWTH: 17 €, SCALE: 30 €)
//   4. − Affiliate   = Rewardful commission IF subscription/customer metadata
//                      contains a rewardful key  (per-plan fixed amounts)
//                      PRO: 7.50 €  |  GROWTH: 18.60 €  |  SCALE: 35.70 €
//                      SCALE OFERTA: 20.70 €  |  no affiliate: 0 €
//   5. Net Profit    = result of steps 1-4  (floored at 0 — never negative)
//   6. Partner Share = floor(Net Profit / 2)  →  transferred to partner
// ─────────────────────────────────────────────────────────────────────────────

// Per-plan operational costs (cents)
const PLAN_OPERATIONAL_COSTS = {
  pro:          1700, // 17.00 €
  growth:       1700, // 17.00 €
  scale:        3000, // 30.00 €
  scale_oferta: 3000, // 30.00 €  (same infra, different price point)
};

// Per-plan Rewardful affiliate commission (cents)  — only applied when affiliate
const PLAN_AFFILIATE_CUTS = {
  pro:          750,  //  7.50 €
  growth:       1860, // 18.60 €
  scale:        3570, // 35.70 €
  scale_oferta: 2070, // 20.70 €
};

/** Normalise a raw plan string to one of the keys above. */
function normalisePlan(raw = '') {
  const s = raw.toLowerCase().replace(/[\s-]/g, '_');
  if (s.includes('scale') && (s.includes('oferta') || s.includes('offer'))) return 'scale_oferta';
  if (s.includes('scale'))  return 'scale';
  if (s.includes('growth')) return 'growth';
  return 'pro'; // default / PRO
}

async function executePartnerSplit(stripe, invoice) {
  // ── Guard: partner account must be configured ─────────────────────────────
  const partnerAccountId =
    process.env.PARTNER_STRIPE_ACCOUNT_ID ||
    process.env.STRIPE_CONNECT_ACCOUNT_ID; // backward-compat alias

  if (!partnerAccountId || partnerAccountId.startsWith('acct_xxxxx')) {
    console.log('[WEBHOOK] PARTNER_STRIPE_ACCOUNT_ID not set — skipping partner split');
    return;
  }

  // ── Step 1: Gross ─────────────────────────────────────────────────────────
  const gross = invoice.amount_paid; // cents
  if (!gross || gross <= 0) {
    console.log('[WEBHOOK] invoice.amount_paid is zero — nothing to split');
    return;
  }

  const subscriptionId =
    typeof invoice.subscription === 'string' ? invoice.subscription : (invoice.subscription?.id || null);
  const customerId =
    typeof invoice.customer === 'string' ? invoice.customer : (invoice.customer?.id || null);

  // ── Fetch subscription and customer metadata (parallel) ───────────────────
  let subMeta = {};
  let custMeta = {};

  await Promise.allSettled([
    subscriptionId
      ? stripe.subscriptions.retrieve(subscriptionId)
          .then((s) => { subMeta = s.metadata || {}; })
          .catch((e) => console.warn(`[WEBHOOK] Could not retrieve subscription ${subscriptionId}: ${e.message}`))
      : Promise.resolve(),
    customerId
      ? stripe.customers.retrieve(customerId)
          .then((c) => { custMeta = (c.deleted ? {} : c.metadata) || {}; })
          .catch((e) => console.warn(`[WEBHOOK] Could not retrieve customer ${customerId}: ${e.message}`))
      : Promise.resolve(),
  ]);

  // ── Determine plan ────────────────────────────────────────────────────────
  const planRaw  = subMeta.plan || custMeta.plan || '';
  const planKey  = normalisePlan(planRaw);

  // ── Step 2: Stripe Fee (exact from BalanceTransaction, else estimated) ────
  let stripeFee = 0;
  try {
    const chargeId = invoice.charge;
    if (chargeId) {
      const charge = await stripe.charges.retrieve(chargeId, { expand: ['balance_transaction'] });
      const bt = charge.balance_transaction;
      if (bt && typeof bt === 'object') {
        stripeFee = bt.fee || 0;
        console.log(`[WEBHOOK] Stripe fee (exact): ${stripeFee} ¢`);
      }
    }
  } catch (feeErr) {
    // Conservative EU card rate fallback: 2 % + 0.25 €
    stripeFee = Math.ceil(gross * 0.02) + 25;
    console.warn(`[WEBHOOK] Could not retrieve Stripe fee — estimate: ${stripeFee} ¢. ${feeErr.message}`);
  }

  // ── Step 3: Operational Costs ─────────────────────────────────────────────
  const operationalCosts = PLAN_OPERATIONAL_COSTS[planKey] ?? 1700;

  // ── Step 4: Affiliate Commission (Rewardful) ──────────────────────────────
  // Rewardful injects a `referral` key (UUID) into the Stripe Customer metadata.
  // Confirmed by inspecting live customer ceo@thegrowthcrafter.com on 2026-03-22.
  // Also check common legacy/variant keys as a safety net.
  const isAffiliate = !!(
    custMeta.referral             ||   // ← confirmed Rewardful key
    custMeta.rewardful            ||
    custMeta.rewardful_referral   ||
    subMeta.referral              ||
    subMeta.rewardful             ||
    subMeta.rewardful_referral
  );
  const affiliateCut = isAffiliate ? (PLAN_AFFILIATE_CUTS[planKey] ?? 0) : 0;

  // ── Step 5: Net Profit (never negative) ───────────────────────────────────
  const afterFee    = Math.max(0, gross - stripeFee);
  const afterCosts  = Math.max(0, afterFee - operationalCosts);
  const netProfit   = Math.max(0, afterCosts - affiliateCut);

  // ── Step 6: 50/50 Partner Share ───────────────────────────────────────────
  const partnerShare = Math.floor(netProfit / 2);

  // Human-readable breakdown for Vercel logs
  const fmt = (c) => `${(c / 100).toFixed(2)}€`;
  console.log(
    `[WEBHOOK] 💰 Pago ${fmt(gross)} → Fee ${fmt(stripeFee)} → Costes ${fmt(operationalCosts)} → Afiliado ${fmt(affiliateCut)} → Beneficio ${fmt(netProfit)} → Split Socio ${fmt(partnerShare)}` +
    ` | plan=${planKey} afiliado=${isAffiliate} invoice=${invoice.id}`
  );

  if (partnerShare < 1) {
    console.log(`[WEBHOOK] partnerShare < 1 cent after all deductions — skipping transfer`);
    return;
  }

  // ── Execute the Transfer ──────────────────────────────────────────────────
  // Idempotency key on invoice.id: even if Stripe retries the webhook we only
  // ever issue one transfer per invoice.
  try {
    const transfer = await stripe.transfers.create(
      {
        amount:      partnerShare,
        currency:    invoice.currency || 'eur',
        destination: partnerAccountId,
        description: `EficacIA 50% revenue split — invoice ${invoice.id}`,
        metadata: {
          invoice_id:        invoice.id,
          plan:              planKey,
          is_affiliate:      String(isAffiliate),
          gross_amount:      String(gross),
          stripe_fee:        String(stripeFee),
          operational_costs: String(operationalCosts),
          affiliate_cut:     String(affiliateCut),
          net_profit:        String(netProfit),
          partner_share:     String(partnerShare),
          split_percent:     '50',
          customer_id:       customerId || '',
          subscription_id:   subscriptionId || '',
        },
      },
      { idempotencyKey: `partner_split_${invoice.id}` },
    );

    console.log(
      `[WEBHOOK] ✓ Transfer completo: ${fmt(partnerShare)} → ${partnerAccountId} (transfer ${transfer.id})`
    );
  } catch (err) {
    // Log but still return 200 to Stripe — the customer payment is already
    // settled. Investigate and replay manually via Stripe Dashboard if needed.
    console.error(`[WEBHOOK] ✗ Transfer failed for invoice ${invoice.id}:`, err.message);
  }
}
