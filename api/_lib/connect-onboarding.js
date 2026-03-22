/**
 * /api/payments/connect-onboarding
 *
 * POST — Stripe Connect V2: creates (or retrieves) a connected account for
 *         a partner/collaborator and returns a one-time onboarding URL.
 *
 * GET  — Returns the current status of the connected account so the UI can
 *         show whether onboarding is complete, pending, or incomplete.
 *
 * POST ?action=login-link — Generates a Stripe Express Dashboard login link.
 *
 * Environment variables required:
 *   STRIPE_SECRET_KEY         — Platform Stripe secret key
 *   PARTNER_STRIPE_ACCOUNT_ID — Connected account ID (acct_…) once created;
 *                               leave empty to create a new one automatically.
 *   FRONTEND_URL              — Base URL for redirect after onboarding
 *
 * Stripe Connect V2 API (stripe SDK ≥ 17):
 *   stripe.v2.core.accounts.*
 *   stripe.v2.core.accountLinks.*  (accountSessions for embedded components)
 */

import { getStripe } from '../_lib/stripe.js';
import { getAuthUser } from '../_lib/auth.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // ── Authenticate caller (must be an admin/platform user) ────────────────
  const { userId, error: authError } = await getAuthUser(req);
  if (!userId) {
    return res.status(401).json({ error: authError || 'No autenticado' });
  }

  const stripe = getStripe();
  const proto   = req.headers['x-forwarded-proto'] || 'https';
  const host    = req.headers['x-forwarded-host'] || req.headers.host;
  const baseUrl = process.env.FRONTEND_URL || `${proto}://${host}`;

  // ─────────────────────────────────────────────────────────────────────────
  // GET — retrieve current connected account status
  // ─────────────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const accountId = process.env.PARTNER_STRIPE_ACCOUNT_ID;
    if (!accountId || accountId.startsWith('acct_xxxxx')) {
      return res.status(200).json({
        status: 'not_created',
        message: 'No hay cuenta Connect configurada. Completa el onboarding.',
      });
    }

    try {
      // ── V2: retrieve account with full configuration ───────────────────
      const account = await stripe.v2.core.accounts.retrieve(accountId, {
        include: [
          'configuration.merchant',
          'configuration.customer',
          'requirements',
          'identity',
        ],
      });

      const requirements = account.requirements || {};
      const isComplete   = !requirements.currently_due?.length &&
                           !requirements.past_due?.length;

      return res.status(200).json({
        id:            account.id,
        status:        isComplete ? 'complete' : 'incomplete',
        charges_enabled: account.configuration?.merchant?.statement_descriptor ? true : !!account.capabilities?.transfers,
        payouts_enabled: account.configuration?.merchant ? true : false,
        currently_due:   requirements.currently_due  || [],
        past_due:        requirements.past_due        || [],
        eventually_due:  requirements.eventually_due  || [],
        display_name:    account.identity?.business_details?.name || null,
      });
    } catch (err) {
      console.error('[CONNECT] Failed to retrieve V2 account:', err.message);
      return res.status(500).json({ error: err.message || 'Error al obtener estado de la cuenta' });
    }
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // POST ?action=login-link — Stripe dashboard login link for the partner
  // ─────────────────────────────────────────────────────────────────────────
  if (req.query.action === 'login-link') {
    const accountId = process.env.PARTNER_STRIPE_ACCOUNT_ID;
    if (!accountId || accountId.startsWith('acct_xxxxx')) {
      return res.status(400).json({ error: 'Cuenta Connect no creada todavía' });
    }

    try {
      // V1 API — login links are unchanged in V2 platform model
      const loginLink = await stripe.accounts.createLoginLink(accountId);
      return res.status(200).json({ url: loginLink.url });
    } catch (err) {
      console.error('[CONNECT] Failed to create login link:', err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // POST — create or re-trigger onboarding for the connected account
  // ─────────────────────────────────────────────────────────────────────────
  try {
    let accountId = process.env.PARTNER_STRIPE_ACCOUNT_ID;
    const isPlaceholder = !accountId || accountId.startsWith('acct_xxxxx');

    if (isPlaceholder) {
      // ── Step 1: Create the V2 connected account ──────────────────────────
      //
      // V2 API: stripe.v2.core.accounts.create()
      //  - country: ISO-3166 alpha-2
      //  - configuration.merchant: enables the merchant (charges) capability
      //  - configuration.customer: enables the customer (payouts) capability
      //  - controller.dashboard.type 'full' → partner sees the full Stripe dashboard
      //  - controller.requirement_collection 'stripe' → Stripe collects KYB/KYC
      //    directly from the partner (platform stays out of compliance flow)
      //
      const newAccount = await stripe.v2.core.accounts.create({
        include: ['configuration.merchant', 'configuration.customer'],
        // Specify which configurations to enable for this account
        configuration: {
          merchant: {
            // Merchant of Record category — software-as-a-service
            mcc: '7372',
            // Allow Stripe to collect TOS acceptance directly
            tos_acceptance: { type: 'online' },
          },
          customer: {},
        },
        identity: {
          county: 'ES',
          // Country where the partner entity is registered
          entity_type: 'individual',
        },
        // V2 "controller" block — sets who owns compliance responsibilities
        // and what kind of dashboard access the account has.
        controller: {
          dashboard: {
            // 'full' → partner can log in and see their Stripe dashboard
            type: 'full',
          },
          requirement_collection: 'stripe', // Stripe handles KYB/KYC collection
          losses: { payments: 'stripe' },   // Stripe absorbs losses (no liability shift)
        },
      });

      accountId = newAccount.id;
      console.log(`[CONNECT] ✓ New V2 connected account created: ${accountId}`);
      console.log(`[CONNECT] ACTION REQUIRED: Set PARTNER_STRIPE_ACCOUNT_ID=${accountId} in your environment variables.`);
      // In production you'd persist this ID to the DB and notify the admin.
    }

    // ── Step 2: Create the Account Link (onboarding URL) ──────────────────
    //
    // V2 API: stripe.v2.core.accountLinks.create()
    //  - account:        the connected account ID
    //  - configurations: array of configuration names to onboard for.
    //                    'merchant' → payment acceptance
    //                    'customer' → payout / bank account
    //  - return_url:     where Stripe redirects after successful onboarding
    //  - refresh_url:    where Stripe redirects if the link expires
    //
    const accountLink = await stripe.v2.core.accountLinks.create({
      account:        accountId,
      return_url:     `${baseUrl}/dashboard/settings?tab=finanzas&onboarding=success`,
      refresh_url:    `${baseUrl}/dashboard/settings?tab=finanzas&onboarding=refresh`,
      use_case: {
        // Collect full onboarding information for both capabilities
        collection: {
          type: 'full',
        },
      },
    });

    return res.status(200).json({
      url:        accountLink.url,
      account_id: accountId,
      expires_at: accountLink.expires_at,
    });

  } catch (err) {
    console.error('[CONNECT] Onboarding failed:', err.message);
    return res.status(500).json({ error: err.message || 'Error al iniciar onboarding' });
  }
}
