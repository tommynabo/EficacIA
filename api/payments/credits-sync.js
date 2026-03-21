/**
 * /api/payments/credits-sync
 *
 * POST { sessionId }  →  { credits: number, granted: boolean }
 *
 * Fallback for when the Stripe webhook fails.
 * Called by the frontend when the user lands on the payment success page.
 *
 * Security:
 *  - Requires valid JWT (authenticated user)
 *  - Verifies the Stripe session: payment_status === 'paid', plan === 'ai_credits',
 *    and metadata.userId matches the authenticated user (or email fallback)
 *  - Idempotent: uses last_credits_session_id to prevent double-granting
 */

import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY
);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // ── Auth ───────────────────────────────────────────────────────────────────
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No autenticado' });
  }
  let decoded;
  try {
    decoded = jwt.verify(auth.split(' ')[1], process.env.JWT_SECRET || 'dev-secret');
  } catch {
    return res.status(401).json({ error: 'Token inválido' });
  }
  const authUserId = decoded.userId;
  const authEmail  = decoded.email;

  const { sessionId } = req.body || {};
  if (!sessionId || typeof sessionId !== 'string' || !sessionId.startsWith('cs_')) {
    return res.status(400).json({ error: 'sessionId inválido' });
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) return res.status(500).json({ error: 'Stripe no configurado' });

  const stripe = new Stripe(secretKey, { apiVersion: '2024-04-10' });

  // ── Retrieve & verify Stripe session ──────────────────────────────────────
  let session;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId);
  } catch (err) {
    console.error('[credits-sync] Failed to retrieve session:', err.message);
    return res.status(400).json({ error: 'Sesión de pago no encontrada' });
  }

  if (session.payment_status !== 'paid') {
    return res.status(400).json({ error: 'El pago no está completado' });
  }

  const meta = session.metadata || {};
  if (meta.plan !== 'ai_credits') {
    return res.status(400).json({ error: 'Esta sesión no es de créditos IA' });
  }

  // Verify the session belongs to the authenticated user
  const sessionUserId = meta.userId || null;
  const sessionEmail  = session.customer_details?.email || session.customer_email || null;
  const ownerMatch    = sessionUserId === authUserId || sessionEmail === authEmail;

  if (!ownerMatch) {
    console.warn('[credits-sync] Ownership mismatch. authUserId:', authUserId, 'sessionUserId:', sessionUserId, 'authEmail:', authEmail, 'sessionEmail:', sessionEmail);
    return res.status(403).json({ error: 'Esta sesión no pertenece a tu cuenta' });
  }

  // ── Load user from Supabase ────────────────────────────────────────────────
  const { data: userRecord, error: fetchError } = await supabase
    .from('users')
    .select('id, ai_credits, last_credits_session_id')
    .eq('id', authUserId)
    .single();

  if (fetchError || !userRecord) {
    console.error('[credits-sync] User not found:', fetchError?.message);
    return res.status(404).json({ error: 'Usuario no encontrado' });
  }

  // ── Idempotency check ─────────────────────────────────────────────────────
  if (userRecord.last_credits_session_id === sessionId) {
    // Already processed (either by webhook or a previous sync call)
    return res.status(200).json({
      credits: userRecord.ai_credits,
      granted: false,
      message: 'Créditos ya aplicados anteriormente',
    });
  }

  // ── Grant +1000 credits ───────────────────────────────────────────────────
  const currentCredits = typeof userRecord.ai_credits === 'number' ? userRecord.ai_credits : 0;
  const newCredits     = currentCredits + 1000;

  const { error: updateError } = await supabase
    .from('users')
    .update({ ai_credits: newCredits, last_credits_session_id: sessionId })
    .eq('id', authUserId);

  if (updateError) {
    console.error('[credits-sync] Failed to update credits:', updateError.message);
    return res.status(500).json({ error: 'Error al actualizar créditos' });
  }

  console.log(`[credits-sync] ✓ +1000 ai_credits granted to user ${authUserId}. New balance: ${newCredits}`);
  return res.status(200).json({ credits: newCredits, granted: true });
}
