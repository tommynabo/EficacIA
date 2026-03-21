import Stripe from 'stripe';

// ─── Allowed Price IDs ────────────────────────────────────────────────────────
// Set STRIPE_PRO_MONTHLY, STRIPE_PRO_ANNUAL, STRIPE_GROWTH_MONTHLY,
// STRIPE_GROWTH_ANNUAL, STRIPE_AGENCY_MONTHLY, STRIPE_AGENCY_ANNUAL,
// and STRIPE_AI_CREDITS_PRICE_ID in your Vercel / .env environment variables.
//
// Security: priceId sent by the client is always validated against this whitelist.
// When env vars are not yet configured (empty), any Stripe-format ID is accepted
// so the endpoint keeps working during development.
const ALLOWED_PRICE_IDS = new Set(
  [
    process.env.STRIPE_PRO_MONTHLY,
    process.env.STRIPE_PRO_ANNUAL,
    process.env.STRIPE_GROWTH_MONTHLY,
    process.env.STRIPE_GROWTH_ANNUAL,
    process.env.STRIPE_AGENCY_MONTHLY,
    process.env.STRIPE_AGENCY_ANNUAL,
    process.env.STRIPE_AI_CREDITS_PRICE_ID,
  ].filter(Boolean),
);

// One-time payment price IDs (payment mode, not subscription)
const ONE_TIME_PRICE_IDS = new Set(
  [process.env.STRIPE_AI_CREDITS_PRICE_ID].filter(Boolean),
);

// Reverse map: priceId → plan slug — used to populate session metadata.
const PRICE_TO_PLAN = {};
if (process.env.STRIPE_PRO_MONTHLY)     PRICE_TO_PLAN[process.env.STRIPE_PRO_MONTHLY]     = 'pro';
if (process.env.STRIPE_PRO_ANNUAL)      PRICE_TO_PLAN[process.env.STRIPE_PRO_ANNUAL]      = 'pro';
if (process.env.STRIPE_GROWTH_MONTHLY)  PRICE_TO_PLAN[process.env.STRIPE_GROWTH_MONTHLY]  = 'growth';
if (process.env.STRIPE_GROWTH_ANNUAL)   PRICE_TO_PLAN[process.env.STRIPE_GROWTH_ANNUAL]   = 'growth';
if (process.env.STRIPE_AGENCY_MONTHLY)  PRICE_TO_PLAN[process.env.STRIPE_AGENCY_MONTHLY]  = 'agency';
if (process.env.STRIPE_AGENCY_ANNUAL)   PRICE_TO_PLAN[process.env.STRIPE_AGENCY_ANNUAL]   = 'agency';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // GET — recuperar sesión completada por sessionId
  if (req.method === 'GET') {
    try {
      const secretKey = process.env.STRIPE_SECRET_KEY;
      if (!secretKey) return res.status(500).json({ error: 'Stripe secret key not configured' });
      const stripe = new Stripe(secretKey);
      const sessionId = req.query.sessionId;
      if (!sessionId) return res.status(400).json({ error: 'sessionId es requerido' });
      const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ['customer', 'subscription'] });
      if (session.status !== 'complete') return res.status(400).json({ error: 'Sesión no completada' });
      const customer = session.customer;
      return res.status(200).json({
        email: (customer && customer.email) || session.customer_details?.email || '',
        name: (customer && customer.name) || session.customer_details?.name || '',
        customerId: typeof session.customer === 'string' ? session.customer : customer?.id,
        subscriptionId: typeof session.subscription === 'string' ? session.subscription : session.subscription?.id,
        plan: session.metadata?.plan || '',
      });
    } catch (error) {
      return res.status(500).json({ error: error.message || 'Error recuperando sesión' });
    }
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      return res.status(500).json({ error: 'Stripe secret key not configured' });
    }

    const stripe = new Stripe(secretKey);

    // ── Extract + validate priceId ─────────────────────────────────────────
    const { priceId, plan: planFromBody, billing, userId } = req.body || {};

    if (!priceId || typeof priceId !== 'string' || !priceId.startsWith('price_')) {
      return res.status(400).json({ error: 'priceId inválido.' });
    }

    // Strict whitelist when env vars are configured; basic format check otherwise.
    if (ALLOWED_PRICE_IDS.size > 0 && !ALLOWED_PRICE_IDS.has(priceId)) {
      return res.status(400).json({ error: 'priceId no permitido.' });
    }

    // ── Resolve plan slug for metadata ──────────────────────────────────────
    const plan = (planFromBody && typeof planFromBody === 'string')
      ? planFromBody
      : (PRICE_TO_PLAN[priceId] ?? 'unknown');

    const billingPeriod = (billing === 'annual' || billing === 'monthly')
      ? billing
      : 'monthly';

    const proto = req.headers['x-forwarded-proto'] || 'https';
    const host  = req.headers['x-forwarded-host'] || req.headers.host;
    const baseUrl = `${proto}://${host}`;

    // ── Create Stripe Checkout Session ─────────────────────────────────────
    const isOneTime = ONE_TIME_PRICE_IDS.has(priceId) || plan === 'ai_credits';

    let sessionParams;
    if (isOneTime) {
      // One-time payment for AI credits — no trial, no subscription
      sessionParams = {
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: [{ price: priceId, quantity: 1 }],
        allow_promotion_codes: true,
        metadata: {
          plan: 'ai_credits',
          ...(userId && typeof userId === 'string' ? { userId } : {}),
        },
        billing_address_collection: 'auto',
        success_url: `${baseUrl}/dashboard/settings?tab=credits&payment=success`,
        cancel_url:  `${baseUrl}/dashboard/settings?tab=credits`,
      };
    } else {
      sessionParams = {
        mode: 'subscription',
        payment_method_types: ['card'],
        line_items: [{ price: priceId, quantity: 1 }],
        subscription_data: {
          trial_period_days: 7,
          metadata: {
            plan,
            billing: billingPeriod,
            ...(userId && typeof userId === 'string' ? { userId } : {}),
          },
        },
        metadata: {
          plan,
          billing: billingPeriod,
          ...(userId && typeof userId === 'string' ? { userId } : {}),
        },
        billing_address_collection: 'auto',
        success_url: `${baseUrl}/register?session_id={CHECKOUT_SESSION_ID}&plan=${plan}`,
        cancel_url:  `${baseUrl}/pricing`,
      };
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    return res.status(200).json({ sessionId: session.id, url: session.url });
  } catch (error) {
    console.error('Checkout error:', error);
    return res.status(500).json({ error: error.message || 'Error creando sesión' });
  }
};
