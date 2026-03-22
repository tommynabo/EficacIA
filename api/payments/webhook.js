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
          .update({ subscription_status: plan, ...(stripeCustomerId ? { stripe_id: stripeCustomerId } : {}) })
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
      await supabase.from('users').update({ subscription_status: 'free' }).eq('stripe_id', customerId);
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
// executePartnerSplit
//
// Separate Charges & Transfers pattern:
//   - The platform (EficacIA) is the merchant of record — Stripe charges the
//     customer on the platform account.
//   - After the charge settles, we create a Transfer to the partner's connected
//     account from the platform account's balance.
//   - This is different from "destination charges" where the connected account
//     is the MOR. With Separate Charges we retain full control and compliance.
//
// Amount calculation:
//   1. Start with invoice.amount_paid (gross charged to customer, in cents).
//   2. Retrieve the BalanceTransaction for the charge to get the exact Stripe fee.
//   3. Net = amount_paid − stripe_fee
//   4. Split = floor(net × 0.5)  [50% to partner, 50% retained by platform]
//
// If fee retrieval fails (e.g., no payment_intent on invoice), we fall back to
// estimating the fee at 2% + 25 cents (conservative European card rate).
// ─────────────────────────────────────────────────────────────────────────────
async function executePartnerSplit(stripe, invoice) {
  // ── 1. Resolve the partner's connected account ID ────────────────────────
  const partnerAccountId =
    process.env.PARTNER_STRIPE_ACCOUNT_ID ||
    process.env.STRIPE_CONNECT_ACCOUNT_ID;   // backward-compat alias

  if (!partnerAccountId || partnerAccountId.startsWith('acct_xxxxx')) {
    console.log('[WEBHOOK] PARTNER_STRIPE_ACCOUNT_ID not set — skipping partner split');
    return;
  }

  const grossAmount = invoice.amount_paid; // cents (e.g. 9900 = 99.00 €)
  if (!grossAmount || grossAmount <= 0) {
    console.log('[WEBHOOK] invoice.amount_paid is zero — nothing to split');
    return;
  }

  // ── 2. Retrieve the exact Stripe processing fee from the BalanceTransaction ─
  let stripeFee = 0;
  try {
    // Follow the chain: invoice → charge → balance_transaction
    const chargeId = invoice.charge;
    if (chargeId) {
      const charge = await stripe.charges.retrieve(chargeId, {
        expand: ['balance_transaction'],
      });
      const bt = charge.balance_transaction;
      if (bt && typeof bt === 'object') {
        // bt.fee is the total Stripe fee in cents (processing + any other fees)
        stripeFee = bt.fee || 0;
        console.log(`[WEBHOOK] Stripe fee from balance_transaction: ${stripeFee} ¢ (${invoice.currency})`);
      }
    }
  } catch (feeErr) {
    // Non-fatal — fall back to an estimated fee to avoid over-paying the partner
    const estimatedFeeRate  = 0.02;   // 2% (conservative EU card rate incl. Rewardful)
    const estimatedFeeFixed = 25;     // 0.25 € fixed in cents
    stripeFee = Math.ceil(grossAmount * estimatedFeeRate) + estimatedFeeFixed;
    console.warn(`[WEBHOOK] Could not retrieve Stripe fee — using estimate: ${stripeFee} ¢. Error: ${feeErr.message}`);
  }

  // ── 3. Compute net revenue and the 50% split amount ──────────────────────
  //
  //   net    = gross − stripe_fee
  //   split  = floor(net × 0.50)
  //
  // We use floor() to always round in the platform's favour, avoiding
  // a situation where we transfer more than 50% due to rounding.
  //
  const netAmount   = Math.max(0, grossAmount - stripeFee);
  const splitAmount = Math.floor(netAmount * 0.5);

  if (splitAmount < 1) {
    console.log(`[WEBHOOK] Split amount < 1 cent (net=${netAmount} ¢) — skipping`);
    return;
  }

  console.log(
    `[WEBHOOK] Split calculation: gross=${grossAmount} ¢ − fee=${stripeFee} ¢ = net=${netAmount} ¢ → partner gets ${splitAmount} ¢`
  );

  // ── 4. Execute the transfer ───────────────────────────────────────────────
  //
  // `stripe.transfers.create` moves funds from the EficacIA platform balance
  // to the partner's connected account balance.
  //
  // Idempotency: using `invoice.id` as the key guarantees that even if Stripe
  // retries the webhook (network error, timeout, etc.) we only ever transfer
  // once per invoice.
  //
  try {
    const transfer = await stripe.transfers.create(
      {
        amount:       splitAmount,
        currency:     invoice.currency || 'eur',
        destination:  partnerAccountId,
        description:  `EficacIA 50% revenue split — invoice ${invoice.id}`,
        metadata: {
          invoice_id:      invoice.id,
          gross_amount:    String(grossAmount),
          stripe_fee:      String(stripeFee),
          net_amount:      String(netAmount),
          split_percent:   '50',
          customer_id:     typeof invoice.customer === 'string' ? invoice.customer : (invoice.customer?.id || ''),
          subscription_id: typeof invoice.subscription === 'string' ? invoice.subscription : (invoice.subscription?.id || ''),
        },
      },
      {
        // Idempotency key — Stripe will return the same transfer object if
        // this key was already used, instead of creating a duplicate transfer.
        idempotencyKey: `partner_split_${invoice.id}`,
      },
    );

    console.log(
      `[WEBHOOK] ✓ Partner split complete: ${splitAmount} ${invoice.currency} → ${partnerAccountId} (transfer ${transfer.id})`
    );
  } catch (err) {
    // Log the error but still return 200 to Stripe. A failed transfer is a
    // platform concern — the customer's payment is already settled. Alert
    // engineers to investigate and replay manually if needed.
    console.error(`[WEBHOOK] ✗ Transfer failed for invoice ${invoice.id}:`, err.message);
  }
}
