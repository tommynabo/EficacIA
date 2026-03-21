/**
 * /api/payments/webhook
 *
 * Stripe webhook handler.
 * - checkout.session.completed  → grants +1000 ai_credits for AI-credits one-time purchases
 *                                → activates subscription plan for recurring purchases
 *
 * Requires env: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET,
 *               STRIPE_AI_CREDITS_PRICE_ID (one-time pack),
 *               SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY
);

// Raw body is required by Stripe's webhook signature verification.
// Vercel forwards the raw body for serverless functions automatically.
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

  const secretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secretKey) return res.status(500).json({ error: 'Stripe secret key not configured' });

  const stripe = new Stripe(secretKey);

  // Verify webhook signature when secret is configured
  let event;
  const rawBody = await getRawBody(req);

  if (webhookSecret) {
    const sig = req.headers['stripe-signature'];
    try {
      event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
    } catch (err) {
      console.error('[WEBHOOK] Signature verification failed:', err.message);
      return res.status(400).json({ error: `Webhook error: ${err.message}` });
    }
  } else {
    // Development fallback — parse without verification (never use in production)
    try {
      event = JSON.parse(rawBody.toString());
    } catch (err) {
      return res.status(400).json({ error: 'Invalid JSON body' });
    }
  }

  console.log(`[WEBHOOK] Event received: ${event.type}`);

  // ── Handle checkout.session.completed ──────────────────────────────────────
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const metadata = session.metadata || {};
    const plan = metadata.plan || '';
    const userId = metadata.userId || null;

    // ── AI Credits one-time purchase ──────────────────────────────────────
    if (plan === 'ai_credits') {
      const sessionId = session.id;
      const customerEmail =
        session.customer_details?.email ||
        session.customer_email ||
        null;

      console.log(`[WEBHOOK] AI credits purchase. sessionId=${sessionId} userId=${userId} email=${customerEmail}`);

      // Resolve user record — only select id and email to avoid failing if
      // ai_credits column doesn't exist yet (migration may not have run)
      let userRecord = null;
      if (userId) {
        const { data, error } = await supabase
          .from('users')
          .select('id, email, ai_credits, last_credits_session_id')
          .eq('id', userId)
          .single();
        if (error) console.warn('[WEBHOOK] userId lookup error:', error.message);
        userRecord = data;
      }
      if (!userRecord && customerEmail) {
        const { data, error } = await supabase
          .from('users')
          .select('id, email, ai_credits, last_credits_session_id')
          .eq('email', customerEmail)
          .single();
        if (error) console.warn('[WEBHOOK] email lookup error:', error.message);
        userRecord = data;
      }

      if (!userRecord) {
        console.error('[WEBHOOK] Could not find user for AI credits purchase. email:', customerEmail, 'userId:', userId);
        return res.status(200).json({ received: true, warning: 'User not found' });
      }

      // Idempotency: skip if this session was already processed
      if (userRecord.last_credits_session_id === sessionId) {
        console.log(`[WEBHOOK] Session ${sessionId} already processed for user ${userRecord.id}. Skipping.`);
        return res.status(200).json({ received: true, skipped: 'already_processed' });
      }

      const currentCredits = typeof userRecord.ai_credits === 'number' ? userRecord.ai_credits : 0;
      const newCredits = currentCredits + 1000;

      const { error: updateError } = await supabase
        .from('users')
        .update({ ai_credits: newCredits, last_credits_session_id: sessionId })
        .eq('id', userRecord.id);

      if (updateError) {
        console.error('[WEBHOOK] Failed to update ai_credits:', updateError.message);
        return res.status(500).json({ error: 'Failed to update credits' });
      }

      console.log(`[WEBHOOK] ✓ +1000 ai_credits granted to user ${userRecord.id}. New balance: ${newCredits}`);
      return res.status(200).json({ received: true });
    }

    // ── Subscription plan activation ──────────────────────────────────────
    if (plan && plan !== 'unknown') {
      const customerEmail =
        session.customer_details?.email ||
        session.customer_email ||
        null;

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
        const stripeCustomerId = typeof session.customer === 'string'
          ? session.customer
          : session.customer?.id || null;

        await supabase
          .from('users')
          .update({
            subscription_status: plan,
            ...(stripeCustomerId ? { stripe_id: stripeCustomerId } : {}),
          })
          .eq('id', userRecord.id);

        console.log(`[WEBHOOK] ✓ Plan '${plan}' activated for user ${userRecord.id}`);
      }

      return res.status(200).json({ received: true });
    }
  }

  // ── customer.subscription.deleted ─────────────────────────────────────────
  if (event.type === 'customer.subscription.deleted') {
    const subscription = event.data.object;
    const customerId = typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer?.id;

    if (customerId) {
      await supabase
        .from('users')
        .update({ subscription_status: 'free' })
        .eq('stripe_id', customerId);

      console.log(`[WEBHOOK] ✓ Subscription cancelled — user downgraded to free. customerId: ${customerId}`);
    }

    return res.status(200).json({ received: true });
  }

  // All other events — acknowledge silently
  return res.status(200).json({ received: true });
}
