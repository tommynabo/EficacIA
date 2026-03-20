/**
 * /api/linkedin/unibox
 *
 * Endpoints:
 *  GET  ?action=chats&accountId=XXX&cursor=&limit=   → lista de conversaciones
 *  GET  ?action=messages&chatId=XXX&accountId=XXX    → mensajes de una conversación
 *  POST ?action=send                                 → { chatId, accountId, text }
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

async function getTeamId(userId) {
  const { data } = await supabaseAdmin
    .from('teams')
    .select('id')
    .eq('owner_id', userId)
    .limit(1);
  return data?.[0]?.id || null;
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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'No autenticado' });

  const teamId = await getTeamId(userId);
  if (!teamId) return res.status(403).json({ error: 'Equipo no encontrado' });

  const action = req.query.action;
  const dsn = (process.env.UNIPILE_DSN || '').trim();
  const apiKey = (process.env.UNIPILE_API_KEY || '').trim();

  if (!dsn || !apiKey) {
    return res.status(500).json({ error: 'Unipile no configurado' });
  }

  // ─── GET chats (enriched with attendee names + pictures) ────────────
  if (req.method === 'GET' && action === 'chats') {
    const { accountId, cursor, limit = '20' } = req.query;

    // Verify the account belongs to this team
    if (accountId) {
      const { data: acc } = await supabaseAdmin
        .from('linkedin_accounts')
        .select('id, unipile_account_id')
        .eq('team_id', teamId)
        .eq('unipile_account_id', accountId)
        .single();
      if (!acc) return res.status(403).json({ error: 'Cuenta no autorizada' });
    }

    const params = new URLSearchParams({ limit });
    if (accountId) params.set('account_id', accountId);
    if (cursor) params.set('cursor', cursor);

    try {
      const r = await fetch(`${unipileBase()}/api/v1/chats?${params}`, {
        headers: unipileHeaders(),
      });
      if (!r.ok) {
        const err = await r.text();
        console.error('[UNIBOX][chats]', r.status, err);
        return res.status(r.status).json({ error: 'Error obteniendo conversaciones' });
      }
      const data = await r.json();
      const chatItems = data.items || data.chats || [];

      // ── Enrich each chat with attendee names + picture_url ──
      const enriched = await Promise.all(chatItems.map(async (chat) => {
        try {
          const attRes = await fetch(
            `${unipileBase()}/api/v1/chats/${chat.id}/attendees`,
            { headers: unipileHeaders() }
          );
          if (attRes.ok) {
            const attData = await attRes.json();
            const attendeeList = attData.items || attData.attendees || attData || [];
            if (Array.isArray(attendeeList) && attendeeList.length > 0) {
              chat.attendees_enriched = attendeeList.map(a => ({
                id: a.id,
                provider_id: a.provider_id,
                public_identifier: a.public_identifier || a.username || null,
                name: a.name || a.display_name || null,
                picture_url: a.picture_url || a.avatar_url || null,
                is_self: a.is_self || false,
              }));
            }
          }
        } catch (err) {
          console.error(`[UNIBOX][enrich] Error fetching attendees for chat ${chat.id}:`, err.message);
        }
        return chat;
      }));

      // Return with enriched attendees
      return res.status(200).json({ ...data, items: enriched });
    } catch (e) {
      console.error('[UNIBOX][chats] excepción:', e);
      return res.status(500).json({ error: 'Error de red con Unipile' });
    }
  }

  // ─── GET messages ─────────────────────────────────────────────────
  if (req.method === 'GET' && action === 'messages') {
    const { chatId, cursor, limit = '50' } = req.query;
    if (!chatId) return res.status(400).json({ error: 'Falta chatId' });

    const params = new URLSearchParams({ limit });
    if (cursor) params.set('cursor', cursor);

    try {
      const r = await fetch(`${unipileBase()}/api/v1/chats/${chatId}/messages?${params}`, {
        headers: unipileHeaders(),
      });
      if (!r.ok) {
        const err = await r.text();
        console.error('[UNIBOX][messages]', r.status, err);
        return res.status(r.status).json({ error: 'Error obteniendo mensajes' });
      }
      const data = await r.json();
      return res.status(200).json(data);
    } catch (e) {
      console.error('[UNIBOX][messages] excepción:', e);
      return res.status(500).json({ error: 'Error de red con Unipile' });
    }
  }

  // ─── POST mark as read ────────────────────────────────────────────
  if (req.method === 'POST' && action === 'mark_read') {
    const { chatId, accountId } = req.body;
    if (!chatId) return res.status(400).json({ error: 'Falta chatId' });

    // Verify account ownership
    if (accountId) {
      const { data: acc } = await supabaseAdmin
        .from('linkedin_accounts')
        .select('id')
        .eq('team_id', teamId)
        .eq('unipile_account_id', accountId)
        .single();
      if (!acc) return res.status(403).json({ error: 'Cuenta no autorizada' });
    }

    try {
      // Try multiple Unipile methods to mark chat as read
      // Method 1: PATCH /api/v1/chats/:id (documented for some Unipile versions)
      let success = false;
      try {
        const r1 = await fetch(`${unipileBase()}/api/v1/chats/${chatId}`, {
          method: 'PATCH',
          headers: unipileHeaders(),
          body: JSON.stringify({ unread_count: 0 }),
        });
        if (r1.ok) success = true;
      } catch {}

      // Method 2: PUT /api/v1/chats/:id
      if (!success) {
        try {
          const r2 = await fetch(`${unipileBase()}/api/v1/chats/${chatId}`, {
            method: 'PUT',
            headers: unipileHeaders(),
            body: JSON.stringify({ unread_count: 0 }),
          });
          if (r2.ok) success = true;
        } catch {}
      }

      // Method 3: POST /api/v1/chats/:id/messages/read
      if (!success) {
        try {
          await fetch(`${unipileBase()}/api/v1/chats/${chatId}/messages/read`, {
            method: 'POST',
            headers: unipileHeaders(),
          });
        } catch {}
      }

      return res.status(200).json({ success: true });
    } catch (e) {
      console.error('[UNIBOX][read] excepción:', e);
      return res.status(500).json({ error: 'Error de red con Unipile' });
    }
  }

  // ─── POST send message ────────────────────────────────────────────
  if (req.method === 'POST' && action === 'send') {
    const { chatId, text, accountId } = req.body;
    if (!chatId || !text) return res.status(400).json({ error: 'Faltan chatId o text' });

    // Verify account ownership
    if (accountId) {
      const { data: acc } = await supabaseAdmin
        .from('linkedin_accounts')
        .select('id')
        .eq('team_id', teamId)
        .eq('unipile_account_id', accountId)
        .single();
      if (!acc) return res.status(403).json({ error: 'Cuenta no autorizada' });
    }

    try {
      const r = await fetch(`${unipileBase()}/api/v1/chats/${chatId}/messages`, {
        method: 'POST',
        headers: unipileHeaders(),
        body: JSON.stringify({ text }),
      });
      if (!r.ok) {
        const err = await r.text();
        console.error('[UNIBOX][send]', r.status, err);
        return res.status(r.status).json({ error: 'Error enviando mensaje' });
      }
      const data = await r.json();
      return res.status(200).json(data);
    } catch (e) {
      console.error('[UNIBOX][send] excepción:', e);
      return res.status(500).json({ error: 'Error de red con Unipile' });
    }
  }

  // ─── POST upsert_lead — find or create a lead from Unibox ─────────
  if (req.method === 'POST' && action === 'upsert_lead') {
    const { providerId, name, publicIdentifier } = req.body;
    if (!providerId) return res.status(400).json({ error: 'Falta providerId' });

    // Split full name into first_name / last_name (DB uses first_name, not name)
    const nameParts = (name || '').trim().split(/\s+/);
    const firstName = nameParts[0] || 'Desconocido';
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : null;

    // Build profile URL if we have the public identifier
    const profileUrl = publicIdentifier
      ? `https://www.linkedin.com/in/${publicIdentifier}/`
      : null;

    // Search by URL first (most reliable), then by provider_id as fallback
    let existingLead = null;
    if (profileUrl) {
      const { data } = await supabaseAdmin
        .from('leads')
        .select('id, tags, sequence_paused, first_name, last_name, linkedin_url, status')
        .ilike('linkedin_url', `%${publicIdentifier}%`)
        .eq('team_id', teamId)
        .limit(1);
      existingLead = data?.[0] || null;
    }
    if (!existingLead) {
      const { data } = await supabaseAdmin
        .from('leads')
        .select('id, tags, sequence_paused, first_name, last_name, linkedin_url, status')
        .ilike('linkedin_url', `%${providerId}%`)
        .eq('team_id', teamId)
        .limit(1);
      existingLead = data?.[0] || null;
    }

    if (existingLead) {
      return res.status(200).json({ lead: existingLead, created: false });
    }

    // Create a minimal orphan lead (campaign_id is nullable after migration)
    const { data: newLead, error } = await supabaseAdmin
      .from('leads')
      .insert({
        team_id: teamId,
        campaign_id: null,
        first_name: firstName,
        last_name: lastName,
        linkedin_url: profileUrl || `https://www.linkedin.com/in/${providerId}/`,
        status: 'pending',
        tags: [],
        sequence_paused: false,
      })
      .select('id, tags, sequence_paused, first_name, last_name, linkedin_url, status')
      .single();

    if (error) {
      console.error('[UNIBOX][upsert_lead]', error.message);
      return res.status(200).json({ lead: null, created: false, error: error.message });
    }
    return res.status(200).json({ lead: newLead, created: true });
  }

  // ─── POST block — mark lead blocked in DB + real LinkedIn block via Unipile ─────
  if (req.method === 'POST' && action === 'block') {
    const { leadId, unipile_id, accountId } = req.body;

    if (!leadId && !unipile_id) {
      return res.status(400).json({ error: 'Falta leadId o unipile_id' });
    }

    // ── Step 1: Actually block on LinkedIn via Unipile ──────────────────
    if (unipile_id && accountId) {
      try {
        // Correct Unipile endpoint: POST /api/v1/users/{provider_id}/block
        const blockUrl = `${unipileBase()}/api/v1/users/${unipile_id}/block`;
        console.log(`[UNIBOX][block] Calling Unipile block: POST ${blockUrl} account_id=${accountId}`);
        const bResp = await fetch(blockUrl, {
          method: 'POST',
          headers: unipileHeaders(),
          body: JSON.stringify({ account_id: accountId }),
        });
        const bData = await bResp.text();
        if (bResp.ok) {
          console.log(`[UNIBOX][block] ✅ LinkedIn block successful for provider_id=${unipile_id}`);
        } else {
          console.warn(`[UNIBOX][block] Unipile block returned ${bResp.status}: ${bData}`);
        }
      } catch (blockErr) {
        console.error('[UNIBOX][block] Unipile block call failed:', blockErr.message);
      }
    } else {
      console.warn('[UNIBOX][block] Missing accountId or unipile_id — skipping Unipile block call');
    }

    // ── Step 2: Update Supabase status to blocked ────────────────────────
    // Strategy 1: block by internal leadId
    if (leadId) {
      const { data: lead, error } = await supabaseAdmin
        .from('leads')
        .update({ status: 'blocked' })
        .eq('id', leadId)
        .eq('team_id', teamId)
        .select('id, status')
        .single();

      if (!error && lead) {
        console.log(`[UNIBOX][block] Lead ${leadId} blocked in DB`);
        return res.status(200).json({ success: true, lead });
      }
      if (error) console.error('[UNIBOX][block] by leadId failed:', error.message);
    }

    // Strategy 2: block by unipile_id column
    if (unipile_id) {
      const { data: lead, error } = await supabaseAdmin
        .from('leads')
        .update({ status: 'blocked' })
        .eq('unipile_id', unipile_id)
        .eq('team_id', teamId)
        .select('id, status')
        .single();

      if (!error && lead) {
        console.log(`[UNIBOX][block] Lead blocked by unipile_id=${unipile_id}`);
        return res.status(200).json({ success: true, lead });
      }

      // Strategy 3: fallback — search by linkedin_url
      const { data: leads } = await supabaseAdmin
        .from('leads')
        .select('id')
        .eq('team_id', teamId)
        .ilike('linkedin_url', `%${unipile_id}%`)
        .limit(1);

      if (leads && leads.length > 0) {
        const { data: updatedLead, error: updateErr } = await supabaseAdmin
          .from('leads')
          .update({ status: 'blocked' })
          .eq('id', leads[0].id)
          .eq('team_id', teamId)
          .select('id, status')
          .single();

        if (!updateErr && updatedLead) {
          console.log(`[UNIBOX][block] Lead ${updatedLead.id} blocked by linkedin_url match`);
          return res.status(200).json({ success: true, lead: updatedLead });
        }
      } else {
        console.warn('[UNIBOX][block] No lead found for unipile_id:', unipile_id);
      }
    }

    return res.status(200).json({ success: true, message: 'Blocked on LinkedIn; no matching lead in DB' });
  }
  // ─── GET blocked_leads — returns all leads with status='blocked' for this team ───
  if (req.method === 'GET' && action === 'blocked_leads') {
    const { data: blockedLeads, error } = await supabaseAdmin
      .from('leads')
      .select('id, first_name, last_name, linkedin_url, company, status, tags')
      .eq('team_id', teamId)
      .eq('status', 'blocked')
      .order('first_name', { ascending: true });

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ leads: blockedLeads || [] });
  }
  // ─── GET lead data by provider_id (attendee) ─────────────────────
  if (req.method === 'GET' && action === 'get_lead') {
    const { providerId } = req.query;
    if (!providerId) return res.status(400).json({ error: 'Falta providerId' });

    // Look up lead by linkedin_profile_url containing the provider_id
    const { data: leads } = await supabaseAdmin
      .from('leads')
      .select('id, tags, sequence_paused, first_name, last_name, linkedin_url')
      .ilike('linkedin_url', `%${providerId}%`)
      .limit(1);

    if (!leads || leads.length === 0) {
      return res.status(200).json({ lead: null });
    }
    return res.status(200).json({ lead: leads[0] });
  }

  // ─── PATCH update lead (tags / sequence_paused / status) ─────────
  if (req.method === 'PATCH' && action === 'update_lead') {
    const { leadId, tags, sequence_paused, status } = req.body;
    if (!leadId) return res.status(400).json({ error: 'Falta leadId' });

    const updates = {};
    if (tags !== undefined) updates.tags = tags;
    if (sequence_paused !== undefined) updates.sequence_paused = sequence_paused;
    if (status !== undefined) updates.status = status;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No hay campos para actualizar' });
    }

    const { data: lead, error } = await supabaseAdmin
      .from('leads')
      .update(updates)
      .eq('id', leadId)
      .eq('team_id', teamId)
      .select('id, tags, sequence_paused, status')
      .single();

    if (error) return res.status(400).json({ error: error.message });
    return res.status(200).json({ lead });
  }

  return res.status(405).json({ error: 'Método no permitido' });
}
