/**
 * api/_lib/stripe.js
 *
 * Singleton Stripe client — used across all serverless functions.
 *
 * Why a singleton?
 * - Avoids re-initialising the SDK on every request in warm lambdas.
 * - Centralises the API version pin so every function uses the same one.
 * - Makes it trivial to swap test/live keys via env vars.
 *
 * Usage:
 *   import { getStripe } from '../_lib/stripe.js';
 *   const stripe = getStripe();
 *   const session = await stripe.checkout.sessions.create(...);
 */

import Stripe from 'stripe';

let _stripeInstance = null;

/**
 * Returns the cached Stripe client, creating it on the first call.
 * Throws if STRIPE_SECRET_KEY is not set.
 */
export function getStripe() {
  if (_stripeInstance) return _stripeInstance;

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error('[Stripe] STRIPE_SECRET_KEY is not configured. Set it in your .env or Vercel environment variables.');
  }

  _stripeInstance = new Stripe(secretKey, {
    // Pin to a stable API version — update deliberately after reviewing changelog.
    apiVersion: '2025-02-24.acacia',
    // Maximum SDK retries on network errors (Stripe recommends 2).
    maxNetworkRetries: 2,
    // Tag every request for easier debugging in the Stripe dashboard.
    appInfo: {
      name: 'EficacIA',
      version: '2.0.0',
      url: 'https://eficacia-ia.com',
    },
  });

  return _stripeInstance;
}

/**
 * Convenience: pre-built Supabase admin client co-located here so
 * payment functions don't need to re-import it separately.
 */
import { createClient } from '@supabase/supabase-js';

let _supabaseInstance = null;

export function getSupabase() {
  if (_supabaseInstance) return _supabaseInstance;
  _supabaseInstance = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY,
  );
  return _supabaseInstance;
}
