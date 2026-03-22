/**
 * /api/payments/create-portal-session
 *
 * Creates a Stripe Customer Portal session so users can manage or cancel
 * their subscription without leaving the platform.
 *
 * POST /api/payments/create-portal-session
 * Headers: Authorization: Bearer <token>
 * Response: { url: string }
 */

import { createClient } from '@supabase/supabase-js';
import { getStripe } from '../_lib/stripe.js';
import { getAuthUser } from '../_lib/auth.js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY
);

const RETURN_URL = 'https://eficac-ia.vercel.app/dashboard/settings?tab=billing';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── Auth ────────────────────────────────────────────────────────────────
  const { userId, error: authError } = await getAuthUser(req);
  if (!userId) {
    return res.status(401).json({ error: authError || 'No autorizado' });
  }

  // ── Retrieve stripe_id from Supabase ────────────────────────────────────
  const { data: userRow, error: dbError } = await supabase
    .from('users')
    .select('stripe_id')
    .eq('id', userId)
    .single();

  if (dbError || !userRow) {
    console.error('[PORTAL] Supabase error:', dbError?.message);
    return res.status(500).json({ error: 'No se pudo recuperar el usuario' });
  }

  const stripeCustomerId = userRow.stripe_id;
  if (!stripeCustomerId) {
    return res.status(400).json({ error: 'No tienes ninguna suscripción activa en Stripe' });
  }

  // ── Create portal session ────────────────────────────────────────────────
  try {
    const stripe = getStripe();
    const session = await stripe.billingPortal.sessions.create({
      customer:   stripeCustomerId,
      return_url: RETURN_URL,
    });

    console.log(`[PORTAL] ✓ Portal session created for customer ${stripeCustomerId} (user ${userId})`);
    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('[PORTAL] Stripe error:', err.message);
    return res.status(500).json({ error: 'No se pudo abrir el portal de facturación. Inténtalo de nuevo.' });
  }
}
