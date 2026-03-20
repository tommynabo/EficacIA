/**
 * /api/linkedin/invitations/withdraw
 *
 * POST  (no body needed) — Triggered by a cron job (e.g. Vercel Cron or external scheduler)
 *        reads all linkedin_accounts with auto_withdraw_invites = true,
 *        fetches their pending sent invitations from Unipile, and withdraws
 *        any that are older than `withdraw_after_days`.
 *
 * Also supports manual trigger:
 * POST ?accountId=<unipile_account_id> — run for a single account immediately
 */

import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY
);

function getUserId(req) {
  const auth = req.headers.authorization || '';
  const token = auth.replace('Bearer ', '');
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret');
    return decoded.userId;
  } catch {
    return null;
  }
}

function unipileHeaders() {
  return {
    'X-API-KEY': (process.env.UNIPILE_API_KEY || '').trim(),
    'Accept': 'application/json',
    'Content-Type': 'application/json',
  };
}

function unipileBase() {
  return `https://${(process.env.UNIPILE_DSN || '').trim()}`;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  // Allow both cron (no auth) with CRON_SECRET header, and authenticated user requests
  const cronSecret = req.headers['x-cron-secret'];
  const isValidCron = cronSecret && cronSecret === process.env.CRON_SECRET;
  const userId = getUserId(req);

  if (!isValidCron && !userId) {
    return res.status(401).json({ error: 'No autenticado' });
  }

  const dsn = (process.env.UNIPILE_DSN || '').trim();
  const apiKey = (process.env.UNIPILE_API_KEY || '').trim();
  if (!dsn || !apiKey) {
    return res.status(500).json({ error: 'Unipile no configurado' });
  }

  try {
    // Optionally target a specific account
    const specificAccountId = req.query.accountId || req.body?.accountId;

    let query = supabaseAdmin
      .from('linkedin_accounts')
      .select('id, unipile_account_id, withdraw_after_days, team_id')
      .eq('auto_withdraw_invites', true)
      .eq('is_valid', true);

    if (specificAccountId) {
      query = query.eq('unipile_account_id', specificAccountId);
    }

    // If not a cron call, restrict to user's own accounts
    if (!isValidCron && userId) {
      const { data: teams } = await supabaseAdmin
        .from('teams')
        .select('id')
        .eq('owner_id', userId)
        .limit(1);
      const teamId = teams?.[0]?.id;
      if (!teamId) return res.status(403).json({ error: 'Equipo no encontrado' });
      query = query.eq('team_id', teamId);
    }

    const { data: accounts, error: dbError } = await query;
    if (dbError) throw new Error(dbError.message);
    if (!accounts || accounts.length === 0) {
      return res.status(200).json({ message: 'No hay cuentas con auto-withdraw activo', withdrawn: 0 });
    }

    const results = [];

    for (const account of accounts) {
      const cutoffDays = account.withdraw_after_days ?? 15;
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - cutoffDays);

      let withdrawn = 0;
      let errors = 0;

      try {
        // Fetch pending sent invitations for this account
        const invUrl = `${unipileBase()}/api/v1/users/relations/invitations/sent?account_id=${account.unipile_account_id}&limit=100`;
        const invResp = await fetch(invUrl, { headers: unipileHeaders() });

        if (!invResp.ok) {
          const errText = await invResp.text();
          console.error(`[WITHDRAW] Account ${account.unipile_account_id}: failed to fetch invitations`, invResp.status, errText);
          results.push({ accountId: account.unipile_account_id, error: `HTTP ${invResp.status}` });
          continue;
        }

        const invData = await invResp.json();
        const invitations = invData.items || invData.invitations || invData || [];

        for (const inv of invitations) {
          // Check invitation age — Unipile returns created_at or sent_at
          const sentAt = inv.created_at || inv.sent_at;
          if (!sentAt) continue;

          const invDate = new Date(sentAt);
          if (invDate >= cutoffDate) continue; // Not old enough yet

          // Withdraw the invitation
          try {
            const withdrawUrl = `${unipileBase()}/api/v1/users/relations/invitations/${inv.id}`;
            const wResp = await fetch(withdrawUrl, {
              method: 'DELETE',
              headers: unipileHeaders(),
              body: JSON.stringify({ account_id: account.unipile_account_id }),
            });

            if (wResp.ok) {
              withdrawn++;
              console.log(`[WITHDRAW] Withdrew invitation ${inv.id} (${Math.floor((Date.now() - invDate.getTime()) / 86400000)} days old)`);
            } else {
              errors++;
              const errText = await wResp.text();
              console.error(`[WITHDRAW] Failed to withdraw ${inv.id}:`, wResp.status, errText);
            }
          } catch (wErr) {
            errors++;
            console.error(`[WITHDRAW] Exception withdrawing ${inv.id}:`, wErr.message);
          }

          // Small delay to avoid rate limiting
          await new Promise(r => setTimeout(r, 300));
        }

        results.push({ accountId: account.unipile_account_id, withdrawn, errors });
      } catch (accErr) {
        console.error(`[WITHDRAW] Account ${account.unipile_account_id} error:`, accErr.message);
        results.push({ accountId: account.unipile_account_id, error: accErr.message });
      }
    }

    const totalWithdrawn = results.reduce((sum, r) => sum + (r.withdrawn || 0), 0);
    return res.status(200).json({
      message: `Auto-withdraw completado. ${totalWithdrawn} invitaciones retiradas.`,
      results,
      totalWithdrawn,
    });
  } catch (err) {
    console.error('[WITHDRAW] Error general:', err);
    return res.status(500).json({ error: err.message || 'Error en auto-withdraw' });
  }
}
